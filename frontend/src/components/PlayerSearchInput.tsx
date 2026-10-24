import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Check } from 'lucide-react';
import { ActivePlayer } from '../types';
import { TeamLogo } from '../utils/nflTeams';

interface Props {
  players: ActivePlayer[];
  onSelectPlayer: (player: ActivePlayer) => void;
  selectedPlayer: ActivePlayer | null;
}

export const PlayerSearchInput: React.FC<Props> = ({ players, onSelectPlayer, selectedPlayer }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed.length >= 2
    ? players
        .filter(p => 
          p.name.toLowerCase().includes(trimmed) || 
          p.team.toLowerCase().includes(trimmed)
        )
        .slice(0, 8)
    : [];

  const handleSelect = (player: ActivePlayer) => {
    onSelectPlayer(player);
    setQuery('');
    setIsOpen(false);
  };

  const handleClear = () => {
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center justify-between mb-1.5">
        <label htmlFor="nfl-player-search" className="block text-xs font-semibold text-gray-300">
          Search NFL Player
        </label>
        {selectedPlayer && (
          <span className="inline-flex items-center space-x-1.5 text-[11px] text-sleeper-accent font-mono font-medium">
            <TeamLogo team={selectedPlayer.team} size="sm" />
            <span>
              {selectedPlayer.name} ({selectedPlayer.team} • {selectedPlayer.position})
            </span>
          </span>
        )}
      </div>

      <div className="relative">
        <input
          id="nfl-player-search"
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (query.length >= 2) setIsOpen(true);
          }}
          placeholder={
            selectedPlayer 
              ? `${selectedPlayer.name} (${selectedPlayer.team} - ${selectedPlayer.position})` 
              : "Type player name (e.g., Saquon, Henry, Mahomes)..."
          }
          className="w-full bg-sleeper-dark border border-sleeper-border rounded-lg pl-9 pr-9 py-2.5 text-sm text-white placeholder-gray-500 focus:border-sleeper-accent focus:ring-1 focus:ring-sleeper-accent focus:outline-none transition"
          autoComplete="off"
        />
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3 pointer-events-none" />

        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-3 text-gray-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Autocomplete dropdown */}
      {isOpen && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-sleeper-card border border-sleeper-border rounded-lg shadow-2xl overflow-hidden divide-y divide-sleeper-border/60 max-h-64 overflow-y-auto">
          {filtered.map(p => {
            const isSelected = selectedPlayer?.id === p.id;
            return (
              <li
                key={p.id}
                onClick={() => handleSelect(p)}
                className={`p-2.5 hover:bg-white/10 cursor-pointer flex items-center justify-between transition ${
                  isSelected ? 'bg-sleeper-accent/15' : ''
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <TeamLogo team={p.team} size="md" />
                  <div>
                    <span className="font-semibold text-white text-sm block leading-tight">{p.name}</span>
                    <span className="text-[11px] text-gray-400 font-mono">
                      {p.team} • {p.position}
                    </span>
                  </div>
                </div>
                {isSelected ? (
                  <Check className="w-4 h-4 text-sleeper-accent" />
                ) : (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-sleeper-dark text-sleeper-muted font-mono">
                    Select
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isOpen && query.trim().length >= 2 && filtered.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-sleeper-card border border-sleeper-border rounded-lg p-3 text-center text-xs text-gray-400 shadow-xl">
          No offensive NFL player found matching "{query}".
        </div>
      )}
    </div>
  );
};
