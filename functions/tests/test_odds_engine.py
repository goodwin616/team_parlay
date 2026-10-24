import pytest
from unittest.mock import patch, MagicMock
from odds_engine import (
    calculate_earliest_kickoff,
    is_kickoff_passed,
    KalshiApiClient,
    parse_kalshi_game_markets,
    parse_kalshi_prop_market,
    extract_kalshi_price_cents,
    normalize_team,
    teams_match,
)

def test_calculate_earliest_kickoff():
    legs = [
        {"kickoff_time": "2026-09-27T17:00:00Z", "status": "submitted"},
        {"kickoff_time": "2026-09-24T20:15:00Z", "status": "submitted"},
        {"kickoff_time": "2026-09-23T20:15:00Z", "status": "pending"},
    ]
    assert calculate_earliest_kickoff(legs) == "2026-09-24T20:15:00Z"
    assert calculate_earliest_kickoff([]) is None

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
    assert teams_match("KC", "Kansas City Chiefs") is True
    assert teams_match("Philadelphia Eagles", "PHI") is True
    assert teams_match("DET", "BAL") is False

def test_extract_kalshi_price_cents():
    assert extract_kalshi_price_cents({"yes_ask_dollars": "0.5400"}, "yes") == 54
    assert extract_kalshi_price_cents({"yes_ask": 62}, "yes") == 62
    assert extract_kalshi_price_cents({"no_ask_dollars": "0.4600"}, "no") == 46

def test_kalshi_api_client_public_markets():
    client = KalshiApiClient()
    assert client.is_authenticated is False

    with patch("requests.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "markets": [
                {
                    "ticker": "KXNFLTD-26OCT26DALPHI-DALEDEMERCADO31-1",
                    "event_ticker": "KXNFLTD-26OCT26DALPHI",
                    "title": "Emari Demercado: 1+ touchdowns",
                    "yes_sub_title": "Emari Demercado: 1+",
                    "no_sub_title": "Emari Demercado: 1+",
                    "status": "active",
                    "floor_strike": 0.5,
                    "yes_ask_dollars": "0.5400",
                    "no_ask_dollars": "0.4600",
                    "rules_primary": "If Emari Demercado scores at least 1+ touchdowns in the Dallas vs Philadelphia Pro Football game originally scheduled for Oct 26, 2026, then the market resolves to Yes.",
                    "expected_expiration_time": "2026-10-27T03:15:00Z",
                    "close_time": "2026-10-29T00:15:00Z",
                }
            ]
        }
        mock_resp.raise_for_status.return_value = None
        mock_get.return_value = mock_resp

        props = client.fetch_nfl_player_props(series_ticker="KXNFLTD")
        assert len(props) == 1
        assert props[0]["market_ticker"] == "KXNFLTD-26OCT26DALPHI-DALEDEMERCADO31-1"
        assert props[0]["player_name"] == "Emari Demercado"
        assert props[0]["label"] == "1+ touchdowns"
        assert props[0]["nfl_team"] == "DAL"
        assert props[0]["stat_category"] == "Touchdowns"
        assert props[0]["kickoff_time"] == "2026-10-27T00:15:00Z"
        assert props[0]["game_id"] == "KXNFL-26OCT26DALPHI"
        assert props[0]["yes_price_cents"] == 54
        assert props[0]["yes_odds_american"] == "-117"
        assert props[0]["no_price_cents"] == 46
        assert props[0]["no_odds_american"] == "+117"


def test_parse_kalshi_game_markets_real_v2_format():
    raw_markets = [
        {
            "ticker": "KXNFLGAME-26OCT29CARGB-GB",
            "event_ticker": "KXNFLGAME-26OCT29CARGB",
            "title": "Green Bay wins",
            "yes_sub_title": "Green Bay",
            "no_sub_title": "Green Bay",
            "status": "active",
            "yes_ask_dollars": "0.5800",
            "no_ask_dollars": "0.4200",
            "rules_primary": "If Green Bay wins the Carolina vs Green Bay Pro Football game originally scheduled for Oct 29, 2026, then the market resolves to Yes.",
            "expected_expiration_time": "2026-10-30T03:15:00Z",
            "close_time": "2026-11-01T00:15:00Z",
        },
        {
            "ticker": "KXNFLGAME-26OCT29CARGB-CAR",
            "event_ticker": "KXNFLGAME-26OCT29CARGB",
            "title": "Carolina wins",
            "yes_sub_title": "Carolina",
            "no_sub_title": "Carolina",
            "status": "active",
            "yes_ask_dollars": "0.4300",
            "no_ask_dollars": "0.5900",
            "rules_primary": "If Carolina wins the Carolina vs Green Bay Pro Football game originally scheduled for Oct 29, 2026, then the market resolves to Yes.",
            "expected_expiration_time": "2026-10-30T03:15:00Z",
            "close_time": "2026-11-01T00:15:00Z",
        },
        # Alternate spread (far from 50c)
        {
            "ticker": "KXNFLSPREAD-26OCT29CARGB-GB8",
            "event_ticker": "KXNFLSPREAD-26OCT29CARGB",
            "title": "Green Bay wins by over 7.5 points?",
            "yes_sub_title": "Green Bay wins by over 7.5 points",
            "status": "active",
            "floor_strike": 7.5,
            "yes_ask_dollars": "0.3900",
            "no_ask_dollars": "0.7700",
            "rules_primary": "If Green Bay wins by more than 7.5 points in the Carolina vs Green Bay Pro Football game originally scheduled for Oct 29, 2026, then the market resolves to Yes.",
            "expected_expiration_time": "2026-10-30T03:15:00Z",
        },
        # Main spread (closest to 50c)
        {
            "ticker": "KXNFLSPREAD-26OCT29CARGB-GB3",
            "event_ticker": "KXNFLSPREAD-26OCT29CARGB",
            "title": "Green Bay wins by over 2.5 points?",
            "yes_sub_title": "Green Bay wins by over 2.5 points",
            "status": "active",
            "floor_strike": 2.5,
            "yes_ask_dollars": "0.5200",
            "no_ask_dollars": "0.4800",
            "rules_primary": "If Green Bay wins by more than 2.5 points in the Carolina vs Green Bay Pro Football game originally scheduled for Oct 29, 2026, then the market resolves to Yes.",
            "expected_expiration_time": "2026-10-30T03:15:00Z",
        },
        # Main total (closest to 50c)
        {
            "ticker": "KXNFLTOTAL-26OCT29CARGB-47",
            "event_ticker": "KXNFLTOTAL-26OCT29CARGB",
            "title": "Full Game: over 47.5 points scored?",
            "yes_sub_title": "Over 47.5 points",
            "status": "active",
            "floor_strike": 47.5,
            "yes_ask_dollars": "0.5200",
            "no_ask_dollars": "0.4800",
            "rules_primary": "If Carolina and Green Bay collectively score more than 47.5 points in the Carolina vs Green Bay Pro Football game originally scheduled for Oct 29, 2026, then the market resolves to Yes.",
            "expected_expiration_time": "2026-10-30T03:15:00Z",
        },
        # Finalized market that should be ignored
        {
            "ticker": "KXNFLTOTAL-26OCT22NECHI-76",
            "event_ticker": "KXNFLTOTAL-26OCT22NECHI",
            "title": "Full Game: over 75.5 points scored?",
            "status": "finalized",
            "floor_strike": 75.5,
            "yes_ask_dollars": "1.0000",
            "no_ask_dollars": "1.0000",
            "rules_primary": "If New England and Chicago collectively score more than 75.5 points in the New England vs Chicago Pro Football game originally scheduled for Oct 22, 2026, then the market resolves to Yes.",
        },
    ]
    parsed = parse_kalshi_game_markets(raw_markets)
    assert len(parsed["games"]) == 1
    g = parsed["games"][0]
    assert g["game_id"] == "KXNFL-26OCT29CARGB"
    assert g["home_team"] == "GB"
    assert g["away_team"] == "CAR"
    assert g["commence_time"] == "2026-10-30T00:15:00Z"
    assert g["moneyline"]["home_cents"] == 58
    assert g["moneyline"]["away_cents"] == 43
    assert g["spread"]["home"] == -2.5
    assert g["spread"]["away"] == 2.5
    assert g["total"]["over_under"] == 47.5

def test_kalshi_combo_quote_compound_and_authenticated_mve():
    legs = [
        {
            "roster_id": 1,
            "status": "submitted",
            "kalshi_market_ticker": "KXNFLGAME-1",
            "kalshi_side": "yes",
            "price_cents": 50,
        },
        {
            "roster_id": 2,
            "status": "submitted",
            "kalshi_market_ticker": "KXNFLTD-2",
            "kalshi_side": "yes",
            "price_cents": 50,
        },
    ]
    # Unauthenticated client uses compound Kalshi math
    unauth_client = KalshiApiClient()
    quote = unauth_client.fetch_combo_quote(legs, stake=5.0)
    assert quote["pricing_source"] == "kalshi_compound"
    assert quote["multiplier"] == 4.0
    assert quote["estimated_payout"] == 20.0
    assert quote["odds_american"] == "+300"

    # Authenticated client with MVE collection ticker queries Kalshi MVE endpoint
    auth_client = KalshiApiClient(api_key_id="key_123", private_key_pem="mock_pem")
    with patch("requests.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "market": {
                "ticker": "KXMVE-COMBO-123",
                "yes_ask_dollars": "0.2000",  # 20 cents -> 5.0x multiplier
            }
        }
        mock_resp.raise_for_status.return_value = None
        mock_post.return_value = mock_resp

        mve_quote = auth_client.fetch_combo_quote(
            legs, stake=5.0, collection_ticker="KXMVENFLSINGLEGAME"
        )
        assert mve_quote["pricing_source"] == "kalshi_mve"
        assert mve_quote["kalshi_combo_ticker"] == "KXMVE-COMBO-123"
        assert mve_quote["multiplier"] == 5.0
        assert mve_quote["estimated_payout"] == 25.0
        assert mve_quote["odds_american"] == "+400"

def test_kalshi_api_client_loads_key_file(tmp_path):
    key_file = tmp_path / "kalshi_private.key"
    key_file.write_text("-----BEGIN RSA PRIVATE KEY-----\nmock_file_key\n-----END RSA PRIVATE KEY-----")

    client = KalshiApiClient(api_key_id="key_abc", private_key_path=str(key_file))
    assert client.is_authenticated is True
    assert "mock_file_key" in (client.private_key_pem or "")
    headers = client._build_auth_headers("GET", "/trade-api/v2/portfolio/balance")
    assert headers["KALSHI-ACCESS-KEY"] == "key_abc"
    assert headers["KALSHI-ACCESS-SIGNATURE"] != ""


def test_trading_blocked_safety_guard():
    from odds_engine import (
        assert_request_cannot_trade,
        KalshiTradingBlockedError,
        best_rfq_yes_cost_cents,
    )
    import pytest

    # Safe GET queries are permitted
    assert_request_cannot_trade("GET", "/trade-api/v2/portfolio/balance")
    assert_request_cannot_trade("GET", "/trade-api/v2/markets")
    assert_request_cannot_trade("GET", "/trade-api/v2/communications/quotes")

    # Safe MVE combo creation and RFQ creation/deletion are permitted
    assert_request_cannot_trade("POST", "/trade-api/v2/multivariate_event_collections/KXMVE-TEST")
    assert_request_cannot_trade("POST", "/trade-api/v2/communications/rfqs")
    assert_request_cannot_trade("DELETE", "/trade-api/v2/communications/rfqs/rfq-uuid-123")

    # ALL TRADING ACTIONS ARE STRICTLY BLOCKED:
    # 1. Accepting a quote (PUT /communications/rfqs/.../accept)
    with pytest.raises(KalshiTradingBlockedError):
        assert_request_cannot_trade("PUT", "/trade-api/v2/communications/rfqs/123/quotes/456/accept")

    # 2. Confirming a quote
    with pytest.raises(KalshiTradingBlockedError):
        assert_request_cannot_trade("PUT", "/trade-api/v2/communications/rfqs/123/quotes/456/confirm")

    # 3. Placing orders
    with pytest.raises(KalshiTradingBlockedError):
        assert_request_cannot_trade("POST", "/trade-api/v2/portfolio/orders")
    with pytest.raises(KalshiTradingBlockedError):
        assert_request_cannot_trade("POST", "/trade-api/v2/orders")

    # 4. Modifying orders or transferring funds
    with pytest.raises(KalshiTradingBlockedError):
        assert_request_cannot_trade("PUT", "/trade-api/v2/portfolio/orders/123")
    with pytest.raises(KalshiTradingBlockedError):
        assert_request_cannot_trade("POST", "/trade-api/v2/portfolio/transfers")


def test_best_rfq_yes_cost_cents():
    from odds_engine import best_rfq_yes_cost_cents

    quotes = [
        {"status": "canceled", "no_bid_dollars": "0.9000"},  # Ignored (canceled)
        {"status": "open", "no_bid_dollars": "0.6000"},      # 1 - 0.60 = $0.40 -> 40.0 cents
        {"status": "open", "no_bid_dollars": "0.6500"},      # 1 - 0.65 = $0.35 -> 35.0 cents (cheaper YES)
        {"status": "open", "yes_ask_dollars": "0.3300"},     # 33.0 cents (best YES)
    ]
    best = best_rfq_yes_cost_cents(quotes)
    assert best == 33.0


def test_rfq_combo_quote_integration():
    auth_client = KalshiApiClient(api_key_id="key_123", private_key_pem="mock_pem")
    legs = [
        {"kalshi_market_ticker": "KXNFLTD-1", "kalshi_side": "yes", "price_cents": 50},
        {"kalshi_market_ticker": "KXNFLTD-2", "kalshi_side": "yes", "price_cents": 50},
    ]

    # When market has empty orderbook, client requests RFQ and uses returned quotes
    with patch("requests.post") as mock_post, \
         patch("requests.get") as mock_get, \
         patch("requests.delete") as mock_delete, \
         patch("time.sleep"):

        # 1. MVE market creation returns market with no resting orders (yes_ask = 1.0)
        mve_resp = MagicMock()
        mve_resp.json.return_value = {
            "market": {
                "ticker": "KXMVE-COMBO-EMPTY",
                "yes_ask_dollars": "1.0000",
            }
        }
        mve_resp.raise_for_status.return_value = None

        # 2. RFQ creation returns id
        rfq_create_resp = MagicMock()
        rfq_create_resp.json.return_value = {"id": "test-rfq-uuid"}
        rfq_create_resp.raise_for_status.return_value = None

        mock_post.side_effect = [mve_resp, rfq_create_resp]

        # 3. GET rfq details + GET quotes
        rfq_info_resp = MagicMock()
        rfq_info_resp.ok = True
        rfq_info_resp.json.return_value = {"rfq": {"creator_user_id": "creator-123"}}

        quotes_resp = MagicMock()
        quotes_resp.ok = True
        quotes_resp.json.return_value = {
            "quotes": [
                {"status": "open", "no_bid_dollars": "0.6000"}  # 40 cents -> +150
            ]
        }
        mock_get.side_effect = [rfq_info_resp, quotes_resp]

        # 4. DELETE RFQ
        mock_delete_resp = MagicMock()
        mock_delete_resp.ok = True
        mock_delete.return_value = mock_delete_resp

        quote = auth_client.fetch_combo_quote(legs, stake=5.0)

        assert quote["pricing_source"] == "kalshi_mve"
        assert quote["kalshi_combo_ticker"] == "KXMVE-COMBO-EMPTY"
        assert quote["combined_probability_cents"] == 40
        assert quote["multiplier"] == 2.5
        assert quote["estimated_payout"] == 12.50
        assert quote["odds_american"] == "+150"

        # Verify RFQ was strictly deleted for cleanup
        mock_delete.assert_called_once()
        assert "test-rfq-uuid" in mock_delete.call_args[0][0]

