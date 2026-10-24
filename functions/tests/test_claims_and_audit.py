import pytest
from unittest.mock import MagicMock, patch
from firebase_admin import firestore
from firebase_functions import https_fn

from auth_utils import actor_from_auth, claim_status, build_audit_entry
import main

class FakeDocSnapshot:
    def __init__(self, doc_id, data=None):
        self.id = doc_id
        self._data = data

    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        return dict(self._data) if self._data is not None else None

class FakeDocRef:
    def __init__(self, store, path):
        self.store = store
        self.path = path
        self.id = path.split("/")[-1]

    def get(self, transaction=None):
        data = self.store.get(self.path)
        return FakeDocSnapshot(self.id, data)

    def set(self, data, merge=False):
        if merge and self.path in self.store:
            existing = dict(self.store[self.path])
            for k, v in data.items():
                if v is firestore.DELETE_FIELD:
                    existing.pop(k, None)
                else:
                    existing[k] = v
            self.store[self.path] = existing
        else:
            self.store[self.path] = dict(data)

    def update(self, data):
        if self.path not in self.store:
            raise Exception("Document does not exist")
        existing = dict(self.store[self.path])
        for k, v in data.items():
            if v is firestore.DELETE_FIELD:
                existing.pop(k, None)
            else:
                existing[k] = v
        self.store[self.path] = existing

    def collection(self, col_name):
        return FakeCollectionRef(self.store, f"{self.path}/{col_name}")

class FakeCollectionRef:
    def __init__(self, store, path):
        self.store = store
        self.path = path
        self._auto_id = 0

    def document(self, doc_id=None):
        if doc_id is None:
            self._auto_id += 1
            doc_id = f"auto_{self._auto_id}"
        return FakeDocRef(self.store, f"{self.path}/{doc_id}")

class FakeTransaction:
    def __init__(self, store):
        self.store = store
        self._read_only = False
        self._max_attempts = 5
        self._id = b"fake_tx_id"
        self._mutations = []

    def get(self, doc_ref):
        return doc_ref.get()

    def set(self, doc_ref, data, merge=False):
        self._mutations.append(("set", doc_ref, data, merge))

    def update(self, doc_ref, data):
        self._mutations.append(("update", doc_ref, data, False))

    def _commit(self):
        for op, doc_ref, data, merge in self._mutations:
            if op == "set":
                doc_ref.set(data, merge=merge)
            elif op == "update":
                doc_ref.update(data)
        self._mutations.clear()

    def _rollback(self):
        self._mutations.clear()

    def _clean_up(self):
        pass

    def _begin(self, retry_id=None):
        pass

class FakeBatch:
    def __init__(self, store):
        self.store = store
        self.ops = []

    def update(self, doc_ref, data):
        self.ops.append(("update", doc_ref, data))

    def set(self, doc_ref, data):
        self.ops.append(("set", doc_ref, data))

    def commit(self):
        for op, doc_ref, data in self.ops:
            if op == "update":
                doc_ref.update(data)
            elif op == "set":
                doc_ref.set(data)

class FakeDB:
    def __init__(self):
        self.store = {}

    def collection(self, col_name):
        return FakeCollectionRef(self.store, col_name)

    def transaction(self):
        return FakeTransaction(self.store)

    def batch(self):
        return FakeBatch(self.store)

def unwrap_callable(fn):
    if hasattr(fn, "__wrapped__"):
        inner = fn.__wrapped__
        if getattr(inner, "__closure__", None):
            for cell in inner.__closure__:
                if callable(cell.cell_contents) and getattr(cell.cell_contents, "__name__", "") == fn.__name__:
                    return cell.cell_contents
        return inner
    return fn

def call_fn(fn, req):
    target = unwrap_callable(fn)
    return target(req)

def make_request(data=None, uid=None, name="Tester", email="test@example.com", photo_url="https://test.com/photo.jpg"):
    req = MagicMock(spec=https_fn.CallableRequest)
    req.data = data or {}
    if uid:
        req.auth = https_fn.AuthData(
            uid=uid,
            token={"name": name, "email": email, "picture": photo_url},
        )
    else:
        req.auth = None
    return req

def test_auth_rejection():
    unauthed_req = make_request(uid=None)

    with pytest.raises(https_fn.HttpsError) as exc1:
        call_fn(main.init_or_sync_league, unauthed_req)
    assert exc1.value.code == https_fn.FunctionsErrorCode.UNAUTHENTICATED

    with pytest.raises(https_fn.HttpsError) as exc2:
        call_fn(main.get_kalshi_nfl_markets, unauthed_req)
    assert exc2.value.code == https_fn.FunctionsErrorCode.UNAUTHENTICATED

    with pytest.raises(https_fn.HttpsError) as exc3:
        call_fn(main.select_team, unauthed_req)
    assert exc3.value.code == https_fn.FunctionsErrorCode.UNAUTHENTICATED

    with pytest.raises(https_fn.HttpsError) as exc4:
        call_fn(main.get_my_team, unauthed_req)
    assert exc4.value.code == https_fn.FunctionsErrorCode.UNAUTHENTICATED

    with pytest.raises(https_fn.HttpsError) as exc5:
        call_fn(main.submit_leg, unauthed_req)
    assert exc5.value.code == https_fn.FunctionsErrorCode.UNAUTHENTICATED

def test_select_team_unclaimed_needs_confirmation():
    fake_db = FakeDB()
    league_id = "test_league"
    season = "2026"
    roster_id = 1

    # Seed team unclaimed
    fake_db.store[f"leagues/{league_id}/seasons/{season}/teams/{roster_id}"] = {
        "roster_id": roster_id,
        "team_name": "Philly Special",
        "owner_name": "Blake",
    }
    fake_db.store[f"leagues/{league_id}"] = {"active_season": season}

    req = make_request(
        data={"league_id": league_id, "season": season, "roster_id": roster_id, "confirm": False},
        uid="user_123",
        name="Blake",
    )

    with patch("main.get_db", return_value=fake_db):
        res = call_fn(main.select_team, req)

    assert res["status"] == "needs_claim_confirmation"
    # Team doc unchanged
    assert "claimed_by" not in fake_db.store[f"leagues/{league_id}/seasons/{season}/teams/{roster_id}"]

def test_select_team_unclaimed_confirmed():
    fake_db = FakeDB()
    league_id = "test_league"
    season = "2026"
    roster_id = 1

    fake_db.store[f"leagues/{league_id}/seasons/{season}/teams/{roster_id}"] = {
        "roster_id": roster_id,
        "team_name": "Philly Special",
        "owner_name": "Blake",
    }
    fake_db.store[f"leagues/{league_id}"] = {"active_season": season}

    req = make_request(
        data={"league_id": league_id, "season": season, "roster_id": roster_id, "confirm": True},
        uid="user_123",
        name="Blake G.",
        photo_url="https://photo.jpg",
    )

    with patch("main.get_db", return_value=fake_db):
        res = call_fn(main.select_team, req)

    assert res["status"] == "unclaimed"
    assert res["roster_id"] == 1
    assert res["claimed_by"]["uid"] == "user_123"
    assert res["claimed_by"]["name"] == "Blake G."

    # Team doc in Firestore now has claimed_by
    team = fake_db.store[f"leagues/{league_id}/seasons/{season}/teams/{roster_id}"]
    assert team["claimed_by"]["uid"] == "user_123"

    # User's league selection saved
    user_league = fake_db.store[f"users/user_123/leagues/{league_id}"]
    assert user_league["roster_id"] == 1
    assert user_league["season"] == "2026"

    # Audit log created with action team_claimed
    audit_keys = [k for k in fake_db.store if f"leagues/{league_id}/seasons/{season}/audit_log" in k]
    assert len(audit_keys) == 1
    audit_doc = fake_db.store[audit_keys[0]]
    assert audit_doc["action"] == "team_claimed"
    assert audit_doc["actor"]["uid"] == "user_123"
    assert audit_doc["roster_id"] == 1

def test_select_team_mine():
    fake_db = FakeDB()
    league_id = "test_league"
    season = "2026"
    roster_id = 1

    fake_db.store[f"leagues/{league_id}/seasons/{season}/teams/{roster_id}"] = {
        "roster_id": roster_id,
        "team_name": "Philly Special",
        "claimed_by": {"uid": "user_123", "name": "Blake G."},
    }
    fake_db.store[f"leagues/{league_id}"] = {"active_season": season}

    req = make_request(
        data={"league_id": league_id, "season": season, "roster_id": roster_id, "confirm": False},
        uid="user_123",
    )

    with patch("main.get_db", return_value=fake_db):
        res = call_fn(main.select_team, req)

    assert res["status"] == "mine"
    assert res["roster_id"] == 1

    # Audit log action team_selected
    audit_keys = [k for k in fake_db.store if f"leagues/{league_id}/seasons/{season}/audit_log" in k]
    assert len(audit_keys) == 1
    audit_doc = fake_db.store[audit_keys[0]]
    assert audit_doc["action"] == "team_selected"

def test_select_team_other_needs_override_confirmation():
    fake_db = FakeDB()
    league_id = "test_league"
    season = "2026"
    roster_id = 1

    fake_db.store[f"leagues/{league_id}/seasons/{season}/teams/{roster_id}"] = {
        "roster_id": roster_id,
        "team_name": "Philly Special",
        "claimed_by": {"uid": "user_original", "name": "Original Owner"},
    }
    fake_db.store[f"leagues/{league_id}"] = {"active_season": season}

    req = make_request(
        data={"league_id": league_id, "season": season, "roster_id": roster_id, "confirm": False},
        uid="user_new",
    )

    with patch("main.get_db", return_value=fake_db):
        res = call_fn(main.select_team, req)

    assert res["status"] == "needs_override_confirmation"
    assert res["claimed_by"]["uid"] == "user_original"

def test_select_team_other_confirmed():
    fake_db = FakeDB()
    league_id = "test_league"
    season = "2026"
    roster_id = 1

    fake_db.store[f"leagues/{league_id}/seasons/{season}/teams/{roster_id}"] = {
        "roster_id": roster_id,
        "team_name": "Philly Special",
        "claimed_by": {"uid": "user_original", "name": "Original Owner"},
    }
    fake_db.store[f"leagues/{league_id}"] = {"active_season": season}

    req = make_request(
        data={"league_id": league_id, "season": season, "roster_id": roster_id, "confirm": True},
        uid="user_new",
        name="New Player",
    )

    with patch("main.get_db", return_value=fake_db):
        res = call_fn(main.select_team, req)

    assert res["status"] == "other"
    # Original claimed_by must NOT be overwritten!
    team = fake_db.store[f"leagues/{league_id}/seasons/{season}/teams/{roster_id}"]
    assert team["claimed_by"]["uid"] == "user_original"

    # User's league selection saved
    user_league = fake_db.store[f"users/user_new/leagues/{league_id}"]
    assert user_league["roster_id"] == 1

    # Audit log created with action team_selected_claimed_by_other
    audit_keys = [k for k in fake_db.store if f"leagues/{league_id}/seasons/{season}/audit_log" in k]
    assert len(audit_keys) == 1
    audit_doc = fake_db.store[audit_keys[0]]
    assert audit_doc["action"] == "team_selected_claimed_by_other"
    assert audit_doc["actor"]["uid"] == "user_new"

def test_get_my_team():
    fake_db = FakeDB()
    fake_db.store["users/user_123/leagues/league_abc"] = {
        "roster_id": 4,
        "season": "2026",
    }

    req1 = make_request(data={"league_id": "league_abc"}, uid="user_123")
    with patch("main.get_db", return_value=fake_db):
        res1 = call_fn(main.get_my_team, req1)
    assert res1 == {"roster_id": 4, "season": "2026"}

    req2 = make_request(data={"league_id": "nonexistent_league"}, uid="user_123")
    with patch("main.get_db", return_value=fake_db):
        res2 = call_fn(main.get_my_team, req2)
    assert res2 is None

def test_submit_leg_by_claimer_and_non_claimer():
    fake_db = FakeDB()
    league_id = "test_league"
    season = "2026"
    roster_id = 1
    week = 4

    fake_db.store[f"leagues/{league_id}/seasons/{season}/teams/{roster_id}"] = {
        "roster_id": roster_id,
        "team_name": "Philly Special",
        "owner_name": "Blake",
        "claimed_by": {"uid": "user_claimer", "name": "Claimer"},
    }
    fake_db.store[f"leagues/{league_id}"] = {"active_season": season}
    fake_db.store[f"leagues/{league_id}/seasons/{season}/parlays/{week}"] = {
        "week": week,
        "season": season,
        "status": "open",
        "legs": [
            {"roster_id": 1, "description": "Old pick", "status": "submitted"}
        ],
    }

    # 1. Submit by claimer
    req_claimer = make_request(
        data={
            "league_id": league_id,
            "season": season,
            "roster_id": roster_id,
            "week": week,
            "leg": {
                "roster_id": roster_id,
                "description": "New pick by claimer",
                "odds_american": "-110",
                "odds_decimal": 1.91,
            },
        },
        uid="user_claimer",
        name="Claimer",
    )

    with patch("main.get_db", return_value=fake_db), \
         patch("main.get_kalshi_client") as mock_kalshi:
        mock_client = MagicMock()
        mock_client.fetch_combo_quote.return_value = {
            "odds_american": "+100",
            "multiplier": 2.0,
            "estimated_payout": 10.0,
            "combined_probability_cents": 50,
            "contains_sgp": False,
            "pricing_source": "synthetic",
        }
        mock_kalshi.return_value = mock_client
        res_claimer = call_fn(main.submit_leg, req_claimer)

    assert res_claimer["success"] is True
    parlay = fake_db.store[f"leagues/{league_id}/seasons/{season}/parlays/{week}"]
    submitted_leg = parlay["legs"][0]
    assert submitted_leg["description"] == "New pick by claimer"
    assert submitted_leg["edited_by_non_claimer"] is False
    assert submitted_leg["last_edited_by"]["uid"] == "user_claimer"

    audit_keys = [k for k in fake_db.store if f"leagues/{league_id}/seasons/{season}/audit_log" in k]
    assert len(audit_keys) == 1
    audit = fake_db.store[audit_keys[0]]
    assert audit["action"] == "leg_submitted"
    assert audit["before"]["description"] == "Old pick"
    assert audit["after"]["description"] == "New pick by claimer"

    # 2. Submit by non-claimer
    req_non_claimer = make_request(
        data={
            "league_id": league_id,
            "season": season,
            "roster_id": roster_id,
            "week": week,
            "leg": {
                "roster_id": roster_id,
                "description": "Override pick by non-claimer",
                "odds_american": "-110",
                "odds_decimal": 1.91,
            },
        },
        uid="user_different",
        name="Different User",
    )

    with patch("main.get_db", return_value=fake_db), \
         patch("main.get_kalshi_client") as mock_kalshi:
        mock_client = MagicMock()
        mock_client.fetch_combo_quote.return_value = {
            "odds_american": "+100",
            "multiplier": 2.0,
            "estimated_payout": 10.0,
            "combined_probability_cents": 50,
            "contains_sgp": False,
            "pricing_source": "synthetic",
        }
        mock_kalshi.return_value = mock_client
        res_override = call_fn(main.submit_leg, req_non_claimer)

    assert res_override["success"] is True
    parlay = fake_db.store[f"leagues/{league_id}/seasons/{season}/parlays/{week}"]
    submitted_leg = parlay["legs"][0]
    assert submitted_leg["description"] == "Override pick by non-claimer"
    assert submitted_leg["edited_by_non_claimer"] is True
    assert submitted_leg["last_edited_by"]["uid"] == "user_different"

def test_init_or_sync_preserves_claimed_by_and_deletes_pin_hash():
    fake_db = FakeDB()
    league_id = "demo"
    season = "2026"

    # Pre-existing team with legacy pin_hash, session_tokens, and claimed_by
    fake_db.store[f"leagues/{league_id}/seasons/{season}/teams/1"] = {
        "roster_id": 1,
        "team_name": "Philly Special",
        "pin_hash": "legacy_hash_1234",
        "session_tokens": ["token_1", "token_2"],
        "claimed_by": {"uid": "existing_user_uid", "name": "Existing Owner"},
    }

    req = make_request(
        data={
            "league_id": league_id,
            "season": season,
            "fallback_teams": [{"roster_id": 1, "team_name": "Philly Special Updated"}],
            "fallback_parlays": [],
        },
        uid="admin_user",
    )

    with patch("main.get_db", return_value=fake_db):
        res = call_fn(main.init_or_sync_league, req)

    assert res["success"] is True
    team = fake_db.store[f"leagues/{league_id}/seasons/{season}/teams/1"]
    # Legacy fields removed
    assert "pin_hash" not in team
    assert "session_tokens" not in team
    # claimed_by preserved
    assert team["claimed_by"]["uid"] == "existing_user_uid"

def test_firebase_admin_default_app_initialized_on_import():
    import firebase_admin
    # Ensure default app is initialized so callable auth verification succeeds
    assert firebase_admin._DEFAULT_APP_NAME in firebase_admin._apps
    default_app = firebase_admin.get_app()
    assert default_app is not None

def test_callable_auth_token_verification_with_initialized_app():
    import firebase_admin
    from firebase_functions.private.util import _on_call_check_auth_token

    # Ensure default app is present
    assert firebase_admin._DEFAULT_APP_NAME in firebase_admin._apps

    req = MagicMock()
    req.headers = {"Authorization": "Bearer test_valid_token"}

    with patch("firebase_admin.auth.verify_id_token", return_value={"uid": "test_user_1", "email": "user@example.com"}):
        decoded = _on_call_check_auth_token(req)
        assert decoded == {"uid": "test_user_1", "email": "user@example.com"}

