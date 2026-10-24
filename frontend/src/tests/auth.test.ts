import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveSession,
  getSession,
  clearSession,
  isAuthenticated,
  getCurrentRosterId,
  parseLeagueIdInput,
  getLeagueIdFromLocation,
  getRecentLeagues,
  saveRecentLeague,
} from '../services/auth';

describe('Auth & Multi-League URL Service', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key in store) {
      delete store[key];
    }
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => store[k] || null,
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
        clear: () => {
          for (const key in store) delete store[key];
        },
      },
      writable: true,
      configurable: true,
    });
    clearSession();
  });

  it('starts unauthenticated when localStorage is empty', () => {
    expect(isAuthenticated()).toBe(false);
    expect(getCurrentRosterId()).toBeNull();
    expect(getSession()).toBeNull();
  });

  it('saves session token and rosterId scoped by leagueId without storing raw PINs', () => {
    const token = 'uuid-random-session-token-987';
    saveSession(3, token, '1312915483992809472');

    expect(isAuthenticated('1312915483992809472')).toBe(true);
    expect(getCurrentRosterId('1312915483992809472')).toBe(3);
    expect(isAuthenticated('other_league')).toBe(false);

    const session = getSession('1312915483992809472');
    expect(session).toEqual({
      rosterId: 3,
      sessionToken: token,
      leagueId: '1312915483992809472',
    });

    expect(store['pin']).toBeUndefined();
    expect(store['pin_hash']).toBeUndefined();
  });

  it('clears session on clearSession()', () => {
    saveSession(1, 'token-123', 'demo');
    expect(isAuthenticated('demo')).toBe(true);

    clearSession('demo');
    expect(isAuthenticated('demo')).toBe(false);
    expect(getSession('demo')).toBeNull();
    expect(getCurrentRosterId('demo')).toBeNull();
  });

  it('parses Sleeper League IDs from raw input and full URLs', () => {
    expect(parseLeagueIdInput('1312915483992809472')).toBe('1312915483992809472');
    expect(parseLeagueIdInput('https://sleeper.com/leagues/1312915483992809472/team')).toBe('1312915483992809472');
    expect(parseLeagueIdInput('  demo  ')).toBe('demo');
    expect(parseLeagueIdInput('')).toBe('');
  });

  it('extracts leagueId from window location path and query params', () => {
    expect(getLeagueIdFromLocation({ pathname: '/', search: '' })).toBeNull();
    expect(getLeagueIdFromLocation({ pathname: '/1312915483992809472', search: '' })).toBe('1312915483992809472');
    expect(getLeagueIdFromLocation({ pathname: '/league/1312915483992809472', search: '' })).toBe('1312915483992809472');
    expect(getLeagueIdFromLocation({ pathname: '/', search: '?league=demo' })).toBe('demo');
  });

  describe('Recent Leagues storage', () => {
    it('does not save "demo" (case-insensitive) to recent leagues', () => {
      saveRecentLeague('demo');
      expect(getRecentLeagues()).toEqual([]);

      saveRecentLeague('Demo', 'Demo League');
      expect(getRecentLeagues()).toEqual([]);

      saveRecentLeague('DEMO');
      expect(getRecentLeagues()).toEqual([]);

      saveRecentLeague('123456', 'My League');
      expect(getRecentLeagues()).toHaveLength(1);
      expect(getRecentLeagues()[0].leagueId).toBe('123456');
      expect(getRecentLeagues()[0].name).toBe('My League');

      // Attempting to save demo after a real league should not add it
      saveRecentLeague('demo');
      expect(getRecentLeagues()).toHaveLength(1);
      expect(getRecentLeagues()[0].leagueId).toBe('123456');
    });

    it('filters out any legacy "demo" entries stored in localStorage', () => {
      const legacyData = [
        { leagueId: 'demo', name: 'Demo League', lastVisited: '2026-10-23T00:00:00.000Z' },
        { leagueId: 'DEMO', name: 'Demo League 2', lastVisited: '2026-10-23T00:00:00.000Z' },
        { leagueId: '1312915483992809472', name: 'Championship League', lastVisited: '2026-10-23T01:00:00.000Z' },
      ];
      localStorage.setItem('tp_recent_leagues', JSON.stringify(legacyData));

      const leagues = getRecentLeagues();
      expect(leagues).toHaveLength(1);
      expect(leagues[0].leagueId).toBe('1312915483992809472');
      expect(leagues[0].name).toBe('Championship League');
    });
  });
});
