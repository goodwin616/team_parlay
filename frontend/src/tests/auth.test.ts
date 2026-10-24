import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveCachedTeamId,
  getCachedTeamId,
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
  });

  describe('Team Cache', () => {
    it('returns null when no team is cached', () => {
      expect(getCachedTeamId('12345')).toBeNull();
    });

    it('saves and retrieves cached teamId scoped by leagueId', () => {
      saveCachedTeamId('league_1', 3);
      saveCachedTeamId('league_2', 7);

      expect(getCachedTeamId('league_1')).toBe(3);
      expect(getCachedTeamId('league_2')).toBe(7);
      expect(getCachedTeamId('league_3')).toBeNull();
    });
  });

  describe('League ID parsing', () => {
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
