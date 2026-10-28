# Design: Empty Parlay Metrics & Inactive Export State (CR-023)

## 1. Problem Statement
When a weekly parlay ticket has no submitted legs (`submittedCount === 0`):
- The 4-metric stats bar in `ParlayCard.tsx` currently displays:
  - **Est. Combo Odds**: `+100`
  - **Est. Multiplier**: `1.00x`
  - **Est. Total Payout**: `$5.00`
  - **Est. Payout / Player**: `$0.00`
- This confuses users because an empty parlay appears as if an active even-money bet paying $5.00 is already in place, despite zero picks made.
- The independent leg math disclaimer footnote (`* Estimated via independent leg math...`) renders even when no legs are present.
- In `SleeperChatExport.tsx`, the "Copy Slip for Sleeper Chat" button remains clickable and active when 0 legs are submitted, allowing users to copy an empty parlay slip.

## 2. Requirements & Desired Behavior
1. **Empty Parlay 4-Metric Stats Bar** in `ParlayCard.tsx`:
   - When `submittedCount === 0` (and `!isOfficialQuote`):
     - **Est. Combo Odds**: Render `—` with muted styling (`text-gray-500 font-mono font-bold`).
     - **Est. Multiplier**: Render `—` with muted styling (`text-gray-500 font-mono font-bold`).
     - **Est. Total Payout**: Render `—` with muted styling (`text-gray-500 font-mono font-bold`).
     - **Est. Payout / Player**: Render `—` with muted styling (`text-gray-500 font-mono font-bold`).
     - Hide the estimate disclaimer footnote (`* Estimated via independent leg math...`).
   - When `submittedCount > 0`:
     - Maintain active colored styling (`text-white`, `text-sleeper-accent`, `text-emerald-400`) with calculated values.
     - Show the estimate disclaimer footnote if `showEstimateInfo && !isOfficialQuote`.
   - Grid layout and responsive spacing must remain identical so there is zero layout shift when transitioning between 0 and 1 pick.

2. **Inactive Sleeper Chat Export Button** in `SleeperChatExport.tsx`:
   - Compute `const submittedCount = parlay.legs.filter(l => l.status === 'submitted').length;`
   - When `submittedCount === 0`:
     - `disabled={true}`
     - Button styling: disabled styles `opacity-40 cursor-not-allowed bg-sleeper-card border border-sleeper-border text-gray-500 pointer-events-none`
     - Title tooltip: `"No submitted picks to export yet"`
   - When `submittedCount > 0`:
     - Interactive and styled with existing active styles (`text-sleeper-accent border-sleeper-accent/40 hover:bg-sleeper-accent/15`).

3. **Fallback in Export Text Generator**:
   - In `generateSleeperText`, if ever called with 0 legs:
     - Render `Est. Odds: — (—) | Est. Payout: —` instead of `$5.00 ($0.00/player)`.

## 3. Architecture & Touchpoints
- `frontend/src/components/ParlayCard.tsx`: Stats bar rendering conditions and footnote suppression.
- `frontend/src/components/SleeperChatExport.tsx`: Button disabled state and empty text formatting.
- `frontend/src/tests/emptyParlayMetricsCR023.test.tsx`: Comprehensive test suite verifying:
  - 0 submitted legs displays `—` for all 4 metrics with muted `text-gray-500` classes.
  - Footnote is suppressed when `submittedCount === 0`.
  - Export button is disabled with `cursor-not-allowed` and `disabled=""` attribute when `submittedCount === 0`.
  - Submitting 1+ leg re-enables active metrics and export button.

## 4. Verification Plan
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npx vitest run` (all tests passing)
- `cd frontend && npm run build` (production build succeeds with clean code-splitting)
- `functions/venv/bin/pytest functions/tests` (backend tests passing)
