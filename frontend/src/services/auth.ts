/**
 * Client authentication, multi-league URL parsing, and session token management.
 * RAW PINS AND HASHES NEVER TOUCH CLIENT PERSISTENCE.
 * Only the server-issued random sessionToken and rosterId are persisted in localStorage.
 */

const SESSION_TOKEN_KEY = 'tp_session_token';
const ROSTER_ID_KEY = 'tp_roster_id';
const RECENT_LEAGUES_KEY = 'tp_recent_leagues';

export interface AuthSession {
  rosterId: number;
  sessionToken: string;
  leagueId?: string;
}

export interface RecentLeague {
  leagueId: string;
  name: string;
  lastVisited: string;
}

function getLeagueStorageKeys(leagueId?: string) {
  if (!leagueId) {
    return { tokenKey: SESSION_TOKEN_KEY, rosterKey: ROSTER_ID_KEY };
  }
  return {
    tokenKey: `${SESSION_TOKEN_KEY}_${leagueId}`,
    rosterKey: `${ROSTER_ID_KEY}_${leagueId}`,
  };
}

/**
 * Persists the server-issued session token and roster ID (scoped by leagueId if provided).
 */
export function saveSession(rosterId: number, sessionToken: string, leagueId?: string): void {
  const { tokenKey, rosterKey } = getLeagueStorageKeys(leagueId);
  localStorage.setItem(rosterKey, rosterId.toString());
  localStorage.setItem(tokenKey, sessionToken);
}

/**
 * Retrieves the currently active session from localStorage, or null if unauthenticated.
 */
export function getSession(leagueId?: string): AuthSession | null {
  const { tokenKey, rosterKey } = getLeagueStorageKeys(leagueId);
  const rosterStr = localStorage.getItem(rosterKey);
  const token = localStorage.getItem(tokenKey);
  if (!rosterStr || !token) {
    return null;
  }
  const rosterId = parseInt(rosterStr, 10);
  if (isNaN(rosterId)) {
    clearSession(leagueId);
    return null;
  }
  return { rosterId, sessionToken: token, leagueId };
}

/**
 * Clears active session credentials upon logout or invalidation.
 */
export function clearSession(leagueId?: string): void {
  const { tokenKey, rosterKey } = getLeagueStorageKeys(leagueId);
  localStorage.removeItem(rosterKey);
  localStorage.removeItem(tokenKey);
}

/**
 * Checks whether an active session exists.
 */
export function isAuthenticated(leagueId?: string): boolean {
  return getSession(leagueId) !== null;
}

/**
 * Returns current authenticated roster ID if logged in, else null.
 */
export function getCurrentRosterId(leagueId?: string): number | null {
  const session = getSession(leagueId);
  return session ? session.rosterId : null;
}

/**
 * Extracts a Sleeper League ID from either a raw ID string or a full Sleeper URL
 * (e.g. "https://sleeper.com/leagues/1312915483992809472/matchup" -> "1312915483992809472").
 */
export function parseLeagueIdInput(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';
  const urlMatch = trimmed.match(/leagues\/([A-Za-z0-9_-]+)/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }
  return trimmed.replace(/[^A-Za-z0-9_-]/g, '');
}

/**
 * Extracts the current leagueId from window.location (supports /:leagueId, /league/:leagueId, or ?league=...).
 */
export function getLeagueIdFromLocation(loc: { pathname: string; search: string }): string | null {
  const params = new URLSearchParams(loc.search);
  const fromQuery = params.get('league') || params.get('leagueId');
  if (fromQuery && fromQuery.trim()) {
    return parseLeagueIdInput(fromQuery);
  }

  const segments = loc.pathname
    .split('/')
    .map(s => s.trim())
    .filter(Boolean);

  if (segments.length === 0) return null;
  if (segments[0].toLowerCase() === 'league' || segments[0].toLowerCase() === 'leagues') {
    return segments[1] ? parseLeagueIdInput(segments[1]) : null;
  }
  return parseLeagueIdInput(segments[0]);
}

export function getRecentLeagues(): RecentLeague[] {
  try {
    const raw = localStorage.getItem(RECENT_LEAGUES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (league: RecentLeague) =>
        league &&
        typeof league.leagueId === 'string' &&
        league.leagueId.trim().toLowerCase() !== 'demo'
    );
  } catch {
    return [];
  }
}

export function saveRecentLeague(leagueId: string, name?: string): void {
  if (!leagueId || leagueId.trim().toLowerCase() === 'demo') return;
  const existing = getRecentLeagues();
  const prev = existing.find(l => l.leagueId === leagueId);
  const entry: RecentLeague = {
    leagueId,
    name: name || prev?.name || `League ${leagueId}`,
    lastVisited: new Date().toISOString(),
  };
  const updated = [entry, ...existing.filter(l => l.leagueId !== leagueId)].slice(0, 5);
  localStorage.setItem(RECENT_LEAGUES_KEY, JSON.stringify(updated));
}
