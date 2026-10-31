import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  LeagueStatusPage,
  buildSanitizedStatusPayload,
  renderStatusMarkdown,
} from '../components/LeagueStatusPage';
import { WeeklyParlay, TeamProfile } from '../types';

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

import { App } from '../App';

const SAMPLE_TEAMS: TeamProfile[] = [
  {
    roster_id: 1,
    owner_id: 'sleeper_1',
    owner_name: 'Blake',
    team_name: 'Philly Special',
    claimed_by: {
      uid: 'secret_google_uid_1',
      name: 'Blake Secret',
      photo_url: 'https://lh3.googleusercontent.com/secret',
      claimed_at: '2026-10-01T00:00:00Z',
    },
  },
  {
    roster_id: 2,
    owner_id: 'sleeper_2',
    owner_name: 'Bob',
    team_name: 'Gridiron Clowns',
  },
];

const SAMPLE_PARLAY: WeeklyParlay = {
  week: 4,
  season: '2026',
  status: 'open',
  outcome: 'pending',
  contains_sgp: false,
  bettor: {
    roster_id: 2,
    team_name: 'Gridiron Clowns',
    owner_name: 'Bob',
    points_last_week: 78.4,
  },
  earliest_kickoff: '2026-11-01T17:00:00Z',
  legs: [
    {
      id: 'l1',
      roster_id: 1,
      team_name: 'Philly Special',
      owner_name: 'Blake',
      nfl_team: 'PHI',
      description: 'Saquon Barkley (PHI) • Anytime TD (1+) (YES)',
      odds_american: '-117',
      odds_decimal: 1.8519,
      price_cents: 54,
      status: 'submitted',
      last_edited_by: {
        uid: 'secret_google_uid_1',
        name: 'Blake Secret',
      },
    },
    {
      id: 'l2',
      roster_id: 2,
      team_name: 'Gridiron Clowns',
      owner_name: 'Bob',
      nfl_team: 'NFL',
      description: '',
      odds_american: '-110',
      odds_decimal: 1.91,
      status: 'pending',
    },
  ],
  estimated_odds_american: '-117',
  estimated_multiplier: 1.85,
  estimated_payout: 9.26,
  actual_payout: null,
  actual_odds_american: null,
};

describe('LeagueStatusPage & Agent Read-Only View', () => {
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

  it('strips all Google Auth PII and builds sanitized agent status payload', () => {
    const payload = buildSanitizedStatusPayload({
      leagueId: '12345',
      leagueName: 'Sunday Degens',
      season: '2026',
      currentWeek: 4,
      teams: SAMPLE_TEAMS,
      parlay: SAMPLE_PARLAY,
    });

    expect(payload.league_id).toBe('12345');
    expect(payload.parlay.counts).toEqual({
      total_managers: 2,
      submitted: 1,
      pending: 1,
    });
    const raw = JSON.stringify(payload);
    expect(raw).not.toContain('secret_google_uid_1');
    expect(raw).not.toContain('claimed_by');
    expect(raw).not.toContain('last_edited_by');
    expect(raw).not.toContain('sleeper_1');
  });

  it('renders submitted picks, pending managers, Markdown summary, and embedded JSON script', () => {
    const payload = buildSanitizedStatusPayload({
      leagueId: '12345',
      leagueName: 'Sunday Degens',
      season: '2026',
      currentWeek: 4,
      teams: SAMPLE_TEAMS,
      parlay: SAMPLE_PARLAY,
    });

    const markdown = renderStatusMarkdown(payload);
    expect(markdown).toContain('# Sunday Degens — Week 4 Parlay Status');
    expect(markdown).toContain('Saquon Barkley');

    const html = renderToString(
      <LeagueStatusPage payload={payload} initialFormat="html" />
    );

    expect(html).toContain('Sunday Degens — Week 4 Parlay Status');
    expect(html).toContain('Saquon Barkley (PHI)');
    expect(html).toContain('Waiting On / Pending Managers (1)');
    expect(html).toContain('id="agent-status-json"');
    expect(html).toContain('12345');

    // Initial format JSON
    const jsonHtml = renderToString(
      <LeagueStatusPage payload={payload} initialFormat="json" />
    );
    expect(jsonHtml).toContain('data-testid="agent-status-raw-json"');

    // Initial format Markdown
    const mdHtml = renderToString(
      <LeagueStatusPage payload={payload} initialFormat="md" />
    );
    expect(mdHtml).toContain('data-testid="agent-status-raw-md"');
    expect(mdHtml).toContain('id="agent-status-markdown"');
    expect(mdHtml).toContain('# Sunday Degens — Week 4 Parlay Status');
  });

  it('escapes </ in embedded script tag if team name or description contains </script> and parses cleanly via JSON.parse', () => {
    const maliciousParlay: WeeklyParlay = {
      ...SAMPLE_PARLAY,
      legs: [
        {
          ...SAMPLE_PARLAY.legs[0],
          team_name: 'Philly </script><script>alert(1)</script>',
          description: 'Anytime TD </script>',
        },
      ],
    };

    const payload = buildSanitizedStatusPayload({
      leagueId: '12345',
      leagueName: 'Sunday Degens',
      season: '2026',
      currentWeek: 4,
      teams: [
        {
          ...SAMPLE_TEAMS[0],
          team_name: 'Philly </script><script>alert(1)</script>',
        },
        SAMPLE_TEAMS[1],
      ],
      parlay: maliciousParlay,
    });

    const html = renderToString(
      <LeagueStatusPage payload={payload} initialFormat="html" />
    );

    const scriptTagMatch = html.match(/<script id="agent-status-json"[^>]*>([\s\S]*?)<\/script>/);
    expect(scriptTagMatch).not.toBeNull();
    const scriptContent = scriptTagMatch![1];
    expect(scriptContent).not.toContain('</script>');
    expect(scriptContent).toContain('<\\/script>');

    const parsed = JSON.parse(scriptContent);
    expect(parsed.parlay.submitted_legs[0].team_name).toBe(
      'Philly </script><script>alert(1)</script>'
    );
    expect(parsed.parlay.submitted_legs[0].description).toBe('Anytime TD </script>');
  });

  it('renders /status/demo in App without requiring Google Sign-In', () => {
    window.location.pathname = '/status/demo';
    window.location.search = '';

    const html = renderToString(<App />);

    expect(html).toContain('Demo Sleeper League — Week 4 Parlay Status');
    expect(html).not.toContain('Sign in with Google');
  });

  it('renders requested week (e.g. ?week=2) parlay status on /status/demo?week=2', () => {
    window.location.pathname = '/status/demo';
    window.location.search = '?week=2';

    const html = renderToString(<App />);

    expect(html).toContain('Demo Sleeper League — Week 2 Parlay Status');
    expect(html).not.toContain('Sign in with Google');
  });

  it('renders Status Page link in the footer on /demo', () => {
    window.location.pathname = '/demo';
    window.location.search = '';

    const html = renderToString(<App />);

    expect(html).toContain('Status Page');
    expect(html).toContain('href="/status/demo"');
  });
});
