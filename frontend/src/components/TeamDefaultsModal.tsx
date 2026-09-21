import React, { useEffect } from 'react';
import { X, AlertTriangle, Dice5, Edit3, PlusCircle } from 'lucide-react';
import { TeamProfile, MarketType } from '../types';
import { getTeamDefaults, isTeamMissingDefaults, isLegOnBye } from '../utils/defaultPoolUtils';

export interface TeamDefaultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  team: TeamProfile | null;
  isCurrentUser: boolean;
  onEditPool?: () => void;
  byeTeams?: string[];
}

function formatMarketType(type: MarketType | string): string {
  switch (type) {
    case 'spread':
      return 'Spread';
    case 'moneyline':
      return 'Moneyline';
    case 'player_prop':
      return 'Player Prop';
    case 'game_total':
      return 'Total';
    default:
      return type ? type.replace('_', ' ').toUpperCase() : 'Custom';
  }
}

export const TeamDefaultsModal: React.FC<TeamDefaultsModalProps> = ({
  isOpen,
  onClose,
  team,
  isCurrentUser,
  onEditPool,
  byeTeams = [],
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !team) return null;

  const defaults = getTeamDefaults(team);
  const isMissing = isTeamMissingDefaults(team);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-defaults-title"
    >
      <div
        className="bg-sleeper-card border border-sleeper-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl my-auto text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex justify-between items-start px-5 py-4 border-b border-sleeper-border bg-gradient-to-b from-[#222E40] to-sleeper-card">
          <div className="min-w-0 pr-3">
            <div className="flex items-center space-x-2">
              <Dice5 className="w-5 h-5 text-purple-400 shrink-0" />
              <h3
                id="team-defaults-title"
                className="text-base font-bold text-white truncate"
              >
                {team.team_name}
              </h3>
              <span className="text-xs text-sleeper-muted truncate hidden sm:inline">
                ({team.owner_name})
              </span>
            </div>
            <div className="sm:hidden text-xs text-sleeper-muted truncate mt-0.5">
              Owner: {team.owner_name}
            </div>

            {/* Subtitle / Status Badge */}
            <div className="mt-2 flex items-center space-x-2">
              {!isMissing ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-900/40 text-purple-300 border border-purple-800/50">
                  {defaults.length} Fallback {defaults.length === 1 ? 'Rule' : 'Rules'} Configured
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/40">
                  <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>No Fallback Rules Configured</span>
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition min-w-[44px] min-h-[44px] flex items-center justify-center -mr-1 shrink-0"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {!isMissing ? (
            <div className="space-y-2.5">
              <div className="text-xs text-sleeper-muted flex justify-between items-center mb-1">
                <span>Priority Order</span>
                <span className="text-[11px]">Auto-rolled in order on kickoff deadline</span>
              </div>
              {defaults.map((leg, idx) => {
                const onBye = isLegOnBye(leg, byeTeams);
                return (
                  <div
                    key={leg.id || idx}
                    className="p-3 rounded-xl bg-sleeper-dark border border-sleeper-border flex items-center justify-between text-xs transition hover:border-sleeper-border/80"
                  >
                    <div className="flex items-center space-x-3 min-w-0 pr-2">
                      <span className="w-6 h-6 rounded-full bg-sleeper-card border border-sleeper-border flex items-center justify-center font-mono font-bold text-sleeper-muted text-[11px] shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate">
                          {leg.description_template}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sleeper-card border border-sleeper-border text-sleeper-accent font-bold">
                            {leg.nfl_team}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sleeper-card/80 border border-sleeper-border text-gray-300">
                            {formatMarketType(leg.market_type)}
                          </span>
                          {onBye ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/80 flex items-center space-x-1">
                              <span>BYE</span>
                              <span className="text-[9px] font-normal opacity-90">(Auto-Skipped)</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/70">
                              Active This Week
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-6 px-4 text-center flex flex-col items-center justify-center space-y-3 rounded-xl bg-sleeper-dark/60 border border-sleeper-border/60">
              <div className="p-3 rounded-full bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-10 h-10 text-amber-400" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h4 className="text-sm font-bold text-white">Missing Fallback Pool</h4>
                <p className="text-xs text-gray-300 leading-relaxed">
                  <strong className="text-amber-300">{team.owner_name}</strong> has not configured any fallback picks. If this team does not submit a pick before kickoff, the automated finalization will not have a fallback rule to roll for this leg.
                </p>
              </div>
              {isCurrentUser && onEditPool && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEditPool();
                  }}
                  className="mt-2 min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold bg-amber-400 hover:bg-amber-300 text-black shadow-lg shadow-amber-400/20 transition flex items-center space-x-2"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Set Up My Pool</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-sleeper-border bg-sleeper-card flex items-center justify-end space-x-3">
          {isCurrentUser && onEditPool && !isMissing && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEditPool();
              }}
              className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold bg-sleeper-accent hover:bg-sleeper-accent/90 text-black transition flex items-center space-x-1.5"
            >
              <Edit3 className="w-4 h-4" />
              <span>Edit My Pool</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold text-gray-300 hover:text-white bg-sleeper-dark hover:bg-white/10 border border-sleeper-border transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
