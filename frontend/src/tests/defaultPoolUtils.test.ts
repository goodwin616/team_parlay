import { describe, it, expect } from 'vitest';
import { getTeamDefaults, isTeamMissingDefaults, isLegOnBye } from '../utils/defaultPoolUtils';
import type { TeamProfile, DefaultLeg } from '../types';

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
    const leg1: DefaultLeg = mockTeamWithDefaults.default_legs[0]; // PHI
    const leg2: DefaultLeg = mockTeamWithDefaults.default_legs[1]; // CAR

    expect(isLegOnBye(leg1, byeTeams)).toBe(false);
    expect(isLegOnBye(leg2, byeTeams)).toBe(true);
  });
});
