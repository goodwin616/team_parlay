import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { renderToString } from 'react-dom/server';

vi.mock('../services/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/auth')>();
  return {
    ...actual,
    useAuthUser: () => ({
      user: {
        uid: 'user_blake',
        displayName: 'Blake',
        email: 'blake@example.com',
      },
      loading: false,
    }),
  };
});

import { App } from '../App';

function cleanText(html: string): string {
  return html.replace(/<!--.*?-->/g, '');
}

describe('Profile Menu Archive Option', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key in store) {
      delete store[key];
    }
    const mockStorage = {
      getItem: (k: string) => store[k] || null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
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

  it('removes standalone Archive button from the header action pills', () => {
    const html = cleanText(renderToString(<App />));

    expect(html).not.toContain('aria-label="View Past Slips Archive"');
    expect(html).not.toContain('title="Past Slips Archive"');
  });

  it('does not render initial letter avatar circle in username team chip when a team is selected', async () => {
    if (typeof document === 'undefined') {
      return;
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    // Click Select Your Team button to open TeamPickerModal
    const selectTeamBtn = container.querySelector('button[aria-label="Select Your Fantasy Team"]') as HTMLButtonElement | null;
    expect(selectTeamBtn).not.toBeNull();
    await act(async () => {
      selectTeamBtn?.click();
    });

    // Select Blake's team (Philly Special)
    const blakeTeamBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Philly Special')
    );
    expect(blakeTeamBtn).toBeDefined();
    await act(async () => {
      blakeTeamBtn?.click();
    });

    // Now the username chip is rendered with Blake and Philly Special
    const teamChipBtn = container.querySelector('button[aria-label*="Switch Team: currently viewing Blake"]') as HTMLButtonElement | null;
    expect(teamChipBtn).not.toBeNull();
    expect(teamChipBtn?.textContent).toContain('Blake');
    expect(teamChipBtn?.textContent).toContain('(Philly Special)');

    // Ensure the initials avatar circle (w-5 h-5 with text-[10px] font-black) is NOT rendered
    expect(teamChipBtn?.querySelector('.text-\\[10px\\]')).toBeNull();

    // Cleanup
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('reveals Past Slips Archive in dropdown when profile avatar is clicked, and opens archive modal on click', async () => {
    // If document is defined or can be created:
    if (typeof document === 'undefined') {
      return;
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    // Find profile button
    const profileBtn = container.querySelector('button[title*="profile & sign out"]') as HTMLButtonElement | null;
    expect(profileBtn).not.toBeNull();

    // Initially, profile menu dropdown and Past Slips Archive are closed
    expect(container.textContent).not.toContain('Past Slips Archive');

    // Click profile button to open dropdown
    await act(async () => {
      profileBtn?.click();
    });

    // Dropdown is now open and contains Past Slips Archive
    expect(container.textContent).toContain('Past Slips Archive');
    expect(container.textContent).toContain('Change Fantasy Team');
    expect(container.textContent).toContain('Sign Out');

    // Click Past Slips Archive button
    const archiveMenuItem = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Past Slips Archive')
    );
    expect(archiveMenuItem).toBeDefined();

    await act(async () => {
      archiveMenuItem?.click();
    });

    // Archive modal opens
    expect(container.textContent).toContain('Past Kalshi Slips Archive');
    expect(container.textContent).toContain('Historical records • Pure archive (no grading)');

    // Cleanup
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

