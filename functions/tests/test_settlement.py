import pytest
from unittest.mock import MagicMock, patch
from settlement_engine import grade_leg, grade_parlay, settle_unfinalized_parlays

class TestGradeLeg:
    def test_grade_leg_won(self):
        leg = {"kalshi_market_ticker": "TICKER-1", "kalshi_side": "yes"}
        market = {"status": "finalized", "result": "yes"}
        graded = grade_leg(leg, market)
        assert graded["outcome"] == "won"

    def test_grade_leg_settled_side_won(self):
        leg = {"kalshi_market_ticker": "TICKER-1", "kalshi_side": "no"}
        market = {"status": "settled", "result": "no"}
        graded = grade_leg(leg, market)
        assert graded["outcome"] == "won"

    def test_grade_leg_lost(self):
        leg = {"kalshi_market_ticker": "TICKER-1", "kalshi_side": "yes"}
        market = {"status": "finalized", "result": "no"}
        graded = grade_leg(leg, market)
        assert graded["outcome"] == "lost"

    def test_grade_leg_void_by_result(self):
        leg = {"kalshi_market_ticker": "TICKER-1", "kalshi_side": "yes"}
        market = {"status": "finalized", "result": "void"}
        graded = grade_leg(leg, market)
        assert graded["outcome"] == "void"

    def test_grade_leg_void_by_status(self):
        leg = {"kalshi_market_ticker": "TICKER-1", "kalshi_side": "yes"}
        market = {"status": "void", "result": ""}
        graded = grade_leg(leg, market)
        assert graded["outcome"] == "void"

    def test_grade_leg_scalar_void(self):
        leg = {"kalshi_market_ticker": "TICKER-1", "kalshi_side": "yes"}
        market = {"status": "settled", "result": "scalar"}
        graded = grade_leg(leg, market)
        assert graded["outcome"] == "void"

    def test_grade_leg_pending_when_open(self):
        leg = {"kalshi_market_ticker": "TICKER-1", "kalshi_side": "yes"}
        market = {"status": "open"}
        graded = grade_leg(leg, market)
        assert graded["outcome"] == "pending"

    def test_grade_leg_pending_when_market_none(self):
        leg = {"kalshi_market_ticker": "TICKER-1", "kalshi_side": "yes"}
        graded = grade_leg(leg, None)
        assert graded["outcome"] == "pending"

    def test_grade_leg_unwraps_nested_market_dict(self):
        leg = {"kalshi_market_ticker": "TICKER-1", "kalshi_side": "yes"}
        market = {"market": {"status": "finalized", "result": "yes"}}
        graded = grade_leg(leg, market)
        assert graded["outcome"] == "won"


class TestGradeParlay:
    def test_grade_parlay_won_all_legs_hit(self):
        parlay = {
            "week": 1,
            "status": "locked",
            "estimated_payout": 20.0,
            "legs": [
                {"kalshi_market_ticker": "T1", "kalshi_side": "yes", "odds_decimal": 2.0, "status": "submitted"},
                {"kalshi_market_ticker": "T2", "kalshi_side": "no", "odds_decimal": 2.0, "status": "submitted"},
            ],
        }
        market_lookup = {
            "T1": {"status": "finalized", "result": "yes"},
            "T2": {"status": "finalized", "result": "no"},
        }
        graded = grade_parlay(parlay, market_lookup)
        assert graded["outcome"] == "won"
        assert graded["settlement_status"] == "finalized"
        assert graded["actual_payout"] == 20.0
        assert graded["legs"][0]["outcome"] == "won"
        assert graded["legs"][1]["outcome"] == "won"

    def test_grade_parlay_lost_when_one_leg_lost(self):
        parlay = {
            "week": 1,
            "status": "locked",
            "estimated_payout": 20.0,
            "legs": [
                {"kalshi_market_ticker": "T1", "kalshi_side": "yes", "odds_decimal": 2.0, "status": "submitted"},
                {"kalshi_market_ticker": "T2", "kalshi_side": "yes", "odds_decimal": 2.0, "status": "submitted"},
            ],
        }
        market_lookup = {
            "T1": {"status": "finalized", "result": "yes"},
            "T2": {"status": "finalized", "result": "no"},
        }
        graded = grade_parlay(parlay, market_lookup)
        assert graded["outcome"] == "lost"
        assert graded["settlement_status"] == "finalized"
        assert graded["actual_payout"] == 0.0
        assert graded["legs"][0]["outcome"] == "won"
        assert graded["legs"][1]["outcome"] == "lost"

    def test_grade_parlay_recalculates_payout_on_voided_leg(self):
        # 2 legs: Leg 1 is 2.0x (won), Leg 2 is 2.0x (voided)
        # Original stake $5, 2.0x * 2.0x = $20
        # Recalculated payout with 1 void: $5 * 2.0 = $10.00
        parlay = {
            "week": 1,
            "status": "locked",
            "stake": 5.0,
            "estimated_payout": 20.0,
            "legs": [
                {"kalshi_market_ticker": "T1", "kalshi_side": "yes", "odds_decimal": 2.0, "status": "submitted"},
                {"kalshi_market_ticker": "T2", "kalshi_side": "yes", "odds_decimal": 2.0, "status": "submitted"},
            ],
        }
        market_lookup = {
            "T1": {"status": "finalized", "result": "yes"},
            "T2": {"status": "void", "result": "void"},
        }
        graded = grade_parlay(parlay, market_lookup)
        assert graded["outcome"] == "won"
        assert graded["settlement_status"] == "finalized"
        assert graded["actual_payout"] == 10.0
        assert graded["actual_multiplier"] == 2.0
        assert graded["legs"][0]["outcome"] == "won"
        assert graded["legs"][1]["outcome"] == "void"

    def test_grade_parlay_all_legs_voided(self):
        # Both legs voided -> stake refunded ($5.00)
        parlay = {
            "week": 1,
            "status": "locked",
            "stake": 5.0,
            "estimated_payout": 20.0,
            "legs": [
                {"kalshi_market_ticker": "T1", "kalshi_side": "yes", "odds_decimal": 2.0, "status": "submitted"},
                {"kalshi_market_ticker": "T2", "kalshi_side": "yes", "odds_decimal": 2.0, "status": "submitted"},
            ],
        }
        market_lookup = {
            "T1": {"status": "void", "result": "void"},
            "T2": {"status": "void", "result": "void"},
        }
        graded = grade_parlay(parlay, market_lookup)
        assert graded["outcome"] == "won"
        assert graded["settlement_status"] == "finalized"
        assert graded["actual_payout"] == 5.0
        assert graded["actual_multiplier"] == 1.0

    def test_grade_parlay_pending_when_leg_pending_and_no_loss(self):
        parlay = {
            "week": 1,
            "status": "locked",
            "estimated_payout": 20.0,
            "legs": [
                {"kalshi_market_ticker": "T1", "kalshi_side": "yes", "odds_decimal": 2.0, "status": "submitted"},
                {"kalshi_market_ticker": "T2", "kalshi_side": "yes", "odds_decimal": 2.0, "status": "submitted"},
            ],
        }
        market_lookup = {
            "T1": {"status": "finalized", "result": "yes"},
            "T2": {"status": "open"},
        }
        graded = grade_parlay(parlay, market_lookup)
        assert graded["outcome"] == "pending"
        assert graded["settlement_status"] == "pending"
        assert graded["legs"][0]["outcome"] == "won"
        assert graded["legs"][1]["outcome"] == "pending"


class TestSettleUnfinalizedParlays:
    def test_skips_already_finalized_parlays(self):
        mock_db = MagicMock()
        mock_parlays_coll = mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value.collection.return_value

        doc_finalized = MagicMock()
        doc_finalized.id = "1"
        doc_finalized.to_dict.return_value = {
            "week": 1,
            "status": "won",
            "settlement_status": "finalized",
            "outcome": "won",
            "legs": [{"kalshi_market_ticker": "T1", "status": "submitted", "kalshi_side": "yes"}],
        }

        mock_parlays_coll.stream.return_value = [doc_finalized]

        mock_fetcher = MagicMock()
        results = settle_unfinalized_parlays(
            mock_db,
            league_id="league123",
            season="2026",
            current_week=3,
            kalshi_fetcher_fn=mock_fetcher,
        )

        assert results == []
        mock_fetcher.assert_not_called()
        doc_finalized.reference.update.assert_not_called()

    def test_settles_locked_unfinalized_parlay(self):
        mock_db = MagicMock()
        mock_parlays_coll = mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value.collection.return_value

        doc_unsettled = MagicMock()
        doc_unsettled.id = "2"
        doc_unsettled.to_dict.return_value = {
            "week": 2,
            "status": "locked",
            "settlement_status": "pending",
            "estimated_payout": 15.0,
            "legs": [
                {
                    "kalshi_market_ticker": "TICKER-A",
                    "kalshi_side": "yes",
                    "status": "submitted",
                    "odds_decimal": 1.9,
                }
            ],
        }

        mock_parlays_coll.stream.return_value = [doc_unsettled]

        mock_fetcher = MagicMock(return_value={"status": "finalized", "result": "yes"})
        results = settle_unfinalized_parlays(
            mock_db,
            league_id="league123",
            season="2026",
            current_week=3,
            kalshi_fetcher_fn=mock_fetcher,
        )

        assert len(results) == 1
        assert results[0]["outcome"] == "won"
        assert results[0]["settlement_status"] == "finalized"
        mock_fetcher.assert_called_once_with("TICKER-A")
        doc_unsettled.reference.update.assert_called_once()
        update_args = doc_unsettled.reference.update.call_args[0][0]
        assert update_args["outcome"] == "won"
        assert update_args["settlement_status"] == "finalized"

    def test_deduplicates_tickers_across_legs(self):
        mock_db = MagicMock()
        mock_parlays_coll = mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value.collection.return_value

        doc1 = MagicMock()
        doc1.id = "1"
        doc1.to_dict.return_value = {
            "week": 1,
            "status": "locked",
            "settlement_status": "pending",
            "legs": [
                {"kalshi_market_ticker": "SHARED-TICKER", "kalshi_side": "yes", "status": "submitted"},
            ],
        }
        doc2 = MagicMock()
        doc2.id = "2"
        doc2.to_dict.return_value = {
            "week": 2,
            "status": "locked",
            "settlement_status": "pending",
            "legs": [
                {"kalshi_market_ticker": "SHARED-TICKER", "kalshi_side": "yes", "status": "submitted"},
            ],
        }

        mock_parlays_coll.stream.return_value = [doc1, doc2]

        mock_fetcher = MagicMock(return_value={"status": "finalized", "result": "yes"})
        settle_unfinalized_parlays(
            mock_db,
            league_id="league123",
            season="2026",
            current_week=3,
            kalshi_fetcher_fn=mock_fetcher,
        )

        # SHARED-TICKER fetched once only
        assert mock_fetcher.call_count == 1

    def test_resilience_when_ticker_lookup_fails(self):
        mock_db = MagicMock()
        mock_parlays_coll = mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value.collection.return_value

        doc = MagicMock()
        doc.id = "1"
        doc.to_dict.return_value = {
            "week": 1,
            "status": "locked",
            "settlement_status": "pending",
            "legs": [
                {"kalshi_market_ticker": "FAIL-TICKER", "kalshi_side": "yes", "status": "submitted"},
            ],
        }

        mock_parlays_coll.stream.return_value = [doc]

        def failing_fetcher(ticker):
            raise RuntimeError("Kalshi API rate limit 429")

        results = settle_unfinalized_parlays(
            mock_db,
            league_id="league123",
            season="2026",
            current_week=2,
            kalshi_fetcher_fn=failing_fetcher,
        )

        assert len(results) == 1
        # Leg and parlay stay pending and no exception thrown
        assert results[0]["outcome"] == "pending"
        assert results[0]["settlement_status"] == "pending"


class TestInitOrSyncLeagueIntegration:
    def test_init_or_sync_calls_settle_unfinalized_parlays(self):
        from firebase_functions import https_fn
        import main
        from tests.test_claims_and_audit import call_fn

        req = MagicMock(spec=https_fn.CallableRequest)
        req.data = {"league_id": "demo", "season": "2026"}
        req.auth = https_fn.AuthData(
            uid="u1",
            token={"name": "Alice", "email": "alice@test.com"},
        )

        fake_db = MagicMock()
        with patch("main.get_db", return_value=fake_db), \
             patch("main.settle_unfinalized_parlays") as mock_settle:
            res = call_fn(main.init_or_sync_league, req)
            assert res["success"] is True
            mock_settle.assert_called_once()

