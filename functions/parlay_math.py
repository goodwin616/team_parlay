import math
from typing import List, Dict, Any, Union, Optional

def american_to_decimal(american: Union[int, str]) -> float:
    odds = int(american)
    if odds > 0:
        return (odds / 100.0) + 1.0
    else:
        return (100.0 / abs(odds)) + 1.0

def decimal_to_american(decimal: float) -> str:
    if decimal <= 1.0:
        return "+100"
    if decimal >= 2.0:
        val = round((decimal - 1.0) * 100)
        return f"+{val}"
    else:
        val = round(-100.0 / (decimal - 1.0))
        return f"{val}"

def kalshi_cents_to_decimal(price_cents: Union[int, float]) -> float:
    """
    Converts a Kalshi contract price in cents (1 to 99) into decimal odds.
    A contract costing c cents pays out 100 cents ($1.00), so D = 100 / c.
    """
    cents = max(1.0, min(99.0, float(price_cents)))
    return round(100.0 / cents, 4)

def decimal_to_kalshi_cents(decimal_odds: float) -> int:
    """
    Converts decimal odds into an implied Kalshi contract price in cents (1 to 99).
    """
    if decimal_odds <= 1.0:
        return 99
    cents = round(100.0 / decimal_odds)
    return max(1, min(99, int(cents)))

def kalshi_cents_to_american(price_cents: Union[int, float]) -> str:
    """
    Converts a Kalshi contract price in cents (1 to 99) to American odds.
    """
    dec = kalshi_cents_to_decimal(price_cents)
    return decimal_to_american(dec)

def format_odds_with_cents(odds_american: str, price_cents: Optional[Union[int, float]] = None) -> str:
    """
    Formats American odds primary with Kalshi cents secondary, e.g. '-115 (54¢)'.
    """
    if price_cents is None:
        price_cents = decimal_to_kalshi_cents(american_to_decimal(odds_american))
    return f"{odds_american} ({int(round(price_cents))}¢)"

def check_sgp_correlation(legs: List[Dict[str, Any]]) -> bool:
    submitted = [
        leg for leg in legs
        if leg.get("status", "submitted") == "submitted"
    ]
    game_ids = [leg.get("game_id") for leg in submitted if leg.get("game_id")]
    return len(game_ids) != len(set(game_ids))

def calculate_parlay(legs: List[Dict[str, Any]], stake: float = 5.0) -> Dict[str, Any]:
    active_decimals = []

    submitted_legs = [
        leg for leg in legs
        if leg.get("status", "submitted") == "submitted"
    ]

    for leg in submitted_legs:
        if leg.get("price_cents") is not None:
            active_decimals.append(kalshi_cents_to_decimal(leg["price_cents"]))
        elif leg.get("odds_decimal") is not None:
            active_decimals.append(float(leg["odds_decimal"]))
        else:
            odds_raw = leg.get("odds_american", "-110")
            active_decimals.append(american_to_decimal(odds_raw))

    if not active_decimals:
        return {
            "multiplier": 1.0,
            "estimated_payout": stake,
            "odds_american": "+100",
            "combined_probability_cents": 100,
            "contains_sgp": False
        }

    multiplier = math.prod(active_decimals)
    payout = round(stake * multiplier, 2)
    american = decimal_to_american(multiplier)
    contains_sgp = check_sgp_correlation(submitted_legs)
    combined_cents = decimal_to_kalshi_cents(multiplier)

    return {
        "multiplier": round(multiplier, 3),
        "estimated_payout": payout,
        "odds_american": american,
        "combined_probability_cents": combined_cents,
        "contains_sgp": contains_sgp
    }
