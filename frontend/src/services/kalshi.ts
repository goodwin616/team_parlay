import { ActivePlayer, GameLineOption, KalshiPropContract } from '../types';
import { kalshiCentsToAmerican } from '../utils/parlayMath';

export const NFL_GAME_SERIES = ['KXNFLGAME', 'KXNFLSPREAD', 'KXNFLTOTAL'] as const;
export const NFL_PROP_SERIES = [
  'KXNFLTD',
  'KXNFLFIRSTTD',
  'KXNFLPASSYDS',
  'KXNFLPASSTDS',
  'KXNFLPASSCOMP',
  'KXNFLPASSATT',
  'KXNFLPASSINT',
  'KXNFLRSHYDS',
  'KXNFLRSHATT',
  'KXNFLRECYDS',
  'KXNFLREC',
  'KXNFLRRYDS',
] as const;

const SERIES_CATEGORY_MAP: Record<string, string> = {
  KXNFLTD: 'Touchdowns',
  KXNFLANYTD: 'Touchdowns',
  KXNFLFIRSTTD: '1st Touchdown',
  KXNFLPASSYDS: 'Pass Yards',
  KXNFLPASSTD: 'Pass TDs',
  KXNFLPASSTDS: 'Pass TDs',
  KXNFLPASSCOMP: 'Completions',
  KXNFLPASSATT: 'Pass Attempts',
  KXNFLPASSINT: 'Interceptions',
  KXNFLRUSHYDS: 'Rush Yards',
  KXNFLRSHYDS: 'Rush Yards',
  KXNFLRSHATT: 'Rush Attempts',
  KXNFLRECYDS: 'Rec Yards',
  KXNFLREC: 'Receptions',
  KXNFLRRYDS: 'Rush + Rec Yards',
};

const SERIES_POSITION_MAP: Record<string, string> = {
  KXNFLPASSYDS: 'QB',
  KXNFLPASSTD: 'QB',
  KXNFLPASSTDS: 'QB',
  KXNFLPASSCOMP: 'QB',
  KXNFLPASSATT: 'QB',
  KXNFLPASSINT: 'QB',
  KXNFLRUSHYDS: 'RB',
  KXNFLRSHYDS: 'RB',
  KXNFLRSHATT: 'RB',
  KXNFLRRYDS: 'RB',
  KXNFLRECYDS: 'WR',
  KXNFLREC: 'WR',
  KXNFLTD: 'FLEX',
  KXNFLFIRSTTD: 'FLEX',
};

const NFL_TEAMS_MAP: Record<string, string[]> = {
  ARI: ['ARI', 'ARIZONA', 'ARIZONA CARDINALS', 'CARDINALS'],
  ATL: ['ATL', 'ATLANTA', 'ATLANTA FALCONS', 'FALCONS'],
  BAL: ['BAL', 'BALTIMORE', 'BALTIMORE RAVENS', 'RAVENS'],
  BUF: ['BUF', 'BUFFALO', 'BUFFALO BILLS', 'BILLS'],
  CAR: ['CAR', 'CAROLINA', 'CAROLINA PANTHERS', 'PANTHERS'],
  CHI: ['CHI', 'CHICAGO', 'CHICAGO BEARS', 'BEARS'],
  CIN: ['CIN', 'CINCINNATI', 'CINCINNATI BENGALS', 'BENGALS'],
  CLE: ['CLE', 'CLEVELAND', 'CLEVELAND BROWNS', 'BROWNS'],
  DAL: ['DAL', 'DALLAS', 'DALLAS COWBOYS', 'COWBOYS'],
  DEN: ['DEN', 'DENVER', 'DENVER BRONCOS', 'BRONCOS'],
  DET: ['DET', 'DETROIT', 'DETROIT LIONS', 'LIONS'],
  GB: ['GB', 'GREEN BAY', 'GREEN BAY PACKERS', 'PACKERS'],
  HOU: ['HOU', 'HOUSTON', 'HOUSTON TEXANS', 'TEXANS'],
  IND: ['IND', 'INDIANAPOLIS', 'INDIANAPOLIS COLTS', 'COLTS'],
  JAX: ['JAX', 'JAC', 'JACKSONVILLE', 'JACKSONVILLE JAGUARS', 'JAGUARS'],
  KC: ['KC', 'KANSAS CITY', 'KANSAS CITY CHIEFS', 'CHIEFS'],
  LV: ['LV', 'LAS VEGAS', 'LAS VEGAS RAIDERS', 'RAIDERS'],
  LAC: ['LAC', 'LOS ANGELES C', 'LOS ANGELES CHARGERS', 'LA CHARGERS', 'CHARGERS'],
  LAR: ['LAR', 'LA', 'LOS ANGELES R', 'LOS ANGELES RAMS', 'LA RAMS', 'RAMS'],
  MIA: ['MIA', 'MIAMI', 'MIAMI DOLPHINS', 'DOLPHINS'],
  MIN: ['MIN', 'MINNESOTA', 'MINNESOTA VIKINGS', 'VIKINGS'],
  NE: ['NE', 'NEW ENGLAND', 'NEW ENGLAND PATRIOTS', 'PATRIOTS'],
  NO: ['NO', 'NEW ORLEANS', 'NEW ORLEANS SAINTS', 'SAINTS'],
  NYG: ['NYG', 'NEW YORK G', 'NEW YORK GIANTS', 'NY GIANTS', 'GIANTS'],
  NYJ: ['NYJ', 'NEW YORK J', 'NEW YORK JETS', 'NY JETS', 'JETS'],
  PHI: ['PHI', 'PHILADELPHIA', 'PHILADELPHIA EAGLES', 'EAGLES'],
  PIT: ['PIT', 'PITTSBURGH', 'PITTSBURGH STEELERS', 'STEELERS'],
  SF: ['SF', 'SAN FRANCISCO', 'SAN FRANCISCO 49ERS', '49ERS'],
  SEA: ['SEA', 'SEATTLE', 'SEATTLE SEAHAWKS', 'SEAHAWKS'],
  TB: ['TB', 'TAMPA BAY', 'TAMPA BAY BUCCANEERS', 'BUCCANEERS'],
  TEN: ['TEN', 'TENNESSEE', 'TENNESSEE TITANS', 'TITANS'],
  WAS: ['WAS', 'WASHINGTON', 'WASHINGTON COMMANDERS', 'COMMANDERS'],
};

const VALID_TEAM_CODES = new Set([...Object.keys(NFL_TEAMS_MAP), 'JAC', 'LA']);

export function normalizeNflTeam(name: string): string {
  const cleaned = (name || '').trim().toUpperCase();
  for (const [code, aliases] of Object.entries(NFL_TEAMS_MAP)) {
    if (aliases.includes(cleaned)) {
      return code;
    }
  }
  return cleaned;
}

export function splitEventTeamsCode(teamsStr: string): [string, string] {
  const s = (teamsStr || '').trim().toUpperCase();
  if (!s) return ['AWAY', 'HOME'];
  for (const splitIdx of [2, 3]) {
    if (s.length > splitIdx) {
      const left = s.slice(0, splitIdx);
      const right = s.slice(splitIdx);
      if (VALID_TEAM_CODES.has(left) && VALID_TEAM_CODES.has(right)) {
        return [normalizeNflTeam(left), normalizeNflTeam(right)];
      }
    }
  }
  return ['AWAY', 'HOME'];
}

export function extractKalshiPriceCents(market: any, side: 'yes' | 'no' = 'yes'): number {
  const dollarsKey = `${side}_ask_dollars`;
  const bidDollarsKey = `${side}_bid_dollars`;
  const askKey = `${side}_ask`;
  const bidKey = `${side}_bid`;

  let valCents: number | null = null;
  if (market?.[dollarsKey] != null) {
    const parsed = parseFloat(String(market[dollarsKey]));
    if (!Number.isNaN(parsed)) valCents = parsed * 100;
  } else if (market?.[askKey] != null) {
    const parsed = parseFloat(String(market[askKey]));
    if (!Number.isNaN(parsed)) valCents = parsed;
  } else if (side === 'yes' && market?.last_price_dollars != null) {
    const parsed = parseFloat(String(market.last_price_dollars));
    if (!Number.isNaN(parsed)) valCents = parsed * 100;
  } else if (market?.[bidDollarsKey] != null) {
    const parsed = parseFloat(String(market[bidDollarsKey]));
    if (!Number.isNaN(parsed)) valCents = parsed * 100;
  } else if (market?.[bidKey] != null) {
    const parsed = parseFloat(String(market[bidKey]));
    if (!Number.isNaN(parsed)) valCents = parsed;
  }

  if (valCents == null || valCents <= 0) {
    valCents = 54;
  }
  return Math.max(1, Math.min(99, Math.round(valCents)));
}

export function extractKalshiKickoffTime(market: any): string {
  const exp = market?.expected_expiration_time || market?.occurrence_datetime;
  if (exp) {
    const ms = Date.parse(String(exp));
    if (!Number.isNaN(ms)) {
      return new Date(ms - 3 * 60 * 60 * 1000).toISOString();
    }
  }
  return (
    market?.close_time ||
    market?.commence_time ||
    market?.expiration_time ||
    new Date().toISOString()
  );
}

/**
 * Maps an NFL game kickoff timestamp to its Wednesday-to-Tuesday NFL week bucket (YYYY-MM-DD of that week's Wednesday).
 * Shifting back by 8 hours ensures Monday Night Football (Tuesday ~00:15 UTC) remains in the current week's bucket.
 */
export function getNflWeekBucketKey(kickoffIso?: string): string {
  if (!kickoffIso) return '';
  const ms = Date.parse(kickoffIso);
  if (Number.isNaN(ms)) return '';
  const shifted = new Date(ms - 8 * 60 * 60 * 1000);
  const daysSinceWednesday = (shifted.getUTCDay() - 3 + 7) % 7;
  const wednesday = new Date(shifted.getTime() - daysSinceWednesday * 24 * 60 * 60 * 1000);
  return wednesday.toISOString().slice(0, 10);
}

export function inferTeamsFromKalshiMarket(market: any): {
  awayTeam: string;
  homeTeam: string;
  targetTeam: string;
} {
  if (market?.home_team && market?.away_team) {
    const h = normalizeNflTeam(market.home_team);
    const a = normalizeNflTeam(market.away_team);
    const t = market.target_team ? normalizeNflTeam(market.target_team) : h;
    return { awayTeam: a, homeTeam: h, targetTeam: t };
  }

  let a = 'AWAY';
  let h = 'HOME';

  const rules = String(market?.rules_primary || '');
  if (rules) {
    const mRules = rules.match(
      /the\s+([A-Za-z0-9 .]+?)\s+(?:vs\.?|at|@)\s+([A-Za-z0-9 .]+?)\s+Pro Football game/i
    );
    if (mRules) {
      a = normalizeNflTeam(mRules[1]);
      h = normalizeNflTeam(mRules[2]);
    }
  }

  if (a === 'AWAY' || h === 'HOME') {
    const evTicker = String(market?.event_ticker || market?.ticker || '').toUpperCase();
    const mEv = evTicker.match(/-\d{2}[A-Z]{3}\d{2}([A-Z]{4,6})(?:-|$)/);
    if (mEv) {
      const [aCode, hCode] = splitEventTeamsCode(mEv[1]);
      if (aCode !== 'AWAY' && hCode !== 'HOME') {
        a = aCode;
        h = hCode;
      }
    }
  }

  const ticker = String(market?.ticker || '');
  const parts = ticker.split('-');
  let suffixTeam = parts.length >= 3 ? parts[parts.length - 1].toUpperCase().replace(/[^A-Z]/g, '') : '';
  if (suffixTeam === 'JAC' || suffixTeam === 'LA') {
    suffixTeam = normalizeNflTeam(suffixTeam);
  }

  const title = String(market?.title || '');
  const sub = String(market?.yes_sub_title || market?.subtitle || '');
  const titleWins = title.match(/^([A-Za-z .]+?)\s+wins\b/i);
  const subWins = sub.match(/^([A-Za-z .]+?)\s+wins\b/i);

  let t = h;
  if (market?.target_team) {
    t = normalizeNflTeam(market.target_team);
  } else if (suffixTeam && NFL_TEAMS_MAP[suffixTeam]) {
    t = suffixTeam;
  } else if (titleWins) {
    t = normalizeNflTeam(titleWins[1]);
  } else if (subWins) {
    t = normalizeNflTeam(subWins[1]);
  } else if (sub && NFL_TEAMS_MAP[normalizeNflTeam(sub)]) {
    t = normalizeNflTeam(sub);
  }

  return { awayTeam: a, homeTeam: h, targetTeam: t };
}

export interface ParsedKalshiProp extends KalshiPropContract {
  player_name: string;
  nfl_team: string;
  position: string;
}

export function parseKalshiPropMarket(market: any, seriesTicker = ''): ParsedKalshiProp {
  const ticker = String(market?.ticker || '');
  const eventTicker = String(market?.event_ticker || '');
  const resolvedSeries =
    seriesTicker ||
    market?.series_ticker ||
    (eventTicker.includes('-') ? eventTicker.split('-')[0] : '') ||
    (ticker.includes('-') ? ticker.split('-')[0] : '');

  const title = String(market?.title || market?.subtitle || ticker);
  const yesCents = extractKalshiPriceCents(market, 'yes');
  let noCents = extractKalshiPriceCents(market, 'no');
  if (market?.no_ask == null && market?.no_ask_dollars == null) {
    noCents = Math.max(1, Math.min(99, 100 - yesCents));
  }

  const kickoffTime = extractKalshiKickoffTime(market);
  const { awayTeam, homeTeam } = inferTeamsFromKalshiMarket(market);

  let nflTeam = market?.nfl_team ? normalizeNflTeam(market.nfl_team) : 'NFL';
  if (nflTeam === 'NFL') {
    const parts = ticker.split('-');
    if (parts.length >= 3) {
      const slug = parts[2].toUpperCase();
      const candidates = [awayTeam, homeTeam].sort((x, y) => y.length - x.length);
      for (const c of candidates) {
        if (c !== 'AWAY' && c !== 'HOME' && c !== 'NFL' && slug.startsWith(c)) {
          nflTeam = c;
          break;
        }
      }
    }
    if (nflTeam === 'NFL' && homeTeam !== 'HOME') {
      nflTeam = homeTeam;
    }
  }

  let playerName = String(market?.player_name || '').trim();
  let label = title;
  if (title.includes(':')) {
    const idx = title.indexOf(':');
    if (!playerName) {
      playerName = title.slice(0, idx).trim();
    }
    label = title.slice(idx + 1).trim();
  } else if (!playerName && market?.yes_sub_title) {
    const subStr = String(market.yes_sub_title).trim();
    playerName = subStr.includes(':') ? subStr.split(':')[0].trim() : subStr;
  }

  const statCategory =
    market?.stat_category || SERIES_CATEGORY_MAP[resolvedSeries] || 'Touchdowns';
  const position = SERIES_POSITION_MAP[resolvedSeries] || 'FLEX';
  const gameId = (eventTicker || String(market?.game_id || '')).replace(
    /^KXNFL[A-Z0-9]*-/,
    'KXNFL-'
  );

  return {
    market_ticker: ticker,
    series_ticker: resolvedSeries,
    stat_category: statCategory,
    label,
    player_name: playerName,
    nfl_team: nflTeam,
    position,
    yes_cents: yesCents,
    no_cents: noCents,
    yes_odds: kalshiCentsToAmerican(yesCents),
    no_odds: kalshiCentsToAmerican(noCents),
    kickoff_time: kickoffTime,
    game_id: gameId,
  };
}

export function parseKalshiGameMarketsToOptions(rawMarkets: any[]): GameLineOption[] {
  const gamesById = new Map<
    string,
    {
      game_id: string;
      commence_time: string;
      home_team: string;
      away_team: string;
      spread_home?: GameLineOption['spread_home'];
      spread_away?: GameLineOption['spread_away'];
      ml_home?: GameLineOption['ml_home'];
      ml_away?: GameLineOption['ml_away'];
      total_over?: GameLineOption['total_over'];
      total_under?: GameLineOption['total_under'];
      bestSpreadDiff: number;
      bestTotalDiff: number;
    }
  >();

  for (const m of rawMarkets) {
    if (!m) continue;
    if (['finalized', 'settled', 'closed'].includes(String(m.status || ''))) continue;
    if (m.yes_ask_dollars === '1.0000' && m.no_ask_dollars === '1.0000') continue;

    const rawEvent = String(m.game_id || m.event_ticker || m.ticker || 'game');
    const gameId = rawEvent.replace(/^KXNFL(?:GAME|SPREAD|TOTAL)-/, 'KXNFL-');
    const { awayTeam, homeTeam, targetTeam } = inferTeamsFromKalshiMarket(m);
    const commenceTime = extractKalshiKickoffTime(m);
    const series =
      m.series_ticker ||
      String(m.event_ticker || '').split('-')[0] ||
      String(m.ticker || '').split('-')[0];
    const ticker = String(m.ticker || '');

    const yesCents = extractKalshiPriceCents(m, 'yes');
    let noCents = extractKalshiPriceCents(m, 'no');
    if (m.no_ask == null && m.no_ask_dollars == null) {
      noCents = Math.max(1, Math.min(99, 100 - yesCents));
    }

    if (!gamesById.has(gameId)) {
      gamesById.set(gameId, {
        game_id: gameId,
        commence_time: commenceTime,
        home_team: homeTeam,
        away_team: awayTeam,
        bestSpreadDiff: 999,
        bestTotalDiff: 999,
      });
    }

    const g = gamesById.get(gameId)!;
    if (g.home_team === 'HOME' && homeTeam !== 'HOME') g.home_team = homeTeam;
    if (g.away_team === 'AWAY' && awayTeam !== 'AWAY') g.away_team = awayTeam;

    if (series === 'KXNFLGAME') {
      if (targetTeam === g.home_team) {
        g.ml_home = {
          odds: kalshiCentsToAmerican(yesCents),
          price_cents: yesCents,
          market_ticker: ticker,
        };
        if (!g.ml_away) {
          g.ml_away = {
            odds: kalshiCentsToAmerican(noCents),
            price_cents: noCents,
            market_ticker: ticker,
          };
        }
      } else if (targetTeam === g.away_team) {
        g.ml_away = {
          odds: kalshiCentsToAmerican(yesCents),
          price_cents: yesCents,
          market_ticker: ticker,
        };
        if (!g.ml_home) {
          g.ml_home = {
            odds: kalshiCentsToAmerican(noCents),
            price_cents: noCents,
            market_ticker: ticker,
          };
        }
      }
    } else if (series === 'KXNFLSPREAD') {
      const rawStrike = parseFloat(String(m.floor_strike ?? m.point ?? -3.5));
      const favSpread = rawStrike !== 0 ? -Math.abs(rawStrike) : 0;
      const diff = Math.abs(yesCents - 50);
      if (diff <= g.bestSpreadDiff) {
        g.bestSpreadDiff = diff;
        if (targetTeam === g.home_team) {
          g.spread_home = {
            point: favSpread,
            odds: kalshiCentsToAmerican(yesCents),
            price_cents: yesCents,
            market_ticker: ticker,
          };
          g.spread_away = {
            point: -favSpread,
            odds: kalshiCentsToAmerican(noCents),
            price_cents: noCents,
            market_ticker: ticker,
          };
        } else if (targetTeam === g.away_team) {
          g.spread_away = {
            point: favSpread,
            odds: kalshiCentsToAmerican(yesCents),
            price_cents: yesCents,
            market_ticker: ticker,
          };
          g.spread_home = {
            point: -favSpread,
            odds: kalshiCentsToAmerican(noCents),
            price_cents: noCents,
            market_ticker: ticker,
          };
        }
      }
    } else if (series === 'KXNFLTOTAL') {
      const strike = parseFloat(String(m.floor_strike ?? m.point ?? 47.5));
      const diff = Math.abs(yesCents - 50);
      if (diff <= g.bestTotalDiff) {
        g.bestTotalDiff = diff;
        g.total_over = {
          point: strike,
          odds: kalshiCentsToAmerican(yesCents),
          price_cents: yesCents,
          market_ticker: ticker,
        };
        g.total_under = {
          point: strike,
          odds: kalshiCentsToAmerican(noCents),
          price_cents: noCents,
          market_ticker: ticker,
        };
      }
    }
  }

  const options: GameLineOption[] = [];
  for (const g of gamesById.values()) {
    if (g.home_team === 'HOME' || g.away_team === 'AWAY') continue;
    options.push({
      game_id: g.game_id,
      home_team: g.home_team,
      away_team: g.away_team,
      commence_time: g.commence_time,
      spread_home: g.spread_home || {
        point: -2.5,
        odds: '-113',
        price_cents: 53,
        market_ticker: `KXNFLSPREAD-${g.game_id}-${g.home_team}`,
      },
      spread_away: g.spread_away || {
        point: 2.5,
        odds: '-108',
        price_cents: 52,
        market_ticker: `KXNFLSPREAD-${g.game_id}-${g.away_team}`,
      },
      ml_home: g.ml_home || {
        odds: '-130',
        price_cents: 56,
        market_ticker: `KXNFLGAME-${g.game_id}-${g.home_team}`,
      },
      ml_away: g.ml_away || {
        odds: '+110',
        price_cents: 48,
        market_ticker: `KXNFLGAME-${g.game_id}-${g.away_team}`,
      },
      total_over: g.total_over || {
        point: 47.5,
        odds: '-113',
        price_cents: 53,
        market_ticker: `KXNFLTOTAL-${g.game_id}-O`,
      },
      total_under: g.total_under || {
        point: 47.5,
        odds: '-108',
        price_cents: 52,
        market_ticker: `KXNFLTOTAL-${g.game_id}-U`,
      },
    });
  }

  options.sort((a, b) => a.commence_time.localeCompare(b.commence_time));

  // Filter to only the active NFL week's slate (exclude lookahead games from future NFL weeks)
  if (options.length > 0) {
    const activeWeekKey = getNflWeekBucketKey(options[0].commence_time);
    if (activeWeekKey) {
      return options.filter((g) => getNflWeekBucketKey(g.commence_time) === activeWeekKey);
    }
  }

  return options;
}

export const KALSHI_BOARD_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface KalshiBoardResult {
  games: GameLineOption[];
  props: ParsedKalshiProp[];
  players: ActivePlayer[];
  live_market_count: number;
  updated_at?: string;
}

let cachedBoard: { timestamp: number; data: KalshiBoardResult } | null = null;
let inFlightBoardPromise: Promise<KalshiBoardResult> | null = null;

export async function fetchDirectKalshiNflBoard(
  forceRefresh = false
): Promise<KalshiBoardResult> {
  const now = Date.now();
  if (!forceRefresh && cachedBoard && now - cachedBoard.timestamp < KALSHI_BOARD_CACHE_TTL_MS) {
    return cachedBoard.data;
  }
  if (inFlightBoardPromise) {
    return inFlightBoardPromise;
  }

  inFlightBoardPromise = (async () => {
    try {
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      const fetchSeries = async (series: string): Promise<any[]> => {
        const baseUrls = [
          ...(import.meta.env.DEV ? ['/kalshi-api/markets'] : []),
          'https://api.elections.kalshi.com/trade-api/v2/markets',
        ];
        for (const baseUrl of baseUrls) {
          try {
            const collected: any[] = [];
            let cursor = '';
            let page = 0;
            let baseWorked = false;

            while (page < 3) {
              const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
              const url = `${baseUrl}?series_ticker=${series}&status=open&limit=1000&mve_filter=exclude${cursorParam}`;
              let res: Response | null = null;
              for (let attempt = 0; attempt < 3; attempt++) {
                res = await fetch(url);
                if (res.status === 429 && attempt < 2) {
                  await sleep(350 * (attempt + 1));
                  continue;
                }
                break;
              }
              if (!res || !res.ok) break;
              const contentType = res.headers.get('content-type') || '';
              if (!contentType.includes('json')) break;
              const data = await res.json();
              if (!Array.isArray(data?.markets)) break;

              baseWorked = true;
              collected.push(...data.markets);
              cursor = String(data?.cursor || '');
              page += 1;
              if (!cursor || data.markets.length < 1000) break;
            }

            if (baseWorked) {
              return collected
                .filter(
                  (m: any) =>
                    !['finalized', 'settled', 'closed'].includes(String(m?.status || '')) &&
                    !(m?.yes_ask_dollars === '1.0000' && m?.no_ask_dollars === '1.0000')
                )
                .map((m: any) => ({ ...m, series_ticker: m.series_ticker || series }));
            }
          } catch {
            // Try next base URL
          }
        }
        return [];
      };

      // Fetch in small batches of 3 to avoid Kalshi 429 burst rate limits
      const fetchBatched = async (seriesList: readonly string[]): Promise<any[][]> => {
        const results: any[][] = [];
        const batchSize = 3;
        for (let i = 0; i < seriesList.length; i += batchSize) {
          const slice = seriesList.slice(i, i + batchSize);
          const batchRes = await Promise.all(slice.map((s) => fetchSeries(s)));
          results.push(...batchRes);
        }
        return results;
      };

      const gameResults = await fetchBatched(NFL_GAME_SERIES);
      const propResults = await fetchBatched(NFL_PROP_SERIES);

      const rawGameMarkets = gameResults.flat();
      const games = parseKalshiGameMarketsToOptions(rawGameMarkets);
      const activeWeekKey =
        games.length > 0 ? getNflWeekBucketKey(games[0].commence_time) : '';

      const allParsedProps: ParsedKalshiProp[] = [];
      NFL_PROP_SERIES.forEach((series, idx) => {
        for (const m of propResults[idx] || []) {
          allParsedProps.push(parseKalshiPropMarket(m, series));
        }
      });

      const props = activeWeekKey
        ? allParsedProps.filter((p) => {
            const wk = getNflWeekBucketKey(p.kickoff_time);
            return !wk || wk === activeWeekKey;
          })
        : allParsedProps;

      const playersByName = new Map<string, ActivePlayer>();
      for (const p of props) {
        if (!p.player_name || p.player_name.endsWith('D/ST')) continue;
        const key = p.player_name.toLowerCase();
        const existing = playersByName.get(key);
        if (!existing) {
          playersByName.set(key, {
            id: `kalshi_${key.replace(/[^a-z0-9]/g, '')}`,
            name: p.player_name,
            team: p.nfl_team,
            position: p.position,
          });
        } else if (existing.position === 'FLEX' && p.position !== 'FLEX') {
          existing.position = p.position;
        }
      }

      const result: KalshiBoardResult = {
        games,
        props,
        players: Array.from(playersByName.values()),
        live_market_count: rawGameMarkets.length + props.length,
        updated_at: new Date().toISOString(),
      };

      if (result.games.length > 0 || result.props.length > 0) {
        cachedBoard = { timestamp: Date.now(), data: result };
      }
      return result;
    } finally {
      inFlightBoardPromise = null;
    }
  })();

  return inFlightBoardPromise;
}
