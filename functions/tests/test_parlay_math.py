import pytest
from parlay_math import (
    american_to_decimal,
    decimal_to_american,
    kalshi_cents_to_decimal,
    decimal_to_kalshi_cents,
    kalshi_cents_to_american,
    format_odds_with_cents,
    calculate_parlay,
    check_sgp_correlation,
)

def test_american_to_decimal():
    assert american_to_decimal("+150") == 2.50
    assert american_to_decimal(150) == 2.50
    assert american_to_decimal(-110) == pytest.approx(1.9091, 0.001)
    assert american_to_decimal("-200") == 1.50
    assert american_to_decimal("-105") == pytest.approx(1.9524, 0.001)

def test_decimal_to_american():
    assert decimal_to_american(2.50) == "+150"
    assert decimal_to_american(1.9091) == "-110"
    assert decimal_to_american(1.50) == "-200"
    assert decimal_to_american(1.0) == "+100"
    assert decimal_to_american(0.5) == "+100"

def test_kalshi_cents_conversions():
    assert kalshi_cents_to_decimal(50) == 2.0
    assert kalshi_cents_to_decimal(40) == 2.5
    assert kalshi_cents_to_decimal(54) == pytest.approx(1.8519, 0.001)

    assert kalshi_cents_to_american(50) == "+100"
    assert kalshi_cents_to_american(40) == "+150"
    assert kalshi_cents_to_american(54) == "-117"

    assert decimal_to_kalshi_cents(2.0) == 50
    assert decimal_to_kalshi_cents(2.5) == 40
    assert format_odds_with_cents("-117", 54) == "-117 (54¢)"

def test_calculate_parlay_standard_and_kalshi_cents():
    legs = [
        {"price_cents": 50, "status": "submitted"},  # 2.0x
        {"price_cents": 40, "status": "submitted"},  # 2.5x
        {"price_cents": 50, "status": "pending"},    # Ignored because pending
    ]
    result = calculate_parlay(legs, stake=5.0)
    assert result["multiplier"] == pytest.approx(5.0, 0.01)
    assert result["estimated_payout"] == pytest.approx(25.00, 0.01)
    assert result["odds_american"] == "+400"
    assert result["combined_probability_cents"] == 20
    assert result["contains_sgp"] is False

def test_calculate_parlay_empty():
    result = calculate_parlay([], stake=5.0)
    assert result["multiplier"] == 1.0
    assert result["estimated_payout"] == 5.0
    assert result["odds_american"] == "+100"
    assert result["contains_sgp"] is False

def test_check_sgp_correlation():
    independent_legs = [
        {"game_id": "game_1", "description": "Ravens ML", "status": "submitted"},
        {"game_id": "game_2", "description": "Chiefs ML", "status": "submitted"},
    ]
    assert check_sgp_correlation(independent_legs) is False

    sgp_legs = [
        {"game_id": "game_1", "description": "Mahomes 250+ Pass Yds", "status": "submitted"},
        {"game_id": "game_1", "description": "Kelce Anytime TD", "status": "submitted"},
        {"game_id": "game_2", "description": "Lions ML", "status": "submitted"},
    ]
    assert check_sgp_correlation(sgp_legs) is True
