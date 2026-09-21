import React, { useState } from 'react';
import { Copy, Check, MessageSquare } from 'lucide-react';
import { WeeklyParlay } from '../types';

interface Props {
  parlay: WeeklyParlay;
}

export const SleeperChatExport: React.FC<Props> = ({ parlay }) => {
  const [copied, setCopied] = useState(false);

  const formattedKickoff = parlay.earliest_kickoff
    ? new Date(parlay.earliest_kickoff).toLocaleDateString('en-US', {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Sunday Kickoff';

  const payoutStr = parlay.actual_payout 
    ? `$${parlay.actual_payout.toFixed(2)} (Actual)` 
    : `$${parlay.estimated_payout.toFixed(2)} (Est)`;

  const oddsStr = parlay.actual_odds_american || parlay.estimated_odds_american;

  const generateSleeperText = (): string => {
    const lines = [
      `🏈 WEEK ${parlay.week} TEAM PARLAY 🏈`,
      `Bettor: ${parlay.bettor.owner_name} (${parlay.bettor.team_name}) - $5.00 Stake`,
      `Odds: ${oddsStr} (${parlay.estimated_multiplier.toFixed(2)}x) | Payout: ${payoutStr}`,
      '',
      'LEGS:',
      ...parlay.legs.map((leg, i) => {
        const defaultTag = leg.is_default_roll ? ' [🎲 Default]' : '';
        return `${i + 1}. ${leg.team_name} (${leg.owner_name}): ${leg.description} (${leg.odds_american})${defaultTag}`;
      }),
      '',
    ];

    if (parlay.contains_sgp) {
      lines.push('⚠️ Correlated Same Game Parlay legs included.');
    }

    if (parlay.finalized_by?.is_break_glass) {
      lines.push(`⚡ Finalized via Break-Glass by ${parlay.finalized_by.owner_name}`);
    }

    lines.push(`⏳ Lock Deadline: ${formattedKickoff}`);
    return lines.join('\n');
  };

  const handleCopy = async () => {
    const text = generateSleeperText();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure contexts
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy parlay text:', err);
    }
  };

  return (
    <div className="rounded-xl bg-sleeper-card border border-sleeper-border p-3.5 shadow-md">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2 text-xs font-bold text-gray-200">
          <MessageSquare className="w-4 h-4 text-sleeper-accent" />
          <span>Sleeper Chat Exporter</span>
        </div>
        <span className="text-[10px] text-sleeper-muted font-mono">1-Click Format</span>
      </div>

      <p className="text-xs text-gray-400 mb-3 leading-relaxed">
        Formatted text card ready to paste straight into your Sleeper league chat for full transparency.
      </p>

      <button
        type="button"
        onClick={handleCopy}
        className={`w-full py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center space-x-2 transition shadow-md ${
          copied
            ? 'bg-emerald-500 text-black shadow-emerald-500/20'
            : 'bg-sleeper-dark border border-sleeper-accent/40 text-sleeper-accent hover:bg-sleeper-accent/10 active:scale-[0.99]'
        }`}
      >
        {copied ? (
          <>
            <Check className="w-4 h-4 text-black stroke-[3]" />
            <span>Copied to Clipboard! Ready to Paste</span>
          </>
        ) : (
          <>
            <Copy className="w-4 h-4" />
            <span>Copy Slip for Sleeper Chat</span>
          </>
        )}
      </button>
    </div>
  );
};
