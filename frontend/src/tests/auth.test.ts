import { describe, it, expect, beforeEach } from 'vitest';
import { saveSession, getSession, clearSession, isAuthenticated, getCurrentRosterId } from '../services/auth';

describe('Auth Service', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key in store) {
      delete store[key];
    }
    // Mock localStorage
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

  it('saves session token and rosterId without storing raw PINs', () => {
    const token = 'uuid-random-session-token-987';
    saveSession(3, token);

    expect(isAuthenticated()).toBe(true);
    expect(getCurrentRosterId()).toBe(3);

    const session = getSession();
    expect(session).toEqual({ rosterId: 3, sessionToken: token });

    // Verify localStorage contains strictly rosterId and sessionToken
    expect(store['tp_roster_id']).toBe('3');
    expect(store['tp_session_token']).toBe(token);
    expect(store['pin']).toBeUndefined();
    expect(store['pin_hash']).toBeUndefined();
  });

  it('clears session on clearSession()', () => {
    saveSession(1, 'token-123');
    expect(isAuthenticated()).toBe(true);

    clearSession();
    expect(isAuthenticated()).toBe(false);
    expect(getSession()).toBeNull();
    expect(getCurrentRosterId()).toBeNull();
  });
});
