import { detectSfPlayerSaveLayout, type SfPlayerSaveLayout } from "./playerSaveLayout";
import type { NormalizedPlayerFieldMetadata, NormalizedPlayerFieldProvenance, NormalizedPlayerFieldStatus } from "./normalizedPlayer";

export type NormalizedUnderworldBuildingKey =
  | "heart"
  | "gate"
  | "goldPit"
  | "extractor"
  | "goblinPit"
  | "torture"
  | "trollBlock"
  | "timeMachine"
  | "keeper";

export type NormalizedUnderworldUpgradeType = NormalizedUnderworldBuildingKey | "gladiator" | "unknown";

export type NormalizedUnderworld = {
  buildings: Record<NormalizedUnderworldBuildingKey, number | null>;
  units: {
    goblinUpgrades: number | null;
    trollUpgrades: number | null;
    keeperUpgrades: number | null;
  };
  resources: {
    souls: number | null;
    extractorSouls: number | null;
    extractorMax: number | null;
    maxSouls: number | null;
    extractorHourly: number | null;
    goldPitGold: number | null;
    goldPitMax: number | null;
    goldPitHourly: number | null;
    timeMachineMushrooms: number | null;
    timeMachineThirst: number | null;
    timeMachineMax: number | null;
    timeMachineDaily: number | null;
    timeMachineDailyUsed: number | null;
  };
  currentUpgrade: {
    active: boolean | null;
    type: number | null;
    building: NormalizedUnderworldUpgradeType | null;
    startsAt: number | null;
    finishesAt: number | null;
  };
  metadata: {
    layout: SfPlayerSaveLayout;
    fields: Record<string, NormalizedPlayerFieldMetadata>;
  };
};

const BUILDINGS: NormalizedUnderworldBuildingKey[] = [
  "heart",
  "gate",
  "goldPit",
  "extractor",
  "goblinPit",
  "torture",
  "trollBlock",
  "timeMachine",
  "keeper",
];

const UPGRADE_BY_TYPE: Record<number, NormalizedUnderworldUpgradeType> = {
  0: "heart",
  1: "gate",
  2: "goldPit",
  3: "extractor",
  4: "goblinPit",
  5: "torture",
  6: "gladiator",
  7: "trollBlock",
  8: "timeMachine",
  9: "keeper",
};

const TOWER_FIELD_INDEX: Record<string, number> = {
  "underworld.buildings.heart": 448,
  "underworld.buildings.gate": 449,
  "underworld.buildings.goldPit": 450,
  "underworld.buildings.extractor": 451,
  "underworld.buildings.goblinPit": 452,
  "underworld.buildings.torture": 453,
  "underworld.buildings.trollBlock": 455,
  "underworld.buildings.timeMachine": 456,
  "underworld.buildings.keeper": 457,
  "underworld.resources.souls": 458,
  "underworld.resources.extractorSouls": 459,
  "underworld.resources.extractorMax": 460,
  "underworld.resources.maxSouls": 461,
  "underworld.resources.extractorHourly": 463,
  "underworld.resources.goldPitGoldRaw": 464,
  "underworld.resources.goldPitMaxRaw": 465,
  "underworld.resources.goldPitHourlyRaw": 466,
  "underworld.currentUpgrade.rawBuilding": 468,
  "underworld.currentUpgrade.finishRaw": 469,
  "underworld.currentUpgrade.startRaw": 470,
  "underworld.resources.timeMachineThirst": 473,
  "underworld.resources.timeMachineMax": 474,
  "underworld.resources.timeMachineDaily": 475,
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

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

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

const emptyBuildings = (): Record<NormalizedUnderworldBuildingKey, number | null> => ({
  heart: null,
  gate: null,
  goldPit: null,
  extractor: null,
  goblinPit: null,
  torture: null,
  trollBlock: null,
  timeMachine: null,
  keeper: null,
});

const createEmptyUnderworld = (
  layout: SfPlayerSaveLayout,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): NormalizedUnderworld => ({
  buildings: emptyBuildings(),
  units: {
    goblinUpgrades: null,
    trollUpgrades: null,
    keeperUpgrades: null,
  },
  resources: {
    souls: null,
    extractorSouls: null,
    extractorMax: null,
    maxSouls: null,
    extractorHourly: null,
    goldPitGold: null,
    goldPitMax: null,
    goldPitHourly: null,
    timeMachineMushrooms: null,
    timeMachineThirst: null,
    timeMachineMax: null,
    timeMachineDaily: null,
    timeMachineDailyUsed: null,
  },
  currentUpgrade: {
    active: null,
    type: null,
    building: null,
    startsAt: null,
    finishesAt: null,
  },
  metadata: { layout, fields },
});

const readObjectNumber = (
  record: Record<string, unknown>,
  key: string,
  path: string,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    mark(fields, path, "missing");
    return null;
  }

  const value = toFiniteNumberOrNull(record[key]);
  mark(fields, path, value == null ? "invalid" : "available", value == null ? undefined : "raw");
  return value;
};

const readTowerNumber = (
  tower: unknown[] | null,
  path: string,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  const index = TOWER_FIELD_INDEX[path];
  if (index == null || !hasArrayIndex(tower, index)) {
    mark(fields, path, "missing");
    return null;
  }

  const value = toFiniteNumberOrNull(tower?.[index]);
  mark(fields, path, value == null ? "invalid" : "available", value == null ? undefined : "raw");
  return value;
};

const readTowerUnitNumber = (
  tower: unknown[] | null,
  index: number,
  path: string,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  if (!hasArrayIndex(tower, index)) {
    mark(fields, path, "missing");
    return null;
  }

  const value = toFiniteNumberOrNull(tower?.[index]);
  mark(fields, path, value == null ? "invalid" : "available", value == null ? undefined : "raw");
  return value;
};

const markAll = (fields: Record<string, NormalizedPlayerFieldMetadata>, status: NormalizedPlayerFieldStatus) => {
  BUILDINGS.forEach((key) => mark(fields, `underworld.buildings.${key}`, status));
  ["goblinUpgrades", "trollUpgrades", "keeperUpgrades"].forEach((key) => mark(fields, `underworld.units.${key}`, status));
  [
    "souls",
    "extractorSouls",
    "extractorMax",
    "maxSouls",
    "extractorHourly",
    "goldPitGold",
    "goldPitMax",
    "goldPitHourly",
    "timeMachineMushrooms",
    "timeMachineThirst",
    "timeMachineMax",
    "timeMachineDaily",
    "timeMachineDailyUsed",
  ].forEach((key) => mark(fields, `underworld.resources.${key}`, status));
  ["active", "type", "building", "startsAt", "finishesAt"].forEach((key) => mark(fields, `underworld.currentUpgrade.${key}`, status));
};

const normalizeUpgrade = (
  rawBuilding: number | null,
  rawFinishSeconds: number | null,
  rawStartSeconds: number | null,
  offset: number,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): NormalizedUnderworld["currentUpgrade"] => {
  const derivedStatus = (sourcePath: string): NormalizedPlayerFieldStatus =>
    fields[sourcePath]?.status === "invalid" ? "invalid" : "missing";

  if (rawBuilding == null) {
    const status = derivedStatus("underworld.currentUpgrade.rawBuilding");
    ["active", "type", "building", "startsAt", "finishesAt"].forEach((key) => mark(fields, `underworld.currentUpgrade.${key}`, status));
    return { active: null, type: null, building: null, startsAt: null, finishesAt: null };
  }

  const type = rawBuilding - 1;
  if (type < 0) {
    mark(fields, "underworld.currentUpgrade.active", "available", "derived");
    mark(fields, "underworld.currentUpgrade.type", "available", "derived");
    mark(fields, "underworld.currentUpgrade.building", "available", "derived");
    mark(fields, "underworld.currentUpgrade.startsAt", "available", "derived");
    mark(fields, "underworld.currentUpgrade.finishesAt", "available", "derived");
    return { active: false, type: null, building: null, startsAt: null, finishesAt: null };
  }

  const building = UPGRADE_BY_TYPE[type] ?? "unknown";
  const startsAt = rawStartSeconds == null ? null : rawStartSeconds * 1000 + offset;
  const finishesAt = rawFinishSeconds == null ? null : rawFinishSeconds * 1000 + offset;
  mark(fields, "underworld.currentUpgrade.active", "available", "derived");
  mark(fields, "underworld.currentUpgrade.type", "available", "derived");
  mark(fields, "underworld.currentUpgrade.building", building === "unknown" ? "invalid" : "available", "derived");
  mark(
    fields,
    "underworld.currentUpgrade.startsAt",
    rawStartSeconds == null ? derivedStatus("underworld.currentUpgrade.startRaw") : "available",
    rawStartSeconds == null ? undefined : "derived",
  );
  mark(
    fields,
    "underworld.currentUpgrade.finishesAt",
    rawFinishSeconds == null ? derivedStatus("underworld.currentUpgrade.finishRaw") : "available",
    rawFinishSeconds == null ? undefined : "derived",
  );
  return { active: true, type, building, startsAt, finishesAt };
};

const readStatusNumber = (
  status: unknown,
  index: number,
  path: string,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  if (!Array.isArray(status) || !hasArrayIndex(status, index)) {
    mark(fields, path, "missing");
    return null;
  }

  const value = toFiniteNumberOrNull(status[index]);
  mark(fields, path, value == null ? "invalid" : "available", value == null ? undefined : "raw");
  return value;
};

export const normalizeSfPlayerUnderworld = (
  player: unknown,
  options: { layout?: SfPlayerSaveLayout } = {},
): NormalizedUnderworld => {
  const row = player && typeof player === "object" ? (player as Record<string, unknown>) : {};
  const layout = options.layout ?? detectSfPlayerSaveLayout(row);
  const fields: Record<string, NormalizedPlayerFieldMetadata> = {};
  const underworld = createEmptyUnderworld(layout, fields);
  const own = toFiniteNumberOrNull(row.own) === 1 || row.own === true;

  if (!own) {
    markAll(fields, "unsupported");
    return underworld;
  }

  const parsed = asRecord(row.underworld);
  const tower = Array.isArray(row.tower) ? (row.tower as unknown[]) : null;
  if (!parsed && !tower) {
    markAll(fields, layout === "unknown" ? "unsupported" : "missing");
    return underworld;
  }

  const read = (key: string, path: string): number | null =>
    parsed ? readObjectNumber(parsed, key, path, fields) : readTowerNumber(tower, path, fields);

  underworld.units.goblinUpgrades = parsed
    ? readObjectNumber(parsed, "goblinUpgrades", "underworld.units.goblinUpgrades", fields)
    : readTowerUnitNumber(tower, 146, "underworld.units.goblinUpgrades", fields);
  underworld.units.trollUpgrades = parsed
    ? readObjectNumber(parsed, "trollUpgrades", "underworld.units.trollUpgrades", fields)
    : readTowerUnitNumber(tower, 294, "underworld.units.trollUpgrades", fields);
  underworld.units.keeperUpgrades = parsed
    ? readObjectNumber(parsed, "keeperUpgrades", "underworld.units.keeperUpgrades", fields)
    : readTowerUnitNumber(tower, 442, "underworld.units.keeperUpgrades", fields);

  BUILDINGS.forEach((key) => {
    underworld.buildings[key] = read(key, `underworld.buildings.${key}`);
  });

  underworld.resources.souls = read("souls", "underworld.resources.souls");
  underworld.resources.extractorSouls = read("extractorSouls", "underworld.resources.extractorSouls");
  underworld.resources.extractorMax = read("extractorMax", "underworld.resources.extractorMax");
  underworld.resources.maxSouls = read("maxSouls", "underworld.resources.maxSouls");
  underworld.resources.extractorHourly = read("extractorHourly", "underworld.resources.extractorHourly");
  underworld.resources.timeMachineThirst = read("timeMachineThirst", "underworld.resources.timeMachineThirst");
  underworld.resources.timeMachineMax = read("timeMachineMax", "underworld.resources.timeMachineMax");
  underworld.resources.timeMachineDaily = read("timeMachineDaily", "underworld.resources.timeMachineDaily");

  const readGoldPit = (key: "goldPitGold" | "goldPitMax" | "goldPitHourly") => {
    if (parsed) return readObjectNumber(parsed, key, `underworld.resources.${key}`, fields);
    const raw = readTowerNumber(tower, `underworld.resources.${key}Raw`, fields);
    const value = raw == null ? null : raw / 100;
    mark(fields, `underworld.resources.${key}`, raw == null ? fields[`underworld.resources.${key}Raw`]?.status ?? "missing" : "available", raw == null ? undefined : "derived");
    return value;
  };

  underworld.resources.goldPitGold = readGoldPit("goldPitGold");
  underworld.resources.goldPitMax = readGoldPit("goldPitMax");
  underworld.resources.goldPitHourly = readGoldPit("goldPitHourly");
  underworld.resources.timeMachineMushrooms = parsed
    ? readObjectNumber(parsed, "timeMachineMushrooms", "underworld.resources.timeMachineMushrooms", fields)
    : readStatusNumber(row.status, 19, "underworld.resources.timeMachineMushrooms", fields);
  underworld.resources.timeMachineDailyUsed =
    underworld.resources.timeMachineDaily == null ? null : Math.trunc(underworld.resources.timeMachineDaily * 0.25);
  mark(
    fields,
    "underworld.resources.timeMachineDailyUsed",
    underworld.resources.timeMachineDaily == null ? fields["underworld.resources.timeMachineDaily"]?.status ?? "missing" : "available",
    underworld.resources.timeMachineDaily == null ? undefined : "calculated",
  );

  const rawBuilding = parsed
    ? readObjectNumber(asRecord(parsed.upgrade) ?? {}, "building", "underworld.currentUpgrade.rawBuilding", fields)
    : readTowerNumber(tower, "underworld.currentUpgrade.rawBuilding", fields);
  const rawFinish = parsed
    ? readObjectNumber(asRecord(parsed.upgrade) ?? {}, "finish", "underworld.currentUpgrade.finishRaw", fields)
    : readTowerNumber(tower, "underworld.currentUpgrade.finishRaw", fields);
  const rawStart = parsed
    ? readObjectNumber(asRecord(parsed.upgrade) ?? {}, "start", "underworld.currentUpgrade.startRaw", fields)
    : readTowerNumber(tower, "underworld.currentUpgrade.startRaw", fields);
  const offset = toFiniteNumberOrNull(row.offset) ?? 0;
  underworld.currentUpgrade = parsed
    ? normalizeUpgrade(rawBuilding == null ? null : rawBuilding + 1, rawFinish == null ? null : (rawFinish - offset) / 1000, rawStart == null ? null : (rawStart - offset) / 1000, offset, fields)
    : normalizeUpgrade(rawBuilding, rawFinish, rawStart, offset, fields);

  return underworld;
};
