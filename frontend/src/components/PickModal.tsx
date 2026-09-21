import React, { useState, useEffect } from 'react';
import { X, Sparkles, Check, ChevronRight } from 'lucide-react';
import { ActivePlayer, GameLineOption } from '../types';
import { PlayerSearchInput } from './PlayerSearchInput';

interface PickData {
  description: string;
  nfl_team: string;
  odds_american: string;
  odds_decimal: number;
  kickoff_time?: string;
  game_id?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmitPick: (pick: PickData) => void;
  rosterName: string;
  activePlayers: ActivePlayer[];
  initialPick?: {
    description?: string;
    nfl_team?: string;
    odds_american?: string;
  };
}

// Sample mainline games for Game Line Tab
const SAMPLE_GAMES: GameLineOption[] = [
  {
    game_id: 'nfl_2026_w4_kc_bal',
    home_team: 'BAL',
    away_team: 'KC',
    commence_time: '2026-09-24T20:15:00Z', // Thursday Night Football
    spread_home: { point: -2.5, odds: '-110' },
    spread_away: { point: 2.5, odds: '-110' },
    ml_home: { odds: '-135' },
    ml_away: { odds: '+115' },
    total_over: { point: 47.5, odds: '-110' },
    total_under: { point: 47.5, odds: '-110' },
  },
  {
    game_id: 'nfl_2026_w4_phi_dal',
    home_team: 'DAL',
    away_team: 'PHI',
    commence_time: '2026-09-27T17:00:00Z',
    spread_home: { point: 3.0, odds: '-105' },
    spread_away: { point: -3.0, odds: '-115' },
    ml_home: { odds: '+140' },
    ml_away: { odds: '-165' },
    total_over: { point: 48.5, odds: '-110' },
    total_under: { point: 48.5, odds: '-110' },
  },
  {
    game_id: 'nfl_2026_w4_det_gb',
    home_team: 'GB',
    away_team: 'DET',
    commence_time: '2026-09-27T17:00:00Z',
    spread_home: { point: 1.5, odds: '-110' },
    spread_away: { point: -1.5, odds: '-110' },
    ml_home: { odds: '+105' },
    ml_away: { odds: '-125' },
    total_over: { point: 51.5, odds: '-112' },
    total_under: { point: 51.5, odds: '-108' },
  },
  {
    game_id: 'nfl_2026_w4_buf_nyj',
    home_team: 'NYJ',
    away_team: 'BUF',
    commence_time: '2026-09-28T00:20:00Z', // Sunday Night Football
    spread_home: { point: 4.5, odds: '-110' },
    spread_away: { point: -4.5, odds: '-110' },
    ml_home: { odds: '+180' },
    ml_away: { odds: '-215' },
    total_over: { point: 43.5, odds: '-108' },
    total_under: { point: 43.5, odds: '-112' },
  },
];

const NFL_TEAMS = [
  { code: 'ARI', name: 'Arizona Cardinals' },
  { code: 'ATL', name: 'Atlanta Falcons' },
  { code: 'BAL', name: 'Baltimore Ravens' },
  { code: 'BUF', name: 'Buffalo Bills' },
  { code: 'CAR', name: 'Carolina Panthers' },
  { code: 'CHI', name: 'Chicago Bears' },
  { code: 'CIN', name: 'Cincinnati Bengals' },
  { code: 'CLE', name: 'Cleveland Browns' },
  { code: 'DAL', name: 'Dallas Cowboys' },
  { code: 'DEN', name: 'Denver Broncos' },
  { code: 'DET', name: 'Detroit Lions' },
  { code: 'GB', name: 'Green Bay Packers' },
  { code: 'HOU', name: 'Houston Texans' },
  { code: 'IND', name: 'Indianapolis Colts' },
  { code: 'JAX', name: 'Jacksonville Jaguars' },
  { code: 'KC', name: 'Kansas City Chiefs' },
  { code: 'LAC', name: 'Los Angeles Chargers' },
  { code: 'LAR', name: 'Los Angeles Rams' },
  { code: 'LV', name: 'Las Vegas Raiders' },
  { code: 'MIA', name: 'Miami Dolphins' },
  { code: 'MIN', name: 'Minnesota Vikings' },
  { code: 'NE', name: 'New England Patriots' },
  { code: 'NO', name: 'New Orleans Saints' },
  { code: 'NYG', name: 'New York Giants' },
  { code: 'NYJ', name: 'New York Jets' },
  { code: 'PHI', name: 'Philadelphia Eagles' },
  { code: 'PIT', name: 'Pittsburgh Steelers' },
  { code: 'SEA', name: 'Seattle Seahawks' },
  { code: 'SF', name: 'San Francisco 49ers' },
  { code: 'TB', name: 'Tampa Bay Buccaneers' },
  { code: 'TEN', name: 'Tennessee Titans' },
  { code: 'WAS', name: 'Washington Commanders' },
];

function americanToDecimal(american: string | number): number {
  const odds = typeof american === 'number' ? american : parseInt(american, 10);
  if (isNaN(odds)) return 1.91;
  if (odds > 0) return Number(((odds / 100) + 1).toFixed(4));
  return Number(((100 / Math.abs(odds)) + 1).toFixed(4));
}

export const PickModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSubmitPick,
  rosterName,
  activePlayers,
}) => {
  const [tab, setTab] = useState<'prop' | 'mainline' | 'custom'>('prop');

  // Player Prop State
  const [selectedPlayer, setSelectedPlayer] = useState<ActivePlayer | null>(null);
  const [statCategory, setStatCategory] = useState<string>('Touchdowns');
  const [tdType, setTdType] = useState<'Anytime TD' | '2+ TDs' | '1st TD'>('Anytime TD');
  const [overUnder, setOverUnder] = useState<'OVER' | 'UNDER'>('OVER');
  const [statValue, setStatValue] = useState<number>(74.5);
  const [propOdds, setPropOdds] = useState<string>('-115');

  // Mainline State
  const [selectedGame, setSelectedGame] = useState<GameLineOption>(SAMPLE_GAMES[0]);
  const [mainlineType, setMainlineType] = useState<'spread_away' | 'spread_home' | 'ml_away' | 'ml_home' | 'total_over' | 'total_under'>('spread_away');

  // Custom State
  const [customTeam, setCustomTeam] = useState<string>('PHI');
  const [customDescription, setCustomDescription] = useState<string>('');
  const [customOdds, setCustomOdds] = useState<string>('-110');

  // Reset defaults when player position changes
  useEffect(() => {
    if (!selectedPlayer) return;
    const pos = selectedPlayer.position.toUpperCase();
    if (pos === 'QB') {
      setStatCategory('Pass Yards');
      setStatValue(249.5);
      setPropOdds('-115');
    } else if (pos === 'RB') {
      setStatCategory('Rush Yards');
      setStatValue(69.5);
      setPropOdds('-115');
    } else if (pos === 'WR' || pos === 'TE') {
      setStatCategory('Rec Yards');
      setStatValue(59.5);
      setPropOdds('-115');
    } else {
      setStatCategory('Touchdowns');
      setPropOdds('-110');
    }
  }, [selectedPlayer]);

  // Set default initial player if available and none selected
  useEffect(() => {
    if (!selectedPlayer && activePlayers.length > 0) {
      setSelectedPlayer(activePlayers[0]);
    }
  }, [activePlayers, selectedPlayer]);

  if (!isOpen) return null;

  // Determine available categories based on position
  const getCategoriesForPosition = (pos?: string): string[] => {
    switch (pos?.toUpperCase()) {
      case 'QB':
        return ['Pass Yards', 'Pass TDs', 'Rush Yards', 'Touchdowns'];
      case 'RB':
        return ['Touchdowns', 'Rush Yards', 'Rec Yards', 'Receptions'];
      case 'WR':
      case 'TE':
        return ['Rec Yards', 'Receptions', 'Touchdowns', 'Longest Rec'];
      default:
        return ['Touchdowns', 'Rush Yards', 'Rec Yards'];
    }
  };

  const isTdCategory = statCategory === 'Touchdowns' || statCategory === 'Anytime TD';

  // Live ticket preview string & metadata calculation
  let previewLine = '';
  let previewTeam = '';
  let previewOdds = '-110';
  let previewKickoff: string | undefined = undefined;
  let previewGameId: string | undefined = undefined;

  if (tab === 'prop') {
    const playerText = selectedPlayer ? `${selectedPlayer.name} (${selectedPlayer.team})` : 'Player';
    previewTeam = selectedPlayer?.team || 'NFL';
    previewOdds = propOdds;
    if (isTdCategory) {
      previewLine = `${playerText} • ${tdType}`;
    } else {
      previewLine = `${playerText} • ${overUnder} ${statValue} ${statCategory}`;
    }
  } else if (tab === 'mainline') {
    previewGameId = selectedGame.game_id;
    previewKickoff = selectedGame.commence_time;
    if (mainlineType === 'spread_away') {
      const pt = selectedGame.spread_away.point > 0 ? `+${selectedGame.spread_away.point}` : `${selectedGame.spread_away.point}`;
      previewTeam = selectedGame.away_team;
      previewOdds = selectedGame.spread_away.odds;
      previewLine = `${selectedGame.away_team} ${pt} Spread`;
    } else if (mainlineType === 'spread_home') {
      const pt = selectedGame.spread_home.point > 0 ? `+${selectedGame.spread_home.point}` : `${selectedGame.spread_home.point}`;
      previewTeam = selectedGame.home_team;
      previewOdds = selectedGame.spread_home.odds;
      previewLine = `${selectedGame.home_team} ${pt} Spread`;
    } else if (mainlineType === 'ml_away') {
      previewTeam = selectedGame.away_team;
      previewOdds = selectedGame.ml_away.odds;
      previewLine = `${selectedGame.away_team} Moneyline`;
    } else if (mainlineType === 'ml_home') {
      previewTeam = selectedGame.home_team;
      previewOdds = selectedGame.ml_home.odds;
      previewLine = `${selectedGame.home_team} Moneyline`;
    } else if (mainlineType === 'total_over') {
      previewTeam = selectedGame.home_team;
      previewOdds = selectedGame.total_over.odds;
      previewLine = `${selectedGame.away_team} @ ${selectedGame.home_team} OVER ${selectedGame.total_over.point}`;
    } else {
      previewTeam = selectedGame.home_team;
      previewOdds = selectedGame.total_under.odds;
      previewLine = `${selectedGame.away_team} @ ${selectedGame.home_team} UNDER ${selectedGame.total_under.point}`;
    }
  } else {
    previewTeam = customTeam;
    previewOdds = customOdds;
    previewLine = customDescription.trim() || `${customTeam} Custom Pick`;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const decimal = americanToDecimal(previewOdds);
    onSubmitPick({
      description: previewLine,
      nfl_team: previewTeam,
      odds_american: previewOdds,
      odds_decimal: decimal,
      kickoff_time: previewKickoff,
      game_id: previewGameId,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fadeIn">
      <div className="bg-sleeper-card border border-sleeper-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl my-auto">
        {/* Modal Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-sleeper-border bg-sleeper-card">
          <div>
            <div className="text-[11px] font-bold text-sleeper-accent uppercase tracking-wider">
              {rosterName}
            </div>
            <h3 className="text-base font-bold text-white flex items-center space-x-1.5">
              <span>Submit Weekly Leg</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-sleeper-border bg-sleeper-dark/50">
          <button
            type="button"
            onClick={() => setTab('prop')}
            className={`flex-1 py-3 text-xs font-bold transition flex items-center justify-center space-x-1.5 border-b-2 ${
              tab === 'prop'
                ? 'text-sleeper-accent border-sleeper-accent bg-sleeper-card/60'
                : 'text-gray-400 border-transparent hover:text-gray-200'
            }`}
          >
            <span>🏃</span>
            <span>Player Prop</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('mainline')}
            className={`flex-1 py-3 text-xs font-bold transition flex items-center justify-center space-x-1.5 border-b-2 ${
              tab === 'mainline'
                ? 'text-sleeper-accent border-sleeper-accent bg-sleeper-card/60'
                : 'text-gray-400 border-transparent hover:text-gray-200'
            }`}
          >
            <span>🏈</span>
            <span>Game Line</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('custom')}
            className={`flex-1 py-3 text-xs font-bold transition flex items-center justify-center space-x-1.5 border-b-2 ${
              tab === 'custom'
                ? 'text-sleeper-accent border-sleeper-accent bg-sleeper-card/60'
                : 'text-gray-400 border-transparent hover:text-gray-200'
            }`}
          >
            <span>✍️</span>
            <span>Custom</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* TAB 1: PLAYER PROP */}
          {tab === 'prop' && (
            <div className="space-y-4">
              <PlayerSearchInput
                players={activePlayers}
                selectedPlayer={selectedPlayer}
                onSelectPlayer={(p) => setSelectedPlayer(p)}
              />

              {/* Position-Aware Categories */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">
                  Stat Category ({selectedPlayer?.position || 'Offense'})
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {getCategoriesForPosition(selectedPlayer?.position).map((cat) => {
                    const isSelected = statCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setStatCategory(cat);
                          if (cat.includes('Yard')) {
                            setStatValue(cat.includes('Pass') ? 245.5 : cat.includes('Rush') ? 64.5 : 54.5);
                          } else if (cat.includes('Rec')) {
                            setStatValue(4.5);
                          }
                        }}
                        className={`py-2 px-2 text-xs font-bold rounded-lg border text-center transition ${
                          isSelected
                            ? 'bg-sleeper-accent text-black border-sleeper-accent'
                            : 'bg-sleeper-dark text-gray-300 border-sleeper-border hover:border-gray-500'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Touchdown Options vs Yardage Stepper */}
              {isTdCategory ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">
                    Touchdown Prop Market
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Anytime TD', '2+ TDs', '1st TD'] as const).map((type) => {
                      const isSelected = tdType === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setTdType(type);
                            if (type === 'Anytime TD') setPropOdds('-115');
                            if (type === '2+ TDs') setPropOdds('+275');
                            if (type === '1st TD') setPropOdds('+550');
                          }}
                          className={`py-2.5 px-2 text-xs font-bold rounded-lg border transition ${
                            isSelected
                              ? 'bg-sleeper-accent text-black border-sleeper-accent shadow'
                              : 'bg-sleeper-dark text-gray-300 border-sleeper-border hover:bg-white/5'
                          }`}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 bg-sleeper-dark/60 p-3.5 rounded-xl border border-sleeper-border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-300">Target Line</span>
                    {/* OVER / UNDER Segmented Toggle */}
                    <div className="inline-flex rounded-lg bg-sleeper-card p-1 border border-sleeper-border">
                      <button
                        type="button"
                        onClick={() => setOverUnder('OVER')}
                        className={`px-3 py-1 text-xs font-extrabold rounded-md transition ${
                          overUnder === 'OVER'
                            ? 'bg-emerald-500 text-black shadow'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        OVER
                      </button>
                      <button
                        type="button"
                        onClick={() => setOverUnder('UNDER')}
                        className={`px-3 py-1 text-xs font-extrabold rounded-md transition ${
                          overUnder === 'UNDER'
                            ? 'bg-red-500 text-white shadow'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        UNDER
                      </button>
                    </div>
                  </div>

                  {/* Stepper Controls */}
                  <div className="flex items-center justify-center space-x-3 py-1">
                    <button
                      type="button"
                      onClick={() => setStatValue(prev => Math.max(0.5, Number((prev - (statCategory.includes('Rec') && !statCategory.includes('Yard') ? 1 : 2.5)).toFixed(1))))}
                      className="w-10 h-10 rounded-lg bg-sleeper-card border border-sleeper-border text-white text-lg font-bold hover:bg-white/10 active:scale-95 transition flex items-center justify-center"
                    >
                      -
                    </button>
                    <div className="text-center px-4">
                      <span className="text-2xl font-black font-mono text-white tracking-wider">
                        {statValue}
                      </span>
                      <span className="block text-[10px] uppercase font-bold text-sleeper-muted">
                        {statCategory}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStatValue(prev => Number((prev + (statCategory.includes('Rec') && !statCategory.includes('Yard') ? 1 : 2.5)).toFixed(1)))}
                      className="w-10 h-10 rounded-lg bg-sleeper-card border border-sleeper-border text-white text-lg font-bold hover:bg-white/10 active:scale-95 transition flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>

                  {/* Quick Milestone Buttons */}
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-gray-400 mb-1">
                      Quick Milestones
                    </span>
                    <div className="flex items-center space-x-2">
                      {statCategory.includes('Yard') ? (
                        [50.5, 74.5, 99.5].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => {
                              setStatValue(val);
                              setOverUnder('OVER');
                            }}
                            className={`flex-1 py-1.5 px-2 rounded text-xs font-mono font-bold border transition ${
                              statValue === val
                                ? 'bg-sleeper-accent/20 border-sleeper-accent text-sleeper-accent'
                                : 'bg-sleeper-card border-sleeper-border text-gray-400 hover:text-white'
                            }`}
                          >
                            {Math.floor(val)}+ Yds
                          </button>
                        ))
                      ) : (
                        [2.5, 4.5, 6.5].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => {
                              setStatValue(val);
                              setOverUnder('OVER');
                            }}
                            className={`flex-1 py-1.5 px-2 rounded text-xs font-mono font-bold border transition ${
                              statValue === val
                                ? 'bg-sleeper-accent/20 border-sleeper-accent text-sleeper-accent'
                                : 'bg-sleeper-card border-sleeper-border text-gray-400 hover:text-white'
                            }`}
                          >
                            {Math.floor(val)}+
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* American Odds Input */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">
                  DraftKings American Odds
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={propOdds}
                    onChange={(e) => setPropOdds(e.target.value)}
                    placeholder="-115 or +150"
                    className="w-full bg-sleeper-dark border border-sleeper-border rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-sleeper-accent focus:outline-none"
                  />
                  <div className="absolute right-3 top-2 text-xs font-mono text-gray-500">
                    DraftKings
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GAME LINES */}
          {tab === 'mainline' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">
                  Select Game Matchup
                </label>
                <div className="space-y-2">
                  {SAMPLE_GAMES.map((g) => {
                    const isSelected = selectedGame.game_id === g.game_id;
                    const isTnf = g.commence_time.includes('T20:15');
                    return (
                      <div
                        key={g.game_id}
                        onClick={() => setSelectedGame(g)}
                        className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                          isSelected
                            ? 'bg-sleeper-dark border-sleeper-accent shadow-md'
                            : 'bg-sleeper-dark/40 border-sleeper-border hover:border-gray-500'
                        }`}
                      >
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-extrabold text-white text-sm">
                              {g.away_team} @ {g.home_team}
                            </span>
                            {isTnf && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                ⏳ TNF (Earliest Kickoff)
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-gray-400">
                            {new Date(g.commence_time).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        {isSelected && <Check className="w-5 h-5 text-sleeper-accent" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mainline Markets */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">
                  Select DraftKings Mainline Market
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {/* Spread Away */}
                  <button
                    type="button"
                    onClick={() => setMainlineType('spread_away')}
                    className={`p-3 rounded-xl border text-left transition ${
                      mainlineType === 'spread_away'
                        ? 'bg-sleeper-accent/15 border-sleeper-accent text-white'
                        : 'bg-sleeper-dark border-sleeper-border text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="text-xs text-sleeper-muted block">Spread</span>
                    <div className="font-bold text-sm">
                      {selectedGame.away_team}{' '}
                      {selectedGame.spread_away.point > 0 ? `+${selectedGame.spread_away.point}` : selectedGame.spread_away.point}
                    </div>
                    <span className="text-xs font-mono text-sleeper-accent">
                      {selectedGame.spread_away.odds}
                    </span>
                  </button>

                  {/* Spread Home */}
                  <button
                    type="button"
                    onClick={() => setMainlineType('spread_home')}
                    className={`p-3 rounded-xl border text-left transition ${
                      mainlineType === 'spread_home'
                        ? 'bg-sleeper-accent/15 border-sleeper-accent text-white'
                        : 'bg-sleeper-dark border-sleeper-border text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="text-xs text-sleeper-muted block">Spread</span>
                    <div className="font-bold text-sm">
                      {selectedGame.home_team}{' '}
                      {selectedGame.spread_home.point > 0 ? `+${selectedGame.spread_home.point}` : selectedGame.spread_home.point}
                    </div>
                    <span className="text-xs font-mono text-sleeper-accent">
                      {selectedGame.spread_home.odds}
                    </span>
                  </button>

                  {/* Moneyline Away */}
                  <button
                    type="button"
                    onClick={() => setMainlineType('ml_away')}
                    className={`p-3 rounded-xl border text-left transition ${
                      mainlineType === 'ml_away'
                        ? 'bg-sleeper-accent/15 border-sleeper-accent text-white'
                        : 'bg-sleeper-dark border-sleeper-border text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="text-xs text-sleeper-muted block">Moneyline</span>
                    <div className="font-bold text-sm">{selectedGame.away_team}</div>
                    <span className="text-xs font-mono text-sleeper-accent">
                      {selectedGame.ml_away.odds}
                    </span>
                  </button>

                  {/* Moneyline Home */}
                  <button
                    type="button"
                    onClick={() => setMainlineType('ml_home')}
                    className={`p-3 rounded-xl border text-left transition ${
                      mainlineType === 'ml_home'
                        ? 'bg-sleeper-accent/15 border-sleeper-accent text-white'
                        : 'bg-sleeper-dark border-sleeper-border text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="text-xs text-sleeper-muted block">Moneyline</span>
                    <div className="font-bold text-sm">{selectedGame.home_team}</div>
                    <span className="text-xs font-mono text-sleeper-accent">
                      {selectedGame.ml_home.odds}
                    </span>
                  </button>

                  {/* Total Over */}
                  <button
                    type="button"
                    onClick={() => setMainlineType('total_over')}
                    className={`p-3 rounded-xl border text-left transition ${
                      mainlineType === 'total_over'
                        ? 'bg-sleeper-accent/15 border-sleeper-accent text-white'
                        : 'bg-sleeper-dark border-sleeper-border text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="text-xs text-sleeper-muted block">Game Total</span>
                    <div className="font-bold text-sm">OVER {selectedGame.total_over.point}</div>
                    <span className="text-xs font-mono text-sleeper-accent">
                      {selectedGame.total_over.odds}
                    </span>
                  </button>

                  {/* Total Under */}
                  <button
                    type="button"
                    onClick={() => setMainlineType('total_under')}
                    className={`p-3 rounded-xl border text-left transition ${
                      mainlineType === 'total_under'
                        ? 'bg-sleeper-accent/15 border-sleeper-accent text-white'
                        : 'bg-sleeper-dark border-sleeper-border text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="text-xs text-sleeper-muted block">Game Total</span>
                    <div className="font-bold text-sm">UNDER {selectedGame.total_under.point}</div>
                    <span className="text-xs font-mono text-sleeper-accent">
                      {selectedGame.total_under.odds}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CUSTOM TAB */}
          {tab === 'custom' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">
                  Target NFL Team Tag
                </label>
                <select
                  value={customTeam}
                  onChange={(e) => setCustomTeam(e.target.value)}
                  className="w-full bg-sleeper-dark border border-sleeper-border rounded-lg p-2.5 text-sm text-white focus:border-sleeper-accent focus:outline-none"
                >
                  {NFL_TEAMS.map(t => (
                    <option key={t.code} value={t.code}>
                      {t.code} - {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">
                  Custom Bet Description
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Lions 1st Half Over 13.5, 49ers +3.5 alt spread..."
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  className="w-full bg-sleeper-dark border border-sleeper-border rounded-lg p-2.5 text-sm text-white focus:border-sleeper-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">
                  American Odds
                </label>
                <input
                  type="text"
                  required
                  placeholder="-110 or +220"
                  value={customOdds}
                  onChange={(e) => setCustomOdds(e.target.value)}
                  className="w-full bg-sleeper-dark border border-sleeper-border rounded-lg p-2.5 text-sm text-white font-mono focus:border-sleeper-accent focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Natural Language Live Ticket Preview */}
          <div className="mt-4 p-3 rounded-xl bg-sleeper-dark border border-sleeper-border flex items-center justify-between">
            <div className="flex items-center space-x-2 min-w-0 pr-2">
              <Sparkles className="w-4 h-4 text-sleeper-accent shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-gray-400 block leading-tight">
                  Ticket Preview
                </span>
                <span className="text-xs font-bold text-white truncate block">
                  {previewLine}
                </span>
              </div>
            </div>
            <div className="shrink-0 px-2 py-1 rounded bg-sleeper-card border border-sleeper-border text-xs font-mono font-bold text-sleeper-accent">
              {previewOdds}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full py-3 bg-sleeper-accent text-black font-extrabold rounded-xl hover:brightness-110 active:scale-[0.99] transition shadow-lg shadow-sleeper-accent/20 flex items-center justify-center space-x-2 text-sm"
          >
            <span>Lock Leg Into Slip</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
