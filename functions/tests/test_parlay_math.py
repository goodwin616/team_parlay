import pytest
from parlay_math import (
    american_to_decimal,
    decimal_to_american,
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

def test_calculate_parlay_standard():
    legs = [
        {"odds_american": "-110"},
        {"odds_american": "+150"},
        {"odds_american": "-200"},
    ]
    result = calculate_parlay(legs, stake=5.0)
    assert result["multiplier"] == pytest.approx(7.159, 0.01)
    assert result["estimated_payout"] == pytest.approx(35.80, 0.05)
    assert result["odds_american"] == "+616"
    assert result["contains_sgp"] is False

def test_calculate_parlay_empty():
    result = calculate_parlay([], stake=5.0)
    assert result["multiplier"] == 1.0
    assert result["estimated_payout"] == 5.0
    assert result["odds_american"] == "+100"
    assert result["contains_sgp"] is False

def test_check_sgp_correlation():
    independent_legs = [
        {"game_id": "game_1", "description": "Ravens ML"},
        {"game_id": "game_2", "description": "Chiefs ML"},
    ]
    assert check_sgp_correlation(independent_legs) is False

    sgp_legs = [
        {"game_id": "game_1", "description": "Mahomes OVER 250 Yds"},
        {"game_id": "game_1", "description": "Kelce Anytime TD"},
        {"game_id": "game_2", "description": "Lions ML"},
    ]
    assert check_sgp_correlation(sgp_legs) is True

    legs_no_game_id = [
        {"description": "Leg 1"},
        {"description": "Leg 2"},
    ]
    assert check_sgp_correlation(legs_no_game_id) is False
