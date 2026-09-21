import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, Dice5, CheckCircle2, CircleDashed, Edit3, ExternalLink } from 'lucide-react';
import { WeeklyParlay, ParlayLeg } from '../types';

interface Props {
  parlay: WeeklyParlay;
  currentRosterId: number | null;
  onOpenPickModal: (leg?: ParlayLeg) => void;
  onOpenDefaultPool?: () => void;
}

export const ParlayCard: React.FC<Props> = ({
  parlay,
  currentRosterId,
  onOpenPickModal,
  onOpenDefaultPool,
}) => {
  const [timeLeft, setTimeLeft] = useState<string>('');

  // Live countdown to earliest kickoff
  useEffect(() => {
    if (!parlay.earliest_kickoff) {
      setTimeLeft('');
      return;
    }

    const updateTimer = () => {
      const target = new Date(parlay.earliest_kickoff!).getTime();
      const now = new Date().getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft('Kickoff Passed');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${minutes}m`);
      } else {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [parlay.earliest_kickoff]);

  const hasTnf = parlay.legs.some(leg => 
    leg.kickoff_time?.includes('T20:15') || 
    (leg.kickoff_time && new Date(leg.kickoff_time).getDay() === 4)
  );

  const formattedKickoff = parlay.earliest_kickoff
    ? new Date(parlay.earliest_kickoff).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="rounded-2xl bg-sleeper-card border border-sleeper-border shadow-xl overflow-hidden mb-6">
      {/* Card Header: Week, Odds, Payout, Status */}
      <div className="p-4 border-b border-sleeper-border bg-gradient-to-b from-[#222E40] to-sleeper-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-black tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-sleeper-accent/15 text-sleeper-accent border border-sleeper-accent/30">
              Week {parlay.week} Slip
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                parlay.status === 'open'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : 'bg-gray-700/40 border-gray-600 text-gray-300'
              }`}
            >
              {parlay.status === 'open' ? '● Open' : '🔒 Locked'}
            </span>
          </div>

          <div className="text-xs text-sleeper-muted font-mono font-medium">
            {parlay.legs.filter(l => l.status === 'submitted').length} / {parlay.legs.length} legs ready
          </div>
        </div>

        {/* Unified 3-Metric Stats Bar */}
        <div className="mt-3.5 grid grid-cols-3 gap-2 p-3 rounded-xl bg-sleeper-dark/90 border border-sleeper-border text-center">
          <div className="border-r border-sleeper-border/70 pr-2">
            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block leading-none mb-1.5">
              Combined Odds
            </span>
            <span className="text-sm sm:text-base font-black font-mono text-white">
              {parlay.actual_odds_american || parlay.estimated_odds_american}
            </span>
          </div>

          <div className="border-r border-sleeper-border/70 px-2">
            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block leading-none mb-1.5">
              Multiplier
            </span>
            <span className="text-sm sm:text-base font-extrabold font-mono text-white">
              {parlay.estimated_multiplier.toFixed(2)}x
            </span>
          </div>

          <div className="pl-2">
            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block leading-none mb-1.5">
              {parlay.actual_payout ? 'Actual Payout' : 'Est. Payout'}
            </span>
            <span className="text-sm sm:text-base font-black font-mono text-sleeper-accent">
              ${parlay.actual_payout?.toFixed(2) || parlay.estimated_payout.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Earliest Kickoff Deadline Banner */}
      {parlay.earliest_kickoff && (
        <div className="px-4 py-2.5 bg-blue-950/40 border-b border-blue-900/50 flex items-center justify-between text-xs text-blue-200">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-blue-400 shrink-0" />
            <span>
              {hasTnf ? (
                <strong>⏳ TNF Leg Included: </strong>
              ) : (
                <strong>Lock Deadline: </strong>
              )}
              {formattedKickoff}
            </span>
          </div>
          {timeLeft && (
            <span className="font-mono font-bold text-blue-300 bg-blue-900/60 px-2 py-0.5 rounded border border-blue-700/50 text-[11px]">
              {timeLeft}
            </span>
          )}
        </div>
      )}

      {/* SGP Amber Alert Badge */}
      {parlay.contains_sgp && (
        <div className="px-4 py-2.5 bg-amber-950/40 border-b border-amber-900/50 flex items-start space-x-2.5 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="leading-snug">
            <strong className="text-amber-300">⚠️ Same Game Parlay Detected: </strong>
            Multiple legs share the same game. Sportsbooks discount correlated odds; check your betting app for actual payout.
          </div>
        </div>
      )}

      {/* Legs List */}
      <div className="divide-y divide-sleeper-border/60">
        {parlay.legs.map((leg, index) => {
          const isCurrentUserLeg = currentRosterId !== null && leg.roster_id === currentRosterId;
          const isSubmitted = leg.status === 'submitted';

          return (
            <div
              key={leg.id || `leg-${index}`}
              className={`p-3.5 flex items-center justify-between transition ${
                isCurrentUserLeg ? 'bg-sleeper-accent/5' : 'hover:bg-white/[0.02]'
              } ${!isSubmitted ? 'opacity-70 hover:opacity-90 bg-white/[0.01]' : ''}`}
            >
              <div className="flex items-start space-x-3 min-w-0 pr-2">
                <div className="mt-0.5 shrink-0">
                  {isSubmitted ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <CircleDashed className="w-4 h-4 text-amber-400/80 animate-pulse" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    <span className={`text-xs font-bold truncate ${isSubmitted ? 'text-white' : 'text-gray-300'}`}>
                      {leg.owner_name}
                    </span>
                    <span className="text-[10px] text-sleeper-muted truncate">
                      ({leg.team_name})
                    </span>

                    {/* Auto-Rolled Default Badge */}
                    {leg.is_default_roll && (
                      <span 
                        title="Auto-rolled from fallback default pool" 
                        aria-label="Auto-rolled from fallback default pool"
                        className="inline-flex items-center justify-center p-1 rounded bg-purple-900/50 border border-purple-600/60 text-purple-300 hover:bg-purple-800/60 transition cursor-help"
                      >
                        <Dice5 className="w-3.5 h-3.5 text-purple-300" />
                        <span className="sr-only">Auto-rolled from default pool</span>
                      </span>
                    )}

                    {isCurrentUserLeg && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-sleeper-accent/20 text-sleeper-accent">
                        You
                      </span>
                    )}
                  </div>

                  <p className={`text-xs mt-1 leading-snug break-words ${
                    isSubmitted ? 'font-medium text-gray-200' : 'italic text-gray-400 font-normal'
                  }`}>
                    {leg.description}
                  </p>
                </div>
              </div>

              {/* Odds & Edit Action */}
              <div className="flex items-center space-x-2 shrink-0">
                {isSubmitted ? (
                  <span className="font-mono text-xs font-bold px-2 py-1 rounded bg-sleeper-dark border border-sleeper-border text-sleeper-accent">
                    {leg.odds_american}
                  </span>
                ) : (
                  <span 
                    title="Waiting for pick submission (will snap from fallback default pool if deadline passes)"
                    className="font-mono text-[11px] font-medium px-2 py-0.5 rounded bg-sleeper-dark/40 border border-dashed border-gray-700 text-gray-400"
                  >
                    TBD
                  </span>
                )}

                {parlay.status === 'open' && isCurrentUserLeg && (
                  <button
                    type="button"
                    onClick={() => onOpenPickModal(leg)}
                    className="p-1.5 rounded-lg bg-sleeper-dark border border-sleeper-border text-gray-300 hover:text-white hover:border-sleeper-accent transition"
                    title="Edit Your Leg"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sportsbook Share Link if available */}
      {parlay.sportsbook_url && (
        <div className="p-3 bg-sleeper-dark/60 border-t border-sleeper-border text-center">
          <a
            href={parlay.sportsbook_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1.5 text-xs text-sleeper-accent hover:underline font-semibold"
          >
            <span>View Ticket on Sportsbook</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Fallback Pool Manager Trigger */}
      {onOpenDefaultPool && (
        <div className="px-4 py-2.5 bg-sleeper-dark/90 border-t border-sleeper-border flex items-center justify-between text-xs">
          <span className="text-gray-400">Can't submit before kickoff?</span>
          <button
            type="button"
            onClick={onOpenDefaultPool}
            className="text-sleeper-accent hover:underline font-bold flex items-center space-x-1"
          >
            <Dice5 className="w-3.5 h-3.5" />
            <span>Manage Fallback Pool</span>
          </button>
        </div>
      )}
    </div>
  );
};
