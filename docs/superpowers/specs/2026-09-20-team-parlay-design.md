# Team Parlay Manager: Design Specification

**Date:** 2026-09-20  
**Project:** Team Parlay Fantasy Football Web App  
**Status:** Draft / Pending Review  

---

## 1. Overview & Goals

In an NFL fantasy football league, each week the team scoring the lowest points is designated as the weekly "Bettor" and is on the hook to fund a \$5 team parlay ticket. Every league member is entitled to submit one "leg" to construct the combined parlay ticket.

### The Problem
Coordinating and chasing 10–12 fantasy managers each week across text threads or group chats to get their betting legs before games kick off is notoriously difficult. People forget, miss deadlines, or submit invalid bets on teams that are on bye.

### The Solution
A lightweight, mobile-first web app tailored for the league:
1. **Automated Bettor Identification:** Automatically syncs with the Sleeper API each Tuesday to find the lowest scoring team from the previous week and puts them "On the Hook."
2. **Weekly Pick Flexibility:** Members can pick live lines from sportsbooks (spreads, moneylines, totals, player props) or enter custom lines/alternate targets of their choosing.
3. **Intent-Based Default Legs Pool:** Members configure a permanent pool of 3–5 recurring favorite bets (e.g. *Chiefs Spread*, *Derrick Henry Rushing Over*). If a member fails to pick, the system automatically selects an eligible default leg, dynamically snapping to whatever the current week's line is.
4. **Schedule & Bye-Week Validation:** Automatically excludes default legs if the player/team is on a bye week or their game has already kicked off.
5. **Parlay Odds & Estimated Payout:** Multiplies individual decimal odds to display the estimated total parlay multiplier and \$5 payout, with clear disclaimer badges and an optional sportsbook slip payout override.
6. **Decentralized Auth & Break-Glass Finalization:** Zero-friction team access via 4-digit PINs. The weekly bettor has primary authorization to finalize and roll the parlay, with an emergency "break-glass" override available for any league mate if the bettor is unavailable.
7. **Sleeper Chat Exporter:** Generates a formatted text card with one-click copy to post into the Sleeper league chat.
8. **Past Slips Archive:** Simple, read-only viewer of past weeks' finalized slips.

---

## 2. Architecture & Tech Stack

```
                             +-----------------------------------+
                             |     React (Vite) + Tailwind CSS   |
                             |       Mobile-First Web Client     |
                             +-----------------------------------+
                                               |
                        +----------------------+----------------------+
                        |                                             |
                        v                                             v
             +---------------------+                       +---------------------+
             |   Cloud Firestore   |                       |   Python Firebase   |
             | - League Config     |                       |   Cloud Functions   |
             | - Teams & Defaults  |                       | - sync_sleeper      |
             | - Weekly Parlays    |                       | - fetch_odds        |
             | - Cached Odds Data  |                       | - finalize_parlay   |
             +---------------------+                       +---------------------+
                        ^                                             |
                        |                                  +----------+----------+
                        |                                  |                     |
                        |                                  v                     v
                        |                           +-------------+       +-------------+
                        +---------------------------| Sleeper API |       |The Odds API |
                                                    +-------------+       +-------------+
```

### Stack Details
* **Frontend:** React 18, Vite, Tailwind CSS, Lucide React icons, deployed to **Firebase Hosting**.
* **Backend:** **Python 3.11** Firebase Cloud Functions (`firebase_functions` v2) enforcing business logic, Sleeper synchronization, and The Odds API integration.
* **Database:** **Google Cloud Firestore** (NoSQL real-time document database).
* **External APIs:**
  * **Sleeper API:** Public read-only REST endpoints (`/v1/league/<id>`, `/v1/league/<id>/users`, `/v1/league/<id>/rosters`, `/v1/league/<id>/matchups/<week>`).
  * **The Odds API:** Free tier (500 requests/month) used with backend caching in Firestore to conserve credits.

---

## 3. Data Model (Firestore)

### 3.1 `leagues/{league_id}`
```typescript
interface LeagueConfig {
  sleeper_league_id: string; // e.g. "112482394829384923"
  season: string;            // e.g. "2026"
  current_week: number;      // e.g. 4
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
  pin_hash: string;          // SHA-256 hash of 4-digit PIN
  default_legs: DefaultLeg[];// Recurring intent-based fallback pool
}

interface DefaultLeg {
  id: string;
  nfl_team: string;          // e.g. "KC", "BAL", "PHI" (used for bye week validation)
  market_type: 'moneyline' | 'spread' | 'game_total' | 'player_prop';
  player_name?: string;      // e.g. "Derrick Henry"
  prop_type?: 'rush_yds' | 'pass_yds' | 'rec_yds' | 'anytime_td';
  direction?: 'over' | 'under'; // Snaps to weekly line automatically
  description_template: string; // e.g. "Derrick Henry OVER Rush Yards" or "Chiefs Spread"
}
```

### 3.3 `parlays/{week}`
```typescript
interface WeeklyParlay {
  week: number;
  season: string;
  status: 'open' | 'locked';
  bettor: {
    roster_id: number;
    team_name: string;
    owner_name: string;
    points_last_week: number;
  };
  legs: ParlayLeg[];
  estimated_odds_american: string; // e.g. "+1450"
  estimated_multiplier: number;    // e.g. 15.50
  estimated_payout: number;        // e.g. 77.50 ($5 * multiplier)
  actual_payout: number | null;    // Bettor override from physical/digital slip
  finalized_at: Timestamp | null;
  finalized_by: {
    roster_id: number;
    owner_name: string;
    is_break_glass: boolean;
  } | null;
}

interface ParlayLeg {
  roster_id: number;
  team_name: string;
  owner_name: string;
  description: string;       // e.g. "Saquon Barkley OVER 78.5 Rush Yards"
  nfl_team: string;          // e.g. "PHI"
  odds_american: string;     // e.g. "-115"
  odds_decimal: number;      // e.g. 1.87
  is_default_roll: boolean;  // true if rolled automatically during finalization
  status: 'pending' | 'submitted';
}
```

### 3.4 `odds_cache/nfl`
```typescript
interface OddsCache {
  week: number;
  last_fetched: Timestamp;
  games: {
    game_id: string;
    home_team: string;
    away_team: string;
    commence_time: string;
    spread: { home: number; away: number; home_odds: string; away_odds: string };
    moneyline: { home_odds: string; away_odds: string };
    total: { over_under: number; over_odds: string; under_odds: string };
    player_props: {
      player_name: string;
      prop: string;
      line: number;
      over_odds?: string;
      under_odds?: string;
      odds?: string; // e.g. Anytime TD
    }[];
  }[];
}
```

---

## 4. AuthN & AuthZ Model

### 4.1 Zero-Friction Authentication (Team PINs)
* **First Visit:** A user selects their team from the dropdown and sets a 4-digit PIN. The frontend computes `hash(pin + salt)` and stores it in Firestore, while saving the raw PIN in `localStorage`.
* **Return Visits:** The app reads `localStorage`, automatically authenticates the user, and restores their session.
* **Write Permissions:**
  * Submitting/editing a weekly leg requires validating that `hash(pin)` matches `teams/{roster_id}.pin_hash`. Team A cannot edit Team B's pick or defaults.
  * Public read-only access for viewing the current parlay slip and the past slips archive.

### 4.2 Authorization & The "Break-Glass" Finalization
* **The Weekly Bettor:**
  * Has primary permission to finalize the ticket, trigger the default leg roll, and input actual sportsbook odds.
* **Break-Glass Emergency Action:**
  * If kickoff is approaching and the weekly bettor is unresponsive, **any verified league member** can click `"⚡ Break Glass: Finalize on Behalf of Bettor"`.
  * The backend validates that the user is a valid league member, executes the finalization roll, and sets:
    ```json
    "finalized_by": {
      "roster_id": 4,
      "owner_name": "Dave",
      "is_break_glass": true
    }
    ```
  * Full audit transparency is displayed on the ticket and included in the Sleeper group chat export.

---

## 5. Detailed Feature Specifications

### 5.1 Bettor Identification & Tuesday Sync
* **Algorithm (`sync_sleeper`):**
  1. Calls Sleeper API `/v1/league/<league_id>/matchups/<prev_week>`.
  2. Parses each roster's `points` field.
  3. Finds the minimum score: `min(roster.points)`.
  4. In the event of a tie, the team with the lower season-to-date total points is selected (or coin flip).
  5. Sets the loser as `bettor` for the new `week` ticket in `open` status.
  * *Week 1 Rule:* For Week 1, the app displays a prompt allowing the league to pick who holds the opening week bet (defaulting to last year's loser or commissioner).

### 5.2 Weekly Pick Submission (Active Pick)
Users have full freedom when submitting their weekly leg:
* **Option A: Live Market Picker (Auto-Odds):**
  * Select Game Line (Moneyline, Spread, Total) or Player Prop (Anytime TD, Rush/Pass/Rec Yds).
  * Filter by NFL team or search by player.
  * Line and odds auto-populate from cached odds data.
* **Option B: Custom Line / Alternate Milestones:**
  * User can customize the target value (e.g. adjust a 68.5 yard line to 100+ yards).
  * Or type freeform text (e.g., *"Eagles score 3+ rushing touchdowns"*), select the NFL team tag, and enter estimated odds (defaulting to `-110`).

### 5.3 Intent-Based Default Legs Pool
* Each team can save 3–5 recurring defaults in **"My Default Pool"**.
* Instead of static numbers, defaults store **Market Intent**:
  * *Spread Intent:* Team + Spread (snaps to whatever the spread is on game week).
  * *Total Intent:* Game + Over/Under (snaps to game total).
  * *Player Prop Intent:* Player + Prop Type (e.g., Derrick Henry + Rush Yards OVER, Saquon Barkley + Anytime TD).
  * *Custom Intent:* Custom text with mandatory NFL team tag.

### 5.4 The Finalization & Roll Engine (`finalize_parlay`)
When the Bettor (or Break-Glass user) clicks Finalize:
1. For every league roster that has not submitted a pick:
   * Load `teams/{roster_id}.default_legs`.
   * **Bye-Week Filter:** Query current week NFL schedule; discard any leg where `nfl_team` is on bye.
   * **Kickoff Filter:** Discard any leg whose game has already kicked off.
   * **Random Selection:** Select one leg at random from remaining eligible options using `random.choice()`.
   * **Line Snapping:** If it's a spread, total, or player prop, lookup the live line from the cached odds table and format the description (e.g., *"Derrick Henry OVER 74.5 Rush Yds (-115)"*).
   * **Fallback:** If all defaults are on bye or none were configured, record as `"No Pick Submitted (All Defaults on Bye)"` without blocking the parlay.
2. Recalculate combined odds and payout.
3. Lock parlay ticket (`status: 'locked'`).

### 5.5 Parlay Odds Calculation & Estimation Badge
* **Math Formula:**
  * Convert American odds to Decimal:
    $$\text{Positive (+X): } D = \frac{X}{100} + 1$$
    $$\text{Negative (-X): } D = \frac{100}{|X|} + 1$$
  * Total Multiplier: $M = \prod_{i=1}^n D_i$
  * American Odds Display:
    $$\text{If } M \ge 2.0: A = \text{round}((M - 1) \times 100)$$
    $$\text{If } M < 2.0: A = \text{round}\left(\frac{-100}{M - 1}\right)$$
  * Estimated \$5 Payout: $\$5 \times M$
* **Disclaimer Badge:** UI explicitly labels:
  > **Estimated Payout: \$84.20 (+1584)**  
  > *Note: Actual sportsbook payout may vary slightly if multiple legs are in the same game (SGP correlation).*
* **Sportsbook Override:** The bettor can input the exact sportsbook ticket payout/odds upon placing the bet, updating the finalized slip.

### 5.6 Sleeper League Chat Exporter
With one click, formats the finalized ticket for the Sleeper group chat:
```markdown
🏈 WEEK 4 TEAM PARLAY 🏈
Bettor: @Dave (Lowest Score: 78.4 pts)
Stake: $5.00 | Est. Payout: $84.20 (+1584)

1. Blake: Ravens ML (-130)
2. Mike: Saquon Barkley Anytime TD (-115)
3. Chris: Lions @ Cardinals OVER 51.5 (-110)
4. Dave (Default Roll 🎲): Derrick Henry OVER 74.5 Rush Yds (-115)
...
Ticket locked. LFG! 🚀
```

### 5.7 Past Slips Archive
* Simple tab/drawer showing all completed weeks (`week < current_week`).
* Displays each week's bettor, final legs, odds, payout, and whether it was finalized standard or via break-glass.

---

## 6. Testing & Verification Strategy

### 6.1 Automated Tests
* **`test_sleeper_sync.py`:**
  * Mock Sleeper matchups endpoint; verify lowest score detection and tie-breaking.
  * Test Week 1 fallback when matchup history is empty.
* **`test_parlay_math.py`:**
  * Test conversion of American odds (`-110`, `+150`, `-250`) to decimal.
  * Verify compound multiplier math against known multi-leg sportsbook parlays.
* **`test_default_roll.py`:**
  * Simulate bye-week scenarios: ensure a player on bye is never selected.
  * Simulate post-kickoff scenarios: ensure a completed Thursday night game is excluded.
  * Test line snapping from market intent to live week lines.
* **`test_authz.py`:**
  * Verify PIN validation: Team A cannot modify Team B's pick or defaults.
  * Test break-glass recording in the finalization payload.

### 6.2 Manual Verification
* Deploy to Firebase Emulator suite (Functions + Firestore + Hosting).
* Simulate full weekly cycle: Sleeper sync $\to$ pick submissions $\to$ default rolls $\to$ parlay lock $\to$ chat export.
