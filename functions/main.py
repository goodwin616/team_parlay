import os

# Prevent macOS Objective-C / _scproxy fork crashes in Gunicorn workers
os.environ.setdefault("OBJC_DISABLE_INITIALIZE_FORK_SAFETY", "YES")
os.environ.setdefault("no_proxy", "*")
os.environ.setdefault("NO_PROXY", "*")

from datetime import datetime, timezone
from typing import Dict, Any, Optional

import firebase_admin
from firebase_admin import firestore
from firebase_functions import https_fn

from odds_engine import (
    calculate_earliest_kickoff,
    is_kickoff_passed,
    KalshiApiClient,
)
from auth_utils import (
    actor_from_auth,
    claim_status,
    build_audit_entry,
)
from sleeper_sync import (
    fetch_sleeper_nfl_state,
    fetch_sleeper_league_info,
    fetch_sleeper_league_data,
    build_teams_from_sleeper,
    determine_weekly_bettor,
)

KALSHI_API_BASE_URL = os.environ.get("KALSHI_API_BASE_URL", "https://api.elections.kalshi.com/trade-api/v2")
KALSHI_API_KEY_ID = os.environ.get("KALSHI_API_KEY_ID", "")
KALSHI_PRIVATE_KEY_PATH = os.environ.get("KALSHI_PRIVATE_KEY_PATH", "")
KALSHI_PRIVATE_KEY_PEM = os.environ.get("KALSHI_PRIVATE_KEY_PEM", "")

def get_db():
    if not firebase_admin._apps:
        try:
            firebase_admin.initialize_app()
        except Exception:
            pass
    return firestore.client()

def get_default_season() -> str:
    return str(datetime.now(timezone.utc).year)

def get_league_ref(db, league_id: str):
    return db.collection("leagues").document(str(league_id))

def get_season_ref(db, league_id: str, season: str):
    return get_league_ref(db, league_id).collection("seasons").document(str(season))

def resolve_league_season(db, league_id: str, requested_season: Any = None) -> str:
    if requested_season:
        return str(requested_season).strip()
    league_doc = get_league_ref(db, league_id).get()
    if league_doc.exists:
        meta = league_doc.to_dict() or {}
        if meta.get("active_season"):
            return str(meta["active_season"])
        if meta.get("season"):
            return str(meta["season"])
    return get_default_season()

def get_kalshi_client() -> KalshiApiClient:
    return KalshiApiClient(
        base_url=KALSHI_API_BASE_URL,
        api_key_id=KALSHI_API_KEY_ID or None,
        private_key_path=KALSHI_PRIVATE_KEY_PATH or None,
        private_key_pem=KALSHI_PRIVATE_KEY_PEM or None,
    )

def require_actor(req: https_fn.CallableRequest) -> Dict[str, Any]:
    try:
        return actor_from_auth(getattr(req, "auth", None))
    except Exception:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Authentication required",
        )

# =====================================================================
# Callable Firebase Functions (Multi-League & Season Scoped)
# =====================================================================

@https_fn.on_call()
def init_or_sync_league(req: https_fn.CallableRequest) -> Dict[str, Any]:
    """
    Initializes or syncs a Sleeper league by its league_id and season in Firestore under:
      leagues/{league_id}/seasons/{season}/teams/{roster_id}
      leagues/{league_id}/seasons/{season}/parlays/{week}
    """
    require_actor(req)

    data = req.data or {}
    league_id = str(data.get("league_id", "")).strip()
    if not league_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="league_id is required"
        )

    db = get_db()
    league_ref = get_league_ref(db, league_id)
    league_doc = league_ref.get()
    existing_meta = league_doc.to_dict() if league_doc.exists else {}

    is_demo = league_id.lower() == "demo"

    # Try live Sleeper API (or client-fetched Sleeper payload) unless explicitly requesting 'demo'
    if not is_demo:
        try:
            client_sleeper = data.get("sleeper_payload")
            nfl_state_season = None
            if client_sleeper and isinstance(client_sleeper, dict) and client_sleeper.get("rosters"):
                league_info = client_sleeper.get("league_info") or {}
                current_week = max(1, int(client_sleeper.get("current_week") or 1))
                nfl_state_season = client_sleeper.get("season")
                sleeper_data = {
                    "rosters": client_sleeper.get("rosters") or [],
                    "users": client_sleeper.get("users") or [],
                    "matchups": client_sleeper.get("matchups") or [],
                }
            else:
                league_info = fetch_sleeper_league_info(league_id)
                try:
                    nfl_state = fetch_sleeper_nfl_state()
                    current_week = int(nfl_state.get("week") or 1)
                    nfl_state_season = nfl_state.get("season")
                except Exception:
                    current_week = int(league_info.get("settings", {}).get("leg") or 1)
                current_week = max(1, current_week)

                prev_week = max(1, current_week - 1)
                sleeper_data = fetch_sleeper_league_data(league_id, prev_week)

            season = str(
                data.get("season")
                or league_info.get("season")
                or nfl_state_season
                or get_default_season()
            )
            league_name = league_info.get("name") or f"Sleeper League {league_id}"

            season_ref = get_season_ref(db, league_id, season)
            season_doc = season_ref.get()
            if (
                season_doc.exists
                and not data.get("force_sync")
                and (season_doc.to_dict() or {}).get("source") == "sleeper"
            ):
                return {"success": True, "league": existing_meta, "season": season, "source": "sleeper"}

            teams = build_teams_from_sleeper(sleeper_data["rosters"], sleeper_data["users"])
            bettor = determine_weekly_bettor(
                sleeper_data["matchups"],
                sleeper_data["rosters"],
                sleeper_data["users"],
            )
            if not bettor and teams:
                bettor = {
                    "roster_id": teams[0]["roster_id"],
                    "team_name": teams[0]["team_name"],
                    "owner_name": teams[0]["owner_name"],
                    "points_last_week": 0.0,
                }

            now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            existing_seasons = list(set((existing_meta.get("seasons") or []) + [season]))
            existing_seasons.sort(reverse=True)

            league_meta = {
                "sleeper_league_id": league_id,
                "name": league_name,
                "active_season": season,
                "season": season,
                "seasons": existing_seasons,
                "current_week": current_week,
                "source": "sleeper",
                "updated_at": now_iso,
            }
            league_ref.set(league_meta, merge=True)

            season_meta = {
                "season": season,
                "league_id": league_id,
                "name": league_name,
                "current_week": current_week,
                "source": "sleeper",
                "updated_at": now_iso,
            }
            season_ref.set(season_meta, merge=True)

            for t in teams:
                rid = str(t["roster_id"])
                team_ref = season_ref.collection("teams").document(rid)
                existing_team = team_ref.get()
                if existing_team.exists:
                    # Update sleeper metadata, delete legacy pin fields, preserve claimed_by
                    team_ref.update({
                        **t,
                        "pin_hash": firestore.DELETE_FIELD,
                        "session_tokens": firestore.DELETE_FIELD,
                    })
                else:
                    team_ref.set(t)

            parlay_ref = season_ref.collection("parlays").document(str(current_week))
            if not parlay_ref.get().exists:
                initial_legs = [
                    {
                        "id": f"l_{t['roster_id']}",
                        "roster_id": t["roster_id"],
                        "team_name": t["team_name"],
                        "owner_name": t["owner_name"],
                        "nfl_team": "NFL",
                        "description": "",
                        "odds_american": "-110",
                        "odds_decimal": 1.91,
                        "status": "pending",
                    }
                    for t in teams
                ]
                parlay_ref.set({
                    "week": current_week,
                    "season": season,
                    "status": "open",
                    "contains_sgp": False,
                    "bettor": bettor,
                    "earliest_kickoff": None,
                    "legs": initial_legs,
                    "estimated_odds_american": "+100",
                    "estimated_multiplier": 1.0,
                    "estimated_payout": 5.0,
                    "actual_payout": None,
                    "actual_odds_american": None,
                })

            return {"success": True, "league": league_meta, "season": season, "source": "sleeper"}
        except Exception as exc:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.NOT_FOUND,
                message=f"Could not load Sleeper league '{league_id}': {exc}"
            )

    # Seed fallback / demo data under leagues/{league_id}/seasons/{season}
    fallback_teams = data.get("fallback_teams", [])
    fallback_parlays = data.get("fallback_parlays", [])
    season = str(data.get("season") or get_default_season())
    league_name = data.get("league_name") or "Demo Sleeper League"
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    league_meta = {
        "sleeper_league_id": league_id,
        "name": league_name,
        "active_season": season,
        "season": season,
        "seasons": [season],
        "current_week": 4,
        "source": "demo",
        "updated_at": now_iso,
    }
    league_ref.set(league_meta, merge=True)

    season_ref = get_season_ref(db, league_id, season)
    season_ref.set({
        "season": season,
        "league_id": league_id,
        "name": league_name,
        "current_week": 4,
        "source": "demo",
        "updated_at": now_iso,
    }, merge=True)

    for t in fallback_teams:
        rid = str(t.get("roster_id"))
        team_ref = season_ref.collection("teams").document(rid)
        existing_team = team_ref.get()
        team_payload = {
            "roster_id": t.get("roster_id"),
            "owner_id": t.get("owner_id", f"u{rid}"),
            "owner_name": t.get("owner_name", f"Owner {rid}"),
            "team_name": t.get("team_name", f"Team {rid}"),
        }
        if existing_team.exists:
            team_ref.update({
                **team_payload,
                "pin_hash": firestore.DELETE_FIELD,
                "session_tokens": firestore.DELETE_FIELD,
            })
        else:
            team_ref.set(team_payload)

    for p in fallback_parlays:
        week = str(p.get("week"))
        season_ref.collection("parlays").document(week).set({**p, "season": season})

    return {"success": True, "league": league_meta, "season": season, "source": "demo"}

@https_fn.on_call()
def select_team(req: https_fn.CallableRequest) -> Dict[str, Any]:
    """
    Selects or claims a fantasy team within a league season.
    Input: league_id, season, roster_id, confirm: bool
    """
    actor = require_actor(req)
    uid = actor["uid"]

    data = req.data or {}
    league_id = str(data.get("league_id", "")).strip()
    roster_id = data.get("roster_id")
    confirm = bool(data.get("confirm", False))

    if not league_id or roster_id is None:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="league_id and roster_id are required",
        )

    db = get_db()
    season = resolve_league_season(db, league_id, data.get("season"))
    season_ref = get_season_ref(db, league_id, season)
    team_ref = season_ref.collection("teams").document(str(roster_id))

    transaction = db.transaction()

    @firestore.transactional
    def _select_team_tx(tx):
        team_doc = team_ref.get(transaction=tx)
        if not team_doc.exists:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.NOT_FOUND,
                message="Team not found in this league season",
            )

        team_data = team_doc.to_dict() or {}
        claimed_by = team_data.get("claimed_by")
        claimed_by_uid = claimed_by.get("uid") if claimed_by else None
        status = claim_status(uid, claimed_by_uid)
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        if status == "unclaimed" and not confirm:
            return {"status": "needs_claim_confirmation"}

        audit_entry = None
        if status == "unclaimed" and confirm:
            claimed_by = {
                "uid": uid,
                "name": actor.get("name") or "",
                "photo_url": actor.get("photo_url"),
                "claimed_at": now_iso,
            }
            tx.update(team_ref, {"claimed_by": claimed_by})
            audit_entry = build_audit_entry(
                action="team_claimed",
                actor=actor,
                roster_id=roster_id,
                after={"claimed_by": claimed_by},
                now_iso=now_iso,
            )
        elif status == "mine":
            audit_entry = build_audit_entry(
                action="team_selected",
                actor=actor,
                roster_id=roster_id,
                now_iso=now_iso,
            )
        elif status == "other" and not confirm:
            return {
                "status": "needs_override_confirmation",
                "claimed_by": claimed_by,
            }
        elif status == "other" and confirm:
            audit_entry = build_audit_entry(
                action="team_selected_claimed_by_other",
                actor=actor,
                roster_id=roster_id,
                extra={"claimed_by": claimed_by},
                now_iso=now_iso,
            )

        user_league_ref = (
            db.collection("users")
            .document(uid)
            .collection("leagues")
            .document(league_id)
        )
        tx.set(
            user_league_ref,
            {
                "roster_id": roster_id,
                "season": season,
                "updated_at": now_iso,
            },
            merge=True,
        )

        if audit_entry:
            audit_ref = season_ref.collection("audit_log").document()
            tx.set(audit_ref, audit_entry)

        return {
            "status": status,
            "roster_id": roster_id,
            "claimed_by": claimed_by,
        }

    return _select_team_tx(transaction)

@https_fn.on_call()
def get_my_team(req: https_fn.CallableRequest) -> Any:
    """
    Returns saved roster_id and season from users/{uid}/leagues/{league_id} or null.
    """
    actor = require_actor(req)
    uid = actor["uid"]

    data = req.data or {}
    league_id = str(data.get("league_id", "")).strip()
    if not league_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="league_id is required",
        )

    db = get_db()
    user_league_doc = (
        db.collection("users")
        .document(uid)
        .collection("leagues")
        .document(league_id)
        .get()
    )
    if not user_league_doc.exists:
        return None

    doc_data = user_league_doc.to_dict() or {}
    return {
        "roster_id": doc_data.get("roster_id"),
        "season": doc_data.get("season"),
    }

@https_fn.on_call()
def submit_leg(req: https_fn.CallableRequest) -> Dict[str, Any]:
    actor = require_actor(req)

    data = req.data or {}
    league_id = str(data.get("league_id", "")).strip()
    roster_id = data.get("roster_id")
    week = data.get("week")
    leg = data.get("leg")

    if not league_id or roster_id is None or not week or not leg:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="league_id, roster_id, week, and leg are required"
        )

    # Strictly disallow submitting a pick for another roster_id payload mismatch
    if leg.get("roster_id") is not None and int(leg.get("roster_id")) != int(roster_id):
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.PERMISSION_DENIED,
            message="Cannot submit a pick on behalf of another player"
        )

    db = get_db()
    season = resolve_league_season(db, league_id, data.get("season"))
    season_ref = get_season_ref(db, league_id, season)
    team_ref = season_ref.collection("teams").document(str(roster_id))
    team_doc = team_ref.get()

    if not team_doc.exists:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.NOT_FOUND, message="Team not found")

    team_data = team_doc.to_dict() or {}
    claimed_by = team_data.get("claimed_by")
    claimed_by_uid = claimed_by.get("uid") if claimed_by else None

    parlay_ref = season_ref.collection("parlays").document(str(week))
    parlay_doc = parlay_ref.get()

    if not parlay_doc.exists:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.NOT_FOUND, message="Parlay not found")

    parlay_data = parlay_doc.to_dict() or {}
    if parlay_data.get("status") == "locked":
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION, message="Parlay ticket is locked")

    if is_kickoff_passed(leg.get("kickoff_time")):
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
            message="Kickoff has already passed for this market"
        )

    legs = parlay_data.get("legs", [])
    updated_legs = []
    before = None
    replaced = False

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    is_non_claimer = claim_status(actor["uid"], claimed_by_uid) == "other"

    leg["roster_id"] = roster_id
    leg["team_name"] = team_data.get("team_name", f"Team {roster_id}")
    leg["owner_name"] = team_data.get("owner_name", f"Owner {roster_id}")
    leg["status"] = "submitted"
    leg["last_edited_by"] = {
        "uid": actor["uid"],
        "name": actor.get("name") or "",
        "photo_url": actor.get("photo_url"),
    }
    leg["last_edited_at"] = now_iso
    leg["edited_by_non_claimer"] = is_non_claimer

    for existing in legs:
        if existing.get("roster_id") == roster_id:
            before = dict(existing)
            updated_legs.append({**existing, **leg})
            replaced = True
        else:
            updated_legs.append(existing)

    if not replaced:
        updated_legs.append(leg)

    kalshi_client = get_kalshi_client()
    stats = kalshi_client.fetch_combo_quote(updated_legs)
    earliest = calculate_earliest_kickoff(updated_legs)
    is_live_mve = stats.get("pricing_source") == "kalshi_mve"

    audit_entry = build_audit_entry(
        action="leg_submitted",
        actor=actor,
        roster_id=roster_id,
        week=week,
        before=before,
        after=leg,
        now_iso=now_iso,
    )

    batch = db.batch()
    batch.update(parlay_ref, {
        "legs": updated_legs,
        "estimated_odds_american": stats["odds_american"],
        "estimated_multiplier": stats["multiplier"],
        "estimated_payout": stats["estimated_payout"],
        "combined_probability_cents": stats.get("combined_probability_cents"),
        "contains_sgp": stats["contains_sgp"],
        "earliest_kickoff": earliest,
        "actual_payout": stats["estimated_payout"] if is_live_mve else None,
        "actual_odds_american": stats["odds_american"] if is_live_mve else None,
    })
    audit_ref = season_ref.collection("audit_log").document()
    batch.set(audit_ref, audit_entry)
    batch.commit()

    return {"success": True, "legs": updated_legs, "season": season}

@https_fn.on_call()
def get_kalshi_nfl_markets(req: https_fn.CallableRequest) -> Dict[str, Any]:
    """
    Fetches live NFL game lines and player props from the Kalshi Trade API v2,
    using a 5-minute (300s) cache in memory + Firestore (`kalshi_cache/nfl_board_meta`)
    and refreshing automatically when cached data is older than 5 minutes.
    """
    require_actor(req)

    data = req.data or {}
    force_refresh = bool(data.get("force_refresh", False))
    db = get_db()
    kalshi_client = get_kalshi_client()
    board = kalshi_client.get_cached_or_fresh_nfl_board(
        db=db,
        ttl_seconds=0 if force_refresh else 300,
    )
    return {
        "success": True,
        "games": board.get("games", []),
        "props": board.get("props", []),
        "players": board.get("players", []),
        "live_market_count": board.get("live_market_count", 0),
        "updated_at": board.get("updated_at"),
        "cached": bool(board.get("cached", False)),
        "authenticated": kalshi_client.is_authenticated,
    }
