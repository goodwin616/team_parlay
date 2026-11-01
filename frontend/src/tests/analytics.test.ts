import { describe, it, expect } from 'vitest';
import { analyticsPromise, logAnalyticsEvent, firebaseConfig } from '../services/firebase';

describe('Firebase Analytics Service', () => {
  it('configures measurementId in firebaseConfig', () => {
    expect(firebaseConfig).toHaveProperty('measurementId');
    expect(firebaseConfig.measurementId).toBe('G-MXKX0DL7ZV');
  });

  it('resolves analyticsPromise safely without unhandled rejection in test environment', async () => {
    const analytics = await analyticsPromise;
    // In vitest / jsdom without full indexedDB support, isSupported() returns false, yielding null safely
    expect(analytics === null || typeof analytics === 'object').toBe(true);
  });

  it('safely handles logAnalyticsEvent calls without throwing', async () => {
    await expect(logAnalyticsEvent('page_view', { page_title: 'Team Parlay' })).resolves.not.toThrow();
  });
});
