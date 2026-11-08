import { profileClassLabel } from "../../lib/i18n/profilePresentation";
import { hubText, hubNumber, hubDate, hubPercent, hubMessage } from "../../lib/i18n/dataHubPresentation";
import { fusionAnalysisRefreshReason } from "../../lib/identities/fusionAnalysisNotice";
import { getFusionPredecessorCoverage, getFusionPredecessorCoverageRows, type FusionPredecessorCoverage } from "../../lib/identities/fusionPredecessorCoverage";
import { trackLocalEvent, useAnalyticsView } from "../../lib/analytics/localEvents";
import React from "react";
import { getFusionIdentityFastLoadOptions } from "../../lib/identities/fusionIdentityFastLoad";
import { listFusionIdentityAnalysisScopes } from "../../lib/identities/fusionIdentityScopes";
import { useLocation, useNavigate } from "react-router-dom";
import LocalTitleNavigation from "../../components/ui/shared/LocalTitleNavigation";
import { DATA_HUB, safeLocalReturn } from "../../lib/data-hub/routes";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Info, Link2, Search, Undo2, X } from "lucide-react";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";

import { DataHubLoadingState } from "../../components/ui/shared/DataHubLoadingState";
import { subscribeToSfDataHubLocalScanChanges } from "../../lib/guilds/localScanLibrary";
import {
  classifyFusionIdentityAnalysisCacheSnapshot,
  revalidateFusionIdentityAnalysisCache,
  loadFusionIdentityAnalysisCacheSnapshot,
  writeFusionIdentityAnalysisCache,
  type FusionIdentityAnalysisCacheLookup,
  type FusionIdentityAnalysisCacheState,
} from "../../lib/identities/fusionAnalysisCache";
import { getFusionIdentityAnalyzeActionState } from "../../lib/identities/fusionIdentityAnalyzeAction";
import {
  buildFusionIdentityScopeIdentityState,
  loadFusionIdentityScopeIdentityRevisionBasis,
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
  listReadyFusionIdentityMergeItems,
  listGuildFusionIdentityMergeItems,
  mergeReadyFusionIdentityItems,
  rejectFusionIdentityCandidate,
  unlinkFusionIdentityAlias,
  type FusionIdentityCandidate,
  type FusionIdentityEntityType,
  type FusionIdentityManagementItem,
  type FusionIdentityManagementReport,
  type FusionIdentityManagementReasonCode,
  type FusionIdentityManagementStatus,
  type FusionIdentityMergeProgress,
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
  FUSION_IDENTITY_REVISION_REFRESH_PROGRESS,
  canAutoRefreshFusionIdentityRevisionScope,
  createFusionIdentityAutoRefreshAttemptKey,
  usesFusionIdentityRevisionRefreshLoader,
} from "../../lib/identities/fusionIdentityRefreshStatus";
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
import FusionIdentityEntry from "./FusionIdentityEntry";

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
  { key: "all", get label() { return hubText("dataHubI18n.all"); } },
  { key: "ready", get label() { return hubText("dataHubI18n.ready"); } },
  { key: "review", get label() { return hubText("dataHubI18n.needsReview"); } },
  { key: "unresolved", get label() { return hubText("dataHubI18n.unresolved"); } },
  { key: "noHistoricalObservation", get label() { return hubText("dataHubI18n.noHistoricalObservation"); } },
  { key: "noHistory", get label() { return hubText("dataHubI18n.noHistoricalData"); } },
  { key: "completed", get label() { return hubText("dataHubI18n.completed"); } },
];

const TYPE_FILTERS: Array<{ key: TypeFilter; label: string }> = [
  { key: "all", get label() { return hubText("dataHubI18n.allTypes"); } },
  { key: "player", get label() { return hubText("dataHubI18n.players"); } },
  { key: "guild", get label() { return hubText("dataHubI18n.guilds"); } },
];

const normalizeSearch = (value: string) => value.trim().toLowerCase();
const numberFormatter = { format: (value: number) => hubNumber(value) };
const dateFormatter = { format: (value: Date | number) => hubDate(value, { dateStyle: "medium", timeStyle: "short" }) };
const formatNumber = (value: number) => numberFormatter.format(value);
const ignorePlayerGuildAction = () => {};
const formatShare = (value: number) => hubPercent(value);
const fallbackTranslate = (translate: (key: string) => string, key: string) => {
  const translated = translate(key);
  return translated === key ? "" : translated;
};
const formatClass = (classId: string | null | undefined) => {
  const key = String(classId ?? "").trim();
  if (!key) return hubText("dataHubI18n.classUnknown");
  return profileClassLabel(key);
};
const formatLevel = (level: number | null | undefined) =>
  level == null ? hubText("dataHubI18n.levelUnknown") : hubText("dataHubI18n.levelNumber", { v1: level });
const formatDate = (timestamp: number | null | undefined) =>
  timestamp
    ? dateFormatter.format(new Date(timestamp))
    : "-";

const statusLabel = (status: FusionIdentityManagementStatus) => {
  if (status === "noHistoricalObservation") return hubText("dataHubI18n.noHistoricalObservation");
  if (status === "noHistory") return hubText("dataHubI18n.noHistoricalData");
  if (status === "review") return hubText("dataHubI18n.needsReview");
  return STATUS_FILTERS.find(filter => filter.key === status)?.label ?? status;
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
  type === "player" ? hubText("dataHubI18n.player") : hubText("dataHubI18n.guild");

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
    : (item.currentServer ?? hubText("dataHubI18n.unknownScope"));

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
    const entityLabel = typeLabel(item.entityType);
    return {
      title: hubText("dataHubI18n.noMatchingHistoricalObservation"),
      body: lookup
        ? hubText("dataHubI18n.missingHistoricalObservationForName", { v1: entityLabel, v2: lookup.baseName, v3: scope, v4: scope, v5: scanCount })
        : hubText("dataHubI18n.missingHistoricalObservationInScope", { v1: scope, v2: scanCount }),
    };
  }

  if (item.status === "review") {
    if (
      hasReasonCode(item, "insufficient-guild-evidence") ||
      hasReasonCode(item, "insufficient-continuity")
    ) {
      return {
        title: hubText("dataHubI18n.notEnoughReliableHistoricalEvidenceForAutomaticMatching"),
        body: hubText("dataHubI18n.aLikelyHistoricalGuildWasFoundButTooFewMembersCouldBe"),
        action:
          hubText("dataHubI18n.ifYouRecognizeTheGuildConfirmTheIdentityManuallyBelow"),
      };
    }
    if (hasReasonCode(item, "insufficient-player-evidence")) {
      return {
        title: hubText("dataHubI18n.notEnoughReliablePlayerEvidenceForAutomaticMatching"),
        body: hubText("dataHubI18n.aLikelyHistoricalPlayerWasFoundButTheAvailableIdentityEvidenceIs"),
        action:
          hubText("dataHubI18n.ifYouRecognizeThePlayerConfirmTheIdentityManuallyBelow"),
      };
    }
    if (hasReasonCode(item, "multiple-relevant-candidates")) {
      return {
        title: hubText("dataHubI18n.multipleRelevantHistoricalIdentitiesRequireReview"),
        body:
          item.entityType === "guild"
            ? hubText("dataHubI18n.moreThanOneHistoricalGuildCandidateRemainsRelevantSoTheResolverIs")
            : hubText("dataHubI18n.moreThanOneHistoricalPlayerCandidateRemainsRelevantSoTheResolverIs"),
      };
    }
    if (hasReasonCode(item, "assignment-conflict")) {
      return {
        title: hubText("dataHubI18n.historicalIdentityIsContested"),
        body: hubText("dataHubI18n.thisHistoricalIdentityIsClaimedByMultipleCurrentIdentitiesAndNeedsA"),
      };
    }
  }

  if (item.status !== "unresolved" || item.candidates.length) return null;
  const reason = item.reasonCodes[0];
  if (reason === "level-regression")
    return {
      title: hubText("dataHubI18n.noViableCandidate"),
      body: hubText("dataHubI18n.noViableIdentityRemainedAfterReliableLevelContinuityChecks"),
    };
  if (reason === "semantic-contradictions")
    return {
      title: hubText("dataHubI18n.noViableCandidate"),
      body: hubText("dataHubI18n.noViableIdentityRemainedAfterSemanticConsistencyChecks"),
    };
  if (reason === "reserved-by-other-identity")
    return {
      title: hubText("dataHubI18n.reservedCandidate"),
      body: hubText("dataHubI18n.candidateIdentitiesWereReservedByOtherReadyAssignments"),
    };
  if (reason === "rejected-by-exclusion")
    return {
      title: hubText("dataHubI18n.noRemainingCandidate"),
      body: hubText("dataHubI18n.noRemainingCandidateAfterExclusions"),
    };
  if (reason === "no-actionable-candidate") {
    return {
      title: hubText("dataHubI18n.noActionableCandidate"),
      body:
        item.entityType === "guild"
          ? hubText("dataHubI18n.historicalGuildDataExistsButNoCandidateHasEnoughPositiveIdentityEvidence")
          : hubText("dataHubI18n.onlyWeakCompatibilityMatchesWereFoundNoCandidateCurrentlyHasEnoughIdentity"),
      action:
        hubText("dataHubI18n.useManualIdentityLinkIfYouCanIdentifyTheCorrectHistoricalAlias"),
    };
  }
  return {
    title: hubText("dataHubI18n.noReliableIdentityContinuity"),
    body:
      item.entityType === "guild"
        ? hubText("dataHubI18n.historicalGuildScansExistButNoReliableContinuityCouldBeEstablished")
        : hubText("dataHubI18n.historicalDataExistsButNoReliableIdentityContinuityCouldBeEstablished"),
  };
};

const formatDuration = (durationMs: number) => {
  if (durationMs < 1000) return hubNumber(Math.round(durationMs), { style: "unit", unit: "millisecond", unitDisplay: "short" });
  return hubNumber(durationMs / 1000, { style: "unit", unit: "second", unitDisplay: "short", minimumFractionDigits: 1, maximumFractionDigits: 1 });
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
    case "identity-refresh":
      return "fusionIdentity.loading.phases.identityRefresh";
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

type FusionIdentityDashboardRefreshReason =
  | "scan-inventory"
  | "identity-revision";

type FusionIdentityDashboardRefreshOptions = {
  reason?: FusionIdentityDashboardRefreshReason;
  scopeId?: string | null;
  targetServerCode?: string | null;
  autoAnalyzeIdentityRevision?: boolean;
};

type FusionIdentityAutoRefreshStaleReason = NonNullable<
  FusionIdentityAnalysisCacheLookup["staleReason"]
>;

const SCAN_INVENTORY_AUTO_REFRESH_STALE_REASONS =
  new Set<FusionIdentityAutoRefreshStaleReason>(["schema-version"]);
const IDENTITY_REVISION_AUTO_REFRESH_STALE_REASONS =
  new Set<FusionIdentityAutoRefreshStaleReason>([
    "identity-revision",
    "schema-version",
  ]);

type FusionIdentityAutoRefreshRequest = {
  id: string;
  scopeModel: FusionIdentityDashboardScopeModel;
  attemptKey: string;
};

const EMPTY_FUSION_ANALYSIS_CACHE_LOOKUP: FusionIdentityAnalysisCacheLookup = {
  state: "never-analyzed",
  freshEntry: null,
  previousEntry: null,
  staleReason: null,
};

const shouldEvaluateFusionScopeFreshness = (
  scopeInventory: FusionIdentityScopeInventory,
) =>
  scopeInventory.scope.analysisSupported &&
  scopeInventory.isLocallyMatchable &&
  Boolean(
    scopeInventory.currentPlayerIdentifiers.length ||
      scopeInventory.currentGuildIdentifiers.length,
  );

const createPendingFusionIdentityScopeIdentityState = (
  scopeInventory: FusionIdentityScopeInventory,
): FusionIdentityScopeIdentityState => ({
  identityRevision: "",
  openCurrentPlayers: scopeInventory.currentPlayerIdentifiers.length,
  openCurrentGuilds: scopeInventory.currentGuildIdentifiers.length,
});

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

const normalizeFusionIdentityDashboardRefreshOptions = (
  input?: FusionIdentityDashboardRefreshReason | FusionIdentityDashboardRefreshOptions,
): Required<Pick<FusionIdentityDashboardRefreshOptions, "reason" | "autoAnalyzeIdentityRevision">> &
  Omit<FusionIdentityDashboardRefreshOptions, "reason" | "autoAnalyzeIdentityRevision"> => {
  if (typeof input === "string") {
    return {
      reason: input,
      scopeId: null,
      targetServerCode: null,
      autoAnalyzeIdentityRevision: input === "identity-revision",
    };
  }
  const reason = input?.reason ?? "scan-inventory";
  return {
    reason,
    scopeId: input?.scopeId ?? null,
    targetServerCode: input?.targetServerCode ?? null,
    autoAnalyzeIdentityRevision:
      input?.autoAnalyzeIdentityRevision ?? reason === "identity-revision",
  };
};

const findFusionIdentityRevisionAutoRefreshScope = (
  scopes: readonly FusionIdentityDashboardScopeModel[],
  options: Pick<FusionIdentityDashboardRefreshOptions, "scopeId" | "targetServerCode"> & {
    staleReasons: ReadonlySet<FusionIdentityAutoRefreshStaleReason>;
  },
) => {
  const matchingScopes = scopes.filter(
    (scope) =>
      canAutoRefreshFusionIdentityRevisionScope(scope) &&
      typeof scope.cache.staleReason === "string" &&
      options.staleReasons.has(scope.cache.staleReason),
  );
  if (options.scopeId) {
    return matchingScopes.find((scope) => scope.inventory.scope.id === options.scopeId) ?? null;
  }
  if (options.targetServerCode) {
    return (
      matchingScopes.find(
        (scope) => scope.inventory.scope.targetServerCode === options.targetServerCode,
      ) ?? null
    );
  }
  return matchingScopes.length === 1 ? matchingScopes[0] : null;
};

const logFusionIdentityRefreshDiagnostic = (
  event: string,
  details: Record<string, unknown>,
) => {
  if (typeof import.meta !== "undefined" && !import.meta.env?.DEV) return;
  console.debug("[Fusion Identity]", event, details);
};

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
  const [autoRefreshRequest, setAutoRefreshRequest] =
    React.useState<FusionIdentityAutoRefreshRequest | null>(null);
  const inventoryRunRef =
    React.useRef<FusionDashboardInventoryWorkerRun | null>(null);
  const activeInventoryRequestIdRef = React.useRef<string | null>(null);
  const runRef = React.useRef<FusionIdentityWorkerRun | null>(null);
  const activeRequestIdRef = React.useRef<string | null>(null);
  const autoRefreshAttemptKeysRef = React.useRef<Set<string>>(new Set());
  const activeAutoRefreshAttemptKeyRef = React.useRef<string | null>(null);

  const refreshDashboard = React.useCallback(async (
    input?: FusionIdentityDashboardRefreshReason | FusionIdentityDashboardRefreshOptions,
  ) => {
    const refreshOptions = normalizeFusionIdentityDashboardRefreshOptions(input);
    const { reason } = refreshOptions;
    const isIdentityRevisionRefresh = reason === "identity-revision";
    inventoryRunRef.current?.cancel();
    setDashboard((current) => ({
      ...current,
      loading: true,
      error: null,
      scopes: isIdentityRevisionRefresh
        ? current.scopes.map((scope) =>
            usesFusionIdentityRevisionRefreshLoader(scope)
              ? { ...scope, cacheState: "running", error: null }
              : scope,
          )
        : current.scopes,
    }));
    if (isIdentityRevisionRefresh) {
      setProgress(FUSION_IDENTITY_REVISION_REFRESH_PROGRESS);
    }
    setInventoryProgress({
      phase: "indexeddb-scan-metadata-load",
      message: hubText("dataHubI18n.readingLocalScanInventory"),
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
        scopes: inventoryResult.inventory.scopes.map(
          normalizeFusionIdentityScopeInventory,
        ),
      };
      const nextTimings = [...inventoryResult.timings];
      const freshnessScopeCount = inventory.scopes.filter(
        shouldEvaluateFusionScopeFreshness,
      ).length;
      const identityRevisionBasis = freshnessScopeCount
        ? await (async () => {
            const startedAt = performance.now();
            const basis = await loadFusionIdentityScopeIdentityRevisionBasis();
            nextTimings.push({
              phase: "identity-revision-snapshot-load",
              durationMs: performance.now() - startedAt,
              count: 1,
            });
            return basis;
          })()
        : null;
      const cacheSnapshot = freshnessScopeCount
        ? await (async () => {
            const startedAt = performance.now();
            const snapshot = await loadFusionIdentityAnalysisCacheSnapshot();
            nextTimings.push({
              phase: "analysis-cache-snapshot-load",
              durationMs: performance.now() - startedAt,
              count: 1,
            });
            return snapshot;
          })()
        : null;
      const scopeEvaluationStartedAt = performance.now();
      const scopes = await Promise.all(
        inventory.scopes.map(async (scopeInventory) => {
          if (
            !shouldEvaluateFusionScopeFreshness(scopeInventory) ||
            !identityRevisionBasis ||
            !cacheSnapshot
          ) {
            return {
              inventory: scopeInventory,
              identityState: createPendingFusionIdentityScopeIdentityState(scopeInventory),
              cache: EMPTY_FUSION_ANALYSIS_CACHE_LOOKUP,
              cacheState: EMPTY_FUSION_ANALYSIS_CACHE_LOOKUP.state,
              error: null,
            } satisfies FusionIdentityDashboardScopeModel;
          }

          const identityState = await buildFusionIdentityScopeIdentityState(
            scopeInventory.scope,
            scopeInventory.currentPlayerIdentifiers,
            scopeInventory.currentGuildIdentifiers,
            { identityRevisionBasis },
          );
          const cache = await revalidateFusionIdentityAnalysisCache(classifyFusionIdentityAnalysisCacheSnapshot(cacheSnapshot, {
            scope: scopeInventory.scope,
            scanFingerprint: scopeInventory.scanFingerprint,
            identityRevision: identityState.identityRevision,
          }));
          return {
            inventory: scopeInventory,
            identityState,
            cache,
            cacheState: cache.state,
            error: null,
          } satisfies FusionIdentityDashboardScopeModel;
        }),
      );
      nextTimings.push({
        phase: "scope-cache-evaluation",
        durationMs: performance.now() - scopeEvaluationStartedAt,
        count: inventory.scopes.length,
      });
      if (activeInventoryRequestIdRef.current !== run.requestId) return;
      const autoRefreshStaleReasons =
        isIdentityRevisionRefresh && refreshOptions.autoAnalyzeIdentityRevision
          ? IDENTITY_REVISION_AUTO_REFRESH_STALE_REASONS
          : reason === "scan-inventory"
            ? SCAN_INVENTORY_AUTO_REFRESH_STALE_REASONS
            : null;
      const autoRefreshScope =
        autoRefreshStaleReasons
          ? findFusionIdentityRevisionAutoRefreshScope(scopes, {
              ...refreshOptions,
              staleReasons: autoRefreshStaleReasons,
            })
          : null;
      const autoRefreshAttemptKey = autoRefreshScope
        ? createFusionIdentityAutoRefreshAttemptKey(autoRefreshScope)
        : null;
      const shouldStartAutoRefresh =
        Boolean(autoRefreshScope && autoRefreshAttemptKey) &&
        !autoRefreshAttemptKeysRef.current.has(autoRefreshAttemptKey ?? "");
      const reactStateStartedAt = performance.now();
      setDashboard({ loading: false, error: null, inventory, scopes });
      if (autoRefreshScope && autoRefreshAttemptKey && shouldStartAutoRefresh) {
        autoRefreshAttemptKeysRef.current.add(autoRefreshAttemptKey);
        logFusionIdentityRefreshDiagnostic("identity-refresh-triggered", {
          scopeId: autoRefreshScope.inventory.scope.id,
          identityRevision: autoRefreshScope.identityState.identityRevision,
          reason: autoRefreshScope.cache.staleReason,
        });
        setAutoRefreshRequest({
          id: `${run.requestId}:${autoRefreshAttemptKey}`,
          scopeModel: autoRefreshScope,
          attemptKey: autoRefreshAttemptKey,
        });
      } else if (isIdentityRevisionRefresh) {
        setAutoRefreshRequest(null);
      }
      nextTimings.push({
        phase: "react-state-update",
        durationMs: performance.now() - reactStateStartedAt,
        maxBlockMs: performance.now() - reactStateStartedAt,
        count: 1,
      });
      setInventoryTimings(nextTimings);
      setInventoryProgress(null);
      if (isIdentityRevisionRefresh && !shouldStartAutoRefresh) setProgress(null);
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
            : hubText("dataHubI18n.fusionDashboardCouldNotBePrepared"),
      }));
      setInventoryProgress(null);
      if (isIdentityRevisionRefresh) setProgress(null);
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
      setProgress({ phase: "done", message: hubText("dataHubI18n.cachedFusionIdentityReport") });
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
    async (
      scopeModel: FusionIdentityDashboardScopeModel,
      options: { source?: "manual" | "identity-refresh" } = {},
    ) => {
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
            ? hubText("dataHubI18n.analysisNotEnabledForServer", { v1: scope.targetServerCode })
            : !scopeModel.inventory.hasHistoricalObservations
              ? hubText("dataHubI18n.noHistoricalServerLineage", { v1: scope.targetServerCode })
              : !scopeModel.inventory.hasCurrentTargetObservations
                ? `No current ${scope.targetServerCode} observations are available after this fusion.`
                : actionState.reason === "no-current-data"
                  ? hubText("dataHubI18n.noCurrentServerObservation", { v1: scope.targetServerCode })   : hubText("dataHubI18n.serverNotLocallyMatchable", { v1: scope.targetServerCode });
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
        message: hubText("dataHubI18n.startingServerWorker", { v1: scope.targetServerCode }),
      });
      setTimings([]);
      if (options.source === "identity-refresh") {
        logFusionIdentityRefreshDiagnostic("identity-refresh-worker-start", {
          scopeId: scope.id,
          identityRevision: scopeModel.identityState.identityRevision,
          reason: scopeModel.cache.staleReason,
        });
      }

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
        const revisionCheckStartedAt = performance.now();
        const latestIdentityRevisionBasis =
          await loadFusionIdentityScopeIdentityRevisionBasis();
        const latestIdentityState = await buildFusionIdentityScopeIdentityState(
          scope,
          scopeModel.inventory.currentPlayerIdentifiers,
          scopeModel.inventory.currentGuildIdentifiers,
          { identityRevisionBasis: latestIdentityRevisionBasis },
        );
        nextTimings.push({
          phase: "main:identity-revision-result-check",
          durationMs: performance.now() - revisionCheckStartedAt,
          count: 1,
        });
        if (
          latestIdentityState.identityRevision !==
          scopeModel.identityState.identityRevision
        ) {
          logFusionIdentityRefreshDiagnostic("identity-refresh-stale-result", {
            scopeId: scope.id,
            resultIdentityRevision: scopeModel.identityState.identityRevision,
            currentIdentityRevision: latestIdentityState.identityRevision,
          });
          await refreshDashboard({
            reason: "identity-revision",
            scopeId: scope.id,
            targetServerCode: scope.targetServerCode,
            autoAnalyzeIdentityRevision: true,
          });
          return null;
        }
        result.report.predecessorCoverage = getFusionPredecessorCoverage(scope, scopeModel.inventory.coverage);
        const cacheWriteStartedAt = performance.now();
        await writeFusionIdentityAnalysisCache({
          resolverVersion: result.resolverVersion,
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
        if (options.source !== "identity-refresh") trackLocalEvent("datahub/identity/analyze-success");
        setReport(result.report);
        setTimings(nextTimings);
        setProgress({ phase: "done", message: hubText("dataHubI18n.fusionIdentityReportReady") });
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
        if (options.source === "identity-refresh") {
          logFusionIdentityRefreshDiagnostic("identity-refresh-worker-complete", {
            scopeId: scope.id,
            identityRevision: scopeModel.identityState.identityRevision,
            reason: scopeModel.cache.staleReason,
          });
        }
        return result.report;
      } catch (loadError) {
        if (activeRequestIdRef.current !== run.requestId) return null;
        if (loadError instanceof FusionIdentityWorkerCancelledError) return null;
        const message =
          loadError instanceof Error
            ? loadError.message
            : hubText("dataHubI18n.fusionIdentityDataCouldNotBeLoaded");
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

  React.useEffect(() => {
    if (!autoRefreshRequest) return;
    if (activeAutoRefreshAttemptKeyRef.current === autoRefreshRequest.attemptKey)
      return;
    activeAutoRefreshAttemptKeyRef.current = autoRefreshRequest.attemptKey;
    let cancelled = false;
    void (async () => {
      await analyzeScope(autoRefreshRequest.scopeModel, {
        source: "identity-refresh",
      });
      if (cancelled) return;
      setAutoRefreshRequest((current) =>
        current?.id === autoRefreshRequest.id ? null : current,
      );
      if (activeAutoRefreshAttemptKeyRef.current === autoRefreshRequest.attemptKey) {
        activeAutoRefreshAttemptKeyRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [analyzeScope, autoRefreshRequest]);

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
  get rejected() { return hubText("dataHubI18n.rejected"); },
  get weak() { return hubText("dataHubI18n.weak"); },
  get plausible() { return hubText("dataHubI18n.plausible"); },
  get strong() { return hubText("dataHubI18n.strong"); },
  get anchored() { return hubText("dataHubI18n.anchored"); },
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
  get rejected() { return hubText("dataHubI18n.rejected"); },
  get weak() { return hubText("dataHubI18n.weak"); },
  get plausible() { return hubText("dataHubI18n.plausible"); },
  get strong() { return hubText("dataHubI18n.strong"); },
  get anchored() { return hubText("dataHubI18n.anchored"); },
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
  get "origin-compatibility"() { return hubText("dataHubI18n.originCompatibility"); },
  get "class-compatibility"() { return hubText("dataHubI18n.classCompatibility"); },
  get "level-monotonicity"() { return hubText("dataHubI18n.levelMonotonicity"); },
  get "level-progression"() { return hubText("dataHubI18n.levelProgression"); },
  get "base-monotonicity"() { return hubText("fusionIdentity.evidenceHelp.player.baseMonotonicity.title"); },
  get "base-unchanged-stats"() { return hubText("dataHubI18n.unchangedBaseStats"); },
  get "base-secondary-stability"() { return hubText("dataHubI18n.secondaryBaseStability"); },
  get "base-ordering"() { return hubText("fusionIdentity.evidenceHelp.player.baseOrdering.title"); },
  get "fortress-continuity"() { return hubText("dataHubI18n.fortressContinuity"); },
  get "pet-continuity"() { return hubText("dataHubI18n.petContinuity"); },
  get "portrait-continuity"() { return hubText("dataHubI18n.portraitContinuity"); },
  get "guild-continuity"() { return hubText("dataHubI18n.guildContinuity"); },
  get "exact-name"() { return hubText("dataHubI18n.exactName"); },
  get "fusion-base-name"() { return hubText("dataHubI18n.fusionBaseName"); },
  get assignment() { return hubText("dataHubI18n.assignment"); },
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
    ? fallbackTranslate(t, help.definition.titleKey) || hubMessage(help.fallbackTitle)
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
              <div className={styles.evidencePopoverTitle}>{hubMessage(title)}</div>
              {rankTitle ? (
                <div className={styles.evidencePopoverRank}>
                  {help.kind === "classification" ? hubText("dataHubI18n.classification") : hubText("dataHubI18n.rank")}:{" "}
                  {rankTitle}
                </div>
              ) : null}
              {description ? (
                <p>{description}</p>
              ) : (
                <p>
                  {help.fallbackDescription ??
                    hubText("dataHubI18n.thisChipUsesContextualResolverEvidenceReviewItTogetherWithTheOther")}
                </p>
              )}
              {effect ? (
                <p>
                  <strong>{hubText("dataHubI18n.effect")}</strong> {effect}
                </p>
              ) : null}
              {caution ? (
                <p>
                  <strong>{hubText("dataHubI18n.important")}</strong> {caution}
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
    label: candidate.rejected ? hubText("dataHubI18n.rejected") : hubText("dataHubI18n.unclassifiedCandidate"),
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
      : (typedLabel ?? hubText("dataHubI18n.evidence"));

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
      hubText("dataHubI18n.originCompatible"),
      hubText("dataHubI18n.originContradiction"),
      "hardContradiction",
    ),
    legacyBooleanEvidenceEntry(
      "class-compatibility",
      evidence.sameClass,
      hubText("dataHubI18n.classCompatible"),
      hubText("dataHubI18n.classContradiction"),
      "hardContradiction",
    ),
    legacyBooleanEvidenceEntry(
      "level-monotonicity",
      evidence.levelConsistent,
      hubText("dataHubI18n.levelNonDecreasing"),
      hubText("dataHubI18n.levelRegression"),
      "hardContradiction",
    ),
    legacyBooleanEvidenceEntry(
      "base-monotonicity",
      evidence.baseAttributesConsistent,
      hubText("dataHubI18n.baseStatsNonDecreasing"),
      hubText("dataHubI18n.baseStatRegression86335"),
      "hardContradiction",
    ),
    legacyBooleanEvidenceEntry(
      "fortress-continuity",
      evidence.fortressContinuity,
      hubText("dataHubI18n.fortressContinuity"),
      hubText("dataHubI18n.fortressDiffers"),
      "neutral",
      "strongSupport",
    ),
    legacyBooleanEvidenceEntry(
      "pet-continuity",
      evidence.petContinuity,
      hubText("dataHubI18n.petContinuity"),
      hubText("dataHubI18n.petsDiffer"),
      "neutral",
      "weakSupport",
    ),
    legacyBooleanEvidenceEntry(
      "guild-continuity",
      evidence.sameGuild,
      hubText("dataHubI18n.guildContinuity"),
      hubText("dataHubI18n.guildDiffers"),
      "neutral",
      "support",
    ),
  ];

  if (evidence.levelProgression?.category === "normal") {
    entries.push({
      type: "level-progression",
      strength: "support",
      label: hubText("dataHubI18n.normalLevelProgression"),
    });
  } else if (evidence.levelProgression?.category === "plausible-burst") {
    entries.push({
      type: "level-progression",
      strength: "weakSupport",
      label: hubText("dataHubI18n.plausibleLevelBurst"),
    });
  } else if (evidence.levelProgression?.category === "extreme-contradiction") {
    entries.push({
      type: "level-progression",
      strength: "strongContradiction",
      label: hubText("dataHubI18n.unusuallyHighLevelProgression"),
    });
  }
  if (
    evidence.baseFingerprint?.unchangedCount != null &&
    evidence.baseFingerprint.unchangedCount >= 3
  ) {
    entries.push({
      type: "base-unchanged-stats",
      strength: "strongSupport",
      label: hubText("dataHubI18n.3UnchangedBaseStats"),
    });
  }
  if (
    evidence.baseFingerprint?.unchangedSecondaryCount != null &&
    evidence.baseFingerprint.unchangedSecondaryCount >= 2
  ) {
    entries.push({
      type: "base-secondary-stability",
      strength: "strongSupport",
      label: hubText("dataHubI18n.2UnchangedSecondaryBaseStats"),
    });
  }
  if (evidence.baseFingerprint?.orderingStable === true) {
    entries.push({
      type: "base-ordering",
      strength: "support",
      label: hubText("dataHubI18n.baseStatOrderingStable"),
    });
  }
  if (evidence.exactName)
    entries.push({
      type: "exact-name",
      strength: "identityAnchor",
      label: hubText("dataHubI18n.exactName"),
    });
  if (evidence.fusionBaseName)
    entries.push({
      type: "fusion-base-name",
      strength: "identityAnchor",
      label: hubText("dataHubI18n.fusionBaseName"),
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
      : hubText("dataHubI18n.guildEvidence");
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
  return { label: hubText("dataHubI18n.unclassifiedCandidate"), strength: "neutral" as const };
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
          label: hubText("dataHubI18n.exactGuildName"),
        }
      : null,
    candidate.sameCoA
      ? { type: "same-coa", strength: "support" as const, label: hubText("dataHubI18n.sameCoa") }
      : null,
    candidate.mutualDominant
      ? {
          type: "member-flow",
          strength: "strongSupport" as const,
          label: hubText("dataHubI18n.mutualDominantFlow"),
        }
      : null,
    candidate.matchedMemberCount > 0
      ? {
          type: "member-flow-count",
          strength: "support" as const,
          label: hubText("dataHubI18n.matchedPlayerCount", { v1: candidate.matchedMemberCount }),
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
  id: `evidence-${entityType}-${type}-${strength}`,
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
  fallbackTitle: getPlayerRejectReasonHelp(reason) ? hubText(getPlayerRejectReasonHelp(reason)!.titleKey) : hubMessage(reason),
});

const readyQueueChipHelp = (): EvidenceChipHelp => ({
  id: "queue-ready-candidate",
  kind: "classification",
  definition: getClassificationHelp("anchored"),
  fallbackTitle: hubText("dataHubI18n.readyQueueCandidate"),
  fallbackDescription:
    hubText("dataHubI18n.thisCandidateIsTheSelectedAutomaticLinkingOptionForTheCurrentIdentity"),
});

const guildReadyCandidateHelp = (): EvidenceChipHelp => ({
  id: "guild-ready-candidate",
  kind: "classification",
  definition: getClassificationHelp("anchored"),
  fallbackTitle: hubText("dataHubI18n.readyCandidate"),
  fallbackDescription:
    hubText("dataHubI18n.thisGuildCandidateCurrentlyHasEnoughConsistentEvidenceToBeEligibleFor"),
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
          key={`${entry.type}-${index}`}
          strength={entry.strength}
          help={evidenceChipHelp(
            "player",
            entry.type,
            entry.strength,
            entry.label,
          )}
        >
          {hubMessage(entry.label)}
        </EvidenceChip>
      ))}
      {candidate.rejectReasons.map((reason) => (
        <EvidenceChip
          key={reason}
          strength="hardContradiction"
          help={rejectReasonChipHelp(reason)}
        >
          {getPlayerRejectReasonHelp(reason) ? hubText(getPlayerRejectReasonHelp(reason)!.titleKey) : hubMessage(reason)}
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
          key={`${entry.type}-${index}`}
          strength={entry.strength}
          help={evidenceChipHelp(
            "guild",
            entry.type,
            entry.strength,
            entry.label,
          )}
        >
          {hubMessage(entry.label)}
        </EvidenceChip>
      ))}
      {candidate.autoEligible ? (
        <EvidenceChip
          strength="identityAnchor"
          help={guildReadyCandidateHelp()}
        >
          {hubText("dataHubI18n.readyCandidate")}
        </EvidenceChip>
      ) : null}
      {!candidate.autoEligible && candidate.assignmentConflict ? (
        <EvidenceChip
          strength="warning"
          help={evidenceChipHelp(
            "guild",
            "assignment",
            "warning",
            hubText("dataHubI18n.assignmentConflict"),
          )}
        >
          {hubText("dataHubI18n.assignmentConflict")}
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
              {hubText("dataHubI18n.matchingEvidence")}
            </h2>
            <div className={styles.muted}>
              {hubText("dataHubI18n.howFusionIdentityDecidesBetweenReadyReviewAndUnresolved")}
            </div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={hubText("dataHubI18n.closeEvidenceInfo")}
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className={`${styles.dialogBody} ${styles.infoBody}`}>
          <section className={styles.infoSection}>
            <h3>{hubText("dataHubI18n.howMatchingWorks")}</h3>
            <p>
              {hubText("dataHubI18n.theSystemComparesHistoricalIdentitiesFromEu1Eu4WithCurrentF28Identities")}
            </p>
            <p>
              {hubText("dataHubI18n.aSingleVisibleCandidateIsNotEnoughOnItsOwnAutomaticMatching")}
            </p>
          </section>

          <section className={styles.infoSection}>
            <h3>{hubText("dataHubI18n.evidenceStrengths")}</h3>
            <div className={styles.infoStrengthGrid}>
              <div>
                <strong>{hubText("dataHubI18n.weak")}</strong>
                <span>{hubText("dataHubI18n.compatibleButTooGenericOrTooThinToRelyOn")}</span>
              </div>
              <div>
                <strong>{hubText("dataHubI18n.plausible")}</strong>
                <span>
                  {hubText("dataHubI18n.aReasonableIdentityHypothesisThatUsuallyStillNeedsAHumanCheck")}
                </span>
              </div>
              <div>
                <strong>{hubText("dataHubI18n.strong")}</strong>
                <span>
                  {hubText("dataHubI18n.severalReliableSignalsPointToTheSameHistoricalIdentity")}
                </span>
              </div>
              <div>
                <strong>{hubText("dataHubI18n.anchored")}</strong>
                <span>
                  {hubText("dataHubI18n.aDirectIdentityAnchorExistsSuchAsARobustNameFusionSignal")}
                </span>
              </div>
            </div>
            <p>
              {hubText("dataHubI18n.theseLevelsAreOrdinalGuidanceNotPercentageConfidenceScores")}
            </p>
          </section>

          <section className={styles.infoSection}>
            <h3>{hubText("dataHubI18n.evidenceSignalRanks")}</h3>
            <p>
              {hubText("dataHubI18n.signalRanksDescribeHowHelpfulASingleChipIsInContextThey")}
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
            <h3>{hubText("dataHubI18n.typicalEvidenceSignals")}</h3>
            <ul className={styles.infoList}>
              <li>
                <strong>{hubText("dataHubI18n.exactName")}</strong> {hubText("dataHubI18n.meansTheCurrentAndHistoricalNamesMatchAfterNormalization")}
              </li>
              <li>
                <strong>{hubText("dataHubI18n.uniqueExactName")}</strong> {hubText("dataHubI18n.meansThatExactHistoricalNameAppearsAsAUniqueCandidateInThe")}
              </li>
              <li>
                <strong>{hubText("dataHubI18n.sameCoa")}</strong> {hubText("dataHubI18n.meansTheGuildCrestEvidenceStayedConsistent")}
              </li>
              <li>
                <strong>{hubText("dataHubI18n.mutualDominantMemberFlow")}</strong> {hubText("dataHubI18n.meansResolvedPlayersMostlyPointFromOneOldGuildIntoOneNew")}
              </li>
              <li>
                <strong>{hubText("dataHubI18n.reliableMemberMatches")}</strong> {hubText("dataHubI18n.countResolvedPlayerIdentitiesNotTheTotalGuildRoster")}
              </li>
              <li>
                <strong>{hubText("dataHubI18n.leaderContinuity")}</strong> {hubText("dataHubI18n.comparesResolvedLeaderIdentitiesWhenTheDataIsAvailable")}
              </li>
              <li>
                <strong>{hubText("dataHubI18n.structuralRename")}</strong> {hubText("dataHubI18n.coversStrongMemberFlowContinuityEvenWhenTheGuildNameChanged")}
              </li>
              <li>
                <strong>{hubText("dataHubI18n.warnings")}</strong> {hubText("dataHubI18n.suchAsUnavailableLeaderContinuityOrADifferentResolvedLeaderReduceCertainty")}
              </li>
            </ul>
          </section>

          <section className={styles.infoSection}>
            <h3>{hubText("dataHubI18n.playerEvidenceByRank")}</h3>
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
            <h3>{hubText("dataHubI18n.guildEvidenceByRank")}</h3>
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
            <h3>{hubText("dataHubI18n.whyReviewCanRemain")}</h3>
            <p>
              {hubText("dataHubI18n.chipsDescribeEvidenceThatExistsButTheyDoNotGuaranteeAutomaticLinking")}
            </p>
            <p>
              {hubText("dataHubI18n.forExample1MatchedPlayerDoesNotMeanTheGuildHad1")}
            </p>
          </section>

          <section className={styles.infoSection}>
            <h3>{hubText("dataHubI18n.finalStatuses")}</h3>
            <div className={styles.infoStatusList}>
              <div>
                <span className={`${styles.statusBadge} ${styles.statusHigh}`}>
                  {hubText("dataHubI18n.ready")}
                </span>
                <p>{hubText("dataHubI18n.enoughReliableEvidenceForAutomaticLinking")}</p>
              </div>
              <div>
                <span
                  className={`${styles.statusBadge} ${styles.statusAmbiguous}`}
                >
                  {hubText("dataHubI18n.needsReview")}
                </span>
                <p>
                  {hubText("dataHubI18n.aUsefulCandidateExistsButEvidenceIsThinAmbiguousOrContested")}
                </p>
              </div>
              <div>
                <span
                  className={`${styles.statusBadge} ${styles.statusUnresolved}`}
                >
                  {hubText("dataHubI18n.unresolved")}
                </span>
                <p>
                  {hubText("dataHubI18n.historicalDataExistsButNoActionableIdentityHypothesisRemains")}
                </p>
              </div>
              <div>
                <span
                  className={`${styles.statusBadge} ${styles.statusNative}`}
                >
                  {hubText("dataHubI18n.noHistoricalObservation")}
                </span>
                <p>
                  {hubText("dataHubI18n.theExpectedHistoricalScopeWasCheckedButNoMatchingObservationWasFound")}
                </p>
              </div>
              <div>
                <span
                  className={`${styles.statusBadge} ${styles.statusNative}`}
                >
                  {hubText("dataHubI18n.noHistoricalData")}
                </span>
                <p>{hubText("dataHubI18n.theRequiredHistoricalScanCoverageIsNotAvailable")}</p>
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
        <strong>{hubText("dataHubI18n.reliableMemberMatchesa1688")}</strong>{" "}
        {formatNumber(candidate.matchedMemberCount)}
      </div>
      <div>
        <strong>{hubText("dataHubI18n.resolvedMemberFlow")}</strong>{" "}
        {formatNumber(candidate.matchedMemberCount)} /{" "}
        {formatNumber(oldResolvedCount)} {hubText("dataHubI18n.resolvedHistoricalPlayersMatched")}
        {formatShare(candidate.oldShare)} {hubText("dataHubI18n.ofResolvedPlayers")}{" "}
        {formatNumber(candidate.matchedMemberCount)} /{" "}
        {formatNumber(newResolvedCount)} {hubText("dataHubI18n.resolvedCurrentPlayersMatched")}
        {formatShare(candidate.newShare)} {hubText("dataHubI18n.ofResolvedPlayers60546")}
      </div>
      {historicalMembers && currentMembers ? (
        <div>
          <strong>{hubText("dataHubI18n.resolvedIdentityCoverage")}</strong> {hubText("dataHubI18n.historical")}{" "}
          {formatNumber(oldResolvedCount)} / {historicalMembers} {hubText("dataHubI18n.membersCurrent")} {formatNumber(newResolvedCount)} / {currentMembers} {hubText("dataHubI18n.members17373")}
        </div>
      ) : (
        <div>
          <strong>{hubText("dataHubI18n.rosterCoverageUnavailable")}</strong> {hubText("dataHubI18n.reliableIdentitiesAvailableHistorical")} {formatNumber(oldResolvedCount)} {hubText("dataHubI18n.current9e606")}{" "}
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
            {candidate.historicalServer ?? hubText("dataHubI18n.serverUnknown")}
          </div>
        </div>
        <div className={styles.rowActions}>
          <button
            type="button"
            className={`${styles.closeButton} ${highlightConfirm ? styles.confirmButton : ""}`}
            onClick={() => onConfirm(candidate)}
            disabled={disabled}
          >
            <Check size={15} aria-hidden /> {hubText("dataHubI18n.confirmIdentity")}
          </button>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => onReject(candidate)}
            disabled={candidate.rejected}
          >
            <X size={15} aria-hidden /> {hubText("dataHubI18n.reject")}
          </button>
        </div>
      </div>
      {candidate.assignedToOtherIdentity ? (
        <p className={styles.muted}>{hubText("dataHubI18n.alreadyLinkedToAnotherIdentity")}</p>
      ) : null}
      {candidate.rejected ? (
        <p className={styles.muted}>{hubText("dataHubI18n.rejectedForThisCurrentIdentity")}</p>
      ) : null}
      {candidate.entityType === "player" ? (
        <>
          <div className={styles.muted}>
            {formatClass(candidate.evidence.oldClassId)} ·{" "}
            {formatLevel(candidate.evidence.oldLevel)} ·{" "}
            {candidate.evidence.oldGuildName ??
              candidate.evidence.oldGuildIdentifier ??
              hubText("dataHubI18n.guildUnknown")}
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
            {hubText("dataHubI18n.readyQueueCandidate")}
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
        {edge.oldGuildIdentifier} · {edge.oldServer ?? hubText("dataHubI18n.serverUnknown")} ·{" "}
        {hubText("dataHubI18n.matchedPlayerQuantity", { count: edge.matchedMemberCount })}
      </div>
      <div className={styles.muted}>
        {hubText("dataHubI18n.flowShare")} {formatShare(edge.oldShare)} {hubText("dataHubI18n.fromOld")}{" "}
        {formatShare(edge.newShare)} {hubText("dataHubI18n.intoNew")}
      </div>
    </article>
  );
}

function IdentityDetails({
  item, dependencies,
  onClose,
  onChanged,
}: {
  item: FusionIdentityManagementItem;
  dependencies?: FusionIdentityManagementReport["dependencies"];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const mutationLock = React.useRef(false);
  const [mutationError, setMutationError] = React.useState<string | null>(null);
  const route = window.location.hash;
  const handleConfirm = async (candidate: FusionIdentityCandidate) => {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setMutationError(null);
    try {
      if (!dependencies) throw Error("fresh-matching-report-required");
      await confirmFusionIdentityLink(item.entityType, item.currentIdentifier, candidate.historicalIdentifier,
        { dependencies, isCurrent: () => window.location.hash === route });
      trackLocalEvent("datahub/identity/link-success");
      await onChanged();
      onClose();
    } catch (error) { setMutationError(error instanceof Error ? error.message : String(error)); }
    finally { mutationLock.current = false; }
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
      ? hubText("dataHubI18n.historicalObservation")
      : item.status === "ready"
        ? item.entityType === "guild"
          ? hubText("dataHubI18n.matchedHistoricalGuild")
          : hubText("dataHubI18n.matchedHistoricalIdentity")
        : item.status === "review"
          ? hubText("dataHubI18n.possibleHistoricalIdentities")
          : hubText("dataHubI18n.historicalIdentityCandidates");
  const currentObservation = latestObservation(item.observations);
  const firstObservation = earliestObservation(item.observations);
  const currentIdentityRows: Array<[string, React.ReactNode]> = [
    [hubText("dataHubI18n.type"), typeLabel(item.entityType)],
    [hubText("dataHubI18n.name"), item.currentName ?? "-"],
    [hubText("dataHubI18n.identifier"), item.currentIdentifier],
    [hubText("dataHubI18n.server"), item.currentServer ?? "-"],
  ];

  if (item.entityType === "player") {
    currentIdentityRows.push(
      [
        hubText("dataHubI18n.class"),
        currentObservation?.classId
          ? formatClass(currentObservation.classId)
          : null,
      ],
      [hubText("dataHubI18n.level"), formatCurrentLevel(currentObservation?.level)],
      [hubText("dataHubI18n.guild"), currentObservation?.guildName?.trim() || null],
    );
  }

  currentIdentityRows.push(
    [hubText("dataHubI18n.observed64fa8"), item.observations.length],
    [hubText("dataHubI18n.lastSeen"), formatDate(item.lastSeen)],
  );
  const statusRows: Array<[string, React.ReactNode]> = [
    [hubText("dataHubI18n.status"), statusLabel(item.status)],
    [hubText("dataHubI18n.firstSeen"), formatDate(firstObservation?.timestamp ?? item.firstSeen)],
  ];

  if (item.entityType === "player") {
    statusRows.push(
      [hubText("dataHubI18n.firstSeenLevel"), formatCurrentLevel(firstObservation?.level)],
      [hubText("dataHubI18n.firstSeenGuild"), firstObservation?.guildName?.trim() || null],
    );
  }

  statusRows.push(
    [hubText("dataHubI18n.candidate"), item.readyCandidateIdentifier ?? "-"],
    [hubText("dataHubI18n.reason"), item.reasons.map(hubMessage).join("; ") || "-"],
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
            aria-label={hubText("dataHubI18n.closeDetails")}
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className={styles.dialogBody}>
          {mutationError ? <p role="alert" className={styles.errorState}>{t(`fusionIdentity.merge.reasons.${mutationError}`, { defaultValue: mutationError })}</p> : null}
          <div className={styles.detailGrid}>
            <section className={styles.detailCard}>
              <h3>{hubText("dataHubI18n.currentIdentity")}</h3>
              <DetailDataList rows={currentIdentityRows} />
            </section>
            <section className={styles.detailCard}>
              <h3>{hubText("dataHubI18n.status")}</h3>
              <DetailDataList rows={statusRows} />
            </section>
            <section className={styles.detailCard}>
              <h3>{hubText("dataHubI18n.completedLinks")}</h3>
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
                        <Undo2 size={15} aria-hidden /> {hubText("dataHubI18n.undo")}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.muted}>{hubText("dataHubI18n.noConfirmedAliasesYet")}</p>
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
                {hubText("dataHubI18n.noResolverCandidateIsCurrentlyAvailable")}
              </p>
            )}
          </section>

          {item.entityType === "guild" && item.memberMigrationEdges.length ? (
            <section className={styles.detailCard}>
              <h3>{hubText("dataHubI18n.otherMemberSources")}</h3>
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
  const { t } = useTranslation();
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

  const mutationLock = React.useRef(false);
  const [mutationError, setMutationError] = React.useState<string | null>(null);
  const handleSubmit = async () => {
    if (mutationLock.current) return;
    mutationLock.current = true;
    const route = window.location.hash;
    setMutationError(null);
    try {
      if (!report.dependencies) throw Error("fresh-matching-report-required");
      await confirmFusionIdentityLink(entityType, currentIdentifier, historicalIdentifier,
        { dependencies: report.dependencies, isCurrent: () => window.location.hash === route });
      trackLocalEvent("datahub/identity/link-success");
      await onChanged();
      onClose();
    } catch (error) { setMutationError(error instanceof Error ? error.message : String(error)); }
    finally { mutationLock.current = false; }
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
              {hubText("dataHubI18n.manualIdentityLink")}
            </h2>
            <div className={styles.muted}>
              {hubText("dataHubI18n.resolverIndependentLinkAcrossTheWholeFusionPool")}
            </div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={hubText("dataHubI18n.closeManualLink")}
          >
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className={styles.dialogBody}>
          {mutationError ? <p role="alert" className={styles.errorState}>{t(`fusionIdentity.merge.reasons.${mutationError}`, { defaultValue: mutationError })}</p> : null}
          <div className={styles.detailGrid}>
            <label className={styles.fieldLabel}>
              {hubText("dataHubI18n.type")}
              <select
                className={styles.select}
                value={entityType}
                onChange={(event) =>
                  setEntityType(event.target.value as FusionIdentityEntityType)
                }
              >
                <option value="player">{hubText("dataHubI18n.players")}</option>
                <option value="guild">{hubText("dataHubI18n.guilds")}</option>
              </select>
            </label>
            <label className={styles.fieldLabel}>
              {hubText("dataHubI18n.currentF28Alias")}
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
              {hubText("dataHubI18n.historicalAlias")}
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
                    {option.linkedEntityId ? hubText("dataHubI18n.alreadyLinked") : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {alreadyLinked ? (
            <div className={styles.errorState}>
              {hubText("dataHubI18n.alreadyLinkedThisHistoricalAliasIsPartOfAnExistingIdentity")}
            </div>
          ) : null}
          <div className={styles.rowActions}>
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
            >
              {hubText("dataHubI18n.cancel")}
            </button>
            <button
              type="button"
              className={styles.closeButton}
              onClick={handleSubmit}
              disabled={
                !currentIdentifier || !historicalIdentifier || alreadyLinked
              }
            >
              <Link2 size={15} aria-hidden /> {hubText("dataHubI18n.linkIdentity")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GuildMemberStatusSummary({
  item,
}: {
  item: FusionIdentityManagementItem;
}) {
  const { t } = useTranslation();
  const summary = item.memberStatusSummary;
  if (item.entityType !== "guild" || !summary) return null;
  const totalMembers = summary.totalMembers ?? 0;
  const reviewMembers = summary.reviewMembers ?? 0;
  const unresolvedMembers = summary.unresolvedMembers ?? 0;
  const noHistoricalObservationMembers =
    summary.noHistoricalObservationMembers ?? 0;
  const noHistoricalDataMembers = summary.noHistoricalDataMembers ?? 0;
  const missingManagementEntries = summary.missingManagementEntries ?? 0;

  const problemParts: string[] = [
    reviewMembers
      ? t("fusionIdentity.memberSelection.reviewCount", {
          count: reviewMembers,
        })
      : null,
    unresolvedMembers
      ? hubText("dataHubI18n.unresolvedCount", { v1: unresolvedMembers })
      : null,
    noHistoricalObservationMembers
      ? hubText("dataHubI18n.noObservationCount", { v1: noHistoricalObservationMembers })
      : null,
    noHistoricalDataMembers
      ? hubText("dataHubI18n.noHistoryCount", { v1: noHistoricalDataMembers })
      : null,
    missingManagementEntries
      ? hubText("dataHubI18n.missingCount", { v1: missingManagementEntries })
      : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <span className={styles.guildMemberInlineSummary}>
      <span>
        {t("identityRosterBatch.memberCounts", { count: totalMembers, stored: summary.completedMembers ?? 0, ready: summary.readyMembers ?? 0, total: totalMembers })}
      </span>
      {problemParts.map((part, index) => (
        <React.Fragment key={index}>
          <span className={styles.guildMemberStatusSeparator}>·</span>
          <span>{part}</span>
        </React.Fragment>
      ))}
    </span>
  );
}

function GuildMemberRowActions({
  item,
  onFocusMembersByStatus,
  onCompleteReadyPlayers,
  completingGuildIdentifier,
}: {
  item: FusionIdentityManagementItem;
  onFocusMembersByStatus: (
    item: FusionIdentityManagementItem,
    status: FusionIdentityMemberSelectionStatus,
  ) => void;
  onCompleteReadyPlayers: (item: FusionIdentityManagementItem) => void;
  completingGuildIdentifier: string | null;
}) {
  const { t } = useTranslation();
  const summary = item.memberStatusSummary;
  if (item.entityType !== "guild" || !summary) return null;
  const guildName = item.currentName ?? item.currentIdentifier;
  const memberRefsByStatus = summary.memberRefsByStatus ?? {
    ready: [],
    review: [],
    unresolved: [],
    noHistoricalObservation: [],
    noHistory: [],
  };
  const reviewMembers = summary.reviewMembers ?? 0;
  const readyRefs = (item.mergeReadyPlayerIdentifiers ?? memberRefsByStatus.ready?.map(ref => ref.identifier) ?? []);
  const readyButtonDisabled =
    !readyRefs.length || completingGuildIdentifier !== null;

  if (!readyRefs.length && !memberRefsByStatus.review.length) return null;

  return (
    <div className={styles.guildMemberActionGroup}>
      {memberRefsByStatus.review.length ? (
        <button
          type="button"
          className={styles.guildMemberActionButton}
          onClick={(event) => {
            event.stopPropagation();
            onFocusMembersByStatus(item, "review");
          }}
          aria-label={t("fusionIdentity.memberSelection.showReviewMembers", {
            count: reviewMembers,
            guildName,
          })}
        >
          {hubText("dataHubI18n.review")}
        </button>
      ) : null}
      {readyRefs.length ? (
        <button
          type="button"
          className={styles.guildMemberActionButton}
          onClick={(event) => {
            event.stopPropagation();
            onCompleteReadyPlayers(item);
          }}
          disabled={readyButtonDisabled}
        >
          {t("fusionIdentity.merge.guildPlayers", { count: readyRefs.length })}
        </button>
      ) : null}
    </div>
  );
}

const QueueRow = React.memo(function QueueRow({
  item,
  onOpen,
  onFocusMembersByStatus,
  onCompleteReadyPlayers,
  completingGuildIdentifier,
}: {
  item: FusionIdentityManagementItem;
  onOpen: (itemId: string) => void;
  onFocusMembersByStatus: (
    item: FusionIdentityManagementItem,
    status: FusionIdentityMemberSelectionStatus,
  ) => void;
  onCompleteReadyPlayers: (item: FusionIdentityManagementItem) => void;
  completingGuildIdentifier: string | null;
}) {
  const { t } = useTranslation();
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen(item.id);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={styles.resultRow}
      onClick={() => onOpen(item.id)}
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
            <GuildMemberStatusSummary item={item} />
          </div>
          <div className={styles.muted}>{item.currentIdentifier}</div>
        </div>
        <div>
          <div>{typeLabel(item.entityType)}</div>
          <div className={styles.muted}>
            {item.currentServer ?? hubText("dataHubI18n.serverUnknown")} {hubText("dataHubI18n.observed")}{" "}
            {item.observations.length}x
          </div>
        </div>
        <div>
          <div>
            {item.status === "completed"
              ? hubText("dataHubI18n.historicalAliasCount", { v1: item.historicalIdentifiers.length })
              : item.readyCandidateIdentifier
                ? hubText("dataHubI18n.candidateName", { v1: item.readyCandidateIdentifier })
                : hubText("dataHubI18n.candidateCount", { v1: item.candidates.length })}
          </div>
          <div className={styles.muted}>
            {formatDate(item.firstSeen)} - {formatDate(item.lastSeen)}
          </div>
        </div>
        <div className={styles.resultRowActions}>
          <GuildMemberRowActions
            item={item}
            onFocusMembersByStatus={onFocusMembersByStatus}
            onCompleteReadyPlayers={onCompleteReadyPlayers}
            completingGuildIdentifier={completingGuildIdentifier}
          />
          <span
            className={`${styles.statusBadge} ${statusClassName(item.status)}`}
          >
            {item.entityType === "guild" && item.status === "completed" ? t("identityRosterBatch.guildStored") : statusLabel(item.status)}
          </span>
        </div>
      </div>
    </div>
  );
});

type FusionIdentityPageView = "dashboard" | "workspace";

type MergeFeedbackState = {
  progress: FusionIdentityMergeProgress;
  phase: "running" | "refreshing" | "finished";
  error?: string;
};
type MergeFeedbackHandle = { show: (state: MergeFeedbackState) => void };

// Keep frequent progress updates local: the potentially large identity queue
// does not need to render again for each completed batch.
const MergeFeedback = React.forwardRef<MergeFeedbackHandle>(function MergeFeedback(_, ref) {
  const { t } = useTranslation();
  const [state, setState] = React.useState<MergeFeedbackState | null>(null);
  React.useImperativeHandle(ref, () => ({ show: setState }), []);
  if (!state) return null;
  const { progress: p, phase, error } = state;
  const failures = p.failedPlayers + p.failedGuilds + p.excluded + p.unresolved;
  const title = phase === "running" ? "running"
    : failures || error ? (p.players + p.guilds + p.skipped ? "partial" : "failed")
    : "success";
  return (
    <section className={styles.mergeFeedback} data-identity-merge={phase} aria-busy={phase !== "finished"}>
      <div role="status" aria-live="polite" aria-atomic="true">
        <strong>{t(`fusionIdentity.merge.${title}`)}</strong>
        <p>{t("fusionIdentity.merge.processed", { current: p.processed, total: p.total })}</p>
        <progress value={p.processed} max={Math.max(1, p.total)} aria-label={t("fusionIdentity.merge.progress")} />
        <p>{t("fusionIdentity.merge.players", { success: p.players, failed: p.failedPlayers })}</p>
        <p>{t("fusionIdentity.merge.guilds", { success: p.guilds, failed: p.failedGuilds })}</p>
        <p>{t("fusionIdentity.merge.skipped", { count: p.skipped })}</p>
        <p>{t("fusionIdentity.merge.excluded", { count: p.excluded })}</p>
        <p>{t("fusionIdentity.merge.unresolved", { count: p.unresolved })}</p>
        {phase === "refreshing" ? <p>{t("fusionIdentity.merge.refreshing")}</p> : null}
      </div>
      {error ? <p role="alert">{t("fusionIdentity.merge.unexpected", { reason: error })}</p> : null}
      {p.errors.length ? (
        <details>
          <summary>{t("fusionIdentity.merge.errors", { count: p.errors.length })}</summary>
          <ul className={styles.mergeErrors}>
            {p.errors.map((entry, index) => (
              <li key={`${entry.itemId}-${index}`}>
                {entry.currentIdentifier} → {entry.historicalIdentifier}: {t(`fusionIdentity.merge.reasons.${entry.message}`, { defaultValue: entry.message.slice(0, 500) })}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
});

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
  if (state === "fresh") return hubText("dataHubI18n.analysisUpToDate");
  if (state === "stale") {
    if (cache && isCacheStaleDueToCompatibility(cache))
      return hubText("dataHubI18n.analysisUpdateRequired");
    return hubText("dataHubI18n.analysisUpdateRequired");
  }
  if (state === "running") return hubText("dataHubI18n.analysisRunning");
  if (state === "error") return hubText("dataHubI18n.analysisFailed");
  return hubText("dataHubI18n.notAnalyzedYet");
};

const cacheStatusClassName = (state: FusionIdentityAnalysisCacheState) => {
  if (state === "fresh") return styles.statusHigh;
  if (state === "stale" || state === "running") return styles.statusAmbiguous;
  if (state === "error") return styles.statusConflict;
  return styles.statusNative;
};

const roleLabel = (role: FusionIdentityScopeInventory["coverage"][number]["role"]) => {
  if (role === "current-target") return hubText("dataHubI18n.currentTarget");
  if (role === "intermediate-fusion-target") return hubText("dataHubI18n.intermediateTarget");
  if (role === "historical-origin") return hubText("dataHubI18n.historicalOrigin");
  if (role === "transitive-historical-origin") return hubText("dataHubI18n.transitiveOrigin");
  return hubText("dataHubI18n.outOfScope");
};

const scopeTemporalLabel = (scope: FusionIdentityScopeInventory["scope"]) => {
  if (scope.temporalStatus === "future") return hubText("dataHubI18n.futureEvent");
  if (scope.temporalStatus === "unknown-date") return hubText("dataHubI18n.unknownDate");
  if (scope.isCurrentTerminalTarget) return hubText("dataHubI18n.currentTerminal");
  return hubText("dataHubI18n.historicalIntermediate");
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
        {hubText("dataHubI18n.autoLinkable")}
        {summary.autoLinkShare == null
          ? ""
          : ` · ${formatShare(summary.autoLinkShare)}`}
      </span>
      <span className={styles.muted}>
        {formatNumber(summary.review)} {hubText("dataHubI18n.review6a40f")}{" "}
        {formatNumber(summary.unresolved)} {hubText("dataHubI18n.unresolved8e5e7")}{" "}
        {formatNumber(summary.noHistoricalObservation)} {hubText("dataHubI18n.noObservation")}{" "}
        {formatNumber(summary.noHistory)} {hubText("dataHubI18n.noData")}{" "}
        {formatNumber(summary.completed)} {hubText("dataHubI18n.completed4ddb3")}
      </span>
    </div>
  );

  return (
    <div className={styles.dashboardMetrics}>
      {previous ? <div className={styles.muted}>{hubText("dataHubI18n.previousAnalysis")}</div> : null}
      {renderLine(hubText("dataHubI18n.players"), playerSummary)}
      {renderLine(hubText("dataHubI18n.guilds"), guildSummary)}
    </div>
  );
}

function PredecessorBasisNotice({ basis, reportBasis = false }: {
  basis?: FusionPredecessorCoverage; reportBasis?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate(), location = useLocation();
  if (!basis) return reportBasis ? <p className={styles.muted} data-predecessor-basis="report">{t("fusionIdentity.basis.unknownReport")}</p> : null;
  if (!basis.missingServerCodes.length) return null;
  return <aside className={`${styles.emptyState} ${styles.evidenceWarning}`} data-predecessor-basis={reportBasis ? "report" : "local"}>
    <strong>{t(reportBasis ? "fusionIdentity.basis.reportLabel" : "fusionIdentity.basis.localLabel")}</strong>
    {basis ? <>
      <p><strong>{t("fusionIdentity.basis.incomplete", { count: basis.coveredServerCodes.length, total: basis.requiredServerCodes.length })}</strong></p>
      <p>{t("fusionIdentity.basis.missing", { servers: basis.missingServerCodes.join(", ") })}</p>
    </> : <p>{t("fusionIdentity.basis.unknownReport")}</p>}
    {!reportBasis && <button type="button" className={styles.closeButton}
      onClick={() => navigate(`${DATA_HUB}/scan-management?tab=archive`, { state: { returnTo: location.pathname + location.search, profileReturnState: location.state } })}>
      {t("identityEntry.toArchive")}
    </button>}
  </aside>;
}

function ScanCoverageAccordion({
  coverage,
  basis,
  expandedServers,
  onToggle,
}: {
  coverage: FusionIdentityScopeInventory["coverage"];
  basis: FusionPredecessorCoverage;
  expandedServers: Set<string>;
  onToggle: (serverCode: string) => void;
}) {
  const { t } = useTranslation();
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
                {basis.missingServerCodes.includes(server.serverCode) ? <>
                  <strong>{t("fusionIdentity.basis.noSuitable")}</strong><br />
                  {t(server.count ? "fusionIdentity.basis.unsuitableSource" : "fusionIdentity.basis.noSource")}
                  {server.count ? <><br />{hubText("dataHubI18n.coverageScans", { count: server.count })} {formatDate(server.firstSeen)} - {formatDate(server.lastSeen)}</> : null}
                </> : server.count ? <>{hubText("dataHubI18n.coverageScans", { count: server.count })} {formatDate(server.firstSeen)} - {formatDate(server.lastSeen)}</> : t("fusionIdentity.basis.noSource")}
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
                      {formatNumber(observation.playerCount)} {hubText("dataHubI18n.playersd02d0")}{" "}
                      {formatNumber(observation.guildCount)} {hubText("dataHubI18n.guildsb90cb")}
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

export default function FusionIdentityPage({ dataHub = false }: { dataHub?: boolean }) {
  const location = useLocation(), navigate = useNavigate();
  const returnTo = safeLocalReturn(location.state?.returnTo, location.pathname);
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
  useAnalyticsView(view === "dashboard" ? "datahub/identity/dashboard" : "datahub/identity/workspace");
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
  useAnalyticsView(manualOpen && report ? "datahub/identity/manual-link" : null);
  const [evidenceInfoOpen, setEvidenceInfoOpen] = React.useState(false);
  useAnalyticsView(evidenceInfoOpen ? "datahub/identity/evidence" : null);
  const [activeEvidenceChipId, setActiveEvidenceChipId] = React.useState<
    string | null
  >(null);
  const [completingGuildIdentifier, setCompletingGuildIdentifier] =
    React.useState<string | null>(null);
  const mergeLockRef = React.useRef(false);
  const mergeFeedbackRef = React.useRef<MergeFeedbackHandle>(null);
  const [mergeRunning, setMergeRunning] = React.useState(false);
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const dashboardServers = React.useMemo(() => {
    const definitions = listFusionIdentityAnalysisScopes();
    return getFusionIdentityFastLoadOptions([], definitions).map(option =>
      definitions.find(scope => scope.targetServerCode === option.server)!,
    );
  }, []);
  const selectedServer = dashboardServers.find(scope => scope.id === selectedDashboardScopeId)
    ?? dashboardServers[0];
  const selectedDashboardScope = dashboard.scopes.find(
    model => model.inventory.scope.id === selectedServer?.id,
  );
  const serverDrag = React.useRef<{ pointerId: number; startX: number; scrollLeft: number } | null>(null);
  const suppressServerClick = React.useRef(false);
  const [draggingServers, setDraggingServers] = React.useState(false);

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
  useAnalyticsView(selectedItem ? "datahub/identity/details" : null);

  const readyPlayers =
    report?.items.filter(
      (item) => item.entityType === "player" && item.status === "ready",
    ).length ?? 0;
  const readyGuilds =
    report?.items.filter(
      (item) => item.entityType === "guild" && item.status === "ready",
    ).length ?? 0;

  const runReadyMerge = React.useCallback(async (
    selectedReport: FusionIdentityManagementReport,
    guildIdentifier: string | null = null,
  ) => {
    if (mergeLockRef.current) return;
    mergeLockRef.current = true;
    setMergeRunning(true);
    setCompletingGuildIdentifier(guildIdentifier);
    const mergeRoute = window.location.hash;
    let latest: FusionIdentityMergeProgress = {
      total: selectedReport.items.length, processed: 0, players: 0, guilds: 0,
      failedPlayers: 0, failedGuilds: 0, skipped: 0, excluded: 0, unresolved: 0, entries: [], errors: [],
    };
    let error: string | undefined;
    const show = (phase: MergeFeedbackState["phase"]) => {
      if (mountedRef.current) mergeFeedbackRef.current?.show({ progress: latest, phase, error });
    };
    show("running");
    try {
      latest = await mergeReadyFusionIdentityItems(selectedReport, {
        onProgress(next) { latest = next; show("running"); },
        isCurrent: () => mountedRef.current && window.location.hash === mergeRoute,
      });
      if (latest.players || latest.guilds) trackLocalEvent("datahub/identity/matching-success");
    } catch (cause) {
      error = cause instanceof Error ? cause.message : t("fusionIdentity.merge.reasons.merge_failed");
    }
    try {
      if (!mountedRef.current) return;
      show("refreshing");
      // Never offer successful entries from the old report for another merge.
      clearReport();
      setView("dashboard");
      await refreshDashboard({
        reason: "identity-revision",
        targetServerCode: selectedReport.scope.targetServerCode,
        autoAnalyzeIdentityRevision: true,
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : t("fusionIdentity.merge.reasons.merge_failed");
      error = error ? `${error}; ${reason}` : reason;
    } finally {
      show("finished");
      mergeLockRef.current = false;
      if (mountedRef.current) {
        setMergeRunning(false);
        setCompletingGuildIdentifier(null);
      }
    }
  }, [clearReport, refreshDashboard, t]);

  const handleMergeReady = async () => {
    if (!report || mergeLockRef.current) return;
    const selectedReport = { ...report, items: listReadyFusionIdentityMergeItems(report).map(item => ({ ...item })) };
    if (!selectedReport.items.length) return;
    const approved = window.confirm(
      t("fusionIdentity.merge.confirm", { players: selectedReport.items.filter(item => item.entityType === "player").length, guilds: selectedReport.items.filter(item => item.entityType === "guild").length }),
    );
    if (!approved) return;
    await runReadyMerge(selectedReport);
  };

  const handleMergeGuildReadyPlayers = React.useCallback(async (
    guildItem: FusionIdentityManagementItem,
  ) => {
    if (!report || guildItem.entityType !== "guild" || mergeLockRef.current) return;
    const readyItems = listGuildFusionIdentityMergeItems(report, guildItem);
    if (!readyItems.length) return;
    const selectedReport = { ...report, items: readyItems.map(item => ({ ...item })) };
    const guildName = guildItem.currentName ?? guildItem.currentIdentifier;
    const approved = window.confirm(
      t("fusionIdentity.merge.confirmGuild", { guildName, players: readyItems.length }),
    );
    if (!approved) return;
    await runReadyMerge(selectedReport, guildItem.currentIdentifier);
  }, [report, runReadyMerge, t]);

  const openIdentity = React.useCallback((itemId: string) => {
    if (!mergeLockRef.current) setSelectedId(itemId);
  }, []);

  const handleIdentityChanged = async () => {
    const refreshScope = report?.scope ?? null;
    clearReport();
    setView("dashboard");
    await refreshDashboard({
      reason: "identity-revision",
      targetServerCode: refreshScope?.targetServerCode ?? null,
      autoAnalyzeIdentityRevision: true,
    });
  };

  const openReportEntry = (
    entry: FusionIdentityAnalysisCacheLookup["previousEntry"],
  ) => {
    if (mergeLockRef.current) return;
    if (!openCachedReport(entry)) return;
    setView("workspace");
  };

  const runScopeAnalysis = async (
    scopeModel: FusionIdentityDashboardScopeModel,
  ) => {
    if (mergeLockRef.current) return;
    const nextReport = await analyzeScope(scopeModel);
    if (nextReport) setView("workspace");
  };

  const renderDashboardCards = (model: FusionIdentityDashboardScopeModel) => {
    if (!dashboard.inventory) return null;
    const scope = model.inventory.scope;
    const basis = getFusionPredecessorCoverage(scope, model.inventory.coverage);
    const previousEntry = model.cache.previousEntry;
    const refreshReason = fusionAnalysisRefreshReason(model.cache, model.inventory);
    const openableEntry = getOpenableFusionWorkspaceEntry(model);
    const running = model.cacheState === "running";
    const analyzedAt = previousEntry?.analyzedAt
      ? Date.parse(previousEntry.analyzedAt)
      : null;
    const analyzeLabel = !scope.analysisSupported
      ? hubText("dataHubI18n.analysisNotEnabledYet")
      : !model.inventory.isLocallyMatchable
        ? hubText("dataHubI18n.notLocallyMatchable")
      : !hasFusionAnalysisInputData(model)
        ? hubText("dataHubI18n.noCurrentData")
      : model.cacheState === "fresh"
        ? hubText("dataHubI18n.analysisUpToDate")
      : model.cacheState === "stale"
        ? "Re-analyze"
        : hubText("dataHubI18n.analyzeServer", { v1: scope.targetServerCode });

    return (
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
                    {hubText("dataHubI18n.inventoryOnly")}
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

            <PredecessorBasisNotice basis={basis} />
            {model.error ? (
              <div className={styles.errorState}>{hubMessage(model.error)}</div>
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
                <span>{hubText("dataHubI18n.relevantScans")}</span>
                <strong>{formatNumber(model.inventory.relevantSnapshotIds.length)}</strong>
              </div>
              <div>
                <span>{hubText("dataHubI18n.newestRelevantScan")}</span>
                <strong>{formatDate(model.inventory.newestRelevantScanTimestamp)}</strong>
              </div>
              <div>
                <span>{hubText("dataHubI18n.currentPlayers")}</span>
                <strong>{formatNumber(model.identityState.openCurrentPlayers)}</strong>
              </div>
              <div>
                <span>{hubText("dataHubI18n.currentGuilds")}</span>
                <strong>{formatNumber(model.identityState.openCurrentGuilds)}</strong>
              </div>
            </div>

            {previousEntry && scope.analysisSupported ? (
              <div className={styles.analysisBlock}>
                <div className={styles.metaLine}>
                  {hubText("dataHubI18n.lastAnalyzed")} {formatDate(analyzedAt)} {hubText("dataHubI18n.cache")}{" "}
                  {hubText(model.cacheState === "fresh" ? "dataHubI18n.current" : "dataHubI18n.previous")}
                </div>
                {refreshReason ? <p className={styles.muted} data-analysis-refresh-reason={refreshReason}>{t(`fusionIdentity.refreshReasons.${refreshReason}`)}</p> : null}
                <PredecessorBasisNotice reportBasis basis={previousEntry.report.predecessorCoverage} />
                <DashboardResolutionSummary
                  report={previousEntry.report}
                  previous={model.cacheState === "stale"}
                />
              </div>
            ) : (
              <div className={styles.emptyState}>
                {scope.analysisSupported
                  ? hubText("dataHubI18n.serverNotAnalyzed", { v1: scope.targetServerCode })
                  : hubText("dataHubI18n.serverInventoryOnly", { v1: scope.targetServerCode })}
              </div>
            )}

            <div className={styles.actionBar}>
              {openableEntry ? (
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={() => openReportEntry(openableEntry)}
                >
                  {hubText("dataHubI18n.openMatches")}
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
                <h3>{hubText("dataHubI18n.scanCoverage")}</h3>
                <p>
                  {formatNumber(dashboard.inventory.allSnapshotCount)} {hubText("dataHubI18n.logicalSnapshotsInventory")}{" "}
                  {formatDuration(dashboard.inventory.durationMs)}
                </p>
              </div>
            </div>
            <ScanCoverageAccordion
              coverage={getFusionPredecessorCoverageRows(model.inventory)}
              basis={basis}
              expandedServers={expandedCoverageServerSet}
              onToggle={toggleCoverageServer}
            />
          </section>
        </div>
    );
  };

  const renderDashboard = () => (
    <div className={styles.dashboard}>
      <div className={styles.dashboardHeader}>
        <div>
          <h2>{hubText("dataHubI18n.fusionDashboard")}</h2>
          <p>
            {hubText("dataHubI18n.fastScanInventoryFirstFullIdentityResolutionRunsOnlyWhenYouStart")}
          </p>
        </div>
        <button type="button" className={styles.infoButton} onClick={() => setEvidenceInfoOpen(true)}>
          <Info size={16} aria-hidden /> {hubText("dataHubI18n.evidenceGuide")}
        </button>
      </div>
      <div className={`${styles.dashboardNav} ${draggingServers ? styles.dashboardNavDragging : ""}`}
        data-fusion-server-bar
        onPointerDown={event => {
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          suppressServerClick.current = false;
          serverDrag.current = { pointerId: event.pointerId, startX: event.clientX, scrollLeft: event.currentTarget.scrollLeft };
        }}
        onPointerMove={event => {
          const drag = serverDrag.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const delta = event.clientX - drag.startX;
          if (!suppressServerClick.current && Math.abs(delta) < 5) return;
          suppressServerClick.current = true;
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
          setDraggingServers(true);
          event.currentTarget.scrollLeft = drag.scrollLeft - delta;
        }}
        onPointerUp={() => { serverDrag.current = null; setDraggingServers(false); }}
        onPointerCancel={() => { serverDrag.current = null; setDraggingServers(false); }}
        onLostPointerCapture={() => { serverDrag.current = null; setDraggingServers(false); }}
        onPointerLeave={() => {
          if (!suppressServerClick.current) serverDrag.current = null;
        }}
        onClickCapture={event => {
          if (suppressServerClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
        }}
        onFocusCapture={event => {
          const button = event.target as HTMLElement;
          const bar = event.currentTarget;
          if (button.offsetLeft < bar.scrollLeft) bar.scrollLeft = button.offsetLeft;
          else if (button.offsetLeft + button.offsetWidth > bar.scrollLeft + bar.clientWidth)
            bar.scrollLeft = button.offsetLeft + button.offsetWidth - bar.clientWidth;
        }}>
        <button type="button" className={styles.tabButton}>{hubText("dataHubI18n.allMatches")}</button>
        {dashboardServers.map(scope => <button key={scope.id} type="button"
          className={`${styles.tabButton} ${scope.id === selectedServer?.id ? styles.tabButtonActive : ""}`}
          onClick={() => setSelectedDashboardScopeId(scope.id)}>
          {scope.targetServerCode}
        </button>)}
      </div>
      {dashboard.loading ? <DataHubLoadingState
        title={hubText("dataHubI18n.preparingFusionDashboard")}
        message={inventoryProgress ? t(`fusionIdentity.inventoryPhases.${inventoryProgress.phase}`, { defaultValue: hubMessage(inventoryProgress.message) }) : hubText("dataHubI18n.readingLocalScanMetadata")}
        current={inventoryProgress?.current} total={inventoryProgress?.total} />
        : dashboard.error ? <DataHubLoadingState
          title={hubText("dataHubI18n.couldNotPrepareFusionDashboard")}
          message={hubText("dataHubI18n.localScanInventoryCouldNotBeRead")}
          error={hubMessage(dashboard.error)} onRetry={refreshDashboard} /> : null}
      <FusionIdentityEntry
        scanCount={dashboard.error || !dashboard.inventory ? null : dashboard.inventory.scanCount}
        scopes={dashboard.scopes.map(model => model.inventory)}
        server={selectedServer?.targetServerCode ?? ""}
        inventoryLoading={dashboard.loading}
        needed={!selectedDashboardScope?.inventory.isLocallyMatchable} />
      {!dashboard.loading && !dashboard.error && selectedDashboardScope?.inventory.isLocallyMatchable
        ? renderDashboardCards(selectedDashboardScope) : null}
    </div>
  );

  const renderWorkspace = () => {
    if (!report) {
      return (
        <div className={styles.emptyState}>
          {hubText("dataHubI18n.selectACachedAnalysisOrRunAnalyzeFromTheFusionDashboard")}
        </div>
      );
    }
    if (!report.items.length)
      return (
        <div className={styles.emptyState}>
          <PredecessorBasisNotice reportBasis basis={report.predecessorCoverage} />
          {hubText("dataHubI18n.unsupportedPool", { scope: report.scope.label })}
        </div>
      );

    return (
      <>
        <div className={styles.toolbar}>
          <label className={styles.fieldLabel}>
            {hubText("dataHubI18n.search")}
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
                placeholder={hubText("dataHubI18n.nameOrIdentifier")}
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
              disabled={mergeRunning}
            >
              {hubText("dataHubI18n.fusionDashboard")}
            </button>
            <button
              type="button"
              className={styles.closeButton}
              onClick={() => setManualOpen(true)}
              disabled={!report || mergeRunning}
            >
              <Link2 size={15} aria-hidden /> {hubText("dataHubI18n.manualLink")}
            </button>
            <button
              type="button"
              className={styles.closeButton}
              onClick={handleMergeReady}
              disabled={!report || mergeRunning || (!readyPlayers && !readyGuilds)}
            >
              <Check size={15} aria-hidden /> {hubText("dataHubI18n.mergeReadyIdentities")}
            </button>
          </div>
        </div>

        <div className={styles.summaryHeader}>
          <div>
            <h2>{hubText("dataHubI18n.identityQueue")}</h2>
            <p>
              {report.scope.targetServerCode} · {report.scope.label}
            </p>
          </div>
          <button
            type="button"
            className={styles.infoButton}
            onClick={() => setEvidenceInfoOpen(true)}
          >
            <Info size={16} aria-hidden /> {hubText("dataHubI18n.evidenceGuide")}
          </button>
        </div>
        <PredecessorBasisNotice reportBasis basis={report.predecessorCoverage} />
        <div className={styles.summaryGrid}>
          <SummaryItem label={hubText("dataHubI18n.totalIdentities")} value={report.summary.total} />
          <SummaryItem label={hubText("dataHubI18n.ready")} value={report.summary.ready} />
          <SummaryItem label={hubText("dataHubI18n.review")} value={report.summary.review} />
          <SummaryItem label={hubText("dataHubI18n.unresolved")} value={report.summary.unresolved} />
          <SummaryItem
            label={hubText("dataHubI18n.noHistoricalObservation")}
            value={report.summary.noHistoricalObservation}
          />
          <SummaryItem
            label={hubText("dataHubI18n.noHistoricalData")}
            value={report.summary.noHistory}
          />
          <SummaryItem label={hubText("dataHubI18n.completed")} value={report.summary.completed} />
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
          {hubText("dataHubI18n.queueMeta", {
            scope: report.scope.label, historical: report.scope.historicalSnapshotCount,
            current: report.scope.postFusionSnapshotCount, server: report.scope.targetServerCode,
            from: formatDate(report.scope.firstHistoricalTimestamp), to: formatDate(report.scope.lastHistoricalTimestamp),
            visible: visibleItems.length, total: report.items.length,
          })}
          {timings.find(timing => timing.phase === "total") ? hubText("dataHubI18n.workerDuration", {
            duration: formatDuration(timings.find(timing => timing.phase === "total")?.durationMs ?? 0),
          }) : ""}
        </div>

        {groupedItems.guilds.length ? (
          <section className={styles.queueGroup}>
            <h2>{hubText("dataHubI18n.guilds")}</h2>
            <div className={styles.resultList}>
              {groupedItems.guilds.map((item) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  onOpen={openIdentity}
                  onFocusMembersByStatus={focusGuildMembersByStatus}
                  onCompleteReadyPlayers={handleMergeGuildReadyPlayers}
                  completingGuildIdentifier={mergeRunning ? completingGuildIdentifier ?? "global-merge" : null}
                />
              ))}
            </div>
          </section>
        ) : null}

        {groupedItems.players.length ? (
          <section className={styles.queueGroup}>
            <h2>{hubText("dataHubI18n.players")}</h2>
            <div className={styles.resultList}>
              {groupedItems.players.map((item) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  onOpen={openIdentity}
                  onFocusMembersByStatus={ignorePlayerGuildAction}
                  onCompleteReadyPlayers={ignorePlayerGuildAction}
                  completingGuildIdentifier={null}
                />
              ))}
            </div>
          </section>
        ) : null}

        {!visibleItems.length ? (
          <div className={styles.emptyState}>
            {hubText("dataHubI18n.noIdentitiesMatchTheCurrentFilters")}
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
          {dataHub && <LocalTitleNavigation title={hubText("dataHubI18n.fusionIdentity")}
            onBack={() => navigate(returnTo ?? DATA_HUB,
              { replace: true, state: returnTo ? location.state?.profileReturnState : undefined })} />}
          <div>
            {!dataHub && <h1 className={styles.title}>{hubText("dataHubI18n.fusionIdentity")}</h1>}
            <p className={styles.subtitle}>
              {hubText("dataHubI18n.localFusionDashboardAndScopedIdentityResolution")}
            </p>
          </div>
          <div className={styles.previewBadge}>
            {hubText("dataHubI18n.localLinksAndExclusionsAreReversibleRawScansStayUnchanged")}
          </div>
        </header>

        <MergeFeedback ref={mergeFeedbackRef} />
        <section className={styles.panel}>
          {view === "workspace" ? renderWorkspace() : renderDashboard()}
        </section>

        {selectedItem ? (
          <IdentityDetails
            item={selectedItem}
            dependencies={report?.dependencies}
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
