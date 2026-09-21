/**
 * Client authentication and session token management.
 * In accordance with the security spec:
 * RAW PINS AND HASHES NEVER TOUCH CLIENT PERSISTENCE.
 * Only the server-issued random sessionToken and rosterId are persisted in localStorage.
 */

const SESSION_TOKEN_KEY = 'tp_session_token';
const ROSTER_ID_KEY = 'tp_roster_id';

export interface AuthSession {
  rosterId: number;
  sessionToken: string;
}

/**
 * Persists the server-issued session token and roster ID.
 */
export function saveSession(rosterId: number, sessionToken: string): void {
  localStorage.setItem(ROSTER_ID_KEY, rosterId.toString());
  localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
}

/**
 * Retrieves the currently active session from localStorage, or null if unauthenticated.
 */
export function getSession(): AuthSession | null {
  const rosterStr = localStorage.getItem(ROSTER_ID_KEY);
  const token = localStorage.getItem(SESSION_TOKEN_KEY);
  if (!rosterStr || !token) {
    return null;
  }
  const rosterId = parseInt(rosterStr, 10);
  if (isNaN(rosterId)) {
    clearSession();
    return null;
  }
  return { rosterId, sessionToken: token };
}

/**
 * Clears active session credentials upon logout or invalidation.
 */
export function clearSession(): void {
  localStorage.removeItem(ROSTER_ID_KEY);
  localStorage.removeItem(SESSION_TOKEN_KEY);
}

/**
 * Checks whether an active session exists.
 */
export function isAuthenticated(): boolean {
  return getSession() !== null;
}

/**
 * Returns current authenticated roster ID if logged in, else null.
 */
export function getCurrentRosterId(): number | null {
  const session = getSession();
  return session ? session.rosterId : null;
}
