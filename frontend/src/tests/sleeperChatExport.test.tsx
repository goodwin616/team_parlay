import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SleeperChatExport, generateSleeperText } from '../components/SleeperChatExport';
import { WeeklyParlay } from '../types';

function cleanText(html: string): string {
  return html.replace(/<!--.*?-->/g, '');
}

describe('SleeperChatExport Component & Text Generation', () => {
  const emptyParlay: WeeklyParlay = {
    week: 8,
    season: '2026',
    status: 'open',
    contains_sgp: false,
    bettor: {
      roster_id: 1,
      team_name: 'Philly Special',
      owner_name: 'Blake',
      points_last_week: 92.5,
    },
    earliest_kickoff: '2026-11-01T17:00:00Z',
    estimated_odds_american: '+100',
    estimated_multiplier: 1.0,
    estimated_payout: 5.0,
    combined_probability_cents: 50,
    actual_payout: null,
    legs: [
      {
        id: 'leg-1',
        roster_id: 1,
        team_name: 'Philly Special',
        owner_name: 'Blake',
        nfl_team: 'PHI',
        description: '',
        odds_american: '-110',
        odds_decimal: 1.91,
        status: 'pending',
      },
      {
        id: 'leg-2',
        roster_id: 2,
        team_name: 'Gridiron Clowns',
        owner_name: 'Bob',
        nfl_team: 'KC',
        description: '',
        odds_american: '-110',
        odds_decimal: 1.91,
        status: 'pending',
      },
      {
        id: 'leg-3',
        roster_id: 3,
        team_name: 'Touchdown Kings',
        owner_name: 'Alice',
        nfl_team: 'DET',
        description: '',
        odds_american: '-110',
        odds_decimal: 1.91,
        status: 'pending',
      },
    ],
  };

  const activeParlay: WeeklyParlay = {
    ...emptyParlay,
    estimated_odds_american: '+596',
    estimated_multiplier: 6.96,
    estimated_payout: 34.8,
    combined_probability_cents: 14,
    legs: [
      {
        id: 'leg-1',
        roster_id: 1,
        team_name: 'Philly Special',
        owner_name: 'Blake',
        nfl_team: 'PHI',
        game_id: 'KXNFL-26NOV01-PHIDAL',
        description: 'Saquon Barkley Anytime TD',
        odds_american: '-117',
        odds_decimal: 1.8519,
        price_cents: 54,
        status: 'submitted',
      },
      {
        id: 'leg-2',
        roster_id: 2,
        team_name: 'Gridiron Clowns',
        owner_name: 'Bob',
        nfl_team: 'KC',
        description: 'Chiefs Moneyline',
        odds_american: '-150',
        odds_decimal: 1.6667,
        price_cents: 60,
        status: 'submitted',
      },
      {
        id: 'leg-3',
        roster_id: 3,
        team_name: 'Touchdown Kings',
        owner_name: 'Alice',
        nfl_team: 'DET',
        description: '',
        odds_american: '-110',
        odds_decimal: 1.91,
        status: 'pending',
      },
    ],
  };

  describe('SleeperChatExport Component', () => {
    it('disables the Sleeper export button with disabled, cursor-not-allowed, and tooltip when submittedCount === 0', () => {
      const html = cleanText(
        renderToString(
          <SleeperChatExport parlay={emptyParlay} />
        )
      );

      expect(html).toContain('disabled=""');
      expect(html).toContain('cursor-not-allowed');
      expect(html).toContain('title="No submitted picks to export yet"');
      expect(html).toContain('opacity-40');
      expect(html).toContain('pointer-events-none');
    });

    it('enables the Sleeper export button without disabled="" or cursor-not-allowed when submittedCount > 0', () => {
      const html = cleanText(
        renderToString(
          <SleeperChatExport parlay={activeParlay} />
        )
      );

      expect(html).not.toContain('disabled=""');
      expect(html).not.toContain('cursor-not-allowed');
      expect(html).not.toContain('title="No submitted picks to export yet"');
      expect(html).toContain('Copy Slip for Sleeper Chat');
      expect(html).toContain('text-sleeper-accent');
    });
  });

  describe('generateSleeperText', () => {
    it('outputs placeholder fallback line "Est. Odds: — | Est. Payout: —" when 0 legs are submitted', () => {
      const text = generateSleeperText(emptyParlay);
      expect(text).toContain('Est. Odds: — | Est. Payout: —');
      expect(text).toContain('SUBMITTED LEGS (0/3):');
      expect(text).not.toContain('$5.00 ($0.00/player)');
    });

    it('outputs full summary line with active values when legs are submitted', () => {
      const text = generateSleeperText(activeParlay);
      expect(text).toContain('Est. Odds: +596 (6.96x) | Est. Payout: $34.80 (Est.) ($17.40/player)');
      expect(text).toContain('SUBMITTED LEGS (2/3):');
      expect(text).toContain('1. Philly Special (Blake): Saquon Barkley Anytime TD [-117 (54¢)]');
      expect(text).toContain('2. Gridiron Clowns (Bob): Chiefs Moneyline [-150 (60¢)]');
    });
  });
});
