# Empty Parlay Metrics & Inactive Export State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide intuitive placeholder states (`—`) in the 4-metric stats bar and disable the Sleeper chat export button when no parlay legs are submitted.

**Architecture:** Conditional UI rendering in `ParlayCard.tsx` based on `submittedCount > 0`, disabled state and tooltip in `SleeperChatExport.tsx` when `submittedLegs.length === 0`, and unit test coverage in `emptyParlayMetricsCR023.test.tsx`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Vitest.

## Global Constraints
- Do not introduce layout shift when toggling between 0 and 1 pick; grid structure and heights must remain identical.
- Preserve official quote behavior if `isOfficialQuote` is set.
- All existing Vitest suites and Pytest suites must pass with 100% success.
- Vite build must succeed without chunk warnings.

---

### Task 1: Add Unit Tests for Empty Parlay State (TDD)
- **Files**: `frontend/src/tests/emptyParlayMetricsCR023.test.tsx`
- **Steps**:
  - [ ] Write unit test verifying that when `submittedCount === 0`:
    - All 4 metric values display `—` with `text-gray-500 font-mono font-bold`.
    - Footnote disclaimer `* Estimated via independent leg math` is NOT rendered in the DOM.
    - Sleeper export button is `disabled`, has class `cursor-not-allowed`, and title `"No submitted picks to export yet"`.
  - [ ] Write unit test verifying that when `submittedCount > 0`:
    - Metrics render active numerical values (`+100` or higher, multiplier `1.00x` or higher, payouts `$5.00` or higher) with standard color classes (`text-white`, `text-sleeper-accent`, `text-emerald-400`).
    - Footnote disclaimer is visible when `showEstimateInfo` is true.
    - Sleeper export button is enabled and clickable.
  - [ ] Run test suite with `npx vitest run src/tests/emptyParlayMetricsCR023.test.tsx` to confirm failures (red phase).

### Task 2: Implement Empty Metrics State in `ParlayCard.tsx`
- **Files**: `frontend/src/components/ParlayCard.tsx`
- **Steps**:
  - [ ] In `ParlayCard.tsx`, define `const hasSubmittedLegs = submittedCount > 0 || isOfficialQuote;`
  - [ ] Update the 4-metric stats bar to conditionally render:
    - Combo Odds: `hasSubmittedLegs ? formatComboOdds(...) : '—'` with conditional color class: `hasSubmittedLegs ? 'text-white' : 'text-gray-500'`
    - Multiplier: `hasSubmittedLegs ? `${parlay.estimated_multiplier.toFixed(2)}x` : '—'` with `hasSubmittedLegs ? 'text-white' : 'text-gray-500'`
    - Total Payout: `hasSubmittedLegs ? `$${totalPayout.toFixed(2)}` : '—'` with `hasSubmittedLegs ? 'text-sleeper-accent' : 'text-gray-500'`
    - Payout / Player: `hasSubmittedLegs ? `$${payoutPerPlayer.toFixed(2)}` : '—'` with `hasSubmittedLegs ? 'text-emerald-400' : 'text-gray-500'`
  - [ ] Update estimate info footnote condition to require `hasSubmittedLegs`:
    `{!isOfficialQuote && hasSubmittedLegs && showEstimateInfo && (...) }`

### Task 3: Implement Inactive Export Button in `SleeperChatExport.tsx`
- **Files**: `frontend/src/components/SleeperChatExport.tsx`
- **Steps**:
  - [ ] In `SleeperChatExport.tsx`, compute `const submittedCount = parlay.legs.filter(l => l.status === 'submitted').length;`
  - [ ] Add `disabled={submittedCount === 0}` and `title={submittedCount === 0 ? "No submitted picks to export yet" : undefined}`
  - [ ] When `submittedCount === 0`, apply styling:
    `opacity-40 cursor-not-allowed bg-sleeper-card border border-sleeper-border text-gray-500 pointer-events-none`
  - [ ] When `submittedCount === 0` in `generateSleeperText`, format fallback line:
    `Est. Odds: — | Est. Payout: —`

### Task 4: Full Verification & Integration
- **Steps**:
  - [ ] Run `cd frontend && npx tsc --noEmit`
  - [ ] Run `cd frontend && npx vitest run` (100% passing across all 12 test suites)
  - [ ] Run `cd frontend && npm run build` (clean code-splitting, zero warnings)
  - [ ] Run `functions/venv/bin/pytest functions/tests` (67/67 passing)
  - [ ] Commit changes with message `feat(CR-023): improve empty parlay state with placeholder metrics and inactive export button`
