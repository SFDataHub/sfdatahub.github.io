import { useLocalToplistUrlSelection } from "./useLocalToplistUrlSelection";
import { scanArchiveMonthlyOptions } from "../../lib/scanArchive/toplistSelection";
import { visibleToplistSortOptions, resolveVisibleToplistSort } from "../../lib/toplists/toplistSortOptions";
import { trackLocalEvent, useAnalyticsView } from "../../lib/analytics/localEvents";
import { ToplistViewProvider } from "../Toplists/ToplistViewControls";
import { activeColumnWidths, playerColumnSortMatches, fixedPlayerSortKey, toplistColumnLabel, toplistColumnDefinition } from "../../lib/toplists/toplistColumns";
import { usePreferencesSnapshot } from "../../lib/settings/usePreferences";
import { LOCAL_TOPLIST_METRICS } from "../../lib/toplists/localToplistMetrics";
import { auditBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave, auditFields, auditCall, auditAccept, auditFinish, auditEvent, auditResultId, type AuditRun, auditLink, auditObserveInputs } from "../../lib/data-hub/runtimeAudit";
import { buildLocalToplistNameFilter } from "../../lib/toplists/localToplistNameFilter";
import SearchArtwork from "./SearchArtwork";
import { useLocalToplistArchiveSearch } from "./useLocalToplistArchiveSearch";
import { resolveServer } from "../../lib/servers/serverResolver";
import { useLocalFavoritePageAction } from "../../components/data-hub/LocalFavoritesMenu";
import LocalTitleNavigation from "../../components/ui/shared/LocalTitleNavigation";
import { DATA_HUB, safeLocalReturn } from "../../lib/data-hub/routes";
import { parseHubToplistCommand } from "../../lib/data-hub/hubTargetResolver";
import { referenceKey } from "../../lib/data-hub/hubFavoritesContract";
import { resolvePlayerIdentity, resolveGuildIdentity } from "../../lib/identities/identityResolution";
import React from "react";
import { useRuntimeAuditCommit } from "../../lib/data-hub/useRuntimeAuditCommit";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import Frame from "../../components/ContentFrame/Frame";
import ContentShell from "../../components/ContentShell";
import BottomFilterSheet from "../../components/Filters/BottomFilterSheet";
import ServerSheet from "../../components/Filters/ServerSheet";
import ToplistCompareDropdown from "./ToplistCompareDropdown";
import ToplistFilterWindow from "./ToplistFilterWindow";
import HudFilters from "../../components/Filters/HudFilters";
import { CLASSES } from "../../data/classes";
import { FilterProvider, useFilters, useLocalToplistSetting } from "../../components/Filters/FilterContext";
import ListSwitcher from "../../components/Filters/ListSwitcher";
import ToplistExportController, { type ToplistExportControllerHandle } from "../../components/export/ToplistExportController";
import { useLocalProfileNavigation } from "../../lib/data-hub/profileNavigation";
import { favoriteReference } from "../../lib/data-hub/hubFavoritesContract";
import { useNavigate, useLocation } from "react-router-dom";
import { type LocalPlayerCurrentSeed } from "../GuildHub/localPlayerCurrentSeed";

import { useFavoriteMembership } from "../../lib/data-hub/useFavoriteMembership";
import { loadOrBuildLocalToplistSnapshots, type LocalToplistLoadResult, type LocalToplistLoadProgress } from "../../lib/toplists/localToplistService";
import { localToplistDataContextKey, localToplistResultRevision, localToplistSelectionRevision } from "../../lib/toplists/localToplistDatasetRevision";
import { subscribeToLocalDataDependencies, revalidateLocalDataDependencies } from "../../lib/local-data/localDataDependencies";
import type { ToplistFocusRequest, ToplistFocusResult } from "../Toplists/useToplistRowFocus";
import { localToplistDatasetId, LOCAL_TOPLIST_DERIVATION_VERSION } from "../../lib/toplists/localToplistStore";
import type { LocalGuildToplistRow, LocalPlayerToplistRow } from "../../lib/toplists/localToplistTypes";
import { compareLocalToplists } from "../../lib/toplists/localToplistComparison";
import {
  LocalToplistViewWorkerCancelledError,
  LocalToplistViewWorkerSession,
} from "../../lib/toplists/localToplistViewWorkerClient";
import type { LocalToplistSearchResult, LocalToplistViewWorkerSuccess } from "../../lib/toplists/localToplistViewWorkerTypes";
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

import { pageContextStore } from "../../lib/data-hub/pageContextStore";
import { usePageContext } from "../../lib/data-hub/usePageContext";
import { guildFavorite, type HubFavorite } from "../../lib/data-hub/hubFavoritesContract";
import { loadIdentityResolutionSnapshot, revalidateIdentityResolutionSnapshot, type IdentityResolutionSnapshot } from "../../lib/identities/identityResolution";
import { resolveFavorite, revalidateFavoriteProjectionTarget } from "../../lib/data-hub/hubFavoritesProjection";
import type { GuildHubSelectionGuild } from "../../lib/guilds/localScanLibrary";
import {
  buildLocalToplistExportModel,
  type LocalToplistExportSnapshot,
} from "./localToplistExportModel";
import {
  localToplistArchiveFocusIdentifier,
  normalizeLocalToplistSearchIdentifier,
  resolveLocalToplistSearchSelection,
  sameLocalToplistPendingTarget,
  type LocalToplistPendingSearchTarget,
  type LocalToplistTargetStatus,
} from "./localToplistSearchFlow";
import {
  buildLocalToplistComparisonSnapshotSet,
  enrichLocalGuildCompareRows,
  enrichLocalPlayerCompareRows,
  summarizeLocalPlayerCompareRows,
  latestCompareUpdatedAt,
  resolveLocalToplistCompareEntryPlan,
  type LocalToplistCompareEntryPlan,
} from "./localToplistCompareModel";
import {
  buildToplistServerGroupsFromRegistry,
  buildLocalToplistViewRequestKey,
  loadLocalToplistArchiveContext,
  equalToplistServerSelection,
  normalizeToplistServerSelection,
  resolveSelectedToplistEntries,
  resolveMonthlyToplistEntries,
  type LocalToplistArchiveContext,
} from "./localToplistPageModel";
import dashboardStyles from "../GuildHub/Dashboard.module.css";
import "../../styles/Toplist.css";
import styles from "./Toplist.module.css";

type SortDirection = "asc" | "desc";
type SortState = {
  metricKey: string;
  direction: SortDirection;
};
type ValueMode = "base" | "total";

type DataState = {
  refresh?: number;
  result: LocalToplistLoadResult | null;
  datasetId: string;
  loading: boolean;
  error: string | null;
};

type CompareLoadState = {
  key: string;
  refresh?: number;
  identities?: IdentityResolutionSnapshot | null;
  previous: LocalToplistLoadResult | null;
  current: LocalToplistLoadResult | null;
  loading: boolean;
  error: string | null;
};

type LocalToplistPendingTarget = LocalToplistPendingSearchTarget;

type LocalToplistFocusTarget = (ToplistFocusRequest & { nonce: number }) | null;

const LOCAL_PLAYER_WINDOW_SIZE = 200;
const GUILD_VIEW_PAGE_SIZE = 250;
const EMPTY_VIEW_PLAYER_CLASSES: readonly string[] = [];
const EMPTY_VIEW_GUILDS: readonly string[] = [];
const INACTIVE_VIEW_SORT: SortState = { metricKey: "", direction: "desc" };

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

const playerTargetKey = (server: string, identifier: string) => `${normalizeToplistServerSelection([server])[0] ?? server}\u0000${normalizeSearchIdentifier(identifier)}`;

const samePendingTarget = sameLocalToplistPendingTarget;

const normalizeCompareMonthPair = (from: string, to: string) => {
  const nextFrom = String(from ?? "").trim();
  const nextTo = String(to ?? "").trim();
  if (nextFrom && nextTo && nextFrom > nextTo) return { from: nextTo, to: nextFrom };
  return { from: nextFrom, to: nextTo };
};

function GuildHubToplistInner() {
  const serverPickerShellRef = React.useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const { filterFavorites: sharedFavorites } = useFavoriteMembership();
  const location = useLocation();
  const targetAuditRef = React.useRef<AuditRun | null>(null);
  const hubCommand = React.useMemo(() => parseHubToplistCommand(location.state?.hubToplistTarget), [location.state?.hubToplistTarget]);
  const hubCommandAccepted = React.useRef<string | null>(null);
  const hubCommandServers = React.useRef<string[]>([]);
  const hubCommandComplete = React.useRef(false);
  const serverContext = usePageContext("local-toplist");
  const {
    persistenceError,
    filterMode,
    listView,
    bottomFilterOpen,
    setBottomFilterOpen,
    serverSheetOpen,
    setServerSheetOpen,
    setServers,
    servers: storedServers,
    classes,
    guilds,
    sortBy,
    setSortBy,
    favoritesOnly,
    searchText,
    setSearchText,
    resetAll,
  } = useFilters();
  const [searchMode, setSearchMode] = useLocalToplistSetting("searchMode");
  const nameFilterText = searchMode === "filter" ? searchText : "";
  const nameFilterFavorites = favoritesOnly
    ? JSON.stringify([Object.keys(sharedFavorites.players ?? {}), Object.keys(sharedFavorites.guilds ?? {})]) : "";
  const { servers: filterServers, tab, setTab } = useLocalToplistUrlSelection(
    storedServers, setServers, !!hubCommand && hubCommandAccepted.current !== hubCommand.id,
  );
  useAnalyticsView(tab === "players" ? "datahub/toplist/players" : "datahub/toplist/guilds");
  const [filtersCollapsed, setFiltersCollapsed] = React.useState(false);
  const [context, setContext] = React.useState<LocalToplistArchiveContext | null>(null);
  const [contextLoading, setContextLoading] = React.useState(true);
  const [contextError, setContextError] = React.useState<string | null>(null);
  const [storedGuildSort, setGuildSort] = useLocalToplistSetting("guildSort");
  const { toplistViews } = usePreferencesSnapshot();
  const playerColumns = toplistViews.players.mode === "custom" ? toplistViews.players.columns : undefined;
  const playerWidths = activeColumnWidths(toplistViews.players);
  const guildWidths = activeColumnWidths(toplistViews.guilds);
  const guildColumns = toplistViews.guilds.mode === "custom" ? toplistViews.guilds.columns : undefined;
  const [playerDirection, setPlayerDirection] = useLocalToplistSetting("playerDirection");
  const [defaultPlayerValueMode, setPlayerValueMode] = useLocalToplistSetting("playerValueMode");
  const playerValueMode = playerColumns
    ? toplistViews.players.views.find(v => v.id === toplistViews.players.activeId)?.playerValueMode ?? "base"
    : defaultPlayerValueMode;
  const [guildValueMode, setGuildValueMode] = useLocalToplistSetting("guildValueMode");
  const [compareMode, setCompareMode] = useLocalToplistSetting("compareMode");
  const [hubMonthlyTarget, setHubMonthlyTarget] = React.useState<string | null>(null);
  const [hubIdentityRevision, setHubIdentityRevision] = React.useState(0);
  const [progressSinceMonth, setProgressSinceMonth] = useLocalToplistSetting("progressSinceMonth");
  const [compareFromMonth, setCompareFromMonth] = useLocalToplistSetting("compareFromMonth");
  const [compareToMonth, setCompareToMonth] = useLocalToplistSetting("compareToMonth");
  const [dataRefresh, setDataRefresh] = React.useState(0);
  const dataRefreshCause = React.useRef<import("../../lib/local-data/localDataDependencies").LocalDependencyNotification>();
  const [dataProgress, setDataProgress] = React.useState<{ key: string; value: LocalToplistLoadProgress } | null>(null);
  const [compareProgress, setCompareProgress] = React.useState<{ key: string; previous: LocalToplistLoadProgress | null; current: LocalToplistLoadProgress | null; previousDone: boolean; currentDone: boolean } | null>(null);
  const [dataState, setDataState] = React.useState<DataState>({ result: null, datasetId: "", loading: false, error: null });
  const [compareLoadState, setCompareLoadState] = React.useState<CompareLoadState>({
    key: "compare:off",
    previous: null,
    current: null,
    loading: false,
    error: null,
  });
  const [viewState, setViewState] = React.useState<{ key?: string; requestKey?: string; result: LocalToplistViewWorkerSuccess | null; loading: boolean; error: string | null }>({
    result: null,
    loading: false,
    error: null,
  });
  const [playerWindow, setPlayerWindow] = React.useState<{ key: string; start: number; target?: { server: string; identifier: string } }>({ key: "", start: 0 });
  const [localExportSnapshot, setLocalExportSnapshot] = React.useState<LocalToplistExportSnapshot | null>(null);
  const [localExportingPng, setLocalExportingPng] = React.useState(false);
  const [localSearchLoading, setLocalSearchLoading] = React.useState(false);
  const [searchResultBinding, setSearchResultBinding] = React.useState<string | null>(null);
  const [localSearchResults, setLocalSearchResults] = React.useState<LocalToplistSearchResult[]>([]);
  const [localSearchError, setLocalSearchError] = React.useState<string | null>(null);
  const [localSearchReadyDatasetId, setLocalSearchReadyDatasetId] = React.useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = React.useState<LocalToplistPendingTarget | null>(null);
  const [targetStatus, setTargetStatus] = React.useState<LocalToplistTargetStatus | null>(null);
  const [pendingNotice, setPendingNotice] = React.useState<string | null>(null);
  const [desktopSearchOpen, setDesktopSearchOpen] = React.useState(false);
  useAnalyticsView(searchMode === "search" && desktopSearchOpen ? "datahub/search/open" : null);
  const [playerFocusTarget, setPlayerFocusTarget] = React.useState<LocalToplistFocusTarget>(null);
  const [guildFocusTarget, setGuildFocusTarget] = React.useState<LocalToplistFocusTarget>(null);
  const tableRef = React.useRef<HTMLDivElement>(null);
  const exportControllerRef = React.useRef<ToplistExportControllerHandle | null>(null);
  const workerRef = React.useRef<LocalToplistViewWorkerSession | null>(null);
  const searchWorkerRef = React.useRef<LocalToplistViewWorkerSession | null>(null);
  const latestDataRunKeyRef = React.useRef("");
  const latestViewRequestKeyRef = React.useRef("");
  const latestCompareRunKeyRef = React.useRef("compare:off");
  const localSearchNonceRef = React.useRef(1);

  React.useLayoutEffect(() => {
    if (!hubCommand || hubCommandAccepted.current === hubCommand.id) return;
    hubCommandAccepted.current = hubCommand.id;
    hubCommandComplete.current = true;
    auditFinish(targetAuditRef.current, "superseded"); targetAuditRef.current = null;
    searchTargetTransition.current = null;
    setPendingTarget(null); setPlayerFocusTarget(null); setGuildFocusTarget(null);
    setTargetStatus(null); setPendingNotice(null);
    if (pageContextStore.get("local-toplist").targetKeys.includes(hubCommand.id)) return;
    const nextServers = hubCommand.selection === "highlight" ? filterServers
      : hubCommand.selection === "add" ? normalizeToplistServerSelection([...filterServers, hubCommand.server]) : [hubCommand.server];
    hubCommandServers.current = [...nextServers];
    pageContextStore.acceptToplistTarget(hubCommand.server, hubCommand.id, nextServers);
    if (hubCommand.selection !== "highlight") setServers(nextServers);
    hubCommandComplete.current = false;
    setTab(hubCommand.kind === "player" ? "players" : "guilds");
    // Existing search/profile callers retain their original single-server entry.
    // Favorite commands change only the explicitly requested server selection.
    if (!hubCommand.selection) {
      setCompareMode("off");
      setHubMonthlyTarget(hubCommand.month);
      setCompareFromMonth(""); setCompareToMonth("");
      setProgressSinceMonth("");
    }
    setTargetStatus("pending"); setPendingNotice(t("hubSearch.target.preparingTarget"));
  }, [hubCommand, filterServers, setServers, t]);

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

  const storedManifestYears = React.useRef([progressSinceMonth, compareFromMonth, compareToMonth].filter(Boolean).map(month => Number(month.slice(0, 4)))).current;
  React.useEffect(() => {
    const controller = new AbortController();
    setContextLoading(true);
    setContextError(null);
    loadLocalToplistArchiveContext({ signal: controller.signal, includeYears: [...storedManifestYears, ...(hubCommand?.month ? [Number(hubCommand.month.slice(0, 4))] : [])] })
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
  }, [hubCommand?.month]);

  const availableServerGroups = React.useMemo(
    () => buildToplistServerGroupsFromRegistry(),
    [],
  );
  const availableServerSet = React.useMemo(
    () => new Set([...(context?.serverOptions.map((option) => option.server) ?? []), ...normalizeToplistServerSelection(hubMonthlyTarget ? (context?.manifests ?? []).flatMap(m => Object.keys(m.toplists?.monthly?.[hubMonthlyTarget] ?? {})) : [])]),
    [context, hubMonthlyTarget],
  );
  const selectedServers = filterServers;
  const selectedServerCount = normalizeToplistServerSelection(selectedServers).length;
  const selectedClasses = classes ?? [];
  const playerClassMode = CLASSES.every(c => selectedClasses.includes(c.key)) ? "all" as const : "selected" as const;
  const playerSortOptions = React.useMemo(() => visibleToplistSortOptions("players", toplistViews.players.columns, playerValueMode), [toplistViews.players.columns, playerValueMode]);
  const guildSortOptions = React.useMemo(() => visibleToplistSortOptions("guilds", toplistViews.guilds.columns), [toplistViews.guilds.columns]);
  const playerSort: SortState = React.useMemo(() => resolveVisibleToplistSort("players", playerSortOptions,
    playerColumns ? fixedPlayerSortKey(sortBy || "sum", playerValueMode) : sortBy || "sum", playerDirection,
    playerColumns ? fixedPlayerSortKey("sum", playerValueMode) : "sum"),
    [playerSortOptions, playerColumns, sortBy, playerValueMode, playerDirection]);
  const guildSort: SortState = React.useMemo(() => resolveVisibleToplistSort("guilds", guildSortOptions,
    storedGuildSort.metricKey, storedGuildSort.direction, "guildAvgLevel"),
    [guildSortOptions, storedGuildSort.metricKey, storedGuildSort.direction]);
  React.useEffect(() => {
    if (tab !== "players") return;
    if (sortBy !== playerSort.metricKey) setSortBy(playerSort.metricKey);
    if (playerDirection !== playerSort.direction) setPlayerDirection(playerSort.direction);
  }, [tab, sortBy, playerDirection, playerSort.metricKey, playerSort.direction, setSortBy, setPlayerDirection]);
  React.useEffect(() => {
    if (tab === "guilds" && (storedGuildSort.metricKey !== guildSort.metricKey || storedGuildSort.direction !== guildSort.direction)) setGuildSort(guildSort);
  }, [tab, storedGuildSort.metricKey, storedGuildSort.direction, guildSort.metricKey, guildSort.direction, setGuildSort]);
  const defaultDirection = (key: string) => LOCAL_TOPLIST_METRICS.find(metric => metric.metricKey === key)?.defaultDirection ?? "desc";
  const changePlayerSort = (key: string) => {
    const option = playerSortOptions.find(option => option.metricKey === key || toplistColumnDefinition("players", option.columnKey)?.metric === key);
    const metric = option?.metricKey ?? key;
    setSortBy(metric); setPlayerDirection(defaultDirection(metric));
  };
  const changeGuildSort = (key: string) => setGuildSort({ metricKey: key, direction: defaultDirection(key) });
  const clickPlayerHeader = (key: string) => {
    if (playerColumnSortMatches(key, playerSort.metricKey, playerValueMode)) setPlayerDirection(direction => direction === "asc" ? "desc" : "asc");
    else changePlayerSort(key);
  };
  const clickGuildHeader = (key: string) => {
    if (guildSort.metricKey === key) setGuildSort(sort => ({ ...sort, direction: sort.direction === "asc" ? "desc" : "asc" }));
    else changeGuildSort(key);
  };
  const monthOptions = React.useMemo(
    () => scanArchiveMonthlyOptions(context?.manifests ?? []),
    [context?.manifests],
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
    const previous = monthOptions[1] ?? "";
    if (!previous) return { from: "", to: "" };
    return normalizeCompareMonthPair(previous, latest);
  }, [monthOptions]);
  const isValidCompareMonth = React.useCallback((value: string) => monthOptions.includes(String(value ?? "").trim()), [monthOptions]);
  React.useEffect(() => {
    // A missing year during loading/failure cannot invalidate a stored month.
    if (contextLoading || !context?.catalog || context.issues.some(issue => issue.code === "manifest-error" || issue.code === "catalog-error")) return;
    if (progressSinceMonth && !isValidCompareMonth(progressSinceMonth)) {
      setProgressSinceMonth("");
      if (compareMode === "progress") setCompareMode("off");
    }
    const fallback = resolveDefaultCompareMonths();
    if (compareMode === "months") {
      const pair = monthOptions.length < 2 ? { from: "", to: "" } : normalizeCompareMonthPair(
        isValidCompareMonth(compareFromMonth) ? compareFromMonth : fallback.from,
        isValidCompareMonth(compareToMonth) ? compareToMonth : fallback.to,
      );
      if (pair.from !== compareFromMonth) setCompareFromMonth(pair.from);
      if (pair.to !== compareToMonth) setCompareToMonth(pair.to);
    } else {
      if (compareFromMonth && !isValidCompareMonth(compareFromMonth)) setCompareFromMonth("");
      if (compareToMonth && !isValidCompareMonth(compareToMonth)) setCompareToMonth("");
    }
  }, [contextLoading, context, monthOptions, compareMode, progressSinceMonth, compareFromMonth, compareToMonth, isValidCompareMonth, resolveDefaultCompareMonths]);
  const handleCompareModeChange = React.useCallback((nextMode: "off" | "progress" | "months") => {
    setHubMonthlyTarget(null); hubCommandComplete.current = true;
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
    setHubMonthlyTarget(null); hubCommandComplete.current = true;
    setCompareMode(nextValue ? "progress" : "off");
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

  const entryResolution = React.useMemo(
    () => hubMonthlyTarget ? resolveMonthlyToplistEntries(context, selectedServers, hubMonthlyTarget) : resolveSelectedToplistEntries(context?.entries ?? [], selectedServers),
    [context, selectedServers, hubMonthlyTarget],
  );
  const entriesForData = entryResolution.resolvedEntries;
  const dataRunKey = React.useMemo(
    () => localToplistDatasetId(entriesForData),
    [entriesForData],
  );
  const comparePlan = React.useMemo<LocalToplistCompareEntryPlan>(
    () => resolveLocalToplistCompareEntryPlan({
      mode: compareMode,
      resolveFusionSources: tab === "players",
      selectedServers,
      progressSinceMonth,
      compareFromMonth,
      compareToMonth,
      manifests: context?.manifests ?? [],
      manifestUrlsByYear: context?.manifestUrlsByYear ?? {},
    }),
    [tab, compareFromMonth, compareMode, compareToMonth, context?.manifestUrlsByYear, context?.manifests, progressSinceMonth, selectedServers],
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
    const progressKey = JSON.stringify([datasetId, dataRefresh]);
    setDataProgress(null);
    loadOrBuildLocalToplistSnapshots(entriesForData, {
      auditContext: { ...dataRefreshCause.current, trigger: dataRefreshCause.current?.trigger ?? "toplist-dataset-effect", consumer: "toplist-dataset", datasetId, dataRefresh },
      signal: controller.signal,
      onProgress: (value) => {
        if (!controller.signal.aborted && latestDataRunKeyRef.current === datasetId) setDataProgress({ key: progressKey, value });
      },
    })
      .then((result) => {
        if (controller.signal.aborted || latestDataRunKeyRef.current !== datasetId) return;
        setDataState({ result, datasetId, refresh: dataRefresh, loading: false, error: null });
      })
      .catch((error) => {
        if (controller.signal.aborted || latestDataRunKeyRef.current !== datasetId) return;
        setDataState({ result: null, datasetId, loading: false, error: error instanceof Error ? error.message : String(error ?? "unknown_error") });
      });
    return () => controller.abort();
  }, [context, contextLoading, dataRunKey, entriesForData, dataRefresh]);

  React.useEffect(() => {
    const plan = comparePlan;
    const controller = new AbortController();
    const runKey = JSON.stringify([plan.loadKey, dataRefresh]);
    latestCompareRunKeyRef.current = runKey;

    if (!plan.active || plan.status === "unavailable") {
      controller.abort();
      setCompareLoadState((state) => (
        state.key === plan.loadKey && !state.previous && !state.current && !state.loading && !state.error
          ? state
          : { key: plan.loadKey, previous: null, current: null, loading: false, error: null }
      ));
      return undefined;
    }

    const compareAudit = auditBegin("F24", "compare-load");
    if (compareAudit) auditFields(compareAudit, { previousSources: plan.previousEntries.length, currentSources: plan.currentEntries.length });
    setCompareLoadState((state) => (
      state.key === plan.loadKey && state.loading && !state.error
        ? state
        : { key: plan.loadKey, previous: null, current: null, loading: true, error: null }
    ));

    const reusableCurrentResult = plan.currentDatasetId === dataState.datasetId ? dataState.result : null;
    const progressKey = JSON.stringify([plan.loadKey, dataRefresh]);
    setCompareProgress({ key: progressKey, previous: null, current: null, previousDone: false, currentDone: false });
    const report = (side: "previous" | "current", value?: LocalToplistLoadProgress) => {
      if (controller.signal.aborted || latestCompareRunKeyRef.current !== runKey) return;
      setCompareProgress(state => state?.key !== progressKey ? state : {
        ...state, ...(value ? { [side]: value } : { [`${side}Done`]: true }),
      });
    };
    const loadPrevious = auditValue(compareAudit, auditEnter(compareAudit, "previous-dataset"), loadOrBuildLocalToplistSnapshots(plan.previousEntries, { signal: controller.signal, onProgress: value => report("previous", value) }))
      .then(result => { report("previous"); return result; });
    const loadCurrent = (async () => {
      if (reusableCurrentResult?.dependencies &&
          reusableCurrentResult.requestRevision === localToplistSelectionRevision(plan.currentEntries, LOCAL_TOPLIST_DERIVATION_VERSION) &&
          (await revalidateLocalDataDependencies(reusableCurrentResult.dependencies)).current) { if (compareAudit) auditEvent(compareAudit, "current-dataset-reused", { reportId: auditResultId(reusableCurrentResult) }); return reusableCurrentResult; }
      return auditValue(compareAudit, auditEnter(compareAudit, "current-dataset"), loadOrBuildLocalToplistSnapshots(plan.currentEntries, { signal: controller.signal, onProgress: value => report("current", value) }));
    })().then(result => { report("current"); return result; });

    Promise.all([loadPrevious, loadCurrent, tab === "players" ? loadIdentityResolutionSnapshot() : null])
      .then(async ([previous, current, loadedIdentities]) => {
        const identities = loadedIdentities ? await revalidateIdentityResolutionSnapshot(loadedIdentities) : null;
        if (controller.signal.aborted || latestCompareRunKeyRef.current !== runKey) { auditFinish(compareAudit, "stale-discarded"); return; }
        const accepted = { key: plan.loadKey, refresh: dataRefresh, identities, previous, current, loading: false, error: null };
        auditAccept(compareAudit, accepted);
        auditValue(compareAudit, auditEnter(compareAudit, "state-enqueue", "sync-elapsed"), setCompareLoadState(accepted));
      })
      .catch((error) => {
        auditError(compareAudit, error);
        if (controller.signal.aborted || latestCompareRunKeyRef.current !== runKey) return;
        setCompareLoadState({
          key: plan.loadKey,
          previous: null,
          current: null,
          loading: false,
          error: error instanceof Error ? error.message : String(error ?? "unknown_error"),
        });
      }).finally(() => auditFinish(compareAudit));

    return () => { controller.abort(); auditFinish(compareAudit, "superseded", { consumerReleased: true, physicalContinues: true }); };
  }, [tab, comparePlan, comparePlan.currentDatasetId === dataState.datasetId ? dataState.result : null, dataRefresh]);

  const activeViewPlayerClasses = tab === "players" ? selectedClasses : EMPTY_VIEW_PLAYER_CLASSES;
  const activeViewGuilds = tab === "players" ? guilds : EMPTY_VIEW_GUILDS;
  const activeViewPlayerSort = tab === "players" ? playerSort : INACTIVE_VIEW_SORT;
  const activeViewGuildSort = tab === "guilds" ? guildSort : INACTIVE_VIEW_SORT;
  const activeViewPlayerValueMode = tab === "players" ? playerValueMode : "base";
  const activeViewGuildValueMode = tab === "guilds" ? guildValueMode : "base";
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
    const __audit1 = comparePlan.active && comparePlan.status !== "unavailable" && compareLoadState.key === comparePlan.loadKey && compareLoadState.refresh === dataRefresh && compareLoadState.previous && compareLoadState.current && !compareLoadState.loading && !compareLoadState.error ? auditBegin("F24", "comparisonResult") : null;
    auditObserveInputs(__audit1, [compareLoadState.previous, compareLoadState.current]);
    try {
    if (
      !comparePlan.active ||
      comparePlan.status === "unavailable" ||
      compareLoadState.key !== comparePlan.loadKey ||
      compareLoadState.refresh !== dataRefresh ||
      (tab === "players" && !compareLoadState.identities) ||
      !compareLoadState.previous ||
      !compareLoadState.current ||
      compareLoadState.loading ||
      compareLoadState.error
    ) {
      return auditReturn(__audit1, null);
    }
    return auditReturn(__audit1, compareLocalToplists(
      (auditValue(__audit1, auditEnter(__audit1, "buildLocalToplistComparisonSnapshotSet", "sync-elapsed"), (buildLocalToplistComparisonSnapshotSet(comparePlan.previousMonth, compareLoadState.previous)))),
      (auditValue(__audit1, auditEnter(__audit1, "buildLocalToplistComparisonSnapshotSet", "sync-elapsed"), (buildLocalToplistComparisonSnapshotSet(comparePlan.currentMonth, compareLoadState.current)))),
      {
        filters: { servers: comparePlan.commonServers, playerClasses: selectedClasses, playerClassMode },
        ...(tab === "players" ? {
          playerSources: comparePlan,
          playerIdentities: compareLoadState.identities!,
        } : {}),
        playerSort,
        guildSort,
        playerAverageMode: playerValueMode,
        guildAverageMode: guildValueMode,
      },
    ));

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
}, [
    tab, dataRefresh, compareLoadState.refresh, compareLoadState.identities,
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
    playerClassMode,
  ]);
  useRuntimeAuditCommit(compareLoadState, !!compareLoadState.current && !compareLoadState.loading, "toplist-compare-datasets");
  useRuntimeAuditCommit(comparisonResult, !!comparisonResult, "toplist-compare-view");
  const compareExpected = comparePlan.active;
  const compareError = compareLoadState.error
    ?? (comparisonResult?.issues.find((issue) => issue.severity === "error")?.message ?? null);
  const showLocalCompare = Boolean(compareExpected && !compareLoadState.loading && !compareError && comparisonResult && comparisonResult.status !== "empty");
  const useCompareFilterView = showLocalCompare && (tab === "players" || searchMode === "filter" || favoritesOnly);
  // The displayed side owns search, sources and target decisions, including
  // the explicit normal fallback while a comparison is being prepared.
  const activeDataContext = React.useMemo(() => {
    const result = showLocalCompare ? compareLoadState.current : dataState.result;
    if (!result || !selectedServers.length) return null;
    const datasetId = showLocalCompare ? comparePlan.currentDatasetId : dataState.datasetId;
    const contentRevision = localToplistResultRevision(result);
    return {
      datasetId, contentRevision, result, playerRows: result.playerRows, guildRows: result.guildRows,
      key: JSON.stringify([localToplistDataContextKey(datasetId, contentRevision), comparePlan.loadKey,
        showLocalCompare ? "compare" : "normal", dataRefresh,
        showLocalCompare && compareLoadState.previous ? localToplistResultRevision(compareLoadState.previous) : null,
        showLocalCompare ? compareLoadState.identities?.revisions : null]),
    };
  }, [showLocalCompare, compareLoadState.identities, compareLoadState.current, compareLoadState.previous, dataState.result, dataState.datasetId, comparePlan.loadKey, comparePlan.currentDatasetId, dataRefresh, selectedServers]);
  const displayedPlayerServers = showLocalCompare && tab === "players" ? comparePlan.currentServers : selectedServers;
  const activeViewRequest = React.useMemo(() => {
    const result = useCompareFilterView ? compareLoadState.current : dataState.result;
    const datasetId = useCompareFilterView ? comparePlan.currentDatasetId : dataState.datasetId;
    if (!result || !selectedServers.length || (!useCompareFilterView && (dataState.datasetId !== dataRunKey || dataState.refresh !== dataRefresh))) return null;
    const favoriteIds = nameFilterFavorites ? JSON.parse(nameFilterFavorites) as [string[], string[]] : null;
    const playerStatsDayValues = tab === "players" && showLocalCompare && comparisonResult && ["statsDay", "statsDayTotal"].includes(activeViewPlayerSort.metricKey)
      ? Object.fromEntries(enrichLocalPlayerCompareRows({
          rows: result.playerRows.map(toPublicPlayerRow), comparisonRows: comparisonResult.players,
          playerAvgMode: activeViewPlayerSort.metricKey === "statsDayTotal" ? "total" : activeViewPlayerValueMode,
        }).map((row, index) => [result.playerRows[index].rowKey, row._statsPerDay]))
      : undefined;
    const request = {
      playerStatsDayValues,
      datasetId,
      contentRevision: localToplistResultRevision(result),
      tab,
      nameFilter: searchMode === "filter" || favoritesOnly ? nameFilterText : undefined,
      allowedPlayerKeys: favoriteIds ? favoriteIds[0].map(id => {
        const ref = favoriteReference("player", id);
        return ref ? playerTargetKey(ref.serverNamespace, ref.identifier) : "";
      }).filter(Boolean) : undefined,
      allowedGuildKeys: favoriteIds ? favoriteIds[1].map(id => {
        const ref = favoriteReference("guild", id);
        return ref ? playerTargetKey(ref.serverNamespace, ref.identifier) : "";
      }).filter(Boolean) : undefined,
      guildLimit: useCompareFilterView ? null : GUILD_VIEW_PAGE_SIZE,
      playerLimit: null,
      filters: {
        servers: displayedPlayerServers,
        playerClasses: activeViewPlayerClasses,
        playerClassMode: tab === "players" ? playerClassMode : undefined,
        guilds: activeViewGuilds,
      },
      sort: tab === "players" ? activeViewPlayerSort : activeViewGuildSort,
      playerAverageMode: activeViewPlayerValueMode,
      guildAverageMode: activeViewGuildValueMode,
      page: 1,
      pageSize: tab === "players" ? LOCAL_PLAYER_WINDOW_SIZE : useCompareFilterView ? result.guildRows.length : GUILD_VIEW_PAGE_SIZE,
    };
    const contextKey = JSON.stringify([playerStatsDayValues, searchMode, request.allowedPlayerKeys, request.allowedGuildKeys, useCompareFilterView ? activeDataContext?.key : null, buildLocalToplistViewRequestKey({
        datasetId,
        contentRevision: localToplistResultRevision(result),
        tab,
        nameFilter: nameFilterText,
        servers: displayedPlayerServers,
        playerClasses: activeViewPlayerClasses,
        playerClassMode: tab === "players" ? playerClassMode : undefined,
        guilds: activeViewGuilds,
        playerSort: activeViewPlayerSort,
        guildSort: activeViewGuildSort,
        playerValueMode: activeViewPlayerValueMode,
        guildValueMode: activeViewGuildValueMode,
      })]);
    const window = playerWindow.key === contextKey ? playerWindow : { start: 0, target: undefined };
    const windowRequest = tab === "players" ? { ...request, windowStart: window.start, targetPlayer: window.target } : request;
    return {
      request: windowRequest, contextKey,
      key: JSON.stringify([contextKey, tab === "players" ? window : null]),
      playerRows: result.playerRows,
      guildRows: result.guildRows,
    };
  }, [
    comparisonResult, showLocalCompare, playerWindow, nameFilterFavorites, nameFilterText, searchMode, useCompareFilterView, compareLoadState.current, comparePlan.currentDatasetId, activeDataContext?.key,
    activeViewGuildSort,
    activeViewGuildValueMode,
    activeViewGuilds,
    activeViewPlayerClasses,
    playerClassMode,
    activeViewPlayerSort,
    activeViewPlayerValueMode,
    dataState.datasetId,
    dataState.result,
    dataState.refresh,
    dataRefresh,
    dataRunKey,
    selectedServers, displayedPlayerServers,
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
    const auditView = auditBegin("F21", "view-request");
    auditFields(auditView, { trigger: "view-request-effect" });
    if (auditView) auditFields(auditView, { datasetId: viewRequest.request.datasetId, action: ("windowStart" in viewRequest.request && viewRequest.request.windowStart) ? "window-or-target" : "filter-sort-view", datasetPlayers: viewRequest.playerRows.length, datasetGuilds: viewRequest.guildRows.length });
    latestViewRequestKeyRef.current = viewRequest.key;
    (auditView ? auditCall(auditView, "dataset-init-or-reuse", () => worker.setData(viewRequest.request.datasetId, viewRequest.playerRows, viewRequest.guildRows, viewRequest.request.contentRevision), "async-container") : worker.setData(viewRequest.request.datasetId, viewRequest.playerRows, viewRequest.guildRows, viewRequest.request.contentRevision))
      .then(() => {
        if (cancelled) throw new LocalToplistViewWorkerCancelledError();
        return auditView ? auditCall(auditView, "worker-view-request", () => worker.requestView(viewRequest.request), "async-container") : worker.requestView(viewRequest.request);
      })
      .then((next) => {
        if (!cancelled && latestViewRequestKeyRef.current === viewRequest.key) {
          auditAccept(auditView, next);
          setViewState({ key: viewRequest.contextKey, requestKey: viewRequest.key, result: next, loading: false, error: null });
        }
      })
      .catch((error) => {
        if (error instanceof LocalToplistViewWorkerCancelledError || cancelled || latestViewRequestKeyRef.current !== viewRequest.key) { auditFinish(auditView, "stale-discarded"); return; }
        auditError(auditView, error);
        setViewState({ result: null, loading: false, error: error instanceof Error ? error.message : String(error ?? "unknown_error") });
      }).finally(() => auditFinish(auditView));
    setViewState((state) => state.key === viewRequest.contextKey && state.result
      ? state : { result: null, loading: true, error: null });
    return () => {
      cancelled = true;
      if (auditView) auditFinish(auditView, "superseded", { physicalContinues: true, consumerReleased: true });
    };
  }, [activeViewRequest]);
  useRuntimeAuditCommit(viewState.result, !!viewState.result && !viewState.loading && !viewState.error, "toplist-view-rows");
  useRuntimeAuditCommit(dataState.result, !!dataState.result && !dataState.loading && !dataState.error, "toplist-dataset");

  useRuntimeAuditCommit(localSearchResults, !localSearchLoading && localSearchResults.length > 0, "toplist-search-results");
  const dependencyNeed = React.useMemo(() => ({
    allIdentities: comparePlan.active && tab === "players",
    servers: normalizeToplistServerSelection([dataState.result, compareLoadState.previous, compareLoadState.current]
      .flatMap(result => result?.failedSelections.map(selection => selection.server) ?? [])), toplistResets: true,
    sourceIds: [...new Set([dataState.result, compareLoadState.previous, compareLoadState.current]
      .flatMap(result => result?.dependencies?.need.sourceIds ?? []))],
  }), [comparePlan.active, tab, selectedServers, dataState.result, compareLoadState.previous, compareLoadState.current]);
  React.useEffect(() => {
    const results = [dataState.result, compareLoadState.previous, compareLoadState.current].filter(Boolean);
    if (!results.length && !dependencyNeed.allIdentities) return;
    let stopped = false;
    const refresh = (cause?: import("../../lib/local-data/localDataDependencies").LocalDependencyNotification) => { if (!stopped) { dataRefreshCause.current = cause; setDataRefresh(value => value + 1); } };
    const fail = (error: unknown) => { if (!stopped) setPendingNotice(error instanceof Error ? error.message : String(error)); };
    const stop = subscribeToLocalDataDependencies(dependencyNeed, refresh, fail, { consumer: "toplist-dataset-dependencies" });
    // Verify the supplied receipt as well as the subscription baseline, closing
    // the result-delivery/subscription window and catching missed events.
    const identities = compareLoadState.identities;
    const identityCheck = identities?.revisions ? revalidateLocalDataDependencies({
      need: { allIdentities: true }, sources: 0, players: identities.revisions.players, guilds: identities.revisions.guilds,
    }) : null;
    void Promise.all([...results.map(result => result?.dependencies ? revalidateLocalDataDependencies(result.dependencies) : null), identityCheck])
      .then(checks => { if (checks.some(check => check && !check.current)) refresh(); }).catch(fail);
    return () => { stopped = true; stop(); };
  }, [dependencyNeed, compareLoadState.identities]);
  const compareUpdatedAt = React.useMemo(() => {
    if (!compareLoadState.current) return null;
    return latestCompareUpdatedAt(compareLoadState.current.snapshots);
  }, [compareLoadState.current]);

  const currentViewResult = viewState.key === activeViewRequest?.contextKey ? viewState.result : null;
  const handlePlayerWindow = React.useCallback((start: number) => {
    if (!activeViewRequest || (playerWindow.target && pendingTarget)) return;
    setPlayerWindow(current => current.key === activeViewRequest.contextKey && current.start === start && !current.target
      ? current : { key: activeViewRequest.contextKey, start });
  }, [activeViewRequest?.contextKey, playerWindow.target, pendingTarget]);
  const dataPending = Boolean(selectedServers.length && entriesForData.length && !dataState.error &&
    (dataState.loading || dataState.datasetId !== dataRunKey || dataState.refresh !== dataRefresh || !dataState.result));
  const comparePending = Boolean(compareExpected && comparePlan.status !== "unavailable" && !compareError &&
    (compareLoadState.loading || compareLoadState.key !== comparePlan.loadKey || !comparisonResult));
  const tableBusy = Boolean(selectedServers.length && !contextError && (contextLoading || comparePending ||
    ((!showLocalCompare || useCompareFilterView) && (dataPending || viewState.loading || (activeViewRequest && !currentViewResult && !viewState.error)))));
  const normalFullPlayerRows = React.useMemo(
    () => currentViewResult?.tab === "players" ? currentViewResult.playerRows.map(toPublicPlayerRow) : [],
    [currentViewResult],
  );
  const compareFullPlayerRows = React.useMemo(
    () => {
      if (!showLocalCompare || !comparisonResult) return [];
      const rows = (currentViewResult?.tab === "players" ? currentViewResult.playerRows : []).map(toPublicPlayerRow);
      return enrichLocalPlayerCompareRows({
        rows,
        comparisonRows: comparisonResult.players,
        playerAvgMode: playerValueMode,
      });
    },
    [comparisonResult, playerValueMode, showLocalCompare, searchMode, currentViewResult],
  );
  const fullPlayerRows = showLocalCompare ? compareFullPlayerRows : normalFullPlayerRows;
  const visiblePlayerRows = fullPlayerRows;
  const playerWindowStart = currentViewResult?.windowStart ?? 0;
  const playerUpdatedAt = React.useMemo(
    () => latestUpdatedAt(dataState.result?.playerRows),
    [dataState.result?.playerRows],
  );
  const guildUpdatedAt = React.useMemo(
    () => latestUpdatedAt(dataState.result?.guildRows),
    [dataState.result?.guildRows],
  );

  const compareNameFilter = React.useMemo(() => showLocalCompare && activeDataContext
    ? buildLocalToplistNameFilter(activeDataContext.playerRows, activeDataContext.guildRows) : null,
    [showLocalCompare, activeDataContext?.playerRows, activeDataContext?.guildRows]);
  const compareDisplayStats = React.useMemo(() => {
    if (!showLocalCompare || !comparisonResult) return undefined;
    const match = nameFilterText.trim() && compareNameFilter ? compareNameFilter(nameFilterText) : null;
    const selectedGuilds = new Set(activeViewGuilds.map(normalizeGuildKey));
    const allowed = activeViewRequest?.request.allowedPlayerKeys;
    const favoriteKeys = allowed ? new Set(allowed) : null;
    return summarizeLocalPlayerCompareRows(comparisonResult.players, playerValueMode, row =>
      (!match || match.player(row)) && (!selectedGuilds.size || selectedGuilds.has(normalizeGuildKey(row.guild ?? ""))) &&
      (!favoriteKeys || favoriteKeys.has(playerTargetKey(row.server, row.identifier))));
  }, [showLocalCompare, comparisonResult, playerValueMode, nameFilterText, compareNameFilter, activeViewGuilds, nameFilterFavorites]);

  const playerReadOnlyData = React.useMemo<PlayerPresetReadOnlyData>(() => ({
    rows: visiblePlayerRows,
    allRows: fullPlayerRows,
    window: { start: playerWindowStart, total: currentViewResult?.totalRows ?? 0,
      contextKey: activeViewRequest?.contextKey ?? "", onChange: handlePlayerWindow,
      decor: currentViewResult?.playerDecor, stats: compareDisplayStats },
    tableLoading: tableBusy,
    compareLoading: compareExpected ? compareLoadState.loading : false,
    compareExpected,
    showCompare: showLocalCompare,
    compareError,
    playerError: viewState.error,
    playerLastUpdatedAt: showLocalCompare ? compareUpdatedAt : playerUpdatedAt,
    playerScopeStatus: null,
    playerAvgMode: playerValueMode,
  }), [
    compareDisplayStats, playerWindowStart, currentViewResult, activeViewRequest?.contextKey, handlePlayerWindow, compareError,
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
    tableBusy,
  ]);

  const normalGuildRows = React.useMemo(
    () => currentViewResult?.tab === "guilds" ? currentViewResult.guildRows.map(toPublicGuildRow) : [],
    [currentViewResult],
  );
  const compareGuildRows = React.useMemo(
    () => {
      if (!showLocalCompare || !comparisonResult) return [];
      const rows = ((searchMode === "filter" || favoritesOnly) ? currentViewResult?.tab === "guilds" ? currentViewResult.guildRows : [] : comparisonResult.currentGuildView.rows).map(toPublicGuildRow);
      return enrichLocalGuildCompareRows({ rows, comparisonRows: comparisonResult.guilds });
    },
    [comparisonResult, showLocalCompare, searchMode, favoritesOnly, currentViewResult],
  );
  const guildRowsForDisplay = showLocalCompare ? compareGuildRows : normalGuildRows;
  const favoritePlayerSet = React.useMemo(() => {
    const keys = Object.keys(sharedFavorites.players ?? {});
    return new Set(keys.map(normalizeSearchIdentifier).filter(Boolean));
  }, [sharedFavorites.players]);
  const favoriteGuildSet = React.useMemo(() => {
    const keys = Object.keys(sharedFavorites.guilds ?? {});
    return new Set(keys.map(normalizeSearchIdentifier).filter(Boolean));
  }, [sharedFavorites.guilds]);
  const activeTargetViewKey = JSON.stringify([activeDataContext?.key, tab,
    showLocalCompare ? [playerSort, guildSort, playerValueMode, guildValueMode, selectedClasses] : activeViewRequest?.contextKey,
    guilds, favoritesOnly, [...favoritePlayerSet], [...favoriteGuildSet], listView]);
  const sourcePlayerByIdentifier = React.useMemo(() => {
    const map = new Map<string, LocalPlayerToplistRow>();
    (activeDataContext?.playerRows ?? []).forEach((row) => {
      const identifier = playerTargetKey(row.server, row.identifier);
      if (row.identifier && !map.has(identifier)) map.set(identifier, row);
    });
    return map;
  }, [activeDataContext?.playerRows]);
  const sourceGuildByIdentifier = React.useMemo(() => {
    const map = new Map<string, LocalGuildToplistRow>();
    (activeDataContext?.guildRows ?? []).forEach((row) => {
      const identifier = resolveLocalGuildFocusIdentifier(toPublicGuildRow(row));
      if (identifier && !map.has(identifier)) map.set(identifier, row);
    });
    guildRowsForDisplay.forEach(row => {
      const local = (row as ToplistGuildRow & { __localRow?: LocalGuildToplistRow }).__localRow;
      const identifier = resolveLocalGuildFocusIdentifier(row);
      if (local && identifier) map.set(identifier, local);
    });
    return map;
  }, [activeDataContext?.guildRows, guildRowsForDisplay]);
  const fullPlayerIndexByIdentifier = React.useMemo(() => {
    const map = new Map<string, number>();
    fullPlayerRows.forEach((row, index) => {
      const identifier = resolvePlayerToplistRowIdentifier(row);
      if (identifier && !map.has(playerTargetKey(String(row.server ?? ""), identifier))) map.set(playerTargetKey(String(row.server ?? ""), identifier), index + playerWindowStart);
    });
    return map;
  }, [fullPlayerRows, playerWindowStart]);
  const visiblePlayerIdentifierSet = React.useMemo(() => {
    const set = new Set<string>();
    visiblePlayerRows.forEach((row) => {
      const identifier = resolvePlayerToplistRowIdentifier(row);
      if (identifier) set.add(playerTargetKey(String(row.server ?? ""), identifier));
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
    loading: tableBusy,
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
    tableBusy,
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
    dataLoading: !showLocalCompare && dataState.loading,
    viewLoading: viewState.loading || (compareExpected && compareLoadState.loading),
    contextError,
    dataError: showLocalCompare ? null : dataState.error,
    viewError: compareExpected ? (compareError ?? viewState.error) : viewState.error,
    hasCurrentEntries: showLocalCompare ? comparePlan.currentEntries.length > 0 : Boolean(context?.entries.length),
    isFullyUnavailable: showLocalCompare ? comparePlan.status === "unavailable" : entryResolution.availabilityState === "unavailable",
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
    showLocalCompare, comparePlan.currentEntries.length, comparePlan.status,
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
    playerClassMode,
    selectedServers,
    tab,
    viewState.error,
    viewState.loading,
    visiblePlayerRows,
    tableBusy,
  ]);

  const handleLocalExportPng = React.useCallback(async () => {
 const __w32Run0=auditBegin("F25","handleLocalExportPng");
  auditFields(__w32Run0, { consumerArea: "Topliste", trigger: "export-handler" });
 const __w32Sync=null;
 try {
    if (!localExportModel.canExport) return auditReturn(__w32Run0,undefined);
    const snapshot = { ...localExportModel.snapshot, widths: { ...(localExportModel.snapshot.kind === "players" ? playerWidths : guildWidths) }, columns: localExportModel.snapshot.kind === "players" ? playerColumns : guildColumns };
    if (snapshot.kind === "guilds") {
      setLocalExportSnapshot(snapshot);
      exportControllerRef.current?.open();
      return auditReturn(__w32Run0,undefined);
    }
    const view = activeViewRequest, worker = workerRef.current;
    if (!view || !worker) return auditReturn(__w32Run0,undefined);
    const requestKey = latestViewRequestKeyRef.current;
    try {
      // Preserve the existing export's first-1000 cohort. Fetch it only on
      // explicit export, in bounded responses from the already prepared view.
      const rows: ReturnType<typeof toPublicPlayerRow>[] = [];
      for (let start = 0; start < 1000; start += LOCAL_PLAYER_WINDOW_SIZE) {
        const next = await auditValue(__w32Run0,auditEnter(__w32Run0,"worker.requestView"),worker.requestView({ ...view.request, windowStart: start, targetPlayer: undefined }));
        if (latestViewRequestKeyRef.current !== requestKey) return auditReturn(__w32Run0,undefined);
        rows.push(...next.playerRows.map(toPublicPlayerRow));
        if (start + LOCAL_PLAYER_WINDOW_SIZE >= next.totalRows) break;
      }
      const exportRows = showLocalCompare && comparisonResult
        ? enrichLocalPlayerCompareRows({ rows, comparisonRows: comparisonResult.players, playerAvgMode: playerValueMode }) : rows;
      setLocalExportSnapshot({ ...snapshot, rowCount: exportRows.length,
        presetReadOnlyData: { ...snapshot.presetReadOnlyData, rows: exportRows, allRows: exportRows, window: playerReadOnlyData.window } });
      exportControllerRef.current?.open();
    } catch (error) {
      if (latestViewRequestKeyRef.current === requestKey && !(error instanceof LocalToplistViewWorkerCancelledError)) setPendingNotice(String(error));
    }

} catch (__w32Error) { auditError(__w32Run0,__w32Error); throw __w32Error; } finally {auditValue(__w32Run0,__w32Sync,undefined);auditLeave(__w32Run0);}
}, [localExportModel, playerColumns, guildColumns, playerWidths, guildWidths, activeViewRequest, showLocalCompare, comparisonResult, playerValueMode, playerReadOnlyData.window]);

  const handlePlayerValueModeChange = React.useCallback((nextMode: ValueMode) => {
    if (playerColumns) return;
    setPlayerValueMode((current) => (current === nextMode ? current : nextMode));
  }, [playerColumns, setPlayerValueMode]);

  const handleGuildValueModeChange = React.useCallback((nextMode: ValueMode) => {
    setGuildValueMode((current) => (current === nextMode ? current : nextMode));
  }, []);

  const currentCompareProgress = compareProgress?.key === JSON.stringify([comparePlan.loadKey, dataRefresh]) ? compareProgress : null;
  const currentProgress = comparePending
    ? (currentCompareProgress && (!currentCompareProgress.previousDone ? currentCompareProgress.previous : !currentCompareProgress.currentDone ? currentCompareProgress.current : null))
    : dataPending && dataProgress?.key === JSON.stringify([dataRunKey, dataRefresh]) ? dataProgress.value : null;
  const progressSide = comparePending
    ? t(currentCompareProgress?.previousDone ? "guildHub.toplist.loading.current" : "guildHub.toplist.loading.baseline")
    : null;
  const phase = contextLoading ? t("guildHub.toplist.loading.archive")
    : currentProgress?.phase === "acquiring" ? t("guildHub.toplist.loading.sources")
    : currentProgress?.phase === "preparing" ? t("guildHub.toplist.loading.preparation")
    : currentProgress?.phase === "composing" ? t("guildHub.toplist.loading.composition")
    : t("guildHub.toplist.loading.table");
  const countedProgress = currentProgress && currentProgress.phase !== "composing" && currentProgress.total > 0 ? currentProgress : null;
  const loadingContent = tableBusy ? (
    <div className={styles.tableProgress} data-local-toplist-progress="true" aria-busy="true">
      <div role="status">{progressSide ? `${progressSide}: ` : ""}{phase}</div>
      <div className={styles.progressTrack} role="progressbar" aria-label={phase}
        aria-valuemin={countedProgress ? 0 : undefined}
        aria-valuemax={countedProgress?.total}
        aria-valuenow={countedProgress ? countedProgress.succeeded + countedProgress.failed : undefined}
        aria-valuetext={countedProgress ? t("guildHub.toplist.loading.counts", { ...countedProgress, pending: countedProgress.total - countedProgress.succeeded - countedProgress.failed }) : phase}>
        <div className={styles.progressFill} style={{ width: countedProgress ? `${100 * (countedProgress.succeeded + countedProgress.failed) / countedProgress.total}%` : "0%" }} />
      </div>
      <div>{countedProgress ? t("guildHub.toplist.loading.counts", { ...countedProgress, pending: countedProgress.total - countedProgress.succeeded - countedProgress.failed }) : t("guildHub.toplist.loading.waiting")}</div>
      <div>{t("guildHub.toplist.loading.phaseOnly")}</div>
    </div>
  ) : null;

  const selectServers = React.useCallback((next: string[] | ((prev: string[]) => string[]), preserveArchiveMonth = false) => {
    const current = filterServers;
    const nextServers = normalizeToplistServerSelection(typeof next === "function" ? next(current) : next);
    if (!preserveArchiveMonth) setHubMonthlyTarget(null);
    hubCommandComplete.current = true;
    setServers(nextServers);
  }, [setServers, filterServers]);

  const jumpableGuildIdentifiers = React.useMemo(
    () => [...guildIndexByIdentifier.keys()],
    [guildIndexByIdentifier],
  );
  const localSearchSource = activeDataContext;
  const archiveSearch = useLocalToplistArchiveSearch(context, showLocalCompare && comparePlan.mode === "months" ? comparePlan.currentMonth : hubMonthlyTarget, searchText, dataRefresh, searchMode === "search");
  const searchBinding = JSON.stringify([searchMode, activeDataContext?.key, archiveSearch.key, normalizeSearchText(searchText)]);
  const selectionScopeKey = JSON.stringify([compareMode, progressSinceMonth, compareFromMonth, compareToMonth, hubMonthlyTarget]);
  const searchTargetTransition = React.useRef<{ nonce: number; servers: string; scope: string; query: string } | null>(null);
  const selectedServerSet = React.useMemo(
    () => new Set(normalizeToplistServerSelection(displayedPlayerServers)),
    [displayedPlayerServers],
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

  const currentSearchResults = searchMode === "search" && searchResultBinding === searchBinding ? localSearchResults : [];
  const handleLocalSearchResultSelect = React.useCallback((result: LocalToplistSearchResult) => {
    auditFinish(targetAuditRef.current, "superseded");
    targetAuditRef.current = auditBegin("F23", "search-target-click");
    if (searchMode !== "search" || searchResultBinding !== searchBinding) { auditFinish(targetAuditRef.current, "stale-discarded"); targetAuditRef.current = null; return; }
    const canonicalServer = resolveServer(result.server)?.code;
    if (!canonicalServer || !currentSearchResults.includes(result)) { auditFinish(targetAuditRef.current, "stale-discarded"); targetAuditRef.current = null; return; }
    if (result.kind === "player") trackLocalEvent("datahub/search/player-select");
    else if (result.kind === "guild") trackLocalEvent("datahub/search/guild-select");
    const action = resolveLocalToplistSearchSelection(tab, result, canonicalServer, localSearchNonceRef.current++);

    if (action.action === "select-server") {
      searchTargetTransition.current = null;
      selectServers(normalizeToplistServerSelection([...selectedServers, action.server]), true);
      setPendingTarget(null); setPlayerFocusTarget(null); setGuildFocusTarget(null); setTargetStatus(null);
      setPendingNotice(null);
      setBottomFilterOpen(false);
      auditFinish(targetAuditRef.current, "completed", { targetAction: "server-selection" }); targetAuditRef.current = null;
      return;
    }

    setPlayerFocusTarget(null);
    setGuildFocusTarget(null);
    const nextServers = normalizeToplistServerSelection([...selectedServers, canonicalServer]);
    const expanding = !equalToplistServerSelection(nextServers, selectedServers);
    const waiting = expanding || !activeDataContext || dataState.loading || compareLoadState.loading;
    searchTargetTransition.current = waiting ? { nonce: action.target.nonce, servers: JSON.stringify(nextServers), scope: selectionScopeKey, query: searchText } : null;
    if (expanding) selectServers(nextServers, true);
    const target = { ...action.target, datasetKey: waiting ? undefined : activeDataContext?.key };
    setTargetStatus("found");
    setPendingNotice(null);
    setPendingTarget((current) => {
      if (samePendingTarget(current, target)) return current;
      return target;
    });
    if (action.action === "focus-player" && action.nextTab) setTab(action.nextTab);
    if (action.action === "focus-guild" && action.nextTab) setTab(action.nextTab);
    setBottomFilterOpen(false);
  }, [
    searchMode, activeDataContext?.key, searchResultBinding, searchBinding, searchText, currentSearchResults, selectedServers, selectionScopeKey, dataState.loading, compareLoadState.loading,
    selectServers,
    setBottomFilterOpen,
    tab,
  ]);

  React.useEffect(() => () => { if (targetAuditRef.current) auditFinish(targetAuditRef.current, "superseded", { consumerReleased: true, physicalContinues: true }); targetAuditRef.current = null; }, []);
  const handleSearchModeChange = (mode: "search" | "filter") => {
    if (mode === searchMode) return;
    auditFinish(targetAuditRef.current, "superseded"); targetAuditRef.current = null;
    searchTargetTransition.current = null;
    hubCommandComplete.current = true;
    setPendingTarget(null); setPlayerFocusTarget(null); setGuildFocusTarget(null);
    setTargetStatus(null); setPendingNotice(null); setSearchResultBinding(null);
    setLocalSearchResults([]); setLocalSearchError(null); setLocalSearchLoading(false);
    setSearchMode(mode); setDesktopSearchOpen(mode === "search");
  };
  const searchGlyphSlot = <span className={styles.searchGlyph} aria-hidden="true"><Search size={18} /></span>;
  const searchModeSlot = (
    <label className={styles.searchMode}>
      <select data-toplist-search-mode value={searchMode}
        aria-label={t("guildHub.toplist.search.modeLabel")}
        onChange={(event) => handleSearchModeChange(event.target.value as "search" | "filter")}>
        <option value="search">{t("guildHub.toplist.search.searchMode")}</option>
        <option value="filter">{t("guildHub.toplist.search.filterMode")}</option>
      </select>
    </label>
  );

  const desktopSearchQuery = searchText.trim();
  const showDesktopSearchPanel = searchMode === "search" && desktopSearchOpen && desktopSearchQuery.length >= LOCAL_TOPLIST_SEARCH_MIN_CHARS;
  const groupedLocalSearchResults = React.useMemo(() => ({
    player: currentSearchResults.filter((result) => result.kind === "player"),
    guild: currentSearchResults.filter((result) => result.kind === "guild"),
    server: currentSearchResults.filter((result) => result.kind === "server"),
  }), [currentSearchResults]);
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
            result.kind === "player" ? t(`toplists.classes.${CLASSES.find(c => c.key === result.className || c.label === result.className)?.key}`, result.className ?? "") : null,
            result.kind === "player" ? result.guildName : null,
            disabled ? t("toplists.search.outsideScope") : null,
          ].filter(Boolean);
          return (
            <button
              key={`${result.kind}:${result.server}:${result.id}`}
              type="button"
              disabled={disabled}
              data-toplist-search-server={resolveServer(result.server)?.code ?? result.server}
              data-toplist-search-identifier={result.identifier}
              className={styles.desktopSearchResult}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (disabled) return;
                handleDesktopSearchResultSelect(result);
              }}
            >
              {result.kind !== "server" ? <SearchArtwork kind={result.kind} name={result.label} appearance={result.appearance} /> : null}
              <span className={styles.desktopSearchResultText}>
              <span className={styles.desktopSearchResultLabel}>{result.label}</span>
              <span className={styles.desktopSearchResultMeta}>{detailParts.join(" · ")}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }, [groupedLocalSearchResults, handleDesktopSearchResultSelect, t]);
  const desktopLocalSearchSlot = (
    <div className={styles.desktopSearch}>
      <div className={styles.searchField}>
        {searchGlyphSlot}
        <label htmlFor="guild-hub-local-toplist-search" className="sr-only">
          {t("toplists.search.label", "Search")}
        </label>
        <input
          id="guild-hub-local-toplist-search"
          name="guild-hub-local-toplist-search"
          type="search"
          placeholder={t("guildHub.toplist.search.placeholder")}
          value={searchText}
          onFocus={() => setDesktopSearchOpen(true)}
          onChange={(event) => {
            setDesktopSearchOpen(true);
            setSearchText(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setDesktopSearchOpen(false);
          }}
          aria-label={searchMode === "filter" ? t("guildHub.toplist.search.filterMode") : t("toplists.search.label", "Search")}
          aria-expanded={showDesktopSearchPanel}
          aria-controls={searchMode === "search" ? "guild-hub-local-toplist-search-results" : undefined}
          autoComplete="off"
        />
        {searchModeSlot}
      </div>
      {showDesktopSearchPanel ? (
        <div id="guild-hub-local-toplist-search-results" className={styles.desktopSearchPanel} aria-live="polite">
          {localSearchLoading ? (
            <div className={styles.desktopSearchStatus}>{t("toplists.status.loading", "Loading...")}</div>
          ) : currentSearchResults.length ? (
            <>
              {renderDesktopLocalSearchGroup("player", t("toplists.search.players", "Players"))}
              {renderDesktopLocalSearchGroup("guild", t("toplists.search.guilds", "Guilds"))}
              {renderDesktopLocalSearchGroup("server", t("toplists.search.servers", "Servers"))}
            </>
          ) : (
            <div className={styles.desktopSearchStatus}>
              {localSearchError ?? t("guildHub.toplist.search.archiveEmpty")}
            </div>
          )}
          {localSearchError && currentSearchResults.length ? <div className={styles.desktopSearchStatus}>{localSearchError}</div> : null}
          {localSearchError ? <button type="button" onClick={() => setDataRefresh(value => value + 1)}>{t("toplists.actions.retry")}</button> : null}
        </div>
      ) : null}
    </div>
  );

  const targetLifetime = React.useRef({ key: activeDataContext?.key, query: searchText, mode: searchMode });
  React.useLayoutEffect(() => {
    const old = targetLifetime.current;
    targetLifetime.current = { key: activeDataContext?.key, query: searchText, mode: searchMode };
    const transition = searchTargetTransition.current;
    if (searchMode === "search" && transition && transition.scope === selectionScopeKey && transition.query === searchText && transition.servers === JSON.stringify(normalizeToplistServerSelection(selectedServers))) {
      // Bind only the completed dataset resulting from this explicit scope expansion.
      const expectedId = showLocalCompare ? comparePlan.currentDatasetId : dataRunKey;
      if (!dataState.loading && !compareLoadState.loading && activeDataContext?.datasetId === expectedId) {
        setPendingTarget(current => current?.nonce === transition.nonce ? { ...current, datasetKey: activeDataContext.key } : current);
        searchTargetTransition.current = null;
      }
      return;
    }
    if (transition || old.key !== activeDataContext?.key || old.query !== searchText || old.mode !== searchMode) {
      searchTargetTransition.current = null;
      setPendingTarget(null); setPlayerFocusTarget(null); setGuildFocusTarget(null); setPendingNotice(null); setTargetStatus(null);
    }
  }, [searchMode, activeDataContext?.key, searchText, selectedServers, selectionScopeKey, dataState.loading, compareLoadState.loading, showLocalCompare, comparePlan.currentDatasetId, dataRunKey]);
  React.useEffect(() => {
    if (!hubCommand) return;
    return subscribeToLocalDataDependencies({ allIdentities: true }, () => {
      setPendingTarget(null); setPlayerFocusTarget(null); setGuildFocusTarget(null);
      if (!hubCommandComplete.current) setHubIdentityRevision(revision => revision + 1);
    }, undefined, { consumer: "toplist-command-identities" });
  }, [hubCommand]);
  // The receiving parent expands full sets with its existing services, then
  // resolves confirmed references against Actual Rows. Its own generation owns
  // the command after navigation; dashboard unmount cannot revoke it.
  React.useEffect(() => {
    if (!hubCommand || hubCommandComplete.current || hubCommandAccepted.current !== hubCommand.id) return;
    if (!contextLoading && (contextError || !context?.entries.length && !hubCommand.month)) {
      setTargetStatus("unavailable"); setPendingNotice(t("hubSearch.target.offline")); return;
    }
    if (contextLoading || dataState.loading || compareLoadState.loading) return;
    if (hubCommand.month && (hubMonthlyTarget !== hubCommand.month || !entriesForData.length)) {
      setTargetStatus("unavailable"); setPendingNotice(t("hubSearch.target.missing")); return;
    }
    if (!activeDataContext || !equalToplistServerSelection(selectedServers, hubCommandServers.current) ||
        activeDataContext.datasetId !== (showLocalCompare ? comparePlan.currentDatasetId : dataRunKey) ||
        (!showLocalCompare && dataState.refresh !== dataRefresh)) return;
    let ended = false;
    const resolve = async () => {
    auditFinish(targetAuditRef.current, "superseded");
    const __audit2 = auditBegin("F23", "hub-command-target");
    targetAuditRef.current = __audit2;
    try {
      const identities = await (auditValue(__audit2, auditEnter(__audit2, "loadIdentityResolutionSnapshot"), (loadIdentityResolutionSnapshot())));
      if (ended || hubCommandComplete.current || hubCommandAccepted.current !== hubCommand.id) return auditReturn(__audit2, undefined);
      const refs = hubCommand.identifiers.flatMap(id => {
        const resolution = hubCommand.kind === "player" ? resolvePlayerIdentity(identities, id) : resolveGuildIdentity(identities, id);
        return [id, ...resolution.aliasIdentifiers].map(alias => favoriteReference(hubCommand.kind, alias)).filter((r): r is NonNullable<typeof r> => !!r);
      });
      const rows = hubCommand.kind === "player" ? activeDataContext.playerRows : activeDataContext.guildRows;
      const matching = rows.filter(row => {
        const ref = favoriteReference(hubCommand.kind, hubCommand.kind === "player" ? (row as LocalPlayerToplistRow).identifier : (row as LocalGuildToplistRow).guildIdentifier, row.server);
        return ref && ref.serverNamespace === hubCommand.server.toLowerCase() && refs.some(r => referenceKey(r) === referenceKey(ref));
      });
      if (matching.length !== 1) {
        setTargetStatus(matching.length ? "unresolved" : activeDataContext.result.failedSelections.length ? "unavailable" : "outsideDataset");
        setPendingNotice(t(matching.length ? "hubSearch.target.ambiguous" : activeDataContext.result.failedSelections.length ? "hubSearch.target.offline" : "guildHub.toplist.search.missing", { name: hubCommand.label })); return auditReturn(__audit2, undefined);
      }
      const row = matching[0];
      const identifier = hubCommand.kind === "player" ? (row as LocalPlayerToplistRow).identifier.toLowerCase() : resolveLocalGuildFocusIdentifier(toPublicGuildRow(row as LocalGuildToplistRow));
      if (!identifier) { setTargetStatus("unresolved"); setPendingNotice(t("hubSearch.target.unresolved")); return auditReturn(__audit2, undefined); }
      if (__audit2) __audit2.returned = true; // retain only this audit until existing FocusACK/cleanup
      setPendingTarget({ kind: hubCommand.kind, identifier, server: hubCommand.server, label: hubCommand.label,
        nonce: localSearchNonceRef.current++, datasetKey: activeDataContext.key });
      setPlayerFocusTarget(null); setGuildFocusTarget(null); setTargetStatus("found"); setPendingNotice(null);

    } catch (__auditError) { auditError(__audit2, __auditError); throw __auditError; }
    finally { auditLeave(__audit2); }
};
    void resolve().catch(() => { if (!ended) { setTargetStatus("error"); setPendingNotice(t("hubSearch.target.failed")); } });
    return () => { ended = true; };
  }, [searchMode, hubCommand, contextLoading, contextError, context, dataState.loading, compareLoadState.loading,
    activeDataContext?.key, selectedServers, showLocalCompare, comparePlan.currentMonth, comparePlan.currentDatasetId, dataRunKey, dataState.refresh, dataRefresh, hubMonthlyTarget, entriesForData, hubIdentityRevision, t]);
  // Filter correction retains the target wish but gives it a new view attempt.
  React.useLayoutEffect(() => { setPlayerFocusTarget(null); setGuildFocusTarget(null); }, [activeTargetViewKey]);
  const latestFocusContext = React.useRef({ datasetKey: activeDataContext?.key, viewKey: activeTargetViewKey, player: playerFocusTarget, guild: guildFocusTarget });
  latestFocusContext.current = { datasetKey: activeDataContext?.key, viewKey: activeTargetViewKey, player: playerFocusTarget, guild: guildFocusTarget };
  const handleFocusResult = React.useCallback((ack: ToplistFocusResult) => {
    const current = latestFocusContext.current;
    const focus = ack.identifier === current.player?.identifier ? current.player : current.guild;
    if (!focus || focus.completed || ack.attempt !== focus.attempt || ack.datasetKey !== current.datasetKey || ack.viewKey !== current.viewKey) return;
    const complete = (value: LocalToplistFocusTarget) => value?.attempt === ack.attempt ? { ...value, completed: true } : value;
    setPlayerFocusTarget(complete); setGuildFocusTarget(complete);
    if (targetAuditRef.current) { auditEvent(targetAuditRef.current, "focus-ack", { ackStatus: ack.status, datasetKey: ack.datasetKey, viewKey: ack.viewKey }); auditFinish(targetAuditRef.current, ack.status === "visibleAck" ? "completed" : "missing"); targetAuditRef.current = null; }
    setPendingTarget(null);
    hubCommandComplete.current = true;
    setTargetStatus(ack.status);
    setPendingNotice(ack.status === "visibleAck"
      ? t("guildHub.toplist.search.visibleAck", "{{name}} is visible and highlighted.", { name: pendingTarget?.label ?? ack.identifier })
      : t("guildHub.toplist.search.unresolved", "The target row could not be visibly reached."));
  }, [playerFocusTarget, guildFocusTarget, activeDataContext?.key, activeTargetViewKey, pendingTarget?.label, t]);
  React.useEffect(() => {
    const target = pendingTarget;
    if (!target || target.datasetKey !== activeDataContext?.key) return;
    if (target.kind === "guild" && target.archive && activeDataContext) {
      const matches = activeDataContext.guildRows.filter(row => normalizeToplistServerSelection([row.server])[0] === target.server &&
        normalizeSearchIdentifier(row.guildIdentifier) === normalizeSearchIdentifier(target.archive!.identifier));
      const focusIdentifier = matches.length === 1 ? resolveLocalGuildFocusIdentifier(toPublicGuildRow(matches[0])) : null;
      if (focusIdentifier && focusIdentifier !== target.identifier) {
        setPendingTarget({ ...target, identifier: focusIdentifier });
        return;
      }
    }
    if (playerFocusTarget?.attempt === `${target.nonce}:${activeTargetViewKey}` || guildFocusTarget?.attempt === `${target.nonce}:${activeTargetViewKey}`) return;

    if (target.kind === "player" && tab !== "players") return;
    if (target.kind === "guild" && tab !== "guilds") return;

    const blockers: string[] = [];
    let blockedStatus: LocalToplistTargetStatus = "hiddenByFilters";
    if ((!showLocalCompare && (dataState.loading || viewState.loading || !currentViewResult)) || !activeDataContext) {
      blockedStatus = "pending";
      blockers.push(t("guildHub.toplist.search.blocker.dataset", "dataset is still loading"));
    }
    if (!selectedServerSet.has(target.server)) {
      blockers.push(t("guildHub.toplist.search.blocker.server", "server is not selected"));
    }
    if (unavailableServerSet.has(target.server)) {
      blockers.push(t("guildHub.toplist.search.blocker.unavailable", "server has no local toplist snapshot"));
    }

    if (target.kind === "player") {
      const sourceRow = sourcePlayerByIdentifier.get(playerTargetKey(target.server, target.identifier));
      if (!sourceRow && activeDataContext && !dataState.loading) {
        setTargetStatus("outsideDataset");
        setPendingNotice(t("guildHub.toplist.search.missing", "{{name}} is not available in the current local dataset.", { name: target.label }));
        setPendingTarget(null);
        return;
      }

      if (sourceRow) {
        const classSet = selectedClasses.map((value) => String(value ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-")).filter(Boolean);
        const rowClass = String(sourceRow.class ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
        if (playerClassMode === "selected" && (!rowClass || !classSet.includes(rowClass))) {
          blockers.push(t("guildHub.toplist.search.blocker.class", "class filter"));
        }
        const rowGuild = normalizeGuildKey(String(sourceRow.guild ?? ""));
        if (!showLocalCompare && selectedGuildSet && (!rowGuild || !selectedGuildSet.has(rowGuild))) {
          blockers.push(t("guildHub.toplist.search.blocker.guild", "guild filter"));
        }
        if (favoritesOnly && !favoritePlayerSet.has(target.identifier)) {
          blockers.push(t("guildHub.toplist.search.blocker.favorites", "favorites only"));
        }
      }

      const targetKey = playerTargetKey(target.server, target.identifier);
      const windowTargetKey = playerWindow.target ? playerTargetKey(playerWindow.target.server, playerWindow.target.identifier) : null;
      if (sourceRow && !blockers.length && activeViewRequest &&
          (playerWindow.key !== activeViewRequest.contextKey || windowTargetKey !== targetKey)) {
        setPlayerWindow({ key: activeViewRequest.contextKey, start: 0, target: { server: target.server, identifier: target.identifier } });
        setPendingNotice(null);
        return;
      }
      if (viewState.requestKey !== activeViewRequest?.key ||
          (playerWindow.target && currentViewResult?.targetIndex === undefined)) return;
      const targetIndex = fullPlayerIndexByIdentifier.get(targetKey);
      if (sourceRow && !sourceRow.localScanId) {
        setTargetStatus("missingSource"); setPendingTarget(null);
        setPendingNotice(t("guildHub.toplist.search.missingSource", "The target observation has no local source.")); return;
      }
      if (targetIndex == null && sourceRow) {
        if (!blockers.length) blockedStatus = "outsideView/Cohort";
        blockers.push(showLocalCompare
          ? t("guildHub.toplist.search.blocker.compare", "not on the current compare target side")
          : t("guildHub.toplist.search.blocker.view", "outside the current filtered toplist scope"));
      }

      if (blockers.length) {
        setTargetStatus(blockedStatus);
        setPendingNotice(explainPendingBlockers(target, blockers));
        return;
      }
      if (targetIndex == null) return;

      if (!visiblePlayerIdentifierSet.has(playerTargetKey(target.server, target.identifier))) return;

      setTargetStatus("pending");
      setPlayerFocusTarget({ identifier: target.identifier, server: sourceRow?.server, nonce: target.nonce, targetGeneration: target.nonce, datasetKey: activeDataContext!.key, viewKey: activeTargetViewKey, attempt: `${target.nonce}:${activeTargetViewKey}` });
      setPendingNotice(null);
      return;
    }

    const sourceGuild = sourceGuildByIdentifier.get(target.identifier);
    if (!sourceGuild && activeDataContext && !dataState.loading) {
      setTargetStatus("outsideDataset");
      setPendingNotice(t("guildHub.toplist.search.missing", "{{name}} is not available in the current local dataset.", { name: target.label }));
      setPendingTarget(null);
      return;
    }

    const favoriteCandidate = target.identifier.replace("__", "_g");
    if (
      sourceGuild &&
      favoritesOnly &&
      !favoriteGuildSet.has(target.identifier) &&
      !favoriteGuildSet.has(favoriteCandidate)
    ) {
      blockers.push(t("guildHub.toplist.search.blocker.favorites", "favorites only"));
    }
    if (sourceGuild && !sourceGuild.localScanId) {
      setTargetStatus("missingSource"); setPendingTarget(null);
      setPendingNotice(t("guildHub.toplist.search.missingSource", "The target observation has no local source.")); return;
    }
    if (!guildIndexByIdentifier.has(target.identifier) && sourceGuild) {
      if (!blockers.length) blockedStatus = "outsideView/Cohort";
      blockers.push(showLocalCompare
        ? t("guildHub.toplist.search.blocker.compare", "not on the current compare target side")
        : t("guildHub.toplist.search.blocker.guildView", "outside the current guild view/cohort (normal limit: 250)"));
    }

    if (blockers.length) {
      setTargetStatus(blockedStatus);
      setPendingNotice(explainPendingBlockers(target, blockers));
      return;
    }
    if (!guildIndexByIdentifier.has(target.identifier)) return;

    setTargetStatus("pending");
    setGuildFocusTarget({ identifier: target.identifier, server: sourceGuild?.server, nonce: target.nonce, targetGeneration: target.nonce, datasetKey: activeDataContext!.key, viewKey: activeTargetViewKey, attempt: `${target.nonce}:${activeTargetViewKey}` });
    setPendingNotice(null);
  }, [
    activeDataContext, activeTargetViewKey, playerFocusTarget, guildFocusTarget, currentViewResult,
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
    playerClassMode,
    selectedGuildSet,
    selectedServerSet,
    showLocalCompare,
    sourceGuildByIdentifier,
    sourcePlayerByIdentifier,
    t,
    tab,
    unavailableServerSet,
    viewState.loading,
    playerWindow, activeViewRequest,
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
    const initAudit = auditBegin("F22", "search-session-dataset-init");
    auditFields(initAudit, { trigger: "local-dataset-effect" });
    if (initAudit) auditFields(initAudit, { players: source.playerRows.length, guilds: source.guildRows.length, datasetId: source.datasetId });
    setLocalSearchReadyDatasetId((current) => (current === source.key ? current : null));
    auditValue(initAudit, auditEnter(initAudit, "dataset-init-or-reuse"), worker.setData(source.datasetId, source.playerRows, source.guildRows, source.contentRevision))
      .then(() => {
        if (!cancelled) { setLocalSearchReadyDatasetId(source.key); auditEvent(initAudit, "search-dataset-ready"); } else auditFinish(initAudit, "stale-discarded");
      })
      .catch((error) => {
        auditError(initAudit, error);
        if (cancelled || error instanceof LocalToplistViewWorkerCancelledError) return;
        setLocalSearchReadyDatasetId(null);
        setLocalSearchError(error instanceof Error ? error.message : String(error ?? "unknown_error"));
      }).finally(() => auditFinish(initAudit));
    return () => {
      cancelled = true; auditFinish(initAudit, "superseded", { consumerReleased: true, physicalContinues: true });
    };
  }, [localSearchSource]);

  React.useEffect(() => {
    const query = searchText.trim();
    if (searchMode !== "search") { setLocalSearchResults([]); setLocalSearchError(null); setLocalSearchLoading(false); return; }
    let cancelled = false;
    setLocalSearchResults([]);
    setLocalSearchError((archiveSearch.error ? t("toplists.errors.search") : null) ?? (archiveSearch.incomplete ? t("guildHub.toplist.search.archiveIncomplete") : null));
    if (query.length < LOCAL_TOPLIST_SEARCH_MIN_CHARS) { setLocalSearchLoading(false); return; }
    const searchAudit = auditBegin("F22", "applied-query");
    auditFields(searchAudit, { trigger: "applied-query-effect", archiveDataReady: !archiveSearch.loading });
    auditLink(searchAudit, archiveSearch.auditPreparationId, "input-preparation");
    auditLink(searchAudit, auditResultId(archiveSearch.results), "render-observation");
    const debounce = auditEnter(searchAudit, "intentional-debounce");
    auditValue(searchAudit, debounce, undefined);
    const debounceStart = searchAudit ? performance.now() : 0;
    setLocalSearchLoading(true);
    const timeout = window.setTimeout(async () => {
      if (searchAudit) auditFields(searchAudit, { debounceElapsedMs: performance.now() - debounceStart, archiveDataReady: !archiveSearch.loading, localDataReady: localSearchReadyDatasetId === localSearchSource?.key });
      if (archiveSearch.loading) { auditFinish(searchAudit, "partial", { waitingForArchiveData: true }); return; }
      // The existing row worker supplies known cohort status only. It no longer
      // determines the archive inventory or excludes unloaded servers.
      let results = archiveSearch.results;
      const worker = searchWorkerRef.current;
      if (worker && localSearchSource && localSearchReadyDatasetId === localSearchSource.key) {
        try {
          const response = await auditValue(searchAudit, auditEnter(searchAudit, "local-query"), worker.requestSearch({ datasetId: localSearchSource.datasetId, contentRevision: localSearchSource.contentRevision,
            query, limit: LOCAL_TOPLIST_SEARCH_RESULT_LIMIT, jumpableGuildIdentifiers }));
          if (cancelled) return;
          results = results.map(result => {
            const known = response.results.find(row => row.kind === result.kind && row.identifier.toLowerCase() === localToplistArchiveFocusIdentifier(result, resolveServer(result.server)?.code ?? result.server) &&
              resolveServer(row.server)?.code === resolveServer(result.server)?.code);
            return known ? { ...result, status: known.status, statusReason: known.statusReason } : result;
          });
        } catch (error) {
          auditError(searchAudit, error);
          if (cancelled || error instanceof LocalToplistViewWorkerCancelledError) { auditFinish(searchAudit, "aborted"); return; }
          setLocalSearchError(error instanceof Error ? error.message : String(error));
        }
      }
      if (cancelled) return;
      setSearchResultBinding(searchBinding);
      auditAccept(searchAudit, results);
      auditValue(searchAudit, auditEnter(searchAudit, "state-enqueue", "sync-elapsed"), setLocalSearchResults(results));
      setLocalSearchLoading(false); auditFinish(searchAudit);
    }, LOCAL_TOPLIST_SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; window.clearTimeout(timeout); auditFinish(searchAudit, "superseded", { consumerReleased: true, physicalContinues: true }); };
  }, [searchMode, archiveSearch.key, archiveSearch.results, archiveSearch.loading, archiveSearch.incomplete, archiveSearch.error, searchBinding, localSearchReadyDatasetId, localSearchSource, jumpableGuildIdentifiers, searchText, t]);

  const profileNavigation = useLocalProfileNavigation("toplist");
  const navigate = useNavigate();
  const handleOpenProfile = React.useCallback((row: ToplistPlayerRow) => {
    const local = (row as ToplistPlayerRow & { __localRow?: LocalPlayerToplistRow & { currentSeed?: LocalPlayerCurrentSeed } }).__localRow;
    if (!local) return;
    profileNavigation.openExact(local.identifier, local.sourceServer || local.server, local.localScanId,
      local.scanTimestamp, local.identifier.toLowerCase(), local.currentSeed);
  }, [profileNavigation.openExact]);

  const favoriteFocusGeneration = React.useRef(0);
  React.useLayoutEffect(() => { favoriteFocusGeneration.current++; return () => { favoriteFocusGeneration.current++; }; }, [searchMode, activeDataContext?.key, searchText]);
  const handleFavoriteGuildFocus = React.useCallback(async (guild: GuildHubSelectionGuild, saved?: HubFavorite) => {
    const attempt = ++favoriteFocusGeneration.current;
    const favorite = saved ?? guildFavorite(guild, 0, null, false);
    let ref = favorite.reference;
    try {
      const identity = resolveFavorite(favorite, await loadIdentityResolutionSnapshot());
      if (identity.identity === "conflict") ref = null;
      if (!await revalidateFavoriteProjectionTarget(favorite)) ref = null;
    } catch { ref = null; }
    if (attempt !== favoriteFocusGeneration.current) return;
    if (!ref) {
      setTargetStatus("unresolved");
      setPendingNotice(t("guildHub.toplist.search.guildUnresolved"));
      return;
    }
    // The same pending-target/DOM-ACK path as local search. No server/filter write.
    const server = normalizeToplistServerSelection([ref.serverNamespace])[0] ?? ref.serverNamespace;
    const identifier = `${server.toLowerCase()}__${ref.entityId}`;
    setPlayerFocusTarget(null); setGuildFocusTarget(null);
    setPendingTarget({ kind: "guild", server, identifier, label: guild.name, nonce: localSearchNonceRef.current++, datasetKey: activeDataContext?.key });
    setTargetStatus("found"); setPendingNotice(null); setTab("guilds");
  }, [activeDataContext?.key, t]);

  const handlePageFavorite = React.useCallback((favorite: HubFavorite) => { if (favorite.guild) return handleFavoriteGuildFocus(favorite.guild, favorite); }, [handleFavoriteGuildFocus]);
  useLocalFavoritePageAction(t("hubNavigation.useToplist"), handlePageFavorite, { showBelowCard: false, toplistServers: selectedServers });
  const openGuildDashboard = React.useCallback((local: LocalGuildToplistRow | LocalPlayerToplistRow | undefined) => {
    const ref = local && favoriteReference("guild", local.guildIdentifier, local.sourceServer || local.server);
    if (!local || !ref) { setTargetStatus("unresolved"); setPendingNotice(t("guildHub.toplist.search.guildUnresolved")); return; }
    profileNavigation.openGuild(ref, { source: local.localScanId, at: local.scanTimestamp, snapshot: `${local.localScanId}::${local.scanTimestamp}` });
  }, [profileNavigation.openGuild, t]);
  const handleGuildProfile = React.useCallback((row: ToplistGuildRow) => {
    openGuildDashboard((row as ToplistGuildRow & { __localRow?: LocalGuildToplistRow }).__localRow);
  }, [openGuildDashboard]);
  const handlePlayerGuildProfile = React.useCallback((row: ToplistPlayerRow) => {
    openGuildDashboard((row as ToplistPlayerRow & { __localRow?: LocalPlayerToplistRow }).__localRow);
  }, [openGuildDashboard]);
  const unavailableSelectedServer = !showLocalCompare && selectedServers.some(server => !availableServerSet.has(server));
  const unavailableServers = showLocalCompare ? [] : entryResolution.unavailableServerCodes;
  const isFullyUnavailable = entryResolution.availabilityState === "unavailable";
  const hasCurrentEntries = showLocalCompare ? comparePlan.currentEntries.length > 0 : Boolean(context?.entries.length);
  const compareNoticeText = React.useMemo(() => {
    if (!compareExpected) return null;
    if (tableBusy) return null;
    if (compareError) return t("toplists.errors.compare");
    if (comparePlan.issues.length) {
      return comparePlan.issues.map(issue => t(`toplists.compareIssues.${issue.code === "missing-current-server" && !issue.month ? "missing-current-server-current" : issue.code}`, { server: issue.server ?? "", month: issue.month ?? "" })).join(" ");
    }
    if (showLocalCompare) {
      return null;
    }
    return t("toplists.compareMissingSnapshot", "Baseline missing for {{key}}.", { key: comparePlan.previousMonth || comparePlan.currentMonth || "" });
  }, [compareError, compareExpected, compareLoadState.loading, comparePlan.currentMonth, comparePlan.issues, comparePlan.previousMonth, showLocalCompare, tableBusy, t]);

  const tableNotices = <>
          {contextError ? <Notice tone="error" text={t("toplists.errors.archive")} /> : null}
          {!contextLoading && !hasCurrentEntries && !hubMonthlyTarget ? <Notice tone="warning" text={t("guildHub.toplist.empty.noCurrent", "No current toplist selection is available.")} /> : null}
          {unavailableSelectedServer ? <Notice tone="warning" text={t("pageContext.serverUnavailable")} /> : null}
          {!isFullyUnavailable && unavailableServers.length ? (
            <Notice tone="warning" text={t("guildHub.toplist.partial", "{{count}} selected server(s) could not be loaded.", { count: unavailableServers.length })} />
          ) : null}
          {dataState.error ? <Notice tone="error" text={t("toplists.errors.data")} /> : null}
          {dataState.result?.failedSelections.length ? (
            <Notice tone="warning" text={t("guildHub.toplist.loading.failedSources", { count: dataState.result.failedSelections.length })} />
          ) : null}
          {compareExpected && (compareLoadState.previous?.failedSelections.length || compareLoadState.current?.failedSelections.length) ? (
            <Notice tone="warning" text={t("guildHub.toplist.loading.failedSources", { count: (compareLoadState.previous?.failedSelections.length ?? 0) + (compareLoadState.current?.failedSelections.length ?? 0) })} />
          ) : null}
          {dataState.error || dataState.result?.failedSelections.length || compareLoadState.previous?.failedSelections.length || compareLoadState.current?.failedSelections.length || viewState.error || localSearchError ? <>{viewState.error || localSearchError ? <Notice tone="error" text={viewState.error ? t("toplists.errors.view") : localSearchError!} /> : null}<button type="button" onClick={() => setDataRefresh(value => value + 1)}>{t("toplists.actions.retry")}</button></> : null}
          {!selectedServers.length ? <Notice tone="warning" text={t("toplists.players.selectServerHint", "Please select at least one server.")} /> : null}
          {compareNoticeText ? <Notice tone={compareError || comparePlan.status === "unavailable" ? "error" : "warning"} text={compareNoticeText} /> : null}
          {hubMonthlyTarget ? <div className={styles.statusLine}>
            {t("hubSearch.toplistScope", { month: hubMonthlyTarget })}
            <button type="button" onClick={() => handleCompareModeChange("off")}>{t("hubSearch.current")}</button>
          </div> : null}
          {pendingNotice ? <div role="status" data-toplist-target-status={targetStatus ?? "unresolved"}><Notice tone="warning" text={pendingNotice} /></div> : null}

  </>;

  return (
    <div className={styles.page}>
      {(persistenceError || serverContext.error) && <Frame>
        <div className={dashboardStyles.topbar}>
          {persistenceError && <span role="alert">{t(persistenceError === "conflict" ? "localSettings.conflict" : "localSettings.writeError")}</span>}
          {serverContext.error && <span role="alert">{t("pageContext.session")}</span>}
        </div>
      </Frame>}

      <ToplistViewProvider><ToplistsDataStaticProvider value={staticToplistsValue}>
        <ToplistFilterWindow open={!filtersCollapsed} onClose={() => setFiltersCollapsed(true)}>
          <HudFilters
            localWindow
            hideServerButton
            mode={tab}
            sortValue={tab === "guilds" ? guildSort.metricKey : playerSort.metricKey}
            sortOptions={(tab === "guilds" ? guildSortOptions : playerSortOptions).map(option => ({ metricKey: option.metricKey, label: toplistColumnLabel(tab, option.columnKey, t) }))}
            onSortValueChange={tab === "guilds" ? changeGuildSort : changePlayerSort}
            sortDirection={tab === "guilds" ? guildSort.direction : playerDirection}
            onToggleSortDirection={() => tab === "guilds" ? setGuildSort(sort => ({ ...sort, direction: sort.direction === "asc" ? "desc" : "asc" })) : setPlayerDirection(direction => direction === "asc" ? "desc" : "asc")}
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
            onExportPng={handleLocalExportPng}
            exportDisabled={!localExportModel.canExport}
            onResetAll={() => { resetAll(); setPlayerDirection("desc"); selectServers([]); }}
          />
        </ToplistFilterWindow>
        <div ref={serverPickerShellRef} data-server-picker-shell>
        <ContentShell
          mode="card"
          leftWidth={0}
          rightWidth={0}
          outerPadding="p-0"
          headerContent={<LocalTitleNavigation title={t("toplists.headerLabel", "Toplists")} onBack={() => navigate(safeLocalReturn(location.state?.returnTo) === location.pathname + location.search ? DATA_HUB : safeLocalReturn(location.state?.returnTo) ?? DATA_HUB, { replace: true, state: location.state?.profileReturnState })} />}
          headerTransparent
          subheader={(
            <>
              <div className={styles.selectionBar}>
                <div className={styles.tabGroup}>
                  <TopTab active={tab === "players"} onClick={() => setTab("players")} label={t("nav.players", "Players")} />
                  <TopTab active={tab === "guilds"} onClick={() => setTab("guilds")} label={t("nav.guilds", "Guilds")} />
                </div>
                {filterMode === "hud" ? (
                  <div className={styles.selectionSearch}>
                    <button
                      type="button"
                      className={`${styles.tile} ${styles.serverTile}`}
                      onClick={() => setServerSheetOpen(true)}
                      aria-haspopup="dialog"
                      aria-expanded={serverSheetOpen || false}
                      aria-label={t("guildHub.toplist.servers.selectedCount", { count: selectedServerCount })}
                      title={t("guildHub.toplist.servers.selectedCount", { count: selectedServerCount })}
                    >
                      <span className={styles.serverGlobe} aria-hidden="true">🌐</span>
                      <span className={styles.serverCount} aria-hidden="true">{selectedServerCount}</span>
                    </button>
                    {desktopLocalSearchSlot}
                  </div>
                ) : null}
                <div className={styles.rightButtons}>
                  <ToplistCompareDropdown
                    compareMode={compareMode} onCompareModeChange={handleCompareModeChange}
                    progressSinceMonth={progressSinceMonth} onProgressSinceMonthChange={handleProgressSinceMonthChange}
                    compareFromMonth={compareFromMonth} onCompareFromMonthChange={handleCompareFromMonthChange}
                    compareToMonth={compareToMonth} onCompareToMonthChange={handleCompareToMonthChange}
                    monthOptions={monthOptions} />
                <button
                  type="button"
                  className={styles.tile}
                  onClick={() => setFiltersCollapsed((prev) => !prev)}
                  aria-expanded={!filtersCollapsed}
                  aria-controls="guild-hub-local-toplists-filters"
                >
                  <span className={styles.tileTitle}>
                    {filtersCollapsed ? t("toplists.filters.showHud", "Show filters") : t("toplists.filters.hideHud", "Hide filters")}
                  </span>
                </button>
                </div>
              </div>
            </>
          )}
          centerFramed={false}
          stickyTopbar
          stickySubheader={false}
          topbarHeight={56}
        >
          <ListSwitcher />

          {tab === "players" ? (
            <TableDataView
              localLayout
              localLoadingContent={loadingContent}
              localNoticeContent={tableNotices}
              servers={selectedServers}
              classes={selectedClasses}
              range="all"
              sortKey={playerSort.metricKey}
              localColumns={playerColumns} localColumnWidths={playerWidths} localSort={playerSort} onLocalSort={clickPlayerHeader}
              compareMode={compareMode}
              progressSinceMonth={progressSinceMonth}
              compareFromMonth={compareFromMonth}
              compareToMonth={compareToMonth}
              showAvgModeControl={!filtersCollapsed}
              focusIdentifier={playerFocusTarget?.identifier ?? null}
              focusRank={null}
              focusNonce={playerFocusTarget?.nonce ?? null}
              focusRequest={playerFocusTarget}
              onFocusResult={handleFocusResult}
              tableRef={tableRef}
              renderMode="live"
              presetReadOnlyData={playerReadOnlyData}
              onPlayerAvgModeChange={handlePlayerValueModeChange}
              onOpenPlayerProfile={handleOpenProfile}
              onOpenGuildProfile={handlePlayerGuildProfile}
              renderFirestoreProfileOverlay={false}
            />
          ) : (
            <GuildToplists
              localLayout
              localLoadingContent={loadingContent}
              localNoticeContent={tableNotices}
              serverCodes={selectedServers}
              sortKey={guildSort.metricKey}
              localColumns={guildColumns} localColumnWidths={guildWidths} localSort={guildSort} onLocalSort={clickGuildHeader}
              showAvgModeControl={!filtersCollapsed}
              tableRef={tableRef}
              renderMode="live"
              presetReadOnlyData={guildReadOnlyData}
              onAvgModeChange={handleGuildValueModeChange}
              renderFirestoreGuildOverlay={false}
              onOpenGuildProfile={handleGuildProfile}
              focusIdentifier={guildFocusTarget?.identifier ?? null}
              focusNonce={guildFocusTarget?.nonce ?? null}
              focusRequest={guildFocusTarget}
              onFocusResult={handleFocusResult}
            />
          )}

          <ServerSheet
            mode="modal"
            open={serverSheetOpen}
            onClose={() => setServerSheetOpen(false)}
            shellRef={serverPickerShellRef}
            serversByRegion={availableServerGroups}
            selected={selectedServers}
            onToggle={(server) => selectServers((current) => current.includes(server) ? current.filter((item) => item !== server) : [...current, server])}
            onSelectAllInRegion={(region) => selectServers((current) => [...current, ...(availableServerGroups[region] ?? [])])}
            onClearAll={() => selectServers([])}
          />

          <BottomFilterSheet
            open={filterMode === "sheet" && bottomFilterOpen}
            onClose={() => setBottomFilterOpen(false)}
            searchModeSlot={searchModeSlot}
            searchFieldClassName={styles.searchField}
            searchGlyphSlot={searchGlyphSlot}
            searchLabel={searchMode === "filter" ? t("guildHub.toplist.search.filterMode") : t("guildHub.toplist.search.searchMode")}
            searchPlaceholder={t("guildHub.toplist.search.placeholder")}
            localSearchLoading={localSearchLoading}
            localSearchResults={currentSearchResults}
            localSearchEmptyText={localSearchError ?? t("guildHub.toplist.search.archiveEmpty")}
            localSearchNotice={localSearchError ?? undefined}
            onLocalSearchRetry={() => setDataRefresh(value => value + 1)}
            renderLocalSearchArtwork={result => result.kind !== "server" ? <SearchArtwork kind={result.kind} name={result.label} appearance={result.appearance} /> : null}
            onLocalSearchResultSelect={searchMode === "search" ? handleLocalSearchResultSelect : undefined}
          />

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
                    centerCellContents
                    servers={snapshot.selectedServers}
                    classes={snapshot.selectedClasses}
                    range="all"
                    sortKey={snapshot.sort.metricKey}
                    localColumns={snapshot.columns} localColumnWidths={snapshot.widths} localSort={snapshot.sort}
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
                  centerCellContents
                  serverCodes={snapshot.selectedServers}
                  sortKey={snapshot.sort.metricKey}
                    localColumns={snapshot.columns} localColumnWidths={snapshot.widths} localSort={snapshot.sort}
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
        </div>
      </ToplistsDataStaticProvider></ToplistViewProvider>
    </div>
  );
}

export default function GuildHubToplist() {
  return (
    <FilterProvider localClassSelection storageKey="SFH_LOCAL_TL_FILTERS_V1" migrateFrom="TL_FILTERS_V2">
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
      className={styles.tile}
    >
      <span className={styles.tileTitle}>{label}</span>
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
  _rank?: number;
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
    attributeValues: row.attributeValues,
    ratioBase: row.ratioBase,
    ratioTotal: row.ratioTotal,
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
    _rank: row.tableRank,
  };
}

function toPublicGuildRow(row: LocalGuildToplistRow & { tableRank?: number }): ToplistGuildRow & {
  __localRow: LocalGuildToplistRow;
  guildIdentifier: string;
  tableRank?: number;
  _rank?: number;
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
    _rank: row.tableRank,
  };
}

function latestUpdatedAt(rows: readonly { latestScanAtSec?: number | null }[] | undefined) {
  const latest = Math.max(0, ...(rows ?? []).map((row) => row.latestScanAtSec ?? 0));
  return latest > 0 ? latest * 1000 : null;
}
