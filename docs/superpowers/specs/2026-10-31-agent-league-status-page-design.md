# Design: Read-Only League Status Page & Agent Endpoint for Instinct.ai

## 1. Problem Statement
Currently, all non-demo league views in Team Parlay require client-side React rendering (`<div id="root"></div>`) and Google OAuth authentication via `SignInGate`, backed by Firestore security rules (`allow read: if isAuthenticated()`).

When an external AI agent such as **Instinct.ai** queries a league URL to check the weekly parlay status (either via an HTTP web-fetch/readability parser that does not execute JavaScript, or via an unauthenticated headless browser), it cannot read the league's status.

We need a read-only, privacy-safe league status page and endpoint that caters directly to AI agents like Instinct.ai while also rendering cleanly if opened by a human in a browser.

## 2. Requirements & Desired Behavior

### 2.1 URL Routing & Content Negotiation
- **Supported Routes**:
  - `/status/:leagueId` (canonical)
  - `/:leagueId/status` (alias)
  - `/league/:leagueId/status` and `/leagues/:leagueId/status` (aliases)
- **Query Parameters**:
  - `week=<int>` (optional): Queries a specific week's parlay document (`leagues/{leagueId}/seasons/{season}/parlays/{week}`). If omitted, defaults to the league's `current_week`.
  - `season=<str>` (optional): Overrides the season year. If omitted, resolves from `active_season` or `season` on the league document.
  - `format=html|json|md` (optional):
    - **`html` (default when `Accept` prefers HTML or `*/*`)**: Returns a server-rendered, semantic HTML5 document (`Content-Type: text/html; charset=utf-8`) requiring zero JavaScript execution. Includes:
      - Semantic sections (`<main>`, `<header>`, `<section>`, `<table>`, `<ul>`) for clean DOM/Readability extraction.
      - A pre-formatted Markdown summary block (`<pre id="agent-status-markdown">`) for direct LLM copy/extraction.
      - An embedded `<script id="agent-status-json" type="application/json">` tag containing the exact sanitized JSON payload.
      - Direct links to `?format=json` and `?format=md`.
    - **`json` (`?format=json` or `Accept: application/json`)**: Returns `Content-Type: application/json; charset=utf-8` with the sanitized status JSON object.
    - **`md` / `text` (`?format=md`, `?format=text`, or `Accept: text/markdown` / `text/plain`)**: Returns `Content-Type: text/markdown; charset=utf-8` with a structured Markdown summary tailored for Instinct.ai.

### 2.2 Read-Only Data Scope & Privacy Filtering
- **Read-Only Firestore Access**:
  - Reads existing Firestore state via the Firebase Admin SDK in Python (`leagues/{leagueId}`, `leagues/{leagueId}/seasons/{season}`, `seasons/{season}/teams`, and `seasons/{season}/parlays/{week}`).
  - Does **not** trigger external Sleeper or Kalshi API syncs or mutate Firestore state.
  - Built-in support for `leagueId = "demo"` with deterministic demo status data so the endpoint can be tested without live Firestore data if needed.
  - `firestore.rules` remains completely unchanged (`allow read: if isAuthenticated()`), preventing raw client-side enumeration of Firestore documents.
- **Strict PII Stripping**:
  - Strips all Google Authentication fields (`claimed_by`, `last_edited_by`, `uid`, `photo_url`, `edited_by_non_claimer`, `owner_id`, `session_tokens`, `pin_hash`).
  - Exposes only public Sleeper fantasy metadata (`roster_id`, `owner_name`, `team_name`) and parlay leg/ticket details.

### 2.3 Sanitized JSON Schema
```json
{
  "league_id": "112482394829384923",
  "league_name": "Sunday Degens",
  "season": "2026",
  "week": 4,
  "current_week": 4,
  "updated_at": "2026-10-31T00:00:00Z",
  "parlay": {
    "status": "open",
    "outcome": "pending",
    "settlement_status": "pending",
    "contains_sgp": false,
    "earliest_kickoff": "2026-11-01T17:00:00Z",
    "stake_dollars": 5.0,
    "quote_type": "estimate",
    "odds_american": "+1450",
    "multiplier": 15.5,
    "total_payout_dollars": 77.5,
    "payout_per_player_dollars": 25.83,
    "bettor": {
      "roster_id": 2,
      "owner_name": "Bob",
      "team_name": "Gridiron Clowns",
      "points_last_week": 78.4
    },
    "counts": {
      "total_managers": 5,
      "submitted": 3,
      "pending": 2
    },
    "submitted_legs": [
      {
        "roster_id": 1,
        "owner_name": "Blake",
        "team_name": "Philly Special",
        "nfl_team": "PHI",
        "description": "Saquon Barkley (PHI) • Anytime TD (1+) (YES)",
        "odds_american": "-117",
        "price_cents": 54,
        "kalshi_market_ticker": "KXNFLTD-26NOV01-SAQUONBARK-1",
        "kalshi_side": "yes",
        "status": "submitted",
        "outcome": "pending",
        "kickoff_time": "2026-11-01T17:00:00Z"
      }
    ],
    "pending_managers": [
      {
        "roster_id": 4,
        "owner_name": "Charlie",
        "team_name": "Buffalo Stampede"
      },
      {
        "roster_id": 5,
        "owner_name": "Dave",
        "team_name": "Lone Star Dynasty"
      }
    ]
  }
}
```

### 2.4 Structured Markdown Format
The Markdown output (returned via `?format=md` and embedded in the HTML response) follows a clear, LLM-friendly layout:
```markdown
# Sunday Degens — Week 4 Parlay Status (2026 Season)

- **League ID**: `112482394829384923`
- **Ticket Status**: OPEN (Outcome: PENDING)
- **Weekly Bettor ($5.00 Stake)**: Bob (Gridiron Clowns) — 78.40 pts last week
- **Combo Odds**: +1450 (15.50x, Estimate)
- **Estimated Payout**: $77.50 total ($25.83 per submitted player)
- **Submission Deadline (Earliest Kickoff)**: 2026-11-01T17:00:00Z
- **Progress**: 3 / 5 picks submitted

## Submitted Picks (3)
1. **Philly Special** (Blake): Saquon Barkley (PHI) • Anytime TD (1+) (YES) | Odds: -117 (54¢) | Status: submitted
2. **Gridiron Clowns** (Bob): KC Winner (Moneyline) | Odds: +117 (46¢) | Status: submitted
3. **Motor City Kitties** (Alice): Amon-Ra St. Brown (DET) • 75+ Rec Yards (YES) | Odds: -110 (52¢) | Status: submitted

## Waiting On / Pending Managers (2)
- **Buffalo Stampede** (Charlie)
- **Lone Star Dynasty** (Dave)
```

### 2.5 Frontend Read-Only Route & Share Link
- **Frontend Route Support (`frontend/src/components/LeagueStatusPage.tsx` & `frontend/src/App.tsx`)**:
  - Detects `/status/:leagueId`, `/:leagueId/status`, and `/league/:leagueId/status` in `window.location.pathname`.
  - Renders `LeagueStatusPage` **outside** `SignInGate` so local Vite dev (`npm run dev`) and SPA navigation render the read-only status view without requiring Google Sign-In.
  - Supports `?week=N` and `?format=json|md` display toggles in the UI and embeds the `<script id="agent-status-json" type="application/json">` tag in the DOM.
- **Discoverability**:
  - Adds a link/button in the league footer / `SleeperChatExport` bar to view or copy the Read-Only Agent Status URL (`/status/:leagueId`).

### 2.6 Error Handling
- `400 Bad Request`: Missing `leagueId` or invalid `week` parameter (non-integer or `< 1`).
- `404 Not Found`: League document or requested `week` parlay document does not exist in Firestore.
- `405 Method Not Allowed`: Any HTTP method other than `GET` or `HEAD` (`OPTIONS` returns `204` for CORS).

## 3. Architecture & File Changes
1. **`functions/status_page.py` (new module)**:
   - Path/query parser (`extract_status_request_params`) supporting `/status/:leagueId`, `/:leagueId/status`, `/league/:leagueId/status`, `?week=`, `?season=`, `?format=`, and `Accept` header content negotiation.
   - Data builder & sanitizer (`build_sanitized_league_status`) that constructs the privacy-safe status payload from Firestore documents (or built-in demo data for `demo`).
   - Formatters: `render_status_markdown(payload)` and `render_status_html(payload, markdown_text)`.
2. **`functions/main.py`**:
   - Register `@https_fn.on_request()` endpoint `league_status(req: https_fn.Request) -> https_fn.Response`.
3. **`firebase.json`**:
   - Add Hosting rewrites before the catch-all SPA rewrite so `/status/**`, `/*/status`, `/league/*/status`, and `/leagues/*/status` route to the `league_status` Cloud Function.
4. **`frontend/src/services/auth.ts`**:
   - Add `parseStatusRouteFromLocation(loc)` helper to detect read-only status paths and extract `leagueId`, `week`, and `format`.
   - Update `getLeagueIdFromLocation(loc)` so `/:leagueId/status` and `/status/:leagueId` resolve `leagueId` cleanly instead of treating `"status"` as a league ID.
5. **`frontend/src/components/LeagueStatusPage.tsx` (new component)** & **`frontend/src/App.tsx`**:
   - Render read-only status page without `SignInGate` when visiting the status route in the SPA, and add a convenient "Status Page" link in the main league footer.

## 4. Testing & Verification Plan
- **Backend Unit & Endpoint Tests (`functions/tests/test_status_page.py`)**:
  - Path parsing across `/status/123`, `/123/status`, `/league/123/status`, `/leagues/123/status`.
  - Query parameter handling (`?week=2`, `?season=2026`, `?format=json|md|html`) and `Accept` header negotiation.
  - Strict PII sanitization verification (confirming `claimed_by`, `last_edited_by`, `uid`, `photo_url`, `owner_id` are never present in JSON, Markdown, or HTML output).
  - Read-only behavior verification (confirming Firestore is only read and no Sleeper/Kalshi sync or write calls occur).
  - HTTP status codes (`200`, `400`, `404`, `405`).
- **Frontend Unit & Component Tests (`frontend/src/tests/leagueStatusPage.test.tsx`)**:
  - Route detection for `/status/:leagueId` and `/:leagueId/status`.
  - Rendering without authentication (`SignInGate` bypassed).
  - Rendering submitted legs, pending managers, embedded JSON script block, and Markdown block.
- **Full Suite Verification**:
  - `functions/venv/bin/pytest functions/tests`
  - `cd frontend && npm test -- --run && npx tsc --noEmit && npm run build`
