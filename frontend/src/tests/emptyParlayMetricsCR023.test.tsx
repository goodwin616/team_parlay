import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ParlayCard } from '../components/ParlayCard';
import { SleeperChatExport, generateSleeperText } from '../components/SleeperChatExport';
import { WeeklyParlay } from '../types';

function cleanText(html: string): string {
  return html.replace(/<!--.*?-->/g, '');
}

describe('CR-023: Empty Parlay Metrics & Inactive Sleeper Export', () => {
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

  describe('When submittedCount === 0', () => {
    it('renders placeholder (—) for all 4 metrics with text-gray-500 font-mono font-bold', () => {
      const html = cleanText(
        renderToString(
          <ParlayCard
            parlay={emptyParlay}
            currentRosterId={1}
            onOpenPickModal={() => {}}
          />
        )
      );

      // Verify all 4 metrics render the em-dash placeholder
      expect(html).toContain('—');

      // Verify the muted text styling classes text-gray-500 font-mono font-bold
      const mutedMatches = html.match(/text-gray-500 font-mono font-bold/g);
      expect(mutedMatches).not.toBeNull();
      expect(mutedMatches?.length).toBe(4);

      // Verify no default active values like +100 or $5.00 are shown in the stats bar
      expect(html).not.toContain('+100');
      expect(html).not.toContain('1.00x');
      expect(html).not.toContain('$5.00');
      expect(html).not.toContain('$0.00');
    });

    it('does not render footnote disclaimer when submittedCount === 0 even if estimate badge was clicked', () => {
      const html = cleanText(
        renderToString(
          <ParlayCard
            parlay={emptyParlay}
            currentRosterId={1}
            onOpenPickModal={() => {}}
          />
        )
      );

      // Footnote disclaimer should not appear
      expect(html).not.toContain('Estimated via independent leg math');
    });

    it('disables the Sleeper export button with disabled, cursor-not-allowed, and tooltip', () => {
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

    it('disables the Sleeper export button inside ParlayCard when submittedCount === 0', () => {
      const html = cleanText(
        renderToString(
          <ParlayCard
            parlay={emptyParlay}
            currentRosterId={1}
            onOpenPickModal={() => {}}
          />
        )
      );

      expect(html).toContain('disabled=""');
      expect(html).toContain('cursor-not-allowed');
      expect(html).toContain('title="No submitted picks to export yet"');
    });
  });

  describe('When submittedCount > 0', () => {
    it('renders calculated values with standard active colors in stats boxes', () => {
      const html = cleanText(
        renderToString(
          <ParlayCard
            parlay={activeParlay}
            currentRosterId={1}
            onOpenPickModal={() => {}}
          />
        )
      );

      // Check calculated odds and multiplier
      expect(html).toContain('+596');
      expect(html).toContain('6.96x');

      // Check payouts ($34.80 total, $17.40 per player for 2 submitted)
      expect(html).toContain('$34.80');
      expect(html).toContain('$17.40');

      // Check active color classes
      expect(html).toContain('text-white');
      expect(html).toContain('text-sleeper-accent');
      expect(html).toContain('text-emerald-400');

      // Should not have the 4 muted spans
      const mutedMatches = html.match(/text-gray-500 font-mono font-bold/g);
      expect(mutedMatches).toBeNull();
    });

    it('enables the Sleeper export button without disabled="" or cursor-not-allowed', () => {
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

    it('enables the Sleeper export button inside ParlayCard when submittedCount > 0', () => {
      const html = cleanText(
        renderToString(
          <ParlayCard
            parlay={activeParlay}
            currentRosterId={1}
            onOpenPickModal={() => {}}
          />
        )
      );

      expect(html).not.toContain('disabled=""');
      expect(html).not.toContain('cursor-not-allowed');
      expect(html).toContain('Copy Slip for Sleeper Chat');
    });
  });

  describe('Official Quote behavior', () => {
    it('renders active stats when isOfficialQuote is true even if submittedCount === 0', () => {
      const officialQuoteParlay: WeeklyParlay = {
        ...emptyParlay,
        actual_odds_american: '+450',
        actual_payout: 27.5,
      };

      const html = cleanText(
        renderToString(
          <ParlayCard
            parlay={officialQuoteParlay}
            currentRosterId={1}
            onOpenPickModal={() => {}}
          />
        )
      );

      expect(html).toContain('+450');
      expect(html).toContain('$27.50');
      expect(html).toContain('Official Quote');
      const mutedMatches = html.match(/text-gray-500 font-mono font-bold/g);
      expect(mutedMatches).toBeNull();
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
