from datetime import datetime, timezone
import random
import requests
from typing import List, Dict, Any, Optional
from parlay_math import american_to_decimal

THE_ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4"

NFL_TEAMS_MAP = {
    "ARI": ["ARI", "ARIZONA", "ARIZONA CARDINALS", "CARDINALS"],
    "ATL": ["ATL", "ATLANTA", "ATLANTA FALCONS", "FALCONS"],
    "BAL": ["BAL", "BALTIMORE", "BALTIMORE RAVENS", "RAVENS"],
    "BUF": ["BUF", "BUFFALO", "BUFFALO BILLS", "BILLS"],
    "CAR": ["CAR", "CAROLINA", "CAROLINA PANTHERS", "PANTHERS"],
    "CHI": ["CHI", "CHICAGO", "CHICAGO BEARS", "BEARS"],
    "CIN": ["CIN", "CINCINNATI", "CINCINNATI BENGALS", "BENGALS"],
    "CLE": ["CLE", "CLEVELAND", "CLEVELAND BROWNS", "BROWNS"],
    "DAL": ["DAL", "DALLAS", "DALLAS COWBOYS", "COWBOYS"],
    "DEN": ["DEN", "DENVER", "DENVER BRONCOS", "BRONCOS"],
    "DET": ["DET", "DETROIT", "DETROIT LIONS", "LIONS"],
    "GB":  ["GB", "GREEN BAY", "GREEN BAY PACKERS", "PACKERS"],
    "HOU": ["HOU", "HOUSTON", "HOUSTON TEXANS", "TEXANS"],
    "IND": ["IND", "INDIANAPOLIS", "INDIANAPOLIS COLTS", "COLTS"],
    "JAX": ["JAX", "JACKSONVILLE", "JACKSONVILLE JAGUARS", "JAGUARS"],
    "KC":  ["KC", "KANSAS CITY", "KANSAS CITY CHIEFS", "CHIEFS"],
    "LV":  ["LV", "LAS VEGAS", "LAS VEGAS RAIDERS", "RAIDERS"],
    "LAC": ["LAC", "LOS ANGELES CHARGERS", "LA CHARGERS", "CHARGERS"],
    "LAR": ["LAR", "LOS ANGELES RAMS", "LA RAMS", "RAMS"],
    "MIA": ["MIA", "MIAMI", "MIAMI DOLPHINS", "DOLPHINS"],
    "MIN": ["MIN", "MINNESOTA", "MINNESOTA VIKINGS", "VIKINGS"],
    "NE":  ["NE", "NEW ENGLAND", "NEW ENGLAND PATRIOTS", "PATRIOTS"],
    "NO":  ["NO", "NEW ORLEANS", "NEW ORLEANS SAINTS", "SAINTS"],
    "NYG": ["NYG", "NEW YORK GIANTS", "NY GIANTS", "GIANTS"],
    "NYJ": ["NYJ", "NEW YORK JETS", "NY JETS", "JETS"],
    "PHI": ["PHI", "PHILADELPHIA", "PHILADELPHIA EAGLES", "EAGLES"],
    "PIT": ["PIT", "PITTSBURGH", "PITTSBURGH STEELERS", "STEELERS"],
    "SF":  ["SF", "SAN FRANCISCO", "SAN FRANCISCO 49ERS", "49ERS"],
    "SEA": ["SEA", "SEATTLE", "SEATTLE SEAHAWKS", "SEAHAWKS"],
    "TB":  ["TB", "TAMPA BAY", "TAMPA BAY BUCCANEERS", "BUCCANEERS"],
    "TEN": ["TEN", "TENNESSEE", "TENNESSEE TITANS", "TITANS"],
    "WAS": ["WAS", "WASHINGTON", "WASHINGTON COMMANDERS", "COMMANDERS"],
}

def normalize_team(name: str) -> str:
    cleaned = name.strip().upper()
    for code, aliases in NFL_TEAMS_MAP.items():
        if cleaned in [a.upper() for a in aliases]:
            return code
    return cleaned

def teams_match(team_a: str, team_b: str) -> bool:
    return normalize_team(team_a) == normalize_team(team_b)

def format_odds_american(price: Any) -> str:
    val = int(price)
    if val > 0:
        return f"+{val}"
    return str(val)

class TheOddsApiClient:
    def __init__(self, api_key: str, base_url: str = THE_ODDS_API_BASE_URL):
        self.api_key = api_key
        self.base_url = base_url

    def fetch_draftkings_mainline_odds(self) -> List[Dict[str, Any]]:
        url = f"{self.base_url}/sports/americanfootball_nfl/odds"
        params = {
            "apiKey": self.api_key,
            "regions": "us",
            "markets": "h2h,spreads,totals",
            "bookmakers": "draftkings"
        }
        resp = requests.get(url, params=params)
        resp.raise_for_status()
        return resp.json()

    def fetch_draftkings_player_props(self, event_id: str, markets: str) -> Dict[str, Any]:
        url = f"{self.base_url}/sports/americanfootball_nfl/events/{event_id}/odds"
        params = {
            "apiKey": self.api_key,
            "regions": "us",
            "markets": markets,
            "bookmakers": "draftkings"
        }
        resp = requests.get(url, params=params)
        resp.raise_for_status()
        return resp.json()

def parse_mainline_odds_response(raw_games: List[Dict[str, Any]]) -> Dict[str, Any]:
    games = []
    for g in raw_games:
        game_id = g.get("id")
        commence_time = g.get("commence_time")
        raw_home = g.get("home_team", "")
        raw_away = g.get("away_team", "")
        home_norm = normalize_team(raw_home)
        away_norm = normalize_team(raw_away)

        dk_bookmaker = None
        for b in g.get("bookmakers", []):
            if b.get("key") == "draftkings":
                dk_bookmaker = b
                break

        if not dk_bookmaker:
            continue

        spread_data = {}
        moneyline_data = {}
        total_data = {}

        for market in dk_bookmaker.get("markets", []):
            mkey = market.get("key")
            outcomes = market.get("outcomes", [])
            if mkey == "spreads":
                for out in outcomes:
                    tname = out.get("name", "")
                    price = format_odds_american(out.get("price", -110))
                    point = float(out.get("point", 0.0))
                    if teams_match(tname, home_norm):
                        spread_data["home"] = point
                        spread_data["home_odds"] = price
                    elif teams_match(tname, away_norm):
                        spread_data["away"] = point
                        spread_data["away_odds"] = price

            elif mkey == "h2h":
                for out in outcomes:
                    tname = out.get("name", "")
                    price = format_odds_american(out.get("price", -110))
                    if teams_match(tname, home_norm):
                        moneyline_data["home_odds"] = price
                    elif teams_match(tname, away_norm):
                        moneyline_data["away_odds"] = price

            elif mkey == "totals":
                for out in outcomes:
                    name = out.get("name", "").lower()
                    price = format_odds_american(out.get("price", -110))
                    total_data["over_under"] = float(out.get("point", 47.5))
                    if name == "over":
                        total_data["over_odds"] = price
                    elif name == "under":
                        total_data["under_odds"] = price

        games.append({
            "game_id": game_id,
            "commence_time": commence_time,
            "home_team": home_norm,
            "away_team": away_norm,
            "spread": spread_data,
            "moneyline": moneyline_data,
            "total": total_data
        })

    return {"games": games}

def calculate_earliest_kickoff(legs: List[Dict[str, Any]]) -> Optional[str]:
    kickoffs = [leg.get("kickoff_time") for leg in legs if leg.get("kickoff_time")]
    if not kickoffs:
        return None
    return min(kickoffs, key=lambda k: datetime.fromisoformat(k.replace("Z", "+00:00")))

def is_kickoff_passed(kickoff_time_iso: Optional[str], current_time_iso: Optional[str] = None) -> bool:
    if not kickoff_time_iso:
        return False
    kickoff = datetime.fromisoformat(kickoff_time_iso.replace("Z", "+00:00"))
    if current_time_iso:
        now = datetime.fromisoformat(current_time_iso.replace("Z", "+00:00"))
    else:
        now = datetime.now(timezone.utc)
    return now >= kickoff

def roll_default_leg(
    team_defaults: List[Dict[str, Any]],
    bye_teams: List[str],
    active_odds_cache: Dict[str, Any],
    current_time_iso: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    bye_set = {normalize_team(b) for b in bye_teams}
    games = active_odds_cache.get("games", [])

    candidates = []
    for d in team_defaults:
        team = normalize_team(d.get("nfl_team", ""))
        if not team or team in bye_set:
            continue

        matched_game = None
        is_home = False
        for g in games:
            if teams_match(g.get("home_team", ""), team):
                matched_game = g
                is_home = True
                break
            elif teams_match(g.get("away_team", ""), team):
                matched_game = g
                is_home = False
                break

        if not matched_game:
            continue

        commence_time = matched_game.get("commence_time")
        if is_kickoff_passed(commence_time, current_time_iso):
            continue

        candidates.append((d, matched_game, is_home, team))

    if not candidates:
        return None

    selected, matched_game, is_home, team = random.choice(candidates)
    market = selected.get("market_type", "spread")
    game_id = matched_game.get("game_id", f"game_{team.lower()}")
    commence_time = matched_game.get("commence_time")

    if market == "spread":
        spread_data = matched_game.get("spread", {})
        line = spread_data.get("home" if is_home else "away", 0.0)
        odds = spread_data.get("home_odds" if is_home else "away_odds", "-110")
        desc = f"{team} {line:+g} Spread"
    elif market == "moneyline":
        ml_data = matched_game.get("moneyline", {})
        odds = ml_data.get("home_odds" if is_home else "away_odds", "-110")
        desc = f"{team} Moneyline"
    else: # game_total
        total_data = matched_game.get("total", {})
        ou = total_data.get("over_under", 47.5)
        direction = selected.get("direction", "over").upper()
        odds = total_data.get("over_odds" if direction == "OVER" else "under_odds", "-110")
        desc = f"{matched_game.get('away_team')} @ {matched_game.get('home_team')} {direction} {ou}"

    return {
        "description": desc,
        "nfl_team": team,
        "odds_american": str(odds),
        "odds_decimal": american_to_decimal(odds),
        "is_default_roll": True,
        "game_id": game_id,
        "status": "submitted",
        "kickoff_time": commence_time
    }
