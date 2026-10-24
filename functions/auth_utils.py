import uuid
import hashlib
from typing import List, Optional

def hash_pin(pin: str, salt: str) -> str:
    combined = f"{pin}:{salt}".encode("utf-8")
    return hashlib.sha256(combined).hexdigest()

def generate_session_token() -> str:
    return str(uuid.uuid4())

def verify_pin_and_issue_token(entered_pin: str, stored_hash: str, secret_salt: str) -> Optional[str]:
    computed_hash = hash_pin(entered_pin, secret_salt)
    if computed_hash.lower() == stored_hash.lower():
        return generate_session_token()
    return None

def verify_session_token(token: str, valid_tokens: Optional[List[str]]) -> bool:
    if not token or not valid_tokens:
        return False
    return token in valid_tokens
