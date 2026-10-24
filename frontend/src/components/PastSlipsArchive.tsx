import React, { useState } from 'react';
import { History, X, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { WeeklyParlay } from '../types';
import { formatOddsWithCents } from '../utils/parlayMath';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  pastParlays: WeeklyParlay[];
}

export const PastSlipsArchive: React.FC<Props> = ({ isOpen, onClose, pastParlays }) => {
  const [expandedWeek, setExpandedWeek] = useState<number | null>(
    pastParlays.length > 0 ? pastParlays[0].week : null
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-sm animate-fadeIn">
      <div className="bg-sleeper-card border border-sleeper-border rounded-2xl w-full max-w-lg sm:max-w-xl lg:max-w-2xl overflow-hidden shadow-2xl my-auto">
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-sleeper-border bg-sleeper-card">
          <div className="flex items-center space-x-2">
            <History className="w-5 h-5 text-sleeper-accent" />
            <div>
              <h3 className="text-base font-bold text-white">Past Kalshi Slips Archive</h3>
              <p className="text-[11px] text-sleeper-muted">Historical records • Pure archive (no grading)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[75vh] overflow-y-auto space-y-4">
          {pastParlays.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-xs">
              <Calendar className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="font-semibold text-gray-300">No past slips on file</p>
              <p className="text-gray-500 text-[11px] mt-1">Locked slips from previous weeks will appear here.</p>
            </div>
          ) : (
            pastParlays.map((parlay) => {
              const isExpanded = expandedWeek === parlay.week;
              return (
                <div
                  key={parlay.week}
                  className="rounded-xl bg-sleeper-dark border border-sleeper-border overflow-hidden shadow-sm"
                >
                  {/* Summary Bar / Accordion Header */}
                  <div
                    onClick={() => setExpandedWeek(isExpanded ? null : parlay.week)}
                    className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-black uppercase text-sleeper-accent font-mono">
                          Week {parlay.week}
                        </span>
                        <span className="text-xs text-gray-300 font-semibold">
                          Bettor: {parlay.bettor.owner_name}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {parlay.legs.length} legs • Odds: {parlay.actual_odds_american || parlay.estimated_odds_american}
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <span className="text-[10px] text-gray-400 block leading-tight">
                          {parlay.actual_payout ? 'Payout' : 'Est Payout'}
                        </span>
                        <span className="text-sm font-extrabold font-mono text-sleeper-accent">
                          ${parlay.actual_payout?.toFixed(2) || parlay.estimated_payout.toFixed(2)}
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Leg Details */}
                  {isExpanded && (
                    <div className="border-t border-sleeper-border/70 p-3 bg-sleeper-card/40 space-y-2">
                      <div className="divide-y divide-sleeper-border/40">
                        {parlay.legs.map((leg, i) => (
                          <div key={leg.id || i} className="py-2 flex items-center justify-between text-xs">
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center space-x-1.5 flex-wrap">
                                <span className="font-semibold text-white truncate">{leg.owner_name}</span>
                                <span className="text-[10px] text-sleeper-muted">({leg.team_name})</span>
                              </div>
                              <p className="text-gray-300 mt-0.5 leading-tight">{leg.description}</p>
                            </div>
                            <span className="font-mono text-xs font-bold text-sleeper-accent shrink-0">
                              {formatOddsWithCents(leg.odds_american, leg.price_cents)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-sleeper-border bg-sleeper-card text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 bg-sleeper-dark border border-sleeper-border rounded-xl text-xs font-bold text-gray-300 hover:text-white transition"
          >
            Close Archive
          </button>
        </div>
      </div>
    </div>
  );
};
