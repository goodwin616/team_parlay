export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';

export interface ActivePlayer {
  id: string;
  name: string;        // e.g. "Saquon Barkley"
  team: string;        // e.g. "PHI"
  position: Position | string; // "QB" | "RB" | "WR" | "TE" etc.
}

export type MarketType = 'moneyline' | 'spread' | 'game_total' | 'player_prop';
export type LegDirection = 'favorite' | 'underdog' | 'over' | 'under';

export interface DefaultLeg {
  id: string;
  nfl_team: string;          // e.g. "KC", "BAL", "PHI"
  market_type: MarketType;
  player_name?: string;      // Optional (for player prop intent)
  direction?: LegDirection;
  description_template: string; // e.g. "Chiefs Spread" or "Derrick Henry Anytime TD"
  stat_category?: string;
  stat_target?: number;
}

export interface TeamProfile {
  roster_id: number;         // Sleeper roster ID (1 to 12)
  owner_id: string;          // Sleeper user ID
  owner_name: string;        // Sleeper display name
  team_name: string;         // Fantasy team name
  avatar_url?: string;       // Avatar image URL
  pin_hash?: string;         // SHA-256(raw_pin + secret_server_salt) - server-side
  session_tokens?: string[];  // Active valid session tokens - server-side
  default_legs: DefaultLeg[];// Intent-based fallback pool (3 to 5 slots)
}

export interface ParlayLeg {
  id: string;
  roster_id: number;
  team_name: string;
  owner_name: string;
  game_id?: string;                       // For SGP correlation detection
  nfl_team: string;                       // e.g. "PHI"
  description: string;                    // e.g. "Saquon Barkley OVER 74.5 Rush Yards"
  odds_american: string;                  // e.g. "-115"
  odds_decimal: number;                   // e.g. 1.87
  is_default_roll: boolean;               // True if auto-selected during finalization
  status: 'pending' | 'submitted';
  kickoff_time?: string;                  // ISO 8601 string
}

export interface WeeklyParlay {
  week: number;
  season: string;
  status: 'open' | 'locked';
  contains_sgp: boolean;                  // True if multiple legs share the same game_id
  bettor: {
    roster_id: number;
    team_name: string;
    owner_name: string;
    points_last_week: number;
  };
  earliest_kickoff: string | null;        // ISO 8601 string; hard finalization deadline
  legs: ParlayLeg[];
  estimated_odds_american: string;        // e.g. "+1450"
  estimated_multiplier: number;           // e.g. 15.50
  estimated_payout: number;               // $5 * multiplier
  actual_payout: number | null;           // Actual sportsbook payout override
  actual_odds_american?: string | null;   // Actual sportsbook odds override
  sportsbook_url?: string;                // Optional digital slip share link
  finalized_at?: string | null;
  finalized_by?: {
    roster_id: number;
    owner_name: string;
    is_break_glass: boolean;
  } | null;
}

export interface LeagueConfig {
  sleeper_league_id: string; // e.g. "112482394829384923"
  season: string;            // e.g. "2026"
  current_week: number;      // e.g. 4
  updated_at: string;
}

export interface GameLineOption {
  game_id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  spread_home: { point: number; odds: string };
  spread_away: { point: number; odds: string };
  ml_home: { odds: string };
  ml_away: { odds: string };
  total_over: { point: number; odds: string };
  total_under: { point: number; odds: string };
}
