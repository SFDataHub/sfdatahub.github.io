import { PLAYER_ATTRIBUTE_COLUMNS } from "./playerAttributeColumns";
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
  ...PLAYER_ATTRIBUTE_COLUMNS.map(c => ({ metricKey: c.key, rowKind: "player" as const, valueType: "number" as const, defaultDirection: "desc" as const, missingValueBehavior: "last" as const, existingField: c.field ?? `attribute:${c.key}` })),
  { metricKey: "name", rowKind: "player", valueType: "string", defaultDirection: "asc", missingValueBehavior: "last", existingField: "name" },
  { metricKey: "server", rowKind: "player", valueType: "string", defaultDirection: "asc", missingValueBehavior: "last", existingField: "server" },
  { metricKey: "class", rowKind: "player", valueType: "string", defaultDirection: "asc", missingValueBehavior: "last", existingField: "class" },
  { metricKey: "guild", rowKind: "player", valueType: "string", defaultDirection: "asc", missingValueBehavior: "last", existingField: "guild" },

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
  { metricKey: "guildName", rowKind: "guild", valueType: "string", defaultDirection: "asc", missingValueBehavior: "last", existingField: "name" },
  { metricKey: "guildServer", rowKind: "guild", valueType: "string", defaultDirection: "asc", missingValueBehavior: "last", existingField: "server" },
  { metricKey: "guildLastScan", rowKind: "guild", valueType: "timestamp", defaultDirection: "desc", missingValueBehavior: "last", existingField: "latestScanAtSec" },
  { metricKey: "guildPetLevel", rowKind: "guild", valueType: "number", defaultDirection: "desc", missingValueBehavior: "last", existingField: "petLevel" },

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
