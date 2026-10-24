export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';

export interface ActivePlayer {
  id: string;
  name: string;        // e.g. "Saquon Barkley"
  team: string;        // e.g. "PHI"
  position: Position | string; // "QB" | "RB" | "WR" | "TE" etc.
}

export type MarketType = 'moneyline' | 'spread' | 'game_total' | 'player_prop';

export interface TeamProfile {
  roster_id: number;         // Sleeper roster ID (1 to 12)
  owner_id: string;          // Sleeper user ID
  owner_name: string;        // Sleeper display name
  team_name: string;         // Fantasy team name
  avatar_url?: string;       // Avatar image URL
  claimed_by?: {
    uid: string;
    name: string;
    photo_url?: string;
    claimed_at: string;
  };
}

export interface ParlayLeg {
  id: string;
  roster_id: number;
  team_name: string;
  owner_name: string;
  game_id?: string;                       // For Same-Game Combo correlation detection
  nfl_team: string;                       // e.g. "PHI"
  description: string;                    // e.g. "Saquon Barkley (PHI) • 75+ Rush Yards (YES)"
  odds_american: string;                  // e.g. "-117"
  odds_decimal: number;                   // e.g. 1.8519
  price_cents?: number;                   // Kalshi contract price in cents (1 to 99), e.g. 54
  kalshi_market_ticker?: string;          // e.g. "KXNFLRUSHYDS-26NOV01-SBARKLEY-75"
  kalshi_side?: 'yes' | 'no';
  status: 'pending' | 'submitted';
  kickoff_time?: string;                  // ISO 8601 string
  last_edited_by?: {
    uid: string;
    name: string;
    photo_url?: string;
  };
  last_edited_at?: string;
  edited_by_non_claimer?: boolean;
}

export interface WeeklyParlay {
  week: number;
  season: string;
  status: 'open' | 'locked';
  contains_sgp: boolean;                  // True if multiple submitted legs share the same game_id
  isRealDataLoaded?: boolean;             // True if loaded from live Sleeper API or Firestore sync
  bettor: {
    roster_id: number;
    team_name: string;
    owner_name: string;
    points_last_week: number;
  };
  earliest_kickoff: string | null;        // ISO 8601 string; hard submission deadline
  legs: ParlayLeg[];
  estimated_odds_american: string;        // e.g. "+1450"
  estimated_multiplier: number;           // e.g. 15.50
  estimated_payout: number;               // $5 * multiplier
  combined_probability_cents?: number;    // Implied Kalshi combo price in cents (1 to 99)
  actual_payout: number | null;           // Actual Kalshi combo payout override
  actual_odds_american?: string | null;   // Actual Kalshi combo odds override
  kalshi_combo_ticker?: string;           // Optional Kalshi MVE combo ticker
  sportsbook_url?: string;                // Optional digital slip share link
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
  spread_home: { point: number; odds: string; price_cents: number; market_ticker: string };
  spread_away: { point: number; odds: string; price_cents: number; market_ticker: string };
  ml_home: { odds: string; price_cents: number; market_ticker: string };
  ml_away: { odds: string; price_cents: number; market_ticker: string };
  total_over: { point: number; odds: string; price_cents: number; market_ticker: string };
  total_under: { point: number; odds: string; price_cents: number; market_ticker: string };
}

export interface KalshiPropContract {
  market_ticker: string;
  series_ticker: string;
  stat_category: string;
  label: string;             // e.g. "75+ Rush Yards" or "Anytime TD (1+)"
  yes_cents: number;         // e.g. 54
  no_cents: number;          // e.g. 46
  yes_odds: string;          // e.g. "-117"
  no_odds: string;           // e.g. "+117"
  kickoff_time: string;
  game_id: string;
}
