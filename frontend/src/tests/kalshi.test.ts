import { describe, it, expect } from 'vitest';
import {
  parseKalshiGameMarketsToOptions,
  parseKalshiPropMarket,
  splitEventTeamsCode,
  getNflWeekBucketKey,
} from '../services/kalshi';

describe('kalshi v2 market parser', () => {
  it('splits concatenated Kalshi matchup codes into away and home NFL abbreviations', () => {
    expect(splitEventTeamsCode('CHISEA')).toEqual(['CHI', 'SEA']);
    expect(splitEventTeamsCode('PITNO')).toEqual(['PIT', 'NO']);
    expect(splitEventTeamsCode('MIANYJ')).toEqual(['MIA', 'NYJ']);
    expect(splitEventTeamsCode('CARGB')).toEqual(['CAR', 'GB']);
  });

  it('parses real Kalshi v2 KXNFLGAME, KXNFLSPREAD, and KXNFLTOTAL payloads into GameLineOption', () => {
    const rawMarkets = [
      {
        ticker: 'KXNFLGAME-26OCT29CARGB-GB',
        event_ticker: 'KXNFLGAME-26OCT29CARGB',
        title: 'Green Bay wins',
        yes_sub_title: 'Green Bay',
        status: 'active',
        yes_ask_dollars: '0.5800',
        no_ask_dollars: '0.4200',
        rules_primary:
          'If Green Bay wins the Carolina vs Green Bay Pro Football game originally scheduled for Oct 29, 2026, then the market resolves to Yes.',
        expected_expiration_time: '2026-10-30T03:15:00Z',
      },
      {
        ticker: 'KXNFLGAME-26OCT29CARGB-CAR',
        event_ticker: 'KXNFLGAME-26OCT29CARGB',
        title: 'Carolina wins',
        yes_sub_title: 'Carolina',
        status: 'active',
        yes_ask_dollars: '0.4300',
        no_ask_dollars: '0.5900',
        rules_primary:
          'If Carolina wins the Carolina vs Green Bay Pro Football game originally scheduled for Oct 29, 2026, then the market resolves to Yes.',
        expected_expiration_time: '2026-10-30T03:15:00Z',
      },
      {
        ticker: 'KXNFLSPREAD-26OCT29CARGB-GB8',
        event_ticker: 'KXNFLSPREAD-26OCT29CARGB',
        title: 'Green Bay wins by over 7.5 points?',
        status: 'active',
        floor_strike: 7.5,
        yes_ask_dollars: '0.3900',
        no_ask_dollars: '0.7700',
        rules_primary:
          'If Green Bay wins by more than 7.5 points in the Carolina vs Green Bay Pro Football game originally scheduled for Oct 29, 2026, then the market resolves to Yes.',
        expected_expiration_time: '2026-10-30T03:15:00Z',
      },
      {
        ticker: 'KXNFLSPREAD-26OCT29CARGB-GB3',
        event_ticker: 'KXNFLSPREAD-26OCT29CARGB',
        title: 'Green Bay wins by over 2.5 points?',
        status: 'active',
        floor_strike: 2.5,
        yes_ask_dollars: '0.5200',
        no_ask_dollars: '0.4800',
        rules_primary:
          'If Green Bay wins by more than 2.5 points in the Carolina vs Green Bay Pro Football game originally scheduled for Oct 29, 2026, then the market resolves to Yes.',
        expected_expiration_time: '2026-10-30T03:15:00Z',
      },
      {
        ticker: 'KXNFLTOTAL-26OCT29CARGB-47',
        event_ticker: 'KXNFLTOTAL-26OCT29CARGB',
        title: 'Full Game: over 47.5 points scored?',
        status: 'active',
        floor_strike: 47.5,
        yes_ask_dollars: '0.5200',
        no_ask_dollars: '0.4800',
        rules_primary:
          'If Carolina and Green Bay collectively score more than 47.5 points in the Carolina vs Green Bay Pro Football game originally scheduled for Oct 29, 2026, then the market resolves to Yes.',
        expected_expiration_time: '2026-10-30T03:15:00Z',
      },
    ];

    const games = parseKalshiGameMarketsToOptions(rawMarkets);
    expect(games).toHaveLength(1);
    expect(games[0].game_id).toBe('KXNFL-26OCT29CARGB');
    expect(games[0].away_team).toBe('CAR');
    expect(games[0].home_team).toBe('GB');
    expect(games[0].commence_time).toBe('2026-10-30T00:15:00.000Z');
    expect(games[0].ml_home.price_cents).toBe(58);
    expect(games[0].ml_away.price_cents).toBe(43);
    expect(games[0].spread_home.point).toBe(-2.5);
    expect(games[0].spread_away.point).toBe(2.5);
    expect(games[0].total_over.point).toBe(47.5);
  });

  it('parses real Kalshi v2 player prop market payloads', () => {
    const prop = parseKalshiPropMarket({
      ticker: 'KXNFLTD-26OCT26DALPHI-DALEDEMERCADO31-1',
      event_ticker: 'KXNFLTD-26OCT26DALPHI',
      title: 'Emari Demercado: 1+ touchdowns',
      yes_sub_title: 'Emari Demercado: 1+',
      status: 'active',
      floor_strike: 0.5,
      yes_ask_dollars: '0.0800',
      no_ask_dollars: '0.9700',
      rules_primary:
        'If Emari Demercado scores at least 1+ touchdowns in the Dallas vs Philadelphia Pro Football game originally scheduled for Oct 26, 2026, then the market resolves to Yes.',
      expected_expiration_time: '2026-10-27T03:15:00Z',
    });

    expect(prop.player_name).toBe('Emari Demercado');
    expect(prop.label).toBe('1+ touchdowns');
    expect(prop.nfl_team).toBe('DAL');
    expect(prop.stat_category).toBe('Touchdowns');
    expect(prop.yes_cents).toBe(8);
    expect(prop.no_cents).toBe(97);
    expect(prop.game_id).toBe('KXNFL-26OCT26DALPHI');
  });

  it('filters out lookahead games from future NFL weeks so only the current NFL week shows', () => {
    // Week 7 Sunday (Oct 25) + Week 7 MNF (Oct 26 evening / Oct 27 00:15 UTC) share bucket 2026-10-21
    expect(getNflWeekBucketKey('2026-10-25T17:00:00Z')).toBe('2026-10-21');
    expect(getNflWeekBucketKey('2026-10-27T00:15:00Z')).toBe('2026-10-21');
    // Week 8 TNF (Oct 29 evening / Oct 30 00:15 UTC) starts next bucket 2026-10-28
    expect(getNflWeekBucketKey('2026-10-30T00:15:00Z')).toBe('2026-10-28');

    const mixedWeekMarkets = [
      {
        ticker: 'KXNFLGAME-26OCT25PITNO-PIT',
        event_ticker: 'KXNFLGAME-26OCT25PITNO',
        title: 'Pittsburgh wins',
        status: 'active',
        yes_ask_dollars: '0.5500',
        no_ask_dollars: '0.4500',
        expected_expiration_time: '2026-10-25T20:00:00Z',
      },
      {
        ticker: 'KXNFLGAME-26OCT26DALPHI-PHI',
        event_ticker: 'KXNFLGAME-26OCT26DALPHI',
        title: 'Philadelphia wins',
        status: 'active',
        yes_ask_dollars: '0.6200',
        no_ask_dollars: '0.3800',
        expected_expiration_time: '2026-10-27T03:15:00Z',
      },
      {
        ticker: 'KXNFLGAME-26OCT29CARGB-GB',
        event_ticker: 'KXNFLGAME-26OCT29CARGB',
        title: 'Green Bay wins',
        status: 'active',
        yes_ask_dollars: '0.5800',
        no_ask_dollars: '0.4200',
        expected_expiration_time: '2026-10-30T03:15:00Z',
      },
    ];

    const games = parseKalshiGameMarketsToOptions(mixedWeekMarkets);
    expect(games).toHaveLength(2);
    expect(games.map((g) => g.game_id)).toEqual([
      'KXNFL-26OCT25PITNO',
      'KXNFL-26OCT26DALPHI',
    ]);
  });
});
