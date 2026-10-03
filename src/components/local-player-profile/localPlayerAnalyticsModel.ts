import {
  getGuildHubLocalScan,
  listGuildHubScanSummaries,
} from "../../lib/guilds/localScanLibrary";
import {
  ensureGuildAnalyticsDerivedDataFromSummaries,
  type GuildAnalyticsDerivedData,
  type GuildAnalyticsMemberSnapshot,
} from "../../lib/guilds/localGuildAnalyticsStore";
import { buildGuildSnapshotCompletenessReports } from "../../lib/guilds/guildSnapshotCompleteness";
import {
  collectGuildIdentityObservations,
  loadIdentityResolutionSnapshot,
  resolveGuildIdentity,
  type IdentityResolutionSnapshot,
} from "../../lib/identities/identityResolution";
import {
  getFusionEvent,
  getFusionLineage,
  isFusionEventEffective,
  resolveServer,
} from "../../lib/servers/serverResolver";
import {
  buildPlayerPerformanceModel,
  type PlayerPerformanceBuildResult,
  type PlayerPerformanceSnapshot,
} from "../../pages/Playground/playerPerformanceModel";
import { resolveSelectedComparisonTimestamp as resolveSharedSelectedComparisonTimestamp } from "../../lib/player-progress/comparisonScanSelection";
import type { LocalPlayerProfileModel } from "./types";

const DAY_MS = 86_400_000;

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

export type LocalAnalyticsTimeDomain = {
  min: number;
  max: number;
};

export type LocalPeriodRateSummary = {
  player: number | null;
  guildAverage: number | null;
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
    chartTimeDomain: LocalAnalyticsTimeDomain | null;
    options: LocalComparisonScanOption[];
    emptyReason: string | null;
  };
  xp: {
    series: LocalAnalyticsSeries[];
    hasGuildAverage: boolean;
    guildAverageDefinition: string;
    rateSummary: LocalPeriodRateSummary;
  };
  stats: {
    series: LocalAnalyticsSeries[];
    description: string;
    rateSummary: LocalPeriodRateSummary;
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
  const currentTimestamp = resolveCurrentTimestamp(profile, snapshots);
  const currentGuildIdentifier = resolveCurrentGuildIdentifier(profile, snapshots, currentTimestamp);
  const comparisonOptions = buildComparisonOptions({
    analyticsData,
    currentTimestamp,
    guildIdentifier: currentGuildIdentifier,
    identityResolutionSnapshot,
  });
  const selectedTimestamp = resolveSelectedComparisonTimestamp(
    comparisonOptions,
    currentTimestamp,
    selectedComparisonTimestamp,
  );
  const selectedPlayerAtStart =
    selectedTimestamp != null && snapshots.some((snapshot) => snapshot.scannedAtMs === selectedTimestamp);
  const rangedSnapshots = filterSnapshotsForRange(snapshots, selectedTimestamp, currentTimestamp);
  const guildAverageSnapshots = buildGuildAverageSnapshotsForRange({
    analyticsData,
    currentTimestamp,
    guildIdentifier: currentGuildIdentifier,
    identityResolutionSnapshot,
    selectedTimestamp,
  });
  const chartTimeDomain = buildChartTimeDomain(selectedTimestamp, currentTimestamp);
  const xpRateSummary = buildPeriodRateSummary({
    playerSnapshots: snapshots,
    guildAverageSnapshots,
    selectedTimestamp,
    currentTimestamp,
    metric: "xp",
  });
  const baseRateSummary = buildPeriodRateSummary({
    playerSnapshots: snapshots,
    guildAverageSnapshots,
    selectedTimestamp,
    currentTimestamp,
    metric: "base",
  });

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
      chartTimeDomain,
      options: comparisonOptions,
      emptyReason: comparisonOptions.length ? null : "Kein älterer vollständiger Scan verfügbar",
    },
    xp: {
      ...buildXpSeries(rangedSnapshots, guildAverageSnapshots, playerName),
      rateSummary: xpRateSummary,
    },
    stats: {
      ...buildStatsSeries(rangedSnapshots),
      rateSummary: baseRateSummary,
    },
    career: buildCareerTimeline(snapshots),
  };
}

export type LocalGuildAverageSnapshot = {
  timestamp: number;
  sourceScanId: string;
  snapshotId: string;
  guildIdentifier: string;
  averageXpTotal: number | null;
  averageFocusedBaseStats: number | null;
};

export function buildXpSeries(
  snapshots: PlayerPerformanceSnapshot[],
  guildAverageSnapshots: LocalGuildAverageSnapshot[],
  playerName: string,
): LocalPlayerAnalyticsResult["xp"] {
  const playerPoints = dedupePointsByTimestamp(
    snapshots
      .map((snapshot): LocalAnalyticsPoint | null => {
        const value = finiteNumber(snapshot.xpTotal);
        if (value == null) return null;
        return {
          timestamp: snapshot.scannedAtMs,
          label: formatDate(snapshot.scannedAtMs),
          value,
          rawValue: value,
          detail: `${formatDate(snapshot.scannedAtMs)}: ${formatCompact(value)} XP`,
        };
      })
      .filter((point): point is LocalAnalyticsPoint => Boolean(point)),
  );
  const guildAveragePoints = dedupePointsByTimestamp(
    guildAverageSnapshots
      .map((snapshot): LocalAnalyticsPoint | null => {
        const value = finiteNumber(snapshot.averageXpTotal);
        if (value == null) return null;
        return {
          timestamp: snapshot.timestamp,
          label: formatDate(snapshot.timestamp),
          value,
          rawValue: value,
          detail: `${formatDate(snapshot.timestamp)}: ${formatCompact(value)} avg XP`,
        };
      })
      .filter((point): point is LocalAnalyticsPoint => Boolean(point)),
  );

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
    guildAverageDefinition: "Absolute average total XP across complete guild snapshots.",
    rateSummary: emptyRateSummary(),
  };
}

export function buildStatsSeries(snapshots: PlayerPerformanceSnapshot[]): LocalPlayerAnalyticsResult["stats"] {
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
    rateSummary: emptyRateSummary(),
  };
}

export function buildPeriodRateSummary({
  playerSnapshots,
  guildAverageSnapshots,
  selectedTimestamp,
  currentTimestamp,
  metric,
}: {
  playerSnapshots: PlayerPerformanceSnapshot[];
  guildAverageSnapshots: LocalGuildAverageSnapshot[];
  selectedTimestamp: number | null;
  currentTimestamp: number | null;
  metric: "xp" | "base";
}): LocalPeriodRateSummary {
  const elapsedDays = getElapsedDays(selectedTimestamp, currentTimestamp);
  if (elapsedDays == null) return emptyRateSummary();

  const playerStart = playerSnapshots.find((snapshot) => snapshot.scannedAtMs === selectedTimestamp) ?? null;
  const playerEnd = playerSnapshots.find((snapshot) => snapshot.scannedAtMs === currentTimestamp) ?? null;
  const guildStart = guildAverageSnapshots.find((snapshot) => snapshot.timestamp === selectedTimestamp) ?? null;
  const guildEnd = guildAverageSnapshots.find((snapshot) => snapshot.timestamp === currentTimestamp) ?? null;

  return {
    player: calculateEndpointRate(getPlayerMetricValue(playerStart, metric), getPlayerMetricValue(playerEnd, metric), elapsedDays),
    guildAverage: calculateEndpointRate(getGuildMetricValue(guildStart, metric), getGuildMetricValue(guildEnd, metric), elapsedDays),
  };
}

export function buildGuildAverageSnapshotsForRange({
  analyticsData,
  currentTimestamp,
  guildIdentifier,
  identityResolutionSnapshot,
  selectedTimestamp,
}: {
  analyticsData: GuildAnalyticsDerivedData;
  currentTimestamp: number | null;
  guildIdentifier: string | null;
  identityResolutionSnapshot?: Pick<IdentityResolutionSnapshot, "guilds"> | null;
  selectedTimestamp: number | null;
}): LocalGuildAverageSnapshot[] {
  if (currentTimestamp == null || !guildIdentifier) return [];
  const reports = collectCompleteReportsForGuildIdentity(
    buildGuildSnapshotCompletenessReports(analyticsData),
    guildIdentifier,
    identityResolutionSnapshot ?? null,
  ).filter((report) => report.scannedAtMs <= currentTimestamp && (selectedTimestamp == null || report.scannedAtMs >= selectedTimestamp));

  const snapshots = reports
    .map((report): LocalGuildAverageSnapshot | null => {
      if (!report.guildIdentifier) return null;
      const members = dedupeAnalyticsMembers(
        analyticsData.members.filter(
          (member) =>
            member.snapshotId === report.snapshotId &&
            member.guildIdentifier?.toLowerCase() === report.guildIdentifier?.toLowerCase(),
        ),
      );
      const xpValues = members.map((member) => member.xpTotal).filter(isFiniteNumber);
      const baseValues = members.map((member) => member.focusedBaseStats).filter(isFiniteNumber);
      return {
        timestamp: report.scannedAtMs,
        sourceScanId: report.sourceScanId,
        snapshotId: report.snapshotId,
        guildIdentifier: report.guildIdentifier,
        averageXpTotal: xpValues.length ? average(xpValues) : null,
        averageFocusedBaseStats: baseValues.length ? average(baseValues) : null,
      };
    })
    .filter((snapshot): snapshot is LocalGuildAverageSnapshot => Boolean(snapshot));

  return dedupeGuildAverageSnapshots(snapshots);
}

export function buildChartTimeDomain(
  selectedTimestamp: number | null,
  currentTimestamp: number | null,
): LocalAnalyticsTimeDomain | null {
  if (
    selectedTimestamp == null ||
    currentTimestamp == null ||
    !Number.isFinite(selectedTimestamp) ||
    !Number.isFinite(currentTimestamp) ||
    selectedTimestamp >= currentTimestamp
  ) {
    return null;
  }
  return { min: selectedTimestamp, max: currentTimestamp };
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

export function buildComparisonOptions({
  analyticsData,
  currentTimestamp,
  guildIdentifier,
  identityResolutionSnapshot,
}: {
  analyticsData: GuildAnalyticsDerivedData;
  currentTimestamp: number | null;
  guildIdentifier: string | null;
  identityResolutionSnapshot?: Pick<IdentityResolutionSnapshot, "guilds"> | null;
}) {
  if (currentTimestamp == null || !guildIdentifier) return [];
  const byTimestamp = new Map<number, LocalComparisonScanOption>();
  const reports = collectCompleteReportsForGuildIdentity(
    buildGuildSnapshotCompletenessReports(analyticsData),
    guildIdentifier,
    identityResolutionSnapshot ?? null,
  );

  reports
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
  return resolveSharedSelectedComparisonTimestamp(options, currentTimestamp, requestedTimestamp);
}

function filterSnapshotsForRange(
  snapshots: PlayerPerformanceSnapshot[],
  selectedTimestamp: number | null,
  currentTimestamp: number | null,
) {
  if (selectedTimestamp == null || currentTimestamp == null) return snapshots;
  return snapshots.filter((snapshot) => snapshot.scannedAtMs >= selectedTimestamp && snapshot.scannedAtMs <= currentTimestamp);
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

function emptyRateSummary(): LocalPeriodRateSummary {
  return { player: null, guildAverage: null };
}

function getElapsedDays(selectedTimestamp: number | null, currentTimestamp: number | null) {
  if (
    selectedTimestamp == null ||
    currentTimestamp == null ||
    !Number.isFinite(selectedTimestamp) ||
    !Number.isFinite(currentTimestamp) ||
    selectedTimestamp >= currentTimestamp
  ) {
    return null;
  }
  const elapsedDays = (currentTimestamp - selectedTimestamp) / DAY_MS;
  return Number.isFinite(elapsedDays) && elapsedDays > 0 ? elapsedDays : null;
}

function getPlayerMetricValue(snapshot: PlayerPerformanceSnapshot | null, metric: "xp" | "base") {
  if (!snapshot) return null;
  return metric === "xp" ? finiteNumber(snapshot.xpTotal) : finiteNumber(snapshot.baseStats);
}

function getGuildMetricValue(snapshot: LocalGuildAverageSnapshot | null, metric: "xp" | "base") {
  if (!snapshot) return null;
  return metric === "xp" ? finiteNumber(snapshot.averageXpTotal) : finiteNumber(snapshot.averageFocusedBaseStats);
}

function calculateEndpointRate(start: number | null, end: number | null, elapsedDays: number) {
  if (start == null || end == null || !Number.isFinite(elapsedDays) || elapsedDays <= 0) return null;
  const value = (end - start) / elapsedDays;
  return Number.isFinite(value) ? value : null;
}

function collectCompleteReportsForGuildIdentity(
  reports: ReturnType<typeof buildGuildSnapshotCompletenessReports>,
  guildIdentifier: string,
  identityResolutionSnapshot: Pick<IdentityResolutionSnapshot, "guilds"> | null,
) {
  const completeReports = reports.filter((report) => report.completeForPerformance);
  if (identityResolutionSnapshot) {
    const resolution = resolveGuildIdentity(identityResolutionSnapshot, guildIdentifier);
    if (resolution.resolved) {
      const history = collectGuildIdentityObservations(identityResolutionSnapshot, guildIdentifier, completeReports, {
        getIdentifier: (report) => report.guildIdentifier,
        getTimestamp: (report) => report.scannedAtMs,
        getObservationKey: (report) => `${report.sourceScanId}:${report.snapshotId}:${report.guildIdentifier ?? ""}`,
      });
      if (history.resolution.resolved) return history.observations.map((entry) => entry.observation);
    }
  }

  const normalizedGuildIdentifier = guildIdentifier.toLowerCase();
  return completeReports.filter((report) => report.guildIdentifier?.toLowerCase() === normalizedGuildIdentifier);
}

function dedupeAnalyticsMembers(members: GuildAnalyticsMemberSnapshot[]) {
  const byRef = new Map<string, GuildAnalyticsMemberSnapshot>();
  members.forEach((member) => {
    const previous = byRef.get(member.memberRef.toLowerCase());
    if (!previous || scoreAnalyticsMemberValues(member) >= scoreAnalyticsMemberValues(previous)) {
      byRef.set(member.memberRef.toLowerCase(), member);
    }
  });
  return [...byRef.values()];
}

function dedupePointsByTimestamp(points: LocalAnalyticsPoint[]) {
  const byTimestamp = new Map<number, LocalAnalyticsPoint>();
  points.forEach((point) => byTimestamp.set(point.timestamp, point));
  return [...byTimestamp.values()].sort((left, right) => left.timestamp - right.timestamp);
}

function dedupeGuildAverageSnapshots(snapshots: LocalGuildAverageSnapshot[]) {
  const byTimestamp = new Map<number, LocalGuildAverageSnapshot>();
  snapshots.forEach((snapshot) => {
    const previous = byTimestamp.get(snapshot.timestamp);
    if (!previous || snapshot.sourceScanId.localeCompare(previous.sourceScanId) > 0) {
      byTimestamp.set(snapshot.timestamp, snapshot);
    }
  });
  return [...byTimestamp.values()].sort((left, right) => left.timestamp - right.timestamp);
}

function scoreAnalyticsMemberValues(member: GuildAnalyticsMemberSnapshot) {
  return Number(isFiniteNumber(member.xpTotal)) + Number(isFiniteNumber(member.focusedBaseStats));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
