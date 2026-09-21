# User Default Picks Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide clear visibility across the parlay slip showing whether each team has default fallback picks configured (with an amber warning alert icon if they have none), and allow inspecting their exact fallback rules in a responsive Quick-View modal.

**Architecture:** Component-driven React UI in TypeScript. A new `TeamDefaultsModal` displays inspectable fallback pools and missing-rule warnings; `ParlayCard` displays interactive status badges per leg; `App.tsx` coordinates state, passes team profiles, and updates the action sidebar warning when the current user has 0 defaults.

**Tech Stack:** React 18, Vite, Tailwind CSS, Lucide React icons, Vitest, TypeScript.

## Global Constraints
- Strictly adhere to dark theme palette (`#121A24` base, `#00CEB8` electric teal accent, WCAG AA contrast standards).
- Preserve existing mobile ergonomics: minimum 44×44px touch targets for clickable actions.
- Do NOT re-introduce win/loss tracking or ticket grading (pure read-only archive).
- All tests must pass: `npm --prefix frontend test -- --run` and `npm --prefix frontend run build`.

---

### Task 1: Build `TeamDefaultsModal.tsx` & Unit Logic Tests

**Files:**
- Create: `frontend/src/components/TeamDefaultsModal.tsx`
- Create: `frontend/src/utils/defaultPoolUtils.ts`
- Test: `frontend/src/tests/defaultPoolUtils.test.ts`

**Interfaces:**
- Consumes: `TeamProfile`, `DefaultLeg` from `frontend/src/types.ts`
- Produces: `TeamDefaultsModal` React component with props:
  ```ts
  export interface TeamDefaultsModalProps {
    isOpen: boolean;
    onClose: () => void;
    team: TeamProfile | null;
    isCurrentUser: boolean;
    onEditPool?: () => void;
    byeTeams?: string[];
  }
  ```
- Produces: helper functions in `frontend/src/utils/defaultPoolUtils.ts`:
  - `getTeamDefaults(team?: TeamProfile | null): DefaultLeg[]`
  - `isTeamMissingDefaults(team?: TeamProfile | null): boolean`
  - `isLegOnBye(leg: DefaultLeg, byeTeams?: string[]): boolean`

- [ ] **Step 1: Write the failing unit tests for default pool utilities**

```typescript
// frontend/src/tests/defaultPoolUtils.test.ts
import { describe, it, expect } from 'vitest';
import { getTeamDefaults, isTeamMissingDefaults, isLegOnBye } from '../utils/defaultPoolUtils';
import { TeamProfile, DefaultLeg } from '../types';

describe('defaultPoolUtils', () => {
  const mockTeamWithDefaults: TeamProfile = {
    roster_id: 1,
    owner_id: 'u1',
    owner_name: 'Blake',
    team_name: 'Philly Special',
    default_legs: [
      { id: 'd1', nfl_team: 'PHI', market_type: 'spread', description_template: 'Eagles Spread' },
      { id: 'd2', nfl_team: 'CAR', market_type: 'moneyline', description_template: 'Panthers Moneyline' },
    ],
  };

  const mockTeamNoDefaults: TeamProfile = {
    roster_id: 2,
    owner_id: 'u2',
    owner_name: 'Bob',
    team_name: 'Empty Team',
    default_legs: [],
  };

  it('correctly retrieves default legs array', () => {
    expect(getTeamDefaults(mockTeamWithDefaults)).toHaveLength(2);
    expect(getTeamDefaults(mockTeamNoDefaults)).toHaveLength(0);
    expect(getTeamDefaults(null)).toHaveLength(0);
  });

  it('detects when a team is missing defaults', () => {
    expect(isTeamMissingDefaults(mockTeamWithDefaults)).toBe(false);
    expect(isTeamMissingDefaults(mockTeamNoDefaults)).toBe(true);
    expect(isTeamMissingDefaults(null)).toBe(true);
  });

  it('detects if a default leg is currently on a bye week', () => {
    const byeTeams = ['CAR', 'CLE'];
    const leg1 = mockTeamWithDefaults.default_legs[0]; // PHI
    const leg2 = mockTeamWithDefaults.default_legs[1]; // CAR

    expect(isLegOnBye(leg1, byeTeams)).toBe(false);
    expect(isLegOnBye(leg2, byeTeams)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test -- --run`
Expected: FAIL with module `defaultPoolUtils` not found.

- [ ] **Step 3: Implement `frontend/src/utils/defaultPoolUtils.ts`**

```typescript
// frontend/src/utils/defaultPoolUtils.ts
import { TeamProfile, DefaultLeg } from '../types';

export function getTeamDefaults(team?: TeamProfile | null): DefaultLeg[] {
  return team?.default_legs || [];
}

export function isTeamMissingDefaults(team?: TeamProfile | null): boolean {
  return !team || !team.default_legs || team.default_legs.length === 0;
}

export function isLegOnBye(leg: DefaultLeg, byeTeams: string[] = []): boolean {
  return byeTeams.includes(leg.nfl_team.toUpperCase());
}
```

- [ ] **Step 4: Implement `frontend/src/components/TeamDefaultsModal.tsx`**

Build the responsive modal dialog displaying:
1. Team title and owner name with status badge.
2. Ordered list of default rules (1 to 5) with market badge (`Spread`, `Moneyline`, `Player Prop`, `Total`) and bye alert badge if applicable.
3. Empty state graphic with `<AlertTriangle className="w-10 h-10 text-amber-400" />` and explicit warning when 0 defaults exist.
4. "Set Up My Pool" button if viewing own empty team, or "Edit My Pool" if viewing own populated team.
5. Close button and ESC/backdrop click handler.

- [ ] **Step 5: Run tests and build to verify passing**

Run: `npm --prefix frontend test -- --run`
Run: `npm --prefix frontend run build`
Expected: All tests pass and build succeeds with exit code 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/defaultPoolUtils.ts frontend/src/tests/defaultPoolUtils.test.ts frontend/src/components/TeamDefaultsModal.tsx
git commit -m "feat(ui): add TeamDefaultsModal and default pool utility functions"
```

---

### Task 2: Update `ParlayCard.tsx` with Default Picks Badges & Test

**Files:**
- Modify: `frontend/src/components/ParlayCard.tsx`
- Create: `frontend/src/tests/parlayCardBadges.test.ts`

**Interfaces:**
- Updates `Props` in `ParlayCard.tsx`:
  ```typescript
  interface Props {
    parlay: WeeklyParlay;
    currentRosterId: number | null;
    teams?: TeamProfile[];
    onOpenPickModal: (leg: ParlayLeg) => void;
    onOpenDefaultPoolModal: () => void;
    onViewTeamDefaults?: (team: TeamProfile) => void;
  }
  ```
- Produces:
  - For teams with defaults ($>0$):
    `<button type="button" onClick={(e) => { e.stopPropagation(); onViewTeamDefaults?.(team); }} ...>` with `<Dice5 className="w-3 h-3 text-purple-400" />` and `{defaultsCount} Defaults`.
  - For teams with NO defaults ($0$):
    `<button type="button" onClick={(e) => { e.stopPropagation(); onViewTeamDefaults?.(team); }} ...>` with `<AlertTriangle className="w-3 h-3 text-amber-400" />` and `No Defaults`.

- [ ] **Step 1: Write test for ParlayCard badge determination logic**

```typescript
// frontend/src/tests/parlayCardBadges.test.ts
import { describe, it, expect } from 'vitest';
import { getTeamDefaults, isTeamMissingDefaults } from '../utils/defaultPoolUtils';
import { TeamProfile } from '../types';

describe('ParlayCard Badge Logic', () => {
  const teams: TeamProfile[] = [
    {
      roster_id: 1,
      owner_id: 'u1',
      owner_name: 'Blake',
      team_name: 'Philly Special',
      default_legs: [
        { id: 'd1', nfl_team: 'PHI', market_type: 'spread', description_template: 'Eagles Spread' },
      ],
    },
    {
      roster_id: 2,
      owner_id: 'u2',
      owner_name: 'Bob',
      team_name: 'Gridiron Clowns',
      default_legs: [],
    },
  ];

  it('correctly maps rosterId to defaults badge state', () => {
    const team1 = teams.find(t => t.roster_id === 1);
    const team2 = teams.find(t => t.roster_id === 2);

    expect(getTeamDefaults(team1)).toHaveLength(1);
    expect(isTeamMissingDefaults(team1)).toBe(false);

    expect(getTeamDefaults(team2)).toHaveLength(0);
    expect(isTeamMissingDefaults(team2)).toBe(true);
  });
});
```

- [ ] **Step 2: Update `frontend/src/components/ParlayCard.tsx`**

Integrate the default status badges into the leg row header:
1. Accept `teams?: TeamProfile[]` and `onViewTeamDefaults?: (team: TeamProfile) => void`.
2. Find corresponding `team` for each `leg.roster_id`.
3. Render the interactive button badge right next to the team name.
4. Stop propagation on click so tapping the badge opens the inspection modal without triggering the leg edit modal.
5. Set `aria-label` and title tooltips for accessibility.

- [ ] **Step 3: Run tests and build**

Run: `npm --prefix frontend test -- --run`
Run: `npm --prefix frontend run build`
Expected: PASS and clean compilation.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ParlayCard.tsx frontend/src/tests/parlayCardBadges.test.ts
git commit -m "feat(ui): add interactive default pick status badges to parlay card legs"
```

---

### Task 3: Integrate `TeamDefaultsModal` & Sidebar Alert into `App.tsx` & Verification

**Files:**
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `TeamDefaultsModal`
- Updates `App.tsx` state:
  - `const [viewingDefaultsTeam, setViewingDefaultsTeam] = useState<TeamProfile | null>(null);`
- Updates mock data:
  - Give one mock team (e.g. `roster_id: 5`, Dave) 0 defaults so the `[⚠️ No Defaults]` alert is immediately visible and demonstrable.
- Updates sidebar button:
  - When `currentTeam.default_legs?.length === 0`: renders with amber alert styling and `<AlertTriangle /> Set Up Fallback Pool (0/5 rules - At Risk)`.

- [ ] **Step 1: Update `frontend/src/App.tsx`**

1. Import `TeamDefaultsModal` and `AlertTriangle`.
2. Adjust `MOCK_TEAMS` so Team 5 (Dave) has `default_legs: []` to test the missing defaults warning badge.
3. Pass `teams={teams}` and `onViewTeamDefaults={(t) => setViewingDefaultsTeam(t)}` to `ParlayCard`.
4. Render `<TeamDefaultsModal isOpen={Boolean(viewingDefaultsTeam)} onClose={() => setViewingDefaultsTeam(null)} team={viewingDefaultsTeam} isCurrentUser={viewingDefaultsTeam?.roster_id === currentRosterId} onEditPool={() => { setViewingDefaultsTeam(null); setIsDefaultPoolOpen(true); }} />`.
5. Update fallback pool button in the sidebar to conditionally show `<AlertTriangle className="w-3.5 h-3.5 text-amber-400" />` and warning text if `currentTeam.default_legs?.length === 0`.

- [ ] **Step 2: Run verification commands**

Run: `npm --prefix frontend test -- --run`
Run: `npm --prefix frontend run build`
Run: `PYTHONPATH=functions ./venv/bin/pytest functions/tests -v`
Expected: 100% tests passing across frontend and backend, clean build with 0 TypeScript/Vite errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(ui): connect TeamDefaultsModal and sidebar warning alert in App"
```
