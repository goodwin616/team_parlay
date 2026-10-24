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
 * Persists the user's selected team ID in localStorage for a specific league.
 */
export function saveCachedTeamId(leagueId: string, rosterId: number): void {
  if (!leagueId) return;
  try {
    localStorage.setItem(`${TEAM_CACHE_PREFIX}${leagueId}`, String(rosterId));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Retrieves cached selected team ID from localStorage for a specific league.
 */
export function getCachedTeamId(leagueId: string): number | null {
  if (!leagueId) return null;
  try {
    const val = localStorage.getItem(`${TEAM_CACHE_PREFIX}${leagueId}`);
    if (!val) return null;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? null : parsed;
  } catch {
    return null;
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
