import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PickModal } from '../components/PickModal';
import { formatDataFreshness } from '../utils/parlayMath';

describe('PickModal Data Freshness Indicator', () => {
  const dummyProps = {
    isOpen: true,
    onClose: () => {},
    onSubmitPick: () => {},
    rosterName: 'Philly Special',
    activePlayers: [
      { id: '1', name: 'Saquon Barkley', team: 'PHI', position: 'RB' },
    ],
  };

  it('renders "Off-Season / Sample Board" when lastUpdated is missing and liveMarketCount is 0', () => {
    const html = renderToString(<PickModal {...dummyProps} liveMarketCount={0} />);
    expect(html).toContain('Off-Season / Sample Board');
    expect(html).not.toContain('● Live (');
  });

  it('renders "Updated just now" when lastUpdated is a recent Date', () => {
    const recentDate = new Date();
    const html = renderToString(
      <PickModal {...dummyProps} lastUpdated={recentDate} />
    );
    expect(html).toContain('Updated just now');
    expect(html).not.toContain('● Live (');
    expect(html).not.toContain('Off-Season / Sample Board');
  });

  it('renders formatted freshness string when lastUpdated is passed as a timestamp or string', () => {
    const twoMinutesAgo = Date.now() - 120000;
    const html = renderToString(
      <PickModal {...dummyProps} lastUpdated={twoMinutesAgo} />
    );
    expect(html).toContain('Updated 2m ago');
    expect(html).not.toContain('● Live (');
  });

  it('preserves backward compatibility when only liveMarketCount > 0 is provided without lastUpdated', () => {
    const html = renderToString(
      <PickModal {...dummyProps} liveMarketCount={42} />
    );
    // Should display freshness instead of the obsolete "● Live (42 open)"
    expect(html).toContain('Updated just now');
    expect(html).not.toContain('● Live (');
  });

  it('formats data freshness correctly for multiple boundaries', () => {
    const now = 1700000000000;
    expect(formatDataFreshness(now - 10000, now)).toBe('Updated just now');
    expect(formatDataFreshness(now - 45000, now)).toBe('Updated 45s ago');
    expect(formatDataFreshness(now - 180000, now)).toBe('Updated 3m ago');
    expect(formatDataFreshness(now - 7200000, now)).toBe('Updated 2h ago');
    expect(formatDataFreshness(null, now)).toBe('Off-Season / Sample Board');
  });
});
