import React, { useState, useEffect, useRef } from 'react';
import {
  History,
  ArrowLeftRight,
  UserCheck,
  LogOut,
  ShieldCheck,
  Menu,
  LogIn,
} from 'lucide-react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { BettorBanner } from './components/BettorBanner';
import { ParlayCard } from './components/ParlayCard';
import { PickModal, PickData } from './components/PickModal';
import { PastSlipsArchive } from './components/PastSlipsArchive';
import { PrivacyModal } from './components/PrivacyModal';
import { LeagueLandingPage } from './components/LeagueLandingPage';
import { LeagueSkeleton } from './components/LeagueSkeleton';
import { SignInGate } from './components/SignInGate';
import { TeamPickerModal } from './components/TeamPickerModal';
import { WeeklyParlay, ActivePlayer, TeamProfile, ParlayLeg, GameLineOption } from './types';
import {
  fetchDirectKalshiNflBoard,
  KALSHI_BOARD_CACHE_TTL_MS,
} from './services/kalshi';
import {
  useAuthUser,
  signInWithGoogle,
  signOutUser,
  saveCachedTeamId,
  getCachedTeamId,
  getLeagueIdFromLocation,
  parseStatusRouteFromLocation,
  getRecentLeagues,
  saveRecentLeague,
  RecentLeague,
} from './services/auth';
import {
  LeagueStatusPage,
  buildSanitizedStatusPayload,
} from './components/LeagueStatusPage';
import { db, functions } from './services/firebase';
import { calculateParlayStats, OddsFormat } from './utils/parlayMath';

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
export const MOCK_PAST_PARLAYS: WeeklyParlay[] = [
  {
    week: 3,
    season: '2026',
    status: 'won',
    outcome: 'won',
    settlement_status: 'finalized',
    settled_at: '2026-09-22T04:00:00Z',
    contains_sgp: false,
    bettor: {
      roster_id: 4,
      team_name: 'Buffalo Stampede',
      owner_name: 'Charlie',
      points_last_week: 82.1,
    },
    earliest_kickoff: '2026-09-17T20:15:00Z',
    legs: [
      { id: 'p3_1', roster_id: 1, team_name: 'Philly Special', owner_name: 'Blake', nfl_team: 'PHI', description: 'Jalen Hurts (PHI) • 2+ Passing TDs (YES)', odds_american: '-117', odds_decimal: 1.8519, price_cents: 54, status: 'won', outcome: 'won', settled_at: '2026-09-21T03:30:00Z' },
      { id: 'p3_2', roster_id: 2, team_name: 'Gridiron Clowns', owner_name: 'Bob', nfl_team: 'KC', description: 'Patrick Mahomes (KC) • 250+ Pass Yards (YES)', odds_american: '-113', odds_decimal: 1.8868, price_cents: 53, status: 'won', outcome: 'won', settled_at: '2026-09-21T03:30:00Z' },
      { id: 'p3_3', roster_id: 3, team_name: 'Motor City Kitties', owner_name: 'Alice', nfl_team: 'DET', description: 'DET -3.5 Spread', odds_american: '-113', odds_decimal: 1.8868, price_cents: 53, status: 'won', outcome: 'won', settled_at: '2026-09-21T03:30:00Z' },
      { id: 'p3_4', roster_id: 4, team_name: 'Buffalo Stampede', owner_name: 'Charlie', nfl_team: 'BUF', description: 'Josh Allen (BUF) • Anytime TD (1+) (YES)', odds_american: '+122', odds_decimal: 2.2222, price_cents: 45, status: 'won', outcome: 'won', settled_at: '2026-09-21T03:30:00Z' },
      { id: 'p3_5', roster_id: 5, team_name: 'Lone Star Dynasty', owner_name: 'Dave', nfl_team: 'DAL', description: 'DAL Winner (Moneyline)', odds_american: '-122', odds_decimal: 1.8182, price_cents: 55, status: 'won', outcome: 'won', settled_at: '2026-09-21T03:30:00Z' },
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
    status: 'lost',
    outcome: 'lost',
    settlement_status: 'finalized',
    settled_at: '2026-09-15T04:00:00Z',
    contains_sgp: true,
    bettor: {
      roster_id: 1,
      team_name: 'Philly Special',
      owner_name: 'Blake',
      points_last_week: 79.5,
    },
    earliest_kickoff: '2026-09-10T20:15:00Z',
    legs: [
      { id: 'p2_1', roster_id: 1, team_name: 'Philly Special', owner_name: 'Blake', nfl_team: 'BAL', game_id: 'KXNFL-26SEP10-BAL', description: 'Derrick Henry (BAL) • Anytime TD (1+) (YES)', odds_american: '-138', odds_decimal: 1.7241, price_cents: 58, status: 'won', outcome: 'won', settled_at: '2026-09-14T03:00:00Z' },
      { id: 'p2_2', roster_id: 2, team_name: 'Gridiron Clowns', owner_name: 'Bob', nfl_team: 'KC', description: 'Travis Kelce (KC) • Anytime TD (1+) (YES)', odds_american: '+108', odds_decimal: 2.0833, price_cents: 48, status: 'lost', outcome: 'lost', settled_at: '2026-09-14T03:00:00Z' },
      { id: 'p2_3', roster_id: 3, team_name: 'Motor City Kitties', owner_name: 'Alice', nfl_team: 'DET', description: 'Jahmyr Gibbs (DET) • 50+ Rush Yards (YES)', odds_american: '-117', odds_decimal: 1.8519, price_cents: 54, status: 'won', outcome: 'won', settled_at: '2026-09-14T03:00:00Z' },
      { id: 'p2_4', roster_id: 4, team_name: 'Buffalo Stampede', owner_name: 'Charlie', nfl_team: 'BAL', game_id: 'KXNFL-26SEP10-BAL', description: 'Lamar Jackson (BAL) • 50+ Rush Yards (YES)', odds_american: '-108', odds_decimal: 1.9231, price_cents: 52, status: 'won', outcome: 'won', settled_at: '2026-09-14T03:00:00Z' },
      { id: 'p2_5', roster_id: 5, team_name: 'Lone Star Dynasty', owner_name: 'Dave', nfl_team: 'DAL', description: 'CeeDee Lamb (DAL) • Anytime TD (1+) (YES)', odds_american: '+104', odds_decimal: 2.0408, price_cents: 49, status: 'won', outcome: 'won', settled_at: '2026-09-14T03:00:00Z' },
    ],
    estimated_odds_american: '+2510',
    estimated_multiplier: 26.10,
    estimated_payout: 130.50,
    combined_probability_cents: 4,
    actual_payout: null,
    actual_odds_american: '+2510',
  },
  {
    week: 1,
    season: '2026',
    status: 'won',
    outcome: 'won',
    settlement_status: 'finalized',
    settled_at: '2026-09-08T04:00:00Z',
    contains_sgp: false,
    bettor: {
      roster_id: 3,
      team_name: 'Motor City Kitties',
      owner_name: 'Alice',
      points_last_week: 74.2,
    },
    earliest_kickoff: '2026-09-03T20:15:00Z',
    legs: [
      { id: 'p1_1', roster_id: 1, team_name: 'Philly Special', owner_name: 'Blake', nfl_team: 'PHI', description: 'A.J. Brown (PHI) • 50+ Receiving Yards (YES)', odds_american: '-125', odds_decimal: 1.8, price_cents: 55, status: 'won', outcome: 'won', settled_at: '2026-09-07T03:00:00Z' },
      { id: 'p1_2', roster_id: 2, team_name: 'Gridiron Clowns', owner_name: 'Bob', nfl_team: 'KC', description: 'Patrick Mahomes (KC) • 200+ Pass Yards (YES)', odds_american: '-150', odds_decimal: 1.6667, price_cents: 60, status: 'won', outcome: 'won', settled_at: '2026-09-06T03:00:00Z' },
      { id: 'p1_3', roster_id: 4, team_name: 'Buffalo Stampede', owner_name: 'Charlie', nfl_team: 'SF', description: 'Christian McCaffrey (SF) • Anytime TD (1+) (YES)', odds_american: '-135', odds_decimal: 1.7407, price_cents: 57, status: 'voided', outcome: 'void', settled_at: '2026-09-07T23:00:00Z' },
      { id: 'p1_4', roster_id: 5, team_name: 'Lone Star Dynasty', owner_name: 'Dave', nfl_team: 'DET', description: 'Sam LaPorta (DET) • 40+ Receiving Yards (YES)', odds_american: '-110', odds_decimal: 1.9091, price_cents: 52, status: 'won', outcome: 'won', settled_at: '2026-09-07T03:00:00Z' },
    ],
    estimated_odds_american: '+1200',
    estimated_multiplier: 13.0,
    estimated_payout: 65.00,
    actual_multiplier: 8.5,
    actual_payout: 42.50,
    actual_odds_american: '+750',
    combined_probability_cents: 8,
  },
];

export const EMPTY_PARLAY: WeeklyParlay = {
  week: 1,
  season: String(new Date().getFullYear()),
  status: 'open',
  contains_sgp: false,
  isRealDataLoaded: false,
  bettor: {
    roster_id: 0,
    team_name: '',
    owner_name: '',
    points_last_week: 0,
  },
  earliest_kickoff: null,
  legs: [],
  estimated_odds_american: '+100',
  estimated_multiplier: 1.0,
  estimated_payout: 5.0,
  actual_payout: null,
  actual_odds_american: null,
};

export interface SyncFirestoreTeamsOptions {
  snapshotDocs: Array<{ data: () => any }>;
  isDemo: boolean;
  currentUser: { uid: string } | null;
  currentRosterId: number | null;
  setTeams: (teams: TeamProfile[]) => void;
  setCurrentRosterId: (rosterId: number) => void;
  saveCachedTeamIdFn?: (leagueId: string, rosterId: number, uid: string) => void;
  leagueId: string;
}

export function handleTeamsSnapshot({
  snapshotDocs,
  isDemo,
  currentUser,
  currentRosterId,
  setTeams,
  setCurrentRosterId,
  saveCachedTeamIdFn = saveCachedTeamId,
  leagueId,
}: SyncFirestoreTeamsOptions): boolean {
  if (!snapshotDocs || snapshotDocs.length === 0) return false;
  const loadedTeams = snapshotDocs
    .map((d) => d.data() as TeamProfile)
    .sort((a, b) => a.roster_id - b.roster_id);
  const isStaleMock =
    !isDemo &&
    loadedTeams.some(
      (t) => t.owner_name === 'Alex' && t.team_name === 'Gridiron Gladiators'
    );
  if (isStaleMock) return false;

  setTeams(loadedTeams);
  if (currentUser && currentRosterId === null) {
    const myTeam = loadedTeams.find((t) => t.claimed_by?.uid === currentUser.uid);
    if (myTeam) {
      setCurrentRosterId(myTeam.roster_id);
      saveCachedTeamIdFn(leagueId, myTeam.roster_id, currentUser.uid);
    }
  }
  return true;
}

export interface ResolveTeamOptions {
  leagueId: string;
  user: { uid: string } | null;
  teams: TeamProfile[];
  getMyTeamFn?: (params: { league_id: string }) => Promise<{ data: { roster_id: number | null } | null }>;
  getCachedTeamIdFn?: (leagueId: string, uid?: string) => number | null;
}

export async function resolveUserTeam({
  leagueId,
  user,
  teams,
  getMyTeamFn,
  getCachedTeamIdFn = getCachedTeamId,
}: ResolveTeamOptions): Promise<{ rosterId: number | null; openPicker: boolean }> {
  if (!user || !leagueId) {
    return { rosterId: null, openPicker: false };
  }

  // 1. Check get_my_team from server
  if (getMyTeamFn) {
    try {
      const res = await getMyTeamFn({ league_id: leagueId });
      if (res?.data && res.data.roster_id != null) {
        return { rosterId: Number(res.data.roster_id), openPicker: false };
      }
    } catch {
      // Functions offline, continue
    }
  }

  // 2. Check if any team in loaded list is claimed by user
  const claimedTeam = teams.find((t) => t.claimed_by && t.claimed_by.uid === user.uid);
  if (claimedTeam) {
    return { rosterId: claimedTeam.roster_id, openPicker: false };
  }

  // 3. Check user-scoped cached team ID in localStorage
  const cached = getCachedTeamIdFn(leagueId, user.uid);
  if (cached != null) {
    const isValidInTeams = teams.length === 0 || teams.some((t) => t.roster_id === cached);
    if (isValidInTeams) {
      return { rosterId: cached, openPicker: false };
    }
  }

  // 4. Default: User has no claimed or cached team
  // Do NOT set currentRosterId to 1. Leave as null and open team picker modal.
  return { rosterId: null, openPicker: true };
}

export interface SubmitPickOptions {
  currentRosterId: number;
  currentTeam: TeamProfile;
  pick: PickData;
  parlay: WeeklyParlay;
  isClaimedByOther?: boolean;
  user?: { uid: string; displayName?: string | null; photoURL?: string | null } | null;
  isDemo?: boolean;
  leagueId: string;
  season: string;
  submitFn?: (params: any) => Promise<any>;
}

export async function submitPickToParlay({
  currentRosterId,
  currentTeam,
  pick,
  parlay,
  isClaimedByOther = false,
  user = null,
  isDemo = false,
  leagueId,
  season,
  submitFn,
}: SubmitPickOptions): Promise<{
  updatedParlay: WeeklyParlay;
  newLeg: ParlayLeg;
  calledSubmitFn: boolean;
}> {
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
    last_edited_by: user
      ? {
          uid: user.uid,
          name: user.displayName || 'Manager',
          photo_url: user.photoURL || undefined,
        }
      : (isDemo ? { uid: 'demo_user', name: 'Demo Manager' } : undefined),
    last_edited_at: new Date().toISOString(),
    edited_by_non_claimer: isClaimedByOther,
  };

  const updatedLegs: ParlayLeg[] = parlay.legs.map((leg) =>
    leg.roster_id === currentRosterId ? { ...leg, ...newLeg } : leg
  );
  const stats = calculateParlayStats(updatedLegs, 5.0);

  const updatedParlay: WeeklyParlay = {
    ...parlay,
    legs: updatedLegs,
    estimated_odds_american: stats.odds_american,
    estimated_multiplier: stats.multiplier,
    estimated_payout: stats.estimated_payout,
    combined_probability_cents: stats.combined_probability_cents,
    contains_sgp: stats.contains_sgp,
    earliest_kickoff: stats.earliest_kickoff || parlay.earliest_kickoff,
  };

  if (isDemo) {
    return { updatedParlay, newLeg, calledSubmitFn: false };
  }

  if (submitFn) {
    await submitFn({
      league_id: leagueId,
      season,
      roster_id: currentRosterId,
      week: parlay.week,
      leg: newLeg,
    });
    return { updatedParlay, newLeg, calledSubmitFn: true };
  }

  return { updatedParlay, newLeg, calledSubmitFn: false };
}

export const App: React.FC = () => {
  const { user, loading: authLoading } = useAuthUser();

  // URL-based League ID State
  const [leagueId, setLeagueId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? getLeagueIdFromLocation(window.location) : null
  );
  const statusRoute =
    typeof window !== 'undefined'
      ? parseStatusRouteFromLocation(window.location)
      : { isStatusRoute: false, leagueId: null, week: null, format: 'html' as const };
  const [leagueName, setLeagueName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const initialId = getLeagueIdFromLocation(window.location);
      if (initialId && initialId.toLowerCase() === 'demo') {
        return 'Demo Sleeper League';
      }
    }
    return 'Sleeper League';
  });
  const [recentLeagues, setRecentLeagues] = useState<RecentLeague[]>(() =>
    getRecentLeagues()
  );

  // League Data State
  const [season, setSeason] = useState<string>(() => String(new Date().getFullYear()));
  const [teams, setTeams] = useState<TeamProfile[]>(() => {
    if (typeof window !== 'undefined') {
      const initialId = getLeagueIdFromLocation(window.location);
      if (initialId && initialId.toLowerCase() === 'demo') {
        return MOCK_TEAMS;
      }
    }
    return [];
  });
  const [currentRosterId, setCurrentRosterId] = useState<number | null>(() => {
    if (typeof window !== 'undefined') {
      const lid = getLeagueIdFromLocation(window.location);
      if (lid) {
        if (lid.toLowerCase() === 'demo') {
          return getCachedTeamId('demo', user?.uid || 'demo_user');
        }
        if (user) {
          return getCachedTeamId(lid, user.uid);
        }
      }
    }
    return null;
  });
  const userRef = useRef(user);
  userRef.current = user;
  const currentRosterIdRef = useRef(currentRosterId);
  currentRosterIdRef.current = currentRosterId;
  const [parlay, setParlay] = useState<WeeklyParlay>(() => {
    if (typeof window !== 'undefined') {
      const initialId = getLeagueIdFromLocation(window.location);
      if (initialId && initialId.toLowerCase() === 'demo') {
        return { ...INITIAL_PARLAY, isRealDataLoaded: true };
      }
    }
    return EMPTY_PARLAY;
  });
  const parlayRef = useRef(parlay);
  parlayRef.current = parlay;
  const [pastParlays, setPastParlays] = useState<WeeklyParlay[]>(() => {
    if (typeof window !== 'undefined') {
      const initialId = getLeagueIdFromLocation(window.location);
      if (initialId && initialId.toLowerCase() === 'demo') {
        return MOCK_PAST_PARLAYS;
      }
    }
    return [];
  });
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
  const [isLoadingLeague, setIsLoadingLeague] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const initialId = getLeagueIdFromLocation(window.location);
      return Boolean(initialId && initialId.toLowerCase() !== 'demo');
    }
    return false;
  });
  const [leagueError, setLeagueError] = useState<string | null>(null);
  const syncedLeagueRef = useRef<string | null>(null);
  const currentStoredWeekRef = useRef<number | null>(null);
  const liveNflWeekRef = useRef<number | null>(null);

  // Modals & Live Kalshi / Sleeper Player Board State
  const [isPickOpen, setIsPickOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isTeamPickerOpen, setIsTeamPickerOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const [activePlayers, setActivePlayers] = useState<ActivePlayer[]>(MOCK_ACTIVE_PLAYERS);
  const [kalshiGames, setKalshiGames] = useState<GameLineOption[]>([]);
  const [kalshiProps, setKalshiProps] = useState<any[]>([]);
  const [liveMarketCount, setLiveMarketCount] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [maxLegOddsPercent, setMaxLegOddsPercent] = useState<number | null>(null);
  const lastKalshiFetchRef = useRef<number>(0);

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    if (isProfileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileMenuOpen]);

  // Load live Kalshi NFL markets & Sleeper active NFL players
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
      if (loadedLiveKalshi || (board.live_market_count && board.live_market_count > 0)) {
        const serverTs = board.updated_at ? Date.parse(board.updated_at) : NaN;
        const ts = !Number.isNaN(serverTs) ? serverTs : Date.now();
        lastKalshiFetchRef.current = ts;
        setLastUpdated(new Date(ts));
      }
    };

    // 1a. Try Cloud Function get_kalshi_nfl_markets
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
          max_leg_odds_percent?: number | null;
        }
      >(functions, 'get_kalshi_nfl_markets');
      const res = await kalshiFn({});
      if (res.data) {
        applyBoard(res.data);
        if (res.data.max_leg_odds_percent !== undefined) {
          setMaxLegOddsPercent(res.data.max_leg_odds_percent);
        }
      }
    } catch {
      // Fallback to direct Kalshi fetch below
    }

    // 1b. Fallback direct Kalshi fetch
    if (!loadedLiveKalshi) {
      try {
        const directBoard = await fetchDirectKalshiNflBoard(force);
        applyBoard(directBoard);
      } catch {
        // Ignore if offline
      }
    }

    // 2. Enrich positions from Sleeper
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
      // Keep existing player list
    }
  };

  useEffect(() => {
    if (!leagueId || statusRoute.isStatusRoute) return;
    refreshKalshiBoardIfNeeded(false);
  }, [leagueId, statusRoute.isStatusRoute]);

  useEffect(() => {
    if (isPickOpen && !statusRoute.isStatusRoute) {
      refreshKalshiBoardIfNeeded(false);
    }
  }, [isPickOpen, statusRoute.isStatusRoute]);

  // Listen to browser back/forward navigation
  useEffect(() => {
    const onPopState = () => {
      const nextId = getLeagueIdFromLocation(window.location);
      const isNextDemo = nextId?.toLowerCase() === 'demo';
      setLeagueId(nextId);
      setIsLoadingLeague(Boolean(nextId && !isNextDemo));
      if (nextId && !isNextDemo) {
        setTeams([]);
        setParlay(EMPTY_PARLAY);
        setPastParlays([]);
      } else if (nextId && isNextDemo) {
        setTeams(MOCK_TEAMS);
        setParlay({ ...INITIAL_PARLAY, isRealDataLoaded: true });
        setPastParlays(MOCK_PAST_PARLAYS);
      } else {
        setTeams([]);
        setParlay(EMPTY_PARLAY);
        setPastParlays([]);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateToLeague = (nextLeagueId: string | null) => {
    if (!nextLeagueId) {
      window.history.pushState({}, '', '/');
      setLeagueId(null);
      setIsLoadingLeague(false);
      setTeams([]);
      setParlay(EMPTY_PARLAY);
      setPastParlays([]);
      setRecentLeagues(getRecentLeagues());
      return;
    }
    window.history.pushState({}, '', `/${nextLeagueId}`);
    const isNextDemo = nextLeagueId.toLowerCase() === 'demo';
    setIsLoadingLeague(!isNextDemo);
    if (!isNextDemo) {
      setTeams([]);
      setParlay(EMPTY_PARLAY);
      setPastParlays([]);
    } else {
      setTeams(MOCK_TEAMS);
      setParlay({ ...INITIAL_PARLAY, isRealDataLoaded: true });
      setPastParlays(MOCK_PAST_PARLAYS);
    }
    setLeagueId(nextLeagueId);
    saveRecentLeague(nextLeagueId);
    setRecentLeagues(getRecentLeagues());
  };

  // Retrieve user's saved team on sign-in / league change
  useEffect(() => {
    if (!leagueId) {
      setCurrentRosterId(null);
      currentRosterIdRef.current = null;
      return;
    }

    const isDemo = leagueId.toLowerCase() === 'demo';

    if (isDemo && !user) {
      const cached = getCachedTeamId('demo', 'demo_user');
      if (cached !== null) {
        setCurrentRosterId(cached);
        currentRosterIdRef.current = cached;
      } else {
        setCurrentRosterId(null);
        currentRosterIdRef.current = null;
      }
      return;
    }

    if (!user) {
      setCurrentRosterId(null);
      currentRosterIdRef.current = null;
      return;
    }

    let isMounted = true;

    const resolveTeam = async () => {
      const getMyTeamFn = httpsCallable<
        { league_id: string },
        { roster_id: number | null; season: string | null } | null
      >(functions, 'get_my_team');

      const result = await resolveUserTeam({
        leagueId,
        user,
        teams,
        getMyTeamFn: isDemo ? undefined : ((p) => getMyTeamFn(p) as any),
        getCachedTeamIdFn: getCachedTeamId,
      });

      if (!isMounted) return;

      if (result.rosterId !== null) {
        setCurrentRosterId(result.rosterId);
        currentRosterIdRef.current = result.rosterId;
        saveCachedTeamId(leagueId, result.rosterId, user.uid);
      } else {
        setCurrentRosterId(null);
        currentRosterIdRef.current = null;
        if (result.openPicker) {
          setIsTeamPickerOpen(true);
        }
      }
    };

    resolveTeam();

    return () => {
      isMounted = false;
    };
  }, [leagueId, user]);

  // Subscribe to Firestore under leagues/{leagueId} and sync real Sleeper data
  useEffect(() => {
    if (!leagueId) return;

    const isDemo = leagueId.toLowerCase() === 'demo';
    setLeagueError(null);

    if (isDemo) {
      setTeams(MOCK_TEAMS);
      setParlay({ ...INITIAL_PARLAY, isRealDataLoaded: true });
      setPastParlays(MOCK_PAST_PARLAYS);
      setLeagueName('Demo Sleeper League');
      setIsLoadingLeague(false);
      return () => {};
    }

    setIsLoadingLeague(true);
    setTeams((prev) => (prev === MOCK_TEAMS ? [] : prev));
    setParlay((prev) =>
      prev.legs.some((l) => l.id === 'l1' && l.owner_name === 'Blake') ? EMPTY_PARLAY : prev
    );
    setPastParlays([]);

    const syncRealSleeperLeague = async (forceSync = false) => {
      if (statusRoute.isStatusRoute) {
        setIsLoadingLeague(false);
        return;
      }
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
          Number(nflState?.week || 0),
          Number(leagueInfo?.settings?.leg || 0),
          1
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
          isRealDataLoaded: true,
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
          const isPrevDemo = prev.legs.some((l) => l.id === 'l1' && l.owner_name === 'Blake');
          const hasSubmittedForThisLeague =
            !isPrevDemo &&
            Boolean(prev.isRealDataLoaded) &&
            prev.legs.length > 0 &&
            prev.legs.some((l) => l.status === 'submitted') &&
            prev.legs.every((l) => builtTeams.some((t) => t.roster_id === l.roster_id));
          return hasSubmittedForThisLeague
            ? { ...prev, isRealDataLoaded: true }
            : freshParlay;
        });
        setIsLoadingLeague(false);

        // Persist to Firestore via Cloud Function
        try {
          const initFn = httpsCallable(functions, 'init_or_sync_league');
          await initFn({
            league_id: leagueId,
            season: resolvedSeason,
            force_sync: forceSync,
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
          // Functions emulator offline
        }
      } catch (err: any) {
        setLeagueError(err?.message || `Could not load Sleeper league ${leagueId}`);
        setIsLoadingLeague(false);
      }
    };

    let isSubscribed = true;

    // Check live NFL week directly from Sleeper so transitions to a new week are caught immediately
    if (!isDemo && !statusRoute.isStatusRoute) {
      fetch('https://api.sleeper.app/v1/state/nfl')
        .then((res) => (res.ok ? res.json() : null))
        .then((nflState) => {
          if (!isSubscribed || !nflState?.week) return;
          const liveWeek = Number(nflState.week);
          liveNflWeekRef.current = liveWeek;

          const highestKnownWeek = Math.max(
            currentStoredWeekRef.current || 0,
            parlayRef.current?.week || 0
          );
          if (highestKnownWeek > 0 && highestKnownWeek < liveWeek) {
            const weekSyncKey = `${leagueId}_week_${liveWeek}_${authKey}`;
            if (syncedLeagueRef.current !== weekSyncKey) {
              syncedLeagueRef.current = weekSyncKey;
              syncRealSleeperLeague(true);
            }
          }
        })
        .catch(() => {});
    }

    const authKey = user?.uid || 'anon';
    const leagueDocRef = doc(db, 'leagues', leagueId);
    const unsubLeague = onSnapshot(
      leagueDocRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const storedWeek = Number(data?.current_week || 0);
          currentStoredWeekRef.current = storedWeek;

          const liveWeek = liveNflWeekRef.current;
          if (!isDemo && !statusRoute.isStatusRoute && liveWeek && storedWeek > 0 && storedWeek < liveWeek) {
            const weekSyncKey = `${leagueId}_week_${liveWeek}_${authKey}`;
            if (syncedLeagueRef.current !== weekSyncKey) {
              syncedLeagueRef.current = weekSyncKey;
              syncRealSleeperLeague(true);
              return;
            }
          }

          if (!isDemo && !statusRoute.isStatusRoute && data?.source !== 'sleeper') {
            const forceKey = `${leagueId}_force_${authKey}`;
            if (syncedLeagueRef.current !== forceKey) {
              syncedLeagueRef.current = forceKey;
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
        } else if (!isDemo) {
          if (statusRoute.isStatusRoute) {
            setIsLoadingLeague(false);
          } else {
            const leagueKey = `${leagueId}_${authKey}`;
            if (syncedLeagueRef.current !== leagueKey) {
              syncedLeagueRef.current = leagueKey;
              syncRealSleeperLeague(false);
            }
          }
        }
      },
      () => {
        if (statusRoute.isStatusRoute) {
          setIsLoadingLeague(false);
        } else {
          const leagueKey = `${leagueId}_${authKey}`;
          if (!isDemo && syncedLeagueRef.current !== leagueKey) {
            syncedLeagueRef.current = leagueKey;
            syncRealSleeperLeague(false);
          }
        }
      }
    );

    const unsubTeams = onSnapshot(
      collection(db, 'leagues', leagueId, 'seasons', season, 'teams'),
      (snapshot) => {
        if (!snapshot.empty) {
          const currentUser = user || userRef.current;
          const currentId = currentRosterId ?? currentRosterIdRef.current;
          handleTeamsSnapshot({
            snapshotDocs: snapshot.docs,
            isDemo,
            currentUser,
            currentRosterId: currentId,
            setTeams,
            setCurrentRosterId: (rid) => {
              setCurrentRosterId(rid);
              currentRosterIdRef.current = rid;
            },
            saveCachedTeamIdFn: saveCachedTeamId,
            leagueId,
          });
        }
      },
      () => {}
    );

    const unsubParlays = onSnapshot(
      collection(db, 'leagues', leagueId, 'seasons', season, 'parlays'),
      async (snapshot) => {
        if (snapshot.empty) {
          const demoKey = `demo_${season}_${authKey}`;
          const parlaySyncKey = `${leagueId}_${season}_${authKey}`;
          if (isDemo && syncedLeagueRef.current !== demoKey) {
            syncedLeagueRef.current = demoKey;
            try {
              const initFn = httpsCallable(functions, 'init_or_sync_league');
              await initFn({
                league_id: 'demo',
                season,
                fallback_teams: MOCK_TEAMS,
                fallback_parlays: [INITIAL_PARLAY, ...MOCK_PAST_PARLAYS],
              });
            } catch {
              // Ignore if emulator offline
            }
          } else if (!isDemo && syncedLeagueRef.current !== parlaySyncKey) {
            syncedLeagueRef.current = parlaySyncKey;
            syncRealSleeperLeague(false);
          }
          return;
        }

        const allParlays = snapshot.docs
          .map(d => d.data() as WeeklyParlay)
          .sort((a, b) => b.week - a.week);

        const liveWeek = liveNflWeekRef.current;
        const highestParlayWeek = allParlays[0]?.week || 0;
        if (!isDemo && !statusRoute.isStatusRoute && liveWeek && highestParlayWeek > 0 && highestParlayWeek < liveWeek) {
          const weekSyncKey = `${leagueId}_week_${liveWeek}_${authKey}`;
          if (syncedLeagueRef.current !== weekSyncKey) {
            syncedLeagueRef.current = weekSyncKey;
            syncRealSleeperLeague(true);
            return;
          }
        }

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

        if (active) setParlay({ ...active, isRealDataLoaded: true });
        setPastParlays(past);
        setIsLoadingLeague(false);
      },
      () => {}
    );

    return () => {
      isSubscribed = false;
      unsubLeague();
      unsubTeams();
      unsubParlays();
    };
  }, [leagueId, season, user?.uid, statusRoute.isStatusRoute]);

  // Render Landing Page if no leagueId in URL
  if (!leagueId) {
    return (
      <>
        <LeagueLandingPage
          onSelectLeague={(id) => navigateToLeague(id)}
          recentLeagues={recentLeagues}
          onOpenPrivacy={() => setIsPrivacyOpen(true)}
        />
        <PrivacyModal
          isOpen={isPrivacyOpen}
          onClose={() => setIsPrivacyOpen(false)}
        />
      </>
    );
  }

  const isDemo = leagueId?.toLowerCase() === 'demo';
  const isRealLeagueLoading =
    !isDemo &&
    Boolean(leagueId) &&
    !leagueError &&
    (isLoadingLeague || !parlay.isRealDataLoaded);

  const currentTeam =
    currentRosterId !== null
      ? teams.find((t) => t.roster_id === currentRosterId) || null
      : null;
  const isClaimedByOther = Boolean(
    currentTeam?.claimed_by && user && currentTeam.claimed_by.uid !== user.uid
  );

  // Submit pick for currently selected fantasy team
  const handlePickSubmit = async (pick: PickData) => {
    if (currentRosterId === null || !currentTeam) {
      setIsTeamPickerOpen(true);
      return;
    }

    const previousParlay = parlay;

    try {
      const submitFn = httpsCallable(functions, 'submit_leg');
      const { updatedParlay } = await submitPickToParlay({
        currentRosterId,
        currentTeam,
        pick,
        parlay,
        isClaimedByOther,
        user,
        isDemo,
        leagueId,
        season,
        submitFn: isDemo ? undefined : ((p) => submitFn(p)),
      });

      setParlay(updatedParlay);
    } catch (err: any) {
      if (!isDemo) {
        setParlay(previousParlay);
        alert(err?.message || 'Failed to submit pick to server. Rolled back changes.');
      }
    }
  };

  if (statusRoute.isStatusRoute) {
    const allAvailableParlays = [parlay, ...pastParlays];
    const targetParlay =
      statusRoute.week !== null
        ? allAvailableParlays.find((p) => p.week === statusRoute.week) || parlay
        : parlay;

    const payload = buildSanitizedStatusPayload({
      leagueId,
      leagueName,
      season,
      currentWeek: parlay.week,
      teams,
      parlay: targetParlay,
    });

    return (
      <LeagueStatusPage
        payload={payload}
        initialFormat={statusRoute.format}
        onOpenInteractive={() => navigateToLeague(leagueId)}
      />
    );
  }

  return (
    <SignInGate user={user} loading={authLoading} leagueName={leagueName} enabled={!isDemo}>
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
                className="flex items-center space-x-2 text-left group min-w-0 cursor-pointer"
              >
                <span className="text-xl shrink-0">🏈</span>
                <div className="min-w-0">
                  <h1 className="text-xs sm:text-sm font-black tracking-wider text-white leading-none truncate">
                    <span className="hidden sm:inline">Team </span>Parlay Tracker
                  </h1>
                </div>
              </button>

              <button
                type="button"
                onClick={() => navigateToLeague(null)}
                aria-label="Switch Sleeper League"
                title={`Current League: ${leagueName} (${leagueId}) — Click to switch`}
                className="h-9 px-2.5 rounded-xl bg-sleeper-dark border border-white/10 text-xs font-medium text-gray-300 hover:text-white hover:border-white/25 transition inline-flex items-center space-x-1.5 shrink-0 active:scale-95 cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-sleeper-accent shrink-0" />
                <span className="hidden xs:inline">Switch League</span>
              </button>
            </div>

            {/* Action Pills */}
            <div className="flex items-center space-x-2 shrink-0">
              {/* Team Picker Badge with ⚠️ if claimed by another user or Select Your Team CTA */}
              {isRealLeagueLoading ? (
                <div
                  data-testid="header-user-skeleton"
                  className="h-9 px-2.5 sm:px-3 rounded-xl bg-sleeper-dark border border-white/10 animate-pulse flex items-center space-x-2 shrink-0"
                >
                  <div className="w-16 sm:w-20 h-3 bg-white/10 rounded" />
                </div>
              ) : currentRosterId === null || !currentTeam ? (
                <button
                  type="button"
                  onClick={() => setIsTeamPickerOpen(true)}
                  aria-label="Select Your Fantasy Team"
                  className="h-9 px-3 py-1.5 rounded-xl bg-sleeper-accent text-black font-extrabold text-xs shadow-md shadow-sleeper-accent/20 hover:brightness-110 transition inline-flex items-center space-x-1.5 active:scale-95 cursor-pointer shrink-0"
                  title="Click to select and claim your fantasy team"
                >
                  <UserCheck className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Select Your Team</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsTeamPickerOpen(true)}
                  aria-label={`Switch Team: currently viewing ${currentTeam.owner_name}`}
                  className={`h-9 px-2.5 sm:px-3 rounded-xl bg-sleeper-dark border transition inline-flex items-center space-x-2 active:scale-95 shadow-sm cursor-pointer ${
                    isClaimedByOther
                      ? 'border-amber-500/50 hover:border-amber-400 bg-amber-500/10'
                      : 'border-white/10 hover:border-white/25 text-white'
                  }`}
                  title={
                    isClaimedByOther
                      ? `Claimed by ${currentTeam.claimed_by?.name || 'another manager'} (Click to switch team)`
                      : 'Click to Switch or Claim Team'
                  }
                >
                  <span className="truncate max-w-[120px] xs:max-w-[150px] sm:max-w-[180px] md:max-w-none font-bold text-white">
                    {currentTeam.owner_name}
                  </span>
                  {isClaimedByOther && (
                    <span className="text-xs text-amber-400 font-bold" title="Claimed by another account">
                      ⚠️
                    </span>
                  )}
                  <span className="hidden sm:inline text-sleeper-muted font-normal">
                    ({currentTeam.team_name})
                  </span>
                </button>
              )}

              {/* Profile Menu with Google Avatar & Sign Out */}
              {user && (
                <div className="relative" ref={profileMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsProfileMenuOpen(prev => !prev)}
                    className="h-9 w-9 rounded-xl bg-sleeper-dark border border-white/10 hover:border-white/25 flex items-center justify-center overflow-hidden transition active:scale-95 shadow-sm cursor-pointer"
                    title={`${user.displayName || user.email} (Click for profile & sign out)`}
                  >
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || 'User Avatar'}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full bg-sleeper-accent/20 text-sleeper-accent font-bold text-xs flex items-center justify-center">
                        {(user.displayName || user.email || 'U')[0].toUpperCase()}
                      </div>
                    )}
                  </button>

                  {isProfileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-sleeper-card border border-sleeper-border shadow-2xl p-3 z-50 animate-fadeIn text-left">
                      <div className="px-2 py-1.5 border-b border-sleeper-border/60 mb-2">
                        <p className="text-xs font-bold text-white truncate">
                          {user.displayName || 'Google User'}
                        </p>
                        <p className="text-[11px] text-sleeper-muted truncate">
                          {user.email}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          setIsTeamPickerOpen(true);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition flex items-center space-x-2 cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-sleeper-accent" />
                        <span>Change Fantasy Team</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          setIsArchiveOpen(true);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition flex items-center space-x-2 mt-1 cursor-pointer"
                      >
                        <History className="w-3.5 h-3.5 text-sleeper-accent" />
                        <span>Past Slips Archive</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          setIsPrivacyOpen(true);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition flex items-center space-x-2 mt-1 cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-sleeper-accent" />
                        <span>Privacy Policy</span>
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          setIsProfileMenuOpen(false);
                          setCurrentRosterId(null);
                          currentRosterIdRef.current = null;
                          await signOutUser();
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition flex items-center space-x-2 mt-1 cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Unauthenticated Menu in Demo Mode */}
              {!user && isDemo && (
                <div className="relative" ref={profileMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsProfileMenuOpen(prev => !prev)}
                    className="h-9 px-2.5 sm:px-3 rounded-xl bg-sleeper-dark border border-white/10 hover:border-white/25 flex items-center justify-center space-x-1.5 text-xs text-gray-300 hover:text-white transition active:scale-95 shadow-sm cursor-pointer"
                    title="Menu & Sign In"
                    aria-label="Open menu"
                  >
                    <Menu className="w-4 h-4 text-sleeper-accent" />
                    <span className="hidden sm:inline font-medium">Menu</span>
                  </button>

                  {isProfileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-sleeper-card border border-sleeper-border shadow-2xl p-3 z-50 animate-fadeIn text-left">
                      <div className="px-2 py-1.5 border-b border-sleeper-border/60 mb-2">
                        <p className="text-xs font-bold text-white truncate">
                          Demo Mode
                        </p>
                        <p className="text-[11px] text-sleeper-muted truncate">
                          Unauthenticated guest
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          setIsTeamPickerOpen(true);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition flex items-center space-x-2 cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-sleeper-accent" />
                        <span>Change Fantasy Team</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          setIsArchiveOpen(true);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition flex items-center space-x-2 mt-1 cursor-pointer"
                      >
                        <History className="w-3.5 h-3.5 text-sleeper-accent" />
                        <span>Past Slips Archive</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          setIsPrivacyOpen(true);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition flex items-center space-x-2 mt-1 cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-sleeper-accent" />
                        <span>Privacy Policy</span>
                      </button>

                      <div className="my-1 border-t border-sleeper-border/60" />

                      <button
                        type="button"
                        onClick={async () => {
                          setIsProfileMenuOpen(false);
                          try {
                            await signInWithGoogle();
                          } catch {
                            // User closed popup or cancelled
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-sleeper-accent hover:bg-sleeper-accent/10 transition flex items-center space-x-2 cursor-pointer"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>Sign in with Google</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Container */}
        <main className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 pb-20">
          {leagueError && (
            <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs sm:text-sm text-red-300 flex items-center justify-between">
              <span>{leagueError}</span>
              <button
                type="button"
                onClick={() => navigateToLeague(null)}
                className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-white font-bold text-xs transition cursor-pointer"
              >
                Change League ID
              </button>
            </div>
          )}
          {isRealLeagueLoading ? (
            <LeagueSkeleton showHeader={false} />
          ) : (
            <>
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
                  if (currentRosterId === null) {
                    setIsTeamPickerOpen(true);
                    return;
                  }
                  if (leg.roster_id === currentRosterId) {
                    setIsPickOpen(true);
                  }
                }}
                onOpenTeamPicker={() => setIsTeamPickerOpen(true)}
                oddsFormat={oddsFormat}
                onToggleOddsFormat={handleToggleOddsFormat}
              />

              {/* App Footer */}
              <footer className="mt-12 py-6 border-t border-sleeper-border/40 text-center text-xs text-sleeper-muted space-y-2">
                <div className="flex items-center justify-center space-x-3 text-xs">
                  <a
                    href={`/status/${leagueId}`}
                    className="text-gray-400 hover:text-sleeper-accent hover:underline transition font-medium"
                  >
                    Status Page
                  </a>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => setIsPrivacyOpen(true)}
                    className="text-gray-400 hover:text-sleeper-accent hover:underline transition font-medium cursor-pointer"
                  >
                    Privacy Policy
                  </button>
                  <span>•</span>
                  <a
                    href="https://github.com/goodwin616/team_parlay"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-sleeper-accent hover:underline transition font-medium"
                  >
                    GitHub
                  </a>
                  <span>•</span>
                  <span className="text-gray-500">v1.0 (2026)</span>
                </div>
                <p className="text-[11px] text-gray-500">
                  Team Parlay is an open-source fantasy sports coordination tool. Not a gambling platform.
                </p>
              </footer>
            </>
          )}
        </main>

        {/* Interactive Modals */}
        <PickModal
          isOpen={isPickOpen}
          onClose={() => setIsPickOpen(false)}
          onSubmitPick={handlePickSubmit}
          rosterName={currentTeam?.team_name || ''}
          activePlayers={activePlayers}
          kalshiGames={kalshiGames}
          kalshiProps={kalshiProps}
          liveMarketCount={liveMarketCount}
          lastUpdated={lastUpdated}
          oddsFormat={oddsFormat}
          onToggleOddsFormat={handleToggleOddsFormat}
          currentLeg={currentRosterId !== null ? parlay.legs.find(l => l.roster_id === currentRosterId) : undefined}
          maxLegOddsPercent={maxLegOddsPercent}
        />

        <PastSlipsArchive
          isOpen={isArchiveOpen}
          onClose={() => setIsArchiveOpen(false)}
          pastParlays={pastParlays}
        />

        <PrivacyModal
          isOpen={isPrivacyOpen}
          onClose={() => setIsPrivacyOpen(false)}
        />

        {/* Team Picker Modal */}
        <TeamPickerModal
          isOpen={isTeamPickerOpen}
          onClose={() => setIsTeamPickerOpen(false)}
          teams={teams}
          currentRosterId={currentRosterId}
          currentUserId={user?.uid}
          leagueId={leagueId}
          season={season}
          onTeamSelected={(rosterId, claimedBy) => {
            setCurrentRosterId(rosterId);
            currentRosterIdRef.current = rosterId;
            saveCachedTeamId(leagueId, rosterId, user?.uid);
            if (claimedBy) {
              setTeams(prev => prev.map(t => t.roster_id === rosterId ? { ...t, claimed_by: claimedBy } : t));
            }
          }}
        />
      </div>
    </SignInGate>
  );
};
