import React from 'react';

export interface LeagueSkeletonProps {
  showHeader?: boolean;
  legCount?: number;
  className?: string;
}

export const HeaderSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    data-testid="header-skeleton"
    className={`flex items-center justify-between mb-4 p-3 rounded-2xl bg-sleeper-card/60 border border-sleeper-border/60 backdrop-blur-sm ${className}`}
  >
    <div className="flex items-center space-x-2.5 min-w-0">
      <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/5 shrink-0" />
      <div className="space-y-1.5 min-w-0">
        <div className="h-4 w-32 sm:w-44 bg-white/10 rounded" />
        <div className="h-3 w-20 sm:w-28 bg-white/5 rounded" />
      </div>
    </div>
    <div className="flex items-center space-x-2 shrink-0">
      <div className="h-8 w-20 sm:w-24 rounded-xl bg-white/5 border border-white/5" />
      <div className="h-8 w-24 sm:w-28 rounded-xl bg-white/5 border border-white/5" />
    </div>
  </div>
);

export const BettorSpotlightSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <section
    data-testid="bettor-spotlight-skeleton"
    aria-label="Loading Bettor Spotlight"
    className={`relative overflow-hidden rounded-2xl bg-gradient-to-r from-sleeper-card via-sleeper-card to-[#233144] border border-sleeper-border shadow-lg p-4 mb-4 ${className}`}
  >
    {/* Subtle decorative glow */}
    <div className="absolute top-0 right-0 -mr-8 -mt-8 w-24 h-24 rounded-full bg-amber-500/5 blur-xl pointer-events-none" />

    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center space-x-3.5 min-w-0 flex-1">
        {/* Flame placeholder icon */}
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/15 shrink-0 flex items-center justify-center text-amber-400/30">
          <span className="text-lg">🔥</span>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center space-x-2">
            <div className="h-3 w-28 sm:w-32 bg-amber-400/20 rounded" />
            <div className="h-3 w-16 bg-white/5 rounded" />
          </div>
          {/* Pulsing gradient placeholder for title and bettor */}
          <div className="h-5 sm:h-6 w-44 sm:w-60 bg-gradient-to-r from-white/15 via-white/10 to-white/5 rounded-lg" />
          {/* Stake description placeholder */}
          <div className="h-3.5 w-48 sm:w-64 bg-white/5 rounded" />
        </div>
      </div>

      {/* Stake due badge placeholder */}
      <div className="shrink-0">
        <div className="h-7 w-28 rounded-full bg-emerald-500/10 border border-emerald-500/15" />
      </div>
    </div>
  </section>
);

export const ParlayCardSkeleton: React.FC<{ legCount?: number; className?: string }> = ({
  legCount = 5,
  className = '',
}) => (
  <div
    data-testid="parlay-card-skeleton"
    aria-label="Loading Weekly Parlay"
    className={`rounded-2xl bg-sleeper-card border border-sleeper-border shadow-xl overflow-hidden mb-6 ${className}`}
  >
    {/* Card Header Skeleton */}
    <div className="p-4 border-b border-sleeper-border bg-gradient-to-b from-[#222E40] to-sleeper-card">
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center space-x-2.5">
          <div className="h-6 w-36 sm:w-44 bg-white/10 rounded-lg" />
          <div className="h-4 w-16 bg-white/5 rounded-full" />
        </div>
        <div className="h-6 w-28 bg-sleeper-dark rounded-lg border border-sleeper-border/60" />
      </div>

      {/* Progress Bar Placeholder */}
      <div className="mt-3.5">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <div className="h-3 w-28 bg-white/5 rounded" />
          <div className="h-3 w-20 bg-white/5 rounded" />
        </div>
        <div className="w-full bg-sleeper-dark/90 rounded-full h-2 overflow-hidden border border-white/5">
          <div className="bg-gradient-to-r from-sleeper-accent/30 to-emerald-400/30 h-full w-2/5 rounded-full" />
        </div>
      </div>

      {/* 4-Metric Grid Placeholder */}
      <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-xl bg-sleeper-dark/90 border border-sleeper-border/60 text-center">
        <div className="border-r border-sleeper-border/70 pr-2">
          <div className="h-2.5 w-16 mx-auto bg-white/5 rounded mb-1.5" />
          <div className="h-5 w-16 mx-auto bg-white/10 rounded" />
        </div>
        <div className="sm:border-r border-sleeper-border/70 px-2">
          <div className="h-2.5 w-16 mx-auto bg-white/5 rounded mb-1.5" />
          <div className="h-5 w-12 mx-auto bg-white/10 rounded" />
        </div>
        <div className="border-r border-sleeper-border/70 pr-2 sm:px-2 pt-2 sm:pt-0 border-t sm:border-t-0">
          <div className="h-2.5 w-16 mx-auto bg-white/5 rounded mb-1.5" />
          <div className="h-5 w-14 mx-auto bg-sleeper-accent/20 rounded" />
        </div>
        <div className="pl-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-sleeper-border/70">
          <div className="h-2.5 w-20 mx-auto bg-white/5 rounded mb-1.5" />
          <div className="h-5 w-14 mx-auto bg-emerald-400/20 rounded" />
        </div>
      </div>
    </div>

    {/* Earliest Kickoff Placeholder Banner */}
    <div className="px-4 py-2.5 bg-blue-950/20 border-b border-blue-900/30 flex items-center justify-between text-xs">
      <div className="h-3.5 w-44 sm:w-56 bg-blue-400/10 rounded" />
      <div className="h-4 w-16 bg-blue-400/10 rounded" />
    </div>

    {/* Leg Row Placeholders */}
    <div className="divide-y divide-sleeper-border/60">
      {Array.from({ length: legCount }).map((_, index) => (
        <div
          key={`skeleton-leg-${index}`}
          data-testid="skeleton-leg-row"
          className="p-3.5 flex items-center justify-between bg-white/[0.01]"
        >
          <div className="flex items-start space-x-3 min-w-0 pr-2 flex-1">
            {/* Status indicator placeholder */}
            <div className="w-4 h-4 rounded-full bg-white/10 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-1.5">
              {/* Team name + owner placeholder */}
              <div className="h-3.5 w-28 sm:w-40 bg-white/10 rounded" />
              {/* Team logo + description row placeholder */}
              <div className="flex items-center space-x-1.5">
                <div className="w-6 h-6 rounded-full bg-white/5 border border-white/5 shrink-0" />
                <div className="h-3 w-40 sm:w-64 bg-white/5 rounded" />
              </div>
            </div>
          </div>

          {/* Odds badge placeholder */}
          <div className="shrink-0 pl-3">
            <div className="h-6 w-14 rounded bg-sleeper-dark border border-sleeper-border/60" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const LeagueSkeleton: React.FC<LeagueSkeletonProps> = ({
  showHeader = true,
  legCount = 5,
  className = '',
}) => {
  return (
    <div
      data-testid="league-skeleton"
      className={`animate-pulse space-y-4 ${className}`}
      aria-busy="true"
      aria-label="Loading league parlay details"
    >
      {showHeader && <HeaderSkeleton />}
      <BettorSpotlightSkeleton />
      <ParlayCardSkeleton legCount={legCount} />
    </div>
  );
};

export default LeagueSkeleton;
