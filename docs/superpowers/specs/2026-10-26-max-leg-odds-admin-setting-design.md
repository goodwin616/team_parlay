# Max Leg Odds Admin Setting Design

## 1. Overview
This feature introduces a site-wide administrator setting configured at deploy time that enforces a maximum probability limit (max odds) on parlay legs (e.g., maximum 55% odds / 55¢ Kalshi contract price). 

Heavy favorites exceeding this threshold are completely hidden from the selection UI (`PickModal`) and rejected by the backend API (`submit_leg`) if a submission is attempted.

## 2. Goals & Non-Goals
### Goals
- **Single Source of Truth**: Configure the limit once in the deployment environment (`MAX_LEG_ODDS_PERCENT`).
- **Seamless UI Filtering**: Hide any game line selections or player prop contracts that exceed the maximum odds threshold in `PickModal`.
- **Server-Side Enforcement**: Validate `price_cents` on pick submission to prevent bypassing the rule.
- **Default Open Policy**: If `MAX_LEG_ODDS_PERCENT` is omitted or empty, default to no limit (100% permitted).

### Non-Goals
- Per-league runtime customization by end users (this is a site-wide deployment rule set by the administrator).
- Minimum odds restrictions (this feature strictly governs the maximum allowable probability/odds).

## 3. Architecture & Data Flow

```
+-------------------------------------------------------+
|  functions/.env (or Cloud Functions Deployment Env)   |
|  MAX_LEG_ODDS_PERCENT=55                              |
+-------------------------------------------------------+
                           |
                           v
+-------------------------------------------------------+
|  Firebase Cloud Functions (main.py)                   |
|  - get_max_leg_odds_percent() -> Optional[float]      |
+-------------------------------------------------------+
        |                                       |
        | returns in payload                    | enforces validation
        v                                       v
+----------------------------------+   +----------------------------------+
|  get_kalshi_nfl_markets          |   |  submit_leg                      |
|  { ..., max_leg_odds_percent: 55}|   |  Reject if price_cents > max     |
+----------------------------------+   +----------------------------------+
        |
        v
+-------------------------------------------------------+
|  Frontend UI (App.tsx -> PickModal.tsx)               |
|  - Filters out player props where yes_cents > 55      |
|  - Hides game line buttons where price_cents > 55     |
+-------------------------------------------------------+
```

## 4. Detailed Component Design

### 4.1 Backend (`functions/main.py` & `functions/.env.example`)
1. **Environment Configuration**:
   - `MAX_LEG_ODDS_PERCENT`: String representation of a float or integer (e.g., `55`).
   - Add documentation and example to `functions/.env.example`.
2. **Helper `get_max_leg_odds_percent() -> Optional[float]`**:
   - Reads `os.environ.get("MAX_LEG_ODDS_PERCENT")`.
   - If present, attempts conversion to `float`.
   - If `0 < val <= 100`, returns the value; otherwise returns `None`.
3. **`get_kalshi_nfl_markets`**:
   - Includes `"max_leg_odds_percent": get_max_leg_odds_percent()` in its returned JSON object.
4. **`submit_leg`**:
   - Retrieves `max_odds = get_max_leg_odds_percent()`.
   - If `max_odds` is not `None`:
     - Extracts `leg.get("price_cents")`.
     - If `price_cents` exists and `float(price_cents) > max_odds`:
       - Raises `https_fn.HttpsError(code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION, message=f"Leg odds ({price_cents}%) exceed the maximum allowed limit of {int(max_odds)}%")`.

### 4.2 Frontend (`frontend/src/`)
1. **Types (`frontend/src/types.ts`)**:
   - Update market API response type or `PickModal` props to accept `maxLegOddsPercent?: number | null`.
2. **`PickModal.tsx`**:
   - Accepts prop `maxLegOddsPercent?: number | null`.
   - **Game Lines**:
     - When rendering spread, total, and moneyline buttons:
       - If `maxLegOddsPercent` is set and `option.price_cents > maxLegOddsPercent`, do not render the button (render an empty placeholder slot with identical height/grid dimensions so layout remains aligned).
   - **Player Props**:
     - In `filterAndMapKalshiProps` / prop contract mapping:
       - Filter out any contract where `m.yes_cents > maxLegOddsPercent`.
       - If no contracts remain for a selected player, display: `"No props available under the {maxLegOddsPercent}% max odds limit."`
3. **`App.tsx`**:
   - Stores `maxLegOddsPercent` received from `get_kalshi_nfl_markets` response state.
   - Passes `maxLegOddsPercent` into `<PickModal />`.

## 5. Error Handling & Edge Cases
- **Unset / Invalid Environment Variable**:
  - If `MAX_LEG_ODDS_PERCENT` is missing or not a valid number, `get_max_leg_odds_percent()` returns `None`. No filter is applied; all legal picks are visible and allowed.
- **Opposing Sides on Game Lines**:
  - Because Kalshi binary market odds sum close to 100¢, a 55% cutoff will hide heavy favorites while keeping the corresponding underdogs or balanced spreads visible.
- **Race Condition / Stale Client Pick**:
  - If a user opens the modal before the limit is updated or attempts an API call directly with a favorite exceeding the limit, `submit_leg` blocks it with `FAILED_PRECONDITION`.

## 6. Verification & Testing
1. **Backend Unit Tests (`functions/tests/test_max_odds.py`)**:
   - Test `get_max_leg_odds_percent` parsing (valid, invalid, empty).
   - Test `get_kalshi_nfl_markets` includes `max_leg_odds_percent`.
   - Test `submit_leg` accepts picks with `price_cents <= max_odds`.
   - Test `submit_leg` rejects picks with `price_cents > max_odds`.
   - Test `submit_leg` allows all picks when `MAX_LEG_ODDS_PERCENT` is unset.
2. **Frontend Unit Tests (`frontend/src/tests/PickModalMaxOdds.test.tsx`)**:
   - Verify game line buttons with `price_cents > maxLegOddsPercent` are hidden.
   - Verify player prop contracts with `yes_cents > maxLegOddsPercent` are filtered out.
   - Verify empty state message displays if all props for a player exceed the limit.
   - Verify all options are visible when `maxLegOddsPercent` is undefined or null.
