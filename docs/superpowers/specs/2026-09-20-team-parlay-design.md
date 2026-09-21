# Team Parlay Manager: Design Specification

**Date:** 2026-09-20  
**Project:** Team Parlay Fantasy Football Web App  
**Status:** Approved Draft (Sleeper Active Players Autocomplete & Pure Read-Only Archive)

---

## 1. Overview & Goals

In an NFL fantasy football league, each week the team scoring the lowest points is designated as the weekly "Bettor" and is on the hook to fund a \$5 team parlay ticket. Every league member is entitled to submit one "leg" to construct the combined parlay ticket.

### Core Experience & Streamlined Scope
1. **Automated Bettor Identification:** Syncs with Sleeper matchups each Tuesday to find the lowest-scoring team using a strict 4-level deterministic tie-breaker hierarchy.
2. **Sleeper Active Players Autocomplete:** Uses Sleeper’s public NFL players database (`/v1/players/nfl`) to power a searchable player dropdown (e.g., typing "Saquon" autocompletes "Saquon Barkley (PHI - RB)" and automatically tags the NFL team for schedule/bye validation).
3. **Pure Read-Only Slips Archive (No Win/Loss Tracking):** Past weeks' locked tickets simply move into a clean, read-only archive showing the bettor, legs, odds, and payout. **No win/loss grading, no stats ledger, no grading burden.**
4. **Sportsbook-Accurate Finalization (Earliest Kickoff Rule):** The finalization deadline is strictly the kickoff of the earliest leg on the slip. If a Thursday Night Football leg is included, the ticket finalizes and rolls missing defaults before Thursday kickoff. If no Thursday legs are included, the deadline extends to Sunday 1:00 PM ET.
5. **Server-Issued Session Token Auth:** 4-digit PINs are verified on the backend over HTTPS; the backend issues a cryptographically secure **Session Token (UUID)** saved in `localStorage`.
6. **API Quota Management (Mainlines Only):** Automated CRON fetches only game mainlines (Spreads, Moneylines, Game Totals) at 1 credit per call (~40 requests/month out of 500). Player props use the Sleeper player autocomplete with user-supplied odds from their betting app.
7. **Same Game Parlay (SGP) Correlation Alert:** Flags multiple legs sharing the same `game_id` with an amber divergence alert and enables entering the exact digital sportsbook ticket odds.
8. **Break-Glass Emergency Action:** Allows any league mate to finalize the ticket if the bettor is unresponsive, with transparent audit logging.
9. **Sleeper Chat Export:** One-click copy tool formatted for Sleeper league chat.

---

## 2. Architecture & Data Model

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

### Firestore Schema

#### `teams/{roster_id}`
```typescript
interface TeamProfile {
  roster_id: number;
  owner_id: string;
  owner_name: string;
  team_name: string;
  avatar_url: string;
  pin_hash: string;          // SHA-256(raw_pin + secret_server_salt)
  session_tokens: string[];  // Valid UUID session tokens
  default_legs: DefaultLeg[];// Intent-based fallback pool
}

interface DefaultLeg {
  id: string;
  nfl_team: string;          // e.g. "KC", "BAL", "PHI"
  market_type: 'moneyline' | 'spread' | 'game_total';
  direction?: 'favorite' | 'underdog' | 'over' | 'under';
  description_template: string; // e.g. "Chiefs Spread"
}
```

#### `parlays/{week}`
```typescript
interface WeeklyParlay {
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
  earliest_kickoff: string | null; // ISO 8601 string
  legs: ParlayLeg[];
  estimated_odds_american: string;
  estimated_multiplier: number;
  estimated_payout: number;
  actual_payout: number | null;
  actual_odds_american: string | null;
  sportsbook_url?: string;
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
  game_id?: string;
  nfl_team: string;
  description: string;
  odds_american: string;
  odds_decimal: number;
  is_default_roll: boolean;
  status: 'pending' | 'submitted';
  kickoff_time?: string;
}
```

#### `players_cache/active`
```typescript
interface ActivePlayersCache {
  last_updated: string;
  players: {
    id: string;
    name: string;        // e.g. "Saquon Barkley"
    team: string;        // e.g. "PHI"
    position: string;    // e.g. "RB"
  }[];
}
```

---

## 3. Sleeper Player Autocomplete & Pick Submission

1. **Active NFL Players Cache:**
   * Sleeper provides `GET /v1/players/nfl` returning all players.
   * A lightweight script or Cloud Function filters this down to **Active offensive skill players** (QBs, RBs, WRs, TEs, Ks on NFL rosters, ~600 players) and stores it in `players_cache/active`.
2. **Interactive Pick Flow:**
   * **Game Lines:** Live dropdown of NFL games with live spread, moneyline, and game total from The Odds API mainline cache.
   * **Player Props:** Search input with instant typeahead against the Sleeper active players list.
     * Selecting a player (e.g. *Derrick Henry*) automatically tags the NFL team (`BAL`) and locks in the player name.
     * The user inputs their desired prop (e.g. *Anytime TD*, *Over 74.5 Rush Yds*) and odds from their betting app (defaulting to `-110`).
   * **Custom Bets:** Freeform text with manual NFL team selector.

---

## 4. Pure Read-Only Slips Archive

* When Tuesday auto-sync runs, the previous week's locked ticket is preserved in `parlays/{week}`.
* In the UI, the **Past Slips Archive** is simply a read-only list of completed weeks:
  * Week number
  * Bettor on the hook (lowest scorer)
  * List of all legs, odds, and members who picked them (with `🎲 Default` badge if auto-rolled)
  * Total combined odds and payout
  * Optional link to the sportsbook ticket if provided
* **No win/loss grading, no scores tracking, no maintenance.**
