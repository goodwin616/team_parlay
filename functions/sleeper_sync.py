import requests
from typing import List, Dict, Any, Optional

SLEEPER_BASE_URL = "https://api.sleeper.app/v1"

def fetch_sleeper_league_data(league_id: str, week: int) -> Dict[str, Any]:
    rosters_resp = requests.get(f"{SLEEPER_BASE_URL}/league/{league_id}/rosters")
    rosters_resp.raise_for_status()
    rosters = rosters_resp.json()

    users_resp = requests.get(f"{SLEEPER_BASE_URL}/league/{league_id}/users")
    users_resp.raise_for_status()
    users = users_resp.json()

    matchups_resp = requests.get(f"{SLEEPER_BASE_URL}/league/{league_id}/matchups/{week}")
    matchups_resp.raise_for_status()
    matchups = matchups_resp.json()

    return {"rosters": rosters, "users": users, "matchups": matchups}

def fetch_active_nfl_players(players_raw: Dict[str, Any]) -> List[Dict[str, Any]]:
    # Filter to active offensive skill positions (and K, DEF) with an NFL team
    valid_positions = {"QB", "RB", "WR", "TE", "K", "DEF"}
    active_players = []

    for pid, p in players_raw.items():
        team = p.get("team")
        pos = p.get("position")
        status = p.get("status")

        if team and pos in valid_positions and status == "Active":
            name = f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
            if not name:
                name = p.get("search_full_name", pid)
            active_players.append({
                "id": pid,
                "name": name,
                "team": team.upper(),
                "position": pos
            })

    active_players.sort(key=lambda x: x["name"])
    return active_players

def determine_weekly_bettor(
    matchups: List[Dict[str, Any]],
    rosters: List[Dict[str, Any]],
    users: List[Dict[str, Any]]
) -> Dict[str, Any]:
    user_map = {u.get("user_id"): u for u in users if u.get("user_id")}
    roster_map = {r.get("roster_id"): r for r in rosters if r.get("roster_id") is not None}

    candidates = []
    for m in matchups:
        rid = m.get("roster_id")
        if rid is None:
            continue
        points = float(m.get("points", 0.0))
        r = roster_map.get(rid, {})
        settings = r.get("settings", {})
        
        season_pf = float(settings.get("fpts", 0.0))
        if "fpts_decimal" in settings:
            season_pf += float(settings.get("fpts_decimal", 0.0)) / 100.0
            
        max_pf = float(settings.get("ppts", 0.0))
        if "ppts_decimal" in settings:
            max_pf += float(settings.get("ppts_decimal", 0.0)) / 100.0

        u = user_map.get(r.get("owner_id"), {})
        owner_name = u.get("display_name", f"Team {rid}")
        team_name = u.get("metadata", {}).get("team_name") or owner_name

        candidates.append({
            "roster_id": rid,
            "points": points,
            "season_pf": season_pf,
            "max_pf": max_pf,
            "team_name": team_name,
            "owner_name": owner_name
        })

    if not candidates:
        return {}

    candidates.sort(key=lambda c: (
        c["points"],
        c["season_pf"],
        c["max_pf"],
        c["team_name"].lower()
    ))

    loser = candidates[0]
    return {
        "roster_id": loser["roster_id"],
        "team_name": loser["team_name"],
        "owner_name": loser["owner_name"],
        "points_last_week": loser["points"]
    }
