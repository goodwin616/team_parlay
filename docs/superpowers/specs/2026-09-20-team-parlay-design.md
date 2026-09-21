# Team Parlay Manager: Technical Design Specification

**Project:** Team Parlay Fantasy Football Web App  
**Target Platform:** Firebase (Hosting, Firestore, Cloud Functions in Python 3.11)  
**Client Framework:** React 18, Vite, Tailwind CSS, Lucide React  

---

## 1. Executive Summary & Goals

In an NFL fantasy football league, the manager scoring the lowest points each week is designated as the weekly "Bettor" and is responsible for funding a \$5 team parlay ticket. Every league member is entitled to submit one "leg" to build the combined parlay ticket.

This application provides a lightweight, mobile-first web app to manage this weekly ritual without administrative burden:
1. **Automated Bettor Identification:** Automatically syncs with Sleeper matchups each Tuesday to identify the lowest-scoring team using a deterministic 4-tier tie-breaker.
2. **Flexible Weekly Leg Selection:** Members can select live mainline odds (Spread, Moneyline, Total) or build player props using a position-aware picker with autocomplete across all active NFL players.
3. **Intent-Based Default Legs Pool:** Members configure 3–5 recurring fallback rules (e.g. *Eagles Spread*, *Derrick Henry Anytime TD*) with zero API cost. If a member misses the submission deadline, the system rolls an eligible default leg, automatically skipping bye weeks and snapping to current week lines.
4. **Earliest Kickoff Finalization Rule:** Eliminates "dead tickets." The finalization deadline matches the kickoff time of the earliest leg on the ticket (e.g., Thursday night before TNF, or Sunday morning).
5. **Decentralized Auth & Break-Glass Execution:** Secure 4-digit PIN authentication issuing backend session tokens. The weekly bettor holds primary finalization rights, with an emergency "break-glass" override for any league member if the bettor is unreachable.
6. **Pure Read-Only Slips Archive:** Completed weekly slips are preserved in a clean historical archive without any win/loss scoring overhead.
7. **Sleeper Chat Exporter:** Generates a formatted text card with one-click copy for the Sleeper league chat.

---

## 2. System Architecture & Integrations

```
                             +-----------------------------------+
                             |     React (Vite) + Tailwind CSS   |
                             |       Mobile-First Web Client     |
                             +-----------------------------------+
                                               |
                        +----------------------+----------------------+
                        | (Firestore Direct Reads)                    | (HTTPS Callable Functions)
                        v                                             v
             +---------------------+                       +---------------------+
             |   Cloud Firestore   |                       |   Python Firebase   |
             | - League Config     |                       |   Cloud Functions   |
             | - Teams & Tokens    |                       | - verify_pin_login  |
             | - Weekly Parlays    |                       | - submit_leg        |
             | - Mainlines Cache   |<---+                  | - finalize_parlay   |
             | - Active Players    |<---+                  | - sync_sleeper      |
             +---------------------+    |                  +---------------------+
                                        |                             |
                             +--------------------+                   v
                             |  Cloud Scheduler   |            +-------------+
                             |  (CRON 1 req/call) |            | Sleeper API |
                             +--------------------+            +-------------+
                                        |                      - /players/nfl
                                        v                      - /matchups
                                 +-------------+
                                 |The Odds API |
                                 +-------------+
```

### External Services
1. **Sleeper REST API:**
   * `/v1/league/<id>/matchups/<week>`: Weekly fantasy scores.
   * `/v1/league/<id>/rosters` & `/v1/league/<id>/users`: Team names, avatars, and owner details.
   * `/v1/players/nfl`: Master database of all NFL players, filtered and cached for autocomplete.
   * *Requirement:* Sleeper league privacy must be set to Public (default).
2. **The Odds API (Free Tier Quota Optimization with DraftKings):**
   * **Bookmaker Preference:** Queries strictly **DraftKings** (`bookmakers=draftkings`) to ensure all game lines and prop odds match DraftKings sportsbook pricing.
   * **Mainline Game Cache:** Scheduled Cloud Scheduler cron queries `/v4/sports/americanfootball_nfl/odds?regions=us&markets=h2h,spreads,totals&bookmakers=draftkings`. Grouped call returns all NFL games for **1 credit per call** (~40 requests/month out of 500 limit).
   * **On-Demand Player Props:** When a user picks a player, only that single game event (`/events/{eventId}/odds?bookmakers=draftkings`) is fetched and cached in Firestore for 4 hours (1–2 credits). Total monthly consumption remains well under 100 credits.

---

## 3. Authentication & Authorization

### 3.1 Session Token Security Model
* **PIN Input:** Managers authenticate by selecting their team and entering a 4-digit PIN.
* **Verification & Token Issuance:** The frontend calls HTTPS Callable Function `verify_pin_login(roster_id, pin)`.
* **Server-Side Verification:** The backend verifies the PIN against a server-salted SHA-256 hash.
* **Token Storage:** Upon success, the backend generates a cryptographically random `uuid4()` session token, stores it in `teams/{roster_id}.session_tokens`, and returns it to the client.
* **Client Storage:** The client stores `{ rosterId: number, sessionToken: string }` in `localStorage`. Raw PINs and hashes never touch client persistence.
* **Session Persistence:** Returning visitors are automatically authenticated from `localStorage`.

### 3.2 Authorization Matrix
| Action | Required Permission | Enforcement |
| :--- | :--- | :--- |
| **View Ticket & History** | Public (Anyone with league link) | Open Firestore read rule |
| **Submit / Edit Own Leg** | Valid `sessionToken` for target `roster_id` | Cloud Function verifies token |
| **Edit Default Pool** | Valid `sessionToken` for target `roster_id` | Cloud Function verifies token |
| **Finalize Parlay (Standard)** | Valid `sessionToken` of active **Bettor** | Cloud Function checks `roster_id == bettor.roster_id` |
| **Finalize Parlay (Break-Glass)** | Valid `sessionToken` of any league member | Cloud Function logs `is_break_glass: true` |

---

## 4. Database Schema (Cloud Firestore)

### 4.1 `leagues/{league_id}`
```typescript
interface LeagueConfig {
  sleeper_league_id: string; // e.g. "112482394829384923"
  season: string;            // e.g. "2026"
  current_week: number;      // e.g. 4
  updated_at: Timestamp;
}
```

### 4.2 `teams/{roster_id}`
```typescript
interface TeamProfile {
  roster_id: number;         // Sleeper roster ID (1 to 12)
  owner_id: string;          // Sleeper user ID
  owner_name: string;        // Sleeper display name
  team_name: string;         // Fantasy team name
  avatar_url?: string;       // Avatar image URL
  pin_hash: string;          // SHA-256(raw_pin + secret_server_salt)
  session_tokens: string[];  // Active valid session tokens
  default_legs: DefaultLeg[];// Intent-based fallback pool
}

interface DefaultLeg {
  id: string;
  nfl_team: string;          // e.g. "KC", "BAL", "PHI"
  market_type: 'moneyline' | 'spread' | 'game_total' | 'player_prop';
  player_name?: string;      // Optional (for player prop intent)
  direction?: 'favorite' | 'underdog' | 'over' | 'under';
  description_template: string; // e.g. "Chiefs Spread" or "Derrick Henry Anytime TD"
}
```

### 4.3 `parlays/{week}`
```typescript
interface WeeklyParlay {
  week: number;
  season: string;
  status: 'open' | 'locked';
  contains_sgp: boolean;                  // True if multiple legs share the same game_id
  bettor: {
    roster_id: number;
    team_name: string;
    owner_name: string;
    points_last_week: number;
  };
  earliest_kickoff: string | null;        // ISO 8601 string; hard finalization deadline
  legs: ParlayLeg[];
  estimated_odds_american: string;        // e.g. "+1450"
  estimated_multiplier: number;           // e.g. 15.50
  estimated_payout: number;               // $5 * multiplier
  actual_payout: number | null;           // Actual sportsbook payout override
  actual_odds_american: string | null;    // Actual sportsbook odds override
  sportsbook_url?: string;                // Optional digital slip share link
  finalized_at: string | null;
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
  game_id?: string;                       // For SGP correlation detection
  nfl_team: string;                       // e.g. "PHI"
  description: string;                    // e.g. "Saquon Barkley OVER 74.5 Rush Yards"
  odds_american: string;                  // e.g. "-115"
  odds_decimal: number;                   // e.g. 1.87
  is_default_roll: boolean;               // True if auto-selected during finalization
  status: 'pending' | 'submitted';
  kickoff_time?: string;                  // ISO 8601 string
}
```

### 4.4 `players_cache/active`
```typescript
interface ActivePlayersCache {
  last_updated: string;
  players: {
    id: string;
    name: string;        // e.g. "Saquon Barkley"
    team: string;        // e.g. "PHI"
    position: string;    // "QB" | "RB" | "WR" | "TE" | "K" | "DEF"
  }[];
}
```

---

## 5. User Interface Specifications

The app follows a mobile-first, dark-themed interface inspired by Sleeper (`#121A24` base, `#1D2736` cards, `#00CEB8` electric teal accents).

### 5.1 Weekly Bettor Spotlight Banner
* Positioned prominently at the top of the dashboard.
* Highlights the lowest scorer from the prior week:
  * Team name, owner name, and last week's score (e.g., *"Gridiron Clowns (Bob) - 78.4 pts"*).
  * Clear callout: *"On the hook for this week's $5 parlay ticket."*
  * Stake badge: `Stake Due: $5.00`.

### 5.2 Active Parlay Card
* **Header:**
  * Active Week label and current combined odds badge (e.g. `+1450`).
  * Estimated payout on \$5 stake (`Est. Payout: $77.50`).
  * Status chip (`Open` vs `Locked`).
* **Earliest Kickoff Deadline Banner:**
  * If a submitted leg includes Thursday Night Football, displays a blue countdown banner:  
    `⏳ TNF Leg Included: Ticket must be locked before Thursday 8:15 PM ET`.
* **Same Game Parlay (SGP) Warning Banner:**
  * If `contains_sgp == true`, displays an amber alert:  
    `⚠️ Same Game Parlay Detected: Multiple legs share the same game. Sportsbooks discount correlated odds; check your betting app for actual payout.`
* **Legs List (1 to 12):**
  * Displays member name, leg description, and odds badge.
  * Auto-rolled legs feature a purple `🎲 Default` chip.
  * If open, members see an `Edit` button on their own leg row.
* **Footer Actions:**
  * **Copy Slip for Sleeper Chat:** One-click copy formatted text card.
  * **Finalize Button:**
    * If current user is the Bettor: Green `Finalize Parlay & Roll Defaults` button.
    * If current user is another member: Subtle red `⚡ Break Glass: Finalize on Behalf of Bettor` button.

### 5.3 Position-Aware Leg Selector Modal
When picking a leg, members have 3 intuitive options:

```
+-------------------------------------------------------------+
|                     Submit Weekly Leg                       |
|   [ 🏃 Player Prop ]   [ 🏈 Game Line ]   [ ✍️ Custom ]     |
+-------------------------------------------------------------+
```

1. **Player Prop Tab:**
   * **Sleeper Full-NFL Autocomplete:** Text input with real-time typeahead filtering against the ~600 active offensive NFL players. Shows player name, NFL team, and position badge (e.g. `Saquon Barkley • PHI (RB)`).
   * **Position-Tailored Categories:**
     * **QB:** `[Pass Yards]`, `[Pass TDs]`, `[Rush Yards]`, `[Anytime TD]`.
     * **RB:** `[Touchdowns]`, `[Rush Yards]`, `[Rec Yards]`, `[Receptions]`.
     * **WR / TE:** `[Rec Yards]`, `[Receptions]`, `[Touchdowns]`, `[Longest Rec]`.
   * **Smart Line Controls:**
     * **Touchdown Market:** Segmented buttons for `[Anytime TD]`, `[2+ TDs]`, `[1st TD Scorer]`.
     * **Yardage/Receptions:** Segmented `[OVER]` / `[UNDER]` toggle, stepper buttons (`-` / `+`), and quick milestone buttons (`50+ Yds`, `75+ Yds`, `100+ Yds`).
   * **Odds:** Pre-filled with `-110` / `-115` with ability to customize.
2. **Game Line Tab:**
   * Matchup selector showing this week's active games.
   * Quick-tap cards for live **Spread**, **Moneyline**, and **Game Total (Over/Under)**.
3. **Custom Tab:**
   * Text description input, required NFL team tag dropdown, and odds input.
4. **Live Ticket Preview:**
   * Live preview at bottom showing natural language ticket line (e.g. *"Saquon Barkley • OVER 74.5 Rush Yards (-110)"*).

### 5.4 Intent-Based Default Legs Pool Manager
* Accessible from the dashboard profile.
* Manages 3 to 5 permanent fallback slots per team.
* **Market Intent Choices (Zero API Calls to Configure):**
  * **Team Markets:** Select NFL team + `Spread` / `Moneyline` / `Game Total Over`.
  * **Player Props:** Search any NFL player + `Anytime TD` / `Stat Over`.
* **Live Schedule Badges:**
  * Displays whether each default leg's team is active this week or on bye.
* **Interactive Roll Simulator:**
  * Includes a `"🎲 Test Random Roll"` button that executes the eligibility filter and demonstrates how the leg snaps to the current week's line.

### 5.5 Pure Read-Only Past Slips Archive
* Drawer/modal showing previous weeks' locked slips.
* Read-only cards showing:
  * Week number and Bettor name.
  * All member picks and auto-rolled defaults.
  * Final parlay odds, estimated payout, and actual sportsbook payout if entered.
* **No win/loss tracking, no scoring verification required.**

---

## 6. Betting Domain Logic & Rules

### 6.1 The Earliest Kickoff Rule
* A sportsbook parlay ticket must be placed before the first game on the slip kicks off.
* The system computes:
  $$\text{earliest\_kickoff} = \min(\text{kickoff\_time for all submitted legs})$$
* If someone selects a Thursday Night Football leg, the deadline to finalize the parlay is Thursday at 8:15 PM ET.
* Missing members have their defaults rolled when the bettor finalizes on Thursday.
* If no Thursday games are selected, the deadline remains Sunday at 1:00 PM ET.

### 6.2 Deterministic Tie-Breakers (Tuesday Sync)
The lowest weekly scorer is resolved deterministically using a 4-level hierarchy:
1. **Lowest Weekly Fantasy Points.**
2. **Lowest Season-to-Date Points For (PF).**
3. **Lowest Season-to-Date Optimal Points (Max PF).**
4. **Alphabetical by Team Name.**

### 6.3 Same Game Parlay (SGP) Correlation Detection
* Checks `game_id` across all legs.
* If two or more legs share the same `game_id`, `contains_sgp` is set to `true`.
* The UI displays an amber divergence alert and prompts the bettor to input the actual sportsbook ticket odds upon placing the bet.

### 6.4 Parlay Odds Math
* American to Decimal:
  $$\text{Positive (+X): } D = \left(\frac{X}{100}\right) + 1, \quad \text{Negative (-X): } D = \left(\frac{100}{|X|}\right) + 1$$
* Compound Multiplier:
  $$M = \prod_{i=1}^n D_i$$
* American Odds:
  $$\text{If } M \ge 2.0: A = \text{round}((M - 1) \times 100), \quad \text{If } M < 2.0: A = \text{round}\left(\frac{-100}{M - 1}\right)$$
* Estimated Payout on \$5 stake:
  $$\text{Payout} = \$5.00 \times M$$

---

## 7. Verification & Testing Strategy

### 7.1 Automated Backend Test Suite
* `test_sleeper_sync.py`: Matchup parsing, lowest score detection, 4-tier tie-breakers, and active player database filtering.
* `test_parlay_math.py`: American $\leftrightarrow$ Decimal conversion, compound multiplier, \$5 payout math, and SGP detection.
* `test_auth_utils.py`: Session token generation, token verification, and break-glass audit logging.
* `test_odds_engine.py`: Earliest kickoff calculation, bye-week exclusion, and mainline default line snapping.

### 7.2 Frontend Verification
* Build and type-check: `cd frontend && npm run build`.
* Interactive component checks:
  * Verify Sleeper player autocomplete dynamically alters prop categories based on QB vs RB vs WR.
  * Verify earliest kickoff banner updates dynamically when a TNF leg is added.
  * Verify Break-Glass confirmation dialog logs executor metadata.
  * Verify one-click copy generates clean text for Sleeper chat.
