import pytest
import hashlib
from auth_utils import (
    hash_pin,
    generate_session_token,
    verify_pin_and_issue_token,
    verify_session_token,
    create_break_glass_log,
)

def test_hash_pin():
    salt = "secret_backend_salt_999"
    pin = "1234"
    expected = hashlib.sha256(f"{pin}:{salt}".encode("utf-8")).hexdigest()
    assert hash_pin(pin, salt) == expected

def test_session_token_generation_and_validation():
    token = generate_session_token()
    assert len(token) >= 32
    valid_list = ["token1", token, "token2"]
    assert verify_session_token(token, valid_list) is True
    assert verify_session_token("invalid_token", valid_list) is False
    assert verify_session_token("", valid_list) is False
    assert verify_session_token(token, []) is False
    assert verify_session_token(token, None) is False

def test_verify_pin_and_issue_token():
    salt = "secret_backend_salt_999"
    pin = "1234"
    stored_hash = hash_pin(pin, salt)

    token = verify_pin_and_issue_token("1234", stored_hash, salt)
    assert token is not None
    assert len(token) >= 32

    failed = verify_pin_and_issue_token("0000", stored_hash, salt)
    assert failed is None

    # Case insensitive hash comparison test
    token2 = verify_pin_and_issue_token("1234", stored_hash.upper(), salt)
    assert token2 is not None

def test_create_break_glass_log():
    # Break glass: executor (4) != bettor (2)
    log_bg = create_break_glass_log(4, "Dave", 2)
    assert log_bg["is_break_glass"] is True
    assert log_bg["roster_id"] == 4
    assert log_bg["owner_name"] == "Dave"

    # Normal finalize: executor (2) == bettor (2)
    log_normal = create_break_glass_log(2, "Bob", 2)
    assert log_normal["is_break_glass"] is False
    assert log_normal["roster_id"] == 2
    assert log_normal["owner_name"] == "Bob"
