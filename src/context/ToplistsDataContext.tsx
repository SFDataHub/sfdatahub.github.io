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
  buildPlayerListId,
  getPlayerToplistWithFallback,
  loadToplistServersFromBundle,
  loadToplistsMeta,
  buildPlayerScopeId,
  type PlayerToplistKey,
  type FirestoreToplistPlayerList,
  type FirestoreToplistPlayerRow,
  type ToplistsMeta,
} from "../lib/api/toplistsFirestore";
import { buildServerGroupsFromCodes, type ServerGroupsByRegion } from "../components/Filters/serverGroups";
import { SERVERS } from "../data/servers";

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
};

type CachedPlayerToplist = {
  list: FirestoreToplistPlayerList;
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

// ---- provider --------------------------------------------------------------

export function ToplistsProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFiltersState] = useState<Filters>({
    group: DEFAULT_GROUP,
    servers: [],
    classes: [],
    timeRange: "all",
  });

  const [sort, setSortState] = useState<SortSpec>({
    key: "level",
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
  });

  const playerCacheRef = useRef<Map<string, CachedPlayerToplist>>(new Map());
  const [meta, setMeta] = useState<ToplistsMeta | null>(null);
  const [playerScopeStatus, setPlayerScopeStatus] = useState<PlayerScopeStatus | null>(null);
  const [serverGroups, setServerGroups] = useState<ServerGroupsByRegion>(FALLBACK_SERVER_GROUPS);

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

  // Meta laden (once per mount)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = await loadToplistsMeta();
      if (cancelled) return;
      setMeta(m);
    })().catch((err) => {
      if (cancelled) return;
      console.error("[ToplistsProvider] unexpected meta error", err);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Player-Topliste laden und cachen (nur players, Guilds bleiben Mock)
  useEffect(() => {
    let cancelled = false;
    const backendPlayerSort: PlayerToplistKey["sort"] = "sum";
    const listId = buildPlayerListId({
      group: filters.group,
      timeRange: filters.timeRange,
      sort: backendPlayerSort,
    });

    const cached = playerCacheRef.current.get(listId);
    const ttlMs = cached?.list.ttlSec != null ? cached.list.ttlSec * 1000 : null;
    const isFresh = cached ? ttlMs == null || Date.now() - cached.cachedAt < ttlMs : false;
    if (cached && isFresh) {
      setPlayerState({
        rows: cached.list.rows,
        loading: false,
        error: null,
        lastUpdatedAt: cached.list.updatedAt ?? null,
        nextUpdateAt: cached.list.nextUpdateAt ?? null,
        ttlSec: cached.list.ttlSec ?? null,
        listId,
      });
      return () => {
        cancelled = true;
      };
    }

    setPlayerState((prev) => ({
      ...prev,
      listId,
      loading: true,
      error: null,
    }));

    (async () => {
      const result = await getPlayerToplistWithFallback({
        group: filters.group,
        timeRange: filters.timeRange,
        sort: backendPlayerSort,
      });
      if (cancelled) return;

      if (result.ok) {
        playerCacheRef.current.set(listId, {
          list: result.list,
          cachedAt: Date.now(),
        });
        setPlayerState({
          rows: result.list.rows,
          loading: false,
          error: null,
          lastUpdatedAt: result.list.updatedAt ?? null,
          nextUpdateAt: result.list.nextUpdateAt ?? null,
          ttlSec: result.list.ttlSec ?? null,
          listId,
        });
        return;
      }

      const detail = result.detail ? ` (${result.detail})` : "";
      let errorMsg = "Firestore Fehler";
      if (result.error === "not_found") errorMsg = "Topliste nicht verfuegbar";
      else if (result.error === "decode_error") errorMsg = "Fehler beim Lesen der Daten";

      setPlayerState({
        rows: [],
        loading: false,
        error: `${errorMsg}${detail}`,
        lastUpdatedAt: null,
        nextUpdateAt: null,
        ttlSec: null,
        listId,
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
        listId,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [filters.group, filters.timeRange]);

  // Scope-Status ableiten (Meta + aktuelle Filter)
  useEffect(() => {
    if (!meta) {
      setPlayerScopeStatus(null);
      return;
    }
    const serverKey =
      filters.servers && filters.servers.length === 1 ? filters.servers[0] : "all";
    const scopeId = buildPlayerScopeId(filters.group || "ALL", serverKey || "all");

    const pThresh = meta.thresholds?.players;
    const minChanges =
      typeof pThresh?.minChanges === "number" ? pThresh.minChanges : 100;
    const maxAgeDays =
      typeof pThresh?.maxAgeDays === "number" ? pThresh.maxAgeDays : 7;

    const scopeInfo = meta.scopeChange?.[scopeId];
    const lastRebuildAtMs =
      typeof scopeInfo?.lastRebuildAtMs === "number" ? scopeInfo.lastRebuildAtMs : null;
    const lastChangeAtMs =
      typeof scopeInfo?.lastChangeAtMs === "number" ? scopeInfo.lastChangeAtMs : null;
    const changesSinceLastRebuild =
      typeof scopeInfo?.changedSinceLastRebuild === "number"
        ? scopeInfo.changedSinceLastRebuild
        : 0;

    const lastRebuildAt = lastRebuildAtMs ? new Date(lastRebuildAtMs) : null;
    const lastChangeAt = lastChangeAtMs ? new Date(lastChangeAtMs) : null;
    const ageDays =
      lastRebuildAtMs != null ? (Date.now() - lastRebuildAtMs) / (1000 * 60 * 60 * 24) : Infinity;

    const progress =
      minChanges > 0 ? Math.min(1, Math.max(0, changesSinceLastRebuild / minChanges)) : 0;
    const isFresh =
      !!lastRebuildAt &&
      (maxAgeDays == null || ageDays <= maxAgeDays) &&
      (minChanges == null || changesSinceLastRebuild < minChanges);

    setPlayerScopeStatus({
      scopeId,
      lastRebuildAt,
      lastChangeAt,
      changesSinceLastRebuild,
      minChanges: minChanges ?? null,
      maxAgeDays: maxAgeDays ?? null,
      progress,
      isFresh,
    });
  }, [meta, filters.group, filters.servers]);

  // Context-Value MEMOISIEREN, sonst re-rendert alles unnoetig
  const value = useMemo<Ctx>(
    () => ({
      player: playerState,
      playerRows: playerState.rows,
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
    [playerState, filters, sort, serverGroups, setFilters, setSort, playerScopeStatus]
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
