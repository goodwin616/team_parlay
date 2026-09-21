import { ParlayLeg } from '../types';

export function americanToDecimal(american: number | string): number {
  const odds = typeof american === 'number' ? american : parseInt(american, 10);
  if (isNaN(odds)) return 1.9091;
  if (odds > 0) {
    return (odds / 100.0) + 1.0;
  } else {
    return (100.0 / Math.abs(odds)) + 1.0;
  }
}

export function decimalToAmerican(decimal: number): string {
  if (decimal <= 1.0) return '+100';
  if (decimal >= 2.0) {
    const val = Math.round((decimal - 1.0) * 100);
    return `+${val}`;
  } else {
    const val = Math.round(-100.0 / (decimal - 1.0));
    return `${val}`;
  }
}

export function checkSgpCorrelation(legs: ParlayLeg[]): boolean {
  const gameIds = legs
    .map(l => l.game_id)
    .filter((id): id is string => Boolean(id && id.trim().length > 0));
  return gameIds.length !== new Set(gameIds).size;
}

export function calculateEarliestKickoff(legs: ParlayLeg[]): string | null {
  const validTimes = legs
    .map(l => l.kickoff_time)
    .filter((t): t is string => Boolean(t));
  if (validTimes.length === 0) return null;

  return validTimes.reduce((earliest, current) => {
    return new Date(current).getTime() < new Date(earliest).getTime() ? current : earliest;
  });
}

export function calculateParlayStats(legs: ParlayLeg[], stake: number = 5.0) {
  const decimals = legs.map(l => americanToDecimal(l.odds_american));

  if (decimals.length === 0) {
    return {
      multiplier: 1.0,
      estimated_payout: stake,
      odds_american: '+100',
      contains_sgp: false,
      earliest_kickoff: null,
    };
  }

  const multiplier = decimals.reduce((acc, curr) => acc * curr, 1.0);
  const estimated_payout = Number((stake * multiplier).toFixed(2));
  const odds_american = decimalToAmerican(multiplier);
  const contains_sgp = checkSgpCorrelation(legs);
  const earliest_kickoff = calculateEarliestKickoff(legs);

  return {
    multiplier: Number(multiplier.toFixed(4)),
    estimated_payout,
    odds_american,
    contains_sgp,
    earliest_kickoff,
  };
}
