import type { GuildHubLocalScan, GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";
import {
  normalizeGuildScanMembers,
  normalizeGuildSegmentForScan,
  type NormalizedGuildMember,
} from "../../lib/guilds/guildScanNormalizer";
import type {
  GuildAnalyticsDerivedData,
  GuildAnalyticsMemberSnapshot,
} from "../../lib/guilds/localGuildAnalyticsStore";
import {
  buildGuildSnapshotCompletenessReports,
  snapshotGuildKey,
  type GuildSnapshotCompletenessReport,
} from "../../lib/guilds/guildSnapshotCompleteness";
import {
  collectPlayerIdentityObservations,
  resolveGuildIdentity,
  resolvePlayerIdentity,
  type IdentityResolutionSnapshot,
} from "../../lib/identities/identityResolution";
import { normalizeServerKeyFromInput } from "../../lib/players/identifier";
import {
  readProgressRadarCombinedBaseStatsForPlayer,
  readProgressRadarTotalXpForPlayer,
} from "./progressRadarModel";

type JsonRecord = Record<string, unknown>;

export type PlayerPerformancePeriodKey = "short" | "medium" | "long";
export type PlayerPerformancePairStatus = "ok" | "missing" | "negative";

export type PlayerPerformanceSnapshot = {
  scanId: string;
  snapshotId: string | null;
  scanLabel: string;
  scannedAtMs: number;
  scannedAtIso: string;
  identifier: string | null;
  memberRef: string | null;
  memberKey: string;
  guildIdentifier: string | null;
  guildKey: string | null;
  name: string;
  server: string | null;
  guildName: string | null;
  xpTotal: number | null;
  baseStats: number | null;
};

export type PlayerPerformanceGuildReference = {
  averagePerDay: number | null;
  delta: number | null;
  method: "Snapshot-Durchschnitt, kein Member-Pairing";
  reason: string | null;
  start: PlayerPerformanceGuildReferenceEndpoint | null;
  end: PlayerPerformanceGuildReferenceEndpoint | null;
};

export type PlayerPerformanceGuildReferenceEndpoint = {
  sourceScanId: string;
  sourceScanFilename: string;
  scannedAtMs: number;
  guildName: string | null;
  guildIdentifier: string | null;
  memberCount: number;
  declaredMemberCount: number | null;
  foundUniqueMemberCount: number;
  validValueCount: number;
  validXpTotalCount: number;
  validFocusedBaseStatsCount: number;
  average: number | null;
};

export type PlayerPerformancePair = {
  start: PlayerPerformanceSnapshot;
  end: PlayerPerformanceSnapshot;
  elapsedDays: number;
  fullDays: number;
  xpDelta: number | null;
  baseDelta: number | null;
  xpPerDay: number | null;
  basePerDay: number | null;
  xpPerDayTrend: number | null;
  focusedBaseStatsPerDayTrend: number | null;
  guildReference: {
    xpPerDay: PlayerPerformanceGuildReference;
    basePerDay: PlayerPerformanceGuildReference;
  };
  status: PlayerPerformancePairStatus;
  notes: string[];
};

export type PlayerPerformancePeriod = {
  key: PlayerPerformancePeriodKey;
  label: string;
  pair: PlayerPerformancePair | null;
  missingReason?: string;
};

export type PlayerPerformanceBuildResult = {
  status: "ready" | "empty" | "missing-player" | "insufficient-history";
  message?: string;
  scanCount: number;
  loadedScanCount: number;
  player: {
    name: string;
    server: string | null;
    guildName: string | null;
    identifier: string | null;
  } | null;
  snapshots: PlayerPerformanceSnapshot[];
  excludedGuildSnapshots: GuildSnapshotCompletenessReport[];
  periods: Record<PlayerPerformancePeriodKey, PlayerPerformancePeriod>;
  segments: PlayerPerformancePair[];
};

export type PlayerPerformanceScanInput = {
  scan: GuildHubLocalScan;
  summary: GuildHubScanSummary;
};

export type PlayerPerformanceAnalyticsInput = {
  analyticsData?: GuildAnalyticsDerivedData | null;
  identityResolutionSnapshot?: IdentityResolutionSnapshot | null;
  target?: PlayerPerformanceTarget | null;
};

export type PlayerPerformanceTarget = {
  name?: string | null;
  server?: string | null;
  memberRef?: string | null;
};

export type GuildTrendMetric = {
  startAverage: number;
  endAverage: number;
  absoluteGrowth: number;
  perDay: number;
  trendPerDay: number | null;
};

export type GuildTrendSnapshot = {
  snapshotId: string;
  sourceScanId: string;
  sourceScanFilename: string;
  scannedAtMs: number;
  guildName: string | null;
  guildIdentifier: string;
  declaredMemberCount: number;
  foundUniqueMemberCount: number;
  validXpTotalCount: number;
  validFocusedBaseStatsCount: number;
  averageXpTotal: number;
  averageFocusedBaseStats: number;
};

export type GuildTrendInterval = {
  start: GuildTrendSnapshot;
  end: GuildTrendSnapshot;
  elapsedDays: number;
  fullDays: number;
  xp: GuildTrendMetric;
  base: GuildTrendMetric;
};

export type GuildTrendPeriod = {
  key: PlayerPerformancePeriodKey;
  label: string;
  interval: GuildTrendInterval | null;
  missingReason?: string;
};

export type GuildTrendBuildResult = {
  status: "ready" | "empty" | "missing-guild" | "insufficient-history";
  message?: string;
  scanCount: number;
  loadedScanCount: number;
  guild: {
    name: string | null;
    identifier: string;
    scopeLabel: string;
  } | null;
  snapshots: GuildTrendSnapshot[];
  excludedGuildSnapshots: GuildSnapshotCompletenessReport[];
  periods: Record<PlayerPerformancePeriodKey, GuildTrendPeriod>;
  intervals: GuildTrendInterval[];
};

type PeriodConfig = {
  key: PlayerPerformancePeriodKey;
  label: string;
  minDays: number;
  maxDays: number | null;
  select: "youngest" | "nearest-30" | "oldest";
};

type ComparisonCandidate = {
  snapshot: PlayerPerformanceSnapshot;
  elapsedDays: number;
  fullDays: number;
};

type AnalyticsIndexes = {
  membersBySnapshotId: Map<string, GuildAnalyticsMemberSnapshot[]>;
  membersBySourceTimeRef: Map<string, GuildAnalyticsMemberSnapshot>;
  guildCompletenessBySnapshotGuild: Map<string, GuildSnapshotCompletenessReport>;
};

type GuildReferenceContext = {
  analyticsIndexes: AnalyticsIndexes;
  identityResolutionSnapshot: IdentityResolutionSnapshot | null;
  fallbackGrouped: Map<string, Map<string, PlayerPerformanceSnapshot>>;
};

const TARGET_NAME = "Darth Monk";
const TARGET_SERVER = "F28";
const DAY_MS = 86_400_000;

const PERIODS: PeriodConfig[] = [
  { key: "short", label: "Kurzfristig", minDays: 1, maxDays: 14, select: "youngest" },
  { key: "medium", label: "Mittelfristig", minDays: 15, maxDays: 45, select: "nearest-30" },
  { key: "long", label: "Langfristig", minDays: 46, maxDays: null, select: "oldest" },
];

export function buildPlayerPerformanceModel(
  inputs: PlayerPerformanceScanInput[],
  analyticsInput: PlayerPerformanceAnalyticsInput = {},
): PlayerPerformanceBuildResult {
  const target = normalizePerformanceTarget(analyticsInput.target);
  const analyticsIndexes = buildAnalyticsIndexes(analyticsInput.analyticsData ?? null);
  const identityResolutionSnapshot = analyticsInput.identityResolutionSnapshot ?? null;
  const analyticsSnapshots = buildEntriesFromAnalytics(analyticsInput.analyticsData ?? null, identityResolutionSnapshot);
  const rawSnapshots = inputs.flatMap(({ scan, summary }) =>
    buildEntriesFromScan(scan, summary, analyticsIndexes, identityResolutionSnapshot),
  );
  const allSnapshots = (analyticsSnapshots.length ? analyticsSnapshots : rawSnapshots)
    .sort(compareSnapshots);
  const targetSnapshots = selectTargetIdentitySnapshots(allSnapshots, identityResolutionSnapshot, target);

  if (!allSnapshots.length) {
    return emptyResult("empty", "Keine lokalen Analytics-Snapshots gefunden.", inputs.length, inputs.length);
  }
  if (!targetSnapshots.length) {
    return emptyResult("missing-player", `${target.name} wurde im lokalen Scanpool nicht gefunden.`, inputs.length, inputs.length);
  }

  const excludedGuildSnapshots = collectExcludedTargetGuildSnapshots(targetSnapshots, analyticsIndexes);
  const snapshots = dedupeSnapshots(
    targetSnapshots.filter((snapshot) => isCompletePerformanceGuildSnapshot(snapshot, analyticsIndexes)),
  );
  if (!snapshots.length) {
    return {
      ...emptyResult(
        "insufficient-history",
        `Für ${target.name} ist kein vollständiger Gildensnapshot mit vollständigen XP- und Basiswerten verfügbar.`,
        countDistinctSourceScans(allSnapshots),
        countDistinctSourceScans(allSnapshots),
      ),
      excludedGuildSnapshots,
    };
  }
  const current = snapshots[snapshots.length - 1];
  const referenceContext = buildGuildReferenceContext(allSnapshots, analyticsIndexes, identityResolutionSnapshot);
  const segments = buildConsecutivePairs(snapshots, referenceContext);
  const periods = Object.fromEntries(
    PERIODS.map((period) => [period.key, buildPeriod(period, snapshots, current, referenceContext)]),
  ) as Record<PlayerPerformancePeriodKey, PlayerPerformancePeriod>;

  return {
    status: snapshots.length >= 2 ? "ready" : "insufficient-history",
    message: snapshots.length >= 2 ? undefined : `Für ${target.name} ist nur ein Scanzeitpunkt verfügbar.`,
    scanCount: countDistinctSourceScans(allSnapshots),
    loadedScanCount: countDistinctSourceScans(allSnapshots),
    player: {
      name: current.name,
      server: current.server,
      guildName: current.guildName,
      identifier: current.identifier,
    },
    snapshots,
    excludedGuildSnapshots,
    periods,
    segments,
  };
}

export function buildGuildTrendModel(
  analyticsInput: PlayerPerformanceAnalyticsInput = {},
): GuildTrendBuildResult {
  const target = normalizePerformanceTarget(analyticsInput.target);
  const data = analyticsInput.analyticsData ?? null;
  const identityResolutionSnapshot = analyticsInput.identityResolutionSnapshot ?? null;
  const analyticsIndexes = buildAnalyticsIndexes(data);

  if (!data?.members.length || !data.guilds.length) {
    return emptyGuildTrendResult("empty", "Keine lokalen Analytics-Gildensnapshots gefunden.", 0, 0);
  }

  const targetGuildIdentifier = findCurrentTargetGuildIdentifier(data.members, identityResolutionSnapshot, target);
  if (!targetGuildIdentifier) {
    return emptyGuildTrendResult("missing-guild", "Die aktuelle Testgilde konnte nicht eindeutig bestimmt werden.", countDistinctGuildSources(data), countDistinctGuildSources(data));
  }

  const guildRows = data.guilds
    .filter((guild) => guild.guildIdentifier && areSameGuildIdentity(guild.guildIdentifier, targetGuildIdentifier, identityResolutionSnapshot))
    .sort((left, right) => left.snapshotTimestamp - right.snapshotTimestamp || left.id.localeCompare(right.id));
  const excludedGuildSnapshots = guildRows
    .map((guild) => analyticsIndexes.guildCompletenessBySnapshotGuild.get(snapshotGuildKey(guild.snapshotId, guild.guildIdentifier ?? "")) ?? null)
    .filter((report): report is GuildSnapshotCompletenessReport => Boolean(report && !report.completeForPerformance))
    .sort((left, right) => left.scannedAtMs - right.scannedAtMs || left.sourceScanId.localeCompare(right.sourceScanId));
  const snapshots = dedupeGuildTrendSnapshots(
    guildRows
      .map((guild) => toGuildTrendSnapshot(guild, analyticsIndexes))
      .filter((snapshot): snapshot is GuildTrendSnapshot => Boolean(snapshot)),
  );

  if (!snapshots.length) {
    return {
      ...emptyGuildTrendResult(
        "insufficient-history",
        "Für die Testgilde ist kein vollständiger Gildensnapshot mit vollständigen XP- und Basiswerten verfügbar.",
        countDistinctGuildSources(data),
        countDistinctGuildSources(data),
      ),
      guild: buildGuildTrendSummary(targetGuildIdentifier, guildRows),
      excludedGuildSnapshots,
    };
  }

  const current = snapshots[snapshots.length - 1];
  const intervals = attachGuildWeightedTrends(buildGuildIntervals(snapshots));
  const periods = Object.fromEntries(
    PERIODS.map((period) => [period.key, buildGuildTrendPeriod(period, snapshots, current)]),
  ) as Record<PlayerPerformancePeriodKey, GuildTrendPeriod>;

  return {
    status: snapshots.length >= 2 ? "ready" : "insufficient-history",
    message: snapshots.length >= 2 ? undefined : "Für die Testgilde ist nur ein vollständiger Scanzeitpunkt verfügbar.",
    scanCount: countDistinctGuildSources(data),
    loadedScanCount: countDistinctGuildSources(data),
    guild: {
      name: current.guildName,
      identifier: current.guildIdentifier,
      scopeLabel: current.guildName ? `${current.guildName} · ${current.guildIdentifier}` : current.guildIdentifier,
    },
    snapshots,
    excludedGuildSnapshots,
    periods,
    intervals,
  };
}

function emptyGuildTrendResult(
  status: GuildTrendBuildResult["status"],
  message: string,
  scanCount: number,
  loadedScanCount: number,
): GuildTrendBuildResult {
  return {
    status,
    message,
    scanCount,
    loadedScanCount,
    guild: null,
    snapshots: [],
    excludedGuildSnapshots: [],
    periods: Object.fromEntries(
      PERIODS.map((period) => [
        period.key,
        {
          key: period.key,
          label: period.label,
          interval: null,
          missingReason: "Kein passendes Scanpaar verfügbar.",
        },
      ]),
    ) as Record<PlayerPerformancePeriodKey, GuildTrendPeriod>,
    intervals: [],
  };
}

function findCurrentTargetGuildIdentifier(
  members: GuildAnalyticsMemberSnapshot[],
  identityResolutionSnapshot: IdentityResolutionSnapshot | null,
  target: Required<PlayerPerformanceTarget>,
) {
  const candidates = selectTargetAnalyticsMembers(members, identityResolutionSnapshot, target);
  return [...candidates]
    .sort((left, right) => left.snapshotTimestamp - right.snapshotTimestamp || left.id.localeCompare(right.id))
    .reverse()
    .find((member) => member.guildIdentifier)?.guildIdentifier ?? null;
}

function selectTargetAnalyticsMembers(
  members: GuildAnalyticsMemberSnapshot[],
  identityResolutionSnapshot: IdentityResolutionSnapshot | null,
  target: Required<PlayerPerformanceTarget>,
) {
  if (target.memberRef) {
    if (identityResolutionSnapshot) {
      return collectPlayerIdentityObservations(identityResolutionSnapshot, target.memberRef, members, {
        getIdentifier: (member) => member.memberRef,
        getTimestamp: (member) => member.snapshotTimestamp,
        getObservationKey: (member) => member.id,
      }).observations.map((entry) => entry.observation);
    }
    const targetRef = target.memberRef.toLowerCase();
    return members.filter((member) => member.memberRef.toLowerCase() === targetRef);
  }

  return members
    .filter((member) => normalizeSearch(member.name) === normalizeSearch(target.name))
    .filter((member) => !target.server || normalizeServer(member.server) === normalizeServer(target.server));
}

function toGuildTrendSnapshot(
  guild: NonNullable<GuildAnalyticsDerivedData["guilds"][number]>,
  analyticsIndexes: AnalyticsIndexes,
): GuildTrendSnapshot | null {
  if (!guild.guildIdentifier) return null;
  const report = analyticsIndexes.guildCompletenessBySnapshotGuild.get(snapshotGuildKey(guild.snapshotId, guild.guildIdentifier));
  if (!report?.completeForPerformance || report.declaredMemberCount == null) return null;
  const members = dedupeAnalyticsSnapshotMembers(
    (analyticsIndexes.membersBySnapshotId.get(guild.snapshotId) ?? []).filter(
      (member) => member.guildIdentifier?.toLowerCase() === guild.guildIdentifier?.toLowerCase(),
    ),
  );
  const averageXpTotal = average(members.map((member) => member.xpTotal).filter(isFiniteNumber));
  const averageFocusedBaseStats = average(members.map((member) => member.focusedBaseStats).filter(isFiniteNumber));
  if (!isFiniteNumber(averageXpTotal) || !isFiniteNumber(averageFocusedBaseStats)) return null;

  return {
    snapshotId: guild.snapshotId,
    sourceScanId: guild.sourceScanId,
    sourceScanFilename: guild.sourceScanFilename,
    scannedAtMs: guild.snapshotTimestamp,
    guildName: guild.guildName,
    guildIdentifier: guild.guildIdentifier,
    declaredMemberCount: report.declaredMemberCount,
    foundUniqueMemberCount: report.foundUniqueMemberCount,
    validXpTotalCount: report.validXpTotalCount,
    validFocusedBaseStatsCount: report.validFocusedBaseStatsCount,
    averageXpTotal,
    averageFocusedBaseStats,
  };
}

function dedupeGuildTrendSnapshots(snapshots: GuildTrendSnapshot[]) {
  const byTimestamp = new Map<number, GuildTrendSnapshot>();
  snapshots.forEach((snapshot) => {
    const previous = byTimestamp.get(snapshot.scannedAtMs);
    if (!previous || snapshot.sourceScanId.localeCompare(previous.sourceScanId) > 0) {
      byTimestamp.set(snapshot.scannedAtMs, snapshot);
    }
  });
  return [...byTimestamp.values()].sort((left, right) => left.scannedAtMs - right.scannedAtMs || left.sourceScanId.localeCompare(right.sourceScanId));
}

function buildGuildIntervals(snapshots: GuildTrendSnapshot[]) {
  const intervals: GuildTrendInterval[] = [];
  for (let index = 1; index < snapshots.length; index += 1) {
    const interval = buildGuildInterval(snapshots[index - 1], snapshots[index]);
    if (interval.elapsedDays > 0) intervals.push(interval);
  }
  return intervals;
}

function buildGuildInterval(start: GuildTrendSnapshot, end: GuildTrendSnapshot): GuildTrendInterval {
  const elapsedDays = (end.scannedAtMs - start.scannedAtMs) / DAY_MS;
  return {
    start,
    end,
    elapsedDays,
    fullDays: Math.floor(elapsedDays),
    xp: buildGuildMetric(start.averageXpTotal, end.averageXpTotal, elapsedDays),
    base: buildGuildMetric(start.averageFocusedBaseStats, end.averageFocusedBaseStats, elapsedDays),
  };
}

function buildGuildMetric(startAverage: number, endAverage: number, elapsedDays: number): GuildTrendMetric {
  const absoluteGrowth = endAverage - startAverage;
  return {
    startAverage,
    endAverage,
    absoluteGrowth,
    perDay: absoluteGrowth / elapsedDays,
    trendPerDay: null,
  };
}

function attachGuildWeightedTrends(intervals: GuildTrendInterval[]) {
  return intervals.map((interval, index) => ({
    ...interval,
    xp: {
      ...interval.xp,
      trendPerDay: calculateGuildWeightedTrend(intervals, index, "xp"),
    },
    base: {
      ...interval.base,
      trendPerDay: calculateGuildWeightedTrend(intervals, index, "base"),
    },
  }));
}

function calculateGuildWeightedTrend(intervals: GuildTrendInterval[], index: number, metric: "xp" | "base") {
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
    deltaSum += (metric === "xp" ? interval.xp : interval.base).absoluteGrowth;
    daySum += interval.elapsedDays;
  });

  return daySum > 0 ? deltaSum / daySum : null;
}

function buildGuildTrendPeriod(
  period: PeriodConfig,
  snapshots: GuildTrendSnapshot[],
  current: GuildTrendSnapshot,
): GuildTrendPeriod {
  const comparison = snapshots
    .map((snapshot) => toGuildComparisonCandidate(snapshot, current))
    .filter((candidate): candidate is { snapshot: GuildTrendSnapshot; elapsedDays: number; fullDays: number } => Boolean(candidate))
    .filter((candidate) => candidate.fullDays >= period.minDays && (period.maxDays == null || candidate.fullDays <= period.maxDays))
    .sort((left, right) => compareGuildTrendPeriodCandidates(period, left, right))[0];

  if (!comparison) {
    return {
      key: period.key,
      label: period.label,
      interval: null,
      missingReason: `Kein historischer vollständiger Scan im Bereich ${formatPeriodRange(period)}.`,
    };
  }

  return {
    key: period.key,
    label: period.label,
    interval: buildGuildInterval(comparison.snapshot, current),
  };
}

function toGuildComparisonCandidate(snapshot: GuildTrendSnapshot, current: GuildTrendSnapshot) {
  if (snapshot.scannedAtMs >= current.scannedAtMs) return null;
  const elapsedDays = (current.scannedAtMs - snapshot.scannedAtMs) / DAY_MS;
  if (!Number.isFinite(elapsedDays)) return null;
  const fullDays = Math.floor(elapsedDays);
  if (fullDays < 1) return null;
  return { snapshot, elapsedDays, fullDays };
}

function compareGuildTrendPeriodCandidates(
  period: PeriodConfig,
  a: { snapshot: GuildTrendSnapshot; fullDays: number },
  b: { snapshot: GuildTrendSnapshot; fullDays: number },
) {
  if (period.select === "oldest") return a.snapshot.scannedAtMs - b.snapshot.scannedAtMs;
  if (period.select === "nearest-30") {
    const distance = Math.abs(a.fullDays - 30) - Math.abs(b.fullDays - 30);
    if (distance !== 0) return distance;
    return b.snapshot.scannedAtMs - a.snapshot.scannedAtMs;
  }
  return b.snapshot.scannedAtMs - a.snapshot.scannedAtMs;
}

function buildGuildTrendSummary(targetGuildIdentifier: string, guildRows: GuildAnalyticsDerivedData["guilds"]) {
  const latest = guildRows[guildRows.length - 1] ?? null;
  return {
    name: latest?.guildName ?? null,
    identifier: targetGuildIdentifier,
    scopeLabel: latest?.guildName ? `${latest.guildName} · ${targetGuildIdentifier}` : targetGuildIdentifier,
  };
}

function countDistinctGuildSources(data: GuildAnalyticsDerivedData) {
  return new Set(data.guilds.map((guild) => guild.sourceScanId)).size;
}

export function selectPlayerPerformanceSourceScanIds(
  analyticsData: GuildAnalyticsDerivedData | null | undefined,
  identityResolutionSnapshot: IdentityResolutionSnapshot | null | undefined,
) {
  const members = analyticsData?.members ?? [];
  const candidates = members
    .filter((member) => normalizeSearch(member.name) === normalizeSearch(TARGET_NAME))
    .filter((member) => normalizeServer(member.server) === normalizeServer(TARGET_SERVER))
    .sort((left, right) => left.snapshotTimestamp - right.snapshotTimestamp || left.sourceScanId.localeCompare(right.sourceScanId));
  const latest = candidates[candidates.length - 1];
  if (!latest?.memberRef) return [];

  const observations = identityResolutionSnapshot
    ? collectPlayerIdentityObservations(identityResolutionSnapshot, latest.memberRef, members, {
        getIdentifier: (member) => member.memberRef,
        getTimestamp: (member) => member.snapshotTimestamp,
        getObservationKey: (member) => member.id,
      }).observations.map((entry) => entry.observation)
    : members.filter((member) => member.memberRef.toLowerCase() === latest.memberRef.toLowerCase());

  return [...new Set(observations.map((member) => member.sourceScanId))];
}

function emptyResult(
  status: PlayerPerformanceBuildResult["status"],
  message: string,
  scanCount: number,
  loadedScanCount: number,
): PlayerPerformanceBuildResult {
  return {
    status,
    message,
    scanCount,
    loadedScanCount,
    player: null,
    snapshots: [],
    periods: Object.fromEntries(
      PERIODS.map((period) => [
        period.key,
        {
          key: period.key,
          label: period.label,
          pair: null,
          missingReason: "Kein passendes Scanpaar verfügbar.",
        },
      ]),
    ) as Record<PlayerPerformancePeriodKey, PlayerPerformancePeriod>,
    excludedGuildSnapshots: [],
    segments: [],
  };
}

function buildEntriesFromAnalytics(
  data: GuildAnalyticsDerivedData | null,
  identityResolutionSnapshot: IdentityResolutionSnapshot | null,
): PlayerPerformanceSnapshot[] {
  if (!data) return [];
  return data.members
    .map((member): PlayerPerformanceSnapshot | null => {
      if (!Number.isFinite(member.snapshotTimestamp) || member.snapshotTimestamp <= 0) return null;
      const memberKey = resolvePlayerIdentityKey(member.memberRef, identityResolutionSnapshot);
      return {
        scanId: member.sourceScanId,
        snapshotId: member.snapshotId,
        scanLabel: member.sourceScanFilename,
        scannedAtMs: member.snapshotTimestamp,
        scannedAtIso: new Date(member.snapshotTimestamp).toISOString(),
        identifier: member.memberRef,
        memberRef: member.memberRef,
        memberKey,
        guildIdentifier: member.guildIdentifier,
        guildKey: member.guildIdentifier ? resolveGuildIdentityKey(member.guildIdentifier, identityResolutionSnapshot) : null,
        name: member.name,
        server: member.server,
        guildName: member.guildName,
        xpTotal: member.xpTotal,
        baseStats: member.focusedBaseStats,
      };
    })
    .filter((snapshot): snapshot is PlayerPerformanceSnapshot => Boolean(snapshot));
}

function buildEntriesFromScan(
  scan: GuildHubLocalScan,
  summary: GuildHubScanSummary,
  analyticsIndexes: AnalyticsIndexes,
  identityResolutionSnapshot: IdentityResolutionSnapshot | null,
): PlayerPerformanceSnapshot[] {
  const raw = asRecord(scan.rawData);
  const players = raw ? getRecordArray(raw.players) : [];
  if (!players.length) return [];

  const groups = raw ? getRecordArray(raw.groups).concat(getRecordArray(raw.guilds)) : [];
  const groupsBySegment = buildGroupLookup(groups);
  const normalizedMembers = Array.isArray(scan.normalizedMembers)
    ? scan.normalizedMembers
    : normalizeGuildScanMembers(scan.rawData);
  const normalizedByRef = new Map(normalizedMembers.map((member) => [member.memberRef.toLowerCase(), member]));
  const fallbackScannedAtMs = scanTimestampMs(scan, summary);

  return players
    .map((player) =>
      toSnapshot(
        player,
        scan,
        summary,
        fallbackScannedAtMs,
        normalizedByRef,
        groupsBySegment,
        analyticsIndexes,
        identityResolutionSnapshot,
      ),
    )
    .filter((snapshot): snapshot is PlayerPerformanceSnapshot => Boolean(snapshot));
}

function toSnapshot(
  player: JsonRecord,
  scan: GuildHubLocalScan,
  summary: GuildHubScanSummary,
  fallbackScannedAtMs: number,
  normalizedByRef: Map<string, NormalizedGuildMember>,
  groupsBySegment: Map<string, GroupInfo>,
  analyticsIndexes: AnalyticsIndexes,
  identityResolutionSnapshot: IdentityResolutionSnapshot | null,
): PlayerPerformanceSnapshot | null {
  const identifier = readString(player, ["identifier", "Identifier"]);
  const playerId = readString(player, ["playerId", "Player ID", "id", "ID"]);
  const server = normalizeServer(
    readString(player, ["server", "Server", "prefix", "world", "realm"]) ?? parseServerFromIdentifier(identifier),
  );
  const ref = identifier ? identifier.toLowerCase() : playerId && server ? `${server.toLowerCase()}_p${playerId}` : null;
  const normalized = ref ? normalizedByRef.get(ref) ?? null : null;
  const name = normalized?.name ?? readString(player, ["name", "Name", "playerName", "Player Name"]);
  if (!name) return null;

  const scannedAtMs = getEntryTimestampMs(player) ?? fallbackScannedAtMs;
  if (!Number.isFinite(scannedAtMs) || scannedAtMs <= 0) return null;

  const analyticsMember = ref ? findAnalyticsMember(analyticsIndexes, scan.id, scannedAtMs, ref) : null;
  const groupInfo = findGroupInfo(normalized, player, groupsBySegment);
  const guildIdentifier = analyticsMember?.guildIdentifier ?? resolveGuildIdentifier({ normalized, player, server, groupInfo });
  const guildName =
    analyticsMember?.guildName ??
    normalized?.guildName ??
    readString(player, ["guildName", "Guild Name", "groupname", "groupName", "guild", "Guild"]) ??
    groupInfo?.name ??
    null;
  const serverDisplay = server ?? analyticsMember?.server ?? normalized?.server ?? null;
  const memberRef = analyticsMember?.memberRef ?? ref;
  const memberKey = memberRef
    ? resolvePlayerIdentityKey(memberRef, identityResolutionSnapshot)
    : resolveIdentityKey({ identifier, playerId, server: serverDisplay, name, scanId: scan.id });
  const guildKey = guildIdentifier
    ? resolveGuildIdentityKey(guildIdentifier, identityResolutionSnapshot)
    : resolveGuildKey({ normalized, player, server: serverDisplay, guildName, groupInfo });

  return {
    scanId: scan.id,
    snapshotId: analyticsMember?.snapshotId ?? null,
    scanLabel: summary.displayName || summary.filename,
    scannedAtMs,
    scannedAtIso: new Date(scannedAtMs).toISOString(),
    identifier,
    memberRef,
    memberKey,
    guildIdentifier,
    guildKey,
    name,
    server: serverDisplay,
    guildName,
    xpTotal: readProgressRadarTotalXpForPlayer(player),
    baseStats: readProgressRadarCombinedBaseStatsForPlayer(player),
  };
}

function normalizePerformanceTarget(target?: PlayerPerformanceTarget | null): Required<PlayerPerformanceTarget> {
  return {
    name: String(target?.name ?? TARGET_NAME).trim() || TARGET_NAME,
    server: String(target?.server ?? TARGET_SERVER).trim() || TARGET_SERVER,
    memberRef: String(target?.memberRef ?? "").trim() || null,
  };
}

function selectTargetIdentitySnapshots(
  snapshots: PlayerPerformanceSnapshot[],
  identityResolutionSnapshot: IdentityResolutionSnapshot | null,
  target: Required<PlayerPerformanceTarget>,
) {
  if (target.memberRef) {
    if (identityResolutionSnapshot) {
      const history = collectPlayerIdentityObservations(identityResolutionSnapshot, target.memberRef, snapshots, {
        getIdentifier: (snapshot) => snapshot.memberRef,
        getTimestamp: (snapshot) => snapshot.scannedAtMs,
        getObservationKey: (snapshot) => `${snapshot.scanId}:${snapshot.scannedAtMs}:${snapshot.memberRef ?? snapshot.memberKey}`,
      });
      const observations = history.observations.map((entry) => entry.observation);
      if (observations.length) return observations.sort(compareSnapshots);
    }

    const targetRef = target.memberRef.toLowerCase();
    const sameIdentifier = snapshots.filter((snapshot) => snapshot.memberRef?.toLowerCase() === targetRef).sort(compareSnapshots);
    if (sameIdentifier.length) return sameIdentifier;
  }

  const candidates = snapshots
    .filter((snapshot) => normalizeSearch(snapshot.name) === normalizeSearch(target.name))
    .filter((snapshot) => !target.server || normalizeServer(snapshot.server) === normalizeServer(target.server))
    .sort(compareSnapshots);
  const latest = candidates[candidates.length - 1];
  if (!latest?.memberRef) return candidates;

  if (identityResolutionSnapshot) {
    const history = collectPlayerIdentityObservations(identityResolutionSnapshot, latest.memberRef, snapshots, {
      getIdentifier: (snapshot) => snapshot.memberRef,
      getTimestamp: (snapshot) => snapshot.scannedAtMs,
      getObservationKey: (snapshot) => `${snapshot.scanId}:${snapshot.scannedAtMs}:${snapshot.memberRef ?? snapshot.memberKey}`,
    });
    const observations = history.observations.map((entry) => entry.observation);
    if (observations.length) return observations;
  }

  const latestRef = latest.memberRef.toLowerCase();
  const sameIdentifier = snapshots.filter((snapshot) => snapshot.memberRef?.toLowerCase() === latestRef);
  return sameIdentifier.length ? sameIdentifier : candidates;
}

function dedupeSnapshots(snapshots: PlayerPerformanceSnapshot[]) {
  const byKey = new Map<string, PlayerPerformanceSnapshot>();
  snapshots.forEach((snapshot) => {
    const key = `${snapshot.scannedAtMs}:${snapshot.scanId}`;
    const previous = byKey.get(key);
    if (!previous || scoreSnapshot(snapshot) >= scoreSnapshot(previous)) byKey.set(key, snapshot);
  });
  return [...byKey.values()].sort(compareSnapshots);
}

function collectExcludedTargetGuildSnapshots(
  snapshots: PlayerPerformanceSnapshot[],
  analyticsIndexes: AnalyticsIndexes,
) {
  const byKey = new Map<string, GuildSnapshotCompletenessReport>();
  snapshots.forEach((snapshot) => {
    const report = getPerformanceGuildCompletenessReport(snapshot, analyticsIndexes) ?? createMissingCompletenessReport(snapshot);
    if (report.completeForPerformance) return;
    byKey.set(`${report.snapshotId}:${report.guildIdentifier ?? ""}`, report);
  });
  return [...byKey.values()].sort((left, right) => left.scannedAtMs - right.scannedAtMs || left.sourceScanId.localeCompare(right.sourceScanId));
}

function isCompletePerformanceGuildSnapshot(
  snapshot: PlayerPerformanceSnapshot,
  analyticsIndexes: AnalyticsIndexes,
) {
  return getPerformanceGuildCompletenessReport(snapshot, analyticsIndexes)?.completeForPerformance === true;
}

function getPerformanceGuildCompletenessReport(
  snapshot: PlayerPerformanceSnapshot,
  analyticsIndexes: AnalyticsIndexes,
) {
  if (!snapshot.snapshotId || !snapshot.guildIdentifier) return null;
  return analyticsIndexes.guildCompletenessBySnapshotGuild.get(snapshotGuildKey(snapshot.snapshotId, snapshot.guildIdentifier)) ?? null;
}

function createMissingCompletenessReport(snapshot: PlayerPerformanceSnapshot): GuildSnapshotCompletenessReport {
  return {
    snapshotId: snapshot.snapshotId ?? `${snapshot.scanId}:${snapshot.scannedAtMs}`,
    sourceScanId: snapshot.scanId,
    sourceScanFilename: snapshot.scanLabel,
    scannedAtMs: snapshot.scannedAtMs,
    guildName: snapshot.guildName,
    guildIdentifier: snapshot.guildIdentifier,
    declaredMemberCount: null,
    foundUniqueMemberCount: 0,
    validXpTotalCount: 0,
    validFocusedBaseStatsCount: 0,
    completeForPerformance: false,
    exclusionReason: "Kein deklarierter Gildensnapshot für die Vollständigkeitsprüfung gefunden.",
  };
}

function buildConsecutivePairs(
  snapshots: PlayerPerformanceSnapshot[],
  referenceContext: GuildReferenceContext,
) {
  const pairs: PlayerPerformancePair[] = [];
  for (let index = 1; index < snapshots.length; index += 1) {
    const pair = buildPair(snapshots[index - 1], snapshots[index], referenceContext);
    if (pair.elapsedDays > 0) pairs.push(pair);
  }
  return attachWeightedTrends(pairs);
}

function buildPeriod(
  period: PeriodConfig,
  snapshots: PlayerPerformanceSnapshot[],
  current: PlayerPerformanceSnapshot,
  referenceContext: GuildReferenceContext,
): PlayerPerformancePeriod {
  const comparison = snapshots
    .map((snapshot) => toComparisonCandidate(snapshot, current))
    .filter((candidate): candidate is ComparisonCandidate => Boolean(candidate))
    .filter((candidate) => candidate.fullDays >= period.minDays && (period.maxDays == null || candidate.fullDays <= period.maxDays))
    .sort(comparePeriodCandidates(period))[0];

  if (!comparison) {
    return {
      key: period.key,
      label: period.label,
      pair: null,
      missingReason: `Kein historischer Scan im Bereich ${formatPeriodRange(period)}.`,
    };
  }

  return {
    key: period.key,
    label: period.label,
    pair: buildPair(comparison.snapshot, current, referenceContext),
  };
}

function buildPair(
  start: PlayerPerformanceSnapshot,
  end: PlayerPerformanceSnapshot,
  referenceContext: GuildReferenceContext,
): PlayerPerformancePair {
  const elapsedDays = (end.scannedAtMs - start.scannedAtMs) / DAY_MS;
  const fullDays = Math.floor(elapsedDays);
  const xpDelta = delta(end.xpTotal, start.xpTotal);
  const baseDelta = delta(end.baseStats, start.baseStats);
  const guildReference = buildGuildReference(start, end, elapsedDays, referenceContext);
  const notes: string[] = [];

  if (xpDelta == null) notes.push("XP-Wert fehlt.");
  if (baseDelta == null) notes.push("Basiswerte fehlen.");
  if (xpDelta != null && xpDelta < 0) notes.push("XP-Differenz ist negativ.");
  if (baseDelta != null && baseDelta < 0) notes.push("Basiswerte-Differenz ist negativ.");

  const status: PlayerPerformancePairStatus =
    notes.some((note) => note.includes("fehlt"))
      ? "missing"
      : xpDelta != null && baseDelta != null && (xpDelta < 0 || baseDelta < 0)
        ? "negative"
        : "ok";

  return {
    start,
    end,
    elapsedDays,
    fullDays,
    xpDelta,
    baseDelta,
    xpPerDay: xpDelta == null || elapsedDays <= 0 ? null : xpDelta / elapsedDays,
    basePerDay: baseDelta == null || elapsedDays <= 0 ? null : baseDelta / elapsedDays,
    xpPerDayTrend: null,
    focusedBaseStatsPerDayTrend: null,
    guildReference,
    status,
    notes,
  };
}

function attachWeightedTrends(pairs: PlayerPerformancePair[]) {
  return pairs.map((pair, index) => ({
    ...pair,
    xpPerDayTrend: calculateWeightedTrend(pairs, index, "xp"),
    focusedBaseStatsPerDayTrend: calculateWeightedTrend(pairs, index, "base"),
  }));
}

function calculateWeightedTrend(
  pairs: PlayerPerformancePair[],
  index: number,
  metric: "xp" | "base",
) {
  const candidateIndexes =
    index === 0
      ? [index, index + 1]
      : index === pairs.length - 1
        ? [index - 1, index]
        : [index - 1, index, index + 1];
  let deltaSum = 0;
  let daySum = 0;

  candidateIndexes.forEach((candidateIndex) => {
    const pair = pairs[candidateIndex];
    if (!pair || !Number.isFinite(pair.elapsedDays) || pair.elapsedDays <= 0) return;
    const segmentDelta = metric === "xp" ? pair.xpDelta : pair.baseDelta;
    if (typeof segmentDelta !== "number" || !Number.isFinite(segmentDelta)) return;
    deltaSum += segmentDelta;
    daySum += pair.elapsedDays;
  });

  return daySum > 0 ? deltaSum / daySum : null;
}

function toComparisonCandidate(
  snapshot: PlayerPerformanceSnapshot,
  current: PlayerPerformanceSnapshot,
): ComparisonCandidate | null {
  if (snapshot.scannedAtMs >= current.scannedAtMs) return null;
  const elapsedDays = (current.scannedAtMs - snapshot.scannedAtMs) / DAY_MS;
  if (!Number.isFinite(elapsedDays)) return null;
  const fullDays = Math.floor(elapsedDays);
  if (fullDays < 1) return null;
  return { snapshot, elapsedDays, fullDays };
}

function comparePeriodCandidates(period: PeriodConfig) {
  return (a: ComparisonCandidate, b: ComparisonCandidate) => {
    if (period.select === "oldest") return a.snapshot.scannedAtMs - b.snapshot.scannedAtMs;
    if (period.select === "nearest-30") {
      const distance = Math.abs(a.fullDays - 30) - Math.abs(b.fullDays - 30);
      if (distance !== 0) return distance;
      return b.snapshot.scannedAtMs - a.snapshot.scannedAtMs;
    }
    return b.snapshot.scannedAtMs - a.snapshot.scannedAtMs;
  };
}

function scoreSnapshot(snapshot: PlayerPerformanceSnapshot) {
  return Number(snapshot.xpTotal != null) + Number(snapshot.baseStats != null);
}

function compareSnapshots(a: PlayerPerformanceSnapshot, b: PlayerPerformanceSnapshot) {
  return a.scannedAtMs - b.scannedAtMs || a.scanId.localeCompare(b.scanId);
}

function countDistinctSourceScans(snapshots: PlayerPerformanceSnapshot[]) {
  return new Set(snapshots.map((snapshot) => snapshot.scanId)).size;
}

type GroupInfo = { name: string | null; server: string | null; segment: string | null };

function buildAnalyticsIndexes(data: GuildAnalyticsDerivedData | null): AnalyticsIndexes {
  const membersBySnapshotId = new Map<string, GuildAnalyticsMemberSnapshot[]>();
  const membersBySourceTimeRef = new Map<string, GuildAnalyticsMemberSnapshot>();
  const guildCompletenessBySnapshotGuild = new Map<string, GuildSnapshotCompletenessReport>();
  data?.members.forEach((member) => {
    const snapshotMembers = membersBySnapshotId.get(member.snapshotId) ?? [];
    snapshotMembers.push(member);
    membersBySnapshotId.set(member.snapshotId, snapshotMembers);

    if (member.memberRef) {
      const key = sourceTimeRefKey(member.sourceScanId, member.snapshotTimestamp, member.memberRef);
      if (!membersBySourceTimeRef.has(key)) membersBySourceTimeRef.set(key, member);
    }
  });
  buildGuildSnapshotCompletenessReports(data).forEach((report) => {
    if (!report.guildIdentifier) return;
    guildCompletenessBySnapshotGuild.set(snapshotGuildKey(report.snapshotId, report.guildIdentifier), report);
  });
  return { membersBySnapshotId, membersBySourceTimeRef, guildCompletenessBySnapshotGuild };
}

function findAnalyticsMember(
  analyticsIndexes: AnalyticsIndexes,
  sourceScanId: string,
  snapshotTimestamp: number,
  memberRef: string,
) {
  return analyticsIndexes.membersBySourceTimeRef.get(sourceTimeRefKey(sourceScanId, snapshotTimestamp, memberRef)) ?? null;
}

function buildGroupLookup(groups: JsonRecord[]) {
  const lookup = new Map<string, GroupInfo>();
  groups.forEach((group) => {
    const info: GroupInfo = {
      name: readString(group, ["name", "Name", "groupname", "groupName", "guildName", "guild"]),
      server: normalizeServer(
        readString(group, ["server", "Server", "prefix", "world", "realm"]) ??
          parseServerFromIdentifier(readString(group, ["identifier", "guildIdentifier"])),
      ),
      segment: normalizeGuildSegmentForScan(
        readString(group, ["guildIdentifier", "Guild Identifier", "identifier", "Identifier", "groupIdentifier", "groupId", "guildId", "id"]),
      ),
    };
    if (!info.segment) return;
    lookup.set(groupLookupKey(info.segment, info.server), info);
    lookup.set(groupLookupKey(info.segment, null), info);
  });
  return lookup;
}

function findGroupInfo(
  normalized: NormalizedGuildMember | null,
  player: JsonRecord,
  groupsBySegment: Map<string, GroupInfo>,
) {
  const server = normalizeServer(normalized?.server ?? readString(player, ["server", "Server", "prefix", "world", "realm"]));
  const segment =
    normalized?.guildSegment ??
    normalized?.groupSegment ??
    normalizeGuildSegmentForScan(readString(player, ["guildIdentifier", "Guild Identifier", "group", "groupIdentifier", "groupId", "guildId"]));
  if (!segment) return null;
  return groupsBySegment.get(groupLookupKey(segment, server)) ?? groupsBySegment.get(groupLookupKey(segment, null)) ?? null;
}

function resolveIdentityKey({
  identifier,
  playerId,
  server,
  name,
  scanId,
}: {
  identifier: string | null;
  playerId: string | null;
  server: string | null;
  name: string;
  scanId: string;
}) {
  if (identifier) return `identifier:${identifier.toLowerCase()}`;
  if (server && playerId) return `server-player-id:${server.toLowerCase()}:p${playerId}`;
  return `scan-name:${scanId}:${normalizeSearch(name)}`;
}

function resolvePlayerIdentityKey(memberRef: string, identityResolutionSnapshot: IdentityResolutionSnapshot | null) {
  if (identityResolutionSnapshot) {
    const resolution = resolvePlayerIdentity(identityResolutionSnapshot, memberRef);
    if (resolution.resolved) return `player-identity:${resolution.identityId}`;
  }
  return `member-ref:${memberRef.toLowerCase()}`;
}

function resolveGuildIdentityKey(guildIdentifier: string, identityResolutionSnapshot: IdentityResolutionSnapshot | null) {
  if (identityResolutionSnapshot) {
    const resolution = resolveGuildIdentity(identityResolutionSnapshot, guildIdentifier);
    if (resolution.resolved) return `guild-identity:${resolution.identityId}`;
  }
  return `guild-identifier:${guildIdentifier.toLowerCase()}`;
}

function areSameGuildIdentity(
  candidate: string | null,
  selected: string,
  identityResolutionSnapshot: IdentityResolutionSnapshot | null,
) {
  if (!candidate) return false;
  if (identityResolutionSnapshot) {
    const selectedResolution = resolveGuildIdentity(identityResolutionSnapshot, selected);
    const candidateResolution = resolveGuildIdentity(identityResolutionSnapshot, candidate);
    if (selectedResolution.resolved && candidateResolution.resolved) {
      return selectedResolution.identityId === candidateResolution.identityId;
    }
  }
  return candidate.toLowerCase() === selected.toLowerCase();
}

function resolveGuildKey({
  normalized,
  player,
  server,
  guildName,
  groupInfo,
}: {
  normalized: NormalizedGuildMember | null;
  player: JsonRecord;
  server: string | null;
  guildName: string | null;
  groupInfo: GroupInfo | null;
}) {
  const normalizedServer = normalizeServer(server ?? normalized?.server ?? groupInfo?.server);
  const guildIdentifier =
    readString(player, ["guildIdentifier", "Guild Identifier", "groupIdentifier", "groupId", "guildId"]) ??
    null;
  const guildSegment =
    normalizeGuildSegmentForScan(guildIdentifier) ??
    normalized?.guildSegment ??
    normalized?.groupSegment ??
    groupInfo?.segment;
  if (normalizedServer && guildSegment) return `${normalizedServer.toLowerCase()}:${guildSegment.toLowerCase()}`;
  const nameKey = normalizeSearch(guildName ?? groupInfo?.name);
  if (normalizedServer && nameKey) return `${normalizedServer.toLowerCase()}:name:${nameKey}`;
  return null;
}

function resolveGuildIdentifier({
  normalized,
  player,
  server,
  groupInfo,
}: {
  normalized: NormalizedGuildMember | null;
  player: JsonRecord;
  server: string | null;
  groupInfo: GroupInfo | null;
}) {
  const normalizedServer = normalizeServer(server ?? normalized?.server ?? groupInfo?.server);
  const rawIdentifier =
    readString(player, ["guildIdentifier", "Guild Identifier", "groupIdentifier", "groupId", "guildId"]) ??
    null;
  const guildSegment =
    normalizeGuildSegmentForScan(rawIdentifier) ??
    normalized?.guildSegment ??
    normalized?.groupSegment ??
    groupInfo?.segment;
  if (normalizedServer && guildSegment) return `${normalizedServer.toLowerCase()}_${guildSegment.toLowerCase()}`;
  return rawIdentifier ? rawIdentifier.toLowerCase() : null;
}

function buildScanGuildLookup(snapshots: PlayerPerformanceSnapshot[]) {
  const lookup = new Map<string, Map<string, PlayerPerformanceSnapshot>>();
  snapshots.forEach((snapshot) => {
    if (!snapshot.guildKey) return;
    const key = scanGuildKey(snapshot.scanId, snapshot.guildKey);
    const members = lookup.get(key) ?? new Map<string, PlayerPerformanceSnapshot>();
    const previous = members.get(snapshot.memberKey);
    if (!previous || scoreSnapshot(snapshot) >= scoreSnapshot(previous)) {
      members.set(snapshot.memberKey, snapshot);
      lookup.set(key, members);
    }
  });
  return lookup;
}

function buildGuildReferenceContext(
  snapshots: PlayerPerformanceSnapshot[],
  analyticsIndexes: AnalyticsIndexes,
  identityResolutionSnapshot: IdentityResolutionSnapshot | null,
): GuildReferenceContext {
  return {
    analyticsIndexes,
    identityResolutionSnapshot,
    fallbackGrouped: buildScanGuildLookup(snapshots),
  };
}

function buildGuildReference(
  start: PlayerPerformanceSnapshot,
  end: PlayerPerformanceSnapshot,
  elapsedDays: number,
  referenceContext: GuildReferenceContext,
) {
  if (elapsedDays <= 0) {
    return { xpPerDay: emptyReference("Ungültige Dauer."), basePerDay: emptyReference("Ungültige Dauer.") };
  }

  const analyticsReference = buildAnalyticsGuildReference(start, end, elapsedDays, referenceContext);
  if (analyticsReference) return analyticsReference;

  return {
    xpPerDay: emptyReference("Keine vollständigen Analytics-Gildensnapshots verfügbar."),
    basePerDay: emptyReference("Keine vollständigen Analytics-Gildensnapshots verfügbar."),
  };
}

function buildAnalyticsGuildReference(
  start: PlayerPerformanceSnapshot,
  end: PlayerPerformanceSnapshot,
  elapsedDays: number,
  referenceContext: GuildReferenceContext,
) {
  if (!start.snapshotId || !end.snapshotId || !start.guildIdentifier || !end.guildIdentifier) return null;

  const startMembers = getAnalyticsMembersForGuildSnapshot(
    referenceContext.analyticsIndexes,
    start.snapshotId,
    start.guildIdentifier,
    referenceContext.identityResolutionSnapshot,
  );
  const endMembers = getAnalyticsMembersForGuildSnapshot(
    referenceContext.analyticsIndexes,
    end.snapshotId,
    end.guildIdentifier,
    referenceContext.identityResolutionSnapshot,
  );
  const startReport = getPerformanceGuildCompletenessReport(start, referenceContext.analyticsIndexes);
  const endReport = getPerformanceGuildCompletenessReport(end, referenceContext.analyticsIndexes);
  if (!startMembers.length || !endMembers.length) return null;

  return {
    xpPerDay: buildSnapshotAverageReference(startMembers, endMembers, "xpTotal", elapsedDays, startReport, endReport),
    basePerDay: buildSnapshotAverageReference(startMembers, endMembers, "focusedBaseStats", elapsedDays, startReport, endReport),
  };
}

function getAnalyticsMembersForGuildSnapshot(
  analyticsIndexes: AnalyticsIndexes,
  snapshotId: string,
  guildIdentifier: string,
  identityResolutionSnapshot: IdentityResolutionSnapshot | null,
) {
  const members = analyticsIndexes.membersBySnapshotId.get(snapshotId) ?? [];
  return members.filter((member) => areSameGuildIdentity(member.guildIdentifier, guildIdentifier, identityResolutionSnapshot));
}

function buildSnapshotAverageReference(
  startMembers: GuildAnalyticsMemberSnapshot[],
  endMembers: GuildAnalyticsMemberSnapshot[],
  key: "xpTotal" | "focusedBaseStats",
  elapsedDays: number,
  startReport: GuildSnapshotCompletenessReport | null,
  endReport: GuildSnapshotCompletenessReport | null,
): PlayerPerformanceGuildReference {
  const startUniqueMembers = dedupeAnalyticsSnapshotMembers(startMembers);
  const endUniqueMembers = dedupeAnalyticsSnapshotMembers(endMembers);
  const start = buildReferenceEndpoint(startUniqueMembers, key, startReport);
  const end = buildReferenceEndpoint(endUniqueMembers, key, endReport);
  const incompleteReason = getCoverageReason(start, end, startReport, endReport);
  if (incompleteReason || start.average == null || end.average == null) {
    return { ...emptyReference(incompleteReason ?? "Durchschnitt fehlt."), start, end };
  }
  const referenceDelta = end.average - start.average;
  return {
    averagePerDay: referenceDelta / elapsedDays,
    delta: referenceDelta,
    method: "Snapshot-Durchschnitt, kein Member-Pairing",
    reason: null,
    start,
    end,
  };
}

function buildReferenceEndpoint(
  members: GuildAnalyticsMemberSnapshot[],
  key: "xpTotal" | "focusedBaseStats",
  report: GuildSnapshotCompletenessReport | null,
): PlayerPerformanceGuildReferenceEndpoint {
  const values = members.map((member) => member[key]).filter(isFiniteNumber);
  const first = members[0] ?? null;
  return {
    sourceScanId: first?.sourceScanId ?? "",
    sourceScanFilename: first?.sourceScanFilename ?? "",
    scannedAtMs: first?.snapshotTimestamp ?? 0,
    guildName: first?.guildName ?? null,
    guildIdentifier: first?.guildIdentifier ?? null,
    memberCount: report?.foundUniqueMemberCount ?? members.length,
    declaredMemberCount: report?.declaredMemberCount ?? null,
    foundUniqueMemberCount: report?.foundUniqueMemberCount ?? members.length,
    validValueCount: values.length,
    validXpTotalCount: report?.validXpTotalCount ?? members.map((member) => member.xpTotal).filter(isFiniteNumber).length,
    validFocusedBaseStatsCount: report?.validFocusedBaseStatsCount ?? members.map((member) => member.focusedBaseStats).filter(isFiniteNumber).length,
    average: values.length ? average(values) : null,
  };
}

function dedupeAnalyticsSnapshotMembers(members: GuildAnalyticsMemberSnapshot[]) {
  const byRef = new Map<string, GuildAnalyticsMemberSnapshot>();
  members.forEach((member) => {
    const previous = byRef.get(member.memberRef.toLowerCase());
    if (!previous || scoreAnalyticsMemberValues(member) >= scoreAnalyticsMemberValues(previous)) {
      byRef.set(member.memberRef.toLowerCase(), member);
    }
  });
  return [...byRef.values()];
}

function scoreAnalyticsMemberValues(member: GuildAnalyticsMemberSnapshot) {
  return Number(isFiniteNumber(member.xpTotal)) + Number(isFiniteNumber(member.focusedBaseStats));
}

function getCoverageReason(
  start: PlayerPerformanceGuildReferenceEndpoint,
  end: PlayerPerformanceGuildReferenceEndpoint,
  startReport: GuildSnapshotCompletenessReport | null,
  endReport: GuildSnapshotCompletenessReport | null,
) {
  if (!startReport) return "Startsnapshot hat keine vollständige Gildensnapshot-Prüfung.";
  if (!endReport) return "Endsnapshot hat keine vollständige Gildensnapshot-Prüfung.";
  if (startReport.exclusionReason) return `Startsnapshot ausgeschlossen: ${startReport.exclusionReason}`;
  if (endReport.exclusionReason) return `Endsnapshot ausgeschlossen: ${endReport.exclusionReason}`;
  if (!start.memberCount || !end.memberCount) return "Gildensnapshot ohne Mitglieder.";
  if (start.validValueCount !== start.memberCount) return "Startsnapshot hat unvollständige Kennzahlenabdeckung.";
  if (end.validValueCount !== end.memberCount) return "Endsnapshot hat unvollständige Kennzahlenabdeckung.";
  return null;
}

function emptyReference(reason: string | null): PlayerPerformanceGuildReference {
  return {
    averagePerDay: null,
    delta: null,
    method: "Snapshot-Durchschnitt, kein Member-Pairing",
    reason,
    start: null,
    end: null,
  };
}

function average(values: number[]) {
  const validValues = values.filter(isFiniteNumber);
  if (!validValues.length) return null;
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function groupLookupKey(segment: string, server: string | null) {
  return `${server?.toLowerCase() ?? "*"}:${segment.toLowerCase()}`;
}

function scanGuildKey(scanId: string, guildKey: string) {
  return `${scanId}::${guildKey}`;
}

function sourceTimeRefKey(sourceScanId: string, snapshotTimestamp: number, memberRef: string) {
  return `${sourceScanId}::${snapshotTimestamp}::${memberRef.toLowerCase()}`;
}

function formatPeriodRange(period: PeriodConfig) {
  return period.maxDays == null ? `ab ${period.minDays} Tagen` : `${period.minDays}-${period.maxDays} Tagen`;
}

function scanTimestampMs(scan: GuildHubLocalScan, summary: GuildHubScanSummary) {
  const scannedAt = scan.scannedAt ? Date.parse(scan.scannedAt) : NaN;
  if (Number.isFinite(scannedAt)) return scannedAt;
  if (summary.lastSnapshotTimestamp != null && Number.isFinite(summary.lastSnapshotTimestamp)) return summary.lastSnapshotTimestamp;
  return summary.importedAt || Date.parse(scan.importedAt) || 0;
}

function getEntryTimestampMs(entry: JsonRecord) {
  return readTimestampMs(entry, ["scannedAt", "scanAt", "timestamp", "timestampSec", "timestampRaw"]);
}

function readTimestampMs(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = pickFirst(record, [key]);
    const parsed = toTimestampMillis(value);
    if (parsed != null) return parsed;
  }
  return null;
}

function toTimestampMillis(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value > 1_000_000_000_000 ? value : value * 1000;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{13}$/.test(trimmed)) return Number(trimmed);
    if (/^\d{10}$/.test(trimmed)) return Number(trimmed) * 1000;
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function delta(current: number | null, comparison: number | null) {
  return typeof current === "number" && Number.isFinite(current) && typeof comparison === "number" && Number.isFinite(comparison)
    ? current - comparison
    : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function getRecordArray(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord).filter((entry): entry is JsonRecord => Boolean(entry)) : [];
}

function pickFirst(record: JsonRecord, keys: string[]) {
  const values = asRecord(record.values);
  const latest = asRecord(record.latest);
  const sources = [
    record,
    values,
    asRecord(values?.latestValues),
    latest,
    asRecord(latest?.values),
    asRecord(record.latestValues),
  ].filter((entry): entry is JsonRecord => Boolean(entry));

  for (const source of sources) {
    const lookup = new Map<string, string>();
    Object.keys(source).forEach((key) => {
      const canonical = canonicalizeKey(key);
      if (canonical && !lookup.has(canonical)) lookup.set(canonical, key);
    });
    for (const key of keys) {
      const direct = source[key];
      if (direct != null && String(direct).trim()) return direct;
      const resolved = lookup.get(canonicalizeKey(key));
      const value = resolved ? source[resolved] : undefined;
      if (value != null && String(value).trim()) return value;
    }
  }
  return undefined;
}

function readString(record: JsonRecord | null, keys: string[]) {
  if (!record) return null;
  const value = pickFirst(record, keys);
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function parseServerFromIdentifier(identifier: string | null) {
  const match = identifier?.match(/^(.+?)_[gp][^_]+$/i);
  return match?.[1] ?? null;
}

function normalizeServer(value: unknown) {
  return normalizeServerKeyFromInput(value);
}

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("de-DE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function canonicalizeKey(key: string) {
  return String(key)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
