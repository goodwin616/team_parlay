import React, { useState } from 'react';
import { X, Check, ShieldCheck, UserCheck } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { TeamProfile } from '../types';
import { functions } from '../services/firebase';
import { ClaimConfirmModal } from './ClaimConfirmModal';

interface TeamPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  teams: TeamProfile[];
  currentRosterId: number | null;
  currentUserId?: string;
  leagueId: string;
  season: string;
  onTeamSelected: (rosterId: number, claimedBy?: any) => void;
}

export const TeamPickerModal: React.FC<TeamPickerModalProps> = ({
  isOpen,
  onClose,
  teams,
  currentRosterId,
  currentUserId,
  leagueId,
  season,
  onTeamSelected,
}) => {
  const [loadingRosterId, setLoadingRosterId] = useState<number | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<'claim' | 'override'>('claim');
  const [pendingTeam, setPendingTeam] = useState<TeamProfile | null>(null);
  const [pendingClaimedBy, setPendingClaimedBy] = useState<any>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectTeam = async (team: TeamProfile, confirm = false) => {
    setError(null);
    if (!confirm) {
      setLoadingRosterId(team.roster_id);
    } else {
      setConfirmLoading(true);
    }

    try {
      const selectTeamFn = httpsCallable<
        { league_id: string; season: string; roster_id: number; confirm: boolean },
        { status: string; roster_id: number; claimed_by?: any }
      >(functions, 'select_team');

      const res = await selectTeamFn({
        league_id: leagueId,
        season,
        roster_id: team.roster_id,
        confirm,
      });

      const { status, claimed_by } = res.data;

      if (status === 'needs_claim_confirmation') {
        setPendingTeam(team);
        setPendingClaimedBy(null);
        setConfirmMode('claim');
        setConfirmModalOpen(true);
        setLoadingRosterId(null);
        return;
      }

      if (status === 'needs_override_confirmation') {
        setPendingTeam(team);
        setPendingClaimedBy(claimed_by || team.claimed_by);
        setConfirmMode('override');
        setConfirmModalOpen(true);
        setLoadingRosterId(null);
        return;
      }

      // Success
      setConfirmModalOpen(false);
      onTeamSelected(team.roster_id, claimed_by);
      onClose();
    } catch (err: any) {
      // Fallback for demo or emulator offline
      if (leagueId.toLowerCase() === 'demo') {
        if (!team.claimed_by && !confirm) {
          setPendingTeam(team);
          setPendingClaimedBy(null);
          setConfirmMode('claim');
          setConfirmModalOpen(true);
          setLoadingRosterId(null);
          return;
        }
        setConfirmModalOpen(false);
        const demoClaimedBy = team.claimed_by || {
          uid: currentUserId || 'demo_user',
          name: 'Demo Manager',
          claimed_at: new Date().toISOString(),
        };
        onTeamSelected(team.roster_id, demoClaimedBy);
        onClose();
        return;
      }
      setError(err?.message || 'Failed to select team. Please try again.');
    } finally {
      setLoadingRosterId(null);
      setConfirmLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
        <div className="bg-sleeper-card border border-sleeper-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="flex justify-between items-center px-5 py-4 border-b border-sleeper-border shrink-0 bg-sleeper-dark/50">
            <div className="flex items-center space-x-2.5">
              <UserCheck className="w-5 h-5 text-sleeper-accent" />
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Select Your Fantasy Team
                </h3>
                <p className="text-[11px] text-sleeper-muted">
                  Choose your team in this league
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-gray-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <div className="p-3 mx-4 mt-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 shrink-0">
              {error}
            </div>
          )}

          {/* Teams List */}
          <div className="p-4 space-y-2 overflow-y-auto divide-y divide-sleeper-border/30">
            {teams.map((t) => {
              const isSelected = currentRosterId !== null && t.roster_id === currentRosterId;
              const isClaimedByMe =
                Boolean(t.claimed_by && currentUserId && t.claimed_by.uid === currentUserId);
              const isClaimedByOther =
                Boolean(t.claimed_by && (!currentUserId || t.claimed_by.uid !== currentUserId));
              const isUnclaimed = !t.claimed_by;
              const isLoading = loadingRosterId === t.roster_id;

              return (
                <div
                  key={t.roster_id}
                  onClick={() => !isLoading && handleSelectTeam(t, false)}
                  className={`pt-2.5 first:pt-0 flex items-center justify-between p-3 rounded-xl transition cursor-pointer ${
                    isSelected
                      ? 'bg-sleeper-accent/15 border border-sleeper-accent/40'
                      : 'hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0 pr-2">
                    <div className="w-9 h-9 rounded-xl bg-sleeper-dark border border-sleeper-border flex items-center justify-center font-bold text-xs text-sleeper-accent shrink-0">
                      #{t.roster_id}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-white truncate">
                          {t.team_name}
                        </span>
                        {isSelected && (
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-black bg-sleeper-accent text-black">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-sleeper-muted truncate">
                        Owner: {t.owner_name}
                      </div>

                      {/* Claim Status Label */}
                      <div className="mt-1">
                        {isClaimedByMe && (
                          <span className="inline-flex items-center space-x-1 text-[10px] font-bold text-emerald-400">
                            <ShieldCheck className="w-3 h-3" />
                            <span>Claimed by you</span>
                          </span>
                        )}
                        {isClaimedByOther && (
                          <span className="text-[10px] text-amber-300 font-medium truncate block max-w-[200px]">
                            Claimed by {t.claimed_by?.name || 'another manager'}
                          </span>
                        )}
                        {isUnclaimed && (
                          <span className="text-[10px] text-gray-400 font-medium">
                            Unclaimed
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 pl-2">
                    {isLoading ? (
                      <div className="w-5 h-5 rounded-full border-2 border-sleeper-accent border-t-transparent animate-spin" />
                    ) : isSelected ? (
                      <div className="w-6 h-6 rounded-full bg-sleeper-accent text-black flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="px-2.5 py-1 rounded-lg bg-sleeper-dark border border-sleeper-border hover:border-white/20 text-xs font-semibold text-gray-300 transition"
                      >
                        Select
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ClaimConfirmModal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        mode={confirmMode}
        team={pendingTeam}
        claimedBy={pendingClaimedBy}
        loading={confirmLoading}
        onConfirm={() => {
          if (pendingTeam) {
            handleSelectTeam(pendingTeam, true);
          }
        }}
      />
    </>
  );
};
