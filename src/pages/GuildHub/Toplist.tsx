import React from "react";
import { useTranslation } from "react-i18next";
import Frame from "../../components/ContentFrame/Frame";
import ContentShell from "../../components/ContentShell";
import BottomFilterSheet from "../../components/Filters/BottomFilterSheet";
import ServerSheet from "../../components/Filters/ServerSheet";
import HudFilters from "../../components/Filters/HudFilters";
import { FilterProvider, useFilters } from "../../components/Filters/FilterContext";
import ListSwitcher from "../../components/Filters/ListSwitcher";
import ToplistExportController, { type ToplistExportControllerHandle } from "../../components/export/ToplistExportController";
import GuildContextBar from "../../components/guilds/GuildContextBar";
import LocalPlayerProfileOverlay from "../../components/local-player-profile/LocalPlayerProfileOverlay";
import type { LocalPlayerProfileModel } from "../../components/local-player-profile/types";
import { DataHubLoadingState } from "../../components/ui/shared/DataHubLoadingState";
import SectionDividerHeader from "../../components/ui/shared/SectionDividerHeader";
import { useAuth } from "../../context/AuthContext";
import { getSfDataHubLocalScan } from "../../lib/guilds/localScanLibrary";
import { loadOrBuildLocalToplistSnapshots, type LocalToplistLoadResult } from "../../lib/toplists/localToplistService";
import { localToplistDatasetId } from "../../lib/toplists/localToplistStore";
import type { LocalGuildToplistRow, LocalPlayerToplistRow } from "../../lib/toplists/localToplistTypes";
import { compareLocalToplists } from "../../lib/toplists/localToplistComparison";
import {
  LocalToplistViewWorkerCancelledError,
  LocalToplistViewWorkerSession,
} from "../../lib/toplists/localToplistViewWorkerClient";
import type { LocalToplistSearchResult, LocalToplistViewWorkerSuccess, LocalToplistViewTab } from "../../lib/toplists/localToplistViewWorkerTypes";
import {
  LOCAL_TOPLIST_SEARCH_DEBOUNCE_MS,
  LOCAL_TOPLIST_SEARCH_MIN_CHARS,
  LOCAL_TOPLIST_SEARCH_RESULT_LIMIT,
} from "../../lib/toplists/localToplistViewWorkerTypes";
import { ToplistsDataStaticProvider, type ToplistsDataContextValue } from "../../context/ToplistsDataContextCore";
import type { ToplistGuildRow, ToplistPlayerRow } from "../../lib/toplists/toplistContracts";
import GuildToplists, { type GuildToplistsPresetData } from "../Toplists/guildtoplists";
import { TableDataView, type PlayerPresetReadOnlyData } from "../Toplists/playertoplists";
import { resolvePlayerToplistRowIdentifier } from "../Toplists/playerToplistDecor";
import { buildLocalPlayerProfileModel } from "./localPlayerProfileAdapter";
import { useGuildHubSelection } from "./hooks/useGuildHubSelection";
import {
  buildLocalToplistExportModel,
  type LocalToplistExportSnapshot,
} from "./localToplistExportModel";
import {
  nextLocalToplistVisibleBatchSize,
  normalizeLocalToplistSearchIdentifier,
  resolveLocalToplistSearchSelection,
  sameLocalToplistPendingTarget,
  type LocalToplistPendingSearchTarget,
} from "./localToplistSearchFlow";
import {
  buildLocalToplistComparisonSnapshotSet,
  enrichLocalGuildCompareRows,
  enrichLocalPlayerCompareRows,
  latestCompareUpdatedAt,
  resolveLocalToplistCompareEntryPlan,
  type LocalToplistCompareEntryPlan,
} from "./localToplistCompareModel";
import {
  buildToplistServerGroupsFromRegistry,
  buildLocalToplistViewRequestKey,
  defaultSelectedToplistServers,
  equalToplistServerSelection,
  loadLocalToplistArchiveContext,
  normalizeToplistServerSelection,
  resolveActiveGuildToplistServer,
  resolveSelectedToplistEntries,
  resolveToplistServerDefaultSync,
  type LocalToplistArchiveContext,
} from "./localToplistPageModel";
import dashboardStyles from "./Dashboard.module.css";
import "../../styles/Toplist.css";
import styles from "./Toplist.module.css";

type SortDirection = "asc" | "desc";
type SortState = {
  metricKey: string;
  direction: SortDirection;
};
type ValueMode = "base" | "total";

type DataState = {
  result: LocalToplistLoadResult | null;
  datasetId: string;
  loading: boolean;
  error: string | null;
};

type CompareLoadState = {
  key: string;
  previous: LocalToplistLoadResult | null;
  current: LocalToplistLoadResult | null;
  loading: boolean;
  error: string | null;
};

type LocalToplistPendingTarget = LocalToplistPendingSearchTarget;

type LocalToplistFocusTarget = {
  identifier: string;
  nonce: number;
} | null;

const LOCAL_PLAYER_VIEW_LIMIT = 1000;
const LOCAL_PLAYER_RENDER_BATCH_SIZE = 100;
const GUILD_VIEW_PAGE_SIZE = 250;
const MIN_COMPARE_MONTH = "2024-01";
const EMPTY_VIEW_PLAYER_CLASSES: readonly string[] = [];
const EMPTY_VIEW_GUILDS: readonly string[] = [];
const INACTIVE_VIEW_SORT: SortState = { metricKey: "", direction: "desc" };

const formatMonth = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const generateRecentMonths = (count: number, now = new Date()) => {
  const months: string[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    months.push(formatMonth(new Date(now.getFullYear(), now.getMonth() - offset, 1)));
  }
  return months;
};

const normalizeGuildKey = (value: string) => value.trim().toLocaleLowerCase();

const normalizeSearchIdentifier = normalizeLocalToplistSearchIdentifier;

const normalizeSearchText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

const resolveLocalGuildFocusIdentifier = (row: ToplistGuildRow): string | null => {
  const server = String(row.server ?? "").trim().toLowerCase().replace(/\s+/g, "");
  const guildId = String(row.guildId ?? (row as any).guildIdentifier ?? "").trim().toLowerCase();
  if (!server || !guildId) return null;
  return `${server}__${guildId}`;
};

const nextVisibleBatchSize = nextLocalToplistVisibleBatchSize;
const samePendingTarget = sameLocalToplistPendingTarget;

const normalizeCompareMonthPair = (from: string, to: string) => {
  const nextFrom = String(from ?? "").trim();
  const nextTo = String(to ?? "").trim();
  if (nextFrom && nextTo && nextFrom > nextTo) return { from: nextTo, to: nextFrom };
  return { from: nextFrom, to: nextTo };
};

function GuildHubToplistInner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const selection = useGuildHubSelection();
  const {
    filterMode,
    listView,
    bottomFilterOpen,
    setBottomFilterOpen,
    serverSheetOpen,
    setServerSheetOpen,
    servers,
    setServers,
    classes,
    guilds,
    sortBy,
    setSortBy,
    favoritesOnly,
    searchText,
    setSearchText,
  } = useFilters();
  const [tab, setTab] = React.useState<LocalToplistViewTab>("guilds");
  const [filtersCollapsed, setFiltersCollapsed] = React.useState(false);
  const [context, setContext] = React.useState<LocalToplistArchiveContext | null>(null);
  const [contextLoading, setContextLoading] = React.useState(true);
  const [contextError, setContextError] = React.useState<string | null>(null);
  const [guildSort, setGuildSort] = React.useState<SortState>({ metricKey: "guildAvgLevel", direction: "desc" });
  const [playerValueMode, setPlayerValueMode] = React.useState<ValueMode>("base");
  const [guildValueMode, setGuildValueMode] = React.useState<ValueMode>("base");
  const [compareMode, setCompareMode] = React.useState<"off" | "progress" | "months">("off");
  const [progressSinceMonth, setProgressSinceMonth] = React.useState("");
  const [compareFromMonth, setCompareFromMonth] = React.useState("");
  const [compareToMonth, setCompareToMonth] = React.useState("");
  const [dataState, setDataState] = React.useState<DataState>({ result: null, datasetId: "", loading: false, error: null });
  const [compareLoadState, setCompareLoadState] = React.useState<CompareLoadState>({
    key: "compare:off",
    previous: null,
    current: null,
    loading: false,
    error: null,
  });
  const [viewState, setViewState] = React.useState<{ result: LocalToplistViewWorkerSuccess | null; loading: boolean; error: string | null }>({
    result: null,
    loading: false,
    error: null,
  });
  const [visiblePlayerCount, setVisiblePlayerCount] = React.useState(LOCAL_PLAYER_RENDER_BATCH_SIZE);
  const [selectedProfile, setSelectedProfile] = React.useState<LocalPlayerProfileModel | null>(null);
  const [localExportSnapshot, setLocalExportSnapshot] = React.useState<LocalToplistExportSnapshot | null>(null);
  const [localExportingPng, setLocalExportingPng] = React.useState(false);
  const [localSearchLoading, setLocalSearchLoading] = React.useState(false);
  const [localSearchResults, setLocalSearchResults] = React.useState<LocalToplistSearchResult[]>([]);
  const [localSearchError, setLocalSearchError] = React.useState<string | null>(null);
  const [localSearchReadyDatasetId, setLocalSearchReadyDatasetId] = React.useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = React.useState<LocalToplistPendingTarget | null>(null);
  const [pendingNotice, setPendingNotice] = React.useState<string | null>(null);
  const [desktopSearchOpen, setDesktopSearchOpen] = React.useState(false);
  const [playerFocusTarget, setPlayerFocusTarget] = React.useState<LocalToplistFocusTarget>(null);
  const [guildFocusTarget, setGuildFocusTarget] = React.useState<LocalToplistFocusTarget>(null);
  const tableRef = React.useRef<HTMLDivElement>(null);
  const exportControllerRef = React.useRef<ToplistExportControllerHandle | null>(null);
  const workerRef = React.useRef<LocalToplistViewWorkerSession | null>(null);
  const searchWorkerRef = React.useRef<LocalToplistViewWorkerSession | null>(null);
  const manualServerSelectionRef = React.useRef(false);
  const lastActiveGuildDefaultKeyRef = React.useRef<string | null>(null);
  const selectedServersRef = React.useRef<string[]>([]);
  const latestDataRunKeyRef = React.useRef("");
  const latestViewRequestKeyRef = React.useRef("");
  const latestCompareRunKeyRef = React.useRef("compare:off");
  const localSearchNonceRef = React.useRef(1);

  React.useEffect(() => {
    const worker = new LocalToplistViewWorkerSession();
    workerRef.current = worker;
    const searchWorker = new LocalToplistViewWorkerSession();
    searchWorkerRef.current = searchWorker;
    return () => {
      worker.dispose();
      searchWorker.dispose();
      workerRef.current = null;
      searchWorkerRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    setContextLoading(true);
    setContextError(null);
    loadLocalToplistArchiveContext({ signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) return;
        setContext(next);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setContextError(error instanceof Error ? error.message : String(error ?? "unknown_error"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setContextLoading(false);
      });
    return () => controller.abort();
  }, []);

  const availableServerGroups = React.useMemo(
    () => buildToplistServerGroupsFromRegistry(),
    [],
  );
  const availableServerSet = React.useMemo(
    () => new Set(context?.serverOptions.map((option) => option.server) ?? []),
    [context],
  );
  const activeGuildServer = React.useMemo(
    () => resolveActiveGuildToplistServer(selection.activeGuild?.server),
    [selection.activeGuild?.server],
  );
  const selectedServers = servers ?? [];
  const selectedClasses = classes ?? [];
  React.useEffect(() => {
    selectedServersRef.current = selectedServers;
  }, [selectedServers]);
  const playerSort: SortState = React.useMemo(
    () => ({ metricKey: sortBy || "sum", direction: "desc" }),
    [sortBy],
  );
  const monthOptions = React.useMemo(
    () => Array.from(new Set([formatMonth(new Date()), ...generateRecentMonths(17)])).filter((month) => month >= MIN_COMPARE_MONTH),
    [],
  );
  const guildOptions = React.useMemo(() => {
    const rows = dataState.result?.playerRows ?? [];
    const map = new Map<string, { value: string; label: string }>();
    rows.forEach((row) => {
      const name = String(row.guild ?? "").trim();
      if (!name) return;
      const key = normalizeGuildKey(name);
      const label = row.server ? `${name} (${row.server})` : name;
      if (!map.has(key)) map.set(key, { value: name, label });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [dataState.result?.playerRows]);
  const resolveDefaultCompareMonths = React.useCallback(() => {
    const latest = monthOptions[0] ?? "";
    if (!latest) return { from: "", to: "" };
    const previous = monthOptions[1] ?? latest;
    return normalizeCompareMonthPair(previous, latest);
  }, [monthOptions]);
  const isValidCompareMonth = React.useCallback((value: string) => monthOptions.includes(String(value ?? "").trim()), [monthOptions]);
  const handleCompareModeChange = React.useCallback((nextMode: "off" | "progress" | "months") => {
    setCompareMode(nextMode);
    if (nextMode === "off") {
      setProgressSinceMonth("");
      setCompareFromMonth("");
      setCompareToMonth("");
      return;
    }
    if (nextMode === "progress") {
      setCompareFromMonth("");
      setCompareToMonth("");
      return;
    }
    setProgressSinceMonth("");
    const fallback = resolveDefaultCompareMonths();
    const normalized = normalizeCompareMonthPair(
      isValidCompareMonth(compareFromMonth) ? compareFromMonth : fallback.from,
      isValidCompareMonth(compareToMonth) ? compareToMonth : fallback.to,
    );
    setCompareFromMonth(normalized.from);
    setCompareToMonth(normalized.to);
  }, [compareFromMonth, compareToMonth, isValidCompareMonth, resolveDefaultCompareMonths]);
  const handleProgressSinceMonthChange = React.useCallback((value: string) => {
    const nextValue = String(value ?? "").trim();
    setProgressSinceMonth(nextValue);
    if (!nextValue) setCompareMode("off");
  }, []);
  const handleCompareFromMonthChange = React.useCallback((value: string) => {
    const normalized = normalizeCompareMonthPair(value, compareToMonth);
    setCompareFromMonth(normalized.from);
    setCompareToMonth(normalized.to);
  }, [compareToMonth]);
  const handleCompareToMonthChange = React.useCallback((value: string) => {
    const normalized = normalizeCompareMonthPair(compareFromMonth, value);
    setCompareFromMonth(normalized.from);
    setCompareToMonth(normalized.to);
  }, [compareFromMonth]);

  React.useEffect(() => {
    if (!context || selection.isLoading) return;
    const activeDefaultKey = [
      selection.activeGuildId ?? "",
      selection.activeGuild?.guildId ?? "",
      activeGuildServer ?? "",
    ].join("|");
    const decision = resolveToplistServerDefaultSync({
      activeDefaultKey,
      previousDefaultKey: lastActiveGuildDefaultKeyRef.current,
      activeGuildServer,
      defaultServers: defaultSelectedToplistServers(context.serverOptions),
      currentServers: selectedServersRef.current,
    });
    if (decision.nextDefaultKey === lastActiveGuildDefaultKeyRef.current) return;
    lastActiveGuildDefaultKeyRef.current = decision.nextDefaultKey;
    manualServerSelectionRef.current = false;
    if (decision.nextServers) {
      setServers(decision.nextServers);
    }
  }, [activeGuildServer, context, selection.activeGuild?.guildId, selection.activeGuildId, selection.isLoading, setServers]);

  const entryResolution = React.useMemo(
    () => resolveSelectedToplistEntries(context?.entries ?? [], selectedServers),
    [context?.entries, selectedServers],
  );
  const entriesForData = entryResolution.resolvedEntries;
  const dataRunKey = React.useMemo(
    () => localToplistDatasetId(entriesForData),
    [entriesForData],
  );
  const comparePlan = React.useMemo<LocalToplistCompareEntryPlan>(
    () => resolveLocalToplistCompareEntryPlan({
      mode: compareMode,
      selectedServers,
      progressSinceMonth,
      compareFromMonth,
      compareToMonth,
      manifests: context?.manifests ?? [],
      manifestUrlsByYear: context?.manifestUrlsByYear ?? {},
    }),
    [compareFromMonth, compareMode, compareToMonth, context?.manifestUrlsByYear, context?.manifests, progressSinceMonth, selectedServers],
  );

  React.useEffect(() => {
    if (!context || contextLoading) return;
    const controller = new AbortController();
    const datasetId = dataRunKey;
    latestDataRunKeyRef.current = datasetId;
    if (!entriesForData.length) {
      controller.abort();
      setDataState((state) => (
        !state.result && state.datasetId === datasetId && !state.loading && !state.error
          ? state
          : { result: null, datasetId, loading: false, error: null }
      ));
      latestViewRequestKeyRef.current = "";
      setViewState((state) => (
        !state.result && !state.loading && !state.error
          ? state
          : { result: null, loading: false, error: null }
      ));
      return undefined;
    }
    setDataState((state) => (
      !state.result && state.datasetId === datasetId && state.loading && !state.error
        ? state
        : { result: null, datasetId, loading: true, error: null }
    ));
    loadOrBuildLocalToplistSnapshots(entriesForData, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted || latestDataRunKeyRef.current !== datasetId) return;
        setDataState({ result, datasetId, loading: false, error: null });
      })
      .catch((error) => {
        if (controller.signal.aborted || latestDataRunKeyRef.current !== datasetId) return;
        setDataState({ result: null, datasetId, loading: false, error: error instanceof Error ? error.message : String(error ?? "unknown_error") });
      });
    return () => controller.abort();
  }, [context, contextLoading, dataRunKey, entriesForData]);

  React.useEffect(() => {
    const plan = comparePlan;
    const controller = new AbortController();
    latestCompareRunKeyRef.current = plan.loadKey;

    if (!plan.active || plan.status === "unavailable") {
      controller.abort();
      setCompareLoadState((state) => (
        state.key === plan.loadKey && !state.previous && !state.current && !state.loading && !state.error
          ? state
          : { key: plan.loadKey, previous: null, current: null, loading: false, error: null }
      ));
      return undefined;
    }

    setCompareLoadState((state) => (
      state.key === plan.loadKey && state.loading && !state.error
        ? state
        : { key: plan.loadKey, previous: null, current: null, loading: true, error: null }
    ));

    const reusableCurrentResult = plan.currentDatasetId === dataState.datasetId ? dataState.result : null;
    const loadPrevious = loadOrBuildLocalToplistSnapshots(plan.previousEntries, { signal: controller.signal });
    const loadCurrent = reusableCurrentResult
      ? Promise.resolve(reusableCurrentResult)
      : loadOrBuildLocalToplistSnapshots(plan.currentEntries, { signal: controller.signal });

    Promise.all([loadPrevious, loadCurrent])
      .then(([previous, current]) => {
        if (controller.signal.aborted || latestCompareRunKeyRef.current !== plan.loadKey) return;
        setCompareLoadState({ key: plan.loadKey, previous, current, loading: false, error: null });
      })
      .catch((error) => {
        if (controller.signal.aborted || latestCompareRunKeyRef.current !== plan.loadKey) return;
        setCompareLoadState({
          key: plan.loadKey,
          previous: null,
          current: null,
          loading: false,
          error: error instanceof Error ? error.message : String(error ?? "unknown_error"),
        });
      });

    return () => controller.abort();
  }, [comparePlan, comparePlan.currentDatasetId === dataState.datasetId ? dataState.result : null]);

  const activeViewPlayerClasses = tab === "players" ? selectedClasses : EMPTY_VIEW_PLAYER_CLASSES;
  const activeViewGuilds = tab === "players" ? guilds : EMPTY_VIEW_GUILDS;
  const activeViewPlayerSort = tab === "players" ? playerSort : INACTIVE_VIEW_SORT;
  const activeViewGuildSort = tab === "guilds" ? guildSort : INACTIVE_VIEW_SORT;
  const activeViewPlayerValueMode = tab === "players" ? playerValueMode : "base";
  const activeViewGuildValueMode = tab === "guilds" ? guildValueMode : "base";
  const activeViewRequest = React.useMemo(() => {
    const result = dataState.result;
    if (!result) return null;
    const request = {
      datasetId: dataState.datasetId,
      tab,
      filters: {
        servers: selectedServers,
        playerClasses: activeViewPlayerClasses,
        guilds: activeViewGuilds,
      },
      sort: tab === "players" ? activeViewPlayerSort : activeViewGuildSort,
      playerAverageMode: activeViewPlayerValueMode,
      guildAverageMode: activeViewGuildValueMode,
      page: 1,
      pageSize: tab === "players" ? LOCAL_PLAYER_VIEW_LIMIT : GUILD_VIEW_PAGE_SIZE,
    };
    return {
      request,
      key: buildLocalToplistViewRequestKey({
        datasetId: dataState.datasetId,
        tab,
        servers: selectedServers,
        playerClasses: activeViewPlayerClasses,
        guilds: activeViewGuilds,
        playerSort: activeViewPlayerSort,
        guildSort: activeViewGuildSort,
        playerValueMode: activeViewPlayerValueMode,
        guildValueMode: activeViewGuildValueMode,
      }),
      playerRows: result.playerRows,
      guildRows: result.guildRows,
    };
  }, [
    activeViewGuildSort,
    activeViewGuildValueMode,
    activeViewGuilds,
    activeViewPlayerClasses,
    activeViewPlayerSort,
    activeViewPlayerValueMode,
    dataState.datasetId,
    dataState.result,
    selectedServers,
    tab,
  ]);

  React.useEffect(() => {
    const worker = workerRef.current;
    const viewRequest = activeViewRequest;
    if (!worker || !viewRequest) {
      latestViewRequestKeyRef.current = "";
      setViewState((state) => state.result || state.loading || state.error ? { result: null, loading: false, error: null } : state);
      return undefined;
    }
    let cancelled = false;
    latestViewRequestKeyRef.current = viewRequest.key;
    worker.setData(viewRequest.request.datasetId, viewRequest.playerRows, viewRequest.guildRows)
      .then(() => {
        if (cancelled) throw new LocalToplistViewWorkerCancelledError();
        return worker.requestView(viewRequest.request);
      })
      .then((next) => {
        if (!cancelled && latestViewRequestKeyRef.current === viewRequest.key) {
          setViewState({ result: next, loading: false, error: null });
        }
      })
      .catch((error) => {
        if (error instanceof LocalToplistViewWorkerCancelledError || cancelled || latestViewRequestKeyRef.current !== viewRequest.key) return;
        setViewState({ result: null, loading: false, error: error instanceof Error ? error.message : String(error ?? "unknown_error") });
      });
    setViewState((state) => (
      !state.result && state.loading && !state.error
        ? state
        : { result: null, loading: true, error: null }
    ));
    return () => {
      cancelled = true;
    };
  }, [activeViewRequest]);

  const staticToplistsValue = React.useMemo<ToplistsDataContextValue>(() => ({
    player: { rows: [], loading: false, error: null, lastUpdatedAt: null, nextUpdateAt: null, ttlSec: null, listId: null, rowLimit: null },
    playerRows: [],
    playerLoading: false,
    playerError: null,
    playerLastUpdatedAt: null,
    playerNextUpdateAt: null,
    playerScopeStatus: null,
    serverGroups: availableServerGroups,
    filters: { group: "LOCAL", servers: selectedServers, classes: selectedClasses, timeRange: "all" },
    sort: { key: tab === "players" ? playerSort.metricKey : guildSort.metricKey, dir: tab === "players" ? playerSort.direction : guildSort.direction },
    getGuildToplistSnapshotCached: async () => ({ ok: false, error: "not_found" as const }),
    setFilters: () => undefined,
    setSort: () => undefined,
  }), [availableServerGroups, guildSort, playerSort, selectedClasses, selectedServers, tab]);

  const comparisonResult = React.useMemo(() => {
    if (
      !comparePlan.active ||
      comparePlan.status === "unavailable" ||
      compareLoadState.key !== comparePlan.loadKey ||
      !compareLoadState.previous ||
      !compareLoadState.current ||
      compareLoadState.loading ||
      compareLoadState.error
    ) {
      return null;
    }
    return compareLocalToplists(
      buildLocalToplistComparisonSnapshotSet(comparePlan.previousMonth, compareLoadState.previous),
      buildLocalToplistComparisonSnapshotSet(comparePlan.currentMonth, compareLoadState.current),
      {
        filters: { servers: comparePlan.commonServers, playerClasses: selectedClasses },
        playerSort,
        guildSort,
        playerAverageMode: playerValueMode,
        guildAverageMode: guildValueMode,
      },
    );
  }, [
    compareLoadState.current,
    compareLoadState.error,
    compareLoadState.key,
    compareLoadState.loading,
    compareLoadState.previous,
    comparePlan,
    guildSort,
    guildValueMode,
    playerSort,
    playerValueMode,
    selectedClasses,
  ]);
  const compareExpected = comparePlan.active;
  const compareError = compareLoadState.error
    ?? (comparisonResult?.issues.find((issue) => issue.severity === "error")?.message ?? null);
  const showLocalCompare = Boolean(compareExpected && !compareLoadState.loading && !compareError && comparisonResult && comparisonResult.status !== "empty");
  const compareUpdatedAt = React.useMemo(() => {
    if (!compareLoadState.current) return null;
    return latestCompareUpdatedAt(compareLoadState.current.snapshots);
  }, [compareLoadState.current]);

  const playerViewKey = React.useMemo(() => JSON.stringify({
    datasetId: dataState.datasetId,
    compareLoadKey: showLocalCompare ? comparePlan.loadKey : "",
    servers: selectedServers,
    classes: selectedClasses,
    sort: playerSort,
    playerValueMode,
  }), [comparePlan.loadKey, dataState.datasetId, playerSort, playerValueMode, selectedClasses, selectedServers, showLocalCompare]);
  const visiblePlayerViewKeyRef = React.useRef("");
  React.useEffect(() => {
    if (visiblePlayerViewKeyRef.current === playerViewKey) return;
    visiblePlayerViewKeyRef.current = playerViewKey;
    setVisiblePlayerCount(LOCAL_PLAYER_RENDER_BATCH_SIZE);
  }, [playerViewKey]);

  const normalFullPlayerRows = React.useMemo(
    () => viewState.result?.tab === "players" ? viewState.result.playerRows.map(toPublicPlayerRow) : [],
    [viewState.result],
  );
  const compareFullPlayerRows = React.useMemo(
    () => {
      if (!showLocalCompare || !comparisonResult) return [];
      const rows = comparisonResult.currentPlayerView.rows.map(toPublicPlayerRow);
      return enrichLocalPlayerCompareRows({
        rows,
        comparisonRows: comparisonResult.players,
        playerAvgMode: playerValueMode,
      });
    },
    [comparisonResult, playerValueMode, showLocalCompare],
  );
  const fullPlayerRows = showLocalCompare ? compareFullPlayerRows : normalFullPlayerRows;
  const visiblePlayerRows = React.useMemo(
    () => fullPlayerRows.slice(0, Math.min(visiblePlayerCount, LOCAL_PLAYER_VIEW_LIMIT, fullPlayerRows.length)),
    [fullPlayerRows, visiblePlayerCount],
  );
  const hasMoreVisiblePlayerRows = visiblePlayerRows.length < Math.min(fullPlayerRows.length, LOCAL_PLAYER_VIEW_LIMIT);
  const handleReadOnlyRowsEndVisible = React.useCallback(() => {
    setVisiblePlayerCount((current) => {
      const maxRows = Math.min(fullPlayerRows.length, LOCAL_PLAYER_VIEW_LIMIT);
      const next = Math.min(current + LOCAL_PLAYER_RENDER_BATCH_SIZE, maxRows);
      return next === current ? current : next;
    });
  }, [fullPlayerRows.length]);

  const playerUpdatedAt = React.useMemo(
    () => latestUpdatedAt(dataState.result?.playerRows),
    [dataState.result?.playerRows],
  );
  const guildUpdatedAt = React.useMemo(
    () => latestUpdatedAt(dataState.result?.guildRows),
    [dataState.result?.guildRows],
  );

  const playerReadOnlyData = React.useMemo<PlayerPresetReadOnlyData>(() => ({
    rows: visiblePlayerRows,
    allRows: fullPlayerRows,
    tableLoading: showLocalCompare ? false : viewState.loading,
    compareLoading: compareExpected ? compareLoadState.loading : false,
    compareExpected,
    showCompare: showLocalCompare,
    compareError,
    playerError: viewState.error,
    playerLastUpdatedAt: showLocalCompare ? compareUpdatedAt : playerUpdatedAt,
    playerScopeStatus: null,
    playerAvgMode: playerValueMode,
  }), [
    compareError,
    compareExpected,
    compareLoadState.loading,
    compareUpdatedAt,
    fullPlayerRows,
    playerUpdatedAt,
    playerValueMode,
    showLocalCompare,
    viewState.error,
    viewState.loading,
    visiblePlayerRows,
  ]);

  const normalGuildRows = React.useMemo(
    () => viewState.result?.tab === "guilds" ? viewState.result.guildRows.map(toPublicGuildRow) : [],
    [viewState.result],
  );
  const compareGuildRows = React.useMemo(
    () => {
      if (!showLocalCompare || !comparisonResult) return [];
      const rows = comparisonResult.currentGuildView.rows.map(toPublicGuildRow);
      return enrichLocalGuildCompareRows({ rows, comparisonRows: comparisonResult.guilds });
    },
    [comparisonResult, showLocalCompare],
  );
  const guildRowsForDisplay = showLocalCompare ? compareGuildRows : normalGuildRows;
  const favoritePlayerSet = React.useMemo(() => {
    const keys = Object.keys(user?.favorites?.players ?? {});
    return new Set(keys.map(normalizeSearchIdentifier).filter(Boolean));
  }, [user?.favorites?.players]);
  const favoriteGuildSet = React.useMemo(() => {
    const keys = Object.keys(user?.favorites?.guilds ?? {});
    return new Set(keys.map(normalizeSearchIdentifier).filter(Boolean));
  }, [user?.favorites?.guilds]);
  const sourcePlayerByIdentifier = React.useMemo(() => {
    const map = new Map<string, LocalPlayerToplistRow>();
    (dataState.result?.playerRows ?? []).forEach((row) => {
      const identifier = normalizeSearchIdentifier(row.identifier);
      if (identifier && !map.has(identifier)) map.set(identifier, row);
    });
    return map;
  }, [dataState.result?.playerRows]);
  const sourceGuildByIdentifier = React.useMemo(() => {
    const map = new Map<string, LocalGuildToplistRow>();
    (dataState.result?.guildRows ?? []).forEach((row) => {
      const identifier = resolveLocalGuildFocusIdentifier(toPublicGuildRow(row));
      if (identifier && !map.has(identifier)) map.set(identifier, row);
    });
    return map;
  }, [dataState.result?.guildRows]);
  const fullPlayerIndexByIdentifier = React.useMemo(() => {
    const map = new Map<string, number>();
    fullPlayerRows.forEach((row, index) => {
      const identifier = resolvePlayerToplistRowIdentifier(row);
      if (identifier && !map.has(normalizeSearchIdentifier(identifier))) map.set(normalizeSearchIdentifier(identifier), index);
    });
    return map;
  }, [fullPlayerRows]);
  const visiblePlayerIdentifierSet = React.useMemo(() => {
    const set = new Set<string>();
    visiblePlayerRows.forEach((row) => {
      const identifier = resolvePlayerToplistRowIdentifier(row);
      if (identifier) set.add(normalizeSearchIdentifier(identifier));
    });
    return set;
  }, [visiblePlayerRows]);
  const guildIndexByIdentifier = React.useMemo(() => {
    const map = new Map<string, number>();
    guildRowsForDisplay.forEach((row, index) => {
      const identifier = resolveLocalGuildFocusIdentifier(row);
      if (identifier && !map.has(identifier)) map.set(identifier, index);
    });
    return map;
  }, [guildRowsForDisplay]);

  const guildReadOnlyData = React.useMemo<GuildToplistsPresetData>(() => ({
    rows: guildRowsForDisplay,
    loading: showLocalCompare ? false : viewState.loading,
    error: compareError ?? viewState.error,
    updatedAt: showLocalCompare ? compareUpdatedAt : guildUpdatedAt,
    avgMode: guildValueMode,
    compareLoading: compareExpected ? compareLoadState.loading : false,
    compareExpected,
    showCompare: showLocalCompare,
    compareError,
  }), [
    compareError,
    compareExpected,
    compareLoadState.loading,
    compareUpdatedAt,
    guildRowsForDisplay,
    guildUpdatedAt,
    guildValueMode,
    showLocalCompare,
    viewState.error,
    viewState.loading,
  ]);

 const localExportModel = React.useMemo(() => buildLocalToplistExportModel({
    tab,
    selectedServers,
    selectedClasses,
    listView,
    contextLoading,
    dataLoading: dataState.loading,
    viewLoading: viewState.loading || (compareExpected && compareLoadState.loading),
    contextError,
    dataError: dataState.error,
    viewError: compareExpected ? (compareError ?? viewState.error) : viewState.error,
    hasCurrentEntries: Boolean(context?.entries.length),
    isFullyUnavailable: entryResolution.availabilityState === "unavailable",
    isExporting: localExportingPng,
    playerRows: fullPlayerRows,
    visiblePlayerRows,
    guildRows: guildReadOnlyData.rows,
    playerSort,
    guildSort,
    playerValueMode,
    guildValueMode,
    playerUpdatedAt,
    guildUpdatedAt: showLocalCompare ? compareUpdatedAt : guildUpdatedAt,
    playerError: compareExpected ? (compareError ?? viewState.error) : viewState.error,
    guildError: compareExpected ? (compareError ?? viewState.error) : viewState.error,
    playerCompareLoading: compareExpected ? compareLoadState.loading : false,
    playerCompareExpected: compareExpected,
    playerShowCompare: showLocalCompare,
    playerCompareError: compareError,
    guildCompareLoading: compareExpected ? compareLoadState.loading : false,
    guildCompareExpected: compareExpected,
    guildShowCompare: showLocalCompare,
    guildCompareError: compareError,
  }), [
    compareError,
    compareExpected,
    compareLoadState.loading,
    compareUpdatedAt,
    context?.entries.length,
    contextError,
    contextLoading,
    dataState.error,
    dataState.loading,
    entryResolution.availabilityState,
    fullPlayerRows,
    guildReadOnlyData.rows,
    guildSort,
    guildUpdatedAt,
    guildValueMode,
    listView,
    localExportingPng,
    playerSort,
    playerUpdatedAt,
    playerValueMode,
    selectedClasses,
    selectedServers,
    tab,
    viewState.error,
    viewState.loading,
    visiblePlayerRows,
  ]);

  const handleLocalExportPng = React.useCallback(() => {
    if (!localExportModel.canExport) return;
    setLocalExportSnapshot(localExportModel.snapshot);
    exportControllerRef.current?.open();
  }, [localExportModel]);

  const handlePlayerValueModeChange = React.useCallback((nextMode: ValueMode) => {
    setPlayerValueMode((current) => (current === nextMode ? current : nextMode));
  }, []);

  const handleGuildValueModeChange = React.useCallback((nextMode: ValueMode) => {
    setGuildValueMode((current) => (current === nextMode ? current : nextMode));
  }, []);

  const phase = contextLoading
    ? t("guildHub.toplist.loading.archive", "Loading archive metadata")
    : dataState.loading
        ? t("guildHub.toplist.loading.scans", "Loading selected scans")
        : viewState.loading
          ? t("guildHub.toplist.loading.table", "Preparing table")
          : null;

  const selectServers = React.useCallback((next: string[] | ((prev: string[]) => string[])) => {
    manualServerSelectionRef.current = true;
    const current = selectedServersRef.current;
    const nextServers = normalizeToplistServerSelection(typeof next === "function" ? next(current) : next);
    if (!equalToplistServerSelection(current, nextServers)) {
      setServers(nextServers);
    }
  }, [setServers]);

  const jumpableGuildIdentifiers = React.useMemo(
    () => [...guildIndexByIdentifier.keys()],
    [guildIndexByIdentifier],
  );
  const localSearchSource = React.useMemo(() => {
    if (showLocalCompare && compareLoadState.current) {
      return {
        datasetId: `compare-current:${comparePlan.loadKey}`,
        playerRows: compareLoadState.current.playerRows,
        guildRows: compareLoadState.current.guildRows,
      };
    }
    if (!dataState.result) return null;
    return {
      datasetId: dataState.datasetId,
      playerRows: dataState.result.playerRows,
      guildRows: dataState.result.guildRows,
    };
  }, [
    compareLoadState.current,
    comparePlan.loadKey,
    dataState.datasetId,
    dataState.result,
    showLocalCompare,
  ]);
  const selectedServerSet = React.useMemo(
    () => new Set(normalizeToplistServerSelection(selectedServers)),
    [selectedServers],
  );
  const unavailableServerSet = React.useMemo(
    () => new Set(normalizeToplistServerSelection(entryResolution.unavailableServerCodes)),
    [entryResolution.unavailableServerCodes],
  );
  const selectedGuildSet = React.useMemo(() => {
    const keys = guilds.map(normalizeGuildKey).filter(Boolean);
    return keys.length ? new Set(keys) : null;
  }, [guilds]);

  const explainPendingBlockers = React.useCallback((target: LocalToplistPendingTarget, blockers: readonly string[]) => {
    if (!blockers.length) return null;
    const targetLabel = target.kind === "player"
      ? t("guildHub.toplist.search.playerTarget", "Player {{name}}", { name: target.label })
      : t("guildHub.toplist.search.guildTarget", "Guild {{name}}", { name: target.label });
    return t(
      "guildHub.toplist.search.blocked",
      "{{target}} is locally available, but currently hidden or not jumpable: {{blockers}}. Adjust the filters manually to continue.",
      { target: targetLabel, blockers: blockers.join(", ") },
    );
  }, [t]);

  const handleLocalSearchResultSelect = React.useCallback((result: LocalToplistSearchResult) => {
    const canonicalServer = normalizeToplistServerSelection([result.server])[0] ?? result.server;
    const action = resolveLocalToplistSearchSelection(tab, result, canonicalServer, localSearchNonceRef.current++);

    if (action.action === "select-server") {
      selectServers([action.server]);
      setPendingNotice(null);
      setBottomFilterOpen(false);
      return;
    }

    const target = action.target;
    setPendingTarget((current) => {
      if (samePendingTarget(current, target)) return current;
      return target;
    });
    if (action.action === "focus-player" && action.nextTab) setTab(action.nextTab);
    if (action.action === "focus-guild" && action.nextTab) setTab(action.nextTab);
    setBottomFilterOpen(false);
  }, [
    selectServers,
    setBottomFilterOpen,
    tab,
  ]);

  const desktopSearchQuery = searchText.trim();
  const showDesktopSearchPanel = desktopSearchOpen && desktopSearchQuery.length >= LOCAL_TOPLIST_SEARCH_MIN_CHARS;
  const groupedLocalSearchResults = React.useMemo(() => ({
    player: localSearchResults.filter((result) => result.kind === "player"),
    guild: localSearchResults.filter((result) => result.kind === "guild"),
    server: localSearchResults.filter((result) => result.kind === "server"),
  }), [localSearchResults]);
  const handleDesktopSearchResultSelect = React.useCallback((result: LocalToplistSearchResult) => {
    setDesktopSearchOpen(false);
    handleLocalSearchResultSelect(result);
  }, [handleLocalSearchResultSelect]);
  const renderDesktopLocalSearchGroup = React.useCallback((
    kind: LocalToplistSearchResult["kind"],
    label: string,
  ) => {
    const results = groupedLocalSearchResults[kind];
    if (!results.length) return null;
    return (
      <div className={styles.desktopSearchGroup}>
        <div className={styles.desktopSearchGroupTitle}>{label}</div>
        {results.map((result) => {
          const disabled = result.status !== "jumpable";
          const detailParts = [
            result.server,
            result.kind === "player" ? result.className : null,
            result.kind === "player" ? result.guildName : null,
            disabled ? result.statusReason : null,
          ].filter(Boolean);
          return (
            <button
              key={`${result.kind}:${result.server}:${result.id}`}
              type="button"
              disabled={disabled}
              className={styles.desktopSearchResult}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (disabled) return;
                handleDesktopSearchResultSelect(result);
              }}
            >
              <span className={styles.desktopSearchResultLabel}>{result.label}</span>
              <span className={styles.desktopSearchResultMeta}>{detailParts.join(" · ")}</span>
            </button>
          );
        })}
      </div>
    );
  }, [groupedLocalSearchResults, handleDesktopSearchResultSelect]);
  const desktopLocalSearchSlot = (
    <div className={styles.desktopSearch}>
      <label htmlFor="guild-hub-local-toplist-search" className="sr-only">
        {t("toplists.search.label", "Search")}
      </label>
      <input
        id="guild-hub-local-toplist-search"
        name="guild-hub-local-toplist-search"
        type="search"
        className={styles.desktopSearchInput}
        placeholder={t("guildHub.toplist.search.placeholder", "Search players, guilds or servers…")}
        value={searchText}
        onFocus={() => setDesktopSearchOpen(true)}
        onChange={(event) => {
          setDesktopSearchOpen(true);
          setSearchText(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setDesktopSearchOpen(false);
        }}
        aria-label={t("toplists.search.label", "Search")}
        aria-expanded={showDesktopSearchPanel}
        aria-controls="guild-hub-local-toplist-search-results"
        autoComplete="off"
      />
      {showDesktopSearchPanel ? (
        <div id="guild-hub-local-toplist-search-results" className={styles.desktopSearchPanel} aria-live="polite">
          {localSearchLoading ? (
            <div className={styles.desktopSearchStatus}>{t("toplists.status.loading", "Loading...")}</div>
          ) : localSearchResults.length ? (
            <>
              {renderDesktopLocalSearchGroup("player", t("toplists.search.players", "Players"))}
              {renderDesktopLocalSearchGroup("guild", t("toplists.search.guilds", "Guilds"))}
              {renderDesktopLocalSearchGroup("server", t("toplists.search.servers", "Servers"))}
            </>
          ) : (
            <div className={styles.desktopSearchStatus}>
              {localSearchError ?? t("toplists.search.empty", "No local results.")}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );

  React.useEffect(() => {
    const target = pendingTarget;
    if (!target) return;

    if (target.kind === "player" && tab !== "players") return;
    if (target.kind === "guild" && tab !== "guilds") return;

    const blockers: string[] = [];
    if (dataState.loading || viewState.loading || !dataState.result) {
      blockers.push(t("guildHub.toplist.search.blocker.dataset", "dataset is still loading"));
    }
    if (!selectedServerSet.has(target.server)) {
      blockers.push(t("guildHub.toplist.search.blocker.server", "server is not selected"));
    }
    if (unavailableServerSet.has(target.server)) {
      blockers.push(t("guildHub.toplist.search.blocker.unavailable", "server has no local toplist snapshot"));
    }

    if (target.kind === "player") {
      const sourceRow = sourcePlayerByIdentifier.get(target.identifier);
      if (!sourceRow && dataState.result && !dataState.loading) {
        setPendingNotice(t("guildHub.toplist.search.missing", "{{name}} is not available in the current local dataset.", { name: target.label }));
        setPendingTarget(null);
        return;
      }

      if (sourceRow) {
        const classSet = selectedClasses.map((value) => String(value ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-")).filter(Boolean);
        const rowClass = String(sourceRow.class ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
        if (classSet.length && (!rowClass || !classSet.includes(rowClass))) {
          blockers.push(t("guildHub.toplist.search.blocker.class", "class filter"));
        }
        const rowGuild = normalizeGuildKey(String(sourceRow.guild ?? ""));
        if (selectedGuildSet && (!rowGuild || !selectedGuildSet.has(rowGuild))) {
          blockers.push(t("guildHub.toplist.search.blocker.guild", "guild filter"));
        }
        if (favoritesOnly && user && !favoritePlayerSet.has(target.identifier)) {
          blockers.push(t("guildHub.toplist.search.blocker.favorites", "favorites only"));
        }
      }

      const targetIndex = fullPlayerIndexByIdentifier.get(target.identifier);
      if (targetIndex == null && sourceRow) {
        blockers.push(showLocalCompare
          ? t("guildHub.toplist.search.blocker.compare", "not on the current compare target side")
          : t("guildHub.toplist.search.blocker.top1000", "outside current Top 1000/toplist scope"));
      }

      if (blockers.length) {
        setPendingNotice(explainPendingBlockers(target, blockers));
        return;
      }
      if (targetIndex == null) return;

      const requiredVisibleCount = nextVisibleBatchSize(targetIndex);
      if (visiblePlayerCount < requiredVisibleCount) {
        setVisiblePlayerCount(requiredVisibleCount);
        setPendingNotice(null);
        return;
      }
      if (!visiblePlayerIdentifierSet.has(target.identifier)) return;

      setPlayerFocusTarget({ identifier: target.identifier, nonce: target.nonce });
      setPendingNotice(null);
      setPendingTarget(null);
      return;
    }

    const sourceGuild = sourceGuildByIdentifier.get(target.identifier);
    if (!sourceGuild && dataState.result && !dataState.loading) {
      setPendingNotice(t("guildHub.toplist.search.missing", "{{name}} is not available in the current local dataset.", { name: target.label }));
      setPendingTarget(null);
      return;
    }

    const favoriteCandidate = target.identifier.replace("__", "_g");
    if (
      sourceGuild &&
      favoritesOnly &&
      user &&
      !favoriteGuildSet.has(target.identifier) &&
      !favoriteGuildSet.has(favoriteCandidate)
    ) {
      blockers.push(t("guildHub.toplist.search.blocker.favorites", "favorites only"));
    }
    if (!guildIndexByIdentifier.has(target.identifier) && sourceGuild) {
      blockers.push(showLocalCompare
        ? t("guildHub.toplist.search.blocker.compare", "not on the current compare target side")
        : t("guildHub.toplist.search.blocker.guildView", "active guild view filter"));
    }

    if (blockers.length) {
      setPendingNotice(explainPendingBlockers(target, blockers));
      return;
    }
    if (!guildIndexByIdentifier.has(target.identifier)) return;

    setGuildFocusTarget({ identifier: target.identifier, nonce: target.nonce });
    setPendingNotice(null);
    setPendingTarget(null);
  }, [
    dataState.loading,
    dataState.result,
    explainPendingBlockers,
    favoriteGuildSet,
    favoritePlayerSet,
    favoritesOnly,
    fullPlayerIndexByIdentifier,
    guildIndexByIdentifier,
    pendingTarget,
    selectedClasses,
    selectedGuildSet,
    selectedServerSet,
    showLocalCompare,
    sourceGuildByIdentifier,
    sourcePlayerByIdentifier,
    t,
    tab,
    unavailableServerSet,
    user,
    viewState.loading,
    visiblePlayerCount,
    visiblePlayerIdentifierSet,
  ]);

  React.useEffect(() => {
    const worker = searchWorkerRef.current;
    const source = localSearchSource;
    if (!worker || !source) {
      setLocalSearchReadyDatasetId(null);
      return undefined;
    }
    let cancelled = false;
    setLocalSearchReadyDatasetId((current) => (current === source.datasetId ? current : null));
    worker.setData(source.datasetId, source.playerRows, source.guildRows)
      .then(() => {
        if (!cancelled) setLocalSearchReadyDatasetId(source.datasetId);
      })
      .catch((error) => {
        if (cancelled || error instanceof LocalToplistViewWorkerCancelledError) return;
        setLocalSearchReadyDatasetId(null);
        setLocalSearchError(error instanceof Error ? error.message : String(error ?? "unknown_error"));
      });
    return () => {
      cancelled = true;
    };
  }, [localSearchSource]);

  React.useEffect(() => {
    const worker = searchWorkerRef.current;
    const query = searchText.trim();
    if (
      !worker ||
      !localSearchSource ||
      localSearchReadyDatasetId !== localSearchSource.datasetId ||
      dataState.loading ||
      query.length < LOCAL_TOPLIST_SEARCH_MIN_CHARS
    ) {
      setLocalSearchLoading(false);
      setLocalSearchError(null);
      setLocalSearchResults([]);
      return undefined;
    }

    let cancelled = false;
    setLocalSearchLoading(true);
    setLocalSearchError(null);
    const timeout = window.setTimeout(() => {
      worker.requestSearch({
        datasetId: localSearchSource.datasetId,
        query,
        limit: LOCAL_TOPLIST_SEARCH_RESULT_LIMIT,
        jumpableGuildIdentifiers,
      })
        .then((response) => {
          if (cancelled || response.datasetId !== localSearchSource.datasetId || response.normalizedQuery !== normalizeSearchText(query)) return;
          setLocalSearchResults(response.results);
          setLocalSearchLoading(false);
        })
        .catch((error) => {
          if (cancelled || error instanceof LocalToplistViewWorkerCancelledError) return;
          setLocalSearchResults([]);
          setLocalSearchLoading(false);
          setLocalSearchError(error instanceof Error ? error.message : String(error ?? "unknown_error"));
        });
    }, LOCAL_TOPLIST_SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    dataState.loading,
    jumpableGuildIdentifiers,
    localSearchReadyDatasetId,
    localSearchSource,
    searchText,
  ]);

  const handleOpenProfile = React.useCallback(async (row: ToplistPlayerRow) => {
    const localRow = (row as ToplistPlayerRow & { __localRow?: LocalPlayerToplistRow }).__localRow;
    if (!localRow) return;
    const scan = await getSfDataHubLocalScan(localRow.localScanId);
    const rawPlayers = asRawPlayers(scan?.rawData);
    const rawPlayer = rawPlayers.find((player) => readIdentifierCandidates(player, localRow.server).includes(localRow.identifier.toLowerCase())) ?? null;
    if (!scan || !rawPlayer) return;
    setSelectedProfile(buildLocalPlayerProfileModel({
      rawPlayer,
      sourceScanId: localRow.localScanId,
      sourcePlayerKey: localRow.identifier.toLowerCase(),
      sourceMemberRef: localRow.identifier,
      scannedAtMs: localRow.scanTimestamp,
      scannedAtIso: localRow.lastScan,
      guild: {
        name: localRow.guild,
        server: localRow.server,
        identifier: localRow.guildIdentifier,
        hofRank: localRow.hofRank,
      },
      guildRole: null,
    }));
  }, []);

  const unavailableActiveServer = activeGuildServer && selectedServers.length === 1 && selectedServers[0] === activeGuildServer && !availableServerSet.has(activeGuildServer);
  const unavailableServers = entryResolution.unavailableServerCodes;
  const isFullyUnavailable = entryResolution.availabilityState === "unavailable";
  const hasCurrentEntries = Boolean(context?.entries.length);
  const compareNoticeText = React.useMemo(() => {
    if (!compareExpected) return null;
    if (compareLoadState.loading) return t("toplists.status.loading", "Loading...");
    if (compareError) return compareError;
    if (comparePlan.noticeMessages.length) {
      return comparePlan.noticeMessages.join(" ");
    }
    if (showLocalCompare) {
      return null;
    }
    return t("toplists.compareMissingSnapshot", "Baseline missing for {{key}}.", { key: comparePlan.previousMonth || comparePlan.currentMonth || "" });
  }, [compareError, compareExpected, compareLoadState.loading, comparePlan.currentMonth, comparePlan.noticeMessages, comparePlan.previousMonth, showLocalCompare, t]);

  return (
    <div className={styles.page}>
      <Frame>
        <div className={dashboardStyles.topbar}>
          <GuildContextBar useImageFallback={false} />
        </div>
      </Frame>

      <ToplistsDataStaticProvider value={staticToplistsValue}>
        <ContentShell
          mode="card"
          leftWidth={0}
          rightWidth={0}
          outerPadding="p-0"
          subheader={(
            <>
              <SectionDividerHeader title={t("toplists.headerLabel", "Toplists")} />
              <div className="mt-2 pb-3 grid grid-cols-[auto_auto_auto] justify-center items-center gap-6">
                <TopTab active={tab === "players"} onClick={() => setTab("players")} label={t("nav.players", "Players")} />
                <button
                  type="button"
                  className="flex flex-col items-center justify-center gap-0.5 py-1 px-2"
                  style={{ transform: "translateY(50%)" }}
                  onClick={() => setFiltersCollapsed((prev) => !prev)}
                  aria-expanded={!filtersCollapsed}
                  aria-controls="guild-hub-local-toplists-filters"
                >
                  <span style={{ color: "#B0C4D9", fontSize: 11, lineHeight: 1 }}>
                    {filtersCollapsed ? t("toplists.filters.showHud", "Show filters") : t("toplists.filters.hideHud", "Hide filters")}
                  </span>
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 transition-transform duration-200" style={{ color: "#B0C4D9", transform: filtersCollapsed ? "rotate(0deg)" : "rotate(180deg)" }}>
                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <TopTab active={tab === "guilds"} onClick={() => setTab("guilds")} label={t("nav.guilds", "Guilds")} />
              </div>
              {!filtersCollapsed && (
                <div id="guild-hub-local-toplists-filters" className="mt-2">
                  <HudFilters
                    mode={tab}
                    sortValue={tab === "guilds" ? guildSort.metricKey : playerSort.metricKey}
                    onSortValueChange={tab === "guilds" ? (value) => setGuildSort({ metricKey: value, direction: "desc" }) : setSortBy}
                    compareMode={compareMode}
                    onCompareModeChange={handleCompareModeChange}
                    progressSinceMonth={progressSinceMonth}
                    onProgressSinceMonthChange={handleProgressSinceMonthChange}
                    compareFromMonth={compareFromMonth}
                    onCompareFromMonthChange={handleCompareFromMonthChange}
                    compareToMonth={compareToMonth}
                    onCompareToMonthChange={handleCompareToMonthChange}
                    monthOptions={monthOptions}
                    guildOptions={guildOptions}
                    searchSlot={filterMode === "hud" ? desktopLocalSearchSlot : undefined}
                    onExportPng={handleLocalExportPng}
                    exportDisabled={!localExportModel.canExport}
                  />
                </div>
              )}
            </>
          )}
          centerFramed={false}
          stickyTopbar
          stickySubheader={false}
          topbarHeight={56}
        >
          <ListSwitcher />

          {phase && !dataState.result ? (
            <DataHubLoadingState variant="page" title={phase} message={t("guildHub.toplist.loading.message", "Preparing current local toplists.")} />
          ) : null}
          {phase && dataState.result ? <div className={styles.statusLine}>{phase}</div> : null}
          {contextError ? <Notice tone="error" text={contextError} /> : null}
          {!contextLoading && !hasCurrentEntries ? <Notice tone="warning" text={t("guildHub.toplist.empty.noCurrent", "No current toplist selection is available.")} /> : null}
          {unavailableActiveServer ? <Notice tone="warning" text={t("guildHub.toplist.empty.activeUnavailable", "The active guild server has no current local toplist snapshot.")} /> : null}
          {!isFullyUnavailable && unavailableServers.length ? (
            <Notice tone="warning" text={t("guildHub.toplist.partial", "{{count}} selected server(s) could not be loaded.", { count: unavailableServers.length })} />
          ) : null}
          {dataState.error ? <Notice tone="error" text={dataState.error} /> : null}
          {dataState.result?.failedSelections.length ? (
            <Notice tone="warning" text={t("guildHub.toplist.partial", "{{count}} selected server(s) could not be loaded.", { count: dataState.result.failedSelections.length })} />
          ) : null}
          {viewState.error ? <Notice tone="error" text={viewState.error} /> : null}
          {compareNoticeText ? <Notice tone={compareError || comparePlan.status === "unavailable" ? "error" : "warning"} text={compareNoticeText} /> : null}
          {pendingNotice ? <Notice tone="warning" text={pendingNotice} /> : null}

          {tab === "players" ? (
            <TableDataView
              servers={selectedServers}
              classes={selectedClasses}
              range="all"
              sortKey={playerSort.metricKey}
              compareMode={compareMode}
              progressSinceMonth={progressSinceMonth}
              compareFromMonth={compareFromMonth}
              compareToMonth={compareToMonth}
              showAvgModeControl={!filtersCollapsed}
              focusIdentifier={playerFocusTarget?.identifier ?? null}
              focusRank={null}
              focusNonce={playerFocusTarget?.nonce ?? null}
              tableRef={tableRef}
              renderMode="live"
              presetReadOnlyData={playerReadOnlyData}
              onPlayerAvgModeChange={handlePlayerValueModeChange}
              readOnlyHasMoreRows={hasMoreVisiblePlayerRows}
              onReadOnlyRowsEndVisible={handleReadOnlyRowsEndVisible}
              onOpenPlayerProfile={handleOpenProfile}
              renderFirestoreProfileOverlay={false}
            />
          ) : (
            <GuildToplists
              serverCodes={selectedServers}
              sortKey={guildSort.metricKey}
              showAvgModeControl={!filtersCollapsed}
              tableRef={tableRef}
              renderMode="live"
              presetReadOnlyData={guildReadOnlyData}
              onAvgModeChange={handleGuildValueModeChange}
              renderFirestoreGuildOverlay={false}
              focusIdentifier={guildFocusTarget?.identifier ?? null}
              focusNonce={guildFocusTarget?.nonce ?? null}
            />
          )}

          <ServerSheet
            mode="modal"
            open={serverSheetOpen}
            onClose={() => setServerSheetOpen(false)}
            serversByRegion={availableServerGroups}
            selected={selectedServers}
            onToggle={(server) => selectServers((current) => current.includes(server) ? current.filter((item) => item !== server) : [...current, server])}
            onSelectAllInRegion={(region) => selectServers(availableServerGroups[region] ?? [])}
            onClearAll={() => selectServers([])}
          />

          <BottomFilterSheet
            open={filterMode === "sheet" && bottomFilterOpen}
            onClose={() => setBottomFilterOpen(false)}
            localSearchLoading={localSearchLoading}
            localSearchResults={localSearchResults}
            localSearchEmptyText={localSearchError ?? undefined}
            onLocalSearchResultSelect={handleLocalSearchResultSelect}
          />

          <LocalPlayerProfileOverlay isOpen={Boolean(selectedProfile)} profile={selectedProfile} onClose={() => setSelectedProfile(null)} />
          <ToplistExportController
            ref={exportControllerRef}
            activeKind={localExportSnapshot?.kind ?? tab}
            liveTableRef={tableRef}
            onExportingChange={setLocalExportingPng}
            renderPresetContent={({ kind, amount, tableRef: presetTableRef, onCaptureStatusChange }) => {
              const snapshot = localExportSnapshot;
              if (!snapshot || snapshot.kind !== kind) return null;
              if (snapshot.kind === "players") {
                return (
                  <TableDataView
                    servers={snapshot.selectedServers}
                    classes={snapshot.selectedClasses}
                    range="all"
                    sortKey={snapshot.sort.metricKey}
                    compareMode="off"
                    progressSinceMonth=""
                    compareFromMonth=""
                    compareToMonth=""
                    showAvgModeControl={false}
                    focusIdentifier={null}
                    focusRank={null}
                    tableRef={presetTableRef}
                    renderMode="preset"
                    presetAmount={amount}
                    onCaptureStatusChange={onCaptureStatusChange}
                    presetReadOnlyData={snapshot.presetReadOnlyData}
                    renderFirestoreProfileOverlay={false}
                  />
                );
              }
              return (
                <GuildToplists
                  serverCodes={snapshot.selectedServers}
                  sortKey={snapshot.sort.metricKey}
                  showAvgModeControl={false}
                  tableRef={presetTableRef}
                  renderMode="preset"
                  presetAmount={amount}
                  onCaptureStatusChange={onCaptureStatusChange}
                  presetReadOnlyData={snapshot.presetReadOnlyData}
                  renderFirestoreGuildOverlay={false}
                />
              );
            }}
          />
        </ContentShell>
      </ToplistsDataStaticProvider>
    </div>
  );
}

export default function GuildHubToplist() {
  return (
    <FilterProvider>
      <GuildHubToplistInner />
    </FilterProvider>
  );
}

function TopTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={active ? "toplists-tab toplists-tab--active" : "toplists-tab"}
    >
      {label}
    </button>
  );
}

function Notice({ tone, text }: { tone: "warning" | "error"; text: string }) {
  return <div className={tone === "error" ? styles.noticeError : styles.noticeWarning}>{text}</div>;
}

function derivePublicPlayerRatio(main: number | null, con: number | null) {
  const m = typeof main === "number" && Number.isFinite(main) ? main : 0;
  const c = typeof con === "number" && Number.isFinite(con) ? con : 0;
  const total = m + c;
  if (!(total > 0)) return { label: "—", mainRatio: null as number | null };
  const mainRatio = Math.round((m / total) * 100);
  return { label: `${mainRatio}/${100 - mainRatio}`, mainRatio };
}

function toPublicPlayerRow(row: LocalPlayerToplistRow & { tableRank?: number }): ToplistPlayerRow & {
  __localRow: LocalPlayerToplistRow;
  _calculatedSum: number;
  _ratioLabel: string;
  _ratioMain: number | null;
  tableRank?: number;
} {
  const { label: ratioLabel, mainRatio } = derivePublicPlayerRatio(row.main, row.con);
  const calculatedSum = (row.main ?? 0) + (row.con ?? 0);
  return {
    __localRow: row,
    identifier: row.identifier,
    playerId: row.playerId,
    flag: null,
    deltaRank: null,
    server: row.server,
    name: row.name,
    class: row.class,
    level: row.level,
    guild: row.guild,
    main: row.main,
    con: row.con,
    sum: row.sum,
    ratio: ratioLabel,
    _ratioLabel: ratioLabel,
    _ratioMain: mainRatio,
    _calculatedSum: calculatedSum,
    mainTotal: row.mainTotal,
    conTotal: row.conTotal,
    sumTotal: row.sumTotal,
    xpProgress: row.xpProgress,
    xpTotal: row.xpTotal,
    mine: row.mine,
    treasury: row.treasury,
    lastScan: row.latestScanAtSec == null ? row.lastScan : String(row.latestScanAtSec),
    deltaSum: null,
    tableRank: row.tableRank,
  };
}

function toPublicGuildRow(row: LocalGuildToplistRow & { tableRank?: number }): ToplistGuildRow & {
  __localRow: LocalGuildToplistRow;
  guildIdentifier: string;
  tableRank?: number;
} {
  return {
    __localRow: row,
    guildId: row.guildId,
    guildIdentifier: row.guildIdentifier,
    server: row.server,
    name: row.name,
    hofRank: row.hofRank,
    honor: row.honor,
    raids: row.raids,
    portalFloor: row.portalFloor,
    hydra: row.hydra,
    petLevel: row.petLevel,
    instructor: row.instructor,
    memberCount: row.memberCount,
    avgLevel: row.memberBasisStatus === "complete" ? row.avgLevel : null,
    avgBaseMain: row.memberBasisStatus === "complete" ? row.avgBaseMain : null,
    avgConBase: row.memberBasisStatus === "complete" ? row.avgConBase : null,
    avgSumBaseTotal: row.memberBasisStatus === "complete" ? row.avgSumBaseTotal : null,
    avgAttrTotal: row.memberBasisStatus === "complete" ? row.avgAttrTotal : null,
    avgConTotal: row.memberBasisStatus === "complete" ? row.avgConTotal : null,
    avgTotalStats: row.memberBasisStatus === "complete" ? row.avgTotalStats : null,
    avgMine: row.memberBasisStatus === "complete" ? row.avgMine : null,
    avgTreasury: row.memberBasisStatus === "complete" ? row.avgTreasury : null,
    sumAvg: row.memberBasisStatus === "complete" ? row.sumAvg : null,
    lastScan: row.latestScanAtSec == null ? row.lastScan : String(row.latestScanAtSec),
    latestScanAtSec: row.latestScanAtSec,
    tableRank: row.tableRank,
  };
}

function latestUpdatedAt(rows: readonly { latestScanAtSec?: number | null }[] | undefined) {
  const latest = Math.max(0, ...(rows ?? []).map((row) => row.latestScanAtSec ?? 0));
  return latest > 0 ? latest * 1000 : null;
}

function asRawPlayers(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  return Array.isArray(record.players) ? record.players.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry))) : [];
}

function readIdentifierCandidates(player: Record<string, unknown>, rowServer: string) {
  const candidates = new Set<string>();
  const direct = String(player.identifier ?? player.Identifier ?? "").trim();
  if (direct) candidates.add(direct.toLowerCase());
  const id = String(player.playerId ?? player.player_id ?? player.id ?? player.ID ?? "").trim();
  if (!id) return [...candidates];
  const servers = [player.server, player.Server, player.prefix, player.Prefix, player.world, player.World, player.realm, player.Realm, rowServer];
  for (const server of servers) {
    const serverKey = String(server ?? "").trim().toLowerCase();
    if (serverKey) candidates.add(`${serverKey}_p${id}`);
  }
  return [...candidates];
}
