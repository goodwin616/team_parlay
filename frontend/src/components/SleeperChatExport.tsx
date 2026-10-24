import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { WeeklyParlay } from '../types';
import { formatOddsWithCents } from '../utils/parlayMath';

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

  const isOfficialQuote = Boolean(parlay.actual_payout || parlay.actual_odds_american);
  const payoutStr = parlay.actual_payout
    ? `$${parlay.actual_payout.toFixed(2)} (Official)`
    : `$${parlay.estimated_payout.toFixed(2)} (Est.)`;

  const oddsStr = parlay.actual_odds_american || parlay.estimated_odds_american;

  const generateSleeperText = (): string => {
    const submittedLegs = parlay.legs.filter(l => l.status === 'submitted');
    const pendingLegs = parlay.legs.filter(l => l.status === 'pending');
    const totalPayout = parlay.actual_payout ?? parlay.estimated_payout;
    const perPlayerPayout =
      submittedLegs.length > 0 ? totalPayout / submittedLegs.length : 0;

    const lines = [
      `🏈 WEEK ${parlay.week} PARLAY 🏈`,
      `Bettor: ${parlay.bettor.owner_name} (${parlay.bettor.team_name}) - $5.00 Stake`,
      `${isOfficialQuote ? 'Official Odds' : 'Est. Odds'}: ${oddsStr} (${parlay.estimated_multiplier.toFixed(2)}x) | ${isOfficialQuote ? 'Total Payout' : 'Est. Payout'}: ${payoutStr} ($${perPlayerPayout.toFixed(2)}/player)`,
      '',
      `SUBMITTED LEGS (${submittedLegs.length}/${parlay.legs.length}):`,
      ...submittedLegs.map((leg, i) => {
        const formattedOdds = formatOddsWithCents(leg.odds_american, leg.price_cents);
        return `${i + 1}. ${leg.team_name} (${leg.owner_name}): ${leg.description} [${formattedOdds}]`;
      }),
    ];

    if (pendingLegs.length > 0 && parlay.status === 'open') {
      lines.push(
        '',
        `⏳ WAITING ON: ${pendingLegs.map(l => l.owner_name).join(', ')}`
      );
    }

    lines.push('');

    if (parlay.contains_sgp) {
      lines.push('⚠️ Correlated Same-Game Combo legs included.');
    }

    lines.push(`⏳ Submission Deadline: ${formattedKickoff}`);
    return lines.join('\n');
  };

  const handleCopy = async () => {
    const text = generateSleeperText();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
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
    <div className="px-4 py-3 bg-sleeper-dark/70 border-t border-sleeper-border flex items-center justify-end">
      <button
        type="button"
        onClick={handleCopy}
        className={`w-full sm:w-auto py-2 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center space-x-2 transition shadow-sm ${
          copied
            ? 'bg-emerald-500 text-black shadow-emerald-500/20'
            : 'bg-sleeper-card border border-sleeper-accent/40 text-sleeper-accent hover:bg-sleeper-accent/15 active:scale-[0.99]'
        }`}
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5 text-black stroke-[3]" />
            <span>Copied for Sleeper!</span>
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Slip for Sleeper Chat</span>
          </>
        )}
      </button>
    </div>
  );
};
