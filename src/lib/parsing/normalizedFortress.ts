import { detectSfPlayerSaveLayout, readSfPlayerSaveArray, readSfSaveNumber, type SfPlayerSaveLayout } from "./playerSaveLayout";
import type { NormalizedPlayerFieldMetadata, NormalizedPlayerFieldProvenance, NormalizedPlayerFieldStatus } from "./normalizedPlayer";

export type NormalizedFortressBuildingKey =
  | "fortress"
  | "quarters"
  | "woodcutter"
  | "quarry"
  | "gemMine"
  | "academy"
  | "archeryGuild"
  | "barracks"
  | "mageTower"
  | "treasury"
  | "smithy"
  | "fortifications";

export type NormalizedFortressBuildingType = NormalizedFortressBuildingKey | "unknown";

export type NormalizedFortress = {
  source: "fortress" | "save" | null;
  upgrades: number | null;
  rank: number | null;
  honor: number | null;
  raidHonor: number | null;
  gladiator: number | null;
  knights: number | null;
  buildings: Record<NormalizedFortressBuildingKey, number | null>;
  currentBuilding: {
    active: boolean | null;
    type: number | null;
    building: NormalizedFortressBuildingType | null;
    startsAt: number | null;
    finishesAt: number | null;
  };
  metadata: {
    layout: SfPlayerSaveLayout;
    fields: Record<string, NormalizedPlayerFieldMetadata>;
  };
};

const BUILDINGS: Array<{ key: NormalizedFortressBuildingKey; modernIndex: number; legacyOwnIndex: number; legacyOtherIndex: number }> = [
  { key: "fortress", modernIndex: 0, legacyOwnIndex: 524, legacyOtherIndex: 208 },
  { key: "quarters", modernIndex: 1, legacyOwnIndex: 525, legacyOtherIndex: 209 },
  { key: "woodcutter", modernIndex: 2, legacyOwnIndex: 526, legacyOtherIndex: 210 },
  { key: "quarry", modernIndex: 3, legacyOwnIndex: 527, legacyOtherIndex: 211 },
  { key: "gemMine", modernIndex: 4, legacyOwnIndex: 528, legacyOtherIndex: 212 },
  { key: "academy", modernIndex: 5, legacyOwnIndex: 529, legacyOtherIndex: 213 },
  { key: "archeryGuild", modernIndex: 6, legacyOwnIndex: 530, legacyOtherIndex: 214 },
  { key: "barracks", modernIndex: 7, legacyOwnIndex: 531, legacyOtherIndex: 215 },
  { key: "mageTower", modernIndex: 8, legacyOwnIndex: 532, legacyOtherIndex: 216 },
  { key: "treasury", modernIndex: 9, legacyOwnIndex: 533, legacyOtherIndex: 217 },
  { key: "smithy", modernIndex: 10, legacyOwnIndex: 534, legacyOtherIndex: 218 },
  { key: "fortifications", modernIndex: 11, legacyOwnIndex: 535, legacyOtherIndex: 219 },
];

const BUILDING_BY_TYPE = BUILDINGS.reduce<Partial<Record<number, NormalizedFortressBuildingKey>>>((memo, building, index) => {
  memo[index] = building.key;
  return memo;
}, {});

const emptyBuildings = (): Record<NormalizedFortressBuildingKey, number | null> => ({
  fortress: null,
  quarters: null,
  woodcutter: null,
  quarry: null,
  gemMine: null,
  academy: null,
  archeryGuild: null,
  barracks: null,
  mageTower: null,
  treasury: null,
  smithy: null,
  fortifications: null,
});

const mark = (
  fields: Record<string, NormalizedPlayerFieldMetadata>,
  path: string,
  status: NormalizedPlayerFieldStatus,
  provenance?: NormalizedPlayerFieldProvenance,
) => {
  fields[path] = provenance ? { status, provenance } : { status };
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

const readArrayField = (row: Record<string, unknown>, key: string): unknown[] | null =>
  Array.isArray(row[key]) ? (row[key] as unknown[]) : null;

const hasIndex = (values: unknown[] | null, index: number): boolean =>
  Boolean(values && index >= 0 && index < values.length && Object.prototype.hasOwnProperty.call(values, index));

const readArrayNumber = (
  values: unknown[] | null,
  index: number,
  path: string,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  if (!hasIndex(values, index)) {
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

const markUnsupported = (fields: Record<string, NormalizedPlayerFieldMetadata>) => {
  mark(fields, "fortress.source", "unsupported");
  mark(fields, "fortress.upgrades", "unsupported");
  mark(fields, "fortress.rank", "unsupported");
  mark(fields, "fortress.honor", "unsupported");
  mark(fields, "fortress.raidHonor", "unsupported");
  mark(fields, "fortress.gladiator", "unsupported");
  mark(fields, "fortress.knights", "unsupported");
  BUILDINGS.forEach(({ key }) => mark(fields, `fortress.buildings.${key}`, "unsupported"));
  mark(fields, "fortress.currentBuilding.active", "unsupported");
  mark(fields, "fortress.currentBuilding.type", "unsupported");
  mark(fields, "fortress.currentBuilding.building", "unsupported");
  mark(fields, "fortress.currentBuilding.startsAt", "unsupported");
  mark(fields, "fortress.currentBuilding.finishesAt", "unsupported");
};

const createEmptyFortress = (
  layout: SfPlayerSaveLayout,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): NormalizedFortress => ({
  source: null,
  upgrades: null,
  rank: null,
  honor: null,
  raidHonor: null,
  gladiator: null,
  knights: null,
  buildings: emptyBuildings(),
  currentBuilding: {
    active: null,
    type: null,
    building: null,
    startsAt: null,
    finishesAt: null,
  },
  metadata: { layout, fields },
});

const readRankFromRow = (
  row: Record<string, unknown>,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  if (!Object.prototype.hasOwnProperty.call(row, "fortressrank")) {
    mark(fields, "fortress.rank", "missing");
    return null;
  }

  const rank = toFiniteNumberOrNull(row.fortressrank);
  if (rank == null) {
    mark(fields, "fortress.rank", "invalid");
    return null;
  }

  mark(fields, "fortress.rank", "available", "raw");
  return rank;
};

const normalizeUpgrade = (
  rawBuilding: number | null,
  rawFinishSeconds: number | null,
  rawStartSeconds: number | null,
  offset: number,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): NormalizedFortress["currentBuilding"] => {
  const derivedStatus = (sourcePath: string): NormalizedPlayerFieldStatus =>
    fields[sourcePath]?.status === "invalid" ? "invalid" : "missing";

  if (rawBuilding == null) {
    const status = derivedStatus("fortress.currentBuilding.rawType");
    mark(fields, "fortress.currentBuilding.active", status);
    mark(fields, "fortress.currentBuilding.type", status);
    mark(fields, "fortress.currentBuilding.building", status);
    mark(fields, "fortress.currentBuilding.startsAt", status);
    mark(fields, "fortress.currentBuilding.finishesAt", status);
    return { active: null, type: null, building: null, startsAt: null, finishesAt: null };
  }

  const type = rawBuilding - 1;
  if (type < 0) {
    mark(fields, "fortress.currentBuilding.active", "available", "derived");
    mark(fields, "fortress.currentBuilding.type", "available", "derived");
    mark(fields, "fortress.currentBuilding.building", "available", "derived");
    mark(fields, "fortress.currentBuilding.startsAt", "available", "derived");
    mark(fields, "fortress.currentBuilding.finishesAt", "available", "derived");
    return { active: false, type: null, building: null, startsAt: null, finishesAt: null };
  }

  const building = BUILDING_BY_TYPE[type] ?? "unknown";
  mark(fields, "fortress.currentBuilding.active", "available", "derived");
  mark(fields, "fortress.currentBuilding.type", "available", "derived");
  mark(fields, "fortress.currentBuilding.building", building === "unknown" ? "invalid" : "available", "derived");
  mark(
    fields,
    "fortress.currentBuilding.startsAt",
    rawStartSeconds == null ? derivedStatus("fortress.currentBuilding.startRaw") : "available",
    rawStartSeconds == null ? undefined : "derived",
  );
  mark(
    fields,
    "fortress.currentBuilding.finishesAt",
    rawFinishSeconds == null ? derivedStatus("fortress.currentBuilding.finishRaw") : "available",
    rawFinishSeconds == null ? undefined : "derived",
  );

  return {
    active: true,
    type,
    building,
    startsAt: rawStartSeconds == null ? null : rawStartSeconds * 1000 + offset,
    finishesAt: rawFinishSeconds == null ? null : rawFinishSeconds * 1000 + offset,
  };
};

const calculateRaidHonor = (
  honor: number | null,
  buildings: Record<NormalizedFortressBuildingKey, number | null>,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  if (honor == null) {
    mark(fields, "fortress.raidHonor", "missing");
    return null;
  }

  const levels = Object.values(buildings);
  if (levels.some((level) => level == null)) {
    mark(fields, "fortress.raidHonor", "missing");
    return null;
  }

  const raidHonor = honor - 10 * (levels as number[]).reduce((total, level) => total + level, 0);
  mark(fields, "fortress.raidHonor", "available", "calculated");
  return raidHonor;
};

export const normalizeSfPlayerFortress = (
  player: unknown,
  options: {
    layout?: SfPlayerSaveLayout;
    saveArray?: unknown[] | null;
  } = {},
): NormalizedFortress => {
  const row = player && typeof player === "object" ? (player as Record<string, unknown>) : {};
  const saveArray = options.saveArray ?? readSfPlayerSaveArray(row);
  const layout = options.layout ?? detectSfPlayerSaveLayout(row, saveArray);
  const fields: Record<string, NormalizedPlayerFieldMetadata> = {};
  const fortress = createEmptyFortress(layout, fields);
  const offset = toFiniteNumberOrNull(row.offset) ?? 0;

  if (layout === "unknown") {
    markUnsupported(fields);
    return fortress;
  }

  if (layout === "currentCompact") {
    const fortressArray = readArrayField(row, "fortress");
    mark(fields, "fortress.source", fortressArray ? "available" : "missing", fortressArray ? "raw" : undefined);
    fortress.source = fortressArray ? "fortress" : null;

    BUILDINGS.forEach(({ key, modernIndex }) => {
      fortress.buildings[key] = readArrayNumber(fortressArray, modernIndex, `fortress.buildings.${key}`, fields);
    });

    fortress.rank = readRankFromRow(row, fields);

    if (row.own === 1 || row.own === true) {
      const rawBuilding = readArrayNumber(fortressArray, 12, "fortress.currentBuilding.rawType", fields);
      const rawFinish = readArrayNumber(fortressArray, 13, "fortress.currentBuilding.finishRaw", fields);
      const rawStart = readArrayNumber(fortressArray, 14, "fortress.currentBuilding.startRaw", fields);
      fortress.currentBuilding = normalizeUpgrade(rawBuilding, rawFinish, rawStart, offset, fields);
      fortress.upgrades = readArrayNumber(fortressArray, 15, "fortress.upgrades", fields);
      fortress.honor = readArrayNumber(fortressArray, 16, "fortress.honor", fields);
      fortress.rank = readArrayNumber(fortressArray, 17, "fortress.rank", fields);
      fortress.knights = readArrayNumber(fortressArray, 25, "fortress.knights", fields);
    } else {
      mark(fields, "fortress.upgrades", "unsupported");
      mark(fields, "fortress.honor", "unsupported");
      mark(fields, "fortress.knights", "unsupported");
      mark(fields, "fortress.currentBuilding.active", "unsupported");
      mark(fields, "fortress.currentBuilding.type", "unsupported");
      mark(fields, "fortress.currentBuilding.building", "unsupported");
      mark(fields, "fortress.currentBuilding.startsAt", "unsupported");
      mark(fields, "fortress.currentBuilding.finishesAt", "unsupported");
    }

    mark(fields, "fortress.gladiator", "unsupported");
    fortress.raidHonor = calculateRaidHonor(fortress.honor, fortress.buildings, fields);
    return fortress;
  }

  const legacyKey = layout === "legacyOwn" ? "legacyOwnIndex" : "legacyOtherIndex";
  mark(fields, "fortress.source", saveArray ? "available" : "missing", saveArray ? "raw" : undefined);
  fortress.source = saveArray ? "save" : null;

  BUILDINGS.forEach((building) => {
    const { key } = building;
    const index = building[legacyKey];
    fortress.buildings[key] = readSaveNumber(saveArray, index, `fortress.buildings.${key}`, fields);
  });

  fortress.rank = readRankFromRow(row, fields);

  const upgradeIndexes =
    layout === "legacyOwn"
      ? { building: 571, finish: 572, start: 573, upgrades: 581, honor: 582, rank: 583 }
      : { building: 244, finish: 245, start: 246, upgrades: 247, honor: 248, rank: null };
  const rawBuilding = readSaveNumber(saveArray, upgradeIndexes.building, "fortress.currentBuilding.rawType", fields);
  const rawFinish = readSaveNumber(saveArray, upgradeIndexes.finish, "fortress.currentBuilding.finishRaw", fields);
  const rawStart = readSaveNumber(saveArray, upgradeIndexes.start, "fortress.currentBuilding.startRaw", fields);
  fortress.currentBuilding = normalizeUpgrade(rawBuilding, rawFinish, rawStart, offset, fields);
  fortress.upgrades = readSaveNumber(saveArray, upgradeIndexes.upgrades, "fortress.upgrades", fields);
  fortress.honor = readSaveNumber(saveArray, upgradeIndexes.honor, "fortress.honor", fields);
  if (upgradeIndexes.rank != null) {
    fortress.rank = readSaveNumber(saveArray, upgradeIndexes.rank, "fortress.rank", fields);
  }
  if (layout === "legacyOwn") {
    fortress.knights = readSaveNumber(saveArray, 598, "fortress.knights", fields);
    fortress.gladiator = readArrayNumber(readArrayField(row, "tower"), 454, "fortress.gladiator", fields);
  } else {
    mark(fields, "fortress.knights", "unsupported");
    fortress.gladiator = readSaveNumber(saveArray, 260, "fortress.gladiator", fields);
  }
  fortress.raidHonor = calculateRaidHonor(fortress.honor, fortress.buildings, fields);

  return fortress;
};
