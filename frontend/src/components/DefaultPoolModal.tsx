import React, { useState } from 'react';
import { X, Plus, Trash2, Dice5, AlertCircle, Sparkles } from 'lucide-react';
import { DefaultLeg, ActivePlayer, MarketType } from '../types';
import { PlayerSearchInput } from './PlayerSearchInput';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultLegs: DefaultLeg[];
  onSaveDefaults: (legs: DefaultLeg[]) => void;
  activePlayers: ActivePlayer[];
  teamName: string;
  byeTeams?: string[];
}

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

export const DefaultPoolModal: React.FC<Props> = ({
  isOpen,
  onClose,
  defaultLegs: initialLegs,
  onSaveDefaults,
  activePlayers,
  teamName,
  byeTeams = ['CAR', 'CLE'], // sample bye teams
}) => {
  const [legs, setLegs] = useState<DefaultLeg[]>(initialLegs);
  const [simulatedRoll, setSimulatedRoll] = useState<{
    slot: DefaultLeg;
    snappedDescription: string;
    odds: string;
  } | null>(null);

  // New slot form state
  const [isAdding, setIsAdding] = useState(false);
  const [newType, setNewType] = useState<MarketType>('spread');
  const [newTeam, setNewTeam] = useState('PHI');
  const [selectedPlayer, setSelectedPlayer] = useState<ActivePlayer | null>(null);
  const [playerPropOption, setPlayerPropOption] = useState('Anytime TD');

  if (!isOpen) return null;

  const handleRemove = (id: string) => {
    setLegs(legs.filter(l => l.id !== id));
  };

  const handleAddSlot = () => {
    if (legs.length >= 5) return;

    let template = '';
    let nflTeam = newTeam;
    let playerName: string | undefined = undefined;

    if (newType === 'player_prop') {
      if (!selectedPlayer) return;
      nflTeam = selectedPlayer.team;
      playerName = selectedPlayer.name;
      template = `${selectedPlayer.name} ${playerPropOption}`;
    } else if (newType === 'spread') {
      template = `${nflTeam} Spread`;
    } else if (newType === 'moneyline') {
      template = `${nflTeam} Moneyline`;
    } else {
      template = `${nflTeam} Game Total Over`;
    }

    const newLeg: DefaultLeg = {
      id: `def_${Date.now()}`,
      nfl_team: nflTeam,
      market_type: newType,
      player_name: playerName,
      description_template: template,
    };

    setLegs([...legs, newLeg]);
    setIsAdding(false);
    setSelectedPlayer(null);
  };

  // 🎲 Test Random Roll simulator showing dynamic line snapping
  const handleTestRoll = () => {
    // 1. Filter out teams on bye
    const eligible = legs.filter(l => !byeTeams.includes(l.nfl_team));
    if (eligible.length === 0) {
      alert('All your fallback legs are on bye this week! Add another team.');
      return;
    }

    // 2. Pick random eligible slot
    const picked = eligible[Math.floor(Math.random() * eligible.length)];

    // 3. Simulate dynamic line snapping
    let snapped = '';
    let odds = '-110';
    if (picked.market_type === 'spread') {
      snapped = `${picked.nfl_team} -3.5 Spread`;
      odds = '-110';
    } else if (picked.market_type === 'moneyline') {
      snapped = `${picked.nfl_team} Moneyline`;
      odds = '-135';
    } else if (picked.market_type === 'game_total') {
      snapped = `${picked.nfl_team} Game Total OVER 46.5`;
      odds = '-110';
    } else {
      snapped = `${picked.description_template}`;
      odds = '-115';
    }

    setSimulatedRoll({
      slot: picked,
      snappedDescription: snapped,
      odds,
    });
  };

  const handleSave = () => {
    if (legs.length < 3 || legs.length > 5) {
      alert('You must configure between 3 and 5 fallback slots.');
      return;
    }
    onSaveDefaults(legs);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fadeIn">
      <div className="bg-sleeper-card border border-sleeper-border rounded-2xl w-full max-w-lg sm:max-w-xl lg:max-w-2xl overflow-hidden shadow-2xl my-auto">
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-sleeper-border bg-sleeper-card">
          <div>
            <div className="text-[11px] font-bold text-sleeper-accent uppercase tracking-wider">
              {teamName}
            </div>
            <h3 className="text-base font-bold text-white flex items-center space-x-1.5">
              <Dice5 className="w-5 h-5 text-purple-400" />
              <span>Intent-Based Default Legs Pool</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <p className="text-xs text-gray-300 leading-relaxed">
            Configure <strong>3 to 5 permanent fallback rules</strong>. If you miss the kickoff deadline, the system rolls an eligible slot, automatically skipping bye weeks and snapping to the active week line.
          </p>

          {/* Fallback Slots List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-300 uppercase tracking-wide">
                Configured Slots ({legs.length}/5)
              </span>
              {legs.length < 3 && (
                <span className="text-[11px] font-semibold text-amber-400 flex items-center space-x-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Minimum 3 required</span>
                </span>
              )}
            </div>

            {legs.map((leg, idx) => {
              const isBye = byeTeams.includes(leg.nfl_team);
              return (
                <div
                  key={leg.id}
                  className="p-3 rounded-xl bg-sleeper-dark border border-sleeper-border flex items-center justify-between text-xs"
                >
                  <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                    <span className="w-5 h-5 rounded-full bg-sleeper-card border border-sleeper-border flex items-center justify-center font-mono font-bold text-sleeper-muted text-[10px] shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate">
                        {leg.description_template}
                      </div>
                      <div className="flex items-center space-x-2 mt-0.5">
                        <span className="text-[10px] font-mono text-sleeper-muted">
                          {leg.nfl_team} • {leg.market_type.replace('_', ' ').toUpperCase()}
                        </span>
                        {isBye ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-950/60 text-amber-400 border border-amber-800">
                            Bye Week (Auto-Skipped)
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800">
                            Active This Week
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemove(leg.id)}
                    className="text-gray-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5 transition shrink-0"
                    title="Remove slot"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add Slot Form */}
          {isAdding ? (
            <div className="p-4 rounded-xl bg-sleeper-dark/90 border border-sleeper-accent/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Add Fallback Rule</span>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="text-gray-400 hover:text-white text-xs"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                  Intent Type
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['spread', 'moneyline', 'game_total', 'player_prop'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewType(t)}
                      className={`py-1.5 px-2 text-xs font-bold rounded-lg border text-center transition capitalize ${
                        newType === t
                          ? 'bg-sleeper-accent text-black border-sleeper-accent'
                          : 'bg-sleeper-card text-gray-300 border-sleeper-border'
                      }`}
                    >
                      {t.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {newType === 'player_prop' ? (
                <>
                  <PlayerSearchInput
                    players={activePlayers}
                    selectedPlayer={selectedPlayer}
                    onSelectPlayer={(p) => setSelectedPlayer(p)}
                  />
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                      Prop Goal
                    </label>
                    <select
                      value={playerPropOption}
                      onChange={(e) => setPlayerPropOption(e.target.value)}
                      className="w-full bg-sleeper-card border border-sleeper-border rounded-lg p-2 text-xs text-white"
                    >
                      <option value="Anytime TD">Anytime TD</option>
                      <option value="Over Rush Yds">Over Rush Yds</option>
                      <option value="Over Rec Yds">Over Rec Yds</option>
                      <option value="Over Pass Yds">Over Pass Yds</option>
                    </select>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                    NFL Team
                  </label>
                  <select
                    value={newTeam}
                    onChange={(e) => setNewTeam(e.target.value)}
                    className="w-full bg-sleeper-card border border-sleeper-border rounded-lg p-2 text-xs text-white"
                  >
                    {NFL_TEAMS.map(t => (
                      <option key={t.code} value={t.code}>
                        {t.code} - {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                onClick={handleAddSlot}
                className="w-full py-2 bg-sleeper-accent text-black font-bold rounded-lg text-xs hover:brightness-110 transition"
              >
                Confirm Fallback Slot
              </button>
            </div>
          ) : (
            legs.length < 5 && (
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="w-full py-2.5 border border-dashed border-sleeper-border hover:border-sleeper-accent text-gray-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5"
              >
                <Plus className="w-4 h-4 text-sleeper-accent" />
                <span>Add Fallback Slot ({5 - legs.length} remaining)</span>
              </button>
            )
          )}

          {/* 🎲 Interactive Roll Simulator */}
          <div className="pt-2 border-t border-sleeper-border/60">
            <button
              type="button"
              onClick={handleTestRoll}
              className="w-full py-2.5 bg-purple-900/40 border border-purple-500/50 hover:bg-purple-800/40 text-purple-200 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-2"
            >
              <Dice5 className="w-4 h-4 text-purple-300 animate-bounce" />
              <span>🎲 Test Random Roll Simulator</span>
            </button>

            {simulatedRoll && (
              <div className="mt-3 p-3.5 rounded-xl bg-purple-950/50 border border-purple-500/60 animate-fadeIn">
                <div className="flex items-center justify-between text-purple-300 text-[11px] font-bold uppercase mb-1">
                  <span className="flex items-center space-x-1">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span>Dynamic Line Snapped:</span>
                  </span>
                  <span className="font-mono text-purple-200">{simulatedRoll.odds}</span>
                </div>
                <div className="text-sm font-extrabold text-white">
                  {simulatedRoll.snappedDescription}
                </div>
                <div className="text-[10px] text-purple-300/80 mt-1">
                  Rolled from slot "{simulatedRoll.slot.description_template}" (Bye week teams skipped).
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-sleeper-border bg-sleeper-card flex items-center space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-sleeper-dark border border-sleeper-border text-xs font-bold text-gray-300 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={legs.length < 3 || legs.length > 5}
            className="flex-1 py-2.5 rounded-xl bg-sleeper-accent text-black font-extrabold text-xs hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Fallback Pool
          </button>
        </div>
      </div>
    </div>
  );
};
