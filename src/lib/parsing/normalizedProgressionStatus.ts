import {
  detectSfPlayerSaveLayout,
  readSfPlayerSaveArray,
  readSfSaveByte,
  readSfSaveLowerShort,
  readSfSaveNumber,
  type SfPlayerSaveLayout,
} from "./playerSaveLayout";
import type { NormalizedPlayerFieldMetadata, NormalizedPlayerFieldProvenance, NormalizedPlayerFieldStatus } from "./normalizedPlayer";

export type NormalizedScrapbookSummary = {
  count: number | null;
  maximum: number;
  percentage: number | null;
};

export type NormalizedAchievementSummary = {
  count: number | null;
  maximum: number;
};

export type NormalizedMountStatus = {
  type: number | null;
  active: boolean | null;
  bonus: number | null;
  expiresAt: number | null;
};

export type NormalizedPortalBonuses = {
  health: number | null;
  damage: number | null;
};

export type NormalizedGuildMemberBonuses = {
  treasure: number | null;
  instructor: number | null;
  pet: number | null;
};

export type NormalizedPlayerProgressionStatus = {
  scrapbook: NormalizedScrapbookSummary;
  achievements: NormalizedAchievementSummary;
  mount: NormalizedMountStatus;
  portalBonuses: NormalizedPortalBonuses;
  guildBonuses: NormalizedGuildMemberBonuses;
  metadata: {
    layout: SfPlayerSaveLayout;
    fields: Record<string, NormalizedPlayerFieldMetadata>;
  };
};

const SCRAPBOOK_MAXIMUM = 2484;
const ACHIEVEMENT_MAXIMUM = 141;
const MOUNT_BONUSES: Record<number, number> = {
  0: 0,
  1: 10,
  2: 20,
  3: 30,
  4: 50,
  5: 50,
};

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

const hasIndex = (values: unknown[] | null, index: number): boolean =>
  Boolean(values && index >= 0 && index < values.length && Object.prototype.hasOwnProperty.call(values, index));

const mark = (
  fields: Record<string, NormalizedPlayerFieldMetadata>,
  path: string,
  status: NormalizedPlayerFieldStatus,
  provenance?: NormalizedPlayerFieldProvenance,
) => {
  fields[path] = provenance ? { status, provenance } : { status };
};

const readSaveNumber = (
  saveArray: unknown[] | null,
  index: number,
  path: string,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  if (!hasIndex(saveArray, index)) {
    mark(fields, path, "missing");
    return null;
  }

  const value = readSfSaveNumber(saveArray, index);
  if (value == null) {
    mark(fields, path, "invalid");
    return null;
  }

  mark(fields, path, "available", "raw");
  return value;
};

const readLowerShort = (
  saveArray: unknown[] | null,
  index: number,
  path: string,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  if (!hasIndex(saveArray, index)) {
    mark(fields, path, "missing");
    return null;
  }

  const value = readSfSaveLowerShort(saveArray, index);
  if (value == null) {
    mark(fields, path, "invalid");
    return null;
  }

  mark(fields, path, "available", "raw");
  return value;
};

const readByte = (
  saveArray: unknown[] | null,
  index: number,
  byteOffset: number,
  path: string,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  if (!hasIndex(saveArray, index)) {
    mark(fields, path, "missing");
    return null;
  }

  const value = readSfSaveByte(saveArray, index, byteOffset);
  if (value == null) {
    mark(fields, path, "invalid");
    return null;
  }

  mark(fields, path, "available", "raw");
  return value;
};

const readArrayField = (row: Record<string, unknown>, key: string): unknown[] | null =>
  Array.isArray(row[key]) ? (row[key] as unknown[]) : null;

const readDungeonPlayerBonus = (
  row: Record<string, unknown>,
  saveArray: unknown[] | null,
  layout: Exclude<SfPlayerSaveLayout, "unknown">,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  const dungeons = row.dungeons;
  if (dungeons && typeof dungeons === "object" && !Array.isArray(dungeons)) {
    const record = dungeons as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, "player")) {
      const value = toFiniteNumberOrNull(record.player);
      mark(fields, "portalBonuses.health", value == null ? "invalid" : "available", value == null ? undefined : "derived");
      return value;
    }

    const light = Array.isArray(record.light) ? record.light : null;
    if (hasIndex(light, 17)) {
      const value = toFiniteNumberOrNull(light?.[17]);
      mark(fields, "portalBonuses.health", value == null ? "invalid" : "available", value == null ? undefined : "raw");
      return value;
    }
  }

  if (layout === "currentCompact") return readSaveNumber(saveArray, 28, "portalBonuses.health", fields);
  if (layout === "legacyOwn") return readByte(saveArray, 445, 3, "portalBonuses.health", fields);
  return readByte(saveArray, 252, 3, "portalBonuses.health", fields);
};

const readDungeonGroupBonus = (
  saveArray: unknown[] | null,
  layout: Exclude<SfPlayerSaveLayout, "unknown">,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  if (layout === "currentCompact") return readSaveNumber(saveArray, 26, "portalBonuses.damage", fields);
  if (layout === "legacyOwn") return readByte(saveArray, 445, 2, "portalBonuses.damage", fields);
  return readByte(saveArray, 252, 2, "portalBonuses.damage", fields);
};

const calculateScrapbook = (
  rawValue: number | null,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): NormalizedScrapbookSummary => {
  mark(fields, "scrapbook.maximum", "available", "calculated");

  if (rawValue == null) {
    mark(fields, "scrapbook.count", "missing");
    mark(fields, "scrapbook.percentage", "missing");
    return { count: null, maximum: SCRAPBOOK_MAXIMUM, percentage: null };
  }

  const count = Math.max(0, rawValue - 10000);
  mark(fields, "scrapbook.count", "available", "derived");
  mark(fields, "scrapbook.percentage", "available", "calculated");
  return {
    count,
    maximum: SCRAPBOOK_MAXIMUM,
    percentage: count / SCRAPBOOK_MAXIMUM,
  };
};

const calculateAchievements = (
  row: Record<string, unknown>,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): NormalizedAchievementSummary => {
  mark(fields, "achievements.maximum", "available", "calculated");

  const achievements = readArrayField(row, "achievements");
  if (!achievements) {
    mark(fields, "achievements.count", "missing");
    return { count: null, maximum: ACHIEVEMENT_MAXIMUM };
  }

  const half = Math.trunc(achievements.length / 2);
  let count = 0;
  for (let index = 0; index < ACHIEVEMENT_MAXIMUM && index < half; index += 1) {
    if (toFiniteNumberOrNull(achievements[index]) === 1) count += 1;
  }

  mark(fields, "achievements.count", "available", "calculated");
  return { count, maximum: ACHIEVEMENT_MAXIMUM };
};

const calculateMount = (
  rawType: number | null,
  rawExpireSeconds: number | null,
  expiresSupported: boolean,
  offset: number,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): NormalizedMountStatus => {
  if (rawType == null) {
    mark(fields, "mount.active", "missing");
    mark(fields, "mount.bonus", "missing");
    if (!expiresSupported) mark(fields, "mount.expiresAt", "unsupported");
    return { type: null, active: null, bonus: null, expiresAt: null };
  }

  const bonus = MOUNT_BONUSES[rawType];
  const validType = bonus != null;
  mark(fields, "mount.active", "available", "derived");
  mark(fields, "mount.bonus", validType ? "available" : "invalid", validType ? "derived" : undefined);
  if (!expiresSupported) {
    mark(fields, "mount.expiresAt", "unsupported");
  } else if (rawExpireSeconds == null) {
    mark(fields, "mount.expiresAt", "missing");
  } else {
    mark(fields, "mount.expiresAt", "available", "derived");
  }

  return {
    type: rawType,
    active: rawType > 0,
    bonus: validType ? bonus : null,
    expiresAt: expiresSupported && rawExpireSeconds != null ? rawExpireSeconds * 1000 + offset : null,
  };
};

const markUnsupported = (fields: Record<string, NormalizedPlayerFieldMetadata>) => {
  mark(fields, "scrapbook.count", "unsupported");
  mark(fields, "scrapbook.maximum", "available", "calculated");
  mark(fields, "scrapbook.percentage", "unsupported");
  mark(fields, "achievements.count", "unsupported");
  mark(fields, "achievements.maximum", "available", "calculated");
  mark(fields, "mount.type", "unsupported");
  mark(fields, "mount.active", "unsupported");
  mark(fields, "mount.bonus", "unsupported");
  mark(fields, "mount.expiresAt", "unsupported");
  mark(fields, "portalBonuses.health", "unsupported");
  mark(fields, "portalBonuses.damage", "unsupported");
  mark(fields, "guildBonuses.treasure", "unsupported");
  mark(fields, "guildBonuses.instructor", "unsupported");
  mark(fields, "guildBonuses.pet", "unsupported");
};

export const normalizeSfPlayerProgressionStatus = (
  player: unknown,
  options: {
    layout?: SfPlayerSaveLayout;
    saveArray?: unknown[] | null;
  } = {},
): NormalizedPlayerProgressionStatus => {
  const row = player && typeof player === "object" ? (player as Record<string, unknown>) : {};
  const saveArray = options.saveArray ?? readSfPlayerSaveArray(row);
  const layout = options.layout ?? detectSfPlayerSaveLayout(row, saveArray);
  const fields: Record<string, NormalizedPlayerFieldMetadata> = {};
  const offset = toFiniteNumberOrNull(row.offset) ?? 0;

  if (layout === "unknown") {
    markUnsupported(fields);
    return {
      scrapbook: { count: null, maximum: SCRAPBOOK_MAXIMUM, percentage: null },
      achievements: { count: null, maximum: ACHIEVEMENT_MAXIMUM },
      mount: { type: null, active: null, bonus: null, expiresAt: null },
      portalBonuses: { health: null, damage: null },
      guildBonuses: { treasure: null, instructor: null, pet: null },
      metadata: { layout, fields },
    };
  }

  const indexes =
    layout === "currentCompact"
      ? { mount: 21, mountExpire: 29, scrapbook: 66, treasure: null, instructor: null, pet: null }
      : layout === "legacyOwn"
        ? { mount: 286, mountExpire: 451, scrapbook: 438, treasure: 623, instructor: 624, pet: 629 }
        : { mount: 159, mountExpire: null, scrapbook: 163, treasure: null, instructor: null, pet: null };

  const rawMount = readLowerShort(saveArray, indexes.mount, "mount.type", fields);
  const rawMountExpire =
    indexes.mountExpire == null ? null : readSaveNumber(saveArray, indexes.mountExpire, "mount.expiresRaw", fields);
  const rawScrapbook = readSaveNumber(saveArray, indexes.scrapbook, "scrapbook.raw", fields);
  const healthBonus = readDungeonPlayerBonus(row, saveArray, layout, fields);
  const damageBonus = readDungeonGroupBonus(saveArray, layout, fields);
  const treasure =
    indexes.treasure == null ? null : readSaveNumber(saveArray, indexes.treasure, "guildBonuses.treasure", fields);
  const instructor =
    indexes.instructor == null ? null : readSaveNumber(saveArray, indexes.instructor, "guildBonuses.instructor", fields);
  const pet = indexes.pet == null ? null : readSaveNumber(saveArray, indexes.pet, "guildBonuses.pet", fields);

  if (indexes.treasure == null) mark(fields, "guildBonuses.treasure", "unsupported");
  if (indexes.instructor == null) mark(fields, "guildBonuses.instructor", "unsupported");
  if (indexes.pet == null) mark(fields, "guildBonuses.pet", "unsupported");

  return {
    scrapbook: calculateScrapbook(rawScrapbook, fields),
    achievements: calculateAchievements(row, fields),
    mount: calculateMount(rawMount, rawMountExpire, indexes.mountExpire != null, offset, fields),
    portalBonuses: {
      health: healthBonus,
      damage: damageBonus,
    },
    guildBonuses: {
      treasure,
      instructor,
      pet,
    },
    metadata: { layout, fields },
  };
};
