import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseKalshiGameMarketsToOptions,
  parseKalshiPropMarket,
  splitEventTeamsCode,
  getNflWeekBucketKey,
  fetchDirectKalshiNflBoard,
  extractKalshiPriceCents,
  extractKalshiKickoffTime,
  inferTeamsFromKalshiMarket,
  normalizeNflTeam,
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

describe('Kalshi API error handling and fallback resilience', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('HTTP error status codes & network resilience', () => {
    it('handles HTTP 500 server errors gracefully without unhandled exceptions', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          status: 500,
          ok: false,
          headers: { get: () => 'application/json' },
          json: async () => ({ error: 'Internal Server Error' }),
        })
      );

      const result = await fetchDirectKalshiNflBoard(true);
      expect(result).toBeDefined();
      expect(result.games).toEqual([]);
      expect(result.props).toEqual([]);
      expect(result.players).toEqual([]);
      expect(result.live_market_count).toBe(0);
      expect(typeof result.updated_at).toBe('string');
    });

    it('handles HTTP 429 rate limit errors with backoff retry exhaustion gracefully', async () => {
      // Mock setTimeout so backoff delay executes synchronously without slowing tests
      vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void) => {
        cb();
        return 0 as any;
      }) as any);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          status: 429,
          ok: false,
          headers: { get: () => 'application/json' },
          json: async () => ({ error: 'Too Many Requests' }),
        })
      );

      const result = await fetchDirectKalshiNflBoard(true);
      expect(result).toBeDefined();
      expect(result.games).toEqual([]);
      expect(result.props).toEqual([]);
      expect(result.players).toEqual([]);
      expect(result.live_market_count).toBe(0);
    });

    it('recovers when HTTP 429 succeeds on subsequent retry attempt', async () => {
      vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void) => {
        cb();
        return 0 as any;
      }) as any);

      let callCount = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async () => {
          callCount++;
          // First attempt is rate-limited 429, second attempt succeeds with valid markets
          if (callCount % 2 === 1) {
            return {
              status: 429,
              ok: false,
              headers: { get: () => 'application/json' },
              json: async () => ({ error: 'Rate limit' }),
            };
          }
          return {
            status: 200,
            ok: true,
            headers: { get: () => 'application/json' },
            json: async () => ({
              markets: [
                {
                  ticker: 'KXNFLGAME-26OCT29CARGB-GB',
                  event_ticker: 'KXNFLGAME-26OCT29CARGB',
                  title: 'Green Bay wins',
                  status: 'active',
                  yes_ask_dollars: '0.6000',
                  no_ask_dollars: '0.4000',
                  expected_expiration_time: '2026-10-30T03:15:00Z',
                },
                {
                  ticker: 'KXNFLGAME-26OCT29CARGB-CAR',
                  event_ticker: 'KXNFLGAME-26OCT29CARGB',
                  title: 'Carolina wins',
                  status: 'active',
                  yes_ask_dollars: '0.4000',
                  no_ask_dollars: '0.6000',
                  expected_expiration_time: '2026-10-30T03:15:00Z',
                },
              ],
            }),
          };
        })
      );

      const result = await fetchDirectKalshiNflBoard(true);
      expect(result).toBeDefined();
      expect(result.games.length).toBeGreaterThan(0);
      expect(result.games[0].home_team).toBe('GB');
      expect(result.games[0].away_team).toBe('CAR');
    });

    it('handles network failure (fetch rejected promise) without unhandled exceptions', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network offline or DNS resolution failed'))
      );

      const result = await fetchDirectKalshiNflBoard(true);
      expect(result).toBeDefined();
      expect(result.games).toEqual([]);
      expect(result.props).toEqual([]);
      expect(result.players).toEqual([]);
      expect(result.live_market_count).toBe(0);
    });

    it('handles non-JSON upstream responses (e.g. HTML 502/503 Cloudflare error page)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          status: 502,
          ok: false,
          headers: { get: () => 'text/html; charset=UTF-8' },
          json: async () => {
            throw new Error('Unexpected token < in JSON at position 0');
          },
        })
      );

      const result = await fetchDirectKalshiNflBoard(true);
      expect(result).toBeDefined();
      expect(result.games).toEqual([]);
      expect(result.props).toEqual([]);
    });
  });

  describe('Fallback behavior with empty or malformed market payloads', () => {
    it('handles empty markets array { markets: [] } safely', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          status: 200,
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ markets: [] }),
        })
      );

      const result = await fetchDirectKalshiNflBoard(true);
      expect(result.games).toEqual([]);
      expect(result.props).toEqual([]);
      expect(result.players).toEqual([]);
      expect(result.live_market_count).toBe(0);
    });

    it('handles malformed market payload where markets is null or not an array', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          status: 200,
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ markets: null }),
        })
      );

      const result = await fetchDirectKalshiNflBoard(true);
      expect(result.games).toEqual([]);
      expect(result.props).toEqual([]);
      expect(result.players).toEqual([]);
      expect(result.live_market_count).toBe(0);
    });

    it('parseKalshiGameMarketsToOptions filters out null, undefined, settled, and illiquid markets', () => {
      const corruptedMarkets = [
        null,
        undefined,
        {},
        { status: 'finalized', ticker: 'KXNFLGAME-1' },
        { status: 'settled', ticker: 'KXNFLGAME-2' },
        { status: 'closed', ticker: 'KXNFLGAME-3' },
        // Illiquid 100/100 ask
        { status: 'active', yes_ask_dollars: '1.0000', no_ask_dollars: '1.0000' },
      ];

      const options = parseKalshiGameMarketsToOptions(corruptedMarkets);
      expect(options).toEqual([]);
    });

    it('provides default spread, total, and moneyline values when secondary markets are missing', () => {
      // Only ML provided, spread and totals missing
      const partialMarkets = [
        {
          ticker: 'KXNFLGAME-26OCT29CARGB-GB',
          event_ticker: 'KXNFLGAME-26OCT29CARGB',
          title: 'Green Bay wins',
          status: 'active',
          yes_ask_dollars: '0.6500',
          no_ask_dollars: '0.3500',
          expected_expiration_time: '2026-10-30T03:15:00Z',
        },
        {
          ticker: 'KXNFLGAME-26OCT29CARGB-CAR',
          event_ticker: 'KXNFLGAME-26OCT29CARGB',
          title: 'Carolina wins',
          status: 'active',
          yes_ask_dollars: '0.3500',
          no_ask_dollars: '0.6500',
          expected_expiration_time: '2026-10-30T03:15:00Z',
        },
      ];

      const options = parseKalshiGameMarketsToOptions(partialMarkets);
      expect(options).toHaveLength(1);
      const g = options[0];
      // Provided ML is parsed
      expect(g.ml_home.price_cents).toBe(65);
      expect(g.ml_away.price_cents).toBe(35);
      // Missing spread falls back to synthetic standard defaults
      expect(g.spread_home.point).toBe(-2.5);
      expect(g.spread_away.point).toBe(2.5);
      // Missing total falls back to synthetic standard defaults
      expect(g.total_over.point).toBe(47.5);
      expect(g.total_under.point).toBe(47.5);
    });

    it('extractKalshiPriceCents defaults to 54 cents when price fields are missing or invalid', () => {
      expect(extractKalshiPriceCents(null)).toBe(54);
      expect(extractKalshiPriceCents({})).toBe(54);
      expect(extractKalshiPriceCents({ yes_ask_dollars: 'invalid' })).toBe(54);
      expect(extractKalshiPriceCents({ yes_ask_dollars: '-0.5000' })).toBe(54);
      expect(extractKalshiPriceCents({ yes_ask_dollars: '0' })).toBe(54);
      // Valid dollar price converts to cents
      expect(extractKalshiPriceCents({ yes_ask_dollars: '0.7200' })).toBe(72);
      // Clamped to 1 - 99
      expect(extractKalshiPriceCents({ yes_ask_dollars: '1.2000' })).toBe(99);
    });

    it('extractKalshiKickoffTime provides safe fallbacks when expiration is missing or malformed', () => {
      expect(extractKalshiKickoffTime(null)).toBeDefined();
      expect(extractKalshiKickoffTime({})).toBeDefined();

      const validTime = '2026-10-25T17:00:00Z';
      expect(extractKalshiKickoffTime({ close_time: validTime })).toBe(validTime);

      // Shifts expected_expiration_time back 3 hours for kickoff estimate
      const expectedTime = '2026-10-25T20:00:00Z';
      const parsedKickoff = extractKalshiKickoffTime({
        expected_expiration_time: expectedTime,
      });
      expect(parsedKickoff).toBe('2026-10-25T17:00:00.000Z');
    });

    it('inferTeamsFromKalshiMarket and normalizeNflTeam safely handle missing or unknown team data', () => {
      expect(normalizeNflTeam('')).toBe('');
      expect(normalizeNflTeam('unknown_team')).toBe('UNKNOWN_TEAM');
      expect(normalizeNflTeam('Philadelphia Eagles')).toBe('PHI');
      expect(normalizeNflTeam('Chiefs')).toBe('KC');

      const inferred = inferTeamsFromKalshiMarket({});
      expect(inferred.awayTeam).toBe('AWAY');
      expect(inferred.homeTeam).toBe('HOME');
    });

    it('parseKalshiPropMarket handles incomplete payloads with safe fallbacks', () => {
      const prop = parseKalshiPropMarket({});
      expect(prop.player_name).toBe('');
      expect(prop.nfl_team).toBe('NFL');
      expect(prop.position).toBe('FLEX');
      expect(prop.stat_category).toBe('Touchdowns');
      expect(prop.yes_cents).toBe(54);
      expect(prop.no_cents).toBe(46);
    });
  });
});
