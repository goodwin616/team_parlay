# Automated Leg & Parlay Outcome Grading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically grade placed parlay legs and ticket outcomes from Kalshi's market resolution API during `init_or_sync_league`, and render high-contrast outcome badges (WON, LOST, IN PROGRESS, HIT, MISS, PUSH) in the Past Slips Archive.

**Architecture:** Backend grading module (`settle_locked_parlays`) called in `init_or_sync_league` querying Kalshi Trade API v2 for market results, caching final outcomes on Firestore parlay documents, and frontend rendering in `PastSlipsArchive.tsx`.

**Tech Stack:** Python 3.14 (Firebase Cloud Functions, Firestore Admin), React 18, TypeScript, Tailwind CSS, Vitest, Pytest.

## Global Constraints
- Only unfinalized locked parlays (`settlement_status != 'finalized'`) are queried from Kalshi; once marked `finalized`, they are never queried again.
- A voided/pushed leg does not destroy the ticket; it resolves at factor 1.0 (multiplier recalculation over remaining winning legs).
- If Kalshi returns an error or rate limits on any ticker, that leg remains `pending` and does not abort the league sync.
- 100% test pass rate across all Vitest suites and Pytest suites.
- Production build must succeed with zero warnings.

---

### Task 1: Backend Settlement Logic & Unit Tests (TDD)
- **Files**: `functions/settlement_engine.py`, `functions/tests/test_settlement.py`
- **Steps**:
  - [ ] Write `functions/tests/test_settlement.py` with unit tests for:
    - `grade_leg(leg, market_data)`:
      - Returns `outcome: "won"` when `market.result == leg.kalshi_side` and market is finalized.
      - Returns `outcome: "lost"` when `market.result != leg.kalshi_side`.
      - Returns `outcome: "void"` when `market.result == "void"` or `market.status == "void"`.
      - Returns `outcome: "pending"` when market is not yet finalized.
    - `grade_parlay(parlay, market_map)`:
      - Marks parlay `outcome: "lost"` if any leg is lost.
      - Marks parlay `outcome: "won"` if all legs are won (or won + void).
      - Recalculates `actual_payout` when legs are voided.
      - Marks parlay `outcome: "pending"` if legs are pending and no loss yet.
    - `settle_unfinalized_parlays(db, league_id, season, current_week, fetch_market_fn)`:
      - Skips already finalized parlays.
      - Deduplicates tickers and updates Firestore docs.
  - [ ] Implement `grade_leg`, `grade_parlay`, and `settle_unfinalized_parlays` in `functions/settlement_engine.py`.
  - [ ] Run `functions/venv/bin/pytest functions/tests/test_settlement.py` to confirm all tests pass.

### Task 2: Integrate Grading into `init_or_sync_league` in `functions/main.py`
- **Files**: `functions/main.py`
- **Steps**:
  - [ ] Import `settle_unfinalized_parlays` into `functions/main.py`.
  - [ ] Inside `init_or_sync_league`, after syncing current week and rosters, call `settle_unfinalized_parlays` using the existing Kalshi credentials and request context.
  - [ ] Run full pytest suite: `functions/venv/bin/pytest functions/tests`.

### Task 3: Update Frontend Types & `PastSlipsArchive.tsx`
- **Files**: `frontend/src/types.ts`, `frontend/src/components/PastSlipsArchive.tsx`
- **Steps**:
  - [ ] In `frontend/src/types.ts`:
    - Ensure `ParlayLeg` has `outcome?: 'won' | 'lost' | 'void' | 'pending'`.
    - Ensure `WeeklyParlay` has `outcome?: 'won' | 'lost' | 'pending'` and `settlement_status?: 'finalized' | 'pending'`.
  - [ ] In `frontend/src/components/PastSlipsArchive.tsx`:
    - Update subtitle from *"Historical records • Pure archive (no grading)"* to *"Historical records • Graded via Kalshi settlement"*.
    - Render ticket outcome badge in accordion header:
      - 🏆 `WON ($XX.XX)` (Emerald badge with trophy)
      - ❌ `LOST` (Red badge)
      - ⏳ `IN PROGRESS` (Amber badge)
    - Render individual leg outcome pills:
      - `HIT` (Emerald badge)
      - `MISS` (Red badge)
      - `PUSH` (Gray badge)
      - `PENDING` (Muted badge)

### Task 4: Expand Frontend Tests in `pastSlipsArchive.test.tsx`
- **Files**: `frontend/src/tests/pastSlipsArchive.test.tsx`
- **Steps**:
  - [ ] Add tests for graded slips:
    - Renders 🏆 `WON ($XX.XX)` badge when `outcome === 'won'`.
    - Renders ❌ `LOST` badge when `outcome === 'lost'`.
    - Renders ⏳ `IN PROGRESS` badge when `outcome === 'pending'`.
    - Renders individual leg `HIT`, `MISS`, `PUSH`, and `PENDING` chips.
  - [ ] Run `cd frontend && npx vitest run src/tests/pastSlipsArchive.test.tsx`.

### Task 5: Full Verification & Integration
- **Steps**:
  - [ ] Run `cd frontend && npx tsc --noEmit`
  - [ ] Run `cd frontend && npx vitest run` (all 16 suites pass)
  - [ ] Run `cd frontend && npm run build` (clean code-splitting, zero warnings)
  - [ ] Run `functions/venv/bin/pytest functions/tests` (all backend tests pass)
  - [ ] Commit with message `feat(CR-027): implement automated leg and ticket grading via Kalshi in init_or_sync_league`
