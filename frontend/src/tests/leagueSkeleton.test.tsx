import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { LeagueSkeleton, HeaderSkeleton, BettorSpotlightSkeleton, ParlayCardSkeleton } from '../components/LeagueSkeleton';
import { TeamLogo } from '../utils/nflTeams';

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

import { App, EMPTY_PARLAY } from '../App';
import { saveCachedTeamId } from '../services/auth';

function cleanText(html: string): string {
  return html.replace(/<!--.*?-->/g, '');
}

describe('LeagueSkeleton & Loading Experience', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key in store) {
      delete store[key];
    }
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

  describe('LeagueSkeleton Component', () => {
    it('renders the complete single-column skeleton layout matching dark theme', () => {
      const html = renderToString(<LeagueSkeleton />);
      expect(html).toContain('data-testid="league-skeleton"');
      expect(html).toContain('animate-pulse');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('data-testid="header-skeleton"');
      expect(html).toContain('data-testid="bettor-spotlight-skeleton"');
      expect(html).toContain('data-testid="parlay-card-skeleton"');
    });

    it('renders HeaderSkeleton with league title and action button placeholders', () => {
      const html = renderToString(<HeaderSkeleton />);
      expect(html).toContain('data-testid="header-skeleton"');
      expect(html).toContain('bg-sleeper-card/60');
      // Action pill placeholders
      expect(html).toContain('rounded-xl bg-white/5 border border-white/5');
    });

    it('renders BettorSpotlightSkeleton with pulsing gradient placeholders for title, bettor, and sub-row stake badge (CR-019)', () => {
      const html = renderToString(<BettorSpotlightSkeleton />);
      expect(html).toContain('data-testid="bettor-spotlight-skeleton"');
      // Gradient background matching Sleeper BettorBanner
      expect(html).toContain('from-sleeper-card via-sleeper-card to-[#233144]');
      // Pulsing gradient title placeholder
      expect(html).toContain('bg-gradient-to-r from-white/15 via-white/10 to-white/5');
      // Flame placeholder container
      expect(html).toContain('bg-amber-500/10');
      // Stake due placeholder badge in sub-row
      expect(html).toContain('bg-emerald-500/10');
      // Sub-row border matching BettorBanner
      expect(html).toContain('border-t border-white/5');
      // Flame icon vertical centering matching BettorBanner (CR-013)
      expect(html).toContain('flex items-center space-x-3.5 min-w-0');
      expect(html).not.toMatch(/bg-amber-500\/10[^"]*mt-0\.5/);
    });

    it('renders ParlayCardSkeleton with header, progress bar, 4-metric grid, and 5 leg row placeholders', () => {
      const html = renderToString(<ParlayCardSkeleton legCount={5} />);
      expect(html).toContain('data-testid="parlay-card-skeleton"');
      // 4-metric grid placeholder
      expect(html).toContain('grid grid-cols-2 sm:grid-cols-4');
      // Progress bar placeholder
      expect(html).toContain('bg-gradient-to-r from-sleeper-accent/30 to-emerald-400/30');
      // 5 leg rows
      const legMatches = html.match(/data-testid="skeleton-leg-row"/g);
      expect(legMatches).toHaveLength(5);
    });

    it('honors showHeader=false to suppress header skeleton when rendered in contexts that already have a header', () => {
      const html = renderToString(<LeagueSkeleton showHeader={false} />);
      expect(html).not.toContain('data-testid="header-skeleton"');
      expect(html).toContain('data-testid="bettor-spotlight-skeleton"');
      expect(html).toContain('data-testid="parlay-card-skeleton"');
    });
  });

  describe('TeamLogo Fixed Dimensions & Layout Shift Mitigation', () => {
    it('sets fixed dimensions w-6 h-6 with aspect-square and shrink-0 for sm size', () => {
      const html = renderToString(<TeamLogo team="PHI" size="sm" />);
      expect(html).toContain('w-6 h-6');
      expect(html).toContain('min-w-[1.5rem]');
      expect(html).toContain('min-h-[1.5rem]');
      expect(html).toContain('aspect-square');
      expect(html).toContain('shrink-0');
      expect(html).toContain('width="24"');
      expect(html).toContain('height="24"');
    });

    it('sets fixed dimensions w-6 h-6 for md size and w-8 h-8 for lg size', () => {
      const htmlMd = renderToString(<TeamLogo team="KC" size="md" />);
      expect(htmlMd).toContain('w-6 h-6');
      expect(htmlMd).toContain('width="24"');

      const htmlLg = renderToString(<TeamLogo team="KC" size="lg" />);
      expect(htmlLg).toContain('w-8 h-8');
      expect(htmlLg).toContain('min-w-[2rem]');
      expect(htmlLg).toContain('min-h-[2rem]');
      expect(htmlLg).toContain('width="32"');
      expect(htmlLg).toContain('height="32"');
    });
  });

  describe('App League Loading & Flash Mitigation', () => {
    it('initializes isLoadingLeague and renders LeagueSkeleton without mock data flash for real leagues', () => {
      globalThis.window.location = {
        pathname: '/112482394829384923',
        search: '',
      } as any;

      const html = cleanText(renderToString(<App />));

      // Skeleton is present
      expect(html).toContain('data-testid="league-skeleton"');
      expect(html).toContain('data-testid="bettor-spotlight-skeleton"');
      expect(html).toContain('data-testid="parlay-card-skeleton"');
      expect(html).toContain('data-testid="header-user-skeleton"');

      // Duplicate header skeleton should NOT be rendered inside main
      expect(html).not.toContain('data-testid="header-skeleton"');

      // Mock parlay data must NOT be rendered / flashed
      expect(html).not.toContain('Philly Special');
      expect(html).not.toContain('Gridiron Clowns');
      expect(html).not.toContain('Saquon Barkley (PHI) • Anytime TD');
      expect(html).not.toContain('KC Winner (Moneyline)');
      expect(html).not.toContain('Amon-Ra St. Brown (DET) • 75+ Rec Yards');
    });

    it('renders demo league parlay immediately without skeleton delay', () => {
      globalThis.window.location = {
        pathname: '/demo',
        search: '',
      } as any;

      const html = cleanText(renderToString(<App />));

      // Skeleton should NOT be rendered for demo
      expect(html).not.toContain('data-testid="league-skeleton"');
      expect(html).not.toContain('data-testid="header-user-skeleton"');

      // Demo data should be present immediately
      expect(html).toContain('Week 4 Parlay');
      expect(html).toContain('Philly Special');
      expect(html).toContain('Gridiron Clowns');
    });

    it('renders LeagueLandingPage when no league is in the URL', () => {
      globalThis.window.location = {
        pathname: '/',
        search: '',
      } as any;

      const html = cleanText(renderToString(<App />));
      expect(html).toContain('Team Parlay Tracker');
      expect(html).toContain('Launch Demo League');
    });

    it('prompts unassigned user with Select Your Team CTA and does not auto-assign roster 1 (CR-012)', () => {
      globalThis.window.location = {
        pathname: '/demo',
        search: '',
      } as any;

      const html = cleanText(renderToString(<App />));

      // Header should show prominent "Select Your Team" CTA
      expect(html).toContain('Select Your Team');
      expect(html).toContain('aria-label="Select Your Fantasy Team"');

      // Top header should NOT display roster 1 Blake/Philly Special as active user team
      expect(html).not.toContain('Switch Team: currently viewing Blake');

      // None of the legs should be claimed / highlighted as current user's leg
      expect(html).not.toContain('(You)');
    });

    it('hides "Team " in brand title on small screens using hidden sm:inline (CR-019)', () => {
      globalThis.window.location = {
        pathname: '/demo',
        search: '',
      } as any;

      const html = renderToString(<App />);
      expect(html).toContain('<span class="hidden sm:inline">Team </span>Parlay Tracker');
    });

    it('renders active manager name with expanded mobile width classes (CR-019)', () => {
      globalThis.window.location = {
        pathname: '/demo',
        search: '',
      } as any;
      saveCachedTeamId('demo', 1, 'user_blake');

      const html = renderToString(<App />);
      expect(html).toContain('Switch Team: currently viewing Blake');
      expect(html).toContain('max-w-[120px] xs:max-w-[150px] sm:max-w-[180px] md:max-w-none font-bold text-white');
    });

    it('ensures EMPTY_PARLAY has no legs and isRealDataLoaded is false', () => {
      expect(EMPTY_PARLAY.legs).toEqual([]);
      expect(EMPTY_PARLAY.isRealDataLoaded).toBe(false);
      expect(EMPTY_PARLAY.bettor.roster_id).toBe(0);
    });
  });
});
