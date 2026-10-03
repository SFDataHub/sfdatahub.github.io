import React from "react";
import ContentShell from "../../components/ContentShell";
import GuildContextBar from "../../components/guilds/GuildContextBar";
import { DataHubLoadingState } from "../../components/ui/shared/DataHubLoadingState";
import AnchoredLineChart from "../../components/ui/charts/AnchoredLineChart";
import type { AnchoredLineChartVerticalMarker } from "../../components/ui/charts/AnchoredLineChart";
import {
  collectionGroup,
  endAt,
  getDocs,
  limit,
  orderBy,
  query as fsQuery,
  startAt,
  where,
} from "firebase/firestore";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { db } from "../../lib/firebase";
import {
  beginReadScope,
  endReadScope,
  traceGetDocs,
  type FirestoreTraceScope,
} from "../../lib/debug/firestoreReadTrace";
import {
  getGuildHubLocalScan,
  listGuildHubScanSummaries,
  parseServerFromGuildIdentifier,
  subscribeToSfDataHubLocalScanChanges,
} from "../../lib/guilds/localScanLibrary";
import { acquireLocalFirstScans } from "../../lib/scanArchive/localFirstScanAcquisition";
import {
  buildGuildAnalyticsPlayerComparison,
  buildGuildAnalyticsSeries,
  buildGuildAnalyticsProgressReport,
  describeGuildAnalyticsIdentityScope,
  GUILD_ANALYTICS_METRICS,
  GUILD_ANALYTICS_RANGES,
  type GuildAnalyticsPlayerCandidate,
  type GuildAnalyticsPlayerComparison,
  type GuildAnalyticsMetricDefinition,
  type GuildAnalyticsMetricKey,
  type GuildAnalyticsPoint,
  type GuildAnalyticsProgressPeriodKey,
  type GuildAnalyticsProgressReport,
  type GuildAnalyticsRangeSelection,
} from "../../lib/guilds/localGuildAnalytics";
import {
  ensureGuildAnalyticsScopedDataFromSummaries,
  type GuildAnalyticsDiagnosticEntry,
  type GuildAnalyticsDerivedData,
  type GuildAnalyticsLoadPhase,
  type GuildAnalyticsLoadPhaseUpdate,
  type GuildAnalyticsSourceDiagnostic,
} from "../../lib/guilds/localGuildAnalyticsStore";
import {
  loadIdentityResolutionSnapshot,
  type IdentityResolutionSnapshot,
} from "../../lib/identities/identityResolution";
import {
  buildLocalFightParticipationSeries,
  type FightParticipationSeries,
} from "../../lib/guilds/localFightAnalytics";
import { buildGuildAnalyticsFusionMarkers } from "../../lib/guilds/guildAnalyticsFusionMarkers";
import type { GuildAnalyticsFusionMarker } from "../../lib/guilds/guildAnalyticsFusionMarkers";
import { subscribeToFightTrackingChanges } from "./fightTrackingStore";
import {
  loadGuildAnalyticsLocalFirstData,
  type GuildAnalyticsLocalFirstAcquisitionOutcome,
} from "./guildAnalyticsLocalFirst";
import styles from "./Fusion.module.css";
import { useGuildHubSelection } from "./hooks/useGuildHubSelection";
import {
  FreshnessCode,
  FRESHNESS_DISPLAY,
  formatCountdown,
  formatDate,
  formatRelative,
} from "./plannerData";

type GuildClassSlice = {
  label: string;
  percent: number;
};

type GuildSummary = {
  id: string;
  name: string;
  tagline: string;
  server: string;
  members: number;
  avgLevel: number;
  lastScanAt: string;
  updatedAt: string;
  nextUpdateAt: string;
  freshness: FreshnessCode;
  classes: GuildClassSlice[];
};

type SlotKey = "guildA" | "guildB";
type AnalyticsTabKey = "overview" | "progress" | "compare";

const SERVER_OPTIONS = ["EU-01", "EU-02", "US-01", "US-02", "ASIA-01"] as const;
const ANALYTICS_TABS: Array<{ key: AnalyticsTabKey; label: string }> = [
  { key: "overview", label: "Uebersicht" },
  { key: "progress", label: "Fortschritt" },
  { key: "compare", label: "Vergleich" },
];
const PROGRESS_PERIODS: Array<{ key: GuildAnalyticsProgressPeriodKey; label: string }> = [
  { key: "weekly", label: "Woechentlich" },
  { key: "monthly", label: "Monatlich" },
];
const GUILD_AVERAGE_COLOR = "#55dba6";
const PLAYER_HISTORY_OTHER_GUILD_COLOR = "#b8b8b8";
const PLAYER_SERIES_COLORS = ["#f2a65a", "#7da5d8", "#d481e8", "#88d96b", "#f06f8f", "#66c7d9", "#ffd166", "#b68cff"];
const GUILD_AVERAGE_SERIES_KEY = "guild-average";

const getPlayerSeriesColor = (seriesIndex: number) => PLAYER_SERIES_COLORS[seriesIndex % PLAYER_SERIES_COLORS.length];

const numberFormatter = new Intl.NumberFormat("de-DE");
const dateFormatter = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const shortDateFormatter = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });
const monthYearFormatter = new Intl.DateTimeFormat("de-DE", { month: "short", year: "numeric" });
const DAY_MS = 24 * 60 * 60 * 1000;
const EMPTY_GUILD_ANALYTICS_DATA: GuildAnalyticsDerivedData = {
  snapshots: [],
  members: [],
  guilds: [],
};

type GuildAnalyticsLoaderState = {
  title: string;
  message: string;
  current?: number;
  total?: number;
  progressLabel?: string;
};

const isGuildAnalyticsDiagnosticsEnabled = () =>
  typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);

const analyticsNowMs = () =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

const formatDiagnosticMs = (value: number) => `${value.toFixed(1)}ms`;

const formatDiagnosticDetails = (details: GuildAnalyticsDiagnosticEntry["details"]) => {
  if (!details) return "";
  return Object.entries(details)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
};

const formatDiagnosticEntry = (entry: GuildAnalyticsDiagnosticEntry) => {
  const detailText = formatDiagnosticDetails(entry.details);
  return [
    `${entry.phase}=${formatDiagnosticMs(entry.durationMs)}`,
    typeof entry.count === "number" ? `count=${entry.count}` : "",
    detailText,
  ]
    .filter(Boolean)
    .join(" ");
};

const buildAnalyticsLoaderState = (update: GuildAnalyticsLoadPhaseUpdate): GuildAnalyticsLoaderState => {
  const progress =
    update.sourceIndex && update.sourceCount
      ? {
          current: update.sourceIndex,
          total: update.sourceCount,
          progressLabel: "Scans verarbeitet",
        }
      : {};
  const phaseLabels: Record<GuildAnalyticsLoadPhase, GuildAnalyticsLoaderState> = {
    "loading-local-scan-data": {
      title: "Loading local scan data",
      message: "Reading local scan summaries.",
    },
    "checking-analytics-cache": {
      title: "Checking analytics cache",
      message: "Comparing derived analytics versions and source hashes.",
    },
    "rebuilding-analytics-data": {
      title: "Analytics-Daten werden aktualisiert",
      message:
        "Nach einem SF Data Hub-Update werden deine lokalen Scans einmalig neu eingelesen. Das kann je nach Anzahl deiner Scans etwas laenger dauern.",
      ...progress,
    },
    "normalizing-historical-data": {
      title: progress.current ? "Analytics-Daten werden aktualisiert" : "Normalizing historical data",
      message: progress.current
        ? "Nach einem SF Data Hub-Update werden deine lokalen Scans einmalig neu eingelesen. Das kann je nach Anzahl deiner Scans etwas laenger dauern."
        : "Materializing historical player and guild observations.",
      ...progress,
    },
    "saving-derived-analytics": {
      title: progress.current ? "Analytics-Daten werden aktualisiert" : "Saving derived analytics",
      message: progress.current
        ? "Nach einem SF Data Hub-Update werden deine lokalen Scans einmalig neu eingelesen. Das kann je nach Anzahl deiner Scans etwas laenger dauern."
        : "Writing rebuilt analytics snapshots to IndexedDB.",
      ...progress,
    },
    "loading-derived-analytics": {
      title: "Loading derived analytics",
      message: "Reading materialized snapshots, members, and guilds.",
    },
  };
  return phaseLabels[update.phase];
};

const logGuildAnalyticsDiagnostics = (
  entries: GuildAnalyticsDiagnosticEntry[],
  sourceEntries: GuildAnalyticsSourceDiagnostic[],
  analyticsTotalMs: number,
) => {
  if (!isGuildAnalyticsDiagnosticsEnabled()) return;
  const sumKnownPhasesMs = entries.reduce((sum, entry) => sum + entry.durationMs, 0);
  const unattributedMs = Math.max(0, analyticsTotalMs - sumKnownPhasesMs);
  const text = [
    "[Guild Analytics] diagnostics",
    `analytics-total=${formatDiagnosticMs(analyticsTotalMs)}`,
    ...entries.map(formatDiagnosticEntry),
    `analyticsTotalMs=${analyticsTotalMs.toFixed(1)}`,
    `sumKnownPhasesMs=${sumKnownPhasesMs.toFixed(1)}`,
    `unattributedMs=${unattributedMs.toFixed(1)}`,
  ].join("\n");
  console.info(text);

  if (sourceEntries.length) {
    console.info(
      [
        "[Guild Analytics] rematerialization sources",
        ...sourceEntries.map((entry) =>
          [
            `sourceId=${entry.sourceId}`,
            `total=${formatDiagnosticMs(entry.totalMs)}`,
            `rawSourceLoad=${formatDiagnosticMs(entry.rawSourceLoadMs)}`,
            `normalize=${formatDiagnosticMs(entry.normalizationTotalMs)}`,
            `snapshotBuild=${formatDiagnosticMs(entry.snapshotBuildMs)}`,
            `memberBuild=${formatDiagnosticMs(entry.memberObservationBuildMs)}`,
            `guildBuild=${formatDiagnosticMs(entry.guildObservationBuildMs)}`,
            `write=${formatDiagnosticMs(entry.writeMs)}`,
            `snapshots=${entry.snapshotCount}`,
            `members=${entry.memberObservationCount}`,
            `guilds=${entry.guildObservationCount}`,
          ].join(" "),
        ),
      ].join("\n"),
    );
  }
};

const logGuildAnalyticsViewDiagnostic = (
  phase: string,
  durationMs: number,
  count: number,
  details?: Record<string, string | number | boolean | null>,
) => {
  if (!isGuildAnalyticsDiagnosticsEnabled()) return;
  console.info(
    [
      "[Guild Analytics] view diagnostics",
      formatDiagnosticEntry({ phase, durationMs, count, details }),
    ].join("\n"),
  );
};

export default function GuildHubCompareGuilds() {
  const isMdUp = useMediaQuery("(min-width: 768px)");
  const { activeGuild } = useGuildHubSelection();
  const [selectedPlayerIds, setSelectedPlayerIds] = React.useState<string[]>([]);

  const [activeTab, setActiveTab] = React.useState<AnalyticsTabKey>("overview");
  const [overviewMetric, setOverviewMetric] = React.useState<GuildAnalyticsMetricKey>("avgLevel");
  const [overviewRange, setOverviewRange] = React.useState<GuildAnalyticsRangeSelection>({ key: "all" });
  const localScanState = useGuildAnalyticsLocalScans(activeGuild, selectedPlayerIds, overviewRange);
  const [progressPeriod, setProgressPeriod] = React.useState<GuildAnalyticsProgressPeriodKey>("monthly");
  const [serverFilter, setServerFilter] = React.useState<string>("all");
  const [selectedGuildAId, setSelectedGuildAId] = React.useState<string | null>(null);
  const [selectedGuildBId, setSelectedGuildBId] = React.useState<string | null>(null);
  const [selectedGuildA, setSelectedGuildA] = React.useState<GuildSummary | null>(null);
  const [selectedGuildB, setSelectedGuildB] = React.useState<GuildSummary | null>(null);

  const totalGuilds = [selectedGuildAId, selectedGuildBId].filter(Boolean).length;
  const averageMembers = React.useMemo(() => {
    const list = [selectedGuildA, selectedGuildB].filter(Boolean) as GuildSummary[];
    if (!list.length) return 0;
    const sum = list.reduce((acc, g) => acc + (g.members ?? 0), 0);
    return Math.round(sum / list.length);
  }, [selectedGuildA, selectedGuildB]);

  const [activePopover, setActivePopover] = React.useState<string | null>(null);
  const [isFilterSheetOpen, setFilterSheetOpen] = React.useState(false);

  const sheetRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(sheetRef, isFilterSheetOpen && !isMdUp);

  React.useEffect(() => {
    if (isMdUp) {
      setFilterSheetOpen(false);
    }
  }, [isMdUp]);

  React.useEffect(() => {
    if (!activePopover) return;
    const handlePointer = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(`.${styles.freshnessBadge}`) || target.closest(`.${styles.freshnessPopover}`)) {
        return;
      }
      setActivePopover(null);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActivePopover(null);
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [activePopover]);

  const countdownA = React.useMemo(
    () => (selectedGuildA ? formatCountdown(selectedGuildA.nextUpdateAt, Date.now()) : ""),
    [selectedGuildA],
  );
  const countdownB = React.useMemo(
    () => (selectedGuildB ? formatCountdown(selectedGuildB.nextUpdateAt, Date.now()) : ""),
    [selectedGuildB],
  );

  const openFilterSheet = () => setFilterSheetOpen(true);
  const closeFilterSheet = () => setFilterSheetOpen(false);

  const handleServerChange = (value: string) => {
    setServerFilter(value);
  };

  const handleGuildSelect = (slot: SlotKey, guild: GuildSummary) => {
    if (slot === "guildA") {
      setSelectedGuildAId(guild.id);
      setSelectedGuildA(guild);
    } else {
      setSelectedGuildBId(guild.id);
      setSelectedGuildB(guild);
    }
  };

  const clearSlot = (slot: SlotKey) => {
    if (slot === "guildA") {
      setSelectedGuildAId(null);
      setSelectedGuildA(null);
    } else {
      setSelectedGuildBId(null);
      setSelectedGuildB(null);
    }
  };

  const toggleFreshnessDetails = (guildId: string) => {
    setActivePopover((prev) => (prev === guildId ? null : guildId));
  };

  const comparisonReady = selectedGuildA && selectedGuildB;

  return (
    <ContentShell title="Guild Hub" subtitle="Analytics" centerFramed={false}>
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerStack}>
            <GuildContextBar />
            <div>
              <p className={styles.kicker}>Guild Hub</p>
              <h1 className={styles.title}>Analytics</h1>
              <p className={styles.subtitle}>
                Fortschritt, Entwicklung und Vergleiche im Guild Hub.
              </p>
            </div>
            <div className={styles.headerActions}>
              {activeTab === "compare" && !isMdUp && (
                <button
                  type="button"
                  className={styles.secondaryAction}
                  onClick={openFilterSheet}
                >
                  Filter
                </button>
              )}
            </div>
          </div>
          <nav className={styles.tabs} aria-label="Analytics-Bereiche">
            {ANALYTICS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`${styles.tabButton} ${activeTab === tab.key ? styles.tabButtonActive : ""}`}
                aria-pressed={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </header>

        {activeTab === "overview" ? (
          <GuildDevelopmentOverview
            activeGuild={activeGuild}
            analyticsData={localScanState.analyticsData}
            identityResolutionSnapshot={localScanState.identityResolutionSnapshot}
            loading={localScanState.loading}
            loadingPhase={localScanState.loadingPhase}
            error={localScanState.error}
            metricKey={overviewMetric}
            rangeKey={overviewRange}
            onMetricChange={setOverviewMetric}
            onRangeChange={setOverviewRange}
            selectedPlayerIds={selectedPlayerIds}
            onSelectedPlayerIdsChange={setSelectedPlayerIds}
            isMdUp={isMdUp}
          />
        ) : null}

        {activeTab === "progress" ? (
          <GuildProgressAnalytics
            activeGuild={activeGuild}
            analyticsData={localScanState.analyticsData}
            identityResolutionSnapshot={localScanState.identityResolutionSnapshot}
            loading={localScanState.loading}
            loadingPhase={localScanState.loadingPhase}
            error={localScanState.error}
            periodKey={progressPeriod}
            onPeriodChange={setProgressPeriod}
          />
        ) : null}

        {activeTab === "compare" ? (
          <GuildComparisonContent
            selectedGuildA={selectedGuildA}
            selectedGuildB={selectedGuildB}
            selectedGuildAId={selectedGuildAId}
            selectedGuildBId={selectedGuildBId}
            serverFilter={serverFilter}
            comparisonReady={Boolean(comparisonReady)}
            countdownA={countdownA}
            countdownB={countdownB}
            activePopover={activePopover}
            onSelectGuild={handleGuildSelect}
            onClearSlot={clearSlot}
            onServerChange={handleServerChange}
            onToggleFreshnessDetails={toggleFreshnessDetails}
            averageMembers={averageMembers}
            isMdUp={isMdUp}
            totalGuilds={totalGuilds}
          />
        ) : null}
      </div>

      {activeTab === "compare" && !isMdUp && (
        <div className={`${styles.sheetOverlay} ${isFilterSheetOpen ? styles.sheetOpen : ""}`}>
          <div className={styles.sheet} role="dialog" aria-modal="true" ref={sheetRef}>
            <header className={styles.sheetHeader}>
              <h3>Filter</h3>
              <button type="button" className={styles.clearButton} onClick={closeFilterSheet}>
                Schliessen
              </button>
            </header>
            <div className={styles.sheetBody}>
              <label className={styles.filterField}>
                <span>Server</span>
                <select
                  className={styles.select}
                  value={serverFilter}
                  onChange={(event) => handleServerChange(event.target.value)}
                >
                  <option value="all">Alle Server</option>
                  {SERVER_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      )}
    </ContentShell>
  );
}

function useGuildAnalyticsLocalScans(
  activeGuild: ReturnType<typeof useGuildHubSelection>["activeGuild"],
  selectedPlayerIds: readonly string[],
  range: GuildAnalyticsRangeSelection,
) {
  const identitySnapshotRef = React.useRef<IdentityResolutionSnapshot | null>(null);
  const completedAcquisitionKeysRef = React.useRef<Set<string>>(new Set());
  const failedAcquisitionKeysRef = React.useRef<Set<string>>(new Set());
  const inFlightAcquisitionKeysRef = React.useRef<Set<string>>(new Set());
  const [state, setState] = React.useState<{
    analyticsData: GuildAnalyticsDerivedData;
    identityResolutionSnapshot: IdentityResolutionSnapshot | null;
    loading: boolean;
    loadingPhase: GuildAnalyticsLoaderState;
    error: string | null;
  }>({
    analyticsData: EMPTY_GUILD_ANALYTICS_DATA,
    identityResolutionSnapshot: null,
    loading: true,
    loadingPhase: buildAnalyticsLoaderState({ phase: "loading-local-scan-data" }),
    error: null,
  });

  React.useEffect(() => {
    let cancelled = false;
    let loadRunId = 0;
    const controllers = new Set<AbortController>();

    const load = () => {
      const runId = ++loadRunId;
      const controller = new AbortController();
      controllers.add(controller);
      let startedAcquisitionKey: string | null = null;
      const isStale = () => cancelled || runId !== loadRunId;
      const analyticsLoadStartedAt = analyticsNowMs();
      const diagnostics: GuildAnalyticsDiagnosticEntry[] = [];
      const sourceDiagnostics: GuildAnalyticsSourceDiagnostic[] = [];
      const pushDiagnostic = (entry: GuildAnalyticsDiagnosticEntry) => diagnostics.push(entry);
      const pushPhase = (phase: GuildAnalyticsLoadPhaseUpdate) => {
        if (!isStale()) {
          setState((current) => ({
            ...current,
            loading: true,
            loadingPhase: buildAnalyticsLoaderState(phase),
            error: null,
          }));
        }
      };
      const finishAcquisition = (outcome: GuildAnalyticsLocalFirstAcquisitionOutcome) => {
        if (outcome.status === "skipped") return;
        if (outcome.key !== "unresolved") inFlightAcquisitionKeysRef.current.delete(outcome.key);
        if (outcome.status === "completed") {
          completedAcquisitionKeysRef.current.add(outcome.key);
          diagnostics.push({
            phase: "local-first-acquisition",
            durationMs: 0,
            count: outcome.result.acquiredArchives.length + outcome.result.skippedArchives.length,
            details: {
              status: outcome.result.status,
              networkAccessed: outcome.result.networkAccessed,
              acquiredArchives: outcome.result.acquiredArchives.length,
              skippedArchives: outcome.result.skippedArchives.length,
              failedArchives: outcome.result.failedArchives.length,
              manifestFailures: outcome.result.manifestFailures.length,
            },
          });
          if (outcome.result.failedArchives.length || outcome.result.manifestFailures.length) {
            console.warn("[GuildHubAnalytics] local-first acquisition completed with partial errors", outcome.result);
          }
          return;
        }
        failedAcquisitionKeysRef.current.add(outcome.key);
        console.warn("[GuildHubAnalytics] local-first acquisition failed; using local analytics data", outcome.error);
      };

      pushPhase({ phase: "loading-local-scan-data" });
      (async () => {
        const cachedIdentitySnapshot = identitySnapshotRef.current;
        const identityStartedAt = analyticsNowMs();
        const result = await loadGuildAnalyticsLocalFirstData({
          guild: activeGuild,
          range,
          selectedPlayerIds,
          cachedIdentityResolutionSnapshot: cachedIdentitySnapshot,
          signal: controller.signal,
          dependencies: {
            listScanSummaries: async () => {
              const summaryStartedAt = analyticsNowMs();
              const summaries = await listGuildHubScanSummaries();
              diagnostics.push({
                phase: "source-summary-load",
                durationMs: analyticsNowMs() - summaryStartedAt,
                count: summaries.length,
                details: {
                  sourceCount: summaries.length,
                  scanCount: summaries.length,
                },
              });
              return summaries;
            },
            getLocalScan: getGuildHubLocalScan,
            loadIdentityResolutionSnapshot,
            ensureScopedDataFromSummaries: ensureGuildAnalyticsScopedDataFromSummaries,
            acquireLocalFirstScans,
          },
          shouldAcquireRequest: (need) => {
            if (
              completedAcquisitionKeysRef.current.has(need.key) ||
              failedAcquisitionKeysRef.current.has(need.key) ||
              inFlightAcquisitionKeysRef.current.has(need.key)
            ) {
              return false;
            }
            startedAcquisitionKey = need.key;
            inFlightAcquisitionKeysRef.current.add(need.key);
            diagnostics.push({
              phase: "local-first-acquisition-request",
              durationMs: 0,
              count: need.segments.length,
              details: {
                dataKind: need.request.dataKind,
                completeness: need.request.completeness,
                timeKind: need.request.time.kind,
                from: need.request.time.kind === "interval" ? need.request.time.from : null,
                to: need.request.time.kind === "interval" ? need.request.time.to : null,
                source: need.source,
                serverSegments: need.segments.map((segment) => segment.serverCode).join(","),
                lineageServerSegments: need.segments
                  .flatMap((segment) => segment.lineageServerCodes)
                  .join(","),
              },
            });
            return true;
          },
          onIdentityResolutionSnapshot: (snapshot) => {
            identitySnapshotRef.current = snapshot;
          },
          onAcquisitionOutcome: finishAcquisition,
          onDiagnostic: pushDiagnostic,
          onSourceDiagnostic: (entry) => sourceDiagnostics.push(entry),
          onPhase: pushPhase,
        });
        startedAcquisitionKey = null;
        const identityResolutionSnapshot = result.identityResolutionSnapshot;
          diagnostics.push({
            phase: "identity-resolution-load",
            durationMs: analyticsNowMs() - identityStartedAt,
            count: identityResolutionSnapshot
              ? identityResolutionSnapshot.players.byIdentityId.size + identityResolutionSnapshot.guilds.byIdentityId.size
              : 0,
            details: identityResolutionSnapshot
              ? {
                  playerIdentities: identityResolutionSnapshot.players.byIdentityId.size,
                  guildIdentities: identityResolutionSnapshot.guilds.byIdentityId.size,
                  cached: Boolean(cachedIdentitySnapshot),
                }
              : {
                  failed: true,
                },
          });
          const analyticsData = result.analyticsData;
          const reactStateStartedAt = analyticsNowMs();
          diagnostics.push({
            phase: "react-state-enqueue",
            durationMs: analyticsNowMs() - reactStateStartedAt,
            count: 1,
          });
          if (!isStale()) {
            setState({
              analyticsData,
              identityResolutionSnapshot,
              loading: false,
              loadingPhase: buildAnalyticsLoaderState({ phase: "loading-derived-analytics" }),
              error: null,
            });
            logGuildAnalyticsDiagnostics(diagnostics, sourceDiagnostics, analyticsNowMs() - analyticsLoadStartedAt);
          }
      })()
        .catch((error) => {
          if (startedAcquisitionKey) inFlightAcquisitionKeysRef.current.delete(startedAcquisitionKey);
          if (error instanceof DOMException && error.name === "AbortError") return;
          console.error("[GuildHubAnalytics] failed to load local analytics data", error);
          if (!isStale()) {
            setState({
              analyticsData: EMPTY_GUILD_ANALYTICS_DATA,
              identityResolutionSnapshot: null,
              loading: false,
              loadingPhase: buildAnalyticsLoaderState({ phase: "loading-local-scan-data" }),
              error: "Lokale Analytics-Daten konnten nicht geladen werden.",
            });
          }
        })
        .finally(() => {
          controllers.delete(controller);
        });
    };

    load();
    const unsubscribe = subscribeToSfDataHubLocalScanChanges(load);

    return () => {
      cancelled = true;
      controllers.forEach((controller) => controller.abort());
      unsubscribe();
    };
  }, [activeGuild, selectedPlayerIds, range]);

  return state;
}

function GuildDevelopmentOverview({
  activeGuild,
  analyticsData,
  identityResolutionSnapshot,
  loading,
  loadingPhase,
  error,
  metricKey,
  rangeKey,
  onMetricChange,
  onRangeChange,
  selectedPlayerIds,
  onSelectedPlayerIdsChange,
  isMdUp,
}: {
  activeGuild: ReturnType<typeof useGuildHubSelection>["activeGuild"];
  analyticsData: GuildAnalyticsDerivedData;
  identityResolutionSnapshot: IdentityResolutionSnapshot | null;
  loading: boolean;
  loadingPhase: GuildAnalyticsLoaderState;
  error: string | null;
  metricKey: GuildAnalyticsMetricKey;
  rangeKey: GuildAnalyticsRangeSelection;
  onMetricChange: (metric: GuildAnalyticsMetricKey) => void;
  onRangeChange: (range: GuildAnalyticsRangeSelection) => void;
  selectedPlayerIds: string[];
  onSelectedPlayerIdsChange: (ids: string[]) => void;
  isMdUp: boolean;
}) {
  const metric = GUILD_ANALYTICS_METRICS.find((entry) => entry.key === metricKey) ?? GUILD_ANALYTICS_METRICS[0];
  const isFightParticipation = metric.key === "fightParticipation";
  const supportsPlayerComparison = isPlayerComparisonMetric(metric.key);
  const scanMetricKey = isFightParticipation ? "avgLevel" : metric.key;
  const playerComparison = React.useMemo(
    () => {
      const startedAt = analyticsNowMs();
      const comparison = buildGuildAnalyticsPlayerComparison(
        analyticsData,
        activeGuild,
        supportsPlayerComparison ? metric.key : "avgLevel",
        rangeKey,
        selectedPlayerIds,
        identityResolutionSnapshot,
      );
      logGuildAnalyticsViewDiagnostic("player-history-build", analyticsNowMs() - startedAt, selectedPlayerIds.length, {
        selectedPlayers: selectedPlayerIds.length,
        inputObservations: analyticsData.members.length,
        outputPoints: comparison.playerSeries.reduce((sum, series) => sum + series.points.length, 0),
      });
      return comparison;
    },
    [activeGuild, analyticsData, supportsPlayerComparison, metric.key, rangeKey, selectedPlayerIds, identityResolutionSnapshot],
  );
  const series = React.useMemo(
    () => {
      const startedAt = analyticsNowMs();
      const nextSeries = isFightParticipation
        ? { allPoints: [], visiblePoints: [], timeDomain: null }
        : supportsPlayerComparison
          ? playerComparison.guildSeries
          : buildGuildAnalyticsSeries(analyticsData, activeGuild, scanMetricKey, rangeKey, identityResolutionSnapshot);
      const identityScope = describeGuildAnalyticsIdentityScope(analyticsData, activeGuild, identityResolutionSnapshot);
      logGuildAnalyticsViewDiagnostic("guild-series-build", analyticsNowMs() - startedAt, nextSeries.allPoints.length, {
        selectedGuildIdentifier: identityScope.selectedGuildIdentifier,
        resolvedGuildIdentity: identityScope.resolvedGuildIdentity,
        aliasIdentifierCount: identityScope.aliasIdentifierCount,
        inputGuildObservations: identityScope.inputGuildObservations,
        matchedGuildObservations: identityScope.matchedGuildObservations,
        outputPoints: nextSeries.visiblePoints.length,
      });
      return nextSeries;
    },
    [activeGuild, analyticsData, scanMetricKey, rangeKey, isFightParticipation, supportsPlayerComparison, playerComparison, identityResolutionSnapshot],
  );
  const fightState = useFightParticipationAnalytics(activeGuild, rangeKey, isFightParticipation);
  const visiblePoints = series.visiblePoints;
  const values = visiblePoints
    .map((point) => point.values[metric.key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const currentValue = values[values.length - 1] ?? null;
  const deltaValue = values.length >= 2 ? values[values.length - 1] - values[0] : null;
  const pointCount = values.length;
  const scanChart = React.useMemo(
    () => {
      const startedAt = analyticsNowMs();
      const model = buildScanChartViewModel(metric, visiblePoints, playerComparison, supportsPlayerComparison);
      logGuildAnalyticsViewDiagnostic("chart-model-build", analyticsNowMs() - startedAt, model.series.length, {
        metric: metric.key,
        guildPoints: visiblePoints.length,
        playerSeries: playerComparison.playerSeries.length,
      });
      return model;
    },
    [metric, visiblePoints, playerComparison, supportsPlayerComparison],
  );
  const [hoveredChartSeriesKey, setHoveredChartSeriesKey] = React.useState<string | null>(null);
  const [lockedChartSeriesKeys, setLockedChartSeriesKeys] = React.useState<string[]>([]);
  const availableChartSeriesKeys = React.useMemo(() => new Set(scanChart.series.map((entry) => entry.key)), [scanChart.series]);
  React.useEffect(() => {
    setLockedChartSeriesKeys((current) => current.filter((key) => availableChartSeriesKeys.has(key)));
  }, [availableChartSeriesKeys]);
  const highlightedChartSeriesKeys = React.useMemo(
    () =>
      Array.from(
        new Set([
          ...lockedChartSeriesKeys.filter((key) => availableChartSeriesKeys.has(key)),
          ...(hoveredChartSeriesKey && availableChartSeriesKeys.has(hoveredChartSeriesKey) ? [hoveredChartSeriesKey] : []),
        ]),
      ),
    [availableChartSeriesKeys, hoveredChartSeriesKey, lockedChartSeriesKeys],
  );
  const lockedChartSeriesKeySet = React.useMemo(() => new Set(lockedChartSeriesKeys), [lockedChartSeriesKeys]);
  const toggleChartSeriesLock = React.useCallback((seriesKey: string) => {
    setLockedChartSeriesKeys((current) =>
      current.includes(seriesKey) ? current.filter((key) => key !== seriesKey) : [...current, seriesKey],
    );
  }, []);
  const timeTicks = React.useMemo(
    () => buildTimeTicks(series.timeDomain, rangeKey, isMdUp),
    [series.timeDomain, rangeKey, isMdUp],
  );
  const fusionMarkers = React.useMemo(
    () =>
      buildGuildAnalyticsFusionMarkers(
        collectGuildFusionServerInputs(analyticsData, activeGuild, series.allPoints),
        series.timeDomain,
      ),
    [activeGuild, analyticsData, series.allPoints, series.timeDomain],
  );
  const fusionMarkerTooltips = React.useMemo(() => buildFusionMarkerTooltips(fusionMarkers), [fusionMarkers]);
  const verticalFusionMarkers = React.useMemo(
    () => withMarkerTooltipIndexes(fusionMarkers, scanChart.tooltips.length),
    [fusionMarkers, scanChart.tooltips.length],
  );
  const chartTooltips = React.useMemo(
    () => [...scanChart.tooltips, ...fusionMarkerTooltips],
    [scanChart.tooltips, fusionMarkerTooltips],
  );
  const selectedPlayers = playerComparison.playerSeries;

  let body: React.ReactNode;
  if (isFightParticipation) {
    body = (
      <FightParticipationOverviewBody
        activeGuild={activeGuild}
        loading={fightState.loading}
        error={fightState.error}
        series={fightState.series}
        range={rangeKey}
        isMdUp={isMdUp}
        fusionMarkers={fusionMarkers}
      />
    );
  } else if (!activeGuild) {
    body = <GuildDevelopmentEmptyState message="Waehle im Guild Hub eine Gilde aus." />;
  } else if (loading) {
    body = (
      <DataHubLoadingState
        title={loadingPhase.title}
        message={loadingPhase.message}
        current={loadingPhase.current}
        total={loadingPhase.total}
        progressLabel={loadingPhase.progressLabel}
      />
    );
  } else if (error) {
    body = <GuildDevelopmentEmptyState message={error} />;
  } else if (!series.allPoints.length) {
    body = <GuildDevelopmentEmptyState message="Keine lokalen Scandaten fuer diese Gilde gefunden." />;
  } else if (!visiblePoints.length) {
    body = <GuildDevelopmentEmptyState message="Im gewaehlten Zeitraum liegen keine lokalen Scans vor." />;
  } else {
    body = (
      <>
        <div className={styles.developmentChartFrame}>
          <AnchoredLineChart
            points={[]}
            series={scanChart.series}
            timeDomain={series.timeDomain}
            timeTicks={timeTicks}
            verticalMarkers={verticalFusionMarkers}
            showAvg={false}
            showFill={false}
            showDots={false}
            showXLabels
            dotTooltips={chartTooltips}
            yValueFormatter={(value) => formatChartAxisValue(value, metric)}
            semanticKey={metric.key}
            highlightedSeriesKeys={highlightedChartSeriesKeys}
            onHoverSeriesKeyChange={setHoveredChartSeriesKey}
          />
          {supportsPlayerComparison ? (
            <ChartLegend
              items={[
                { key: GUILD_AVERAGE_SERIES_KEY, label: "Guild Average", color: GUILD_AVERAGE_COLOR },
                ...selectedPlayers.map((player, index) => ({
                  key: player.memberRef,
                  label: player.name,
                  color: getPlayerSeriesColor(index),
                })),
              ]}
              lockedKeys={lockedChartSeriesKeySet}
              highlightedKeys={new Set(highlightedChartSeriesKeys)}
              onHoverKeyChange={setHoveredChartSeriesKey}
              onToggleLock={toggleChartSeriesLock}
            />
          ) : null}
        </div>
        <div className={styles.developmentSummary} aria-label="Guild Development Zusammenfassung">
          <GuildDevelopmentStat label="Aktueller Wert" value={formatMetricValue(currentValue, metric)} />
          <GuildDevelopmentStat label="Veraenderung" value={formatDeltaValue(deltaValue, metric)} />
          <GuildDevelopmentStat label="Datenpunkte" value={numberFormatter.format(pointCount)} />
        </div>
        {pointCount === 1 ? (
          <p className={styles.developmentHint}>Fuer eine Entwicklung werden mindestens zwei lokale Scans benoetigt.</p>
        ) : null}
      </>
    );
  }

  return (
    <section className={styles.developmentPanel} aria-label="Guild Development">
      <div className={styles.developmentHeader}>
        <div className={styles.developmentTitleBlock}>
          <p className={styles.developmentEyebrow}>Uebersicht</p>
          <h2 className={styles.developmentTitle}>Guild Development</h2>
          <p className={styles.developmentMeta}>
            {activeGuild ? `${activeGuild.name} - ${activeGuild.server}` : "Keine aktive Gilde"}
          </p>
        </div>
        <div className={styles.developmentControls}>
          <div className={styles.segmentedControl} aria-label="Metrik">
            {GUILD_ANALYTICS_METRICS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={`${styles.segmentButton} ${entry.key === metric.key ? styles.segmentButtonActive : ""}`}
                aria-pressed={entry.key === metric.key}
                onClick={() => onMetricChange(entry.key)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <PlayerComparisonControl
            candidates={playerComparison.playerCandidates}
            selectedPlayers={selectedPlayers}
            selectedPlayerIds={selectedPlayerIds}
            onSelectedPlayerIdsChange={onSelectedPlayerIdsChange}
            disabled={!supportsPlayerComparison}
            isMdUp={isMdUp}
          />
          <AnalyticsRangeControl range={rangeKey} onRangeChange={onRangeChange} isMdUp={isMdUp} />
        </div>
      </div>
      {body}
    </section>
  );
}

function useFightParticipationAnalytics(
  activeGuild: ReturnType<typeof useGuildHubSelection>["activeGuild"],
  range: GuildAnalyticsRangeSelection,
  enabled: boolean,
) {
  const [state, setState] = React.useState<{
    series: FightParticipationSeries;
    loading: boolean;
    error: string | null;
  }>({
    series: { tracker: null, allPoints: [], visiblePoints: [], timeDomain: null },
    loading: false,
    error: null,
  });

  React.useEffect(() => {
    if (!enabled) {
      setState((prev) => ({ ...prev, loading: false, error: null }));
      return undefined;
    }

    let cancelled = false;
    const load = () => {
      if (!activeGuild) {
        setState({ series: { tracker: null, allPoints: [], visiblePoints: [], timeDomain: null }, loading: false, error: null });
        return;
      }
      setState((prev) => ({ ...prev, loading: true, error: null }));
      buildLocalFightParticipationSeries(activeGuild, range, { includeFormerMembers: false })
        .then((series) => {
          if (!cancelled) setState({ series, loading: false, error: null });
        })
        .catch((err) => {
          console.error("[GuildHubAnalytics] failed to load fight participation", err);
          if (!cancelled) {
            setState({
              series: { tracker: null, allPoints: [], visiblePoints: [], timeDomain: null },
              loading: false,
              error: err instanceof Error ? err.message : "Fight-Daten konnten nicht geladen werden.",
            });
          }
        });
    };

    load();
    const unsubscribe = subscribeToFightTrackingChanges(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [activeGuild, enabled, range]);

  return state;
}

function isPlayerComparisonMetric(metricKey: GuildAnalyticsMetricKey) {
  return metricKey === "avgLevel" || metricKey === "avgBaseStats" || metricKey === "avgTotalStats";
}

function buildScanChartViewModel(
  metric: GuildAnalyticsMetricDefinition,
  visiblePoints: GuildAnalyticsPoint[],
  playerComparison: GuildAnalyticsPlayerComparison,
  supportsPlayerComparison: boolean,
) {
  const tooltips: React.ReactNode[] = [];
  const guildPointByScanId = new Map(visiblePoints.map((point) => [point.scanId, point]));
  const registerTooltip = (tooltip: React.ReactNode) => {
    const index = tooltips.length;
    tooltips.push(tooltip);
    return index;
  };

  const guildSeries = {
    key: GUILD_AVERAGE_SERIES_KEY,
    label: "Guild Average",
    points: [],
    timePoints: visiblePoints.map((point) => {
      const playerRows = supportsPlayerComparison
        ? playerComparison.playerSeries
            .map((player) => {
              const playerPoint = player.points.find((entry) => entry.scanId === point.scanId) ?? null;
              if (!playerPoint || playerPoint.value == null) return null;
              return {
                name: player.name,
                value: playerPoint.value,
                guildName: playerPoint.guildName ?? playerPoint.guildIdentifier,
              };
            })
            .filter((row): row is { name: string; value: number; guildName: string | null } => Boolean(row))
        : [];
      return {
        timestampMs: point.scannedAtMs,
        value: point.values[metric.key] ?? null,
        tooltipIndex: registerTooltip(
          <ScanMetricTooltip
            dateMs={point.scannedAtMs}
            metric={metric}
            guildValue={point.values[metric.key] ?? null}
            playerRows={playerRows}
          />,
        ),
      };
    }),
    color: GUILD_AVERAGE_COLOR,
    prominent: true,
  };

  if (!supportsPlayerComparison) return { series: [guildSeries], tooltips };

  return {
    series: [
      guildSeries,
      ...playerComparison.playerSeries.map((player, seriesIndex) => ({
        key: player.memberRef,
        label: player.name,
        points: [],
        timePoints: player.points.map((point) => {
          const guildPoint = guildPointByScanId.get(point.scanId) ?? null;
          const playerColor = getPlayerSeriesColor(seriesIndex);
          return {
            timestampMs: point.scannedAtMs,
            value: point.value,
            color: point.membership === "currentGuild" ? playerColor : PLAYER_HISTORY_OTHER_GUILD_COLOR,
            tooltipIndex: registerTooltip(
              <PlayerHistoryTooltip
                dateMs={point.scannedAtMs}
                metric={metric}
                playerName={player.name}
                value={point.value}
                guildName={point.guildName ?? point.guildIdentifier}
                guildValue={guildPoint?.values[metric.key] ?? null}
              />,
            ),
          };
        }),
        color: getPlayerSeriesColor(seriesIndex),
      })),
    ],
    tooltips,
  };
}

function collectGuildFusionServerInputs(
  analyticsData: GuildAnalyticsDerivedData,
  activeGuild: ReturnType<typeof useGuildHubSelection>["activeGuild"],
  points: GuildAnalyticsPoint[],
) {
  const snapshotIds = new Set(points.map((point) => point.scanId));
  const servers = new Set<string>();
  const addServer = (value: string | null | undefined) => {
    const server = String(value ?? "").trim();
    if (server) servers.add(server);
  };

  analyticsData.guilds.forEach((guild) => {
    if (!snapshotIds.has(guild.snapshotId)) return;
    addServer(guild.server);
    addServer(parseServerFromGuildIdentifier(guild.guildIdentifier));
    addServer(guild.guildIdentifier);
  });
  addServer(activeGuild?.server);
  addServer(parseServerFromGuildIdentifier(activeGuild?.logoIdentifier));
  addServer(activeGuild?.logoIdentifier);
  return [...servers];
}

function withMarkerTooltipIndexes(
  markers: GuildAnalyticsFusionMarker[],
  tooltipOffset: number,
): AnchoredLineChartVerticalMarker[] {
  return markers.map((marker, index) => ({
    key: marker.key,
    timestampMs: marker.timestampMs,
    description: marker.description,
    tooltipIndex: tooltipOffset + index,
  }));
}

function buildFusionMarkerTooltips(markers: GuildAnalyticsFusionMarker[]) {
  return markers.map((marker) => <FusionMarkerTooltip key={marker.key} marker={marker} />);
}

function ScanMetricTooltip({
  dateMs,
  metric,
  guildValue,
  playerRows,
}: {
  dateMs: number;
  metric: GuildAnalyticsMetricDefinition;
  guildValue: number | null;
  playerRows: Array<{ name: string; value: number | null; guildName: string | null }>;
}) {
  return (
    <div className={styles.scanTooltip}>
      <strong>{dateFormatter.format(dateMs)}</strong>
      <span>
        <em>Guild Average</em>
        <b>{formatMetricValue(guildValue, metric)}</b>
      </span>
      {playerRows.map((row) => (
        <span key={row.name}>
          <em>{row.name}</em>
          <b>{formatMetricValue(row.value, metric)}</b>
        </span>
      ))}
    </div>
  );
}

function FusionMarkerTooltip({ marker }: { marker: GuildAnalyticsFusionMarker }) {
  return (
    <div className={styles.scanTooltip}>
      <strong>Server Fusion</strong>
      <span>
        <em>Fusion</em>
        <b>{`${marker.originServerDisplayNames.join(", ")} -> ${marker.targetServerDisplayName}`}</b>
      </span>
      <span>
        <em>From</em>
        <b>{marker.originServerDisplayNames.join(", ")}</b>
      </span>
      <span>
        <em>To</em>
        <b>{marker.targetServerDisplayName}</b>
      </span>
      <span>
        <em>Date</em>
        <b>{formatFusionMarkerDate(marker.effectiveDate)}</b>
      </span>
    </div>
  );
}

function PlayerHistoryTooltip({
  dateMs,
  metric,
  playerName,
  value,
  guildName,
  guildValue,
}: {
  dateMs: number;
  metric: GuildAnalyticsMetricDefinition;
  playerName: string;
  value: number | null;
  guildName: string | null;
  guildValue: number | null;
}) {
  return (
    <div className={styles.scanTooltip}>
      <strong>{dateFormatter.format(dateMs)}</strong>
      {guildValue != null ? (
        <span>
          <em>Guild Average</em>
          <b>{formatMetricValue(guildValue, metric)}</b>
        </span>
      ) : null}
      <span>
        <em>{playerName}</em>
        <b>{formatMetricValue(value, metric)}</b>
      </span>
      {guildName ? (
        <span>
          <em>Guild</em>
          <b>{guildName}</b>
        </span>
      ) : null}
    </div>
  );
}

function formatFusionMarkerDate(value: string) {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? dateFormatter.format(parsed) : value;
}

function ChartLegend({
  items,
  lockedKeys,
  highlightedKeys,
  onHoverKeyChange,
  onToggleLock,
}: {
  items: Array<{ key?: string; label: string; color: string }>;
  lockedKeys?: ReadonlySet<string>;
  highlightedKeys?: ReadonlySet<string>;
  onHoverKeyChange?: (key: string | null) => void;
  onToggleLock?: (key: string) => void;
}) {
  return (
    <div className={styles.chartLegend} aria-label="Chart Legende">
      {items.map((item) => {
        const itemKey = item.key ?? `${item.label}-${item.color}`;
        const isLocked = Boolean(lockedKeys?.has(itemKey));
        const isHighlighted = Boolean(highlightedKeys?.has(itemKey));
        const className = `${styles.chartLegendItem} ${isLocked ? styles.chartLegendItemLocked : ""} ${isHighlighted ? styles.chartLegendItemHighlighted : ""}`;
        const content = (
          <>
            <i style={{ backgroundColor: item.color }} />
            {item.label}
          </>
        );

        if (!onToggleLock || !onHoverKeyChange) {
          return (
            <span key={itemKey} className={className}>
              {content}
            </span>
          );
        }

        return (
          <button
            key={itemKey}
            type="button"
            className={className}
            aria-pressed={isLocked}
            onClick={() => onToggleLock(itemKey)}
            onMouseEnter={() => onHoverKeyChange(itemKey)}
            onMouseLeave={() => onHoverKeyChange(null)}
            onFocus={() => onHoverKeyChange(itemKey)}
            onBlur={() => onHoverKeyChange(null)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

function PlayerComparisonControl({
  candidates,
  selectedPlayers,
  selectedPlayerIds,
  onSelectedPlayerIdsChange,
  disabled,
  isMdUp,
}: {
  candidates: GuildAnalyticsPlayerCandidate[];
  selectedPlayers: Array<{ memberRef: string; name: string }>;
  selectedPlayerIds: string[];
  onSelectedPlayerIdsChange: (ids: string[]) => void;
  disabled: boolean;
  isMdUp: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState("");
  const sheetRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(sheetRef, open && !isMdUp);

  React.useEffect(() => {
    if (!disabled) return;
    setOpen(false);
  }, [disabled]);

  React.useEffect(() => {
    if (!open || !isMdUp) return undefined;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, isMdUp]);

  React.useEffect(() => {
    if (isMdUp) return;
    setOpen(false);
  }, [isMdUp]);

  const selectedSet = React.useMemo(() => new Set(selectedPlayerIds), [selectedPlayerIds]);
  const filteredCandidates = React.useMemo(() => {
    const needle = searchValue.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter((candidate) => candidate.name.toLowerCase().includes(needle));
  }, [candidates, searchValue]);

  const togglePlayer = (memberRef: string) => {
    if (selectedSet.has(memberRef)) {
      onSelectedPlayerIdsChange(selectedPlayerIds.filter((entry) => entry !== memberRef));
      return;
    }
    onSelectedPlayerIdsChange([...selectedPlayerIds, memberRef]);
  };

  const summary =
    selectedPlayers.length === 0
      ? "keine Spieler"
      : selectedPlayers.length === 1
        ? selectedPlayers[0].name
        : `${selectedPlayers.length} ausgewaehlt`;
  const content = (
    <PlayerComparisonOptions
      candidates={filteredCandidates}
      selectedSet={selectedSet}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      onTogglePlayer={togglePlayer}
      onClear={() => onSelectedPlayerIdsChange([])}
    />
  );

  return (
    <div className={`${styles.playerPicker} ${disabled ? styles.playerPickerDisabled : ""}`}>
      <button
        type="button"
        className={styles.rangeButton}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled || !candidates.length}
        onClick={() => setOpen((prev) => !prev)}
      >
        Spieler vergleichen: {summary}
      </button>
      {selectedPlayers.length ? (
        <div className={styles.playerChipList} aria-label="Ausgewaehlte Spieler">
          {selectedPlayers.map((player) => (
            <button
              key={player.memberRef}
              type="button"
              aria-label={`${player.name} entfernen`}
              onClick={() => onSelectedPlayerIdsChange(selectedPlayerIds.filter((entry) => entry !== player.memberRef))}
            >
              <span>{player.name}</span>
              <i aria-hidden="true">x</i>
            </button>
          ))}
        </div>
      ) : null}
      {isMdUp && open ? <div className={styles.rangePopover}>{content}</div> : null}
      {!isMdUp ? (
        <div className={`${styles.sheetOverlay} ${open ? styles.sheetOpen : ""}`}>
          <div className={styles.sheet} role="dialog" aria-modal="true" ref={sheetRef}>
            <header className={styles.sheetHeader}>
              <h3>Spieler vergleichen</h3>
              <button type="button" className={styles.clearButton} onClick={() => setOpen(false)}>
                Schliessen
              </button>
            </header>
            <div className={styles.sheetBody}>{content}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlayerComparisonOptions({
  candidates,
  selectedSet,
  searchValue,
  onSearchChange,
  onTogglePlayer,
  onClear,
}: {
  candidates: GuildAnalyticsPlayerCandidate[];
  selectedSet: Set<string>;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onTogglePlayer: (memberRef: string) => void;
  onClear: () => void;
}) {
  return (
    <div className={styles.playerPickerMenu}>
      <label className={styles.filterField}>
        <span>Suche</span>
        <input
          className={styles.searchInput}
          placeholder="Spieler suchen"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      <div className={styles.playerPickerList}>
        {candidates.length ? (
          candidates.map((candidate) => (
            <label key={candidate.memberRef} className={styles.playerPickerRow}>
              <input
                type="checkbox"
                checked={selectedSet.has(candidate.memberRef)}
                onChange={() => onTogglePlayer(candidate.memberRef)}
              />
              <span>{candidate.name}</span>
            </label>
          ))
        ) : (
          <div className={styles.emptyResult}>Keine aktuellen Spieler gefunden.</div>
        )}
      </div>
      {selectedSet.size ? (
        <button type="button" className={styles.secondaryAction} onClick={onClear}>
          Auswahl leeren
        </button>
      ) : null}
    </div>
  );
}

function FightParticipationOverviewBody({
  activeGuild,
  loading,
  error,
  series,
  range,
  isMdUp,
  fusionMarkers,
}: {
  activeGuild: ReturnType<typeof useGuildHubSelection>["activeGuild"];
  loading: boolean;
  error: string | null;
  series: FightParticipationSeries;
  range: GuildAnalyticsRangeSelection;
  isMdUp: boolean;
  fusionMarkers: GuildAnalyticsFusionMarker[];
}) {
  const visiblePoints = series.visiblePoints;
  const latestPoint = visiblePoints[visiblePoints.length - 1] ?? null;
  const avgParticipants = visiblePoints.length
    ? visiblePoints.reduce((sum, point) => sum + point.participants, 0) / visiblePoints.length
    : null;
  const fusionMarkerTooltips = React.useMemo(() => buildFusionMarkerTooltips(fusionMarkers), [fusionMarkers]);
  const verticalFusionMarkers = React.useMemo(
    () => withMarkerTooltipIndexes(fusionMarkers, visiblePoints.length),
    [fusionMarkers, visiblePoints.length],
  );

  if (!activeGuild) {
    return <GuildDevelopmentEmptyState message="Waehle im Guild Hub eine Gilde aus." />;
  }
  if (loading) {
    return (
      <DataHubLoadingState
        title="Fight-Daten werden geladen"
        message="Fight-Tracker-Zeitreihe wird vorbereitet."
      />
    );
  }
  if (error) {
    return <GuildDevelopmentEmptyState message={error} />;
  }
  if (!series.tracker) {
    return <GuildDevelopmentEmptyState message="Kein verknuepfter Fight Tracker fuer diese Gilde vorhanden." />;
  }
  if (!series.allPoints.length) {
    return <GuildDevelopmentEmptyState message="Im verknuepften Fight Tracker sind noch keine Attack-Fights gespeichert." />;
  }
  if (!visiblePoints.length) {
    return <GuildDevelopmentEmptyState message="Keine Fight-Daten im ausgewaehlten Zeitraum." />;
  }

  return (
    <>
      <div className={styles.developmentChartFrame}>
        <AnchoredLineChart
          points={[]}
          series={[
            {
              key: "participants",
              label: "Participants",
              points: [],
              timePoints: visiblePoints.map((point, index) => ({
                timestampMs: point.timestampMs,
                value: point.participants,
                tooltipIndex: index,
              })),
              color: GUILD_AVERAGE_COLOR,
              prominent: true,
            },
            {
              key: "missed",
              label: "Missed",
              points: [],
              timePoints: visiblePoints.map((point, index) => ({
                timestampMs: point.timestampMs,
                value: point.missed,
                tooltipIndex: index,
              })),
              color: "#f2a65a",
            },
          ]}
          timeDomain={series.timeDomain}
          timeTicks={buildTimeTicks(series.timeDomain, range, isMdUp)}
          verticalMarkers={verticalFusionMarkers}
          showAvg={false}
          showFill={false}
          showDots={false}
          showXLabels
          dotTooltips={[
            ...visiblePoints.map((point) => <FightParticipationTooltip key={point.fightId} point={point} />),
            ...fusionMarkerTooltips,
          ]}
          yValueFormatter={(value) => numberFormatter.format(Math.round(value))}
          semanticKey="fight-participation"
        />
        <ChartLegend
          items={[
            { label: "Participants", color: GUILD_AVERAGE_COLOR },
            { label: "Missed", color: "#f2a65a" },
          ]}
        />
      </div>
      <div className={styles.developmentSummary} aria-label="Fight Participation Zusammenfassung">
        <GuildDevelopmentStat
          label="Letzter Fight"
          value={
            latestPoint
              ? `${numberFormatter.format(latestPoint.participants)} Participants / ${numberFormatter.format(latestPoint.missed)} Missed`
              : "-"
          }
        />
        <GuildDevelopmentStat
          label="Ø Participants"
          value={avgParticipants == null ? "-" : avgParticipants.toFixed(1).replace(".", ",")}
        />
        <GuildDevelopmentStat label="Fights" value={numberFormatter.format(visiblePoints.length)} />
      </div>
    </>
  );
}

function FightParticipationTooltip({ point }: { point: FightParticipationSeries["visiblePoints"][number] }) {
  return (
    <div className={styles.fightTooltip}>
      <strong>{dateFormatter.format(point.timestampMs)}</strong>
      <span>Fight {point.fightNumber}</span>
      {point.opponentGuild ? <span>vs. {point.opponentGuild}</span> : null}
      <span>Participants: {numberFormatter.format(point.participants)}</span>
      <span>Missed: {numberFormatter.format(point.missed)}</span>
    </div>
  );
}

function AnalyticsRangeControl({
  range,
  onRangeChange,
  isMdUp,
}: {
  range: GuildAnalyticsRangeSelection;
  onRangeChange: (range: GuildAnalyticsRangeSelection) => void;
  isMdUp: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const sheetRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(sheetRef, open && !isMdUp);

  React.useEffect(() => {
    if (!open || !isMdUp) return undefined;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, isMdUp]);

  React.useEffect(() => {
    if (isMdUp) return;
    setOpen(false);
  }, [isMdUp]);

  const content = (
    <RangeOptions
      range={range}
      onRangeChange={onRangeChange}
      onClose={() => {
        if (!isMdUp) setOpen(false);
      }}
    />
  );

  return (
    <div className={styles.rangePicker}>
      <button
        type="button"
        className={styles.rangeButton}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        Zeitraum: {formatRangeLabel(range)}
      </button>
      {isMdUp && open ? <div className={styles.rangePopover}>{content}</div> : null}
      {!isMdUp ? (
        <div className={`${styles.sheetOverlay} ${open ? styles.sheetOpen : ""}`}>
          <div className={styles.sheet} role="dialog" aria-modal="true" ref={sheetRef}>
            <header className={styles.sheetHeader}>
              <h3>Zeitraum</h3>
              <button type="button" className={styles.clearButton} onClick={() => setOpen(false)}>
                Schliessen
              </button>
            </header>
            <div className={styles.sheetBody}>{content}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RangeOptions({
  range,
  onRangeChange,
  onClose,
}: {
  range: GuildAnalyticsRangeSelection;
  onRangeChange: (range: GuildAnalyticsRangeSelection) => void;
  onClose: () => void;
}) {
  const applyRange = (next: GuildAnalyticsRangeSelection) => {
    onRangeChange(next);
    if (next.key !== "custom") onClose();
  };

  return (
    <div className={styles.rangeMenu}>
      {GUILD_ANALYTICS_RANGES.map((entry) => (
        <button
          key={entry.key}
          type="button"
          className={`${styles.rangeOption} ${range.key === entry.key ? styles.rangeOptionActive : ""}`}
          aria-pressed={range.key === entry.key}
          onClick={() => applyRange(entry.key === "custom" ? { key: "custom", from: range.from, to: range.to } : { key: entry.key })}
        >
          {entry.label}
        </button>
      ))}
      {range.key === "custom" ? (
        <div className={styles.rangeCustomFields}>
          <label className={styles.filterField}>
            <span>Von</span>
            <input
              type="date"
              className={styles.searchInput}
              value={range.from ?? ""}
              onChange={(event) => onRangeChange({ ...range, from: event.target.value || undefined })}
            />
          </label>
          <label className={styles.filterField}>
            <span>Bis</span>
            <input
              type="date"
              className={styles.searchInput}
              value={range.to ?? ""}
              onChange={(event) => onRangeChange({ ...range, to: event.target.value || undefined })}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function formatRangeLabel(range: GuildAnalyticsRangeSelection) {
  if (range.key === "custom") {
    if (range.from && range.to) return `${formatDateInputLabel(range.from)} - ${formatDateInputLabel(range.to)}`;
    if (range.from) return `ab ${formatDateInputLabel(range.from)}`;
    if (range.to) return `bis ${formatDateInputLabel(range.to)}`;
  }
  return GUILD_ANALYTICS_RANGES.find((entry) => entry.key === range.key)?.label ?? "Zeitraum";
}

function formatDateInputLabel(value: string) {
  const parsed = Date.parse(`${value}T00:00:00`);
  return Number.isFinite(parsed) ? shortDateFormatter.format(parsed) : value;
}

function buildTimeTicks(
  domain: { startMs: number; endMs: number } | null,
  range: GuildAnalyticsRangeSelection,
  isMdUp: boolean,
) {
  if (!domain) return [];
  if (domain.startMs === domain.endMs) {
    return [{ timestampMs: domain.startMs, label: shortDateFormatter.format(domain.startMs) }];
  }

  const durationDays = Math.max(1, Math.ceil((domain.endMs - domain.startMs) / DAY_MS));
  const tickMs =
    range.key === "7d" || durationDays <= 10
      ? buildDailyTickMs(domain, 1)
      : range.key === "30d" || durationDays <= 45
        ? buildMonthDayTickMs(domain, [1, 8, 15, 22])
        : buildMonthlyTickMs(domain, durationDays > 1095 ? 3 : 1);
  const fallbackTickMs = tickMs.length ? tickMs : [domain.startMs, domain.endMs];
  const maxLabels = isMdUp ? 8 : 5;
  const labelEvery = Math.max(1, Math.ceil(fallbackTickMs.length / maxLabels));

  return fallbackTickMs.map((timestampMs, index) => ({
    timestampMs,
    label: index % labelEvery === 0 ? formatTimeTickLabel(timestampMs, durationDays) : "",
  }));
}

function buildDailyTickMs(domain: { startMs: number; endMs: number }, stepDays: number) {
  const ticks: number[] = [];
  const cursor = startOfDay(new Date(domain.startMs));
  if (cursor.getTime() < domain.startMs) cursor.setDate(cursor.getDate() + 1);
  for (; cursor.getTime() <= domain.endMs; cursor.setDate(cursor.getDate() + stepDays)) {
    ticks.push(cursor.getTime());
  }
  return ticks;
}

function buildMonthDayTickMs(domain: { startMs: number; endMs: number }, monthDays: number[]) {
  const ticks: number[] = [];
  const cursor = startOfMonth(new Date(domain.startMs));
  while (cursor.getTime() <= domain.endMs) {
    monthDays.forEach((day) => {
      const tick = new Date(cursor);
      tick.setDate(day);
      const tickMs = tick.getTime();
      if (tickMs >= domain.startMs && tickMs <= domain.endMs) ticks.push(tickMs);
    });
    cursor.setMonth(cursor.getMonth() + 1, 1);
  }
  return [...new Set(ticks)].sort((a, b) => a - b);
}

function buildMonthlyTickMs(domain: { startMs: number; endMs: number }, stepMonths: number) {
  const ticks: number[] = [];
  const cursor = startOfMonth(new Date(domain.startMs));
  if (cursor.getTime() < domain.startMs) cursor.setMonth(cursor.getMonth() + 1, 1);
  for (; cursor.getTime() <= domain.endMs; cursor.setMonth(cursor.getMonth() + stepMonths, 1)) {
    ticks.push(cursor.getTime());
  }
  return ticks;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfMonth(date: Date) {
  const copy = startOfDay(date);
  copy.setDate(1);
  return copy;
}

function formatTimeTickLabel(timestampMs: number, durationDays: number) {
  return durationDays > 365 ? monthYearFormatter.format(timestampMs) : shortDateFormatter.format(timestampMs);
}

function GuildDevelopmentEmptyState({ message }: { message: string }) {
  return (
    <div className={styles.developmentEmpty}>
      <p>{message}</p>
    </div>
  );
}

function GuildDevelopmentStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.developmentStat}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function GuildProgressAnalytics({
  activeGuild,
  analyticsData,
  identityResolutionSnapshot,
  loading,
  loadingPhase,
  error,
  periodKey,
  onPeriodChange,
}: {
  activeGuild: ReturnType<typeof useGuildHubSelection>["activeGuild"];
  analyticsData: GuildAnalyticsDerivedData;
  identityResolutionSnapshot: IdentityResolutionSnapshot | null;
  loading: boolean;
  loadingPhase: GuildAnalyticsLoaderState;
  error: string | null;
  periodKey: GuildAnalyticsProgressPeriodKey;
  onPeriodChange: (period: GuildAnalyticsProgressPeriodKey) => void;
}) {
  const report = React.useMemo(
    () => {
      const startedAt = analyticsNowMs();
      const nextReport = buildGuildAnalyticsProgressReport(analyticsData, activeGuild, periodKey, identityResolutionSnapshot);
      logGuildAnalyticsViewDiagnostic("chart-model-build", analyticsNowMs() - startedAt, nextReport?.players.length ?? 0, {
        model: "progress-report",
        periodKey,
      });
      return nextReport;
    },
    [activeGuild, analyticsData, periodKey, identityResolutionSnapshot],
  );
  const matchingSeries = React.useMemo(
    () => {
      const startedAt = analyticsNowMs();
      const nextSeries = buildGuildAnalyticsSeries(analyticsData, activeGuild, "memberCount", "all", identityResolutionSnapshot);
      const identityScope = describeGuildAnalyticsIdentityScope(analyticsData, activeGuild, identityResolutionSnapshot);
      logGuildAnalyticsViewDiagnostic("guild-series-build", analyticsNowMs() - startedAt, nextSeries.allPoints.length, {
        model: "progress-member-count",
        selectedGuildIdentifier: identityScope.selectedGuildIdentifier,
        resolvedGuildIdentity: identityScope.resolvedGuildIdentity,
        aliasIdentifierCount: identityScope.aliasIdentifierCount,
        inputGuildObservations: identityScope.inputGuildObservations,
        matchedGuildObservations: identityScope.matchedGuildObservations,
        outputPoints: nextSeries.visiblePoints.length,
      });
      return nextSeries;
    },
    [activeGuild, analyticsData, identityResolutionSnapshot],
  );

  let body: React.ReactNode;
  if (!activeGuild) {
    body = <GuildDevelopmentEmptyState message="Waehle im Guild Hub eine Gilde aus." />;
  } else if (loading) {
    body = (
      <DataHubLoadingState
        title={loadingPhase.title}
        message={loadingPhase.message}
        current={loadingPhase.current}
        total={loadingPhase.total}
        progressLabel={loadingPhase.progressLabel}
      />
    );
  } else if (error) {
    body = <GuildDevelopmentEmptyState message={error} />;
  } else if (!matchingSeries.allPoints.length) {
    body = <GuildDevelopmentEmptyState message="Keine lokalen Scandaten fuer Fortschritt verfuegbar." />;
  } else if (!report) {
    body = <GuildDevelopmentEmptyState message="Mindestens zwei Scans werden fuer eine Fortschrittsauswertung benoetigt." />;
  } else {
    body = <GuildProgressReport report={report} />;
  }

  return (
    <section className={styles.progressPanel} aria-label="Guild Fortschritt">
      <div className={styles.developmentHeader}>
        <div className={styles.developmentTitleBlock}>
          <p className={styles.developmentEyebrow}>Fortschritt</p>
          <h2 className={styles.developmentTitle}>Guild Progress</h2>
          <p className={styles.developmentMeta}>
            {activeGuild ? `${activeGuild.name} - ${activeGuild.server}` : "Keine aktive Gilde"}
          </p>
        </div>
        <div className={styles.segmentedControl} aria-label="Fortschrittszeitraum">
          {PROGRESS_PERIODS.map((period) => (
            <button
              key={period.key}
              type="button"
              className={`${styles.segmentButton} ${period.key === periodKey ? styles.segmentButtonActive : ""}`}
              aria-pressed={period.key === periodKey}
              onClick={() => onPeriodChange(period.key)}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>
      {body}
    </section>
  );
}

function GuildProgressReport({ report }: { report: GuildAnalyticsProgressReport }) {
  const levelMetric = GUILD_ANALYTICS_METRICS.find((metric) => metric.key === "avgLevel") ?? GUILD_ANALYTICS_METRICS[0];
  const baseMetric = GUILD_ANALYTICS_METRICS.find((metric) => metric.key === "avgBaseStats") ?? GUILD_ANALYTICS_METRICS[1];
  const totalMetric = GUILD_ANALYTICS_METRICS.find((metric) => metric.key === "avgTotalStats") ?? GUILD_ANALYTICS_METRICS[2];
  const memberMetric = GUILD_ANALYTICS_METRICS.find((metric) => metric.key === "memberCount") ?? GUILD_ANALYTICS_METRICS[3];

  return (
    <div className={styles.progressReport}>
      <div className={styles.progressRange}>
        <strong>
          {dateFormatter.format(report.baseline.scannedAtMs)} - {dateFormatter.format(report.current.scannedAtMs)}
        </strong>
        <span>
          tatsaechlicher Abstand: {numberFormatter.format(report.daysBetween)} Tage
        </span>
      </div>

      <section className={styles.progressSummaryCard} aria-label="Gildenfortschritt">
        <div className={styles.comparisonHeader}>
          <div>
            <p className={styles.metricLabel}>Gildenfortschritt</p>
            <h3 className={styles.progressCardTitle}>Snapshot-Vergleich</h3>
          </div>
          <span className={styles.diffBadge}>
            Ziel: {report.targetDays} Tage
          </span>
        </div>
        <div className={styles.progressMetricGrid}>
          <ProgressMetricTile label="Durchschnitt Level" metric={levelMetric} data={report.metrics.avgLevel} />
          <ProgressMetricTile label="Durchschnitt Basiswerte" metric={baseMetric} data={report.metrics.avgBaseStats} />
          <ProgressMetricTile label="Durchschnitt Gesamtwerte" metric={totalMetric} data={report.metrics.avgTotalStats} />
          <ProgressMetricTile label={memberMetric.label} metric={memberMetric} data={report.metrics.memberCount} />
        </div>
      </section>

      <div className={styles.progressDetailGrid}>
        <ProgressDetailCard title="Basiswerte" metric={baseMetric} data={report.metrics.avgBaseStats} />
        <ProgressDetailCard title="Gesamtwerte" metric={totalMetric} data={report.metrics.avgTotalStats} />
      </div>

      <section className={styles.progressTableCard} aria-label="Spielerfortschritt">
        <div className={styles.comparisonHeader}>
          <div>
            <p className={styles.metricLabel}>Spielerfortschritt</p>
            <h3 className={styles.progressCardTitle}>Vergleichbare Spieler</h3>
          </div>
          <span className={styles.diffBadge}>{numberFormatter.format(report.players.length)} Spieler</span>
        </div>
        {report.players.length ? (
          <div className={styles.progressTableWrap}>
            <table className={styles.progressTable}>
              <thead>
                <tr>
                  <th>Spieler</th>
                  <th>Level Delta</th>
                  <th>Basis Delta</th>
                  <th>Gesamt Delta</th>
                </tr>
              </thead>
              <tbody>
                {report.players.map((player) => (
                  <tr key={player.memberRef}>
                    <td>{player.name}</td>
                    <td>{formatDeltaValue(player.levelDelta, levelMetric)}</td>
                    <td>{formatDeltaValue(player.baseStatsDelta, baseMetric)}</td>
                    <td>{formatDeltaValue(player.totalStatsDelta, totalMetric)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>Keine Spieler mit Vergleichsbasis in beiden Scans.</div>
        )}
      </section>
    </div>
  );
}

function ProgressMetricTile({
  label,
  metric,
  data,
}: {
  label: string;
  metric: GuildAnalyticsMetricDefinition;
  data: GuildAnalyticsProgressReport["metrics"][GuildAnalyticsMetricKey];
}) {
  return (
    <div className={styles.progressMetricTile}>
      <span>{label}</span>
      <strong>
        {formatMetricValue(data.baselineValue, metric)} - {formatMetricValue(data.currentValue, metric)}
      </strong>
      <em>{formatDeltaValue(data.delta, metric)}</em>
    </div>
  );
}

function ProgressDetailCard({
  title,
  metric,
  data,
}: {
  title: string;
  metric: GuildAnalyticsMetricDefinition;
  data: GuildAnalyticsProgressReport["metrics"][GuildAnalyticsMetricKey];
}) {
  return (
    <section className={styles.progressDetailCard}>
      <h3>{title}</h3>
      <dl>
        <div>
          <dt>Vorher</dt>
          <dd>{formatMetricValue(data.baselineValue, metric)}</dd>
        </div>
        <div>
          <dt>Aktuell</dt>
          <dd>{formatMetricValue(data.currentValue, metric)}</dd>
        </div>
        <div>
          <dt>Veraenderung</dt>
          <dd>{formatDeltaValue(data.delta, metric)}</dd>
        </div>
      </dl>
    </section>
  );
}

function formatMetricValue(value: number | null, metric: GuildAnalyticsMetricDefinition) {
  if (value == null || !Number.isFinite(value)) return "-";
  if (metric.format === "decimal") return value.toFixed(1).replace(".", ",");
  return numberFormatter.format(Math.round(value));
}

function formatChartAxisValue(value: number, metric: GuildAnalyticsMetricDefinition) {
  if (!Number.isFinite(value)) return "-";
  const absolute = Math.abs(value);
  if (absolute >= 100000) return `${numberFormatter.format(Math.round(value / 1000))}k`;
  if (metric.format === "decimal" && Math.abs(value - Math.round(value)) >= 0.05) {
    return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(value);
  }
  return numberFormatter.format(Math.round(value));
}

function formatDeltaValue(value: number | null, metric: GuildAnalyticsMetricDefinition) {
  if (value == null || !Number.isFinite(value)) return "-";
  if (value === 0) return "0";
  const formatted = formatMetricValue(Math.abs(value), metric);
  return value > 0 ? `+${formatted}` : `-${formatted}`;
}

function GuildComparisonContent({
  selectedGuildA,
  selectedGuildB,
  selectedGuildAId,
  selectedGuildBId,
  serverFilter,
  comparisonReady,
  countdownA,
  countdownB,
  activePopover,
  onSelectGuild,
  onClearSlot,
  onServerChange,
  onToggleFreshnessDetails,
  averageMembers,
  isMdUp,
  totalGuilds,
}: {
  selectedGuildA: GuildSummary | null;
  selectedGuildB: GuildSummary | null;
  selectedGuildAId: string | null;
  selectedGuildBId: string | null;
  serverFilter: string;
  comparisonReady: boolean;
  countdownA: string;
  countdownB: string;
  activePopover: string | null;
  onSelectGuild: (slot: SlotKey, guild: GuildSummary) => void;
  onClearSlot: (slot: SlotKey) => void;
  onServerChange: (value: string) => void;
  onToggleFreshnessDetails: (guildId: string) => void;
  averageMembers: number;
  isMdUp: boolean;
  totalGuilds: number;
}) {
  return (
    <>
      <div className={styles.infoStrip}>
        <div className={styles.infoCard}>
          <span className={styles.infoLabel}>Pool</span>
          <strong>{numberFormatter.format(totalGuilds)} Gilden</strong>
        </div>
        <div className={styles.infoCard}>
          <span className={styles.infoLabel}>Durchschnitt Mitglieder</span>
          <strong>{numberFormatter.format(averageMembers)}</strong>
        </div>
        <div className={styles.infoCard}>
          <span className={styles.infoLabel}>Serverfilter</span>
          <strong>{serverFilter === "all" ? "Alle" : serverFilter}</strong>
        </div>
      </div>
      {isMdUp ? (
        <div className={styles.inlineFilters}>
          <label className={styles.filterField}>
            <span>Server</span>
            <select
              className={styles.select}
              value={serverFilter}
              onChange={(event) => onServerChange(event.target.value)}
            >
              <option value="all">Alle Server</option>
              {SERVER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      <div className={styles.layout}>
        <section className={styles.selectionColumn}>
          <GuildSelectionCard
            title="Gilde A"
            slot="guildA"
            selectedGuild={selectedGuildA}
            excludeId={selectedGuildBId}
            onSelect={onSelectGuild}
            onClear={onClearSlot}
            serverFilter={serverFilter}
            onServerChange={onServerChange}
          />
          <GuildSelectionCard
            title="Gilde B"
            slot="guildB"
            selectedGuild={selectedGuildB}
            excludeId={selectedGuildAId}
            onSelect={onSelectGuild}
            onClear={onClearSlot}
            serverFilter={serverFilter}
            onServerChange={onServerChange}
          />
        </section>

        <section className={styles.comparisonColumn}>
          <div className={styles.comparisonCard}>
            <div className={styles.comparisonHeader}>
              <div>
                <p className={styles.kicker}>Vergleich</p>
                <h2 className={styles.sectionTitle}>Kennzahlen</h2>
              </div>
              {comparisonReady && selectedGuildA && selectedGuildB ? (
                <span className={styles.diffBadge}>
                  Delta Mitglieder: {numberFormatter.format(selectedGuildA.members - selectedGuildB.members)}
                </span>
              ) : null}
            </div>

            {comparisonReady && selectedGuildA && selectedGuildB ? (
              <>
                <div className={styles.metricGrid}>
                  <MetricCard label="Mitglieder" aValue={selectedGuildA.members} bValue={selectedGuildB.members} />
                  <MetricCard
                    label="Durchschnittslevel"
                    aValue={selectedGuildA.avgLevel}
                    bValue={selectedGuildB.avgLevel}
                    isDecimal
                  />
                  <FreshnessMetric
                    guildA={selectedGuildA}
                    guildB={selectedGuildB}
                    countdownA={countdownA}
                    countdownB={countdownB}
                    activePopover={activePopover}
                    onToggle={onToggleFreshnessDetails}
                  />
                </div>

                <ClassDistributionCard guildA={selectedGuildA} guildB={selectedGuildB} />
              </>
            ) : (
              <div className={styles.emptyState}>
                <p>Waehle zwei Gilden aus, um den direkten Vergleich zu starten.</p>
              </div>
            )}
          </div>

          <div className={styles.supportPanels}>
            <ChecklistCard />
            <TransfersPlaceholder />
          </div>
        </section>
      </div>
    </>
  );
}

type SelectionCardProps = {
  title: string;
  slot: SlotKey;
  selectedGuild: GuildSummary | null;
  excludeId?: string | null;
  onSelect: (slot: SlotKey, guild: GuildSummary) => void;
  onClear: (slot: SlotKey) => void;
  serverFilter: string;
  onServerChange: (value: string) => void;
};

function GuildSelectionCard({
  title,
  slot,
  selectedGuild,
  excludeId,
  onSelect,
  onClear,
  serverFilter,
  onServerChange,
}: SelectionCardProps) {
  const [searchValue, setSearchValue] = React.useState("");
  const debouncedSearch = useDebouncedValue(searchValue, 300);

  React.useEffect(() => {
    setSearchValue("");
  }, [selectedGuild, serverFilter]);

  const { results, loading } = useGuildSearchResults(debouncedSearch, serverFilter, excludeId);

  return (
    <article className={styles.selectionCard}>
      <div className={styles.slotHeader}>
        <div>
          <p className={styles.slotLabel}>{title}</p>
          <p className={styles.slotStatus}>
            {selectedGuild ? "Ausgewaehlt" : "Noch keine Auswahl"}
          </p>
        </div>
        {selectedGuild && (
          <button type="button" className={styles.clearButton} onClick={() => onClear(slot)}>
            Reset
          </button>
        )}
      </div>

      <div className={styles.slotBody}>
        <label className={styles.filterField}>
          <span>Server</span>
          <select
            className={styles.select}
            value={serverFilter}
            onChange={(event) => onServerChange(event.target.value)}
          >
            <option value="all">Alle Server</option>
            {SERVER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filterField}>
            <span>Suchen</span>
            <input
              className={styles.searchInput}
              placeholder="Gildennamen eingeben"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
            />
          </label>

          <div className={styles.resultList} role="list">
            {loading && <div className={styles.emptyResult}>Lade...</div>}
            {!loading && results.length === 0 && (
              <div className={styles.emptyResult}>Keine Gilde gefunden.</div>
            )}
          {!loading && results.map((guild) => (
            <div key={guild.id} className={styles.resultItem}>
              <div>
                <p className={styles.resultName}>{guild.name}</p>
                <p className={styles.resultMeta}>
                  {guild.server} - {guild.members} Mitglieder
                </p>
              </div>
              <button
                type="button"
                className={styles.selectButton}
                onClick={() => onSelect(slot, guild)}
              >
                Waehlen
              </button>
            </div>
          ))}
        </div>

        {selectedGuild && (
          <div className={styles.selectedCard}>
            <p className={styles.selectedName}>{selectedGuild.name}</p>
            <p className={styles.selectedMeta}>
              {selectedGuild.server} - {selectedGuild.members} Mitglieder - Durchschnittslevel{" "}
              {selectedGuild.avgLevel.toFixed(1)}
            </p>
            <p className={styles.selectedTagline}>{selectedGuild.tagline}</p>
          </div>
        )}
      </div>
    </article>
  );
}

type MetricProps = {
  label: string;
  aValue: number;
  bValue: number;
  isDecimal?: boolean;
};

function MetricCard({ label, aValue, bValue, isDecimal = false }: MetricProps) {
  const formatter = (value: number) =>
    isDecimal ? value.toFixed(1).replace(".", ",") : numberFormatter.format(value);

  const rawDelta = aValue - bValue;
  let deltaText = "gleich";
  if (rawDelta !== 0) {
    const formattedDelta = isDecimal
      ? Math.abs(rawDelta).toFixed(1).replace(".", ",")
      : numberFormatter.format(Math.abs(rawDelta));
    deltaText = rawDelta > 0 ? `+${formattedDelta}` : `-${formattedDelta}`;
  }

  return (
    <div className={styles.metricCard}>
      <p className={styles.metricLabel}>{label}</p>
      <div className={styles.metricValues}>
        <span aria-label="Gilde A">{formatter(aValue)}</span>
        <span className={styles.metricDivider}>vs</span>
        <span aria-label="Gilde B">{formatter(bValue)}</span>
      </div>
      <p className={styles.metricDelta}>{deltaText}</p>
    </div>
  );
}

type FreshnessMetricProps = {
  guildA: GuildSummary;
  guildB: GuildSummary;
  countdownA: string;
  countdownB: string;
  activePopover: string | null;
  onToggle: (guildId: string) => void;
};

function FreshnessMetric({
  guildA,
  guildB,
  countdownA,
  countdownB,
  activePopover,
  onToggle,
}: FreshnessMetricProps) {
  return (
    <div className={styles.metricCard}>
      <p className={styles.metricLabel}>Freshness</p>
      <div className={styles.freshnessRow}>
        {[guildA, guildB].map((guild) => {
          const countdown = guild.id === guildA.id ? countdownA : countdownB;
          const popoverId = `fresh-${guild.id}`;
          const isOpen = activePopover === popoverId;

          return (
            <div key={guild.id} className={styles.freshnessItem}>
              <button
                type="button"
                className={styles.freshnessBadge}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                onClick={() => onToggle(popoverId)}
              >
                <span>{guild.freshness.toUpperCase()}</span>
                <small>{formatRelative(guild.lastScanAt)}</small>
              </button>
              {isOpen && (
                <div className={styles.freshnessPopover} role="dialog">
                  <p className={styles.popoverTitle}>{guild.name}</p>
                  <dl>
                    <div>
                      <dt>Status</dt>
                      <dd>{FRESHNESS_DISPLAY[guild.freshness]}</dd>
                    </div>
                    <div>
                      <dt>Zuletzt gescannt</dt>
                      <dd>{formatDate(guild.lastScanAt)}</dd>
                    </div>
                    <div>
                      <dt>Naechstes Update</dt>
                      <dd>
                        {formatDate(guild.nextUpdateAt)} ({countdown})
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ClassDistributionProps = {
  guildA: GuildSummary;
  guildB: GuildSummary;
};

function ClassDistributionCard({ guildA, guildB }: ClassDistributionProps) {
  const legend = React.useMemo(() => {
    return Array.from(new Set([...guildA.classes, ...guildB.classes].map((slice) => slice.label)));
  }, [guildA.classes, guildB.classes]);

  return (
    <div className={styles.classCard}>
      <p className={styles.metricLabel}>Klassenverteilung</p>
      <div className={styles.classGrid}>
        {[guildA, guildB].map((guild) => (
          <div key={guild.id} className={styles.classColumn}>
            <h3>{guild.name}</h3>
            <div className={styles.classBar} aria-label={`Klassenverteilung ${guild.name}`}>
              {guild.classes.map((slice) => (
                <span
                  key={slice.label}
                  style={{ width: `${slice.percent}%` }}
                  className={styles.classSlice}
                >
                  <small>{slice.label}</small>
                  <strong>{slice.percent}%</strong>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <ul className={styles.classLegend}>
        {legend.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
    </div>
  );
}

function ChecklistCard() {
  const items = [
    "Audit der Rollenabdeckung (Tank/Heal/Support)",
    "Loot-Regeln angleichen und dokumentieren",
    "Raid-Kalender synchronisieren",
    "Kommunikationskanaele zusammenfuehren",
    "Server-Transfers und Namenskonflikte pruefen",
  ];

  return (
    <section className={styles.checklistCard}>
      <h3>Vor dem Vergleich pruefen</h3>
      <ul className={styles.checklist}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function TransfersPlaceholder() {
  return (
    <section className={styles.infoCardExtended}>
      <h3>Transfers-Diff</h3>
      <p>
        Hier erscheint spaeter die Auswertung aus <code>lib/guilds/transfers/</code>. Aktuell nur eine
        Info-Box, damit der Slot sichtbar bleibt.
      </p>
      <p className={styles.infoNote}>
        Bereite schon jetzt deine Kriterien vor, damit die spaetere Automatik direkt Daten aufnehmen
        kann.
      </p>
      <button type="button" className={styles.secondaryAction} disabled>
        Modul folgt
      </button>
    </section>
  );
}

function useGuildSearchResults(term: string, server: string, excludeId?: string | null) {
  const [results, setResults] = React.useState<GuildSummary[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const q = term.trim();
    if (q.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function run() {
      const scope: FirestoreTraceScope = beginReadScope("CompareGuilds:search");
      setLoading(true);
      try {
        const folded = q.toLowerCase();
        const cg = collectionGroup(db, "latest");

        const snapPrefix = await traceGetDocs(scope, { path: "guilds/latest (collectionGroup)" }, () =>
          getDocs(
            fsQuery(
              cg,
              orderBy("nameFold"),
              startAt(folded),
              endAt(folded + "\uf8ff"),
              limit(15),
            ),
          ),
        );
        const snapNgram = await traceGetDocs(scope, { path: "guilds/latest (collectionGroup)" }, () =>
          getDocs(fsQuery(cg, where("nameNgrams", "array-contains", folded), limit(15))),
        );

        const seen = new Set<string>();
        const next: GuildSummary[] = [];
        const consider = (docSnap: any) => {
          const data = docSnap.data() as any;
          const ref = docSnap.ref;
          const parentDoc = ref.parent?.parent;
          const rootCol = parentDoc?.parent;
          const root = rootCol?.id;
          if (root !== "guilds") return;
          const id = parentDoc?.id ?? data.guildIdentifier ?? docSnap.id;
          if (!id || seen.has(id)) return;
          if (excludeId && id === excludeId) return;

          const name = data.name ?? data.values?.Name ?? "Unbekannte Gilde";
          const serverVal = data.server ?? data.values?.Server ?? "Unknown";
          if (server !== "all" && serverVal !== server) return;

          const members =
            data.memberCount ??
            data.values?.["Guild Member Count"] ??
            data.values?.GuildMemberCount ??
            0;
          const updated =
            data.updatedAt ??
            data.values?.UpdatedAt ??
            (data.timestamp ? new Date(data.timestamp * 1000).toISOString() : new Date().toISOString());

          seen.add(id);
          next.push({
            id,
            name,
            tagline: data.tagline ?? "",
            server: serverVal,
            members,
            avgLevel: data.avgLevel ?? data.values?.AvgLevel ?? 0,
            lastScanAt: updated,
            updatedAt: updated,
            nextUpdateAt: updated,
            freshness: "unknown",
            classes: [],
          });
        };

        snapPrefix.forEach(consider);
        snapNgram.forEach(consider);

        if (!cancelled) {
          next.sort((a, b) => a.name.localeCompare(b.name));
          setResults(next);
        }
      } catch (error) {
        console.error("[GuildHub CompareGuilds] guild search failed", error);
        if (!cancelled) setResults([]);
      } finally {
        endReadScope(scope);
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [term, server, excludeId]);

  return { results, loading };
}

function hoursAgoISO(hours: number) {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date.toISOString();
}

function hoursFromNowISO(hours: number) {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}
