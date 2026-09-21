# NFL Fantasy Team Parlay Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight, mobile-first web app for an NFL fantasy football league on Sleeper to manage their weekly \$5 team parlay.

**Architecture:** A serverless stack featuring Python Firebase Cloud Functions (v2) for business logic, Sleeper API sync, and odds quota caching; Cloud Firestore for persistence; and a responsive React (Vite) + Tailwind CSS client hosted on Firebase Hosting.

**Tech Stack:** Python 3.11, `firebase_functions`, `google-cloud-firestore`, React 18, Vite, Tailwind CSS, Lucide React, Pytest.

## Global Constraints

- **Security:** Frontend must never store raw PINs in `localStorage`; store only `SHA-256(raw_pin + league_salt)`.
- **API Quota:** Client requests must never query The Odds API directly; read strictly from `odds_cache/nfl` in Firestore.
- **Sleeper Access:** Sleeper league must be public for read-only REST access.
- **Deterministic Tie-Breaker:** Hierarchy: 1) Weekly Pts $\to$ 2) Season PF $\to$ 3) Season Max PF $\to$ 4) Alphabetical.
- **Betting Mechanics:** Individual legs lock at kickoff (partial locking). Finalization on Sunday preserves existing locked legs. Multiple legs from the same game trigger `contains_sgp = true` with amber alert badges.

---

## File Structure

```
team_parlay/
├── firebase.json
├── firestore.rules
├── .firebaserc
├── functions/
│   ├── requirements.txt
│   ├── main.py
│   ├── parlay_math.py
│   ├── sleeper_sync.py
│   ├── odds_engine.py
│   ├── auth_utils.py
│   └── tests/
│       ├── test_parlay_math.py
│       ├── test_sleeper_sync.py
│       ├── test_odds_engine.py
│       └── test_auth_utils.py
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── index.html
    └── src/
        ├── types.ts
        ├── App.tsx
        ├── main.tsx
        ├── services/
        │   └── firebase.ts
        ├── utils/
        │   └── crypto.ts
        └── components/
            ├── BettorBanner.tsx
            ├── ParlayCard.tsx
            ├── PickModal.tsx
            ├── DefaultPoolModal.tsx
            ├── BreakGlassModal.tsx
            ├── SleeperChatExport.tsx
            └── PastSlipsArchive.tsx
```

---

### Task 1: Scaffolding Project & Test Environment

**Files:**
- Create: `firebase.json`
- Create: `firestore.rules`
- Create: `functions/requirements.txt`
- Create: `functions/tests/__init__.py`

**Interfaces:**
- Produces: Project root configuration and Python dependency specifications.

- [ ] **Step 1: Create `functions/requirements.txt`**

```txt
firebase-functions>=0.2.0
firebase-admin>=6.5.0
google-cloud-firestore>=2.16.0
requests>=2.31.0
pytest>=8.0.0
```

- [ ] **Step 2: Create `firebase.json` and `firestore.rules`**

```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": [
        "venv",
        ".git",
        "firebase-debug.log",
        "firebase-debug.*.log"
      ],
      "runtime": "python311"
    }
  ],
  "firestore": {
    "rules": "firestore.rules"
  },
  "hosting": {
    "public": "frontend/dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /leagues/{leagueId} {
      allow read: if true;
      allow write: if false; // Only via backend functions
    }
    match /teams/{rosterId} {
      allow read: if true;
      allow write: if false; // Only via backend functions
    }
    match /parlays/{week} {
      allow read: if true;
      allow write: if false; // Only via backend functions
    }
    match /odds_cache/{docId} {
      allow read: if true;
      allow write: if false; // Only via backend functions
    }
  }
}
```

- [ ] **Step 3: Setup Python virtual environment and verify pytest**

Run: `cd /Users/blakegoodwin/Projects/team_parlay && python3 -m venv venv && ./venv/bin/pip install -r functions/requirements.txt && ./venv/bin/pytest --version`  
Expected: `pytest 8.x.x`

- [ ] **Step 4: Commit**

```bash
git add firebase.json firestore.rules functions/requirements.txt
git commit -m "chore: scaffold firebase project and python test environment"
```

---

### Task 2: Parlay Mathematics & SGP Correlation Engine

**Files:**
- Create: `functions/parlay_math.py`
- Create: `functions/tests/test_parlay_math.py`

**Interfaces:**
- Produces:
  - `american_to_decimal(american: int | str) -> float`
  - `decimal_to_american(decimal: float) -> str`
  - `calculate_parlay(legs: list[dict], stake: float = 5.0) -> dict`
  - `check_sgp_correlation(legs: list[dict]) -> bool`

- [ ] **Step 1: Write the failing tests for parlay calculations**

Create `functions/tests/test_parlay_math.py`:
```python
import pytest
from parlay_math import (
    american_to_decimal,
    decimal_to_american,
    calculate_parlay,
    check_sgp_correlation,
)

def test_american_to_decimal():
    assert american_to_decimal("+150") == 2.50
    assert american_to_decimal(-110) == pytest.approx(1.9091, 0.001)
    assert american_to_decimal("-200") == 1.50

def test_decimal_to_american():
    assert decimal_to_american(2.50) == "+150"
    assert decimal_to_american(1.9091) == "-110"
    assert decimal_to_american(1.50) == "-200"

def test_calculate_parlay_standard():
    legs = [
        {"odds_american": "-110", "result_status": "pending"},
        {"odds_american": "+150", "result_status": "pending"},
        {"odds_american": "-200", "result_status": "pending"},
    ]
    result = calculate_parlay(legs, stake=5.0)
    # (1.90909 * 2.50 * 1.50) = 7.159
    assert result["multiplier"] == pytest.approx(7.159, 0.01)
    assert result["estimated_payout"] == pytest.approx(35.80, 0.05)
    assert result["odds_american"] == "+616"

def test_calculate_parlay_with_void_and_push():
    legs = [
        {"odds_american": "+100", "result_status": "won"},   # 2.0
        {"odds_american": "-110", "result_status": "voided"},# ignored
        {"odds_american": "+150", "result_status": "push"},  # ignored
    ]
    result = calculate_parlay(legs, stake=5.0)
    assert result["multiplier"] == 2.0
    assert result["estimated_payout"] == 10.0
    assert result["odds_american"] == "+100"

def test_check_sgp_correlation():
    independent_legs = [
        {"game_id": "game_1", "description": "Ravens ML"},
        {"game_id": "game_2", "description": "Chiefs ML"},
    ]
    assert check_sgp_correlation(independent_legs) is False

    sgp_legs = [
        {"game_id": "game_1", "description": "Mahomes OVER 250 Yds"},
        {"game_id": "game_1", "description": "Kelce Anytime TD"},
        {"game_id": "game_2", "description": "Lions ML"},
    ]
    assert check_sgp_correlation(sgp_legs) is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest functions/tests/test_parlay_math.py -v`  
Expected: FAIL with `ModuleNotFoundError: No module named 'parlay_math'`

- [ ] **Step 3: Implement `functions/parlay_math.py`**

```python
import math
from typing import List, Dict, Any, Union

def american_to_decimal(american: Union[int, str]) -> float:
    odds = int(american)
    if odds > 0:
        return (odds / 100.0) + 1.0
    else:
        return (100.0 / abs(odds)) + 1.0

def decimal_to_american(decimal: float) -> str:
    if decimal <= 1.0:
        return "+100"
    if decimal >= 2.0:
        val = round((decimal - 1.0) * 100)
        return f"+{val}"
    else:
        val = round(-100.0 / (decimal - 1.0))
        return f"{val}"

def check_sgp_correlation(legs: List[Dict[str, Any]]) -> bool:
    game_ids = [leg.get("game_id") for leg in legs if leg.get("game_id")]
    return len(game_ids) != len(set(game_ids))

def calculate_parlay(legs: List[Dict[str, Any]], stake: float = 5.0) -> Dict[str, Any]:
    active_decimals = []
    
    for leg in legs:
        status = leg.get("result_status", "pending")
        # Voided or pushed legs drop out of the multiplier calculation
        if status in ("voided", "push"):
            continue
        odds_raw = leg.get("odds_american", "-110")
        active_decimals.append(american_to_decimal(odds_raw))
        
    if not active_decimals:
        return {
            "multiplier": 1.0,
            "estimated_payout": stake,
            "odds_american": "+100",
            "contains_sgp": False
        }
        
    multiplier = math.prod(active_decimals)
    payout = round(stake * multiplier, 2)
    american = decimal_to_american(multiplier)
    contains_sgp = check_sgp_correlation(legs)
    
    return {
        "multiplier": round(multiplier, 3),
        "estimated_payout": payout,
        "odds_american": american,
        "contains_sgp": contains_sgp
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/test_parlay_math.py -v`  
Expected: PASS (4 tests passed)

- [ ] **Step 5: Commit**

```bash
git add functions/parlay_math.py functions/tests/test_parlay_math.py
git commit -m "feat: implement parlay odds calculation and SGP correlation check"
```

---

### Task 3: Sleeper Sync & Deterministic Bettor Selection

**Files:**
- Create: `functions/sleeper_sync.py`
- Create: `functions/tests/test_sleeper_sync.py`

**Interfaces:**
- Produces:
  - `determine_weekly_bettor(matchups: list[dict], rosters: list[dict], users: list[dict]) -> dict`
  - `fetch_sleeper_league_data(league_id: str, week: int) -> dict`

- [ ] **Step 1: Write failing tests for 4-tier tie-breaker**

Create `functions/tests/test_sleeper_sync.py`:
```python
import pytest
from sleeper_sync import determine_weekly_bettor

def test_determine_weekly_bettor_clear_loser():
    matchups = [
        {"roster_id": 1, "points": 115.4},
        {"roster_id": 2, "points": 88.2},
        {"roster_id": 3, "points": 95.0},
    ]
    rosters = [
        {"roster_id": 1, "owner_id": "u1", "settings": {"fpts": 500, "ppts": 600}},
        {"roster_id": 2, "owner_id": "u2", "settings": {"fpts": 450, "ppts": 550}},
        {"roster_id": 3, "owner_id": "u3", "settings": {"fpts": 480, "ppts": 580}},
    ]
    users = [
        {"user_id": "u1", "display_name": "Alice", "metadata": {"team_name": "Team A"}},
        {"user_id": "u2", "display_name": "Bob", "metadata": {"team_name": "Team B"}},
        {"user_id": "u3", "display_name": "Charlie", "metadata": {"team_name": "Team C"}},
    ]
    bettor = determine_weekly_bettor(matchups, rosters, users)
    assert bettor["roster_id"] == 2
    assert bettor["owner_name"] == "Bob"
    assert bettor["points_last_week"] == 88.2

def test_determine_weekly_bettor_tiebreaker_season_pf():
    # Both score 80.0 points, but roster 1 has fewer total season points (400 vs 450)
    matchups = [
        {"roster_id": 1, "points": 80.0},
        {"roster_id": 2, "points": 80.0},
    ]
    rosters = [
        {"roster_id": 1, "owner_id": "u1", "settings": {"fpts": 400, "ppts": 500}},
        {"roster_id": 2, "owner_id": "u2", "settings": {"fpts": 450, "ppts": 550}},
    ]
    users = [
        {"user_id": "u1", "display_name": "Alice", "metadata": {"team_name": "Team A"}},
        {"user_id": "u2", "display_name": "Bob", "metadata": {"team_name": "Team B"}},
    ]
    bettor = determine_weekly_bettor(matchups, rosters, users)
    assert bettor["roster_id"] == 1
    assert bettor["owner_name"] == "Alice"

def test_determine_weekly_bettor_tiebreaker_alphabetical():
    # Exactly tied on weekly points, season points, and max points
    matchups = [
        {"roster_id": 1, "points": 80.0},
        {"roster_id": 2, "points": 80.0},
    ]
    rosters = [
        {"roster_id": 1, "owner_id": "u1", "settings": {"fpts": 400, "ppts": 500}},
        {"roster_id": 2, "owner_id": "u2", "settings": {"fpts": 400, "ppts": 500}},
    ]
    users = [
        {"user_id": "u1", "display_name": "Zack", "metadata": {"team_name": "Zebra"}},
        {"user_id": "u2", "display_name": "Aaron", "metadata": {"team_name": "Alpha"}},
    ]
    bettor = determine_weekly_bettor(matchups, rosters, users)
    # Alphabetical by team name -> "Alpha" (roster 2)
    assert bettor["roster_id"] == 2
    assert bettor["team_name"] == "Alpha"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/test_sleeper_sync.py -v`  
Expected: FAIL with `ModuleNotFoundError: No module named 'sleeper_sync'`

- [ ] **Step 3: Implement `functions/sleeper_sync.py`**

```python
import requests
from typing import List, Dict, Any, Optional

SLEEPER_BASE_URL = "https://api.sleeper.app/v1"

def fetch_sleeper_league_data(league_id: str, week: int) -> Dict[str, Any]:
    rosters_res = requests.get(f"{SLEEPER_BASE_URL}/league/{league_id}/rosters")
    rosters_res.raise_for_status()
    rosters = rosters_res.json()

    users_res = requests.get(f"{SLEEPER_BASE_URL}/league/{league_id}/users")
    users_res.raise_for_status()
    users = users_res.json()

    matchups_res = requests.get(f"{SLEEPER_BASE_URL}/league/{league_id}/matchups/{week}")
    matchups_res.raise_for_status()
    matchups = matchups_res.json()

    return {
        "rosters": rosters,
        "users": users,
        "matchups": matchups
    }

def determine_weekly_bettor(
    matchups: List[Dict[str, Any]],
    rosters: List[Dict[str, Any]],
    users: List[Dict[str, Any]]
) -> Dict[str, Any]:
    user_map = {u["user_id"]: u for u in users}
    roster_map = {r["roster_id"]: r for r in rosters}

    candidates = []
    for m in matchups:
        rid = m["roster_id"]
        points = float(m.get("points", 0.0))
        r = roster_map.get(rid, {})
        settings = r.get("settings", {})
        season_pf = float(settings.get("fpts", 0.0))
        max_pf = float(settings.get("ppts", 0.0))

        u = user_map.get(r.get("owner_id"), {})
        owner_name = u.get("display_name", f"Team {rid}")
        team_name = u.get("metadata", {}).get("team_name") or owner_name

        candidates.append({
            "roster_id": rid,
            "points": points,
            "season_pf": season_pf,
            "max_pf": max_pf,
            "team_name": team_name,
            "owner_name": owner_name
        })

    # Sort hierarchy:
    # 1. points (ascending)
    # 2. season_pf (ascending)
    # 3. max_pf (ascending)
    # 4. team_name (alphabetical ascending)
    candidates.sort(key=lambda c: (
        c["points"],
        c["season_pf"],
        c["max_pf"],
        c["team_name"].lower()
    ))

    loser = candidates[0]
    return {
        "roster_id": loser["roster_id"],
        "team_name": loser["team_name"],
        "owner_name": loser["owner_name"],
        "points_last_week": loser["points"]
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/test_sleeper_sync.py -v`  
Expected: PASS (3 tests passed)

- [ ] **Step 5: Commit**

```bash
git add functions/sleeper_sync.py functions/tests/test_sleeper_sync.py
git commit -m "feat: implement sleeper sync and 4-tier deterministic bettor selection"
```

---

### Task 4: Auth Utilities (Salted PIN Hashing & Break-Glass Logging)

**Files:**
- Create: `functions/auth_utils.py`
- Create: `functions/tests/test_auth_utils.py`

**Interfaces:**
- Produces:
  - `hash_pin(raw_pin: str, salt: str) -> str`
  - `verify_pin(incoming_hash: str, stored_hash: str) -> bool`
  - `create_break_glass_log(executor_roster_id: int, executor_name: str, bettor_roster_id: int) -> dict`

- [ ] **Step 1: Write failing tests for salted auth and break glass**

Create `functions/tests/test_auth_utils.py`:
```python
import pytest
from auth_utils import hash_pin, verify_pin, create_break_glass_log

def test_hash_pin_and_verification():
    salt = "league_salt_xyz123"
    pin = "1234"
    pin_hash = hash_pin(pin, salt)
    
    assert pin_hash != pin
    assert len(pin_hash) == 64 # SHA-256 hex
    assert verify_pin(pin_hash, pin_hash) is True
    assert verify_pin(hash_pin("9999", salt), pin_hash) is False

def test_create_break_glass_log():
    # Bettor is roster 2, but roster 4 executed the finalization
    log = create_break_glass_log(
        executor_roster_id=4,
        executor_name="Dave",
        bettor_roster_id=2
    )
    assert log["is_break_glass"] is True
    assert log["roster_id"] == 4
    assert log["owner_name"] == "Dave"

    # Bettor is roster 2 and executes it themselves
    standard_log = create_break_glass_log(
        executor_roster_id=2,
        executor_name="Bob",
        bettor_roster_id=2
    )
    assert standard_log["is_break_glass"] is False
    assert standard_log["roster_id"] == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/test_auth_utils.py -v`  
Expected: FAIL with `ModuleNotFoundError: No module named 'auth_utils'`

- [ ] **Step 3: Implement `functions/auth_utils.py`**

```python
import hashlib
from typing import Dict, Any

def hash_pin(raw_pin: str, salt: str) -> str:
    combined = f"{raw_pin}:{salt}".encode("utf-8")
    return hashlib.sha256(combined).hexdigest()

def verify_pin(incoming_hash: str, stored_hash: str) -> bool:
    if not incoming_hash or not stored_hash:
        return False
    return incoming_hash.lower() == stored_hash.lower()

def create_break_glass_log(
    executor_roster_id: int,
    executor_name: str,
    bettor_roster_id: int
) -> Dict[str, Any]:
    is_break_glass = (executor_roster_id != bettor_roster_id)
    return {
        "roster_id": executor_roster_id,
        "owner_name": executor_name,
        "is_break_glass": is_break_glass
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/test_auth_utils.py -v`  
Expected: PASS (2 tests passed)

- [ ] **Step 5: Commit**

```bash
git add functions/auth_utils.py functions/tests/test_auth_utils.py
git commit -m "feat: implement salted pin hashing and break-glass logging"
```

---

### Task 5: Odds Engine, Partial Locking & Default Roll Engine

**Files:**
- Create: `functions/odds_engine.py`
- Create: `functions/tests/test_odds_engine.py`

**Interfaces:**
- Produces:
  - `is_leg_locked(kickoff_time_iso: str, current_time_iso: str) -> bool`
  - `filter_eligible_defaults(defaults: list[dict], bye_teams: list[str], completed_or_active_games: list[dict]) -> list[dict]`
  - `roll_default_leg(team_defaults: list[dict], bye_teams: list[str], active_odds_cache: dict) -> dict`

- [ ] **Step 1: Write failing tests for partial locking and default filtering**

Create `functions/tests/test_odds_engine.py`:
```python
import pytest
from odds_engine import (
    is_leg_locked,
    filter_eligible_defaults,
    roll_default_leg,
)

def test_is_leg_locked():
    kickoff = "2026-09-24T20:15:00Z" # TNF
    assert is_leg_locked(kickoff, "2026-09-24T20:10:00Z") is False
    assert is_leg_locked(kickoff, "2026-09-24T20:16:00Z") is True

def test_filter_eligible_defaults_excludes_bye_and_past_kickoffs():
    defaults = [
        {"id": "1", "nfl_team": "KC", "description_template": "Chiefs Spread"},
        {"id": "2", "nfl_team": "BAL", "description_template": "Henry Over Rushing"},
        {"id": "3", "nfl_team": "PHI", "description_template": "Eagles ML"},
    ]
    bye_teams = ["KC"]
    completed_games = [{"team": "BAL"}] # TNF game already finished
    
    eligible = filter_eligible_defaults(defaults, bye_teams, completed_games)
    assert len(eligible) == 1
    assert eligible[0]["nfl_team"] == "PHI"

def test_roll_default_leg_snaps_line():
    defaults = [
        {"id": "1", "nfl_team": "PHI", "market_type": "spread", "direction": "favorite", "description_template": "Eagles Spread"}
    ]
    active_odds = {
        "games": [
            {
                "game_id": "game_phi_tb",
                "home_team": "TB",
                "away_team": "PHI",
                "commence_time": "2026-09-27T17:00:00Z",
                "spread": {"home": 3.5, "away": -3.5, "home_odds": "-110", "away_odds": "-110"}
            }
        ]
    }
    rolled = roll_default_leg(defaults, bye_teams=[], active_odds_cache=active_odds)
    assert rolled is not None
    assert "Eagles -3.5" in rolled["description"]
    assert rolled["odds_american"] == "-110"
    assert rolled["is_default_roll"] is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/test_odds_engine.py -v`  
Expected: FAIL with `ModuleNotFoundError: No module named 'odds_engine'`

- [ ] **Step 3: Implement `functions/odds_engine.py`**

```python
from datetime import datetime
import random
from typing import List, Dict, Any, Optional

def is_leg_locked(kickoff_time_iso: str, current_time_iso: Optional[str] = None) -> bool:
    if not kickoff_time_iso:
        return False
    kickoff = datetime.fromisoformat(kickoff_time_iso.replace("Z", "+00:00"))
    if current_time_iso:
        now = datetime.fromisoformat(current_time_iso.replace("Z", "+00:00"))
    else:
        now = datetime.now(kickoff.tzinfo)
    return now >= kickoff

def filter_eligible_defaults(
    defaults: List[Dict[str, Any]],
    bye_teams: List[str],
    completed_or_active_games: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    locked_teams = {g.get("team") for g in completed_or_active_games}
    bye_set = {b.upper() for b in bye_teams}

    eligible = []
    for d in defaults:
        team = d.get("nfl_team", "").upper()
        if team in bye_set:
            continue
        if team in locked_teams:
            continue
        eligible.append(d)
    return eligible

def roll_default_leg(
    team_defaults: List[Dict[str, Any]],
    bye_teams: List[str],
    active_odds_cache: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    games = active_odds_cache.get("games", [])
    completed_games = []
    
    # Check games that have already kicked off
    now = datetime.utcnow().isoformat() + "Z"
    for g in games:
        if is_leg_locked(g.get("commence_time", ""), now):
            completed_games.append({"team": g.get("home_team")})
            completed_games.append({"team": g.get("away_team")})

    eligible = filter_eligible_defaults(team_defaults, bye_teams, completed_games)
    if not eligible:
        return None

    selected = random.choice(eligible)
    team = selected.get("nfl_team", "").upper()
    market = selected.get("market_type", "spread")

    # Find the matching game in active odds cache
    matched_game = None
    is_home = False
    for g in games:
        if g.get("home_team", "").upper() == team:
            matched_game = g
            is_home = True
            break
        elif g.get("away_team", "").upper() == team:
            matched_game = g
            is_home = False
            break

    if not matched_game:
        # Fallback if odds not found
        return {
            "description": selected.get("description_template", f"{team} Bet"),
            "nfl_team": team,
            "odds_american": "-110",
            "odds_decimal": 1.91,
            "is_default_roll": True,
            "game_id": f"game_{team.lower()}",
            "result_status": "pending",
            "kickoff_time": None
        }

    game_id = matched_game.get("game_id", f"game_{team.lower()}")
    commence_time = matched_game.get("commence_time")

    if market == "spread":
        spread_data = matched_game.get("spread", {})
        line = spread_data.get("home" if is_home else "away", 0.0)
        odds = spread_data.get("home_odds" if is_home else "away_odds", "-110")
        line_str = f"{line:+g}" if line != 0 else "PK"
        desc = f"{team} {line_str} Spread"
    elif market == "moneyline":
        ml_data = matched_game.get("moneyline", {})
        odds = ml_data.get("home_odds" if is_home else "away_odds", "-110")
        desc = f"{team} Moneyline"
    elif market == "game_total":
        total_data = matched_game.get("total", {})
        ou = total_data.get("over_under", 45.5)
        direction = selected.get("direction", "over").upper()
        odds = total_data.get("over_odds" if direction == "OVER" else "under_odds", "-110")
        desc = f"{matched_game.get('away_team')} @ {matched_game.get('home_team')} {direction} {ou}"
    else:
        desc = selected.get("description_template", f"{team} Prop")
        odds = "-110"

    from parlay_math import american_to_decimal
    return {
        "description": desc,
        "nfl_team": team,
        "odds_american": str(odds),
        "odds_decimal": american_to_decimal(odds),
        "is_default_roll": True,
        "game_id": game_id,
        "result_status": "pending",
        "kickoff_time": commence_time
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/test_odds_engine.py -v`  
Expected: PASS (3 tests passed)

- [ ] **Step 5: Commit**

```bash
git add functions/odds_engine.py functions/tests/test_odds_engine.py
git commit -m "feat: implement partial locking checks and intent-based default rolling"
```

---

### Task 6: Firebase Cloud Functions Endpoints

**Files:**
- Create: `functions/main.py`
- Test: `functions/tests/test_endpoints.py`

**Interfaces:**
- Produces callable functions:
  - `sync_sleeper_week`: Transitions week, finds lowest scorer, resets ticket.
  - `submit_leg`: Enforces PIN validation and partial lock before recording pick.
  - `update_default_pool`: Saves intent-based defaults for team.
  - `finalize_parlay`: Executes default rolls for missing teams and locks ticket.
  - `resolve_parlay`: Resolves won/lost/voided legs and updates season stats.

- [ ] **Step 1: Write mock endpoint unit tests**

Create `functions/tests/test_endpoints.py`:
```python
import pytest
from unittest.mock import MagicMock, patch
from main import handle_finalize_parlay, handle_submit_leg

def test_submit_leg_blocked_if_kickoff_passed():
    parlay_data = {"status": "open"}
    incoming_leg = {
        "roster_id": 1,
        "kickoff_time": "2026-09-24T20:15:00Z", # in the past
        "description": "Ravens ML"
    }
    with patch("odds_engine.is_leg_locked", return_value=True):
        res = handle_submit_leg(parlay_data, incoming_leg)
        assert res["success"] is False
        assert "locked" in res["error"].lower()

def test_finalize_parlay_preserves_locked_legs():
    existing_legs = [
        {
            "roster_id": 1,
            "description": "TNF Pick",
            "locked_at": "2026-09-24T20:15:00Z",
            "is_default_roll": False,
            "odds_american": "-110"
        }
    ]
    teams = [
        {"roster_id": 1, "owner_name": "Alice", "default_legs": []},
        {"roster_id": 2, "owner_name": "Bob", "default_legs": [{"id": "d1", "nfl_team": "KC", "market_type": "spread"}]},
    ]
    odds_cache = {"games": []}
    
    finalized = handle_finalize_parlay(
        existing_legs=existing_legs,
        all_teams=teams,
        active_odds_cache=odds_cache,
        executor_roster_id=2,
        executor_name="Bob",
        bettor_roster_id=2
    )
    # Roster 1's locked pick must still be there
    legs = finalized["legs"]
    assert len(legs) == 2
    assert legs[0]["description"] == "TNF Pick"
    assert finalized["status"] == "locked"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/test_endpoints.py -v`  
Expected: FAIL with `ModuleNotFoundError: No module named 'main'`

- [ ] **Step 3: Implement `functions/main.py`**

```python
from typing import Dict, Any, List, Optional
from datetime import datetime
from parlay_math import calculate_parlay
from odds_engine import is_leg_locked, roll_default_leg
from auth_utils import create_break_glass_log, verify_pin

def handle_submit_leg(parlay_data: Dict[str, Any], incoming_leg: Dict[str, Any]) -> Dict[str, Any]:
    if parlay_data.get("status") == "locked":
        return {"success": False, "error": "Parlay is already locked."}

    kickoff = incoming_leg.get("kickoff_time")
    if kickoff and is_leg_locked(kickoff):
        return {"success": False, "error": "This game has already started and cannot be picked."}

    return {"success": True}

def handle_finalize_parlay(
    existing_legs: List[Dict[str, Any]],
    all_teams: List[Dict[str, Any]],
    active_odds_cache: Dict[str, Any],
    executor_roster_id: int,
    executor_name: str,
    bettor_roster_id: int,
    bye_teams: Optional[List[str]] = None
) -> Dict[str, Any]:
    bye_teams = bye_teams or []
    submitted_roster_ids = {leg["roster_id"]: leg for leg in existing_legs}
    final_legs = []

    # Preserve all existing submitted or locked legs
    for leg in existing_legs:
        final_legs.append(leg)

    # Roll defaults for missing teams
    for team in all_teams:
        rid = team["roster_id"]
        if rid not in submitted_roster_ids:
            defaults = team.get("default_legs", [])
            rolled = roll_default_leg(defaults, bye_teams, active_odds_cache)
            if rolled:
                rolled["roster_id"] = rid
                rolled["team_name"] = team.get("team_name", f"Team {rid}")
                rolled["owner_name"] = team.get("owner_name", f"Owner {rid}")
                final_legs.append(rolled)
            else:
                final_legs.append({
                    "roster_id": rid,
                    "team_name": team.get("team_name", f"Team {rid}"),
                    "owner_name": team.get("owner_name", f"Owner {rid}"),
                    "description": "No Pick Submitted (All Defaults on Bye)",
                    "odds_american": "+100",
                    "odds_decimal": 1.0,
                    "is_default_roll": True,
                    "result_status": "voided"
                })

    parlay_stats = calculate_parlay(final_legs, stake=5.0)
    audit_log = create_break_glass_log(executor_roster_id, executor_name, bettor_roster_id)

    return {
        "status": "locked",
        "legs": final_legs,
        "estimated_odds_american": parlay_stats["odds_american"],
        "estimated_multiplier": parlay_stats["multiplier"],
        "estimated_payout": parlay_stats["estimated_payout"],
        "contains_sgp": parlay_stats["contains_sgp"],
        "finalized_at": datetime.utcnow().isoformat() + "Z",
        "finalized_by": audit_log
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/test_endpoints.py -v`  
Expected: PASS (2 tests passed)

- [ ] **Step 5: Run full backend test suite**

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/ -v`  
Expected: PASS (14 total tests passed across all modules)

- [ ] **Step 6: Commit**

```bash
git add functions/main.py functions/tests/test_endpoints.py
git commit -m "feat: implement backend core endpoint handlers with TNF preservation"
```

---

### Task 7: Frontend Setup & Core State Models

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/types.ts`
- Create: `frontend/src/utils/crypto.ts`
- Create: `frontend/src/services/firebase.ts`

**Interfaces:**
- Produces: React project scaffolding, type definitions, in-memory SHA-256 PIN hashing, and Firebase connection.

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "team-parlay-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "firebase": "^10.12.0",
    "lucide-react": "^0.395.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.4.5",
    "vite": "^5.2.11"
  }
}
```

- [ ] **Step 2: Create `frontend/vite.config.ts` and Tailwind configs**

Create `frontend/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
```

Create `frontend/tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sleeper: {
          dark: '#121A24',
          card: '#1D2736',
          accent: '#00CEB8',
          border: '#2E3D52'
        }
      }
    },
  },
  plugins: [],
}
```

Create `frontend/postcss.config.js`:
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 3: Create `frontend/src/types.ts`**

```typescript
export interface DefaultLeg {
  id: string;
  nfl_team: string;
  market_type: 'moneyline' | 'spread' | 'game_total' | 'player_prop';
  player_name?: string;
  prop_type?: 'rush_yds' | 'pass_yds' | 'rec_yds' | 'anytime_td';
  direction?: 'over' | 'under';
  description_template: string;
}

export interface TeamProfile {
  roster_id: number;
  owner_id: string;
  owner_name: string;
  team_name: string;
  avatar_url?: string;
  pin_hash: string;
  default_legs: DefaultLeg[];
  historical_stats?: {
    legs_hit: number;
    legs_missed: number;
    legs_voided_or_pushed: number;
    times_on_the_hook: number;
  };
}

export interface ParlayLeg {
  id: string;
  roster_id: number;
  team_name: string;
  owner_name: string;
  game_id?: string;
  nfl_team: string;
  description: string;
  odds_american: string;
  odds_decimal: number;
  is_default_roll: boolean;
  status: 'pending' | 'submitted';
  result_status: 'pending' | 'won' | 'lost' | 'voided' | 'push';
  kickoff_time?: string;
  locked_at?: string | null;
}

export interface WeeklyParlay {
  week: number;
  season: string;
  status: 'open' | 'locked';
  resolution?: 'pending' | 'won' | 'lost' | 'voided';
  contains_sgp: boolean;
  bettor: {
    roster_id: number;
    team_name: string;
    owner_name: string;
    points_last_week: number;
  };
  legs: ParlayLeg[];
  estimated_odds_american: string;
  estimated_multiplier: number;
  estimated_payout: number;
  actual_payout: number | null;
  actual_odds_american?: string | null;
  sportsbook_url?: string;
  finalized_at?: string | null;
  finalized_by?: {
    roster_id: number;
    owner_name: string;
    is_break_glass: boolean;
  } | null;
}
```

- [ ] **Step 4: Create `frontend/src/utils/crypto.ts` (SHA-256 Salted Hashing)**

```typescript
export async function hashPin(rawPin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${rawPin}:${salt}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const STORAGE_KEY = 'tp_auth_session';

export function saveSession(rosterId: number, pinHash: string) {
  // Only the hash is saved, NEVER the plain text PIN
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ rosterId, pinHash }));
}

export function getSavedSession(): { rosterId: number; pinHash: string } | null {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 5: Install frontend dependencies**

Run: `cd /Users/blakegoodwin/Projects/team_parlay/frontend && npm install`  
Expected: `added X packages` with no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold react frontend and secure client-side pin hashing"
```

---

### Task 8: UI Components (Bettor Banner, Parlay Card, SGP Warning)

**Files:**
- Create: `frontend/src/components/BettorBanner.tsx`
- Create: `frontend/src/components/ParlayCard.tsx`
- Create: `frontend/src/components/SleeperChatExport.tsx`

**Interfaces:**
- Produces: Display for weekly bettor loser spotlight, live parlay ticket with SGP badge, and formatted Sleeper chat copy tool.

- [ ] **Step 1: Create `frontend/src/components/BettorBanner.tsx`**

```tsx
import React from 'react';
import { AlertCircle, DollarSign, Flame } from 'lucide-react';
import { WeeklyParlay } from '../types';

interface Props {
  parlay: WeeklyParlay;
}

export const BettorBanner: React.FC<Props> = ({ parlay }) => {
  const { bettor, week } = parlay;
  return (
    <div className="bg-gradient-to-r from-red-900/60 to-orange-950/60 border border-red-500/30 rounded-xl p-4 shadow-lg mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-red-500/20 text-red-400 rounded-lg">
            <Flame className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-red-400 font-semibold">
              Week {week} Bettor on the Hook
            </span>
            <h2 className="text-xl font-bold text-white">
              {bettor.team_name} ({bettor.owner_name})
            </h2>
            <p className="text-xs text-gray-400">
              Scored lowest with {bettor.points_last_week.toFixed(1)} pts last week
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-400">Stake Due</span>
          <div className="flex items-center text-lg font-bold text-emerald-400">
            <DollarSign className="w-4 h-4 mr-0.5" />
            5.00
          </div>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Create `frontend/src/components/ParlayCard.tsx` (With SGP Alert)**

```tsx
import React from 'react';
import { AlertTriangle, Lock, ShieldCheck, ExternalLink } from 'lucide-react';
import { WeeklyParlay, ParlayLeg } from '../types';

interface Props {
  parlay: WeeklyParlay;
  onOpenPickModal: (rosterId: number) => void;
  currentRosterId: number | null;
}

export const ParlayCard: React.FC<Props> = ({ parlay, onOpenPickModal, currentRosterId }) => {
  return (
    <div className="bg-sleeper-card border border-sleeper-border rounded-xl shadow-xl overflow-hidden mb-6">
      <div className="p-4 bg-sleeper-dark/50 border-b border-sleeper-border flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-sleeper-accent uppercase tracking-wider">
            Active Ticket • Week {parlay.week}
          </span>
          <div className="flex items-baseline space-x-2 mt-0.5">
            <span className="text-2xl font-black text-white">
              {parlay.actual_odds_american || parlay.estimated_odds_american}
            </span>
            <span className="text-sm font-medium text-emerald-400">
              Est. Payout: ${parlay.actual_payout?.toFixed(2) || parlay.estimated_payout.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
            parlay.status === 'locked' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
          }`}>
            {parlay.status === 'locked' ? 'Locked' : 'Open'}
          </span>
        </div>
      </div>

      {parlay.contains_sgp && (
        <div className="bg-amber-950/40 border-b border-amber-500/30 p-3 flex items-start space-x-2">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200 leading-relaxed">
            <strong>Same Game Parlay (SGP) Detected:</strong> Multiple legs share the same game. Sportsbooks discount correlated odds, so actual payout may be lower than this estimate.
          </p>
        </div>
      )}

      <div className="divide-y divide-sleeper-border">
        {parlay.legs.map((leg, index) => {
          const isUserLeg = currentRosterId === leg.roster_id;
          return (
            <div key={leg.roster_id || index} className="p-3 hover:bg-white/5 transition flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="text-xs font-bold text-gray-500 w-4">{index + 1}</span>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-semibold text-white">{leg.owner_name}</span>
                    {leg.is_default_roll && (
                      <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">
                        🎲 Default
                      </span>
                    )}
                    {leg.locked_at && (
                      <Lock className="w-3 h-3 text-gray-400 inline" title="Locked at kickoff" />
                    )}
                  </div>
                  <p className="text-xs text-gray-300 mt-0.5">{leg.description}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/40 px-2 py-1 rounded">
                  {leg.odds_american}
                </span>
                {parlay.status === 'open' && !leg.locked_at && isUserLeg && (
                  <button
                    onClick={() => onOpenPickModal(leg.roster_id)}
                    className="text-xs text-sleeper-accent hover:underline font-medium"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Create `frontend/src/components/SleeperChatExport.tsx`**

```tsx
import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { WeeklyParlay } from '../types';

interface Props {
  parlay: WeeklyParlay;
}

export const SleeperChatExport: React.FC<Props> = ({ parlay }) => {
  const [copied, setCopied] = useState(false);

  const generateCard = () => {
    let text = `🏈 WEEK ${parlay.week} TEAM PARLAY 🏈\n`;
    text += `Bettor: ${parlay.bettor.owner_name} (Lowest: ${parlay.bettor.points_last_week.toFixed(1)} pts)\n`;
    text += `Stake: $5.00 | Odds: ${parlay.actual_odds_american || parlay.estimated_odds_american} | Est. Payout: $${parlay.actual_payout?.toFixed(2) || parlay.estimated_payout.toFixed(2)}\n\n`;

    parlay.legs.forEach((leg, i) => {
      const tag = leg.is_default_roll ? " (🎲 Default)" : "";
      text += `${i + 1}. ${leg.owner_name}${tag}: ${leg.description} (${leg.odds_american})\n`;
    });

    if (parlay.contains_sgp) {
      text += `\n⚠️ Includes Same-Game legs (sportsbook actual payout may adjust).\n`;
    }
    text += `\nLocked in. LFG! 🚀`;
    return text;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateCard());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center justify-center space-x-2 w-full py-2.5 px-4 rounded-lg bg-sleeper-card border border-sleeper-accent text-sleeper-accent hover:bg-sleeper-accent hover:text-black font-semibold text-sm transition"
    >
      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
      <span>{copied ? "Copied to Clipboard!" : "Copy Slip for Sleeper Chat"}</span>
    </button>
  );
};
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/
git commit -m "feat: implement bettor banner, parlay card with SGP warning, and chat export"
```

---

### Task 9: Interactive Modals (Pick Modal, Default Pool, Break-Glass)

**Files:**
- Create: `frontend/src/components/PickModal.tsx`
- Create: `frontend/src/components/DefaultPoolModal.tsx`
- Create: `frontend/src/components/BreakGlassModal.tsx`

**Interfaces:**
- Produces: Modals for weekly pick submission, managing recurring intent-based defaults, and break-glass finalization.

- [ ] **Step 1: Create `frontend/src/components/PickModal.tsx`**

```tsx
import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { DefaultLeg } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmitPick: (pick: { description: string; nfl_team: string; odds_american: string; kickoff_time?: string }) => void;
  rosterName: string;
}

export const PickModal: React.FC<Props> = ({ isOpen, onClose, onSubmitPick, rosterName }) => {
  const [tab, setTab] = useState<'structured' | 'custom'>('structured');
  const [team, setTeam] = useState('KC');
  const [betType, setBetType] = useState('spread');
  const [customText, setCustomText] = useState('');
  const [customOdds, setCustomOdds] = useState('-110');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === 'custom') {
      onSubmitPick({
        description: customText,
        nfl_team: team,
        odds_american: customOdds
      });
    } else {
      onSubmitPick({
        description: `${team} ${betType.toUpperCase()}`,
        nfl_team: team,
        odds_american: '-110'
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-sleeper-card border border-sleeper-border rounded-xl w-full max-w-md p-5 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">Pick Leg for {rosterName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex border-b border-sleeper-border mb-4">
          <button
            onClick={() => setTab('structured')}
            className={`pb-2 px-4 text-xs font-bold ${tab === 'structured' ? 'text-sleeper-accent border-b-2 border-sleeper-accent' : 'text-gray-400'}`}
          >
            Live Lines
          </button>
          <button
            onClick={() => setTab('custom')}
            className={`pb-2 px-4 text-xs font-bold ${tab === 'custom' ? 'text-sleeper-accent border-b-2 border-sleeper-accent' : 'text-gray-400'}`}
          >
            Custom / Alternate Line
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">NFL Team</label>
            <select
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              className="w-full bg-sleeper-dark border border-sleeper-border rounded-lg p-2.5 text-sm text-white"
            >
              <option value="KC">Kansas City Chiefs</option>
              <option value="BAL">Baltimore Ravens</option>
              <option value="PHI">Philadelphia Eagles</option>
              <option value="DET">Detroit Lions</option>
              <option value="BUF">Buffalo Bills</option>
            </select>
          </div>

          {tab === 'structured' ? (
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Bet Type</label>
              <select
                value={betType}
                onChange={(e) => setBetType(e.target.value)}
                className="w-full bg-sleeper-dark border border-sleeper-border rounded-lg p-2.5 text-sm text-white"
              >
                <option value="spread">Team Spread</option>
                <option value="moneyline">Moneyline</option>
                <option value="game_total">Game Total Over</option>
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Custom Bet Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Derrick Henry 100+ Rush Yards"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  className="w-full bg-sleeper-dark border border-sleeper-border rounded-lg p-2.5 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">American Odds</label>
                <input
                  type="text"
                  required
                  placeholder="-110 or +150"
                  value={customOdds}
                  onChange={(e) => setCustomOdds(e.target.value)}
                  className="w-full bg-sleeper-dark border border-sleeper-border rounded-lg p-2.5 text-sm text-white font-mono"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            className="w-full py-2.5 bg-sleeper-accent text-black font-bold rounded-lg hover:brightness-110 transition mt-4"
          >
            Submit Leg
          </button>
        </form>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Create `frontend/src/components/BreakGlassModal.tsx`**

```tsx
import React, { useState } from 'react';
import { AlertOctagon, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (isBreakGlass: boolean) => void;
  bettorName: string;
  isBettor: boolean;
}

export const BreakGlassModal: React.FC<Props> = ({ isOpen, onClose, onConfirm, bettorName, isBettor }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
      <div className="bg-sleeper-card border border-red-500/40 rounded-xl w-full max-w-md p-5 shadow-2xl">
        <div className="flex items-center space-x-3 mb-3">
          <div className="p-2 bg-red-500/20 text-red-400 rounded-lg">
            <AlertOctagon className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">
            {isBettor ? "Finalize & Place Ticket" : `Break-Glass Override for ${bettorName}`}
          </h3>
        </div>

        <p className="text-xs text-gray-300 leading-relaxed mb-4">
          {isBettor
            ? "This will lock the weekly parlay, roll eligible default legs for anyone who hasn't submitted a pick, and compute final odds."
            : `You are finalizing this ticket on behalf of ${bettorName}. Any unsubmitted picks will roll from their default pool. This action will be logged on the ticket.`}
        </p>

        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg bg-gray-800 text-gray-300 text-sm font-semibold hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm(!isBettor);
              onClose();
            }}
            className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-500 transition"
          >
            {isBettor ? "Finalize Slip" : "Confirm Override"}
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/
git commit -m "feat: implement pick submission and break-glass confirmation modals"
```

---

### Task 10: App Assembly, Testing & Verification

**Files:**
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/main.tsx`

**Interfaces:**
- Produces: Top-level application shell integrating banner, ticket card, modals, and export button.

- [ ] **Step 1: Implement `frontend/src/App.tsx`**

```tsx
import React, { useState } from 'react';
import { BettorBanner } from './components/BettorBanner';
import { ParlayCard } from './components/ParlayCard';
import { PickModal } from './components/PickModal';
import { BreakGlassModal } from './components/BreakGlassModal';
import { SleeperChatExport } from './components/SleeperChatExport';
import { WeeklyParlay } from './types';

// Mock initial data for local development
const mockParlay: WeeklyParlay = {
  week: 4,
  season: '2026',
  status: 'open',
  contains_sgp: false,
  bettor: {
    roster_id: 2,
    team_name: 'Gridiron Clowns',
    owner_name: 'Bob',
    points_last_week: 78.4
  },
  legs: [
    {
      id: '1',
      roster_id: 1,
      team_name: 'Philly Special',
      owner_name: 'Blake',
      nfl_team: 'PHI',
      description: 'Eagles -3.5 Spread',
      odds_american: '-110',
      odds_decimal: 1.91,
      is_default_roll: false,
      status: 'submitted',
      result_status: 'pending'
    },
    {
      id: '2',
      roster_id: 2,
      team_name: 'Gridiron Clowns',
      owner_name: 'Bob',
      nfl_team: 'KC',
      description: 'Chiefs Moneyline',
      odds_american: '-130',
      odds_decimal: 1.77,
      is_default_roll: false,
      status: 'submitted',
      result_status: 'pending'
    }
  ],
  estimated_odds_american: '+238',
  estimated_multiplier: 3.38,
  estimated_payout: 16.90,
  actual_payout: null
};

export const App: React.FC = () => {
  const [parlay, setParlay] = useState<WeeklyParlay>(mockParlay);
  const [isPickOpen, setIsPickOpen] = useState(false);
  const [isBreakGlassOpen, setIsBreakGlassOpen] = useState(false);
  const [currentRosterId] = useState<number>(1); // Active simulated user

  const handlePickSubmit = (pick: any) => {
    setParlay(prev => ({
      ...prev,
      legs: prev.legs.map(leg => 
        leg.roster_id === currentRosterId 
          ? { ...leg, description: pick.description, nfl_team: pick.nfl_team, odds_american: pick.odds_american }
          : leg
      )
    }));
  };

  const handleFinalize = (isBreakGlass: boolean) => {
    setParlay(prev => ({
      ...prev,
      status: 'locked',
      finalized_by: {
        roster_id: currentRosterId,
        owner_name: 'Blake',
        is_break_glass: isBreakGlass
      }
    }));
  };

  return (
    <div className="min-h-screen bg-sleeper-dark text-white p-4 max-w-lg mx-auto">
      <header className="flex justify-between items-center mb-6 pt-2">
        <h1 className="text-xl font-black tracking-tight text-white flex items-center space-x-2">
          <span>🏈</span>
          <span>TEAM PARLAY</span>
        </h1>
        <span className="text-xs bg-sleeper-border px-2 py-1 rounded text-gray-300 font-mono">
          Week {parlay.week}
        </span>
      </header>

      <BettorBanner parlay={parlay} />

      <ParlayCard
        parlay={parlay}
        onOpenPickModal={() => setIsPickOpen(true)}
        currentRosterId={currentRosterId}
      />

      <div className="space-y-3 mb-8">
        <SleeperChatExport parlay={parlay} />
        {parlay.status === 'open' && (
          <button
            onClick={() => setIsBreakGlassOpen(true)}
            className="w-full py-2.5 rounded-lg bg-red-900/40 border border-red-500/40 text-red-300 text-xs font-bold hover:bg-red-800/40 transition"
          >
            ⚡ {parlay.bettor.roster_id === currentRosterId ? "Finalize Parlay Slip" : `Break Glass: Finalize on Behalf of ${parlay.bettor.owner_name}`}
          </button>
        )}
      </div>

      <PickModal
        isOpen={isPickOpen}
        onClose={() => setIsPickOpen(false)}
        onSubmitPick={handlePickSubmit}
        rosterName="Philly Special"
      />

      <BreakGlassModal
        isOpen={isBreakGlassOpen}
        onClose={() => setIsBreakGlassOpen(false)}
        onConfirm={handleFinalize}
        bettorName={parlay.bettor.owner_name}
        isBettor={parlay.bettor.roster_id === currentRosterId}
      />
    </div>
  );
};
```

- [ ] **Step 2: Implement `frontend/src/main.tsx` and `frontend/index.html`**

Create `frontend/src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

Create `frontend/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  background-color: #121A24;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}
```

- [ ] **Step 3: Verify frontend builds successfully**

Run: `cd /Users/blakegoodwin/Projects/team_parlay/frontend && npm run build`  
Expected: `vite build` completed with no TypeScript or styling errors.

- [ ] **Step 4: Run full Python backend tests**

Run: `cd /Users/blakegoodwin/Projects/team_parlay && PYTHONPATH=functions ./venv/bin/pytest functions/tests/ -v`  
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: complete application frontend assembly and build validation"
```
