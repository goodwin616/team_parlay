import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PickModal } from '../components/PickModal';
import { GameLineOption } from '../types';

let currentHtml = '';
function render(ui: React.ReactElement) {
  currentHtml = renderToString(ui);
  return { html: currentHtml };
}

const screen = {
  getByText(text: string | RegExp) {
    const textContent = currentHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const found = typeof text === 'string' ? textContent.includes(text) : text.test(textContent);
    if (!found) {
      throw new Error(`Unable to find text: ${text}`);
    }
    return { text, exists: true };
  },
  queryByText(text: string | RegExp) {
    const textContent = currentHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const found = typeof text === 'string' ? textContent.includes(text) : text.test(textContent);
    return found ? { text, exists: true } : null;
  },
};

expect.extend({
  toBeInTheDocument(received) {
    const pass = received !== null && received !== undefined;
    return {
      pass,
      message: () => `expected element ${pass ? 'not ' : ''}to be in the document`,
    };
  },
});

declare module 'vitest' {
  interface Assertion<T = any> {
    toBeInTheDocument(): T;
  }
}

describe('PickModal Max Leg Odds Filtering', () => {
  const sampleGame: GameLineOption = {
    game_id: 'GAME_1',
    home_team: 'BAL',
    away_team: 'KC',
    commence_time: '2099-10-29T20:15:00Z',
    spread_home: { point: -2.5, odds: '-113', price_cents: 53, market_ticker: 'T_SP_H' },
    spread_away: { point: 2.5, odds: '-108', price_cents: 52, market_ticker: 'T_SP_A' },
    ml_home: { odds: '-138', price_cents: 58, market_ticker: 'T_ML_H' }, // Exceeds 55
    ml_away: { odds: '+117', price_cents: 46, market_ticker: 'T_ML_A' }, // Under 55
    total_over: { point: 47.5, odds: '-113', price_cents: 53, market_ticker: 'T_TO' },
    total_under: { point: 47.5, odds: '-108', price_cents: 52, market_ticker: 'T_TU' },
  };

  const sampleProps = [
    {
      player_name: 'Saquon Barkley',
      stat_category: 'Rush Yards',
      label: '25+ Rush Yards',
      yes_cents: 88, // Exceeds 55
      no_cents: 12,
      market_ticker: 'T_P_1',
      series_ticker: 'KXNFLRSHYDS',
    },
    {
      player_name: 'Saquon Barkley',
      stat_category: 'Rush Yards',
      label: '75+ Rush Yards',
      yes_cents: 52, // Under 55
      no_cents: 48,
      market_ticker: 'T_P_2',
      series_ticker: 'KXNFLRSHYDS',
    },
  ];

  it('hides game line options whose price_cents exceed maxLegOddsPercent', () => {
    render(
      <PickModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmitPick={vi.fn()}
        rosterName="Team 1"
        activePlayers={[]}
        kalshiGames={[sampleGame]}
        maxLegOddsPercent={55}
      />
    );

    // Away ML (46c) should be visible
    expect(screen.getByText('+117')).toBeInTheDocument();
    // Home ML (58c) should be hidden
    expect(screen.queryByText('-138')).not.toBeInTheDocument();
  });

  it('filters out player props whose yes_cents exceed maxLegOddsPercent', () => {
    render(
      <PickModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmitPick={vi.fn()}
        rosterName="Team 1"
        activePlayers={[{ id: 'p1', name: 'Saquon Barkley', team: 'PHI', position: 'RB' }]}
        kalshiProps={sampleProps}
        initialPlayer={{ id: 'p1', name: 'Saquon Barkley', team: 'PHI', position: 'RB' }}
        maxLegOddsPercent={55}
      />
    );

    // 75+ Rush Yards (52c) should be visible
    expect(screen.getByText('75+ Rush Yards')).toBeInTheDocument();
    // 25+ Rush Yards (88c) should be filtered out
    expect(screen.queryByText('25+ Rush Yards')).not.toBeInTheDocument();
  });

  it('shows empty message when all props for player exceed maxLegOddsPercent', () => {
    render(
      <PickModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmitPick={vi.fn()}
        rosterName="Team 1"
        activePlayers={[{ id: 'p1', name: 'Saquon Barkley', team: 'PHI', position: 'RB' }]}
        kalshiProps={[{
          player_name: 'Saquon Barkley',
          stat_category: 'Touchdowns',
          label: 'Anytime TD',
          yes_cents: 65,
          no_cents: 35,
          market_ticker: 'T_P_TD',
          series_ticker: 'KXNFLTD',
        }]}
        initialPlayer={{ id: 'p1', name: 'Saquon Barkley', team: 'PHI', position: 'RB' }}
        maxLegOddsPercent={55}
      />
    );

    expect(
      screen.getByText(/No props available under the 55% max odds limit/i)
    ).toBeInTheDocument();
  });

  it('shows all options when maxLegOddsPercent is null or undefined', () => {
    render(
      <PickModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmitPick={vi.fn()}
        rosterName="Team 1"
        activePlayers={[]}
        kalshiGames={[sampleGame]}
        maxLegOddsPercent={null}
      />
    );

    expect(screen.getByText('+117')).toBeInTheDocument();
    expect(screen.getByText('-138')).toBeInTheDocument();
  });

  it('hides spread and total options when their price_cents exceed maxLegOddsPercent', () => {
    const tightGame: GameLineOption = {
      game_id: 'GAME_TIGHT',
      home_team: 'BAL',
      away_team: 'KC',
      commence_time: '2099-10-29T20:15:00Z',
      spread_home: { point: -2.5, odds: '-113', price_cents: 60, market_ticker: 'T_SP_H' }, // Exceeds 50
      spread_away: { point: 2.5, odds: '-108', price_cents: 48, market_ticker: 'T_SP_A' },  // Under 50
      ml_home: { odds: '-138', price_cents: 60, market_ticker: 'T_ML_H' },
      ml_away: { odds: '+117', price_cents: 48, market_ticker: 'T_ML_A' },
      total_over: { point: 47.5, odds: '-113', price_cents: 60, market_ticker: 'T_TO' },   // Exceeds 50
      total_under: { point: 47.5, odds: '-108', price_cents: 48, market_ticker: 'T_TU' },  // Under 50
    };

    render(
      <PickModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmitPick={vi.fn()}
        rosterName="Team 1"
        activePlayers={[]}
        kalshiGames={[tightGame]}
        maxLegOddsPercent={50}
      />
    );

    // Under 50 options should be visible
    expect(screen.getByText('+2.5')).toBeInTheDocument();
    expect(screen.getByText('U 47.5')).toBeInTheDocument();

    // Over 50 options should be hidden
    expect(screen.queryByText('-2.5')).not.toBeInTheDocument();
    expect(screen.queryByText('O 47.5')).not.toBeInTheDocument();
  });

  it('filters synthetic player props when kalshiProps is empty', () => {
    render(
      <PickModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmitPick={vi.fn()}
        rosterName="Team 1"
        activePlayers={[{ id: 'p1', name: 'Saquon Barkley', team: 'PHI', position: 'RB' }]}
        kalshiProps={[]}
        initialPlayer={{ id: 'p1', name: 'Saquon Barkley', team: 'PHI', position: 'RB' }}
        maxLegOddsPercent={50}
      />
    );

    // Synthetic Touchdowns has 54c (Anytime TD) and 22c (2+ TD)
    // 54c exceeds 50c, so Anytime TD should not be in document
    expect(screen.queryByText('Anytime TD (1+)')).not.toBeInTheDocument();
    // 22c is under 50c, so 2+ Touchdowns should be in document
    expect(screen.getByText('2+ Touchdowns')).toBeInTheDocument();
  });
});
