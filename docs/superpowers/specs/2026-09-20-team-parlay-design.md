# Team Parlay Manager: Design Specification

**Date:** 2026-09-20  
**Project:** Team Parlay Fantasy Football Web App  
**Status:** Revised Draft / Incorporating Security & Betting Mechanics Feedback  

---

## 1. Overview & Goals

In an NFL fantasy football league, each week the team scoring the lowest points is designated as the weekly "Bettor" and is on the hook to fund a \$5 team parlay ticket. Every league member is entitled to submit one "leg" to construct the combined parlay ticket.

### Core Problems Solved
1. **Automated Bettor Identification:** Syncs with Sleeper matchups each Tuesday to find the lowest-scoring team with a strictly deterministic tie-breaker hierarchy.
2. **Weekly Pick Flexibility:** Members can select live sportsbook lines (spreads, moneylines, totals, player props) or input custom lines/alternate targets.
3. **Intent-Based Default Legs Pool:** Members configure 3–5 recurring favorite bets (e.g. *Chiefs Spread*, *Derrick Henry Rushing Over*). If a member fails to pick, the system automatically rolls an eligible default leg, dynamically snapping to whatever the current week's line is.
4. **Partial Locking & Kickoff Schedule Handling:** Legs lock individually at game kickoff (e.g., Thursday Night Football). Finalizing the ticket on Sunday morning preserves any previously locked TNF legs rather than overwriting them.
5. **Accurate SGP & Correlation Handling:** Detects correlated same-game legs, flags tickets with a clear `contains_sgp` indicator and payout divergence warning, and facilitates entering the actual sportsbook odds/URL.
6. **Post-Placement Bet Lifecycle:** Supports leg-level resolutions (`won`, `lost`, `voided`, `push`) and overall parlay outcomes for an accurate historical ledger.
7. **Secure, Zero-Friction Auth & Break-Glass Finalization:** Salted SHA-256 hash storage in `localStorage` (no plaintext PINs). The weekly bettor holds primary finalization authority, with a transparent "break-glass" override for any league member.
8. **Automated Quota & Rate Limit Protection:** Strict backend caching via scheduled Cloud Scheduler jobs; client requests never query The Odds API directly.

---

## 2. Architecture & External Integration

```
                             +-----------------------------------+
                             |     React (Vite) + Tailwind CSS   |
                             |       Mobile-First Web Client     |
                             +-----------------------------------+
                                               |
                        +----------------------+----------------------+
                        | (Firestore Reads/Writes)                    | (Callable Functions)
                        v                                             v
             +---------------------+                       +---------------------+
             |   Cloud Firestore   |                       |   Python Firebase   |
             | - League Config     |                       |   Cloud Functions   |
             | - Teams & Defaults  |                       | - sync_sleeper      |
             | - Weekly Parlays    |                       | - finalize_parlay   |
             | - Cached Odds Data  |<---+                  | - resolve_parlay    |
             +---------------------+    |                  +---------------------+
                                        |                             |
                             +--------------------+                   |
                             |  Cloud Scheduler   |                   v
                             |  (CRON Odds Cache) |            +-------------+
                             +--------------------+            | Sleeper API |
                                        |                      +-------------+
                                        v
                                 +-------------+
                                 |The Odds API |
                                 +-------------+
```

### External Integrations & Scalability
* **Sleeper API:**
  * Uses public endpoints: `/v1/league/<id>`, `/v1/league/<id>/users`, `/v1/league/<id>/rosters`, `/v1/league/<id>/matchups/<week>`.
  * *Requirement:* The Sleeper league must be set to **Public** (default for fantasy leagues).
* **The Odds API (Quota Management):**
  * Free tier limit: 500 requests/month (~125 requests/week).
  * **Client Isolation:** The frontend *never* calls The Odds API directly.
  * **CRON Caching (Firebase Cloud Scheduler $\to$ Python Function):**
    * Thursdays, Fridays, Saturdays: Fetched twice daily (e.g., 10:00 AM and 6:00 PM ET).
    * Sundays: Hourly from 9:00 AM to 1:00 PM ET.
    * Writes directly to `odds_cache/nfl` in Firestore. All client pickers read solely from this cache.

---

## 3. Data Model (Firestore)

### 3.1 `leagues/{league_id}`
```typescript
interface LeagueConfig {
  sleeper_league_id: string; // e.g. "112482394829384923"
  season: string;            // e.g. "2026"
  current_week: number;      // e.g. 4
  league_salt: string;       // Unique salt for PIN hashing
  requires_public_sleeper: boolean;
  updated_at: Timestamp;
}
```

### 3.2 `teams/{roster_id}`
```typescript
interface TeamProfile {
  roster_id: number;         // Sleeper roster ID (1 to 12)
  owner_id: string;          // Sleeper user ID
  owner_name: string;        // Sleeper display name
  team_name: string;         // Fantasy team name
  avatar_url: string;        // Avatar image URL
  pin_hash: string;          // SHA-256(raw_pin + league_salt)
  default_legs: DefaultLeg[];// Intent-based fallback pool
  historical_stats: {
    legs_hit: number;
    legs_missed: number;
    legs_voided_or_pushed: number;
    times_on_the_hook: number;
  };
}

interface DefaultLeg {
  id: string;
  nfl_team: string;          // e.g. "KC", "BAL", "PHI"
  market_type: 'moneyline' | 'spread' | 'game_total' | 'player_prop';
  player_name?: string;      // e.g. "Derrick Henry"
  prop_type?: 'rush_yds' | 'pass_yds' | 'rec_yds' | 'anytime_td';
  direction?: 'over' | 'under';
  description_template: string; // e.g. "Derrick Henry OVER Rush Yards"
}
```

### 3.3 `parlays/{week}`
```typescript
interface WeeklyParlay {
  week: number;
  season: string;
  status: 'open' | 'locked';
  resolution: 'pending' | 'won' | 'lost' | 'voided'; // Post-game tracking
  contains_sgp: boolean;                  // True if multiple legs are from the same game
  bettor: {
    roster_id: number;
    team_name: string;
    owner_name: string;
    points_last_week: number;
  };
  legs: ParlayLeg[];
  estimated_odds_american: string;        // e.g. "+1450"
  estimated_multiplier: number;           // e.g. 15.50
  estimated_payout: number;               // $5 * multiplier
  actual_payout: number | null;           // Actual sportsbook payout override
  actual_odds_american: string | null;    // Actual sportsbook odds
  sportsbook_url?: string;                // Link to digital slip (DraftKings/FanDuel share link)
  finalized_at: Timestamp | null;
  finalized_by: {
    roster_id: number;
    owner_name: string;
    is_break_glass: boolean;
  } | null;
}

interface ParlayLeg {
  id: string;
  roster_id: number;
  team_name: string;
  owner_name: string;
  game_id: string;                        // Unique game identifier for SGP detection
  nfl_team: string;                       // e.g. "PHI"
  description: string;                    // e.g. "Saquon Barkley OVER 78.5 Rush Yards"
  odds_american: string;                  // e.g. "-115"
  odds_decimal: number;                   // e.g. 1.87
  is_default_roll: boolean;               // True if auto-selected during finalization
  status: 'pending' | 'submitted';
  result_status: 'pending' | 'won' | 'lost' | 'voided' | 'push'; // Leg outcome
  kickoff_time: Timestamp;                // Game commencement time
  locked_at: Timestamp | null;            // Set when game kicks off or ticket is finalized
}
```

### 3.4 `odds_cache/nfl`
```typescript
interface OddsCache {
  week: number;
  last_fetched: Timestamp;
  games: CachedGame[];
}

interface CachedGame {
  game_id: string;
  home_team: string;
  away_team: string;
  commence_time: string; // ISO 8601
  spread: { home: number; away: number; home_odds: string; away_odds: string };
  moneyline: { home_odds: string; away_odds: string };
  total: { over_under: number; over_odds: string; under_odds: string };
  player_props: {
    player_name: string;
    prop: string;
    line: number;
    over_odds?: string;
    under_odds?: string;
    odds?: string;
  }[];
}
```

---

## 4. AuthN & AuthZ Architecture

### 4.1 Secure PIN Handling (No Plaintext Storage)
1. **Entry:** During initial onboarding or login, the user enters their 4-digit PIN in the browser.
2. **Hashing:** The frontend immediately computes:
   $$\text{PIN\_Hash} = \text{SHA-256}(\text{raw\_pin} + \text{league\_salt})$$
3. **Storage:**
   * The **raw PIN is never saved** to `localStorage`, `sessionStorage`, or cookies. It exists only in transient memory during entry.
   * `localStorage` stores exclusively `{ roster_id, pin_hash }`.
4. **Backend Verification:**
   * Any callable write function (`submit_leg`, `update_defaults`) requires `{ roster_id, pin_hash }`.
   * The Cloud Function compares the incoming hash directly against `teams/{roster_id}.pin_hash`.

### 4.2 Authorization Matrix
* **Public Read:** Anyone with the league URL can view the current week parlay, leg status, and past slips archive.
* **Member Writes:** Validating `pin_hash` grants write access strictly to that specific `roster_id`'s pick and default pool.
* **Bettor Finalization:** The active bettor's `roster_id` has primary authority to finalize the ticket and roll defaults.
* **Break-Glass Finalization:** Any valid member can trigger `finalize_parlay` if the bettor is unavailable. The backend logs `is_break_glass: true` with the executor's identity.

---

## 5. Domain Logic & Betting Mechanics

### 5.1 Deterministic Bettor Selection (Tuesday Sync)
To avoid any ambiguity or league arguments over who is on the hook, the lowest-scoring team is determined by a strict 4-level hierarchy:
1. **Lowest Weekly Points Scored:** The team with the minimum fantasy points in that week's matchup.
2. **Lowest Season-to-Date Points For (PF):** In case of a tie, the team with fewer cumulative season points is the bettor.
3. **Lowest "Max PF" (Potential Points):** If still tied, the team with lower optimal/max points for the season.
4. **Alphabetical by Team Name:** Absolute deterministic tie-breaker fallback.

*Week 1 Exception:* In Week 1 (no prior scores), the league prompt defaults the bettor to last year's last-place finisher or allows an on-screen selection before games kick off.

### 5.2 Partial Locking & Thursday Night Football (TNF)
* **Individual Leg Locks:**
  * Every leg tracks `kickoff_time`.
  * If a member selects a Thursday Night Football leg, their individual leg locks at TNF kickoff (`locked_at = kickoff_time`).
  * Other league members whose games are on Sunday/Monday can continue to submit or edit their picks until their respective games commence.
* **Preserving TNF Legs on Finalization:**
  * When the bettor (or break-glass user) clicks "Finalize Parlay" on Sunday morning:
    * The engine inspects all legs.
    * Any leg already locked (e.g. TNF pick) is **strictly preserved**.
    * Defaults are rolled only for teams that still have no pick submitted.

### 5.3 Same Game Parlay (SGP) Mechanics & Mathematical Warnings
* **Correlation Detection:**
  * The backend checks `game_id` across all submitted and rolled legs.
  * If two or more legs share the same `game_id` (e.g., *Patrick Mahomes OVER 250 Pass Yds* + *Travis Kelce Anytime TD*), the parlay sets:
    $$\text{contains\_sgp} = \text{true}$$
* **UI Payout Banner & Divergence Warning:**
  * If `contains_sgp == true`, the app displays a prominent amber badge:
    > ⚠️ **Same Game Parlay (SGP) Detected**  
    > Multiple legs are from the same game. Standard parlay odds calculation produces an inflated estimate (+4200) that sportsbooks will discount. Check your sportsbook app for the true payout.
* **Sportsbook Digital Slip Link & Override:**
  * The bettor can enter the actual combined odds, actual payout, and optionally paste their sportsbook share link (`sportsbook_url`), which replaces the estimate on the finalized slip.

### 5.4 Intent-Based Default Legs & Dynamic Line Snapping
* **Intent Definition:** Default legs specify market type and direction, not static numbers:
  * Team Spread: *Chiefs Spread* $\to$ snaps to weekly line (e.g., `-3.5` or `-7.0`).
  * Team Total: *Lions Total OVER* $\to$ snaps to weekly game total (e.g., `Over 51.5`).
  * Player Prop: *Derrick Henry Rush Yards OVER* $\to$ snaps to weekly line (e.g., `Over 74.5`).
  * Anytime TD: *Saquon Barkley Anytime TD* $\to$ snaps to weekly odds.
* **Eligibility Filters:**
  1. NFL team must not be on a bye week.
  2. Game must not have kicked off yet.
  3. Team must not be already represented if the league enforces unique games.
* **Weekly Pick Freedom:** While default legs snap to market lines, **active weekly picks** allow full user freedom: standard lines, alternate lines (e.g., *Henry 100+ yards*), or custom prop descriptions with estimated odds.

### 5.5 Post-Game Resolution & Void/Push Handling
* **Leg Outcomes (`result_status`):**
  * `won`: Leg hit.
  * `lost`: Leg missed.
  * `voided`: Player did not play (inactive) $\to$ removed from multiplier calculation.
  * `push`: Exact tie on whole-number spread/total $\to$ removed from multiplier (reduces parlay by 1 leg).
* **Overall Parlay Resolution (`resolution`):**
  * If any active leg is `lost` $\to$ Parlay `lost`.
  * If all active legs are `won` (or `voided`/`push`) $\to$ Parlay `won`.
  * Updates team records in `teams/{roster_id}.historical_stats` (`legs_hit`, `legs_missed`, `legs_voided_or_pushed`).

---

## 6. Testing & Verification Strategy

### 6.1 Automated Test Suite
* **`test_sleeper_sync.py`:**
  * Test lowest-score detection.
  * Test 4-tier tie-breaker hierarchy (Weekly Pts $\to$ Season PF $\to$ Max PF $\to$ Alphabetical).
  * Test Week 1 initialization.
* **`test_parlay_math.py`:**
  * American to Decimal conversion accuracy across positive and negative odds.
  * Compound parlay multiplier and \$5 payout math.
  * SGP detection logic: asserts `contains_sgp == true` when two legs share a `game_id`.
  * Void/Push reduction: verifies that a voided leg correctly drops the multiplier without busting the parlay.
* **`test_locking_and_defaults.py`:**
  * Partial lock test: confirms TNF leg is locked at kickoff and cannot be edited by the user.
  * Sunday finalization test: confirms previously locked TNF leg is preserved during default rolls.
  * Bye-week & post-kickoff exclusion for default pool items.
  * Dynamic line snapping from cached odds table.
* **`test_security_and_auth.py`:**
  * Verify that raw PIN is never transmitted or stored.
  * Verify SHA-256 + salt matching in Cloud Functions.
  * Assert Team A hash cannot modify Team B's pick or defaults.
  * Verify break-glass execution records audit metadata.

### 6.2 Manual & Emulator Verification
* Run Firebase Local Emulator Suite (Firestore, Functions, Hosting).
* Simulate full weekly progression: Tuesday Sleeper sync $\to$ Thursday TNF pick & partial lock $\to$ Sunday roll of missing defaults $\to$ SGP warning validation $\to$ game result grading $\to$ archive view.
