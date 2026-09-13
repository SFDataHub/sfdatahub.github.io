import type { GuildHubLocalScan } from "./localScanLibrary";
import {
  isDerivedGuildSnapshotForGuild,
  isDerivedMemberInGuild,
  type GuildAnalyticsDerivedData,
  type GuildAnalyticsGuildSnapshot,
  type GuildAnalyticsMemberSnapshot,
} from "./localGuildAnalyticsStore";

export type GuildAnalyticsMetricKey = "avgLevel" | "avgBaseStats" | "avgTotalStats" | "memberCount" | "fightParticipation";
export type GuildAnalyticsRangeKey = "7d" | "30d" | "90d" | "6m" | "1y" | "all" | "custom";
export type GuildAnalyticsRangeSelection = {
  key: GuildAnalyticsRangeKey;
  from?: string;
  to?: string;
};
export type GuildAnalyticsRangeInput = GuildAnalyticsRangeKey | GuildAnalyticsRangeSelection;
export type GuildAnalyticsProgressPeriodKey = "weekly" | "monthly";
export type GuildAnalyticsTimeDomain = {
  startMs: number;
  endMs: number;
};

export type GuildAnalyticsGuildIdentity = {
  guildId?: string | null;
  logoIdentifier?: string | null;
  name: string;
  server?: string | null;
};

export type GuildAnalyticsMetricDefinition = {
  key: GuildAnalyticsMetricKey;
  label: string;
  format: "decimal" | "integer";
  kind?: "scan" | "fight";
};

export type GuildAnalyticsPoint = {
  scanId: string;
  scanLabel: string;
  scannedAtMs: number;
  values: Partial<Record<GuildAnalyticsMetricKey, number>>;
};

export type GuildAnalyticsSeries = {
  allPoints: GuildAnalyticsPoint[];
  visiblePoints: GuildAnalyticsPoint[];
  timeDomain: GuildAnalyticsTimeDomain | null;
};

export type GuildAnalyticsPlayerCandidate = {
  memberRef: string;
  name: string;
};

export type GuildAnalyticsPlayerPoint = {
  scanId: string;
  scanLabel: string;
  scannedAtMs: number;
  value: number | null;
  membership: "currentGuild" | "otherGuild";
  guildIdentifier: string | null;
  guildName: string | null;
};

export type GuildAnalyticsPlayerSeries = {
  memberRef: string;
  name: string;
  points: GuildAnalyticsPlayerPoint[];
};

export type GuildAnalyticsPlayerComparison = {
  guildSeries: GuildAnalyticsSeries;
  playerCandidates: GuildAnalyticsPlayerCandidate[];
  playerSeries: GuildAnalyticsPlayerSeries[];
};

export type GuildAnalyticsProgressMetric = {
  baselineValue: number | null;
  currentValue: number | null;
  delta: number | null;
};

export type GuildAnalyticsProgressPlayer = {
  memberRef: string;
  name: string;
  levelDelta: number | null;
  baseStatsDelta: number | null;
  totalStatsDelta: number | null;
};

export type GuildAnalyticsProgressReport = {
  periodKey: GuildAnalyticsProgressPeriodKey;
  targetDays: number;
  baseline: GuildAnalyticsPoint;
  current: GuildAnalyticsPoint;
  daysBetween: number;
  metrics: Record<GuildAnalyticsMetricKey, GuildAnalyticsProgressMetric>;
  players: GuildAnalyticsProgressPlayer[];
};

export const GUILD_ANALYTICS_METRICS: GuildAnalyticsMetricDefinition[] = [
  { key: "avgLevel", label: "Level", format: "decimal" },
  { key: "avgBaseStats", label: "Basiswerte", format: "integer" },
  { key: "avgTotalStats", label: "Gesamtwerte", format: "integer" },
  { key: "memberCount", label: "Mitglieder", format: "integer" },
  { key: "fightParticipation", label: "Fight Participation", format: "integer", kind: "fight" },
];

export const GUILD_ANALYTICS_RANGES: Array<{ key: GuildAnalyticsRangeKey; label: string }> = [
  { key: "7d", label: "7 Tage" },
  { key: "30d", label: "30 Tage" },
  { key: "90d", label: "90 Tage" },
  { key: "6m", label: "6 Monate" },
  { key: "1y", label: "1 Jahr" },
  { key: "all", label: "Gesamt" },
  { key: "custom", label: "Benutzerdefiniert" },
];

export function buildGuildAnalyticsSeries(
  data: GuildAnalyticsDerivedData,
  guild: GuildAnalyticsGuildIdentity | null | undefined,
  metricKey: GuildAnalyticsMetricKey,
  range: GuildAnalyticsRangeInput,
): GuildAnalyticsSeries {
  if (!guild) return { allPoints: [], visiblePoints: [], timeDomain: null };

  const allPoints = buildAnalyticsSnapshotsForGuild(data, guild)
    .map((snapshot) => snapshot.point)
    .filter((point) => typeof point.values[metricKey] === "number")
    .sort((a, b) => a.scannedAtMs - b.scannedAtMs);

  const visiblePoints = filterAnalyticsPointsByRange(allPoints, range, (point) => point.scannedAtMs);
  return {
    allPoints,
    visiblePoints,
    timeDomain: resolveGuildAnalyticsTimeDomain(allPoints, visiblePoints, range, (point) => point.scannedAtMs),
  };
}

export function buildGuildAnalyticsPlayerComparison(
  data: GuildAnalyticsDerivedData,
  guild: GuildAnalyticsGuildIdentity | null | undefined,
  metricKey: GuildAnalyticsMetricKey,
  range: GuildAnalyticsRangeInput,
  selectedPlayerIds: string[],
): GuildAnalyticsPlayerComparison {
  if (!guild) {
    return {
      guildSeries: { allPoints: [], visiblePoints: [], timeDomain: null },
      playerCandidates: [],
      playerSeries: [],
    };
  }

  const currentGuildSnapshots = buildAnalyticsSnapshotsForGuild(data, guild).sort(
    (a, b) => a.point.scannedAtMs - b.point.scannedAtMs,
  );
  const allPoints = currentGuildSnapshots
    .map((snapshot) => snapshot.point)
    .filter((point) => typeof point.values[metricKey] === "number")
    .sort((a, b) => a.scannedAtMs - b.scannedAtMs);
  const visiblePoints = filterAnalyticsPointsByRange(allPoints, range, (point) => point.scannedAtMs);
  const playerCandidates = buildCurrentPlayerCandidates(currentGuildSnapshots);
  const candidateByRef = new Map(playerCandidates.map((player) => [player.memberRef, player]));
  const uniqueSelectedPlayerIds = Array.from(new Set(selectedPlayerIds));
  const playerSeries = uniqueSelectedPlayerIds.map((memberRef) => {
    const points = buildPlayerHistoryPoints(data, guild, memberRef, metricKey);
    return {
      memberRef,
      name: resolvePlayerHistoryName(data, guild, memberRef) ?? candidateByRef.get(memberRef)?.name ?? memberRef,
      points: filterAnalyticsPointsByRange(points, range, (point) => point.scannedAtMs),
    };
  });
  const visibleDomainPoints = [
    ...visiblePoints,
    ...playerSeries.flatMap((series) => series.points.filter((point) => point.value != null)),
  ];
  const domainSourcePoints = normalizeGuildAnalyticsRange(range).key === "all" ? visibleDomainPoints : allPoints;
  const timeDomain = resolveGuildAnalyticsTimeDomain(
    domainSourcePoints,
    visibleDomainPoints,
    range,
    (point) => point.scannedAtMs,
  );

  return {
    guildSeries: {
      allPoints,
      visiblePoints,
      timeDomain,
    },
    playerCandidates,
    playerSeries,
  };
}

export function filterAnalyticsPointsByRange<T>(
  points: T[],
  range: GuildAnalyticsRangeInput,
  getTimestampMs: (point: T) => number,
): T[] {
  const selection = normalizeGuildAnalyticsRange(range);
  if (selection.key === "all" || points.length === 0) return points;

  if (selection.key === "custom") {
    const fromMs = parseDateInputStartMs(selection.from);
    const toMs = parseDateInputEndMs(selection.to);
    return points.filter((point) => {
      const timestampMs = getTimestampMs(point);
      return (fromMs == null || timestampMs >= fromMs) && (toMs == null || timestampMs <= toMs);
    });
  }

  const latestMs = points.reduce((latest, point) => Math.max(latest, getTimestampMs(point)), 0);
  if (!latestMs) return points;

  const minMs =
    selection.key === "7d"
      ? latestMs - 7 * 86400000
      : selection.key === "30d"
        ? latestMs - 30 * 86400000
        : selection.key === "90d"
          ? latestMs - 90 * 86400000
          : subtractMonths(latestMs, selection.key === "6m" ? 6 : 12);

  return points.filter((point) => getTimestampMs(point) >= minMs);
}

export function normalizeGuildAnalyticsRange(range: GuildAnalyticsRangeInput): GuildAnalyticsRangeSelection {
  return typeof range === "string" ? { key: range } : range;
}

export function resolveGuildAnalyticsTimeDomain<T>(
  allPoints: T[],
  visiblePoints: T[],
  range: GuildAnalyticsRangeInput,
  getTimestampMs: (point: T) => number,
): GuildAnalyticsTimeDomain | null {
  if (!visiblePoints.length) return null;

  const selection = normalizeGuildAnalyticsRange(range);
  const visibleTimestamps = visiblePoints.map(getTimestampMs).filter(isFiniteNumber);
  if (!visibleTimestamps.length) return null;

  if (selection.key === "all") {
    return {
      startMs: Math.min(...visibleTimestamps),
      endMs: Math.max(...visibleTimestamps),
    };
  }

  if (selection.key === "custom") {
    const fromMs = parseDateInputStartMs(selection.from);
    const toMs = parseDateInputEndMs(selection.to);
    return {
      startMs: fromMs ?? Math.min(...visibleTimestamps),
      endMs: toMs ?? Math.max(...visibleTimestamps),
    };
  }

  const allTimestamps = allPoints.map(getTimestampMs).filter(isFiniteNumber);
  const endMs = allTimestamps.length ? Math.max(...allTimestamps) : Math.max(...visibleTimestamps);
  const startMs =
    selection.key === "7d"
      ? endMs - 7 * 86400000
      : selection.key === "30d"
        ? endMs - 30 * 86400000
        : selection.key === "90d"
          ? endMs - 90 * 86400000
          : subtractMonths(endMs, selection.key === "6m" ? 6 : 12);

  return { startMs, endMs };
}

export function buildGuildAnalyticsProgressReport(
  data: GuildAnalyticsDerivedData,
  guild: GuildAnalyticsGuildIdentity | null | undefined,
  periodKey: GuildAnalyticsProgressPeriodKey,
): GuildAnalyticsProgressReport | null {
  if (!guild) return null;

  const snapshots = buildAnalyticsSnapshotsForGuild(data, guild).sort(
    (a, b) => a.point.scannedAtMs - b.point.scannedAtMs,
  );

  if (snapshots.length < 2) return null;

  const current = snapshots[snapshots.length - 1];
  const olderSnapshots = snapshots.filter((snapshot) => snapshot.point.scannedAtMs < current.point.scannedAtMs);
  if (!olderSnapshots.length) return null;

  const targetDays = periodKey === "weekly" ? 7 : 30;
  const targetMs = current.point.scannedAtMs - targetDays * 86400000;
  const baseline = olderSnapshots.reduce((best, snapshot) => {
    const bestDistance = Math.abs(best.point.scannedAtMs - targetMs);
    const nextDistance = Math.abs(snapshot.point.scannedAtMs - targetMs);
    if (nextDistance < bestDistance) return snapshot;
    if (nextDistance === bestDistance && snapshot.point.scannedAtMs > best.point.scannedAtMs) return snapshot;
    return best;
  }, olderSnapshots[0]);

  const metrics = Object.fromEntries(
    GUILD_ANALYTICS_METRICS.map((metric) => {
      const baselineValue = toFiniteNumberOrNull(baseline.point.values[metric.key]);
      const currentValue = toFiniteNumberOrNull(current.point.values[metric.key]);
      return [
        metric.key,
        {
          baselineValue,
          currentValue,
          delta: baselineValue != null && currentValue != null ? currentValue - baselineValue : null,
        },
      ];
    }),
  ) as Record<GuildAnalyticsMetricKey, GuildAnalyticsProgressMetric>;

  const baselineMembersByRef = new Map(
    baseline.members.map((member) => [member.memberRef, member] as const),
  );
  const players = current.members
    .map((currentMember) => {
      const baselineMember = baselineMembersByRef.get(currentMember.memberRef);
      if (!baselineMember) return null;
      return {
        memberRef: currentMember.memberRef,
        name: currentMember.name,
        levelDelta: diffNumbers(currentMember.level, baselineMember.level),
        baseStatsDelta: diffNumbers(currentMember.baseStats, baselineMember.baseStats),
        totalStatsDelta: diffNumbers(currentMember.totalStats, baselineMember.totalStats),
      };
    })
    .filter((player): player is GuildAnalyticsProgressPlayer => Boolean(player));

  return {
    periodKey,
    targetDays,
    baseline: baseline.point,
    current: current.point,
    daysBetween: Math.max(
      0,
      Math.round((current.point.scannedAtMs - baseline.point.scannedAtMs) / 86400000),
    ),
    metrics,
    players,
  };
}

export function resolveGuildAnalyticsScanTimeMs(scan: GuildHubLocalScan) {
  return parseDateMs(scan.scannedAt) ?? 0;
}

type GuildAnalyticsSnapshot = {
  point: GuildAnalyticsPoint;
  members: GuildAnalyticsMemberSnapshot[];
};

function buildAnalyticsSnapshotsForGuild(
  data: GuildAnalyticsDerivedData,
  guild: GuildAnalyticsGuildIdentity,
): GuildAnalyticsSnapshot[] {
  const membersBySnapshotId = new Map<string, GuildAnalyticsMemberSnapshot[]>();
  for (const member of data.members) {
    if (!isDerivedMemberInGuild(member, guild)) continue;
    const members = membersBySnapshotId.get(member.snapshotId) ?? [];
    members.push(member);
    membersBySnapshotId.set(member.snapshotId, members);
  }

  return data.guilds
    .filter((snapshot) => isDerivedGuildSnapshotForGuild(snapshot, guild))
    .map((snapshot) => ({
      point: pointFromGuildSnapshot(snapshot),
      members: membersBySnapshotId.get(snapshot.snapshotId) ?? [],
    }));
}

function pointFromGuildSnapshot(snapshot: GuildAnalyticsGuildSnapshot): GuildAnalyticsPoint {
  return {
    scanId: snapshot.snapshotId,
    scanLabel: snapshot.sourceScanFilename,
    scannedAtMs: snapshot.snapshotTimestamp,
    values: {
      avgLevel: snapshot.averageLevel ?? undefined,
      avgBaseStats: snapshot.averageBaseStats ?? undefined,
      avgTotalStats: snapshot.averageTotalStats ?? undefined,
      memberCount: snapshot.memberCount,
    },
  };
}

function buildCurrentPlayerCandidates(snapshots: GuildAnalyticsSnapshot[]): GuildAnalyticsPlayerCandidate[] {
  const latestSnapshot = [...snapshots].reverse().find((snapshot) => snapshot.members.length) ?? null;
  if (!latestSnapshot) return [];

  const candidates = new Map<string, GuildAnalyticsPlayerCandidate>();
  latestSnapshot.members.forEach((member) => {
    if (!member.memberRef || candidates.has(member.memberRef)) return;
    candidates.set(member.memberRef, {
      memberRef: member.memberRef,
      name: member.name,
    });
  });

  return [...candidates.values()].sort((a, b) => a.name.localeCompare(b.name, "de-DE", { sensitivity: "base" }));
}

function buildPlayerHistoryPoints(
  data: GuildAnalyticsDerivedData,
  guild: GuildAnalyticsGuildIdentity,
  memberRef: string,
  metricKey: GuildAnalyticsMetricKey,
): GuildAnalyticsPlayerPoint[] {
  const snapshotsById = new Map(data.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const membersBySnapshotId = new Map<string, GuildAnalyticsMemberSnapshot[]>();
  for (const member of data.members) {
    if (member.memberRef !== memberRef) continue;
    const candidates = membersBySnapshotId.get(member.snapshotId) ?? [];
    candidates.push(member);
    membersBySnapshotId.set(member.snapshotId, candidates);
  }

  return [...membersBySnapshotId.entries()]
    .map<GuildAnalyticsPlayerPoint | null>(([snapshotId, candidates]) => {
      const snapshot = snapshotsById.get(snapshotId);
      if (!snapshot) return null;
      const member = choosePlayerHistoryMember(candidates, guild);
      if (!member) return null;

      const value = readPlayerMetricValue(member, metricKey);
      if (value == null) return null;

      const inCurrentGuild = isDerivedMemberInGuild(member, guild);
      return {
        scanId: snapshot.id,
        scanLabel: snapshot.sourceScanFilename,
        scannedAtMs: snapshot.snapshotTimestamp,
        value,
        membership: inCurrentGuild ? "currentGuild" : "otherGuild",
        guildIdentifier: member.guildIdentifier,
        guildName: member.guildName,
      };
    })
    .filter((point): point is GuildAnalyticsPlayerPoint => Boolean(point))
    .sort((a, b) => a.scannedAtMs - b.scannedAtMs || a.scanId.localeCompare(b.scanId));
}

function resolvePlayerHistoryName(
  data: GuildAnalyticsDerivedData,
  guild: GuildAnalyticsGuildIdentity,
  memberRef: string,
) {
  const snapshots = data.members
    .filter((member) => member.memberRef === memberRef)
    .sort((a, b) => b.snapshotTimestamp - a.snapshotTimestamp);
  const bySnapshotId = new Map<string, GuildAnalyticsMemberSnapshot[]>();
  for (const member of snapshots) {
    const candidates = bySnapshotId.get(member.snapshotId) ?? [];
    candidates.push(member);
    bySnapshotId.set(member.snapshotId, candidates);
  }

  for (const candidates of bySnapshotId.values()) {
    const member = choosePlayerHistoryMember(candidates, guild);
    if (member?.name) return member.name;
  }
  return null;
}

function choosePlayerHistoryMember(
  candidates: GuildAnalyticsMemberSnapshot[],
  guild: GuildAnalyticsGuildIdentity,
) {
  if (!candidates.length) return null;
  return (
    candidates.find((member) => isDerivedMemberInGuild(member, guild) && hasAnyPlayerMetricValue(member)) ??
    candidates.find(hasAnyPlayerMetricValue) ??
    candidates[0]
  );
}

function hasAnyPlayerMetricValue(member: GuildAnalyticsMemberSnapshot) {
  return isFiniteNumber(member.level) || isFiniteNumber(member.baseStats) || isFiniteNumber(member.totalStats);
}

function readPlayerMetricValue(member: GuildAnalyticsMemberSnapshot, metricKey: GuildAnalyticsMetricKey) {
  if (metricKey === "avgLevel") return isFiniteNumber(member.level) ? member.level : null;
  if (metricKey === "avgBaseStats") return isFiniteNumber(member.baseStats) ? member.baseStats : null;
  if (metricKey === "avgTotalStats") return isFiniteNumber(member.totalStats) ? member.totalStats : null;
  return null;
}

function parseDateMs(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateInputStartMs(value: string | null | undefined) {
  const match = String(value ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateInputEndMs(value: string | null | undefined) {
  const match = String(value ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function subtractMonths(ms: number, months: number) {
  const date = new Date(ms);
  date.setMonth(date.getMonth() - months);
  return date.getTime();
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function diffNumbers(current: number | null | undefined, baseline: number | null | undefined) {
  return isFiniteNumber(current) && isFiniteNumber(baseline) ? current - baseline : null;
}

function toFiniteNumberOrNull(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
