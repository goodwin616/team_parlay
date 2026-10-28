import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SignInGate } from '../components/SignInGate';
import { TeamPickerModal, selectTeamInDemoMode } from '../components/TeamPickerModal';
import { TeamProfile, WeeklyParlay } from '../types';
import { PickData } from '../components/PickModal';

const { mockCallable, mockOnSnapshot } = vi.hoisted(() => ({
  mockCallable: vi.fn(),
  mockOnSnapshot: vi.fn(() => () => {}),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  connectFunctionsEmulator: vi.fn(),
  httpsCallable: vi.fn((_fns: any, name: string) => {
    return (...args: any[]) => {
      mockCallable(name, ...args);
      return Promise.resolve({ data: {} });
    };
  }),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: mockOnSnapshot,
}));

let mockUser: any = null;
let mockLoading = false;

vi.mock('../services/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/auth')>();
  return {
    ...actual,
    useAuthUser: () => ({
      user: mockUser,
      loading: mockLoading,
    }),
    signInWithGoogle: vi.fn(),
    signOutUser: vi.fn(),
  };
});

import { App, submitPickToParlay, MOCK_PAST_PARLAYS } from '../App';
import { saveCachedTeamId, getCachedTeamId, clearCachedTeamId } from '../services/auth';
import { PastSlipsArchive } from '../components/PastSlipsArchive';

describe('Demo Mode Authentication & Firestore Isolation (CR-032)', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    mockCallable.mockClear();
    mockOnSnapshot.mockClear();
    mockUser = null;
    mockLoading = false;

    for (const key in store) {
      delete store[key];
    }

    const mockStorage = {
      getItem: (k: string) => store[k] || null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
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
          pathname: '/demo',
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

  describe('1. SignInGate enabled prop', () => {
    it('renders children when enabled={false} even if user={null} and loading={true}', () => {
      const html = renderToString(
        <SignInGate user={null} loading={true} leagueName="Test League" enabled={false}>
          <div data-testid="unprotected-content">Demo Mode Content Allowed</div>
        </SignInGate>
      );

      expect(html).toContain('Demo Mode Content Allowed');
      expect(html).not.toContain('Checking authentication...');
      expect(html).not.toContain('Sign in with Google');
    });

    it('renders children when enabled={false} even if user={null} and loading={false}', () => {
      const html = renderToString(
        <SignInGate user={null} loading={false} leagueName="Test League" enabled={false}>
          <div data-testid="unprotected-content">Demo Mode Content Allowed</div>
        </SignInGate>
      );

      expect(html).toContain('Demo Mode Content Allowed');
      expect(html).not.toContain('Sign in with Google');
    });

    it('blocks access when enabled={true} and user={null}', () => {
      const html = renderToString(
        <SignInGate user={null} loading={false} leagueName="Real Sleeper League" enabled={true}>
          <div data-testid="protected-content">Protected Content</div>
        </SignInGate>
      );

      expect(html).not.toContain('Protected Content');
      expect(html).toContain('Sign in with Google');
      expect(html).toContain('Real Sleeper League');
    });
  });

  describe('2. Visiting demo mode without authentication', () => {
    it('renders the demo dashboard with mock teams and parlay without rendering sign-in screen', () => {
      mockUser = null;
      mockLoading = false;

      const html = renderToString(<App />);

      // 1. Should NOT render SignInGate screen
      expect(html).not.toContain('Sign in with your Google account');
      expect(html).not.toContain('Checking authentication...');

      // 2. Renders Demo League and mock teams/parlay
      expect(html).toContain('Demo Sleeper League');
      expect(html).toContain('Philly Special');
      expect(html).toContain('Gridiron Clowns');
      expect(html).toContain('Saquon Barkley');

      // 3. Renders demo menu button in header for unauthenticated users
      expect(html).toContain('aria-label="Open menu"');
      expect(html).toContain('Menu');

      // 4. Firestore listeners should NOT be attached for demo
      expect(mockOnSnapshot).not.toHaveBeenCalled();

      // 5. Cloud Function init_or_sync_league should NOT be called for demo
      expect(mockCallable).not.toHaveBeenCalledWith('init_or_sync_league', expect.anything());
    });
  });

  describe('3. Pick submission in Demo Mode', () => {
    const mockCurrentTeam: TeamProfile = {
      roster_id: 4,
      owner_id: 'u4',
      owner_name: 'Charlie',
      team_name: 'Buffalo Stampede',
    };

    const initialTestParlay: WeeklyParlay = {
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
      ],
      estimated_odds_american: '+240',
      estimated_multiplier: 3.4,
      estimated_payout: 17.0,
      combined_probability_cents: 29,
      actual_payout: null,
      actual_odds_american: null,
    };

    const samplePick: PickData = {
      nfl_team: 'BUF',
      description: 'Josh Allen (BUF) • Over 1.5 Passing TDs (YES)',
      odds_american: '+105',
      odds_decimal: 2.05,
      price_cents: 48,
      kalshi_market_ticker: 'KXNFLPASS-26NOV01-JOSHALLEN-1.5',
      kalshi_side: 'yes',
      kickoff_time: '2026-11-01T17:00:00Z',
      game_id: 'KXNFL-26NOV01-BUF',
    };

    it('submitting a pick in demo mode updates local parlay state without calling submit_leg Cloud Function', async () => {
      const submitFnMock = vi.fn();

      const result = await submitPickToParlay({
        currentRosterId: 4,
        currentTeam: mockCurrentTeam,
        pick: samplePick,
        parlay: initialTestParlay,
        isClaimedByOther: false,
        user: null,
        isDemo: true,
        leagueId: 'demo',
        season: '2026',
        submitFn: submitFnMock,
      });

      // 1. Local state must be updated
      const updatedLeg = result.updatedParlay.legs.find((l) => l.roster_id === 4);
      expect(updatedLeg).toBeDefined();
      expect(updatedLeg?.status).toBe('submitted');
      expect(updatedLeg?.description).toBe('Josh Allen (BUF) • Over 1.5 Passing TDs (YES)');
      expect(updatedLeg?.odds_american).toBe('+105');
      expect(updatedLeg?.last_edited_by).toEqual({
        uid: 'demo_user',
        name: 'Demo Manager',
      });

      // 2. Parlay stats must be recalculated
      expect(result.updatedParlay.estimated_odds_american).not.toBe(initialTestParlay.estimated_odds_american);
      expect(result.updatedParlay.estimated_payout).toBeGreaterThan(0);

      // 3. Cloud Function must NOT be called in demo mode
      expect(submitFnMock).not.toHaveBeenCalled();
      expect(result.calledSubmitFn).toBe(false);
    });

    it('submitting a pick in non-demo mode calls submitFn', async () => {
      const submitFnMock = vi.fn().mockResolvedValue({ data: { success: true } });

      const result = await submitPickToParlay({
        currentRosterId: 4,
        currentTeam: mockCurrentTeam,
        pick: samplePick,
        parlay: initialTestParlay,
        isClaimedByOther: false,
        user: { uid: 'real_user', displayName: 'Real User' },
        isDemo: false,
        leagueId: '123456789',
        season: '2026',
        submitFn: submitFnMock,
      });

      expect(submitFnMock).toHaveBeenCalledWith(
        expect.objectContaining({
          league_id: '123456789',
          season: '2026',
          roster_id: 4,
        })
      );
      expect(result.calledSubmitFn).toBe(true);
    });
  });

  describe('4. Team selection in Demo Mode', () => {
    const mockTeams: TeamProfile[] = [
      {
        roster_id: 1,
        owner_id: 'u1',
        owner_name: 'Blake',
        team_name: 'Philly Special',
      },
      {
        roster_id: 2,
        owner_id: 'u2',
        owner_name: 'Bob',
        team_name: 'Gridiron Clowns',
      },
    ];

    it('immediately triggers local selection in demo mode without calling Cloud Functions', () => {
      const onTeamSelected = vi.fn();
      const onClose = vi.fn();

      selectTeamInDemoMode({
        team: mockTeams[1],
        currentUserId: undefined,
        onTeamSelected,
        onClose,
      });

      expect(onTeamSelected).toHaveBeenCalledWith(
        2,
        expect.objectContaining({
          uid: 'demo_user',
          name: 'Demo Manager',
        })
      );
      expect(onClose).toHaveBeenCalled();
      expect(mockCallable).not.toHaveBeenCalled();
    });

    it('persists and retrieves demo team selection across refreshes for unauthenticated users', () => {
      clearCachedTeamId('demo');
      expect(getCachedTeamId('demo')).toBeNull();

      // Save without passing a uid - should default to demo_user
      saveCachedTeamId('demo', 3);
      expect(getCachedTeamId('demo')).toBe(3);
      expect(getCachedTeamId('demo', 'demo_user')).toBe(3);

      clearCachedTeamId('demo');
      expect(getCachedTeamId('demo')).toBeNull();
    });

    it('renders TeamPickerModal for demo league cleanly', () => {
      const html = renderToString(
        <TeamPickerModal
          isOpen={true}
          onClose={() => {}}
          teams={mockTeams}
          currentRosterId={null}
          currentUserId={undefined}
          leagueId="demo"
          season="2026"
          onTeamSelected={() => {}}
        />
      );

      expect(html).toContain('Select Your Fantasy Team');
      expect(html).toContain('Philly Special');
      expect(html).toContain('Gridiron Clowns');
    });
  });

  describe('5. Non-demo league enforcement', () => {
    it('non-demo leagues still enforce SignInGate for unauthenticated users', () => {
      mockUser = null;
      mockLoading = false;

      Object.defineProperty(globalThis, 'window', {
        value: {
          location: {
            pathname: '/1312915483992809472',
            search: '',
          },
          localStorage: {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
            clear: () => {},
          },
          addEventListener: () => {},
          removeEventListener: () => {},
          history: {
            pushState: () => {},
          },
        },
        writable: true,
        configurable: true,
      });

      const html = renderToString(<App />);

      // In non-demo league with unauthenticated user:
      // SignInGate MUST be shown
      expect(html).toContain('Sign in with Google');
      expect(html).toContain('Team Parlay Tracker');

      // ParlayCard content must NOT be visible
      expect(html).not.toContain('Weekly Bettor Spotlight');
      expect(html).not.toContain('Estimated Payout');
    });
  });

  describe('6. Demo Past Slips Archive Fake Settled Outcomes (CR-033)', () => {
    it('provides realistic fake settled data across Week 3, Week 2, and Week 1', () => {
      expect(MOCK_PAST_PARLAYS).toHaveLength(3);

      const [week3, week2, week1] = MOCK_PAST_PARLAYS;

      // Week 3 (Won Ticket)
      expect(week3.week).toBe(3);
      expect(week3.status).toBe('won');
      expect(week3.outcome).toBe('won');
      expect(week3.settlement_status).toBe('finalized');
      expect(week3.settled_at).toBe('2026-09-22T04:00:00Z');
      expect(week3.actual_payout).toBe(133.20);
      expect(week3.legs).toHaveLength(5);
      week3.legs.forEach((leg) => {
        expect(leg.status).toBe('won');
        expect(leg.outcome).toBe('won');
        expect(leg.settled_at).toBe('2026-09-21T03:30:00Z');
      });

      // Week 2 (Heartbreaker Lost Ticket)
      expect(week2.week).toBe(2);
      expect(week2.status).toBe('lost');
      expect(week2.outcome).toBe('lost');
      expect(week2.settlement_status).toBe('finalized');
      expect(week2.settled_at).toBe('2026-09-15T04:00:00Z');
      expect(week2.actual_payout).toBeNull();
      expect(week2.legs).toHaveLength(5);
      const losingLegs = week2.legs.filter((l) => l.status === 'lost');
      const winningLegs = week2.legs.filter((l) => l.status === 'won');
      expect(losingLegs).toHaveLength(1);
      expect(winningLegs).toHaveLength(4);
      expect(losingLegs[0].description).toContain('Travis Kelce');
      expect(losingLegs[0].outcome).toBe('lost');
      expect(losingLegs[0].settled_at).toBe('2026-09-14T03:00:00Z');
      winningLegs.forEach((leg) => {
        expect(leg.outcome).toBe('won');
        expect(leg.settled_at).toBe('2026-09-14T03:00:00Z');
      });

      // Week 1 (Combo Void / Push Ticket)
      expect(week1.week).toBe(1);
      expect(week1.season).toBe('2026');
      expect(week1.status).toBe('won');
      expect(week1.outcome).toBe('won');
      expect(week1.settlement_status).toBe('finalized');
      expect(week1.settled_at).toBe('2026-09-08T04:00:00Z');
      expect(week1.bettor).toEqual({
        roster_id: 3,
        team_name: 'Motor City Kitties',
        owner_name: 'Alice',
        points_last_week: 74.2,
      });
      expect(week1.earliest_kickoff).toBe('2026-09-03T20:15:00Z');
      expect(week1.estimated_payout).toBe(65.00);
      expect(week1.actual_payout).toBe(42.50);
      expect(week1.legs).toHaveLength(4);
      const voidLegs = week1.legs.filter((l) => l.status === 'voided');
      const w1WinningLegs = week1.legs.filter((l) => l.status === 'won');
      expect(voidLegs).toHaveLength(1);
      expect(w1WinningLegs).toHaveLength(3);
      expect(voidLegs[0].outcome).toBe('void');
      expect(voidLegs[0].description).toContain('Christian McCaffrey');
      w1WinningLegs.forEach((leg) => {
        expect(leg.outcome).toBe('won');
      });
    });

    it('renders all settlement badges (🏆 WON, ❌ LOST, HIT, MISS, PUSH) when displaying MOCK_PAST_PARLAYS in PastSlipsArchive', () => {
      // Clean HTML tags and comments
      const rawHtml = renderToString(
        <PastSlipsArchive
          isOpen={true}
          onClose={() => {}}
          pastParlays={MOCK_PAST_PARLAYS}
        />
      );
      const html = rawHtml.replace(/<!--.*?-->/g, '');

      // Parlay-level outcome badges
      expect(html).toContain('🏆 WON ($133.20)');
      expect(html).toContain('❌ LOST');
      expect(html).toContain('🏆 WON ($42.50)');

      // Leg-level outcome badges
      // Since Week 3 is expanded by default (pastParlays[0].week):
      expect(html).toContain('HIT');
      expect(html).toContain('Jalen Hurts (PHI) • 2+ Passing TDs (YES)');

      // Render individual week archives to verify MISS and PUSH leg badges
      const week2Html = renderToString(
        <PastSlipsArchive
          isOpen={true}
          onClose={() => {}}
          pastParlays={[MOCK_PAST_PARLAYS[1]]}
        />
      ).replace(/<!--.*?-->/g, '');
      expect(week2Html).toContain('MISS');
      expect(week2Html).toContain('Travis Kelce (KC) • Anytime TD (1+) (YES)');
      expect(week2Html).toContain('HIT');

      const week1Html = renderToString(
        <PastSlipsArchive
          isOpen={true}
          onClose={() => {}}
          pastParlays={[MOCK_PAST_PARLAYS[2]]}
        />
      ).replace(/<!--.*?-->/g, '');
      expect(week1Html).toContain('PUSH');
      expect(week1Html).toContain('Christian McCaffrey (SF) • Anytime TD (1+) (YES)');
      expect(week1Html).toContain('HIT');
    });
  });
});
