import React from 'react';
import { DollarSign, AlertCircle } from 'lucide-react';
import { WeeklyParlay } from '../types';

interface Props {
  parlay: WeeklyParlay;
}

export const BettorBanner: React.FC<Props> = ({ parlay }) => {
  const { bettor } = parlay;

  return (
    <section 
      aria-label="Weekly Bettor Spotlight"
      className="relative overflow-hidden rounded-xl bg-gradient-to-r from-sleeper-card via-sleeper-card to-[#233144] border border-sleeper-border shadow-lg p-4 mb-4"
    >
      {/* Decorative accent glow */}
      <div className="absolute top-0 right-0 -mr-8 -mt-8 w-24 h-24 rounded-full bg-sleeper-accent/10 blur-xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center space-x-3.5">
          <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-bold tracking-wider uppercase text-red-400">
                Weekly Bettor Spotlight
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-300 font-mono">
                Lowest Scorer
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-white mt-0.5">
              {bettor.team_name}{' '}
              <span className="text-sleeper-muted font-normal">({bettor.owner_name})</span>
            </h2>
            <div className="flex items-center space-x-2 mt-1 text-xs text-gray-300 flex-wrap">
              <span className="font-mono text-red-300 font-bold bg-red-950/50 px-1.5 py-0.5 rounded border border-red-800/40">
                {bettor.points_last_week.toFixed(1)} pts
              </span>
              <span className="text-gray-400">prior week</span>
              <span className="text-gray-600">•</span>
              <span className="text-gray-300">On the hook for this week's parlay ticket</span>
            </div>
          </div>
        </div>

        <div className="shrink-0 flex sm:flex-col items-start sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-white/5 pt-2 sm:pt-0">
          <div className="flex items-center space-x-1 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold text-xs">
            <DollarSign className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Stake Due: $5.00</span>
          </div>
          <span className="text-[10px] text-sleeper-muted mt-1">1 leg per member</span>
        </div>
      </div>
    </section>
  );
};
