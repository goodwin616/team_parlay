import pytest
from unittest.mock import patch, MagicMock
from odds_engine import (
    calculate_earliest_kickoff,
    is_kickoff_passed,
    roll_default_leg,
    TheOddsApiClient,
    parse_mainline_odds_response,
    normalize_team,
    teams_match,
)

def test_calculate_earliest_kickoff():
    legs = [
        {"kickoff_time": "2026-09-27T17:00:00Z"},
        {"kickoff_time": "2026-09-24T20:15:00Z"},
        {"kickoff_time": "2026-09-28T00:20:00Z"},
    ]
    assert calculate_earliest_kickoff(legs) == "2026-09-24T20:15:00Z"

    # Empty legs or no kickoffs
    assert calculate_earliest_kickoff([]) is None
    assert calculate_earliest_kickoff([{"description": "No kickoff"}]) is None

def test_is_kickoff_passed():
    kickoff = "2026-09-24T20:15:00Z"
    before = "2026-09-24T18:00:00Z"
    after = "2026-09-24T20:16:00Z"

    assert is_kickoff_passed(kickoff, current_time_iso=before) is False
    assert is_kickoff_passed(kickoff, current_time_iso=after) is True
    assert is_kickoff_passed(None) is False

def test_normalize_and_teams_match():
    assert normalize_team("KC") == "KC"
    assert normalize_team("Kansas City Chiefs") == "KC"
    assert normalize_team("Chiefs") == "KC"
    assert teams_match("KC", "Kansas City Chiefs") is True
    assert teams_match("Philadelphia Eagles", "PHI") is True
    assert teams_match("DET", "BAL") is False

def test_roll_default_leg_spread():
    defaults = [
        {"id": "1", "nfl_team": "KC", "market_type": "spread", "description_template": "Chiefs Spread"}
    ]
    active_odds = {
        "games": [
            {
                "game_id": "game_kc_lac",
                "home_team": "KC",
                "away_team": "LAC",
                "commence_time": "2026-09-27T20:25:00Z",
                "spread": {"home": -4.5, "away": 4.5, "home_odds": "-110", "away_odds": "-110"}
            }
        ]
    }
    rolled = roll_default_leg(defaults, bye_teams=[], active_odds_cache=active_odds)
    assert rolled is not None
    assert "KC -4.5 Spread" in rolled["description"]
    assert rolled["odds_american"] == "-110"
    assert rolled["is_default_roll"] is True
    assert rolled["game_id"] == "game_kc_lac"
    assert rolled["kickoff_time"] == "2026-09-27T20:25:00Z"

def test_roll_default_leg_moneyline_and_total():
    active_odds = {
        "games": [
            {
                "game_id": "game_bal_phi",
                "home_team": "BAL",
                "away_team": "PHI",
                "commence_time": "2026-09-27T17:00:00Z",
                "moneyline": {"home_odds": "-140", "away_odds": "+120"},
                "total": {"over_under": 48.5, "over_odds": "-105", "under_odds": "-115"}
            }
        ]
    }
    # Test Moneyline
    ml_defaults = [{"id": "1", "nfl_team": "BAL", "market_type": "moneyline", "description_template": "Ravens ML"}]
    rolled_ml = roll_default_leg(ml_defaults, bye_teams=[], active_odds_cache=active_odds)
    assert rolled_ml is not None
    assert "BAL Moneyline" in rolled_ml["description"]
    assert rolled_ml["odds_american"] == "-140"

    # Test Total Over
    total_defaults = [{"id": "2", "nfl_team": "BAL", "market_type": "game_total", "direction": "over", "description_template": "BAL Game Over"}]
    rolled_total = roll_default_leg(total_defaults, bye_teams=[], active_odds_cache=active_odds)
    assert rolled_total is not None
    assert "OVER 48.5" in rolled_total["description"]
    assert rolled_total["odds_american"] == "-105"

def test_roll_default_leg_bye_week_exclusion():
    defaults = [
        {"id": "1", "nfl_team": "KC", "market_type": "spread", "description_template": "Chiefs Spread"},
        {"id": "2", "nfl_team": "DET", "market_type": "spread", "description_template": "Lions Spread"}
    ]
    active_odds = {
        "games": [
            {
                "game_id": "game_det_chi",
                "home_team": "DET",
                "away_team": "CHI",
                "commence_time": "2026-09-27T17:00:00Z",
                "spread": {"home": -6.5, "away": 6.5, "home_odds": "-110", "away_odds": "-110"}
            }
        ]
    }
    # KC is on bye -> Should select DET
    rolled = roll_default_leg(defaults, bye_teams=["KC"], active_odds_cache=active_odds)
    assert rolled is not None
    assert rolled["nfl_team"] == "DET"
    assert "DET -6.5 Spread" in rolled["description"]

    # Both KC and DET on bye -> returns None
    assert roll_default_leg(defaults, bye_teams=["KC", "DET"], active_odds_cache=active_odds) is None

def test_roll_default_leg_post_kickoff_exclusion():
    defaults = [
        {"id": "1", "nfl_team": "KC", "market_type": "spread", "description_template": "Chiefs Spread"},
        {"id": "2", "nfl_team": "DET", "market_type": "spread", "description_template": "Lions Spread"}
    ]
    active_odds = {
        "games": [
            {
                "game_id": "game_kc_lac",
                "home_team": "KC",
                "away_team": "LAC",
                "commence_time": "2026-09-24T20:15:00Z", # TNF game
                "spread": {"home": -3.0, "away": 3.0, "home_odds": "-110", "away_odds": "-110"}
            },
            {
                "game_id": "game_det_chi",
                "home_team": "DET",
                "away_team": "CHI",
                "commence_time": "2026-09-27T17:00:00Z", # Sunday game
                "spread": {"home": -6.5, "away": 6.5, "home_odds": "-110", "away_odds": "-110"}
            }
        ]
    }
    # Assume it is Friday 2026-09-25 (after TNF kickoff)
    friday_time = "2026-09-25T12:00:00Z"
    rolled = roll_default_leg(defaults, bye_teams=[], active_odds_cache=active_odds, current_time_iso=friday_time)
    assert rolled is not None
    # KC must be excluded because TNF already started, DET must be chosen
    assert rolled["nfl_team"] == "DET"
    assert rolled["game_id"] == "game_det_chi"

def test_the_odds_api_client_strict_draftkings():
    client = TheOddsApiClient(api_key="test_api_key")

    with patch("requests.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.json.return_value = []
        mock_resp.raise_for_status.return_value = None
        mock_get.return_value = mock_resp

        # Mainline fetch
        client.fetch_draftkings_mainline_odds()
        mock_get.assert_called_once()
        args, kwargs = mock_get.call_args
        assert kwargs["params"]["bookmakers"] == "draftkings"
        assert kwargs["params"]["markets"] == "h2h,spreads,totals"
        assert kwargs["params"]["regions"] == "us"

    with patch("requests.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.json.return_value = {}
        mock_resp.raise_for_status.return_value = None
        mock_get.return_value = mock_resp

        # Props fetch
        client.fetch_draftkings_player_props(event_id="evt_123", markets="player_pass_yds")
        args, kwargs = mock_get.call_args
        assert kwargs["params"]["bookmakers"] == "draftkings"
        assert "evt_123" in args[0]

def test_parse_mainline_odds_response():
    raw_api_data = [
        {
            "id": "game_1",
            "commence_time": "2026-09-27T17:00:00Z",
            "home_team": "Kansas City Chiefs",
            "away_team": "Los Angeles Chargers",
            "bookmakers": [
                {
                    "key": "fanduel",
                    "title": "FanDuel",
                    "markets": []
                },
                {
                    "key": "draftkings",
                    "title": "DraftKings",
                    "markets": [
                        {
                            "key": "spreads",
                            "outcomes": [
                                {"name": "Kansas City Chiefs", "price": -110, "point": -3.5},
                                {"name": "Los Angeles Chargers", "price": -110, "point": 3.5}
                            ]
                        },
                        {
                            "key": "h2h",
                            "outcomes": [
                                {"name": "Kansas City Chiefs", "price": -175},
                                {"name": "Los Angeles Chargers", "price": 150}
                            ]
                        },
                        {
                            "key": "totals",
                            "outcomes": [
                                {"name": "Over", "price": -110, "point": 48.0},
                                {"name": "Under", "price": -110, "point": 48.0}
                            ]
                        }
                    ]
                }
            ]
        }
    ]
    parsed = parse_mainline_odds_response(raw_api_data)
    assert len(parsed["games"]) == 1
    g = parsed["games"][0]
    assert g["game_id"] == "game_1"
    assert g["home_team"] == "KC"
    assert g["away_team"] == "LAC"
    assert g["spread"]["home"] == -3.5
    assert g["moneyline"]["home_odds"] == "-175"
    assert g["moneyline"]["away_odds"] == "+150"
    assert g["total"]["over_under"] == 48.0
