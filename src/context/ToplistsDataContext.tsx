// src/context/ToplistsDataContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  loadToplistServersFromBundle,
  getLatestPlayerToplistSnapshotCached,
  type FirestoreLatestToplistSnapshot,
  type FirestoreToplistPlayerRow,
} from "../lib/api/toplistsFirestore";
import { buildServerGroupsFromCodes, type ServerGroupsByRegion } from "../components/Filters/serverGroups";
import { SERVERS } from "../data/servers";
import i18n from "../i18n";

const DEFAULT_GROUP = "EU";
const FALLBACK_SERVER_GROUPS = buildServerGroupsFromCodes(
  SERVERS.map((s) => s.id).filter((id): id is string => typeof id === "string" && !!id)
);

type TimeRange = "all" | "3d" | "7d" | "14d" | "30d" | "60d" | "90d";
type SortDir = "asc" | "desc";

export type Filters = {
  group: string;
  servers: string[];
  classes: string[];
  timeRange: TimeRange;
};

export type SortSpec = { key: string; dir: SortDir };

type PlayerToplistDataState = {
  rows: FirestoreToplistPlayerRow[];
  loading: boolean;
  error: string | null;
  lastUpdatedAt: number | null;
  nextUpdateAt: number | null;
  ttlSec: number | null;
  listId: string | null;
  rowLimit: number | null;
};

type CachedPlayerToplist = {
  snapshot: FirestoreLatestToplistSnapshot;
  cachedAt: number;
};

export type PlayerScopeStatus = {
  scopeId: string;
  lastRebuildAt: Date | null;
  lastChangeAt: Date | null;
  changesSinceLastRebuild: number;
  minChanges: number | null;
  maxAgeDays: number | null;
  progress: number;
  isFresh: boolean;
};

type Ctx = {
  player: PlayerToplistDataState;
  playerRows: FirestoreToplistPlayerRow[];
  playerLoading: boolean;
  playerError: string | null;
  playerLastUpdatedAt: number | null;
  playerNextUpdateAt: number | null;
  playerScopeStatus: PlayerScopeStatus | null;
  serverGroups: ServerGroupsByRegion;
  filters: Filters;
  sort: SortSpec;
  setFilters: (next: Partial<Filters> | ((prev: Filters) => Filters)) => void;
  setSort: (next: SortSpec | ((prev: SortSpec) => SortSpec)) => void;
};

const ToplistsCtx = createContext<Ctx | null>(null);

// ---- helpers ---------------------------------------------------------------

const arrEq = (a: any[], b: any[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

function filtersEqual(a: Filters, b: Filters) {
  return (
    a.group === b.group &&
    a.timeRange === b.timeRange &&
    arrEq(a.servers, b.servers) &&
    arrEq(a.classes, b.classes)
  );
}

function sortEqual(a: SortSpec, b: SortSpec) {
  return a.key === b.key && a.dir === b.dir;
}

const normalizeServerCode = (value: string) => value.trim().toUpperCase();

const normalizeClass = (value: string | null | undefined) =>
  value != null
    ? value
        .toLowerCase()
        .trim()
        .replace(/[\s_]+/g, "-")
        .replace(/-+/g, "-")
    : "";

const normalizeServerList = (list: string[] | null | undefined) => {
  if (!Array.isArray(list)) return [];
  const set = new Set<string>();
  for (const entry of list) {
    const normalized = normalizeServerCode(String(entry || ""));
    if (normalized) set.add(normalized);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
};

const normalizeClassList = (list: string[] | null | undefined) => {
  if (!Array.isArray(list)) return [];
  const set = new Set<string>();
  for (const entry of list) {
    const normalized = normalizeClass(entry);
    if (normalized) set.add(normalized);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
};

const pickDefaultServer = (groups: ServerGroupsByRegion) =>
  (groups[DEFAULT_GROUP]?.[0] ||
    Object.values(groups).find((list) => list.length)?.[0] ||
    "");

const toMsFromLastScan = (value: string | number | null | undefined): number | null => {
  if (value == null) return null;
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{10,13}$/.test(raw)) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return n < 1e12 ? n * 1000 : n;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

// ---- provider --------------------------------------------------------------

export function ToplistsProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFiltersState] = useState<Filters>({
    group: DEFAULT_GROUP,
    servers: [],
    classes: [],
    timeRange: "all",
  });

  const [sort, setSortState] = useState<SortSpec>({
    key: "sum",
    dir: "desc",
  });

  const [playerState, setPlayerState] = useState<PlayerToplistDataState>({
    rows: [],
    loading: false,
    error: null,
    lastUpdatedAt: null,
    nextUpdateAt: null,
    ttlSec: null,
    listId: null,
    rowLimit: null,
  });

  const playerCacheRef = useRef<Map<string, CachedPlayerToplist>>(new Map());
  const playerScopeStatus: PlayerScopeStatus | null = null;
  const [serverGroups, setServerGroups] = useState<ServerGroupsByRegion>(FALLBACK_SERVER_GROUPS);
  const normalizedServers = useMemo(() => normalizeServerList(filters.servers), [filters.servers]);
  const normalizedClasses = useMemo(() => normalizeClassList(filters.classes), [filters.classes]);
  const resolvedServers = useMemo(() => {
    if (normalizedServers.length) return normalizedServers;
    const fallback = pickDefaultServer(serverGroups);
    return fallback ? [normalizeServerCode(fallback)] : [];
  }, [normalizedServers, serverGroups]);
  const resolvedServerKey = useMemo(() => resolvedServers.join(","), [resolvedServers]);

  // Setter nur updaten, wenn sich wirklich etwas aendert
  const setFilters = useCallback(
    (next: Partial<Filters> | ((prev: Filters) => Filters)) => {
      setFiltersState((prev) => {
        const merged =
          typeof next === "function" ? (next as any)(prev) : { ...prev, ...next };
        return filtersEqual(prev, merged) ? prev : merged;
      });
    },
    []
  );

  const setSort = useCallback((next: SortSpec | ((prev: SortSpec) => SortSpec)) => {
    setSortState((prev) => {
      const nextVal = typeof next === "function" ? (next as any)(prev) : next;
      return sortEqual(prev, nextVal) ? prev : nextVal;
    });
  }, []);

  // Server-Liste (once per mount)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await loadToplistServersFromBundle();
      if (cancelled) return;

      if (result.ok) {
        const grouped = buildServerGroupsFromCodes(result.servers);
        const hasServers = Object.values(grouped).some((list) => list.length > 0);
        if (hasServers) {
          setServerGroups(grouped);
          return;
        }
      }

      setServerGroups(FALLBACK_SERVER_GROUPS);
    })().catch((err) => {
      if (cancelled) return;
      console.error("[ToplistsProvider] unexpected error while loading server list", err);
      setServerGroups(FALLBACK_SERVER_GROUPS);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Player-Topliste laden und cachen (nur players, Guilds bleiben Mock)
  useEffect(() => {
    let cancelled = false;

    if (!resolvedServers.length) {
      setPlayerState({
        rows: [],
        loading: false,
        error: i18n.t("toplistsPage.errors.noSnapshot", "No snapshot yet for this server."),
        lastUpdatedAt: null,
        nextUpdateAt: null,
        ttlSec: null,
        listId: null,
        rowLimit: null,
      });
      return () => {
        cancelled = true;
      };
    }

    const mergeSnapshots = (snapshots: FirestoreLatestToplistSnapshot[]) => {
      const rows: FirestoreToplistPlayerRow[] = [];
      let updatedAt: number | null = null;
      let rowLimit = 0;

      for (const snapshot of snapshots) {
        if (snapshot.updatedAt != null) {
          updatedAt = updatedAt == null ? snapshot.updatedAt : Math.max(updatedAt, snapshot.updatedAt);
        }
        const players = Array.isArray(snapshot.players) ? snapshot.players : [];
        rowLimit = Math.max(rowLimit, players.length);
        for (const row of players) {
          rows.push(row.server ? row : { ...row, server: snapshot.server });
        }
      }

      return { rows, updatedAt, rowLimit: rowLimit || null };
    };

    const cachedSnapshots: FirestoreLatestToplistSnapshot[] = [];
    const missingServers: string[] = [];
    for (const serverCode of resolvedServers) {
      const cached = playerCacheRef.current.get(serverCode);
      if (cached) {
        cachedSnapshots.push(cached.snapshot);
      } else {
        missingServers.push(serverCode);
      }
    }

    const cachedMerged = mergeSnapshots(cachedSnapshots);

    if (missingServers.length === 0) {
      setPlayerState({
        rows: cachedMerged.rows,
        loading: false,
        error: null,
        lastUpdatedAt: cachedMerged.updatedAt,
        nextUpdateAt: null,
        ttlSec: null,
        listId: resolvedServerKey || null,
        rowLimit: cachedMerged.rowLimit,
      });
      return () => {
        cancelled = true;
      };
    }

    setPlayerState((prev) => ({
      ...prev,
      rows: cachedMerged.rows,
      lastUpdatedAt: cachedMerged.updatedAt,
      rowLimit: cachedMerged.rowLimit,
      listId: resolvedServerKey || null,
      loading: true,
      error: null,
    }));

    (async () => {
      const results = await Promise.all(
        missingServers.map((serverCode) => getLatestPlayerToplistSnapshotCached(serverCode))
      );
      if (cancelled) return;

      const snapshots: FirestoreLatestToplistSnapshot[] = [...cachedSnapshots];
      let firstError: { error: string; detail?: string } | null = null;

      results.forEach((result, idx) => {
        const serverCode = missingServers[idx] || "";
        if (result.ok) {
          playerCacheRef.current.set(serverCode, { snapshot: result.snapshot, cachedAt: Date.now() });
          snapshots.push(result.snapshot);
        } else if (!firstError) {
          firstError = result;
        }
      });

      if (!snapshots.length) {
        const detail = firstError?.detail ? ` (${firstError.detail})` : "";
        let errorMsg = "Firestore Fehler";
        if (firstError?.error === "not_found") {
          errorMsg = i18n.t("toplistsPage.errors.noSnapshot", "No snapshot yet for this server.");
        } else if (firstError?.error === "decode_error") {
          errorMsg = "Fehler beim Lesen der Daten";
        }

        setPlayerState({
          rows: [],
          loading: false,
          error: `${errorMsg}${detail}`,
          lastUpdatedAt: null,
          nextUpdateAt: null,
          ttlSec: null,
          listId: resolvedServerKey || null,
          rowLimit: null,
        });
        return;
      }

      const merged = mergeSnapshots(snapshots);
      setPlayerState({
        rows: merged.rows,
        loading: false,
        error: null,
        lastUpdatedAt: merged.updatedAt,
        nextUpdateAt: null,
        ttlSec: null,
        listId: resolvedServerKey || null,
        rowLimit: merged.rowLimit,
      });
    })().catch((err) => {
      if (cancelled) return;
      console.error("[ToplistsProvider] unexpected error", err);
      setPlayerState({
        rows: [],
        loading: false,
        error: "Unerwarteter Fehler beim Laden",
        lastUpdatedAt: null,
        nextUpdateAt: null,
        ttlSec: null,
        listId: resolvedServerKey || null,
        rowLimit: null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [resolvedServerKey]);

  const playerRows = useMemo(() => {
    let rows = Array.isArray(playerState.rows) ? [...playerState.rows] : [];
    if (!rows.length) return rows;

    const serverFilter = normalizedServers;
    const serverSet = serverFilter.length ? new Set(serverFilter) : null;
    const classFilter = normalizedClasses;
    const classSet = classFilter.length ? new Set(classFilter) : null;
    const rangeDays = filters.timeRange === "all" ? null : Number(String(filters.timeRange).replace("d", ""));
    const cutoffMs = rangeDays && Number.isFinite(rangeDays) ? Date.now() - rangeDays * 86400000 : null;

    rows = rows.filter((row) => {
      if (serverSet && !serverSet.has(normalizeServerCode(row.server))) return false;
      if (classSet && !classSet.has(normalizeClass(row.class))) return false;
      if (cutoffMs != null) {
        const lastScanMs = toMsFromLastScan(row.lastScan);
        if (lastScanMs != null && lastScanMs < cutoffMs) return false;
      }
      return true;
    });

    const dir = sort.dir === "asc" ? 1 : -1;
    const compareNumber = (aVal: number | null, bVal: number | null) => {
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const diff = aVal - bVal;
      return sort.dir === "asc" ? diff : -diff;
    };

    rows.sort((a, b) => {
      switch (sort.key) {
        case "name": {
          const aName = String(a.name ?? "");
          const bName = String(b.name ?? "");
          const cmp = aName.localeCompare(bName, undefined, { sensitivity: "base" });
          return sort.dir === "asc" ? cmp : -cmp;
        }
        case "lastScan": {
          const aMs = toMsFromLastScan(a.lastScan);
          const bMs = toMsFromLastScan(b.lastScan);
          return compareNumber(aMs == null ? null : aMs, bMs == null ? null : bMs);
        }
        case "main":
          return compareNumber(a.main, b.main);
        case "con":
          return compareNumber(a.con, b.con);
        case "sum":
          return compareNumber(a.sum, b.sum);
        case "ratio":
          return compareNumber(a.ratio, b.ratio);
        case "mine":
          return compareNumber(a.mine, b.mine);
        case "treasury":
          return compareNumber(a.treasury, b.treasury);
        case "level":
        default:
          return compareNumber(a.level, b.level);
      }
    });

    if (playerState.rowLimit != null && playerState.rowLimit > 0 && rows.length > playerState.rowLimit) {
      rows = rows.slice(0, playerState.rowLimit);
    }

    return rows;
  }, [playerState.rows, playerState.rowLimit, filters.timeRange, normalizedServers, normalizedClasses, sort]);

  // Context-Value MEMOISIEREN, sonst re-rendert alles unnoetig
  const value = useMemo<Ctx>(
    () => ({
      player: playerState,
      playerRows,
      playerLoading: playerState.loading,
      playerError: playerState.error,
      playerLastUpdatedAt: playerState.lastUpdatedAt,
      playerNextUpdateAt: playerState.nextUpdateAt,
      playerScopeStatus,
      serverGroups,
      filters,
      sort,
      setFilters,
      setSort,
    }),
    [playerState, playerRows, filters, sort, serverGroups, setFilters, setSort, playerScopeStatus]
  );

  return <ToplistsCtx.Provider value={value}>{children}</ToplistsCtx.Provider>;
}

// ---- hook ------------------------------------------------------------------

export function useToplistsData(): Ctx {
  const ctx = useContext(ToplistsCtx);
  if (!ctx) {
    throw new Error("useToplistsData() must be used inside <ToplistsProvider>.");
  }
  return ctx;
}
