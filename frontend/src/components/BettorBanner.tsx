import React from "react";
import { DollarSign, Flame } from "lucide-react";
import { WeeklyParlay } from "../types";

interface Props {
  parlay: WeeklyParlay;
}

export const BettorBanner: React.FC<Props> = ({ parlay }) => {
  const { bettor } = parlay;

  return (
    <section
      aria-label="Weekly Bettor Spotlight"
      className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-sleeper-card via-sleeper-card to-[#233144] border border-sleeper-border shadow-lg p-4 mb-4"
    >
      {/* Decorative accent glow */}
      <div className="absolute top-0 right-0 -mr-8 -mt-8 w-24 h-24 rounded-full bg-amber-500/10 blur-xl pointer-events-none" />

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center space-x-3.5 min-w-0">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 shrink-0 flex items-center justify-center">
            <Flame className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-bold tracking-wider uppercase text-amber-400">
                Weekly Bettor Spotlight
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400 font-mono">
                Lowest Scorer
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-white mt-0.5 truncate">
              {bettor.team_name}{" "}
              <span className="text-sleeper-muted font-normal">
                ({bettor.owner_name})
              </span>
            </h2>
            <p className="text-xs text-gray-300 mt-1 leading-snug">
              {bettor.points_last_week.toFixed(1)} pts last week
            </p>
          </div>
        </div>

        {/* Consolidated $5.00 Stake Due Badge in top-right corner with subtle borderless fill */}
        <div className="shrink-0">
          <div className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 font-bold text-xs">
            <DollarSign className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Stake Due: $5.00</span>
          </div>
        </div>
      </div>
    </section>
  );
};
