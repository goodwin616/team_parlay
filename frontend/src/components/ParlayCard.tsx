import React, { useState, useEffect } from 'react';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Edit3,
  ExternalLink,
  Info,
  PlusCircle,
  Bell,
  BellRing,
} from 'lucide-react';
import { WeeklyParlay, ParlayLeg } from '../types';
import { formatOddsWithCents, formatComboOdds, OddsFormat } from '../utils/parlayMath';
import { TeamLogo } from '../utils/nflTeams';
import { SleeperChatExport } from './SleeperChatExport';

interface Props {
  parlay: WeeklyParlay;
  currentRosterId: number | null;
  onOpenPickModal: (leg: ParlayLeg) => void;
  oddsFormat?: OddsFormat;
  onToggleOddsFormat?: (format: OddsFormat) => void;
}

export const ParlayCard: React.FC<Props> = ({
  parlay,
  currentRosterId,
  onOpenPickModal,
  oddsFormat = 'american',
  onToggleOddsFormat,
}) => {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [showEstimateInfo, setShowEstimateInfo] = useState<boolean>(false);
  const [nudgedLegs, setNudgedLegs] = useState<Record<string | number, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const handleNudge = (leg: ParlayLeg) => {
    const key = leg.id || leg.roster_id;
    setNudgedLegs(prev => ({ ...prev, [key]: true }));
    setToastMessage(`Nudge sent! Reminded ${leg.owner_name}`);
  };

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

  const submittedCount = parlay.legs.filter(l => l.status === 'submitted').length;
  const isOfficialQuote = Boolean(parlay.actual_payout || parlay.actual_odds_american);
  const totalPayout = parlay.actual_payout ?? parlay.estimated_payout;
  const payoutPerPlayer = submittedCount > 0 ? totalPayout / submittedCount : 0;

  // Pin current user's leg to the top of the list so it's always immediately accessible
  const orderedLegs = [...parlay.legs].sort((a, b) => {
    const aIsUser = currentRosterId !== null && a.roster_id === currentRosterId ? 0 : 1;
    const bIsUser = currentRosterId !== null && b.roster_id === currentRosterId ? 0 : 1;
    return aIsUser - bIsUser;
  });

  const hasTnf = parlay.legs.some(
    leg =>
      leg.status === 'submitted' &&
      (leg.kickoff_time?.includes('T20:15') ||
        (leg.kickoff_time && new Date(leg.kickoff_time).getDay() === 4))
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
      {/* Card Header: Week, Kalshi Combo Odds, Payout, Status */}
      <div className="p-4 border-b border-sleeper-border bg-gradient-to-b from-[#222E40] to-sleeper-card">
        {/* Top Header Row: H2 Week Heading + Inline Estimate Badge on Left, Odds Format Toggle on Right */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center space-x-2.5">
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight uppercase leading-none">
              Week {parlay.week} Parlay
            </h2>
            {isOfficialQuote ? (
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300"
                title="Verified quote from placed combo ticket"
              >
                Official Quote
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setShowEstimateInfo(prev => !prev)}
                aria-expanded={showEstimateInfo}
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full inline-flex items-center space-x-1 transition cursor-pointer ${
                  showEstimateInfo
                    ? 'bg-amber-500/25 text-amber-200'
                    : 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                }`}
                title="Click to see how this estimate is calculated"
              >
                <Info className="w-3 h-3 shrink-0" />
                <span>Estimate</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2.5">
            {onToggleOddsFormat && (
              <div
                className="inline-flex rounded-lg bg-sleeper-dark p-0.5 border border-sleeper-border/60 text-[10px] font-bold shrink-0"
                title="Switch between American Odds (-110) and Percentage Odds (52%)"
              >
                <button
                  type="button"
                  onClick={() => onToggleOddsFormat('american')}
                  className={`px-2 py-0.5 rounded-md transition ${
                    oddsFormat === 'american'
                      ? 'bg-sleeper-accent text-black font-extrabold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  American
                </button>
                <button
                  type="button"
                  onClick={() => onToggleOddsFormat('percentage')}
                  className={`px-2 py-0.5 rounded-md transition ${
                    oddsFormat === 'percentage'
                      ? 'bg-sleeper-accent text-black font-extrabold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  % Odds
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sleek Horizontal Progress Bar spanning card width for submitted picks */}
        <div className="mt-3.5">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Picks Submitted
            </span>
            <span className="text-xs text-sleeper-muted font-mono font-bold">
              {submittedCount} / {parlay.legs.length} picks in
            </span>
          </div>
          <div className="w-full bg-sleeper-dark/90 rounded-full h-2 overflow-hidden border border-white/5">
            <div
              className="bg-gradient-to-r from-sleeper-accent to-emerald-400 h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${Math.min(
                  100,
                  Math.round((submittedCount / (parlay.legs.length || 1)) * 100)
                )}%`,
              }}
              role="progressbar"
              aria-valuenow={submittedCount}
              aria-valuemin={0}
              aria-valuemax={parlay.legs.length}
              aria-label={`${submittedCount} / ${parlay.legs.length} picks in`}
            />
          </div>
        </div>

        {/* Unified 4-Metric Stats Bar with clarified payout math */}
        <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-xl bg-sleeper-dark/90 border border-sleeper-border/60 text-center">
          <div className="border-r border-sleeper-border/70 pr-2">
            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block leading-none mb-1.5">
              {isOfficialQuote ? 'Combo Odds' : 'Est. Combo Odds'}
            </span>
            <span className="text-sm sm:text-base font-black font-mono text-white">
              {formatComboOdds(
                parlay.actual_odds_american || parlay.estimated_odds_american,
                parlay.estimated_multiplier,
                parlay.combined_probability_cents,
                oddsFormat
              )}
            </span>
          </div>

          <div className="sm:border-r border-sleeper-border/70 px-2">
            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block leading-none mb-1.5">
              {isOfficialQuote ? 'Multiplier' : 'Est. Multiplier'}
            </span>
            <span className="text-sm sm:text-base font-extrabold font-mono text-white">
              {parlay.estimated_multiplier.toFixed(2)}x
            </span>
          </div>

          <div className="border-r border-sleeper-border/70 pr-2 sm:px-2 pt-2 sm:pt-0 border-t sm:border-t-0">
            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block leading-none mb-1.5">
              {isOfficialQuote ? 'Total Payout' : 'Est. Total Payout'}
            </span>
            <span className="text-sm sm:text-base font-black font-mono text-sleeper-accent">
              ${totalPayout.toFixed(2)}
            </span>
          </div>

          <div className="pl-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-sleeper-border/70">
            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block leading-none mb-1.5">
              {isOfficialQuote ? 'Payout / Player' : 'Est. Payout / Player'}
            </span>
            <span className="text-sm sm:text-base font-black font-mono text-emerald-400">
              ${payoutPerPlayer.toFixed(2)}
            </span>
            <span className="text-[10px] text-sleeper-muted font-mono block mt-0.5">
              ÷ {submittedCount || parlay.legs.length} active
            </span>
          </div>
        </div>

        {!isOfficialQuote && showEstimateInfo && (
          <p className="mt-2.5 px-2.5 py-2 rounded-lg bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-200/90 leading-relaxed animate-fadeIn">
            * Estimated via independent leg math (not Kalshi&apos;s live RFQ combo calculator). Final payout may vary with market spread or SGP correlation.
          </p>
        )}
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
                <strong>Submission Deadline: </strong>
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

      {/* Same-Game Combo Alert Badge */}
      {parlay.contains_sgp && (
        <div className="px-4 py-2.5 bg-amber-950/40 border-b border-amber-900/50 flex items-start space-x-2.5 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="leading-snug">
            <strong className="text-amber-300">⚠️ Same-Game Combo Detected: </strong>
            Multiple legs share the same matchup. Kalshi RFQ combo quotes adjust pricing for correlated outcomes.
          </div>
        </div>
      )}

      {/* Legs List (Current user's leg pinned first with inline action CTA) */}
      <div className="divide-y divide-sleeper-border/60">
        {orderedLegs.map((leg, index) => {
          const isCurrentUserLeg = currentRosterId !== null && leg.roster_id === currentRosterId;
          const isSubmitted = leg.status === 'submitted';
          const canEdit = parlay.status === 'open' && isCurrentUserLeg;

          return (
            <div
              key={leg.id || `leg-${index}`}
              role={canEdit ? 'button' : undefined}
              tabIndex={canEdit ? 0 : undefined}
              onKeyDown={
                canEdit
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenPickModal(leg);
                      }
                    }
                  : undefined
              }
              onClick={canEdit ? () => onOpenPickModal(leg) : undefined}
              className={`p-3.5 flex items-center justify-between transition ${
                canEdit ? 'cursor-pointer hover:bg-sleeper-accent/15 active:scale-[0.995]' : ''
              } ${
                isCurrentUserLeg
                  ? 'bg-sleeper-accent/[0.08]'
                  : 'hover:bg-white/[0.02]'
              }`}
              title={canEdit ? 'Tap to submit or edit your weekly pick' : undefined}
            >
              <div className="flex items-start space-x-3 min-w-0 pr-2">
                <div className="mt-0.5 shrink-0">
                  {isSubmitted ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <CircleDashed className="w-4 h-4 text-amber-400 animate-pulse" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-1.5 flex-wrap gap-y-0.5">
                    <span className="text-xs font-bold text-white truncate">
                      {leg.team_name}
                    </span>
                    <span className="text-[11px] text-sleeper-muted truncate">
                      ({leg.owner_name})
                    </span>

                    {isCurrentUserLeg && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-sleeper-accent/15 text-sleeper-accent text-[10px] font-bold">
                        (You)
                      </span>
                    )}
                  </div>

                  {isSubmitted && (
                    <div className="text-xs mt-1 leading-snug break-words flex items-center space-x-1.5 font-medium text-gray-200">
                      {leg.nfl_team && leg.nfl_team !== 'NFL' && (
                        <TeamLogo team={leg.nfl_team} size="sm" />
                      )}
                      <span>{leg.description}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Odds Badge + Submit/Edit CTA for Current User or Nudge for Pending */}
              <div className="shrink-0 flex items-center justify-end space-x-2 pl-3">
                {isSubmitted ? (
                  <>
                    {canEdit && (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-sleeper-accent text-black text-xs font-extrabold shadow-sm hover:brightness-110 transition">
                        <Edit3 className="w-3 h-3" />
                        <span>Edit</span>
                      </span>
                    )}
                    <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-sleeper-dark border border-sleeper-border text-sleeper-accent shadow-sm whitespace-nowrap">
                      {formatOddsWithCents(leg.odds_american, leg.price_cents, oddsFormat)}
                    </span>
                  </>
                ) : canEdit ? (
                  <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-sleeper-accent text-black text-xs font-black shadow-md shadow-sleeper-accent/20 hover:brightness-110 transition">
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Submit Pick</span>
                  </span>
                ) : (
                  <div className="flex items-center space-x-1.5">
                    <span
                      title="Waiting for member to submit their weekly pick"
                      className="font-mono text-xs font-semibold px-2 py-1 rounded bg-white/5 text-gray-400"
                    >
                      Pending
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNudge(leg);
                      }}
                      aria-label={`Nudge ${leg.owner_name} to submit pick`}
                      title={`Send a reminder nudge to ${leg.owner_name}`}
                      className={`px-2 py-1 rounded-lg border text-xs font-bold inline-flex items-center space-x-1 transition active:scale-95 ${
                        nudgedLegs[leg.id || leg.roster_id]
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-sleeper-dark hover:bg-sleeper-border/50 text-gray-300 hover:text-white border-sleeper-border/70'
                      }`}
                    >
                      {nudgedLegs[leg.id || leg.roster_id] ? (
                        <>
                          <BellRing className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
                          <span>Nudged!</span>
                        </>
                      ) : (
                        <>
                          <Bell className="w-3.5 h-3.5 text-amber-400" />
                          <span>Nudge</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-sleeper-card border border-amber-500/40 text-amber-300 px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2 text-xs font-bold animate-fadeIn"
        >
          <BellRing className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Sleeper Chat Share Footer */}
      <SleeperChatExport parlay={parlay} />

      {/* Kalshi Share Link if available */}
      {parlay.sportsbook_url && (
        <div className="p-3 bg-sleeper-dark/60 border-t border-sleeper-border text-center">
          <a
            href={parlay.sportsbook_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1.5 text-xs text-sleeper-accent hover:underline font-semibold"
          >
            <span>View Combo Ticket on Kalshi</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}
    </div>
  );
};
