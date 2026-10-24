from datetime import datetime, timezone
from typing import Dict, Any, Optional

def actor_from_auth(auth: Any) -> Dict[str, Any]:
    """
    Extracts uid, name, email, photo_url from request auth object or dictionary.
    Raises ValueError('unauthenticated') if auth is None or missing uid.
    """
    if auth is None:
        raise ValueError("unauthenticated")

    uid = None
    token = {}

    if isinstance(auth, dict):
        uid = auth.get("uid")
        token = auth.get("token") if isinstance(auth.get("token"), dict) else {}
        name = auth.get("name") or token.get("name") or auth.get("display_name")
        email = auth.get("email") or token.get("email")
        photo_url = (
            auth.get("photo_url")
            or auth.get("picture")
            or token.get("picture")
            or token.get("photo_url")
        )
    else:
        uid = getattr(auth, "uid", None)
        token = getattr(auth, "token", None) or {}
        if isinstance(token, dict):
            name = getattr(auth, "name", None) or token.get("name")
            email = getattr(auth, "email", None) or token.get("email")
            photo_url = (
                getattr(auth, "photo_url", None)
                or getattr(auth, "picture", None)
                or token.get("picture")
                or token.get("photo_url")
            )
        else:
            name = getattr(auth, "name", None)
            email = getattr(auth, "email", None)
            photo_url = getattr(auth, "photo_url", None) or getattr(auth, "picture", None)

    if not uid:
        raise ValueError("unauthenticated")

    return {
        "uid": str(uid),
        "name": str(name) if name is not None else None,
        "email": str(email) if email is not None else None,
        "photo_url": str(photo_url) if photo_url is not None else None,
    }

def claim_status(actor_uid: str, claimed_by_uid: Optional[str]) -> str:
    """
    Returns 'unclaimed' | 'mine' | 'other' depending on whether a team is claimed
    and who claimed it.
    """
    if not claimed_by_uid:
        return "unclaimed"
    if str(actor_uid) == str(claimed_by_uid):
        return "mine"
    return "other"

def build_audit_entry(
    action: str,
    actor: Dict[str, Any],
    roster_id: Any,
    week: Optional[Any] = None,
    before: Optional[Any] = None,
    after: Optional[Any] = None,
    extra: Optional[Any] = None,
    now_iso: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Constructs an audit log entry payload.
    """
    timestamp = now_iso or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    entry: Dict[str, Any] = {
        "action": action,
        "actor": actor,
        "roster_id": roster_id,
        "timestamp": timestamp,
        "created_at": timestamp,
    }
    if week is not None:
        entry["week"] = week
    if before is not None:
        entry["before"] = before
    if after is not None:
        entry["after"] = after
    if extra is not None:
        entry["extra"] = extra
    return entry
