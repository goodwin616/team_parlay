import os
import math
import logging
import urllib.parse
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Callable
import requests

from parlay_math import (
    kalshi_cents_to_decimal,
    american_to_decimal,
    decimal_to_american,
)

logger = logging.getLogger(__name__)

KALSHI_API_BASE_URL = os.environ.get(
    "KALSHI_API_BASE_URL", "https://api.elections.kalshi.com/trade-api/v2"
)


def grade_leg(leg: Dict[str, Any], market: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Grades a single parlay leg against Kalshi market resolution data.
    """
    updated = dict(leg)
    if not market or not isinstance(market, dict):
        updated["outcome"] = "pending"
        return updated

    # Unwrap nested "market" key if present
    if "market" in market and isinstance(market["market"], dict):
        market = market["market"]

    status = str(market.get("status") or "").strip().lower()
    result = str(market.get("result") or "").strip().lower()
    kalshi_side = str(leg.get("kalshi_side") or "").strip().lower()

    if status in ("finalized", "settled"):
        if kalshi_side and result == kalshi_side:
            outcome = "won"
        elif result in ("void", "scalar") or status == "void":
            outcome = "void"
        else:
            outcome = "lost"
    elif status == "void":
        outcome = "void"
    else:
        outcome = "pending"

    updated["outcome"] = outcome
    return updated


def grade_parlay(parlay: Dict[str, Any], market_lookup: Dict[str, Any]) -> Dict[str, Any]:
    """
    Grades all submitted legs of a parlay and calculates the ticket outcome,
    settlement status, and recalculates payout if any legs were voided.
    """
    updated_parlay = dict(parlay)
    legs = parlay.get("legs", [])
    graded_legs: List[Dict[str, Any]] = []

    for leg in legs:
        is_submitted = (
            leg.get("status", "submitted") == "submitted"
            or bool(leg.get("kalshi_market_ticker"))
        )
        if is_submitted:
            ticker = leg.get("kalshi_market_ticker")
            market = market_lookup.get(ticker) if ticker else None
            graded = grade_leg(leg, market)
            graded_legs.append(graded)
        else:
            unsub = dict(leg)
            unsub.setdefault("outcome", "pending")
            graded_legs.append(unsub)

    updated_parlay["legs"] = graded_legs

    submitted_legs = [
        l for l in graded_legs
        if l.get("status", "submitted") == "submitted" or bool(l.get("kalshi_market_ticker"))
    ]

    if not submitted_legs:
        updated_parlay["outcome"] = "pending"
        updated_parlay["settlement_status"] = "pending"
        return updated_parlay

    stake = float(updated_parlay.get("stake") or 5.0)

    # If any submitted leg is lost -> ticket lost
    if any(l.get("outcome") == "lost" for l in submitted_legs):
        updated_parlay["outcome"] = "lost"
        updated_parlay["settlement_status"] = "finalized"
        updated_parlay["status"] = "lost"
        updated_parlay["actual_payout"] = 0.0
    # Else if any submitted leg is pending -> ticket pending
    elif any(l.get("outcome") == "pending" for l in submitted_legs):
        updated_parlay["outcome"] = "pending"
        updated_parlay["settlement_status"] = "pending"
    # Else all submitted legs are won or void -> ticket won
    else:
        updated_parlay["outcome"] = "won"
        updated_parlay["settlement_status"] = "finalized"
        updated_parlay["status"] = "won"

        has_void = any(l.get("outcome") == "void" for l in submitted_legs)
        if has_void:
            # Recalculate multiplying only non-void winning legs' decimal odds * stake ($5)
            winning_legs = [l for l in submitted_legs if l.get("outcome") == "won"]
            decimals = []
            for l in winning_legs:
                if l.get("price_cents") is not None:
                    decimals.append(kalshi_cents_to_decimal(l["price_cents"]))
                elif l.get("odds_decimal") is not None:
                    decimals.append(float(l["odds_decimal"]))
                else:
                    decimals.append(american_to_decimal(l.get("odds_american", "-110")))

            multiplier = math.prod(decimals) if decimals else 1.0
            actual_payout = round(stake * multiplier, 2)
            updated_parlay["actual_payout"] = actual_payout
            updated_parlay["actual_multiplier"] = round(multiplier, 3)
            updated_parlay["actual_odds_american"] = decimal_to_american(multiplier)
        else:
            if updated_parlay.get("actual_payout") is None:
                if updated_parlay.get("estimated_payout") is not None:
                    updated_parlay["actual_payout"] = float(updated_parlay["estimated_payout"])
                else:
                    est_mult = float(updated_parlay.get("estimated_multiplier") or 1.0)
                    updated_parlay["actual_payout"] = round(stake * est_mult, 2)

    return updated_parlay


def default_fetch_kalshi_market(ticker: str) -> Optional[Dict[str, Any]]:
    """
    Default HTTP fetcher for Kalshi public market endpoint: GET /trade-api/v2/markets/{ticker}
    """
    url = f"{KALSHI_API_BASE_URL.rstrip('/')}/markets/{urllib.parse.quote(ticker)}"
    try:
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("market") or data
        logger.warning("Kalshi market fetch for %s returned status %s", ticker, resp.status_code)
        return None
    except Exception as exc:
        logger.warning("Error fetching Kalshi market %s: %s", ticker, exc)
        return None


def settle_unfinalized_parlays(
    db: Any,
    league_id: str,
    season: str,
    current_week: int,
    kalshi_fetcher_fn: Optional[Callable[[str], Optional[Dict[str, Any]]]] = None,
) -> List[Dict[str, Any]]:
    """
    Queries locked parlays in leagues/{league_id}/seasons/{season}/parlays where
    week < current_week OR status == 'locked'.
    Skips any document where settlement_status == 'finalized'.
    Collects unfinalized kalshi_market_ticker strings, queries market data,
    grades legs and ticket, and updates Firestore documents.
    """
    if db is None:
        return []

    fetcher = kalshi_fetcher_fn or default_fetch_kalshi_market

    parlays_ref = (
        db.collection("leagues")
        .document(str(league_id))
        .collection("seasons")
        .document(str(season))
        .collection("parlays")
    )

    unfinalized_docs = []
    try:
        for doc in parlays_ref.stream():
            data = doc.to_dict() or {}
            week = int(data.get("week") or (int(doc.id) if doc.id.isdigit() else 0))
            status = str(data.get("status") or "")
            settlement_status = str(data.get("settlement_status") or "")

            is_eligible = (week < current_week) or (status == "locked")
            if not is_eligible:
                continue

            if settlement_status == "finalized":
                continue

            unfinalized_docs.append((doc, data))
    except Exception as exc:
        logger.warning("Error streaming parlays for settlement: %s", exc)
        return []

    if not unfinalized_docs:
        return []

    # Collect unique tickers
    unique_tickers = set()
    for _, p_data in unfinalized_docs:
        for leg in p_data.get("legs", []):
            is_sub = (
                leg.get("status", "submitted") == "submitted"
                or bool(leg.get("kalshi_market_ticker"))
            )
            t = leg.get("kalshi_market_ticker")
            if is_sub and t:
                unique_tickers.add(str(t).strip())

    # Fetch markets safely
    market_lookup: Dict[str, Any] = {}
    for ticker in unique_tickers:
        try:
            m_data = fetcher(ticker)
            if m_data:
                market_lookup[ticker] = m_data
        except Exception as exc:
            logger.warning("Fetcher failed for ticker %s: %s", ticker, exc)

    # Grade and update Firestore
    graded_parlays: List[Dict[str, Any]] = []
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    for doc, p_data in unfinalized_docs:
        graded = grade_parlay(p_data, market_lookup)
        graded_parlays.append(graded)

        update_payload: Dict[str, Any] = {
            "outcome": graded["outcome"],
            "settlement_status": graded["settlement_status"],
            "legs": graded["legs"],
            "actual_payout": graded.get("actual_payout"),
            "status": graded.get("status", p_data.get("status")),
        }
        if graded.get("actual_multiplier") is not None:
            update_payload["actual_multiplier"] = graded["actual_multiplier"]
        if graded.get("actual_odds_american") is not None:
            update_payload["actual_odds_american"] = graded["actual_odds_american"]

        if graded["settlement_status"] == "finalized":
            update_payload["settled_at"] = now_iso

        try:
            doc.reference.update(update_payload)
        except Exception as exc:
            logger.warning("Failed updating Firestore for parlay doc %s: %s", doc.id, exc)

    return graded_parlays
