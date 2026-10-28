import pytest
from unittest.mock import MagicMock, patch
from firebase_admin import firestore
from firebase_functions import https_fn

from auth_utils import actor_from_auth, claim_status, build_audit_entry
import main

class FakeDocSnapshot:
    def __init__(self, doc_id, data=None, ref=None):
        self.id = doc_id
        self._data = data
        self.reference = ref

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
        return FakeDocSnapshot(self.id, data, ref=self)

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

    def stream(self):
        prefix = f"{self.path}/"
        results = []
        for k, v in list(self.store.items()):
            if k.startswith(prefix):
                remainder = k[len(prefix):]
                if "/" not in remainder:
                    results.append(FakeDocSnapshot(remainder, v, ref=self.document(remainder)))
        return results

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
                "kickoff_time": "2026-11-01T17:00:00Z",
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
                "kickoff_time": "2026-11-01T17:00:00Z",
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

def test_init_or_sync_advances_week_and_locks_prior_parlays():
    fake_db = FakeDB()
    league_id = "real_sleeper_league"
    season = "2026"

    # Seed existing league in Week 7 with open Week 7 parlay
    fake_db.store[f"leagues/{league_id}"] = {
        "sleeper_league_id": league_id,
        "name": "Triple Crown Dynasty",
        "active_season": season,
        "season": season,
        "current_week": 7,
        "source": "sleeper",
    }
    fake_db.store[f"leagues/{league_id}/seasons/{season}"] = {
        "season": season,
        "league_id": league_id,
        "name": "Triple Crown Dynasty",
        "current_week": 7,
        "source": "sleeper",
    }
    fake_db.store[f"leagues/{league_id}/seasons/{season}/parlays/7"] = {
        "week": 7,
        "season": season,
        "status": "open",
        "bettor": {"roster_id": 1, "owner_name": "Alice", "team_name": "Team Alice", "points_last_week": 65.0},
        "legs": [{"id": "l_1", "roster_id": 1, "status": "submitted"}],
    }

    # New request payload representing Week 8, WITHOUT force_sync
    req = make_request(
        data={
            "league_id": league_id,
            "season": season,
            "force_sync": False,
            "sleeper_payload": {
                "league_info": {"name": "Triple Crown Dynasty", "season": season, "settings": {"leg": 8}},
                "season": season,
                "current_week": 8,
                "rosters": [{"roster_id": 1, "owner_id": "u1"}, {"roster_id": 2, "owner_id": "u2"}],
                "users": [{"user_id": "u1", "display_name": "Alice"}, {"user_id": "u2", "display_name": "Bob"}],
                "matchups": [
                    {"roster_id": 1, "points": 140.0},
                    {"roster_id": 2, "points": 80.5},
                ],
            },
        },
        uid="admin_user",
    )

    with patch("main.get_db", return_value=fake_db), \
         patch("main.fetch_sleeper_nfl_state", return_value={"week": 8, "season": "2026"}):
        res = call_fn(main.init_or_sync_league, req)

    assert res["success"] is True

    # Current week metadata must be updated to 8
    assert fake_db.store[f"leagues/{league_id}"]["current_week"] == 8
    assert fake_db.store[f"leagues/{league_id}/seasons/{season}"]["current_week"] == 8

    # Week 8 parlay must now exist and be open
    parlay_8 = fake_db.store.get(f"leagues/{league_id}/seasons/{season}/parlays/8")
    assert parlay_8 is not None
    assert parlay_8["week"] == 8
    assert parlay_8["status"] == "open"
    # Bettor is lowest scorer from week 7 (Bob / roster 2 with 80.5)
    assert parlay_8["bettor"]["roster_id"] == 2

    # Prior week 7 parlay must now be locked
    parlay_7 = fake_db.store.get(f"leagues/{league_id}/seasons/{season}/parlays/7")
    assert parlay_7 is not None
    assert parlay_7["status"] == "locked"

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


def test_submit_leg_rejects_passed_kickoff():
    fake_db = FakeDB()
    league_id = "test_league"
    season = "2026"
    roster_id = 1
    week = 4

    fake_db.store[f"leagues/{league_id}/seasons/{season}/teams/{roster_id}"] = {
        "roster_id": roster_id,
        "team_name": "Philly Special",
        "owner_name": "Blake",
        "claimed_by": {"uid": "user_1", "name": "Blake"},
    }
    fake_db.store[f"leagues/{league_id}"] = {"active_season": season}
    fake_db.store[f"leagues/{league_id}/seasons/{season}/parlays/{week}"] = {
        "week": week,
        "season": season,
        "status": "open",
        "legs": [],
    }

    # Passed kickoff timestamp
    req = make_request(
        data={
            "league_id": league_id,
            "season": season,
            "roster_id": roster_id,
            "week": week,
            "leg": {
                "roster_id": roster_id,
                "description": "Passed game pick",
                "odds_american": "-110",
                "kickoff_time": "2020-01-01T12:00:00Z",
            },
        },
        uid="user_1",
    )

    with patch("main.get_db", return_value=fake_db):
        with pytest.raises(https_fn.HttpsError) as exc:
            call_fn(main.submit_leg, req)
        assert exc.value.code == https_fn.FunctionsErrorCode.FAILED_PRECONDITION
        assert "Kickoff has already passed or kickoff time is unverified" in exc.value.message


def test_submit_leg_rejects_missing_or_unverified_kickoff():
    fake_db = FakeDB()
    league_id = "test_league"
    season = "2026"
    roster_id = 1
    week = 4

    fake_db.store[f"leagues/{league_id}/seasons/{season}/teams/{roster_id}"] = {
        "roster_id": roster_id,
        "team_name": "Philly Special",
        "owner_name": "Blake",
        "claimed_by": {"uid": "user_1", "name": "Blake"},
    }
    fake_db.store[f"leagues/{league_id}"] = {"active_season": season}
    fake_db.store[f"leagues/{league_id}/seasons/{season}/parlays/{week}"] = {
        "week": week,
        "season": season,
        "status": "open",
        "legs": [],
    }

    # Missing kickoff_time and unverified ticker
    req = make_request(
        data={
            "league_id": league_id,
            "season": season,
            "roster_id": roster_id,
            "week": week,
            "leg": {
                "roster_id": roster_id,
                "description": "Unverified pick",
                "odds_american": "-110",
            },
        },
        uid="user_1",
    )

    with patch("main.get_db", return_value=fake_db):
        with pytest.raises(https_fn.HttpsError) as exc:
            call_fn(main.submit_leg, req)
        assert exc.value.code == https_fn.FunctionsErrorCode.FAILED_PRECONDITION
        assert "Kickoff has already passed or kickoff time is unverified" in exc.value.message


def test_submit_leg_uses_server_kickoff_and_overrides_falsified_future_timestamp():
    fake_db = FakeDB()
    league_id = "test_league"
    season = "2026"
    roster_id = 1
    week = 4

    fake_db.store[f"leagues/{league_id}/seasons/{season}/teams/{roster_id}"] = {
        "roster_id": roster_id,
        "team_name": "Philly Special",
        "owner_name": "Blake",
        "claimed_by": {"uid": "user_1", "name": "Blake"},
    }
    fake_db.store[f"leagues/{league_id}"] = {"active_season": season}
    fake_db.store[f"leagues/{league_id}/seasons/{season}/parlays/{week}"] = {
        "week": week,
        "season": season,
        "status": "open",
        "legs": [],
    }

    # 1. Server knows kickoff was in 2020, but client sends falsified 2099 timestamp
    with patch("main.get_db", return_value=fake_db), \
         patch("main.get_market_kickoff_time", return_value="2020-01-01T12:00:00Z"):
        req_falsified = make_request(
            data={
                "league_id": league_id,
                "season": season,
                "roster_id": roster_id,
                "week": week,
                "leg": {
                    "roster_id": roster_id,
                    "kalshi_market_ticker": "KXNFLTD-PASSED",
                    "description": "Falsified pick",
                    "odds_american": "-110",
                    "kickoff_time": "2099-01-01T00:00:00Z",  # Client lie!
                },
            },
            uid="user_1",
        )
        with pytest.raises(https_fn.HttpsError) as exc:
            call_fn(main.submit_leg, req_falsified)
        assert exc.value.code == https_fn.FunctionsErrorCode.FAILED_PRECONDITION
        assert "Kickoff has already passed or kickoff time is unverified" in exc.value.message

    # 2. Server knows kickoff is true future date 2026-11-20T18:00:00Z, overrides client
    with patch("main.get_db", return_value=fake_db), \
         patch("main.get_market_kickoff_time", return_value="2026-11-20T18:00:00Z"), \
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

        req_valid = make_request(
            data={
                "league_id": league_id,
                "season": season,
                "roster_id": roster_id,
                "week": week,
                "leg": {
                    "roster_id": roster_id,
                    "kalshi_market_ticker": "KXNFLTD-FUTURE",
                    "description": "Legitimate pick",
                    "odds_american": "-110",
                    "kickoff_time": "2099-01-01T00:00:00Z",  # Client provided wrong timestamp
                },
            },
            uid="user_1",
        )
        res = call_fn(main.submit_leg, req_valid)
        assert res["success"] is True

        parlay = fake_db.store[f"leagues/{league_id}/seasons/{season}/parlays/{week}"]
        saved_leg = parlay["legs"][0]
        # Must have been overwritten by server_kickoff
        assert saved_leg["kickoff_time"] == "2026-11-20T18:00:00Z"


def test_get_kalshi_nfl_markets_cooldown():
    fake_db = FakeDB()
    now_ts = 1000000.0

    # 1. Memory updated 10 seconds ago (< 45s) -> force_refresh ignored, ttl_seconds=300
    req_force = make_request(data={"force_refresh": True}, uid="user_1")
    with patch("main.get_db", return_value=fake_db), \
         patch("time.time", return_value=now_ts), \
         patch("main.get_board_last_updated_epoch", return_value=now_ts - 10.0), \
         patch("main.get_kalshi_client") as mock_kalshi:
        mock_client = MagicMock()
        mock_client.get_cached_or_fresh_nfl_board.return_value = {
            "games": [], "props": [], "players": [], "live_market_count": 0, "cached": True
        }
        mock_kalshi.return_value = mock_client

        res = call_fn(main.get_kalshi_nfl_markets, req_force)
        assert res["success"] is True
        mock_client.get_cached_or_fresh_nfl_board.assert_called_once_with(
            db=fake_db,
            ttl_seconds=300,
        )

    # 2. Last updated 60 seconds ago (> 45s) -> force_refresh honored, ttl_seconds=0
    with patch("main.get_db", return_value=fake_db), \
         patch("time.time", return_value=now_ts), \
         patch("main.get_board_last_updated_epoch", return_value=now_ts - 60.0), \
         patch("main.get_kalshi_client") as mock_kalshi:
        mock_client = MagicMock()
        mock_client.get_cached_or_fresh_nfl_board.return_value = {
            "games": [], "props": [], "players": [], "live_market_count": 0, "cached": False
        }
        mock_kalshi.return_value = mock_client

        res = call_fn(main.get_kalshi_nfl_markets, req_force)
        assert res["success"] is True
        mock_client.get_cached_or_fresh_nfl_board.assert_called_once_with(
            db=fake_db,
            ttl_seconds=0,
        )

    # 3. force_refresh is False -> ttl_seconds=300 regardless of last updated
    req_cached = make_request(data={"force_refresh": False}, uid="user_1")
    with patch("main.get_db", return_value=fake_db), \
         patch("time.time", return_value=now_ts), \
         patch("main.get_board_last_updated_epoch", return_value=now_ts - 100.0), \
         patch("main.get_kalshi_client") as mock_kalshi:
        mock_client = MagicMock()
        mock_client.get_cached_or_fresh_nfl_board.return_value = {
            "games": [], "props": [], "players": [], "live_market_count": 0, "cached": True
        }
        mock_kalshi.return_value = mock_client

        res = call_fn(main.get_kalshi_nfl_markets, req_cached)
        assert res["success"] is True
        mock_client.get_cached_or_fresh_nfl_board.assert_called_once_with(
            db=fake_db,
            ttl_seconds=300,
        )


def test_get_kalshi_client_dynamic_env_without_path(monkeypatch):
    """
    Verifies get_kalshi_client() dynamically loads KALSHI_API_KEY_ID and
    KALSHI_PRIVATE_KEY_PEM from os.environ without requiring KALSHI_PRIVATE_KEY_PATH.
    Also verifies updates to os.environ are reflected on subsequent calls.
    """
    monkeypatch.setenv("KALSHI_API_KEY_ID", "test-api-key-1")
    monkeypatch.setenv("KALSHI_PRIVATE_KEY_PEM", "-----BEGIN RSA PRIVATE KEY-----\nMIIEfake1\n-----END RSA PRIVATE KEY-----")
    monkeypatch.delenv("KALSHI_PRIVATE_KEY_PATH", raising=False)

    client1 = main.get_kalshi_client()
    assert client1.api_key_id == "test-api-key-1"
    assert client1.private_key_pem == "-----BEGIN RSA PRIVATE KEY-----\nMIIEfake1\n-----END RSA PRIVATE KEY-----"
    assert client1.private_key_path is None
    assert client1.is_authenticated is True

    # Rotate credentials in os.environ and confirm dynamic loading
    monkeypatch.setenv("KALSHI_API_KEY_ID", "rotated-api-key-2")
    monkeypatch.setenv("KALSHI_PRIVATE_KEY_PEM", "-----BEGIN RSA PRIVATE KEY-----\nMIIEfake2\n-----END RSA PRIVATE KEY-----")

    client2 = main.get_kalshi_client()
    assert client2.api_key_id == "rotated-api-key-2"
    assert client2.private_key_pem == "-----BEGIN RSA PRIVATE KEY-----\nMIIEfake2\n-----END RSA PRIVATE KEY-----"
    assert client2.is_authenticated is True


def test_get_kalshi_client_pem_takes_precedence_over_path(monkeypatch):
    """
    Verifies that when KALSHI_PRIVATE_KEY_PEM is present, it takes precedence
    over KALSHI_PRIVATE_KEY_PATH and does not attempt to read key file from disk.
    """
    monkeypatch.setenv("KALSHI_API_KEY_ID", "test-api-key")
    monkeypatch.setenv("KALSHI_PRIVATE_KEY_PEM", "PEM_CREDENTIAL_STRING")
    monkeypatch.setenv("KALSHI_PRIVATE_KEY_PATH", "/nonexistent/invalid/path/key.pem")

    client = main.get_kalshi_client()
    assert client.api_key_id == "test-api-key"
    assert client.private_key_pem == "PEM_CREDENTIAL_STRING"
    assert client.is_authenticated is True


def test_kalshi_secrets_declared_on_cloud_functions():
    """
    Verifies KALSHI_SECRETS is declared and passed as secrets configuration
    to submit_leg and get_kalshi_nfl_markets Cloud Functions.
    """
    assert main.KALSHI_SECRETS == ["KALSHI_API_KEY_ID", "KALSHI_PRIVATE_KEY_PEM"]
    endpoint_submit = getattr(main.submit_leg, "__firebase_endpoint__", None)
    endpoint_markets = getattr(main.get_kalshi_nfl_markets, "__firebase_endpoint__", None)
    assert endpoint_submit is not None
    assert endpoint_markets is not None
    assert endpoint_submit.secretEnvironmentVariables == [
        {"key": "KALSHI_API_KEY_ID"},
        {"key": "KALSHI_PRIVATE_KEY_PEM"},
    ]
    assert endpoint_markets.secretEnvironmentVariables == [
        {"key": "KALSHI_API_KEY_ID"},
        {"key": "KALSHI_PRIVATE_KEY_PEM"},
    ]

