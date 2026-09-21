import React, { useState, useEffect } from 'react';
import { 
  History, 
  Lock, 
  ShieldAlert, 
  UserCheck, 
  KeyRound, 
  X, 
  PlusCircle, 
  RefreshCw 
} from 'lucide-react';
import { BettorBanner } from './components/BettorBanner';
import { ParlayCard } from './components/ParlayCard';
import { PickModal } from './components/PickModal';
import { DefaultPoolModal } from './components/DefaultPoolModal';
import { BreakGlassModal } from './components/BreakGlassModal';
import { SleeperChatExport } from './components/SleeperChatExport';
import { PastSlipsArchive } from './components/PastSlipsArchive';
import { WeeklyParlay, ActivePlayer, TeamProfile, ParlayLeg, DefaultLeg } from './types';
import { saveSession, getSession } from './services/auth';
import { calculateParlayStats } from './utils/parlayMath';

// Mock Master Database of active offensive NFL players from Sleeper
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

// Mock League Teams
const MOCK_TEAMS: TeamProfile[] = [
  {
    roster_id: 1,
    owner_id: 'u1',
    owner_name: 'Blake',
    team_name: 'Philly Special',
    default_legs: [
      { id: 'd1_1', nfl_team: 'PHI', market_type: 'spread', description_template: 'Eagles Spread' },
      { id: 'd1_2', nfl_team: 'PHI', market_type: 'player_prop', player_name: 'Saquon Barkley', description_template: 'Saquon Barkley Anytime TD' },
      { id: 'd1_3', nfl_team: 'BAL', market_type: 'moneyline', description_template: 'Ravens Moneyline' },
    ],
  },
  {
    roster_id: 2,
    owner_id: 'u2',
    owner_name: 'Bob',
    team_name: 'Gridiron Clowns',
    default_legs: [
      { id: 'd2_1', nfl_team: 'KC', market_type: 'moneyline', description_template: 'Chiefs Moneyline' },
      { id: 'd2_2', nfl_team: 'KC', market_type: 'spread', description_template: 'Chiefs Spread' },
      { id: 'd2_3', nfl_team: 'BUF', market_type: 'game_total', description_template: 'Bills Game Total Over' },
    ],
  },
  {
    roster_id: 3,
    owner_id: 'u3',
    owner_name: 'Alice',
    team_name: 'Motor City Kitties',
    default_legs: [
      { id: 'd3_1', nfl_team: 'DET', market_type: 'spread', description_template: 'Lions Spread' },
      { id: 'd3_2', nfl_team: 'DET', market_type: 'player_prop', player_name: 'Amon-Ra St. Brown', description_template: 'Amon-Ra St. Brown Anytime TD' },
      { id: 'd3_3', nfl_team: 'SF', market_type: 'moneyline', description_template: '49ers Moneyline' },
    ],
  },
  {
    roster_id: 4,
    owner_id: 'u4',
    owner_name: 'Charlie',
    team_name: 'Buffalo Stampede',
    default_legs: [
      { id: 'd4_1', nfl_team: 'BUF', market_type: 'spread', description_template: 'Bills Spread' },
      { id: 'd4_2', nfl_team: 'BUF', market_type: 'moneyline', description_template: 'Bills Moneyline' },
      { id: 'd4_3', nfl_team: 'MIN', market_type: 'player_prop', player_name: 'Justin Jefferson', description_template: 'Justin Jefferson Anytime TD' },
    ],
  },
  {
    roster_id: 5,
    owner_id: 'u5',
    owner_name: 'Dave',
    team_name: 'Lone Star Dynasty',
    default_legs: [
      { id: 'd5_1', nfl_team: 'DAL', market_type: 'moneyline', description_template: 'Cowboys Moneyline' },
      { id: 'd5_2', nfl_team: 'DAL', market_type: 'player_prop', player_name: 'CeeDee Lamb', description_template: 'CeeDee Lamb Anytime TD' },
      { id: 'd5_3', nfl_team: 'PHI', market_type: 'game_total', description_template: 'Eagles Game Total Over' },
    ],
  },
];

// Initial active weekly parlay
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
  earliest_kickoff: '2026-09-24T20:15:00Z', // TNF game
  legs: [
    {
      id: 'l1',
      roster_id: 1,
      team_name: 'Philly Special',
      owner_name: 'Blake',
      nfl_team: 'PHI',
      description: 'Saquon Barkley • Anytime TD',
      odds_american: '-115',
      odds_decimal: 1.87,
      is_default_roll: false,
      status: 'submitted',
      kickoff_time: '2026-09-27T17:00:00Z',
    },
    {
      id: 'l2',
      roster_id: 2,
      team_name: 'Gridiron Clowns',
      owner_name: 'Bob',
      nfl_team: 'KC',
      game_id: 'nfl_2026_w4_kc_bal',
      description: 'Chiefs Moneyline (+115)',
      odds_american: '+115',
      odds_decimal: 2.15,
      is_default_roll: false,
      status: 'submitted',
      kickoff_time: '2026-09-24T20:15:00Z', // TNF
    },
    {
      id: 'l3',
      roster_id: 3,
      team_name: 'Motor City Kitties',
      owner_name: 'Alice',
      nfl_team: 'DET',
      description: 'Amon-Ra St. Brown • OVER 74.5 Rec Yards',
      odds_american: '-115',
      odds_decimal: 1.87,
      is_default_roll: false,
      status: 'submitted',
      kickoff_time: '2026-09-27T17:00:00Z',
    },
    {
      id: 'l4',
      roster_id: 4,
      team_name: 'Buffalo Stampede',
      owner_name: 'Charlie',
      nfl_team: 'BUF',
      description: 'Pending pick...',
      odds_american: '-110',
      odds_decimal: 1.91,
      is_default_roll: false,
      status: 'pending',
    },
    {
      id: 'l5',
      roster_id: 5,
      team_name: 'Lone Star Dynasty',
      owner_name: 'Dave',
      nfl_team: 'DAL',
      description: 'Pending pick...',
      odds_american: '-110',
      odds_decimal: 1.91,
      is_default_roll: false,
      status: 'pending',
    },
  ],
  estimated_odds_american: '+2745',
  estimated_multiplier: 28.45,
  estimated_payout: 142.25,
  actual_payout: null,
  actual_odds_american: null,
};

// Mock Past Parlays for Archive
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
      { id: 'p3_1', roster_id: 1, team_name: 'Philly Special', owner_name: 'Blake', nfl_team: 'PHI', description: 'Jalen Hurts OVER 1.5 Pass TDs', odds_american: '-105', odds_decimal: 1.95, is_default_roll: false, status: 'submitted' },
      { id: 'p3_2', roster_id: 2, team_name: 'Gridiron Clowns', owner_name: 'Bob', nfl_team: 'KC', description: 'Patrick Mahomes 250+ Pass Yds', odds_american: '-110', odds_decimal: 1.91, is_default_roll: false, status: 'submitted' },
      { id: 'p3_3', roster_id: 3, team_name: 'Motor City Kitties', owner_name: 'Alice', nfl_team: 'DET', description: 'Lions -3.5 Spread', odds_american: '-110', odds_decimal: 1.91, is_default_roll: false, status: 'submitted' },
      { id: 'p3_4', roster_id: 4, team_name: 'Buffalo Stampede', owner_name: 'Charlie', nfl_team: 'BUF', description: 'Josh Allen Anytime TD', odds_american: '+125', odds_decimal: 2.25, is_default_roll: false, status: 'submitted' },
      { id: 'p3_5', roster_id: 5, team_name: 'Lone Star Dynasty', owner_name: 'Dave', nfl_team: 'DAL', description: 'Cowboys ML (Auto-Rolled)', odds_american: '-120', odds_decimal: 1.83, is_default_roll: true, status: 'submitted' },
    ],
    estimated_odds_american: '+2840',
    estimated_multiplier: 29.4,
    estimated_payout: 147.00,
    actual_payout: 147.00,
    actual_odds_american: '+2840',
    finalized_at: '2026-09-17T20:10:00Z',
    finalized_by: { roster_id: 4, owner_name: 'Charlie', is_break_glass: false },
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
      { id: 'p2_1', roster_id: 1, team_name: 'Philly Special', owner_name: 'Blake', nfl_team: 'BAL', description: 'Derrick Henry Anytime TD', odds_american: '-135', odds_decimal: 1.74, is_default_roll: false, status: 'submitted' },
      { id: 'p2_2', roster_id: 2, team_name: 'Gridiron Clowns', owner_name: 'Bob', nfl_team: 'KC', description: 'Travis Kelce Anytime TD', odds_american: '+110', odds_decimal: 2.10, is_default_roll: false, status: 'submitted' },
      { id: 'p2_3', roster_id: 3, team_name: 'Motor City Kitties', owner_name: 'Alice', nfl_team: 'DET', description: 'Jahmyr Gibbs OVER 55.5 Rush Yds', odds_american: '-115', odds_decimal: 1.87, is_default_roll: false, status: 'submitted' },
      { id: 'p2_4', roster_id: 4, team_name: 'Buffalo Stampede', owner_name: 'Charlie', nfl_team: 'BAL', description: 'Lamar Jackson OVER 45.5 Rush Yds', odds_american: '-110', odds_decimal: 1.91, is_default_roll: false, status: 'submitted' },
      { id: 'p2_5', roster_id: 5, team_name: 'Lone Star Dynasty', owner_name: 'Dave', nfl_team: 'DAL', description: 'CeeDee Lamb Anytime TD', odds_american: '+105', odds_decimal: 2.05, is_default_roll: false, status: 'submitted' },
    ],
    estimated_odds_american: '+2570',
    estimated_multiplier: 26.7,
    estimated_payout: 133.50,
    actual_payout: 110.00,
    actual_odds_american: '+2100',
    finalized_at: '2026-09-10T20:00:00Z',
    finalized_by: { roster_id: 3, owner_name: 'Alice', is_break_glass: true },
  },
];

export const App: React.FC = () => {
  // App State
  const [teams, setTeams] = useState<TeamProfile[]>(MOCK_TEAMS);
  const [currentRosterId, setCurrentRosterId] = useState<number>(1);
  const [parlay, setParlay] = useState<WeeklyParlay>(INITIAL_PARLAY);
  const [pastParlays, setPastParlays] = useState<WeeklyParlay[]>(MOCK_PAST_PARLAYS);

  // Modals
  const [isPickOpen, setIsPickOpen] = useState(false);
  const [editingLeg, setEditingLeg] = useState<ParlayLeg | undefined>(undefined);
  const [isBreakGlassOpen, setIsBreakGlassOpen] = useState(false);
  const [isDefaultPoolOpen, setIsDefaultPoolOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authPinInput, setAuthPinInput] = useState('');
  const [authSelectedRoster, setAuthSelectedRoster] = useState<number>(1);

  // Restore authenticated session on load
  useEffect(() => {
    const session = getSession();
    if (session) {
      setCurrentRosterId(session.rosterId);
    } else {
      // Default initial session for immediate exploration
      saveSession(1, 'mock_token_' + Math.random().toString(36).substring(7));
    }
  }, []);

  const currentTeam = teams.find(t => t.roster_id === currentRosterId) || teams[0];
  const isCurrentBettor = parlay.bettor.roster_id === currentRosterId;
  const unsubmittedLegs = parlay.legs.filter(l => l.status === 'pending');

  // Handle Pick Submit
  const handlePickSubmit = (pick: {
    description: string;
    nfl_team: string;
    odds_american: string;
    odds_decimal: number;
    kickoff_time?: string;
    game_id?: string;
  }) => {
    const targetRosterId = editingLeg ? editingLeg.roster_id : currentRosterId;

    const updatedLegs: ParlayLeg[] = parlay.legs.map(leg => {
      if (leg.roster_id === targetRosterId) {
        return {
          ...leg,
          description: pick.description,
          nfl_team: pick.nfl_team,
          odds_american: pick.odds_american,
          odds_decimal: pick.odds_decimal,
          kickoff_time: pick.kickoff_time || leg.kickoff_time,
          game_id: pick.game_id || leg.game_id,
          status: 'submitted',
          is_default_roll: false,
        };
      }
      return leg;
    });

    const stats = calculateParlayStats(updatedLegs, 5.0);

    setParlay(prev => ({
      ...prev,
      legs: updatedLegs,
      estimated_odds_american: stats.odds_american,
      estimated_multiplier: stats.multiplier,
      estimated_payout: stats.estimated_payout,
      contains_sgp: stats.contains_sgp,
      earliest_kickoff: stats.earliest_kickoff || prev.earliest_kickoff,
    }));

    setEditingLeg(undefined);
  };

  // Handle Finalization (Bettor vs Break-Glass)
  const handleFinalize = (isBreakGlass: boolean) => {
    // Auto-roll any pending legs using their team's fallback default pool
    const finalLegs: ParlayLeg[] = parlay.legs.map(leg => {
      if (leg.status === 'pending') {
        const teamProfile = teams.find(t => t.roster_id === leg.roster_id);
        const defaults = teamProfile?.default_legs || [];
        const pickedFallback = defaults.length > 0 ? defaults[0] : null;

        let snappedDesc = `${leg.nfl_team} -3.5 Spread`;
        let snappedOdds = '-110';
        let snappedDecimal = 1.91;

        if (pickedFallback) {
          if (pickedFallback.market_type === 'spread') {
            snappedDesc = `${pickedFallback.nfl_team} -3.5 Spread`;
            snappedOdds = '-110';
            snappedDecimal = 1.91;
          } else if (pickedFallback.market_type === 'moneyline') {
            snappedDesc = `${pickedFallback.nfl_team} Moneyline`;
            snappedOdds = '-135';
            snappedDecimal = 1.74;
          } else if (pickedFallback.market_type === 'game_total') {
            snappedDesc = `${pickedFallback.nfl_team} Game Total OVER 46.5`;
            snappedOdds = '-110';
            snappedDecimal = 1.91;
          } else {
            snappedDesc = pickedFallback.description_template;
            snappedOdds = '-115';
            snappedDecimal = 1.87;
          }
        }

        return {
          ...leg,
          description: snappedDesc,
          odds_american: snappedOdds,
          odds_decimal: snappedDecimal,
          is_default_roll: true,
          status: 'submitted',
        };
      }
      return leg;
    });

    const stats = calculateParlayStats(finalLegs, 5.0);

    const lockedParlay: WeeklyParlay = {
      ...parlay,
      status: 'locked',
      legs: finalLegs,
      estimated_odds_american: stats.odds_american,
      estimated_multiplier: stats.multiplier,
      estimated_payout: stats.estimated_payout,
      contains_sgp: stats.contains_sgp,
      finalized_at: new Date().toISOString(),
      finalized_by: {
        roster_id: currentRosterId,
        owner_name: currentTeam.owner_name,
        is_break_glass: isBreakGlass,
      },
    };

    setParlay(lockedParlay);
    setPastParlays(prev => [lockedParlay, ...prev]);
  };

  // Update Fallback Default Pool for current team
  const handleSaveDefaults = (newDefaults: DefaultLeg[]) => {
    setTeams(prev =>
      prev.map(t =>
        t.roster_id === currentRosterId ? { ...t, default_legs: newDefaults } : t
      )
    );
  };

  // Switch Team / PIN Login simulation
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (authPinInput.length === 4) {
      // In production, backend issues cryptographically secure uuid4 session token
      const token = `session_${authSelectedRoster}_${Date.now()}`;
      saveSession(authSelectedRoster, token);
      setCurrentRosterId(authSelectedRoster);
      setIsAuthModalOpen(false);
      setAuthPinInput('');
    } else {
      alert('Please enter a 4-digit PIN');
    }
  };

  // Reset parlay for testing
  const handleResetTestParlay = () => {
    setParlay(INITIAL_PARLAY);
  };

  return (
    <div className="min-h-screen bg-sleeper-dark text-white selection:bg-sleeper-accent selection:text-black">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-sleeper-card/90 backdrop-blur-md border-b border-sleeper-border px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xl">🏈</span>
            <div>
              <h1 className="text-sm font-black tracking-wider text-white leading-none">
                TEAM PARLAY
              </h1>
              <span className="text-[10px] font-bold text-sleeper-accent tracking-widest uppercase">
                Sleeper League
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsArchiveOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-sleeper-dark border border-sleeper-border text-xs font-semibold text-gray-300 hover:text-white hover:border-gray-500 transition flex items-center space-x-1"
            >
              <History className="w-3.5 h-3.5 text-sleeper-accent" />
              <span>Archive</span>
            </button>

            {/* Authenticated Team Pill */}
            <button
              onClick={() => {
                setAuthSelectedRoster(currentRosterId);
                setIsAuthModalOpen(true);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-sleeper-accent/15 border border-sleeper-accent/40 text-xs font-bold text-sleeper-accent hover:bg-sleeper-accent/25 transition flex items-center space-x-1.5"
              title="Click to Switch Team / Re-Auth"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span className="truncate max-w-[90px] sm:max-w-none">{currentTeam.owner_name}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-xl mx-auto p-4 pb-20">
        {/* Weekly Bettor Spotlight */}
        <BettorBanner parlay={parlay} />

        {/* Active Parlay Card */}
        <ParlayCard
          parlay={parlay}
          currentRosterId={currentRosterId}
          onOpenPickModal={(leg) => {
            setEditingLeg(leg);
            setIsPickOpen(true);
          }}
          onOpenDefaultPool={() => setIsDefaultPoolOpen(true)}
        />

        {/* Primary Action Buttons */}
        <div className="space-y-3 mb-6">
          {/* Submit / Edit Leg CTA Button if Parlay is Open */}
          {parlay.status === 'open' && (
            <button
              onClick={() => {
                const userLeg = parlay.legs.find(l => l.roster_id === currentRosterId);
                setEditingLeg(userLeg);
                setIsPickOpen(true);
              }}
              className="w-full py-3 px-4 rounded-xl bg-sleeper-accent text-black font-black text-sm hover:brightness-110 active:scale-[0.99] transition shadow-lg shadow-sleeper-accent/20 flex items-center justify-center space-x-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Submit / Edit Your Leg ({currentTeam.team_name})</span>
            </button>
          )}

          {/* Finalize Parlay Button: Bettor vs Break-Glass */}
          {parlay.status === 'open' && (
            <div>
              {isCurrentBettor ? (
                <button
                  onClick={() => setIsBreakGlassOpen(true)}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider transition shadow-lg shadow-emerald-500/20 flex items-center justify-center space-x-2"
                >
                  <Lock className="w-4 h-4" />
                  <span>Finalize Parlay Slip & Roll Defaults</span>
                </button>
              ) : (
                <button
                  onClick={() => setIsBreakGlassOpen(true)}
                  className="w-full py-2.5 px-4 rounded-xl bg-red-950/40 border border-red-500/40 hover:bg-red-900/50 text-red-300 font-bold text-xs transition flex items-center justify-center space-x-2"
                >
                  <ShieldAlert className="w-4 h-4 text-red-400" />
                  <span>⚡ Break Glass: Finalize on Behalf of {parlay.bettor.owner_name}</span>
                </button>
              )}
            </div>
          )}

          {/* Locked Notice if Parlay is Locked */}
          {parlay.status === 'locked' && (
            <div className="p-3.5 rounded-xl bg-sleeper-card border border-sleeper-border text-center">
              <div className="flex items-center justify-center space-x-2 text-xs text-gray-300 font-semibold mb-1">
                <Lock className="w-4 h-4 text-sleeper-accent" />
                <span>Ticket is Locked for Week {parlay.week}</span>
              </div>
              <p className="text-[11px] text-sleeper-muted">
                {parlay.finalized_by?.is_break_glass
                  ? `Emergency override executed by ${parlay.finalized_by.owner_name}.`
                  : `Finalized by ${parlay.bettor.owner_name}.`}
              </p>
              <button
                type="button"
                onClick={handleResetTestParlay}
                className="mt-2 text-[11px] text-sleeper-accent hover:underline inline-flex items-center space-x-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Reset demo state to open</span>
              </button>
            </div>
          )}

          {/* Sleeper Chat Exporter Card */}
          <SleeperChatExport parlay={parlay} />
        </div>
      </main>

      {/* Interactive Modals */}
      <PickModal
        isOpen={isPickOpen}
        onClose={() => {
          setIsPickOpen(false);
          setEditingLeg(undefined);
        }}
        onSubmitPick={handlePickSubmit}
        rosterName={editingLeg ? editingLeg.team_name : currentTeam.team_name}
        activePlayers={MOCK_ACTIVE_PLAYERS}
        initialPick={editingLeg ? {
          description: editingLeg.description,
          nfl_team: editingLeg.nfl_team,
          odds_american: editingLeg.odds_american,
        } : undefined}
      />

      <DefaultPoolModal
        isOpen={isDefaultPoolOpen}
        onClose={() => setIsDefaultPoolOpen(false)}
        defaultLegs={currentTeam.default_legs}
        onSaveDefaults={handleSaveDefaults}
        activePlayers={MOCK_ACTIVE_PLAYERS}
        teamName={currentTeam.team_name}
        byeTeams={['CAR', 'CLE']}
      />

      <BreakGlassModal
        isOpen={isBreakGlassOpen}
        onClose={() => setIsBreakGlassOpen(false)}
        onConfirm={handleFinalize}
        bettorName={parlay.bettor.owner_name}
        isBettor={isCurrentBettor}
        unsubmittedCount={unsubmittedLegs.length}
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
                      {t.team_name} ({t.owner_name}) {t.roster_id === parlay.bettor.roster_id ? '👑 Bettor' : ''}
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
                  (Demo: any 4 digits issue a secure random session token)
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
