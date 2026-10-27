import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  X,
  Sparkles,
  ChevronRight,
  Search,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import {
  ActivePlayer,
  GameLineOption,
  KalshiPropContract,
  ParlayLeg,
} from "../types";
import { PlayerSearchInput } from "./PlayerSearchInput";
import { TeamLogo, getNflTeamMeta } from "../utils/nflTeams";
import {
  kalshiCentsToDecimal,
  kalshiCentsToAmerican,
  formatOddsWithCents,
  formatDataFreshness,
  OddsFormat,
} from "../utils/parlayMath";

export interface PickData {
  description: string;
  nfl_team: string;
  odds_american: string;
  odds_decimal: number;
  price_cents: number;
  kalshi_market_ticker: string;
  kalshi_side: "yes" | "no";
  kickoff_time?: string;
  game_id?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmitPick: (pick: PickData) => void;
  rosterName: string;
  activePlayers: ActivePlayer[];
  kalshiGames?: GameLineOption[];
  kalshiProps?: any[];
  liveMarketCount?: number;
  lastUpdated?: Date | number | string | null;
  oddsFormat?: OddsFormat;
  onToggleOddsFormat?: (format: OddsFormat) => void;
  currentLeg?: ParlayLeg;
  initialPlayer?: ActivePlayer | null;
  maxLegOddsPercent?: number | null;
  initialTab?: "prop" | "mainline";
}

// Sample Kalshi NFL Game Line contracts (KXNFLGAME, KXNFLSPREAD, KXNFLTOTAL)
const SAMPLE_KALSHI_GAMES: GameLineOption[] = [
  {
    game_id: "KXNFL-26OCT29-KCBAL",
    home_team: "BAL",
    away_team: "KC",
    commence_time: "2026-10-29T20:15:00Z", // Thursday Night Football
    spread_home: {
      point: -2.5,
      odds: "-113",
      price_cents: 53,
      market_ticker: "KXNFLSPREAD-26OCT29-KCBAL-BAL2",
    },
    spread_away: {
      point: 2.5,
      odds: "-108",
      price_cents: 52,
      market_ticker: "KXNFLSPREAD-26OCT29-KCBAL-KC2",
    },
    ml_home: {
      odds: "-138",
      price_cents: 58,
      market_ticker: "KXNFLGAME-26OCT29-KCBAL-BAL",
    },
    ml_away: {
      odds: "+117",
      price_cents: 46,
      market_ticker: "KXNFLGAME-26OCT29-KCBAL-KC",
    },
    total_over: {
      point: 47.5,
      odds: "-113",
      price_cents: 53,
      market_ticker: "KXNFLTOTAL-26OCT29-KCBAL-O47",
    },
    total_under: {
      point: 47.5,
      odds: "-108",
      price_cents: 52,
      market_ticker: "KXNFLTOTAL-26OCT29-KCBAL-U47",
    },
  },
  {
    game_id: "KXNFL-26NOV01-PHIDAL",
    home_team: "DAL",
    away_team: "PHI",
    commence_time: "2026-11-01T17:00:00Z",
    spread_home: {
      point: 3.5,
      odds: "-108",
      price_cents: 52,
      market_ticker: "KXNFLSPREAD-26NOV01-PHIDAL-DAL3",
    },
    spread_away: {
      point: -3.5,
      odds: "-117",
      price_cents: 54,
      market_ticker: "KXNFLSPREAD-26NOV01-PHIDAL-PHI3",
    },
    ml_home: {
      odds: "+138",
      price_cents: 42,
      market_ticker: "KXNFLGAME-26NOV01-PHIDAL-DAL",
    },
    ml_away: {
      odds: "-163",
      price_cents: 62,
      market_ticker: "KXNFLGAME-26NOV01-PHIDAL-PHI",
    },
    total_over: {
      point: 48.5,
      odds: "-113",
      price_cents: 53,
      market_ticker: "KXNFLTOTAL-26NOV01-PHIDAL-O48",
    },
    total_under: {
      point: 48.5,
      odds: "-108",
      price_cents: 52,
      market_ticker: "KXNFLTOTAL-26NOV01-PHIDAL-U48",
    },
  },
  {
    game_id: "KXNFL-26NOV01-DETGB",
    home_team: "GB",
    away_team: "DET",
    commence_time: "2026-11-01T17:00:00Z",
    spread_home: {
      point: 1.5,
      odds: "-108",
      price_cents: 52,
      market_ticker: "KXNFLSPREAD-26NOV01-DETGB-GB1",
    },
    spread_away: {
      point: -1.5,
      odds: "-113",
      price_cents: 53,
      market_ticker: "KXNFLSPREAD-26NOV01-DETGB-DET1",
    },
    ml_home: {
      odds: "+108",
      price_cents: 48,
      market_ticker: "KXNFLGAME-26NOV01-DETGB-GB",
    },
    ml_away: {
      odds: "-127",
      price_cents: 56,
      market_ticker: "KXNFLGAME-26NOV01-DETGB-DET",
    },
    total_over: {
      point: 51.5,
      odds: "-117",
      price_cents: 54,
      market_ticker: "KXNFLTOTAL-26NOV01-DETGB-O51",
    },
    total_under: {
      point: 51.5,
      odds: "-104",
      price_cents: 51,
      market_ticker: "KXNFLTOTAL-26NOV01-DETGB-U51",
    },
  },
  {
    game_id: "KXNFL-26NOV01-BUFNYJ",
    home_team: "NYJ",
    away_team: "BUF",
    commence_time: "2026-11-02T00:20:00Z", // Sunday Night Football
    spread_home: {
      point: 4.5,
      odds: "-108",
      price_cents: 52,
      market_ticker: "KXNFLSPREAD-26NOV01-BUFNYJ-NYJ4",
    },
    spread_away: {
      point: -4.5,
      odds: "-113",
      price_cents: 53,
      market_ticker: "KXNFLSPREAD-26NOV01-BUFNYJ-BUF4",
    },
    ml_home: {
      odds: "+178",
      price_cents: 36,
      market_ticker: "KXNFLGAME-26NOV01-BUFNYJ-NYJ",
    },
    ml_away: {
      odds: "-213",
      price_cents: 68,
      market_ticker: "KXNFLGAME-26NOV01-BUFNYJ-BUF",
    },
    total_over: {
      point: 43.5,
      odds: "-108",
      price_cents: 52,
      market_ticker: "KXNFLTOTAL-26NOV01-BUFNYJ-O43",
    },
    total_under: {
      point: 43.5,
      odds: "-113",
      price_cents: 53,
      market_ticker: "KXNFLTOTAL-26NOV01-BUFNYJ-U43",
    },
  },
];

function buildKalshiContractsForPlayer(
  player: ActivePlayer | null,
  category: string,
): KalshiPropContract[] {
  const slug = (player?.name || "PLAYER")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 10);
  const team = player?.team || "NFL";

  // Match game_id & kickoff from active games if team is in sample games
  const matchedGame = SAMPLE_KALSHI_GAMES.find(
    (g) => g.home_team === team || g.away_team === team,
  );
  const gameId = matchedGame?.game_id || `KXNFL-26NOV01-${team}`;
  const kickoff = matchedGame?.commence_time || "2026-11-01T17:00:00Z";

  const makeContract = (
    series: string,
    suffix: string,
    label: string,
    yesCents: number,
  ): KalshiPropContract => {
    const noCents = 100 - yesCents;
    return {
      market_ticker: `${series}-26NOV01-${slug}-${suffix}`,
      series_ticker: series,
      stat_category: category,
      label,
      yes_cents: yesCents,
      no_cents: noCents,
      yes_odds: kalshiCentsToAmerican(yesCents),
      no_odds: kalshiCentsToAmerican(noCents),
      kickoff_time: kickoff,
      game_id: gameId,
    };
  };

  switch (category) {
    case "Pass Yards":
      return [
        makeContract("KXNFLPASSYDS", "225", "225+ Pass Yards", 60),
        makeContract("KXNFLPASSYDS", "250", "250+ Pass Yards", 53),
        makeContract("KXNFLPASSYDS", "275", "275+ Pass Yards", 40),
        makeContract("KXNFLPASSYDS", "300", "300+ Pass Yards", 27),
      ];
    case "Pass TDs":
      return [
        makeContract("KXNFLPASSTD", "1", "1+ Passing TDs", 80),
        makeContract("KXNFLPASSTD", "2", "2+ Passing TDs", 54),
        makeContract("KXNFLPASSTD", "3", "3+ Passing TDs", 28),
      ];
    case "Rush Yards":
      return [
        makeContract("KXNFLRUSHYDS", "50", "50+ Rush Yards", 64),
        makeContract("KXNFLRUSHYDS", "75", "75+ Rush Yards", 54),
        makeContract("KXNFLRUSHYDS", "100", "100+ Rush Yards", 34),
      ];
    case "Rec Yards":
      return [
        makeContract("KXNFLRECYDS", "50", "50+ Rec Yards", 63),
        makeContract("KXNFLRECYDS", "75", "75+ Rec Yards", 53),
        makeContract("KXNFLRECYDS", "100", "100+ Rec Yards", 33),
      ];
    case "Receptions":
      return [
        makeContract("KXNFLREC", "4", "4+ Receptions", 65),
        makeContract("KXNFLREC", "6", "6+ Receptions", 53),
        makeContract("KXNFLREC", "8", "8+ Receptions", 32),
      ];
    case "Touchdowns":
    default:
      return [
        makeContract("KXNFLTD", "1", "Anytime TD (1+)", 54),
        makeContract("KXNFLTD", "2", "2+ Touchdowns", 22),
      ];
  }
}

function getPlayerContracts(
  selectedPlayer: ActivePlayer | null,
  statCategory: string,
  kalshiProps: any[] = [],
  maxLegOddsPercent?: number | null,
): KalshiPropContract[] {
  if (!selectedPlayer) return [];
  if (kalshiProps.length > 0) {
    const pNameLower = selectedPlayer.name.toLowerCase();
    let matched = kalshiProps.filter(
      (p) =>
        (p.player_name || "").toLowerCase() === pNameLower &&
        (!statCategory || p.stat_category === statCategory),
    );
    if (maxLegOddsPercent != null && maxLegOddsPercent > 0) {
      matched = matched.filter((p) => {
        const yCents = Number(p.yes_cents ?? p.yes_price_cents ?? 54);
        return yCents <= maxLegOddsPercent;
      });
    }
    if (matched.length > 0) {
      const mapped = matched.map((m): KalshiPropContract => {
        const yCents = Number(m.yes_cents ?? m.yes_price_cents ?? 54);
        const nCents = Number(m.no_cents ?? m.no_price_cents ?? 46);
        return {
          market_ticker: m.market_ticker,
          series_ticker: m.series_ticker,
          stat_category: m.stat_category || statCategory,
          label: m.label || m.title,
          yes_cents: yCents,
          no_cents: nCents,
          yes_odds:
            m.yes_odds ||
            m.yes_odds_american ||
            kalshiCentsToAmerican(yCents),
          no_odds:
            m.no_odds || m.no_odds_american || kalshiCentsToAmerican(nCents),
          kickoff_time: m.kickoff_time,
          game_id: m.game_id,
        };
      });
      const extractNumericMilestone = (label: string) => {
        const match = label.match(/(\d+(?:\.\d+)?)/);
        return match ? parseFloat(match[1]) : 0;
      };
      mapped.sort((a, b) => {
        if (b.yes_cents !== a.yes_cents) return b.yes_cents - a.yes_cents;
        return (
          extractNumericMilestone(a.label) - extractNumericMilestone(b.label)
        );
      });
      return mapped;
    }
    return [];
  }
  let contracts = buildKalshiContractsForPlayer(selectedPlayer, statCategory);
  if (maxLegOddsPercent != null && maxLegOddsPercent > 0) {
    contracts = contracts.filter((c) => c.yes_cents <= maxLegOddsPercent);
  }
  return contracts;
}

function resolveInitialPlayerPropState(
  currentLeg: ParlayLeg | undefined,
  activePlayers: ActivePlayer[],
  kalshiProps: any[] = [],
  initialPlayer: ActivePlayer | null = null,
  maxLegOddsPercent?: number | null,
) {
  if (currentLeg?.status !== "submitted") {
    let initialCategory = "Touchdowns";
    if (initialPlayer && kalshiProps.length > 0) {
      const pNameLower = initialPlayer.name.toLowerCase();
      const playerPropCats = kalshiProps
        .filter(
          (p) =>
            (p.player_name || "").toLowerCase() === pNameLower &&
            p.stat_category,
        )
        .map((p) => String(p.stat_category));
      if (playerPropCats.length > 0 && !playerPropCats.includes("Touchdowns")) {
        initialCategory = playerPropCats[0];
      }
    }
    return {
      initialPlayer: initialPlayer || null,
      initialCategory,
      initialSide: "yes" as "yes" | "no",
      initialContractIdx: null as number | null,
    };
  }

  const ticker = currentLeg.kalshi_market_ticker || "";
  const desc = currentLeg.description || "";

  const isGameTicker =
    ticker.startsWith("KXNFLGAME") ||
    ticker.startsWith("KXNFLSPREAD") ||
    ticker.startsWith("KXNFLTOTAL");
  const isGameDesc =
    !desc.includes("•") &&
    (desc.includes("Spread") ||
      desc.includes("Moneyline") ||
      desc.startsWith("Over ") ||
      desc.startsWith("Under "));

  if (isGameTicker || isGameDesc) {
    return {
      initialPlayer: initialPlayer || null,
      initialCategory: "Touchdowns",
      initialSide: "yes" as "yes" | "no",
      initialContractIdx: null as number | null,
    };
  }

  const matchedLiveProp = ticker
    ? kalshiProps.find((p) => p.market_ticker === ticker)
    : undefined;

  let playerName = matchedLiveProp?.player_name || "";
  if (!playerName && desc.includes("•")) {
    playerName = desc
      .split("•")[0]
      .replace(/\([^)]*\)/g, "")
      .trim();
  }

  const matchedPlayer = playerName
    ? activePlayers.find(
        (p) => p.name.toLowerCase() === playerName.toLowerCase(),
      ) || {
        id: `restored_${playerName.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
        name: playerName,
        team: currentLeg.nfl_team || "NFL",
        position: "FLEX",
      }
    : null;

  let category = "Touchdowns";
  if (matchedLiveProp?.stat_category) {
    category = String(matchedLiveProp.stat_category);
  } else if (
    ticker.startsWith("KXNFLPASSYDS") ||
    desc.includes("Pass Yards")
  ) {
    category = "Pass Yards";
  } else if (
    ticker.startsWith("KXNFLPASSTD") ||
    desc.includes("Passing TD")
  ) {
    category = "Pass TDs";
  } else if (
    ticker.startsWith("KXNFLRSHYDS") ||
    ticker.startsWith("KXNFLRUSHYDS") ||
    desc.includes("Rush Yards")
  ) {
    category = "Rush Yards";
  } else if (ticker.startsWith("KXNFLRECYDS") || desc.includes("Rec Yards")) {
    category = "Rec Yards";
  } else if (ticker.startsWith("KXNFLREC") || desc.includes("Reception")) {
    category = "Receptions";
  }

  const side: "yes" | "no" =
    currentLeg.kalshi_side ||
    (desc.trim().toUpperCase().endsWith("(NO)") ? "no" : "yes");

  let matchedIdx: number | null = null;
  if (matchedPlayer) {
    const contracts = getPlayerContracts(
      matchedPlayer,
      category,
      kalshiProps,
      maxLegOddsPercent,
    );
    if (ticker) {
      const idx = contracts.findIndex((c) => c.market_ticker === ticker);
      if (idx !== -1) matchedIdx = idx;
    }
    if (matchedIdx === null && desc.includes("•")) {
      const labelPart = desc
        .split("•")[1]
        ?.replace(/\((YES|NO)\)\s*$/i, "")
        .trim()
        .toLowerCase();
      if (labelPart) {
        const idx = contracts.findIndex(
          (c) => c.label.trim().toLowerCase() === labelPart,
        );
        if (idx !== -1) matchedIdx = idx;
      }
    }
  }

  return {
    initialPlayer: matchedPlayer,
    initialCategory: category,
    initialSide: side,
    initialContractIdx: matchedIdx,
  };
}

export const PickModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSubmitPick,
  rosterName,
  activePlayers,
  kalshiGames = [],
  kalshiProps = [],
  liveMarketCount = 0,
  lastUpdated,
  oddsFormat = "american",
  onToggleOddsFormat,
  currentLeg,
  initialPlayer = null,
  maxLegOddsPercent,
  initialTab,
}) => {
  const gamesList = kalshiGames.length > 0 ? kalshiGames : SAMPLE_KALSHI_GAMES;

  const isExceedingMax = (cents?: number) => {
    return (
      maxLegOddsPercent != null &&
      maxLegOddsPercent > 0 &&
      cents != null &&
      cents > maxLegOddsPercent
    );
  };

  // Track current timestamp for dynamic relative freshness updates while modal is open
  const [freshnessNow, setFreshnessNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!isOpen || !lastUpdated) return;
    setFreshnessNow(Date.now());
    const interval = setInterval(() => {
      setFreshnessNow(Date.now());
    }, 15000);
    return () => clearInterval(interval);
  }, [isOpen, lastUpdated]);

  const isGameInitial = useMemo(() => {
    if (currentLeg?.status !== "submitted") return false;
    const ticker = currentLeg.kalshi_market_ticker || "";
    const desc = currentLeg.description || "";
    return (
      ticker.startsWith("KXNFLGAME") ||
      ticker.startsWith("KXNFLSPREAD") ||
      ticker.startsWith("KXNFLTOTAL") ||
      (!desc.includes("•") &&
        (desc.includes("Spread") ||
          desc.includes("Moneyline") ||
          desc.startsWith("Over ") ||
          desc.startsWith("Under ")))
    );
  }, [currentLeg]);

  // Only Kalshi API-backed tabs: Player Prop and Game Line (no manual Custom tab)
  const [tab, setTab] = useState<"prop" | "mainline">(
    initialTab ||
      (isGameInitial
        ? "mainline"
        : activePlayers.length === 0 && (kalshiGames.length > 0 || SAMPLE_KALSHI_GAMES.length > 0)
          ? "mainline"
          : "prop"),
  );

  const resolvedInitial = useMemo(
    () =>
      resolveInitialPlayerPropState(
        currentLeg,
        activePlayers,
        kalshiProps,
        initialPlayer,
        maxLegOddsPercent,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Player Prop State
  const [selectedPlayer, setSelectedPlayer] = useState<ActivePlayer | null>(
    resolvedInitial.initialPlayer,
  );
  const [statCategory, setStatCategory] = useState<string>(
    resolvedInitial.initialCategory,
  );
  const [selectedContractIdx, setSelectedContractIdx] = useState<number | null>(
    resolvedInitial.initialContractIdx,
  );
  const [selectedSide, setSelectedSide] = useState<"yes" | "no">(
    resolvedInitial.initialSide,
  );
  const [showMoreAbove, setShowMoreAbove] = useState<boolean>(false);
  const [showMoreBelow, setShowMoreBelow] = useState<boolean>(false);
  const prevSelectionKeyRef = useRef<string>(
    `${resolvedInitial.initialPlayer?.id || ""}:${resolvedInitial.initialCategory}:${currentLeg?.id || ""}:${currentLeg?.status || ""}`,
  );

  // Mainline State
  const [selectedGame, setSelectedGame] = useState<GameLineOption>(
    gamesList[0],
  );
  const [mainlineType, setMainlineType] = useState<
    | "spread_away"
    | "spread_home"
    | "ml_away"
    | "ml_home"
    | "total_over"
    | "total_under"
  >("spread_away");
  const [gameQuery, setGameQuery] = useState<string>("");

  const filteredGamesList = useMemo(() => {
    const q = gameQuery.trim().toUpperCase();
    if (!q) return gamesList;
    return gamesList.filter((g) => {
      const awayMeta = getNflTeamMeta(g.away_team);
      const homeMeta = getNflTeamMeta(g.home_team);
      return (
        g.away_team.toUpperCase().includes(q) ||
        g.home_team.toUpperCase().includes(q) ||
        awayMeta.name.toUpperCase().includes(q) ||
        awayMeta.city.toUpperCase().includes(q) ||
        homeMeta.name.toUpperCase().includes(q) ||
        homeMeta.city.toUpperCase().includes(q)
      );
    });
  }, [gamesList, gameQuery]);

  useEffect(() => {
    if (
      gamesList.length > 0 &&
      !gamesList.some((g) => g.game_id === selectedGame?.game_id)
    ) {
      setSelectedGame(gamesList[0]);
    }
  }, [gamesList, selectedGame]);

  // Restore existing submitted leg selection when modal opens (or reset to empty if pending)
  useEffect(() => {
    if (!isOpen) {
      prevSelectionKeyRef.current = "";
      return;
    }

    if (!currentLeg || currentLeg.status !== "submitted") {
      setTab("prop");
      setSelectedPlayer(initialPlayer || null);
      setSelectedContractIdx(null);
      setGameQuery("");
      return;
    }

    const ticker = currentLeg.kalshi_market_ticker || "";
    const desc = currentLeg.description || "";

    // 1. Check if currentLeg is a Game Line pick
    const isGameTicker =
      ticker.startsWith("KXNFLGAME") ||
      ticker.startsWith("KXNFLSPREAD") ||
      ticker.startsWith("KXNFLTOTAL");
    const isGameDesc =
      !desc.includes("•") &&
      (desc.includes("Spread") ||
        desc.includes("Moneyline") ||
        desc.startsWith("Over ") ||
        desc.startsWith("Under "));

    if (isGameTicker || isGameDesc) {
      const matchedGame =
        gamesList.find(
          (g) =>
            (currentLeg.game_id && g.game_id === currentLeg.game_id) ||
            (ticker &&
              (g.spread_away.market_ticker === ticker ||
                g.spread_home.market_ticker === ticker ||
                g.ml_away.market_ticker === ticker ||
                g.ml_home.market_ticker === ticker ||
                g.total_over.market_ticker === ticker ||
                g.total_under.market_ticker === ticker)) ||
            (currentLeg.nfl_team &&
              (g.away_team === currentLeg.nfl_team ||
                g.home_team === currentLeg.nfl_team)),
        ) || gamesList[0];

      if (matchedGame) {
        setTab("mainline");
        setSelectedGame(matchedGame);
        setGameQuery("");

        if (
          desc.startsWith("Over ") ||
          (ticker.startsWith("KXNFLTOTAL") &&
            currentLeg.kalshi_side !== "no" &&
            !desc.startsWith("Under "))
        ) {
          setMainlineType("total_over");
        } else if (
          desc.startsWith("Under ") ||
          (ticker.startsWith("KXNFLTOTAL") && currentLeg.kalshi_side === "no")
        ) {
          setMainlineType("total_under");
        } else if (
          desc.includes("Moneyline") ||
          ticker.startsWith("KXNFLGAME")
        ) {
          const isAway =
            currentLeg.nfl_team === matchedGame.away_team ||
            desc.toUpperCase().startsWith(matchedGame.away_team.toUpperCase());
          setMainlineType(isAway ? "ml_away" : "ml_home");
        } else {
          const isAway =
            currentLeg.nfl_team === matchedGame.away_team ||
            desc.toUpperCase().startsWith(matchedGame.away_team.toUpperCase());
          setMainlineType(isAway ? "spread_away" : "spread_home");
        }
        return;
      }
    }

    // 2. Otherwise restore Player Prop pick
    setTab("prop");

    const matchedLiveProp = ticker
      ? kalshiProps.find((p) => p.market_ticker === ticker)
      : undefined;

    let playerName = matchedLiveProp?.player_name || "";
    if (!playerName && desc.includes("•")) {
      playerName = desc
        .split("•")[0]
        .replace(/\([^)]*\)/g, "")
        .trim();
    }

    const matchedPlayer = playerName
      ? activePlayers.find(
          (p) => p.name.toLowerCase() === playerName.toLowerCase(),
        ) || {
          id: `restored_${playerName.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
          name: playerName,
          team: currentLeg.nfl_team || "NFL",
          position: "FLEX",
        }
      : null;

    setSelectedPlayer(matchedPlayer);

    if (matchedLiveProp?.stat_category) {
      setStatCategory(String(matchedLiveProp.stat_category));
    } else if (
      ticker.startsWith("KXNFLPASSYDS") ||
      desc.includes("Pass Yards")
    ) {
      setStatCategory("Pass Yards");
    } else if (
      ticker.startsWith("KXNFLPASSTD") ||
      desc.includes("Passing TD")
    ) {
      setStatCategory("Pass TDs");
    } else if (
      ticker.startsWith("KXNFLRSHYDS") ||
      ticker.startsWith("KXNFLRUSHYDS") ||
      desc.includes("Rush Yards")
    ) {
      setStatCategory("Rush Yards");
    } else if (ticker.startsWith("KXNFLRECYDS") || desc.includes("Rec Yards")) {
      setStatCategory("Rec Yards");
    } else if (ticker.startsWith("KXNFLREC") || desc.includes("Reception")) {
      setStatCategory("Receptions");
    } else {
      setStatCategory("Touchdowns");
    }
  }, [isOpen, currentLeg, initialPlayer]);

  // Categories available for the currently selected player
  const playerCategories = useMemo(() => {
    if (!selectedPlayer) return [];
    if (kalshiProps.length > 0) {
      const pNameLower = selectedPlayer.name.toLowerCase();
      const cats = Array.from(
        new Set(
          kalshiProps
            .filter(
              (p) =>
                (p.player_name || "").toLowerCase() === pNameLower &&
                p.stat_category,
            )
            .map((p) => String(p.stat_category)),
        ),
      );
      if (cats.length > 0) return cats;
    }
    switch (selectedPlayer.position?.toUpperCase()) {
      case "QB":
        return ["Pass Yards", "Pass TDs", "Rush Yards", "Touchdowns"];
      case "RB":
        return ["Touchdowns", "Rush Yards", "Rec Yards", "Receptions"];
      case "WR":
      case "TE":
        return ["Rec Yards", "Receptions", "Touchdowns"];
      default:
        return [
          "Touchdowns",
          "Rush Yards",
          "Rec Yards",
          "Receptions",
          "Pass Yards",
          "Pass TDs",
        ];
    }
  }, [selectedPlayer, kalshiProps]);

  // Reset category when player changes or live categories load
  useEffect(() => {
    if (!selectedPlayer) return;
    if (
      playerCategories.length > 0 &&
      !playerCategories.includes(statCategory)
    ) {
      setStatCategory(playerCategories[0] || "Touchdowns");
    }
  }, [selectedPlayer, playerCategories, statCategory]);

  const availableContracts = useMemo(() => {
    return getPlayerContracts(
      selectedPlayer,
      statCategory,
      kalshiProps,
      maxLegOddsPercent,
    );
  }, [selectedPlayer, statCategory, kalshiProps, maxLegOddsPercent]);

  // Identify the 5 contiguous contracts closest to even odds (50¢ / +100)
  // and the single contract closest to even odds as the default selection
  const evenWindow = useMemo(() => {
    const total = availableContracts.length;
    if (total === 0) {
      return { start: 0, end: 0, closestIdx: 0 };
    }

    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < total; i++) {
      const diff = Math.abs(availableContracts[i].yes_cents - 50);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }

    if (total <= 5) {
      return { start: 0, end: total, closestIdx };
    }

    let bestStart = 0;
    let bestWindowScore = Infinity;
    for (let start = 0; start <= total - 5; start++) {
      let score = 0;
      for (let j = start; j < start + 5; j++) {
        score += Math.abs(availableContracts[j].yes_cents - 50);
      }
      if (score < bestWindowScore) {
        bestWindowScore = score;
        bestStart = start;
      }
    }

    return { start: bestStart, end: bestStart + 5, closestIdx };
  }, [availableContracts]);

  // Select the user's existing submitted contract if it belongs to this player/category,
  // otherwise do not auto-select any contract
  useEffect(() => {
    const selectionKey = `${selectedPlayer?.id || ""}:${statCategory}:${currentLeg?.id || ""}:${currentLeg?.status || ""}`;
    const keyChanged = prevSelectionKeyRef.current !== selectionKey;
    prevSelectionKeyRef.current = selectionKey;

    if (
      currentLeg?.status === "submitted" &&
      selectedPlayer &&
      availableContracts.length > 0
    ) {
      const ticker = currentLeg.kalshi_market_ticker || "";
      const desc = currentLeg.description || "";
      const playerMatches = desc
        .toLowerCase()
        .startsWith(selectedPlayer.name.toLowerCase());

      let matchedIdx = -1;
      if (ticker) {
        matchedIdx = availableContracts.findIndex(
          (c) => c.market_ticker === ticker,
        );
      }
      if (matchedIdx === -1 && playerMatches && desc.includes("•")) {
        const labelPart = desc
          .split("•")[1]
          ?.replace(/\((YES|NO)\)\s*$/i, "")
          .trim()
          .toLowerCase();
        if (labelPart) {
          matchedIdx = availableContracts.findIndex(
            (c) => c.label.trim().toLowerCase() === labelPart,
          );
        }
      }

      if (matchedIdx !== -1) {
        setSelectedContractIdx(matchedIdx);
        const side: "yes" | "no" =
          currentLeg.kalshi_side ||
          (desc.trim().toUpperCase().endsWith("(NO)") ? "no" : "yes");
        setSelectedSide(side);
        setShowMoreAbove(matchedIdx < evenWindow.start);
        setShowMoreBelow(matchedIdx >= evenWindow.end);
        return;
      }
    }

    if (keyChanged) {
      setSelectedContractIdx(null);
      setSelectedSide("yes");
      setShowMoreAbove(false);
      setShowMoreBelow(false);
    }
  }, [
    selectedPlayer?.id,
    statCategory,
    evenWindow.start,
    evenWindow.end,
    availableContracts,
    currentLeg,
  ]);

  const activeContract =
    selectedContractIdx !== null &&
    selectedContractIdx >= 0 &&
    selectedContractIdx < availableContracts.length
      ? availableContracts[selectedContractIdx]
      : null;

  if (!isOpen) return null;

  // Live Kalshi contract preview calculation
  let previewLine = "";
  let previewTeam = "";
  let previewOdds = "-113";
  let previewCents = 53;
  let previewTicker = "";
  let previewSide: "yes" | "no" = "yes";
  let previewKickoff: string | undefined = undefined;
  let previewGameId: string | undefined = undefined;
  const canSubmit =
    tab === "mainline"
      ? Boolean(selectedGame) && !isExceedingMax(previewCents)
      : Boolean(selectedPlayer && activeContract) && !isExceedingMax(previewCents);

  if (tab === "prop") {
    if (selectedPlayer && activeContract) {
      const playerText = `${selectedPlayer.name} (${selectedPlayer.team})`;
      previewTeam = selectedPlayer.team || "NFL";
      previewSide = selectedSide;
      previewCents =
        selectedSide === "yes"
          ? activeContract.yes_cents
          : activeContract.no_cents;
      previewOdds =
        selectedSide === "yes"
          ? activeContract.yes_odds
          : activeContract.no_odds;
      previewTicker = activeContract.market_ticker;
      previewKickoff = activeContract.kickoff_time;
      previewGameId = activeContract.game_id;
      const sideBadge = selectedSide === "yes" ? "YES" : "NO";
      previewLine = `${playerText} • ${activeContract.label} (${sideBadge})`;
    } else if (selectedPlayer) {
      previewLine = "Select a contract strike & side above";
      previewTeam = selectedPlayer.team || "";
    } else {
      previewLine = "Search & select an active NFL player above";
      previewTeam = "";
    }
  } else {
    previewGameId = selectedGame.game_id;
    previewKickoff = selectedGame.commence_time;
    previewSide = "yes";
    if (mainlineType === "spread_away") {
      const pt =
        selectedGame.spread_away.point > 0
          ? `+${selectedGame.spread_away.point}`
          : `${selectedGame.spread_away.point}`;
      previewTeam = selectedGame.away_team;
      previewOdds = selectedGame.spread_away.odds;
      previewCents = selectedGame.spread_away.price_cents;
      previewTicker = selectedGame.spread_away.market_ticker;
      previewLine = `${selectedGame.away_team} ${pt} Spread`;
    } else if (mainlineType === "spread_home") {
      const pt =
        selectedGame.spread_home.point > 0
          ? `+${selectedGame.spread_home.point}`
          : `${selectedGame.spread_home.point}`;
      previewTeam = selectedGame.home_team;
      previewOdds = selectedGame.spread_home.odds;
      previewCents = selectedGame.spread_home.price_cents;
      previewTicker = selectedGame.spread_home.market_ticker;
      previewLine = `${selectedGame.home_team} ${pt} Spread`;
    } else if (mainlineType === "ml_away") {
      previewTeam = selectedGame.away_team;
      previewOdds = selectedGame.ml_away.odds;
      previewCents = selectedGame.ml_away.price_cents;
      previewTicker = selectedGame.ml_away.market_ticker;
      previewLine = `${selectedGame.away_team} Winner (Moneyline)`;
    } else if (mainlineType === "ml_home") {
      previewTeam = selectedGame.home_team;
      previewOdds = selectedGame.ml_home.odds;
      previewCents = selectedGame.ml_home.price_cents;
      previewTicker = selectedGame.ml_home.market_ticker;
      previewLine = `${selectedGame.home_team} Winner (Moneyline)`;
    } else if (mainlineType === "total_over") {
      previewTeam = selectedGame.home_team;
      previewOdds = selectedGame.total_over.odds;
      previewCents = selectedGame.total_over.price_cents;
      previewTicker = selectedGame.total_over.market_ticker;
      previewLine = `${selectedGame.away_team} @ ${selectedGame.home_team} OVER ${selectedGame.total_over.point}`;
    } else {
      previewTeam = selectedGame.home_team;
      previewOdds = selectedGame.total_under.odds;
      previewCents = selectedGame.total_under.price_cents;
      previewTicker = selectedGame.total_under.market_ticker;
      previewLine = `${selectedGame.away_team} @ ${selectedGame.home_team} UNDER ${selectedGame.total_under.point}`;
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const decimal = kalshiCentsToDecimal(previewCents);
    onSubmitPick({
      description: previewLine,
      nfl_team: previewTeam,
      odds_american: previewOdds,
      odds_decimal: decimal,
      price_cents: previewCents,
      kalshi_market_ticker: previewTicker,
      kalshi_side: previewSide,
      kickoff_time: previewKickoff,
      game_id: previewGameId,
    });
    onClose();
  };

  const isLive = Boolean(lastUpdated || liveMarketCount > 0);
  const freshnessText = isLive
    ? formatDataFreshness(lastUpdated ?? Date.now(), freshnessNow)
    : "Off-Season / Sample Board";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fadeIn">
      <div className="bg-sleeper-card border border-sleeper-border rounded-2xl w-full max-w-lg sm:max-w-xl lg:max-w-2xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl my-auto">
        {/* Modal Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-sleeper-border bg-sleeper-card shrink-0">
          <div>
            <div className="text-[11px] font-bold text-sleeper-accent uppercase tracking-wider flex items-center space-x-2">
              <span>{rosterName} • Kalshi NFL Markets</span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded border inline-flex items-center space-x-1 ${
                  isLive
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                }`}
                title={
                  lastUpdated
                    ? `Markets refreshed at ${new Date(lastUpdated).toLocaleTimeString()}`
                    : undefined
                }
              >
                {isLive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-0.5 inline-block" />
                )}
                <span>{freshnessText}</span>
              </span>
            </div>
            <h3 className="text-base font-bold text-white flex items-center space-x-1.5">
              <span>Submit Weekly Leg</span>
            </h3>
          </div>

          <div className="flex items-center space-x-2">
            {onToggleOddsFormat && (
              <div
                className="inline-flex rounded-lg bg-sleeper-dark p-0.5 border border-sleeper-border text-[10px] font-bold"
                title="Switch between American Odds (-110) and Percentage Odds (52%)"
              >
                <button
                  type="button"
                  onClick={() => onToggleOddsFormat("american")}
                  className={`px-2 py-1 rounded-md transition ${
                    oddsFormat === "american"
                      ? "bg-sleeper-accent text-black font-extrabold"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  American
                </button>
                <button
                  type="button"
                  onClick={() => onToggleOddsFormat("percentage")}
                  className={`px-2 py-1 rounded-md transition ${
                    oddsFormat === "percentage"
                      ? "bg-sleeper-accent text-black font-extrabold"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  % Odds
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Selector (Kalshi Player Props & Kalshi Game Lines only) */}
        <div className="flex border-b border-sleeper-border bg-sleeper-dark/50 shrink-0">
          <button
            type="button"
            onClick={() => setTab("prop")}
            className={`flex-1 py-3 text-xs font-bold transition flex items-center justify-center space-x-1.5 border-b-2 ${
              tab === "prop"
                ? "text-sleeper-accent border-sleeper-accent bg-sleeper-card/60"
                : "text-gray-400 border-transparent hover:text-gray-200"
            }`}
          >
            <span>Player Props</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("mainline")}
            className={`flex-1 py-3 text-xs font-bold transition flex items-center justify-center space-x-1.5 border-b-2 ${
              tab === "mainline"
                ? "text-sleeper-accent border-sleeper-accent bg-sleeper-card/60"
                : "text-gray-400 border-transparent hover:text-gray-200"
            }`}
          >
            <span>Game Lines</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {/* TAB 1: KALSHI PLAYER PROPS */}
            {tab === "prop" && (
              <div className="space-y-4">
                <PlayerSearchInput
                  players={activePlayers}
                  selectedPlayer={selectedPlayer}
                  onSelectPlayer={(p) => setSelectedPlayer(p)}
                />

                {!selectedPlayer ? (
                  <div className="p-6 rounded-xl border border-dashed border-sleeper-border bg-sleeper-dark/40 text-center space-y-1.5">
                    <div className="text-xs font-bold text-gray-300">
                      No player selected
                    </div>
                    <p className="text-[11px] text-gray-500">
                      Search and select an active NFL player above to view their
                      live Kalshi prop lines for this week.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Position-Aware Categories */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1.5">
                        Kalshi Prop Series (
                        {selectedPlayer.position || "Offense"})
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {playerCategories.map((cat) => {
                          const isSelected = statCategory === cat;
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => {
                                setStatCategory(cat);
                                setSelectedSide("yes");
                                setShowMoreAbove(false);
                                setShowMoreBelow(false);
                              }}
                              className={`py-2 px-2 text-xs font-bold rounded-lg border text-center transition ${
                                isSelected
                                  ? "bg-sleeper-accent text-black border-sleeper-accent"
                                  : "bg-sleeper-dark text-gray-300 border-sleeper-border hover:border-gray-500"
                              }`}
                            >
                              {cat}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Kalshi Milestone Contracts */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-gray-400">
                          Select Kalshi Contract Strike & Side
                        </label>
                        {availableContracts.length > 5 && (
                          <span className="text-[11px] text-gray-500">
                            {!showMoreAbove && !showMoreBelow
                              ? `Showing 5 of ${availableContracts.length} closest to even`
                              : `Showing ${
                                  (showMoreBelow
                                    ? availableContracts.length
                                    : evenWindow.end) -
                                  (showMoreAbove ? 0 : evenWindow.start)
                                } of ${availableContracts.length}`}
                          </span>
                        )}
                      </div>

                      {availableContracts.length === 0 ? (
                        <div className="py-8 text-center text-sm text-sleeper-muted">
                          {maxLegOddsPercent != null && maxLegOddsPercent > 0
                            ? `No props available under the ${maxLegOddsPercent}% max odds limit.`
                            : `No props available for ${statCategory}.`}
                        </div>
                      ) : (
                        <>
                          {/* Expand / Collapse Options Above the 5 Closest to Even */}
                          {evenWindow.start > 0 && (
                            <button
                              type="button"
                              onClick={() => setShowMoreAbove((prev) => !prev)}
                              className="w-full py-2 px-3 rounded-xl border border-dashed border-sleeper-border bg-sleeper-dark/40 hover:bg-sleeper-dark hover:border-sleeper-accent/50 text-xs font-semibold text-gray-300 hover:text-white transition flex items-center justify-center space-x-1.5"
                            >
                              {showMoreAbove ? (
                                <>
                                  <ChevronDown className="w-3.5 h-3.5 text-sleeper-accent" />
                                  <span>
                                    Hide {evenWindow.start} lower milestone
                                    {evenWindow.start > 1 ? "s" : ""} above
                                  </span>
                                </>
                              ) : (
                                <>
                                  <ChevronUp className="w-3.5 h-3.5 text-sleeper-accent" />
                                  <span>
                                    See {evenWindow.start} more option
                                    {evenWindow.start > 1 ? "s" : ""} above (lower
                                    lines)
                                  </span>
                                </>
                              )}
                            </button>
                          )}

                          <div className="space-y-2">
                            {availableContracts
                              .slice(
                                showMoreAbove ? 0 : evenWindow.start,
                                showMoreBelow
                                  ? availableContracts.length
                                  : evenWindow.end,
                              )
                              .map((contract, sliceIdx) => {
                                const actualIdx =
                                  (showMoreAbove ? 0 : evenWindow.start) + sliceIdx;
                                const isContractSelected =
                                  selectedContractIdx === actualIdx;
                                return (
                                  <div
                                    key={contract.market_ticker}
                                    className={`p-3 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                                      isContractSelected
                                        ? "bg-sleeper-dark border-sleeper-accent/60 shadow-sm"
                                        : "bg-sleeper-dark/50 border-sleeper-border"
                                    }`}
                                  >
                                    <div>
                                      <div className="text-xs font-bold text-white">
                                        {contract.label}
                                      </div>
                                    </div>

                                    <div className="flex items-center space-x-2 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedContractIdx(actualIdx);
                                          setSelectedSide("yes");
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition ${
                                          isContractSelected &&
                                          selectedSide === "yes"
                                            ? "bg-emerald-500 text-black border-emerald-400 shadow"
                                            : "bg-sleeper-card text-gray-300 border-sleeper-border hover:border-emerald-500/50"
                                        }`}
                                      >
                                        YES{" "}
                                        {formatOddsWithCents(
                                          contract.yes_odds,
                                          contract.yes_cents,
                                          oddsFormat,
                                        )}
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedContractIdx(actualIdx);
                                          setSelectedSide("no");
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition ${
                                          isContractSelected &&
                                          selectedSide === "no"
                                            ? "bg-red-500 text-white border-red-400 shadow"
                                            : "bg-sleeper-card text-gray-300 border-sleeper-border hover:border-red-500/50"
                                        }`}
                                      >
                                        NO{" "}
                                        {formatOddsWithCents(
                                          contract.no_odds,
                                          contract.no_cents,
                                          oddsFormat,
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>

                          {/* Expand / Collapse Options Below the 5 Closest to Even */}
                          {evenWindow.end < availableContracts.length && (
                            <button
                              type="button"
                              onClick={() => setShowMoreBelow((prev) => !prev)}
                              className="w-full py-2 px-3 rounded-xl border border-dashed border-sleeper-border bg-sleeper-dark/40 hover:bg-sleeper-dark hover:border-sleeper-accent/50 text-xs font-semibold text-gray-300 hover:text-white transition flex items-center justify-center space-x-1.5"
                            >
                              {showMoreBelow ? (
                                <>
                                  <ChevronUp className="w-3.5 h-3.5 text-sleeper-accent" />
                                  <span>
                                    Hide{" "}
                                    {availableContracts.length - evenWindow.end}{" "}
                                    higher milestone
                                    {availableContracts.length - evenWindow.end > 1
                                      ? "s"
                                      : ""}{" "}
                                    below
                                  </span>
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-3.5 h-3.5 text-sleeper-accent" />
                                  <span>
                                    See {availableContracts.length - evenWindow.end}{" "}
                                    more option
                                    {availableContracts.length - evenWindow.end > 1
                                      ? "s"
                                      : ""}{" "}
                                    below (higher lines)
                                  </span>
                                </>
                              )}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* TAB 2: KALSHI GAME LINES (DRAFTKINGS-STYLE SPORTSBOOK BOARD) */}
            {tab === "mainline" && (
              <div className="space-y-3">
                {/* Team Quick Filter */}
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={gameQuery}
                    onChange={(e) => setGameQuery(e.target.value)}
                    placeholder="Filter matchups by team (e.g. Chiefs, Eagles, KC, BAL)..."
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-sleeper-dark border border-sleeper-border text-xs text-white placeholder-gray-500 focus:outline-none focus:border-sleeper-accent transition"
                  />
                  {gameQuery && (
                    <button
                      type="button"
                      onClick={() => setGameQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* DraftKings-Style Matchup & Odds Board */}
                <div className="space-y-3">
                  {filteredGamesList.map((g) => {
                    const isGameSelected = selectedGame.game_id === g.game_id;
                    const isTnf = g.commence_time.includes("T20:15");
                    const awayMeta = getNflTeamMeta(g.away_team);
                    const homeMeta = getNflTeamMeta(g.home_team);

                    const awaySpreadPt =
                      g.spread_away.point > 0
                        ? `+${g.spread_away.point}`
                        : `${g.spread_away.point}`;
                    const homeSpreadPt =
                      g.spread_home.point > 0
                        ? `+${g.spread_home.point}`
                        : `${g.spread_home.point}`;

                    const isPicked = (
                      type:
                        | "spread_away"
                        | "spread_home"
                        | "ml_away"
                        | "ml_home"
                        | "total_over"
                        | "total_under",
                    ) => isGameSelected && mainlineType === type;

                    const selectLine = (
                      type:
                        | "spread_away"
                        | "spread_home"
                        | "ml_away"
                        | "ml_home"
                        | "total_over"
                        | "total_under",
                    ) => {
                      setSelectedGame(g);
                      setMainlineType(type);
                    };

                    return (
                      <div
                        key={g.game_id}
                        className={`rounded-xl border overflow-hidden transition ${
                          isGameSelected
                            ? "bg-sleeper-dark border-sleeper-accent/70 shadow-lg"
                            : "bg-sleeper-dark/50 border-sleeper-border hover:border-gray-600"
                        }`}
                      >
                        {/* Top Bar: Kickoff Date/Time & Column Headers */}
                        <div className="px-3 py-2 bg-black/30 border-b border-sleeper-border/60 flex items-center justify-between gap-2">
                          <div className="flex items-center space-x-2 min-w-0">
                            <span className="text-[11px] font-semibold text-gray-300 truncate">
                              {new Date(g.commence_time).toLocaleDateString(
                                "en-US",
                                {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                },
                              )}
                            </span>
                            {isTnf && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                                ⏳ TNF
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-3 gap-1.5 w-[62%] sm:w-[64%] text-[10px] font-extrabold uppercase tracking-wider text-gray-400 text-center shrink-0">
                            <span>Spread</span>
                            <span>Total</span>
                            <span>Moneyline</span>
                          </div>
                        </div>

                        <div className="p-2.5 space-y-2">
                          {/* Away Team Row */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                              <div
                                className="w-1 h-8 rounded-full shrink-0"
                                style={{ backgroundColor: awayMeta.color }}
                              />
                              <TeamLogo team={g.away_team} size="md" />
                              <div className="min-w-0">
                                <div className="text-xs sm:text-sm font-black text-white leading-tight truncate">
                                  {g.away_team}
                                </div>
                                <div className="text-[11px] text-gray-400 font-medium leading-tight truncate">
                                  {awayMeta.name}
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-1.5 w-[62%] sm:w-[64%] shrink-0">
                              {/* Spread Away */}
                              {isExceedingMax(g.spread_away.price_cents) ? (
                                <div className="min-h-[46px] rounded-lg border border-transparent bg-transparent" />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => selectLine("spread_away")}
                                  className={`py-2 px-1.5 rounded-lg border text-center transition ${
                                    isPicked("spread_away")
                                      ? "bg-sleeper-accent text-black border-sleeper-accent font-extrabold shadow-md"
                                      : "bg-sleeper-card text-gray-200 border-sleeper-border hover:border-sleeper-accent/50 hover:bg-white/[0.04]"
                                  }`}
                                >
                                  <div className="text-xs font-extrabold leading-tight">
                                    {awaySpreadPt}
                                  </div>
                                  <div
                                    className={`text-[10px] sm:text-[11px] font-mono mt-0.5 ${
                                      isPicked("spread_away")
                                        ? "text-black/80 font-bold"
                                        : "text-sleeper-accent font-semibold"
                                    }`}
                                  >
                                    {formatOddsWithCents(
                                      g.spread_away.odds,
                                      g.spread_away.price_cents,
                                      oddsFormat,
                                    )}
                                  </div>
                                </button>
                              )}

                              {/* Total Over */}
                              {isExceedingMax(g.total_over.price_cents) ? (
                                <div className="min-h-[46px] rounded-lg border border-transparent bg-transparent" />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => selectLine("total_over")}
                                  className={`py-2 px-1.5 rounded-lg border text-center transition ${
                                    isPicked("total_over")
                                      ? "bg-sleeper-accent text-black border-sleeper-accent font-extrabold shadow-md"
                                      : "bg-sleeper-card text-gray-200 border-sleeper-border hover:border-sleeper-accent/50 hover:bg-white/[0.04]"
                                  }`}
                                >
                                  <div className="text-xs font-extrabold leading-tight">
                                    O {g.total_over.point}
                                  </div>
                                  <div
                                    className={`text-[10px] sm:text-[11px] font-mono mt-0.5 ${
                                      isPicked("total_over")
                                        ? "text-black/80 font-bold"
                                        : "text-sleeper-accent font-semibold"
                                    }`}
                                  >
                                    {formatOddsWithCents(
                                      g.total_over.odds,
                                      g.total_over.price_cents,
                                      oddsFormat,
                                    )}
                                  </div>
                                </button>
                              )}

                              {/* Moneyline Away */}
                              {isExceedingMax(g.ml_away.price_cents) ? (
                                <div className="min-h-[46px] rounded-lg border border-transparent bg-transparent" />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => selectLine("ml_away")}
                                  className={`py-2 px-1.5 rounded-lg border text-center transition flex flex-col items-center justify-center ${
                                    isPicked("ml_away")
                                      ? "bg-sleeper-accent text-black border-sleeper-accent font-extrabold shadow-md"
                                      : "bg-sleeper-card text-gray-200 border-sleeper-border hover:border-sleeper-accent/50 hover:bg-white/[0.04]"
                                  }`}
                                >
                                  <div
                                    className={`text-xs font-mono font-extrabold leading-tight ${
                                      isPicked("ml_away")
                                        ? "text-black"
                                        : "text-sleeper-accent"
                                    }`}
                                  >
                                    {formatOddsWithCents(
                                      g.ml_away.odds,
                                      g.ml_away.price_cents,
                                      oddsFormat,
                                    )}
                                  </div>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Home Team Row */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                              <div
                                className="w-1 h-8 rounded-full shrink-0"
                                style={{ backgroundColor: homeMeta.color }}
                              />
                              <TeamLogo team={g.home_team} size="md" />
                              <div className="min-w-0">
                                <div className="flex items-center space-x-1">
                                  <span className="text-[10px] text-gray-500 font-bold">
                                    @
                                  </span>
                                  <span className="text-xs sm:text-sm font-black text-white leading-tight truncate">
                                    {g.home_team}
                                  </span>
                                </div>
                                <div className="text-[11px] text-gray-400 font-medium leading-tight truncate">
                                  {homeMeta.name}
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-1.5 w-[62%] sm:w-[64%] shrink-0">
                              {/* Spread Home */}
                              {isExceedingMax(g.spread_home.price_cents) ? (
                                <div className="min-h-[46px] rounded-lg border border-transparent bg-transparent" />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => selectLine("spread_home")}
                                  className={`py-2 px-1.5 rounded-lg border text-center transition ${
                                    isPicked("spread_home")
                                      ? "bg-sleeper-accent text-black border-sleeper-accent font-extrabold shadow-md"
                                      : "bg-sleeper-card text-gray-200 border-sleeper-border hover:border-sleeper-accent/50 hover:bg-white/[0.04]"
                                  }`}
                                >
                                  <div className="text-xs font-extrabold leading-tight">
                                    {homeSpreadPt}
                                  </div>
                                  <div
                                    className={`text-[10px] sm:text-[11px] font-mono mt-0.5 ${
                                      isPicked("spread_home")
                                        ? "text-black/80 font-bold"
                                        : "text-sleeper-accent font-semibold"
                                    }`}
                                  >
                                    {formatOddsWithCents(
                                      g.spread_home.odds,
                                      g.spread_home.price_cents,
                                      oddsFormat,
                                    )}
                                  </div>
                                </button>
                              )}

                              {/* Total Under */}
                              {isExceedingMax(g.total_under.price_cents) ? (
                                <div className="min-h-[46px] rounded-lg border border-transparent bg-transparent" />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => selectLine("total_under")}
                                  className={`py-2 px-1.5 rounded-lg border text-center transition ${
                                    isPicked("total_under")
                                      ? "bg-sleeper-accent text-black border-sleeper-accent font-extrabold shadow-md"
                                      : "bg-sleeper-card text-gray-200 border-sleeper-border hover:border-sleeper-accent/50 hover:bg-white/[0.04]"
                                  }`}
                                >
                                  <div className="text-xs font-extrabold leading-tight">
                                    U {g.total_under.point}
                                  </div>
                                  <div
                                    className={`text-[10px] sm:text-[11px] font-mono mt-0.5 ${
                                      isPicked("total_under")
                                        ? "text-black/80 font-bold"
                                        : "text-sleeper-accent font-semibold"
                                    }`}
                                  >
                                    {formatOddsWithCents(
                                      g.total_under.odds,
                                      g.total_under.price_cents,
                                      oddsFormat,
                                    )}
                                  </div>
                                </button>
                              )}

                              {/* Moneyline Home */}
                              {isExceedingMax(g.ml_home.price_cents) ? (
                                <div className="min-h-[46px] rounded-lg border border-transparent bg-transparent" />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => selectLine("ml_home")}
                                  className={`py-2 px-1.5 rounded-lg border text-center transition flex flex-col items-center justify-center ${
                                    isPicked("ml_home")
                                      ? "bg-sleeper-accent text-black border-sleeper-accent font-extrabold shadow-md"
                                      : "bg-sleeper-card text-gray-200 border-sleeper-border hover:border-sleeper-accent/50 hover:bg-white/[0.04]"
                                  }`}
                                >
                                  <div
                                    className={`text-xs font-mono font-extrabold leading-tight ${
                                      isPicked("ml_home")
                                        ? "text-black"
                                        : "text-sleeper-accent"
                                    }`}
                                  >
                                    {formatOddsWithCents(
                                      g.ml_home.odds,
                                      g.ml_home.price_cents,
                                      oddsFormat,
                                    )}
                                  </div>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {filteredGamesList.length === 0 && (
                    <div className="text-center py-6 text-xs text-gray-400">
                      No matchups matching "{gameQuery}"
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sticky Footer: Ticket Preview + Submit Button */}
          <div className="p-4 border-t border-sleeper-border bg-sleeper-card space-y-3 shrink-0">
            <div className="p-3 rounded-xl bg-sleeper-dark border border-sleeper-border flex items-center justify-between">
              <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                {previewTeam ? (
                  <TeamLogo team={previewTeam} size="md" />
                ) : (
                  <Sparkles className="w-4 h-4 text-sleeper-accent shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold text-gray-400 block leading-tight">
                    Ticket Preview
                  </span>
                  <span
                    className={`text-xs truncate block ${
                      canSubmit
                        ? "font-bold text-white"
                        : "italic text-gray-400"
                    }`}
                  >
                    {previewLine}
                  </span>
                </div>
              </div>
              {canSubmit && (
                <div className="shrink-0 px-2.5 py-1 rounded bg-sleeper-card border border-sleeper-border text-xs font-mono font-bold text-sleeper-accent">
                  {formatOddsWithCents(previewOdds, previewCents, oddsFormat)}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className={`w-full py-3 font-extrabold rounded-xl transition flex items-center justify-center space-x-2 text-sm ${
                canSubmit
                  ? "bg-sleeper-accent text-black hover:brightness-110 active:scale-[0.99] shadow-lg shadow-sleeper-accent/20"
                  : "bg-sleeper-dark text-gray-500 border border-sleeper-border cursor-not-allowed"
              }`}
            >
              <span>Submit My Weekly Leg</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
