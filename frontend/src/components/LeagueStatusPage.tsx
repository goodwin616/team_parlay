import React, { useState } from 'react';
import { TeamProfile, WeeklyParlay } from '../types';

export interface SanitizedSubmittedLeg {
  roster_id: number;
  owner_name: string;
  team_name: string;
  nfl_team: string;
  description: string;
  odds_american: string;
  price_cents?: number;
  kalshi_market_ticker?: string;
  kalshi_side?: 'yes' | 'no';
  status: string;
  outcome: string;
  kickoff_time?: string;
}

export interface SanitizedPendingManager {
  roster_id: number;
  owner_name: string;
  team_name: string;
}

export interface SanitizedLeagueStatus {
  league_id: string;
  league_name: string;
  season: string;
  week: number;
  current_week: number;
  updated_at: string | null;
  parlay: {
    status: string;
    outcome: string;
    settlement_status: string;
    contains_sgp: boolean;
    earliest_kickoff: string | null;
    stake_dollars: number;
    quote_type: 'official' | 'estimate';
    odds_american: string | null;
    multiplier: number | null;
    total_payout_dollars: number;
    payout_per_player_dollars: number;
    bettor: {
      roster_id: number;
      owner_name: string;
      team_name: string;
      points_last_week: number;
    };
    counts: {
      total_managers: number;
      submitted: number;
      pending: number;
    };
    submitted_legs: SanitizedSubmittedLeg[];
    pending_managers: SanitizedPendingManager[];
  };
}

export function buildSanitizedStatusPayload({
  leagueId,
  leagueName,
  season,
  currentWeek,
  updatedAt = null,
  teams,
  parlay,
}: {
  leagueId: string;
  leagueName: string;
  season: string;
  currentWeek: number;
  updatedAt?: string | null;
  teams: TeamProfile[];
  parlay: WeeklyParlay;
}): SanitizedLeagueStatus {
  const submittedLegs: SanitizedSubmittedLeg[] = [];
  const submittedRosterIds = new Set<number>();
  const pendingManagers: SanitizedPendingManager[] = [];
  const seenPendingIds = new Set<number>();

  for (const leg of parlay.legs || []) {
    if (leg.status !== 'pending') {
      submittedRosterIds.add(leg.roster_id);
      submittedLegs.push({
        roster_id: leg.roster_id,
        owner_name: leg.owner_name,
        team_name: leg.team_name,
        nfl_team: leg.nfl_team || 'NFL',
        description: leg.description || '',
        odds_american: leg.odds_american || '',
        price_cents: leg.price_cents,
        kalshi_market_ticker: leg.kalshi_market_ticker,
        kalshi_side: leg.kalshi_side,
        status: leg.status,
        outcome:
          leg.outcome ||
          (leg.status === 'won' || leg.status === 'lost' || leg.status === 'voided' || leg.status === 'pushed'
            ? leg.status
            : 'pending'),
        kickoff_time: leg.kickoff_time,
      });
    } else {
      seenPendingIds.add(leg.roster_id);
      pendingManagers.push({
        roster_id: leg.roster_id,
        owner_name: leg.owner_name,
        team_name: leg.team_name,
      });
    }
  }

  for (const t of [...teams].sort((a, b) => a.roster_id - b.roster_id)) {
    if (!submittedRosterIds.has(t.roster_id) && !seenPendingIds.has(t.roster_id)) {
      seenPendingIds.add(t.roster_id);
      pendingManagers.push({
        roster_id: t.roster_id,
        owner_name: t.owner_name,
        team_name: t.team_name,
      });
    }
  }

  const submittedCount = submittedLegs.length;
  const pendingCount = pendingManagers.length;
  const totalManagers = submittedCount + pendingCount;
  const isOfficial = Boolean(parlay.actual_payout !== null || parlay.actual_odds_american);
  const totalPayout = parlay.actual_payout ?? parlay.estimated_payout ?? 0;
  const payoutPerPlayer =
    submittedCount > 0 ? Number((totalPayout / submittedCount).toFixed(2)) : 0;
  const multiplier = parlay.actual_multiplier ?? parlay.estimated_multiplier ?? 1.0;
  const oddsAmerican = parlay.actual_odds_american || parlay.estimated_odds_american || '+100';

  return {
    league_id: leagueId,
    league_name: leagueName,
    season,
    week: parlay.week || currentWeek,
    current_week: currentWeek,
    updated_at: updatedAt,
    parlay: {
      status: parlay.status || 'open',
      outcome: parlay.outcome || 'pending',
      settlement_status: parlay.settlement_status || 'pending',
      contains_sgp: Boolean(parlay.contains_sgp),
      earliest_kickoff: parlay.earliest_kickoff || null,
      stake_dollars: 5.0,
      quote_type: isOfficial ? 'official' : 'estimate',
      odds_american: submittedCount > 0 ? oddsAmerican : null,
      multiplier: submittedCount > 0 ? Number(multiplier.toFixed(2)) : null,
      total_payout_dollars: submittedCount > 0 ? Number(totalPayout.toFixed(2)) : 0,
      payout_per_player_dollars: payoutPerPlayer,
      bettor: {
        roster_id: parlay.bettor?.roster_id ?? 0,
        owner_name: parlay.bettor?.owner_name ?? '',
        team_name: parlay.bettor?.team_name ?? '',
        points_last_week: parlay.bettor?.points_last_week ?? 0,
      },
      counts: {
        total_managers: totalManagers,
        submitted: submittedCount,
        pending: pendingCount,
      },
      submitted_legs: submittedLegs,
      pending_managers: pendingManagers,
    },
  };
}

export function renderStatusMarkdown(payload: SanitizedLeagueStatus): string {
  const { parlay } = payload;
  const { counts, bettor, submitted_legs, pending_managers } = parlay;

  const oddsStr =
    parlay.odds_american && parlay.multiplier !== null
      ? `${parlay.odds_american} (${parlay.multiplier.toFixed(2)}x, ${parlay.quote_type === 'official' ? 'Official' : 'Estimate'})`
      : '—';
  const payoutStr =
    counts.submitted > 0
      ? `$${parlay.total_payout_dollars.toFixed(2)} total ($${parlay.payout_per_player_dollars.toFixed(2)} per submitted player)`
      : '—';
  const kickoffStr = parlay.earliest_kickoff || 'TBD (No legs submitted yet)';

  const lines: string[] = [
    `# ${payload.league_name} — Week ${payload.week} Parlay Status (${payload.season} Season)`,
    '',
    `- **League ID**: \`${payload.league_id}\``,
    `- **Ticket Status**: ${parlay.status.toUpperCase()} (Outcome: ${parlay.outcome.toUpperCase()})`,
    `- **Weekly Bettor ($${parlay.stake_dollars.toFixed(2)} Stake)**: ${bettor.owner_name} (${bettor.team_name}) — ${bettor.points_last_week.toFixed(2)} pts last week`,
    `- **Combo Odds**: ${oddsStr}`,
    `- **Payout**: ${payoutStr}`,
    `- **Submission Deadline (Earliest Kickoff)**: ${kickoffStr}`,
    `- **Progress**: ${counts.submitted} / ${counts.total_managers} picks submitted (${counts.pending} pending)`,
    '',
    `## Submitted Picks (${counts.submitted})`,
  ];

  if (submitted_legs.length > 0) {
    submitted_legs.forEach((leg, i) => {
      const pricePart = leg.price_cents != null ? ` (${leg.price_cents}¢)` : '';
      const oddsPart = leg.odds_american ? `${leg.odds_american}${pricePart}` : '—';
      lines.push(
        `${i + 1}. **${leg.team_name}** (${leg.owner_name}): ${leg.description} | Odds: ${oddsPart} | Status: ${leg.status} (Outcome: ${leg.outcome})`
      );
    });
  } else {
    lines.push('_No picks submitted yet._');
  }

  lines.push('', `## Waiting On / Pending Managers (${counts.pending})`);
  if (pending_managers.length > 0) {
    pending_managers.forEach((m) => {
      lines.push(`- **${m.team_name}** (${m.owner_name})`);
    });
  } else {
    lines.push('_All managers have submitted their picks!_');
  }

  return lines.join('\n') + '\n';
}

interface LeagueStatusPageProps {
  payload: SanitizedLeagueStatus;
  initialFormat?: 'html' | 'json' | 'md';
  onOpenInteractive?: () => void;
}

export const LeagueStatusPage: React.FC<LeagueStatusPageProps> = ({
  payload,
  initialFormat = 'html',
  onOpenInteractive,
}) => {
  const [viewFormat, setViewFormat] = useState<'html' | 'json' | 'md'>(initialFormat);
  const { parlay } = payload;
  const { counts, bettor, submitted_legs, pending_managers } = parlay;
  const markdownText = renderStatusMarkdown(payload);
  const jsonText = JSON.stringify(payload, null, 2);

  return (
    <div className="min-h-screen bg-sleeper-dark text-white p-4 sm:p-6 lg:p-8">
      <main className="max-w-3xl mx-auto space-y-5">
        <header className="rounded-2xl bg-sleeper-card border border-sleeper-border p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sleeper-accent/15 text-sleeper-accent">
                Read-Only Agent &amp; Member Status
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-white mt-2">
                🏈 {payload.league_name} — Week {payload.week} Parlay Status
              </h1>
              <p className="text-xs text-sleeper-muted mt-1">
                Season {payload.season} • League ID: <code className="text-gray-300">{payload.league_id}</code>
              </p>
            </div>

            <div className="flex items-center space-x-1.5 bg-sleeper-dark p-1 rounded-xl border border-sleeper-border">
              <button
                type="button"
                onClick={() => setViewFormat('html')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  viewFormat === 'html'
                    ? 'bg-sleeper-accent text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Summary
              </button>
              <button
                type="button"
                onClick={() => setViewFormat('md')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  viewFormat === 'md'
                    ? 'bg-sleeper-accent text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Markdown
              </button>
              <button
                type="button"
                onClick={() => setViewFormat('json')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  viewFormat === 'json'
                    ? 'bg-sleeper-accent text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                JSON
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-4">
            <div className="p-3 rounded-xl bg-sleeper-dark border border-sleeper-border/60">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">Ticket Status</span>
              <span className="text-sm font-mono font-extrabold text-white">
                {parlay.status.toUpperCase()} ({parlay.outcome.toUpperCase()})
              </span>
            </div>
            <div className="p-3 rounded-xl bg-sleeper-dark border border-sleeper-border/60">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">Weekly Bettor ($5 Stake)</span>
              <span className="text-sm font-bold text-white">
                {bettor.owner_name} ({bettor.team_name})
              </span>
            </div>
            <div className="p-3 rounded-xl bg-sleeper-dark border border-sleeper-border/60">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">Progress</span>
              <span className="text-sm font-mono font-extrabold text-sleeper-accent">
                {counts.submitted} / {counts.total_managers} Submitted
              </span>
            </div>
            <div className="p-3 rounded-xl bg-sleeper-dark border border-sleeper-border/60">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">
                Combo Odds ({parlay.quote_type})
              </span>
              <span className="text-sm font-mono font-extrabold text-white">
                {parlay.odds_american && parlay.multiplier !== null
                  ? `${parlay.odds_american} (${parlay.multiplier.toFixed(2)}x)`
                  : '—'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-sleeper-dark border border-sleeper-border/60">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">Payout</span>
              <span className="text-sm font-mono font-extrabold text-emerald-400">
                {counts.submitted > 0
                  ? `$${parlay.total_payout_dollars.toFixed(2)} ($${parlay.payout_per_player_dollars.toFixed(2)}/player)`
                  : '—'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-sleeper-dark border border-sleeper-border/60">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">Submission Deadline</span>
              <span className="text-xs font-mono font-bold text-blue-300">
                {parlay.earliest_kickoff || 'TBD'}
              </span>
            </div>
          </div>

          {onOpenInteractive && (
            <div className="mt-4 pt-3 border-t border-sleeper-border/60 flex items-center justify-between text-xs">
              <span className="text-sleeper-muted">
                Want to submit or edit a pick? Open the interactive tracker.
              </span>
              <button
                type="button"
                onClick={onOpenInteractive}
                className="text-sleeper-accent font-bold hover:underline cursor-pointer"
              >
                Open Interactive Tracker →
              </button>
            </div>
          )}
        </header>

        {viewFormat === 'json' ? (
          <section className="rounded-2xl bg-sleeper-card border border-sleeper-border p-5 shadow-xl">
            <h2 className="text-xs font-black uppercase tracking-wider text-sleeper-accent mb-3">
              Sanitized Agent JSON Payload
            </h2>
            <pre
              data-testid="agent-status-raw-json"
              className="p-4 rounded-xl bg-sleeper-dark border border-sleeper-border font-mono text-xs text-gray-200 overflow-x-auto whitespace-pre-wrap"
            >
              {jsonText}
            </pre>
          </section>
        ) : viewFormat === 'md' ? (
          <section className="rounded-2xl bg-sleeper-card border border-sleeper-border p-5 shadow-xl">
            <h2 className="text-xs font-black uppercase tracking-wider text-sleeper-accent mb-3">
              Agent Markdown Report
            </h2>
            <pre
              id="agent-status-markdown"
              data-testid="agent-status-raw-md"
              className="p-4 rounded-xl bg-sleeper-dark border border-sleeper-border font-mono text-xs text-gray-200 overflow-x-auto whitespace-pre-wrap"
            >
              {markdownText}
            </pre>
          </section>
        ) : (
          <>
            <section className="rounded-2xl bg-sleeper-card border border-sleeper-border p-5 shadow-xl">
              <h2 className="text-xs font-black uppercase tracking-wider text-sleeper-accent mb-3">
                Submitted Picks ({counts.submitted} / {counts.total_managers})
              </h2>
              {submitted_legs.length === 0 ? (
                <p className="text-xs text-gray-400">No picks submitted yet.</p>
              ) : (
                <div className="divide-y divide-sleeper-border/60">
                  {submitted_legs.map((leg) => (
                    <div
                      key={leg.roster_id}
                      className="py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <span className="font-bold text-white">{leg.team_name}</span>{' '}
                        <span className="text-sleeper-muted">({leg.owner_name})</span>
                        <div className="text-gray-200 mt-0.5">{leg.description}</div>
                      </div>
                      <div className="font-mono font-bold text-sleeper-accent shrink-0">
                        {leg.odds_american}
                        {leg.price_cents != null ? ` (${leg.price_cents}¢)` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl bg-sleeper-card border border-sleeper-border p-5 shadow-xl">
              <h2 className="text-xs font-black uppercase tracking-wider text-amber-400 mb-3">
                Waiting On / Pending Managers ({counts.pending})
              </h2>
              {pending_managers.length === 0 ? (
                <p className="text-xs text-emerald-400 font-semibold">
                  All managers have submitted their picks!
                </p>
              ) : (
                <ul className="space-y-1.5 text-xs text-gray-200 list-disc list-inside">
                  {pending_managers.map((m) => (
                    <li key={m.roster_id}>
                      <span className="font-bold text-white">{m.team_name}</span> ({m.owner_name})
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl bg-sleeper-card border border-sleeper-border p-5 shadow-xl">
              <h2 className="text-xs font-black uppercase tracking-wider text-sleeper-accent mb-3">
                Agent Summary (Markdown)
              </h2>
              <pre
                id="agent-status-markdown"
                className="p-3.5 rounded-xl bg-sleeper-dark border border-sleeper-border font-mono text-xs text-gray-200 overflow-x-auto whitespace-pre-wrap"
              >
                {markdownText}
              </pre>
            </section>
          </>
        )}
      </main>
      <script
        id="agent-status-json"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: jsonText.replace(/<\//g, '<\\/') }}
      />
    </div>
  );
};
