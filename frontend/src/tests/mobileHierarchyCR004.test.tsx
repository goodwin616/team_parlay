import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { BettorBanner } from '../components/BettorBanner';
import { ParlayCard } from '../components/ParlayCard';
import { TeamLogo } from '../utils/nflTeams';
import { WeeklyParlay } from '../types';

function cleanText(html: string): string {
  return html.replace(/<!--.*?-->/g, '');
}

describe('CR-004: Mobile Layout & Visual Hierarchy Refinements', () => {
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

  describe('BettorBanner Visual Hierarchy', () => {
    it('consolidates $5.00 Stake Due badge to top-right with borderless subtle styling', () => {
      const html = renderToString(<BettorBanner parlay={sampleParlay} />);
      expect(html).toContain('Stake Due: $5.00');
      // Verify borderless subtle fill styling
      expect(html).toContain('bg-emerald-500/10');
      expect(html).not.toContain('border-emerald-500/30');
    });

    it('renders clean single-line subtext without stray bullet points', () => {
      const html = cleanText(renderToString(<BettorBanner parlay={sampleParlay} />));
      expect(html).toContain(
        '78.4 pts last week • On the hook for the $5.00 ticket'
      );
      expect(html).not.toContain('prior week');
    });

    it('renders thematic flame iconography', () => {
      const html = renderToString(<BettorBanner parlay={sampleParlay} />);
      // lucide-react Flame icon has lucide-flame class
      expect(html).toContain('lucide-flame');
      expect(html).not.toContain('lucide-alert-circle');
    });
  });

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
    });

    it('clarifies payout math with per-player split and active divisor', () => {
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
      expect(html).toContain('÷ 3 active');
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

    it('renders interactive Nudge button on pending legs for other players', () => {
      const html = renderToString(
        <ParlayCard
          parlay={sampleParlay}
          currentRosterId={1}
          onOpenPickModal={() => {}}
        />
      );
      expect(html).toContain('aria-label="Nudge Charlie to submit pick"');
      expect(html).toContain('aria-label="Nudge Dave to submit pick"');
      expect(html).toContain('Nudge');
    });

    it('wraps team logos in a circular light/neutral container with subtle border for high contrast', () => {
      const htmlJets = renderToString(<TeamLogo team="NYJ" size="sm" />);
      expect(htmlJets).toContain('bg-slate-100/95');
      expect(htmlJets).toContain('rounded-full');
      expect(htmlJets).toContain('border-white/30');

      const htmlEagles = renderToString(<TeamLogo team="PHI" size="sm" />);
      expect(htmlEagles).toContain('bg-slate-100/95');
      expect(htmlEagles).toContain('rounded-full');
      expect(htmlEagles).toContain('border-white/30');
    });
  });
});
