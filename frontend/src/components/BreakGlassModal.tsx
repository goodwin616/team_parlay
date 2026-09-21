import React from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle2, Lock, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (isBreakGlass: boolean) => void;
  bettorName: string;
  isBettor: boolean;
  unsubmittedCount: number;
}

export const BreakGlassModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onConfirm,
  bettorName,
  isBettor,
  unsubmittedCount,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-sleeper-card border border-sleeper-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-sleeper-border">
          <div className="flex items-center space-x-2">
            {isBettor ? (
              <Lock className="w-5 h-5 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-red-400" />
            )}
            <h3 className="text-base font-bold text-white">
              {isBettor ? 'Finalize Parlay Slip' : '⚡ Break-Glass Emergency Override'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {isBettor ? (
            <>
              <p className="text-sm text-gray-200">
                Are you ready to lock this week's parlay ticket?
              </p>
              {unsubmittedCount > 0 ? (
                <div className="p-3.5 rounded-xl bg-purple-950/40 border border-purple-800/50 flex items-start space-x-2.5 text-xs text-purple-200">
                  <AlertTriangle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong className="text-purple-300">{unsubmittedCount} member(s) haven't submitted a leg.</strong>{' '}
                    Finalizing will automatically roll their eligible default fallback picks and snap to live lines.
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/50 flex items-start space-x-2.5 text-xs text-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    All league members have submitted their weekly legs!
                  </div>
                </div>
              )}
              <p className="text-xs text-gray-400">
                Once locked, no further edits can be made to this slip, and the final ticket can be shared directly into the Sleeper league chat.
              </p>
            </>
          ) : (
            <>
              <div className="p-3.5 rounded-xl bg-red-950/50 border border-red-800/60 flex items-start space-x-2.5 text-xs text-red-200">
                <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong className="text-red-300">Emergency Override Protocol:</strong> You are finalizing this parlay ticket on behalf of this week's bettor (<strong>{bettorName}</strong>).
                </div>
              </div>

              <div className="space-y-2 text-xs text-gray-300">
                <p>
                  Use this only if <strong>{bettorName}</strong> is unreachable before the earliest kickoff to prevent a dead ticket.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-gray-400">
                  <li>The slip will be immediately locked.</li>
                  {unsubmittedCount > 0 && (
                    <li>
                      <strong>{unsubmittedCount} missing leg(s)</strong> will be auto-rolled from member default pools.
                    </li>
                  )}
                  <li>Your user profile and timestamp will be permanently logged in the audit trail.</li>
                </ul>
              </div>
            </>
          )}
        </div>

        {/* Modal Actions */}
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
            onClick={() => {
              onConfirm(!isBettor);
              onClose();
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition flex items-center justify-center space-x-1.5 ${
              isBettor
                ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20'
                : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30'
            }`}
          >
            {isBettor ? (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>Lock & Finalize Slip</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Confirm Break-Glass</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
