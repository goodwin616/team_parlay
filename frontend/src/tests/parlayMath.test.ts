import { describe, it, expect } from 'vitest';
import {
  americanToDecimal,
  decimalToAmerican,
  checkSgpCorrelation,
  calculateEarliestKickoff,
  calculateParlayStats,
} from '../utils/parlayMath';
import { ParlayLeg } from '../types';

describe('Parlay Math & SGP Logic', () => {
  it('converts American odds to decimal accurately', () => {
    expect(americanToDecimal('+150')).toBe(2.5);
    expect(Math.round(americanToDecimal('-110') * 1000) / 1000).toBe(1.909);
    expect(americanToDecimal('-200')).toBe(1.5);
  });

  it('converts decimal odds to American representation', () => {
    expect(decimalToAmerican(2.5)).toBe('+150');
    expect(decimalToAmerican(1.9091)).toBe('-110');
    expect(decimalToAmerican(1.5)).toBe('-200');
  });

  it('calculates parlay compound multiplier and $5 payout', () => {
    const legs: ParlayLeg[] = [
      {
        id: '1',
        roster_id: 1,
        team_name: 'Philly Special',
        owner_name: 'Blake',
        nfl_team: 'PHI',
        description: 'Saquon Anytime TD',
        odds_american: '-110',
        odds_decimal: 1.9091,
        is_default_roll: false,
        status: 'submitted',
      },
      {
        id: '2',
        roster_id: 2,
        team_name: 'Gridiron Clowns',
        owner_name: 'Bob',
        nfl_team: 'KC',
        description: 'Chiefs ML',
        odds_american: '+150',
        odds_decimal: 2.5,
        is_default_roll: false,
        status: 'submitted',
      },
      {
        id: '3',
        roster_id: 3,
        team_name: 'Motor City Kitties',
        owner_name: 'Alice',
        nfl_team: 'BAL',
        description: 'Henry Anytime TD',
        odds_american: '-200',
        odds_decimal: 1.5,
        is_default_roll: false,
        status: 'submitted',
      },
    ];

    const stats = calculateParlayStats(legs, 5.0);
    // 1.9091 * 2.5 * 1.5 = 7.159...
    expect(Math.round(stats.multiplier * 10) / 10).toBe(7.2);
    expect(stats.estimated_payout).toBe(35.80);
    expect(stats.odds_american).toBe('+616');
    expect(stats.contains_sgp).toBe(false);
  });

  it('detects Same Game Parlay (SGP) correlation when legs share game_id', () => {
    const independent: ParlayLeg[] = [
      { id: '1', roster_id: 1, team_name: 'T1', owner_name: 'U1', nfl_team: 'KC', game_id: 'game_1', description: 'Leg 1', odds_american: '-110', odds_decimal: 1.91, is_default_roll: false, status: 'submitted' },
      { id: '2', roster_id: 2, team_name: 'T2', owner_name: 'U2', nfl_team: 'PHI', game_id: 'game_2', description: 'Leg 2', odds_american: '-110', odds_decimal: 1.91, is_default_roll: false, status: 'submitted' },
    ];
    expect(checkSgpCorrelation(independent)).toBe(false);

    const correlated: ParlayLeg[] = [
      { id: '1', roster_id: 1, team_name: 'T1', owner_name: 'U1', nfl_team: 'KC', game_id: 'game_1', description: 'Mahomes 250+ Yds', odds_american: '-110', odds_decimal: 1.91, is_default_roll: false, status: 'submitted' },
      { id: '2', roster_id: 2, team_name: 'T2', owner_name: 'U2', nfl_team: 'KC', game_id: 'game_1', description: 'Kelce Anytime TD', odds_american: '+110', odds_decimal: 2.10, is_default_roll: false, status: 'submitted' },
      { id: '3', roster_id: 3, team_name: 'T3', owner_name: 'U3', nfl_team: 'BAL', game_id: 'game_2', description: 'Ravens ML', odds_american: '-150', odds_decimal: 1.67, is_default_roll: false, status: 'submitted' },
    ];
    expect(checkSgpCorrelation(correlated)).toBe(true);
  });

  it('finds the earliest kickoff timestamp to enforce lock deadline', () => {
    const legs: ParlayLeg[] = [
      { id: '1', roster_id: 1, team_name: 'T1', owner_name: 'U1', nfl_team: 'PHI', kickoff_time: '2026-09-27T17:00:00Z', description: 'Sunday Leg', odds_american: '-110', odds_decimal: 1.91, is_default_roll: false, status: 'submitted' },
      { id: '2', roster_id: 2, team_name: 'T2', owner_name: 'U2', nfl_team: 'KC', kickoff_time: '2026-09-24T20:15:00Z', description: 'TNF Leg', odds_american: '+115', odds_decimal: 2.15, is_default_roll: false, status: 'submitted' },
      { id: '3', roster_id: 3, team_name: 'T3', owner_name: 'U3', nfl_team: 'BAL', kickoff_time: '2026-09-28T00:20:00Z', description: 'SNF Leg', odds_american: '-110', odds_decimal: 1.91, is_default_roll: false, status: 'submitted' },
    ];

    const earliest = calculateEarliestKickoff(legs);
    expect(earliest).toBe('2026-09-24T20:15:00Z');
  });
});
