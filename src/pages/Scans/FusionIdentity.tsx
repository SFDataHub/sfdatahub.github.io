import React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Info, Link2, Search, Undo2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DataHubLoadingState } from "../../components/ui/shared/DataHubLoadingState";
import { getClassMetaById } from "../../data/classes";
import { subscribeToSfDataHubLocalScanChanges } from "../../lib/guilds/localScanLibrary";
import {
  readFusionIdentityAnalysisCache,
  writeFusionIdentityAnalysisCache,
  type FusionIdentityAnalysisCacheLookup,
  type FusionIdentityAnalysisCacheState,
} from "../../lib/identities/fusionAnalysisCache";
import { getFusionIdentityAnalyzeActionState } from "../../lib/identities/fusionIdentityAnalyzeAction";
import {
  buildFusionIdentityScopeIdentityState,
  normalizeFusionIdentityScopeInventory,
  type FusionIdentityDashboardInventory,
  type FusionIdentityDashboardInventoryProgress,
  type FusionIdentityDashboardInventoryTiming,
  type FusionIdentityScopeIdentityState,
  type FusionIdentityScopeInventory,
} from "../../lib/identities/fusionDashboardInventory";
import {
  FusionDashboardInventoryWorkerCancelledError,
  startFusionDashboardInventoryWorkerRun,
  type FusionDashboardInventoryWorkerRun,
} from "../../lib/identities/fusionDashboardInventoryWorkerClient";
import {
  FUSION_EVIDENCE_GUIDE_SIGNALS,
  FUSION_EVIDENCE_RANK_HELP,
  FUSION_EVIDENCE_RANKS,
  getClassificationHelp,
  getEvidenceHelp,
  getPlayerRejectReasonHelp,
  type FusionEvidenceHelpDefinition,
  type FusionEvidenceRank,
} from "../../lib/identities/fusionEvidenceHelp";
import {
  confirmFusionIdentityLink,
  mergeReadyFusionIdentityItems,
  rejectFusionIdentityCandidate,
  unlinkFusionIdentityAlias,
  type FusionIdentityAliasOption,
  type FusionIdentityCandidate,
  type FusionIdentityEntityType,
  type FusionIdentityManagementItem,
  type FusionIdentityManagementReport,
  type FusionIdentityManagementReasonCode,
  type FusionIdentityManagementStatus,
} from "../../lib/identities/fusionIdentityManagement";
import {
  clearSelectedIdentityIds,
  createGuildMemberStatusSelection,
  reconcileMemberSelectionFilters,
  removeSelectedIdentityId,
  type FusionIdentityMemberSelectionContext,
  type FusionIdentityMemberSelectionStatus,
  type FusionIdentityStatusFilter as StatusFilter,
  type FusionIdentityTypeFilter as TypeFilter,
} from "../../lib/identities/fusionIdentityMemberSelection";
import {
  FusionIdentityWorkerCancelledError,
  startFusionIdentityWorkerRun,
  type FusionIdentityWorkerRun,
} from "../../lib/identities/fusionIdentityWorkerClient";
import type {
  FusionIdentityProgress,
  FusionIdentityWorkerTiming,
} from "../../lib/identities/fusionIdentityWorkerTypes";
import type {
  GuildFusionCandidate,
  GuildFusionCandidateClassification,
  GuildFusionEvidenceEntry,
  GuildFusionEvidenceStrength,
  GuildFusionMigrationEdge,
} from "../../lib/identities/guildFusionResolver";
import type {
  PlayerFusionCandidate,
  PlayerFusionCandidateClassification,
  PlayerFusionEvidenceEntry,
  PlayerFusionEvidenceEntryType,
  PlayerFusionEvidenceStrength,
} from "../../lib/identities/playerFusionResolver";
import styles from "./FusionIdentity.module.css";

type EvidenceChipHelp = {
  id: string;
  kind: "classification" | "evidence" | "reject";
  definition: FusionEvidenceHelpDefinition | null;
  strength?: FusionEvidenceRank | null;
  fallbackTitle: string;
  fallbackDescription?: string;
};

type EvidencePopoverContextValue = {
  activeId: string | null;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
};

const EvidencePopoverContext =
  React.createContext<EvidencePopoverContextValue | null>(null);

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready" },
  { key: "review", label: "Needs Review" },
  { key: "unresolved", label: "Unresolved" },
  { key: "noHistoricalObservation", label: "No Historical Observation" },
  { key: "noHistory", label: "No Historical Data" },
  { key: "completed", label: "Completed" },
];

const TYPE_FILTERS: Array<{ key: TypeFilter; label: string }> = [
  { key: "all", label: "All types" },
  { key: "player", label: "Players" },
  { key: "guild", label: "Guilds" },
];

const normalizeSearch = (value: string) => value.trim().toLowerCase();
const formatNumber = (value: number) => new Intl.NumberFormat().format(value);
const formatShare = (value: number) => `${Math.round(value * 100)}%`;
const fallbackTranslate = (translate: (key: string) => string, key: string) => {
  const translated = translate(key);
  return translated === key ? "" : translated;
};
const formatClass = (classId: string | null | undefined) => {
  const key = String(classId ?? "").trim();
  if (!key) return "Class unknown";
  return getClassMetaById(key)?.label ?? `Class ${key}`;
};
const formatLevel = (level: number | null | undefined) =>
  level == null ? "Level unknown" : `Level ${level}`;
const formatDate = (timestamp: number | null | undefined) =>
  timestamp
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(timestamp))
    : "-";

const statusLabel = (status: FusionIdentityManagementStatus) => {
  if (status === "noHistoricalObservation") return "No Historical Observation";
  if (status === "noHistory") return "No Historical Data";
  if (status === "review") return "Needs Review";
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const statusClassName = (status: FusionIdentityManagementStatus) => {
  if (status === "ready") return styles.statusHigh;
  if (status === "review") return styles.statusAmbiguous;
  if (status === "completed") return styles.statusSingle;
  if (status === "noHistory" || status === "noHistoricalObservation")
    return styles.statusNative;
  return styles.statusUnresolved;
};

const typeLabel = (type: FusionIdentityEntityType) =>
  type === "player" ? "Player" : "Guild";

const latestObservation = (
  observations: FusionIdentityManagementItem["observations"],
) =>
  observations.reduce<
    FusionIdentityManagementItem["observations"][number] | null
  >(
    (latest, observation) =>
      latest == null || observation.timestamp > latest.timestamp
        ? observation
        : latest,
    null,
  );

const earliestObservation = (
  observations: FusionIdentityManagementItem["observations"],
) =>
  observations.reduce<
    FusionIdentityManagementItem["observations"][number] | null
  >(
    (earliest, observation) =>
      earliest == null || observation.timestamp < earliest.timestamp
        ? observation
        : earliest,
    null,
  );

const formatCurrentLevel = (level: number | null | undefined) => {
  if (level == null || !Number.isFinite(level) || level <= 0) return null;
  return formatNumber(level);
};

const formatOriginScope = (item: FusionIdentityManagementItem) =>
  item.diagnostics?.originServerCodes.length
    ? item.diagnostics.originServerCodes.join(", ")
    : (item.currentServer ?? "unknown scope");

type StatusExplanation = {
  title: string;
  body: string;
  action?: string;
};

const hasReasonCode = (
  item: FusionIdentityManagementItem,
  reasonCode: FusionIdentityManagementReasonCode,
) => item.reasonCodes.includes(reasonCode);

const isInsufficientEvidenceReview = (item: FusionIdentityManagementItem) =>
  item.status === "review" &&
  (hasReasonCode(item, "insufficient-guild-evidence") ||
    hasReasonCode(item, "insufficient-player-evidence") ||
    hasReasonCode(item, "insufficient-continuity"));

const formatStatusExplanation = (
  item: FusionIdentityManagementItem,
): StatusExplanation | null => {
  if (item.status === "noHistoricalObservation") {
    const lookup = item.diagnostics?.reliableHistoricalLookup;
    const scope = formatOriginScope(item);
    const scanCount = item.diagnostics?.historicalSnapshotCount ?? 0;
    const entityLabel = item.entityType === "guild" ? "guild" : "player";
    return {
      title: "No matching historical observation",
      body: lookup
        ? `No matching ${entityLabel} observation was found for ${lookup.baseName} in the available pre-fusion ${scope} scans. Historical scope: ${scope}. Scans checked: ${scanCount}.`
        : `No matching observation was found in the available historical scans. Historical scope: ${scope}. Scans checked: ${scanCount}.`,
    };
  }

  if (item.status === "review") {
    if (
      hasReasonCode(item, "insufficient-guild-evidence") ||
      hasReasonCode(item, "insufficient-continuity")
    ) {
      return {
        title: "Not enough reliable historical evidence for automatic matching",
        body: "A likely historical guild was found, but too few members could be reliably tracked across the available scans.",
        action:
          "If you recognize the guild, confirm the identity manually below.",
      };
    }
    if (hasReasonCode(item, "insufficient-player-evidence")) {
      return {
        title: "Not enough reliable player evidence for automatic matching",
        body: "A likely historical player was found, but the available identity evidence is not strong enough for an automatic match.",
        action:
          "If you recognize the player, confirm the identity manually below.",
      };
    }
    if (hasReasonCode(item, "multiple-relevant-candidates")) {
      return {
        title: "Multiple relevant historical identities require review",
        body:
          item.entityType === "guild"
            ? "More than one historical guild candidate remains relevant, so the resolver is waiting for a manual decision."
            : "More than one historical player candidate remains relevant, so the resolver is waiting for a manual decision.",
      };
    }
    if (hasReasonCode(item, "assignment-conflict")) {
      return {
        title: "Historical identity is contested",
        body: "This historical identity is claimed by multiple current identities and needs a manual decision.",
      };
    }
  }

  if (item.status !== "unresolved" || item.candidates.length) return null;
  const reason = item.reasonCodes[0];
  if (reason === "level-regression")
    return {
      title: "No viable candidate",
      body: "No viable identity remained after reliable level continuity checks.",
    };
  if (reason === "semantic-contradictions")
    return {
      title: "No viable candidate",
      body: "No viable identity remained after semantic consistency checks.",
    };
  if (reason === "reserved-by-other-identity")
    return {
      title: "Reserved candidate",
      body: "Candidate identities were reserved by other ready assignments.",
    };
  if (reason === "rejected-by-exclusion")
    return {
      title: "No remaining candidate",
      body: "No remaining candidate after exclusions.",
    };
  if (reason === "no-actionable-candidate") {
    return {
      title: "No actionable candidate",
      body:
        item.entityType === "guild"
          ? "Historical guild data exists, but no candidate has enough positive identity evidence for review."
          : "Only weak compatibility matches were found. No candidate currently has enough identity evidence for review.",
      action:
        "Use manual identity link if you can identify the correct historical alias.",
    };
  }
  return {
    title: "No reliable identity continuity",
    body:
      item.entityType === "guild"
        ? "Historical guild scans exist, but no reliable continuity could be established."
        : "Historical data exists, but no reliable identity continuity could be established.",
  };
};

const formatDuration = (durationMs: number) => {
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
};

const reportDashboardInventoryTimings = (
  timings: FusionIdentityDashboardInventoryTiming[],
) => {
  if (!import.meta.env.DEV || !timings.length) return;
  const slowest = [...timings].sort(
    (left, right) =>
      (right.maxBlockMs ?? right.durationMs) - (left.maxBlockMs ?? left.durationMs),
  )[0];
  console.groupCollapsed(
    "[Fusion Dashboard Inventory] timings",
    slowest
      ? `slowest block: ${slowest.phase} ${Math.round(slowest.maxBlockMs ?? slowest.durationMs)}ms`
      : "",
  );
  console.table(
    timings.map((timing) => ({
      phase: timing.phase,
      durationMs: Math.round(timing.durationMs),
      maxBlockMs:
        timing.maxBlockMs == null ? "" : Math.round(timing.maxBlockMs),
      count: timing.count ?? "",
    })),
  );
  console.groupEnd();
};

const reportFusionIdentityWorkerTimings = (
  targetServerCode: string,
  timings: FusionIdentityWorkerTiming[],
) => {
  if (!import.meta.env.DEV || !timings.length) return;
  const workerCompute = timings.find((timing) => timing.phase === "worker:compute");
  const roundTrip = timings.find((timing) => timing.phase === "client:worker-roundtrip");
  const knownWorkerPhaseNames = new Set([
    "management:local-scan-load",
    "management:logical-snapshot-derivation",
    "management:scope-filtering",
    "management:build-report-total",
  ]);
  const sumKnownPhasesMs = timings
    .filter((timing) => knownWorkerPhaseNames.has(timing.phase))
    .reduce((sum, timing) => sum + timing.durationMs, 0);
  const workerComputeMs = workerCompute?.durationMs ?? 0;
  const unattributedMs = Math.max(0, workerComputeMs - sumKnownPhasesMs);
  const textLines = [
    `[Fusion Identity] worker phase diagnostics ${targetServerCode}`,
    `workerComputeMs=${Math.round(workerComputeMs)}ms`,
    `sumKnownPhasesMs=${Math.round(sumKnownPhasesMs)}ms`,
    `unattributedMs=${Math.round(unattributedMs)}ms`,
    ...timings.map((timing) => {
      const countText = timing.count == null ? "" : ` count=${timing.count}`;
      return `${timing.phase}=${Math.round(timing.durationMs)}ms${countText}`;
    }),
  ];
  console.groupCollapsed(
    `[Fusion Identity] worker phase diagnostics ${targetServerCode}`,
    workerCompute ? `compute=${formatDuration(workerCompute.durationMs)}` : "",
    roundTrip ? `roundtrip=${formatDuration(roundTrip.durationMs)}` : "",
  );
  console.log(textLines.join("\n"));
  console.table(
    timings.map((timing) => ({
      phase: timing.phase,
      durationMs: Math.round(timing.durationMs),
      count: timing.count ?? "",
    })),
  );
  console.groupEnd();
};

const getFusionIdentityProgressMessageKey = (
  phase: FusionIdentityProgress["phase"] | undefined,
) => {
  switch (phase) {
    case "loading":
      return "fusionIdentity.loading.phases.loading";
    case "preparing":
    case "preparing-scan-pool":
      return "fusionIdentity.loading.phases.preparingScanPool";
    case "filtering-scope":
      return "fusionIdentity.loading.phases.filteringScope";
    case "normalizing":
      return "fusionIdentity.loading.phases.normalizing";
    case "player-histories":
    case "preparing-histories":
      return "fusionIdentity.loading.phases.preparingHistories";
    case "player-resolution":
      return "fusionIdentity.loading.phases.matchingPlayers";
    case "guild-resolution":
      return "fusionIdentity.loading.phases.matchingGuilds";
    case "assignment":
    case "report":
    case "finalizing":
      return "fusionIdentity.loading.phases.finalizing";
    case "done":
      return "fusionIdentity.loading.phases.done";
    default:
      return "fusionIdentity.loading.phases.fallback";
  }
};

type FusionIdentityDashboardScopeModel = {
  inventory: FusionIdentityScopeInventory;
  identityState: FusionIdentityScopeIdentityState;
  cache: FusionIdentityAnalysisCacheLookup;
  cacheState: FusionIdentityAnalysisCacheState;
  error: string | null;
};

type FusionIdentityDashboardState = {
  loading: boolean;
  error: string | null;
  inventory: FusionIdentityDashboardInventory | null;
  scopes: FusionIdentityDashboardScopeModel[];
};

const createEmptyDashboardState = (): FusionIdentityDashboardState => ({
  loading: true,
  error: null,
  inventory: null,
  scopes: [],
});

const updateDashboardScope = (
  state: FusionIdentityDashboardState,
  scopeId: string,
  update: Partial<FusionIdentityDashboardScopeModel>,
): FusionIdentityDashboardState => ({
  ...state,
  scopes: state.scopes.map((scope) =>
    scope.inventory.scope.id === scopeId ? { ...scope, ...update } : scope,
  ),
});

function useFusionIdentityDashboard() {
  const [dashboard, setDashboard] = React.useState<FusionIdentityDashboardState>(
    createEmptyDashboardState,
  );
  const [inventoryProgress, setInventoryProgress] =
    React.useState<FusionIdentityDashboardInventoryProgress | null>(null);
  const [inventoryTimings, setInventoryTimings] = React.useState<
    FusionIdentityDashboardInventoryTiming[]
  >([]);
  const [report, setReport] =
    React.useState<FusionIdentityManagementReport | null>(null);
  const [progress, setProgress] = React.useState<FusionIdentityProgress | null>(
    null,
  );
  const [timings, setTimings] = React.useState<FusionIdentityWorkerTiming[]>(
    [],
  );
  const [runningScopeId, setRunningScopeId] = React.useState<string | null>(
    null,
  );
  const inventoryRunRef =
    React.useRef<FusionDashboardInventoryWorkerRun | null>(null);
  const activeInventoryRequestIdRef = React.useRef<string | null>(null);
  const runRef = React.useRef<FusionIdentityWorkerRun | null>(null);
  const activeRequestIdRef = React.useRef<string | null>(null);

  const refreshDashboard = React.useCallback(async () => {
    inventoryRunRef.current?.cancel();
    setDashboard((current) => ({ ...current, loading: true, error: null }));
    setInventoryProgress({
      phase: "indexeddb-scan-metadata-load",
      message: "Reading local scan inventory",
    });
    setInventoryTimings([]);
    const run = startFusionDashboardInventoryWorkerRun({
      onProgress(nextProgress) {
        if (activeInventoryRequestIdRef.current === run.requestId) {
          setInventoryProgress(nextProgress);
        }
      },
    });
    inventoryRunRef.current = run;
    activeInventoryRequestIdRef.current = run.requestId;

    try {
      const inventoryResult = await run.promise;
      if (activeInventoryRequestIdRef.current !== run.requestId) return;
      const inventory = {
        ...inventoryResult.inventory,
        scopes: inventoryResult.inventory.scopes.map(normalizeFusionIdentityScopeInventory),
      };
      const nextTimings = [...inventoryResult.timings];
      const scopes = await Promise.all(
        inventory.scopes.map(async (scopeInventory) => {
          const identityStartedAt = performance.now();
          const identityState = await buildFusionIdentityScopeIdentityState(
            scopeInventory.scope,
            scopeInventory.currentPlayerIdentifiers,
            scopeInventory.currentGuildIdentifiers,
          );
          nextTimings.push({
            phase: "identity-revision-calculation",
            durationMs: performance.now() - identityStartedAt,
            count: 1,
          });
          const cacheStartedAt = performance.now();
          const cache = await readFusionIdentityAnalysisCache({
            scope: scopeInventory.scope,
            scanFingerprint: scopeInventory.scanFingerprint,
            identityRevision: identityState.identityRevision,
          });
          nextTimings.push({
            phase: "analysis-cache-lookup",
            durationMs: performance.now() - cacheStartedAt,
            count: 1,
          });
          return {
            inventory: scopeInventory,
            identityState,
            cache,
            cacheState: cache.state,
            error: null,
          } satisfies FusionIdentityDashboardScopeModel;
        }),
      );
      if (activeInventoryRequestIdRef.current !== run.requestId) return;
      const reactStateStartedAt = performance.now();
      setDashboard({ loading: false, error: null, inventory, scopes });
      nextTimings.push({
        phase: "react-state-update",
        durationMs: performance.now() - reactStateStartedAt,
        maxBlockMs: performance.now() - reactStateStartedAt,
        count: 1,
      });
      setInventoryTimings(nextTimings);
      setInventoryProgress(null);
      reportDashboardInventoryTimings(nextTimings);
    } catch (loadError) {
      if (activeInventoryRequestIdRef.current !== run.requestId) return;
      if (loadError instanceof FusionDashboardInventoryWorkerCancelledError)
        return;
      setDashboard((current) => ({
        ...current,
        loading: false,
        error:
          loadError instanceof Error
            ? loadError.message
            : "Fusion dashboard could not be prepared.",
      }));
      setInventoryProgress(null);
    } finally {
      if (activeInventoryRequestIdRef.current === run.requestId) {
        inventoryRunRef.current = null;
        activeInventoryRequestIdRef.current = null;
      }
    }
  }, []);

  React.useEffect(() => {
    void refreshDashboard();
    const unsubscribe = subscribeToSfDataHubLocalScanChanges(() => {
      void refreshDashboard();
    });
    return () => {
      unsubscribe();
      inventoryRunRef.current?.cancel();
      inventoryRunRef.current = null;
      activeInventoryRequestIdRef.current = null;
      runRef.current?.cancel();
      runRef.current = null;
      activeRequestIdRef.current = null;
    };
  }, [refreshDashboard]);

  const openCachedReport = React.useCallback(
    (entry: FusionIdentityAnalysisCacheLookup["previousEntry"]) => {
      if (!entry) return false;
      setReport(entry.report);
      setTimings(entry.timings);
      setProgress({ phase: "done", message: "Cached fusion identity report" });
      return true;
    },
    [],
  );

  const clearReport = React.useCallback(() => {
    setReport(null);
    setTimings([]);
    setProgress(null);
  }, []);

  const analyzeScope = React.useCallback(
    async (scopeModel: FusionIdentityDashboardScopeModel) => {
      const { scope } = scopeModel.inventory;
      const actionState = getFusionIdentityAnalyzeActionState({
        analysisSupported: scope.analysisSupported,
        isLocallyMatchable: scopeModel.inventory.isLocallyMatchable,
        hasCurrentInputData: hasFusionAnalysisInputData(scopeModel),
        cacheState: scopeModel.cacheState,
      });
      if (!actionState.enabled) {
        if (actionState.reason === "fresh" || actionState.reason === "running")
          return null;
        const message =
          actionState.reason === "unsupported"
            ? `Full identity analysis is not enabled for ${scope.targetServerCode} yet.`
            : !scopeModel.inventory.hasHistoricalObservations
              ? `No historical ${scope.targetServerCode} lineage observations are available before this fusion.`
              : !scopeModel.inventory.hasCurrentTargetObservations
                ? `No current ${scope.targetServerCode} observations are available after this fusion.`
                : actionState.reason === "no-current-data"
                  ? `No current ${scope.targetServerCode} observations are available after this fusion.`
                  : `${scope.targetServerCode} is not locally matchable yet.`;
        setDashboard((current) =>
          updateDashboardScope(current, scope.id, {
            cacheState: "never-analyzed",
            error: message,
          }),
        );
        return null;
      }
      runRef.current?.cancel();
      setDashboard((current) =>
        updateDashboardScope(current, scope.id, {
          cacheState: "running",
          error: null,
        }),
      );
      setRunningScopeId(scope.id);
      setProgress({
        phase: "loading",
        message: `Starting ${scope.targetServerCode} fusion worker`,
      });
      setTimings([]);

      const run = startFusionIdentityWorkerRun({
        scopeInventory: scopeModel.inventory,
        onProgress(nextProgress) {
          if (activeRequestIdRef.current === run.requestId)
            setProgress(nextProgress);
        },
      });
      runRef.current = run;
      activeRequestIdRef.current = run.requestId;

      try {
        const result = await run.promise;
        if (activeRequestIdRef.current !== run.requestId) return null;
        const nextTimings = [...result.timings];
        const cacheWriteStartedAt = performance.now();
        await writeFusionIdentityAnalysisCache({
          scope,
          scanFingerprint: scopeModel.inventory.scanFingerprint,
          identityRevision: scopeModel.identityState.identityRevision,
          report: result.report,
          timings: result.timings,
        });
        nextTimings.push({
          phase: "main:analysis-cache-write",
          durationMs: performance.now() - cacheWriteStartedAt,
          count: 1,
        });
        const reactStateStartedAt = performance.now();
        setReport(result.report);
        setTimings(nextTimings);
        setProgress({ phase: "done", message: "Fusion identity report ready" });
        nextTimings.push({
          phase: "main:react-state-enqueue",
          durationMs: performance.now() - reactStateStartedAt,
          count: 1,
        });
        const dashboardRefreshStartedAt = performance.now();
        await refreshDashboard();
        nextTimings.push({
          phase: "main:dashboard-refresh-after-analysis",
          durationMs: performance.now() - dashboardRefreshStartedAt,
          count: 1,
        });
        setTimings([...nextTimings]);
        reportFusionIdentityWorkerTimings(scope.targetServerCode, nextTimings);
        return result.report;
      } catch (loadError) {
        if (activeRequestIdRef.current !== run.requestId) return null;
        if (loadError instanceof FusionIdentityWorkerCancelledError) return null;
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Fusion identity data could not be loaded.";
        setDashboard((current) =>
          updateDashboardScope(current, scope.id, {
            cacheState: "error",
            error: message,
          }),
        );
        return null;
      } finally {
        if (activeRequestIdRef.current === run.requestId) {
          setRunningScopeId(null);
          runRef.current = null;
        }
      }
    },
    [refreshDashboard],
  );

  return {
    dashboard,
    inventoryProgress,
    inventoryTimings,
    report,
    progress,
    timings,
    runningScopeId,
    refreshDashboard,
    analyzeScope,
    openCachedReport,
    clearReport,
  };
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.summaryItem}>
      <div className={styles.summaryLabel}>{label}</div>
      <div className={styles.summaryValue}>{formatNumber(value)}</div>
    </div>
  );
}

const PLAYER_EVIDENCE_STRENGTHS = new Set<PlayerFusionEvidenceStrength>([
  "hardContradiction",
  "strongContradiction",
  "neutral",
  "weakSupport",
  "support",
  "strongSupport",
  "identityAnchor",
]);

const PLAYER_CANDIDATE_CLASSIFICATION_LABELS: Record<
  PlayerFusionCandidateClassification,
  string
> = {
  rejected: "Rejected",
  weak: "Weak",
  plausible: "Plausible",
  strong: "Strong",
  anchored: "Anchored",
};

const PLAYER_CANDIDATE_CLASSIFICATION_STRENGTHS: Record<
  PlayerFusionCandidateClassification,
  PlayerFusionEvidenceStrength
> = {
  rejected: "hardContradiction",
  weak: "neutral",
  plausible: "support",
  strong: "strongSupport",
  anchored: "identityAnchor",
};

const GUILD_EVIDENCE_STRENGTHS = new Set<GuildFusionEvidenceStrength>([
  "neutral",
  "weakSupport",
  "support",
  "strongSupport",
  "identityAnchor",
  "warning",
]);

const GUILD_CANDIDATE_CLASSIFICATION_LABELS: Record<
  GuildFusionCandidateClassification,
  string
> = {
  rejected: "Rejected",
  weak: "Weak",
  plausible: "Plausible",
  strong: "Strong",
  anchored: "Anchored",
};

const GUILD_CANDIDATE_CLASSIFICATION_STRENGTHS: Record<
  GuildFusionCandidateClassification,
  GuildFusionEvidenceStrength
> = {
  rejected: "warning",
  weak: "neutral",
  plausible: "support",
  strong: "strongSupport",
  anchored: "identityAnchor",
};

const PLAYER_EVIDENCE_TYPE_LABELS: Record<
  PlayerFusionEvidenceEntryType,
  string
> = {
  "origin-compatibility": "Origin compatibility",
  "class-compatibility": "Class compatibility",
  "level-monotonicity": "Level monotonicity",
  "level-progression": "Level progression",
  "base-monotonicity": "Base monotonicity",
  "base-unchanged-stats": "Unchanged base stats",
  "base-secondary-stability": "Secondary base stability",
  "base-ordering": "Base-stat ordering",
  "fortress-continuity": "Fortress continuity",
  "pet-continuity": "Pet continuity",
  "portrait-continuity": "Portrait continuity",
  "guild-continuity": "Guild continuity",
  "exact-name": "Exact name",
  "fusion-base-name": "Fusion base name",
  assignment: "Assignment",
};

const isPlayerEvidenceStrength = (
  value: unknown,
): value is PlayerFusionEvidenceStrength =>
  typeof value === "string" &&
  PLAYER_EVIDENCE_STRENGTHS.has(value as PlayerFusionEvidenceStrength);

const isGuildEvidenceStrength = (
  value: unknown,
): value is GuildFusionEvidenceStrength =>
  typeof value === "string" &&
  GUILD_EVIDENCE_STRENGTHS.has(value as GuildFusionEvidenceStrength);

const isPlayerCandidateClassification = (
  value: unknown,
): value is PlayerFusionCandidateClassification =>
  typeof value === "string" && value in PLAYER_CANDIDATE_CLASSIFICATION_LABELS;

const isGuildCandidateClassification = (
  value: unknown,
): value is GuildFusionCandidateClassification =>
  typeof value === "string" && value in GUILD_CANDIDATE_CLASSIFICATION_LABELS;

const normalizeEvidenceStrength = (
  strength: unknown,
):
  | PlayerFusionEvidenceStrength
  | GuildFusionEvidenceStrength
  | "guildSupport"
  | "guildNeutral" => {
  if (isGuildEvidenceStrength(strength)) return strength;
  if (
    isPlayerEvidenceStrength(strength) ||
    strength === "guildSupport" ||
    strength === "guildNeutral"
  )
    return strength;
  return "neutral";
};

const evidenceStrengthClassName = (strength: unknown) => {
  switch (normalizeEvidenceStrength(strength)) {
    case "identityAnchor":
      return styles.evidenceAnchor;
    case "strongSupport":
      return styles.evidenceStrongSupport;
    case "support":
    case "guildSupport":
      return styles.evidenceSupport;
    case "weakSupport":
      return styles.evidenceWeakSupport;
    case "strongContradiction":
    case "warning":
      return styles.evidenceWarning;
    case "hardContradiction":
      return styles.evidenceHardContradiction;
    case "neutral":
    case "guildNeutral":
      return styles.evidenceNeutral;
  }
};

function EvidenceChip({
  strength = "neutral",
  children,
  help,
}: {
  strength?:
    | PlayerFusionEvidenceStrength
    | GuildFusionEvidenceStrength
    | "guildSupport"
    | "guildNeutral"
    | unknown;
  children: React.ReactNode;
  help?: EvidenceChipHelp | null;
}) {
  const { t } = useTranslation();
  const context = React.useContext(EvidencePopoverContext);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const reactId = React.useId();
  const [position, setPosition] = React.useState<{
    top: number;
    left: number;
  } | null>(null);
  const chipInstanceId = reactId.replace(/:/g, "");
  const chipActiveId = help ? `${help.id}-${chipInstanceId}` : "";
  const open = Boolean(help && context?.activeId === chipActiveId);

  const updatePosition = React.useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(340, window.innerWidth - 24);
    const left = Math.max(
      12,
      Math.min(rect.left, window.innerWidth - width - 12),
    );
    const belowTop = rect.bottom + 8;
    const aboveTop = rect.top - 188;
    const top =
      belowTop + 188 < window.innerHeight ? belowTop : Math.max(12, aboveTop);
    setPosition({ top, left });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updatePosition();
    const closeOnOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (buttonRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest("[data-fusion-evidence-popover='true']")
      )
        return;
      context?.setActiveId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") context?.setActiveId(null);
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("touchstart", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("touchstart", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [context, open, updatePosition]);

  const toggle = (event: React.MouseEvent) => {
    if (!help || !context) return;
    event.stopPropagation();
    context.setActiveId(open ? null : chipActiveId);
    window.setTimeout(updatePosition, 0);
  };

  const title = help?.definition
    ? fallbackTranslate(t, help.definition.titleKey) || help.fallbackTitle
    : help?.fallbackTitle;
  const description = help?.definition
    ? fallbackTranslate(t, help.definition.descriptionKey)
    : "";
  const effect = help?.definition?.effectKey
    ? fallbackTranslate(t, help.definition.effectKey)
    : "";
  const caution = help?.definition?.cautionKey
    ? fallbackTranslate(t, help.definition.cautionKey)
    : "";
  const rankTitle = help?.strength
    ? fallbackTranslate(t, FUSION_EVIDENCE_RANK_HELP[help.strength].titleKey) ||
      help.strength
    : null;
  const popoverId = help
    ? `fusion-evidence-popover-${reactId.replace(/:/g, "")}`
    : undefined;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.evidenceChip} ${styles.evidenceChipButton} ${evidenceStrengthClassName(strength)}`}
        onClick={toggle}
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-describedby={open ? popoverId : undefined}
      >
        {children}
      </button>
      {open && position && help
        ? createPortal(
            <div
              id={popoverId}
              data-fusion-evidence-popover="true"
              className={styles.evidencePopover}
              style={{ top: position.top, left: position.left }}
              role="tooltip"
            >
              <div className={styles.evidencePopoverTitle}>{title}</div>
              {rankTitle ? (
                <div className={styles.evidencePopoverRank}>
                  {help.kind === "classification" ? "Classification" : "Rank"}:{" "}
                  {rankTitle}
                </div>
              ) : null}
              {description ? (
                <p>{description}</p>
              ) : (
                <p>
                  {help.fallbackDescription ??
                    "This chip uses contextual resolver evidence. Review it together with the other signals."}
                </p>
              )}
              {effect ? (
                <p>
                  <strong>Effect:</strong> {effect}
                </p>
              ) : null}
              {caution ? (
                <p>
                  <strong>Important:</strong> {caution}
                </p>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

type RenderablePlayerEvidenceEntry = {
  type: string;
  strength: PlayerFusionEvidenceStrength;
  label: string;
};

type RenderableGuildEvidenceEntry = {
  type: string;
  strength: GuildFusionEvidenceStrength;
  label: string;
};

const legacyBooleanEvidenceEntry = (
  type: PlayerFusionEvidenceEntryType,
  value: boolean | null | undefined,
  trueLabel: string,
  falseLabel: string,
  falseStrength: PlayerFusionEvidenceStrength,
  trueStrength: PlayerFusionEvidenceStrength = "neutral",
): RenderablePlayerEvidenceEntry | null => {
  if (value == null) return null;
  return {
    type,
    strength: value ? trueStrength : falseStrength,
    label: value ? trueLabel : falseLabel,
  };
};

const getPlayerCandidateClassificationChip = (
  candidate: PlayerFusionCandidate,
) => {
  if (isPlayerCandidateClassification(candidate.classification)) {
    return {
      label: PLAYER_CANDIDATE_CLASSIFICATION_LABELS[candidate.classification],
      strength:
        PLAYER_CANDIDATE_CLASSIFICATION_STRENGTHS[candidate.classification],
    };
  }

  return {
    label: candidate.rejected ? "Rejected" : "Unclassified candidate",
    strength: candidate.rejected
      ? ("hardContradiction" as const)
      : ("neutral" as const),
  };
};

const normalizePlayerEvidenceEntry = (
  entry: unknown,
  index: number,
): RenderablePlayerEvidenceEntry | null => {
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Partial<PlayerFusionEvidenceEntry> &
    Record<string, unknown>;
  const type =
    typeof record.type === "string" ? record.type : `legacy-${index}`;
  const typedLabel =
    type in PLAYER_EVIDENCE_TYPE_LABELS
      ? PLAYER_EVIDENCE_TYPE_LABELS[type as PlayerFusionEvidenceEntryType]
      : null;
  const label =
    typeof record.label === "string" && record.label.trim()
      ? record.label
      : (typedLabel ?? "Evidence");

  return {
    type,
    strength: isPlayerEvidenceStrength(record.strength)
      ? record.strength
      : "neutral",
    label,
  };
};

const legacyPlayerEvidenceEntries = (
  candidate: PlayerFusionCandidate,
): RenderablePlayerEvidenceEntry[] => {
  const evidence = candidate.evidence;
  if (!evidence) return [];
  const entries: Array<RenderablePlayerEvidenceEntry | null> = [
    legacyBooleanEvidenceEntry(
      "origin-compatibility",
      evidence.originMatches,
      "Origin compatible",
      "Origin contradiction",
      "hardContradiction",
    ),
    legacyBooleanEvidenceEntry(
      "class-compatibility",
      evidence.sameClass,
      "Class compatible",
      "Class contradiction",
      "hardContradiction",
    ),
    legacyBooleanEvidenceEntry(
      "level-monotonicity",
      evidence.levelConsistent,
      "Level non-decreasing",
      "Level regression",
      "hardContradiction",
    ),
    legacyBooleanEvidenceEntry(
      "base-monotonicity",
      evidence.baseAttributesConsistent,
      "Base stats non-decreasing",
      "Base-stat regression",
      "hardContradiction",
    ),
    legacyBooleanEvidenceEntry(
      "fortress-continuity",
      evidence.fortressContinuity,
      "Fortress continuity",
      "Fortress differs",
      "neutral",
      "strongSupport",
    ),
    legacyBooleanEvidenceEntry(
      "pet-continuity",
      evidence.petContinuity,
      "Pet continuity",
      "Pets differ",
      "neutral",
      "weakSupport",
    ),
    legacyBooleanEvidenceEntry(
      "guild-continuity",
      evidence.sameGuild,
      "Guild continuity",
      "Guild differs",
      "neutral",
      "support",
    ),
  ];

  if (evidence.levelProgression?.category === "normal") {
    entries.push({
      type: "level-progression",
      strength: "support",
      label: "Normal level progression",
    });
  } else if (evidence.levelProgression?.category === "plausible-burst") {
    entries.push({
      type: "level-progression",
      strength: "weakSupport",
      label: "Plausible level burst",
    });
  } else if (evidence.levelProgression?.category === "extreme-contradiction") {
    entries.push({
      type: "level-progression",
      strength: "strongContradiction",
      label: "Unusually high level progression",
    });
  }
  if (
    evidence.baseFingerprint?.unchangedCount != null &&
    evidence.baseFingerprint.unchangedCount >= 3
  ) {
    entries.push({
      type: "base-unchanged-stats",
      strength: "strongSupport",
      label: "3+ unchanged base stats",
    });
  }
  if (
    evidence.baseFingerprint?.unchangedSecondaryCount != null &&
    evidence.baseFingerprint.unchangedSecondaryCount >= 2
  ) {
    entries.push({
      type: "base-secondary-stability",
      strength: "strongSupport",
      label: "2 unchanged secondary base stats",
    });
  }
  if (evidence.baseFingerprint?.orderingStable === true) {
    entries.push({
      type: "base-ordering",
      strength: "support",
      label: "Base-stat ordering stable",
    });
  }
  if (evidence.exactName)
    entries.push({
      type: "exact-name",
      strength: "identityAnchor",
      label: "Exact name",
    });
  if (evidence.fusionBaseName)
    entries.push({
      type: "fusion-base-name",
      strength: "identityAnchor",
      label: "Fusion base name",
    });

  return entries.filter((entry): entry is RenderablePlayerEvidenceEntry =>
    Boolean(entry),
  );
};

const getRenderablePlayerEvidenceEntries = (
  candidate: PlayerFusionCandidate,
) => {
  const entries = candidate.evidence?.entries;
  if (!Array.isArray(entries)) return legacyPlayerEvidenceEntries(candidate);
  return entries
    .map(normalizePlayerEvidenceEntry)
    .filter((entry): entry is RenderablePlayerEvidenceEntry => Boolean(entry));
};

const normalizeGuildEvidenceEntry = (
  entry: unknown,
  index: number,
): RenderableGuildEvidenceEntry | null => {
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Partial<GuildFusionEvidenceEntry> &
    Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : `guild-${index}`;
  const label =
    typeof record.label === "string" && record.label.trim()
      ? record.label
      : "Guild evidence";
  return {
    type,
    strength: isGuildEvidenceStrength(record.strength)
      ? record.strength
      : "neutral",
    label,
  };
};

const getGuildCandidateClassificationChip = (
  candidate: GuildFusionCandidate,
) => {
  if (isGuildCandidateClassification(candidate.classification)) {
    return {
      label: GUILD_CANDIDATE_CLASSIFICATION_LABELS[candidate.classification],
      strength:
        GUILD_CANDIDATE_CLASSIFICATION_STRENGTHS[candidate.classification],
    };
  }
  return { label: "Unclassified candidate", strength: "neutral" as const };
};

const getRenderableGuildEvidenceEntries = (
  candidate: GuildFusionCandidate,
): RenderableGuildEvidenceEntry[] => {
  if (Array.isArray(candidate.evidenceEntries)) {
    return candidate.evidenceEntries
      .map(normalizeGuildEvidenceEntry)
      .filter((entry): entry is RenderableGuildEvidenceEntry => Boolean(entry));
  }

  const legacyEntries: Array<RenderableGuildEvidenceEntry | null> = [
    candidate.exactName
      ? {
          type: "exact-name",
          strength: "strongSupport" as const,
          label: "Exact guild name",
        }
      : null,
    candidate.sameCoA
      ? { type: "same-coa", strength: "support" as const, label: "Same CoA" }
      : null,
    candidate.mutualDominant
      ? {
          type: "member-flow",
          strength: "strongSupport" as const,
          label: "Mutual dominant flow",
        }
      : null,
    candidate.matchedMemberCount > 0
      ? {
          type: "member-flow-count",
          strength: "support" as const,
          label: `${candidate.matchedMemberCount} matched players`,
        }
      : null,
  ];
  return legacyEntries.filter((entry): entry is RenderableGuildEvidenceEntry =>
    Boolean(entry),
  );
};

const classificationChipHelp = (
  entityType: FusionIdentityEntityType,
  classification: string,
  fallbackTitle: string,
): EvidenceChipHelp => ({
  id: `classification-${entityType}-${classification}`,
  kind: "classification",
  definition: getClassificationHelp(classification),
  strength: null,
  fallbackTitle,
});

const evidenceChipHelp = (
  entityType: "player" | "guild",
  type: string,
  strength: FusionEvidenceRank,
  fallbackTitle: string,
): EvidenceChipHelp => ({
  id: `evidence-${entityType}-${type}-${strength}-${fallbackTitle}`,
  kind: "evidence",
  definition: getEvidenceHelp(entityType, type),
  strength,
  fallbackTitle,
});

const rejectReasonChipHelp = (reason: string): EvidenceChipHelp => ({
  id: `reject-player-${reason}`,
  kind: "reject",
  definition: getPlayerRejectReasonHelp(reason),
  strength: "hardContradiction",
  fallbackTitle: reason,
});

const readyQueueChipHelp = (): EvidenceChipHelp => ({
  id: "queue-ready-candidate",
  kind: "classification",
  definition: getClassificationHelp("anchored"),
  fallbackTitle: "Ready queue candidate",
  fallbackDescription:
    "This candidate is the selected automatic-linking option for the current identity.",
});

const guildReadyCandidateHelp = (): EvidenceChipHelp => ({
  id: "guild-ready-candidate",
  kind: "classification",
  definition: getClassificationHelp("anchored"),
  fallbackTitle: "Ready candidate",
  fallbackDescription:
    "This guild candidate currently has enough consistent evidence to be eligible for automatic linking.",
});

function DetailDataList({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className={styles.dataList}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

function PlayerEvidence({ candidate }: { candidate: PlayerFusionCandidate }) {
  const classification = getPlayerCandidateClassificationChip(candidate);
  const evidenceEntries = getRenderablePlayerEvidenceEntries(candidate);

  return (
    <div className={styles.evidenceList}>
      <EvidenceChip
        strength={classification.strength}
        help={classificationChipHelp(
          "player",
          candidate.classification,
          classification.label,
        )}
      >
        {classification.label}
      </EvidenceChip>
      {evidenceEntries.map((entry, index) => (
        <EvidenceChip
          key={`${entry.type}-${entry.label}-${index}`}
          strength={entry.strength}
          help={evidenceChipHelp(
            "player",
            entry.type,
            entry.strength,
            entry.label,
          )}
        >
          {entry.label}
        </EvidenceChip>
      ))}
      {candidate.rejectReasons.map((reason) => (
        <EvidenceChip
          key={reason}
          strength="hardContradiction"
          help={rejectReasonChipHelp(reason)}
        >
          {reason}
        </EvidenceChip>
      ))}
    </div>
  );
}

function GuildEvidence({ candidate }: { candidate: GuildFusionCandidate }) {
  const classification = getGuildCandidateClassificationChip(candidate);
  const evidenceEntries = getRenderableGuildEvidenceEntries(candidate);

  return (
    <div className={styles.evidenceList}>
      <EvidenceChip
        strength={classification.strength}
        help={classificationChipHelp(
          "guild",
          candidate.classification,
          classification.label,
        )}
      >
        {classification.label}
      </EvidenceChip>
      {evidenceEntries.map((entry, index) => (
        <EvidenceChip
          key={`${entry.type}-${entry.label}-${index}`}
          strength={entry.strength}
          help={evidenceChipHelp(
            "guild",
            entry.type,
            entry.strength,
            entry.label,
          )}
        >
          {entry.label}
        </EvidenceChip>
      ))}
      {candidate.autoEligible ? (
        <EvidenceChip
          strength="identityAnchor"
          help={guildReadyCandidateHelp()}
        >
          Ready candidate
        </EvidenceChip>
      ) : null}
      {!candidate.autoEligible && candidate.assignmentConflict ? (
        <EvidenceChip
          strength="warning"
          help={evidenceChipHelp(
            "guild",
            "assignment",
            "warning",
            "Assignment conflict",
          )}
        >
          Assignment conflict
        </EvidenceChip>
      ) : null}
    </div>
  );
}

function EvidenceInfoDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const signalsByEntity = React.useMemo(
    () => ({
      player: FUSION_EVIDENCE_GUIDE_SIGNALS.filter(
        (signal) => signal.entityType === "player",
      ),
      guild: FUSION_EVIDENCE_GUIDE_SIGNALS.filter(
        (signal) => signal.entityType === "guild",
      ),
    }),
    [],
  );

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fusion-evidence-info-title"
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        className={`${styles.dialog} ${styles.infoDialog}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="fusion-evidence-info-title" className={styles.dialogTitle}>
              Matching evidence
            </h2>
            <div className={styles.muted}>
              How Fusion &amp; Identity decides between Ready, Review and
              Unresolved.
            </div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close evidence info"
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className={`${styles.dialogBody} ${styles.infoBody}`}>
          <section className={styles.infoSection}>
            <h3>How matching works</h3>
            <p>
              The system compares historical identities from EU1-EU4 with
              current F28 identities. It collects independent evidence,
              classifies each candidate, and then places the current identity
              into Ready, Needs Review, Unresolved or one of the no-history
              states.
            </p>
            <p>
              A single visible candidate is not enough on its own. Automatic
              matching needs evidence that is strong enough, consistent, and not
              contested by another current identity.
            </p>
          </section>

          <section className={styles.infoSection}>
            <h3>Evidence strengths</h3>
            <div className={styles.infoStrengthGrid}>
              <div>
                <strong>Weak</strong>
                <span>Compatible, but too generic or too thin to rely on.</span>
              </div>
              <div>
                <strong>Plausible</strong>
                <span>
                  A reasonable identity hypothesis that usually still needs a
                  human check.
                </span>
              </div>
              <div>
                <strong>Strong</strong>
                <span>
                  Several reliable signals point to the same historical
                  identity.
                </span>
              </div>
              <div>
                <strong>Anchored</strong>
                <span>
                  A direct identity anchor exists, such as a robust name/fusion
                  signal or dominant continuity.
                </span>
              </div>
            </div>
            <p>
              These levels are ordinal guidance, not percentage confidence
              scores.
            </p>
          </section>

          <section className={styles.infoSection}>
            <h3>Evidence signal ranks</h3>
            <p>
              Signal ranks describe how helpful a single chip is in context.
              They are ordinal labels, not scores, and the final classification
              does not simply count chips. Independent evidence families matter
              more than many copies of the same weak hint.
            </p>
            <div className={styles.rankGuide}>
              {FUSION_EVIDENCE_RANKS.map((rank) => (
                <div key={rank} className={styles.rankGuideBlock}>
                  <strong>
                    {fallbackTranslate(
                      t,
                      FUSION_EVIDENCE_RANK_HELP[rank].titleKey,
                    ) || rank}
                  </strong>
                  <span>
                    {fallbackTranslate(
                      t,
                      FUSION_EVIDENCE_RANK_HELP[rank].descriptionKey,
                    )}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.infoSection}>
            <h3>Typical evidence signals</h3>
            <ul className={styles.infoList}>
              <li>
                <strong>Exact name</strong> means the current and historical
                names match after normalization.
              </li>
              <li>
                <strong>Unique exact name</strong> means that exact historical
                name appears as a unique candidate in the covered pool.
              </li>
              <li>
                <strong>Same CoA</strong> means the guild crest evidence stayed
                consistent.
              </li>
              <li>
                <strong>Mutual dominant member flow</strong> means resolved
                players mostly point from one old guild into one new guild, and
                back.
              </li>
              <li>
                <strong>Reliable member matches</strong> count resolved player
                identities, not the total guild roster.
              </li>
              <li>
                <strong>Leader continuity</strong> compares resolved leader
                identities when the data is available.
              </li>
              <li>
                <strong>Structural rename</strong> covers strong member-flow
                continuity even when the guild name changed.
              </li>
              <li>
                <strong>Warnings</strong> such as unavailable leader continuity
                or a different resolved leader reduce certainty or require
                review.
              </li>
            </ul>
          </section>

          <section className={styles.infoSection}>
            <h3>Player evidence by rank</h3>
            <div className={styles.signalMatrix}>
              {FUSION_EVIDENCE_RANKS.map((rank) => {
                const signals = signalsByEntity.player.filter(
                  (signal) => signal.rank === rank,
                );
                if (!signals.length) return null;
                return (
                  <div key={`player-${rank}`}>
                    <strong>
                      {fallbackTranslate(
                        t,
                        FUSION_EVIDENCE_RANK_HELP[rank].titleKey,
                      ) || rank}
                    </strong>
                    <span>
                      {signals
                        .map(
                          (signal) =>
                            fallbackTranslate(t, signal.labelKey) ||
                            signal.evidenceType,
                        )
                        .join(" · ")}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={styles.infoSection}>
            <h3>Guild evidence by rank</h3>
            <div className={styles.signalMatrix}>
              {FUSION_EVIDENCE_RANKS.map((rank) => {
                const signals = signalsByEntity.guild.filter(
                  (signal) => signal.rank === rank,
                );
                if (!signals.length) return null;
                return (
                  <div key={`guild-${rank}`}>
                    <strong>
                      {fallbackTranslate(
                        t,
                        FUSION_EVIDENCE_RANK_HELP[rank].titleKey,
                      ) || rank}
                    </strong>
                    <span>
                      {signals
                        .map(
                          (signal) =>
                            fallbackTranslate(t, signal.labelKey) ||
                            signal.evidenceType,
                        )
                        .join(" · ")}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={styles.infoSection}>
            <h3>Why review can remain</h3>
            <p>
              Chips describe evidence that exists, but they do not guarantee
              automatic linking. A guild can show one plausible candidate, exact
              name evidence and 1 matched player, yet still stay in review
              because only a tiny part of the roster was reliably resolved.
            </p>
            <p>
              For example, 1 matched player does not mean the guild had 1
              member. It means 1 current player identity could be reliably
              linked across the available scans. Low coverage can come from
              missing scans, sparse observations or incomplete historical data.
            </p>
          </section>

          <section className={styles.infoSection}>
            <h3>Final statuses</h3>
            <div className={styles.infoStatusList}>
              <div>
                <span className={`${styles.statusBadge} ${styles.statusHigh}`}>
                  Ready
                </span>
                <p>Enough reliable evidence for automatic linking.</p>
              </div>
              <div>
                <span
                  className={`${styles.statusBadge} ${styles.statusAmbiguous}`}
                >
                  Needs Review
                </span>
                <p>
                  A useful candidate exists, but evidence is thin, ambiguous or
                  contested.
                </p>
              </div>
              <div>
                <span
                  className={`${styles.statusBadge} ${styles.statusUnresolved}`}
                >
                  Unresolved
                </span>
                <p>
                  Historical data exists, but no actionable identity hypothesis
                  remains.
                </p>
              </div>
              <div>
                <span
                  className={`${styles.statusBadge} ${styles.statusNative}`}
                >
                  No Historical Observation
                </span>
                <p>
                  The expected historical scope was checked, but no matching
                  observation was found.
                </p>
              </div>
              <div>
                <span
                  className={`${styles.statusBadge} ${styles.statusNative}`}
                >
                  No Historical Data
                </span>
                <p>The required historical scan coverage is not available.</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const formatMemberCount = (value: number | null | undefined) =>
  value != null && Number.isFinite(value) && value > 0
    ? formatNumber(value)
    : null;

function GuildResolvedFlow({ candidate }: { candidate: GuildFusionCandidate }) {
  const oldResolvedCount = candidate.oldMappedMemberCount;
  const newResolvedCount = candidate.newMappedMemberCount;
  const historicalMembers = formatMemberCount(candidate.oldMemberCount);
  const currentMembers = formatMemberCount(candidate.newMemberCount);

  return (
    <div className={styles.guildFlow}>
      <div>
        <strong>Reliable member matches:</strong>{" "}
        {formatNumber(candidate.matchedMemberCount)}
      </div>
      <div>
        <strong>Resolved member flow:</strong>{" "}
        {formatNumber(candidate.matchedMemberCount)} /{" "}
        {formatNumber(oldResolvedCount)} resolved historical players matched (
        {formatShare(candidate.oldShare)} of resolved players) ·{" "}
        {formatNumber(candidate.matchedMemberCount)} /{" "}
        {formatNumber(newResolvedCount)} resolved current players matched (
        {formatShare(candidate.newShare)} of resolved players)
      </div>
      {historicalMembers && currentMembers ? (
        <div>
          <strong>Resolved identity coverage:</strong> historical{" "}
          {formatNumber(oldResolvedCount)} / {historicalMembers} members ·
          current {formatNumber(newResolvedCount)} / {currentMembers} members
        </div>
      ) : (
        <div>
          <strong>Roster coverage unavailable.</strong> Reliable identities
          available: historical {formatNumber(oldResolvedCount)} · current{" "}
          {formatNumber(newResolvedCount)}
        </div>
      )}
    </div>
  );
}

function CandidateRow({
  item,
  candidate,
  onConfirm,
  onReject,
}: {
  item: FusionIdentityManagementItem;
  candidate: FusionIdentityCandidate;
  onConfirm: (candidate: FusionIdentityCandidate) => void;
  onReject: (candidate: FusionIdentityCandidate) => void;
}) {
  const disabled = candidate.rejected || candidate.assignedToOtherIdentity;
  const highlightConfirm = isInsufficientEvidenceReview(item) && !disabled;
  return (
    <article className={styles.candidateRow}>
      <div className={styles.actionRow}>
        <div>
          <div className={styles.playerName}>
            {candidate.historicalName ?? candidate.historicalIdentifier}
          </div>
          <div className={styles.muted}>
            {candidate.historicalIdentifier} ·{" "}
            {candidate.historicalServer ?? "Server unknown"}
          </div>
        </div>
        <div className={styles.rowActions}>
          <button
            type="button"
            className={`${styles.closeButton} ${highlightConfirm ? styles.confirmButton : ""}`}
            onClick={() => onConfirm(candidate)}
            disabled={disabled}
          >
            <Check size={15} aria-hidden /> Confirm identity
          </button>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => onReject(candidate)}
            disabled={candidate.rejected}
          >
            <X size={15} aria-hidden /> Reject
          </button>
        </div>
      </div>
      {candidate.assignedToOtherIdentity ? (
        <p className={styles.muted}>Already linked to another identity.</p>
      ) : null}
      {candidate.rejected ? (
        <p className={styles.muted}>Rejected for this current identity.</p>
      ) : null}
      {candidate.entityType === "player" ? (
        <>
          <div className={styles.muted}>
            {formatClass(candidate.evidence.oldClassId)} ·{" "}
            {formatLevel(candidate.evidence.oldLevel)} ·{" "}
            {candidate.evidence.oldGuildName ??
              candidate.evidence.oldGuildIdentifier ??
              "Guild unknown"}
          </div>
          <PlayerEvidence candidate={candidate.evidence} />
        </>
      ) : (
        <>
          <GuildResolvedFlow candidate={candidate.evidence} />
          <GuildEvidence candidate={candidate.evidence} />
        </>
      )}
      {item.status === "ready" &&
      item.readyCandidateIdentifier === candidate.historicalIdentifier ? (
        <div className={styles.evidenceList}>
          <EvidenceChip strength="support" help={readyQueueChipHelp()}>
            Ready queue candidate
          </EvidenceChip>
        </div>
      ) : null}
    </article>
  );
}

function MigrationRow({ edge }: { edge: GuildFusionMigrationEdge }) {
  return (
    <article className={styles.candidateRow}>
      <div className={styles.playerName}>
        {edge.oldName ?? edge.oldGuildIdentifier}
      </div>
      <div className={styles.muted}>
        {edge.oldGuildIdentifier} · {edge.oldServer ?? "Server unknown"} ·{" "}
        {edge.matchedMemberCount} matched players
      </div>
      <div className={styles.muted}>
        Flow share: {formatShare(edge.oldShare)} from old ·{" "}
        {formatShare(edge.newShare)} into new
      </div>
    </article>
  );
}

function IdentityDetails({
  item,
  onClose,
  onChanged,
}: {
  item: FusionIdentityManagementItem;
  onClose: () => void;
  onChanged: () => void;
}) {
  const handleConfirm = async (candidate: FusionIdentityCandidate) => {
    await confirmFusionIdentityLink(
      item.entityType,
      item.currentIdentifier,
      candidate.historicalIdentifier,
    );
    onChanged();
    onClose();
  };
  const handleReject = async (candidate: FusionIdentityCandidate) => {
    await rejectFusionIdentityCandidate(
      item.entityType,
      item.currentIdentifier,
      candidate.historicalIdentifier,
    );
    onChanged();
  };
  const handleUndo = async (identifier: string) => {
    await unlinkFusionIdentityAlias(item.entityType, identifier);
    onChanged();
    onClose();
  };
  const statusExplanation = formatStatusExplanation(item);
  const candidateHeading =
    item.status === "noHistoricalObservation"
      ? "Historical observation"
      : item.status === "ready"
        ? item.entityType === "guild"
          ? "Matched historical guild"
          : "Matched historical identity"
        : item.status === "review"
          ? "Possible historical identities"
          : "Historical identity candidates";
  const currentObservation = latestObservation(item.observations);
  const firstObservation = earliestObservation(item.observations);
  const currentIdentityRows: Array<[string, React.ReactNode]> = [
    ["Type", typeLabel(item.entityType)],
    ["Name", item.currentName ?? "-"],
    ["Identifier", item.currentIdentifier],
    ["Server", item.currentServer ?? "-"],
  ];

  if (item.entityType === "player") {
    currentIdentityRows.push(
      [
        "Class",
        currentObservation?.classId
          ? formatClass(currentObservation.classId)
          : null,
      ],
      ["Level", formatCurrentLevel(currentObservation?.level)],
      ["Guild", currentObservation?.guildName?.trim() || null],
    );
  }

  currentIdentityRows.push(
    ["Observed", item.observations.length],
    ["Last seen", formatDate(item.lastSeen)],
  );
  const statusRows: Array<[string, React.ReactNode]> = [
    ["Status", statusLabel(item.status)],
    ["First seen", formatDate(firstObservation?.timestamp ?? item.firstSeen)],
  ];

  if (item.entityType === "player") {
    statusRows.push(
      ["First seen level", formatCurrentLevel(firstObservation?.level)],
      ["First seen guild", firstObservation?.guildName?.trim() || null],
    );
  }

  statusRows.push(
    ["Candidate", item.readyCandidateIdentifier ?? "-"],
    ["Reason", item.reasons.join("; ") || "-"],
  );

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fusion-identity-detail-title"
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        className={styles.dialog}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.dialogHeader}>
          <div>
            <h2
              id="fusion-identity-detail-title"
              className={styles.dialogTitle}
            >
              {item.currentName ?? item.currentIdentifier}
            </h2>
            <div className={styles.muted}>
              {typeLabel(item.entityType)} · {item.currentIdentifier}
            </div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close details"
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className={styles.dialogBody}>
          <div className={styles.detailGrid}>
            <section className={styles.detailCard}>
              <h3>Current identity</h3>
              <DetailDataList rows={currentIdentityRows} />
            </section>
            <section className={styles.detailCard}>
              <h3>Status</h3>
              <DetailDataList rows={statusRows} />
            </section>
            <section className={styles.detailCard}>
              <h3>Completed links</h3>
              {item.completedAliases.length ? (
                <div className={styles.candidateList}>
                  {item.completedAliases.map((alias) => (
                    <div key={alias} className={styles.actionRow}>
                      <span>{alias}</span>
                      <button
                        type="button"
                        className={styles.closeButton}
                        onClick={() => handleUndo(alias)}
                      >
                        <Undo2 size={15} aria-hidden /> Undo
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.muted}>No confirmed aliases yet.</p>
              )}
            </section>
          </div>

          <section className={styles.detailCard}>
            <h3>{candidateHeading}</h3>
            {statusExplanation ? (
              <div className={styles.reviewNotice}>
                <div className={styles.reviewTitle}>
                  {statusExplanation.title}
                </div>
                <p>{statusExplanation.body}</p>
                {statusExplanation.action ? (
                  <p>{statusExplanation.action}</p>
                ) : null}
              </div>
            ) : null}
            {item.candidates.length ? (
              <div className={styles.candidateList}>
                {item.candidates.map((candidate) => (
                  <CandidateRow
                    key={candidate.historicalIdentifier}
                    item={item}
                    candidate={candidate}
                    onConfirm={handleConfirm}
                    onReject={handleReject}
                  />
                ))}
              </div>
            ) : (
              <p className={styles.muted}>
                No resolver candidate is currently available.
              </p>
            )}
          </section>

          {item.entityType === "guild" && item.memberMigrationEdges.length ? (
            <section className={styles.detailCard}>
              <h3>Other member sources</h3>
              <div className={styles.candidateList}>
                {item.memberMigrationEdges.map((edge) => (
                  <MigrationRow
                    key={`${edge.oldGuildIdentifier}-${edge.newGuildIdentifier}`}
                    edge={edge}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ManualLinkDialog({
  report,
  onClose,
  onChanged,
}: {
  report: FusionIdentityManagementReport;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [entityType, setEntityType] =
    React.useState<FusionIdentityEntityType>("player");
  const currentOptions = report.currentAliases.filter(
    (option) => option.entityType === entityType,
  );
  const historicalOptions = report.historicalAliases.filter(
    (option) => option.entityType === entityType,
  );
  const [currentIdentifier, setCurrentIdentifier] = React.useState(
    currentOptions[0]?.identifier ?? "",
  );
  const [historicalIdentifier, setHistoricalIdentifier] = React.useState(
    historicalOptions[0]?.identifier ?? "",
  );
  const selectedHistorical = historicalOptions.find(
    (option) => option.identifier === historicalIdentifier,
  );
  const alreadyLinked = Boolean(selectedHistorical?.linkedEntityId);

  React.useEffect(() => {
    const nextCurrent =
      report.currentAliases.find((option) => option.entityType === entityType)
        ?.identifier ?? "";
    const nextHistorical =
      report.historicalAliases.find(
        (option) => option.entityType === entityType,
      )?.identifier ?? "";
    setCurrentIdentifier(nextCurrent);
    setHistoricalIdentifier(nextHistorical);
  }, [entityType, report.currentAliases, report.historicalAliases]);

  const handleSubmit = async () => {
    await confirmFusionIdentityLink(
      entityType,
      currentIdentifier,
      historicalIdentifier,
    );
    onChanged();
    onClose();
  };

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fusion-manual-link-title"
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        className={styles.dialog}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="fusion-manual-link-title" className={styles.dialogTitle}>
              Manual identity link
            </h2>
            <div className={styles.muted}>
              Resolver-independent link across the whole fusion pool.
            </div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close manual link"
          >
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className={styles.dialogBody}>
          <div className={styles.detailGrid}>
            <label className={styles.fieldLabel}>
              Type
              <select
                className={styles.select}
                value={entityType}
                onChange={(event) =>
                  setEntityType(event.target.value as FusionIdentityEntityType)
                }
              >
                <option value="player">Players</option>
                <option value="guild">Guilds</option>
              </select>
            </label>
            <label className={styles.fieldLabel}>
              Current F28 alias
              <select
                className={styles.select}
                value={currentIdentifier}
                onChange={(event) => setCurrentIdentifier(event.target.value)}
              >
                {currentOptions.map((option) => (
                  <option key={option.identifier} value={option.identifier}>
                    {option.name ?? option.identifier} · {option.identifier}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.fieldLabel}>
              Historical alias
              <select
                className={styles.select}
                value={historicalIdentifier}
                onChange={(event) =>
                  setHistoricalIdentifier(event.target.value)
                }
              >
                {historicalOptions.map((option) => (
                  <option key={option.identifier} value={option.identifier}>
                    {option.name ?? option.identifier} · {option.identifier}
                    {option.linkedEntityId ? " · Already linked" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {alreadyLinked ? (
            <div className={styles.errorState}>
              Already linked: this historical alias is part of an existing
              identity.
            </div>
          ) : null}
          <div className={styles.rowActions}>
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.closeButton}
              onClick={handleSubmit}
              disabled={
                !currentIdentifier || !historicalIdentifier || alreadyLinked
              }
            >
              <Link2 size={15} aria-hidden /> Link identity
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GuildMemberStatusSummary({
  item,
  onFocusMembersByStatus,
}: {
  item: FusionIdentityManagementItem;
  onFocusMembersByStatus: (
    item: FusionIdentityManagementItem,
    status: FusionIdentityMemberSelectionStatus,
  ) => void;
}) {
  const { t } = useTranslation();
  const summary = item.memberStatusSummary;
  if (item.entityType !== "guild" || !summary) return null;
  const guildName = item.currentName ?? item.currentIdentifier;
  const memberRefsByStatus = summary.memberRefsByStatus ?? {
    review: [],
    unresolved: [],
    noHistoricalObservation: [],
    noHistory: [],
  };
  const resolvedMembers = summary.resolvedMembers ?? 0;
  const totalMembers = summary.totalMembers ?? 0;
  const reviewMembers = summary.reviewMembers ?? 0;
  const unresolvedMembers = summary.unresolvedMembers ?? 0;
  const noHistoricalObservationMembers =
    summary.noHistoricalObservationMembers ?? 0;
  const noHistoricalDataMembers = summary.noHistoricalDataMembers ?? 0;
  const missingManagementEntries = summary.missingManagementEntries ?? 0;

  const problemParts: Array<React.ReactElement | string | null> = [
    reviewMembers ? (
      memberRefsByStatus.review.length ? (
        <button
          key="review"
          type="button"
          className={styles.guildMemberStatusButton}
          onClick={(event) => {
            event.stopPropagation();
            onFocusMembersByStatus(item, "review");
          }}
          aria-label={t("fusionIdentity.memberSelection.showReviewMembers", {
            count: reviewMembers,
            guildName,
          })}
        >
          {t("fusionIdentity.memberSelection.reviewCount", {
            count: reviewMembers,
          })}
        </button>
      ) : (
        <span key="review">
          {t("fusionIdentity.memberSelection.reviewCount", {
            count: reviewMembers,
          })}
        </span>
      )
    ) : null,
    unresolvedMembers
      ? `${formatNumber(unresolvedMembers)} unresolved`
      : null,
    noHistoricalObservationMembers
      ? `${formatNumber(noHistoricalObservationMembers)} no observation`
      : null,
    noHistoricalDataMembers
      ? `${formatNumber(noHistoricalDataMembers)} no history`
      : null,
    missingManagementEntries
      ? `${formatNumber(missingManagementEntries)} missing`
      : null,
  ].filter((value): value is React.ReactElement | string => value !== null);

  return (
    <span className={styles.guildMemberInlineSummary}>
      <span>
        {formatNumber(resolvedMembers)} / {formatNumber(totalMembers)} resolved
      </span>
      {problemParts.map((part, index) => (
        <React.Fragment key={index}>
          <span className={styles.guildMemberStatusSeparator}>·</span>
          {part}
        </React.Fragment>
      ))}
    </span>
  );
}

function QueueRow({
  item,
  onOpen,
  onFocusMembersByStatus,
}: {
  item: FusionIdentityManagementItem;
  onOpen: () => void;
  onFocusMembersByStatus: (
    item: FusionIdentityManagementItem,
    status: FusionIdentityMemberSelectionStatus,
  ) => void;
}) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={styles.resultRow}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.resultMain}>
        <div>
          <div
            className={
              item.entityType === "guild" ? styles.guildNameLine : undefined
            }
          >
            <div className={styles.playerName}>
              {item.currentName ?? item.currentIdentifier}
            </div>
            <GuildMemberStatusSummary
              item={item}
              onFocusMembersByStatus={onFocusMembersByStatus}
            />
          </div>
          <div className={styles.muted}>{item.currentIdentifier}</div>
        </div>
        <div>
          <div>{typeLabel(item.entityType)}</div>
          <div className={styles.muted}>
            {item.currentServer ?? "Server unknown"} · observed{" "}
            {item.observations.length}x
          </div>
        </div>
        <div>
          <div>
            {item.status === "completed"
              ? `${item.historicalIdentifiers.length} historical aliases`
              : item.readyCandidateIdentifier
                ? `Candidate: ${item.readyCandidateIdentifier}`
                : `${item.candidates.length} candidates`}
          </div>
          <div className={styles.muted}>
            {formatDate(item.firstSeen)} - {formatDate(item.lastSeen)}
          </div>
        </div>
        <span
          className={`${styles.statusBadge} ${statusClassName(item.status)}`}
        >
          {statusLabel(item.status)}
        </span>
      </div>
    </div>
  );
}

type FusionIdentityPageView = "dashboard" | "workspace";

const isCacheStaleDueToNewScan = (
  cache: FusionIdentityAnalysisCacheLookup,
) => cache.state === "stale" && cache.staleReason === "scan-fingerprint";

const isCacheStaleDueToCompatibility = (
  cache: FusionIdentityAnalysisCacheLookup,
) =>
  cache.state === "stale" &&
  cache.staleReason !== null &&
  cache.staleReason !== "scan-fingerprint";

const canOpenFusionWorkspace = (model: FusionIdentityDashboardScopeModel) =>
  model.inventory.scope.analysisSupported &&
  model.inventory.isLocallyMatchable &&
  model.cacheState === "fresh" &&
  Boolean(model.cache.freshEntry);

const getOpenableFusionWorkspaceEntry = (
  model: FusionIdentityDashboardScopeModel,
) => (canOpenFusionWorkspace(model) ? model.cache.freshEntry : null);

const hasFusionAnalysisInputData = (model: FusionIdentityDashboardScopeModel) =>
  Boolean(
    model.inventory.currentPlayerIdentifiers.length ||
      model.inventory.currentGuildIdentifiers.length,
  );

const canClickAnalyzeFusionScope = (
  model: FusionIdentityDashboardScopeModel,
  isAnyAnalysisRunning: boolean,
) =>
  getFusionIdentityAnalyzeActionState({
    analysisSupported: model.inventory.scope.analysisSupported,
    isLocallyMatchable: model.inventory.isLocallyMatchable,
    hasCurrentInputData: hasFusionAnalysisInputData(model),
    cacheState: model.cacheState,
    isAnyAnalysisRunning,
  }).enabled;

const cacheStatusLabel = (
  state: FusionIdentityAnalysisCacheState,
  cache?: FusionIdentityAnalysisCacheLookup,
) => {
  if (state === "fresh") return "Analysis up to date";
  if (state === "stale") {
    if (cache && isCacheStaleDueToCompatibility(cache))
      return "Analysis update required";
    return "New data available";
  }
  if (state === "running") return "Analysis running";
  if (state === "error") return "Analysis failed";
  return "Not analyzed yet";
};

const cacheStatusClassName = (state: FusionIdentityAnalysisCacheState) => {
  if (state === "fresh") return styles.statusHigh;
  if (state === "stale" || state === "running") return styles.statusAmbiguous;
  if (state === "error") return styles.statusConflict;
  return styles.statusNative;
};

const roleLabel = (role: FusionIdentityScopeInventory["coverage"][number]["role"]) => {
  if (role === "current-target") return "Current target";
  if (role === "intermediate-fusion-target") return "Intermediate target";
  if (role === "historical-origin") return "Historical origin";
  if (role === "transitive-historical-origin") return "Transitive origin";
  return "Out of scope";
};

const scopeTemporalLabel = (scope: FusionIdentityScopeInventory["scope"]) => {
  if (scope.temporalStatus === "future") return "Future event";
  if (scope.temporalStatus === "unknown-date") return "Unknown date";
  if (scope.isCurrentTerminalTarget) return "Current terminal";
  return "Historical intermediate";
};

const buildReportEntitySummary = (
  report: FusionIdentityManagementReport,
  entityType: FusionIdentityEntityType,
) => {
  const items = report.items.filter((item) => item.entityType === entityType);
  const count = (status: FusionIdentityManagementStatus) =>
    items.filter((item) => item.status === status).length;
  const ready = count("ready");
  const total = items.length;
  return {
    total,
    ready,
    review: count("review"),
    unresolved: count("unresolved"),
    noHistoricalObservation: count("noHistoricalObservation"),
    noHistory: count("noHistory"),
    completed: count("completed"),
    autoLinkShare: total > 0 ? ready / total : null,
  };
};

function DashboardResolutionSummary({
  report,
  previous,
}: {
  report: FusionIdentityManagementReport;
  previous?: boolean;
}) {
  const playerSummary = buildReportEntitySummary(report, "player");
  const guildSummary = buildReportEntitySummary(report, "guild");
  const renderLine = (
    label: string,
    summary: ReturnType<typeof buildReportEntitySummary>,
  ) => (
    <div className={styles.dashboardMetricLine}>
      <strong>{label}</strong>
      <span>
        {formatNumber(summary.ready)} / {formatNumber(summary.total)}{" "}
        auto-linkable
        {summary.autoLinkShare == null
          ? ""
          : ` · ${formatShare(summary.autoLinkShare)}`}
      </span>
      <span className={styles.muted}>
        {formatNumber(summary.review)} review ·{" "}
        {formatNumber(summary.unresolved)} unresolved ·{" "}
        {formatNumber(summary.noHistoricalObservation)} no observation ·{" "}
        {formatNumber(summary.noHistory)} no data ·{" "}
        {formatNumber(summary.completed)} completed
      </span>
    </div>
  );

  return (
    <div className={styles.dashboardMetrics}>
      {previous ? <div className={styles.muted}>Previous analysis</div> : null}
      {renderLine("Players", playerSummary)}
      {renderLine("Guilds", guildSummary)}
    </div>
  );
}

function ScanCoverageAccordion({
  coverage,
  expandedServers,
  onToggle,
}: {
  coverage: FusionIdentityScopeInventory["coverage"];
  expandedServers: Set<string>;
  onToggle: (serverCode: string) => void;
}) {
  return (
    <div className={styles.coverageList}>
      {coverage.map((server) => {
        const expanded = expandedServers.has(server.serverCode);
        return (
          <div
            key={server.serverCode}
            className={styles.coverageRow}
          >
            <button
              type="button"
              className={styles.coverageToggle}
              onClick={() => onToggle(server.serverCode)}
              aria-expanded={expanded}
            >
              <span className={styles.coverageServer}>{server.serverCode}</span>
              <span>
                {formatNumber(server.count)} scans ·{" "}
                {formatDate(server.firstSeen)} - {formatDate(server.lastSeen)}
              </span>
              <span className={styles.coverageRole}>{roleLabel(server.role)}</span>
              <ChevronDown
                size={16}
                aria-hidden
                className={`${styles.coverageChevron} ${
                  expanded ? styles.coverageChevronOpen : ""
                }`}
              />
            </button>
            {expanded ? (
              <div className={styles.coverageDetails}>
                {server.observations.map((observation) => (
                  <div key={observation.id}>
                    <span>{formatDate(observation.timestampMs)}</span>
                    <span>
                      {formatNumber(observation.playerCount)} players ·{" "}
                      {formatNumber(observation.guildCount)} guilds
                    </span>
                    <span className={styles.muted}>
                      {observation.sourceScanFilename}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function FusionIdentityPage() {
  const { t } = useTranslation();
  const {
    dashboard,
    inventoryProgress,
    report,
    progress,
    timings,
    runningScopeId,
    refreshDashboard,
    analyzeScope,
    openCachedReport,
    clearReport,
  } = useFusionIdentityDashboard();
  const [view, setView] = React.useState<FusionIdentityPageView>("dashboard");
  const [selectedDashboardScopeId, setSelectedDashboardScopeId] =
    React.useState<string | null>(null);
  const [expandedCoverageServers, setExpandedCoverageServers] = React.useState<
    string[]
  >([]);
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all");
  const [search, setSearch] = React.useState("");
  const [selectedIdentityIds, setSelectedIdentityIds] = React.useState<
    string[]
  >([]);
  const [selectionContext, setSelectionContext] =
    React.useState<FusionIdentityMemberSelectionContext | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [manualOpen, setManualOpen] = React.useState(false);
  const [evidenceInfoOpen, setEvidenceInfoOpen] = React.useState(false);
  const [activeEvidenceChipId, setActiveEvidenceChipId] = React.useState<
    string | null
  >(null);

  const locallyMatchableScopes = React.useMemo(
    () => dashboard.scopes.filter((scope) => scope.inventory.isLocallyMatchable),
    [dashboard.scopes],
  );

  React.useEffect(() => {
    if (!locallyMatchableScopes.length) {
      if (selectedDashboardScopeId) setSelectedDashboardScopeId(null);
      return;
    }
    if (
      selectedDashboardScopeId &&
      locallyMatchableScopes.some(
        (scope) => scope.inventory.scope.id === selectedDashboardScopeId,
      )
    ) {
      return;
    }
    setSelectedDashboardScopeId(locallyMatchableScopes[0].inventory.scope.id);
  }, [locallyMatchableScopes, selectedDashboardScopeId]);

  const selectedDashboardScope =
    locallyMatchableScopes.find(
      (scope) => scope.inventory.scope.id === selectedDashboardScopeId,
    ) ??
    locallyMatchableScopes[0] ??
    null;

  const expandedCoverageServerSet = React.useMemo(
    () => new Set(expandedCoverageServers),
    [expandedCoverageServers],
  );

  const toggleCoverageServer = React.useCallback((serverCode: string) => {
    setExpandedCoverageServers((current) =>
      current.includes(serverCode)
        ? current.filter((entry) => entry !== serverCode)
        : [...current, serverCode],
    );
  }, []);

  const selectedIdentityIdSet = React.useMemo(
    () => new Set(selectedIdentityIds),
    [selectedIdentityIds],
  );
  const currentPlayerByIdentifier = React.useMemo(() => {
    const byIdentifier = new Map<string, FusionIdentityManagementItem>();
    (report?.items ?? []).forEach((item) => {
      if (item.entityType === "player") {
        byIdentifier.set(item.currentIdentifier, item);
      }
    });
    return byIdentifier;
  }, [report]);
  const selectedMemberTokens = React.useMemo(
    () =>
      selectedIdentityIds.map((identifier) => {
        const item = currentPlayerByIdentifier.get(identifier);
        return {
          identifier,
          name: item?.currentName ?? identifier,
        };
      }),
    [currentPlayerByIdentifier, selectedIdentityIds],
  );

  const applyFilterSelection = React.useCallback(
    (nextTypeFilter: TypeFilter, nextStatusFilter: StatusFilter) => {
      const reconciled = reconcileMemberSelectionFilters({
        typeFilter: nextTypeFilter,
        statusFilter: nextStatusFilter,
        selectedIdentityIds,
        selectionContext,
      });
      setTypeFilter(nextTypeFilter);
      setStatusFilter(nextStatusFilter);
      setSelectedIdentityIds(reconciled.selectedIdentityIds);
      setSelectionContext(reconciled.selectionContext);
    },
    [selectedIdentityIds, selectionContext],
  );

  const focusGuildMembersByStatus = React.useCallback(
    (
      item: FusionIdentityManagementItem,
      status: FusionIdentityMemberSelectionStatus,
    ) => {
      const members =
        item.memberStatusSummary?.memberRefsByStatus?.[status] ?? [];
      if (!members.length) return;
      const nextState = createGuildMemberStatusSelection({
        guildIdentifier: item.currentIdentifier,
        guildName: item.currentName ?? item.currentIdentifier,
        status,
        members,
      });
      setTypeFilter(nextState.typeFilter);
      setStatusFilter(nextState.statusFilter);
      setSelectedIdentityIds(nextState.selectedIdentityIds);
      setSelectionContext(nextState.selectionContext);
      setSelectedId(null);
      setSearch("");
    },
    [],
  );

  const removeSelectedMember = React.useCallback(
    (identifier: string) => {
      const nextSelection = removeSelectedIdentityId(
        { selectedIdentityIds, selectionContext },
        identifier,
      );
      setSelectedIdentityIds(nextSelection.selectedIdentityIds);
      setSelectionContext(nextSelection.selectionContext);
    },
    [selectedIdentityIds, selectionContext],
  );

  const clearSelectedMembers = React.useCallback(() => {
    const nextSelection = clearSelectedIdentityIds({
      selectedIdentityIds,
      selectionContext,
    });
    setSelectedIdentityIds(nextSelection.selectedIdentityIds);
    setSelectionContext(nextSelection.selectionContext);
  }, [selectedIdentityIds, selectionContext]);

  const visibleItems = React.useMemo(() => {
    const query = normalizeSearch(search);
    return (report?.items ?? []).filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (typeFilter !== "all" && item.entityType !== typeFilter) return false;
      if (
        selectedIdentityIdSet.size &&
        !selectedIdentityIdSet.has(item.currentIdentifier)
      ) {
        return false;
      }
      if (!query) return true;
      return (
        (item.currentName ?? "").toLowerCase().includes(query) ||
        item.currentIdentifier.toLowerCase().includes(query) ||
        item.completedAliases.some((identifier) =>
          identifier.toLowerCase().includes(query),
        ) ||
        (item.status === "completed" &&
          item.historicalIdentifiers.some((identifier) =>
            identifier.toLowerCase().includes(query),
          ))
      );
    });
  }, [report, search, selectedIdentityIdSet, statusFilter, typeFilter]);

  const groupedItems = React.useMemo(
    () => ({
      guilds: visibleItems.filter((item) => item.entityType === "guild"),
      players: visibleItems.filter((item) => item.entityType === "player"),
    }),
    [visibleItems],
  );
  const selectedItem = React.useMemo(
    () => report?.items.find((item) => item.id === selectedId) ?? null,
    [report, selectedId],
  );

  const readyPlayers =
    report?.items.filter(
      (item) => item.entityType === "player" && item.status === "ready",
    ).length ?? 0;
  const readyGuilds =
    report?.items.filter(
      (item) => item.entityType === "guild" && item.status === "ready",
    ).length ?? 0;

  const handleMergeReady = async () => {
    if (!report) return;
    const approved = window.confirm(
      `Merge ready identities?\n\nPlayers ready: ${readyPlayers}\nGuilds ready: ${readyGuilds}\nRaw scans will not be changed.`,
    );
    if (!approved) return;
    await mergeReadyFusionIdentityItems(report);
    clearReport();
    setView("dashboard");
    await refreshDashboard();
  };

  const handleIdentityChanged = async () => {
    clearReport();
    setView("dashboard");
    await refreshDashboard();
  };

  const openReportEntry = (
    entry: FusionIdentityAnalysisCacheLookup["previousEntry"],
  ) => {
    if (!openCachedReport(entry)) return;
    setView("workspace");
  };

  const runScopeAnalysis = async (
    scopeModel: FusionIdentityDashboardScopeModel,
  ) => {
    const nextReport = await analyzeScope(scopeModel);
    if (nextReport) setView("workspace");
  };

  const renderDashboard = () => {
    if (dashboard.loading && !dashboard.inventory) {
      return (
        <div className={styles.dashboard}>
          <div className={styles.dashboardHeader}>
            <div>
              <h2>Fusion dashboard</h2>
              <p>
                Fast scan inventory first. Full identity resolution runs only
                when you start a concrete fusion scope.
              </p>
            </div>
            <button
              type="button"
              className={styles.infoButton}
              onClick={() => setEvidenceInfoOpen(true)}
            >
              <Info size={16} aria-hidden /> Evidence guide
            </button>
          </div>

          <DataHubLoadingState
            title="Preparing Fusion Dashboard"
            message={inventoryProgress?.message ?? "Reading local scan metadata"}
            current={inventoryProgress?.current}
            total={inventoryProgress?.total}
          />
        </div>
      );
    }

    if (dashboard.error) {
      return (
        <DataHubLoadingState
          title="Could not prepare fusion dashboard."
          message="Local scan inventory could not be read."
          error={dashboard.error}
          onRetry={refreshDashboard}
        />
      );
    }

    if (!dashboard.inventory?.scanCount) {
      return (
        <div className={styles.emptyState}>
          No scan data available. Import local scans first to build Fusion &
          Identity coverage.
        </div>
      );
    }

    if (!locallyMatchableScopes.length) {
      return (
        <div className={styles.emptyState}>
          No locally matchable fusion scope detected for the available scans.
        </div>
      );
    }

    const model = selectedDashboardScope ?? locallyMatchableScopes[0];
    const scope = model.inventory.scope;
    const previousEntry = model.cache.previousEntry;
    const openableEntry = getOpenableFusionWorkspaceEntry(model);
    const running = model.cacheState === "running";
    const analyzedAt = previousEntry?.analyzedAt
      ? Date.parse(previousEntry.analyzedAt)
      : null;
    const analyzeLabel = !scope.analysisSupported
      ? "Analysis not enabled yet"
      : !model.inventory.isLocallyMatchable
        ? "Not locally matchable"
      : !hasFusionAnalysisInputData(model)
        ? "No current data"
      : model.cacheState === "fresh"
        ? "Analysis up to date"
      : isCacheStaleDueToNewScan(model.cache)
        ? "Analyze new data"
        : isCacheStaleDueToCompatibility(model.cache)
          ? "Re-analyze"
          : `Analyze ${scope.targetServerCode}`;

    return (
      <div className={styles.dashboard}>
        <div className={styles.dashboardHeader}>
          <div>
            <h2>Fusion dashboard</h2>
            <p>
              Fast scan inventory first. Full identity resolution runs only when
              you start a concrete fusion scope.
            </p>
          </div>
          <button
            type="button"
            className={styles.infoButton}
            onClick={() => setEvidenceInfoOpen(true)}
          >
            <Info size={16} aria-hidden /> Evidence guide
          </button>
        </div>

        <div className={styles.dashboardNav}>
          <button
            type="button"
            className={styles.tabButton}
          >
            All Matches
          </button>
          {locallyMatchableScopes.map((entry) => (
            <button
              key={entry.inventory.scope.id}
              type="button"
              className={`${styles.tabButton} ${
                entry.inventory.scope.id === scope.id
                  ? styles.tabButtonActive
                  : ""
              }`}
              onClick={() =>
                setSelectedDashboardScopeId(entry.inventory.scope.id)
              }
            >
              {entry.inventory.scope.targetServerCode}
            </button>
          ))}
        </div>

        <div className={styles.dashboardGrid}>
          <section className={styles.dashboardCard}>
            <div className={styles.scopeTitleRow}>
              <div>
                <h3>{scope.targetServerCode}</h3>
                <p>
                  {scope.directOriginServerCodes.join(", ")} -&gt;{" "}
                  {scope.targetServerCode}
                </p>
              </div>
              <div className={styles.statusCluster}>
                <span className={`${styles.statusBadge} ${styles.statusNative}`}>
                  {scopeTemporalLabel(scope)}
                </span>
                {!scope.analysisSupported ? (
                  <span className={`${styles.statusBadge} ${styles.statusAmbiguous}`}>
                    Inventory only
                  </span>
                ) : null}
                <span
                  className={`${styles.statusBadge} ${cacheStatusClassName(
                    model.cacheState,
                  )}`}
                >
                  {cacheStatusLabel(model.cacheState, model.cache)}
                </span>
              </div>
            </div>

            {model.error ? (
              <div className={styles.errorState}>{model.error}</div>
            ) : null}

            {running ? (
              <DataHubLoadingState
                title={t("fusionIdentity.loading.title", {
                  targetServerCode: scope.targetServerCode,
                })}
                message={t(getFusionIdentityProgressMessageKey(progress?.phase))}
                current={progress?.current}
                total={progress?.total}
              />
            ) : null}

            <div className={styles.dashboardFacts}>
              <div>
                <span>Relevant scans</span>
                <strong>{formatNumber(model.inventory.relevantSnapshotIds.length)}</strong>
              </div>
              <div>
                <span>Newest relevant scan</span>
                <strong>{formatDate(model.inventory.newestRelevantScanTimestamp)}</strong>
              </div>
              <div>
                <span>Current players</span>
                <strong>{formatNumber(model.identityState.openCurrentPlayers)}</strong>
              </div>
              <div>
                <span>Current guilds</span>
                <strong>{formatNumber(model.identityState.openCurrentGuilds)}</strong>
              </div>
            </div>

            {previousEntry && scope.analysisSupported ? (
              <div className={styles.analysisBlock}>
                <div className={styles.metaLine}>
                  Last analyzed: {formatDate(analyzedAt)} · cache{" "}
                  {model.cacheState === "fresh" ? "fresh" : "previous"}
                  {model.cache.staleReason
                    ? ` · refresh reason: ${model.cache.staleReason}`
                    : ""}
                </div>
                <DashboardResolutionSummary
                  report={previousEntry.report}
                  previous={model.cacheState === "stale"}
                />
              </div>
            ) : (
              <div className={styles.emptyState}>
                {scope.analysisSupported
                  ? `${scope.targetServerCode} has not been analyzed yet.`
                  : `${scope.targetServerCode} is available for inventory coverage only.`}
              </div>
            )}

            <div className={styles.actionBar}>
              {openableEntry ? (
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={() => openReportEntry(openableEntry)}
                >
                  Open matches
                </button>
              ) : null}
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => void runScopeAnalysis(model)}
                disabled={!canClickAnalyzeFusionScope(model, Boolean(runningScopeId))}
              >
                <Search size={15} aria-hidden /> {analyzeLabel}
              </button>
            </div>
          </section>

          <section className={styles.dashboardCard}>
            <div className={styles.scopeTitleRow}>
              <div>
                <h3>Scan Coverage</h3>
                <p>
                  {formatNumber(dashboard.inventory.allSnapshotCount)} logical
                  snapshots · inventory{" "}
                  {formatDuration(dashboard.inventory.durationMs)}
                </p>
              </div>
            </div>
            <ScanCoverageAccordion
              coverage={model.inventory.coverage}
              expandedServers={expandedCoverageServerSet}
              onToggle={toggleCoverageServer}
            />
          </section>
        </div>
      </div>
    );
  };

  const renderWorkspace = () => {
    if (!report) {
      return (
        <div className={styles.emptyState}>
          Select a cached analysis or run Analyze from the Fusion Dashboard.
        </div>
      );
    }
    if (!report.items.length)
      return (
        <div className={styles.emptyState}>
          No supported {report.scope.label} identity pool found locally.
        </div>
      );

    return (
      <>
        <div className={styles.toolbar}>
          <label className={styles.fieldLabel}>
            Search
            {selectedMemberTokens.length ? (
              <div
                className={styles.selectedMemberScope}
                aria-label={t(
                  "fusionIdentity.memberSelection.selectedMembers",
                )}
              >
                {selectionContext ? (
                  <span className={styles.selectedMemberContext}>
                    {t("fusionIdentity.memberSelection.contextReview", {
                      count: selectedMemberTokens.length,
                      guildName: selectionContext.guildName,
                    })}
                  </span>
                ) : null}
                <div className={styles.selectedMemberTokens}>
                  {selectedMemberTokens.map((member) => (
                    <button
                      key={member.identifier}
                      type="button"
                      className={styles.selectedMemberToken}
                      onClick={() => removeSelectedMember(member.identifier)}
                      title={member.identifier}
                      aria-label={t(
                        "fusionIdentity.memberSelection.removeMember",
                        { name: member.name },
                      )}
                    >
                      <span>{member.name}</span>
                      <X size={13} aria-hidden />
                    </button>
                  ))}
                  {selectedMemberTokens.length > 1 ? (
                    <button
                      type="button"
                      className={styles.clearSelectionButton}
                      onClick={clearSelectedMembers}
                    >
                      {t("fusionIdentity.memberSelection.clearSelection")}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            <span className={styles.searchWrap}>
              <Search className={styles.searchIcon} size={16} aria-hidden />
              <input
                className={styles.search}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name or identifier"
              />
            </span>
          </label>
          <div className={styles.actionBar}>
            <button
              type="button"
              className={styles.closeButton}
              onClick={() => {
                clearReport();
                setView("dashboard");
              }}
            >
              Fusion Dashboard
            </button>
            <button
              type="button"
              className={styles.closeButton}
              onClick={() => setManualOpen(true)}
              disabled={!report}
            >
              <Link2 size={15} aria-hidden /> Manual link
            </button>
            <button
              type="button"
              className={styles.closeButton}
              onClick={handleMergeReady}
              disabled={!report || (!readyPlayers && !readyGuilds)}
            >
              <Check size={15} aria-hidden /> Merge ready identities
            </button>
          </div>
        </div>

        <div className={styles.summaryHeader}>
          <div>
            <h2>Identity queue</h2>
            <p>
              {report.scope.targetServerCode} · {report.scope.label}
            </p>
          </div>
          <button
            type="button"
            className={styles.infoButton}
            onClick={() => setEvidenceInfoOpen(true)}
          >
            <Info size={16} aria-hidden /> Evidence guide
          </button>
        </div>
        <div className={styles.summaryGrid}>
          <SummaryItem label="Total identities" value={report.summary.total} />
          <SummaryItem label="Ready" value={report.summary.ready} />
          <SummaryItem label="Review" value={report.summary.review} />
          <SummaryItem label="Unresolved" value={report.summary.unresolved} />
          <SummaryItem
            label="No Historical Observation"
            value={report.summary.noHistoricalObservation}
          />
          <SummaryItem
            label="No Historical Data"
            value={report.summary.noHistory}
          />
          <SummaryItem label="Completed" value={report.summary.completed} />
        </div>

        <div className={styles.filters}>
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`${styles.filterButton} ${statusFilter === filter.key ? styles.filterButtonActive : ""}`}
              onClick={() => applyFilterSelection(typeFilter, filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className={styles.filters}>
          {TYPE_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`${styles.filterButton} ${typeFilter === filter.key ? styles.filterButtonActive : ""}`}
              onClick={() => applyFilterSelection(filter.key, statusFilter)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className={styles.metaLine}>
          {report.scope.label} · scans: {report.scope.historicalSnapshotCount}{" "}
          historical, {report.scope.postFusionSnapshotCount}{" "}
          {report.scope.targetServerCode} · history:{" "}
          {formatDate(report.scope.firstHistoricalTimestamp)} -{" "}
          {formatDate(report.scope.lastHistoricalTimestamp)} · showing{" "}
          {visibleItems.length} of {report.items.length}
          {timings.find((timing) => timing.phase === "total")
            ? ` · worker: ${formatDuration(timings.find((timing) => timing.phase === "total")?.durationMs ?? 0)}`
            : ""}
        </div>

        {groupedItems.guilds.length ? (
          <section className={styles.queueGroup}>
            <h2>Guilds</h2>
            <div className={styles.resultList}>
              {groupedItems.guilds.map((item) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  onOpen={() => setSelectedId(item.id)}
                  onFocusMembersByStatus={focusGuildMembersByStatus}
                />
              ))}
            </div>
          </section>
        ) : null}

        {groupedItems.players.length ? (
          <section className={styles.queueGroup}>
            <h2>Players</h2>
            <div className={styles.resultList}>
              {groupedItems.players.map((item) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  onOpen={() => setSelectedId(item.id)}
                  onFocusMembersByStatus={focusGuildMembersByStatus}
                />
              ))}
            </div>
          </section>
        ) : null}

        {!visibleItems.length ? (
          <div className={styles.emptyState}>
            No identities match the current filters.
          </div>
        ) : null}
      </>
    );
  };

  return (
    <EvidencePopoverContext.Provider
      value={{
        activeId: activeEvidenceChipId,
        setActiveId: setActiveEvidenceChipId,
      }}
    >
      <section className={styles.page}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Fusion &amp; Identity</h1>
            <p className={styles.subtitle}>
              Local fusion dashboard and scoped identity resolution.
            </p>
          </div>
          <div className={styles.previewBadge}>
            Local · Links and exclusions are reversible. Raw scans stay
            unchanged.
          </div>
        </header>

        <section className={styles.panel}>
          {view === "workspace" ? renderWorkspace() : renderDashboard()}
        </section>

        {selectedItem ? (
          <IdentityDetails
            item={selectedItem}
            onClose={() => setSelectedId(null)}
            onChanged={handleIdentityChanged}
          />
        ) : null}
        {manualOpen && report ? (
          <ManualLinkDialog
            report={report}
            onClose={() => setManualOpen(false)}
            onChanged={handleIdentityChanged}
          />
        ) : null}
        {evidenceInfoOpen ? (
          <EvidenceInfoDialog onClose={() => setEvidenceInfoOpen(false)} />
        ) : null}
      </section>
    </EvidencePopoverContext.Provider>
  );
}
