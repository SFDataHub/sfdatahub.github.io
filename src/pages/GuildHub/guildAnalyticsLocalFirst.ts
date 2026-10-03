import {
  acquireLocalFirstFeatureScans,
  type LocalFirstFeatureAcquisitionResult,
  type LocalFirstFeatureAcquisitionDependencies,
  type LocalFirstFeaturePreparedAcquisition,
  type LocalFirstFeatureRequest,
  type LocalFirstFeatureTimeRequirement,
} from "../../lib/scanArchive/localFirstFeatureAcquisition";
import { acquireLocalFirstScans } from "../../lib/scanArchive/localFirstScanAcquisition";
import { resolveGuildAnalyticsRangeInterval, type GuildAnalyticsRangeSelection } from "../../lib/guilds/localGuildAnalytics";
import type { LocalFirstScanRequest, LocalFirstScanResolvedSegment } from "../../lib/guilds/localFirstScanResolver";
import type { GuildHubLocalScan, GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";
import type {
  GuildAnalyticsDiagnosticEntry,
  GuildAnalyticsDerivedData,
  GuildAnalyticsLoadPhaseUpdate,
  GuildAnalyticsReadResult,
  GuildAnalyticsSourceDiagnostic,
} from "../../lib/guilds/localGuildAnalyticsStore";
import type { IdentityResolutionSnapshot } from "../../lib/identities/identityResolution";

export type GuildAnalyticsLocalFirstGuild = {
  id?: string | null;
  name: string;
  server?: string | null;
  guildId?: string | null;
  logoIdentifier?: string | null;
};

export type GuildAnalyticsLocalFirstScanNeed = LocalFirstFeaturePreparedAcquisition & {
  source: "analytics-interval" | "bootstrap-latest";
  request: LocalFirstScanRequest;
  segments: LocalFirstScanResolvedSegment[];
};

export type GuildAnalyticsLocalFirstAcquisitionOutcome =
  | { status: "skipped"; reason: "no-request" | "duplicate-or-failed"; key: string | null }
  | { status: "completed"; key: string; result: LocalFirstFeatureAcquisitionResult }
  | { status: "failed"; key: string; error: unknown };

export type GuildAnalyticsLocalFirstLoadResult = {
  analyticsData: GuildAnalyticsDerivedData;
  identityResolutionSnapshot: IdentityResolutionSnapshot | null;
  acquisitionNeed: GuildAnalyticsLocalFirstScanNeed | null;
  acquisitionOutcome: GuildAnalyticsLocalFirstAcquisitionOutcome;
};

export type GuildAnalyticsLocalFirstLoadDependencies = {
  listScanSummaries: () => Promise<GuildHubScanSummary[]>;
  getLocalScan: (sourceScanId: string) => Promise<GuildHubLocalScan | null>;
  loadIdentityResolutionSnapshot: () => Promise<IdentityResolutionSnapshot | null>;
  ensureScopedDataFromSummaries: (
    summaries: GuildHubScanSummary[],
    options: {
      guild?: GuildAnalyticsLocalFirstGuild | null;
      identitySnapshot?: Pick<IdentityResolutionSnapshot, "players" | "guilds"> | null;
      selectedPlayerRefs?: readonly string[];
      loadSourceById: (sourceScanId: string) => Promise<GuildHubLocalScan | null>;
      onDiagnostic?: (entry: GuildAnalyticsDiagnosticEntry) => void;
      onSourceDiagnostic?: (entry: GuildAnalyticsSourceDiagnostic) => void;
      onPhase?: (phase: GuildAnalyticsLoadPhaseUpdate) => void;
    },
  ) => Promise<GuildAnalyticsReadResult>;
  acquireLocalFirstScans: typeof acquireLocalFirstScans;
  featureAcquisitionDependencies?: Partial<LocalFirstFeatureAcquisitionDependencies>;
};

export type GuildAnalyticsLocalFirstLoadOptions = {
  guild: GuildAnalyticsLocalFirstGuild | null | undefined;
  range: GuildAnalyticsRangeSelection;
  selectedPlayerIds: readonly string[];
  cachedIdentityResolutionSnapshot: IdentityResolutionSnapshot | null;
  signal?: AbortSignal;
  dependencies: GuildAnalyticsLocalFirstLoadDependencies;
  shouldAcquireRequest?: (need: GuildAnalyticsLocalFirstScanNeed) => boolean;
  onIdentityResolutionSnapshot?: (snapshot: IdentityResolutionSnapshot | null) => void;
  onAcquisitionOutcome?: (outcome: GuildAnalyticsLocalFirstAcquisitionOutcome) => void;
  onDiagnostic?: (entry: GuildAnalyticsDiagnosticEntry) => void;
  onSourceDiagnostic?: (entry: GuildAnalyticsSourceDiagnostic) => void;
  onPhase?: (phase: GuildAnalyticsLoadPhaseUpdate) => void;
};

const DAY_MS = 86_400_000;

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
};

const analyticsFeatureTime = (range: GuildAnalyticsRangeSelection): LocalFirstFeatureTimeRequirement => {
  if (range.key === "custom") {
    const interval = resolveGuildAnalyticsRangeInterval(range, []);
    return interval ? { kind: "interval", from: interval.from, to: interval.to } : { kind: "latest" };
  }
  if (range.key === "all") return { kind: "all" };
  if (range.key === "7d") return { kind: "relative", durationMs: 7 * DAY_MS };
  if (range.key === "30d") return { kind: "relative", durationMs: 30 * DAY_MS };
  if (range.key === "90d") return { kind: "relative", durationMs: 90 * DAY_MS };
  if (range.key === "6m") return { kind: "relative", months: 6 };
  return { kind: "relative", months: 12 };
};

const buildAnalyticsFeatureRequest = (
  guild: GuildAnalyticsLocalFirstGuild | null | undefined,
  range: GuildAnalyticsRangeSelection,
): LocalFirstFeatureRequest | null => {
  const server = String(guild?.server ?? "").trim();
  if (!guild || !server) return null;
  return {
    target: { kind: "server", server },
    time: analyticsFeatureTime(range),
    dataKind: "both",
    completeness: "usable-snapshot",
  };
};

const analyticsNeedFromPrepared = (
  prepared: LocalFirstFeaturePreparedAcquisition,
): GuildAnalyticsLocalFirstScanNeed => ({
  ...prepared,
  source: prepared.request.time.kind === "interval" ? "analytics-interval" : "bootstrap-latest",
});

const loadIdentitySnapshot = async (
  options: GuildAnalyticsLocalFirstLoadOptions,
  cachedIdentityResolutionSnapshot: IdentityResolutionSnapshot | null,
) => {
  if (cachedIdentityResolutionSnapshot) return cachedIdentityResolutionSnapshot;
  return options.dependencies
    .loadIdentityResolutionSnapshot()
    .then((snapshot) => {
      options.onIdentityResolutionSnapshot?.(snapshot);
      return snapshot;
    })
    .catch((error) => {
      console.warn("[GuildHubAnalytics] failed to load identity resolution snapshot", error);
      return null;
    });
};

export async function loadGuildAnalyticsLocalFirstData(
  options: GuildAnalyticsLocalFirstLoadOptions,
): Promise<GuildAnalyticsLocalFirstLoadResult> {
  const {
    guild,
    range,
    selectedPlayerIds,
    cachedIdentityResolutionSnapshot,
    dependencies,
    signal,
  } = options;
  throwIfAborted(signal);

  let summaries = await dependencies.listScanSummaries();
  throwIfAborted(signal);

  let acquisitionNeed: GuildAnalyticsLocalFirstScanNeed | null = null;
  let acquisitionOutcome: GuildAnalyticsLocalFirstAcquisitionOutcome = {
    status: "skipped",
    reason: "no-request",
    key: null,
  };

  const featureRequest = buildAnalyticsFeatureRequest(guild, range);
  if (featureRequest) {
    try {
      const result = await acquireLocalFirstFeatureScans(featureRequest, {
        signal,
        localScanSummaries: summaries,
        dependencies: {
          ...dependencies.featureAcquisitionDependencies,
          listLocalScanSummaries: dependencies.listScanSummaries,
          acquireLocalFirstScans: dependencies.acquireLocalFirstScans,
        },
        shouldAcquirePreparedRequest: (prepared) => {
          acquisitionNeed = analyticsNeedFromPrepared(prepared);
          return options.shouldAcquireRequest?.(acquisitionNeed) ?? true;
        },
      });
      acquisitionNeed = analyticsNeedFromPrepared(result.preparedRequest);
      acquisitionOutcome = result.skippedReason
        ? { status: "skipped", reason: result.skippedReason, key: result.key }
        : { status: "completed", key: result.key, result };
      options.onAcquisitionOutcome?.(acquisitionOutcome);
      if (result.shouldReloadLocalScanPool) {
        summaries = await dependencies.listScanSummaries();
        throwIfAborted(signal);
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      acquisitionOutcome = { status: "failed", key: acquisitionNeed?.key ?? "unresolved", error };
      options.onAcquisitionOutcome?.(acquisitionOutcome);
      console.warn("[GuildHubAnalytics] local-first acquisition failed; using local analytics data", error);
    }
  } else {
    options.onAcquisitionOutcome?.(acquisitionOutcome);
  }

  const identityResolutionSnapshot = await loadIdentitySnapshot(options, cachedIdentityResolutionSnapshot);
  throwIfAborted(signal);

  const analyticsResult = await dependencies.ensureScopedDataFromSummaries(summaries, {
    guild,
    identitySnapshot: identityResolutionSnapshot,
    selectedPlayerRefs: selectedPlayerIds,
    loadSourceById: dependencies.getLocalScan,
    onDiagnostic: options.onDiagnostic,
    onSourceDiagnostic: options.onSourceDiagnostic,
    onPhase: options.onPhase,
  });

  return {
    analyticsData: analyticsResult.data,
    identityResolutionSnapshot,
    acquisitionNeed,
    acquisitionOutcome,
  };
}
