# User Default Picks Visibility & Missing Fallback Alert Design

## Goal
Enable league members and the weekly bettor to see at a glance whether each team has default fallback picks configured, immediately spot any user missing defaults via an amber warning icon, and inspect what those fallback picks are in a responsive Quick-View modal.

---

## 1. Overview & Context
In the Team Parlay web app, every team can establish a 3-to-5 slot fallback pool (`default_legs` in `TeamProfile`). If a member fails to submit their weekly pick prior to the earliest kickoff, the finalization routine randomly selects an eligible rule from their pool and snaps it to live game lines.

However, prior to this feature:
- Users could only see their own fallback pool by opening their personal configuration modal.
- There was no indicator showing whether other league members had set up their fallback pools.
- There was no visual warning if a user had zero default rules configured (putting the weekly bettor and the ticket at risk of failing to roll a leg).

This feature introduces clear status badges on every ticket leg, an alert indicator for users with no defaults, and a quick-view inspection modal.

---

## 2. UI Components & Visual Indicators

### 2.1 Parlay Card Leg Headers (`ParlayCard.tsx`)
In each leg row's metadata header (next to the owner and team name), a status badge displays the fallback status for that roster:

1. **Has Defaults ($> 0$ rules):**
   * **Badge:** `<button type="button">` styled as a compact purple pill:
     * Icon: `<Dice5 className="w-3 h-3 text-purple-400" />`
     * Text: `<span className="text-[10px] text-purple-300 font-semibold">{count} Defaults</span>`
     * Styling: `bg-purple-900/40 border border-purple-600/50 hover:bg-purple-800/60 transition`
     * Click behavior: `e.stopPropagation()` and opens `TeamDefaultsModal` for that team.
     * Accessibility: `aria-label="View {owner_name}'s {count} default picks"`.

2. **No Defaults ($0$ rules):**
   * **Badge:** `<button type="button">` styled as a warning amber pill:
     * Icon: `<AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />`
     * Text: `<span className="text-[10px] text-amber-300 font-bold">No Defaults</span>`
     * Styling: `bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 transition shadow-sm`
     * Click behavior: `e.stopPropagation()` and opens `TeamDefaultsModal` for that team.
     * Accessibility: `aria-label="Warning: {owner_name} has no default picks configured. Tap to view details."`.

### 2.2 Action Sidebar Reminder (`App.tsx`)
In the logged-in user's "Your Team Action" panel:
* When `currentTeam.default_legs?.length === 0`:
  * The fallback pool button updates with an amber border and warning indicator:
    * Border/BG: `border-amber-500/40 bg-amber-950/20 text-amber-300 hover:border-amber-400`
    * Icon: `<AlertTriangle className="w-3.5 h-3.5 text-amber-400" />`
    * Text: `Set Up Fallback Pool (0/5 rules - At Risk)`

---

## 3. Team Defaults Quick-View Modal (`TeamDefaultsModal.tsx`)

A lightweight modal dedicated to inspecting any team's fallback pool without entering an edit form:

### 3.1 Modal Header
* Title: `{team.team_name}` (`{team.owner_name}`)
* Subtitle / Status Pill:
  * If rules exist: `{count} Fallback Rules Configured`
  * If 0 rules: `No Fallback Rules Configured` (amber badge)
* Close button (`X`).

### 3.2 Modal Body
1. **When Defaults Exist:**
   * An ordered list of slots (1 through $N$):
     * **Slot Number & Market Badge:** Pill indicating market type (`Spread`, `Moneyline`, `Player Prop`, `Game Total`).
     * **Rule Description:** Formatted description template (e.g., `Saquon Barkley Anytime TD`, `Eagles Spread`, `Ravens Moneyline`).
     * **NFL Team Tag:** Team badge (e.g., `[PHI]`, `[BAL]`).
     * **Bye Week Indicator:** If the NFL team is currently on a bye, an amber `BYE` badge appears with explanatory text.
2. **When No Defaults Exist:**
   * Centered empty-state illustration with `<AlertTriangle className="w-10 h-10 text-amber-400" />`.
   * Clear message:
     > "{owner_name} has not configured any fallback picks. If this team does not submit a pick before kickoff, the automated finalization will not have a fallback rule to roll for this leg."
   * Call to action if viewing own profile:
     * Primary button: `Set Up My Fallback Pool` (immediately transitions to `DefaultPoolModal`).

### 3.3 Modal Footer
* **For Current User:** "Edit My Pool" button (opens full edit modal) and "Close" button.
* **For Other Users:** Single "Close" button.

---

## 4. Data Flow & State Management

1. **State in `App.tsx`:**
   * `viewingDefaultsTeam: TeamProfile | null` (manages which team's defaults are currently open in the quick-view modal).
   * Passes `teams: TeamProfile[]` and `onViewTeamDefaults: (team: TeamProfile) => void` down to `ParlayCard`.
2. **In `ParlayCard.tsx`:**
   * Matches `leg.roster_id` against `teams` to retrieve `team.default_legs`.
   * Renders the corresponding purple or amber badge on the leg row.
   * On badge click, invokes `onViewTeamDefaults(team)`.

---

## 5. Accessibility & Ergonomics
* Minimum 44×44px touch target padding around clickable badges or clear button boundaries.
* Keyboard navigation: `Enter` and `Space` fire modal launch; modal traps focus and closes on `Escape`.
* High-contrast text colors conforming to WCAG AA:
  * Purple badges: `text-purple-300` on `bg-purple-900/40`.
  * Amber warning badges: `text-amber-300` on `bg-amber-500/15` with `border-amber-500/40`.
