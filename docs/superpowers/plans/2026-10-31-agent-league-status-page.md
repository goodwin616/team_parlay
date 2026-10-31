# Read-Only League Status Page & Agent Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a privacy-safe, read-only league status page and server-rendered endpoint (`/status/:leagueId` and `/:leagueId/status`) tailored for AI agents like Instinct.ai (supporting HTML, Markdown, and JSON content negotiation plus `?week=N`) and humans alike without requiring Google Sign-In.

**Architecture:** A server-rendered Python HTTP Cloud Function (`league_status` in `functions/main.py` backed by `functions/status_page.py`) wired via Firebase Hosting rewrites in `firebase.json` reads existing Firestore state using the Admin SDK, strips all Google Auth PII, and responds with semantic HTML (with embedded JSON and Markdown), pure Markdown (`?format=md`), or pure JSON (`?format=json`). A matching read-only frontend route (`LeagueStatusPage.tsx`) handles local Vite dev / SPA navigation outside `SignInGate`.

**Tech Stack:** Python 3.14 (Firebase Cloud Functions v2 `https_fn.on_request`, Firestore Admin SDK), React 18, TypeScript, Tailwind CSS, Vitest, Pytest.

## Global Constraints

- Strictly read-only: querying `/status/:leagueId` must never trigger external Sleeper or Kalshi API syncs or write to Firestore.
- `firestore.rules` must remain unchanged (`allow read: if isAuthenticated()`).
- Strictly strip all Google Auth / user PII (`claimed_by`, `last_edited_by`, `uid`, `photo_url`, `edited_by_non_claimer`, `owner_id`, `session_tokens`, `pin_hash`) from all JSON, Markdown, and HTML outputs.
- Support `/status/:leagueId`, `/:leagueId/status`, `/league/:leagueId/status`, and `/leagues/:leagueId/status` along with `?week=<int>`, `?season=<str>`, and `?format=html|json|md`.
- 100% test pass rate across all Pytest and Vitest suites, plus clean TypeScript (`tsc --noEmit`) and production build (`npm run build`).

---

### Task 1: Backend Status Sanitizer, Formatters, and Request Parser (`functions/status_page.py`)

**Files:**
- Create: `functions/status_page.py`
- Create: `functions/tests/test_status_page.py`

**Interfaces:**
- Consumes: Firestore client (`db`) with `leagues/{leagueId}`, `leagues/{leagueId}/seasons/{season}`, `seasons/{season}/teams`, and `seasons/{season}/parlays/{week}`.
- Produces:
  - `extract_status_request_params(path: str, args: Dict[str, Any], headers: Dict[str, str]) -> Dict[str, Any]`
  - `build_sanitized_league_status(db: Any, league_id: str, requested_week: Optional[int] = None, requested_season: Optional[str] = None) -> Dict[str, Any]`
  - `render_status_markdown(payload: Dict[str, Any]) -> str`
  - `render_status_html(payload: Dict[str, Any], markdown_text: str) -> str`
  - `StatusPageError(Exception)` with `.status_code: int` and `.message: str`

- [ ] **Step 1: Write the failing backend unit tests in `functions/tests/test_status_page.py`**

```python
import json
import pytest
from unittest.mock import MagicMock
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

    def test_raises_404_when_league_or_week_not_found(self):
        db = self._mock_firestore(None, [], {})
        with pytest.raises(StatusPageError) as exc:
            build_sanitized_league_status(db, "nonexistent_league")
        assert exc.value.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `functions/venv/bin/pytest functions/tests/test_status_page.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'status_page'`

- [ ] **Step 3: Implement `functions/status_page.py`**

```python
import html
import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


class StatusPageError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


DEMO_TEAMS: List[Dict[str, Any]] = [
    {"roster_id": 1, "owner_name": "Blake", "team_name": "Philly Special"},
    {"roster_id": 2, "owner_name": "Bob", "team_name": "Gridiron Clowns"},
    {"roster_id": 3, "owner_name": "Alice", "team_name": "Motor City Kitties"},
    {"roster_id": 4, "owner_name": "Charlie", "team_name": "Buffalo Stampede"},
    {"roster_id": 5, "owner_name": "Dave", "team_name": "Lone Star Dynasty"},
]

DEMO_PARLAYS: Dict[int, Dict[str, Any]] = {
    4: {
        "week": 4,
        "season": "2026",
        "status": "open",
        "outcome": "pending",
        "settlement_status": "pending",
        "contains_sgp": False,
        "bettor": {
            "roster_id": 2,
            "team_name": "Gridiron Clowns",
            "owner_name": "Bob",
            "points_last_week": 78.4,
        },
        "earliest_kickoff": "2026-10-29T20:15:00Z",
        "legs": [
            {
                "id": "l1",
                "roster_id": 1,
                "team_name": "Philly Special",
                "owner_name": "Blake",
                "nfl_team": "PHI",
                "description": "Saquon Barkley (PHI) • Anytime TD (1+) (YES)",
                "odds_american": "-117",
                "odds_decimal": 1.8519,
                "price_cents": 54,
                "kalshi_market_ticker": "KXNFLTD-26NOV01-SAQUONBARK-1",
                "kalshi_side": "yes",
                "status": "submitted",
                "outcome": "pending",
                "kickoff_time": "2026-11-01T17:00:00Z",
            },
            {
                "id": "l2",
                "roster_id": 2,
                "team_name": "Gridiron Clowns",
                "owner_name": "Bob",
                "nfl_team": "KC",
                "description": "KC Winner (Moneyline)",
                "odds_american": "+117",
                "odds_decimal": 2.1739,
                "price_cents": 46,
                "kalshi_market_ticker": "KXNFLGAME-26OCT29-KCBAL-KC",
                "kalshi_side": "yes",
                "status": "submitted",
                "outcome": "pending",
                "kickoff_time": "2026-10-29T20:15:00Z",
            },
            {
                "id": "l3",
                "roster_id": 3,
                "team_name": "Motor City Kitties",
                "owner_name": "Alice",
                "nfl_team": "DET",
                "description": "Amon-Ra St. Brown (DET) • 75+ Rec Yards (YES)",
                "odds_american": "-110",
                "odds_decimal": 1.9091,
                "price_cents": 52,
                "kalshi_market_ticker": "KXNFLRECYDS-26NOV01-ARSB-75",
                "kalshi_side": "yes",
                "status": "submitted",
                "outcome": "pending",
                "kickoff_time": "2026-11-01T17:00:00Z",
            },
            {
                "id": "l4",
                "roster_id": 4,
                "team_name": "Buffalo Stampede",
                "owner_name": "Charlie",
                "nfl_team": "BUF",
                "description": "",
                "odds_american": "-110",
                "odds_decimal": 1.91,
                "status": "pending",
            },
            {
                "id": "l5",
                "roster_id": 5,
                "team_name": "Lone Star Dynasty",
                "owner_name": "Dave",
                "nfl_team": "DAL",
                "description": "",
                "odds_american": "-110",
                "odds_decimal": 1.91,
                "status": "pending",
            },
        ],
        "estimated_odds_american": "+669",
        "estimated_multiplier": 7.69,
        "estimated_payout": 38.45,
        "actual_payout": None,
        "actual_odds_american": None,
    }
}


def _clean_league_id(raw: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "", (raw or "").strip())


def extract_status_request_params(
    path: str,
    args: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    args = args or {}
    headers = {str(k).lower(): str(v) for k, v in (headers or {}).items()}

    segments = [s.strip() for s in (path or "").split("/") if s.strip()]
    league_id = ""

    if len(segments) >= 2 and segments[0].lower() == "status":
        league_id = _clean_league_id(segments[1])
    elif (
        len(segments) >= 3
        and segments[0].lower() in ("league", "leagues")
        and segments[2].lower() == "status"
    ):
        league_id = _clean_league_id(segments[1])
    elif len(segments) >= 2 and segments[1].lower() == "status":
        league_id = _clean_league_id(segments[0])
    elif args.get("league_id") or args.get("league"):
        league_id = _clean_league_id(str(args.get("league_id") or args.get("league")))

    if not league_id or league_id.lower() in ("status", "league", "leagues"):
        raise StatusPageError(
            400,
            "Missing league_id. Use /status/<league_id> or /<league_id>/status.",
        )

    week: Optional[int] = None
    raw_week = args.get("week")
    if raw_week is not None and str(raw_week).strip() != "":
        try:
            week = int(str(raw_week).strip())
        except (ValueError, TypeError):
            raise StatusPageError(400, "Query parameter 'week' must be a positive integer.")
        if week < 1:
            raise StatusPageError(400, "Query parameter 'week' must be >= 1.")

    season: Optional[str] = None
    raw_season = args.get("season")
    if raw_season is not None and str(raw_season).strip() != "":
        season = re.sub(r"[^0-9]", "", str(raw_season).strip()) or None

    raw_format = str(args.get("format") or "").strip().lower()
    accept = headers.get("accept", "").lower()

    if raw_format in ("json",):
        fmt = "json"
    elif raw_format in ("md", "markdown", "text", "txt"):
        fmt = "md"
    elif raw_format in ("html", ""):
        if not raw_format and "application/json" in accept and "text/html" not in accept:
            fmt = "json"
        elif not raw_format and (
            "text/markdown" in accept
            or ("text/plain" in accept and "text/html" not in accept)
        ):
            fmt = "md"
        else:
            fmt = "html"
    else:
        raise StatusPageError(
            400,
            "Invalid format. Supported values are 'html', 'json', or 'md'.",
        )

    return {
        "league_id": league_id,
        "week": week,
        "season": season,
        "format": fmt,
    }


def _sanitize_parlay_payload(
    league_id: str,
    league_name: str,
    season: str,
    current_week: int,
    updated_at: Optional[str],
    teams_data: List[Dict[str, Any]],
    parlay_data: Dict[str, Any],
) -> Dict[str, Any]:
    week = int(parlay_data.get("week") or current_week or 1)
    legs = parlay_data.get("legs") or []

    submitted_legs: List[Dict[str, Any]] = []
    submitted_roster_ids = set()
    pending_managers: List[Dict[str, Any]] = []
    seen_pending_roster_ids = set()

    for leg in legs:
        rid = leg.get("roster_id")
        leg_status = str(leg.get("status") or "pending").lower()
        owner_name = str(leg.get("owner_name") or f"Owner {rid}")
        team_name = str(leg.get("team_name") or f"Team {rid}")

        if leg_status != "pending":
            submitted_roster_ids.add(rid)
            submitted_legs.append(
                {
                    "roster_id": rid,
                    "owner_name": owner_name,
                    "team_name": team_name,
                    "nfl_team": leg.get("nfl_team") or "NFL",
                    "description": leg.get("description") or "",
                    "odds_american": leg.get("odds_american") or "",
                    "price_cents": leg.get("price_cents"),
                    "kalshi_market_ticker": leg.get("kalshi_market_ticker"),
                    "kalshi_side": leg.get("kalshi_side"),
                    "status": leg_status,
                    "outcome": leg.get("outcome")
                    or (
                        leg_status
                        if leg_status in ("won", "lost", "void", "voided", "pushed")
                        else "pending"
                    ),
                    "kickoff_time": leg.get("kickoff_time"),
                }
            )
        else:
            seen_pending_roster_ids.add(rid)
            pending_managers.append(
                {
                    "roster_id": rid,
                    "owner_name": owner_name,
                    "team_name": team_name,
                }
            )

    for t in sorted(teams_data, key=lambda x: int(x.get("roster_id") or 0)):
        rid = t.get("roster_id")
        if rid not in submitted_roster_ids and rid not in seen_pending_roster_ids:
            seen_pending_roster_ids.add(rid)
            pending_managers.append(
                {
                    "roster_id": rid,
                    "owner_name": str(t.get("owner_name") or f"Owner {rid}"),
                    "team_name": str(t.get("team_name") or f"Team {rid}"),
                }
            )

    total_managers = len(submitted_legs) + len(pending_managers)
    submitted_count = len(submitted_legs)
    pending_count = len(pending_managers)

    is_official = bool(
        parlay_data.get("actual_payout") is not None
        or parlay_data.get("actual_odds_american")
    )
    total_payout = (
        float(parlay_data["actual_payout"])
        if parlay_data.get("actual_payout") is not None
        else float(parlay_data.get("estimated_payout") or 0.0)
    )
    payout_per_player = (
        round(total_payout / submitted_count, 2) if submitted_count > 0 else 0.0
    )
    multiplier = float(
        parlay_data.get("actual_multiplier")
        or parlay_data.get("estimated_multiplier")
        or 1.0
    )
    odds_american = str(
        parlay_data.get("actual_odds_american")
        or parlay_data.get("estimated_odds_american")
        or "+100"
    )

    raw_bettor = parlay_data.get("bettor") or {}
    bettor = {
        "roster_id": raw_bettor.get("roster_id"),
        "owner_name": str(raw_bettor.get("owner_name") or ""),
        "team_name": str(raw_bettor.get("team_name") or ""),
        "points_last_week": float(raw_bettor.get("points_last_week") or 0.0),
    }

    return {
        "league_id": str(league_id),
        "league_name": str(league_name),
        "season": str(season),
        "week": week,
        "current_week": int(current_week),
        "updated_at": updated_at,
        "parlay": {
            "status": str(parlay_data.get("status") or "open"),
            "outcome": str(parlay_data.get("outcome") or "pending"),
            "settlement_status": str(
                parlay_data.get("settlement_status") or "pending"
            ),
            "contains_sgp": bool(parlay_data.get("contains_sgp", False)),
            "earliest_kickoff": parlay_data.get("earliest_kickoff"),
            "stake_dollars": 5.0,
            "quote_type": "official" if is_official else "estimate",
            "odds_american": odds_american if submitted_count > 0 else None,
            "multiplier": round(multiplier, 2) if submitted_count > 0 else None,
            "total_payout_dollars": round(total_payout, 2)
            if submitted_count > 0
            else 0.0,
            "payout_per_player_dollars": payout_per_player,
            "bettor": bettor,
            "counts": {
                "total_managers": total_managers,
                "submitted": submitted_count,
                "pending": pending_count,
            },
            "submitted_legs": submitted_legs,
            "pending_managers": pending_managers,
        },
    }


def build_sanitized_league_status(
    db: Any,
    league_id: str,
    requested_week: Optional[int] = None,
    requested_season: Optional[str] = None,
) -> Dict[str, Any]:
    is_demo = league_id.lower() == "demo"
    league_ref = db.collection("leagues").document(str(league_id))
    league_doc = league_ref.get()

    if not league_doc.exists:
        if is_demo:
            target_week = requested_week or 4
            demo_parlay = DEMO_PARLAYS.get(target_week)
            if not demo_parlay:
                raise StatusPageError(
                    404, f"Week {target_week} parlay not found for demo league."
                )
            return _sanitize_parlay_payload(
                league_id="demo",
                league_name="Demo Sleeper League",
                season=requested_season or "2026",
                current_week=4,
                updated_at="2026-10-31T00:00:00Z",
                teams_data=DEMO_TEAMS,
                parlay_data=demo_parlay,
            )
        raise StatusPageError(
            404,
            f"League '{league_id}' was not found or has not been initialized yet.",
        )

    league_meta = league_doc.to_dict() or {}
    season = str(
        requested_season
        or league_meta.get("active_season")
        or league_meta.get("season")
        or datetime.now(timezone.utc).year
    )
    current_week = int(league_meta.get("current_week") or 1)
    target_week = int(requested_week or current_week)
    league_name = str(league_meta.get("name") or f"Sleeper League {league_id}")
    updated_at = league_meta.get("updated_at")

    season_ref = league_ref.collection("seasons").document(season)
    parlay_doc = season_ref.collection("parlays").document(str(target_week)).get()

    if not parlay_doc.exists:
        if is_demo and target_week in DEMO_PARLAYS:
            return _sanitize_parlay_payload(
                league_id="demo",
                league_name=league_name,
                season=season,
                current_week=current_week,
                updated_at=updated_at,
                teams_data=DEMO_TEAMS,
                parlay_data=DEMO_PARLAYS[target_week],
            )
        raise StatusPageError(
            404,
            f"No parlay found for league '{league_id}' in season {season}, week {target_week}.",
        )

    teams_docs = season_ref.collection("teams").stream()
    teams_data = [d.to_dict() or {} for d in teams_docs]
    parlay_data = parlay_doc.to_dict() or {}

    return _sanitize_parlay_payload(
        league_id=league_id,
        league_name=league_name,
        season=season,
        current_week=current_week,
        updated_at=updated_at,
        teams_data=teams_data,
        parlay_data=parlay_data,
    )


def render_status_markdown(payload: Dict[str, Any]) -> str:
    parlay = payload["parlay"]
    counts = parlay["counts"]
    bettor = parlay["bettor"]
    submitted = parlay["submitted_legs"]
    pending = parlay["pending_managers"]

    odds_str = (
        f"{parlay['odds_american']} ({parlay['multiplier']:.2f}x, {parlay['quote_type'].title()})"
        if parlay["odds_american"] and parlay["multiplier"] is not None
        else "—"
    )
    payout_str = (
        f"${parlay['total_payout_dollars']:.2f} total (${parlay['payout_per_player_dollars']:.2f} per submitted player)"
        if counts["submitted"] > 0
        else "—"
    )
    kickoff_str = parlay["earliest_kickoff"] or "TBD (No legs submitted yet)"

    lines = [
        f"# {payload['league_name']} — Week {payload['week']} Parlay Status ({payload['season']} Season)",
        "",
        f"- **League ID**: `{payload['league_id']}`",
        f"- **Ticket Status**: {parlay['status'].upper()} (Outcome: {parlay['outcome'].upper()})",
        f"- **Weekly Bettor (${parlay['stake_dollars']:.2f} Stake)**: {bettor['owner_name']} ({bettor['team_name']}) — {bettor['points_last_week']:.2f} pts last week",
        f"- **Combo Odds**: {odds_str}",
        f"- **Payout**: {payout_str}",
        f"- **Submission Deadline (Earliest Kickoff)**: {kickoff_str}",
        f"- **Progress**: {counts['submitted']} / {counts['total_managers']} picks submitted ({counts['pending']} pending)",
        "",
        f"## Submitted Picks ({counts['submitted']})",
    ]

    if submitted:
        for idx, leg in enumerate(submitted, start=1):
            price_part = (
                f" ({leg['price_cents']}¢)"
                if leg.get("price_cents") is not None
                else ""
            )
            odds_part = f"{leg['odds_american']}{price_part}" if leg.get("odds_american") else "—"
            lines.append(
                f"{idx}. **{leg['team_name']}** ({leg['owner_name']}): {leg['description']} | Odds: {odds_part} | Status: {leg['status']} (Outcome: {leg['outcome']})"
            )
    else:
        lines.append("_No picks submitted yet._")

    lines.extend(["", f"## Waiting On / Pending Managers ({counts['pending']})"])
    if pending:
        for mgr in pending:
            lines.append(f"- **{mgr['team_name']}** ({mgr['owner_name']})")
    else:
        lines.append("_All managers have submitted their picks!_")

    return "\n".join(lines) + "\n"


def render_status_html(payload: Dict[str, Any], markdown_text: str) -> str:
    parlay = payload["parlay"]
    counts = parlay["counts"]
    bettor = parlay["bettor"]
    submitted = parlay["submitted_legs"]
    pending = parlay["pending_managers"]

    esc = lambda v: html.escape(str(v if v is not None else ""))
    json_str = json.dumps(payload, indent=2).replace("</", "<\\/")

    submitted_rows = []
    for leg in submitted:
        price_part = f" ({leg['price_cents']}¢)" if leg.get("price_cents") is not None else ""
        submitted_rows.append(
            f"<tr>"
            f"<td><strong>{esc(leg['team_name'])}</strong> ({esc(leg['owner_name'])})</td>"
            f"<td>{esc(leg['nfl_team'])}</td>"
            f"<td>{esc(leg['description'])}</td>"
            f"<td><code>{esc(leg['odds_american'])}{esc(price_part)}</code></td>"
            f"<td>{esc(leg['status'])} ({esc(leg['outcome'])})</td>"
            f"</tr>"
        )
    submitted_html = (
        "\n".join(submitted_rows)
        if submitted_rows
        else '<tr><td colspan="5">No picks submitted yet.</td></tr>'
    )

    pending_items = [
        f"<li><strong>{esc(m['team_name'])}</strong> ({esc(m['owner_name'])})</li>"
        for m in pending
    ]
    pending_html = (
        "<ul>\n" + "\n".join(pending_items) + "\n</ul>"
        if pending_items
        else "<p>All managers have submitted their picks!</p>"
    )

    odds_display = (
        f"{esc(parlay['odds_american'])} ({parlay['multiplier']:.2f}x)"
        if parlay["odds_american"] and parlay["multiplier"] is not None
        else "—"
    )
    payout_display = (
        f"${parlay['total_payout_dollars']:.2f} (${parlay['payout_per_player_dollars']:.2f}/player)"
        if counts["submitted"] > 0
        else "—"
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{esc(payload['league_name'])} — Week {payload['week']} Parlay Status</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #101622; color: #f3f4f6; margin: 0; padding: 24px 16px; line-height: 1.5; }}
    main {{ max-width: 820px; margin: 0 auto; }}
    header, section {{ background: #18202f; border: 1px solid #28344b; border-radius: 12px; padding: 20px; margin-bottom: 16px; }}
    h1 {{ margin: 0 0 8px 0; font-size: 1.4rem; color: #ffffff; }}
    h2 {{ margin: 0 0 12px 0; font-size: 1.05rem; color: #00e676; text-transform: uppercase; letter-spacing: 0.04em; }}
    .meta-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 12px; }}
    .metric {{ background: #101622; border: 1px solid #28344b; border-radius: 8px; padding: 10px 12px; }}
    .metric-label {{ font-size: 0.72rem; text-transform: uppercase; color: #9ca3af; display: block; }}
    .metric-val {{ font-size: 0.95rem; font-weight: 700; color: #ffffff; font-family: monospace; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 0.9rem; }}
    th, td {{ text-align: left; padding: 10px 8px; border-bottom: 1px solid #28344b; }}
    th {{ color: #9ca3af; font-size: 0.75rem; text-transform: uppercase; }}
    pre {{ background: #101622; border: 1px solid #28344b; border-radius: 8px; padding: 12px; overflow-x: auto; font-size: 0.82rem; color: #e5e7eb; white-space: pre-wrap; }}
    a {{ color: #00e676; text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
    .links {{ font-size: 0.82rem; color: #9ca3af; margin-top: 8px; }}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>🏈 {esc(payload['league_name'])} — Week {payload['week']} Parlay Status</h1>
      <div>Season {esc(payload['season'])} • League ID: <code>{esc(payload['league_id'])}</code> • Read-Only Agent &amp; Member View</div>
      <div class="links">
        Machine Formats:
        <a href="?week={payload['week']}&amp;format=json">JSON (?format=json)</a> •
        <a href="?week={payload['week']}&amp;format=md">Markdown (?format=md)</a> •
        <a href="/{esc(payload['league_id'])}">Open Interactive Tracker</a>
      </div>
      <div class="meta-grid">
        <div class="metric">
          <span class="metric-label">Ticket Status</span>
          <span class="metric-val">{esc(parlay['status'].upper())} ({esc(parlay['outcome'].upper())})</span>
        </div>
        <div class="metric">
          <span class="metric-label">Weekly Bettor ($5 Stake)</span>
          <span class="metric-val">{esc(bettor['owner_name'])} ({esc(bettor['team_name'])}) — {bettor['points_last_week']:.2f} pts</span>
        </div>
        <div class="metric">
          <span class="metric-label">Progress</span>
          <span class="metric-val">{counts['submitted']} / {counts['total_managers']} Submitted ({counts['pending']} Pending)</span>
        </div>
        <div class="metric">
          <span class="metric-label">Combo Odds ({esc(parlay['quote_type'])})</span>
          <span class="metric-val">{odds_display}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Payout</span>
          <span class="metric-val">{payout_display}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Submission Deadline</span>
          <span class="metric-val">{esc(parlay['earliest_kickoff'] or 'TBD')}</span>
        </div>
      </div>
    </header>

    <section aria-labelledby="submitted-heading">
      <h2 id="submitted-heading">Submitted Picks ({counts['submitted']} / {counts['total_managers']})</h2>
      <table>
        <thead>
          <tr>
            <th>Team (Manager)</th>
            <th>NFL</th>
            <th>Pick Description</th>
            <th>Odds</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {submitted_html}
        </tbody>
      </table>
    </section>

    <section aria-labelledby="pending-heading">
      <h2 id="pending-heading">Waiting On / Pending Managers ({counts['pending']})</h2>
      {pending_html}
    </section>

    <section aria-labelledby="markdown-heading">
      <h2 id="markdown-heading">Agent Summary (Markdown)</h2>
      <pre id="agent-status-markdown">{esc(markdown_text)}</pre>
    </section>
  </main>
  <script id="agent-status-json" type="application/json">{json_str}</script>
</body>
</html>
"""
```

- [ ] **Step 4: Run test to verify it passes**

Run: `functions/venv/bin/pytest functions/tests/test_status_page.py -v`
Expected: PASS (7 passed)

---

### Task 2: Expose `league_status` HTTP Cloud Function & Hosting Rewrites (`functions/main.py` & `firebase.json`)

**Files:**
- Modify: `functions/main.py`
- Modify: `firebase.json`
- Test: `functions/tests/test_status_page.py`

**Interfaces:**
- Consumes: `StatusPageError`, `extract_status_request_params`, `build_sanitized_league_status`, `render_status_markdown`, `render_status_html` from `functions/status_page.py`.
- Produces: `@https_fn.on_request() def league_status(req: https_fn.Request) -> https_fn.Response` in `functions/main.py` and rewrites in `firebase.json`.

- [ ] **Step 1: Add HTTP endpoint tests to `functions/tests/test_status_page.py`**

Append to `functions/tests/test_status_page.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `functions/venv/bin/pytest functions/tests/test_status_page.py -v`
Expected: FAIL with `AttributeError: module 'main' has no attribute 'league_status'`

- [ ] **Step 3: Implement `league_status` in `functions/main.py` and rewrites in `firebase.json`**

In `functions/main.py`, import the helpers from `status_page` at the top and add `league_status` at the bottom:

```python
from status_page import (
    StatusPageError,
    extract_status_request_params,
    build_sanitized_league_status,
    render_status_markdown,
    render_status_html,
)
```

And at the end of `functions/main.py`:

```python
@https_fn.on_request()
def league_status(req: https_fn.Request) -> https_fn.Response:
    """
    Public, read-only HTTP endpoint for AI agents (e.g. Instinct.ai) and humans
    to query the current week's (or ?week=N) parlay status for a league without
    authentication or side-effects.
    Supports HTML (default), JSON (?format=json), and Markdown (?format=md).
    """
    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept",
        "Cache-Control": "no-store, max-age=0",
    }

    if req.method == "OPTIONS":
        return https_fn.Response("", status=204, headers=cors_headers)

    if req.method not in ("GET", "HEAD"):
        return https_fn.Response(
            json.dumps({"error": "Method not allowed. Use GET."}),
            status=405,
            headers={**cors_headers, "Content-Type": "application/json; charset=utf-8"},
        )

    try:
        params = extract_status_request_params(
            path=req.path,
            args=dict(req.args) if req.args else {},
            headers=dict(req.headers) if req.headers else {},
        )
        db = get_db()
        payload = build_sanitized_league_status(
            db=db,
            league_id=params["league_id"],
            requested_week=params["week"],
            requested_season=params["season"],
        )
        fmt = params["format"]
        if fmt == "json":
            return https_fn.Response(
                json.dumps(payload, indent=2),
                status=200,
                headers={
                    **cors_headers,
                    "Content-Type": "application/json; charset=utf-8",
                },
            )
        md_text = render_status_markdown(payload)
        if fmt == "md":
            return https_fn.Response(
                md_text,
                status=200,
                headers={
                    **cors_headers,
                    "Content-Type": "text/markdown; charset=utf-8",
                },
            )
        html_text = render_status_html(payload, md_text)
        return https_fn.Response(
            html_text,
            status=200,
            headers={
                **cors_headers,
                "Content-Type": "text/html; charset=utf-8",
            },
        )
    except StatusPageError as err:
        return https_fn.Response(
            json.dumps({"error": err.message, "status": err.status_code}),
            status=err.status_code,
            headers={**cors_headers, "Content-Type": "application/json; charset=utf-8"},
        )
```

In `firebase.json`, update `hosting.rewrites`:

```json
    "rewrites": [
      {
        "source": "/status/**",
        "function": "league_status"
      },
      {
        "source": "/*/status",
        "function": "league_status"
      },
      {
        "source": "/league/*/status",
        "function": "league_status"
      },
      {
        "source": "/leagues/*/status",
        "function": "league_status"
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
```

- [ ] **Step 4: Run backend test suite to verify all tests pass**

Run: `functions/venv/bin/pytest functions/tests -v`
Expected: PASS (all existing 86 tests + 11 new status page tests pass)

---

### Task 3: Frontend Status Route Parsing (`frontend/src/services/auth.ts`)

**Files:**
- Modify: `frontend/src/services/auth.ts`
- Modify: `frontend/src/tests/auth.test.ts`

**Interfaces:**
- Produces:
  - `export interface StatusRouteParams { isStatusRoute: boolean; leagueId: string | null; week: number | null; format: 'html' | 'json' | 'md'; }`
  - `export function parseStatusRouteFromLocation(loc: { pathname: string; search: string }): StatusRouteParams`
  - Updated `getLeagueIdFromLocation(loc)` that resolves `/status/:leagueId` and `/:leagueId/status` to `:leagueId` instead of `"status"`.

- [ ] **Step 1: Add failing route parsing tests in `frontend/src/tests/auth.test.ts`**

Add tests in `frontend/src/tests/auth.test.ts`:

```typescript
    it('extracts leagueId cleanly from /status/:leagueId and /:leagueId/status paths', () => {
      expect(getLeagueIdFromLocation({ pathname: '/status/1312915483992809472', search: '' })).toBe('1312915483992809472');
      expect(getLeagueIdFromLocation({ pathname: '/1312915483992809472/status', search: '' })).toBe('1312915483992809472');
      expect(getLeagueIdFromLocation({ pathname: '/league/1312915483992809472/status', search: '' })).toBe('1312915483992809472');
      expect(getLeagueIdFromLocation({ pathname: '/status', search: '' })).toBeNull();
    });

    it('detects status routes and parses week and format query params via parseStatusRouteFromLocation', () => {
      expect(parseStatusRouteFromLocation({ pathname: '/1312915483992809472', search: '' })).toEqual({
        isStatusRoute: false,
        leagueId: '1312915483992809472',
        week: null,
        format: 'html',
      });
      expect(parseStatusRouteFromLocation({ pathname: '/status/demo', search: '?week=3&format=json' })).toEqual({
        isStatusRoute: true,
        leagueId: 'demo',
        week: 3,
        format: 'json',
      });
      expect(parseStatusRouteFromLocation({ pathname: '/1312915483992809472/status', search: '?format=md' })).toEqual({
        isStatusRoute: true,
        leagueId: '1312915483992809472',
        week: null,
        format: 'md',
      });
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/tests/auth.test.ts`
Expected: FAIL (`parseStatusRouteFromLocation` is not exported)

- [ ] **Step 3: Implement `parseStatusRouteFromLocation` and update `getLeagueIdFromLocation` in `frontend/src/services/auth.ts`**

Update `getLeagueIdFromLocation` and add `parseStatusRouteFromLocation` in `frontend/src/services/auth.ts`:

```typescript
export interface StatusRouteParams {
  isStatusRoute: boolean;
  leagueId: string | null;
  week: number | null;
  format: 'html' | 'json' | 'md';
}

/**
 * Extracts the current leagueId from window.location (supports /:leagueId, /league/:leagueId,
 * /status/:leagueId, /:leagueId/status, or ?league=...).
 */
export function getLeagueIdFromLocation(loc: { pathname: string; search: string }): string | null {
  const params = new URLSearchParams(loc.search);
  const fromQuery = params.get('league') || params.get('leagueId');
  if (fromQuery && fromQuery.trim()) {
    return parseLeagueIdInput(fromQuery);
  }

  const segments = loc.pathname
    .split('/')
    .map(s => s.trim())
    .filter(Boolean);

  if (segments.length === 0) return null;
  const first = segments[0].toLowerCase();
  if (first === 'league' || first === 'leagues' || first === 'status') {
    if (!segments[1] || segments[1].toLowerCase() === 'status') return null;
    return parseLeagueIdInput(segments[1]);
  }
  return parseLeagueIdInput(segments[0]);
}

/**
 * Detects whether the current location is the read-only agent status page
 * (/status/:leagueId, /:leagueId/status, /league/:leagueId/status) and parses query options.
 */
export function parseStatusRouteFromLocation(loc: { pathname: string; search: string }): StatusRouteParams {
  const segments = loc.pathname
    .split('/')
    .map(s => s.trim())
    .filter(Boolean);

  const first = segments[0]?.toLowerCase() || '';
  const second = segments[1]?.toLowerCase() || '';
  const third = segments[2]?.toLowerCase() || '';

  const isStatusPath =
    (first === 'status' && segments.length >= 2) ||
    (segments.length >= 2 && second === 'status' && first !== 'league' && first !== 'leagues') ||
    ((first === 'league' || first === 'leagues') && third === 'status' && segments.length >= 3);

  const leagueId = getLeagueIdFromLocation(loc);
  const params = new URLSearchParams(loc.search);

  let week: number | null = null;
  const rawWeek = params.get('week');
  if (rawWeek) {
    const parsedWeek = parseInt(rawWeek, 10);
    if (!isNaN(parsedWeek) && parsedWeek >= 1) {
      week = parsedWeek;
    }
  }

  const rawFormat = (params.get('format') || '').trim().toLowerCase();
  const format: 'html' | 'json' | 'md' =
    rawFormat === 'json'
      ? 'json'
      : rawFormat === 'md' || rawFormat === 'markdown' || rawFormat === 'text'
      ? 'md'
      : 'html';

  return {
    isStatusRoute: isStatusPath && Boolean(leagueId),
    leagueId,
    week,
    format,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/tests/auth.test.ts`
Expected: PASS

---

### Task 4: Frontend Read-Only Status Component & Integration (`LeagueStatusPage.tsx` & `App.tsx`)

**Files:**
- Create: `frontend/src/components/LeagueStatusPage.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/tests/leagueStatusPage.test.tsx`

**Interfaces:**
- Consumes: `WeeklyParlay`, `TeamProfile` from `frontend/src/types.ts`, `parseStatusRouteFromLocation` from `frontend/src/services/auth.ts`.
- Produces: `LeagueStatusPage`, `buildSanitizedStatusPayload`, `renderStatusMarkdown` in `frontend/src/components/LeagueStatusPage.tsx`, and integration in `frontend/src/App.tsx` outside `SignInGate`.

- [ ] **Step 1: Write the failing frontend component & route tests in `frontend/src/tests/leagueStatusPage.test.tsx`**

```tsx
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  LeagueStatusPage,
  buildSanitizedStatusPayload,
  renderStatusMarkdown,
} from '../components/LeagueStatusPage';
import { App } from '../App';
import { WeeklyParlay, TeamProfile } from '../types';

const SAMPLE_TEAMS: TeamProfile[] = [
  {
    roster_id: 1,
    owner_id: 'sleeper_1',
    owner_name: 'Blake',
    team_name: 'Philly Special',
    claimed_by: {
      uid: 'secret_google_uid_1',
      name: 'Blake Secret',
      photo_url: 'https://lh3.googleusercontent.com/secret',
      claimed_at: '2026-10-01T00:00:00Z',
    },
  },
  {
    roster_id: 2,
    owner_id: 'sleeper_2',
    owner_name: 'Bob',
    team_name: 'Gridiron Clowns',
  },
];

const SAMPLE_PARLAY: WeeklyParlay = {
  week: 4,
  season: '2026',
  status: 'open',
  outcome: 'pending',
  contains_sgp: false,
  bettor: {
    roster_id: 2,
    team_name: 'Gridiron Clowns',
    owner_name: 'Bob',
    points_last_week: 78.4,
  },
  earliest_kickoff: '2026-11-01T17:00:00Z',
  legs: [
    {
      id: 'l1',
      roster_id: 1,
      team_name: 'Philly Special',
      owner_name: 'Blake',
      nfl_team: 'PHI',
      description: 'Saquon Barkley (PHI) • Anytime TD (1+) (YES)',
      odds_american: '-117',
      odds_decimal: 1.8519,
      price_cents: 54,
      status: 'submitted',
      last_edited_by: {
        uid: 'secret_google_uid_1',
        name: 'Blake Secret',
      },
    },
    {
      id: 'l2',
      roster_id: 2,
      team_name: 'Gridiron Clowns',
      owner_name: 'Bob',
      nfl_team: 'NFL',
      description: '',
      odds_american: '-110',
      odds_decimal: 1.91,
      status: 'pending',
    },
  ],
  estimated_odds_american: '-117',
  estimated_multiplier: 1.85,
  estimated_payout: 9.26,
  actual_payout: null,
  actual_odds_american: null,
};

describe('LeagueStatusPage & Agent Read-Only View', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('strips all Google Auth PII and builds sanitized agent status payload', () => {
    const payload = buildSanitizedStatusPayload({
      leagueId: '12345',
      leagueName: 'Sunday Degens',
      season: '2026',
      currentWeek: 4,
      teams: SAMPLE_TEAMS,
      parlay: SAMPLE_PARLAY,
    });

    expect(payload.league_id).toBe('12345');
    expect(payload.parlay.counts).toEqual({
      total_managers: 2,
      submitted: 1,
      pending: 1,
    });
    const raw = JSON.stringify(payload);
    expect(raw).not.toContain('secret_google_uid_1');
    expect(raw).not.toContain('claimed_by');
    expect(raw).not.toContain('last_edited_by');
    expect(raw).not.toContain('sleeper_1');
  });

  it('renders submitted picks, pending managers, Markdown summary, and embedded JSON script', () => {
    const payload = buildSanitizedStatusPayload({
      leagueId: '12345',
      leagueName: 'Sunday Degens',
      season: '2026',
      currentWeek: 4,
      teams: SAMPLE_TEAMS,
      parlay: SAMPLE_PARLAY,
    });

    const { container } = render(
      <LeagueStatusPage payload={payload} initialFormat="html" />
    );

    expect(
      screen.getByRole('heading', { name: /Sunday Degens — Week 4 Parlay Status/i })
    ).toBeTruthy();
    expect(screen.getByText(/Saquon Barkley \(PHI\)/i)).toBeTruthy();
    expect(screen.getByText(/Waiting On \/ Pending Managers \(1\)/i)).toBeTruthy();

    const jsonScript = container.querySelector('#agent-status-json');
    expect(jsonScript).not.toBeNull();
    const parsed = JSON.parse(jsonScript!.textContent || '{}');
    expect(parsed.league_id).toBe('12345');

    // Toggle to JSON view
    fireEvent.click(screen.getByRole('button', { name: /JSON/i }));
    expect(screen.getByTestId('agent-status-raw-json')).toBeTruthy();
  });

  it('renders /status/demo in App without requiring Google Sign-In', () => {
    window.history.pushState({}, '', '/status/demo');
    render(<App />);

    expect(
      screen.getByRole('heading', { name: /Demo Sleeper League — Week 4 Parlay Status/i })
    ).toBeTruthy();
    expect(screen.queryByText(/Sign in with Google/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/tests/leagueStatusPage.test.tsx`
Expected: FAIL (`Cannot find module '../components/LeagueStatusPage'`)

- [ ] **Step 3: Create `frontend/src/components/LeagueStatusPage.tsx` and integrate into `frontend/src/App.tsx`**

Create `frontend/src/components/LeagueStatusPage.tsx`:

```tsx
import React, { useState } from 'react';
import { TeamProfile, WeeklyParlay } from '../types';

export interface SanitizedSubmittedLeg {
  roster_id: number;
  owner_name: string;
  team_name: string;
  nfl_team: string;
  description: string;
  odds_american: string;
  price_cents?: number;
  kalshi_market_ticker?: string;
  kalshi_side?: 'yes' | 'no';
  status: string;
  outcome: string;
  kickoff_time?: string;
}

export interface SanitizedPendingManager {
  roster_id: number;
  owner_name: string;
  team_name: string;
}

export interface SanitizedLeagueStatus {
  league_id: string;
  league_name: string;
  season: string;
  week: number;
  current_week: number;
  updated_at: string | null;
  parlay: {
    status: string;
    outcome: string;
    settlement_status: string;
    contains_sgp: boolean;
    earliest_kickoff: string | null;
    stake_dollars: number;
    quote_type: 'official' | 'estimate';
    odds_american: string | null;
    multiplier: number | null;
    total_payout_dollars: number;
    payout_per_player_dollars: number;
    bettor: {
      roster_id: number;
      owner_name: string;
      team_name: string;
      points_last_week: number;
    };
    counts: {
      total_managers: number;
      submitted: number;
      pending: number;
    };
    submitted_legs: SanitizedSubmittedLeg[];
    pending_managers: SanitizedPendingManager[];
  };
}

export function buildSanitizedStatusPayload({
  leagueId,
  leagueName,
  season,
  currentWeek,
  updatedAt = null,
  teams,
  parlay,
}: {
  leagueId: string;
  leagueName: string;
  season: string;
  currentWeek: number;
  updatedAt?: string | null;
  teams: TeamProfile[];
  parlay: WeeklyParlay;
}): SanitizedLeagueStatus {
  const submittedLegs: SanitizedSubmittedLeg[] = [];
  const submittedRosterIds = new Set<number>();
  const pendingManagers: SanitizedPendingManager[] = [];
  const seenPendingIds = new Set<number>();

  for (const leg of parlay.legs || []) {
    if (leg.status !== 'pending') {
      submittedRosterIds.add(leg.roster_id);
      submittedLegs.push({
        roster_id: leg.roster_id,
        owner_name: leg.owner_name,
        team_name: leg.team_name,
        nfl_team: leg.nfl_team || 'NFL',
        description: leg.description || '',
        odds_american: leg.odds_american || '',
        price_cents: leg.price_cents,
        kalshi_market_ticker: leg.kalshi_market_ticker,
        kalshi_side: leg.kalshi_side,
        status: leg.status,
        outcome:
          leg.outcome ||
          (leg.status === 'won' || leg.status === 'lost' || leg.status === 'voided' || leg.status === 'pushed'
            ? leg.status
            : 'pending'),
        kickoff_time: leg.kickoff_time,
      });
    } else {
      seenPendingIds.add(leg.roster_id);
      pendingManagers.push({
        roster_id: leg.roster_id,
        owner_name: leg.owner_name,
        team_name: leg.team_name,
      });
    }
  }

  for (const t of [...teams].sort((a, b) => a.roster_id - b.roster_id)) {
    if (!submittedRosterIds.has(t.roster_id) && !seenPendingIds.has(t.roster_id)) {
      seenPendingIds.add(t.roster_id);
      pendingManagers.push({
        roster_id: t.roster_id,
        owner_name: t.owner_name,
        team_name: t.team_name,
      });
    }
  }

  const submittedCount = submittedLegs.length;
  const pendingCount = pendingManagers.length;
  const totalManagers = submittedCount + pendingCount;
  const isOfficial = Boolean(parlay.actual_payout !== null || parlay.actual_odds_american);
  const totalPayout = parlay.actual_payout ?? parlay.estimated_payout ?? 0;
  const payoutPerPlayer =
    submittedCount > 0 ? Number((totalPayout / submittedCount).toFixed(2)) : 0;
  const multiplier = parlay.actual_multiplier ?? parlay.estimated_multiplier ?? 1.0;
  const oddsAmerican = parlay.actual_odds_american || parlay.estimated_odds_american || '+100';

  return {
    league_id: leagueId,
    league_name: leagueName,
    season,
    week: parlay.week || currentWeek,
    current_week: currentWeek,
    updated_at: updatedAt,
    parlay: {
      status: parlay.status || 'open',
      outcome: parlay.outcome || 'pending',
      settlement_status: parlay.settlement_status || 'pending',
      contains_sgp: Boolean(parlay.contains_sgp),
      earliest_kickoff: parlay.earliest_kickoff || null,
      stake_dollars: 5.0,
      quote_type: isOfficial ? 'official' : 'estimate',
      odds_american: submittedCount > 0 ? oddsAmerican : null,
      multiplier: submittedCount > 0 ? Number(multiplier.toFixed(2)) : null,
      total_payout_dollars: submittedCount > 0 ? Number(totalPayout.toFixed(2)) : 0,
      payout_per_player_dollars: payoutPerPlayer,
      bettor: {
        roster_id: parlay.bettor.roster_id,
        owner_name: parlay.bettor.owner_name,
        team_name: parlay.bettor.team_name,
        points_last_week: parlay.bettor.points_last_week,
      },
      counts: {
        total_managers: totalManagers,
        submitted: submittedCount,
        pending: pendingCount,
      },
      submitted_legs: submittedLegs,
      pending_managers: pendingManagers,
    },
  };
}

export function renderStatusMarkdown(payload: SanitizedLeagueStatus): string {
  const { parlay } = payload;
  const { counts, bettor, submitted_legs, pending_managers } = parlay;

  const oddsStr =
    parlay.odds_american && parlay.multiplier !== null
      ? `${parlay.odds_american} (${parlay.multiplier.toFixed(2)}x, ${parlay.quote_type === 'official' ? 'Official' : 'Estimate'})`
      : '—';
  const payoutStr =
    counts.submitted > 0
      ? `$${parlay.total_payout_dollars.toFixed(2)} total ($${parlay.payout_per_player_dollars.toFixed(2)} per submitted player)`
      : '—';
  const kickoffStr = parlay.earliest_kickoff || 'TBD (No legs submitted yet)';

  const lines: string[] = [
    `# ${payload.league_name} — Week ${payload.week} Parlay Status (${payload.season} Season)`,
    '',
    `- **League ID**: \`${payload.league_id}\``,
    `- **Ticket Status**: ${parlay.status.toUpperCase()} (Outcome: ${parlay.outcome.toUpperCase()})`,
    `- **Weekly Bettor ($${parlay.stake_dollars.toFixed(2)} Stake)**: ${bettor.owner_name} (${bettor.team_name}) — ${bettor.points_last_week.toFixed(2)} pts last week`,
    `- **Combo Odds**: ${oddsStr}`,
    `- **Payout**: ${payoutStr}`,
    `- **Submission Deadline (Earliest Kickoff)**: ${kickoffStr}`,
    `- **Progress**: ${counts.submitted} / ${counts.total_managers} picks submitted (${counts.pending} pending)`,
    '',
    `## Submitted Picks (${counts.submitted})`,
  ];

  if (submitted_legs.length > 0) {
    submitted_legs.forEach((leg, i) => {
      const pricePart = leg.price_cents != null ? ` (${leg.price_cents}¢)` : '';
      const oddsPart = leg.odds_american ? `${leg.odds_american}${pricePart}` : '—';
      lines.push(
        `${i + 1}. **${leg.team_name}** (${leg.owner_name}): ${leg.description} | Odds: ${oddsPart} | Status: ${leg.status} (Outcome: ${leg.outcome})`
      );
    });
  } else {
    lines.push('_No picks submitted yet._');
  }

  lines.push('', `## Waiting On / Pending Managers (${counts.pending})`);
  if (pending_managers.length > 0) {
    pending_managers.forEach((m) => {
      lines.push(`- **${m.team_name}** (${m.owner_name})`);
    });
  } else {
    lines.push('_All managers have submitted their picks!_');
  }

  return lines.join('\n') + '\n';
}

interface LeagueStatusPageProps {
  payload: SanitizedLeagueStatus;
  initialFormat?: 'html' | 'json' | 'md';
  onOpenInteractive?: () => void;
}

export const LeagueStatusPage: React.FC<LeagueStatusPageProps> = ({
  payload,
  initialFormat = 'html',
  onOpenInteractive,
}) => {
  const [viewFormat, setViewFormat] = useState<'html' | 'json' | 'md'>(initialFormat);
  const { parlay } = payload;
  const { counts, bettor, submitted_legs, pending_managers } = parlay;
  const markdownText = renderStatusMarkdown(payload);
  const jsonText = JSON.stringify(payload, null, 2);

  return (
    <div className="min-h-screen bg-sleeper-dark text-white p-4 sm:p-6 lg:p-8">
      <main className="max-w-3xl mx-auto space-y-5">
        <header className="rounded-2xl bg-sleeper-card border border-sleeper-border p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sleeper-accent/15 text-sleeper-accent">
                Read-Only Agent &amp; Member Status
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-white mt-2">
                🏈 {payload.league_name} — Week {payload.week} Parlay Status
              </h1>
              <p className="text-xs text-sleeper-muted mt-1">
                Season {payload.season} • League ID: <code className="text-gray-300">{payload.league_id}</code>
              </p>
            </div>

            <div className="flex items-center space-x-1.5 bg-sleeper-dark p-1 rounded-xl border border-sleeper-border">
              <button
                type="button"
                onClick={() => setViewFormat('html')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  viewFormat === 'html'
                    ? 'bg-sleeper-accent text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Summary
              </button>
              <button
                type="button"
                onClick={() => setViewFormat('md')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  viewFormat === 'md'
                    ? 'bg-sleeper-accent text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Markdown
              </button>
              <button
                type="button"
                onClick={() => setViewFormat('json')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  viewFormat === 'json'
                    ? 'bg-sleeper-accent text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                JSON
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-4">
            <div className="p-3 rounded-xl bg-sleeper-dark border border-sleeper-border/60">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">Ticket Status</span>
              <span className="text-sm font-mono font-extrabold text-white">
                {parlay.status.toUpperCase()} ({parlay.outcome.toUpperCase()})
              </span>
            </div>
            <div className="p-3 rounded-xl bg-sleeper-dark border border-sleeper-border/60">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">Weekly Bettor ($5 Stake)</span>
              <span className="text-sm font-bold text-white">
                {bettor.owner_name} ({bettor.team_name})
              </span>
            </div>
            <div className="p-3 rounded-xl bg-sleeper-dark border border-sleeper-border/60">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">Progress</span>
              <span className="text-sm font-mono font-extrabold text-sleeper-accent">
                {counts.submitted} / {counts.total_managers} Submitted
              </span>
            </div>
            <div className="p-3 rounded-xl bg-sleeper-dark border border-sleeper-border/60">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">
                Combo Odds ({parlay.quote_type})
              </span>
              <span className="text-sm font-mono font-extrabold text-white">
                {parlay.odds_american && parlay.multiplier !== null
                  ? `${parlay.odds_american} (${parlay.multiplier.toFixed(2)}x)`
                  : '—'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-sleeper-dark border border-sleeper-border/60">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">Payout</span>
              <span className="text-sm font-mono font-extrabold text-emerald-400">
                {counts.submitted > 0
                  ? `$${parlay.total_payout_dollars.toFixed(2)} ($${parlay.payout_per_player_dollars.toFixed(2)}/player)`
                  : '—'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-sleeper-dark border border-sleeper-border/60">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">Submission Deadline</span>
              <span className="text-xs font-mono font-bold text-blue-300">
                {parlay.earliest_kickoff || 'TBD'}
              </span>
            </div>
          </div>

          {onOpenInteractive && (
            <div className="mt-4 pt-3 border-t border-sleeper-border/60 flex items-center justify-between text-xs">
              <span className="text-sleeper-muted">
                Want to submit or edit a pick? Open the interactive tracker.
              </span>
              <button
                type="button"
                onClick={onOpenInteractive}
                className="text-sleeper-accent font-bold hover:underline cursor-pointer"
              >
                Open Interactive Tracker →
              </button>
            </div>
          )}
        </header>

        {viewFormat === 'json' ? (
          <section className="rounded-2xl bg-sleeper-card border border-sleeper-border p-5 shadow-xl">
            <h2 className="text-xs font-black uppercase tracking-wider text-sleeper-accent mb-3">
              Sanitized Agent JSON Payload
            </h2>
            <pre
              data-testid="agent-status-raw-json"
              className="p-4 rounded-xl bg-sleeper-dark border border-sleeper-border font-mono text-xs text-gray-200 overflow-x-auto whitespace-pre-wrap"
            >
              {jsonText}
            </pre>
          </section>
        ) : viewFormat === 'md' ? (
          <section className="rounded-2xl bg-sleeper-card border border-sleeper-border p-5 shadow-xl">
            <h2 className="text-xs font-black uppercase tracking-wider text-sleeper-accent mb-3">
              Agent Markdown Report
            </h2>
            <pre
              data-testid="agent-status-raw-md"
              className="p-4 rounded-xl bg-sleeper-dark border border-sleeper-border font-mono text-xs text-gray-200 overflow-x-auto whitespace-pre-wrap"
            >
              {markdownText}
            </pre>
          </section>
        ) : (
          <>
            <section className="rounded-2xl bg-sleeper-card border border-sleeper-border p-5 shadow-xl">
              <h2 className="text-xs font-black uppercase tracking-wider text-sleeper-accent mb-3">
                Submitted Picks ({counts.submitted} / {counts.total_managers})
              </h2>
              {submitted_legs.length === 0 ? (
                <p className="text-xs text-gray-400">No picks submitted yet.</p>
              ) : (
                <div className="divide-y divide-sleeper-border/60">
                  {submitted_legs.map((leg) => (
                    <div
                      key={leg.roster_id}
                      className="py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <span className="font-bold text-white">{leg.team_name}</span>{' '}
                        <span className="text-sleeper-muted">({leg.owner_name})</span>
                        <div className="text-gray-200 mt-0.5">{leg.description}</div>
                      </div>
                      <div className="font-mono font-bold text-sleeper-accent shrink-0">
                        {leg.odds_american}
                        {leg.price_cents != null ? ` (${leg.price_cents}¢)` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl bg-sleeper-card border border-sleeper-border p-5 shadow-xl">
              <h2 className="text-xs font-black uppercase tracking-wider text-amber-400 mb-3">
                Waiting On / Pending Managers ({counts.pending})
              </h2>
              {pending_managers.length === 0 ? (
                <p className="text-xs text-emerald-400 font-semibold">
                  All managers have submitted their picks!
                </p>
              ) : (
                <ul className="space-y-1.5 text-xs text-gray-200 list-disc list-inside">
                  {pending_managers.map((m) => (
                    <li key={m.roster_id}>
                      <span className="font-bold text-white">{m.team_name}</span> ({m.owner_name})
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl bg-sleeper-card border border-sleeper-border p-5 shadow-xl">
              <h2 className="text-xs font-black uppercase tracking-wider text-sleeper-accent mb-3">
                Agent Summary (Markdown)
              </h2>
              <pre
                id="agent-status-markdown"
                className="p-3.5 rounded-xl bg-sleeper-dark border border-sleeper-border font-mono text-xs text-gray-200 overflow-x-auto whitespace-pre-wrap"
              >
                {markdownText}
              </pre>
            </section>
          </>
        )}
      </main>
      <script
        id="agent-status-json"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: jsonText }}
      />
    </div>
  );
};
```

In `frontend/src/App.tsx`:
1. Import `parseStatusRouteFromLocation` from `./services/auth` and `LeagueStatusPage`, `buildSanitizedStatusPayload` from `./components/LeagueStatusPage`.
2. Before rendering `<SignInGate>`, check `parseStatusRouteFromLocation(window.location)`. When `statusRoute.isStatusRoute` is `true`, resolve the target week parlay (from `parlay` / `pastParlays`) and render `<LeagueStatusPage>` directly without `SignInGate`.
3. Add a `"Status Page"` link in the footer (`href={/status/${leagueId}}`) so league members can easily open or copy the agent status URL.

- [ ] **Step 4: Run frontend and backend test suites plus build verification**

Run:
1. `cd frontend && npx vitest run`
2. `cd frontend && npx tsc --noEmit`
3. `cd frontend && npm run build`
4. `functions/venv/bin/pytest functions/tests`
Expected: All Vitest and Pytest tests pass, zero TypeScript errors, clean production build.
