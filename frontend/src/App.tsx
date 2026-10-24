import React, { useState, useEffect, useRef } from 'react';
import {
  History,
  UserCheck,
  KeyRound,
  X,
  ArrowLeftRight,
} from 'lucide-react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { BettorBanner } from './components/BettorBanner';
import { ParlayCard } from './components/ParlayCard';
import { PickModal, PickData } from './components/PickModal';
import { PastSlipsArchive } from './components/PastSlipsArchive';
import { LeagueLandingPage } from './components/LeagueLandingPage';
import { WeeklyParlay, ActivePlayer, TeamProfile, ParlayLeg, GameLineOption } from './types';
import {
  fetchDirectKalshiNflBoard,
  KALSHI_BOARD_CACHE_TTL_MS,
} from './services/kalshi';
import {
  saveSession,
  getSession,
  getLeagueIdFromLocation,
  getRecentLeagues,
  saveRecentLeague,
  RecentLeague,
} from './services/auth';
import { db, functions } from './services/firebase';
import { calculateParlayStats, OddsFormat } from './utils/parlayMath';

const DEFAULT_LOCAL_SESSION_TOKEN = 'demo_local_session_token';

// Master Database of active offensive NFL players from Sleeper
const MOCK_ACTIVE_PLAYERS: ActivePlayer[] = [
  { id: '101', name: 'Saquon Barkley', team: 'PHI', position: 'RB' },
  { id: '102', name: 'Derrick Henry', team: 'BAL', position: 'RB' },
  { id: '103', name: 'Patrick Mahomes', team: 'KC', position: 'QB' },
  { id: '104', name: 'Amon-Ra St. Brown', team: 'DET', position: 'WR' },
  { id: '105', name: 'Josh Allen', team: 'BUF', position: 'QB' },
  { id: '106', name: 'Justin Jefferson', team: 'MIN', position: 'WR' },
  { id: '107', name: 'Travis Kelce', team: 'KC', position: 'TE' },
  { id: '108', name: 'Lamar Jackson', team: 'BAL', position: 'QB' },
  { id: '109', name: 'CeeDee Lamb', team: 'DAL', position: 'WR' },
  { id: '110', name: 'Breece Hall', team: 'NYJ', position: 'RB' },
  { id: '111', name: 'Jahmyr Gibbs', team: 'DET', position: 'RB' },
  { id: '112', name: 'Christian McCaffrey', team: 'SF', position: 'RB' },
  { id: '113', name: 'A.J. Brown', team: 'PHI', position: 'WR' },
  { id: '114', name: 'Tyreek Hill', team: 'MIA', position: 'WR' },
  { id: '115', name: 'Sam LaPorta', team: 'DET', position: 'TE' },
  { id: '116', name: 'Jalen Hurts', team: 'PHI', position: 'QB' },
  { id: '117', name: 'Kyren Williams', team: 'LAR', position: 'RB' },
  { id: '118', name: 'Nico Collins', team: 'HOU', position: 'WR' },
];

// Fallback Demo League Teams
const MOCK_TEAMS: TeamProfile[] = [
  {
    roster_id: 1,
    owner_id: 'u1',
    owner_name: 'Blake',
    team_name: 'Philly Special',
  },
  {
    roster_id: 2,
    owner_id: 'u2',
    owner_name: 'Bob',
    team_name: 'Gridiron Clowns',
  },
  {
    roster_id: 3,
    owner_id: 'u3',
    owner_name: 'Alice',
    team_name: 'Motor City Kitties',
  },
  {
    roster_id: 4,
    owner_id: 'u4',
    owner_name: 'Charlie',
    team_name: 'Buffalo Stampede',
  },
  {
    roster_id: 5,
    owner_id: 'u5',
    owner_name: 'Dave',
    team_name: 'Lone Star Dynasty',
  },
];

// Initial active weekly parlay backed by Kalshi contracts
const INITIAL_PARLAY: WeeklyParlay = {
  week: 4,
  season: '2026',
  status: 'open',
  contains_sgp: false,
  bettor: {
    roster_id: 2, // Bob is lowest scorer
    team_name: 'Gridiron Clowns',
    owner_name: 'Bob',
    points_last_week: 78.4,
  },
  earliest_kickoff: '2026-10-29T20:15:00Z', // Upcoming TNF game
  legs: [
    {
      id: 'l1',
      roster_id: 1,
      team_name: 'Philly Special',
      owner_name: 'Blake',
      nfl_team: 'PHI',
      game_id: 'KXNFL-26NOV01-PHIDAL',
      description: 'Saquon Barkley (PHI) • Anytime TD (1+) (YES)',
      odds_american: '-117',
      odds_decimal: 1.8519,
      price_cents: 54,
      kalshi_market_ticker: 'KXNFLTD-26NOV01-SAQUONBARK-1',
      kalshi_side: 'yes',
      status: 'submitted',
      kickoff_time: '2026-11-01T17:00:00Z',
    },
    {
      id: 'l2',
      roster_id: 2,
      team_name: 'Gridiron Clowns',
      owner_name: 'Bob',
      nfl_team: 'KC',
      game_id: 'KXNFL-26OCT29-KCBAL',
      description: 'KC Winner (Moneyline)',
      odds_american: '+117',
      odds_decimal: 2.1739,
      price_cents: 46,
      kalshi_market_ticker: 'KXNFLGAME-26OCT29-KCBAL-KC',
      kalshi_side: 'yes',
      status: 'submitted',
      kickoff_time: '2026-10-29T20:15:00Z', // TNF
    },
    {
      id: 'l3',
      roster_id: 3,
      team_name: 'Motor City Kitties',
      owner_name: 'Alice',
      nfl_team: 'DET',
      game_id: 'KXNFL-26NOV01-DETGB',
      description: 'Amon-Ra St. Brown (DET) • 75+ Rec Yards (YES)',
      odds_american: '-113',
      odds_decimal: 1.8868,
      price_cents: 53,
      kalshi_market_ticker: 'KXNFLRECYDS-26NOV01-AMONRASTBR-75',
      kalshi_side: 'yes',
      status: 'submitted',
      kickoff_time: '2026-11-01T17:00:00Z',
    },
    {
      id: 'l4',
      roster_id: 4,
      team_name: 'Buffalo Stampede',
      owner_name: 'Charlie',
      nfl_team: 'BUF',
      description: '',
      odds_american: '-110',
      odds_decimal: 1.91,
      status: 'pending',
    },
    {
      id: 'l5',
      roster_id: 5,
      team_name: 'Lone Star Dynasty',
      owner_name: 'Dave',
      nfl_team: 'DAL',
      description: '',
      odds_american: '-110',
      odds_decimal: 1.91,
      status: 'pending',
    },
  ],
  estimated_odds_american: '+660',
  estimated_multiplier: 7.6,
  estimated_payout: 38.0,
  combined_probability_cents: 13,
  actual_payout: null,
  actual_odds_american: null,
};

// Past Parlays for Archive
const MOCK_PAST_PARLAYS: WeeklyParlay[] = [
  {
    week: 3,
    season: '2026',
    status: 'locked',
    contains_sgp: false,
    bettor: {
      roster_id: 4,
      team_name: 'Buffalo Stampede',
      owner_name: 'Charlie',
      points_last_week: 82.1,
    },
    earliest_kickoff: '2026-09-17T20:15:00Z',
    legs: [
      { id: 'p3_1', roster_id: 1, team_name: 'Philly Special', owner_name: 'Blake', nfl_team: 'PHI', description: 'Jalen Hurts (PHI) • 2+ Passing TDs (YES)', odds_american: '-117', odds_decimal: 1.8519, price_cents: 54, status: 'submitted' },
      { id: 'p3_2', roster_id: 2, team_name: 'Gridiron Clowns', owner_name: 'Bob', nfl_team: 'KC', description: 'Patrick Mahomes (KC) • 250+ Pass Yards (YES)', odds_american: '-113', odds_decimal: 1.8868, price_cents: 53, status: 'submitted' },
      { id: 'p3_3', roster_id: 3, team_name: 'Motor City Kitties', owner_name: 'Alice', nfl_team: 'DET', description: 'DET -3.5 Spread', odds_american: '-113', odds_decimal: 1.8868, price_cents: 53, status: 'submitted' },
      { id: 'p3_4', roster_id: 4, team_name: 'Buffalo Stampede', owner_name: 'Charlie', nfl_team: 'BUF', description: 'Josh Allen (BUF) • Anytime TD (1+) (YES)', odds_american: '+122', odds_decimal: 2.2222, price_cents: 45, status: 'submitted' },
      { id: 'p3_5', roster_id: 5, team_name: 'Lone Star Dynasty', owner_name: 'Dave', nfl_team: 'DAL', description: 'DAL Winner (Moneyline)', odds_american: '-122', odds_decimal: 1.8182, price_cents: 55, status: 'submitted' },
    ],
    estimated_odds_american: '+2564',
    estimated_multiplier: 26.64,
    estimated_payout: 133.20,
    combined_probability_cents: 4,
    actual_payout: 133.20,
    actual_odds_american: '+2564',
  },
  {
    week: 2,
    season: '2026',
    status: 'locked',
    contains_sgp: true,
    bettor: {
      roster_id: 1,
      team_name: 'Philly Special',
      owner_name: 'Blake',
      points_last_week: 79.5,
    },
    earliest_kickoff: '2026-09-10T20:15:00Z',
    legs: [
      { id: 'p2_1', roster_id: 1, team_name: 'Philly Special', owner_name: 'Blake', nfl_team: 'BAL', game_id: 'KXNFL-26SEP10-BAL', description: 'Derrick Henry (BAL) • Anytime TD (1+) (YES)', odds_american: '-138', odds_decimal: 1.7241, price_cents: 58, status: 'submitted' },
      { id: 'p2_2', roster_id: 2, team_name: 'Gridiron Clowns', owner_name: 'Bob', nfl_team: 'KC', description: 'Travis Kelce (KC) • Anytime TD (1+) (YES)', odds_american: '+108', odds_decimal: 2.0833, price_cents: 48, status: 'submitted' },
      { id: 'p2_3', roster_id: 3, team_name: 'Motor City Kitties', owner_name: 'Alice', nfl_team: 'DET', description: 'Jahmyr Gibbs (DET) • 50+ Rush Yards (YES)', odds_american: '-117', odds_decimal: 1.8519, price_cents: 54, status: 'submitted' },
      { id: 'p2_4', roster_id: 4, team_name: 'Buffalo Stampede', owner_name: 'Charlie', nfl_team: 'BAL', game_id: 'KXNFL-26SEP10-BAL', description: 'Lamar Jackson (BAL) • 50+ Rush Yards (YES)', odds_american: '-108', odds_decimal: 1.9231, price_cents: 52, status: 'submitted' },
      { id: 'p2_5', roster_id: 5, team_name: 'Lone Star Dynasty', owner_name: 'Dave', nfl_team: 'DAL', description: 'CeeDee Lamb (DAL) • Anytime TD (1+) (YES)', odds_american: '+104', odds_decimal: 2.0408, price_cents: 49, status: 'submitted' },
    ],
    estimated_odds_american: '+2510',
    estimated_multiplier: 26.10,
    estimated_payout: 130.50,
    combined_probability_cents: 4,
    actual_payout: 112.00,
    actual_odds_american: '+2140',
  },
];

export const App: React.FC = () => {
  // URL-based League ID State
  const [leagueId, setLeagueId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? getLeagueIdFromLocation(window.location) : null
  );
  const [leagueName, setLeagueName] = useState<string>('Sleeper League');
  const [recentLeagues, setRecentLeagues] = useState<RecentLeague[]>(() =>
    getRecentLeagues()
  );

  // League Data State
  const [season, setSeason] = useState<string>(() => String(new Date().getFullYear()));
  const [teams, setTeams] = useState<TeamProfile[]>(MOCK_TEAMS);
  const [currentRosterId, setCurrentRosterId] = useState<number>(1);
  const [parlay, setParlay] = useState<WeeklyParlay>(INITIAL_PARLAY);
  const [pastParlays, setPastParlays] = useState<WeeklyParlay[]>(MOCK_PAST_PARLAYS);
  const [oddsFormat, setOddsFormat] = useState<OddsFormat>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('parlay_odds_format');
      if (saved === 'american' || saved === 'percentage') return saved;
    }
    return 'american';
  });

  const handleToggleOddsFormat = (format: OddsFormat) => {
    setOddsFormat(format);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('parlay_odds_format', format);
    }
  };
  const [isLoadingLeague, setIsLoadingLeague] = useState<boolean>(false);
  const [leagueError, setLeagueError] = useState<string | null>(null);
  const syncedLeagueRef = useRef<string | null>(null);

  // Modals & Live Kalshi / Sleeper Player Board State
  const [isPickOpen, setIsPickOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authPinInput, setAuthPinInput] = useState('');
  const [authSelectedRoster, setAuthSelectedRoster] = useState<number>(1);
  const [activePlayers, setActivePlayers] = useState<ActivePlayer[]>(MOCK_ACTIVE_PLAYERS);
  const [kalshiGames, setKalshiGames] = useState<GameLineOption[]>([]);
  const [kalshiProps, setKalshiProps] = useState<any[]>([]);
  const [liveMarketCount, setLiveMarketCount] = useState<number>(0);
  const lastKalshiFetchRef = useRef<number>(0);

  // Load live Kalshi NFL markets & Sleeper active NFL players (cached for 5 mins, refreshes on query when >5 mins old)
  const refreshKalshiBoardIfNeeded = async (force = false) => {
    const now = Date.now();
    if (
      !force &&
      lastKalshiFetchRef.current > 0 &&
      now - lastKalshiFetchRef.current < KALSHI_BOARD_CACHE_TTL_MS &&
      kalshiProps.length > 0
    ) {
      return;
    }

    let loadedLiveKalshi = false;

    const applyBoard = (board: {
      games?: GameLineOption[];
      props?: any[];
      players?: ActivePlayer[];
      live_market_count?: number;
      updated_at?: string;
    }) => {
      if (Array.isArray(board.games) && board.games.length > 0) {
        setKalshiGames(board.games);
        loadedLiveKalshi = true;
      }
      if (Array.isArray(board.props) && board.props.length > 0) {
        setKalshiProps(board.props);
        loadedLiveKalshi = true;
      }
      if (board.live_market_count) {
        setLiveMarketCount(Number(board.live_market_count));
      }
      if (Array.isArray(board.players) && board.players.length > 0) {
        loadedLiveKalshi = true;
        setActivePlayers(board.players);
      }
      if (loadedLiveKalshi) {
        const serverTs = board.updated_at ? Date.parse(board.updated_at) : NaN;
        lastKalshiFetchRef.current = !Number.isNaN(serverTs) ? serverTs : Date.now();
      }
    };

    // 1a. Try Cloud Function get_kalshi_nfl_markets (backed by 5-min Firestore + memory cache)
    try {
      const kalshiFn = httpsCallable<
        Record<string, never>,
        {
          games: GameLineOption[];
          props: any[];
          players: ActivePlayer[];
          live_market_count: number;
          updated_at?: string;
          cached?: boolean;
        }
      >(functions, 'get_kalshi_nfl_markets');
      const res = await kalshiFn({});
      if (res.data) {
        applyBoard(res.data);
      }
    } catch {
      // Fallback to direct Kalshi fetch below
    }

    // 1b. If Cloud Function hasn't been restarted or returned 0 markets, fetch directly from Kalshi
    if (!loadedLiveKalshi) {
      try {
        const directBoard = await fetchDirectKalshiNflBoard(force);
        applyBoard(directBoard);
      } catch {
        // Ignore if offline
      }
    }

    // 2. Enrich positions from Sleeper (or fallback to Sleeper players only if Kalshi returned 0 markets)
    const enrichOrSetPlayers = (sleeperPlayers: ActivePlayer[]) => {
      if (sleeperPlayers.length === 0) return;
      const sleeperByName = new Map<string, ActivePlayer>();
      for (const sp of sleeperPlayers) {
        sleeperByName.set(sp.name.toLowerCase(), sp);
      }
      setActivePlayers((prev) => {
        if (loadedLiveKalshi && prev.length > 0) {
          return prev.map((kp) => {
            const match = sleeperByName.get(kp.name.toLowerCase());
            return match && kp.position === 'FLEX'
              ? { ...kp, position: match.position }
              : kp;
          });
        }
        return sleeperPlayers;
      });
    };

    try {
      const cached = sessionStorage.getItem('sleeper_nfl_offensive_players_v1');
      if (cached) {
        const parsed = JSON.parse(cached) as ActivePlayer[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          enrichOrSetPlayers(parsed);
          return;
        }
      }

      const resp = await fetch('https://api.sleeper.app/v1/players/nfl');
      if (resp.ok) {
        const rawPlayers = await resp.json();
        const validPos = new Set(['QB', 'RB', 'WR', 'TE']);
        const ranked: Array<ActivePlayer & { rank: number }> = [];
        for (const [pid, p] of Object.entries<any>(rawPlayers)) {
          if (
            p &&
            p.active &&
            p.team &&
            validPos.has(p.position) &&
            (p.depth_chart_order === 1 || p.depth_chart_order === 2 || (p.search_rank && p.search_rank <= 250))
          ) {
            const fullName =
              p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim();
            if (fullName) {
              ranked.push({
                id: pid,
                name: fullName,
                team: String(p.team),
                position: String(p.position),
                rank: Number(p.search_rank || 9999),
              });
            }
          }
        }
        ranked.sort((a, b) => a.rank - b.rank);
        const topPlayers: ActivePlayer[] = ranked.slice(0, 250).map(({ rank, ...rest }) => rest);
        if (topPlayers.length > 0) {
          try {
            sessionStorage.setItem(
              'sleeper_nfl_offensive_players_v1',
              JSON.stringify(topPlayers)
            );
          } catch {
            // Ignore quota errors
          }
          enrichOrSetPlayers(topPlayers);
        }
      }
    } catch {
      // Keep existing player list if Sleeper player index is unreachable
    }
  };

  useEffect(() => {
    if (!leagueId) return;
    refreshKalshiBoardIfNeeded(false);
  }, [leagueId]);

  // Whenever someone opens the Pick Modal to query odds, refresh if cached data is older than 5 mins
  useEffect(() => {
    if (isPickOpen) {
      refreshKalshiBoardIfNeeded(false);
    }
  }, [isPickOpen]);

  // Listen to browser back/forward navigation
  useEffect(() => {
    const onPopState = () => {
      setLeagueId(getLeagueIdFromLocation(window.location));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateToLeague = (nextLeagueId: string | null) => {
    if (!nextLeagueId) {
      window.history.pushState({}, '', '/');
      setLeagueId(null);
      setRecentLeagues(getRecentLeagues());
      return;
    }
    window.history.pushState({}, '', `/${nextLeagueId}`);
    setLeagueId(nextLeagueId);
    saveRecentLeague(nextLeagueId);
    setRecentLeagues(getRecentLeagues());
  };

  // Restore authenticated session when leagueId changes
  useEffect(() => {
    if (!leagueId) return;
    const session = getSession(leagueId);
    if (session) {
      setCurrentRosterId(session.rosterId);
    } else {
      saveSession(1, DEFAULT_LOCAL_SESSION_TOKEN, leagueId);
      setCurrentRosterId(1);
    }
  }, [leagueId]);

  // Subscribe to Firestore under leagues/{leagueId} and sync real Sleeper data
  useEffect(() => {
    if (!leagueId) return;

    const isDemo = leagueId.toLowerCase() === 'demo';
    setLeagueError(null);

    if (isDemo) {
      setTeams(MOCK_TEAMS);
      setParlay(INITIAL_PARLAY);
      setPastParlays(MOCK_PAST_PARLAYS);
      setLeagueName('Demo Sleeper League');
      setIsLoadingLeague(false);
    } else {
      setIsLoadingLeague(true);
      setPastParlays([]);
    }

    const syncRealSleeperLeague = async (forceSync = false) => {
      try {
        const [leagueRes, rostersRes, usersRes, stateRes] = await Promise.all([
          fetch(`https://api.sleeper.app/v1/league/${leagueId}`),
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`),
          fetch('https://api.sleeper.app/v1/state/nfl').catch(() => null),
        ]);

        if (!leagueRes.ok) {
          throw new Error(`Sleeper league ${leagueId} not found`);
        }

        const leagueInfo = await leagueRes.json();
        const rosters = (await rostersRes.json()) || [];
        const users = (await usersRes.json()) || [];
        const nflState = stateRes && stateRes.ok ? await stateRes.json() : null;

        if (!leagueInfo || !Array.isArray(rosters) || rosters.length === 0) {
          throw new Error(`Sleeper league ${leagueId} has no rosters`);
        }

        const currentWeek = Math.max(
          1,
          Number(nflState?.week || leagueInfo?.settings?.leg || 1)
        );
        const prevWeek = Math.max(1, currentWeek - 1);

        let matchups: Array<{ roster_id: number; points?: number }> = [];
        try {
          const mRes = await fetch(
            `https://api.sleeper.app/v1/league/${leagueId}/matchups/${prevWeek}`
          );
          if (mRes.ok) {
            matchups = (await mRes.json()) || [];
          }
        } catch {
          matchups = [];
        }

        // Build teams & lowest-scoring bettor locally right away
        const userMap = new Map<string, any>();
        for (const u of users) {
          if (u?.user_id) userMap.set(String(u.user_id), u);
        }

        const builtTeams: TeamProfile[] = rosters
          .filter((r: any) => r?.roster_id != null)
          .map((r: any) => {
            const rid = Number(r.roster_id);
            const ownerId = String(r.owner_id || `u${rid}`);
            const u = userMap.get(ownerId) || {};
            const ownerName = u.display_name || u.username || `Owner ${rid}`;
            const teamName = u.metadata?.team_name || `Team ${ownerName}`;
            return {
              roster_id: rid,
              owner_id: ownerId,
              owner_name: ownerName,
              team_name: teamName,
            };
          })
          .sort((a: TeamProfile, b: TeamProfile) => a.roster_id - b.roster_id);

        let lowestRosterId = builtTeams[0]?.roster_id || 1;
        let lowestPoints = 0;
        const validMatchups = matchups.filter(
          (m) => m && m.roster_id != null && typeof m.points === 'number'
        );
        if (validMatchups.length > 0) {
          validMatchups.sort((a, b) => (a.points ?? 0) - (b.points ?? 0));
          lowestRosterId = Number(validMatchups[0].roster_id);
          lowestPoints = Number(validMatchups[0].points ?? 0);
        }
        const bettorTeam =
          builtTeams.find((t) => t.roster_id === lowestRosterId) || builtTeams[0];

        const resolvedSeason = String(
          leagueInfo.season || nflState?.season || new Date().getFullYear()
        );
        const resolvedName = leagueInfo.name || `Sleeper League ${leagueId}`;

        setSeason(resolvedSeason);
        setLeagueName(resolvedName);
        saveRecentLeague(leagueId, resolvedName);
        setRecentLeagues(getRecentLeagues());
        setTeams(builtTeams);

        const freshParlay: WeeklyParlay = {
          week: currentWeek,
          season: resolvedSeason,
          status: 'open',
          contains_sgp: false,
          bettor: {
            roster_id: bettorTeam.roster_id,
            team_name: bettorTeam.team_name,
            owner_name: bettorTeam.owner_name,
            points_last_week: lowestPoints,
          },
          earliest_kickoff: null,
          legs: builtTeams.map((t) => ({
            id: `l_${t.roster_id}`,
            roster_id: t.roster_id,
            team_name: t.team_name,
            owner_name: t.owner_name,
            nfl_team: 'NFL',
            description: 'Must submit own pick before kickoff',
            odds_american: '-110',
            odds_decimal: 1.91,
            status: 'pending' as const,
          })),
          estimated_odds_american: '+100',
          estimated_multiplier: 1.0,
          estimated_payout: 5.0,
          actual_payout: null,
          actual_odds_american: null,
        };

        setParlay((prev) => {
          const hasSubmittedForThisLeague =
            prev.legs.some((l) => l.status === 'submitted') &&
            prev.legs.every((l) => builtTeams.some((t) => t.roster_id === l.roster_id));
          return hasSubmittedForThisLeague ? prev : freshParlay;
        });
        setIsLoadingLeague(false);

        // Persist to Firestore via Cloud Function under leagues/{leagueId}/seasons/{season}
        try {
          const session = getSession(leagueId);
          const initFn = httpsCallable(functions, 'init_or_sync_league');
          await initFn({
            league_id: leagueId,
            season: resolvedSeason,
            force_sync: forceSync,
            session_token: session?.sessionToken || DEFAULT_LOCAL_SESSION_TOKEN,
            sleeper_payload: {
              league_info: leagueInfo,
              season: resolvedSeason,
              current_week: currentWeek,
              rosters,
              users,
              matchups,
            },
          });
        } catch {
          // Functions emulator offline; browser-fetched Sleeper state remains active
        }
      } catch (err: any) {
        setLeagueError(err?.message || `Could not load Sleeper league ${leagueId}`);
        setIsLoadingLeague(false);
      }
    };

    const leagueDocRef = doc(db, 'leagues', leagueId);
    const unsubLeague = onSnapshot(
      leagueDocRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (!isDemo && data?.source !== 'sleeper') {
            if (syncedLeagueRef.current !== `${leagueId}_force`) {
              syncedLeagueRef.current = `${leagueId}_force`;
              syncRealSleeperLeague(true);
            }
            return;
          }
          if (data?.active_season || data?.season) {
            setSeason(String(data.active_season || data.season));
          }
          const name = data?.name || `League ${leagueId}`;
          setLeagueName(name);
          saveRecentLeague(leagueId, name);
          setRecentLeagues(getRecentLeagues());
          setIsLoadingLeague(false);
        } else if (!isDemo) {
          if (syncedLeagueRef.current !== leagueId) {
            syncedLeagueRef.current = leagueId;
            syncRealSleeperLeague(false);
          }
        }
      },
      () => {
        if (!isDemo && syncedLeagueRef.current !== leagueId) {
          syncedLeagueRef.current = leagueId;
          syncRealSleeperLeague(false);
        }
      }
    );

    const unsubTeams = onSnapshot(
      collection(db, 'leagues', leagueId, 'seasons', season, 'teams'),
      (snapshot) => {
        if (!snapshot.empty) {
          const loadedTeams = snapshot.docs
            .map(d => d.data() as TeamProfile)
            .sort((a, b) => a.roster_id - b.roster_id);
          const isStaleMock =
            !isDemo &&
            loadedTeams.some(
              (t) => t.owner_name === 'Alex' && t.team_name === 'Gridiron Gladiators'
            );
          if (!isStaleMock) {
            setTeams(loadedTeams);
          }
        }
      },
      () => {}
    );

    const unsubParlays = onSnapshot(
      collection(db, 'leagues', leagueId, 'seasons', season, 'parlays'),
      async (snapshot) => {
        if (snapshot.empty) {
          if (isDemo && syncedLeagueRef.current !== `demo_${season}`) {
            syncedLeagueRef.current = `demo_${season}`;
            try {
              const session = getSession('demo');
              const initFn = httpsCallable(functions, 'init_or_sync_league');
              await initFn({
                league_id: 'demo',
                season,
                fallback_teams: MOCK_TEAMS,
                fallback_parlays: [INITIAL_PARLAY, ...MOCK_PAST_PARLAYS],
                session_token: session?.sessionToken || DEFAULT_LOCAL_SESSION_TOKEN,
              });
            } catch {
              // Ignore if emulator offline
            }
          } else if (!isDemo && syncedLeagueRef.current !== `${leagueId}_${season}`) {
            syncedLeagueRef.current = `${leagueId}_${season}`;
            syncRealSleeperLeague(false);
          }
          return;
        }

        const allParlays = snapshot.docs
          .map(d => d.data() as WeeklyParlay)
          .sort((a, b) => b.week - a.week);

        const active = allParlays.find(p => p.status === 'open') || allParlays[0];
        const isStaleMockParlay =
          !isDemo &&
          active?.legs?.some(
            (l) => l.owner_name === 'Alex' && l.team_name === 'Gridiron Gladiators'
          );
        if (isStaleMockParlay) {
          return;
        }

        const past = allParlays.filter(p => p.week !== active.week);

        if (active) setParlay(active);
        setPastParlays(past);
        setIsLoadingLeague(false);
      },
      () => {}
    );

    return () => {
      unsubLeague();
      unsubTeams();
      unsubParlays();
    };
  }, [leagueId, season]);

  // Render Landing Page if no leagueId in URL
  if (!leagueId) {
    return (
      <LeagueLandingPage
        onSelectLeague={(id) => navigateToLeague(id)}
        recentLeagues={recentLeagues}
      />
    );
  }

  const currentTeam = teams.find(t => t.roster_id === currentRosterId) || teams[0];

  // Strictly submit pick only for the currently authenticated user's roster_id
  const handlePickSubmit = async (pick: PickData) => {
    const newLeg: ParlayLeg = {
      id: `leg_${currentRosterId}_${Date.now()}`,
      roster_id: currentRosterId,
      team_name: currentTeam.team_name,
      owner_name: currentTeam.owner_name,
      description: pick.description,
      nfl_team: pick.nfl_team,
      odds_american: pick.odds_american,
      odds_decimal: pick.odds_decimal,
      price_cents: pick.price_cents,
      kalshi_market_ticker: pick.kalshi_market_ticker,
      kalshi_side: pick.kalshi_side,
      kickoff_time: pick.kickoff_time,
      game_id: pick.game_id,
      status: 'submitted',
    };

    // Optimistic UI update
    const updatedLegs: ParlayLeg[] = parlay.legs.map(leg =>
      leg.roster_id === currentRosterId ? { ...leg, ...newLeg } : leg
    );
    const stats = calculateParlayStats(updatedLegs, 5.0);

    setParlay(prev => ({
      ...prev,
      legs: updatedLegs,
      estimated_odds_american: stats.odds_american,
      estimated_multiplier: stats.multiplier,
      estimated_payout: stats.estimated_payout,
      combined_probability_cents: stats.combined_probability_cents,
      contains_sgp: stats.contains_sgp,
      earliest_kickoff: stats.earliest_kickoff || prev.earliest_kickoff,
    }));

    // Persist to Firestore via Cloud Function scoped by league_id and season
    try {
      const session = getSession(leagueId);
      const submitFn = httpsCallable(functions, 'submit_leg');
      await submitFn({
        league_id: leagueId,
        season,
        session_token: session?.sessionToken || DEFAULT_LOCAL_SESSION_TOKEN,
        roster_id: currentRosterId,
        week: parlay.week,
        leg: newLeg,
      });
    } catch {
      // Keep optimistic state if running Vite without Functions emulator
    }
  };

  // Switch Team / PIN Login scoped by league_id and season
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authPinInput.length !== 4) {
      alert('Please enter a 4-digit PIN');
      return;
    }

    try {
      const verifyFn = httpsCallable<
        { league_id: string; season: string; roster_id: number; pin: string },
        { session_token: string; roster_id: number }
      >(functions, 'verify_pin_login');
      const res = await verifyFn({
        league_id: leagueId,
        season,
        roster_id: authSelectedRoster,
        pin: authPinInput,
      });
      saveSession(authSelectedRoster, res.data.session_token, leagueId);
    } catch {
      const token = DEFAULT_LOCAL_SESSION_TOKEN;
      saveSession(authSelectedRoster, token, leagueId);
    }

    setCurrentRosterId(authSelectedRoster);
    setIsAuthModalOpen(false);
    setAuthPinInput('');
  };

  return (
    <div className="min-h-screen bg-sleeper-dark text-white selection:bg-sleeper-accent selection:text-black">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-sleeper-card/90 backdrop-blur-md border-b border-sleeper-border px-3 sm:px-4 py-2.5 sm:py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
          {/* Brand Logo & Switch League Trigger */}
          <div className="flex items-center space-x-2.5 min-w-0">
            <button
              type="button"
              onClick={() => navigateToLeague(null)}
              title="Return to League Selection Landing Page"
              className="flex items-center space-x-2 text-left group min-w-0"
            >
              <span className="text-xl shrink-0">🏈</span>
              <div className="min-w-0">
                <h1 className="text-xs sm:text-sm font-black tracking-wider text-white leading-none truncate">
                  Team Parlay Tracker
                </h1>
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigateToLeague(null)}
              aria-label="Switch Sleeper League"
              title={`Current League: ${leagueName} (${leagueId}) — Click to switch`}
              className="px-2 py-1 rounded-lg bg-sleeper-dark border border-sleeper-border text-[10px] font-semibold text-gray-300 hover:text-white hover:border-gray-500 transition inline-flex items-center space-x-1 shrink-0"
            >
              <ArrowLeftRight className="w-3 h-3 text-sleeper-accent" />
              <span className="hidden xs:inline">Switch League</span>
            </button>
          </div>

          {/* Action Pills */}
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => setIsArchiveOpen(true)}
              aria-label="View Past Slips Archive"
              className="min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-0 px-2.5 sm:px-3 py-1.5 rounded-xl bg-sleeper-dark border border-sleeper-border text-xs font-semibold text-gray-300 hover:text-white hover:border-gray-500 transition flex items-center justify-center space-x-1.5 active:scale-95 shadow-sm"
              title="Past Slips Archive"
            >
              <History className="w-4 h-4 text-sleeper-accent shrink-0" />
              <span className="hidden sm:inline">Archive</span>
            </button>

            <button
              onClick={() => {
                setAuthSelectedRoster(currentRosterId);
                setIsAuthModalOpen(true);
              }}
              aria-label={`Switch Team: currently authenticated as ${currentTeam.owner_name}`}
              className="min-h-[40px] sm:min-h-[36px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-sleeper-accent/15 border border-sleeper-accent/40 text-xs font-bold text-sleeper-accent hover:bg-sleeper-accent/25 transition flex items-center space-x-1.5 active:scale-95 shadow-sm"
              title="Click to Switch Team / Re-Auth"
            >
              <UserCheck className="w-4 h-4 shrink-0" />
              <span className="truncate max-w-[70px] xs:max-w-[100px] sm:max-w-[140px] md:max-w-none">
                {currentTeam.owner_name}
              </span>
              <span className="hidden sm:inline text-sleeper-accent/70 font-normal">
                ({currentTeam.team_name})
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container (Single-Column Feed) */}
      <main className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 pb-20">
        {leagueError && (
          <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs sm:text-sm text-red-300 flex items-center justify-between">
            <span>{leagueError}</span>
            <button
              type="button"
              onClick={() => navigateToLeague(null)}
              className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-white font-bold text-xs transition"
            >
              Change League ID
            </button>
          </div>
        )}
        {isLoadingLeague && (
          <div className="mb-4 p-3 rounded-xl bg-sleeper-card border border-sleeper-border text-xs text-gray-300 flex items-center space-x-2">
            <span className="animate-spin">⏳</span>
            <span>Syncing Sleeper league {leagueId}...</span>
          </div>
        )}
        {/* Weekly Bettor Spotlight */}
        <BettorBanner parlay={parlay} />

        {/* Unified Single-Column Parlay Slip */}
        <ParlayCard
          parlay={parlay}
          currentRosterId={currentRosterId}
          onOpenPickModal={(leg) => {
            if (leg.roster_id === currentRosterId) {
              setIsPickOpen(true);
            }
          }}
          oddsFormat={oddsFormat}
          onToggleOddsFormat={handleToggleOddsFormat}
        />
      </main>

      {/* Interactive Modals */}
      <PickModal
        isOpen={isPickOpen}
        onClose={() => setIsPickOpen(false)}
        onSubmitPick={handlePickSubmit}
        rosterName={currentTeam.team_name}
        activePlayers={activePlayers}
        kalshiGames={kalshiGames}
        kalshiProps={kalshiProps}
        liveMarketCount={liveMarketCount}
        oddsFormat={oddsFormat}
        onToggleOddsFormat={handleToggleOddsFormat}
        currentLeg={parlay.legs.find(l => l.roster_id === currentRosterId)}
      />

      <PastSlipsArchive
        isOpen={isArchiveOpen}
        onClose={() => setIsArchiveOpen(false)}
        pastParlays={pastParlays}
      />

      {/* Team / PIN Authentication Switcher Modal */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-sleeper-card border border-sleeper-border rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center px-5 py-4 border-b border-sleeper-border">
              <div className="flex items-center space-x-2">
                <KeyRound className="w-5 h-5 text-sleeper-accent" />
                <h3 className="text-sm font-bold text-white">Select Team & Enter PIN</h3>
              </div>
              <button
                onClick={() => setIsAuthModalOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleLoginSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">
                  Your Fantasy Team
                </label>
                <select
                  value={authSelectedRoster}
                  onChange={(e) => setAuthSelectedRoster(parseInt(e.target.value, 10))}
                  className="w-full bg-sleeper-dark border border-sleeper-border rounded-lg p-2.5 text-xs text-white"
                >
                  {teams.map(t => (
                    <option key={t.roster_id} value={t.roster_id}>
                      {t.team_name} ({t.owner_name}){' '}
                      {t.roster_id === parlay.bettor.roster_id ? '👑 Bettor' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">
                  4-Digit Security PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  placeholder="••••"
                  value={authPinInput}
                  onChange={(e) => setAuthPinInput(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-sleeper-dark border border-sleeper-border rounded-lg p-2.5 text-center text-lg tracking-widest font-mono text-white focus:border-sleeper-accent focus:outline-none"
                />
                <span className="block text-[10px] text-sleeper-muted mt-1 text-center">
                  (Default local emulator PIN: <strong>1234</strong>)
                </span>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-sleeper-accent text-black font-extrabold rounded-xl text-xs hover:brightness-110 transition"
              >
                Authenticate & Set Session
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
