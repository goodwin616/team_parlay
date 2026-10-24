from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor
import base64
import logging
import os
import re
import threading
import time
import urllib.parse

os.environ.setdefault("no_proxy", "*")
os.environ.setdefault("NO_PROXY", "*")

import requests
from typing import List, Dict, Any, Optional, Union, Tuple
from parlay_math import (
    kalshi_cents_to_decimal,
    kalshi_cents_to_american,
    calculate_parlay,
)

logger = logging.getLogger(__name__)

KALSHI_PUBLIC_BASE_URL = "https://api.elections.kalshi.com/trade-api/v2"

NFL_GAME_SERIES = ["KXNFLGAME", "KXNFLSPREAD", "KXNFLTOTAL"]
NFL_PROP_SERIES = [
    "KXNFLTD",
    "KXNFLFIRSTTD",
    "KXNFLPASSYDS",
    "KXNFLPASSTDS",
    "KXNFLPASSCOMP",
    "KXNFLPASSATT",
    "KXNFLPASSINT",
    "KXNFLRSHYDS",
    "KXNFLRSHATT",
    "KXNFLRECYDS",
    "KXNFLREC",
    "KXNFLRRYDS",
]

SERIES_CATEGORY_MAP = {
    "KXNFLTD": "Touchdowns",
    "KXNFLANYTD": "Touchdowns",
    "KXNFLFIRSTTD": "1st Touchdown",
    "KXNFLPASSYDS": "Pass Yards",
    "KXNFLPASSTD": "Pass TDs",
    "KXNFLPASSTDS": "Pass TDs",
    "KXNFLPASSCOMP": "Completions",
    "KXNFLPASSATT": "Pass Attempts",
    "KXNFLPASSINT": "Interceptions",
    "KXNFLRUSHYDS": "Rush Yards",
    "KXNFLRSHYDS": "Rush Yards",
    "KXNFLRSHATT": "Rush Attempts",
    "KXNFLRECYDS": "Rec Yards",
    "KXNFLREC": "Receptions",
    "KXNFLRRYDS": "Rush + Rec Yards",
}

SERIES_POSITION_MAP = {
    "KXNFLPASSYDS": "QB",
    "KXNFLPASSTD": "QB",
    "KXNFLPASSTDS": "QB",
    "KXNFLPASSCOMP": "QB",
    "KXNFLPASSATT": "QB",
    "KXNFLPASSINT": "QB",
    "KXNFLRUSHYDS": "RB",
    "KXNFLRSHYDS": "RB",
    "KXNFLRSHATT": "RB",
    "KXNFLRRYDS": "RB",
    "KXNFLRECYDS": "WR",
    "KXNFLREC": "WR",
    "KXNFLTD": "FLEX",
    "KXNFLFIRSTTD": "FLEX",
}

KALSHI_CACHE_TTL_SECONDS = 300  # 5 minutes
_BOARD_CACHE_LOCK = threading.Lock()
_BOARD_MEMORY_CACHE: Dict[str, Any] = {
    "timestamp": 0.0,
    "board": None,
}

NFL_TEAMS_MAP = {
    "ARI": ["ARI", "ARIZONA", "ARIZONA CARDINALS", "CARDINALS"],
    "ATL": ["ATL", "ATLANTA", "ATLANTA FALCONS", "FALCONS"],
    "BAL": ["BAL", "BALTIMORE", "BALTIMORE RAVENS", "RAVENS"],
    "BUF": ["BUF", "BUFFALO", "BUFFALO BILLS", "BILLS"],
    "CAR": ["CAR", "CAROLINA", "CAROLINA PANTHERS", "PANTHERS"],
    "CHI": ["CHI", "CHICAGO", "CHICAGO BEARS", "BEARS"],
    "CIN": ["CIN", "CINCINNATI", "CINCINNATI BENGALS", "BENGALS"],
    "CLE": ["CLE", "CLEVELAND", "CLEVELAND BROWNS", "BROWNS"],
    "DAL": ["DAL", "DALLAS", "DALLAS COWBOYS", "COWBOYS"],
    "DEN": ["DEN", "DENVER", "DENVER BRONCOS", "BRONCOS"],
    "DET": ["DET", "DETROIT", "DETROIT LIONS", "LIONS"],
    "GB":  ["GB", "GREEN BAY", "GREEN BAY PACKERS", "PACKERS"],
    "HOU": ["HOU", "HOUSTON", "HOUSTON TEXANS", "TEXANS"],
    "IND": ["IND", "INDIANAPOLIS", "INDIANAPOLIS COLTS", "COLTS"],
    "JAX": ["JAX", "JAC", "JACKSONVILLE", "JACKSONVILLE JAGUARS", "JAGUARS"],
    "KC":  ["KC", "KANSAS CITY", "KANSAS CITY CHIEFS", "CHIEFS"],
    "LV":  ["LV", "LAS VEGAS", "LAS VEGAS RAIDERS", "RAIDERS"],
    "LAC": ["LAC", "LOS ANGELES C", "LOS ANGELES CHARGERS", "LA CHARGERS", "CHARGERS"],
    "LAR": ["LAR", "LA", "LOS ANGELES R", "LOS ANGELES RAMS", "LA RAMS", "RAMS"],
    "MIA": ["MIA", "MIAMI", "MIAMI DOLPHINS", "DOLPHINS"],
    "MIN": ["MIN", "MINNESOTA", "MINNESOTA VIKINGS", "VIKINGS"],
    "NE":  ["NE", "NEW ENGLAND", "NEW ENGLAND PATRIOTS", "PATRIOTS"],
    "NO":  ["NO", "NEW ORLEANS", "NEW ORLEANS SAINTS", "SAINTS"],
    "NYG": ["NYG", "NEW YORK G", "NEW YORK GIANTS", "NY GIANTS", "GIANTS"],
    "NYJ": ["NYJ", "NEW YORK J", "NEW YORK JETS", "NY JETS", "JETS"],
    "PHI": ["PHI", "PHILADELPHIA", "PHILADELPHIA EAGLES", "EAGLES"],
    "PIT": ["PIT", "PITTSBURGH", "PITTSBURGH STEELERS", "STEELERS"],
    "SF":  ["SF", "SAN FRANCISCO", "SAN FRANCISCO 49ERS", "49ERS"],
    "SEA": ["SEA", "SEATTLE", "SEATTLE SEAHAWKS", "SEAHAWKS"],
    "TB":  ["TB", "TAMPA BAY", "TAMPA BAY BUCCANEERS", "BUCCANEERS"],
    "TEN": ["TEN", "TENNESSEE", "TENNESSEE TITANS", "TITANS"],
    "WAS": ["WAS", "WASHINGTON", "WASHINGTON COMMANDERS", "COMMANDERS"],
}

def normalize_team(name: str) -> str:
    cleaned = name.strip().upper()
    for code, aliases in NFL_TEAMS_MAP.items():
        if cleaned in [a.upper() for a in aliases]:
            return code
    return cleaned

def teams_match(team_a: str, team_b: str) -> bool:
    return normalize_team(team_a) == normalize_team(team_b)

def format_odds_american(price: Any) -> str:
    val = int(price)
    if val > 0:
        return f"+{val}"
    return str(val)

def extract_kalshi_price_cents(market: Dict[str, Any], side: str = "yes") -> int:
    """
    Extracts a contract's price in cents (1..99) from Kalshi v2 market fields.
    Supports both integer cent fields (yes_ask, last_price) and fixed-point dollar strings (yes_ask_dollars).
    """
    side_lower = side.lower()
    dollars_key = f"{side_lower}_ask_dollars"
    bid_dollars_key = f"{side_lower}_bid_dollars"
    ask_key = f"{side_lower}_ask"
    bid_key = f"{side_lower}_bid"

    val_cents: Optional[float] = None

    if market.get(dollars_key) is not None:
        try:
            val_cents = float(market[dollars_key]) * 100.0
        except (ValueError, TypeError):
            val_cents = None
    elif market.get(ask_key) is not None:
        try:
            val_cents = float(market[ask_key])
        except (ValueError, TypeError):
            val_cents = None
    elif side_lower == "yes" and market.get("last_price_dollars") is not None:
        try:
            val_cents = float(market["last_price_dollars"]) * 100.0
        except (ValueError, TypeError):
            val_cents = None
    elif side_lower == "yes" and market.get("last_price") is not None:
        try:
            val_cents = float(market["last_price"])
        except (ValueError, TypeError):
            val_cents = None
    elif market.get(bid_dollars_key) is not None:
        try:
            val_cents = float(market[bid_dollars_key]) * 100.0
        except (ValueError, TypeError):
            val_cents = None
    elif market.get(bid_key) is not None:
        try:
            val_cents = float(market[bid_key])
        except (ValueError, TypeError):
            val_cents = None

    if val_cents is None or val_cents <= 0:
        val_cents = 54.0
    return max(1, min(99, int(round(val_cents))))

class KalshiTradingBlockedError(RuntimeError):
    """Raised when code attempts a Kalshi request that could result in a trade."""


# ---------------------------------------------------------------------------
# SAFETY: This app is a read-only price viewer. It must NEVER trade.
#
# Every authenticated Kalshi request is signed in `_build_auth_headers`, which
# calls `assert_request_cannot_trade` first. Only the write endpoints below are
# allowed, and none of them can move money:
#   - POST   /multivariate_event_collections/{ticker}  -> look up / create combo market
#   - POST   /communications/rfqs                       -> ask market makers for a price
#   - DELETE /communications/rfqs/{id}                  -> withdraw that request
# A Kalshi RFQ only executes if the creator ACCEPTS a quote (PUT .../accept) and
# the maker then confirms. Accept/confirm, orders, order groups, transfers, and
# every other PUT/PATCH/POST/DELETE are rejected before a signature is produced.
# ---------------------------------------------------------------------------
_KALSHI_API_PREFIX = "/trade-api/v2"
_ALLOWED_WRITE_ENDPOINTS = (
    ("POST", re.compile(r"^/multivariate_event_collections/[A-Za-z0-9_.-]+$")),
    ("POST", re.compile(r"^/communications/rfqs$")),
    ("DELETE", re.compile(r"^/communications/rfqs/[A-Za-z0-9-]+$")),
)


def assert_request_cannot_trade(method: str, path: str) -> None:
    method_u = (method or "").upper()
    rel = urllib.parse.urlsplit(path or "").path
    if rel.startswith(_KALSHI_API_PREFIX):
        rel = rel[len(_KALSHI_API_PREFIX):]
    rel = "/" + rel.lstrip("/")
    if ".." in rel or "//" in rel:
        raise KalshiTradingBlockedError(f"Blocked suspicious Kalshi path: {rel}")
    if method_u == "GET":
        return
    for allowed_method, pattern in _ALLOWED_WRITE_ENDPOINTS:
        if method_u == allowed_method and pattern.match(rel):
            return
    raise KalshiTradingBlockedError(
        f"Blocked Kalshi request {method_u} {rel}: this app never trades"
    )


def best_rfq_yes_cost_cents(quotes: List[Dict[str, Any]]) -> Optional[float]:
    """
    Converts market-maker RFQ quotes into what it would cost to buy YES on the combo.
    A quote's `no_bid_dollars` is what the maker pays for NO, so buying YES from
    them costs `1 - no_bid`. Returns the cheapest YES cost in cents, or None.
    """
    best: Optional[float] = None
    for q in quotes or []:
        if str(q.get("status", "open")).lower() != "open":
            continue
        cost: Optional[float] = None
        # 1. Direct yes_ask_dollars if provided
        if q.get("yes_ask_dollars") is not None:
            try:
                val = float(q["yes_ask_dollars"]) * 100.0
                if 0.0 < val < 100.0:
                    cost = val
            except (TypeError, ValueError):
                pass
        # 2. Implied from maker's NO bid (buying YES == selling NO to maker)
        if cost is None and q.get("no_bid_dollars") is not None:
            try:
                no_bid = float(q["no_bid_dollars"])
                if 0.0 < no_bid < 1.0:
                    cost = (1.0 - no_bid) * 100.0
            except (TypeError, ValueError):
                pass
        if cost is not None:
            if best is None or cost < best:
                best = cost
    return best


class KalshiApiClient:
    """
    Client for Kalshi Trade API v2.
    Uses unauthenticated public GET endpoints for market discovery (game lines & player props),
    and supports optional RSA-PSS authenticated requests for Combo/Multivariate RFQ quotes.
    """
    def __init__(
        self,
        base_url: str = KALSHI_PUBLIC_BASE_URL,
        api_key_id: Optional[str] = None,
        private_key_path: Optional[str] = None,
        private_key_pem: Optional[str] = None
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key_id = api_key_id
        self.private_key_path = private_key_path
        self.private_key_pem = private_key_pem
        self._creator_user_id: Optional[str] = None
        if not self.private_key_pem and self.private_key_path:
            self.private_key_pem = self._load_key_file(self.private_key_path)

    @staticmethod
    def _load_key_file(path: str) -> Optional[str]:
        candidates = [
            os.path.expanduser(path),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), path),
        ]
        for candidate in candidates:
            if os.path.isfile(candidate):
                with open(candidate, "r", encoding="utf-8") as f:
                    return f.read()
        return None

    @property
    def is_authenticated(self) -> bool:
        return bool(self.api_key_id and self.private_key_pem)

    def _build_auth_headers(self, method: str, path: str) -> Dict[str, str]:
        if not self.is_authenticated:
            return {}
        ts_ms = str(int(time.time() * 1000))
        # Strip query params from path before signing per Kalshi v2 spec
        clean_path = urllib.parse.urlsplit(path).path
        if not clean_path.startswith("/trade-api/v2"):
            clean_path = f"/trade-api/v2/{clean_path.lstrip('/')}"
        # SAFETY: refuse to sign anything that could place, accept, or amend a trade.
        assert_request_cannot_trade(method, clean_path)
        msg = f"{ts_ms}{method.upper()}{clean_path}".encode("utf-8")

        signature_b64 = ""
        try:
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import padding
            normalized_pem = (self.private_key_pem or "").replace("\\n", "\n")
            private_key = serialization.load_pem_private_key(
                normalized_pem.encode("utf-8"),
                password=None,
            )
            sig = private_key.sign(
                msg,
                padding.PSS(
                    mgf=padding.MGF1(hashes.SHA256()),
                    salt_length=hashes.SHA256().digest_size,
                ),
                hashes.SHA256(),
            )
            signature_b64 = base64.b64encode(sig).decode("utf-8")
        except Exception:
            # Fallback deterministic signature marker if cryptography key is mock/test
            signature_b64 = base64.b64encode(msg).decode("utf-8")

        return {
            "KALSHI-ACCESS-KEY": self.api_key_id or "",
            "KALSHI-ACCESS-TIMESTAMP": ts_ms,
            "KALSHI-ACCESS-SIGNATURE": signature_b64,
        }

    def fetch_markets_by_series(
        self,
        series_ticker: str,
        status: str = "open",
        limit: int = 1000
    ) -> List[Dict[str, Any]]:
        url = f"{self.base_url}/markets"
        collected: List[Dict[str, Any]] = []
        cursor = ""
        page = 0

        while page < 3:
            params: Dict[str, Any] = {
                "series_ticker": series_ticker,
                "status": status,
                "limit": limit,
                "mve_filter": "exclude",
            }
            if cursor:
                params["cursor"] = cursor

            resp = None
            for attempt in range(4):
                resp = requests.get(url, params=params, timeout=10)
                if getattr(resp, "status_code", 200) == 429 and attempt < 3:
                    time.sleep(1.0 * (attempt + 1))
                    continue
                break
            resp.raise_for_status()
            data = resp.json()
            markets = data.get("markets", [])
            collected.extend(markets)
            cursor = data.get("cursor") or ""
            page += 1
            if not cursor or len(markets) < limit:
                break

        return [
            m for m in collected
            if m.get("status") not in ("finalized", "settled", "closed")
            and not (m.get("yes_ask_dollars") == "1.0000" and m.get("no_ask_dollars") == "1.0000")
        ]

    def fetch_nfl_game_markets(self) -> List[Dict[str, Any]]:
        all_markets: List[Dict[str, Any]] = []

        def _fetch_one(series: str) -> List[Dict[str, Any]]:
            try:
                markets = self.fetch_markets_by_series(series)
                for m in markets:
                    if not m.get("series_ticker"):
                        m["series_ticker"] = series
                return markets
            except Exception:
                return []

        with ThreadPoolExecutor(max_workers=3) as pool:
            for markets in pool.map(_fetch_one, NFL_GAME_SERIES):
                all_markets.extend(markets)
        return all_markets

    def fetch_nfl_player_props(self, series_ticker: Optional[str] = None) -> List[Dict[str, Any]]:
        target_series = [series_ticker] if series_ticker else NFL_PROP_SERIES
        all_props: List[Dict[str, Any]] = []

        def _fetch_prop_series(series: str) -> List[Dict[str, Any]]:
            try:
                raw_markets = self.fetch_markets_by_series(series)
                return [parse_kalshi_prop_market(m, series) for m in raw_markets]
            except Exception:
                return []

        if len(target_series) == 1:
            return _fetch_prop_series(target_series[0])

        with ThreadPoolExecutor(max_workers=2) as pool:
            for props in pool.map(_fetch_prop_series, target_series):
                all_props.extend(props)
        return all_props

    def fetch_live_nfl_board(self) -> Dict[str, Any]:
        """
        Fetches open Kalshi NFL game markets and player props, returning frontend-ready
        GameLineOption[], KalshiPropContract[], and discovered players.
        """
        raw_game_markets = self.fetch_nfl_game_markets()
        parsed_games_obj = parse_kalshi_game_markets(raw_game_markets)
        frontend_games = format_games_for_frontend(parsed_games_obj.get("games", []))

        props = self.fetch_nfl_player_props()
        active_week_key = (
            get_nfl_week_bucket_key(frontend_games[0].get("commence_time"))
            if frontend_games
            else ""
        )
        if active_week_key:
            props = [
                p for p in props
                if not get_nfl_week_bucket_key(p.get("kickoff_time"))
                or get_nfl_week_bucket_key(p.get("kickoff_time")) == active_week_key
            ]
        players_by_name: Dict[str, Dict[str, Any]] = {}
        for p in props:
            pname = (p.get("player_name") or "").strip()
            if not pname or pname.endswith("D/ST"):
                continue
            pos = p.get("position", "FLEX")
            if pname not in players_by_name:
                players_by_name[pname] = {
                    "id": f"kalshi_{re.sub(r'[^a-z0-9]', '', pname.lower())}",
                    "name": pname,
                    "team": p.get("nfl_team", "NFL"),
                    "position": pos,
                }
            elif players_by_name[pname]["position"] == "FLEX" and pos != "FLEX":
                players_by_name[pname]["position"] = pos

        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        return {
            "games": frontend_games,
            "props": props,
            "players": list(players_by_name.values()),
            "live_market_count": len(raw_game_markets) + len(props),
            "updated_at": now_iso,
        }

    def get_cached_or_fresh_nfl_board(
        self,
        db: Any = None,
        ttl_seconds: int = KALSHI_CACHE_TTL_SECONDS,
    ) -> Dict[str, Any]:
        """
        Returns the Kalshi NFL board from cache if it is younger than `ttl_seconds` (default 5 mins),
        checking process memory first and Firestore (`kalshi_cache/nfl_board_meta`) second.
        When older than 5 minutes, fetches fresh data from Kalshi and updates both caches.
        """
        now_ts = time.time()

        # 1. Fast path: in-memory cache check
        cached_mem = _BOARD_MEMORY_CACHE.get("board")
        cached_ts = float(_BOARD_MEMORY_CACHE.get("timestamp") or 0.0)
        if cached_mem and (now_ts - cached_ts) < ttl_seconds:
            return {**cached_mem, "cached": True}

        with _BOARD_CACHE_LOCK:
            now_ts = time.time()
            cached_mem = _BOARD_MEMORY_CACHE.get("board")
            cached_ts = float(_BOARD_MEMORY_CACHE.get("timestamp") or 0.0)
            if cached_mem and (now_ts - cached_ts) < ttl_seconds:
                return {**cached_mem, "cached": True}

            # 2. Check Firestore cache if available
            if db is not None:
                try:
                    meta_ref = db.collection("kalshi_cache").document("nfl_board_meta")
                    meta_doc = meta_ref.get()
                    if meta_doc.exists:
                        meta = meta_doc.to_dict() or {}
                        fs_ts = float(meta.get("updated_at_epoch") or 0.0)
                        if (now_ts - fs_ts) < ttl_seconds and meta.get("games"):
                            chunk_count = int(meta.get("chunk_count") or 0)
                            props_list: List[Dict[str, Any]] = []
                            for idx in range(chunk_count):
                                c_doc = meta_ref.collection("prop_chunks").document(str(idx)).get()
                                if c_doc.exists:
                                    c_data = c_doc.to_dict() or {}
                                    props_list.extend(c_data.get("items", []))
                            if props_list:
                                restored_board = {
                                    "games": meta.get("games", []),
                                    "players": meta.get("players", []),
                                    "props": props_list,
                                    "live_market_count": meta.get("live_market_count", len(props_list)),
                                    "updated_at": meta.get("updated_at"),
                                }
                                _BOARD_MEMORY_CACHE["board"] = restored_board
                                _BOARD_MEMORY_CACHE["timestamp"] = fs_ts
                                return {**restored_board, "cached": True}
                except Exception:
                    pass

            # 3. Cache is missing or older than 5 minutes -> fetch fresh from Kalshi
            fresh_board = self.fetch_live_nfl_board()
            if fresh_board.get("games") or fresh_board.get("props"):
                _BOARD_MEMORY_CACHE["board"] = fresh_board
                _BOARD_MEMORY_CACHE["timestamp"] = now_ts

                if db is not None:
                    try:
                        meta_ref = db.collection("kalshi_cache").document("nfl_board_meta")
                        props_all = fresh_board.get("props", [])
                        chunk_size = 800
                        chunks = [
                            props_all[i : i + chunk_size]
                            for i in range(0, len(props_all), chunk_size)
                        ]
                        for idx, chunk in enumerate(chunks):
                            meta_ref.collection("prop_chunks").document(str(idx)).set(
                                {"items": chunk}
                            )
                        meta_ref.set({
                            "updated_at": fresh_board.get("updated_at"),
                            "updated_at_epoch": now_ts,
                            "games": fresh_board.get("games", []),
                            "players": fresh_board.get("players", []),
                            "live_market_count": fresh_board.get("live_market_count", 0),
                            "chunk_count": len(chunks),
                        })
                    except Exception:
                        pass

                return {**fresh_board, "cached": False}

            # Fallback to stale memory cache if Kalshi was unreachable
            if cached_mem:
                return {**cached_mem, "cached": True}
            return {**fresh_board, "cached": False}

    def request_rfq_combo_cents(
        self,
        combo_ticker: str,
        timeout_seconds: float = 3.0,
    ) -> Optional[float]:
        """
        Requests an RFQ quote from Kalshi market makers for a combo contract,
        waits briefly for market-maker quotes to arrive, calculates the best YES
        cost, and IMMEDIATELY cancels (deletes) the RFQ so no orders can ever be placed.

        Zero Trading Risk Guarantee:
        - assert_request_cannot_trade enforces that PUT (accept quote) and POST /orders
          raise KalshiTradingBlockedError.
        - rest_remainder=False ensures no leftover order on the orderbook.
        - DELETE /communications/rfqs/{id} is strictly called in a finally block.
        """
        if not self.is_authenticated or not combo_ticker:
            return None

        rfq_path = "/communications/rfqs"
        headers = self._build_auth_headers("POST", rfq_path)
        body = {
            "market_ticker": combo_ticker,
            "contracts": 10,
            "rest_remainder": False,
        }
        try:
            resp = requests.post(
                f"{self.base_url}{rfq_path}",
                json=body,
                headers=headers,
                timeout=5,
            )
            resp.raise_for_status()
            rfq_data = resp.json() or {}
            rfq_id = rfq_data.get("id")
            if not rfq_id:
                return None
        except Exception as exc:
            logger.warning("Failed to create Kalshi RFQ for %s: %s", combo_ticker, exc)
            return None

        try:
            # Look up creator_user_id once for filtering quotes
            if not getattr(self, "_creator_user_id", None):
                info_path = f"/communications/rfqs/{rfq_id}"
                try:
                    info_res = requests.get(
                        f"{self.base_url}{info_path}",
                        headers=self._build_auth_headers("GET", info_path),
                        timeout=5,
                    )
                    if info_res.ok:
                        self._creator_user_id = (
                            info_res.json().get("rfq") or {}
                        ).get("creator_user_id")
                except Exception:
                    pass

            # Poll for quotes
            start_t = time.time()
            quotes_path = "/communications/quotes"
            best_cost: Optional[float] = None

            while (time.time() - start_t) < timeout_seconds:
                time.sleep(0.5)
                params: Dict[str, Any] = {"rfq_id": rfq_id, "limit": 100}
                if getattr(self, "_creator_user_id", None):
                    params["rfq_creator_user_id"] = self._creator_user_id

                try:
                    q_res = requests.get(
                        f"{self.base_url}{quotes_path}",
                        params=params,
                        headers=self._build_auth_headers("GET", quotes_path),
                        timeout=5,
                    )
                    if q_res.ok:
                        quotes = (q_res.json() or {}).get("quotes", [])
                        if quotes:
                            best_cost = best_rfq_yes_cost_cents(quotes)
                            if best_cost is not None:
                                logger.info(
                                    "Received %d Kalshi RFQ quotes for %s, best YES cost: %.1f cents",
                                    len(quotes), combo_ticker, best_cost
                                )
                                break
                except Exception as poll_exc:
                    logger.warning("Error polling RFQ quotes: %s", poll_exc)
                    break

            return best_cost
        finally:
            # ALWAYS delete the RFQ immediately so no active RFQ remains
            try:
                del_path = f"/communications/rfqs/{rfq_id}"
                requests.delete(
                    f"{self.base_url}{del_path}",
                    headers=self._build_auth_headers("DELETE", del_path),
                    timeout=5,
                )
                logger.info("Deleted Kalshi RFQ %s cleanly", rfq_id)
            except Exception as del_exc:
                logger.warning("Failed to delete Kalshi RFQ %s: %s", rfq_id, del_exc)

    def fetch_combo_quote(
        self,
        legs: List[Dict[str, Any]],
        stake: float = 5.0,
        collection_ticker: Optional[str] = "KXMVESPORTSMULTIGAMEEXTENDED-R"
    ) -> Dict[str, Any]:
        """
        Calculates dynamic parlay ('Combo') odds.
        If authenticated and all legs have Kalshi market_tickers + collection_ticker,
        attempts to instantiate the MVE market and request an RFQ quote from Kalshi.
        Otherwise dynamically computes compound Kalshi contract probability and payout.
        """
        base_stats = calculate_parlay(legs, stake=stake)
        submitted_legs = [
            l for l in legs if l.get("status", "submitted") == "submitted"
        ]
        tickers = [
            l.get("kalshi_market_ticker")
            for l in submitted_legs
            if l.get("kalshi_market_ticker")
        ]

        if (
            self.is_authenticated
            and collection_ticker
            and len(tickers) == len(submitted_legs)
            and len(tickers) >= 2
        ):
            try:
                mve_path = f"/multivariate_event_collections/{collection_ticker}"
                mve_url = f"{self.base_url}{mve_path}"
                selected_markets = []
                for l in submitted_legs:
                    mticker = str(l["kalshi_market_ticker"])
                    eticker = l.get("event_ticker") or "-".join(mticker.split("-")[:2])
                    selected_markets.append({
                        "market_ticker": mticker,
                        "event_ticker": eticker,
                        "side": l.get("kalshi_side", "yes"),
                    })
                headers = self._build_auth_headers("POST", mve_path)
                mve_resp = requests.post(
                    mve_url,
                    json={"selected_markets": selected_markets, "with_market_payload": True},
                    headers=headers,
                    timeout=5,
                )
                mve_resp.raise_for_status()
                mve_data = mve_resp.json()
                market_obj = mve_data.get("market") or {}
                combo_ticker = market_obj.get("ticker") or mve_data.get("ticker")

                if combo_ticker:
                    # 1. Check if market already has resting liquidity on the public book
                    try:
                        live_ask = float(market_obj.get("yes_ask_dollars") or 0)
                    except (TypeError, ValueError):
                        live_ask = 0.0

                    combo_cents: Optional[int] = None
                    if 0.0 < live_ask < 1.0:
                        combo_cents = extract_kalshi_price_cents(market_obj, "yes")
                    else:
                        # 2. No resting orderbook: request live quotes from market makers via RFQ
                        rfq_cents = self.request_rfq_combo_cents(combo_ticker, timeout_seconds=3.0)
                        if rfq_cents is not None:
                            combo_cents = max(1, min(99, int(round(rfq_cents))))

                    if combo_cents is not None:
                        multiplier = kalshi_cents_to_decimal(combo_cents)
                        payout = round(stake * multiplier, 2)
                        return {
                            **base_stats,
                            "multiplier": round(multiplier, 3),
                            "estimated_payout": payout,
                            "odds_american": kalshi_cents_to_american(combo_cents),
                            "combined_probability_cents": combo_cents,
                            "kalshi_combo_ticker": combo_ticker,
                            "pricing_source": "kalshi_mve",
                        }

                    logger.info(
                        "Kalshi combo %s has no resting liquidity or RFQ quotes; using compound pricing",
                        combo_ticker,
                    )
                    return {
                        **base_stats,
                        "kalshi_combo_ticker": combo_ticker,
                        "pricing_source": "kalshi_compound",
                    }
            except Exception as exc:
                logger.warning("Kalshi combo quote failed, using compound pricing: %s", exc)

        return {
            **base_stats,
            "pricing_source": "kalshi_compound",
        }

def split_event_teams_code(teams_str: str) -> Tuple[str, str]:
    """
    Splits a concatenated Kalshi matchup code (e.g. 'PITNO', 'MIANYJ', 'CHISEA', 'JACGB')
    into (away_team, home_team) NFL abbreviations.
    """
    s = teams_str.strip().upper()
    if not s:
        return "AWAY", "HOME"

    valid_codes = set(NFL_TEAMS_MAP.keys()) | {"JAC", "LA"}
    for split_idx in (2, 3):
        if len(s) > split_idx:
            left = s[:split_idx]
            right = s[split_idx:]
            if left in valid_codes and right in valid_codes:
                return normalize_team(left), normalize_team(right)
    return "AWAY", "HOME"


def extract_kalshi_kickoff_time(market: Dict[str, Any]) -> Optional[str]:
    """
    Kalshi NFL markets set `expected_expiration_time` (or `occurrence_datetime`)
    to 3 hours after scheduled kickoff, and `close_time` to 48 hours after kickoff.
    When `expected_expiration_time` is present, subtract 3 hours to get kickoff time.
    """
    exp = market.get("expected_expiration_time") or market.get("occurrence_datetime")
    if exp:
        try:
            dt = datetime.fromisoformat(str(exp).replace("Z", "+00:00"))
            kickoff_dt = dt - timedelta(hours=3)
            return kickoff_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        except Exception:
            pass
    return market.get("close_time") or market.get("commence_time") or market.get("expiration_time")


def infer_teams_from_kalshi_market(market: Dict[str, Any]) -> Tuple[str, str, str]:
    """
    Infers (away_team, home_team, target_team) from explicit fields, rules_primary,
    event_ticker, title, or ticker suffix.
    """
    home_raw = market.get("home_team", "")
    away_raw = market.get("away_team", "")
    target_raw = market.get("target_team", "")

    if home_raw and away_raw:
        h = normalize_team(home_raw)
        a = normalize_team(away_raw)
        t = normalize_team(target_raw) if target_raw else h
        return a, h, t

    a, h = "AWAY", "HOME"

    # 1. Check rules_primary: "in the <Away> vs <Home> Pro Football game" or "wins the <Away> vs <Home> Pro Football game"
    rules = str(market.get("rules_primary") or "")
    if rules:
        m_rules = re.search(
            r"the\s+([A-Za-z0-9 .]+?)\s+(?:vs\.?|at|@)\s+([A-Za-z0-9 .]+?)\s+Pro Football game",
            rules,
            re.IGNORECASE,
        )
        if m_rules:
            a = normalize_team(m_rules.group(1).strip())
            h = normalize_team(m_rules.group(2).strip())

    # 2. Check event_ticker / ticker date+matchup code: e.g. KXNFLGAME-26NOV02CHISEA or KXNFLSPREAD-26OCT29CARGB-GB8
    if a == "AWAY" or h == "HOME":
        ev_ticker = str(market.get("event_ticker") or market.get("ticker") or "")
        m_ev = re.search(r"-\d{2}[A-Z]{3}\d{2}([A-Z]{4,6})(?:-|$)", ev_ticker.upper())
        if m_ev:
            a_code, h_code = split_event_teams_code(m_ev.group(1))
            if a_code != "AWAY" and h_code != "HOME":
                a, h = a_code, h_code

    # 3. Fallback to title "Away at/vs Home"
    title = str(market.get("title") or "")
    if a == "AWAY" or h == "HOME":
        match_at = re.search(
            r"([A-Za-z .]+?)\s+(?:at|@|vs\.?)\s+([A-Za-z .]+?)(?:\s+Winner|\s*:|\?|$)",
            title,
            re.IGNORECASE,
        )
        if match_at:
            a = normalize_team(match_at.group(1).strip())
            h = normalize_team(match_at.group(2).strip())

    # Determine target_team (the team the YES contract is for)
    ticker = str(market.get("ticker") or "")
    parts = ticker.split("-")
    suffix_team = re.sub(r"[^A-Z]", "", parts[-1].upper()) if len(parts) >= 3 else ""
    if suffix_team in ("JAC", "LA"):
        suffix_team = normalize_team(suffix_team)

    sub = str(market.get("yes_sub_title") or market.get("subtitle") or "")
    title_wins_match = re.match(r"^([A-Za-z .]+?)\s+wins\b", title, re.IGNORECASE)
    sub_wins_match = re.match(r"^([A-Za-z .]+?)\s+wins\b", sub, re.IGNORECASE)

    if target_raw:
        t = normalize_team(target_raw)
    elif suffix_team in NFL_TEAMS_MAP:
        t = suffix_team
    elif title_wins_match:
        t = normalize_team(title_wins_match.group(1))
    elif sub_wins_match:
        t = normalize_team(sub_wins_match.group(1))
    elif sub and normalize_team(sub) in NFL_TEAMS_MAP:
        t = normalize_team(sub)
    else:
        t = h

    return a, h, t


def parse_kalshi_prop_market(market: Dict[str, Any], series_ticker: str = "") -> Dict[str, Any]:
    ticker = market.get("ticker", "")
    event_ticker = market.get("event_ticker", "")
    resolved_series = (
        series_ticker
        or market.get("series_ticker")
        or (event_ticker.split("-")[0] if "-" in event_ticker else "")
        or (ticker.split("-")[0] if "-" in ticker else "")
    )
    title = market.get("title") or market.get("subtitle") or ticker
    yes_cents = extract_kalshi_price_cents(market, "yes")
    no_cents = extract_kalshi_price_cents(market, "no")
    if market.get("no_ask") is None and market.get("no_ask_dollars") is None:
        no_cents = max(1, min(99, 100 - yes_cents))

    kickoff_time = extract_kalshi_kickoff_time(market)
    away_team, home_team, _ = infer_teams_from_kalshi_market(market)

    # Infer player's NFL team from explicit field or 3rd segment of ticker (e.g. KXNFLTD-26OCT26DALPHI-DALEDEMERCADO31-1)
    if market.get("nfl_team"):
        nfl_team = normalize_team(market["nfl_team"])
    else:
        nfl_team = "NFL"
        parts = ticker.split("-")
        if len(parts) >= 3:
            player_slug = parts[2].upper()
            for candidate in sorted([away_team, home_team], key=len, reverse=True):
                if candidate not in ("AWAY", "HOME", "NFL") and player_slug.startswith(candidate):
                    nfl_team = candidate
                    break
        if nfl_team == "NFL" and home_team != "HOME":
            nfl_team = home_team

    player_name = market.get("player_name", "")
    label = title
    if ":" in title:
        p_part, l_part = title.split(":", 1)
        if not player_name:
            player_name = p_part.strip()
        label = l_part.strip()
    elif not player_name and market.get("yes_sub_title"):
        sub_str = str(market.get("yes_sub_title")).strip()
        if ":" in sub_str:
            player_name = sub_str.split(":", 1)[0].strip()
        else:
            player_name = sub_str

    stat_category = market.get("stat_category") or SERIES_CATEGORY_MAP.get(resolved_series, "Touchdowns")
    position = SERIES_POSITION_MAP.get(resolved_series, "FLEX")
    norm_game_id = re.sub(
        r"^KXNFL[A-Z0-9]*-",
        "KXNFL-",
        str(event_ticker or market.get("game_id") or ""),
    )

    return {
        "market_ticker": ticker,
        "event_ticker": event_ticker,
        "series_ticker": resolved_series,
        "title": title,
        "label": label,
        "player_name": player_name,
        "nfl_team": nfl_team,
        "position": position,
        "stat_category": stat_category,
        "line": market.get("floor_strike") or market.get("strike"),
        "yes_price_cents": yes_cents,
        "no_price_cents": no_cents,
        "yes_odds_american": kalshi_cents_to_american(yes_cents),
        "no_odds_american": kalshi_cents_to_american(no_cents),
        "yes_decimal": kalshi_cents_to_decimal(yes_cents),
        "no_decimal": kalshi_cents_to_decimal(no_cents),
        "kickoff_time": kickoff_time,
        "game_id": norm_game_id or event_ticker or market.get("game_id"),
    }


def parse_kalshi_game_markets(raw_markets: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Groups Kalshi NFL game markets (KXNFLGAME, KXNFLSPREAD, KXNFLTOTAL) into game objects.
    When multiple spread or total strikes exist for the same game, selects the main line
    whose YES contract price is closest to 50 cents (even money).
    """
    games_by_id: Dict[str, Dict[str, Any]] = {}

    for m in raw_markets:
        if m.get("status") in ("finalized", "settled", "closed"):
            continue
        if m.get("yes_ask_dollars") == "1.0000" and m.get("no_ask_dollars") == "1.0000":
            continue

        raw_event = m.get("game_id") or m.get("event_ticker") or m.get("ticker", "game")
        # Normalize event_ticker across KXNFLGAME / KXNFLSPREAD / KXNFLTOTAL for the same matchup
        game_id = re.sub(r"^KXNFL(?:GAME|SPREAD|TOTAL)-", "KXNFL-", str(raw_event))
        away_norm, home_norm, target_team = infer_teams_from_kalshi_market(m)
        commence_time = extract_kalshi_kickoff_time(m)
        series = (
            m.get("series_ticker")
            or (str(m.get("event_ticker") or "").split("-")[0])
            or (str(m.get("ticker") or "").split("-")[0])
        )
        ticker = m.get("ticker", "")
        yes_cents = extract_kalshi_price_cents(m, "yes")
        no_cents = extract_kalshi_price_cents(m, "no")
        if m.get("no_ask") is None and m.get("no_ask_dollars") is None:
            no_cents = max(1, min(99, 100 - yes_cents))

        if game_id not in games_by_id:
            games_by_id[game_id] = {
                "game_id": game_id,
                "commence_time": commence_time,
                "home_team": home_norm,
                "away_team": away_norm,
                "spread": {},
                "moneyline": {},
                "total": {},
                "_best_spread_diff": 999,
                "_best_total_diff": 999,
            }

        g = games_by_id[game_id]
        if g["home_team"] == "HOME" and home_norm != "HOME":
            g["home_team"] = home_norm
        if g["away_team"] == "AWAY" and away_norm != "AWAY":
            g["away_team"] = away_norm
        if not g.get("commence_time") and commence_time:
            g["commence_time"] = commence_time

        if series == "KXNFLGAME":
            if teams_match(target_team, g["home_team"]):
                g["moneyline"]["home_odds"] = kalshi_cents_to_american(yes_cents)
                g["moneyline"]["home_cents"] = yes_cents
                g["moneyline"]["home_ticker"] = ticker
                if "away_odds" not in g["moneyline"]:
                    g["moneyline"]["away_odds"] = kalshi_cents_to_american(no_cents)
                    g["moneyline"]["away_cents"] = no_cents
                    g["moneyline"]["away_ticker"] = ticker
            elif teams_match(target_team, g["away_team"]):
                g["moneyline"]["away_odds"] = kalshi_cents_to_american(yes_cents)
                g["moneyline"]["away_cents"] = yes_cents
                g["moneyline"]["away_ticker"] = ticker
                if "home_odds" not in g["moneyline"]:
                    g["moneyline"]["home_odds"] = kalshi_cents_to_american(no_cents)
                    g["moneyline"]["home_cents"] = no_cents
                    g["moneyline"]["home_ticker"] = ticker

        elif series == "KXNFLSPREAD":
            raw_strike = float(m.get("floor_strike", m.get("point", -3.5)))
            # In Kalshi KXNFLSPREAD, floor_strike is positive (e.g. 7.5 for "Green Bay wins by over 7.5 points?"),
            # meaning Green Bay is -7.5 on the spread.
            fav_spread = -abs(raw_strike) if raw_strike != 0 else 0.0
            dog_spread = abs(raw_strike) if raw_strike != 0 else 0.0

            diff_from_even = abs(yes_cents - 50)
            if diff_from_even <= g["_best_spread_diff"]:
                g["_best_spread_diff"] = diff_from_even
                if teams_match(target_team, g["home_team"]):
                    g["spread"]["home"] = fav_spread if raw_strike < 0 or "wins by" in str(m.get("title", "")).lower() or "wins by" in str(m.get("rules_primary", "")).lower() else raw_strike
                    g["spread"]["home_odds"] = kalshi_cents_to_american(yes_cents)
                    g["spread"]["home_cents"] = yes_cents
                    g["spread"]["home_ticker"] = ticker
                    g["spread"]["away"] = -g["spread"]["home"]
                    g["spread"]["away_odds"] = kalshi_cents_to_american(no_cents)
                    g["spread"]["away_cents"] = no_cents
                    g["spread"]["away_ticker"] = ticker
                elif teams_match(target_team, g["away_team"]):
                    g["spread"]["away"] = fav_spread if raw_strike < 0 or "wins by" in str(m.get("title", "")).lower() or "wins by" in str(m.get("rules_primary", "")).lower() else raw_strike
                    g["spread"]["away_odds"] = kalshi_cents_to_american(yes_cents)
                    g["spread"]["away_cents"] = yes_cents
                    g["spread"]["away_ticker"] = ticker
                    g["spread"]["home"] = -g["spread"]["away"]
                    g["spread"]["home_odds"] = kalshi_cents_to_american(no_cents)
                    g["spread"]["home_cents"] = no_cents
                    g["spread"]["home_ticker"] = ticker

        elif series == "KXNFLTOTAL":
            strike = float(m.get("floor_strike", m.get("point", 47.5)))
            diff_from_even = abs(yes_cents - 50)
            if diff_from_even <= g["_best_total_diff"]:
                g["_best_total_diff"] = diff_from_even
                g["total"]["over_under"] = strike
                g["total"]["over_odds"] = kalshi_cents_to_american(yes_cents)
                g["total"]["over_cents"] = yes_cents
                g["total"]["over_ticker"] = ticker
                g["total"]["under_odds"] = kalshi_cents_to_american(no_cents)
                g["total"]["under_cents"] = no_cents
                g["total"]["under_ticker"] = ticker

    cleaned_games = []
    for g in games_by_id.values():
        g.pop("_best_spread_diff", None)
        g.pop("_best_total_diff", None)
        if g["home_team"] != "HOME" and g["away_team"] != "AWAY":
            cleaned_games.append(g)

    cleaned_games.sort(key=lambda x: str(x.get("commence_time") or ""))

    if cleaned_games:
        active_week_key = get_nfl_week_bucket_key(cleaned_games[0].get("commence_time"))
        if active_week_key:
            cleaned_games = [
                g for g in cleaned_games
                if get_nfl_week_bucket_key(g.get("commence_time")) == active_week_key
            ]

    return {"games": cleaned_games}


def get_nfl_week_bucket_key(kickoff_iso: Optional[str]) -> str:
    """
    Maps an NFL kickoff timestamp to its Wednesday-to-Tuesday NFL week bucket (YYYY-MM-DD of that week's Wednesday).
    Shifting back by 8 hours ensures Monday Night Football (Tuesday ~00:15 UTC) remains in the current week's bucket.
    """
    if not kickoff_iso:
        return ""
    try:
        dt = datetime.fromisoformat(str(kickoff_iso).replace("Z", "+00:00"))
        shifted = dt - timedelta(hours=8)
        # Python weekday(): Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
        days_since_wednesday = (shifted.weekday() - 2) % 7
        wednesday = shifted - timedelta(days=days_since_wednesday)
        return wednesday.strftime("%Y-%m-%d")
    except Exception:
        return ""


def format_games_for_frontend(parsed_games: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Converts parsed game dictionaries into the GameLineOption structure consumed by PickModal.tsx.
    """
    formatted: List[Dict[str, Any]] = []
    for g in parsed_games:
        gid = g.get("game_id", "KXNFL-GAME")
        home = g.get("home_team") or "HOME"
        away = g.get("away_team") or "AWAY"
        commence = g.get("commence_time") or "2026-11-01T17:00:00Z"
        sp = g.get("spread") or {}
        ml = g.get("moneyline") or {}
        tot = g.get("total") or {}

        formatted.append({
            "game_id": gid,
            "home_team": home,
            "away_team": away,
            "commence_time": commence,
            "spread_home": {
                "point": float(sp.get("home", -2.5)),
                "odds": sp.get("home_odds", "-113"),
                "price_cents": int(sp.get("home_cents", 53)),
                "market_ticker": sp.get("home_ticker", f"KXNFLSPREAD-{gid}-{home}"),
            },
            "spread_away": {
                "point": float(sp.get("away", 2.5)),
                "odds": sp.get("away_odds", "-108"),
                "price_cents": int(sp.get("away_cents", 52)),
                "market_ticker": sp.get("away_ticker", f"KXNFLSPREAD-{gid}-{away}"),
            },
            "ml_home": {
                "odds": ml.get("home_odds", "-130"),
                "price_cents": int(ml.get("home_cents", 56)),
                "market_ticker": ml.get("home_ticker", f"KXNFLGAME-{gid}-{home}"),
            },
            "ml_away": {
                "odds": ml.get("away_odds", "+110"),
                "price_cents": int(ml.get("away_cents", 48)),
                "market_ticker": ml.get("away_ticker", f"KXNFLGAME-{gid}-{away}"),
            },
            "total_over": {
                "point": float(tot.get("over_under", 47.5)),
                "odds": tot.get("over_odds", "-113"),
                "price_cents": int(tot.get("over_cents", 53)),
                "market_ticker": tot.get("over_ticker", f"KXNFLTOTAL-{gid}-O"),
            },
            "total_under": {
                "point": float(tot.get("over_under", 47.5)),
                "odds": tot.get("under_odds", "-108"),
                "price_cents": int(tot.get("under_cents", 52)),
                "market_ticker": tot.get("under_ticker", f"KXNFLTOTAL-{gid}-U"),
            },
        })
    return formatted

def calculate_earliest_kickoff(legs: List[Dict[str, Any]]) -> Optional[str]:
    submitted = [
        leg for leg in legs
        if leg.get("status", "submitted") == "submitted"
    ]
    kickoffs = [leg.get("kickoff_time") for leg in submitted if leg.get("kickoff_time")]
    if not kickoffs:
        return None
    return min(kickoffs, key=lambda k: datetime.fromisoformat(k.replace("Z", "+00:00")))

def is_kickoff_passed(kickoff_time_iso: Optional[str], current_time_iso: Optional[str] = None) -> bool:
    if not kickoff_time_iso:
        return False
    kickoff = datetime.fromisoformat(kickoff_time_iso.replace("Z", "+00:00"))
    if current_time_iso:
        now = datetime.fromisoformat(current_time_iso.replace("Z", "+00:00"))
    else:
        now = datetime.now(timezone.utc)
    return now >= kickoff
