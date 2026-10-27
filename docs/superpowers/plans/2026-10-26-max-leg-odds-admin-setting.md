# Max Leg Odds Admin Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a site-wide administrator setting configured via deployment environment variable (`MAX_LEG_ODDS_PERCENT`) that restricts parlay leg odds, filtering out any picks above the max probability from the UI and enforcing the limit on submission.

**Architecture:** The setting is defined once in the Cloud Functions backend environment (`MAX_LEG_ODDS_PERCENT`). It is served to the frontend via the `get_kalshi_nfl_markets` response and independently enforced during `submit_leg`. In the frontend, `PickModal` hides ineligible game line buttons and filters out player props whose `price_cents` (implied probability) exceeds the threshold.

**Tech Stack:** Python 3.14 (Firebase Cloud Functions V2, Firestore), TypeScript, React 19, Tailwind CSS, Vite, Vitest, Pytest.

## Global Constraints
- Configuration is set once in backend deployment environment (`MAX_LEG_ODDS_PERCENT`).
- If unset, empty, or invalid, defaults to no limit (100% permitted).
- Probability corresponds to Kalshi cents (1 to 99, where 55¢ = 55%).
- When active, any option with `price_cents > max_odds` is completely hidden in the UI and rejected with `FAILED_PRECONDITION` by the backend.

---

### Task 1: Backend Configuration & Enforcement

**Files:**
- Create: `functions/tests/test_max_odds.py`
- Modify: `functions/main.py:50-624`
- Modify: `functions/.env.example`

**Interfaces:**
- Produces:
  - `get_max_leg_odds_percent() -> Optional[float]` in `functions/main.py`
  - `"max_leg_odds_percent": Optional[float]` field in `get_kalshi_nfl_markets` response
  - Validation error `FAILED_PRECONDITION` in `submit_leg` when `leg["price_cents"] > max_odds`

- [ ] **Step 1: Write failing backend tests for max leg odds configuration and validation**

Create `functions/tests/test_max_odds.py`:
```python
import os
import pytest
from unittest.mock import patch, MagicMock
from firebase_functions import https_fn
from main import get_max_leg_odds_percent, submit_leg, get_kalshi_nfl_markets


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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest -q functions/tests/test_max_odds.py`
Expected: FAIL with `ImportError: cannot import name 'get_max_leg_odds_percent' from 'main'`

- [ ] **Step 3: Implement `get_max_leg_odds_percent`, update `get_kalshi_nfl_markets` and `submit_leg`**

In `functions/main.py`:
Add helper:
```python
def get_max_leg_odds_percent() -> Optional[float]:
    raw = os.environ.get("MAX_LEG_ODDS_PERCENT", "").strip()
    if not raw:
        return None
    try:
        val = float(raw)
        if 0 < val <= 100:
            return val
        return None
    except (ValueError, TypeError):
        return None
```

In `functions/main.py` inside `submit_leg`:
```python
    max_odds = get_max_leg_odds_percent()
    leg_price = leg.get("price_cents")
    if max_odds is not None and leg_price is not None:
        try:
            if float(leg_price) > max_odds:
                raise https_fn.HttpsError(
                    code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                    message=f"Leg odds ({leg_price}%) exceed the maximum allowed limit of {int(max_odds)}%",
                )
        except (ValueError, TypeError):
            pass
```

In `functions/main.py` inside `get_kalshi_nfl_markets`:
```python
    return {
        "success": True,
        "games": board.get("games", []),
        "props": board.get("props", []),
        "players": board.get("players", []),
        "live_market_count": board.get("live_market_count", 0),
        "updated_at": board.get("updated_at"),
        "cached": bool(board.get("cached", False)),
        "authenticated": kalshi_client.is_authenticated,
        "max_leg_odds_percent": get_max_leg_odds_percent(),
    }
```

In `functions/.env.example`:
```ini
# Maximum probability limit for any single parlay leg in percentage (e.g. 55 for 55% / 55c)
# If left blank or unset, no maximum limit is enforced (100% allowed).
MAX_LEG_ODDS_PERCENT=55
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/bin/pytest -q functions/tests/test_max_odds.py`
Expected: PASS (all 5 tests pass)

- [ ] **Step 5: Run full functions test suite**

Run: `./venv/bin/pytest -q functions/tests`
Expected: PASS (all 54 tests pass)

- [ ] **Step 6: Commit backend changes**

```bash
git add functions/main.py functions/.env.example functions/tests/test_max_odds.py
git commit -m "feat(backend): implement MAX_LEG_ODDS_PERCENT configuration and enforcement"
```

---

### Task 2: Frontend PickModal Max Leg Odds Filtering

**Files:**
- Create: `frontend/src/tests/pickModalMaxOdds.test.tsx`
- Modify: `frontend/src/types.ts:94-105`
- Modify: `frontend/src/components/PickModal.tsx:40-400, 1400-1650`

**Interfaces:**
- Consumes:
  - `maxLegOddsPercent?: number | null` prop in `PickModal`
- Produces:
  - Game line buttons with `price_cents > maxLegOddsPercent` hidden (rendered as empty placeholder slots)
  - Player prop contracts with `yes_cents > maxLegOddsPercent` filtered out
  - Empty state message: `"No props available under the {maxLegOddsPercent}% max odds limit."`

- [ ] **Step 1: Write failing frontend tests for PickModal max odds filtering**

Create `frontend/src/tests/pickModalMaxOdds.test.tsx`:
```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PickModal } from '../components/PickModal';
import { GameLineOption } from '../types';

describe('PickModal Max Leg Odds Filtering', () => {
  const sampleGame: GameLineOption = {
    game_id: 'GAME_1',
    home_team: 'BAL',
    away_team: 'KC',
    commence_time: '2099-10-29T20:15:00Z',
    spread_home: { point: -2.5, odds: '-113', price_cents: 53, market_ticker: 'T_SP_H' },
    spread_away: { point: 2.5, odds: '-108', price_cents: 52, market_ticker: 'T_SP_A' },
    ml_home: { odds: '-138', price_cents: 58, market_ticker: 'T_ML_H' }, // Exceeds 55
    ml_away: { odds: '+117', price_cents: 46, market_ticker: 'T_ML_A' }, // Under 55
    total_over: { point: 47.5, odds: '-113', price_cents: 53, market_ticker: 'T_TO' },
    total_under: { point: 47.5, odds: '-108', price_cents: 52, market_ticker: 'T_TU' },
  };

  const sampleProps = [
    {
      player_name: 'Saquon Barkley',
      stat_category: 'Rush Yards',
      label: '25+ Rush Yards',
      yes_cents: 88, // Exceeds 55
      no_cents: 12,
      market_ticker: 'T_P_1',
      series_ticker: 'KXNFLRSHYDS',
    },
    {
      player_name: 'Saquon Barkley',
      stat_category: 'Rush Yards',
      label: '75+ Rush Yards',
      yes_cents: 52, // Under 55
      no_cents: 48,
      market_ticker: 'T_P_2',
      series_ticker: 'KXNFLRSHYDS',
    },
  ];

  it('hides game line options whose price_cents exceed maxLegOddsPercent', () => {
    render(
      <PickModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmitPick={vi.fn()}
        rosterName="Team 1"
        activePlayers={[]}
        kalshiGames={[sampleGame]}
        maxLegOddsPercent={55}
      />
    );

    // Away ML (46c) should be visible
    expect(screen.getByText('+117')).toBeInTheDocument();
    // Home ML (58c) should be hidden
    expect(screen.queryByText('-138')).not.toBeInTheDocument();
  });

  it('filters out player props whose yes_cents exceed maxLegOddsPercent', () => {
    render(
      <PickModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmitPick={vi.fn()}
        rosterName="Team 1"
        activePlayers={[{ id: 'p1', name: 'Saquon Barkley', team: 'PHI', position: 'RB' }]}
        kalshiProps={sampleProps}
        initialPlayer={{ id: 'p1', name: 'Saquon Barkley', team: 'PHI', position: 'RB' }}
        maxLegOddsPercent={55}
      />
    );

    // 75+ Rush Yards (52c) should be visible
    expect(screen.getByText('75+ Rush Yards')).toBeInTheDocument();
    // 25+ Rush Yards (88c) should be filtered out
    expect(screen.queryByText('25+ Rush Yards')).not.toBeInTheDocument();
  });

  it('shows empty message when all props for player exceed maxLegOddsPercent', () => {
    render(
      <PickModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmitPick={vi.fn()}
        rosterName="Team 1"
        activePlayers={[{ id: 'p1', name: 'Saquon Barkley', team: 'PHI', position: 'RB' }]}
        kalshiProps={[{
          player_name: 'Saquon Barkley',
          stat_category: 'Touchdowns',
          label: 'Anytime TD',
          yes_cents: 65,
          no_cents: 35,
          market_ticker: 'T_P_TD',
          series_ticker: 'KXNFLTD',
        }]}
        initialPlayer={{ id: 'p1', name: 'Saquon Barkley', team: 'PHI', position: 'RB' }}
        maxLegOddsPercent={55}
      />
    );

    expect(
      screen.getByText(/No props available under the 55% max odds limit/i)
    ).toBeInTheDocument();
  });

  it('shows all options when maxLegOddsPercent is null or undefined', () => {
    render(
      <PickModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmitPick={vi.fn()}
        rosterName="Team 1"
        activePlayers={[]}
        kalshiGames={[sampleGame]}
        maxLegOddsPercent={null}
      />
    );

    expect(screen.getByText('+117')).toBeInTheDocument();
    expect(screen.getByText('-138')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test -- src/tests/pickModalMaxOdds.test.tsx`
Expected: FAIL (Home ML `-138` is found because no filtering exists yet)

- [ ] **Step 3: Update `PickModal.tsx` to filter game lines and player props based on `maxLegOddsPercent`**

In `frontend/src/components/PickModal.tsx`:
1. Add `maxLegOddsPercent?: number | null;` to `Props` interface.
2. In prop filtering (`filterAndMapKalshiProps`):
```tsx
  if (kalshiProps.length > 0) {
    const pNameLower = selectedPlayer.name.toLowerCase();
    let matched = kalshiProps.filter(
      (p) =>
        (p.player_name || "").toLowerCase() === pNameLower &&
        (!statCategory || p.stat_category === statCategory),
    );
    if (maxLegOddsPercent != null && maxLegOddsPercent > 0) {
      matched = matched.filter((p) => {
        const yCents = Number(p.yes_cents ?? p.yes_price_cents ?? 54);
        return yCents <= maxLegOddsPercent;
      });
    }
...
```
3. In player prop empty state render:
```tsx
{contracts.length === 0 && (
  <div className="py-8 text-center text-sm text-sleeper-muted">
    {maxLegOddsPercent != null && maxLegOddsPercent > 0
      ? `No props available under the ${maxLegOddsPercent}% max odds limit.`
      : `No props available for ${selectedCategory}.`}
  </div>
)}
```
4. In game lines grid render:
Helper function or check:
```tsx
const isExceedingMax = (cents?: number) => {
  return maxLegOddsPercent != null && maxLegOddsPercent > 0 && cents != null && cents > maxLegOddsPercent;
};
```
For each button (Spread Away/Home, Total Over/Under, ML Away/Home):
If `isExceedingMax(option.price_cents)` is true, render a placeholder `div` with the same sizing class (e.g. `min-h-[46px] rounded-lg border border-transparent bg-transparent` or subtle empty outline) instead of the clickable button.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend test -- src/tests/pickModalMaxOdds.test.tsx`
Expected: PASS (all 4 tests pass)

- [ ] **Step 5: Run existing frontend test suite to ensure no regressions**

Run: `npm --prefix frontend test -- --run`
Expected: PASS (all test files pass)

- [ ] **Step 6: Commit frontend PickModal changes**

```bash
git add frontend/src/components/PickModal.tsx frontend/src/tests/pickModalMaxOdds.test.tsx
git commit -m "feat(frontend): implement max leg odds filtering in PickModal"
```

---

### Task 3: App.tsx Market Integration & End-to-End Verification

**Files:**
- Modify: `frontend/src/App.tsx:250-1300`

**Interfaces:**
- Consumes:
  - `result.data.max_leg_odds_percent` from `get_kalshi_nfl_markets`
- Produces:
  - Passes `maxLegOddsPercent` state to `<PickModal />`

- [ ] **Step 1: Update App.tsx to store and pass `maxLegOddsPercent`**

In `frontend/src/App.tsx`:
1. Add state:
```tsx
const [maxLegOddsPercent, setMaxLegOddsPercent] = useState<number | null>(null);
```
2. In the `get_kalshi_nfl_markets` response handling:
```tsx
if (res.data?.max_leg_odds_percent !== undefined) {
  setMaxLegOddsPercent(res.data.max_leg_odds_percent);
}
```
3. Pass `maxLegOddsPercent={maxLegOddsPercent}` prop into `<PickModal ... />`.

- [ ] **Step 2: Run frontend tests and build check**

Run:
```bash
npm --prefix frontend test -- --run
npm --prefix frontend run build
```
Expected: PASS with 0 build or test errors.

- [ ] **Step 3: Run full backend pytest suite**

Run: `./venv/bin/pytest -q functions/tests`
Expected: PASS (all 54 tests pass)

- [ ] **Step 4: Commit App.tsx integration**

```bash
git add frontend/src/App.tsx
git commit -m "feat(app): connect maxLegOddsPercent from market API to PickModal"
```
