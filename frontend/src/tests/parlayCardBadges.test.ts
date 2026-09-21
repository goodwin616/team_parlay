import { describe, it, expect } from 'vitest';
import { getTeamDefaults, isTeamMissingDefaults } from '../utils/defaultPoolUtils';
import type { TeamProfile } from '../types';

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

  it('handles missing or unknown rosterId gracefully', () => {
    const unknownTeam = teams.find(t => t.roster_id === 999);

    expect(getTeamDefaults(unknownTeam)).toEqual([]);
    expect(isTeamMissingDefaults(unknownTeam)).toBe(true);
  });

  it('determines sidebar fallback pool button state and warning status', () => {
    const teamWithDefaults = teams[0];
    const teamWithoutDefaults = teams[1];

    const getSidebarFallbackState = (team: TeamProfile) => {
      const isMissing = !team.default_legs || team.default_legs.length === 0;
      return {
        isAtRisk: isMissing,
        buttonText: isMissing
          ? 'Set Up Fallback Pool (0/5 rules - At Risk)'
          : `Configure Fallback Pool (${team.default_legs.length}/5 rules)`,
      };
    };

    const state1 = getSidebarFallbackState(teamWithDefaults);
    expect(state1.isAtRisk).toBe(false);
    expect(state1.buttonText).toBe('Configure Fallback Pool (1/5 rules)');

    const state2 = getSidebarFallbackState(teamWithoutDefaults);
    expect(state2.isAtRisk).toBe(true);
    expect(state2.buttonText).toBe('Set Up Fallback Pool (0/5 rules - At Risk)');
  });
});
