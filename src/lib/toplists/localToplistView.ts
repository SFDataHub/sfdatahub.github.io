import { resolveServer } from "../servers/serverResolver";
import {
  LOCAL_GUILD_TOPLIST_METRICS,
  LOCAL_PLAYER_TOPLIST_METRICS,
  type LocalToplistMetricDefinition,
} from "./localToplistMetrics";
import type {
  LocalGuildToplistRow,
  LocalPlayerToplistRow,
  LocalToplistIssue,
} from "./localToplistTypes";

export type LocalToplistSortDirection = "asc" | "desc";
export type LocalGuildAverageMode = "base" | "total";

export type LocalToplistFilters = {
  servers?: readonly string[];
  playerClasses?: readonly (string | number)[];
  guilds?: readonly string[];
};

export type LocalToplistSortSpec = {
  metricKey: string;
  direction?: LocalToplistSortDirection;
};

export type LocalToplistViewOptions = {
  filters?: LocalToplistFilters;
  sort?: LocalToplistSortSpec;
  playerAverageMode?: LocalGuildAverageMode;
  guildAverageMode?: LocalGuildAverageMode;
  playerLimit?: number | null;
};

export type LocalToplistRankedPlayerRow = LocalPlayerToplistRow & {
  tableRank: number;
};

export type LocalToplistRankedGuildRow = LocalGuildToplistRow & {
  tableRank: number;
};

export type LocalPlayerToplistViewResult = {
  rowKind: "player";
  rows: LocalToplistRankedPlayerRow[];
  filters: {
    servers: string[];
    playerClasses: string[];
    guilds: string[];
  };
  sort: {
    metricKey: string;
    direction: LocalToplistSortDirection;
    playerAverageMode: LocalGuildAverageMode;
  };
  issues: LocalToplistIssue[];
};

export type LocalGuildToplistViewResult = {
  rowKind: "guild";
  rows: LocalToplistRankedGuildRow[];
  filters: {
    servers: string[];
  };
  sort: {
    metricKey: string;
    direction: LocalToplistSortDirection;
    guildAverageMode: LocalGuildAverageMode;
  };
  issues: LocalToplistIssue[];
};

const DEFAULT_PLAYER_METRIC_KEY = "sum";
const DEFAULT_GUILD_METRIC_KEY = "guildAvgLevel";
export const LOCAL_PLAYER_TOPLIST_VIEW_LIMIT = 1000;

const normalizeToken = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

export const normalizeLocalToplistServer = (value: unknown): string | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const resolved = resolveServer(raw);
  return (resolved?.code ?? raw).trim().toUpperCase() || null;
};

export const normalizeLocalToplistPlayerClass = (value: unknown): string | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return raw.toLowerCase().replace(/[\s_]+/g, "-");
};

export const normalizeLocalToplistGuild = (value: unknown): string | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return raw.toLocaleLowerCase();
};

const normalizeFilters = (filters: LocalToplistFilters | undefined) => {
  const servers = [
    ...new Set((filters?.servers ?? []).map(normalizeLocalToplistServer).filter((value): value is string => !!value)),
  ];
  const playerClasses = [
    ...new Set((filters?.playerClasses ?? []).map(normalizeLocalToplistPlayerClass).filter((value): value is string => !!value)),
  ];
  const guilds = [
    ...new Set((filters?.guilds ?? []).map(normalizeLocalToplistGuild).filter((value): value is string => !!value)),
  ];
  return { servers, playerClasses, guilds };
};

const issue = (code: LocalToplistIssue["code"], message: string): LocalToplistIssue => ({
  code,
  severity: "warning",
  message,
});

const getMetric = (
  definitions: readonly LocalToplistMetricDefinition[],
  metricKey: string | null | undefined,
  fallbackKey: string,
) => definitions.find((definition) => definition.metricKey === metricKey)
  ?? definitions.find((definition) => definition.metricKey === fallbackKey)
  ?? definitions[0];

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const getFieldValue = <T extends Record<string, unknown>>(
  row: T,
  metric: LocalToplistMetricDefinition,
  guildAverageMode: LocalGuildAverageMode,
): number | string | null => {
  let field = metric.existingField;
  if (metric.rowKind === "player" && guildAverageMode === "total") {
    if (metric.metricKey === "main") field = "mainTotal";
    if (metric.metricKey === "constitution") field = "conTotal";
    if (metric.metricKey === "sum") field = "sumTotal";
  }
  if (metric.rowKind === "guild" && guildAverageMode === "total") {
    if (metric.metricKey === "guildAvgMain") field = "avgAttrTotal";
    if (metric.metricKey === "guildAvgCon") field = "avgConTotal";
    if (metric.metricKey === "guildAvgSum") field = "avgTotalStats";
  }

  const value = row[field];
  if (value == null || metric.missingValueBehavior === "not-derived") return null;
  if (metric.valueType === "number" || metric.valueType === "timestamp") {
    return isFiniteNumber(value) ? value : null;
  }
  const text = String(value).trim();
  return text || null;
};

const compareMetricValues = (
  left: number | string | null,
  right: number | string | null,
  metric: LocalToplistMetricDefinition,
  direction: LocalToplistSortDirection,
) => {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;

  let cmp = 0;
  if (metric.valueType === "string") {
    cmp = String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
  } else {
    cmp = Number(left) - Number(right);
  }
  return direction === "asc" ? cmp : -cmp;
};

const compareTextAsc = (left: unknown, right: unknown) =>
  String(left ?? "").localeCompare(String(right ?? ""), undefined, { numeric: true, sensitivity: "base" });

const playerTieKey = (row: LocalPlayerToplistRow) => [
  normalizeLocalToplistServer(row.server) ?? "",
  normalizeToken(row.identifier),
  normalizeToken(row.name),
  normalizeLocalToplistPlayerClass(row.class) ?? "",
].join("\u0000");

const guildTieKey = (row: LocalGuildToplistRow) => [
  normalizeLocalToplistServer(row.server) ?? "",
  normalizeToken(row.name),
  normalizeToken(row.guildIdentifier || row.guildId),
].join("\u0000");

const withTableRanks = <T extends LocalPlayerToplistRow | LocalGuildToplistRow>(rows: T[]) =>
  rows.map((row, index) => ({ ...row, tableRank: index + 1 }));

const comparePlayerTie = (
  left: LocalPlayerToplistRow,
  right: LocalPlayerToplistRow,
  direction: LocalToplistSortDirection,
) => {
  const cmp = compareTextAsc(playerTieKey(left), playerTieKey(right));
  return direction === "asc" ? cmp : -cmp;
};

const normalizePlayerLimit = (value: unknown) => {
  if (value === null) return null;
  const parsed = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : LOCAL_PLAYER_TOPLIST_VIEW_LIMIT;
  return Math.max(0, Math.min(LOCAL_PLAYER_TOPLIST_VIEW_LIMIT, parsed));
};

export const buildLocalPlayerToplistBaseCohort = (
  rows: readonly LocalPlayerToplistRow[],
  options: Pick<LocalToplistViewOptions, "filters" | "playerLimit"> = {},
) => {
  const filters = normalizeFilters(options.filters);
  const serverSet = filters.servers.length ? new Set(filters.servers) : null;
  const classSet = filters.playerClasses.length ? new Set(filters.playerClasses) : null;
  const playerLimit = normalizePlayerLimit(options.playerLimit);
  const baseMetric = getMetric(LOCAL_PLAYER_TOPLIST_METRICS, DEFAULT_PLAYER_METRIC_KEY, DEFAULT_PLAYER_METRIC_KEY);

  const filtered = rows
    .filter((row) => {
      const server = normalizeLocalToplistServer(row.server);
      if (serverSet && (!server || !serverSet.has(server))) return false;
      const playerClass = normalizeLocalToplistPlayerClass(row.class);
      if (classSet && (!playerClass || !classSet.has(playerClass))) return false;
      return true;
    })
    .map((row, sourceIndex) => ({ row, sourceIndex }));

  const baseSorted = filtered
    .sort((left, right) => {
      const metricCmp = compareMetricValues(
        getFieldValue(left.row as unknown as Record<string, unknown>, baseMetric, "base"),
        getFieldValue(right.row as unknown as Record<string, unknown>, baseMetric, "base"),
        baseMetric,
        "desc",
      );
      if (metricCmp !== 0) return metricCmp;

      const tieCmp = comparePlayerTie(left.row, right.row, "desc");
      if (tieCmp !== 0) return tieCmp;
      return left.sourceIndex - right.sourceIndex;
    })
    .map((entry) => entry.row);

  return playerLimit == null ? baseSorted : baseSorted.slice(0, playerLimit);
};

export const buildLocalPlayerToplistView = (
  rows: readonly LocalPlayerToplistRow[],
  options: LocalToplistViewOptions = {},
): LocalPlayerToplistViewResult => {
  const filters = normalizeFilters(options.filters);
  const guildSet = filters.guilds.length ? new Set(filters.guilds) : null;
  const metric = getMetric(LOCAL_PLAYER_TOPLIST_METRICS, options.sort?.metricKey, DEFAULT_PLAYER_METRIC_KEY);
  const direction = options.sort?.direction ?? metric.defaultDirection;
  const playerAverageMode = options.playerAverageMode ?? "base";
  const issues: LocalToplistIssue[] = [];

  if (options.sort?.metricKey && options.sort.metricKey !== metric.metricKey) {
    issues.push(issue("invalid-source-metadata", `Unknown player toplist metric ${options.sort.metricKey}; using ${metric.metricKey}.`));
  }

  const baseLimited = buildLocalPlayerToplistBaseCohort(rows, {
    filters,
    playerLimit: options.playerLimit,
  });
  const guildFiltered = guildSet
    ? baseLimited.filter((row) => {
        const guild = normalizeLocalToplistGuild(row.guild);
        return !!guild && guildSet.has(guild);
      })
    : baseLimited;

  const sorted = guildFiltered
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const metricCmp = compareMetricValues(
        getFieldValue(left.row as unknown as Record<string, unknown>, metric, playerAverageMode),
        getFieldValue(right.row as unknown as Record<string, unknown>, metric, playerAverageMode),
        metric,
        direction,
      );
      if (metricCmp !== 0) return metricCmp;

      const tieCmp = comparePlayerTie(left.row, right.row, direction);
      if (tieCmp !== 0) return tieCmp;
      return left.index - right.index;
    })
    .map((entry) => entry.row);

  return {
    rowKind: "player",
    rows: withTableRanks(sorted),
    filters,
    sort: { metricKey: metric.metricKey, direction, playerAverageMode },
    issues,
  };
};

export const buildLocalGuildToplistView = (
  rows: readonly LocalGuildToplistRow[],
  options: LocalToplistViewOptions = {},
): LocalGuildToplistViewResult => {
  const filters = normalizeFilters(options.filters);
  const serverSet = filters.servers.length ? new Set(filters.servers) : null;
  const metric = getMetric(LOCAL_GUILD_TOPLIST_METRICS, options.sort?.metricKey, DEFAULT_GUILD_METRIC_KEY);
  const direction = options.sort?.direction ?? metric.defaultDirection;
  const guildAverageMode = options.guildAverageMode ?? "base";
  const issues: LocalToplistIssue[] = [];

  if (options.sort?.metricKey && options.sort.metricKey !== metric.metricKey) {
    issues.push(issue("invalid-source-metadata", `Unknown guild toplist metric ${options.sort.metricKey}; using ${metric.metricKey}.`));
  }

  const sorted = rows
    .filter((row) => {
      const server = normalizeLocalToplistServer(row.server);
      return !serverSet || (!!server && serverSet.has(server));
    })
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const metricCmp = compareMetricValues(
        getFieldValue(left.row as unknown as Record<string, unknown>, metric, guildAverageMode),
        getFieldValue(right.row as unknown as Record<string, unknown>, metric, guildAverageMode),
        metric,
        direction,
      );
      if (metricCmp !== 0) return metricCmp;

      const tieCmp = compareTextAsc(guildTieKey(left.row), guildTieKey(right.row));
      if (tieCmp !== 0) return tieCmp;
      return left.index - right.index;
    })
    .map((entry) => entry.row);

  return {
    rowKind: "guild",
    rows: withTableRanks(sorted),
    filters: { servers: filters.servers },
    sort: { metricKey: metric.metricKey, direction, guildAverageMode },
    issues,
  };
};

export const getLocalToplistMetricValue = (
  row: LocalPlayerToplistRow | LocalGuildToplistRow,
  metric: LocalToplistMetricDefinition,
  guildAverageMode: LocalGuildAverageMode = "base",
) => getFieldValue(row as unknown as Record<string, unknown>, metric, guildAverageMode);
