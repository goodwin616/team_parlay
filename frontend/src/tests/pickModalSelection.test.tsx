import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PickModal, resolveGameLineKalshiSide } from '../components/PickModal';
import { ActivePlayer, ParlayLeg, GameLineOption } from '../types';

describe('PickModal Prop Selection Behavior (CR-002)', () => {
  const dummyPlayer: ActivePlayer = {
    id: 'player-1',
    name: 'Saquon Barkley',
    team: 'PHI',
    position: 'RB',
  };

  const otherPlayer: ActivePlayer = {
    id: 'player-2',
    name: 'Jalen Hurts',
    team: 'PHI',
    position: 'QB',
  };

  const baseProps = {
    isOpen: true,
    onClose: () => {},
    onSubmitPick: () => {},
    rosterName: 'Philly Special',
    activePlayers: [dummyPlayer, otherPlayer],
  };

  it('does not auto-select any prop contract when opened without a player selected', () => {
    const html = renderToString(<PickModal {...baseProps} />);
    
    // Instruction prompt should be shown in ticket preview
    expect(html).toContain('Search &amp; select an active NFL player above');
    
    // Submit button should be disabled
    expect(html).toContain('disabled=""');
    expect(html).toContain('cursor-not-allowed');
    expect(html).not.toContain('border-sleeper-accent/60 shadow-sm');
  });

  it('does not auto-select any prop contract when opened with a player pre-selected', () => {
    const html = renderToString(
      <PickModal {...baseProps} initialPlayer={dummyPlayer} />
    );

    // Should render available milestone contracts for player
    expect(html).toContain('Select Kalshi Contract Strike &amp; Side');
    expect(html).toContain('Anytime TD (1+)');

    // Should NOT have any contract card highlighted with the active selection border/shadow
    expect(html).not.toContain('border-sleeper-accent/60 shadow-sm');

    // Should NOT have YES or NO button highlighted in emerald or red
    expect(html).not.toContain('bg-emerald-500 text-black');
    expect(html).not.toContain('bg-red-500 text-white');

    // Ticket preview should clearly instruct user to choose a contract strike & side
    expect(html).toContain('Select a contract strike &amp; side above');

    // Submit button MUST remain disabled until explicitly selected
    expect(html).toContain('disabled=""');
    expect(html).toContain('cursor-not-allowed');
    expect(html).not.toContain('shadow-sleeper-accent/20');
  });

  it('does not auto-select a contract when opened with a pending (unsubmitted) leg', () => {
    const pendingLeg: ParlayLeg = {
      id: 'leg-1',
      roster_id: 1,
      team_name: 'Philly Special',
      owner_name: 'Player One',
      description: '',
      nfl_team: '',
      odds_american: '-110',
      odds_decimal: 1.91,
      status: 'pending',
    };

    const html = renderToString(
      <PickModal {...baseProps} currentLeg={pendingLeg} />
    );

    // Unsubmitted leg should not select anything
    expect(html).toContain('Search &amp; select an active NFL player above');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('border-sleeper-accent/60 shadow-sm');
  });

  it('restores selection when editing an existing submitted leg with matching ticker (YES side)', () => {
    const submittedLeg: ParlayLeg = {
      id: 'leg-2',
      roster_id: 1,
      team_name: 'Philly Special',
      owner_name: 'Player One',
      description: 'Saquon Barkley (PHI) • Anytime TD (1+) (YES)',
      nfl_team: 'PHI',
      odds_american: '-115',
      odds_decimal: 1.87,
      status: 'submitted',
      kalshi_market_ticker: 'KXNFLTD-1',
      kalshi_side: 'yes',
    };

    const html = renderToString(
      <PickModal
        {...baseProps}
        currentLeg={submittedLeg}
        initialPlayer={dummyPlayer}
      />
    );

    // Should render the contract
    expect(html).toContain('Anytime TD (1+)');
    // The submitted leg's contract should be active and highlighted
    expect(html).toContain('border-sleeper-accent/60 shadow-sm');
    expect(html).toContain('bg-emerald-500 text-black');
    expect(html).toContain('Saquon Barkley (PHI) • Anytime TD (1+) (YES)');
    // Submit button should be enabled
    expect(html).toContain('Submit My Weekly Leg');
    expect(html).not.toContain('cursor-not-allowed');
  });

  it('restores selection with NO side when editing an existing submitted leg with NO side', () => {
    const submittedLegNo: ParlayLeg = {
      id: 'leg-3',
      roster_id: 1,
      team_name: 'Philly Special',
      owner_name: 'Player One',
      description: 'Saquon Barkley (PHI) • Anytime TD (1+) (NO)',
      nfl_team: 'PHI',
      odds_american: '+117',
      odds_decimal: 2.17,
      status: 'submitted',
      kalshi_market_ticker: 'KXNFLTD-1',
      kalshi_side: 'no',
    };

    const html = renderToString(
      <PickModal
        {...baseProps}
        currentLeg={submittedLegNo}
        initialPlayer={dummyPlayer}
      />
    );

    expect(html).toContain('border-sleeper-accent/60 shadow-sm');
    expect(html).toContain('bg-red-500 text-white');
    expect(html).toContain('Saquon Barkley (PHI) • Anytime TD (1+) (NO)');
    expect(html).not.toContain('cursor-not-allowed');
  });

  it('does not auto-select if a submitted leg ticker and label do not match available contracts', () => {
    const submittedLeg: ParlayLeg = {
      id: 'leg-4',
      roster_id: 1,
      team_name: 'Philly Special',
      owner_name: 'Player One',
      description: 'Saquon Barkley (PHI) • 10+ Touchdowns (YES)',
      nfl_team: 'PHI',
      odds_american: '+5000',
      odds_decimal: 51.0,
      status: 'submitted',
      kalshi_market_ticker: 'KXNFLTD-UNKNOWN-999',
      kalshi_side: 'yes',
    };

    const html = renderToString(
      <PickModal
        {...baseProps}
        currentLeg={submittedLeg}
        initialPlayer={dummyPlayer}
      />
    );

    // Should prompt user to select a contract
    expect(html).toContain('Select a contract strike &amp; side above');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('border-sleeper-accent/60 shadow-sm');
  });

  it('applies uniform fixed width and tabular alignment to player prop YES and NO odds chips (CR-021)', () => {
    const html = renderToString(
      <PickModal {...baseProps} initialPlayer={dummyPlayer} />
    );

    // Verify uniform fixed width styling and tabular-nums on contract selection buttons
    expect(html).toContain('w-[106px] sm:w-[116px]');
    expect(html).toContain('tabular-nums');
    expect(html).toContain('tracking-tight');
    expect(html).toContain('flex items-center justify-center text-center shrink-0 leading-none');
    expect(html).toContain('flex items-center space-x-2 shrink-0');

    // Both YES and NO buttons should feature the fixed width class
    const yesButtonMatches = html.match(/w-\[106px\]\s+sm:w-\[116px\][^>]*>YES\s+/g);
    expect(yesButtonMatches).not.toBeNull();
    expect(yesButtonMatches!.length).toBeGreaterThan(0);

    const noButtonMatches = html.match(/w-\[106px\]\s+sm:w-\[116px\][^>]*>NO\s+/g);
    expect(noButtonMatches).not.toBeNull();
    expect(noButtonMatches!.length).toBeGreaterThan(0);
  });

  describe('Accessibility & ARIA Semantics (F-10 / F-11)', () => {
    it('renders outer dialog with role="dialog", aria-modal="true", and aria-labelledby matching title', () => {
      const html = renderToString(<PickModal {...baseProps} />);

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-labelledby="pick-modal-title"');
      expect(html).toContain('id="pick-modal-title"');
    });

    it('renders close button with aria-label="Close" and type="button"', () => {
      const html = renderToString(<PickModal {...baseProps} />);

      expect(html).toContain('aria-label="Close"');
      expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-label="Close"/);
    });

    it('renders category tablist and tab buttons with aria-selected', () => {
      const html = renderToString(<PickModal {...baseProps} />);

      expect(html).toContain('role="tablist"');
      expect(html).toContain('role="tab"');
      // Default tab is player props
      expect(html).toContain('aria-selected="true"');
      expect(html).toContain('aria-selected="false"');
    });
  });

  describe('Game Line Kalshi Side Resolution', () => {
    const realKalshiGameLine: GameLineOption = {
      game_id: '26NOV01BUFNYJ',
      away_team: 'BUF',
      home_team: 'NYJ',
      commence_time: '2026-11-01T17:00:00Z',
      spread_away: {
        point: -3.5,
        odds: '-110',
        price_cents: 52,
        market_ticker: 'KXNFLSPREAD-26NOV01BUFNYJ-BUF3',
      },
      spread_home: {
        point: 3.5,
        odds: '-110',
        price_cents: 48,
        market_ticker: 'KXNFLSPREAD-26NOV01BUFNYJ-BUF3',
      },
      total_over: {
        point: 45.5,
        odds: '-110',
        price_cents: 52,
        market_ticker: 'KXNFLTOTAL-26NOV01BUFNYJ-45',
      },
      total_under: {
        point: 45.5,
        odds: '-110',
        price_cents: 48,
        market_ticker: 'KXNFLTOTAL-26NOV01BUFNYJ-45',
      },
      ml_away: {
        odds: '-180',
        price_cents: 64,
        market_ticker: 'KXNFLGAME-26NOV01BUFNYJ-BUF',
      },
      ml_home: {
        odds: '+155',
        price_cents: 36,
        market_ticker: 'KXNFLGAME-26NOV01BUFNYJ-NYJ',
      },
    };

    it('resolves total_under and underdog spread on shared Kalshi tickers to "no" side', () => {
      expect(resolveGameLineKalshiSide('total_over', realKalshiGameLine)).toBe('yes');
      expect(resolveGameLineKalshiSide('total_under', realKalshiGameLine)).toBe('no');
      expect(resolveGameLineKalshiSide('spread_away', realKalshiGameLine)).toBe('yes');
      expect(resolveGameLineKalshiSide('spread_home', realKalshiGameLine)).toBe('no');
      expect(resolveGameLineKalshiSide('moneyline_away', realKalshiGameLine)).toBe('yes');
      expect(resolveGameLineKalshiSide('moneyline_home', realKalshiGameLine)).toBe('yes');
    });
  });
});
