import { useState, useEffect } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
  UserCredential,
} from 'firebase/auth';
import { auth } from './firebase';

/**
 * Client authentication, Google Sign-In, multi-league URL parsing, and team cache.
 */

const RECENT_LEAGUES_KEY = 'tp_recent_leagues';
const TEAM_CACHE_PREFIX = 'tp_team_cache_';

export interface RecentLeague {
  leagueId: string;
  name: string;
  lastVisited: string;
}

/**
 * Trigger Google Sign-In via popup.
 */
export async function signInWithGoogle(): Promise<UserCredential> {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

/**
 * Sign out the currently authenticated user.
 */
export async function signOutUser(): Promise<void> {
  return signOut(auth);
}

/**
 * React hook to observe Firebase Auth state.
 */
export function useAuthUser(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(() => auth.currentUser);
  const [loading, setLoading] = useState<boolean>(() => !auth.currentUser);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return { user, loading };
}

/**
 * Persists the user's selected team ID in localStorage for a specific league and user UID.
 */
export function saveCachedTeamId(leagueId: string, rosterId: number, uid?: string): void {
  if (!leagueId) return;
  const effectiveUid = uid || (leagueId.toLowerCase() === 'demo' ? 'demo_user' : '');
  if (!effectiveUid) return;
  try {
    localStorage.removeItem(`${TEAM_CACHE_PREFIX}${leagueId}`);
    localStorage.setItem(`${TEAM_CACHE_PREFIX}${effectiveUid}_${leagueId}`, String(rosterId));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Retrieves cached selected team ID from localStorage for a specific league and user UID.
 */
export function getCachedTeamId(leagueId: string, uid?: string): number | null {
  if (!leagueId) return null;
  try {
    // Clean up / remove any legacy un-scoped entry so old shared values don't leak
    localStorage.removeItem(`${TEAM_CACHE_PREFIX}${leagueId}`);

    const effectiveUid = uid || (leagueId.toLowerCase() === 'demo' ? 'demo_user' : '');
    if (!effectiveUid) return null;
    const val = localStorage.getItem(`${TEAM_CACHE_PREFIX}${effectiveUid}_${leagueId}`);
    if (!val) return null;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

/**
 * Removes cached selected team ID from localStorage.
 */
export function clearCachedTeamId(leagueId: string, uid?: string): void {
  if (!leagueId) return;
  try {
    const effectiveUid = uid || (leagueId.toLowerCase() === 'demo' ? 'demo_user' : '');
    if (effectiveUid) {
      localStorage.removeItem(`${TEAM_CACHE_PREFIX}${effectiveUid}_${leagueId}`);
    }
    localStorage.removeItem(`${TEAM_CACHE_PREFIX}${leagueId}`);
  } catch {
    // Ignore
  }
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

export interface StatusRouteParams {
  isStatusRoute: boolean;
  leagueId: string | null;
  week: number | null;
  format: 'html' | 'json' | 'md';
}

/**
 * Extracts the current leagueId from window.location (supports /:leagueId, /league/:leagueId,
 * /status/:leagueId, /:leagueId/status, or ?league=...).
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
  const first = segments[0].toLowerCase();
  if (first === 'league' || first === 'leagues' || first === 'status') {
    if (!segments[1] || segments[1].toLowerCase() === 'status') return null;
    return parseLeagueIdInput(segments[1]);
  }
  return parseLeagueIdInput(segments[0]);
}

/**
 * Detects whether the current location is the read-only agent status page
 * (/status/:leagueId, /:leagueId/status, /league/:leagueId/status) and parses query options.
 */
export function parseStatusRouteFromLocation(loc: { pathname: string; search: string }): StatusRouteParams {
  const segments = loc.pathname
    .split('/')
    .map(s => s.trim())
    .filter(Boolean);

  const first = segments[0]?.toLowerCase() || '';
  const second = segments[1]?.toLowerCase() || '';
  const third = segments[2]?.toLowerCase() || '';

  const isStatusPath =
    (first === 'status' && segments.length >= 2) ||
    (segments.length >= 2 && second === 'status' && first !== 'league' && first !== 'leagues') ||
    ((first === 'league' || first === 'leagues') && third === 'status' && segments.length >= 3);

  const leagueId = getLeagueIdFromLocation(loc);
  const params = new URLSearchParams(loc.search);

  let week: number | null = null;
  const rawWeek = params.get('week');
  if (rawWeek) {
    const parsedWeek = parseInt(rawWeek, 10);
    if (!isNaN(parsedWeek) && parsedWeek >= 1) {
      week = parsedWeek;
    }
  }

  const rawFormat = (params.get('format') || '').trim().toLowerCase();
  const format: 'html' | 'json' | 'md' =
    rawFormat === 'json'
      ? 'json'
      : rawFormat === 'md' || rawFormat === 'markdown' || rawFormat === 'text'
      ? 'md'
      : 'html';

  return {
    isStatusRoute: isStatusPath && Boolean(leagueId),
    leagueId,
    week,
    format,
  };
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
