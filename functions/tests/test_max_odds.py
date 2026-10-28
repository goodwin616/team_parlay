import os
import pytest
from unittest.mock import patch, MagicMock
from firebase_functions import https_fn
from main import (
    get_max_leg_odds_percent,
    submit_leg as _raw_submit_leg,
    get_kalshi_nfl_markets as _raw_get_kalshi_nfl_markets,
)


def unwrap_callable(fn):
    if hasattr(fn, "__wrapped__"):
        inner = fn.__wrapped__
        if getattr(inner, "__closure__", None):
            for cell in inner.__closure__:
                if callable(cell.cell_contents) and getattr(cell.cell_contents, "__name__", "") == fn.__name__:
                    return cell.cell_contents
        return inner
    return fn


submit_leg = unwrap_callable(_raw_submit_leg)
get_kalshi_nfl_markets = unwrap_callable(_raw_get_kalshi_nfl_markets)


def test_get_max_leg_odds_percent_valid():
    with patch.dict(os.environ, {"MAX_LEG_ODDS_PERCENT": "55"}):
        assert get_max_leg_odds_percent() == 55.0

    with patch.dict(os.environ, {"MAX_LEG_ODDS_PERCENT": "55.5"}):
        assert get_max_leg_odds_percent() == 55.5


def test_get_max_leg_odds_percent_unset_or_invalid():
    with patch.dict(os.environ, {}, clear=True):
        assert get_max_leg_odds_percent() is None

    with patch.dict(os.environ, {"MAX_LEG_ODDS_PERCENT": ""}):
        assert get_max_leg_odds_percent() is None

    with patch.dict(os.environ, {"MAX_LEG_ODDS_PERCENT": "abc"}):
        assert get_max_leg_odds_percent() is None

    with patch.dict(os.environ, {"MAX_LEG_ODDS_PERCENT": "-5"}):
        assert get_max_leg_odds_percent() is None

    with patch.dict(os.environ, {"MAX_LEG_ODDS_PERCENT": "105"}):
        assert get_max_leg_odds_percent() is None


def test_get_kalshi_nfl_markets_includes_max_leg_odds():
    req = MagicMock(spec=https_fn.CallableRequest)
    req.auth = MagicMock(uid="user_1", token={"name": "User 1"})
    req.data = {}

    with patch("main.require_actor", return_value={"uid": "user_1", "name": "User 1"}), \
         patch("main.get_db"), \
         patch("main.get_kalshi_client") as mock_kalshi, \
         patch.dict(os.environ, {"MAX_LEG_ODDS_PERCENT": "55"}):
        mock_client = MagicMock()
        mock_client.is_authenticated = True
        mock_client.get_cached_or_fresh_nfl_board.return_value = {
            "games": [],
            "props": [],
            "players": [],
            "live_market_count": 0,
            "updated_at": "2026-10-26T20:00:00Z",
            "cached": True,
        }
        mock_kalshi.return_value = mock_client

        res = get_kalshi_nfl_markets(req)
        assert res.get("max_leg_odds_percent") == 55.0


def test_submit_leg_rejects_pick_exceeding_max_odds():
    req = MagicMock(spec=https_fn.CallableRequest)
    req.auth = MagicMock(uid="u1", token={"name": "Owner 1"})
    req.data = {
        "league_id": "12345",
        "roster_id": 1,
        "week": 4,
        "leg": {
            "roster_id": 1,
            "kalshi_market_ticker": "KXNFLGAME-TEST",
            "price_cents": 62,
            "description": "Heavy Favorite",
            "kickoff_time": "2099-01-01T00:00:00Z",
        },
    }

    mock_db = MagicMock()
    mock_team_doc = MagicMock()
    mock_team_doc.exists = True
    mock_team_doc.to_dict.return_value = {
        "roster_id": 1,
        "claimed_by": {"uid": "u1"},
    }

    mock_parlay_doc = MagicMock()
    mock_parlay_doc.exists = True
    mock_parlay_doc.to_dict.return_value = {
        "status": "open",
        "legs": [],
    }

    mock_db.collection().document().collection().document().get.side_effect = [
        mock_team_doc,
        mock_parlay_doc,
    ]

    with patch("main.require_actor", return_value={"uid": "u1", "name": "Owner 1"}), \
         patch("main.get_db", return_value=mock_db), \
         patch("main.get_market_kickoff_time", return_value="2099-01-01T00:00:00Z"), \
         patch("main.is_kickoff_passed", return_value=False), \
         patch.dict(os.environ, {"MAX_LEG_ODDS_PERCENT": "55"}):

        with pytest.raises(https_fn.HttpsError) as exc_info:
            submit_leg(req)

        assert exc_info.value.code == https_fn.FunctionsErrorCode.FAILED_PRECONDITION
        assert "exceed the maximum allowed limit of 55%" in exc_info.value.message


def test_submit_leg_allows_pick_within_max_odds():
    req = MagicMock(spec=https_fn.CallableRequest)
    req.auth = MagicMock(uid="u1", token={"name": "Owner 1"})
    req.data = {
        "league_id": "12345",
        "roster_id": 1,
        "week": 4,
        "leg": {
            "roster_id": 1,
            "kalshi_market_ticker": "KXNFLGAME-TEST",
            "price_cents": 52,
            "description": "Allowed Pick",
            "kickoff_time": "2099-01-01T00:00:00Z",
        },
    }

    mock_db = MagicMock()
    mock_team_doc = MagicMock()
    mock_team_doc.exists = True
    mock_team_doc.to_dict.return_value = {
        "roster_id": 1,
        "claimed_by": {"uid": "u1"},
    }

    mock_parlay_doc = MagicMock()
    mock_parlay_doc.exists = True
    mock_parlay_doc.to_dict.return_value = {
        "status": "open",
        "legs": [],
    }

    mock_db.collection().document().collection().document().get.side_effect = [
        mock_team_doc,
        mock_parlay_doc,
    ]

    with patch("main.require_actor", return_value={"uid": "u1", "name": "Owner 1"}), \
         patch("main.get_db", return_value=mock_db), \
         patch("main.get_market_kickoff_time", return_value="2099-01-01T00:00:00Z"), \
         patch("main.is_kickoff_passed", return_value=False), \
         patch("main.get_kalshi_client") as mock_kc, \
         patch.dict(os.environ, {"MAX_LEG_ODDS_PERCENT": "55"}):

        client_instance = MagicMock()
        client_instance.fetch_combo_quote.return_value = {
            "odds_american": "-108",
            "multiplier": 1.92,
            "estimated_payout": 9.6,
            "pricing_source": "parlay_math",
            "contains_sgp": False,
        }
        mock_kc.return_value = client_instance

        res = submit_leg(req)
        assert res.get("success") is True


def test_submit_leg_rejects_missing_or_non_numeric_price_cents():
    for bad_price, expected_msg in [
        (None, "price_cents is required when maximum odds limit is enforced"),
        ("abc", "price_cents must be a valid numeric probability"),
    ]:
        req = MagicMock(spec=https_fn.CallableRequest)
        req.auth = MagicMock(uid="u1", token={"name": "Owner 1"})
        leg_data = {
            "roster_id": 1,
            "kalshi_market_ticker": "KXNFLGAME-TEST",
            "description": "Bad Price Pick",
            "kickoff_time": "2099-01-01T00:00:00Z",
        }
        if bad_price is not None:
            leg_data["price_cents"] = bad_price
        req.data = {
            "league_id": "12345",
            "roster_id": 1,
            "week": 4,
            "leg": leg_data,
        }

        mock_db = MagicMock()
        mock_team_doc = MagicMock(exists=True)
        mock_team_doc.to_dict.return_value = {"roster_id": 1, "claimed_by": {"uid": "u1"}}
        mock_parlay_doc = MagicMock(exists=True)
        mock_parlay_doc.to_dict.return_value = {"status": "open", "legs": []}
        mock_db.collection().document().collection().document().get.side_effect = [
            mock_team_doc,
            mock_parlay_doc,
        ]

        with patch("main.require_actor", return_value={"uid": "u1", "name": "Owner 1"}), \
             patch("main.get_db", return_value=mock_db), \
             patch("main.get_market_kickoff_time", return_value="2099-01-01T00:00:00Z"), \
             patch("main.is_kickoff_passed", return_value=False), \
             patch.dict(os.environ, {"MAX_LEG_ODDS_PERCENT": "55"}):

            with pytest.raises(https_fn.HttpsError) as exc_info:
                submit_leg(req)

            assert exc_info.value.code == https_fn.FunctionsErrorCode.INVALID_ARGUMENT
            assert expected_msg in exc_info.value.message

    # Also test explicit price_cents: None (key present with None value)
    req = MagicMock(spec=https_fn.CallableRequest)
    req.auth = MagicMock(uid="u1", token={"name": "Owner 1"})
    req.data = {
        "league_id": "12345",
        "roster_id": 1,
        "week": 4,
        "leg": {
            "roster_id": 1,
            "kalshi_market_ticker": "KXNFLGAME-TEST",
            "price_cents": None,
            "description": "None Price Pick",
            "kickoff_time": "2099-01-01T00:00:00Z",
        },
    }
    mock_db = MagicMock()
    mock_team_doc = MagicMock(exists=True)
    mock_team_doc.to_dict.return_value = {"roster_id": 1, "claimed_by": {"uid": "u1"}}
    mock_parlay_doc = MagicMock(exists=True)
    mock_parlay_doc.to_dict.return_value = {"status": "open", "legs": []}
    mock_db.collection().document().collection().document().get.side_effect = [
        mock_team_doc,
        mock_parlay_doc,
    ]

    with patch("main.require_actor", return_value={"uid": "u1", "name": "Owner 1"}), \
         patch("main.get_db", return_value=mock_db), \
         patch("main.get_market_kickoff_time", return_value="2099-01-01T00:00:00Z"), \
         patch("main.is_kickoff_passed", return_value=False), \
         patch.dict(os.environ, {"MAX_LEG_ODDS_PERCENT": "55"}):

        with pytest.raises(https_fn.HttpsError) as exc_info:
            submit_leg(req)

        assert exc_info.value.code == https_fn.FunctionsErrorCode.INVALID_ARGUMENT
        assert "price_cents is required when maximum odds limit is enforced" in exc_info.value.message


@pytest.mark.parametrize("env_override", [{}, {"MAX_LEG_ODDS_PERCENT": ""}])
def test_submit_leg_allows_high_odds_when_unset_or_empty(env_override):
    req = MagicMock(spec=https_fn.CallableRequest)
    req.auth = MagicMock(uid="u1", token={"name": "Owner 1"})
    req.data = {
        "league_id": "12345",
        "roster_id": 1,
        "week": 4,
        "leg": {
            "roster_id": 1,
            "kalshi_market_ticker": "KXNFLGAME-TEST",
            "price_cents": 75,
            "description": "High Odds Pick",
            "kickoff_time": "2099-01-01T00:00:00Z",
        },
    }

    mock_db = MagicMock()
    mock_team_doc = MagicMock(exists=True)
    mock_team_doc.to_dict.return_value = {"roster_id": 1, "claimed_by": {"uid": "u1"}}
    mock_parlay_doc = MagicMock(exists=True)
    mock_parlay_doc.to_dict.return_value = {"status": "open", "legs": []}
    mock_db.collection().document().collection().document().get.side_effect = [
        mock_team_doc,
        mock_parlay_doc,
    ]

    with patch("main.require_actor", return_value={"uid": "u1", "name": "Owner 1"}), \
         patch("main.get_db", return_value=mock_db), \
         patch("main.get_market_kickoff_time", return_value="2099-01-01T00:00:00Z"), \
         patch("main.is_kickoff_passed", return_value=False), \
         patch("main.get_kalshi_client") as mock_kc, \
         patch.dict(os.environ, env_override, clear=True if not env_override else False):

        client_instance = MagicMock()
        client_instance.fetch_combo_quote.return_value = {
            "odds_american": "-300",
            "multiplier": 1.33,
            "estimated_payout": 6.65,
            "pricing_source": "parlay_math",
            "contains_sgp": False,
        }
        mock_kc.return_value = client_instance

        res = submit_leg(req)
        assert res.get("success") is True


def test_submit_leg_rejects_pick_with_fractional_max_odds_formatting():
    req = MagicMock(spec=https_fn.CallableRequest)
    req.auth = MagicMock(uid="u1", token={"name": "Owner 1"})
    req.data = {
        "league_id": "12345",
        "roster_id": 1,
        "week": 4,
        "leg": {
            "roster_id": 1,
            "kalshi_market_ticker": "KXNFLGAME-TEST",
            "price_cents": 56,
            "description": "Over Fraction Limit",
            "kickoff_time": "2099-01-01T00:00:00Z",
        },
    }

    mock_db = MagicMock()
    mock_team_doc = MagicMock(exists=True)
    mock_team_doc.to_dict.return_value = {"roster_id": 1, "claimed_by": {"uid": "u1"}}
    mock_parlay_doc = MagicMock(exists=True)
    mock_parlay_doc.to_dict.return_value = {"status": "open", "legs": []}
    mock_db.collection().document().collection().document().get.side_effect = [
        mock_team_doc,
        mock_parlay_doc,
    ]

    with patch("main.require_actor", return_value={"uid": "u1", "name": "Owner 1"}), \
         patch("main.get_db", return_value=mock_db), \
         patch("main.get_market_kickoff_time", return_value="2099-01-01T00:00:00Z"), \
         patch("main.is_kickoff_passed", return_value=False), \
         patch.dict(os.environ, {"MAX_LEG_ODDS_PERCENT": "55.5"}):

        with pytest.raises(https_fn.HttpsError) as exc_info:
            submit_leg(req)

        assert exc_info.value.code == https_fn.FunctionsErrorCode.FAILED_PRECONDITION
        assert exc_info.value.message == "Leg odds (56%) exceed the maximum allowed limit of 55.5%"
