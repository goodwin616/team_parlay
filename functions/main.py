import os
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

import firebase_admin
from firebase_admin import firestore
from firebase_functions import https_fn, scheduler_fn

from parlay_math import calculate_parlay
from odds_engine import (
    roll_default_leg,
    calculate_earliest_kickoff,
    TheOddsApiClient,
    parse_mainline_odds_response,
)
from auth_utils import (
    create_break_glass_log,
    verify_pin_and_issue_token,
    verify_session_token,
)
from sleeper_sync import (
    fetch_sleeper_league_data,
    determine_weekly_bettor,
    fetch_active_nfl_players,
)

# Initialize Firebase Admin app once
if not firebase_admin._apps:
    try:
        firebase_admin.initialize_app()
    except Exception:
        pass

SECRET_SALT = os.environ.get("PIN_SECRET_SALT", "team_parlay_salt_2026")
ODDS_API_KEY = os.environ.get("ODDS_API_KEY", "")

def get_db():
    return firestore.client()

def handle_finalize_parlay(
    existing_legs: List[Dict[str, Any]],
    all_teams: List[Dict[str, Any]],
    active_odds_cache: Dict[str, Any],
    executor_roster_id: int,
    executor_name: str,
    bettor_roster_id: int,
    bye_teams: Optional[List[str]] = None,
    current_time_iso: Optional[str] = None
) -> Dict[str, Any]:
    """
    Rolls missing defaults for teams that haven't submitted a leg,
    computes parlay multiplier/payout/SGP correlation, locks the ticket,
    calculates earliest kickoff, and records audit trail.
    """
    bye_teams = bye_teams or []
    submitted_ids = {leg["roster_id"]: leg for leg in existing_legs if "roster_id" in leg}
    final_legs = list(existing_legs)

    for team in all_teams:
        rid = team.get("roster_id")
        if rid is not None and rid not in submitted_ids:
            defaults = team.get("default_legs", [])
            rolled = roll_default_leg(defaults, bye_teams, active_odds_cache, current_time_iso=current_time_iso)
            if rolled:
                now_ts = int(datetime.now(timezone.utc).timestamp())
                rolled["id"] = f"leg_{rid}_{now_ts}"
                rolled["roster_id"] = rid
                rolled["team_name"] = team.get("team_name", f"Team {rid}")
                rolled["owner_name"] = team.get("owner_name", f"Owner {rid}")
                final_legs.append(rolled)

    parlay_stats = calculate_parlay(final_legs, stake=5.0)
    audit = create_break_glass_log(executor_roster_id, executor_name, bettor_roster_id)
    earliest = calculate_earliest_kickoff(final_legs)

    return {
        "status": "locked",
        "legs": final_legs,
        "earliest_kickoff": earliest,
        "estimated_odds_american": parlay_stats["odds_american"],
        "estimated_multiplier": parlay_stats["multiplier"],
        "estimated_payout": parlay_stats["estimated_payout"],
        "contains_sgp": parlay_stats["contains_sgp"],
        "finalized_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "finalized_by": audit
    }

# =====================================================================
# Callable Firebase Functions
# =====================================================================

@https_fn.on_call()
def verify_pin_login(req: https_fn.CallableRequest) -> Dict[str, Any]:
    data = req.data or {}
    roster_id = data.get("roster_id")
    pin = str(data.get("pin", ""))

    if not roster_id or not pin:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="roster_id and pin are required"
        )

    db = get_db()
    team_ref = db.collection("teams").document(str(roster_id))
    team_doc = team_ref.get()

    if not team_doc.exists:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.NOT_FOUND,
            message="Team not found"
        )

    team_data = team_doc.to_dict() or {}
    stored_hash = team_data.get("pin_hash", "")

    token = verify_pin_and_issue_token(pin, stored_hash, SECRET_SALT)
    if not token:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Invalid PIN"
        )

    # Store token in session_tokens list
    tokens = team_data.get("session_tokens", [])
    tokens.append(token)
    # Keep last 10 tokens
    tokens = tokens[-10:]
    team_ref.update({"session_tokens": tokens})

    return {
        "success": True,
        "session_token": token,
        "roster_id": roster_id,
        "team_name": team_data.get("team_name", ""),
        "owner_name": team_data.get("owner_name", "")
    }

@https_fn.on_call()
def submit_leg(req: https_fn.CallableRequest) -> Dict[str, Any]:
    data = req.data or {}
    session_token = data.get("session_token")
    roster_id = data.get("roster_id")
    week = data.get("week")
    leg = data.get("leg")

    if not session_token or not roster_id or not week or not leg:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="session_token, roster_id, week, and leg are required"
        )

    db = get_db()
    team_ref = db.collection("teams").document(str(roster_id))
    team_doc = team_ref.get()

    if not team_doc.exists:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.NOT_FOUND, message="Team not found")

    team_data = team_doc.to_dict() or {}
    valid_tokens = team_data.get("session_tokens", [])
    if not verify_session_token(session_token, valid_tokens):
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Invalid session token")

    parlay_ref = db.collection("parlays").document(str(week))
    parlay_doc = parlay_ref.get()

    if not parlay_doc.exists:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.NOT_FOUND, message="Parlay not found")

    parlay_data = parlay_doc.to_dict() or {}
    if parlay_data.get("status") == "locked":
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION, message="Parlay ticket is locked")

    legs = parlay_data.get("legs", [])
    # Remove any existing leg for this roster_id
    updated_legs = [l for l in legs if l.get("roster_id") != roster_id]

    leg["roster_id"] = roster_id
    leg["team_name"] = team_data.get("team_name", f"Team {roster_id}")
    leg["owner_name"] = team_data.get("owner_name", f"Owner {roster_id}")
    leg["status"] = "submitted"
    leg["is_default_roll"] = False
    updated_legs.append(leg)

    # Recalculate estimated odds & payout
    stats = calculate_parlay(updated_legs)
    earliest = calculate_earliest_kickoff(updated_legs)

    parlay_ref.update({
        "legs": updated_legs,
        "estimated_odds_american": stats["odds_american"],
        "estimated_multiplier": stats["multiplier"],
        "estimated_payout": stats["estimated_payout"],
        "contains_sgp": stats["contains_sgp"],
        "earliest_kickoff": earliest
    })

    return {"success": True, "legs": updated_legs}

@https_fn.on_call()
def finalize_parlay(req: https_fn.CallableRequest) -> Dict[str, Any]:
    data = req.data or {}
    session_token = data.get("session_token")
    executor_roster_id = data.get("executor_roster_id")
    week = data.get("week")

    if not session_token or not executor_roster_id or not week:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="session_token, executor_roster_id, and week are required"
        )

    db = get_db()
    exec_ref = db.collection("teams").document(str(executor_roster_id))
    exec_doc = exec_ref.get()

    if not exec_doc.exists:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.NOT_FOUND, message="Executor team not found")

    exec_data = exec_doc.to_dict() or {}
    valid_tokens = exec_data.get("session_tokens", [])
    if not verify_session_token(session_token, valid_tokens):
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Invalid session token")

    parlay_ref = db.collection("parlays").document(str(week))
    parlay_doc = parlay_ref.get()

    if not parlay_doc.exists:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.NOT_FOUND, message="Parlay not found")

    parlay_data = parlay_doc.to_dict() or {}
    if parlay_data.get("status") == "locked":
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION, message="Parlay already locked")

    existing_legs = parlay_data.get("legs", [])
    bettor_roster_id = parlay_data.get("bettor", {}).get("roster_id", 0)
    executor_name = exec_data.get("owner_name", f"Owner {executor_roster_id}")

    # Fetch all teams for default pool
    teams_docs = db.collection("teams").stream()
    all_teams = [t.to_dict() for t in teams_docs]

    # Fetch active odds cache
    odds_doc = db.collection("odds_cache").document(f"week_{week}").get()
    active_odds = odds_doc.to_dict() if odds_doc.exists else {"games": []}

    finalized = handle_finalize_parlay(
        existing_legs=existing_legs,
        all_teams=all_teams,
        active_odds_cache=active_odds,
        executor_roster_id=executor_roster_id,
        executor_name=executor_name,
        bettor_roster_id=bettor_roster_id
    )

    parlay_ref.update(finalized)
    return {"success": True, "parlay": finalized}
