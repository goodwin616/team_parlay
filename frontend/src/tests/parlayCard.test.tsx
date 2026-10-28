import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ParlayCard } from '../components/ParlayCard';
import { WeeklyParlay } from '../types';

function cleanText(html: string): string {
  return html.replace(/<!--.*?-->/g, '');
}

describe('ParlayCard Component', () => {
  const sampleParlay: WeeklyParlay = {
    week: 4,
    season: '2026',
    status: 'open',
    contains_sgp: false,
    bettor: {
      roster_id: 2,
      team_name: 'Gridiron Clowns',
      owner_name: 'Bob',
      points_last_week: 78.4,
    },
    earliest_kickoff: '2026-10-29T20:15:00Z',
    legs: [
      {
        id: 'l1',
        roster_id: 1,
        team_name: 'Philly Special',
        owner_name: 'Blake',
        nfl_team: 'PHI',
        game_id: 'KXNFL-26NOV01-PHIDAL',
        description: 'Saquon Barkley (PHI) • Anytime TD (1+) (YES)',
        odds_american: '-117',
        odds_decimal: 1.8519,
        price_cents: 54,
        status: 'submitted',
        kickoff_time: '2026-11-01T17:00:00Z',
      },
      {
        id: 'l2',
        roster_id: 2,
        team_name: 'Gridiron Clowns',
        owner_name: 'Bob',
        nfl_team: 'KC',
        description: 'KC Winner (Moneyline)',
        odds_american: '+117',
        odds_decimal: 2.1739,
        price_cents: 46,
        status: 'submitted',
      },
      {
        id: 'l3',
        roster_id: 3,
        team_name: 'Motor City Kitties',
        owner_name: 'Alice',
        nfl_team: 'DET',
        description: 'Amon-Ra St. Brown (DET) • 75+ Rec Yards (YES)',
        odds_american: '-113',
        odds_decimal: 1.8868,
        price_cents: 53,
        status: 'submitted',
      },
      {
        id: 'l4',
        roster_id: 4,
        team_name: 'Buffalo Stampede',
        owner_name: 'Charlie',
        nfl_team: 'BUF',
        description: '',
        odds_american: '-110',
        odds_decimal: 1.91,
        status: 'pending',
      },
      {
        id: 'l5',
        roster_id: 5,
        team_name: 'Lone Star Dynasty',
        owner_name: 'Dave',
        nfl_team: 'DAL',
        description: '',
        odds_american: '-110',
        odds_decimal: 1.91,
        status: 'pending',
      },
    ],
    estimated_odds_american: '+660',
    estimated_multiplier: 7.6,
    estimated_payout: 38.0,
    combined_probability_cents: 13,
    actual_payout: null,
    actual_odds_american: null,
  };

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

  describe('ParlayCard Visual Hierarchy & Summary Grid', () => {
    it('promotes Week X Parlay to an H2 heading with inline Estimate badge', () => {
      const html = cleanText(
        renderToString(
          <ParlayCard
            parlay={sampleParlay}
            currentRosterId={1}
            onOpenPickModal={() => {}}
          />
        )
      );
      expect(html).toContain(
        '<h2 class="text-lg sm:text-xl font-black text-white tracking-tight uppercase leading-none">Week 4 Parlay</h2>'
      );
      expect(html).toContain('Estimate');
    });

    it('renders sleek horizontal progress bar spanning width with correct count and ARIA role', () => {
      const html = cleanText(
        renderToString(
          <ParlayCard
            parlay={sampleParlay}
            currentRosterId={1}
            onOpenPickModal={() => {}}
          />
        )
      );
      expect(html).toContain('3 / 5 picks in');
      expect(html).toContain('role="progressbar"');
      expect(html).toContain('aria-valuenow="3"');
      expect(html).toContain('aria-valuemax="5"');
      expect(html).toContain('transition-none');
      expect(html).not.toContain('transition-all');
    });

    it('clarifies payout math with per-player split without noisy active divisor', () => {
      const html = cleanText(
        renderToString(
          <ParlayCard
            parlay={sampleParlay}
            currentRosterId={1}
            onOpenPickModal={() => {}}
          />
        )
      );
      // Total payout: $38.00, Payout / Player: $12.67 ($38 / 3 submitted)
      expect(html).toContain('$38.00');
      expect(html).toContain('$12.67');
      expect(html).not.toContain('÷ 3 active');
    });

    it('renders odds toggle switch in the card header', () => {
      const html = cleanText(
        renderToString(
          <ParlayCard
            parlay={sampleParlay}
            currentRosterId={1}
            onOpenPickModal={() => {}}
            oddsFormat="american"
            onToggleOddsFormat={() => {}}
          />
        )
      );
      expect(html).toContain('American');
      expect(html).toContain('% Odds');
    });
  });

  describe('Player Picks List & Contrast', () => {
    it('streamlines current user pick row with (You) tag instead of bulky badge', () => {
      const html = cleanText(
        renderToString(
          <ParlayCard
            parlay={sampleParlay}
            currentRosterId={1}
            onOpenPickModal={() => {}}
          />
        )
      );
      expect(html).toContain('(You)');
      expect(html).not.toContain('Your Weekly Pick');
    });

    it('standardizes naming order with Team Name primary and Username secondary', () => {
      const html = cleanText(
        renderToString(
          <ParlayCard
            parlay={sampleParlay}
            currentRosterId={1}
            onOpenPickModal={() => {}}
          />
        )
      );
      // Team name is primary text, owner name is in parentheses
      expect(html).toContain('Philly Special');
      expect(html).toContain('(Blake)');
      expect(html).toContain('Buffalo Stampede');
      expect(html).toContain('(Charlie)');
    });

    it('does not render Nudge button on pending legs for other players', () => {
      const html = renderToString(
        <ParlayCard
          parlay={sampleParlay}
          currentRosterId={1}
          onOpenPickModal={() => {}}
        />
      );
      expect(html).not.toContain('aria-label="Nudge Charlie to submit pick"');
      expect(html).not.toContain('aria-label="Nudge Dave to submit pick"');
      expect(html).not.toContain('aria-label="Nudge');
      expect(html).not.toContain('Nudge');
      expect(html).toContain('Pending');
    });
  });

  describe('Empty Parlay Metrics (submittedCount === 0)', () => {
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

  describe('Active Parlay Metrics (submittedCount > 0)', () => {
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
});
