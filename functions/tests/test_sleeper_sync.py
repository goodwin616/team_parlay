import pytest
from unittest.mock import patch, MagicMock
from sleeper_sync import (
    determine_weekly_bettor,
    fetch_active_nfl_players,
    fetch_sleeper_league_data,
    build_teams_from_sleeper,
)

def test_determine_weekly_bettor_simple():
    matchups = [
        {"roster_id": 1, "points": 115.4},
        {"roster_id": 2, "points": 88.2},
        {"roster_id": 3, "points": 102.1},
    ]
    rosters = [
        {"roster_id": 1, "owner_id": "u1", "settings": {"fpts": 500, "ppts": 600}},
        {"roster_id": 2, "owner_id": "u2", "settings": {"fpts": 450, "ppts": 550}},
        {"roster_id": 3, "owner_id": "u3", "settings": {"fpts": 400, "ppts": 500}},
    ]
    users = [
        {"user_id": "u1", "display_name": "Alice", "metadata": {"team_name": "Team A"}},
        {"user_id": "u2", "display_name": "Bob", "metadata": {"team_name": "Team B"}},
        {"user_id": "u3", "display_name": "Charlie", "metadata": {"team_name": "Team C"}},
    ]
    bettor = determine_weekly_bettor(matchups, rosters, users)
    assert bettor["roster_id"] == 2
    assert bettor["owner_name"] == "Bob"
    assert bettor["team_name"] == "Team B"
    assert bettor["points_last_week"] == 88.2

def test_determine_weekly_bettor_tie_breakers():
    # Tie on weekly points (both 85.0), Roster 2 has lower season_pf (400 vs 450)
    matchups = [
        {"roster_id": 1, "points": 85.0},
        {"roster_id": 2, "points": 85.0},
    ]
    rosters = [
        {"roster_id": 1, "owner_id": "u1", "settings": {"fpts": 450, "ppts": 500}},
        {"roster_id": 2, "owner_id": "u2", "settings": {"fpts": 400, "ppts": 500}},
    ]
    users = [
        {"user_id": "u1", "display_name": "Alice", "metadata": {"team_name": "Team A"}},
        {"user_id": "u2", "display_name": "Bob", "metadata": {"team_name": "Team B"}},
    ]
    bettor = determine_weekly_bettor(matchups, rosters, users)
    assert bettor["roster_id"] == 2

    # Tie on weekly points (85.0) AND season_pf (400), Roster 1 has lower max_pf (480 vs 500)
    rosters[0]["settings"]["fpts"] = 400
    rosters[0]["settings"]["ppts"] = 480
    bettor2 = determine_weekly_bettor(matchups, rosters, users)
    assert bettor2["roster_id"] == 1

    # Tie on weekly points, season_pf, max_pf -> Alphabetical by team name
    rosters[0]["settings"]["ppts"] = 500
    users[0]["metadata"]["team_name"] = "Zebra Squad"
    users[1]["metadata"]["team_name"] = "Alpha Wolves"
    bettor3 = determine_weekly_bettor(matchups, rosters, users)
    assert bettor3["roster_id"] == 2
    assert bettor3["team_name"] == "Alpha Wolves"

def test_fetch_active_nfl_players():
    raw_data = {
        "p1": {"first_name": "Saquon", "last_name": "Barkley", "team": "PHI", "position": "RB", "status": "Active"},
        "p2": {"first_name": "Patrick", "last_name": "Mahomes", "team": "KC", "position": "QB", "status": "Active"},
        "p3": {"first_name": "Retired", "last_name": "Player", "team": None, "position": "WR", "status": "Inactive"},
        "p4": {"first_name": "Offensive", "last_name": "Lineman", "team": "DET", "position": "OT", "status": "Active"},
        "p5": {"first_name": "Justin", "last_name": "Tucker", "team": "BAL", "position": "K", "status": "Active"},
        "p6": {"first_name": "", "last_name": "", "search_full_name": "Dallas Cowboys", "team": "DAL", "position": "DEF", "status": "Active"},
    }
    active = fetch_active_nfl_players(raw_data)
    assert len(active) == 4
    names = [p["name"] for p in active]
    assert "Saquon Barkley" in names
    assert "Patrick Mahomes" in names
    assert "Justin Tucker" in names
    assert "Dallas Cowboys" in names
    assert "Retired Player" not in names
    assert "Offensive Lineman" not in names

def test_fetch_sleeper_league_data():
    with patch("requests.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.json.return_value = [{"test": "data"}]
        mock_resp.raise_for_status.return_value = None
        mock_get.return_value = mock_resp

        data = fetch_sleeper_league_data("123456", 3)
        assert "rosters" in data
        assert "users" in data
        assert "matchups" in data
        assert mock_get.call_count == 3

def test_build_teams_from_sleeper():
    rosters = [
        {"roster_id": 2, "owner_id": "u2"},
        {"roster_id": 1, "owner_id": "u1"},
    ]
    users = [
        {"user_id": "u1", "display_name": "Blake", "metadata": {"team_name": "Philly Special"}},
        {"user_id": "u2", "display_name": "Bob", "metadata": {}},
    ]
    teams = build_teams_from_sleeper(rosters, users)
    assert len(teams) == 2
    assert teams[0]["roster_id"] == 1
    assert teams[0]["team_name"] == "Philly Special"
    assert teams[1]["roster_id"] == 2
    assert teams[1]["owner_name"] == "Bob"
