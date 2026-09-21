# NFL Fantasy Team Parlay Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight, mobile-first web app for an NFL fantasy football league on Sleeper to manage their weekly \$5 team parlay.

**Architecture:** A serverless stack featuring Python Firebase Cloud Functions (v2) for business logic, Sleeper API sync (including active player autocomplete cache), and mainline odds caching; Cloud Firestore for persistence; and a responsive React (Vite) + Tailwind CSS client hosted on Firebase Hosting.

**Tech Stack:** Python 3.11, `firebase_functions`, `google-cloud-firestore`, React 18, Vite, Tailwind CSS, Lucide React, Pytest.

## Global Constraints

- **No Win/Loss Tracking:** Past slips archive is strictly read-only historical record of past weeks' tickets and bettors. No grading engine or win/loss records.
- **Player Props Autocomplete:** Pulls and caches Sleeper's active NFL players database (`/v1/players/nfl`) to autocomplete player names and automatically tag their NFL teams.
- **Security:** 4-digit PINs are verified on the backend; the backend issues a cryptographically secure random `uuid4()` session token stored in `localStorage`.
- **API Quota:** Automated CRON queries strictly mainline markets (moneyline, spread, totals) at 1 credit per call (~40 requests/month out of 500 limit).
- **Earliest Kickoff Rule:** The finalization deadline is strictly the kickoff of the earliest leg on the ticket. If TNF is included, the ticket finalizes before Thursday kickoff.
- **Deterministic Tie-Breaker:** Hierarchy: 1) Weekly Pts $\to$ 2) Season PF $\to$ 3) Season Max PF $\to$ 4) Alphabetical.

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
        │   ├── firebase.ts
        │   └── auth.ts
        └── components/
            ├── BettorBanner.tsx
            ├── ParlayCard.tsx
            ├── PickModal.tsx
            ├── PlayerSearchInput.tsx
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
    match /{document=**} {
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
        {"odds_american": "-110"},
        {"odds_american": "+150"},
        {"odds_american": "-200"},
    ]
    result = calculate_parlay(legs, stake=5.0)
    assert result["multiplier"] == pytest.approx(7.159, 0.01)
    assert result["estimated_payout"] == pytest.approx(35.80, 0.05)
    assert result["odds_american"] == "+616"

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

### Task 3: Sleeper Sync, Tie-Breakers & Active Player Cache

**Files:**
- Create: `functions/sleeper_sync.py`
- Create: `functions/tests/test_sleeper_sync.py`

**Interfaces:**
- Produces:
  - `determine_weekly_bettor(matchups: list[dict], rosters: list[dict], users: list[dict]) -> dict`
  - `fetch_active_nfl_players(players_raw: dict) -> list[dict]`

- [ ] **Step 1: Write failing tests for tie-breaker and active players filter**

Create `functions/tests/test_sleeper_sync.py`:
```python
import pytest
from sleeper_sync import determine_weekly_bettor, fetch_active_nfl_players

def test_determine_weekly_bettor():
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

def test_fetch_active_nfl_players():
    raw_data = {
        "p1": {"first_name": "Saquon", "last_name": "Barkley", "team": "PHI", "position": "RB", "status": "Active"},
        "p2": {"first_name": "Patrick", "last_name": "Mahomes", "team": "KC", "position": "QB", "status": "Active"},
        "p3": {"first_name": "Retired", "last_name": "Player", "team": None, "position": "WR", "status": "Inactive"},
        "p4": {"first_name": "Offensive", "last_name": "Lineman", "team": "DET", "position": "OT", "status": "Active"}
    }
    active = fetch_active_nfl_players(raw_data)
    assert len(active) == 2
    assert active[0]["name"] == "Saquon Barkley"
    assert active[0]["team"] == "PHI"
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

def fetch_active_nfl_players(players_raw: Dict[str, Any]) -> List[Dict[str, Any]]:
    # Filter to active offensive skill positions with an NFL team
    valid_positions = {"QB", "RB", "WR", "TE", "K", "DEF"}
    active_players = []

    for pid, p in players_raw.items():
        team = p.get("team")
        pos = p.get("position")
        status = p.get("status")

        if team and pos in valid_positions and status == "Active":
            name = f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
            if not name:
                name = p.get("search_full_name", pid)
            active_players.append({
                "id": pid,
                "name": name,
                "team": team.upper(),
                "position": pos
            })

    active_players.sort(key=lambda x: x["name"])
    return active_players

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
git commit -m "feat: implement sleeper sync, deterministic bettor selection, and active player cache"
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

- [ ] **Step 1: Write failing tests for auth utilities**

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

### Task 5: Odds Engine & Earliest Kickoff Finalization

**Files:**
- Create: `functions/odds_engine.py`
- Create: `functions/tests/test_odds_engine.py`
- Create: `functions/main.py`

**Interfaces:**
- Produces:
  - `calculate_earliest_kickoff(legs: list[dict]) -> Optional[str]`
  - `roll_default_leg(team_defaults: list[dict], bye_teams: list[str], active_odds_cache: dict) -> dict`
  - `handle_finalize_parlay(...) -> dict`

- [ ] **Step 1: Write failing tests for earliest kickoff and default roll**

Create `functions/tests/test_odds_engine.py`:
```python
import pytest
from odds_engine import calculate_earliest_kickoff, roll_default_leg

def test_calculate_earliest_kickoff():
    legs = [
        {"kickoff_time": "2026-09-27T17:00:00Z"},
        {"kickoff_time": "2026-09-24T20:15:00Z"},
    ]
    assert calculate_earliest_kickoff(legs) == "2026-09-24T20:15:00Z"

def test_roll_default_leg_mainlines():
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

- [ ] **Step 3: Implement `functions/odds_engine.py` and `functions/main.py`**

Create `functions/odds_engine.py`:
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
            "status": "submitted",
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
        "status": "submitted",
        "kickoff_time": commence_time
    }
```

Create `functions/main.py`:
```python
from typing import Dict, Any, List, Optional
from datetime import datetime
from parlay_math import calculate_parlay
from odds_engine import roll_default_leg, calculate_earliest_kickoff
from auth_utils import create_break_glass_log

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

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/ -v`  
Expected: PASS (All backend tests passing)

- [ ] **Step 5: Commit**

```bash
git add functions/odds_engine.py functions/main.py functions/tests/test_odds_engine.py
git commit -m "feat: implement earliest kickoff parlay finalization and default rolling"
```

---

### Task 6: Frontend Models & Session Auth Service

**Files:**
- Create: `frontend/src/types.ts`
- Create: `frontend/src/services/auth.ts`

**Interfaces:**
- Produces: Session token storage, login verification via backend callable, and models with Sleeper player cache.

- [ ] **Step 1: Create `frontend/src/types.ts`**

```typescript
export interface ActivePlayer {
  id: string;
  name: string;
  team: string;
  position: string;
}

export interface DefaultLeg {
  id: string;
  nfl_team: string;
  market_type: 'moneyline' | 'spread' | 'game_total';
  direction?: 'favorite' | 'underdog' | 'over' | 'under';
  description_template: string;
}

export interface TeamProfile {
  roster_id: number;
  owner_id: string;
  owner_name: string;
  team_name: string;
  avatar_url?: string;
  default_legs: DefaultLeg[];
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
  kickoff_time?: string;
}

export interface WeeklyParlay {
  week: number;
  season: string;
  status: 'open' | 'locked';
  contains_sgp: boolean;
  bettor: {
    roster_id: number;
    team_name: string;
    owner_name: string;
    points_last_week: number;
  };
  earliest_kickoff: string | null;
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

- [ ] **Step 2: Create `frontend/src/services/auth.ts`**

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

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types.ts frontend/src/services/auth.ts
git commit -m "feat: define frontend data types and session authentication service"
```

---

### Task 7: Player Autocomplete Search & Pick Modal

**Files:**
- Create: `frontend/src/components/PlayerSearchInput.tsx`
- Create: `frontend/src/components/PickModal.tsx`

**Interfaces:**
- Produces: Typeahead search for Sleeper active players and pick modal integrating mainlines and player props.

- [ ] **Step 1: Create `frontend/src/components/PlayerSearchInput.tsx`**

```tsx
import React, { useState } from 'react';
import { Search, User } from 'lucide-react';
import { ActivePlayer } from '../types';

interface Props {
  players: ActivePlayer[];
  onSelectPlayer: (player: ActivePlayer) => void;
  selectedPlayer: ActivePlayer | null;
}

export const PlayerSearchInput: React.FC<Props> = ({ players, onSelectPlayer, selectedPlayer }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const filtered = query.length >= 2
    ? players.filter(p => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];

  return (
    <div className="relative">
      <label className="block text-xs font-semibold text-gray-400 mb-1">Search NFL Player</label>
      <div className="relative">
        <input
          type="text"
          placeholder={selectedPlayer ? `${selectedPlayer.name} (${selectedPlayer.team} - ${selectedPlayer.position})` : "Type player name (e.g. Saquon, Henry)..."}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          className="w-full bg-sleeper-dark border border-sleeper-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:border-sleeper-accent focus:outline-none"
        />
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
      </div>

      {isOpen && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-sleeper-card border border-sleeper-border rounded-lg shadow-xl overflow-hidden divide-y divide-sleeper-border">
          {filtered.map(p => (
            <li
              key={p.id}
              onClick={() => {
                onSelectPlayer(p);
                setQuery('');
                setIsOpen(false);
              }}
              className="p-2.5 hover:bg-white/10 cursor-pointer flex items-center justify-between text-xs"
            >
              <div className="flex items-center space-x-2">
                <User className="w-3.5 h-3.5 text-gray-400" />
                <span className="font-semibold text-white">{p.name}</span>
              </div>
              <span className="text-gray-400 font-mono">{p.team} • {p.position}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Create `frontend/src/components/PickModal.tsx`**

```tsx
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { ActivePlayer } from '../types';
import { PlayerSearchInput } from './PlayerSearchInput';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmitPick: (pick: { description: string; nfl_team: string; odds_american: string; kickoff_time?: string }) => void;
  rosterName: string;
  activePlayers: ActivePlayer[];
}

export const PickModal: React.FC<Props> = ({ isOpen, onClose, onSubmitPick, rosterName, activePlayers }) => {
  const [tab, setTab] = useState<'mainline' | 'prop' | 'custom'>('prop');
  const [selectedPlayer, setSelectedPlayer] = useState<ActivePlayer | null>(null);
  const [propText, setPropText] = useState('Anytime TD');
  const [team, setTeam] = useState('KC');
  const [market, setMarket] = useState('spread');
  const [customText, setCustomText] = useState('');
  const [odds, setOdds] = useState('-110');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === 'prop' && selectedPlayer) {
      onSubmitPick({
        description: `${selectedPlayer.name} - ${propText}`,
        nfl_team: selectedPlayer.team,
        odds_american: odds
      });
    } else if (tab === 'mainline') {
      onSubmitPick({
        description: `${team} ${market.toUpperCase()}`,
        nfl_team: team,
        odds_american: '-110'
      });
    } else {
      onSubmitPick({
        description: customText,
        nfl_team: team,
        odds_american: odds
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
      <div className="bg-sleeper-card border border-sleeper-border rounded-xl w-full max-w-md p-5 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">Pick Leg for {rosterName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex border-b border-sleeper-border mb-4">
          <button
            onClick={() => setTab('prop')}
            className={`pb-2 px-3 text-xs font-bold ${tab === 'prop' ? 'text-sleeper-accent border-b-2 border-sleeper-accent' : 'text-gray-400'}`}
          >
            Player Prop
          </button>
          <button
            onClick={() => setTab('mainline')}
            className={`pb-2 px-3 text-xs font-bold ${tab === 'mainline' ? 'text-sleeper-accent border-b-2 border-sleeper-accent' : 'text-gray-400'}`}
          >
            Game Line
          </button>
          <button
            onClick={() => setTab('custom')}
            className={`pb-2 px-3 text-xs font-bold ${tab === 'custom' ? 'text-sleeper-accent border-b-2 border-sleeper-accent' : 'text-gray-400'}`}
          >
            Custom
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'prop' ? (
            <>
              <PlayerSearchInput
                players={activePlayers}
                selectedPlayer={selectedPlayer}
                onSelectPlayer={(p) => setSelectedPlayer(p)}
              />
              {selectedPlayer && (
                <div className="p-2 bg-sleeper-dark rounded text-xs text-emerald-300 font-medium">
                  Selected: {selectedPlayer.name} ({selectedPlayer.team})
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Prop Line / Milestone</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Anytime TD, Over 74.5 Rush Yds, 2+ TDs"
                  value={propText}
                  onChange={(e) => setPropText(e.target.value)}
                  className="w-full bg-sleeper-dark border border-sleeper-border rounded-lg p-2.5 text-sm text-white"
                />
              </div>
            </>
          ) : tab === 'mainline' ? (
            <>
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
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Market</label>
                <select
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                  className="w-full bg-sleeper-dark border border-sleeper-border rounded-lg p-2.5 text-sm text-white"
                >
                  <option value="spread">Team Spread (-110)</option>
                  <option value="moneyline">Moneyline</option>
                  <option value="game_total">Game Total Over (-110)</option>
                </select>
              </div>
            </>
          ) : (
            <>
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
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lions 1st Half Over 13.5"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  className="w-full bg-sleeper-dark border border-sleeper-border rounded-lg p-2.5 text-sm text-white"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">American Odds from Sportsbook</label>
            <input
              type="text"
              required
              placeholder="-110 or +150"
              value={odds}
              onChange={(e) => setOdds(e.target.value)}
              className="w-full bg-sleeper-dark border border-sleeper-border rounded-lg p-2.5 text-sm text-white font-mono"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-sleeper-accent text-black font-bold rounded-lg hover:brightness-110 transition mt-2"
          >
            Submit Leg
          </button>
        </form>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PlayerSearchInput.tsx frontend/src/components/PickModal.tsx
git commit -m "feat: implement sleeper active players autocomplete and pick modal"
```

---

### Task 8: Read-Only Past Slips Archive & App Integration

**Files:**
- Create: `frontend/src/components/PastSlipsArchive.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Produces: Clean, read-only past slips drawer without win/loss tracking, fully assembled into the app shell.

- [ ] **Step 1: Create `frontend/src/components/PastSlipsArchive.tsx`**

```tsx
import React from 'react';
import { History, X } from 'lucide-react';
import { WeeklyParlay } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  pastParlays: WeeklyParlay[];
}

export const PastSlipsArchive: React.FC<Props> = ({ isOpen, onClose, pastParlays }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-sleeper-card border border-sleeper-border rounded-xl w-full max-w-lg p-5 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-2">
            <History className="w-5 h-5 text-sleeper-accent" />
            <h3 className="text-lg font-bold text-white">Past Parlay Slips</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {pastParlays.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">No past parlay slips recorded yet.</p>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
            {pastParlays.map(p => (
              <div key={p.week} className="p-3 bg-sleeper-dark rounded-lg border border-sleeper-border">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-sleeper-accent uppercase">Week {p.week}</span>
                  <span className="text-xs text-gray-400">Bettor: {p.bettor.owner_name}</span>
                </div>
                <div className="text-xs text-white font-bold mb-2">
                  Odds: {p.actual_odds_american || p.estimated_odds_american} • Payout: ${p.actual_payout?.toFixed(2) || p.estimated_payout.toFixed(2)}
                </div>
                <ul className="text-[11px] text-gray-300 space-y-1">
                  {p.legs.map((l, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{l.owner_name}: {l.description}</span>
                      <span className="font-mono text-gray-400">{l.odds_american}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Update `frontend/src/App.tsx`**

```tsx
import React, { useState } from 'react';
import { BettorBanner } from './components/BettorBanner';
import { ParlayCard } from './components/ParlayCard';
import { PickModal } from './components/PickModal';
import { BreakGlassModal } from './components/BreakGlassModal';
import { PastSlipsArchive } from './components/PastSlipsArchive';
import { SleeperChatExport } from './components/SleeperChatExport';
import { WeeklyParlay, ActivePlayer } from './types';

const mockActivePlayers: ActivePlayer[] = [
  { id: '1', name: 'Saquon Barkley', team: 'PHI', position: 'RB' },
  { id: '2', name: 'Derrick Henry', team: 'BAL', position: 'RB' },
  { id: '3', name: 'Patrick Mahomes', team: 'KC', position: 'QB' },
  { id: '4', name: 'Amon-Ra St. Brown', team: 'DET', position: 'WR' },
  { id: '5', name: 'Josh Allen', team: 'BUF', position: 'QB' },
];

const mockCurrentParlay: WeeklyParlay = {
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
  earliest_kickoff: '2026-09-24T20:15:00Z',
  legs: [
    {
      id: 'l1',
      roster_id: 1,
      team_name: 'Philly Special',
      owner_name: 'Blake',
      nfl_team: 'PHI',
      description: 'Saquon Barkley - Anytime TD',
      odds_american: '-115',
      odds_decimal: 1.87,
      is_default_roll: false,
      status: 'submitted',
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
      kickoff_time: '2026-09-24T20:15:00Z'
    }
  ],
  estimated_odds_american: '+231',
  estimated_multiplier: 3.31,
  estimated_payout: 16.55,
  actual_payout: null
};

export const App: React.FC = () => {
  const [parlay, setParlay] = useState<WeeklyParlay>(mockCurrentParlay);
  const [isPickOpen, setIsPickOpen] = useState(false);
  const [isBreakGlassOpen, setIsBreakGlassOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [currentRosterId] = useState<number>(1);

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
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsArchiveOpen(true)}
            className="text-xs bg-sleeper-card border border-sleeper-border px-2.5 py-1 rounded text-gray-300 hover:text-white"
          >
            History
          </button>
          <span className="text-xs bg-sleeper-border px-2 py-1 rounded text-gray-300 font-mono">
            Week {parlay.week}
          </span>
        </div>
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
        activePlayers={mockActivePlayers}
      />

      <BreakGlassModal
        isOpen={isBreakGlassOpen}
        onClose={() => setIsBreakGlassOpen(false)}
        onConfirm={handleFinalize}
        bettorName={parlay.bettor.owner_name}
        isBettor={parlay.bettor.roster_id === currentRosterId}
      />

      <PastSlipsArchive
        isOpen={isArchiveOpen}
        onClose={() => setIsArchiveOpen(false)}
        pastParlays={[]}
      />
    </div>
  );
};
```

- [ ] **Step 3: Run full backend unit tests**

Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests/ -v`  
Expected: PASS (All tests passing)

- [ ] **Step 4: Build frontend bundle to verify TypeScript & styles**

Run: `cd frontend && npm run build`  
Expected: `vite build` completes with zero errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: complete frontend assembly with sleeper player autocomplete and read-only archive"
```
