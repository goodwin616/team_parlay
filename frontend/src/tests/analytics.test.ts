import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Analytics } from 'firebase/analytics';
import {
  analyticsPromise,
  logAnalyticsEvent,
  dispatchAnalyticsEvent,
  firebaseConfig,
  isEmulatorMode,
} from '../services/firebase';

describe('Firebase Analytics Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('configures measurementId in firebaseConfig', () => {
    expect(firebaseConfig).toHaveProperty('measurementId');
    expect(firebaseConfig.measurementId).toBe('G-MXKX0DL7ZV');
  });

  it('resolves analyticsPromise to null in non-browser or emulator environment', async () => {
    const analytics = await analyticsPromise;
    expect(analytics).toBeNull();
  });

  it('identifies emulator mode when running locally', () => {
    expect(typeof isEmulatorMode).toBe('boolean');
  });

  it('safely handles logAnalyticsEvent calls without throwing when analytics is null', async () => {
    await expect(logAnalyticsEvent('page_view', { page_title: 'Team Parlay' })).resolves.not.toThrow();
  });

  it('forwards event to logger when analytics instance is present', async () => {
    const mockLogger = vi.fn();
    const fakeAnalytics = {} as Analytics;

    await dispatchAnalyticsEvent(
      fakeAnalytics,
      'select_content',
      { content_type: 'parlay_card' },
      mockLogger
    );

    expect(mockLogger).toHaveBeenCalledTimes(1);
    expect(mockLogger).toHaveBeenCalledWith(fakeAnalytics, 'select_content', {
      content_type: 'parlay_card',
    });
  });

  it('does not invoke logger when analytics instance is null', async () => {
    const mockLogger = vi.fn();

    await dispatchAnalyticsEvent(null, 'select_content', undefined, mockLogger);

    expect(mockLogger).not.toHaveBeenCalled();
  });

  it('catches and suppresses errors if logger throws', async () => {
    const throwingLogger = vi.fn().mockImplementation(() => {
      throw new Error('Analytics beacon blocked by client extension');
    });
    const fakeAnalytics = {} as Analytics;

    await expect(
      dispatchAnalyticsEvent(fakeAnalytics, 'crash_test', undefined, throwingLogger)
    ).resolves.not.toThrow();

    expect(throwingLogger).toHaveBeenCalledTimes(1);
  });
});
