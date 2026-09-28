import {
  getGuildHubLocalScan,
  listGuildHubScanSummaries,
} from "../../lib/guilds/localScanLibrary";
import {
  ensureGuildAnalyticsDerivedDataFromSummaries,
  type GuildAnalyticsDerivedData,
} from "../../lib/guilds/localGuildAnalyticsStore";
import { buildGuildSnapshotCompletenessReports } from "../../lib/guilds/guildSnapshotCompleteness";
import { loadIdentityResolutionSnapshot } from "../../lib/identities/identityResolution";
import {
  getFusionEvent,
  getFusionLineage,
  isFusionEventEffective,
  resolveServer,
} from "../../lib/servers/serverResolver";
import {
  buildPlayerPerformanceModel,
  type PlayerPerformanceBuildResult,
  type PlayerPerformancePair,
  type PlayerPerformanceSnapshot,
} from "../../pages/Playground/playerPerformanceModel";
import type { LocalPlayerProfileModel } from "./types";

const DAY_MS = 86_400_000;
const DEFAULT_COMPARISON_DAYS = 30;

export type LocalComparisonScanOption = {
  timestamp: number;
  sourceScanId: string;
  snapshotId: string;
  label: string;
  distanceLabel: string;
};

export type LocalAnalyticsPoint = {
  timestamp: number;
  label: string;
  value: number;
  rawValue?: number | null;
  detail: string;
};

export type LocalAnalyticsSeries = {
  id: string;
  label: string;
  color: string;
  points: LocalAnalyticsPoint[];
};

export type LocalCareerEvent = {
  id: string;
  label: string;
  dateLabel: string;
  tone: "origin" | "fusion" | "current";
};

export type LocalPlayerAnalyticsResult = {
  status: PlayerPerformanceBuildResult["status"];
  message?: string;
  playerName: string;
  identityKey: string;
  periodLabel: string;
  snapshotCount: number;
  comparison: {
    currentTimestamp: number | null;
    currentLabel: string;
    selectedTimestamp: number | null;
    selectedPlayerAtStart: boolean;
    options: LocalComparisonScanOption[];
    emptyReason: string | null;
  };
  xp: {
    series: LocalAnalyticsSeries[];
    hasGuildAverage: boolean;
    guildAverageDefinition: string;
  };
  stats: {
    series: LocalAnalyticsSeries[];
    description: string;
  };
  career: {
    title: "CAREER TIMELINE" | "FUSION HISTORY";
    events: LocalCareerEvent[];
    emptyReason: string | null;
  };
};

export async function buildLocalPlayerAnalytics(
  profile: LocalPlayerProfileModel,
  selectedComparisonTimestamp?: number | null,
): Promise<LocalPlayerAnalyticsResult> {
  const [summaries, identityResolutionSnapshot] = await Promise.all([
    listGuildHubScanSummaries(),
    loadIdentityResolutionSnapshot(),
  ]);
  const analyticsData = await ensureGuildAnalyticsDerivedDataFromSummaries(summaries, {
    loadSourceById: getGuildHubLocalScan,
  });
  const target = {
    name: profile.analytics.playerName,
    server: profile.analytics.server,
    memberRef: profile.analytics.memberRef,
  };
  const performance = buildPlayerPerformanceModel([], {
    analyticsData,
    identityResolutionSnapshot,
    target,
  });

  const playerName = performance.player?.name ?? profile.analytics.playerName;
  const snapshots = performance.snapshots;
  const segments = performance.segments;
  const currentTimestamp = resolveCurrentTimestamp(profile, snapshots);
  const comparisonOptions = buildComparisonOptions({
    analyticsData,
    currentTimestamp,
    guildIdentifier: resolveCurrentGuildIdentifier(profile, snapshots, currentTimestamp),
  });
  const selectedTimestamp = resolveSelectedComparisonTimestamp(
    comparisonOptions,
    currentTimestamp,
    selectedComparisonTimestamp,
  );
  const selectedPlayerAtStart =
    selectedTimestamp != null && snapshots.some((snapshot) => snapshot.scannedAtMs === selectedTimestamp);
  const rangedSnapshots = filterSnapshotsForRange(snapshots, selectedTimestamp, currentTimestamp);
  const rangedSegments = filterSegmentsForRange(segments, selectedTimestamp, currentTimestamp);

  return {
    status: performance.status,
    message: performance.message,
    playerName,
    identityKey: profile.analytics.memberRef
      ? `member-ref:${profile.analytics.memberRef.toLowerCase()}`
      : `source-player-key:${profile.sourcePlayerKey}`,
    periodLabel: formatPeriodLabelForRange(rangedSnapshots, selectedTimestamp, currentTimestamp, selectedPlayerAtStart),
    snapshotCount: snapshots.length,
    comparison: {
      currentTimestamp,
      currentLabel: currentTimestamp != null ? formatDate(currentTimestamp) : "Current scan unavailable",
      selectedTimestamp,
      selectedPlayerAtStart,
      options: comparisonOptions,
      emptyReason: comparisonOptions.length ? null : "Kein älterer vollständiger Scan verfügbar",
    },
    xp: buildXpSeries(rangedSegments, playerName),
    stats: buildStatsSeries(rangedSnapshots),
    career: buildCareerTimeline(snapshots),
  };
}

function buildXpSeries(segments: PlayerPerformancePair[], playerName: string): LocalPlayerAnalyticsResult["xp"] {
  const playerPoints = segments
    .map((pair) => {
      const value = finiteNumber(pair.xpPerDayTrend) ?? finiteNumber(pair.xpPerDay);
      if (value == null || pair.xpDelta == null || pair.xpDelta < 0) return null;
      return toPairPoint(pair, value, pair.xpPerDay);
    })
    .filter((point): point is LocalAnalyticsPoint => Boolean(point));
  const guildAveragePoints = segments
    .map((pair) => {
      const value = finiteNumber(pair.guildReference.xpPerDay.averagePerDay);
      if (value == null || pair.guildReference.xpPerDay.reason) return null;
      return toPairPoint(pair, value, value);
    })
    .filter((point): point is LocalAnalyticsPoint => Boolean(point));

  return {
    series: [
      {
        id: "player-xp",
        label: playerName,
        color: "#3ff1c3",
        points: playerPoints,
      },
      ...(guildAveragePoints.length
        ? [
            {
              id: "guild-average-xp",
              label: "Guild Average",
              color: "#5c8bc6",
              points: guildAveragePoints,
            },
          ]
        : []),
    ],
    hasGuildAverage: guildAveragePoints.length > 0,
    guildAverageDefinition: "Snapshot average delta per elapsed day across comparable guild snapshots.",
  };
}

function buildStatsSeries(snapshots: PlayerPerformanceSnapshot[]): LocalPlayerAnalyticsResult["stats"] {
  const points = snapshots
    .map((snapshot): LocalAnalyticsPoint | null => {
      const value = finiteNumber(snapshot.baseStats);
      if (value == null) return null;
      return {
        timestamp: snapshot.scannedAtMs,
        label: formatDate(snapshot.scannedAtMs),
        value,
        rawValue: value,
        detail: `${formatDate(snapshot.scannedAtMs)}: ${formatCompact(value)}`,
      };
    })
    .filter((point): point is LocalAnalyticsPoint => Boolean(point));

  return {
    series: [
      {
        id: "focused-base-stats",
        label: "Focused Base Stats",
        color: "#5c8bc6",
        points,
      },
    ],
    description: "Existing derived focusedBaseStats series. Historical individual attributes are not available in the current derived snapshots.",
  };
}

function buildCareerTimeline(snapshots: PlayerPerformanceSnapshot[]): LocalPlayerAnalyticsResult["career"] {
  const observedServers = dedupeConsecutive(
    snapshots
      .map((snapshot) => resolveServer(snapshot.server))
      .filter((server): server is NonNullable<ReturnType<typeof resolveServer>> => Boolean(server)),
    (server) => server.code,
  );
  const events: LocalCareerEvent[] = [];

  for (let index = 1; index < observedServers.length; index += 1) {
    const from = observedServers[index - 1];
    const to = observedServers[index];
    const lineage = getFusionLineage(from.code);
    const fromIndex = lineage.findIndex((server) => server.code === from.code);
    const toIndex = lineage.findIndex((server) => server.code === to.code);
    if (fromIndex < 0 || toIndex <= fromIndex) continue;

    for (let lineageIndex = fromIndex; lineageIndex < toIndex; lineageIndex += 1) {
      const origin = lineage[lineageIndex];
      const target = lineage[lineageIndex + 1];
      const fusionEvent = getFusionEvent(origin.code, target.code);
      if (!fusionEvent || !isFusionEventEffective(fusionEvent)) continue;

      if (!events.length) {
        events.push({
          id: `origin-${origin.code}`,
          label: origin.displayName,
          dateLabel: "Origin",
          tone: "origin",
        });
      }
      if (!events.some((event) => event.id === fusionEvent.id)) {
        events.push({
          id: fusionEvent.id,
          label: target.displayName,
          dateLabel: fusionEvent.effectiveDate ?? "Date unknown",
          tone: "fusion",
        });
      }
    }
  }

  const hasFusionEvent = events.some((event) => event.tone === "fusion");
  const currentServer = observedServers[observedServers.length - 1] ?? null;
  if (events.length && currentServer) {
    const lastEvent = events[events.length - 1];
    if (lastEvent.label !== currentServer.displayName) {
      events.push({
        id: `current-${currentServer.code}`,
        label: currentServer.displayName,
        dateLabel: "Current",
        tone: "current",
      });
    } else {
      events[events.length - 1] = { ...lastEvent, tone: "current" };
    }
  }

  return {
    title: hasFusionEvent ? "FUSION HISTORY" : "CAREER TIMELINE",
    events,
    emptyReason: events.length ? null : "No confirmed fusion events in player history",
  };
}

function toPairPoint(pair: PlayerPerformancePair, value: number, rawValue: number | null): LocalAnalyticsPoint {
  return {
    timestamp: pair.end.scannedAtMs,
    label: formatDate(pair.end.scannedAtMs),
    value,
    rawValue,
    detail: `${formatDate(pair.start.scannedAtMs)} to ${formatDate(pair.end.scannedAtMs)}: ${formatCompact(value)} / day`,
  };
}

function formatPeriodLabel(snapshots: PlayerPerformanceSnapshot[]) {
  if (snapshots.length < 2) {
    const only = snapshots[0];
    return only ? formatDate(only.scannedAtMs) : "No scan history";
  }
  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const days = Math.max(0, Math.round((last.scannedAtMs - first.scannedAtMs) / DAY_MS));
  return `${formatDate(first.scannedAtMs)} - ${formatDate(last.scannedAtMs)} (${days}d)`;
}

function formatPeriodLabelForRange(
  snapshots: PlayerPerformanceSnapshot[],
  selectedTimestamp: number | null,
  currentTimestamp: number | null,
  selectedPlayerAtStart: boolean,
) {
  if (selectedTimestamp != null && currentTimestamp != null) {
    const days = Math.max(0, Math.round((currentTimestamp - selectedTimestamp) / DAY_MS));
    const suffix = selectedPlayerAtStart ? `${days}d` : `${days}d, player missing at start`;
    return `${formatDate(selectedTimestamp)} - ${formatDate(currentTimestamp)} (${suffix})`;
  }
  return formatPeriodLabel(snapshots);
}

function resolveCurrentTimestamp(profile: LocalPlayerProfileModel, snapshots: PlayerPerformanceSnapshot[]) {
  if (Number.isFinite(profile.analytics.scannedAtMs) && profile.analytics.scannedAtMs > 0) {
    return profile.analytics.scannedAtMs;
  }
  return snapshots[snapshots.length - 1]?.scannedAtMs ?? null;
}

function resolveCurrentGuildIdentifier(
  profile: LocalPlayerProfileModel,
  snapshots: PlayerPerformanceSnapshot[],
  currentTimestamp: number | null,
) {
  const currentSnapshot =
    currentTimestamp == null ? null : snapshots.find((snapshot) => snapshot.scannedAtMs === currentTimestamp) ?? null;
  return currentSnapshot?.guildIdentifier ?? profile.analytics.guildIdentifier ?? null;
}

function buildComparisonOptions({
  analyticsData,
  currentTimestamp,
  guildIdentifier,
}: {
  analyticsData: GuildAnalyticsDerivedData;
  currentTimestamp: number | null;
  guildIdentifier: string | null;
}) {
  if (currentTimestamp == null || !guildIdentifier) return [];
  const normalizedGuildIdentifier = guildIdentifier.toLowerCase();
  const byTimestamp = new Map<number, LocalComparisonScanOption>();

  buildGuildSnapshotCompletenessReports(analyticsData)
    .filter((report) => report.completeForPerformance)
    .filter((report) => report.guildIdentifier?.toLowerCase() === normalizedGuildIdentifier)
    .filter((report) => report.scannedAtMs < currentTimestamp)
    .forEach((report) => {
      const elapsedMs = currentTimestamp - report.scannedAtMs;
      const option: LocalComparisonScanOption = {
        timestamp: report.scannedAtMs,
        sourceScanId: report.sourceScanId,
        snapshotId: report.snapshotId,
        label: formatDateNumeric(report.scannedAtMs),
        distanceLabel: formatElapsedDistance(elapsedMs),
      };
      const previous = byTimestamp.get(option.timestamp);
      if (!previous || option.sourceScanId.localeCompare(previous.sourceScanId) > 0) {
        byTimestamp.set(option.timestamp, option);
      }
    });

  return [...byTimestamp.values()].sort((left, right) => right.timestamp - left.timestamp);
}

function resolveSelectedComparisonTimestamp(
  options: LocalComparisonScanOption[],
  currentTimestamp: number | null,
  requestedTimestamp?: number | null,
) {
  if (!options.length) return null;
  if (requestedTimestamp != null && options.some((option) => option.timestamp === requestedTimestamp)) {
    return requestedTimestamp;
  }
  if (currentTimestamp == null) return options[options.length - 1]?.timestamp ?? null;

  const withDistance = options.map((option) => ({
    option,
    elapsedDays: (currentTimestamp - option.timestamp) / DAY_MS,
  }));
  const atLeastThirty = withDistance
    .filter((entry) => entry.elapsedDays >= DEFAULT_COMPARISON_DAYS)
    .sort((left, right) => left.elapsedDays - right.elapsedDays)[0];
  if (atLeastThirty) return atLeastThirty.option.timestamp;

  return options[options.length - 1]?.timestamp ?? null;
}

function filterSnapshotsForRange(
  snapshots: PlayerPerformanceSnapshot[],
  selectedTimestamp: number | null,
  currentTimestamp: number | null,
) {
  if (selectedTimestamp == null || currentTimestamp == null) return snapshots;
  return snapshots.filter((snapshot) => snapshot.scannedAtMs >= selectedTimestamp && snapshot.scannedAtMs <= currentTimestamp);
}

function filterSegmentsForRange(
  segments: PlayerPerformancePair[],
  selectedTimestamp: number | null,
  currentTimestamp: number | null,
) {
  if (selectedTimestamp == null || currentTimestamp == null) return segments;
  return segments.filter(
    (segment) =>
      segment.start.scannedAtMs >= selectedTimestamp &&
      segment.end.scannedAtMs <= currentTimestamp &&
      segment.start.scannedAtMs < segment.end.scannedAtMs,
  );
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "2-digit" }).format(new Date(timestamp));
}

function formatDateNumeric(timestamp: number) {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(timestamp));
}

function formatElapsedDistance(elapsedMs: number) {
  const safeMs = Math.max(0, elapsedMs);
  const hours = safeMs / 3_600_000;
  if (hours < 24) {
    return `vor ${Math.max(1, Math.round(hours)).toLocaleString("de-DE")} Stunden`;
  }
  const days = safeMs / DAY_MS;
  return `vor ${days.toLocaleString("de-DE", { maximumFractionDigits: days < 10 ? 1 : 0 })} Tagen`;
}

function formatCompact(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dedupeConsecutive<T>(items: T[], getKey: (item: T) => string) {
  const result: T[] = [];
  items.forEach((item) => {
    const previous = result[result.length - 1];
    if (previous && getKey(previous) === getKey(item)) return;
    result.push(item);
  });
  return result;
}
