# NFL Fantasy Team Parlay Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight, mobile-first web app for an NFL fantasy football league on Sleeper to manage their weekly \$5 team parlay.

**Architecture:** A serverless stack featuring Python Firebase Cloud Functions (v2) for business logic, Sleeper API sync, and mainline odds caching; Cloud Firestore for persistence; and a responsive React (Vite) + Tailwind CSS client hosted on Firebase Hosting.

**Tech Stack:** Python 3.11, `firebase_functions`, `google-cloud-firestore`, React 18, Vite, Tailwind CSS, Lucide React, Pytest.

## Global Constraints

- **Security:** 4-digit PINs are verified on the backend; the backend issues a cryptographically secure random `uuid4()` session token stored in `localStorage`. Hashes/PINs are never stored on the client.
- **API Quota:** Automated CRON queries strictly mainline markets (moneyline, spread, totals) at 1 credit per call (~40 requests/month out of 500 limit). Player props use custom entry with user-supplied sportsbook odds.
- **Earliest Kickoff Rule:** The finalization deadline is strictly the kickoff of the earliest leg on the ticket. If TNF is included, the ticket finalizes before Thursday kickoff.
- **Deterministic Tie-Breaker:** Hierarchy: 1) Weekly Pts $\to$ 2) Season PF $\to$ 3) Season Max PF $\to$ 4) Alphabetical.
- **Manual Ticket Grading:** Legs are graded via an administrative UI toggle (`won`, `lost`, `voided`, `push`), eliminating external scoring API dependencies.

---

## File Structure

```
team_parlay/
├── firebase.json
├── firestore.rules
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
│       ├── test_auth_utils.py
│       └── test_grading.py
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
        │   ├── firebase.ts
        │   └── auth.ts
        └── components/
            ├── BettorBanner.tsx
            ├── ParlayCard.tsx
            ├── PickModal.tsx
            ├── DefaultPoolModal.tsx
            ├── BreakGlassModal.tsx
            ├── GradeTicketModal.tsx
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
      allow write: if false;
    }
    match /teams/{rosterId} {
      allow read: if true;
      allow write: if false;
    }
    match /parlays/{week} {
      allow read: if true;
      allow write: if false;
    }
    match /odds_cache/{docId} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

- [ ] **Step 3: Setup Python virtual environment and verify pytest**

Run: `python3 -m venv venv && ./venv/bin/pip install -r functions/requirements.txt && ./venv/bin/pytest --version`  
Expected: `pytest 8.x.x`

- [ ] **Step 4: Commit**

```bash
git add firebase.json firestore.rules functions/requirements.txt
git commit -m "chore: scaffold project structure and python test environment"
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

- [ ] **Step 1: Write failing tests for parlay calculations**

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
    assert result["multiplier"] == pytest.approx(7.159, 0.01)
    assert result["estimated_payout"] == pytest.approx(35.80, 0.05)
    assert result["odds_american"] == "+616"

def test_calculate_parlay_with_void_and_push():
    legs = [
        {"odds_american": "+100", "result_status": "won"},
        {"odds_american": "-110", "result_status": "voided"},
        {"odds_american": "+150", "result_status": "push"},
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

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/test_parlay_math.py -v`  
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
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add functions/parlay_math.py functions/tests/test_parlay_math.py
git commit -m "feat: implement parlay odds calculations and SGP correlation"
```

---

### Task 3: Sleeper Sync & Deterministic Tie-Breakers

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
    ]
    rosters = [
        {"roster_id": 1, "owner_id": "u1", "settings": {"fpts": 500, "ppts": 600}},
        {"roster_id": 2, "owner_id": "u2", "settings": {"fpts": 450, "ppts": 550}},
    ]
    users = [
        {"user_id": "u1", "display_name": "Alice", "metadata": {"team_name": "Team A"}},
        {"user_id": "u2", "display_name": "Bob", "metadata": {"team_name": "Team B"}},
    ]
    bettor = determine_weekly_bettor(matchups, rosters, users)
    assert bettor["roster_id"] == 2
    assert bettor["owner_name"] == "Bob"

def test_determine_weekly_bettor_tiebreaker():
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/test_sleeper_sync.py -v`  
Expected: FAIL

- [ ] **Step 3: Implement `functions/sleeper_sync.py`**

```python
import requests
from typing import List, Dict, Any

SLEEPER_BASE_URL = "https://api.sleeper.app/v1"

def fetch_sleeper_league_data(league_id: str, week: int) -> Dict[str, Any]:
    rosters = requests.get(f"{SLEEPER_BASE_URL}/league/{league_id}/rosters").json()
    users = requests.get(f"{SLEEPER_BASE_URL}/league/{league_id}/users").json()
    matchups = requests.get(f"{SLEEPER_BASE_URL}/league/{league_id}/matchups/{week}").json()
    return {"rosters": rosters, "users": users, "matchups": matchups}

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
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add functions/sleeper_sync.py functions/tests/test_sleeper_sync.py
git commit -m "feat: implement sleeper sync and deterministic tie-breaker hierarchy"
```

---

### Task 4: Secure Session Token Auth & Break-Glass Logging

**Files:**
- Create: `functions/auth_utils.py`
- Create: `functions/tests/test_auth_utils.py`

**Interfaces:**
- Produces:
  - `generate_session_token() -> str`
  - `verify_pin_and_issue_token(entered_pin: str, stored_hash: str, secret_salt: str) -> Optional[str]`
  - `verify_session_token(token: str, valid_tokens: list[str]) -> bool`
  - `create_break_glass_log(executor_roster_id: int, executor_name: str, bettor_roster_id: int) -> dict`

- [ ] **Step 1: Write failing tests for session token authentication**

Create `functions/tests/test_auth_utils.py`:
```python
import pytest
import hashlib
from auth_utils import (
    generate_session_token,
    verify_pin_and_issue_token,
    verify_session_token,
    create_break_glass_log,
)

def test_session_token_generation_and_validation():
    token = generate_session_token()
    assert len(token) >= 32
    valid_list = ["token1", token, "token2"]
    assert verify_session_token(token, valid_list) is True
    assert verify_session_token("invalid_token", valid_list) is False

def test_verify_pin_and_issue_token():
    salt = "secret_backend_salt_999"
    pin = "1234"
    stored_hash = hashlib.sha256(f"{pin}:{salt}".encode("utf-8")).hexdigest()

    token = verify_pin_and_issue_token("1234", stored_hash, salt)
    assert token is not None
    assert len(token) >= 32

    failed = verify_pin_and_issue_token("0000", stored_hash, salt)
    assert failed is None

def test_create_break_glass_log():
    log = create_break_glass_log(4, "Dave", 2)
    assert log["is_break_glass"] is True
    assert log["roster_id"] == 4
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/test_auth_utils.py -v`  
Expected: FAIL

- [ ] **Step 3: Implement `functions/auth_utils.py`**

```python
import uuid
import hashlib
from typing import List, Dict, Any, Optional

def generate_session_token() -> str:
    return str(uuid.uuid4())

def verify_pin_and_issue_token(entered_pin: str, stored_hash: str, secret_salt: str) -> Optional[str]:
    combined = f"{entered_pin}:{secret_salt}".encode("utf-8")
    computed_hash = hashlib.sha256(combined).hexdigest()
    if computed_hash.lower() == stored_hash.lower():
        return generate_session_token()
    return None

def verify_session_token(token: str, valid_tokens: List[str]) -> bool:
    if not token or not valid_tokens:
        return False
    return token in valid_tokens

def create_break_glass_log(
    executor_roster_id: int,
    executor_name: str,
    bettor_roster_id: int
) -> Dict[str, Any]:
    return {
        "roster_id": executor_roster_id,
        "owner_name": executor_name,
        "is_break_glass": (executor_roster_id != bettor_roster_id)
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/test_auth_utils.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add functions/auth_utils.py functions/tests/test_auth_utils.py
git commit -m "feat: implement backend session token issuance and validation"
```

---

### Task 5: Odds Engine, Earliest Kickoff & Quota Protection

**Files:**
- Create: `functions/odds_engine.py`
- Create: `functions/tests/test_odds_engine.py`

**Interfaces:**
- Produces:
  - `calculate_earliest_kickoff(legs: list[dict]) -> Optional[str]`
  - `is_kickoff_passed(kickoff_time_iso: str) -> bool`
  - `roll_default_leg(team_defaults: list[dict], bye_teams: list[str], active_odds_cache: dict) -> dict`

- [ ] **Step 1: Write failing tests for earliest kickoff and default roll**

Create `functions/tests/test_odds_engine.py`:
```python
import pytest
from odds_engine import calculate_earliest_kickoff, is_kickoff_passed, roll_default_leg

def test_calculate_earliest_kickoff():
    legs = [
        {"kickoff_time": "2026-09-27T17:00:00Z"}, # Sunday 1 PM
        {"kickoff_time": "2026-09-24T20:15:00Z"}, # Thursday Night
        {"kickoff_time": "2026-09-28T00:20:00Z"}, # Sunday Night
    ]
    earliest = calculate_earliest_kickoff(legs)
    assert earliest == "2026-09-24T20:15:00Z"

def test_is_kickoff_passed():
    past = "2026-09-24T20:15:00Z"
    now_after = "2026-09-24T20:20:00Z"
    assert is_kickoff_passed(past, now_after) is True

def test_roll_default_leg_mainlines_only():
    defaults = [
        {"id": "1", "nfl_team": "KC", "market_type": "spread", "description_template": "Chiefs Spread"}
    ]
    active_odds = {
        "games": [
            {
                "game_id": "game_kc_lac",
                "home_team": "KC",
                "away_team": "LAC",
                "commence_time": "2026-09-27T20:25:00Z",
                "spread": {"home": -4.5, "away": 4.5, "home_odds": "-110", "away_odds": "-110"}
            }
        ]
    }
    rolled = roll_default_leg(defaults, bye_teams=[], active_odds_cache=active_odds)
    assert rolled is not None
    assert "KC -4.5 Spread" in rolled["description"]
    assert rolled["odds_american"] == "-110"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/test_odds_engine.py -v`  
Expected: FAIL

- [ ] **Step 3: Implement `functions/odds_engine.py`**

```python
from datetime import datetime
import random
from typing import List, Dict, Any, Optional

def calculate_earliest_kickoff(legs: List[Dict[str, Any]]) -> Optional[str]:
    kickoffs = [leg.get("kickoff_time") for leg in legs if leg.get("kickoff_time")]
    if not kickoffs:
        return None
    return min(kickoffs)

def is_kickoff_passed(kickoff_time_iso: str, current_time_iso: Optional[str] = None) -> bool:
    if not kickoff_time_iso:
        return False
    kickoff = datetime.fromisoformat(kickoff_time_iso.replace("Z", "+00:00"))
    now = datetime.fromisoformat(current_time_iso.replace("Z", "+00:00")) if current_time_iso else datetime.now(kickoff.tzinfo)
    return now >= kickoff

def roll_default_leg(
    team_defaults: List[Dict[str, Any]],
    bye_teams: List[str],
    active_odds_cache: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    bye_set = {b.upper() for b in bye_teams}
    games = active_odds_cache.get("games", [])

    eligible_defaults = [d for d in team_defaults if d.get("nfl_team", "").upper() not in bye_set]
    if not eligible_defaults:
        return None

    selected = random.choice(eligible_defaults)
    team = selected.get("nfl_team", "").upper()
    market = selected.get("market_type", "spread")

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
        return {
            "description": selected.get("description_template", f"{team} Pick"),
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
        desc = f"{team} {line:+g} Spread"
    elif market == "moneyline":
        ml_data = matched_game.get("moneyline", {})
        odds = ml_data.get("home_odds" if is_home else "away_odds", "-110")
        desc = f"{team} Moneyline"
    else: # game_total
        total_data = matched_game.get("total", {})
        ou = total_data.get("over_under", 47.5)
        direction = selected.get("direction", "over").upper()
        odds = total_data.get("over_odds" if direction == "OVER" else "under_odds", "-110")
        desc = f"{matched_game.get('away_team')} @ {matched_game.get('home_team')} {direction} {ou}"

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
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add functions/odds_engine.py functions/tests/test_odds_engine.py
git commit -m "feat: implement earliest kickoff calculation and mainline default rolling"
```

---

### Task 6: Ticket Grading Engine & Endpoint Handlers

**Files:**
- Create: `functions/tests/test_grading.py`
- Create: `functions/main.py`

**Interfaces:**
- Produces:
  - `handle_grade_ticket(parlay: dict, grades: dict) -> dict`
  - `handle_finalize_parlay(existing_legs: list, all_teams: list, ...) -> dict`

- [ ] **Step 1: Write failing tests for manual ticket grading**

Create `functions/tests/test_grading.py`:
```python
import pytest
from main import handle_grade_ticket

def test_grade_ticket_all_won():
    parlay = {
        "status": "locked",
        "resolution": "pending",
        "legs": [
            {"id": "l1", "roster_id": 1, "odds_american": "-110", "result_status": "pending"},
            {"id": "l2", "roster_id": 2, "odds_american": "+150", "result_status": "pending"},
        ]
    }
    grades = {"l1": "won", "l2": "won"}
    result = handle_grade_ticket(parlay, grades)
    assert result["resolution"] == "won"
    assert result["legs"][0]["result_status"] == "won"

def test_grade_ticket_with_one_loss():
    parlay = {
        "status": "locked",
        "resolution": "pending",
        "legs": [
            {"id": "l1", "roster_id": 1, "odds_american": "-110", "result_status": "pending"},
            {"id": "l2", "roster_id": 2, "odds_american": "+150", "result_status": "pending"},
        ]
    }
    grades = {"l1": "won", "l2": "lost"}
    result = handle_grade_ticket(parlay, grades)
    assert result["resolution"] == "lost"

def test_grade_ticket_with_push():
    parlay = {
        "status": "locked",
        "resolution": "pending",
        "legs": [
            {"id": "l1", "roster_id": 1, "odds_american": "+100", "result_status": "pending"}, # 2.0
            {"id": "l2", "roster_id": 2, "odds_american": "-110", "result_status": "pending"}, # pushed
        ]
    }
    grades = {"l1": "won", "l2": "push"}
    result = handle_grade_ticket(parlay, grades)
    assert result["resolution"] == "won"
    assert result["estimated_payout"] == 10.0 # only leg 1 counts
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/test_grading.py -v`  
Expected: FAIL

- [ ] **Step 3: Implement `functions/main.py`**

```python
from typing import Dict, Any, List, Optional
from datetime import datetime
from parlay_math import calculate_parlay
from odds_engine import roll_default_leg, calculate_earliest_kickoff, is_kickoff_passed
from auth_utils import create_break_glass_log

def handle_grade_ticket(parlay: Dict[str, Any], grades: Dict[str, str]) -> Dict[str, Any]:
    legs = parlay.get("legs", [])
    has_loss = False
    all_decided = True

    for leg in legs:
        lid = leg.get("id")
        if lid in grades:
            leg["result_status"] = grades[lid]
        status = leg.get("result_status", "pending")
        if status == "lost":
            has_loss = True
        elif status == "pending":
            all_decided = False

    stats = calculate_parlay(legs, stake=5.0)

    if has_loss:
        resolution = "lost"
    elif all_decided:
        resolution = "won"
    else:
        resolution = "pending"

    return {
        **parlay,
        "legs": legs,
        "resolution": resolution,
        "estimated_payout": stats["estimated_payout"],
        "estimated_multiplier": stats["multiplier"],
        "graded_at": datetime.utcnow().isoformat() + "Z"
    }

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
    submitted_ids = {leg["roster_id"]: leg for leg in existing_legs}
    final_legs = list(existing_legs)

    for team in all_teams:
        rid = team["roster_id"]
        if rid not in submitted_ids:
            defaults = team.get("default_legs", [])
            rolled = roll_default_leg(defaults, bye_teams, active_odds_cache)
            if rolled:
                rolled["id"] = f"leg_{rid}_{datetime.utcnow().timestamp()}"
                rolled["roster_id"] = rid
                rolled["team_name"] = team.get("team_name", f"Team {rid}")
                rolled["owner_name"] = team.get("owner_name", f"Owner {rid}")
                final_legs.append(rolled)

    parlay_stats = calculate_parlay(final_legs, stake=5.0)
    audit = create_break_glass_log(executor_roster_id, executor_name, bettor_roster_id)
    earliest = calculate_earliest_kickoff(final_legs)

    return {
        "status": "locked",
        "resolution": "pending",
        "legs": final_legs,
        "earliest_kickoff": earliest,
        "estimated_odds_american": parlay_stats["odds_american"],
        "estimated_multiplier": parlay_stats["multiplier"],
        "estimated_payout": parlay_stats["estimated_payout"],
        "contains_sgp": parlay_stats["contains_sgp"],
        "finalized_at": datetime.utcnow().isoformat() + "Z",
        "finalized_by": audit
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/test_grading.py -v`  
Expected: PASS

- [ ] **Step 5: Run full Python backend test suite**

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/ -v`  
Expected: PASS (14 tests passing)

- [ ] **Step 6: Commit**

```bash
git add functions/main.py functions/tests/test_grading.py
git commit -m "feat: implement manual ticket grading and earliest kickoff parlay locking"
```

---

### Task 7: Frontend Setup & Session Authentication Service

**Files:**
- Create: `frontend/src/types.ts`
- Create: `frontend/src/services/auth.ts`

**Interfaces:**
- Produces: Session token storage, login verification via backend callable, and models.

- [ ] **Step 1: Create `frontend/src/services/auth.ts`**

```typescript
const SESSION_KEY = 'tp_session_token';
const ROSTER_KEY = 'tp_roster_id';

export function saveSession(rosterId: number, sessionToken: string) {
  localStorage.setItem(ROSTER_KEY, rosterId.toString());
  localStorage.setItem(SESSION_KEY, sessionToken);
}

export function getSession(): { rosterId: number; sessionToken: string } | null {
  const roster = localStorage.getItem(ROSTER_KEY);
  const token = localStorage.getItem(SESSION_KEY);
  if (!roster || !token) return null;
  return { rosterId: parseInt(roster, 10), sessionToken: token };
}

export function clearSession() {
  localStorage.removeItem(ROSTER_KEY);
  localStorage.removeItem(SESSION_KEY);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/services/auth.ts
git commit -m "feat: implement frontend session token storage service"
```

---

### Task 8: Interactive UI Modals (Manual Ticket Grading & Custom Props)

**Files:**
- Create: `frontend/src/components/GradeTicketModal.tsx`
- Modify: `frontend/src/components/PickModal.tsx`

**Interfaces:**
- Produces: UI dialog for manual Won/Lost/Push grading and custom prop entry with user odds.

- [ ] **Step 1: Create `frontend/src/components/GradeTicketModal.tsx`**

```tsx
import React, { useState } from 'react';
import { CheckCircle, XCircle, MinusCircle, X } from 'lucide-react';
import { WeeklyParlay, ParlayLeg } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  parlay: WeeklyParlay;
  onSaveGrades: (grades: Record<string, string>) => void;
}

export const GradeTicketModal: React.FC<Props> = ({ isOpen, onClose, parlay, onSaveGrades }) => {
  const [grades, setGrades] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    parlay.legs.forEach(l => { init[l.id] = l.result_status || 'pending'; });
    return init;
  });

  if (!isOpen) return null;

  const setLegStatus = (id: string, status: string) => {
    setGrades(prev => ({ ...prev, [id]: status }));
  };

  const handleSave = () => {
    onSaveGrades(grades);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-sleeper-card border border-sleeper-border rounded-xl w-full max-w-lg p-5 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">Grade Week {parlay.week} Parlay</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {parlay.legs.map((leg) => {
            const current = grades[leg.id];
            return (
              <div key={leg.id} className="p-3 bg-sleeper-dark rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white">{leg.owner_name}</span>
                  <p className="text-xs text-gray-300">{leg.description}</p>
                </div>
                <div className="flex space-x-1.5">
                  <button
                    onClick={() => setLegStatus(leg.id, 'won')}
                    className={`p-1.5 rounded ${current === 'won' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                    title="Won"
                  >
                    <CheckCircle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setLegStatus(leg.id, 'lost')}
                    className={`p-1.5 rounded ${current === 'lost' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                    title="Lost"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setLegStatus(leg.id, 'push')}
                    className={`p-1.5 rounded ${current === 'push' ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                    title="Push / Void"
                  >
                    <MinusCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={handleSave}
          className="w-full py-2.5 bg-sleeper-accent text-black font-bold rounded-lg hover:brightness-110 transition mt-5"
        >
          Save Ticket Grading
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/GradeTicketModal.tsx
git commit -m "feat: implement manual ticket grading modal"
```

---

### Task 9: App Assembly & Full Verification

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/ParlayCard.tsx`

**Interfaces:**
- Produces: Integrated frontend showing countdown to earliest kickoff and button to launch Grade Ticket dialog.

- [ ] **Step 1: Update `frontend/src/components/ParlayCard.tsx` with Earliest Kickoff Badge**

```tsx
import React from 'react';
import { AlertTriangle, Lock, Clock } from 'lucide-react';
import { WeeklyParlay } from '../types';

interface Props {
  parlay: WeeklyParlay;
  onOpenPickModal: (rosterId: number) => void;
  currentRosterId: number | null;
  onOpenGradeModal: () => void;
}

export const ParlayCard: React.FC<Props> = ({ parlay, onOpenPickModal, currentRosterId, onOpenGradeModal }) => {
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
            {parlay.status === 'locked' ? (parlay.resolution === 'pending' ? 'Locked' : parlay.resolution.toUpperCase()) : 'Open'}
          </span>
        </div>
      </div>

      {parlay.earliest_kickoff && parlay.status === 'open' && (
        <div className="bg-blue-950/40 border-b border-blue-500/30 p-2.5 flex items-center space-x-2 text-xs text-blue-200">
          <Clock className="w-4 h-4 text-blue-400 shrink-0" />
          <span>Ticket must be locked before earliest leg kicks off ({new Date(parlay.earliest_kickoff).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>
        </div>
      )}

      {parlay.contains_sgp && (
        <div className="bg-amber-950/40 border-b border-amber-500/30 p-3 flex items-start space-x-2">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200 leading-relaxed">
            <strong>Same Game Parlay (SGP) Detected:</strong> Multiple legs share the same game. Sportsbooks discount correlated odds. Check your betting app for actual payout.
          </p>
        </div>
      )}

      <div className="divide-y divide-sleeper-border">
        {parlay.legs.map((leg, index) => (
          <div key={leg.id || index} className="p-3 hover:bg-white/5 transition flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-xs font-bold text-gray-500 w-4">{index + 1}</span>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-semibold text-white">{leg.owner_name}</span>
                  {leg.result_status === 'won' && <span className="text-xs text-emerald-400 font-bold">✅ Won</span>}
                  {leg.result_status === 'lost' && <span className="text-xs text-red-400 font-bold">❌ Lost</span>}
                  {leg.result_status === 'push' && <span className="text-xs text-amber-400 font-bold">⚪ Push</span>}
                </div>
                <p className="text-xs text-gray-300 mt-0.5">{leg.description}</p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/40 px-2 py-1 rounded">
              {leg.odds_american}
            </span>
          </div>
        ))}
      </div>

      {parlay.status === 'locked' && (
        <div className="p-3 bg-sleeper-dark/40 border-t border-sleeper-border text-center">
          <button
            onClick={onOpenGradeModal}
            className="text-xs font-bold text-sleeper-accent hover:underline"
          >
            📋 Grade Ticket Legs
          </button>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Update `frontend/src/App.tsx` with Grade Modal Handlers**

```tsx
import React, { useState } from 'react';
import { BettorBanner } from './components/BettorBanner';
import { ParlayCard } from './components/ParlayCard';
import { PickModal } from './components/PickModal';
import { BreakGlassModal } from './components/BreakGlassModal';
import { GradeTicketModal } from './components/GradeTicketModal';
import { SleeperChatExport } from './components/SleeperChatExport';
import { WeeklyParlay } from './types';

const initialMockParlay: WeeklyParlay = {
  week: 4,
  season: '2026',
  status: 'open',
  resolution: 'pending',
  contains_sgp: false,
  bettor: {
    roster_id: 2,
    team_name: 'Gridiron Clowns',
    owner_name: 'Bob',
    points_last_week: 78.4
  },
  earliest_kickoff: '2026-09-24T20:15:00Z',
  legs: [
    {
      id: 'l1',
      roster_id: 1,
      team_name: 'Philly Special',
      owner_name: 'Blake',
      nfl_team: 'PHI',
      description: 'Eagles -3.5 Spread',
      odds_american: '-110',
      odds_decimal: 1.91,
      is_default_roll: false,
      status: 'submitted',
      result_status: 'pending',
      kickoff_time: '2026-09-27T17:00:00Z'
    },
    {
      id: 'l2',
      roster_id: 2,
      team_name: 'Gridiron Clowns',
      owner_name: 'Bob',
      nfl_team: 'KC',
      description: 'Chiefs Moneyline',
      odds_american: '-130',
      odds_decimal: 1.77,
      is_default_roll: false,
      status: 'submitted',
      result_status: 'pending',
      kickoff_time: '2026-09-24T20:15:00Z' // TNF
    }
  ],
  estimated_odds_american: '+238',
  estimated_multiplier: 3.38,
  estimated_payout: 16.90,
  actual_payout: null
};

export const App: React.FC = () => {
  const [parlay, setParlay] = useState<WeeklyParlay>(initialMockParlay);
  const [isPickOpen, setIsPickOpen] = useState(false);
  const [isBreakGlassOpen, setIsBreakGlassOpen] = useState(false);
  const [isGradeOpen, setIsGradeOpen] = useState(false);
  const [currentRosterId] = useState<number>(1);

  const handleSaveGrades = (grades: Record<string, string>) => {
    let hasLoss = false;
    let allDecided = true;
    const updatedLegs = parlay.legs.map(leg => {
      const g = grades[leg.id] as any || leg.result_status;
      if (g === 'lost') hasLoss = true;
      if (g === 'pending') allDecided = false;
      return { ...leg, result_status: g };
    });

    setParlay(prev => ({
      ...prev,
      legs: updatedLegs,
      resolution: hasLoss ? 'lost' : (allDecided ? 'won' : 'pending')
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
        onOpenGradeModal={() => setIsGradeOpen(true)}
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

      <GradeTicketModal
        isOpen={isGradeOpen}
        onClose={() => setIsGradeOpen(false)}
        parlay={parlay}
        onSaveGrades={handleSaveGrades}
      />
    </div>
  );
};
```

- [ ] **Step 3: Run full backend unit tests**

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/ -v`  
Expected: PASS (All 14 tests passing)

- [ ] **Step 4: Build frontend bundle to verify TypeScript & styles**

Run: `cd frontend && npm run build`  
Expected: `vite build` succeeds with zero errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: integrate earliest kickoff countdown, manual grading modal, and verify build"
```
