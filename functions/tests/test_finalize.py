import pytest
from main import handle_finalize_parlay

def test_handle_finalize_parlay_standard():
    existing_legs = [
        {
            "id": "leg_1",
            "roster_id": 1,
            "team_name": "Team 1",
            "owner_name": "Alice",
            "game_id": "game_kc_lac",
            "nfl_team": "KC",
            "description": "Patrick Mahomes OVER 250 Pass Yds",
            "odds_american": "-115",
            "odds_decimal": 1.87,
            "is_default_roll": False,
            "status": "submitted",
            "kickoff_time": "2026-09-27T20:25:00Z"
        }
    ]
    all_teams = [
        {
            "roster_id": 1,
            "team_name": "Team 1",
            "owner_name": "Alice",
            "default_legs": []
        },
        {
            "roster_id": 2,
            "team_name": "Team 2",
            "owner_name": "Bob",
            "default_legs": [
                {
                    "id": "def_2",
                    "nfl_team": "DET",
                    "market_type": "spread",
                    "description_template": "Lions Spread"
                }
            ]
        }
    ]
    active_odds = {
        "games": [
            {
                "game_id": "game_det_chi",
                "home_team": "DET",
                "away_team": "CHI",
                "commence_time": "2026-09-27T17:00:00Z",
                "spread": {"home": -6.5, "away": 6.5, "home_odds": "-110", "away_odds": "-110"}
            },
            {
                "game_id": "game_kc_lac",
                "home_team": "KC",
                "away_team": "LAC",
                "commence_time": "2026-09-27T20:25:00Z",
                "spread": {"home": -3.5, "away": 3.5, "home_odds": "-110", "away_odds": "-110"}
            }
        ]
    }

    # Alice (roster 1) is bettor and executor
    result = handle_finalize_parlay(
        existing_legs=existing_legs,
        all_teams=all_teams,
        active_odds_cache=active_odds,
        executor_roster_id=1,
        executor_name="Alice",
        bettor_roster_id=1
    )

    assert result["status"] == "locked"
    assert len(result["legs"]) == 2
    # Leg 2 was auto-rolled
    rolled_leg = next(l for l in result["legs"] if l["roster_id"] == 2)
    assert rolled_leg["is_default_roll"] is True
    assert "DET -6.5 Spread" in rolled_leg["description"]
    assert rolled_leg["odds_american"] == "-110"

    # Earliest kickoff should be 17:00:00Z (Lions game)
    assert result["earliest_kickoff"] == "2026-09-27T17:00:00Z"
    assert result["contains_sgp"] is False
    assert result["finalized_by"]["is_break_glass"] is False
    assert result["finalized_by"]["roster_id"] == 1
    assert result["estimated_payout"] > 5.0
    assert result["estimated_odds_american"].startswith("+")

def test_handle_finalize_parlay_break_glass():
    existing_legs = []
    all_teams = [
        {"roster_id": 1, "team_name": "T1", "owner_name": "Alice", "default_legs": []},
        {"roster_id": 2, "team_name": "T2", "owner_name": "Bob", "default_legs": []}
    ]
    # Bob (2) is bettor, but Charlie (3) executes break glass
    result = handle_finalize_parlay(
        existing_legs=existing_legs,
        all_teams=all_teams,
        active_odds_cache={"games": []},
        executor_roster_id=3,
        executor_name="Charlie",
        bettor_roster_id=2
    )

    assert result["status"] == "locked"
    assert result["finalized_by"]["is_break_glass"] is True
    assert result["finalized_by"]["roster_id"] == 3
    assert result["finalized_by"]["owner_name"] == "Charlie"

def test_handle_finalize_parlay_sgp_detection():
    existing_legs = [
        {
            "id": "leg_1",
            "roster_id": 1,
            "game_id": "game_kc_lac",
            "odds_american": "-110",
        },
        {
            "id": "leg_2",
            "roster_id": 2,
            "game_id": "game_kc_lac",
            "odds_american": "-110",
        }
    ]
    result = handle_finalize_parlay(
        existing_legs=existing_legs,
        all_teams=[],
        active_odds_cache={"games": []},
        executor_roster_id=1,
        executor_name="Alice",
        bettor_roster_id=1
    )
    assert result["contains_sgp"] is True
