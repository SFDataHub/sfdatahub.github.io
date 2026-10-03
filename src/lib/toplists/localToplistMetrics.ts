export type LocalToplistMetricRowKind = "player" | "guild";
export type LocalToplistMetricValueType = "number" | "string" | "timestamp";
export type LocalToplistMetricMissingBehavior = "last" | "not-derived";

export type LocalToplistMetricDefinition = {
  metricKey: string;
  rowKind: LocalToplistMetricRowKind;
  valueType: LocalToplistMetricValueType;
  defaultDirection: "asc" | "desc";
  missingValueBehavior: LocalToplistMetricMissingBehavior;
  existingField: string;
};

export const LOCAL_PLAYER_TOPLIST_METRICS: readonly LocalToplistMetricDefinition[] = [
  { metricKey: "level", rowKind: "player", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "level" },
  { metricKey: "main", rowKind: "player", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "main" },
  { metricKey: "constitution", rowKind: "player", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "con" },
  { metricKey: "sum", rowKind: "player", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "sum" },
  { metricKey: "statsDay", rowKind: "player", valueType: "number", defaultDirection: "desc", missingValueBehavior: "not-derived", existingField: "statsPerDay" },
  { metricKey: "ratio", rowKind: "player", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "ratio" },
  { metricKey: "mine", rowKind: "player", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "mine" },
  { metricKey: "treasury", rowKind: "player", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "treasury" },
  { metricKey: "mainTotal", rowKind: "player", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "mainTotal" },
  { metricKey: "conTotal", rowKind: "player", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "conTotal" },
  { metricKey: "sumTotal", rowKind: "player", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "sumTotal" },
  { metricKey: "statsDayTotal", rowKind: "player", valueType: "number", defaultDirection: "desc", missingValueBehavior: "not-derived", existingField: "statsDayTotal" },
  { metricKey: "xpProgress", rowKind: "player", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "xpProgress" },
  { metricKey: "xpTotal", rowKind: "player", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "xpTotal" },
  { metricKey: "lastScan", rowKind: "player", valueType: "timestamp", defaultDirection: "desc", missingValueBehavior: "last", existingField: "latestScanAtSec" },
];

export const LOCAL_GUILD_TOPLIST_METRICS: readonly LocalToplistMetricDefinition[] = [
  { metricKey: "guildHofRank", rowKind: "guild", valueType: "number", defaultDirection: "asc", missingValueBehavior: "last", existingField: "hofRank" },
  { metricKey: "guildHonor", rowKind: "guild", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "honor" },
  { metricKey: "guildMembers", rowKind: "guild", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "memberCount" },
  { metricKey: "guildAvgLevel", rowKind: "guild", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "avgLevel" },
  { metricKey: "guildAvgMain", rowKind: "guild", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "avgBaseMain" },
  { metricKey: "guildAvgCon", rowKind: "guild", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "avgConBase" },
  { metricKey: "guildAvgSum", rowKind: "guild", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "avgSumBaseTotal" },
  { metricKey: "guildRaids", rowKind: "guild", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "raids" },
  { metricKey: "guildPortal", rowKind: "guild", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "portalFloor" },
  { metricKey: "guildHydra", rowKind: "guild", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "hydra" },
  { metricKey: "guildInstructor", rowKind: "guild", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "instructor" },
];

export const LOCAL_TOPLIST_METRICS = [
  ...LOCAL_PLAYER_TOPLIST_METRICS,
  ...LOCAL_GUILD_TOPLIST_METRICS,
] as const;
