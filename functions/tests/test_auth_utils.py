import hashlib
from auth_utils import (
    hash_pin,
    generate_session_token,
    verify_pin_and_issue_token,
    verify_session_token,
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

    token2 = verify_pin_and_issue_token("1234", stored_hash.upper(), salt)
    assert token2 is not None
