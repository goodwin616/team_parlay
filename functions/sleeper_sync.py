import os
os.environ.setdefault("no_proxy", "*")
os.environ.setdefault("NO_PROXY", "*")

import requests
from typing import List, Dict, Any

SLEEPER_BASE_URL = "https://api.sleeper.app/v1"

def fetch_sleeper_nfl_state() -> Dict[str, Any]:
    resp = requests.get(f"{SLEEPER_BASE_URL}/state/nfl", timeout=10)
    resp.raise_for_status()
    return resp.json()

def fetch_sleeper_league_info(league_id: str) -> Dict[str, Any]:
    resp = requests.get(f"{SLEEPER_BASE_URL}/league/{league_id}", timeout=10)
    resp.raise_for_status()
    data = resp.json()
    if not data or not isinstance(data, dict):
        raise ValueError(f"Sleeper league {league_id} not found")
    return data

def fetch_sleeper_league_data(league_id: str, week: int) -> Dict[str, Any]:
    rosters_resp = requests.get(f"{SLEEPER_BASE_URL}/league/{league_id}/rosters", timeout=10)
    rosters_resp.raise_for_status()
    rosters = rosters_resp.json() or []

    users_resp = requests.get(f"{SLEEPER_BASE_URL}/league/{league_id}/users", timeout=10)
    users_resp.raise_for_status()
    users = users_resp.json() or []

    matchups_week = max(1, week)
    matchups_resp = requests.get(f"{SLEEPER_BASE_URL}/league/{league_id}/matchups/{matchups_week}", timeout=10)
    matchups_resp.raise_for_status()
    matchups = matchups_resp.json() or []

    return {"rosters": rosters, "users": users, "matchups": matchups}

def build_teams_from_sleeper(
    rosters: List[Dict[str, Any]],
    users: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    user_map = {u.get("user_id"): u for u in users if u.get("user_id")}
    teams = []
    for r in rosters:
        rid = r.get("roster_id")
        if rid is None:
            continue
        owner_id = r.get("owner_id") or f"u{rid}"
        u = user_map.get(owner_id, {})
        owner_name = u.get("display_name") or u.get("username") or f"Owner {rid}"
        team_name = (u.get("metadata") or {}).get("team_name") or f"Team {owner_name}"
        teams.append({
            "roster_id": int(rid),
            "owner_id": str(owner_id),
            "owner_name": owner_name,
            "team_name": team_name,
        })
    teams.sort(key=lambda t: t["roster_id"])
    return teams

def fetch_active_nfl_players(players_raw: Dict[str, Any]) -> List[Dict[str, Any]]:
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
        points = float(m.get("points") or 0.0)
        r = roster_map.get(rid, {})
        settings = r.get("settings") or {}

        season_pf = float(settings.get("fpts") or 0.0)
        if "fpts_decimal" in settings:
            season_pf += float(settings.get("fpts_decimal") or 0.0) / 100.0

        max_pf = float(settings.get("ppts") or 0.0)
        if "ppts_decimal" in settings:
            max_pf += float(settings.get("ppts_decimal") or 0.0) / 100.0

        u = user_map.get(r.get("owner_id"), {})
        owner_name = u.get("display_name") or f"Team {rid}"
        team_name = (u.get("metadata") or {}).get("team_name") or owner_name

        candidates.append({
            "roster_id": int(rid),
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
