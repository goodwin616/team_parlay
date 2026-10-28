import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { BettorBanner } from '../components/BettorBanner';
import { TeamLogo } from '../utils/nflTeams';
import { WeeklyParlay } from '../types';

vi.mock('../services/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/auth')>();
  return {
    ...actual,
    useAuthUser: () => ({
      user: {
        uid: 'user_blake',
        displayName: 'Blake',
        email: 'blake@example.com',
      },
      loading: false,
    }),
  };
});

import { App } from '../App';
import { saveCachedTeamId } from '../services/auth';

function cleanText(html: string): string {
  return html.replace(/<!--.*?-->/g, '');
}

describe('BettorBanner & Mobile Header Hierarchy', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key in store) delete store[key];
    const mockStorage = {
      getItem: (k: string) => store[k] || null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => {
        for (const key in store) delete store[key];
      },
    };

    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(globalThis, 'window', {
      value: {
        location: {
          pathname: '/',
          search: '',
        },
        localStorage: mockStorage,
        addEventListener: () => {},
        removeEventListener: () => {},
        history: {
          pushState: () => {},
        },
      },
      writable: true,
      configurable: true,
    });
  });

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
    legs: [],
    estimated_odds_american: '+660',
    estimated_multiplier: 7.6,
    estimated_payout: 38.0,
    combined_probability_cents: 13,
    actual_payout: null,
    actual_odds_american: null,
  };

  describe('BettorBanner Visual Hierarchy', () => {
    it('renders $5.00 Stake Due badge in dedicated sub-row with emerald styling (CR-019)', () => {
      const html = renderToString(<BettorBanner parlay={sampleParlay} />);
      expect(html).toContain('Stake Due: $5.00');
      // Verify sub-row border and styling
      expect(html).toContain('border-t border-white/5');
      expect(html).toContain('bg-emerald-500/15');
      expect(html).toContain('border-emerald-500/20');
      expect(html).toContain('text-emerald-300');
    });

    it('renders clean single-line subtext without stray bullet points', () => {
      const html = cleanText(renderToString(<BettorBanner parlay={sampleParlay} />));
      expect(html).toContain('78.4 pts last week');
      expect(html).not.toContain('On the hook');
      expect(html).not.toContain('prior week');
    });

    it('renders thematic flame iconography', () => {
      const html = renderToString(<BettorBanner parlay={sampleParlay} />);
      // lucide-react Flame icon has lucide-flame class
      expect(html).toContain('lucide-flame');
      expect(html).not.toContain('lucide-alert-circle');
    });

    it('vertically centers flame icon container with the text column (CR-013)', () => {
      const html = renderToString(<BettorBanner parlay={sampleParlay} />);
      expect(html).toContain('flex items-center space-x-3.5 min-w-0');
      // Verify mt-0.5 offset removed from icon container
      expect(html).not.toMatch(/bg-amber-500\/10[^"]*mt-0\.5/);
    });

    it('applies whitespace-nowrap and shrink-0 to Lowest Scorer badge preventing awkward multiline wrapping (CR-019)', () => {
      const html = renderToString(<BettorBanner parlay={sampleParlay} />);
      expect(html).toContain('whitespace-nowrap');
      expect(html).toContain('shrink-0');
      expect(html).toContain('Lowest Scorer');
    });

    it('gives team name full card width inside min-w-0 flex-1 container (CR-019)', () => {
      const html = cleanText(renderToString(<BettorBanner parlay={sampleParlay} />));
      expect(html).toContain('min-w-0 flex-1');
      expect(html).toContain('Gridiron Clowns');
      expect(html).toContain('(Bob)');
    });
  });

  describe('TeamLogo Contrast & Container', () => {
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

  describe('Top Navigation Header Layout (CR-019)', () => {
    it('hides "Team " prefix on small viewports via hidden sm:inline', () => {
      globalThis.window.location = {
        pathname: '/demo',
        search: '',
      } as any;
      const html = renderToString(<App />);
      expect(html).toContain('<span class="hidden sm:inline">Team </span>Parlay Tracker');
    });

    it('expands manager name button container to max-w-[120px] on mobile', () => {
      globalThis.window.location = {
        pathname: '/demo',
        search: '',
      } as any;
      saveCachedTeamId('demo', 1, 'user_blake');
      const html = renderToString(<App />);
      expect(html).toContain('Switch Team: currently viewing Blake');
      expect(html).toContain('max-w-[120px] xs:max-w-[150px] sm:max-w-[180px] md:max-w-none font-bold text-white');
    });
  });
});
