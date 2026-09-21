# Team Parlay Manager: Design Specification

**Date:** 2026-09-20  
**Project:** Team Parlay Fantasy Football Web App  
**Status:** Approved Draft (Incorporating Cryptography, Game Placement, Quota, and Grading Realities)

---

## 1. Overview & Goals

In an NFL fantasy football league, each week the team scoring the lowest points is designated as the weekly "Bettor" and is on the hook to fund a \$5 team parlay ticket. Every league member is entitled to submit one "leg" to construct the combined parlay ticket.

### Production Constraints & Core Problems Solved
1. **Automated Bettor Identification:** Syncs with Sleeper matchups each Tuesday to find the lowest-scoring team using a strict 4-level deterministic tie-breaker hierarchy.
2. **Server-Issued Session Token Auth:** 4-digit PINs are verified on the backend over HTTPS; the backend issues a cryptographically secure **Session Token (UUID)** saved in `localStorage`. Raw PINs and hashes are never exposed to client-side brute-force scripts.
3. **Sportsbook-Accurate Finalization (Earliest Kickoff Rule):** In real sports betting, a parlay ticket must be placed before the first game on the slip begins. The finalization deadline is strictly the **kickoff time of the earliest leg on the slip**. If a TNF leg is included, the ticket finalizes and rolls missing defaults on Thursday before kickoff. If no Thursday legs are included, the deadline extends to Sunday 1:00 PM ET.
4. **API Quota Management (Mainlines Only):** The automated CRON job fetches only game mainlines (Moneylines, Spreads, Game Totals) at 1 credit per call (~40 requests/month out of 500). Player props and alternate milestones are submitted via the intuitive Custom Prop entry with user-provided odds from their sportsbook app.
5. **Accurate SGP Correlation Warning:** Flags multiple legs sharing the same `game_id` with an amber divergence alert and enables entering the exact digital sportsbook ticket odds.
6. **Manual "Grade Ticket" Workflow:** Zero-quota, human-reviewed grading interface where the bettor or league mates toggle legs as `Won`, `Lost`, or `Push/Void`, correctly adjusting the final slip and historical season stats.
7. **Break-Glass Emergency Action:** Allows any league mate to finalize or grade the ticket if the bettor is unresponsive, with transparent audit logging.
8. **Sleeper Chat Export:** One-click copy tool formatted for Sleeper league chat.

---

## 2. Architecture & External Integration

```
                             +-----------------------------------+
                             |     React (Vite) + Tailwind CSS   |
                             |       Mobile-First Web Client     |
                             +-----------------------------------+
                                               |
                        +----------------------+----------------------+
                        | (Firestore Reads)                           | (HTTPS Callable Functions)
                        v                                             v
             +---------------------+                       +---------------------+
             |   Cloud Firestore   |                       |   Python Firebase   |
             | - League Config     |                       |   Cloud Functions   |
             | - Teams & Tokens    |                       | - verify_pin_login  |
             | - Weekly Parlays    |                       | - submit_leg        |
             | - Cached Mainlines  |<---+                  | - finalize_parlay   |
             +---------------------+    |                  | - grade_ticket      |
                                        |                  | - sync_sleeper      |
                             +--------------------+        +---------------------+
                             |  Cloud Scheduler   |                   |
                             |  (CRON 1 req/call) |                   v
                             +--------------------+            +-------------+
                                        |                      | Sleeper API |
                                        v                      +-------------+
                                 +-------------+
                                 |The Odds API | (Mainlines only)
                                 +-------------+
```

### External Integrations & Quota Safety
* **Sleeper API:** Public read-only REST endpoints. Requires Sleeper league to be Public.
* **The Odds API (Mainline Quota Protection):**
  * Uses `/v4/sports/americanfootball_nfl/odds?regions=us&markets=h2h,spreads,totals`.
  * Grouped call returns all NFL games and mainlines for **exactly 1 credit**.
  * Cloud Scheduler schedule: Twice daily Thu-Sat, hourly Sunday mornings = ~40 credits/month (leaving 460 credits buffer).
  * Player props do not query the API; users enter them via the Custom/Prop form with odds from their betting app.

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
  pin_hash: string;          // SHA-256(raw_pin + secret_server_salt) - server only
  session_tokens: string[];  // Valid UUID session tokens for this team
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
  market_type: 'moneyline' | 'spread' | 'game_total';
  direction?: 'favorite' | 'underdog' | 'over' | 'under';
  description_template: string; // e.g. "Chiefs Spread"
}
```

### 3.3 `parlays/{week}`
```typescript
interface WeeklyParlay {
  week: number;
  season: string;
  status: 'open' | 'locked';
  resolution: 'pending' | 'won' | 'lost' | 'voided';
  contains_sgp: boolean;                  // True if multiple legs share the same game_id
  bettor: {
    roster_id: number;
    team_name: string;
    owner_name: string;
    points_last_week: number;
  };
  earliest_kickoff: Timestamp | null;     // Hard deadline for ticket finalization
  legs: ParlayLeg[];
  estimated_odds_american: string;        // e.g. "+1450"
  estimated_multiplier: number;           // e.g. 15.50
  estimated_payout: number;               // $5 * multiplier
  actual_payout: number | null;           // Bettor override from sportsbook slip
  actual_odds_american: string | null;    // Actual sportsbook odds
  sportsbook_url?: string;                // Share link from DraftKings/FanDuel
  finalized_at: Timestamp | null;
  finalized_by: {
    roster_id: number;
    owner_name: string;
    is_break_glass: boolean;
  } | null;
  graded_at: Timestamp | null;
  graded_by: {
    roster_id: number;
    owner_name: string;
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
  is_default_roll: boolean;               // True if rolled automatically during finalization
  status: 'pending' | 'submitted';
  result_status: 'pending' | 'won' | 'lost' | 'voided' | 'push';
  kickoff_time: Timestamp;                // Game commencement time
}
```

---

## 4. AuthN & AuthZ Architecture (Session Tokens)

### 4.1 Server-Issued Session Tokens
1. **Login Flow:**
   * Member selects their team from the dropdown and inputs their 4-digit PIN in memory.
   * Client calls HTTPS Callable Function `verify_pin_login(roster_id, pin)`.
   * Cloud Function verifies the PIN against the server-salted hash in Firestore.
   * On success, Cloud Function generates a cryptographically random `uuid4()` session token, appends it to `teams/{roster_id}.session_tokens`, and returns it to the client.
2. **Client Storage:**
   * Client stores `{ roster_id: number, session_token: string }` in `localStorage`.
   * **No PINs or hashes ever exist in `localStorage`.**
3. **Session Verification:**
   * Every write action (`submit_leg`, `update_defaults`, `finalize_parlay`, `grade_ticket`) passes `{ roster_id, session_token }`.
   * Backend confirms `session_token in team.session_tokens`.

---

## 5. Domain Logic & Betting Mechanics

### 5.1 The Earliest Kickoff Rule (Eliminating Dead Tickets)
* **Real-World Betting Constraint:** A parlay must be wagered before the kickoff of the first game included in the slip.
* **App Enforcement:**
  * The ticket calculates `earliest_kickoff` from all currently submitted legs.
  * If a member picks a Thursday Night Football game (8:15 PM ET), the UI displays a countdown:
    > ⏳ **TNF Leg Included:** Ticket must be finalized & placed before Thursday 8:15 PM ET!
  * At or before Thursday 8:15 PM ET, the bettor (or break-glass user) clicks **"Finalize Parlay & Roll Defaults"**.
  * Any member without a pick has their default rolled on Thursday, and the bettor places the $5 ticket on their sportsbook.
  * If no Thursday legs were picked, `earliest_kickoff` remains Sunday 1:00 PM ET, giving members until Sunday morning to pick.

### 5.2 Deterministic Tie-Breakers (Sleeper Sync)
Lowest weekly scorer determined by:
1. Lowest weekly points scored.
2. Lowest season-to-date points for (PF).
3. Lowest season-to-date max points (Max PF).
4. Alphabetical by team name.

### 5.3 Intent-Based Default Legs & Dynamic Line Snapping
* Mainline market defaults (*Chiefs Spread*, *Bills Moneyline*, *Lions Game Total Over*) automatically snap to the week's cached line when rolled.
* Bye-week and post-kickoff games are excluded from the roll.

### 5.4 Manual "Grade Ticket" Workflow
* Grading is done manually by the bettor or any league member post-game:
  * In the UI, each leg has 3 quick toggle buttons: `[✅ Won]` `[❌ Lost]` `[⚪ Push/Void]`.
  * Overall ticket automatically resolves:
    * Any leg `lost` $\to$ Parlay `lost`.
    * All legs `won` (or `void`/`push`) $\to$ Parlay `won`.
    * Pushes/voids drop the leg from the multiplier and calculate the reduced payout.
  * Clicking "Save Grading" updates the historical stats on each team profile and archives the slip.
