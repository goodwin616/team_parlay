import React, { useState } from 'react';
import { ArrowRight, Clock, Sparkles, Hash } from 'lucide-react';
import { parseLeagueIdInput, RecentLeague } from '../services/auth';

interface Props {
  onSelectLeague: (leagueId: string) => void;
  recentLeagues: RecentLeague[];
  initialInputVal?: string;
  onOpenPrivacy?: () => void;
}

export const LeagueLandingPage: React.FC<Props> = ({
  onSelectLeague,
  recentLeagues,
  initialInputVal = '',
  onOpenPrivacy,
}) => {
  const [inputVal, setInputVal] = useState(initialInputVal);
  const [error, setError] = useState('');

  const filteredRecentLeagues = recentLeagues.filter(
    (l) => l.leagueId && l.leagueId.trim().toLowerCase() !== 'demo'
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseLeagueIdInput(inputVal);
    if (!parsed) {
      setError('Please enter a valid Sleeper League ID or Sleeper URL.');
      return;
    }
    setError('');
    onSelectLeague(parsed);
  };

  return (
    <div className="min-h-screen bg-sleeper-dark text-white flex flex-col justify-center items-center p-4 selection:bg-sleeper-accent selection:text-black">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sleeper-card border border-sleeper-border shadow-lg text-3xl mb-1">
            🏈
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-wider text-white">
            Team Parlay Tracker
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 max-w-sm mx-auto leading-relaxed">
            Lowest scorer places the bet. Everyone builds the slip. Track your league’s weekly parlay.
          </p>
        </div>

        {/* League ID Entry Card */}
        <div className="bg-sleeper-card border border-sleeper-border rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label
                htmlFor="league-id-input"
                className="block text-xs font-bold uppercase tracking-wider text-gray-300 mb-1.5"
              >
                Enter Sleeper League ID or URL
              </label>
              <div className="relative">
                <Hash className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="league-id-input"
                  type="text"
                  value={inputVal}
                  onChange={(e) => {
                    setInputVal(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="e.g. 1312915483992809472 or sleeper.com/leagues/..."
                  className="w-full bg-sleeper-dark border border-sleeper-border rounded-xl pl-10 pr-3.5 py-3 text-xs sm:text-sm text-white font-mono placeholder:text-gray-500 focus:border-sleeper-accent focus:outline-none transition"
                />
              </div>
              {error && (
                <p className="text-xs text-red-400 mt-1.5 font-medium">{error}</p>
              )}
              <span className="block text-[11px] text-sleeper-muted mt-1.5">
                Tip: You can also bookmark <code className="text-gray-300">/&lt;league_id&gt;</code> directly in your browser.
              </span>
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-sleeper-accent text-black font-black text-sm hover:brightness-110 active:scale-[0.99] transition shadow-lg shadow-sleeper-accent/20 flex items-center justify-center space-x-2"
            >
              <span>Open League Parlay</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Demo Option */}
          <div className="pt-3 border-t border-sleeper-border/60 flex items-center justify-between">
            <span className="text-xs text-gray-400">Just exploring the UI?</span>
            <button
              type="button"
              aria-label="Explore Demo League"
              title="Explore Demo League"
              onClick={() => onSelectLeague('demo')}
              className="inline-flex items-center space-x-1.5 text-xs font-bold text-sleeper-accent hover:underline"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Launch Demo League</span>
            </button>
          </div>
        </div>

        {/* Recently Visited Leagues */}
        {filteredRecentLeagues.length > 0 && (
          <div className="bg-sleeper-card/70 border border-sleeper-border rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center space-x-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">
              <Clock className="w-3.5 h-3.5 text-sleeper-accent" />
              <span>Recently Visited Leagues</span>
            </div>
            <div className="space-y-1.5">
              {filteredRecentLeagues.map((league) => (
                <button
                  key={league.leagueId}
                  type="button"
                  onClick={() => onSelectLeague(league.leagueId)}
                  className="w-full p-2.5 rounded-xl bg-sleeper-dark hover:bg-white/5 border border-sleeper-border hover:border-sleeper-accent/50 transition flex items-center justify-between text-left"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-bold text-white truncate">
                      {league.name}
                    </div>
                    <div className="text-[10px] font-mono text-gray-400 truncate">
                      ID: {league.leagueId}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-sleeper-accent shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Footer */}
        <footer className="pt-3 pb-6 text-center text-xs text-sleeper-muted space-y-1.5">
          <div className="flex items-center justify-center space-x-3 text-xs">
            {onOpenPrivacy && (
              <button
                type="button"
                onClick={onOpenPrivacy}
                className="text-gray-400 hover:text-sleeper-accent hover:underline transition font-medium cursor-pointer"
              >
                Privacy Policy
              </button>
            )}
            {onOpenPrivacy && <span>•</span>}
            <a
              href="https://github.com/goodwin616/team_parlay"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-sleeper-accent hover:underline transition font-medium"
            >
              GitHub
            </a>
          </div>
          <p className="text-[11px] text-gray-500">
            Team Parlay is an open-source fantasy sports coordination tool.
          </p>
        </footer>
      </div>
    </div>
  );
};
