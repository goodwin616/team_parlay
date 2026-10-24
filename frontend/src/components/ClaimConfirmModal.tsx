import React from 'react';
import { AlertTriangle, ShieldCheck, X } from 'lucide-react';
import { TeamProfile } from '../types';

interface ClaimConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'claim' | 'override';
  team: TeamProfile | null;
  claimedBy?: {
    uid: string;
    name: string;
    photo_url?: string;
    claimed_at?: string;
  };
  onConfirm: () => void;
  loading?: boolean;
}

export const ClaimConfirmModal: React.FC<ClaimConfirmModalProps> = ({
  isOpen,
  onClose,
  mode,
  team,
  claimedBy,
  onConfirm,
  loading = false,
}) => {
  if (!isOpen || !team) return null;

  const isOverride = mode === 'override';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-sleeper-card border border-sleeper-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-sleeper-border bg-sleeper-dark/50">
          <div className="flex items-center space-x-2.5">
            {isOverride ? (
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-sleeper-accent shrink-0" />
            )}
            <h3 className="text-sm font-black text-white uppercase tracking-wider">
              {isOverride ? 'Team Already Claimed' : 'Claim Fantasy Team'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div className="p-3.5 rounded-xl bg-sleeper-dark/80 border border-sleeper-border flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-sleeper-accent/15 text-sleeper-accent font-black text-sm flex items-center justify-center shrink-0">
              #{team.roster_id}
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-white truncate">{team.team_name}</h4>
              <p className="text-xs text-sleeper-muted truncate">Owner: {team.owner_name}</p>
            </div>
          </div>

          {isOverride ? (
            <div className="text-xs text-gray-300 space-y-2 leading-relaxed">
              <p>
                This team has already been claimed by{' '}
                <strong className="text-amber-300">
                  {claimedBy?.name || 'another manager'}
                </strong>
                .
              </p>
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-[11px] leading-snug">
                ⚠️ Selecting this team allows you to view and submit picks for it, but every submission will be flagged with a non-owner indicator (⚠️) and permanently recorded in the hidden server audit log.
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-300 leading-relaxed">
              Would you like to claim <strong className="text-white">{team.team_name}</strong> as your official fantasy team? Other league members will see that this team belongs to your Google account.
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex items-center space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 px-4 rounded-xl bg-sleeper-dark border border-sleeper-border text-xs font-semibold text-gray-300 hover:text-white hover:border-white/20 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 py-2.5 px-4 rounded-xl font-extrabold text-xs transition disabled:opacity-50 flex items-center justify-center space-x-1.5 shadow-lg ${
                isOverride
                  ? 'bg-amber-500 hover:bg-amber-400 text-black'
                  : 'bg-sleeper-accent hover:brightness-110 text-black'
              }`}
            >
              {loading ? (
                <div className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
              ) : (
                <span>{isOverride ? 'Continue Anyway' : 'Claim Team'}</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
