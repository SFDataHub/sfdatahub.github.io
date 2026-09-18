import {
  detectSfPlayerSaveLayout,
  readSfPlayerSaveArray,
  readSfSaveNumber,
  type SfPlayerSaveLayout,
} from "./playerSaveLayout";
import type { NormalizedPlayerFieldMetadata, NormalizedPlayerFieldProvenance, NormalizedPlayerFieldStatus } from "./normalizedPlayer";

type DungeonCollectionKey = "normal" | "shadow" | "class";
type DungeonSpecialKey = "tower" | "twister" | "raid" | "youtube" | "sandstorm";
type PortalKey = "player" | "guild";

export type NormalizedDungeonProgressEntry = {
  index: number;
  gameId: number | null;
  rawIndex: number | null;
  progress: number | null;
  displayProgress: number | null;
  locked: boolean | null;
  unlocked: boolean | null;
};

export type NormalizedDungeonCollection = {
  entries: NormalizedDungeonProgressEntry[];
  count: number;
  totalProgress: number | null;
  unlockedCount: number | null;
};

export type NormalizedDungeonScalar = {
  progress: number | null;
  displayProgress: number | null;
  locked: boolean | null;
  unlocked: boolean | null;
};

export type NormalizedDungeons = {
  normal: NormalizedDungeonCollection;
  shadow: NormalizedDungeonCollection;
  class: NormalizedDungeonCollection;
  tower: NormalizedDungeonScalar;
  twister: NormalizedDungeonScalar;
  raid: NormalizedDungeonScalar;
  youtube: NormalizedDungeonScalar;
  sandstorm: NormalizedDungeonScalar;
  portals: {
    player: NormalizedDungeonScalar;
    guild: NormalizedDungeonScalar;
  };
  totals: {
    normal: number | null;
    shadow: number | null;
    class: number | null;
    normalUnlocked: number | null;
    shadowUnlocked: number | null;
    classUnlocked: number | null;
  };
  metadata: {
    layout: SfPlayerSaveLayout;
    fields: Record<string, NormalizedPlayerFieldMetadata>;
  };
};

const DUNGEON_OPEN = -1;
const DUNGEON_LOCKED = -2;
const CLASS_DUNGEON_COUNT = 5;
const DUNGEON_ARR_TO_DID = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
  30, 31, 32, 33, 34, 35,
];
const PLAYA_TO_INTERNAL_MAPPING = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
  29, 32, 33, 34, 35, 36,
];
const LEGACY_TO_INTERNAL_MAPPING = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17, 18];
const LEGACY_MISSING = [19, 20, 21, 22, 23];
const LEGACY_SPLIT_TO_INTERNAL_MAPPING: Array<[number, number]> = [
  [12, 27],
  [13, 24],
  [14, 25],
  [15, 26],
];

const toFiniteNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asArray = (value: unknown): unknown[] | null => (Array.isArray(value) ? value : null);

const hasArrayIndex = (values: unknown[] | null, index: number): boolean =>
  Boolean(values && index >= 0 && index < values.length && Object.prototype.hasOwnProperty.call(values, index));

const mark = (
  fields: Record<string, NormalizedPlayerFieldMetadata>,
  path: string,
  status: NormalizedPlayerFieldStatus,
  provenance?: NormalizedPlayerFieldProvenance,
) => {
  fields[path] = provenance ? { status, provenance } : { status };
};

const markScalar = (
  fields: Record<string, NormalizedPlayerFieldMetadata>,
  key: DungeonSpecialKey | `portals.${PortalKey}`,
  status: NormalizedPlayerFieldStatus,
  provenance?: NormalizedPlayerFieldProvenance,
) => {
  mark(fields, `${key}.progress`, status, provenance);
  mark(fields, `${key}.displayProgress`, status === "available" ? "available" : status, status === "available" ? "derived" : undefined);
  mark(fields, `${key}.locked`, status === "available" ? "available" : status, status === "available" ? "derived" : undefined);
  mark(fields, `${key}.unlocked`, status === "available" ? "available" : status, status === "available" ? "derived" : undefined);
};

const emptyScalar = (): NormalizedDungeonScalar => ({
  progress: null,
  displayProgress: null,
  locked: null,
  unlocked: null,
});

const createScalar = (
  value: number | null,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
  key: DungeonSpecialKey | `portals.${PortalKey}`,
  status: NormalizedPlayerFieldStatus,
  provenance?: NormalizedPlayerFieldProvenance,
): NormalizedDungeonScalar => {
  markScalar(fields, key, status, provenance);
  if (status !== "available" || value == null) return emptyScalar();
  return {
    progress: value,
    displayProgress: Math.max(0, value),
    locked: value <= DUNGEON_LOCKED,
    unlocked: value > DUNGEON_LOCKED,
  };
};

const readNumberAt = (
  values: unknown[] | null,
  index: number,
  path: string,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  if (!hasArrayIndex(values, index)) {
    mark(fields, path, "missing");
    return null;
  }
  const value = toFiniteNumberOrNull(values?.[index]);
  if (value == null) {
    mark(fields, path, "invalid");
    return null;
  }
  mark(fields, path, "available", "raw");
  return value;
};

const buildCollection = (
  key: DungeonCollectionKey,
  values: Array<number | null>,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
  status: NormalizedPlayerFieldStatus,
  rawIndexes: Array<number | null>,
  provenance: NormalizedPlayerFieldProvenance | undefined,
): NormalizedDungeonCollection => {
  const gameIds = key === "class" ? [300, 301, 302, 303, 304] : DUNGEON_ARR_TO_DID;
  const entries = values.map((progress, index) => {
    const path = `${key}.entries.${index}`;
    const progressPath = `${path}.progress`;
    if (!fields[progressPath]) {
      mark(fields, progressPath, status, status === "available" ? provenance : undefined);
    }
    const progressStatus = progress == null ? (fields[progressPath]?.status ?? status) : status;
    mark(fields, `${path}.displayProgress`, progressStatus === "available" ? "available" : progressStatus, progressStatus === "available" ? "derived" : undefined);
    mark(fields, `${path}.locked`, progressStatus === "available" ? "available" : progressStatus, progressStatus === "available" ? "derived" : undefined);
    mark(fields, `${path}.unlocked`, progressStatus === "available" ? "available" : progressStatus, progressStatus === "available" ? "derived" : undefined);
    return {
      index,
      gameId: gameIds[index] ?? null,
      rawIndex: rawIndexes[index] ?? null,
      progress,
      displayProgress: progress == null ? null : Math.max(0, progress),
      locked: progress == null ? null : progress <= DUNGEON_LOCKED,
      unlocked: progress == null ? null : progress > DUNGEON_LOCKED,
    };
  });

  const validProgress = values.filter((value): value is number => value != null);
  const hasAllValues = validProgress.length === values.length;
  const totalProgress = hasAllValues ? validProgress.reduce((total, value) => total + Math.max(0, value), 0) : null;
  const unlockedCount = hasAllValues ? validProgress.reduce((total, value) => total + (value > DUNGEON_LOCKED ? 1 : 0), 0) : null;
  mark(fields, `${key}.totalProgress`, status === "available" && hasAllValues ? "available" : status, status === "available" && hasAllValues ? "derived" : undefined);
  mark(fields, `${key}.unlockedCount`, status === "available" && hasAllValues ? "available" : status, status === "available" && hasAllValues ? "derived" : undefined);

  return {
    entries,
    count: values.length,
    totalProgress,
    unlockedCount,
  };
};

const emptyCollection = (
  key: DungeonCollectionKey,
  count: number,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
  status: NormalizedPlayerFieldStatus,
): NormalizedDungeonCollection => buildCollection(key, Array.from({ length: count }, () => null), fields, status, [], undefined);

const readModernCollection = (
  key: "normal" | "shadow",
  values: unknown[] | null,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): NormalizedDungeonCollection => {
  const rawIndexes = PLAYA_TO_INTERNAL_MAPPING;
  const progress = rawIndexes.map((rawIndex, index) =>
    readNumberAt(values, rawIndex, `${key}.entries.${index}.progress`, fields),
  );
  return buildCollection(key, progress, fields, "available", rawIndexes, "raw");
};

const readDirectCollection = (
  key: DungeonCollectionKey,
  values: unknown[] | null,
  count: number,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): NormalizedDungeonCollection => {
  if (!values) return emptyCollection(key, count, fields, "missing");
  const progress = Array.from({ length: count }, (_, index) =>
    readNumberAt(values, index, `${key}.entries.${index}.progress`, fields),
  );
  return buildCollection(key, progress, fields, "available", Array.from({ length: count }, (_, index) => index), "raw");
};

const toLegacyProgress = (value: unknown): number | null => {
  const parsed = toFiniteNumberOrNull(value);
  return parsed == null ? null : parsed + DUNGEON_LOCKED;
};

const convertLegacyCollection = (
  key: "normal" | "shadow",
  legacy: unknown[] | null,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): NormalizedDungeonCollection => {
  if (!legacy) return emptyCollection(key, DUNGEON_ARR_TO_DID.length, fields, "missing");
  const progress = Array.from({ length: DUNGEON_ARR_TO_DID.length }, () => DUNGEON_LOCKED as number | null);
  const rawIndexes = Array.from({ length: DUNGEON_ARR_TO_DID.length }, () => null as number | null);

  LEGACY_TO_INTERNAL_MAPPING.forEach((index) => {
    rawIndexes[index] = index;
    progress[index] = toLegacyProgress(legacy[index]);
  });

  LEGACY_MISSING.forEach((index) => {
    progress[index] = DUNGEON_LOCKED;
  });

  LEGACY_SPLIT_TO_INTERNAL_MAPPING.forEach(([sourceDungeon, targetDungeon]) => {
    const converted = toLegacyProgress(legacy[sourceDungeon]);
    rawIndexes[sourceDungeon] = sourceDungeon;
    rawIndexes[targetDungeon] = sourceDungeon;
    if (converted == null) {
      progress[sourceDungeon] = null;
      progress[targetDungeon] = null;
      return;
    }
    progress[sourceDungeon] = Math.min(converted, 10);
    progress[targetDungeon] = converted >= 10 ? converted - 10 : DUNGEON_LOCKED;
  });

  return buildCollection(key, progress, fields, "available", rawIndexes, "derived");
};

const readScalarProperty = (
  record: Record<string, unknown>,
  key: string,
  fallbackKey?: string,
): number | null => toFiniteNumberOrNull(record[key] ?? (fallbackKey ? record[fallbackKey] : undefined));

const readUpperShort = (saveArray: unknown[] | null, index: number): number | null => {
  const value = readSfSaveNumber(saveArray, index);
  return value == null ? null : (value >> 16) & 0xffff;
};

export const normalizeSfPlayerDungeons = (
  player: unknown,
  options: { layout?: SfPlayerSaveLayout; saveArray?: unknown[] | null } = {},
): NormalizedDungeons => {
  const row = player && typeof player === "object" ? (player as Record<string, unknown>) : {};
  const saveArray = options.saveArray ?? readSfPlayerSaveArray(row);
  const layout = options.layout ?? detectSfPlayerSaveLayout(row, saveArray);
  const fields: Record<string, NormalizedPlayerFieldMetadata> = {};
  const dungeons = asRecord(row.dungeons);

  if (!dungeons) {
    if (layout === "currentCompact") {
      const tower = readUpperShort(saveArray, 21);
      const playerPortal = readSfSaveNumber(saveArray, 28);
      const guildPortal = readSfSaveNumber(saveArray, 26);

      return {
        normal: emptyCollection("normal", DUNGEON_ARR_TO_DID.length, fields, "unsupported"),
        shadow: emptyCollection("shadow", DUNGEON_ARR_TO_DID.length, fields, "unsupported"),
        class: emptyCollection("class", CLASS_DUNGEON_COUNT, fields, "unsupported"),
        tower: createScalar(tower, fields, "tower", tower == null ? "missing" : "available", tower == null ? undefined : "raw"),
        twister: createScalar(null, fields, "twister", "unsupported"),
        raid: createScalar(null, fields, "raid", "unsupported"),
        youtube: createScalar(null, fields, "youtube", "unsupported"),
        sandstorm: createScalar(null, fields, "sandstorm", "unsupported"),
        portals: {
          player: createScalar(playerPortal, fields, "portals.player", playerPortal == null ? "missing" : "available", playerPortal == null ? undefined : "raw"),
          guild: createScalar(guildPortal, fields, "portals.guild", guildPortal == null ? "missing" : "available", guildPortal == null ? undefined : "raw"),
        },
        totals: {
          normal: null,
          shadow: null,
          class: null,
          normalUnlocked: null,
          shadowUnlocked: null,
          classUnlocked: null,
        },
        metadata: { layout, fields },
      };
    }

    return {
      normal: emptyCollection("normal", DUNGEON_ARR_TO_DID.length, fields, "missing"),
      shadow: emptyCollection("shadow", DUNGEON_ARR_TO_DID.length, fields, "missing"),
      class: emptyCollection("class", CLASS_DUNGEON_COUNT, fields, "missing"),
      tower: createScalar(null, fields, "tower", "missing"),
      twister: createScalar(null, fields, "twister", "missing"),
      raid: createScalar(null, fields, "raid", "missing"),
      youtube: createScalar(null, fields, "youtube", "missing"),
      sandstorm: createScalar(null, fields, "sandstorm", "missing"),
      portals: {
        player: createScalar(null, fields, "portals.player", "missing"),
        guild: createScalar(null, fields, "portals.guild", "missing"),
      },
      totals: {
        normal: null,
        shadow: null,
        class: null,
        normalUnlocked: null,
        shadowUnlocked: null,
        classUnlocked: null,
      },
      metadata: { layout, fields },
    };
  }

  const source = dungeons.source === "legacy" ? "legacy" : dungeons.source === "modern" ? "modern" : null;
  const light = asArray(dungeons.light);
  const rawShadow = asArray(dungeons.shadow);
  const directNormal = asArray(dungeons.normal ?? dungeons.Normal);
  const directShadow = source === "modern" ? asArray(dungeons.shadow) : asArray(dungeons.shadow ?? dungeons.Shadow);
  const classArray = asArray(dungeons.class ?? dungeons.Class);
  const isModern = source === "modern" || Boolean(light && rawShadow);
  const isLegacy = source === "legacy" || Boolean(!isModern && (directNormal || asArray(dungeons.Normal) || asArray(dungeons.Shadow)));

  const normal = isModern
    ? light
      ? readModernCollection("normal", light, fields)
      : readDirectCollection("normal", directNormal, DUNGEON_ARR_TO_DID.length, fields)
    : isLegacy
      ? source
        ? readDirectCollection("normal", directNormal, DUNGEON_ARR_TO_DID.length, fields)
        : convertLegacyCollection("normal", asArray(dungeons.Normal ?? dungeons.normal), fields)
      : emptyCollection("normal", DUNGEON_ARR_TO_DID.length, fields, "invalid");

  const shadow = isModern
    ? rawShadow && light
      ? readModernCollection("shadow", rawShadow, fields)
      : readDirectCollection("shadow", directShadow, DUNGEON_ARR_TO_DID.length, fields)
    : isLegacy
      ? source
        ? readDirectCollection("shadow", directShadow, DUNGEON_ARR_TO_DID.length, fields)
        : convertLegacyCollection("shadow", asArray(dungeons.Shadow ?? dungeons.shadow), fields)
      : emptyCollection("shadow", DUNGEON_ARR_TO_DID.length, fields, "invalid");

  const classDungeons =
    isModern && classArray
      ? readDirectCollection("class", classArray, CLASS_DUNGEON_COUNT, fields)
      : emptyCollection("class", CLASS_DUNGEON_COUNT, fields, isModern ? "missing" : "unsupported");

  const scalarStatus = isModern || isLegacy ? "available" : "invalid";
  const scalarProvenance: NormalizedPlayerFieldProvenance = isModern && source !== "modern" ? "raw" : "derived";
  const createAvailableScalar = (value: number | null, key: DungeonSpecialKey | `portals.${PortalKey}`) =>
    createScalar(value, fields, key, value == null ? "missing" : scalarStatus, value == null ? undefined : scalarProvenance);
  const playerPortal =
    readScalarProperty(dungeons, "player", "Player") ??
    (light ? toFiniteNumberOrNull(light[17]) : null) ??
    (layout === "currentCompact" ? readSfSaveNumber(saveArray, 28) : null);
  const guildPortal =
    readScalarProperty(dungeons, "group", "Group") ??
    (layout === "currentCompact" ? readSfSaveNumber(saveArray, 26) : null);
  const tower =
    readScalarProperty(dungeons, "tower", "Tower") ??
    (light ? toFiniteNumberOrNull(light[14]) : null) ??
    (layout === "currentCompact" ? readUpperShort(saveArray, 21) : null);
  const twister = readScalarProperty(dungeons, "twister", "Twister") ?? (rawShadow ? toFiniteNumberOrNull(rawShadow[14]) : null);
  const raid = readScalarProperty(dungeons, "raid", "Raid");
  const youtube = readScalarProperty(dungeons, "youtube", "Youtube") ?? (rawShadow ? toFiniteNumberOrNull(rawShadow[17]) : null);
  const sandstorm = readScalarProperty(dungeons, "sandstorm", "Sandstorm") ?? (light ? toFiniteNumberOrNull(light[31]) : null);

  const legacyUnsupportedSpecial = !isModern && isLegacy;
  const normalizedTower = createAvailableScalar(tower, "tower");
  const normalizedTwister = createAvailableScalar(twister, "twister");
  const normalizedRaid = createAvailableScalar(raid, "raid");
  const normalizedYoutube = createAvailableScalar(youtube, "youtube");
  const normalizedSandstorm = legacyUnsupportedSpecial
    ? createScalar(null, fields, "sandstorm", "unsupported")
    : createAvailableScalar(sandstorm, "sandstorm");
  const normalizedPlayerPortal = createAvailableScalar(playerPortal, "portals.player");
  const normalizedGuildPortal = createAvailableScalar(guildPortal, "portals.guild");

  mark(fields, "totals.normal", normal.totalProgress == null ? "missing" : "available", normal.totalProgress == null ? undefined : "derived");
  mark(fields, "totals.shadow", shadow.totalProgress == null ? "missing" : "available", shadow.totalProgress == null ? undefined : "derived");
  mark(fields, "totals.class", isModern ? (classDungeons.totalProgress == null ? "missing" : "available") : "unsupported", isModern && classDungeons.totalProgress != null ? "derived" : undefined);
  mark(fields, "totals.normalUnlocked", normal.unlockedCount == null ? "missing" : "available", normal.unlockedCount == null ? undefined : "derived");
  mark(fields, "totals.shadowUnlocked", shadow.unlockedCount == null ? "missing" : "available", shadow.unlockedCount == null ? undefined : "derived");
  mark(fields, "totals.classUnlocked", isModern ? (classDungeons.unlockedCount == null ? "missing" : "available") : "unsupported", isModern && classDungeons.unlockedCount != null ? "derived" : undefined);

  return {
    normal,
    shadow,
    class: classDungeons,
    tower: normalizedTower,
    twister: normalizedTwister,
    raid: normalizedRaid,
    youtube: normalizedYoutube,
    sandstorm: normalizedSandstorm,
    portals: {
      player: normalizedPlayerPortal,
      guild: normalizedGuildPortal,
    },
    totals: {
      normal: normal.totalProgress,
      shadow: shadow.totalProgress,
      class: classDungeons.totalProgress,
      normalUnlocked: normal.unlockedCount,
      shadowUnlocked: shadow.unlockedCount,
      classUnlocked: classDungeons.unlockedCount,
    },
    metadata: { layout, fields },
  };
};
