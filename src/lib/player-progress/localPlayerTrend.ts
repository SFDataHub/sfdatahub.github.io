export type LocalPlayerTrendMetricKey = "xp" | "baseStats";
export type LocalPlayerTrendPeriodKey = "short" | "medium" | "long";
export type LocalPlayerTrendState = "no-data" | "insufficient-guild-data" | "zero" | "positive" | "negative";

export type LocalPlayerTrendSourceEntry = {
  scannedAtMs: number;
  sourceScanId: string;
  memberKey: string;
  guildKey: string | null;
  xpTotal: number | null;
  baseStats: number | null;
};

export type LocalPlayerTrendMetric = {
  key: LocalPlayerTrendMetricKey;
  label: string;
  state: LocalPlayerTrendState;
  segments: number;
  playerDelta: number | null;
  guildMedian: number | null;
  ratio: number | null;
  sampleSize: number;
};

export type LocalPlayerTrendPeriod = {
  key: LocalPlayerTrendPeriodKey;
  label: string;
  days: number;
  xp: LocalPlayerTrendMetric;
  baseStats: LocalPlayerTrendMetric;
};

type TrendCategory = {
  key: LocalPlayerTrendPeriodKey;
  label: string;
  minDays: number;
  maxDays: number | null;
  select: "youngest" | "nearest-30" | "oldest";
};

type ComparisonCandidate = {
  entry: LocalPlayerTrendSourceEntry;
  elapsedDays: number;
  fullDays: number;
};

type GuildReference = {
  median: number | null;
  sampleSize: number;
};

const DAY_MS = 86_400_000;
const MIN_GUILD_REFERENCE_SAMPLE_SIZE = 5;

export const LOCAL_PLAYER_TREND_CATEGORIES: TrendCategory[] = [
  { key: "short", label: "Kurzfristig", minDays: 1, maxDays: 14, select: "youngest" },
  { key: "medium", label: "Mittelfristig", minDays: 15, maxDays: 45, select: "nearest-30" },
  { key: "long", label: "Langfristig", minDays: 46, maxDays: null, select: "oldest" },
];

export const LOCAL_PLAYER_GUILD_COMPARISON_SEGMENTS = [
  { minExclusive: 0, maxExclusive: 0.5, segments: 1 },
  { minInclusive: 0.5, maxExclusive: 0.9, segments: 2 },
  { minInclusive: 0.9, maxInclusive: 1.1, segments: 3 },
  { minExclusive: 1.1, segments: 4 },
] as const;

export function buildLocalPlayerTrend(
  entries: LocalPlayerTrendSourceEntry[],
  guildEntries: LocalPlayerTrendSourceEntry[] = entries,
): LocalPlayerTrendPeriod[] {
  const ordered = dedupePlayerEntriesByScan(entries).sort(compareByScanTime);
  const current = ordered.length ? ordered[ordered.length - 1] : null;
  if (!current) return [];

  const guildEntriesByScanAndGuild = buildGuildEntryLookup(guildEntries);

  return LOCAL_PLAYER_TREND_CATEGORIES.flatMap((category) => {
    const comparison = findComparisonEntry(ordered, current, category);
    if (!comparison) return [];

    const references = buildGuildReferences({
      current,
      comparison: comparison.entry,
      guildEntriesByScanAndGuild,
    });

    return [
      {
        key: category.key,
        label: category.label,
        days: comparison.fullDays,
        xp: buildRelativeMetric({
          key: "xp",
          label: "XP",
          currentValue: current.xpTotal,
          comparisonValue: comparison.entry.xpTotal,
          reference: references.xp,
        }),
        baseStats: buildRelativeMetric({
          key: "baseStats",
          label: "Basiswerte",
          currentValue: current.baseStats,
          comparisonValue: comparison.entry.baseStats,
          reference: references.baseStats,
        }),
      },
    ];
  });
}

function dedupePlayerEntriesByScan(entries: LocalPlayerTrendSourceEntry[]) {
  const byScan = new Map<string, LocalPlayerTrendSourceEntry>();
  entries.forEach((entry) => {
    if (!Number.isFinite(entry.scannedAtMs) || entry.scannedAtMs <= 0) return;
    const key = `${entry.sourceScanId}:${entry.scannedAtMs}`;
    const previous = byScan.get(key);
    if (!previous || scoreCompleteness(entry) >= scoreCompleteness(previous)) byScan.set(key, entry);
  });
  return [...byScan.values()];
}

function scoreCompleteness(entry: LocalPlayerTrendSourceEntry) {
  return (entry.xpTotal != null ? 1 : 0) + (entry.baseStats != null ? 1 : 0);
}

function findComparisonEntry(
  entries: LocalPlayerTrendSourceEntry[],
  current: LocalPlayerTrendSourceEntry,
  category: TrendCategory,
) {
  return (
    entries
      .map((entry) => toComparisonCandidate(entry, current))
      .filter((candidate): candidate is ComparisonCandidate => Boolean(candidate))
      .filter((candidate) => isCandidateInCategory(candidate, category))
      .sort(compareCategoryCandidates(category))[0] ?? null
  );
}

function toComparisonCandidate(
  entry: LocalPlayerTrendSourceEntry,
  current: LocalPlayerTrendSourceEntry,
): ComparisonCandidate | null {
  if (entry.scannedAtMs >= current.scannedAtMs) return null;
  if (!hasComparableMetric(current, entry)) return null;
  const elapsedDays = (current.scannedAtMs - entry.scannedAtMs) / DAY_MS;
  if (!Number.isFinite(elapsedDays)) return null;
  const fullDays = Math.floor(elapsedDays);
  if (fullDays < 1) return null;
  return { entry, elapsedDays, fullDays };
}

function hasComparableMetric(current: LocalPlayerTrendSourceEntry, comparison: LocalPlayerTrendSourceEntry) {
  return (
    (isFiniteNumber(current.xpTotal) && isFiniteNumber(comparison.xpTotal)) ||
    (isFiniteNumber(current.baseStats) && isFiniteNumber(comparison.baseStats))
  );
}

function isCandidateInCategory(candidate: ComparisonCandidate, category: TrendCategory) {
  return (
    candidate.fullDays >= category.minDays &&
    (category.maxDays == null || candidate.fullDays <= category.maxDays)
  );
}

function compareCategoryCandidates(category: TrendCategory) {
  return (a: ComparisonCandidate, b: ComparisonCandidate) => {
    if (category.select === "oldest") return a.entry.scannedAtMs - b.entry.scannedAtMs;
    if (category.select === "nearest-30") {
      const distance = Math.abs(a.fullDays - 30) - Math.abs(b.fullDays - 30);
      if (distance !== 0) return distance;
      return b.entry.scannedAtMs - a.entry.scannedAtMs;
    }
    return b.entry.scannedAtMs - a.entry.scannedAtMs;
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function compareByScanTime(a: LocalPlayerTrendSourceEntry, b: LocalPlayerTrendSourceEntry) {
  return a.scannedAtMs - b.scannedAtMs || a.sourceScanId.localeCompare(b.sourceScanId);
}

function buildGuildEntryLookup(entries: LocalPlayerTrendSourceEntry[]) {
  const lookup = new Map<string, Map<string, LocalPlayerTrendSourceEntry>>();
  entries.forEach((entry) => {
    if (!entry.guildKey) return;
    const groupKey = scanGuildKey(entry.sourceScanId, entry.guildKey);
    const members = lookup.get(groupKey) ?? new Map<string, LocalPlayerTrendSourceEntry>();
    const previous = members.get(entry.memberKey);
    if (!previous || scoreCompleteness(entry) >= scoreCompleteness(previous)) {
      members.set(entry.memberKey, entry);
      lookup.set(groupKey, members);
    }
  });
  return lookup;
}

function scanGuildKey(sourceScanId: string, guildKey: string) {
  return `${sourceScanId}::${guildKey}`;
}

function buildGuildReferences({
  current,
  comparison,
  guildEntriesByScanAndGuild,
}: {
  current: LocalPlayerTrendSourceEntry;
  comparison: LocalPlayerTrendSourceEntry;
  guildEntriesByScanAndGuild: Map<string, Map<string, LocalPlayerTrendSourceEntry>>;
}) {
  if (!current.guildKey || current.guildKey !== comparison.guildKey) {
    return {
      xp: emptyReference(),
      baseStats: emptyReference(),
    };
  }

  const currentMembers = guildEntriesByScanAndGuild.get(scanGuildKey(current.sourceScanId, current.guildKey));
  const comparisonMembers = guildEntriesByScanAndGuild.get(scanGuildKey(comparison.sourceScanId, comparison.guildKey));
  if (!currentMembers || !comparisonMembers) {
    return {
      xp: emptyReference(),
      baseStats: emptyReference(),
    };
  }

  const xpDeltas: number[] = [];
  const baseStatsDeltas: number[] = [];
  currentMembers.forEach((currentMember, memberKey) => {
    const comparisonMember = comparisonMembers.get(memberKey);
    if (!comparisonMember) return;

    const xpDelta = calculateDelta(currentMember.xpTotal, comparisonMember.xpTotal);
    if (xpDelta != null && xpDelta >= 0) xpDeltas.push(xpDelta);

    const baseStatsDelta = calculateDelta(currentMember.baseStats, comparisonMember.baseStats);
    if (baseStatsDelta != null && baseStatsDelta >= 0) baseStatsDeltas.push(baseStatsDelta);
  });

  return {
    xp: referenceFromDeltas(xpDeltas),
    baseStats: referenceFromDeltas(baseStatsDeltas),
  };
}

function emptyReference(): GuildReference {
  return { median: null, sampleSize: 0 };
}

function referenceFromDeltas(deltas: number[]): GuildReference {
  return {
    median: median(deltas),
    sampleSize: deltas.length,
  };
}

export function median(values: readonly number[]) {
  const sorted = values.filter(isFiniteNumber).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function buildRelativeMetric({
  key,
  label,
  currentValue,
  comparisonValue,
  reference,
}: {
  key: LocalPlayerTrendMetricKey;
  label: string;
  currentValue: number | null;
  comparisonValue: number | null;
  reference: GuildReference;
}): LocalPlayerTrendMetric {
  const playerDelta = calculateDelta(currentValue, comparisonValue);
  const base = {
    key,
    label,
    playerDelta,
    guildMedian: reference.median,
    ratio: null,
    sampleSize: reference.sampleSize,
  };

  if (playerDelta == null) return { ...base, state: "no-data", segments: 0 };
  if (playerDelta < 0) return { ...base, state: "negative", segments: 4 };
  if (playerDelta === 0) return { ...base, state: "zero", segments: 0 };
  if (reference.sampleSize < MIN_GUILD_REFERENCE_SAMPLE_SIZE || reference.median == null) {
    return { ...base, state: "insufficient-guild-data", segments: 0 };
  }
  if (reference.median === 0) return { ...base, state: "positive", segments: 4 };

  const ratio = playerDelta / reference.median;

  return {
    ...base,
    ratio,
    state: "positive",
    segments: segmentsFromRatio(ratio),
  };
}

function calculateDelta(current: number | null, comparison: number | null) {
  if (!isFiniteNumber(current) || !isFiniteNumber(comparison)) return null;
  return current - comparison;
}

function segmentsFromRatio(ratio: number) {
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  const match = LOCAL_PLAYER_GUILD_COMPARISON_SEGMENTS.find((segment) => {
    if ("minExclusive" in segment && ratio <= segment.minExclusive) return false;
    if ("minInclusive" in segment && ratio < segment.minInclusive) return false;
    if ("maxExclusive" in segment && ratio >= segment.maxExclusive) return false;
    if ("maxInclusive" in segment && ratio > segment.maxInclusive) return false;
    return true;
  });
  return match?.segments ?? 4;
}
