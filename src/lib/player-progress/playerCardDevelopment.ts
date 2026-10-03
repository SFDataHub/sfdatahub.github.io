import type { GuildAnalyticsDerivedData, GuildAnalyticsMemberSnapshot } from "../guilds/localGuildAnalyticsStore";
import {
  buildGuildSnapshotCompletenessReports,
  type GuildSnapshotCompletenessReport,
} from "../guilds/guildSnapshotCompleteness";
import {
  collectGuildIdentityObservations,
  collectPlayerIdentityObservations,
  resolveGuildIdentity,
  type IdentityResolutionSnapshot,
} from "../identities/identityResolution";
import { resolveDefaultComparisonTimestamp } from "./comparisonScanSelection";

const DAY_MS = 86_400_000;
const TREND_EPSILON = 1e-9;
const MAX_TREND_RATES = 4;

export type PlayerCardDevelopmentMetricKey = "baseStats" | "level";
export type PlayerCardDevelopmentTrendState =
  | "strong-up"
  | "clear-up"
  | "slight-up"
  | "stable"
  | "slight-down"
  | "clear-down"
  | "strong-down"
  | "unknown";
export type PlayerCardDevelopmentComparisonTone =
  | "none"
  | "turquoise"
  | "green"
  | "ice-blue"
  | "blue-violet"
  | "amber"
  | "orange"
  | "red";

export type PlayerCardDevelopmentSourceEntry = {
  playerKey: string;
  name: string;
  server: string | null;
  memberRef: string | null;
  sourceScanId: string;
  scannedAtMs: number;
  guildIdentifier: string | null;
  guildName: string | null;
  level: number | null;
  baseStats: number | null;
};

export type PlayerCardDevelopmentTrend = {
  state: PlayerCardDevelopmentTrendState;
  rates: number[];
};

export type PlayerCardDevelopmentMetric = {
  key: PlayerCardDevelopmentMetricKey;
  label: string;
  playerDelta: number | null;
  playerPerDay: number | null;
  playerTone: PlayerCardDevelopmentComparisonTone;
  guildDelta: number | null;
  guildPerDay: number | null;
  playerTrend: PlayerCardDevelopmentTrend;
  guildTrend: PlayerCardDevelopmentTrend;
};

export type PlayerCardDevelopmentSummary = {
  currentTimestamp: number | null;
  selectedTimestamp: number | null;
  elapsedDays: number | null;
  baseStats: PlayerCardDevelopmentMetric;
  level: PlayerCardDevelopmentMetric;
};

type GuildAverageSnapshot = {
  timestamp: number;
  sourceScanId: string;
  snapshotId: string;
  guildIdentifier: string;
  averageLevel: number | null;
  averageFocusedBaseStats: number | null;
};

type RateInterval = {
  startTimestamp: number;
  endTimestamp: number;
  elapsedDays: number;
  delta: number;
  perDay: number;
  trendPerDay: number | null;
};

type ComparisonToneContext = {
  metric: PlayerCardDevelopmentMetricKey;
  elapsedDays: number | null;
  playerDelta: number | null;
  guildDelta: number | null;
  playerIntervals: RateInterval[];
  guildIntervals: RateInterval[];
  selectedTimestamp: number | null;
  currentTimestamp: number | null;
};

export function buildPlayerCardDevelopmentLookup(
  entries: PlayerCardDevelopmentSourceEntry[],
  options: {
    analyticsData?: GuildAnalyticsDerivedData | null;
    identityResolutionSnapshot?: IdentityResolutionSnapshot | null;
  } = {},
) {
  const analyticsData = options.analyticsData ?? null;
  const identityResolutionSnapshot = options.identityResolutionSnapshot ?? null;
  const groupedEntries = groupEntriesByPlayerKey(entries);
  const completeReports = buildGuildSnapshotCompletenessReports(analyticsData);
  const guildSnapshotCache = new Map<string, GuildAverageSnapshot[]>();
  const summaries = new Map<string, PlayerCardDevelopmentSummary>();

  groupedEntries.forEach((playerEntries, playerKey) => {
    const orderedEntries = dedupePlayerEntries(playerEntries).sort(compareEntriesByTime);
    const current = orderedEntries[orderedEntries.length - 1] ?? null;
    if (!current) return;

    const playerHistory = selectResolvedPlayerHistory(entries, current, identityResolutionSnapshot);
    const currentTimestamp = current.scannedAtMs;
    const guildAverages = current.guildIdentifier
      ? getCachedGuildAverageSnapshots({
          analyticsData,
          completeReports,
          currentTimestamp,
          guildIdentifier: current.guildIdentifier,
          identityResolutionSnapshot,
          cache: guildSnapshotCache,
        })
      : [];
    const comparisonOptions = guildAverages
      .filter((snapshot) => snapshot.timestamp < currentTimestamp)
      .sort((left, right) => right.timestamp - left.timestamp || right.sourceScanId.localeCompare(left.sourceScanId))
      .map((snapshot) => ({ timestamp: snapshot.timestamp }));
    const selectedTimestamp = resolveDefaultComparisonTimestamp(comparisonOptions, currentTimestamp);
    const elapsedDays = getElapsedDays(selectedTimestamp, currentTimestamp);

    summaries.set(playerKey, {
      currentTimestamp,
      selectedTimestamp,
      elapsedDays,
      baseStats: buildDevelopmentMetric({
        key: "baseStats",
        label: "Basiswerte",
        playerHistory,
        guildAverages,
        selectedTimestamp,
        currentTimestamp,
        elapsedDays,
      }),
      level: buildDevelopmentMetric({
        key: "level",
        label: "Level",
        playerHistory,
        guildAverages,
        selectedTimestamp,
        currentTimestamp,
        elapsedDays,
      }),
    });
  });

  return summaries;
}

export function classifyDevelopmentTrend(
  previous: number | null | undefined,
  current: number | null | undefined,
  epsilon = TREND_EPSILON,
): PlayerCardDevelopmentTrendState {
  if (!isFiniteNumber(previous) || !isFiniteNumber(current)) return "unknown";
  const denominator = Math.max(Math.abs(current), Math.abs(previous), epsilon);
  const relativeChange = (current - previous) / denominator;
  if (relativeChange > 0.35) return "strong-up";
  if (relativeChange > 0.15) return "clear-up";
  if (relativeChange > 0.05) return "slight-up";
  if (relativeChange >= -0.05) return "stable";
  if (relativeChange >= -0.15) return "slight-down";
  if (relativeChange >= -0.35) return "clear-down";
  return "strong-down";
}

export function classifyTrendFromSmoothedValues(values: Array<number | null | undefined>) {
  const finiteValues = values.filter(isFiniteNumber);
  if (finiteValues.length < 2) return "unknown";
  return classifyDevelopmentTrend(finiteValues[finiteValues.length - 2], finiteValues[finiteValues.length - 1]);
}

export function formatPlayerCardDevelopmentPeriod(
  startTimestamp: number | null,
  endTimestamp: number | null,
  elapsedDays: number | null,
) {
  if (startTimestamp == null || endTimestamp == null || elapsedDays == null) return "Kein Vergleichsscan";
  if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp) || !Number.isFinite(elapsedDays)) return "Kein Vergleichsscan";
  const days = Math.max(0, Math.round(elapsedDays));
  return `${formatCompactDevelopmentDate(startTimestamp)} - ${formatCompactDevelopmentDate(endTimestamp)} · ${days.toLocaleString("de-DE")} ${days === 1 ? "Tag" : "Tage"}`;
}

export function classifyPlayerComparisonTone({
  metric,
  elapsedDays,
  playerDelta,
  guildDelta,
  playerIntervals,
  guildIntervals,
  selectedTimestamp,
  currentTimestamp,
}: ComparisonToneContext): PlayerCardDevelopmentComparisonTone {
  if (!isFiniteNumber(playerDelta) || !isFiniteNumber(guildDelta) || guildDelta <= 0) return "none";
  const ratio = playerDelta / guildDelta;
  if (!Number.isFinite(ratio)) return "none";
  if (ratio >= 1.3) return "turquoise";
  if (ratio >= 1.1) return "green";
  if (ratio >= 0.9) return "ice-blue";
  if (ratio >= 0.7) return "blue-violet";

  const canShowWarning = elapsedDays != null && elapsedDays >= 14 && passesLevelWarningGate(metric, guildDelta);
  if (!canShowWarning) return "blue-violet";
  if (ratio >= 0.5) return "amber";
  if (ratio >= 0.25) return "orange";
  if (
    elapsedDays != null &&
    elapsedDays >= 30 &&
    passesLevelWarningGate(metric, guildDelta) &&
    previousComparisonRatioBelow({
      playerIntervals,
      guildIntervals,
      selectedTimestamp,
      currentTimestamp,
      threshold: 0.4,
    })
  ) {
    return "red";
  }
  return "blue-violet";
}

export function attachWeightedPerDayTrends(intervals: Omit<RateInterval, "trendPerDay">[]): RateInterval[] {
  return intervals.map((interval, index) => ({
    ...interval,
    trendPerDay: calculateWeightedPerDayTrend(intervals, index),
  }));
}

function buildDevelopmentMetric({
  key,
  label,
  playerHistory,
  guildAverages,
  selectedTimestamp,
  currentTimestamp,
  elapsedDays,
}: {
  key: PlayerCardDevelopmentMetricKey;
  label: string;
  playerHistory: PlayerCardDevelopmentSourceEntry[];
  guildAverages: GuildAverageSnapshot[];
  selectedTimestamp: number | null;
  currentTimestamp: number | null;
  elapsedDays: number | null;
}): PlayerCardDevelopmentMetric {
  const playerStart = playerHistory.find((entry) => entry.scannedAtMs === selectedTimestamp) ?? null;
  const playerEnd = playerHistory.find((entry) => entry.scannedAtMs === currentTimestamp) ?? null;
  const guildStart = guildAverages.find((snapshot) => snapshot.timestamp === selectedTimestamp) ?? null;
  const guildEnd = guildAverages.find((snapshot) => snapshot.timestamp === currentTimestamp) ?? null;
  const playerIntervals = buildRateIntervals(playerHistory, key);
  const guildIntervals = buildRateIntervals(guildAverages, key);
  const playerDelta = calculateEndpointDelta(getPlayerMetricValue(playerStart, key), getPlayerMetricValue(playerEnd, key));
  const guildDelta = calculateEndpointDelta(getGuildMetricValue(guildStart, key), getGuildMetricValue(guildEnd, key));

  return {
    key,
    label,
    playerDelta,
    playerPerDay: elapsedDays == null ? null : calculateEndpointRateFromDelta(playerDelta, elapsedDays),
    playerTone: classifyPlayerComparisonTone({
      metric: key,
      elapsedDays,
      playerDelta,
      guildDelta,
      playerIntervals,
      guildIntervals,
      selectedTimestamp,
      currentTimestamp,
    }),
    guildDelta,
    guildPerDay: elapsedDays == null ? null : calculateEndpointRateFromDelta(guildDelta, elapsedDays),
    playerTrend: buildTrend(playerIntervals),
    guildTrend: buildTrend(guildIntervals),
  };
}

function buildRateIntervals(
  points: Array<PlayerCardDevelopmentSourceEntry | GuildAverageSnapshot>,
  metric: PlayerCardDevelopmentMetricKey,
) {
  const sorted = [...points].sort((left, right) => getPointTimestamp(left) - getPointTimestamp(right));
  const intervals: Omit<RateInterval, "trendPerDay">[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const start = sorted[index - 1];
    const end = sorted[index];
    const elapsedDays = (getPointTimestamp(end) - getPointTimestamp(start)) / DAY_MS;
    if (!Number.isFinite(elapsedDays) || elapsedDays <= 0) continue;
    const startValue = isGuildAverageSnapshot(start) ? getGuildMetricValue(start, metric) : getPlayerMetricValue(start, metric);
    const endValue = isGuildAverageSnapshot(end) ? getGuildMetricValue(end, metric) : getPlayerMetricValue(end, metric);
    if (!isFiniteNumber(startValue) || !isFiniteNumber(endValue)) continue;
    const delta = endValue - startValue;
    intervals.push({
      startTimestamp: getPointTimestamp(start),
      endTimestamp: getPointTimestamp(end),
      elapsedDays,
      delta,
      perDay: delta / elapsedDays,
    });
  }
  return attachWeightedPerDayTrends(intervals);
}

function buildTrend(intervals: RateInterval[]): PlayerCardDevelopmentTrend {
  const rates = intervals.map((interval) => interval.trendPerDay).filter(isFiniteNumber).slice(-MAX_TREND_RATES);
  return {
    state: rates.length < 2 ? "unknown" : classifyTrendFromSmoothedValues(rates),
    rates,
  };
}

function calculateWeightedPerDayTrend(intervals: Omit<RateInterval, "trendPerDay">[], index: number) {
  const candidateIndexes =
    index === 0
      ? [index, index + 1]
      : index === intervals.length - 1
        ? [index - 1, index]
        : [index - 1, index, index + 1];
  let deltaSum = 0;
  let daySum = 0;

  candidateIndexes.forEach((candidateIndex) => {
    const interval = intervals[candidateIndex];
    if (!interval || !Number.isFinite(interval.elapsedDays) || interval.elapsedDays <= 0) return;
    if (!Number.isFinite(interval.delta)) return;
    deltaSum += interval.delta;
    daySum += interval.elapsedDays;
  });

  return daySum > 0 ? deltaSum / daySum : null;
}

function previousComparisonRatioBelow({
  playerIntervals,
  guildIntervals,
  selectedTimestamp,
  currentTimestamp,
  threshold,
}: {
  playerIntervals: RateInterval[];
  guildIntervals: RateInterval[];
  selectedTimestamp: number | null;
  currentTimestamp: number | null;
  threshold: number;
}) {
  if (selectedTimestamp == null || currentTimestamp == null) return false;
  const currentKey = intervalKey(selectedTimestamp, currentTimestamp);
  const guildByInterval = new Map(guildIntervals.map((interval) => [intervalKey(interval.startTimestamp, interval.endTimestamp), interval]));
  const ratios = playerIntervals
    .map((playerInterval) => {
      const key = intervalKey(playerInterval.startTimestamp, playerInterval.endTimestamp);
      if (key === currentKey || playerInterval.endTimestamp > selectedTimestamp) return null;
      const guildInterval = guildByInterval.get(key);
      if (!guildInterval || guildInterval.delta <= 0) return null;
      const ratio = playerInterval.delta / guildInterval.delta;
      return Number.isFinite(ratio) ? { ratio, endTimestamp: playerInterval.endTimestamp } : null;
    })
    .filter((entry): entry is { ratio: number; endTimestamp: number } => Boolean(entry))
    .sort((left, right) => left.endTimestamp - right.endTimestamp);
  const previous = ratios[ratios.length - 1] ?? null;
  return previous ? previous.ratio < threshold : false;
}

function passesLevelWarningGate(metric: PlayerCardDevelopmentMetricKey, guildDelta: number) {
  return metric !== "level" || guildDelta >= 1;
}

function intervalKey(startTimestamp: number, endTimestamp: number) {
  return `${startTimestamp}:${endTimestamp}`;
}

function getCachedGuildAverageSnapshots({
  analyticsData,
  completeReports,
  currentTimestamp,
  guildIdentifier,
  identityResolutionSnapshot,
  cache,
}: {
  analyticsData: GuildAnalyticsDerivedData | null;
  completeReports: GuildSnapshotCompletenessReport[];
  currentTimestamp: number;
  guildIdentifier: string;
  identityResolutionSnapshot: IdentityResolutionSnapshot | null;
  cache: Map<string, GuildAverageSnapshot[]>;
}) {
  if (!analyticsData) return [];
  const cacheKey = `${resolveGuildCacheKey(guildIdentifier, identityResolutionSnapshot)}::${currentTimestamp}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const reports = collectCompleteReportsForGuildIdentity(completeReports, guildIdentifier, identityResolutionSnapshot)
    .filter((report) => report.scannedAtMs <= currentTimestamp);
  const snapshots = dedupeGuildAverageSnapshots(
    reports
      .map((report): GuildAverageSnapshot | null => {
        if (!report.guildIdentifier) return null;
        const members = dedupeAnalyticsMembers(
          analyticsData.members.filter(
            (member) =>
              member.snapshotId === report.snapshotId &&
              member.guildIdentifier?.toLowerCase() === report.guildIdentifier?.toLowerCase(),
          ),
        );
        const levelValues = members.map((member) => member.level).filter(isFiniteNumber);
        const baseValues = members.map((member) => member.focusedBaseStats).filter(isFiniteNumber);
        return {
          timestamp: report.scannedAtMs,
          sourceScanId: report.sourceScanId,
          snapshotId: report.snapshotId,
          guildIdentifier: report.guildIdentifier,
          averageLevel: levelValues.length === report.foundUniqueMemberCount ? average(levelValues) : null,
          averageFocusedBaseStats: baseValues.length === report.foundUniqueMemberCount ? average(baseValues) : null,
        };
      })
      .filter((snapshot): snapshot is GuildAverageSnapshot => Boolean(snapshot)),
  );
  cache.set(cacheKey, snapshots);
  return snapshots;
}

function collectCompleteReportsForGuildIdentity(
  reports: GuildSnapshotCompletenessReport[],
  guildIdentifier: string,
  identityResolutionSnapshot: IdentityResolutionSnapshot | null,
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

function selectResolvedPlayerHistory(
  entries: PlayerCardDevelopmentSourceEntry[],
  current: PlayerCardDevelopmentSourceEntry,
  identityResolutionSnapshot: IdentityResolutionSnapshot | null,
) {
  if (current.memberRef && identityResolutionSnapshot) {
    const history = collectPlayerIdentityObservations(identityResolutionSnapshot, current.memberRef, entries, {
      getIdentifier: (entry) => entry.memberRef,
      getTimestamp: (entry) => entry.scannedAtMs,
      getObservationKey: (entry) => `${entry.sourceScanId}:${entry.scannedAtMs}:${entry.memberRef ?? entry.playerKey}`,
    }).observations.map((entry) => entry.observation);
    if (history.length) return dedupePlayerEntries(history).sort(compareEntriesByTime);
  }

  return dedupePlayerEntries(entries.filter((entry) => entry.playerKey === current.playerKey)).sort(compareEntriesByTime);
}

function groupEntriesByPlayerKey(entries: PlayerCardDevelopmentSourceEntry[]) {
  const grouped = new Map<string, PlayerCardDevelopmentSourceEntry[]>();
  entries.forEach((entry) => {
    if (!Number.isFinite(entry.scannedAtMs) || entry.scannedAtMs <= 0) return;
    const playerEntries = grouped.get(entry.playerKey) ?? [];
    playerEntries.push(entry);
    grouped.set(entry.playerKey, playerEntries);
  });
  return grouped;
}

function dedupePlayerEntries(entries: PlayerCardDevelopmentSourceEntry[]) {
  const byScan = new Map<string, PlayerCardDevelopmentSourceEntry>();
  entries.forEach((entry) => {
    if (!Number.isFinite(entry.scannedAtMs) || entry.scannedAtMs <= 0) return;
    const key = `${entry.sourceScanId}:${entry.scannedAtMs}`;
    const previous = byScan.get(key);
    if (!previous || scoreEntryCompleteness(entry) >= scoreEntryCompleteness(previous)) byScan.set(key, entry);
  });
  return [...byScan.values()];
}

function dedupeGuildAverageSnapshots(snapshots: GuildAverageSnapshot[]) {
  const byTimestamp = new Map<number, GuildAverageSnapshot>();
  snapshots.forEach((snapshot) => {
    const previous = byTimestamp.get(snapshot.timestamp);
    if (!previous || snapshot.sourceScanId.localeCompare(previous.sourceScanId) > 0) {
      byTimestamp.set(snapshot.timestamp, snapshot);
    }
  });
  return [...byTimestamp.values()].sort((left, right) => left.timestamp - right.timestamp);
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

function scoreEntryCompleteness(entry: PlayerCardDevelopmentSourceEntry) {
  return Number(isFiniteNumber(entry.level)) + Number(isFiniteNumber(entry.baseStats));
}

function scoreAnalyticsMemberValues(member: GuildAnalyticsMemberSnapshot) {
  return Number(isFiniteNumber(member.level)) + Number(isFiniteNumber(member.focusedBaseStats));
}

function getPlayerMetricValue(entry: PlayerCardDevelopmentSourceEntry | null, metric: PlayerCardDevelopmentMetricKey) {
  if (!entry) return null;
  return metric === "level" ? finiteNumber(entry.level) : finiteNumber(entry.baseStats);
}

function getGuildMetricValue(snapshot: GuildAverageSnapshot | null, metric: PlayerCardDevelopmentMetricKey) {
  if (!snapshot) return null;
  return metric === "level" ? finiteNumber(snapshot.averageLevel) : finiteNumber(snapshot.averageFocusedBaseStats);
}

function calculateEndpointDelta(start: number | null, end: number | null) {
  if (start == null || end == null) return null;
  const value = end - start;
  return Number.isFinite(value) ? value : null;
}

function calculateEndpointRateFromDelta(delta: number | null, elapsedDays: number) {
  if (delta == null || !Number.isFinite(elapsedDays) || elapsedDays <= 0) return null;
  const value = delta / elapsedDays;
  return Number.isFinite(value) ? value : null;
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

function resolveGuildCacheKey(guildIdentifier: string, identityResolutionSnapshot: IdentityResolutionSnapshot | null) {
  if (!identityResolutionSnapshot) return guildIdentifier.toLowerCase();
  const resolution = resolveGuildIdentity(identityResolutionSnapshot, guildIdentifier);
  return resolution.resolved ? `identity:${resolution.identityId}` : guildIdentifier.toLowerCase();
}

function getPointTimestamp(point: PlayerCardDevelopmentSourceEntry | GuildAverageSnapshot) {
  return isGuildAverageSnapshot(point) ? point.timestamp : point.scannedAtMs;
}

function isGuildAverageSnapshot(point: PlayerCardDevelopmentSourceEntry | GuildAverageSnapshot): point is GuildAverageSnapshot {
  return "timestamp" in point;
}

function compareEntriesByTime(a: PlayerCardDevelopmentSourceEntry, b: PlayerCardDevelopmentSourceEntry) {
  return a.scannedAtMs - b.scannedAtMs || a.sourceScanId.localeCompare(b.sourceScanId);
}

function finiteNumber(value: unknown) {
  return isFiniteNumber(value) ? value : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatCompactDevelopmentDate(timestamp: number) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(timestamp));
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
