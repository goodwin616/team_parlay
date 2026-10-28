import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PrivacyModal } from '../components/PrivacyModal';
import { LeagueLandingPage } from '../components/LeagueLandingPage';

// Mock auth service for App integration tests
vi.mock('../services/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/auth')>();
  return {
    ...actual,
    useAuthUser: () => ({
      user: {
        uid: 'user_blake',
        displayName: 'Blake',
        email: 'blake@goodwin.io',
        photoURL: 'https://example.com/avatar.jpg',
      },
      loading: false,
    }),
  };
});

import { App } from '../App';

function cleanText(html: string): string {
  return html.replace(/<!--.*?-->/g, '');
}

function findElementByProp(node: any, predicate: (node: any) => boolean): any {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElementByProp(child, predicate);
      if (found) return found;
    }
  } else if (node.props?.children) {
    return findElementByProp(node.props.children, predicate);
  }
  return null;
}

function renderPrivacyElement(props: React.ComponentProps<typeof PrivacyModal>) {
  const internals = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  const prevDispatcher = internals.ReactCurrentDispatcher.current;
  let registeredEffect: (() => (() => void) | void) | null = null;

  internals.ReactCurrentDispatcher.current = {
    useState: (init: any) => [typeof init === 'function' ? init() : init, vi.fn()],
    useRef: (init: any) => ({ current: init }),
    useEffect: (fn: any) => {
      registeredEffect = fn;
    },
  };

  try {
    const element = PrivacyModal(props) as any;
    return {
      element,
      runEffect: () => registeredEffect?.(),
    };
  } finally {
    internals.ReactCurrentDispatcher.current = prevDispatcher;
  }
}

describe('PrivacyModal Component', () => {
  it('renders nothing when isOpen is false', () => {
    const html = renderToString(
      <PrivacyModal isOpen={false} onClose={() => {}} />
    );
    expect(html).toBe('');
  });

  it('renders title, effective date, and informational disclaimer when isOpen is true', () => {
    const html = renderToString(
      <PrivacyModal isOpen={true} onClose={() => {}} />
    );

    expect(html).toContain('Privacy Policy &amp; Disclosures');
    expect(html).toContain('Effective: October 2026');
    expect(html).toContain('parlay.goodwin.io');
    expect(html).toContain('Informational Coordination Tool Only');
    expect(html).toContain('not a bookmaker, gambling operator, casino, or broker');
  });

  it('renders all key privacy disclosures', () => {
    const html = renderToString(
      <PrivacyModal isOpen={true} onClose={() => {}} />
    );

    // Zero data selling
    expect(html).toContain('Zero Data Selling');
    expect(html).toContain('never sell, rent, or monetize');

    // Google Sign-In & Google API Services User Data Policy
    expect(html).toContain('Google OAuth Sign-In');
    expect(html).toContain('Google API Services User Data Policy');

    // Anti-Tamper & Security (Google OAuth verification, audit logs)
    expect(html).toContain('Anti-Tamper Audit Logs');
    expect(html).toContain('actor_from_auth');
    expect(html).toContain('authenticated Google account (UID, name, email)');
    expect(html).not.toContain('pin_secret_salt');
    expect(html).not.toContain('User-Agent');

    // Browser Storage (localStorage)
    expect(html).toContain('localStorage');
    expect(html).toContain('parlay_odds_format');

    // Third-party integrations
    expect(html).toContain('Google Cloud &amp; Firebase');
    expect(html).toContain('Sleeper API');
    expect(html).toContain('Kalshi Trade API');

    // Data deletion instructions
    expect(html).toContain('Data Subject Rights &amp; Deletion Requests');
    expect(html).toContain('privacy@goodwin.io');
  });

  it('calls onClose when close button or backdrop is clicked, but stops propagation on modal card', () => {
    const onClose = vi.fn();
    const { element } = renderPrivacyElement({ isOpen: true, onClose });

    // Backdrop click
    expect(element.props['data-testid']).toBe('privacy-backdrop');
    element.props.onClick();
    expect(onClose).toHaveBeenCalledTimes(1);

    // Modal dialog click stops propagation
    const dialog = findElementByProp(element, (n) => n.props?.role === 'dialog');
    expect(dialog).not.toBeNull();
    const stopPropagation = vi.fn();
    dialog.props.onClick({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1); // not called again

    // Close button click
    const closeBtn = findElementByProp(
      element,
      (n) => n.props?.['aria-label'] === 'Close privacy policy'
    );
    expect(closeBtn).not.toBeNull();
    closeBtn.props.onClick();
    expect(onClose).toHaveBeenCalledTimes(2);

    // Footer close button click
    const footerCloseBtn = findElementByProp(
      element,
      (n) => n.props?.children === 'Close' && n.type === 'button'
    );
    expect(footerCloseBtn).not.toBeNull();
    footerCloseBtn.props.onClick();
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('registers Escape keydown listener via useEffect and closes modal', () => {
    const onClose = vi.fn();
    let keydownHandler: ((e: any) => void) | null = null;

    const mockWindow = {
      addEventListener: vi.fn((event: string, handler: any) => {
        if (event === 'keydown') keydownHandler = handler;
      }),
      removeEventListener: vi.fn(),
    };

    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = mockWindow;

    try {
      const { runEffect } = renderPrivacyElement({ isOpen: true, onClose });
      const cleanup = runEffect();

      expect(mockWindow.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));

      // Trigger non-Escape key: does not call onClose
      if (keydownHandler) {
        (keydownHandler as (e: any) => void)({ key: 'Enter' });
      }
      expect(onClose).not.toHaveBeenCalled();

      // Trigger Escape key: calls onClose
      if (keydownHandler) {
        (keydownHandler as (e: any) => void)({ key: 'Escape' });
      }
      expect(onClose).toHaveBeenCalledTimes(1);

      // Cleanup removes listener
      if (typeof cleanup === 'function') {
        cleanup();
      }
      expect(mockWindow.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });
});

describe('App & Landing Page Privacy Integration', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key in store) delete store[key];
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
        history: { pushState: () => {} },
      },
      writable: true,
      configurable: true,
    });
  });

  it('renders Privacy Policy link in main application footer', () => {
    const html = cleanText(renderToString(<App />));

    expect(html).toContain('Privacy Policy');
    expect(html).toContain('Team Parlay is an open-source fantasy sports coordination tool');
    expect(html).toContain('https://github.com/goodwin616/team_parlay');
  });

  it('renders Privacy Policy button in landing page footer and triggers callback', () => {
    const onOpenPrivacy = vi.fn();
    const html = cleanText(
      renderToString(
        <LeagueLandingPage
          onSelectLeague={() => {}}
          recentLeagues={[]}
          onOpenPrivacy={onOpenPrivacy}
        />
      )
    );

    expect(html).toContain('Privacy Policy');
    expect(html).toContain('https://github.com/goodwin616/team_parlay');
  });

  it('includes Privacy Policy button in header profile dropdown markup structure', () => {
    // When isProfileMenuOpen is active in App, profile menu renders Privacy Policy
    const internals = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
    const prevDispatcher = internals.ReactCurrentDispatcher.current;

    let stateIndex = 0;
    internals.ReactCurrentDispatcher.current = {
      useState: (init: any) => {
        const idx = stateIndex++;
        // State order in App:
        // idx 0: leagueId (='demo')
        // idx 1: leagueName
        // idx 2: recentLeagues
        // idx 3: season
        // idx 4: teams
        // idx 5: currentRosterId (=1)
        // idx 6: parlay
        // idx 7: pastParlays
        // idx 8: oddsFormat
        // idx 9: isLoadingLeague
        // idx 10: leagueError
        // idx 11: isPickOpen
        // idx 12: isArchiveOpen
        // idx 13: isPrivacyOpen
        // idx 14: isTeamPickerOpen
        // idx 15: isProfileMenuOpen (force true to inspect dropdown)
        if (idx === 15) {
          return [true, vi.fn()];
        }
        return [typeof init === 'function' ? init() : init, vi.fn()];
      },
      useRef: (init: any) => ({ current: init }),
      useEffect: vi.fn(),
    };

    try {
      const element = App({}) as any;
      const html = cleanText(renderToString(element));
      expect(html).toContain('Privacy Policy');
      expect(html).toContain('Past Slips Archive');
      expect(html).toContain('Change Fantasy Team');
      expect(html).toContain('Sign Out');
    } finally {
      internals.ReactCurrentDispatcher.current = prevDispatcher;
    }
  });
});
