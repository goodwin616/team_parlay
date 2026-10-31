import json
import pytest
from unittest.mock import MagicMock, patch
from status_page import (
    StatusPageError,
    extract_status_request_params,
    build_sanitized_league_status,
    render_status_markdown,
    render_status_html,
)


class TestExtractStatusRequestParams:
    def test_parses_canonical_and_alias_paths(self):
        p1 = extract_status_request_params("/status/1124823948", {}, {})
        assert p1["league_id"] == "1124823948"
        assert p1["week"] is None
        assert p1["format"] == "html"

        p2 = extract_status_request_params("/1124823948/status", {}, {})
        assert p2["league_id"] == "1124823948"

        p3 = extract_status_request_params("/league/1124823948/status", {}, {})
        assert p3["league_id"] == "1124823948"

        p4 = extract_status_request_params("/leagues/demo/status/", {}, {})
        assert p4["league_id"] == "demo"

    def test_parses_week_season_and_format_query_params(self):
        params = extract_status_request_params(
            "/status/1124823948",
            {"week": "3", "season": "2026", "format": "json"},
            {},
        )
        assert params["league_id"] == "1124823948"
        assert params["week"] == 3
        assert params["season"] == "2026"
        assert params["format"] == "json"

    def test_negotiates_format_from_accept_header(self):
        p_json = extract_status_request_params(
            "/status/1124823948", {}, {"Accept": "application/json"}
        )
        assert p_json["format"] == "json"

        p_md = extract_status_request_params(
            "/status/1124823948", {}, {"Accept": "text/markdown, text/plain;q=0.9"}
        )
        assert p_md["format"] == "md"

    def test_raises_400_on_missing_league_or_invalid_week(self):
        with pytest.raises(StatusPageError) as exc1:
            extract_status_request_params("/status/", {}, {})
        assert exc1.value.status_code == 400

        with pytest.raises(StatusPageError) as exc2:
            extract_status_request_params("/status/123", {"week": "abc"}, {})
        assert exc2.value.status_code == 400

        with pytest.raises(StatusPageError) as exc3:
            extract_status_request_params("/status/123", {"week": "0"}, {})
        assert exc3.value.status_code == 400


class TestBuildSanitizedLeagueStatus:
    def _mock_firestore(self, league_data, teams_list, parlays_by_week):
        db = MagicMock()
        league_ref = MagicMock()
        league_doc = MagicMock()
        league_doc.exists = league_data is not None
        league_doc.to_dict.return_value = league_data or {}
        league_ref.get.return_value = league_doc

        season_ref = MagicMock()
        teams_col = MagicMock()
        team_docs = []
        for t in teams_list:
            td = MagicMock()
            td.to_dict.return_value = t
            team_docs.append(td)
        teams_col.stream.return_value = team_docs

        parlays_col = MagicMock()

        def get_parlay_doc(week_str):
            p_ref = MagicMock()
            p_doc = MagicMock()
            p_data = parlays_by_week.get(str(week_str))
            p_doc.exists = p_data is not None
            p_doc.to_dict.return_value = p_data or {}
            p_ref.get.return_value = p_doc
            return p_ref

        parlays_col.document.side_effect = get_parlay_doc

        def get_subcol(name):
            if name == "teams":
                return teams_col
            if name == "parlays":
                return parlays_col
            return MagicMock()

        season_ref.collection.side_effect = get_subcol
        seasons_col = MagicMock()
        seasons_col.document.return_value = season_ref
        league_ref.collection.return_value = seasons_col

        leagues_col = MagicMock()
        leagues_col.document.return_value = league_ref
        db.collection.return_value = leagues_col
        return db

    def test_builds_sanitized_payload_and_strips_all_pii(self):
        league_data = {
            "sleeper_league_id": "999",
            "name": "Sunday Degens",
            "active_season": "2026",
            "current_week": 4,
            "updated_at": "2026-10-31T00:00:00Z",
        }
        teams_list = [
            {
                "roster_id": 1,
                "owner_id": "sleeper_u1",
                "owner_name": "Blake",
                "team_name": "Philly Special",
                "claimed_by": {
                    "uid": "google_secret_uid_1",
                    "name": "Blake G",
                    "photo_url": "https://lh3.googleusercontent.com/secret1",
                },
            },
            {
                "roster_id": 2,
                "owner_id": "sleeper_u2",
                "owner_name": "Bob",
                "team_name": "Gridiron Clowns",
                "claimed_by": {
                    "uid": "google_secret_uid_2",
                    "name": "Bob S",
                    "photo_url": "https://lh3.googleusercontent.com/secret2",
                },
            },
        ]
        parlay_week_4 = {
            "week": 4,
            "season": "2026",
            "status": "open",
            "outcome": "pending",
            "settlement_status": "pending",
            "contains_sgp": False,
            "earliest_kickoff": "2026-11-01T17:00:00Z",
            "estimated_odds_american": "+150",
            "estimated_multiplier": 2.5,
            "estimated_payout": 12.5,
            "actual_payout": None,
            "actual_odds_american": None,
            "bettor": {
                "roster_id": 2,
                "owner_name": "Bob",
                "team_name": "Gridiron Clowns",
                "points_last_week": 78.4,
            },
            "legs": [
                {
                    "id": "l_1",
                    "roster_id": 1,
                    "owner_name": "Blake",
                    "team_name": "Philly Special",
                    "nfl_team": "PHI",
                    "description": "Saquon Barkley (PHI) • Anytime TD (1+) (YES)",
                    "odds_american": "-117",
                    "price_cents": 54,
                    "kalshi_market_ticker": "KXNFLTD-1",
                    "kalshi_side": "yes",
                    "status": "submitted",
                    "outcome": "pending",
                    "kickoff_time": "2026-11-01T17:00:00Z",
                    "last_edited_by": {
                        "uid": "google_secret_uid_1",
                        "name": "Blake G",
                        "photo_url": "https://lh3.googleusercontent.com/secret1",
                    },
                    "edited_by_non_claimer": False,
                },
                {
                    "id": "l_2",
                    "roster_id": 2,
                    "owner_name": "Bob",
                    "team_name": "Gridiron Clowns",
                    "nfl_team": "NFL",
                    "description": "",
                    "odds_american": "-110",
                    "status": "pending",
                },
            ],
        }

        db = self._mock_firestore(league_data, teams_list, {"4": parlay_week_4})
        payload = build_sanitized_league_status(db, "999")

        assert payload["league_id"] == "999"
        assert payload["league_name"] == "Sunday Degens"
        assert payload["week"] == 4
        assert payload["parlay"]["counts"] == {
            "total_managers": 2,
            "submitted": 1,
            "pending": 1,
        }
        assert len(payload["parlay"]["submitted_legs"]) == 1
        assert payload["parlay"]["submitted_legs"][0]["owner_name"] == "Blake"
        assert len(payload["parlay"]["pending_managers"]) == 1
        assert payload["parlay"]["pending_managers"][0]["owner_name"] == "Bob"

        # Verify zero PII leakage in serialized JSON, Markdown, and HTML
        raw_json = json.dumps(payload)
        md = render_status_markdown(payload)
        html = render_status_html(payload, md)
        for text in (raw_json, md, html):
            assert "google_secret_uid_1" not in text
            assert "google_secret_uid_2" not in text
            assert "googleusercontent" not in text
            assert "claimed_by" not in text
            assert "last_edited_by" not in text
            assert "sleeper_u1" not in text

    def test_supports_demo_league_without_firestore_docs(self):
        db = self._mock_firestore(None, [], {})
        payload = build_sanitized_league_status(db, "demo", requested_week=4)
        assert payload["league_id"] == "demo"
        assert payload["week"] == 4
        assert payload["parlay"]["counts"]["total_managers"] == 5

    @patch("sleeper_sync.fetch_sleeper_league_info", side_effect=ValueError("Sleeper league not found"))
    def test_raises_404_when_league_or_week_not_found(self, _mock_sleeper):
        db = self._mock_firestore(None, [], {})
        with pytest.raises(StatusPageError) as exc:
            build_sanitized_league_status(db, "nonexistent_league")
        assert exc.value.status_code == 404


from unittest.mock import patch
import main


class TestLeagueStatusEndpoint:
    def _make_req(self, method="GET", path="/status/demo", args=None, headers=None):
        req = MagicMock()
        req.method = method
        req.path = path
        req.args = args or {}
        req.headers = headers or {}
        return req

    @patch("main.get_db")
    def test_league_status_returns_html_by_default(self, mock_get_db):
        db = MagicMock()
        league_doc = MagicMock()
        league_doc.exists = False
        db.collection.return_value.document.return_value.get.return_value = league_doc
        mock_get_db.return_value = db

        req = self._make_req(path="/status/demo")
        resp = main.league_status(req)
        assert resp.status_code == 200
        assert "text/html" in resp.headers.get("Content-Type", "")
        body = resp.get_data(as_text=True)
        assert "Demo Sleeper League" in body
        assert 'id="agent-status-json"' in body

    @patch("main.get_db")
    def test_league_status_returns_json_when_requested(self, mock_get_db):
        db = MagicMock()
        league_doc = MagicMock()
        league_doc.exists = False
        db.collection.return_value.document.return_value.get.return_value = league_doc
        mock_get_db.return_value = db

        req = self._make_req(path="/status/demo", args={"format": "json"})
        resp = main.league_status(req)
        assert resp.status_code == 200
        assert "application/json" in resp.headers.get("Content-Type", "")
        data = json.loads(resp.get_data(as_text=True))
        assert data["league_id"] == "demo"
        assert data["parlay"]["counts"]["submitted"] == 3

    @patch("main.get_db")
    def test_league_status_returns_markdown_when_requested(self, mock_get_db):
        db = MagicMock()
        league_doc = MagicMock()
        league_doc.exists = False
        db.collection.return_value.document.return_value.get.return_value = league_doc
        mock_get_db.return_value = db

        req = self._make_req(path="/demo/status", args={"format": "md"})
        resp = main.league_status(req)
        assert resp.status_code == 200
        assert "text/markdown" in resp.headers.get("Content-Type", "")
        text = resp.get_data(as_text=True)
        assert "# Demo Sleeper League — Week 4 Parlay Status" in text

    def test_league_status_rejects_post_with_405(self):
        req = self._make_req(method="POST", path="/status/demo")
        resp = main.league_status(req)
        assert resp.status_code == 405

