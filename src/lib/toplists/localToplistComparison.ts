import {
  LOCAL_GUILD_TOPLIST_METRICS,
  LOCAL_PLAYER_TOPLIST_METRICS,
  type LocalToplistMetricDefinition,
} from "./localToplistMetrics";
import type {
  LocalGuildToplistRow,
  LocalPlayerToplistRow,
  LocalToplistIssue,
  LocalToplistSnapshotMeta,
} from "./localToplistTypes";
import {
  buildLocalGuildToplistView,
  buildLocalPlayerToplistView,
  getLocalToplistMetricValue,
  normalizeLocalToplistServer,
  type LocalGuildAverageMode,
  type LocalGuildToplistViewResult,
  type LocalPlayerToplistViewResult,
  type LocalToplistFilters,
  type LocalToplistSortDirection,
} from "./localToplistView";

export type LocalToplistComparisonSnapshotSet = {
  month: string;
  snapshots: readonly LocalToplistSnapshotMeta[];
  players: readonly LocalPlayerToplistRow[];
  guilds: readonly LocalGuildToplistRow[];
  issues?: readonly LocalToplistIssue[];
};

export type LocalToplistIdentityLink = {
  previousServer: string;
  previousIdentifier: string;
  currentServer: string;
  currentIdentifier: string;
  identityKey?: string | null;
  effectiveFromSec?: number | null;
  effectiveToSec?: number | null;
  ambiguous?: boolean;
};

export type LocalToplistComparisonOptions = {
  filters?: LocalToplistFilters;
  playerSort?: {
    metricKey?: string;
    direction?: LocalToplistSortDirection;
  };
  guildSort?: {
    metricKey?: string;
    direction?: LocalToplistSortDirection;
  };
  playerAverageMode?: LocalGuildAverageMode;
  guildAverageMode?: LocalGuildAverageMode;
  playerIdentityLinks?: readonly LocalToplistIdentityLink[];
  guildIdentityLinks?: readonly LocalToplistIdentityLink[];
};

export type LocalToplistComparisonStatus = "matched" | "entered" | "left" | "conflict";
export type LocalToplistComparisonMatchType = "exact" | "fusion" | "none" | "conflict";

export type LocalToplistMetricDeltaMap = Record<string, number | null>;

export type LocalPlayerToplistComparisonRow = {
  status: LocalToplistComparisonStatus;
  matchType: LocalToplistComparisonMatchType;
  identityKey: string | null;
  previous: LocalPlayerToplistRow | null;
  current: LocalPlayerToplistRow | null;
  previousTableRank: number | null;
  currentTableRank: number | null;
  rankDelta: number | null;
  metricDelta: number | null;
  deltas: LocalToplistMetricDeltaMap;
  statsDays: number | null;
  statsPerDay: number | null;
  issues: LocalToplistIssue[];
};

export type LocalGuildToplistComparisonRow = {
  status: LocalToplistComparisonStatus;
  matchType: LocalToplistComparisonMatchType;
  identityKey: string | null;
  previous: LocalGuildToplistRow | null;
  current: LocalGuildToplistRow | null;
  previousTableRank: number | null;
  currentTableRank: number | null;
  rankDelta: number | null;
  metricDelta: number | null;
  deltas: LocalToplistMetricDeltaMap;
  issues: LocalToplistIssue[];
};

export type LocalToplistComparisonResult = {
  status: "complete" | "partial" | "empty";
  previousMonth: string;
  currentMonth: string;
  previousSnapshots: LocalToplistSnapshotMeta[];
  currentSnapshots: LocalToplistSnapshotMeta[];
  previousPlayerView: LocalPlayerToplistViewResult;
  currentPlayerView: LocalPlayerToplistViewResult;
  previousGuildView: LocalGuildToplistViewResult;
  currentGuildView: LocalGuildToplistViewResult;
  players: LocalPlayerToplistComparisonRow[];
  guilds: LocalGuildToplistComparisonRow[];
  counts: {
    playersMatched: number;
    playersEntered: number;
    playersLeft: number;
    playersConflicts: number;
    guildsMatched: number;
    guildsEntered: number;
    guildsLeft: number;
    guildsConflicts: number;
  };
  issues: LocalToplistIssue[];
};

type RankedPlayer = LocalPlayerToplistRow & { tableRank: number };
type RankedGuild = LocalGuildToplistRow & { tableRank: number };

const MS_PER_DAY = 86_400_000;

const issue = (
  code: LocalToplistIssue["code"],
  message: string,
  details: Partial<LocalToplistIssue> = {},
): LocalToplistIssue => ({
  code,
  severity: details.severity ?? "warning",
  message,
  server: details.server,
  archiveScanId: details.archiveScanId,
  identifier: details.identifier,
});

const normalizeIdentifier = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text ? text.toLowerCase() : null;
};

const identityKey = (server: unknown, identifier: unknown) => {
  const normalizedServer = normalizeLocalToplistServer(server);
  const normalizedIdentifier = normalizeIdentifier(identifier);
  return normalizedServer && normalizedIdentifier ? `${normalizedServer}\u0000${normalizedIdentifier}` : null;
};

const rowScanSec = (row: { latestScanAtSec: number | null; scanTimestamp: number }) => {
  if (typeof row.latestScanAtSec === "number" && Number.isFinite(row.latestScanAtSec)) return row.latestScanAtSec;
  return Math.floor(row.scanTimestamp / 1000);
};

const parseMonthIndex = (month: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const oneBasedMonth = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(oneBasedMonth) || oneBasedMonth < 1 || oneBasedMonth > 12) return null;
  return year * 12 + (oneBasedMonth - 1);
};

const getMetric = (
  definitions: readonly LocalToplistMetricDefinition[],
  metricKey: string | undefined,
  fallback: string,
) => definitions.find((definition) => definition.metricKey === metricKey)
  ?? definitions.find((definition) => definition.metricKey === fallback)
  ?? definitions[0];

const toNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const subtractNullable = (current: unknown, previous: unknown) => {
  const currentNumber = toNumber(current);
  const previousNumber = toNumber(previous);
  return currentNumber != null && previousNumber != null ? currentNumber - previousNumber : null;
};

const fieldValue = <T extends Record<string, unknown>>(
  row: T,
  metric: LocalToplistMetricDefinition,
  guildAverageMode: LocalGuildAverageMode,
) => getLocalToplistMetricValue(row as unknown as LocalPlayerToplistRow | LocalGuildToplistRow, metric, guildAverageMode);

const numericMetricDelta = (
  current: LocalPlayerToplistRow | LocalGuildToplistRow | null,
  previous: LocalPlayerToplistRow | LocalGuildToplistRow | null,
  metric: LocalToplistMetricDefinition,
  guildAverageMode: LocalGuildAverageMode,
) => {
  if (!current || !previous || metric.valueType === "string") return null;
  return subtractNullable(
    fieldValue(current as unknown as Record<string, unknown>, metric, guildAverageMode),
    fieldValue(previous as unknown as Record<string, unknown>, metric, guildAverageMode),
  );
};

const playerDeltaFields = [
  "level",
  "main",
  "con",
  "sum",
  "ratio",
  "mainTotal",
  "conTotal",
  "sumTotal",
  "xpProgress",
  "xpTotal",
  "mine",
  "treasury",
] as const satisfies readonly (keyof LocalPlayerToplistRow)[];

const guildDeltaFields = [
  "hofRank",
  "honor",
  "raids",
  "portalFloor",
  "hydra",
  "petLevel",
  "instructor",
  "memberCount",
  "avgLevel",
  "avgBaseMain",
  "avgConBase",
  "avgSumBaseTotal",
  "avgAttrTotal",
  "avgConTotal",
  "avgTotalStats",
  "avgMine",
  "avgTreasury",
  "sumAvg",
] as const satisfies readonly (keyof LocalGuildToplistRow)[];

const playerDeltas = (current: LocalPlayerToplistRow | null, previous: LocalPlayerToplistRow | null): LocalToplistMetricDeltaMap =>
  Object.fromEntries(playerDeltaFields.map((field) => [field, current && previous ? subtractNullable(current[field], previous[field]) : null]));

const guildDeltas = (
  current: LocalGuildToplistRow | null,
  previous: LocalGuildToplistRow | null,
  issues: LocalToplistIssue[],
): LocalToplistMetricDeltaMap => {
  if (!current || !previous) return Object.fromEntries(guildDeltaFields.map((field) => [field, null]));
  const completeAverages = current.memberBasisStatus === "complete" && previous.memberBasisStatus === "complete";
  if (!completeAverages) {
    issues.push(issue(
      "incomplete-guild-comparison-average",
      "Guild average deltas are null because at least one side has an incomplete member basis.",
      { server: current.server, identifier: current.guildIdentifier },
    ));
  }
  const averageFields = new Set<keyof LocalGuildToplistRow>([
    "avgLevel",
    "avgBaseMain",
    "avgConBase",
    "avgSumBaseTotal",
    "avgAttrTotal",
    "avgConTotal",
    "avgTotalStats",
    "avgMine",
    "avgTreasury",
    "sumAvg",
  ]);
  return Object.fromEntries(guildDeltaFields.map((field) => {
    if (averageFields.has(field) && !completeAverages) return [field, null];
    return [field, subtractNullable(current[field], previous[field])];
  }));
};

const computePlayerStatsPerDay = (current: LocalPlayerToplistRow | null, previous: LocalPlayerToplistRow | null) => {
  if (!current || !previous) return { statsDays: null, statsPerDay: null };
  const currentSec = rowScanSec(current);
  const previousSec = rowScanSec(previous);
  const currentSum = toNumber(current.sum);
  const previousSum = toNumber(previous.sum);
  if (!(currentSec > previousSec) || currentSum == null || previousSum == null) {
    return { statsDays: null, statsPerDay: null };
  }
  const days = Math.max(1, Math.round(((currentSec - previousSec) * 1000) / MS_PER_DAY));
  return { statsDays: days, statsPerDay: Math.round((currentSum - previousSum) / days) };
};

const buildRankedMap = <T extends RankedPlayer | RankedGuild>(
  rows: readonly T[],
  identifierOf: (row: T) => string,
  duplicateCode: LocalToplistIssue["code"],
  duplicateMessage: string,
  issues: LocalToplistIssue[],
) => {
  const map = new Map<string, T>();
  const duplicates = new Set<string>();
  rows.forEach((row) => {
    const key = identityKey(row.server, identifierOf(row));
    if (!key) return;
    if (map.has(key)) {
      duplicates.add(key);
      issues.push(issue(duplicateCode, duplicateMessage, {
        server: row.server,
        identifier: identifierOf(row),
      }));
      return;
    }
    map.set(key, row);
  });
  duplicates.forEach((key) => map.delete(key));
  return map;
};

const linkKey = (
  link: LocalToplistIdentityLink,
  side: "previous" | "current",
) => identityKey(
  side === "previous" ? link.previousServer : link.currentServer,
  side === "previous" ? link.previousIdentifier : link.currentIdentifier,
);

const isLinkActive = (
  link: LocalToplistIdentityLink,
  previous: { latestScanAtSec: number | null; scanTimestamp: number } | null,
  current: { latestScanAtSec: number | null; scanTimestamp: number } | null,
) => {
  if (!previous || !current) return false;
  const previousSec = rowScanSec(previous);
  const currentSec = rowScanSec(current);
  if (!(currentSec > previousSec)) return false;
  if (link.effectiveFromSec != null && currentSec < link.effectiveFromSec) return false;
  if (link.effectiveToSec != null && previousSec > link.effectiveToSec) return false;
  return true;
};

const resolveFusionMatch = <T extends RankedPlayer | RankedGuild>(
  current: T,
  previousByKey: Map<string, T>,
  usedPreviousKeys: Set<string>,
  links: readonly LocalToplistIdentityLink[],
  conflictCode: LocalToplistIssue["code"],
  identifierOf: (row: T) => string,
) => {
  const currentKey = identityKey(current.server, identifierOf(current));
  if (!currentKey) return { previous: null, previousKey: null, conflictIssues: [] as LocalToplistIssue[], identity: null as string | null };

  const candidates = links
    .filter((link) => linkKey(link, "current") === currentKey)
    .flatMap((link) => {
      const previousKey = linkKey(link, "previous");
      const previous = previousKey ? previousByKey.get(previousKey) ?? null : null;
      if (!previous || usedPreviousKeys.has(previousKey ?? "")) return [];
      if (!isLinkActive(link, previous, current)) return [];
      return [{ link, previous, previousKey: previousKey ?? "" }];
    });

  const uniquePreviousKeys = new Set(candidates.map((candidate) => candidate.previousKey));
  const hasAmbiguousLink = candidates.some((candidate) => candidate.link.ambiguous);
  if (hasAmbiguousLink || uniquePreviousKeys.size > 1) {
    return {
      previous: null,
      previousKey: null,
      identity: null,
      conflictIssues: [
        issue(conflictCode, "Fusion identity mapping is ambiguous; no comparison match was created.", {
          server: current.server,
          identifier: identifierOf(current),
        }),
      ],
    };
  }

  const candidate = candidates[0];
  if (!candidate) return { previous: null, previousKey: null, conflictIssues: [] as LocalToplistIssue[], identity: null as string | null };
  return {
    previous: candidate.previous,
    previousKey: candidate.previousKey,
    conflictIssues: [] as LocalToplistIssue[],
    identity: candidate.link.identityKey ?? currentKey,
  };
};

const snapshotServerSets = (previous: readonly LocalToplistSnapshotMeta[], current: readonly LocalToplistSnapshotMeta[]) => {
  const previousServers = new Set(previous.map((snapshot) => normalizeLocalToplistServer(snapshot.server)).filter((value): value is string => !!value));
  const currentServers = new Set(current.map((snapshot) => normalizeLocalToplistServer(snapshot.server)).filter((value): value is string => !!value));
  return { previousServers, currentServers };
};

const partialServerIssues = (previous: readonly LocalToplistSnapshotMeta[], current: readonly LocalToplistSnapshotMeta[]) => {
  const { previousServers, currentServers } = snapshotServerSets(previous, current);
  const issues: LocalToplistIssue[] = [];
  previousServers.forEach((server) => {
    if (!currentServers.has(server)) {
      issues.push(issue("partial-comparison-side", `Server ${server} exists only in previous month.`, { server }));
    }
  });
  currentServers.forEach((server) => {
    if (!previousServers.has(server)) {
      issues.push(issue("partial-comparison-side", `Server ${server} exists only in current month.`, { server }));
    }
  });
  return issues;
};

const sortComparisonRows = <T extends { currentTableRank: number | null; previousTableRank: number | null; status: LocalToplistComparisonStatus }>(
  rows: T[],
) => rows.sort((left, right) => {
  const leftRank = left.currentTableRank ?? left.previousTableRank ?? Number.MAX_SAFE_INTEGER;
  const rightRank = right.currentTableRank ?? right.previousTableRank ?? Number.MAX_SAFE_INTEGER;
  if (leftRank !== rightRank) return leftRank - rightRank;
  return left.status.localeCompare(right.status);
});

export const compareLocalToplists = (
  previous: LocalToplistComparisonSnapshotSet,
  current: LocalToplistComparisonSnapshotSet,
  options: LocalToplistComparisonOptions = {},
): LocalToplistComparisonResult => {
  const issues: LocalToplistIssue[] = [
    ...(previous.issues ?? []),
    ...(current.issues ?? []),
    ...partialServerIssues(previous.snapshots, current.snapshots),
  ];
  const previousMonthIndex = parseMonthIndex(previous.month);
  const currentMonthIndex = parseMonthIndex(current.month);
  const validMonthOrder = previousMonthIndex != null && currentMonthIndex != null && previousMonthIndex < currentMonthIndex;
  if (!validMonthOrder) {
    issues.push(issue(
      "invalid-comparison-months",
      `Invalid comparison months: previous=${previous.month}, current=${current.month}.`,
      { severity: "error" },
    ));
  }

  const previousPlayerView = buildLocalPlayerToplistView(previous.players, {
    filters: options.filters,
    sort: { metricKey: options.playerSort?.metricKey ?? "sum", direction: options.playerSort?.direction },
    playerAverageMode: options.playerAverageMode,
    playerLimit: null,
  });
  const currentPlayerView = buildLocalPlayerToplistView(current.players, {
    filters: options.filters,
    sort: { metricKey: options.playerSort?.metricKey ?? "sum", direction: options.playerSort?.direction },
    playerAverageMode: options.playerAverageMode,
    playerLimit: null,
  });
  const previousGuildView = buildLocalGuildToplistView(previous.guilds, {
    filters: options.filters,
    sort: { metricKey: options.guildSort?.metricKey ?? "guildAvgLevel", direction: options.guildSort?.direction },
    guildAverageMode: options.guildAverageMode,
  });
  const currentGuildView = buildLocalGuildToplistView(current.guilds, {
    filters: options.filters,
    sort: { metricKey: options.guildSort?.metricKey ?? "guildAvgLevel", direction: options.guildSort?.direction },
    guildAverageMode: options.guildAverageMode,
  });

  issues.push(...previousPlayerView.issues, ...currentPlayerView.issues, ...previousGuildView.issues, ...currentGuildView.issues);

  const playerMetric = getMetric(LOCAL_PLAYER_TOPLIST_METRICS, currentPlayerView.sort.metricKey, "sum");
  const guildMetric = getMetric(LOCAL_GUILD_TOPLIST_METRICS, currentGuildView.sort.metricKey, "guildAvgLevel");
  const playerCompare = comparePlayers(
    previousPlayerView.rows,
    currentPlayerView.rows,
    playerMetric,
    options.playerIdentityLinks ?? [],
    validMonthOrder,
  );
  const guildCompare = compareGuilds(
    previousGuildView.rows,
    currentGuildView.rows,
    guildMetric,
    options.guildAverageMode ?? "base",
    options.guildIdentityLinks ?? [],
    validMonthOrder,
  );
  issues.push(...playerCompare.issues, ...guildCompare.issues);

  const players = validMonthOrder ? sortComparisonRows(playerCompare.rows) : [];
  const guilds = validMonthOrder ? sortComparisonRows(guildCompare.rows) : [];
  const status = issues.some((entry) => entry.severity === "error")
    ? "empty"
    : issues.some((entry) => entry.code === "partial-comparison-side")
      ? "partial"
      : "complete";

  return {
    status,
    previousMonth: previous.month,
    currentMonth: current.month,
    previousSnapshots: [...previous.snapshots],
    currentSnapshots: [...current.snapshots],
    previousPlayerView,
    currentPlayerView,
    previousGuildView,
    currentGuildView,
    players,
    guilds,
    counts: {
      playersMatched: players.filter((row) => row.status === "matched").length,
      playersEntered: players.filter((row) => row.status === "entered").length,
      playersLeft: players.filter((row) => row.status === "left").length,
      playersConflicts: players.filter((row) => row.status === "conflict").length,
      guildsMatched: guilds.filter((row) => row.status === "matched").length,
      guildsEntered: guilds.filter((row) => row.status === "entered").length,
      guildsLeft: guilds.filter((row) => row.status === "left").length,
      guildsConflicts: guilds.filter((row) => row.status === "conflict").length,
    },
    issues,
  };
};

export const compareLocalPlayerToplists = (
  previous: LocalToplistComparisonSnapshotSet,
  current: LocalToplistComparisonSnapshotSet,
  options: LocalToplistComparisonOptions = {},
) => compareLocalToplists(previous, current, options).players;

export const compareLocalGuildToplists = (
  previous: LocalToplistComparisonSnapshotSet,
  current: LocalToplistComparisonSnapshotSet,
  options: LocalToplistComparisonOptions = {},
) => compareLocalToplists(previous, current, options).guilds;

const comparePlayers = (
  previousRows: readonly RankedPlayer[],
  currentRows: readonly RankedPlayer[],
  metric: LocalToplistMetricDefinition,
  links: readonly LocalToplistIdentityLink[],
  validMonthOrder: boolean,
) => {
  const issues: LocalToplistIssue[] = [];
  if (!validMonthOrder) return { rows: [] as LocalPlayerToplistComparisonRow[], issues };

  const previousByKey = buildRankedMap(
    previousRows,
    (row) => row.identifier,
    "duplicate-comparison-identity",
    "Duplicate previous player identity; comparison match is suppressed.",
    issues,
  );
  const currentByKey = buildRankedMap(
    currentRows,
    (row) => row.identifier,
    "duplicate-comparison-identity",
    "Duplicate current player identity; comparison match is suppressed.",
    issues,
  );
  const usedPreviousKeys = new Set<string>();
  const rows: LocalPlayerToplistComparisonRow[] = [];

  currentRows.forEach((current) => {
    const currentKey = identityKey(current.server, current.identifier);
    if (!currentKey || !currentByKey.has(currentKey)) return;
    const exactPrevious = previousByKey.get(currentKey) ?? null;
    let previous = exactPrevious;
    let previousKey = exactPrevious ? currentKey : null;
    let matchType: LocalToplistComparisonMatchType = exactPrevious ? "exact" : "none";
    let identity = currentKey;
    let rowIssues: LocalToplistIssue[] = [];

    if (!previous) {
      const fusion = resolveFusionMatch(
        current,
        previousByKey,
        usedPreviousKeys,
        links,
        "ambiguous-player-fusion",
        (row) => row.identifier,
      );
      previous = fusion.previous;
      previousKey = fusion.previousKey;
      rowIssues = fusion.conflictIssues;
      if (rowIssues.length) matchType = "conflict";
      if (previous) {
        matchType = "fusion";
        identity = fusion.identity ?? currentKey;
      }
    }

    if (rowIssues.length) {
      issues.push(...rowIssues);
      rows.push({
        status: "conflict",
        matchType: "conflict",
        identityKey: currentKey,
        previous: null,
        current,
        previousTableRank: null,
        currentTableRank: current.tableRank,
        rankDelta: null,
        metricDelta: null,
        deltas: playerDeltas(current, null),
        statsDays: null,
        statsPerDay: null,
        issues: rowIssues,
      });
      return;
    }

    if (previous && previousKey) {
      usedPreviousKeys.add(previousKey);
      const stats = computePlayerStatsPerDay(current, previous);
      rows.push({
        status: "matched",
        matchType,
        identityKey: identity,
        previous,
        current,
        previousTableRank: previous.tableRank,
        currentTableRank: current.tableRank,
        rankDelta: previous.tableRank - current.tableRank,
        metricDelta: numericMetricDelta(current, previous, metric, "base"),
        deltas: playerDeltas(current, previous),
        statsDays: stats.statsDays,
        statsPerDay: stats.statsPerDay,
        issues: [],
      });
      return;
    }

    rows.push({
      status: "entered",
      matchType: "none",
      identityKey: currentKey,
      previous: null,
      current,
      previousTableRank: null,
      currentTableRank: current.tableRank,
      rankDelta: null,
      metricDelta: null,
      deltas: playerDeltas(current, null),
      statsDays: null,
      statsPerDay: null,
      issues: [],
    });
  });

  previousRows.forEach((previous) => {
    const previousKey = identityKey(previous.server, previous.identifier);
    if (!previousKey || usedPreviousKeys.has(previousKey) || currentByKey.has(previousKey)) return;
    rows.push({
      status: "left",
      matchType: "none",
      identityKey: previousKey,
      previous,
      current: null,
      previousTableRank: previous.tableRank,
      currentTableRank: null,
      rankDelta: null,
      metricDelta: null,
      deltas: playerDeltas(null, previous),
      statsDays: null,
      statsPerDay: null,
      issues: [],
    });
  });

  return { rows, issues };
};

const compareGuilds = (
  previousRows: readonly RankedGuild[],
  currentRows: readonly RankedGuild[],
  metric: LocalToplistMetricDefinition,
  guildAverageMode: LocalGuildAverageMode,
  links: readonly LocalToplistIdentityLink[],
  validMonthOrder: boolean,
) => {
  const issues: LocalToplistIssue[] = [];
  if (!validMonthOrder) return { rows: [] as LocalGuildToplistComparisonRow[], issues };

  const previousByKey = buildRankedMap(
    previousRows,
    (row) => row.guildIdentifier,
    "duplicate-comparison-identity",
    "Duplicate previous guild identity; comparison match is suppressed.",
    issues,
  );
  const currentByKey = buildRankedMap(
    currentRows,
    (row) => row.guildIdentifier,
    "duplicate-comparison-identity",
    "Duplicate current guild identity; comparison match is suppressed.",
    issues,
  );
  const usedPreviousKeys = new Set<string>();
  const rows: LocalGuildToplistComparisonRow[] = [];

  currentRows.forEach((current) => {
    const currentKey = identityKey(current.server, current.guildIdentifier);
    if (!currentKey || !currentByKey.has(currentKey)) return;
    const exactPrevious = previousByKey.get(currentKey) ?? null;
    let previous = exactPrevious;
    let previousKey = exactPrevious ? currentKey : null;
    let matchType: LocalToplistComparisonMatchType = exactPrevious ? "exact" : "none";
    let identity = currentKey;
    let rowIssues: LocalToplistIssue[] = [];

    if (!previous) {
      const fusion = resolveFusionMatch(
        current,
        previousByKey,
        usedPreviousKeys,
        links,
        "ambiguous-guild-fusion",
        (row) => row.guildIdentifier,
      );
      previous = fusion.previous;
      previousKey = fusion.previousKey;
      rowIssues = fusion.conflictIssues;
      if (rowIssues.length) matchType = "conflict";
      if (previous) {
        matchType = "fusion";
        identity = fusion.identity ?? currentKey;
      }
    }

    if (rowIssues.length) {
      issues.push(...rowIssues);
      rows.push({
        status: "conflict",
        matchType: "conflict",
        identityKey: currentKey,
        previous: null,
        current,
        previousTableRank: null,
        currentTableRank: current.tableRank,
        rankDelta: null,
        metricDelta: null,
        deltas: guildDeltas(current, null, []),
        issues: rowIssues,
      });
      return;
    }

    if (previous && previousKey) {
      usedPreviousKeys.add(previousKey);
      const rowIssuesForAverages: LocalToplistIssue[] = [];
      rows.push({
        status: "matched",
        matchType,
        identityKey: identity,
        previous,
        current,
        previousTableRank: previous.tableRank,
        currentTableRank: current.tableRank,
        rankDelta: previous.tableRank - current.tableRank,
        metricDelta: numericMetricDelta(current, previous, metric, guildAverageMode),
        deltas: guildDeltas(current, previous, rowIssuesForAverages),
        issues: rowIssuesForAverages,
      });
      issues.push(...rowIssuesForAverages);
      return;
    }

    rows.push({
      status: "entered",
      matchType: "none",
      identityKey: currentKey,
      previous: null,
      current,
      previousTableRank: null,
      currentTableRank: current.tableRank,
      rankDelta: null,
      metricDelta: null,
      deltas: guildDeltas(current, null, []),
      issues: [],
    });
  });

  previousRows.forEach((previous) => {
    const previousKey = identityKey(previous.server, previous.guildIdentifier);
    if (!previousKey || usedPreviousKeys.has(previousKey) || currentByKey.has(previousKey)) return;
    rows.push({
      status: "left",
      matchType: "none",
      identityKey: previousKey,
      previous,
      current: null,
      previousTableRank: previous.tableRank,
      currentTableRank: null,
      rankDelta: null,
      metricDelta: null,
      deltas: guildDeltas(null, previous, []),
      issues: [],
    });
  });

  return { rows, issues };
};
