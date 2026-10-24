import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { TeamPickerModal } from '../components/TeamPickerModal';
import { TeamProfile } from '../types';

describe('CR-015: TeamPickerModal Chip, Badge, and Alignment Refinements', () => {
  const mockTeams: TeamProfile[] = [
    {
      roster_id: 1,
      owner_id: 'u1',
      owner_name: 'Blake',
      team_name: 'Philly Special',
    },
    {
      roster_id: 2,
      owner_id: 'u2',
      owner_name: 'Bob',
      team_name: 'Gridiron Clowns',
      claimed_by: {
        uid: 'u2',
        name: 'Bob',
        claimed_at: '2026-10-24T00:00:00Z',
      },
    },
    {
      roster_id: 3,
      owner_id: 'u3',
      owner_name: 'Alice',
      team_name: 'Touchdown Kings',
    },
  ];

  it('renders teams container without divide-y and without asymmetric first:pt-0', () => {
    const html = renderToString(
      <TeamPickerModal
        isOpen={true}
        onClose={() => {}}
        teams={mockTeams}
        currentRosterId={1}
        currentUserId="u1"
        leagueId="demo"
        season="2026"
        onTeamSelected={() => {}}
      />
    );

    // Should NOT have divide-y or first:pt-0 which caused vertical offset on card 1
    expect(html).not.toContain('divide-y');
    expect(html).not.toContain('first:pt-0');
    expect(html).not.toContain('pt-2.5');

    // Cards should have balanced p-3 rounded-xl
    expect(html).toContain('p-3 rounded-xl');
  });

  it('renders active badge as a crisp pill badge with rounded-full and valid padding', () => {
    const html = renderToString(
      <TeamPickerModal
        isOpen={true}
        onClose={() => {}}
        teams={mockTeams}
        currentRosterId={1}
        currentUserId="u1"
        leagueId="demo"
        season="2026"
        onTeamSelected={() => {}}
      />
    );

    // Must NOT contain invalid Tailwind class py-0.2
    expect(html).not.toContain('py-0.2');

    // Must have rounded-full and valid padding classes
    expect(html).toContain('px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-sleeper-accent text-black leading-none');
    expect(html).toContain('Active');
  });

  it('renders roster number chips with tabular-nums and leading-none for dead-center alignment', () => {
    const html = renderToString(
      <TeamPickerModal
        isOpen={true}
        onClose={() => {}}
        teams={mockTeams}
        currentRosterId={1}
        currentUserId="u1"
        leagueId="demo"
        season="2026"
        onTeamSelected={() => {}}
      />
    );

    expect(html).toContain('tabular-nums');
    expect(html).toContain('leading-none');
    expect(html).toContain('tracking-tight');
    // Selected team roster chip styling
    expect(html).toContain('bg-sleeper-accent/20 border-sleeper-accent/50 text-sleeper-accent');
    // Unselected team roster chip styling
    expect(html).toContain('bg-sleeper-dark border-sleeper-border text-sleeper-accent');
  });

  it('aligns right action elements with fixed width container w-16', () => {
    const html = renderToString(
      <TeamPickerModal
        isOpen={true}
        onClose={() => {}}
        teams={mockTeams}
        currentRosterId={1}
        currentUserId="u1"
        leagueId="demo"
        season="2026"
        onTeamSelected={() => {}}
      />
    );

    expect(html).toContain('w-16 flex items-center justify-end shrink-0');
    // Select button styling
    expect(html).toContain('inline-flex items-center justify-center px-3 py-1 rounded-lg bg-sleeper-dark');
  });
});
