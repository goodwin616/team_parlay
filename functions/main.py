import os

# Prevent macOS Objective-C / _scproxy fork crashes in Gunicorn workers
os.environ.setdefault("OBJC_DISABLE_INITIALIZE_FORK_SAFETY", "YES")
os.environ.setdefault("no_proxy", "*")
os.environ.setdefault("NO_PROXY", "*")

from datetime import datetime, timezone
from typing import Dict, Any

import firebase_admin
from firebase_admin import firestore
from firebase_functions import https_fn

from odds_engine import (
    calculate_earliest_kickoff,
    is_kickoff_passed,
    KalshiApiClient,
)
from auth_utils import (
    hash_pin,
    generate_session_token,
    verify_pin_and_issue_token,
    verify_session_token,
)
from sleeper_sync import (
    fetch_sleeper_nfl_state,
    fetch_sleeper_league_info,
    fetch_sleeper_league_data,
    build_teams_from_sleeper,
    determine_weekly_bettor,
)

SECRET_SALT = os.environ.get("PIN_SECRET_SALT", "team_parlay_salt_2026")
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
    default_token = data.get("session_token", "demo_local_session_token")
    default_pin_hash = hash_pin("1234", SECRET_SALT)

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
                    team_ref.set(t, merge=True)
                else:
                    team_ref.set({
                        **t,
                        "pin_hash": default_pin_hash,
                        "session_tokens": [default_token],
                    })

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
        season_ref.collection("teams").document(rid).set({
            "roster_id": t.get("roster_id"),
            "owner_id": t.get("owner_id", f"u{rid}"),
            "owner_name": t.get("owner_name", f"Owner {rid}"),
            "team_name": t.get("team_name", f"Team {rid}"),
            "pin_hash": default_pin_hash,
            "session_tokens": [default_token],
        }, merge=True)

    for p in fallback_parlays:
        week = str(p.get("week"))
        season_ref.collection("parlays").document(week).set({**p, "season": season})

    return {"success": True, "league": league_meta, "season": season, "source": "demo"}

@https_fn.on_call()
def verify_pin_login(req: https_fn.CallableRequest) -> Dict[str, Any]:
    data = req.data or {}
    league_id = str(data.get("league_id", "")).strip()
    roster_id = data.get("roster_id")
    pin = str(data.get("pin", ""))

    if not league_id or not roster_id or not pin:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="league_id, roster_id, and pin are required"
        )

    db = get_db()
    season = resolve_league_season(db, league_id, data.get("season"))
    season_ref = get_season_ref(db, league_id, season)
    team_ref = season_ref.collection("teams").document(str(roster_id))
    team_doc = team_ref.get()

    if not team_doc.exists:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.NOT_FOUND,
            message="Team not found in this league season"
        )

    team_data = team_doc.to_dict() or {}
    stored_hash = team_data.get("pin_hash", "")

    if not stored_hash:
        # First-time PIN setup for this team
        stored_hash = hash_pin(pin, SECRET_SALT)
        token = generate_session_token()
        team_ref.update({"pin_hash": stored_hash, "session_tokens": [token]})
    else:
        token = verify_pin_and_issue_token(pin, stored_hash, SECRET_SALT)
        if not token:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
                message="Invalid PIN"
            )
        tokens = team_data.get("session_tokens", [])
        tokens.append(token)
        tokens = tokens[-10:]
        team_ref.update({"session_tokens": tokens})

    return {
        "success": True,
        "session_token": token,
        "league_id": league_id,
        "season": season,
        "roster_id": roster_id,
        "team_name": team_data.get("team_name", ""),
        "owner_name": team_data.get("owner_name", "")
    }

@https_fn.on_call()
def submit_leg(req: https_fn.CallableRequest) -> Dict[str, Any]:
    data = req.data or {}
    league_id = str(data.get("league_id", "")).strip()
    session_token = data.get("session_token")
    roster_id = data.get("roster_id")
    week = data.get("week")
    leg = data.get("leg")

    if not league_id or not session_token or not roster_id or not week or not leg:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="league_id, session_token, roster_id, week, and leg are required"
        )

    # Strictly disallow submitting a pick for another player
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
    valid_tokens = team_data.get("session_tokens", [])
    if not verify_session_token(session_token, valid_tokens):
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Invalid session token")

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
    replaced = False

    leg["roster_id"] = roster_id
    leg["team_name"] = team_data.get("team_name", f"Team {roster_id}")
    leg["owner_name"] = team_data.get("owner_name", f"Owner {roster_id}")
    leg["status"] = "submitted"

    for existing in legs:
        if existing.get("roster_id") == roster_id:
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

    parlay_ref.update({
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

    return {"success": True, "legs": updated_legs, "season": season}


@https_fn.on_call()
def get_kalshi_nfl_markets(req: https_fn.CallableRequest) -> Dict[str, Any]:
    """
    Fetches live NFL game lines and player props from the Kalshi Trade API v2,
    using a 5-minute (300s) cache in memory + Firestore (`kalshi_cache/nfl_board_meta`)
    and refreshing automatically when cached data is older than 5 minutes.
    """
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
