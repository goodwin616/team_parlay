import { describe, it, expect } from 'vitest';
import {
  americanToDecimal,
  decimalToAmerican,
  kalshiCentsToDecimal,
  decimalToKalshiCents,
  kalshiCentsToAmerican,
  formatOddsWithCents,
  formatComboOdds,
  checkSgpCorrelation,
  calculateEarliestKickoff,
  calculateParlayStats,
} from '../utils/parlayMath';
import { ParlayLeg } from '../types';

describe('Kalshi & Parlay Math Logic', () => {
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

  it('converts Kalshi contract cents to decimal and American odds and formats display strings', () => {
    expect(kalshiCentsToDecimal(50)).toBe(2.0);
    expect(kalshiCentsToDecimal(40)).toBe(2.5);
    expect(kalshiCentsToDecimal(54)).toBeCloseTo(1.8519, 3);

    expect(kalshiCentsToAmerican(50)).toBe('+100');
    expect(kalshiCentsToAmerican(40)).toBe('+150');
    expect(kalshiCentsToAmerican(54)).toBe('-117');

    expect(decimalToKalshiCents(2.0)).toBe(50);
    expect(decimalToKalshiCents(2.5)).toBe(40);
    expect(formatOddsWithCents('-117', 54)).toBe('-117 (54¢)');
    expect(formatOddsWithCents('-117', 54, 'american')).toBe('-117');
    expect(formatOddsWithCents('-117', 54, 'percentage')).toBe('54%');
    expect(formatComboOdds('+660', 7.6, 13, 'american')).toBe('+660');
    expect(formatComboOdds('+660', 7.6, 13, 'percentage')).toBe('13%');
  });

  it('calculates parlay compound multiplier and $5 payout using only submitted legs', () => {
    const legs: ParlayLeg[] = [
      {
        id: '1',
        roster_id: 1,
        team_name: 'Philly Special',
        owner_name: 'Blake',
        nfl_team: 'PHI',
        description: 'Saquon Anytime TD',
        odds_american: '+100',
        odds_decimal: 2.0,
        price_cents: 50,
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
        price_cents: 40,
        status: 'submitted',
      },
      {
        id: '3',
        roster_id: 3,
        team_name: 'Buffalo Stampede',
        owner_name: 'Charlie',
        nfl_team: 'BUF',
        description: 'Pending pick...',
        odds_american: '-110',
        odds_decimal: 1.91,
        status: 'pending',
      },
    ];

    const stats = calculateParlayStats(legs, 5.0);
    // 2.0 * 2.5 = 5.0x (pending leg 3 is excluded)
    expect(stats.multiplier).toBe(5.0);
    expect(stats.estimated_payout).toBe(25.0);
    expect(stats.odds_american).toBe('+400');
    expect(stats.combined_probability_cents).toBe(20);
    expect(stats.contains_sgp).toBe(false);
  });

  it('detects Same Game Combo correlation when submitted legs share game_id', () => {
    const independent: ParlayLeg[] = [
      { id: '1', roster_id: 1, team_name: 'T1', owner_name: 'U1', nfl_team: 'KC', game_id: 'game_1', description: 'Leg 1', odds_american: '-110', odds_decimal: 1.91, status: 'submitted' },
      { id: '2', roster_id: 2, team_name: 'T2', owner_name: 'U2', nfl_team: 'PHI', game_id: 'game_2', description: 'Leg 2', odds_american: '-110', odds_decimal: 1.91, status: 'submitted' },
    ];
    expect(checkSgpCorrelation(independent)).toBe(false);

    const correlated: ParlayLeg[] = [
      { id: '1', roster_id: 1, team_name: 'T1', owner_name: 'U1', nfl_team: 'KC', game_id: 'game_1', description: 'Mahomes 250+ Yds', odds_american: '-113', odds_decimal: 1.8868, price_cents: 53, status: 'submitted' },
      { id: '2', roster_id: 2, team_name: 'T2', owner_name: 'U2', nfl_team: 'KC', game_id: 'game_1', description: 'Kelce Anytime TD', odds_american: '+108', odds_decimal: 2.0833, price_cents: 48, status: 'submitted' },
      { id: '3', roster_id: 3, team_name: 'T3', owner_name: 'U3', nfl_team: 'BAL', game_id: 'game_2', description: 'Ravens ML', odds_american: '-150', odds_decimal: 1.67, status: 'submitted' },
    ];
    expect(checkSgpCorrelation(correlated)).toBe(true);
  });

  it('finds the earliest kickoff timestamp among submitted legs to enforce lock deadline', () => {
    const legs: ParlayLeg[] = [
      { id: '1', roster_id: 1, team_name: 'T1', owner_name: 'U1', nfl_team: 'PHI', kickoff_time: '2026-09-27T17:00:00Z', description: 'Sunday Leg', odds_american: '-110', odds_decimal: 1.91, status: 'submitted' },
      { id: '2', roster_id: 2, team_name: 'T2', owner_name: 'U2', nfl_team: 'KC', kickoff_time: '2026-09-24T20:15:00Z', description: 'TNF Leg', odds_american: '+115', odds_decimal: 2.15, status: 'submitted' },
      { id: '3', roster_id: 3, team_name: 'T3', owner_name: 'U3', nfl_team: 'BAL', kickoff_time: '2026-09-23T20:15:00Z', description: 'Pending Leg', odds_american: '-110', odds_decimal: 1.91, status: 'pending' },
    ];

    const earliest = calculateEarliestKickoff(legs);
    expect(earliest).toBe('2026-09-24T20:15:00Z');
  });
});
