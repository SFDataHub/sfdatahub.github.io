import { profileClassLabel } from "../../lib/i18n/profilePresentation";
import { hubText, hubLocale, hubNumber, hubDate, hubPercent, hubMessage } from "../../lib/i18n/dataHubPresentation";
import { analyticsViewEvents, useAnalyticsView } from "../../lib/analytics/localEvents";
import { auditBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave, auditDiscard, auditAssociate, auditEnabled, auditEvent, auditFields, auditObserveInputs, auditCall, auditDiagnostic, auditPrepareGraph, auditExpectGraph, type AuditRun } from "../../lib/data-hub/runtimeAudit";
import type { HubFavorite } from "../../lib/data-hub/hubFavoritesContract";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { useLocalFavoritePageAction } from "../../components/data-hub/LocalFavoritesMenu";
import DataHubBackLink from "../../components/guildhub/DataHubBackLink";
import React from "react";
import { useRuntimeAuditGraphCommit } from "../../lib/data-hub/useRuntimeAuditGraphCommit";
import { useRuntimeAuditCommit } from "../../lib/data-hub/useRuntimeAuditCommit";
import ContentShell from "../../components/ContentShell";
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
  GUILD_ANALYTICS_METRICS as ANALYTICS_METRIC_DEFINITIONS,
  GUILD_ANALYTICS_RANGES as ANALYTICS_RANGE_DEFINITIONS,
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
import { subscribeToFightTrackingChanges } from "../GuildHub/fightTrackingStore";
import {
  loadGuildAnalyticsLocalFirstData,
  type GuildAnalyticsLocalFirstAcquisitionOutcome,
} from "./guildAnalyticsLocalFirst";
import styles from "../GuildHub/Fusion.module.css";
import { subscribeToLocalDataDependencies, type LocalDependencyNotification } from "../../lib/local-data/localDataDependencies";
import { useGuildHubSelection } from "../GuildHub/hooks/useGuildHubSelection";
import {
  type FreshnessCode,
  FRESHNESS_DISPLAY,
} from "../GuildHub/plannerData";

// Keep derived data definitions and calculations locale independent.
const ANALYTICS_METRIC_LABELS: Record<GuildAnalyticsMetricKey, string> = {
  avgLevel: "level", avgBaseStats: "baseStats", avgTotalStats: "totalStats", memberCount: "members", fightParticipation: "fightParticipation",
};
const ANALYTICS_RANGE_LABELS = { "7d": "7Days", "30d": "30Days", "90d": "90Days", "6m": "6Months", "1y": "1Year", all: "allTime", custom: "custom" };
const GUILD_ANALYTICS_METRICS = ANALYTICS_METRIC_DEFINITIONS.map(metric => ({
  ...metric, get label() { return hubText("dataHubI18n." + ANALYTICS_METRIC_LABELS[metric.key]); },
}));
const GUILD_ANALYTICS_RANGES = ANALYTICS_RANGE_DEFINITIONS.map(range => ({
  ...range, get label() { return hubText("dataHubI18n." + ANALYTICS_RANGE_LABELS[range.key]); },
}));

const formatDate = (value: string) => hubDate(new Date(value), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
function formatRelative(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  const hours = Math.round(minutes / 60);
  const amount = minutes < 60 ? minutes : hours < 48 ? hours : Math.round(hours / 24);
  return new Intl.RelativeTimeFormat(hubLocale()).format(-amount, minutes < 60 ? "minute" : hours < 48 ? "hour" : "day");
}
function formatCountdown(value: string, now: number) {
  const diff = new Date(value).getTime() - now;
  if (diff <= 0) return hubText("dataHubI18n.due");
  const minutes = Math.floor(diff / 60000), hours = Math.floor(minutes / 60);
  return hubNumber(minutes < 60 ? minutes : hours < 24 ? hours : Math.floor(hours / 24), {
    style: "unit", unit: minutes < 60 ? "minute" : hours < 24 ? "hour" : "day", unitDisplay: "short",
  });
}

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
  { key: "overview", get label() { return hubText("dataHubI18n.overview"); } },
  { key: "progress", get label() { return hubText("dataHubI18n.progress"); } },
  { key: "compare", get label() { return hubText("dataHubI18n.comparison"); } },
];
const PROGRESS_PERIODS: Array<{ key: GuildAnalyticsProgressPeriodKey; label: string }> = [
  { key: "weekly", get label() { return hubText("dataHubI18n.weekly"); } },
  { key: "monthly", get label() { return hubText("dataHubI18n.monthly"); } },
];
const GUILD_AVERAGE_COLOR = "#55dba6";
const PLAYER_HISTORY_OTHER_GUILD_COLOR = "#b8b8b8";
const PLAYER_SERIES_COLORS = ["#f2a65a", "#7da5d8", "#d481e8", "#88d96b", "#f06f8f", "#66c7d9", "#ffd166", "#b68cff"];
const GUILD_AVERAGE_SERIES_KEY = "guild-average";

const getPlayerSeriesColor = (seriesIndex: number) => PLAYER_SERIES_COLORS[seriesIndex % PLAYER_SERIES_COLORS.length];

const numberFormatter = { format: (value: number) => hubNumber(value) };
const dateFormatter = { format: (value: Date | number) => hubDate(value, { day: "2-digit", month: "2-digit", year: "numeric" }) };
const shortDateFormatter = { format: (value: Date | number) => hubDate(value, { day: "2-digit", month: "2-digit" }) };
const monthYearFormatter = { format: (value: Date | number) => hubDate(value, { month: "short", year: "numeric" }) };
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

const analyticsNowMs = () =>
  auditEnabled() ? (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()) : 0;

const buildAnalyticsLoaderState = (update: GuildAnalyticsLoadPhaseUpdate): GuildAnalyticsLoaderState => {
  const progress =
    update.sourceIndex && update.sourceCount
      ? {
          current: update.sourceIndex,
          total: update.sourceCount,
          progressLabel: hubText("dataHubI18n.scansProcessed"),
        }
      : {};
  const phaseLabels: Record<GuildAnalyticsLoadPhase, GuildAnalyticsLoaderState> = {
    "loading-local-scan-data": {
      title: hubText("dataHubI18n.loadingLocalScanData"),
      message: hubText("dataHubI18n.readingLocalScanSummaries"),
    },
    "checking-analytics-cache": {
      title: hubText("dataHubI18n.checkingAnalyticsCache"),
      message: hubText("dataHubI18n.comparingDerivedAnalyticsVersionsAndSourceHashes"),
    },
    "rebuilding-analytics-data": {
      title: hubText("dataHubI18n.updatingAnalyticsData"),
      message:
        hubText("dataHubI18n.afterAnSfDataHubUpdateYourLocalScansAreReadAgain"),
      ...progress,
    },
    "normalizing-historical-data": {
      title: progress.current ? hubText("dataHubI18n.updatingAnalyticsData") : hubText("dataHubI18n.normalizingHistoricalData"),
      message: progress.current
        ? hubText("dataHubI18n.afterAnSfDataHubUpdateYourLocalScansAreReadAgain")
        : hubText("dataHubI18n.preparingHistoricalPlayerAndGuildObservations"),
      ...progress,
    },
    "saving-derived-analytics": {
      title: progress.current ? hubText("dataHubI18n.updatingAnalyticsData") : hubText("dataHubI18n.savingDerivedAnalytics"),
      message: progress.current
        ? hubText("dataHubI18n.afterAnSfDataHubUpdateYourLocalScansAreReadAgain")
        : hubText("dataHubI18n.writingRebuiltAnalyticsSnapshotsToIndexeddb"),
      ...progress,
    },
    "loading-derived-analytics": {
      title: hubText("dataHubI18n.loadingDerivedAnalytics"),
      message: hubText("dataHubI18n.readingPreparedSnapshotsMembersAndGuilds"),
    },
  };
  return phaseLabels[update.phase];
};

const recordGuildAnalyticsViewDiagnostic = (
  run: AuditRun | null, phase: string, durationMs: number, count: number,
  details?: Record<string, string | number | boolean | null>,
) => auditDiagnostic(run, { phase, durationMs, count, details });

export default function GuildHubCompareGuilds() {
  const { t } = useTranslation();
  const isMdUp = useMediaQuery("(min-width: 768px)");
  const selection = useGuildHubSelection("guild-analytics");
  const handlePageFavorite = React.useCallback((favorite: HubFavorite) => { if (favorite.guild) selection.chooseGuild(favorite.guild); }, [selection.chooseGuild]);
  useLocalFavoritePageAction(t("hubNavigation.useAnalytics"), handlePageFavorite);
  const { activeGuild } = selection;
  const [selectedPlayerIds, setSelectedPlayerIds] = React.useState<string[]>([]);

  const [activeTab, setActiveTab] = React.useState<AnalyticsTabKey>("overview");
  useAnalyticsView(analyticsViewEvents[activeTab]);
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
 const __w32Run0=auditBegin("F13","averageMembers");
 const __w32Sync=auditEnter(__w32Run0,"averageMembers","sync-elapsed");
 try {
    const list = [selectedGuildA, selectedGuildB].filter(Boolean) as GuildSummary[];
    if (!list.length) return auditReturn(__w32Run0,0);
    const sum = list.reduce((acc, g) => acc + (g.members ?? 0), 0);
    return auditReturn(__w32Run0,Math.round(sum / list.length));

} catch (__w32Error) { auditError(__w32Run0,__w32Error); throw __w32Error; } finally {auditValue(__w32Run0,__w32Sync,undefined);auditLeave(__w32Run0);}
}, [selectedGuildA, selectedGuildB]);

  const [activePopover, setActivePopover] = React.useState<string | null>(null);
  useAnalyticsView(activeTab === "compare" && activePopover ? "datahub/analytics/details" : null);
  const [isFilterSheetOpen, setFilterSheetOpen] = React.useState(false);
  useAnalyticsView(activeTab === "compare" && !isMdUp && isFilterSheetOpen ? "datahub/analytics/filters" : null);

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
    [selectedGuildA, t],
  );
  const countdownB = React.useMemo(
    () => (selectedGuildB ? formatCountdown(selectedGuildB.nextUpdateAt, Date.now()) : ""),
    [selectedGuildB, t],
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
    <ContentShell title="Data Hub" subtitle={hubText("dataHubI18n.analytics")} centerFramed={false}>
      <div className={styles.page}>
        <section data-page-guild-context>
          {selection.contextIssue && <p role="alert">{t(`pageContext.${selection.contextIssue}`)}</p>}
          {selection.context.guild && <button type="button" onClick={() => selection.chooseGuild(null)}>{t("pageContext.clear")}</button>}
        </section>
        <header className={styles.header}>
          <div className={styles.headerStack}>

            <div>
              <DataHubBackLink />
              <p className={styles.kicker}>Data Hub</p>
              <h1 className={styles.title}>{hubText("dataHubI18n.analytics")}</h1>
              <p className={styles.subtitle}>
                {hubText("dataHubI18n.progressDevelopmentAndComparisonsInDataHub")}
              </p>
            </div>
            <div className={styles.headerActions}>
              {activeTab === "compare" && !isMdUp && (
                <button
                  type="button"
                  className={styles.secondaryAction}
                  onClick={openFilterSheet}
                >
                  {hubText("dataHubI18n.filter")}
                </button>
              )}
            </div>
          </div>
          <nav className={styles.tabs} aria-label={hubText("dataHubI18n.analyticsSections")}>
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
            auditContext={selection.auditContext}
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
              <h3>{hubText("dataHubI18n.filter")}</h3>
              <button type="button" className={styles.clearButton} onClick={closeFilterSheet}>
                {hubText("dataHubI18n.close")}
              </button>
            </header>
            <div className={styles.sheetBody}>
              <label className={styles.filterField}>
                <span>{hubText("dataHubI18n.server")}</span>
                <select
                  className={styles.select}
                  value={serverFilter}
                  onChange={(event) => handleServerChange(event.target.value)}
                >
                  <option value="all">{hubText("dataHubI18n.allServers")}</option>
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

    const load = (cause?: LocalDependencyNotification) => {
      const runId = ++loadRunId;
      const controller = new AbortController();
      controllers.add(controller);
      let startedAcquisitionKey: string | null = null;
      const isStale = () => cancelled || runId !== loadRunId;
      const analyticsLoadStartedAt = analyticsNowMs();
      const __audit1 = auditBegin("F12", "@callback");
      auditExpectGraph(__audit1);
      auditFields(__audit1, { ...cause, trigger: cause?.trigger ?? "analytics-load-effect", consumer: "guild-analytics-data", startBoundary: "load-callback", selectedPlayers: selectedPlayerIds.length, range: range.key });
      const pushDiagnostic = (entry: GuildAnalyticsDiagnosticEntry) => auditDiagnostic(__audit1, entry);
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
          if (auditEnabled()) pushDiagnostic({
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
    try {
        const cachedIdentitySnapshot = identitySnapshotRef.current;
        const identityStartedAt = analyticsNowMs();
        const result = await (auditValue(__audit1, auditEnter(__audit1, "loadGuildAnalyticsLocalFirstData"), (loadGuildAnalyticsLocalFirstData({
          guild: activeGuild,
          range,
          selectedPlayerIds,
          cachedIdentityResolutionSnapshot: cachedIdentitySnapshot,
          signal: controller.signal,
          dependencies: {
            listScanSummaries: async () => {
              const summaryStartedAt = analyticsNowMs();
              const summaries = await auditCall(__audit1, "scan-summary-request", () => listGuildHubScanSummaries(), "async-container");
              if (auditEnabled()) pushDiagnostic({
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
            getLocalScan: (...args) => auditCall(__audit1, "scan-request", () => getGuildHubLocalScan(...args), "async-container"),
            loadIdentityResolutionSnapshot: (...args) => auditCall(__audit1, "identity-request", () => loadIdentityResolutionSnapshot(...args), "async-container"),
            ensureScopedDataFromSummaries: (...args) => auditCall(__audit1, "scoped-analytics-request", () => ensureGuildAnalyticsScopedDataFromSummaries(...args), "async-container"),
            acquireLocalFirstScans: (...args) => auditCall(__audit1, "archive-acquisition-request", () => acquireLocalFirstScans(...args), "async-container"),
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
            if (auditEnabled()) pushDiagnostic({
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
            if (!isStale()) identitySnapshotRef.current = snapshot;
          },
          onAcquisitionOutcome: finishAcquisition,
          onDiagnostic: auditEnabled() ? pushDiagnostic : undefined,
          onSourceDiagnostic: auditEnabled() ? (entry) => auditEvent(__audit1, "legacy:rematerialization-source", entry) : undefined,
          onPhase: pushPhase,
        }))));
        startedAcquisitionKey = null;
        const identityResolutionSnapshot = result.identityResolutionSnapshot;
          if (auditEnabled()) pushDiagnostic({
            phase: "analytics-data-preparation",
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
          if (isStale()) { if (__audit1) auditDiscard(__audit1); return; }
          if (!isStale()) {
            const reactStateStartedAt = analyticsNowMs();
            (auditValue(__audit1, auditEnter(__audit1, "state-enqueue:setState", "sync-elapsed"), (setState({
              analyticsData,
              identityResolutionSnapshot,
              loading: false,
              loadingPhase: (auditValue(__audit1, auditEnter(__audit1, "buildAnalyticsLoaderState", "sync-elapsed"), (buildAnalyticsLoaderState({ phase: "loading-derived-analytics" })))),
              error: null,
            }))));
            auditAssociate(__audit1, analyticsData);
            auditFields(__audit1, { "result:snapshots": analyticsData.snapshots.length, "result:members": analyticsData.members.length, "result:guilds": analyticsData.guilds.length });
            if (__audit1) {
              auditEvent(__audit1, "accepted-state", { snapshots: analyticsData.snapshots.length, members: analyticsData.members.length, guilds: analyticsData.guilds.length });
              if (auditEnabled()) pushDiagnostic({ phase: "react-state-enqueue", durationMs: analyticsNowMs() - reactStateStartedAt, count: 1 });
              const analyticsTotalMs = analyticsNowMs() - analyticsLoadStartedAt;
              const sumKnownPhasesMs = __audit1.record?.counts.legacyReportedDurationMsNonAdditive ?? 0;
              auditEvent(__audit1, "legacy:load-accounting", { analyticsTotalMs, sumSpanElapsedMsNonAdditive: sumKnownPhasesMs, signedTotalMinusSumMsNotATimeBudget: analyticsTotalMs - sumKnownPhasesMs });
              auditDiagnostic(__audit1, { phase: "data-load-total", durationMs: analyticsTotalMs });
            }
          }

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
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
              error: hubText("dataHubI18n.localAnalyticsDataCouldNotBeLoaded"),
            });
          }
        })
        .finally(() => {
          controllers.delete(controller);
        });
    };

    load();
    const unsubscribe = subscribeToSfDataHubLocalScanChanges(load, { consumer: "guild-analytics-sources" });
    const unsubscribeIdentity = subscribeToLocalDataDependencies({ allIdentities: true }, load, undefined, { consumer: "guild-analytics-identities" });

    return () => {
      cancelled = true;
      controllers.forEach((controller) => controller.abort());
      unsubscribe(); unsubscribeIdentity();
    };
  }, [activeGuild, selectedPlayerIds, range]);

  useRuntimeAuditCommit(state.analyticsData, !state.loading && !state.error && state.analyticsData !== EMPTY_GUILD_ANALYTICS_DATA, "guild-analytics-data");
  return state;
}

function GuildDevelopmentOverview({
  auditContext,
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
  auditContext?: import("../../lib/data-hub/runtimeAudit").AuditFields;
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
  const locale = hubLocale();
  const metric = GUILD_ANALYTICS_METRICS.find((entry) => entry.key === metricKey) ?? GUILD_ANALYTICS_METRICS[0];
  const chartAxisFormatter = React.useCallback((value: number) => formatChartAxisValue(value, metric), [metric, locale]);
  const isFightParticipation = metric.key === "fightParticipation";
  const supportsPlayerComparison = isPlayerComparisonMetric(metric.key);
  const scanMetricKey = isFightParticipation ? "avgLevel" : metric.key;
  const playerComparison = React.useMemo(
    () => {
    const __audit2 = auditBegin("F13", "playerComparison");
    auditFields(__audit2, { consoleRole: "observation", graphPhase: "player-history-preparation" });
    auditObserveInputs(__audit2, [analyticsData]);
    try {
      const startedAt = analyticsNowMs();
      const comparison = (auditValue(__audit2, auditEnter(__audit2, "buildGuildAnalyticsPlayerComparison", "sync-elapsed"), (buildGuildAnalyticsPlayerComparison(
        analyticsData,
        activeGuild,
        supportsPlayerComparison ? metric.key : "avgLevel",
        rangeKey,
        selectedPlayerIds,
        identityResolutionSnapshot,
      ))));
      if (auditEnabled()) recordGuildAnalyticsViewDiagnostic(__audit2, "player-history-build", analyticsNowMs() - startedAt, selectedPlayerIds.length, {
        selectedPlayers: selectedPlayerIds.length,
        inputObservations: analyticsData.members.length,
        outputPoints: comparison.playerSeries.reduce((sum, series) => sum + series.points.length, 0),
      });
      return auditReturn(__audit2, comparison);

    } catch (__auditError) { auditError(__audit2, __auditError); throw __auditError; }
    finally { auditLeave(__audit2); }
},
    [activeGuild, analyticsData, supportsPlayerComparison, metric.key, rangeKey, selectedPlayerIds, identityResolutionSnapshot],
  );
  const series = React.useMemo(
    () => {
    const __audit3 = auditBegin("F13", "series");
    auditObserveInputs(__audit3, [playerComparison, analyticsData]);
    try {
      const startedAt = analyticsNowMs();
      const nextSeries = isFightParticipation
        ? { allPoints: [], visiblePoints: [], timeDomain: null }
        : supportsPlayerComparison
          ? playerComparison.guildSeries
          : (auditValue(__audit3, auditEnter(__audit3, "buildGuildAnalyticsSeries", "sync-elapsed"), (buildGuildAnalyticsSeries(analyticsData, activeGuild, scanMetricKey, rangeKey, identityResolutionSnapshot))));
      const identityScope = describeGuildAnalyticsIdentityScope(analyticsData, activeGuild, identityResolutionSnapshot);
      if (auditEnabled()) recordGuildAnalyticsViewDiagnostic(__audit3, "guild-series-build", analyticsNowMs() - startedAt, nextSeries.allPoints.length, {
        selectedGuildIdentifier: identityScope.selectedGuildIdentifier,
        resolvedGuildIdentity: identityScope.resolvedGuildIdentity,
        aliasIdentifierCount: identityScope.aliasIdentifierCount,
        inputGuildObservations: identityScope.inputGuildObservations,
        matchedGuildObservations: identityScope.matchedGuildObservations,
        outputPoints: nextSeries.visiblePoints.length,
      });
      return auditReturn(__audit3, nextSeries);

    } catch (__auditError) { auditError(__audit3, __auditError); throw __auditError; }
    finally { auditLeave(__audit3); }
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
    const __audit4 = auditBegin("F13", "scanChart");
    auditObserveInputs(__audit4, [playerComparison, series]);
    if (!loading && !error && activeGuild && visiblePoints.length) auditPrepareGraph(__audit4);
    try {
      const startedAt = analyticsNowMs();
      const model = (auditValue(__audit4, auditEnter(__audit4, "buildScanChartViewModel", "sync-elapsed"), (buildScanChartViewModel(metric, visiblePoints, playerComparison, supportsPlayerComparison))));
      if (auditEnabled()) recordGuildAnalyticsViewDiagnostic(__audit4, "chart-model-build", analyticsNowMs() - startedAt, model.series.length, {
        metric: metric.key,
        guildPoints: visiblePoints.length,
        playerSeries: playerComparison.playerSeries.length,
      });
      return auditReturn(__audit4, model);

    } catch (__auditError) { auditError(__audit4, __auditError); throw __auditError; }
    finally { auditLeave(__audit4); }
},
    [metric, visiblePoints, playerComparison, supportsPlayerComparison, locale],
  );
  useRuntimeAuditCommit(playerComparison, !isFightParticipation, "guild-analytics-player-comparison");
  useRuntimeAuditCommit(series, !isFightParticipation, "guild-analytics-series");
  useRuntimeAuditCommit(scanChart, !isFightParticipation, "guild-analytics-chart");
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
    [series.timeDomain, rangeKey, isMdUp, locale],
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
    [fusionMarkers, scanChart.tooltips.length, locale],
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
    body = <GuildDevelopmentEmptyState message={hubText("dataHubI18n.selectAGuildInGuildHub")} />;
  } else if (loading) {
    body = (
      <DataHubLoadingState
        title={hubMessage(loadingPhase.title)}
        message={hubMessage(loadingPhase.message)}
        current={loadingPhase.current}
        total={loadingPhase.total}
        progressLabel={hubMessage(loadingPhase.progressLabel)}
      />
    );
  } else if (error) {
    body = <GuildDevelopmentEmptyState message={error} />;
  } else if (!series.allPoints.length) {
    body = <GuildDevelopmentEmptyState message={hubText("dataHubI18n.noLocalScanDataFoundForThisGuild")} />;
  } else if (!visiblePoints.length) {
    body = <GuildDevelopmentEmptyState message={hubText("dataHubI18n.noLocalScansInTheSelectedPeriod")} />;
  } else {
    body = (
      <>
        <div className={styles.developmentChartFrame}>
          <AnchoredLineChart
            points={[]}
            series={scanChart.series}
            auditInput={scanChart}
            auditArea={`guild-analytics-overview:${metric.key}`}
            auditContext={{ ...auditContext, consumer: "guild-analytics-overview" }}
            timeDomain={series.timeDomain}
            timeTicks={timeTicks}
            verticalMarkers={verticalFusionMarkers}
            showAvg={false}
            showFill={false}
            showDots={false}
            showXLabels
            dotTooltips={chartTooltips}
            yValueFormatter={chartAxisFormatter}
            semanticKey={metric.key}
            highlightedSeriesKeys={highlightedChartSeriesKeys}
            onHoverSeriesKeyChange={setHoveredChartSeriesKey}
          />
          {supportsPlayerComparison ? (
            <ChartLegend
              items={[
                { key: GUILD_AVERAGE_SERIES_KEY, label: hubText("dataHubI18n.guildAverage"), color: GUILD_AVERAGE_COLOR },
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
        <div className={styles.developmentSummary} aria-label={hubText("dataHubI18n.guildDevelopmentSummary")}>
          <GuildDevelopmentStat label={hubText("dataHubI18n.currentValue")} value={formatMetricValue(currentValue, metric)} />
          <GuildDevelopmentStat label={hubText("dataHubI18n.change")} value={formatDeltaValue(deltaValue, metric)} />
          <GuildDevelopmentStat label={hubText("dataHubI18n.dataPoints")} value={numberFormatter.format(pointCount)} />
        </div>
        {pointCount === 1 ? (
          <p className={styles.developmentHint}>{hubText("dataHubI18n.developmentRequiresAtLeastTwoLocalScans")}</p>
        ) : null}
      </>
    );
  }

  return (
    <section className={styles.developmentPanel} aria-label={hubText("dataHubI18n.guildDevelopment")}>
      <div className={styles.developmentHeader}>
        <div className={styles.developmentTitleBlock}>
          <p className={styles.developmentEyebrow}>{hubText("dataHubI18n.overview")}</p>
          <h2 className={styles.developmentTitle}>{hubText("dataHubI18n.guildDevelopment")}</h2>
          <p className={styles.developmentMeta}>
            {activeGuild ? `${activeGuild.name} - ${activeGuild.server}` : hubText("dataHubI18n.noActiveGuild")}
          </p>
        </div>
        <div className={styles.developmentControls}>
          <div className={styles.segmentedControl} aria-label={hubText("dataHubI18n.metric")}>
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

    let cancelled = false, generation = 0;
    const load = (cause?: Event) => {
      const own = ++generation;
      if (!activeGuild) {
        setState({ series: { tracker: null, allPoints: [], visiblePoints: [], timeDomain: null }, loading: false, error: null });
        return;
      }
      setState((prev) => ({ ...prev, loading: true, error: null }));
      buildLocalFightParticipationSeries(activeGuild, range, { includeFormerMembers: false, auditContext: { trigger: cause?.type ?? "fight-participation-effect", consumer: "guild-fight-participation" } })
        .then((series) => {
          if (!cancelled && own === generation) setState({ series, loading: false, error: null });
        })
        .catch((err) => {
          console.error("[GuildHubAnalytics] failed to load fight participation", err);
          if (!cancelled && own === generation) {
            setState({
              series: { tracker: null, allPoints: [], visiblePoints: [], timeDomain: null },
              loading: false,
              error: err instanceof Error ? err.message : hubText("dataHubI18n.fightDataCouldNotBeLoaded"),
            });
          }
        });
    };

    load();
    const unsubscribe = subscribeToFightTrackingChanges(load);
    const stopIdentities = subscribeToLocalDataDependencies({ allIdentities: true }, () => load());
    return () => {
      cancelled = true;
      unsubscribe(); stopIdentities();
    };
  }, [activeGuild, enabled, range]);

  useRuntimeAuditCommit(state.series, !state.loading && !state.error, "guild-fight-participation-series");
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
    label: hubText("dataHubI18n.guildAverage"),
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
    description: hubText("dataHubI18n.serverFusion") + "\n" + marker.originServerDisplayNames.join(", ") + " -> " + marker.targetServerDisplayName + "\n" + formatFusionMarkerDate(marker.effectiveDate),
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
        <em>{hubText("dataHubI18n.guildAverage")}</em>
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
  useTranslation();
  return (
    <div className={styles.scanTooltip}>
      <strong>{hubText("dataHubI18n.serverFusion")}</strong>
      <span>
        <em>{hubText("dataHubI18n.fusion")}</em>
        <b>{`${marker.originServerDisplayNames.join(", ")} -> ${marker.targetServerDisplayName}`}</b>
      </span>
      <span>
        <em>{hubText("dataHubI18n.from")}</em>
        <b>{marker.originServerDisplayNames.join(", ")}</b>
      </span>
      <span>
        <em>{hubText("dataHubI18n.to")}</em>
        <b>{marker.targetServerDisplayName}</b>
      </span>
      <span>
        <em>{hubText("dataHubI18n.date")}</em>
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
          <em>{hubText("dataHubI18n.guildAverage")}</em>
          <b>{formatMetricValue(guildValue, metric)}</b>
        </span>
      ) : null}
      <span>
        <em>{playerName}</em>
        <b>{formatMetricValue(value, metric)}</b>
      </span>
      {guildName ? (
        <span>
          <em>{hubText("dataHubI18n.guild")}</em>
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
    <div className={styles.chartLegend} aria-label={hubText("dataHubI18n.chartLegend")}>
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
  useAnalyticsView(open ? "datahub/analytics/filters" : null);
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
      ? hubText("dataHubI18n.noPlayers")
      : selectedPlayers.length === 1
        ? selectedPlayers[0].name
        : hubText("dataHubI18n.selectedCount", { v1: selectedPlayers.length });
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
        {hubText("dataHubI18n.comparePlayers")} {summary}
      </button>
      {selectedPlayers.length ? (
        <div className={styles.playerChipList} aria-label={hubText("dataHubI18n.selectedPlayers")}>
          {selectedPlayers.map((player) => (
            <button
              key={player.memberRef}
              type="button"
              aria-label={hubText("dataHubI18n.removeName", { v1: player.name })}
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
              <h3>{hubText("dataHubI18n.comparePlayersc985e")}</h3>
              <button type="button" className={styles.clearButton} onClick={() => setOpen(false)}>
                {hubText("dataHubI18n.close")}
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
        <span>{hubText("dataHubI18n.search")}</span>
        <input
          className={styles.searchInput}
          placeholder={hubText("dataHubI18n.searchPlayers")}
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
          <div className={styles.emptyResult}>{hubText("dataHubI18n.noCurrentPlayersFound")}</div>
        )}
      </div>
      {selectedSet.size ? (
        <button type="button" className={styles.secondaryAction} onClick={onClear}>
          {hubText("dataHubI18n.clearSelection")}
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
    return <GuildDevelopmentEmptyState message={hubText("dataHubI18n.selectAGuildInGuildHub")} />;
  }
  if (loading) {
    return (
      <DataHubLoadingState
        title={hubText("dataHubI18n.loadingFightData")}
        message={hubText("dataHubI18n.preparingTheFightTrackerTimeSeries")}
      />
    );
  }
  if (error) {
    return <GuildDevelopmentEmptyState message={error} />;
  }
  if (!series.tracker) {
    return <GuildDevelopmentEmptyState message={hubText("dataHubI18n.noLinkedFightTrackerForThisGuild")} />;
  }
  if (!series.allPoints.length) {
    return <GuildDevelopmentEmptyState message={hubText("dataHubI18n.noAttackFightsAreSavedInTheLinkedFightTrackerYet")} />;
  }
  if (!visiblePoints.length) {
    return <GuildDevelopmentEmptyState message={hubText("dataHubI18n.noFightDataInTheSelectedPeriod")} />;
  }

  return (
    <>
      <div className={styles.developmentChartFrame}>
        <AnchoredLineChart
          points={[]}
          series={[
            {
              key: "participants",
              label: hubText("dataHubI18n.participants"),
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
              label: hubText("dataHubI18n.missed"),
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
          yValueFormatter={formatFightChartAxisValue}
          auditInput={series}
          auditArea="guild-analytics-fight-participation"
          semanticKey="fight-participation"
        />
        <ChartLegend
          items={[
            { label: hubText("dataHubI18n.participants"), color: GUILD_AVERAGE_COLOR },
            { label: hubText("dataHubI18n.missed"), color: "#f2a65a" },
          ]}
        />
      </div>
      <div className={styles.developmentSummary} aria-label={hubText("dataHubI18n.fightParticipationSummary")}>
        <GuildDevelopmentStat
          label={hubText("dataHubI18n.lastFight")}
          value={
            latestPoint
              ? hubText("dataHubI18n.fightParticipationCounts", { v1: numberFormatter.format(latestPoint.participants), v2: numberFormatter.format(latestPoint.missed) })
              : "-"
          }
        />
        <GuildDevelopmentStat
          label={hubText("dataHubI18n.averageParticipants")}
          value={avgParticipants == null ? "-" : hubNumber(avgParticipants, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
        />
        <GuildDevelopmentStat label={hubText("dataHubI18n.fights")} value={numberFormatter.format(visiblePoints.length)} />
      </div>
    </>
  );
}

function FightParticipationTooltip({ point }: { point: FightParticipationSeries["visiblePoints"][number] }) {
  return (
    <div className={styles.fightTooltip}>
      <strong>{dateFormatter.format(point.timestampMs)}</strong>
      <span>{hubText("dataHubI18n.fight")} {point.fightNumber}</span>
      {point.opponentGuild ? <span>vs. {point.opponentGuild}</span> : null}
      <span>{hubText("dataHubI18n.participants92ac4")} {numberFormatter.format(point.participants)}</span>
      <span>{hubText("dataHubI18n.missed0bca1")} {numberFormatter.format(point.missed)}</span>
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
  useAnalyticsView(open ? "datahub/analytics/filters" : null);
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
        {hubText("dataHubI18n.periodd4ba2")} {formatRangeLabel(range)}
      </button>
      {isMdUp && open ? <div className={styles.rangePopover}>{content}</div> : null}
      {!isMdUp ? (
        <div className={`${styles.sheetOverlay} ${open ? styles.sheetOpen : ""}`}>
          <div className={styles.sheet} role="dialog" aria-modal="true" ref={sheetRef}>
            <header className={styles.sheetHeader}>
              <h3>{hubText("dataHubI18n.period")}</h3>
              <button type="button" className={styles.clearButton} onClick={() => setOpen(false)}>
                {hubText("dataHubI18n.close")}
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
            <span>{hubText("dataHubI18n.from21819")}</span>
            <input
              type="date"
              className={styles.searchInput}
              value={range.from ?? ""}
              onChange={(event) => onRangeChange({ ...range, from: event.target.value || undefined })}
            />
          </label>
          <label className={styles.filterField}>
            <span>{hubText("dataHubI18n.tof4b06")}</span>
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
    if (range.from) return hubText("dataHubI18n.rangeFrom", { v1: formatDateInputLabel(range.from) });
    if (range.to) return hubText("dataHubI18n.rangeTo", { v1: formatDateInputLabel(range.to) });
  }
  return GUILD_ANALYTICS_RANGES.find((entry) => entry.key === range.key)?.label ?? hubText("dataHubI18n.period");
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
      <p>{hubMessage(message)}</p>
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
    const __audit5 = auditBegin("F13", "report");
    auditObserveInputs(__audit5, [analyticsData]);
    try {
      const startedAt = analyticsNowMs();
      const nextReport = (auditValue(__audit5, auditEnter(__audit5, "buildGuildAnalyticsProgressReport", "sync-elapsed"), (buildGuildAnalyticsProgressReport(analyticsData, activeGuild, periodKey, identityResolutionSnapshot))));
      if (auditEnabled()) recordGuildAnalyticsViewDiagnostic(__audit5, "chart-model-build", analyticsNowMs() - startedAt, nextReport?.players.length ?? 0, {
        model: "progress-report",
        periodKey,
      });
      if (!loading && !error && nextReport) auditPrepareGraph(__audit5);
      return auditReturn(__audit5, nextReport);

    } catch (__auditError) { auditError(__audit5, __auditError); throw __auditError; }
    finally { auditLeave(__audit5); }
},
    [activeGuild, analyticsData, periodKey, identityResolutionSnapshot],
  );

  const matchingSeries = React.useMemo(
    () => {
      const progressSeriesAudit = auditBegin("F13", "series");
      auditObserveInputs(progressSeriesAudit, [analyticsData]);
      try {
      const startedAt = analyticsNowMs();
      const nextSeries = buildGuildAnalyticsSeries(analyticsData, activeGuild, "memberCount", "all", identityResolutionSnapshot);
      const identityScope = describeGuildAnalyticsIdentityScope(analyticsData, activeGuild, identityResolutionSnapshot);
      if (auditEnabled()) recordGuildAnalyticsViewDiagnostic(progressSeriesAudit, "guild-series-build", analyticsNowMs() - startedAt, nextSeries.allPoints.length, {
        model: "progress-member-count",
        selectedGuildIdentifier: identityScope.selectedGuildIdentifier,
        resolvedGuildIdentity: identityScope.resolvedGuildIdentity,
        aliasIdentifierCount: identityScope.aliasIdentifierCount,
        inputGuildObservations: identityScope.inputGuildObservations,
        matchedGuildObservations: identityScope.matchedGuildObservations,
        outputPoints: nextSeries.visiblePoints.length,
      });
      return auditReturn(progressSeriesAudit, nextSeries);
      } finally { auditLeave(progressSeriesAudit); }
    },
    [activeGuild, analyticsData, identityResolutionSnapshot],
  );

  let body: React.ReactNode;
  if (!activeGuild) {
    body = <GuildDevelopmentEmptyState message={hubText("dataHubI18n.selectAGuildInGuildHub")} />;
  } else if (loading) {
    body = (
      <DataHubLoadingState
        title={hubMessage(loadingPhase.title)}
        message={hubMessage(loadingPhase.message)}
        current={loadingPhase.current}
        total={loadingPhase.total}
        progressLabel={hubMessage(loadingPhase.progressLabel)}
      />
    );
  } else if (error) {
    body = <GuildDevelopmentEmptyState message={error} />;
  } else if (!matchingSeries.allPoints.length) {
    body = <GuildDevelopmentEmptyState message={hubText("dataHubI18n.noLocalScanDataAvailableForProgress")} />;
  } else if (!report) {
    body = <GuildDevelopmentEmptyState message={hubText("dataHubI18n.progressAnalysisRequiresAtLeastTwoScans")} />;
  } else {
    body = <GuildProgressReport report={report} />;
  }

  return (
    <section className={styles.progressPanel} aria-label={hubText("dataHubI18n.guildProgress")}>
      <div className={styles.developmentHeader}>
        <div className={styles.developmentTitleBlock}>
          <p className={styles.developmentEyebrow}>{hubText("dataHubI18n.progress")}</p>
          <h2 className={styles.developmentTitle}>{hubText("dataHubI18n.guildProgress")}</h2>
          <p className={styles.developmentMeta}>
            {activeGuild ? `${activeGuild.name} - ${activeGuild.server}` : hubText("dataHubI18n.noActiveGuild")}
          </p>
        </div>
        <div className={styles.segmentedControl} aria-label={hubText("dataHubI18n.progressPeriod")}>
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
  const reportRef = React.useRef<HTMLDivElement>(null);
  useRuntimeAuditGraphCommit(report, true, "guild-analytics-progress-report", reportRef);
  const levelMetric = GUILD_ANALYTICS_METRICS.find((metric) => metric.key === "avgLevel") ?? GUILD_ANALYTICS_METRICS[0];
  const baseMetric = GUILD_ANALYTICS_METRICS.find((metric) => metric.key === "avgBaseStats") ?? GUILD_ANALYTICS_METRICS[1];
  const totalMetric = GUILD_ANALYTICS_METRICS.find((metric) => metric.key === "avgTotalStats") ?? GUILD_ANALYTICS_METRICS[2];
  const memberMetric = GUILD_ANALYTICS_METRICS.find((metric) => metric.key === "memberCount") ?? GUILD_ANALYTICS_METRICS[3];

  return (
    <div ref={reportRef} className={styles.progressReport}>
      <div className={styles.progressRange}>
        <strong>
          {dateFormatter.format(report.baseline.scannedAtMs)} - {dateFormatter.format(report.current.scannedAtMs)}
        </strong>
        <span>
          {hubText("dataHubI18n.actualInterval")} {hubNumber(report.daysBetween, { style: "unit", unit: "day", unitDisplay: "long" })}
        </span>
      </div>

      <section className={styles.progressSummaryCard} aria-label={hubText("dataHubI18n.guildProgress")}>
        <div className={styles.comparisonHeader}>
          <div>
            <p className={styles.metricLabel}>{hubText("dataHubI18n.guildProgress")}</p>
            <h3 className={styles.progressCardTitle}>{hubText("dataHubI18n.snapshotComparison")}</h3>
          </div>
          <span className={styles.diffBadge}>
            {hubText("dataHubI18n.target")} {hubNumber(report.targetDays, { style: "unit", unit: "day", unitDisplay: "long" })}
          </span>
        </div>
        <div className={styles.progressMetricGrid}>
          <ProgressMetricTile label={hubText("dataHubI18n.averageLevel")} metric={levelMetric} data={report.metrics.avgLevel} />
          <ProgressMetricTile label={hubText("dataHubI18n.averageBaseStats")} metric={baseMetric} data={report.metrics.avgBaseStats} />
          <ProgressMetricTile label={hubText("dataHubI18n.averageTotalStats")} metric={totalMetric} data={report.metrics.avgTotalStats} />
          <ProgressMetricTile label={memberMetric.label} metric={memberMetric} data={report.metrics.memberCount} />
        </div>
      </section>

      <div className={styles.progressDetailGrid}>
        <ProgressDetailCard title={hubText("dataHubI18n.baseStats")} metric={baseMetric} data={report.metrics.avgBaseStats} />
        <ProgressDetailCard title={hubText("dataHubI18n.totalStats")} metric={totalMetric} data={report.metrics.avgTotalStats} />
      </div>

      <section className={styles.progressTableCard} aria-label={hubText("dataHubI18n.playerProgress")}>
        <div className={styles.comparisonHeader}>
          <div>
            <p className={styles.metricLabel}>{hubText("dataHubI18n.playerProgress")}</p>
            <h3 className={styles.progressCardTitle}>{hubText("dataHubI18n.comparablePlayers")}</h3>
          </div>
          <span className={styles.diffBadge}>{hubText("dataHubI18n.quantityPlayers", { count: report.players.length })}</span>
        </div>
        {report.players.length ? (
          <div className={styles.progressTableWrap}>
            <table className={styles.progressTable}>
              <thead>
                <tr>
                  <th>{hubText("dataHubI18n.players")}</th>
                  <th>{hubText("dataHubI18n.levelChange")}</th>
                  <th>{hubText("dataHubI18n.baseChange")}</th>
                  <th>{hubText("dataHubI18n.totalChange")}</th>
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
          <div className={styles.emptyState}>{hubText("dataHubI18n.noPlayersWithAComparisonBasisInBothScans")}</div>
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
          <dt>{hubText("dataHubI18n.previous")}</dt>
          <dd>{formatMetricValue(data.baselineValue, metric)}</dd>
        </div>
        <div>
          <dt>{hubText("dataHubI18n.current")}</dt>
          <dd>{formatMetricValue(data.currentValue, metric)}</dd>
        </div>
        <div>
          <dt>{hubText("dataHubI18n.change")}</dt>
          <dd>{formatDeltaValue(data.delta, metric)}</dd>
        </div>
      </dl>
    </section>
  );
}

function formatMetricValue(value: number | null, metric: GuildAnalyticsMetricDefinition) {
  if (value == null || !Number.isFinite(value)) return "-";
  if (metric.format === "decimal") return hubNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return numberFormatter.format(Math.round(value));
}

function formatChartAxisValue(value: number, metric: GuildAnalyticsMetricDefinition) {
  if (!Number.isFinite(value)) return "-";
  const absolute = Math.abs(value);
  if (absolute >= 100000) return hubNumber(value, { notation: "compact", maximumFractionDigits: 0 });
  if (metric.format === "decimal" && Math.abs(value - Math.round(value)) >= 0.05) {
    return hubNumber(value, { maximumFractionDigits: 1 });
  }
  return numberFormatter.format(Math.round(value));
}

function formatFightChartAxisValue(value: number) {
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
          <span className={styles.infoLabel}>{hubText("dataHubI18n.pool")}</span>
          <strong>{numberFormatter.format(totalGuilds)} {hubText("dataHubI18n.guilds")}</strong>
        </div>
        <div className={styles.infoCard}>
          <span className={styles.infoLabel}>{hubText("dataHubI18n.averageMembers")}</span>
          <strong>{numberFormatter.format(averageMembers)}</strong>
        </div>
        <div className={styles.infoCard}>
          <span className={styles.infoLabel}>{hubText("dataHubI18n.serverFilter")}</span>
          <strong>{serverFilter === "all" ? "Alle" : serverFilter}</strong>
        </div>
      </div>
      {isMdUp ? (
        <div className={styles.inlineFilters}>
          <label className={styles.filterField}>
            <span>{hubText("dataHubI18n.server")}</span>
            <select
              className={styles.select}
              value={serverFilter}
              onChange={(event) => onServerChange(event.target.value)}
            >
              <option value="all">{hubText("dataHubI18n.allServers")}</option>
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
            title={hubText("dataHubI18n.guildA")}
            slot="guildA"
            selectedGuild={selectedGuildA}
            excludeId={selectedGuildBId}
            onSelect={onSelectGuild}
            onClear={onClearSlot}
            serverFilter={serverFilter}
            onServerChange={onServerChange}
          />
          <GuildSelectionCard
            title={hubText("dataHubI18n.guildB")}
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
                <p className={styles.kicker}>{hubText("dataHubI18n.comparison")}</p>
                <h2 className={styles.sectionTitle}>{hubText("dataHubI18n.metrics")}</h2>
              </div>
              {comparisonReady && selectedGuildA && selectedGuildB ? (
                <span className={styles.diffBadge}>
                  {hubText("dataHubI18n.memberDifference")} {numberFormatter.format(selectedGuildA.members - selectedGuildB.members)}
                </span>
              ) : null}
            </div>

            {comparisonReady && selectedGuildA && selectedGuildB ? (
              <>
                <div className={styles.metricGrid}>
                  <MetricCard label={hubText("dataHubI18n.members")} aValue={selectedGuildA.members} bValue={selectedGuildB.members} />
                  <MetricCard
                    label={hubText("dataHubI18n.averageLevel")}
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
                <p>{hubText("dataHubI18n.selectTwoGuildsToStartADirectComparison")}</p>
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
            {selectedGuild ? "Ausgewaehlt" : hubText("dataHubI18n.noSelectionYet")}
          </p>
        </div>
        {selectedGuild && (
          <button type="button" className={styles.clearButton} onClick={() => onClear(slot)}>
            {hubText("dataHubI18n.reset")}
          </button>
        )}
      </div>

      <div className={styles.slotBody}>
        <label className={styles.filterField}>
          <span>{hubText("dataHubI18n.server")}</span>
          <select
            className={styles.select}
            value={serverFilter}
            onChange={(event) => onServerChange(event.target.value)}
          >
            <option value="all">{hubText("dataHubI18n.allServers")}</option>
            {SERVER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filterField}>
            <span>{hubText("dataHubI18n.search49c26")}</span>
            <input
              className={styles.searchInput}
              placeholder={hubText("dataHubI18n.enterGuildName")}
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
            />
          </label>

          <div className={styles.resultList} role="list">
            {loading && <div className={styles.emptyResult}>{hubText("dataHubI18n.loading")}</div>}
            {!loading && results.length === 0 && (
              <div className={styles.emptyResult}>{hubText("dataHubI18n.noGuildFound")}</div>
            )}
          {!loading && results.map((guild) => (
            <div key={guild.id} className={styles.resultItem}>
              <div>
                <p className={styles.resultName}>{guild.name}</p>
                <p className={styles.resultMeta}>
                  {guild.server} - {hubText("hubFavorites.members", { count: guild.members })}
                </p>
              </div>
              <button
                type="button"
                className={styles.selectButton}
                onClick={() => onSelect(slot, guild)}
              >
                {hubText("dataHubI18n.select")}
              </button>
            </div>
          ))}
        </div>

        {selectedGuild && (
          <div className={styles.selectedCard}>
            <p className={styles.selectedName}>{selectedGuild.name}</p>
            <p className={styles.selectedMeta}>
              {selectedGuild.server} - {hubText("hubFavorites.members", { count: selectedGuild.members })} – {hubText("dataHubI18n.averageLevel")}{" "}
              {hubNumber(selectedGuild.avgLevel, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
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
    isDecimal ? hubNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : numberFormatter.format(value);

  const rawDelta = aValue - bValue;
  let deltaText = "gleich";
  if (rawDelta !== 0) {
    const formattedDelta = isDecimal
      ? hubNumber(Math.abs(rawDelta), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : numberFormatter.format(Math.abs(rawDelta));
    deltaText = rawDelta > 0 ? `+${formattedDelta}` : `-${formattedDelta}`;
  }

  return (
    <div className={styles.metricCard}>
      <p className={styles.metricLabel}>{label}</p>
      <div className={styles.metricValues}>
        <span aria-label={hubText("dataHubI18n.guildA")}>{formatter(aValue)}</span>
        <span className={styles.metricDivider}>vs</span>
        <span aria-label={hubText("dataHubI18n.guildB")}>{formatter(bValue)}</span>
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
      <p className={styles.metricLabel}>{hubText("dataHubI18n.freshness")}</p>
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
                      <dt>{hubText("dataHubI18n.status")}</dt>
                      <dd>{hubMessage(FRESHNESS_DISPLAY[guild.freshness])}</dd>
                    </div>
                    <div>
                      <dt>{hubText("dataHubI18n.lastScanned")}</dt>
                      <dd>{formatDate(guild.lastScanAt)}</dd>
                    </div>
                    <div>
                      <dt>{hubText("dataHubI18n.nextUpdate")}</dt>
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
      <p className={styles.metricLabel}>{hubText("dataHubI18n.classDistribution")}</p>
      <div className={styles.classGrid}>
        {[guildA, guildB].map((guild) => (
          <div key={guild.id} className={styles.classColumn}>
            <h3>{guild.name}</h3>
            <div className={styles.classBar} aria-label={hubText("dataHubI18n.guildClassDistribution", { v1: guild.name })}>
              {guild.classes.map((slice) => (
                <span
                  key={slice.label}
                  style={{ width: `${slice.percent}%` }}
                  className={styles.classSlice}
                >
                  <small>{profileClassLabel(slice.label)}</small>
                  <strong>{hubPercent(slice.percent / 100, 20)}</strong>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <ul className={styles.classLegend}>
        {legend.map((entry) => (
          <li key={entry}>{profileClassLabel(entry)}</li>
        ))}
      </ul>
    </div>
  );
}

function ChecklistCard() {
  const items = [
    hubText("dataHubI18n.reviewRoleCoverageTankHealSupport"),
    hubText("dataHubI18n.alignAndDocumentLootRules"),
    hubText("dataHubI18n.synchronizeRaidCalendars"),
    hubText("dataHubI18n.combineCommunicationChannels"),
    hubText("dataHubI18n.checkServerTransfersAndNameConflicts"),
  ];

  return (
    <section className={styles.checklistCard}>
      <h3>{hubText("dataHubI18n.checkBeforeComparing")}</h3>
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
      <h3>{hubText("dataHubI18n.transferDifferences")}</h3>
      <p>
        {hubText("dataHubI18n.thisWillShowTheAnalysisFrom")} <code>lib/guilds/transfers/</code>{hubText("dataHubI18n.currentlyAnInformationBoxToKeepTheSlotVisible")}
      </p>
      <p className={styles.infoNote}>
        {hubText("dataHubI18n.prepareYourCriteriaNowSoFutureAutomationCanUseTheDataDirectly")}
      </p>
      <button type="button" className={styles.secondaryAction} disabled>
        {hubText("dataHubI18n.moduleComingLater")}
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
    const __audit6 = auditBegin("F15", "run");
  auditFields(__audit6, { consumerArea: "Gildenanalyse", trigger: "cloud-search-effect" });
    try {
      const scope: FirestoreTraceScope = beginReadScope("CompareGuilds:search");
      setLoading(true);
      try {
        const folded = q.toLowerCase();
        const cg = collectionGroup(db, "latest");

        const snapPrefix = await (auditValue(__audit6, auditEnter(__audit6, "traceGetDocs"), (traceGetDocs(scope, { path: "guilds/latest (collectionGroup)" }, () =>
          getDocs(
            fsQuery(
              cg,
              orderBy("nameFold"),
              startAt(folded),
              endAt(folded + "\uf8ff"),
              limit(15),
            ),
          ),
        ))));
        const snapNgram = await (auditValue(__audit6, auditEnter(__audit6, "traceGetDocs"), (traceGetDocs(scope, { path: "guilds/latest (collectionGroup)" }, () =>
          getDocs(fsQuery(cg, where("nameNgrams", "array-contains", folded), limit(15))),
        ))));

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

          const name = data.name ?? data.values?.Name ?? hubText("dataHubI18n.unknownGuild");
          const serverVal = data.server ?? data.values?.Server ?? hubText("dataHubI18n.unknown");
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
      } catch (error) { auditError(__audit6, error);
        console.error("[GuildHub CompareGuilds] guild search failed", error);
        if (!cancelled) setResults([]);
      } finally {
        endReadScope(scope);
        if (!cancelled) setLoading(false);
      }

    } catch (__auditError) { auditError(__audit6, __auditError); throw __auditError; }
    finally { auditLeave(__audit6); }
}

    run();
    return () => {
      cancelled = true;
    };
  }, [term, server, excludeId]);

  return { results, loading };
}
