import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import ContentShell from "../../components/ContentShell";
import { useFilters, type DaysFilter } from "../../components/Filters/FilterContext";
import HudFilters from "../../components/Filters/HudFilters";
import ServerSheet from "../../components/Filters/ServerSheet";
import BottomFilterSheet from "../../components/Filters/BottomFilterSheet";
import ListSwitcher from "../../components/Filters/ListSwitcher";
import { getClassIconUrl } from "../../components/ui/shared/classIcons";

import { ToplistsProvider, useToplistsData } from "../../context/ToplistsDataContext";
import GuildToplists from "./guildtoplists";
import type { RegionKey } from "../../components/Filters/serverGroups";
import {
  getPlayerToplistSnapshotByDocIdCached,
  type FirestoreLatestToplistSnapshot,
  type FirestoreToplistPlayerRow,
  type FirestoreLatestToplistResult,
} from "../../lib/api/toplistsFirestore";

const splitListParam = (value: string | null) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeServerList = (list: string[]) => {
  const set = new Set<string>();
  list.forEach((entry) => {
    const normalized = entry.trim().toUpperCase();
    if (normalized) set.add(normalized);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
};

const normalizeClassList = (list: string[]) => {
  const set = new Set<string>();
  list.forEach((entry) => {
    const normalized = entry
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-");
    if (normalized) set.add(normalized);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
};

const normalizeGuildKey = (value: string | null | undefined) =>
  (value ?? "").toString().trim().toLowerCase();

const listEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));
const formatMonth = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;

const generateRecentMonths = (count: number) => {
  const months: string[] = [];
  const cursor = new Date();
  // Only include fully completed months: start from previous month.
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  for (let i = 0; i < count; i++) {
    months.push(formatMonth(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  return months;
};

const MIN_COMPARE_MONTH = "2026-01";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const computeLastScanColor = (lastScan: unknown, nowMs: number): string | null => {
  if (!lastScan) return null;
  const ts = new Date(lastScan as any).getTime();
  if (!Number.isFinite(ts)) return null;
  const days = Math.max(0, Math.floor((nowMs - ts) / MS_PER_DAY));
  if (days <= 0) return "#34d399"; // today
  if (days === 1) return "#4ade80";
  if (days <= 3) return "#a3e635";
  if (days <= 7) return "#facc15";
  if (days <= 14) return "#f97316";
  if (days <= 30) return "#ef4444";
  return "#b91c1c";
};

const toNumberSafe = (value: any): number | null => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
type CellDecor = {
  mainRank?: number;
  conRank?: number;
  levelRank?: number;
  mineTier?: 1 | 2 | 3 | 4;
  statsNorm?: number;
  statsIsBest?: boolean;
};

const MAIN_RANK_COLORS = ["#f6e7a6", "#f4de89", "#f2d56d", "#f0cc51", "#edc236"];
const CON_RANK_COLORS = ["#ffe4b3", "#ffdda0", "#ffd68d", "#ffcf7a", "#ffc867"];
const LEVEL_RANK_COLORS = ["#9ec5ff", "#8ab7ff", "#76a9ff", "#629bff", "#4e8dff"];
const MINE_TIER_COLORS: Record<number, string> = {
  1: "#d8b4fe",
  2: "#c084fc",
  3: "#a855f7",
  4: "#f472b6",
};
const BEST_STATS_COLOR = "#f59e0b";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const getRankTone = (rank: number | undefined, palette: string[]) =>
  rank && rank > 0 && rank <= palette.length ? palette[rank - 1] : null;
const getMineTone = (tier: number | undefined) =>
  tier ? MINE_TIER_COLORS[tier] ?? null : null;
const getStatsPlusTone = (decor?: CellDecor) => {
  if (!decor) return null;
  if (decor.statsIsBest) return BEST_STATS_COLOR;
  if (decor.statsNorm == null) return null;
  const alpha = 0.2 + 0.6 * clamp01(decor.statsNorm);
  return `rgba(34, 197, 94, ${alpha.toFixed(2)})`;
};
const getFrameStyle = (color?: string | null): React.CSSProperties | undefined =>
  color
    ? {
        boxShadow: `inset 0 0 0 1px ${color}`,
        borderRadius: 6,
        padding: "0 4px",
        display: "inline-flex",
        alignItems: "center",
      }
    : undefined;

// HUD -> Provider Sort mapping
function mapSort(sortBy: string): { key: string; dir: "asc" | "desc" } {
  switch (sortBy) {
    case "level":        return { key: "level",    dir: "desc" };
    case "main":         return { key: "main",     dir: "desc" };
    case "constitution": return { key: "con",      dir: "desc" };
    case "sum":          return { key: "sum",      dir: "desc" };
    case "mainTotal":    return { key: "mainTotal", dir: "desc" };
    case "conTotal":     return { key: "conTotal",  dir: "desc" };
    case "sumTotal":     return { key: "sumTotal",  dir: "desc" };
    case "xpProgress":   return { key: "xpProgress", dir: "desc" };
    case "xpTotal":      return { key: "xpTotal",   dir: "desc" };
    case "lastActivity": // solange nicht vorhanden -> Last Scan
    case "lastScan":     return { key: "lastScan", dir: "desc" };
    case "name":         return { key: "name",     dir: "asc" };
    default:              return { key: "level",    dir: "desc" };
  }
}
function deriveGroupFromServers(servers: string[]): string {
  const first = (servers[0] || "").toUpperCase();
  if (first.startsWith("EU")) return "EU";
  if (first.startsWith("US") || first.startsWith("NA") || first.startsWith("AM")) return "US";
  if (first.startsWith("F")) return "FUSION";
  if (first) return "INT";
  return "EU";
}

export default function PlayerToplistsPage() {
  return (
    <ToplistsProvider>
      <PlayerToplistsPageContent />
    </ToplistsProvider>
  );
}

function PlayerToplistsPageContent() {
  const f = useFilters(); // MUSS innerhalb FilterProvider laufen
  const {
    filterMode, setFilterMode,
    listView, setListView,
    bottomFilterOpen, setBottomFilterOpen,
    serverSheetOpen, setServerSheetOpen,
    servers, setServers,
    classes, setClasses,
    setGuilds,
    range,
    sortBy,
  } = f;
  const { serverGroups, player } = useToplistsData();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const serverParam = searchParams.get("server");
  const serversParam = searchParams.get("servers");
  const classParam = searchParams.get("class");
  const classesParam = searchParams.get("classes");
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "guilds" ? "guilds" : "players";
  const [compareMonth, setCompareMonth] = React.useState<string>(searchParams.get("compare") ?? "");
  const monthOptions = React.useMemo(
    () => generateRecentMonths(17).filter((m) => m >= MIN_COMPARE_MONTH),
    [],
  );
  const normalizedServers = React.useMemo(() => normalizeServerList(servers ?? []), [servers]);
  const normalizedClasses = React.useMemo(() => normalizeClassList(classes ?? []), [classes]);

  const urlServers = React.useMemo(() => {
    const raw = serverParam ?? serversParam;
    return normalizeServerList(splitListParam(raw));
  }, [serverParam, serversParam]);
  const urlClasses = React.useMemo(() => {
    const raw = classParam ?? classesParam;
    return normalizeClassList(splitListParam(raw));
  }, [classParam, classesParam]);

  const urlServersProvided = serverParam != null || serversParam != null;
  const urlClassesProvided = classParam != null || classesParam != null;

  const searchKey = React.useMemo(() => searchParams.toString(), [searchParams]);
  const normalizedServersKey = normalizedServers.join(",");
  const normalizedClassesKey = normalizedClasses.join(",");
  const urlServersKey = urlServers.join(",");
  const urlClassesKey = urlClasses.join(",");
  const prevServersKeyRef = React.useRef<string | null>(null);

  const normalizedServersRef = React.useRef(normalizedServers);
  const normalizedClassesRef = React.useRef(normalizedClasses);
  const setServersRef = React.useRef(setServers);
  const setClassesRef = React.useRef(setClasses);
  const lastUrlWriteRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    normalizedServersRef.current = normalizedServers;
  }, [normalizedServers]);

  React.useEffect(() => {
    normalizedClassesRef.current = normalizedClasses;
  }, [normalizedClasses]);

  React.useEffect(() => {
    setServersRef.current = setServers;
  }, [setServers]);

  React.useEffect(() => {
    setClassesRef.current = setClasses;
  }, [setClasses]);

  React.useEffect(() => {
    const prevKey = prevServersKeyRef.current;
    prevServersKeyRef.current = normalizedServersKey;
    if (prevKey != null && prevKey !== normalizedServersKey) {
      setGuilds([]);
    }
  }, [normalizedServersKey, setGuilds]);

  useEffect(() => {
    if (lastUrlWriteRef.current === searchKey) {
      lastUrlWriteRef.current = null;
      return;
    }

    if (urlServersProvided) {
      const nextServers = urlServers;
      if (!listEqual(normalizedServersRef.current, nextServers)) {
        setServersRef.current(nextServers);
      }
    }

    if (urlClassesProvided && !listEqual(normalizedClassesRef.current, urlClasses)) {
      setClassesRef.current(urlClasses);
    }
  }, [
    searchKey,
    urlServersProvided,
    urlClassesProvided,
    urlServersKey,
    urlClassesKey,
  ]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    const nextServers = normalizedServersKey;
    const nextClasses = normalizedClassesKey;

    if (nextServers) {
      nextParams.set("server", nextServers);
    } else {
      nextParams.delete("server");
    }
    nextParams.delete("servers");

    if (nextClasses) {
      nextParams.set("class", nextClasses);
    } else {
      nextParams.delete("class");
    }
    nextParams.delete("classes");

    const nextKey = nextParams.toString();
    if (nextKey !== searchKey) {
      lastUrlWriteRef.current = nextKey;
      setSearchParams(nextParams, { replace: true });
    }
  }, [normalizedServersKey, normalizedClassesKey, searchKey, searchParams, setSearchParams]);

  const guildOptions = React.useMemo(() => {
    const rows = Array.isArray(player?.rows) ? player.rows : [];
    if (!rows.length) return [];
    const map = new Map<string, { value: string; label: string }>();
    rows.forEach((row) => {
      const name = String(row.guild ?? "").trim();
      if (!name) return;
      const key = normalizeGuildKey(name);
      if (!key) return;
      const serverCode =
        (row.server && String(row.server).trim().toUpperCase()) ||
        (normalizedServers.length === 1 ? normalizedServers[0] : "");
      const label = serverCode ? `${name} (${serverCode})` : name;
      if (!map.has(key)) {
        map.set(key, { value: name, label });
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
  }, [player?.rows, normalizedServers]);

  return (
    <>
      <ContentShell
        mode="card"
        title="Top Lists"
        actions={<TopActions />}
        leftWidth={0}
        rightWidth={0}
        subheader={
          filterMode === "hud" ? (
            <HudFilters
              compareMonth={compareMonth}
              setCompareMonth={setCompareMonth}
              monthOptions={monthOptions}
              guildOptions={guildOptions}
            />
          ) : null
        }
        centerFramed={false}
        stickyTopbar
        stickySubheader
        topbarHeight={56}
      >
        <ListSwitcher />

        {activeTab === "players" && listView === "table" && (
          <TableDataView
            servers={servers ?? []}
            classes={classes ?? []}
            range={(range ?? "all") as any}
            sortKey={sortBy ?? "level"}
            compareMonth={compareMonth}
          />
        )}
        {activeTab === "guilds" && <GuildToplists serverCodes={servers ?? []} />}
      </ContentShell>

      <ServerSheet
        mode="modal"
        open={serverSheetOpen}
        onClose={() => setServerSheetOpen(false)}
        serversByRegion={serverGroups}
        selected={servers}
        onToggle={(s: string) =>
          setServers((prev: string[]) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
        }
        onSelectAllInRegion={(region: RegionKey) => setServers(serverGroups[region] ?? [])}
        onClearAll={() => setServers([])}
      />

      <BottomFilterSheet
        open={filterMode === "sheet" && bottomFilterOpen}
        onClose={() => setBottomFilterOpen(false)}
      />
    </>
  );
}

function TableDataView({
  servers, classes, range, sortKey, compareMonth,
}: {
  servers: string[];
  classes: string[];
  range: DaysFilter;
  sortKey: string;
  compareMonth: string;
}) {
  const { t } = useTranslation();
  const { guilds } = useFilters();
  const {
    player,
    playerRows,
    playerLoading,
    playerError,
    playerLastUpdatedAt,
    playerScopeStatus,
    setFilters,
    setSort,
  } = useToplistsData();
  const navigate = useNavigate();

  const hasServers = (servers?.length ?? 0) > 0;
  // HUD-Filter -> Provider
  useEffect(() => {
    const providerRange =
      range === "all" ? "all" : range === 60 ? "30d" : `${range}d`;
    const normalized = normalizeServerList(servers);
    const normalizedCls = normalizeClassList(classes);
    const group = deriveGroupFromServers(normalized);
    setFilters({
      servers: normalized,
      classes: normalizedCls,
      timeRange: providerRange as any,
      group,
    });
  }, [servers, classes, range, setFilters]);

  useEffect(() => {
    const s = mapSort(sortKey);
    setSort(s);
  }, [sortKey, setSort]);

  const fmtNum = (n: number | null | undefined) => (n == null ? "" : new Intl.NumberFormat("en").format(n));
  const fmtDelta = (n: number | null | undefined) => {
    if (n == null) return "";
    const formatted = fmtNum(Math.abs(n));
    if (!formatted) return String(n);
    return n > 0 ? `+${formatted}` : `-${formatted}`;
  };
  const fmtDate = (ts: number | null | undefined) => {
    if (ts == null) return null;
    const ms = ts < 1e12 ? ts * 1000 : ts;
    return new Date(ms).toLocaleString();
  };
  const fmtDateObj = (d: Date | null | undefined) => (d ? d.toLocaleString() : "—");

  const rows = playerRows || [];
  const selectedGuildSet = React.useMemo(() => {
    const keys = (guilds || []).map(normalizeGuildKey).filter(Boolean);
    return keys.length ? new Set(keys) : null;
  }, [guilds]);
  const hasGuildData = React.useMemo(() => {
    const rawRows = Array.isArray(player?.rows) ? player.rows : [];
    return rawRows.some((row) => Boolean(normalizeGuildKey(row.guild)));
  }, [player?.rows]);

  const filteredRows = React.useMemo(() => {
    if (!selectedGuildSet || !hasGuildData) return rows;
    return rows.filter((row) => {
      const key = normalizeGuildKey(row.guild);
      return key ? selectedGuildSet.has(key) : false;
    });
  }, [rows, selectedGuildSet, hasGuildData]);

  const [searchParams, setSearchParams] = useSearchParams();
  const [compareState, setCompareState] = React.useState<{
    rows: FirestoreToplistPlayerRow[];
    loading: boolean;
    missing: boolean;
    error: string | null;
  }>({ rows: [], loading: false, missing: false, error: null });
  const compareCacheRef = React.useRef<Map<string, FirestoreLatestToplistSnapshot>>(new Map());

  const showCompare = Boolean(compareMonth) && !compareState.loading && !compareState.missing && compareState.rows.length > 0;

  // persist compare selection in URL (optional param)
  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    if (compareMonth) {
      nextParams.set("compare", compareMonth);
    } else {
      nextParams.delete("compare");
    }
    const prev = searchParams.get("compare") ?? "";
    if (prev !== compareMonth) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [compareMonth, searchParams, setSearchParams]);

  // Load monthly snapshot(s) for comparison
  useEffect(() => {
    let cancelled = false;

    if (!compareMonth) {
      setCompareState({ rows: [], loading: false, missing: false, error: null });
      return () => {
        cancelled = true;
      };
    }

    const normalizedServers = normalizeServerList(servers);
    if (!normalizedServers.length) {
      setCompareState({ rows: [], loading: false, missing: true, error: null });
      return () => {
        cancelled = true;
      };
    }

    const docIds = normalizedServers.map((s) => `${s}__${compareMonth}`);
    const cachedSnapshots: FirestoreLatestToplistSnapshot[] = [];
    const missingDocIds: string[] = [];

    for (const docId of docIds) {
      const cached = compareCacheRef.current.get(docId);
      if (cached) {
        cachedSnapshots.push(cached);
      } else {
        missingDocIds.push(docId);
      }
    }

    const mergeSnapshots = (snapshots: FirestoreLatestToplistSnapshot[]) => {
      const mergedRows: FirestoreToplistPlayerRow[] = [];
      for (const snapshot of snapshots) {
        const players = Array.isArray(snapshot.players) ? snapshot.players : [];
        for (const row of players) mergedRows.push(row.server ? row : { ...row, server: snapshot.server });
      }
      return mergedRows;
    };

    if (missingDocIds.length === 0) {
      setCompareState({
        rows: mergeSnapshots(cachedSnapshots),
        loading: false,
        missing: false,
        error: null,
      });
      return () => {
        cancelled = true;
      };
    }

    setCompareState((prev) => ({ ...prev, loading: true, missing: false, error: null }));

    (async () => {
      const results: FirestoreLatestToplistResult[] = await Promise.all(
        missingDocIds.map((docId) => getPlayerToplistSnapshotByDocIdCached(docId))
      );
      if (cancelled) return;

      const snapshots: FirestoreLatestToplistSnapshot[] = [...cachedSnapshots];
      let missing = false;
      let firstErrorCode: string | null = null;
      let firstErrorDetail: string | null = null;

      results.forEach((result: FirestoreLatestToplistResult, idx) => {
        const docId = missingDocIds[idx];
        if (result.ok) {
          compareCacheRef.current.set(docId, result.snapshot);
          snapshots.push(result.snapshot);
        } else {
          const err: any = result;
          missing = missing || err.error === "not_found";
          if (!firstErrorCode) {
            firstErrorCode = err.error ?? null;
            firstErrorDetail = err.detail ?? null;
          }
        }
      });

      const errorMsg = firstErrorDetail ?? firstErrorCode ?? null;

      setCompareState({
        rows: snapshots.length ? mergeSnapshots(snapshots) : [],
        loading: false,
        missing,
        error: errorMsg,
      });
    })().catch((err) => {
      if (cancelled) return;
      setCompareState({ rows: [], loading: false, missing: true, error: String(err) });
    });

    return () => {
      cancelled = true;
    };
  }, [compareMonth, servers]);

  const buildRowKey = React.useCallback((row: FirestoreToplistPlayerRow) => {
    // Fallback key: server + name + class (playerId is not present in toplist rows)
    return `${row.server || "ALL"}:${row.name}:${row.class || ""}`;
  }, []);

  const compareMap = React.useMemo(() => {
    if (!showCompare) return new Map<string, { row: FirestoreToplistPlayerRow; rank: number }>();
    const map = new Map<string, { row: FirestoreToplistPlayerRow; rank: number }>();
    const rankPerServer = new Map<string, number>();

    compareState.rows.forEach((row) => {
      const serverKey = row.server || "ALL";
      const nextRank = (rankPerServer.get(serverKey) || 0) + 1;
      rankPerServer.set(serverKey, nextRank);

      const key = buildRowKey(row);
      if (!map.has(key)) {
        map.set(key, { row, rank: nextRank });
      }
    });
    return map;
  }, [showCompare, compareState.rows, buildRowKey]);

  const enhancedRows = React.useMemo(() => {
    return filteredRows.map((row, idx) => {
      if (!showCompare) {
        return { ...row, _rank: idx + 1 };
      }
      const key = buildRowKey(row);
      const past = compareMap.get(key);
      const rankDelta = past ? past.rank - (idx + 1) : null;
      const delta = (field: keyof FirestoreToplistPlayerRow) => {
        if (!past) return null;
        if (field === "ratio") return null;
        const curr = toNumberSafe((row as any)[field]);
        const prev = toNumberSafe((past.row as any)[field]);
        if (prev == null) return null;
        return (curr ?? 0) - prev;
      };
      return {
        ...row,
        _rank: idx + 1,
        _rankDelta: rankDelta,
        _delta: {
          level: delta("level"),
          main: delta("main"),
          con: delta("con"),
          sum: delta("sum"),
          mainTotal: delta("mainTotal"),
          conTotal: delta("conTotal"),
          sumTotal: delta("sumTotal"),
          xpProgress: delta("xpProgress"),
          xpTotal: delta("xpTotal"),
          ratio: delta("ratio"),
          mine: delta("mine"),
          treasury: delta("treasury"),
        },
      };
    });
  }, [filteredRows, showCompare, compareMap]);

  const decorMap = React.useMemo(() => {
    const map = new Map<string, CellDecor>();
    const rows = enhancedRows;
    const keyFor = (row: FirestoreToplistPlayerRow) =>
      (row as any).playerId ?? (row as any).id ?? buildRowKey(row);

    const ensure = (row: FirestoreToplistPlayerRow) => {
      const key = keyFor(row);
      let entry = map.get(key);
      if (!entry) {
        entry = {};
        map.set(key, entry);
      }
      return entry;
    };

    const rankBy = (
      valueGetter: (row: FirestoreToplistPlayerRow) => number | null,
      field: "mainRank" | "conRank" | "levelRank",
    ) => {
      const ranked = rows
        .map((row, idx) => {
          const value = valueGetter(row);
          if (value == null) return null;
          return { row, value, idx };
        })
        .filter(Boolean) as { row: FirestoreToplistPlayerRow; value: number; idx: number }[];
      ranked.sort((a, b) => b.value - a.value || a.idx - b.idx);
      ranked.slice(0, 5).forEach((entry, i) => {
        ensure(entry.row)[field] = i + 1;
      });
    };

    rankBy((row) => toNumberSafe(row.main), "mainRank");
    rankBy((row) => toNumberSafe(row.con), "conRank");
    rankBy((row) => toNumberSafe(row.level), "levelRank");

    rows.forEach((row) => {
      const mineValue = toNumberSafe(row.mine);
      if (mineValue == null) return;
      const tier =
        mineValue >= 100 ? 4 :
        mineValue >= 80 ? 3 :
        mineValue >= 65 ? 2 :
        mineValue >= 50 ? 1 :
        null;
      if (tier) ensure(row).mineTier = tier as 1 | 2 | 3 | 4;
    });

    const statsEntries = rows
      .map((row) => {
        const value = toNumberSafe((row as any).deltaSum);
        if (value == null) return null;
        return { row, value };
      })
      .filter(Boolean) as { row: FirestoreToplistPlayerRow; value: number }[];
    if (statsEntries.length) {
      let min = statsEntries[0].value;
      let max = statsEntries[0].value;
      statsEntries.forEach((entry) => {
        if (entry.value < min) min = entry.value;
        if (entry.value > max) max = entry.value;
      });
      const denom = max - min;
      statsEntries.forEach((entry) => {
        const t = denom === 0 ? 0.5 : (entry.value - min) / denom;
        const target = ensure(entry.row);
        target.statsNorm = t;
        if (entry.value === max) target.statsIsBest = true;
      });
    }

    return map;
  }, [enhancedRows, buildRowKey]);

  const nowMs = Date.now();
  const statusLabel = !hasServers
    ? "No server selected"
    : playerLoading
      ? "Loading..."
      : playerError
        ? "Error"
        : "Ready";

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
      <div style={{ opacity: 0.8, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
        <div>{statusLabel} - {enhancedRows.length} rows</div>
        <div>{playerLastUpdatedAt ? `Updated: ${fmtDate(playerLastUpdatedAt)}` : null}</div>
      </div>
      {compareMonth && compareState.missing && (
        <div style={{ fontSize: 12, color: "#ffb347" }}>
          {t("toplists.compareMissingSnapshot", "No snapshot found for this month.")}
        </div>
      )}
      {playerScopeStatus && (
        <div style={{ opacity: 0.75, fontSize: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <span>
            Scope {playerScopeStatus.scopeId} • {playerScopeStatus.changesSinceLastRebuild}/{playerScopeStatus.minChanges ?? "?"} changes since last rebuild
          </span>
          <span>
            Auto rebuild at {playerScopeStatus.minChanges ?? "?"} changes or after {playerScopeStatus.maxAgeDays ?? "?"} days
          </span>
          <span>
            Last rebuild: {fmtDateObj(playerScopeStatus.lastRebuildAt)}
          </span>
        </div>
      )}

      {hasServers && playerError && (
        <div style={{ border: "1px solid #2C4A73", borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Error</div>
          <div style={{ wordBreak: "break-all" }}>{playerError}</div>
          <button onClick={() => window.location.reload()} style={{ marginTop: 8 }}>Retry</button>
        </div>
      )}

      {!hasServers ? (
        <div style={{ padding: 12, color: "#B0C4D9" }}>
          Please select at least one server.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="toplists-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #2C4A73" }}>
                <th style={{ padding: "8px 6px" }}>#</th>
                <th style={{ padding: "8px 6px" }}>Flag</th>
                <th style={{ padding: "8px 6px" }}>Delta Rank</th>
                <th style={{ padding: "8px 6px" }}>Server</th>
                <th style={{ padding: "8px 6px" }}>Name</th>
                <th style={{ padding: "8px 6px", textAlign: "center", width: 60 }}>Class</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Level</th>
                <th style={{ padding: "8px 6px" }}>Guild</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Main</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Con</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Sum</th>
                <th style={{ padding: "8px 6px" }}>Ratio</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Mine</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Treasury</th>
                <th style={{ padding: "8px 6px" }}>Last Scan</th>
                <th style={{ padding: "8px 6px" }}>Stats+</th>
              </tr>
            </thead>
            <tbody>
              {enhancedRows.map((r, i) => {
                const rankDelta = showCompare ? (r as any)._rankDelta : null;
                const deltas = (r as any)._delta || {};
                const lastScanDotColor = computeLastScanColor((r as any).lastScan, nowMs);
                const classIconUrl = getClassIconUrl((r as any).class, 48);
                const playerId = (r as any).playerId ?? (r as any).id ?? null;
                const rowKey = playerId ?? buildRowKey(r);
                const decor = decorMap.get(rowKey);
                const mainTone = getRankTone(decor?.mainRank, MAIN_RANK_COLORS);
                const conTone = getRankTone(decor?.conRank, CON_RANK_COLORS);
                const levelTone = getRankTone(decor?.levelRank, LEVEL_RANK_COLORS);
                const mineTone = getMineTone(decor?.mineTier);
                const statsPlusTone = getStatsPlusTone(decor);
                const renderDelta = (value: number | null) =>
                  showCompare ? (
                    <div style={{ fontSize: 11, opacity: 0.8 }}>
                      {value == null ? t("toplists.deltaNew", "NEW") : fmtDelta(value)}
                    </div>
                  ) : null;

                return (
                <tr
                  key={`${r.name}__${r.server}__${r.class ?? ""}`}
                  className="toplists-row"
                  style={{ borderBottom: "1px solid #2C4A73", cursor: playerId ? "pointer" : undefined }}
                  onClick={() => {
                    if (playerId) navigate(`/player/${encodeURIComponent(playerId)}`);
                  }}
                >
                  <td style={{ padding: "8px 6px" }}>{i + 1}</td>
                  <td style={{ padding: "8px 6px" }}>{r.flag ?? ""}</td>
                  <td style={{ padding: "8px 6px" }}>{rankDelta == null ? "" : fmtDelta(rankDelta)}</td>
                  <td style={{ padding: "8px 6px" }}>{r.server}</td>
                  <td style={{ padding: "8px 6px" }}>{r.name}</td>
                  <td style={{ padding: "8px 6px", textAlign: "center" }}>
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                        height: "100%",
                      }}
                    >
                      {classIconUrl ? (
                        <img
                          src={classIconUrl}
                          alt={r.class ?? "class"}
                          width={20}
                          height={20}
                          loading="lazy"
                          style={{ display: "block", objectFit: "contain" }}
                        />
                      ) : (
                        <span>{r.class ?? ""}</span>
                      )}
                    </span>
                  </td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <span style={getFrameStyle(levelTone)}>{fmtNum(r.level)}</span>
                      {renderDelta(deltas.level ?? null)}
                    </div>
                  </td>
                  <td style={{ padding: "8px 6px" }}>{r.guild ?? ""}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <span style={getFrameStyle(mainTone)}>{fmtNum(r.main)}</span>
                      {renderDelta(deltas.main ?? null)}
                    </div>
                  </td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <span style={getFrameStyle(conTone)}>{fmtNum(r.con)}</span>
                      {renderDelta(deltas.con ?? null)}
                    </div>
                  </td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <span>{fmtNum(r.sum)}</span>
                      {renderDelta(deltas.sum ?? null)}
                    </div>
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                      <span>{(r as any)._ratioLabel ?? r.ratio ?? "—"}</span>
                      {deltas.ratio == null ? null : renderDelta(deltas.ratio)}
                    </div>
                  </td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <span style={getFrameStyle(mineTone)}>{fmtNum(r.mine)}</span>
                      {renderDelta(deltas.mine ?? null)}
                    </div>
                  </td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <span>{fmtNum(r.treasury)}</span>
                      {renderDelta(deltas.treasury ?? null)}
                    </div>
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span>{r.lastScan ?? ""}</span>
                      {lastScanDotColor && (
                        <span
                          aria-hidden
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: lastScanDotColor,
                            boxShadow: "0 0 6px rgba(0, 0, 0, 0.35)",
                          }}
                        />
                      )}
                    </span>
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    <span style={getFrameStyle(statsPlusTone)}>{fmtDelta((r as any).deltaSum)}</span>
                  </td>
                </tr>
                );
              })}
              {playerLoading && enhancedRows.length === 0 && (
                <tr><td colSpan={16} style={{ padding: 12 }}>Loading...</td></tr>
              )}
              {!playerLoading && !playerError && enhancedRows.length === 0 && (
                <tr><td colSpan={16} style={{ padding: 12 }}>No results</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TopActions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "guilds" ? "guilds" : "players";

  const setTab = (next: "players" | "guilds") => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", next);
    setSearchParams(nextParams);
  };

  return (
    <div className="flex items-center justify-end gap-2 flex-wrap">
      <nav
        className="inline-flex gap-1 rounded-xl border p-1"
        style={{ borderColor: "#2B4C73", background: "#14273E" }}
        aria-label="Toplist Tabs"
      >
        <TopTab active={activeTab === "players"} onClick={() => setTab("players")} label="Players" />
        <TopTab active={activeTab === "guilds"} onClick={() => setTab("guilds")} label="Guilds" />
      </nav>
    </div>
  );
}
function TopTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg px-3 py-1.5 text-sm text-white border",
        active ? "bg-[#25456B] border-[#5C8BC6]" : "border-transparent",
      ].join(" ")}
    >
      {label}
    </button>
  );
}




