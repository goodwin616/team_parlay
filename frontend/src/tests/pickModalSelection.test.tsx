import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PickModal } from '../components/PickModal';
import { ActivePlayer, ParlayLeg } from '../types';

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
});
