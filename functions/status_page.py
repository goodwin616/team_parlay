import html
import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sleeper_sync import (
    fetch_sleeper_nfl_state,
    fetch_sleeper_league_info,
    fetch_sleeper_league_data,
    build_teams_from_sleeper,
    determine_weekly_bettor,
)


class StatusPageError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


DEMO_TEAMS: List[Dict[str, Any]] = [
    {"roster_id": 1, "owner_name": "Blake", "team_name": "Philly Special"},
    {"roster_id": 2, "owner_name": "Bob", "team_name": "Gridiron Clowns"},
    {"roster_id": 3, "owner_name": "Alice", "team_name": "Motor City Kitties"},
    {"roster_id": 4, "owner_name": "Charlie", "team_name": "Buffalo Stampede"},
    {"roster_id": 5, "owner_name": "Dave", "team_name": "Lone Star Dynasty"},
]

DEMO_PARLAYS: Dict[int, Dict[str, Any]] = {
    4: {
        "week": 4,
        "season": "2026",
        "status": "open",
        "outcome": "pending",
        "settlement_status": "pending",
        "contains_sgp": False,
        "bettor": {
            "roster_id": 2,
            "team_name": "Gridiron Clowns",
            "owner_name": "Bob",
            "points_last_week": 78.4,
        },
        "earliest_kickoff": "2026-10-29T20:15:00Z",
        "legs": [
            {
                "id": "l1",
                "roster_id": 1,
                "team_name": "Philly Special",
                "owner_name": "Blake",
                "nfl_team": "PHI",
                "description": "Saquon Barkley (PHI) • Anytime TD (1+) (YES)",
                "odds_american": "-117",
                "odds_decimal": 1.8519,
                "price_cents": 54,
                "kalshi_market_ticker": "KXNFLTD-26NOV01-SAQUONBARK-1",
                "kalshi_side": "yes",
                "status": "submitted",
                "outcome": "pending",
                "kickoff_time": "2026-11-01T17:00:00Z",
            },
            {
                "id": "l2",
                "roster_id": 2,
                "team_name": "Gridiron Clowns",
                "owner_name": "Bob",
                "nfl_team": "KC",
                "description": "KC Winner (Moneyline)",
                "odds_american": "+117",
                "odds_decimal": 2.1739,
                "price_cents": 46,
                "kalshi_market_ticker": "KXNFLGAME-26OCT29-KCBAL-KC",
                "kalshi_side": "yes",
                "status": "submitted",
                "outcome": "pending",
                "kickoff_time": "2026-10-29T20:15:00Z",
            },
            {
                "id": "l3",
                "roster_id": 3,
                "team_name": "Motor City Kitties",
                "owner_name": "Alice",
                "nfl_team": "DET",
                "description": "Amon-Ra St. Brown (DET) • 75+ Rec Yards (YES)",
                "odds_american": "-110",
                "odds_decimal": 1.9091,
                "price_cents": 52,
                "kalshi_market_ticker": "KXNFLRECYDS-26NOV01-ARSB-75",
                "kalshi_side": "yes",
                "status": "submitted",
                "outcome": "pending",
                "kickoff_time": "2026-11-01T17:00:00Z",
            },
            {
                "id": "l4",
                "roster_id": 4,
                "team_name": "Buffalo Stampede",
                "owner_name": "Charlie",
                "nfl_team": "BUF",
                "description": "",
                "odds_american": "-110",
                "odds_decimal": 1.91,
                "status": "pending",
            },
            {
                "id": "l5",
                "roster_id": 5,
                "team_name": "Lone Star Dynasty",
                "owner_name": "Dave",
                "nfl_team": "DAL",
                "description": "",
                "odds_american": "-110",
                "odds_decimal": 1.91,
                "status": "pending",
            },
        ],
        "estimated_odds_american": "+669",
        "estimated_multiplier": 7.69,
        "estimated_payout": 38.45,
        "actual_payout": None,
        "actual_odds_american": None,
    }
}


def _clean_league_id(raw: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "", (raw or "").strip())


def extract_status_request_params(
    path: str,
    args: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    args = args or {}
    headers = {str(k).lower(): str(v) for k, v in (headers or {}).items()}

    segments = [s.strip() for s in (path or "").split("/") if s.strip()]
    league_id = ""

    if len(segments) >= 2 and segments[0].lower() == "status":
        league_id = _clean_league_id(segments[1])
    elif (
        len(segments) >= 3
        and segments[0].lower() in ("league", "leagues")
        and segments[2].lower() == "status"
    ):
        league_id = _clean_league_id(segments[1])
    elif len(segments) >= 2 and segments[1].lower() == "status":
        league_id = _clean_league_id(segments[0])
    elif args.get("league_id") or args.get("league"):
        league_id = _clean_league_id(str(args.get("league_id") or args.get("league")))

    if not league_id or league_id.lower() in ("status", "league", "leagues"):
        raise StatusPageError(
            400,
            "Missing league_id. Use /status/<league_id> or /<league_id>/status.",
        )

    week: Optional[int] = None
    raw_week = args.get("week")
    if raw_week is not None and str(raw_week).strip() != "":
        try:
            week = int(str(raw_week).strip())
        except (ValueError, TypeError):
            raise StatusPageError(400, "Query parameter 'week' must be a positive integer.")
        if week < 1:
            raise StatusPageError(400, "Query parameter 'week' must be >= 1.")

    season: Optional[str] = None
    raw_season = args.get("season")
    if raw_season is not None and str(raw_season).strip() != "":
        season = re.sub(r"[^0-9]", "", str(raw_season).strip()) or None

    raw_format = str(args.get("format") or "").strip().lower()
    accept = headers.get("accept", "").lower()

    if raw_format in ("json",):
        fmt = "json"
    elif raw_format in ("md", "markdown", "text", "txt"):
        fmt = "md"
    elif raw_format in ("html", ""):
        if not raw_format and "application/json" in accept and "text/html" not in accept:
            fmt = "json"
        elif not raw_format and (
            "text/markdown" in accept
            or ("text/plain" in accept and "text/html" not in accept)
        ):
            fmt = "md"
        else:
            fmt = "html"
    else:
        raise StatusPageError(
            400,
            "Invalid format. Supported values are 'html', 'json', or 'md'.",
        )

    return {
        "league_id": league_id,
        "week": week,
        "season": season,
        "format": fmt,
    }


def _sanitize_parlay_payload(
    league_id: str,
    league_name: str,
    season: str,
    current_week: int,
    updated_at: Optional[str],
    teams_data: List[Dict[str, Any]],
    parlay_data: Dict[str, Any],
) -> Dict[str, Any]:
    week = int(parlay_data.get("week") or current_week or 1)
    legs = parlay_data.get("legs") or []

    submitted_legs: List[Dict[str, Any]] = []
    submitted_roster_ids = set()
    pending_managers: List[Dict[str, Any]] = []
    seen_pending_roster_ids = set()

    for leg in legs:
        rid = leg.get("roster_id")
        leg_status = str(leg.get("status") or "pending").lower()
        owner_name = str(leg.get("owner_name") or f"Owner {rid}")
        team_name = str(leg.get("team_name") or f"Team {rid}")

        if leg_status != "pending":
            submitted_roster_ids.add(rid)
            submitted_legs.append(
                {
                    "roster_id": rid,
                    "owner_name": owner_name,
                    "team_name": team_name,
                    "nfl_team": leg.get("nfl_team") or "NFL",
                    "description": leg.get("description") or "",
                    "odds_american": leg.get("odds_american") or "",
                    "price_cents": leg.get("price_cents"),
                    "kalshi_market_ticker": leg.get("kalshi_market_ticker"),
                    "kalshi_side": leg.get("kalshi_side"),
                    "status": leg_status,
                    "outcome": leg.get("outcome")
                    or (
                        leg_status
                        if leg_status in ("won", "lost", "void", "voided", "pushed")
                        else "pending"
                    ),
                    "kickoff_time": leg.get("kickoff_time"),
                }
            )
        else:
            seen_pending_roster_ids.add(rid)
            pending_managers.append(
                {
                    "roster_id": rid,
                    "owner_name": owner_name,
                    "team_name": team_name,
                }
            )

    for t in sorted(teams_data, key=lambda x: int(x.get("roster_id") or 0)):
        rid = t.get("roster_id")
        if rid not in submitted_roster_ids and rid not in seen_pending_roster_ids:
            seen_pending_roster_ids.add(rid)
            pending_managers.append(
                {
                    "roster_id": rid,
                    "owner_name": str(t.get("owner_name") or f"Owner {rid}"),
                    "team_name": str(t.get("team_name") or f"Team {rid}"),
                }
            )

    total_managers = len(submitted_legs) + len(pending_managers)
    submitted_count = len(submitted_legs)
    pending_count = len(pending_managers)

    is_official = bool(
        parlay_data.get("actual_payout") is not None
        or parlay_data.get("actual_odds_american")
    )
    total_payout = (
        float(parlay_data["actual_payout"])
        if parlay_data.get("actual_payout") is not None
        else float(parlay_data.get("estimated_payout") or 0.0)
    )
    payout_per_player = (
        round(total_payout / submitted_count, 2) if submitted_count > 0 else 0.0
    )
    multiplier = float(
        parlay_data.get("actual_multiplier")
        or parlay_data.get("estimated_multiplier")
        or 1.0
    )
    odds_american = str(
        parlay_data.get("actual_odds_american")
        or parlay_data.get("estimated_odds_american")
        or "+100"
    )

    raw_bettor = parlay_data.get("bettor") or {}
    bettor = {
        "roster_id": raw_bettor.get("roster_id"),
        "owner_name": str(raw_bettor.get("owner_name") or ""),
        "team_name": str(raw_bettor.get("team_name") or ""),
        "points_last_week": float(raw_bettor.get("points_last_week") or 0.0),
    }

    return {
        "league_id": str(league_id),
        "league_name": str(league_name),
        "season": str(season),
        "week": week,
        "current_week": int(current_week),
        "updated_at": updated_at,
        "parlay": {
            "status": str(parlay_data.get("status") or "open"),
            "outcome": str(parlay_data.get("outcome") or "pending"),
            "settlement_status": str(
                parlay_data.get("settlement_status") or "pending"
            ),
            "contains_sgp": bool(parlay_data.get("contains_sgp", False)),
            "earliest_kickoff": parlay_data.get("earliest_kickoff"),
            "stake_dollars": 5.0,
            "quote_type": "official" if is_official else "estimate",
            "odds_american": odds_american if submitted_count > 0 else None,
            "multiplier": round(multiplier, 2) if submitted_count > 0 else None,
            "total_payout_dollars": round(total_payout, 2)
            if submitted_count > 0
            else 0.0,
            "payout_per_player_dollars": payout_per_player,
            "bettor": bettor,
            "counts": {
                "total_managers": total_managers,
                "submitted": submitted_count,
                "pending": pending_count,
            },
            "submitted_legs": submitted_legs,
            "pending_managers": pending_managers,
        },
    }


def _build_readonly_status_from_sleeper(
    league_id: str,
    requested_week: Optional[int] = None,
    requested_season: Optional[str] = None,
) -> Dict[str, Any]:
    try:
        league_info = fetch_sleeper_league_info(league_id)
        try:
            nfl_state = fetch_sleeper_nfl_state()
            current_week = int(nfl_state.get("week") or 1)
            nfl_season = nfl_state.get("season")
        except Exception:
            current_week = int((league_info.get("settings") or {}).get("leg") or 1)
            nfl_season = None
        current_week = max(1, current_week)
        target_week = int(requested_week or current_week)
        prev_week = max(1, target_week - 1)
        sleeper_data = fetch_sleeper_league_data(league_id, prev_week)
        teams = build_teams_from_sleeper(
            sleeper_data.get("rosters") or [],
            sleeper_data.get("users") or [],
        )
        if not teams:
            raise ValueError("No teams found")
        bettor = determine_weekly_bettor(
            sleeper_data.get("matchups") or [],
            sleeper_data.get("rosters") or [],
            sleeper_data.get("users") or [],
        )
        if not bettor and teams:
            bettor = {
                "roster_id": teams[0]["roster_id"],
                "team_name": teams[0]["team_name"],
                "owner_name": teams[0]["owner_name"],
                "points_last_week": 0.0,
            }
        season = str(
            requested_season
            or league_info.get("season")
            or nfl_season
            or datetime.now(timezone.utc).year
        )
        league_name = str(league_info.get("name") or f"Sleeper League {league_id}")
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        parlay_data = {
            "week": target_week,
            "season": season,
            "status": "open" if target_week == current_week else "locked",
            "outcome": "pending",
            "settlement_status": "pending",
            "contains_sgp": False,
            "bettor": bettor,
            "earliest_kickoff": None,
            "legs": [
                {
                    "id": f"l_{t['roster_id']}",
                    "roster_id": t["roster_id"],
                    "team_name": t["team_name"],
                    "owner_name": t["owner_name"],
                    "nfl_team": "NFL",
                    "description": "",
                    "odds_american": "-110",
                    "odds_decimal": 1.91,
                    "status": "pending",
                }
                for t in teams
            ],
            "estimated_odds_american": "+100",
            "estimated_multiplier": 1.0,
            "estimated_payout": 5.0,
            "actual_payout": None,
            "actual_odds_american": None,
        }
        return _sanitize_parlay_payload(
            league_id=league_id,
            league_name=league_name,
            season=season,
            current_week=current_week,
            updated_at=now_iso,
            teams_data=teams,
            parlay_data=parlay_data,
        )
    except Exception:
        raise StatusPageError(
            404,
            f"League '{league_id}' was not found or has not been initialized yet.",
        )


def build_sanitized_league_status(
    db: Any,
    league_id: str,
    requested_week: Optional[int] = None,
    requested_season: Optional[str] = None,
) -> Dict[str, Any]:
    is_demo = league_id.lower() == "demo"
    league_ref = db.collection("leagues").document(str(league_id))
    league_doc = league_ref.get()

    if not league_doc.exists:
        if is_demo:
            target_week = requested_week or 4
            demo_parlay = DEMO_PARLAYS.get(target_week)
            if not demo_parlay:
                raise StatusPageError(
                    404, f"Week {target_week} parlay not found for demo league."
                )
            return _sanitize_parlay_payload(
                league_id="demo",
                league_name="Demo Sleeper League",
                season=requested_season or "2026",
                current_week=4,
                updated_at="2026-10-31T00:00:00Z",
                teams_data=DEMO_TEAMS,
                parlay_data=demo_parlay,
            )
        return _build_readonly_status_from_sleeper(
            league_id=league_id,
            requested_week=requested_week,
            requested_season=requested_season,
        )

    league_meta = league_doc.to_dict() or {}
    season = str(
        requested_season
        or league_meta.get("active_season")
        or league_meta.get("season")
        or datetime.now(timezone.utc).year
    )
    current_week = int(league_meta.get("current_week") or 1)
    target_week = int(requested_week or current_week)
    league_name = str(league_meta.get("name") or f"Sleeper League {league_id}")
    updated_at = league_meta.get("updated_at")

    season_ref = league_ref.collection("seasons").document(season)
    parlay_doc = season_ref.collection("parlays").document(str(target_week)).get()

    if not parlay_doc.exists:
        if is_demo and target_week in DEMO_PARLAYS:
            return _sanitize_parlay_payload(
                league_id="demo",
                league_name=league_name,
                season=season,
                current_week=current_week,
                updated_at=updated_at,
                teams_data=DEMO_TEAMS,
                parlay_data=DEMO_PARLAYS[target_week],
            )
        if not is_demo:
            return _build_readonly_status_from_sleeper(
                league_id=league_id,
                requested_week=target_week,
                requested_season=season,
            )
        raise StatusPageError(
            404,
            f"No parlay found for league '{league_id}' in season {season}, week {target_week}.",
        )

    teams_docs = season_ref.collection("teams").stream()
    teams_data = [d.to_dict() or {} for d in teams_docs]
    parlay_data = parlay_doc.to_dict() or {}

    return _sanitize_parlay_payload(
        league_id=league_id,
        league_name=league_name,
        season=season,
        current_week=current_week,
        updated_at=updated_at,
        teams_data=teams_data,
        parlay_data=parlay_data,
    )


def render_status_markdown(payload: Dict[str, Any]) -> str:
    parlay = payload["parlay"]
    counts = parlay["counts"]
    bettor = parlay["bettor"]
    submitted = parlay["submitted_legs"]
    pending = parlay["pending_managers"]

    odds_str = (
        f"{parlay['odds_american']} ({parlay['multiplier']:.2f}x, {parlay['quote_type'].title()})"
        if parlay["odds_american"] and parlay["multiplier"] is not None
        else "—"
    )
    payout_str = (
        f"${parlay['total_payout_dollars']:.2f} total (${parlay['payout_per_player_dollars']:.2f} per submitted player)"
        if counts["submitted"] > 0
        else "—"
    )
    kickoff_str = parlay["earliest_kickoff"] or "TBD (No legs submitted yet)"

    lines = [
        f"# {payload['league_name']} — Week {payload['week']} Parlay Status ({payload['season']} Season)",
        "",
        f"- **League ID**: `{payload['league_id']}`",
        f"- **Ticket Status**: {parlay['status'].upper()} (Outcome: {parlay['outcome'].upper()})",
        f"- **Weekly Bettor (${parlay['stake_dollars']:.2f} Stake)**: {bettor['owner_name']} ({bettor['team_name']}) — {bettor['points_last_week']:.2f} pts last week",
        f"- **Combo Odds**: {odds_str}",
        f"- **Payout**: {payout_str}",
        f"- **Submission Deadline (Earliest Kickoff)**: {kickoff_str}",
        f"- **Progress**: {counts['submitted']} / {counts['total_managers']} picks submitted ({counts['pending']} pending)",
        "",
        f"## Submitted Picks ({counts['submitted']})",
    ]

    if submitted:
        for idx, leg in enumerate(submitted, start=1):
            price_part = (
                f" ({leg['price_cents']}¢)"
                if leg.get("price_cents") is not None
                else ""
            )
            odds_part = f"{leg['odds_american']}{price_part}" if leg.get("odds_american") else "—"
            lines.append(
                f"{idx}. **{leg['team_name']}** ({leg['owner_name']}): {leg['description']} | Odds: {odds_part} | Status: {leg['status']} (Outcome: {leg['outcome']})"
            )
    else:
        lines.append("_No picks submitted yet._")

    lines.extend(["", f"## Waiting On / Pending Managers ({counts['pending']})"])
    if pending:
        for mgr in pending:
            lines.append(f"- **{mgr['team_name']}** ({mgr['owner_name']})")
    else:
        lines.append("_All managers have submitted their picks!_")

    return "\n".join(lines) + "\n"


def render_status_html(payload: Dict[str, Any], markdown_text: str) -> str:
    parlay = payload["parlay"]
    counts = parlay["counts"]
    bettor = parlay["bettor"]
    submitted = parlay["submitted_legs"]
    pending = parlay["pending_managers"]

    esc = lambda v: html.escape(str(v if v is not None else ""))
    json_str = json.dumps(payload, indent=2).replace("</", "<\\/")

    submitted_rows = []
    for leg in submitted:
        price_part = f" ({leg['price_cents']}¢)" if leg.get("price_cents") is not None else ""
        submitted_rows.append(
            f"<tr>"
            f"<td><strong>{esc(leg['team_name'])}</strong> ({esc(leg['owner_name'])})</td>"
            f"<td>{esc(leg['nfl_team'])}</td>"
            f"<td>{esc(leg['description'])}</td>"
            f"<td><code>{esc(leg['odds_american'])}{esc(price_part)}</code></td>"
            f"<td>{esc(leg['status'])} ({esc(leg['outcome'])})</td>"
            f"</tr>"
        )
    submitted_html = (
        "\n".join(submitted_rows)
        if submitted_rows
        else '<tr><td colspan="5">No picks submitted yet.</td></tr>'
    )

    pending_items = [
        f"<li><strong>{esc(m['team_name'])}</strong> ({esc(m['owner_name'])})</li>"
        for m in pending
    ]
    pending_html = (
        "<ul>\n" + "\n".join(pending_items) + "\n</ul>"
        if pending_items
        else "<p>All managers have submitted their picks!</p>"
    )

    odds_display = (
        f"{esc(parlay['odds_american'])} ({parlay['multiplier']:.2f}x)"
        if parlay["odds_american"] and parlay["multiplier"] is not None
        else "—"
    )
    payout_display = (
        f"${parlay['total_payout_dollars']:.2f} (${parlay['payout_per_player_dollars']:.2f}/player)"
        if counts["submitted"] > 0
        else "—"
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{esc(payload['league_name'])} — Week {payload['week']} Parlay Status</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #101622; color: #f3f4f6; margin: 0; padding: 24px 16px; line-height: 1.5; }}
    main {{ max-width: 820px; margin: 0 auto; }}
    header, section {{ background: #18202f; border: 1px solid #28344b; border-radius: 12px; padding: 20px; margin-bottom: 16px; }}
    h1 {{ margin: 0 0 8px 0; font-size: 1.4rem; color: #ffffff; }}
    h2 {{ margin: 0 0 12px 0; font-size: 1.05rem; color: #00e676; text-transform: uppercase; letter-spacing: 0.04em; }}
    .meta-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 12px; }}
    .metric {{ background: #101622; border: 1px solid #28344b; border-radius: 8px; padding: 10px 12px; }}
    .metric-label {{ font-size: 0.72rem; text-transform: uppercase; color: #9ca3af; display: block; }}
    .metric-val {{ font-size: 0.95rem; font-weight: 700; color: #ffffff; font-family: monospace; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 0.9rem; }}
    th, td {{ text-align: left; padding: 10px 8px; border-bottom: 1px solid #28344b; }}
    th {{ color: #9ca3af; font-size: 0.75rem; text-transform: uppercase; }}
    pre {{ background: #101622; border: 1px solid #28344b; border-radius: 8px; padding: 12px; overflow-x: auto; font-size: 0.82rem; color: #e5e7eb; white-space: pre-wrap; }}
    a {{ color: #00e676; text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
    .links {{ font-size: 0.82rem; color: #9ca3af; margin-top: 8px; }}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>🏈 {esc(payload['league_name'])} — Week {payload['week']} Parlay Status</h1>
      <div>Season {esc(payload['season'])} • League ID: <code>{esc(payload['league_id'])}</code> • Read-Only Agent &amp; Member View</div>
      <div class="links">
        Machine Formats:
        <a href="?week={payload['week']}&amp;format=json">JSON (?format=json)</a> •
        <a href="?week={payload['week']}&amp;format=md">Markdown (?format=md)</a> •
        <a href="/{esc(payload['league_id'])}">Open Interactive Tracker</a>
      </div>
      <div class="meta-grid">
        <div class="metric">
          <span class="metric-label">Ticket Status</span>
          <span class="metric-val">{esc(parlay['status'].upper())} ({esc(parlay['outcome'].upper())})</span>
        </div>
        <div class="metric">
          <span class="metric-label">Weekly Bettor ($5 Stake)</span>
          <span class="metric-val">{esc(bettor['owner_name'])} ({esc(bettor['team_name'])}) — {bettor['points_last_week']:.2f} pts</span>
        </div>
        <div class="metric">
          <span class="metric-label">Progress</span>
          <span class="metric-val">{counts['submitted']} / {counts['total_managers']} Submitted ({counts['pending']} Pending)</span>
        </div>
        <div class="metric">
          <span class="metric-label">Combo Odds ({esc(parlay['quote_type'])})</span>
          <span class="metric-val">{odds_display}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Payout</span>
          <span class="metric-val">{payout_display}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Submission Deadline</span>
          <span class="metric-val">{esc(parlay['earliest_kickoff'] or 'TBD')}</span>
        </div>
      </div>
    </header>

    <section aria-labelledby="submitted-heading">
      <h2 id="submitted-heading">Submitted Picks ({counts['submitted']} / {counts['total_managers']})</h2>
      <table>
        <thead>
          <tr>
            <th>Team (Manager)</th>
            <th>NFL</th>
            <th>Pick Description</th>
            <th>Odds</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {submitted_html}
        </tbody>
      </table>
    </section>

    <section aria-labelledby="pending-heading">
      <h2 id="pending-heading">Waiting On / Pending Managers ({counts['pending']})</h2>
      {pending_html}
    </section>

    <section aria-labelledby="markdown-heading">
      <h2 id="markdown-heading">Agent Summary (Markdown)</h2>
      <pre id="agent-status-markdown">{esc(markdown_text)}</pre>
    </section>
  </main>
  <script id="agent-status-json" type="application/json">{json_str}</script>
</body>
</html>
"""
