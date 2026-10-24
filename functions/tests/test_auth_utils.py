import pytest
from firebase_functions.https_fn import AuthData
from auth_utils import actor_from_auth, claim_status, build_audit_entry

def test_actor_from_auth_valid_dict():
    raw_dict = {
        "uid": "user_123",
        "name": "Blake Goodwin",
        "email": "blake@example.com",
        "photo_url": "https://example.com/avatar.png",
    }
    actor = actor_from_auth(raw_dict)
    assert actor["uid"] == "user_123"
    assert actor["name"] == "Blake Goodwin"
    assert actor["email"] == "blake@example.com"
    assert actor["photo_url"] == "https://example.com/avatar.png"

def test_actor_from_auth_with_token_claims():
    auth_data = AuthData(
        uid="user_456",
        token={
            "name": "Google User",
            "email": "google@example.com",
            "picture": "https://lh3.googleusercontent.com/photo.jpg",
        },
    )
    actor = actor_from_auth(auth_data)
    assert actor["uid"] == "user_456"
    assert actor["name"] == "Google User"
    assert actor["email"] == "google@example.com"
    assert actor["photo_url"] == "https://lh3.googleusercontent.com/photo.jpg"

def test_actor_from_auth_rejections():
    with pytest.raises(ValueError, match="unauthenticated"):
        actor_from_auth(None)

    with pytest.raises(ValueError, match="unauthenticated"):
        actor_from_auth({})

    with pytest.raises(ValueError, match="unauthenticated"):
        actor_from_auth({"name": "No UID"})

    with pytest.raises(ValueError, match="unauthenticated"):
        actor_from_auth(AuthData(uid=None, token={}))

def test_claim_status():
    assert claim_status("user_1", None) == "unclaimed"
    assert claim_status("user_1", "") == "unclaimed"
    assert claim_status("user_1", "user_1") == "mine"
    assert claim_status("user_1", "user_2") == "other"

def test_build_audit_entry():
    actor = {"uid": "u1", "name": "Blake", "email": "b@b.com", "photo_url": None}
    entry = build_audit_entry(
        action="team_claimed",
        actor=actor,
        roster_id=3,
        week=4,
        before=None,
        after={"claimed_by": {"uid": "u1"}},
        extra={"ip": "127.0.0.1"},
        now_iso="2026-10-24T00:00:00Z",
    )
    assert entry["action"] == "team_claimed"
    assert entry["actor"] == actor
    assert entry["roster_id"] == 3
    assert entry["week"] == 4
    assert entry["timestamp"] == "2026-10-24T00:00:00Z"
    assert entry["after"] == {"claimed_by": {"uid": "u1"}}
    assert entry["extra"] == {"ip": "127.0.0.1"}

def test_build_audit_entry_minimal():
    actor = {"uid": "u1", "name": "Blake", "email": "b@b.com", "photo_url": None}
    entry = build_audit_entry(
        action="team_selected",
        actor=actor,
        roster_id=1,
    )
    assert entry["action"] == "team_selected"
    assert entry["actor"] == actor
    assert entry["roster_id"] == 1
    assert "week" not in entry
    assert "before" not in entry
    assert "timestamp" in entry
