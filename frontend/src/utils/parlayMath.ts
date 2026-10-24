import { ParlayLeg } from '../types';

export function americanToDecimal(american: number | string): number {
  const odds = typeof american === 'number' ? american : parseInt(american, 10);
  if (isNaN(odds)) return 1.8519;
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

export function kalshiCentsToDecimal(priceCents: number): number {
  const clamped = Math.max(1, Math.min(99, priceCents));
  return Number((100.0 / clamped).toFixed(4));
}

export function decimalToKalshiCents(decimal: number): number {
  if (decimal <= 1.0) return 99;
  const cents = Math.round(100.0 / decimal);
  return Math.max(1, Math.min(99, cents));
}

export type OddsFormat = 'american' | 'percentage';

export function kalshiCentsToAmerican(priceCents: number): string {
  return decimalToAmerican(kalshiCentsToDecimal(priceCents));
}

export function formatOddsWithCents(
  oddsAmerican: string,
  priceCents?: number,
  format?: OddsFormat
): string {
  const cents = priceCents ?? decimalToKalshiCents(americanToDecimal(oddsAmerican));
  const roundedPct = Math.round(cents);
  if (format === 'percentage') {
    return `${roundedPct}%`;
  }
  if (format === 'american') {
    return `${oddsAmerican}`;
  }
  return `${oddsAmerican} (${roundedPct}¢)`;
}

export function formatComboOdds(
  oddsAmerican: string,
  multiplier: number,
  combinedProbabilityCents?: number,
  format: OddsFormat = 'american'
): string {
  if (format === 'percentage') {
    if (multiplier > 1.0) {
      const exactPct = 100.0 / multiplier;
      return exactPct < 10 ? `${exactPct.toFixed(1)}%` : `${Math.round(exactPct)}%`;
    }
    const fallbackPct =
      combinedProbabilityCents ?? decimalToKalshiCents(americanToDecimal(oddsAmerican));
    return `${Math.round(fallbackPct)}%`;
  }
  return oddsAmerican;
}

export function checkSgpCorrelation(legs: ParlayLeg[]): boolean {
  const submitted = legs.filter(l => l.status === 'submitted');
  const gameIds = submitted
    .map(l => l.game_id)
    .filter((id): id is string => Boolean(id && id.trim().length > 0));
  return gameIds.length !== new Set(gameIds).size;
}

export function calculateEarliestKickoff(legs: ParlayLeg[]): string | null {
  const submitted = legs.filter(l => l.status === 'submitted');
  const validTimes = submitted
    .map(l => l.kickoff_time)
    .filter((t): t is string => Boolean(t));
  if (validTimes.length === 0) return null;

  return validTimes.reduce((earliest, current) => {
    return new Date(current).getTime() < new Date(earliest).getTime() ? current : earliest;
  });
}

export function calculateParlayStats(legs: ParlayLeg[], stake: number = 5.0) {
  const submittedLegs = legs.filter(l => l.status === 'submitted');

  const decimals = submittedLegs.map(l => {
    if (typeof l.price_cents === 'number' && l.price_cents > 0) {
      return kalshiCentsToDecimal(l.price_cents);
    }
    if (typeof l.odds_decimal === 'number' && l.odds_decimal > 1.0) {
      return l.odds_decimal;
    }
    return americanToDecimal(l.odds_american);
  });

  if (decimals.length === 0) {
    return {
      multiplier: 1.0,
      estimated_payout: stake,
      odds_american: '+100',
      combined_probability_cents: 100,
      contains_sgp: false,
      earliest_kickoff: null,
    };
  }

  const multiplier = decimals.reduce((acc, curr) => acc * curr, 1.0);
  const estimated_payout = Number((stake * multiplier).toFixed(2));
  const odds_american = decimalToAmerican(multiplier);
  const combined_probability_cents = decimalToKalshiCents(multiplier);
  const contains_sgp = checkSgpCorrelation(submittedLegs);
  const earliest_kickoff = calculateEarliestKickoff(submittedLegs);

  return {
    multiplier: Number(multiplier.toFixed(4)),
    estimated_payout,
    odds_american,
    combined_probability_cents,
    contains_sgp,
    earliest_kickoff,
  };
}
