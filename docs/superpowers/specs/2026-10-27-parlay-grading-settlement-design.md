# Design: Automated Leg & Parlay Outcome Grading via Kalshi (CR-027)

## 1. Problem Statement
Currently, `PastSlipsArchive.tsx` displays historical parlay slips as a static list with the note *"Historical records • Pure archive (no grading)"*. 
Users have no automated way of knowing which legs hit, which legs missed, or whether the overall weekly parlay won or lost.

## 2. Requirements & Desired Behavior

### 2.1 Backend Grading in `init_or_sync_league` (`functions/main.py` & `functions/odds_engine.py`)
- Automatically execute grading as part of the existing `init_or_sync_league` Cloud Function.
- Identify all locked parlays for the season in `leagues/{league_id}/seasons/{season}/parlays/{week}` where:
  - `week < current_week` OR `status == 'locked'`
  - `settlement_status != 'finalized'`
- For each unfinalized locked parlay:
  - Collect unique `kalshi_market_ticker` strings across all submitted legs.
  - Query Kalshi API `GET /trade-api/v2/markets/{ticker}` (using Kalshi API credentials from Secret Manager).
  - Grade each leg:
    - If `market.status in ('finalized', 'settled')`:
      - If `market.result == leg.kalshi_side`: `outcome = 'won'`
      - Else if `market.result == 'void'` or `market.status == 'void'`: `outcome = 'void'`
      - Else: `outcome = 'lost'`
    - Else:
      - `outcome = 'pending'`
  - Compute ticket-level outcome:
    - If any submitted leg is `'lost'`: `ticket_outcome = 'lost'`, `settlement_status = 'finalized'`
    - Else if any submitted leg is `'pending'`: `ticket_outcome = 'pending'`, `settlement_status = 'pending'`
    - Else if all submitted legs are `'won'` or `'void'`: `ticket_outcome = 'won'`, `settlement_status = 'finalized'`
      - Recalculate `actual_payout` if any leg voided using product of winning leg multipliers * $5 stake.
  - Update Firestore parlay document in batch with:
    - `settlement_status`: `'finalized' | 'pending'`
    - `outcome`: `'won' | 'lost' | 'pending'`
    - `legs`: updated array with `outcome` on each leg.

### 2.2 Rate-Limiting & Performance Protection
- **Idempotency**: Once `settlement_status == 'finalized'`, that week's parlay is never queried from Kalshi again.
- **Deduplication**: Unique tickers are queried once even if referenced multiple times.
- **Fail-safe**: If Kalshi API returns 429, 500, or a ticker is not found, those legs remain `'pending'` and the function does not crash the overall league sync.

### 2.3 Frontend Archive Display (`PastSlipsArchive.tsx`)
- **Header & Summary**:
  - Replace *"Pure archive (no grading)"* with live grading summary.
  - Show status badge on each week's header:
    - 🏆 `WON ($XX.XX)` in emerald (`bg-emerald-500/20 text-emerald-400 border-emerald-500/40`)
    - ❌ `LOST` in red (`bg-red-500/20 text-red-400 border-red-500/40`)
    - ⏳ `IN PROGRESS` in amber (`bg-amber-500/20 text-amber-400 border-amber-500/40`)
- **Leg Details**:
  - Each leg card renders its outcome badge:
    - `HIT` (Emerald badge with checkmark)
    - `MISS` (Red badge with X)
    - `PUSH` (Gray badge)
    - `PENDING` (Muted clock icon)

## 3. Architecture & Data Model Updates
- **`ParlayLeg`** in `types.ts` & Python:
  - `outcome?: 'won' | 'lost' | 'void' | 'pending'`
  - `settled_at?: string`
- **`WeeklyParlay`** in `types.ts` & Python:
  - `outcome?: 'won' | 'lost' | 'pending'`
  - `settlement_status?: 'finalized' | 'pending'`
  - `settled_at?: string`

## 4. Testing & Verification Plan
- **Backend Tests** (`functions/tests/test_settlement.py`):
  - Test grading winning parlay where all legs match Kalshi results.
  - Test grading losing parlay when 1 leg misses.
  - Test grading parlay with a voided/pushed leg (reduced payout calculation).
  - Test skipping already finalized parlays.
  - Test error resilience when Kalshi API returns error for a ticker.
- **Frontend Tests** (`frontend/src/tests/pastSlipsArchive.test.tsx`):
  - Test rendering `WON`, `LOST`, `IN PROGRESS` badges on week cards.
  - Test rendering `HIT`, `MISS`, `PUSH` badges on individual leg rows.
- Full verification: `vitest run`, `pytest functions/tests`, and `npm run build`.
