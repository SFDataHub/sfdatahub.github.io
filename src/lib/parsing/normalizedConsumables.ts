import { detectSfPlayerSaveLayout, readSfPlayerSaveArray, type SfPlayerSaveLayout } from "./playerSaveLayout";
import type { NormalizedPlayerFieldMetadata, NormalizedPlayerFieldProvenance, NormalizedPlayerFieldStatus } from "./normalizedPlayer";

type AttributeName = "strength" | "dexterity" | "intelligence" | "constitution" | "luck";
type PotionAttributeName = AttributeName | "life" | null;
type PetElement = "shadow" | "light" | "earth" | "fire" | "water";

export type NormalizedPotionSlot = {
  slot: 0 | 1 | 2;
  rawType: number | null;
  type: number | null;
  size: number | null;
  expires: number | null;
  attribute: PotionAttributeName;
  isLife: boolean | null;
};

export type NormalizedPotions = {
  source: "potions" | "save" | null;
  slots: NormalizedPotionSlot[];
  life: {
    active: boolean | null;
    size: number | null;
  };
  metadata: {
    layout: SfPlayerSaveLayout;
    fields: Record<string, NormalizedPlayerFieldMetadata>;
  };
};

export type NormalizedPets = {
  source: "pets" | null;
  bonuses: Record<PetElement, number | null>;
  attributeBonuses: Record<AttributeName, number | null>;
  own?: {
    levels: {
      all: number[];
      shadow: number[];
      light: number[];
      earth: number[];
      fire: number[];
      water: number[];
    };
    counts: Record<PetElement, number>;
    levelSums: Record<PetElement, number>;
    totalCount: number | null;
    totalLevel: number;
  };
  metadata: {
    layout: SfPlayerSaveLayout;
    fields: Record<string, NormalizedPlayerFieldMetadata>;
  };
};

const POTION_TYPE_TO_ATTRIBUTE: Record<number, PotionAttributeName> = {
  1: "strength",
  2: "dexterity",
  3: "intelligence",
  4: "constitution",
  5: "luck",
  6: "life",
};

const PET_ATTRIBUTE_BONUS_ELEMENTS: Record<AttributeName, PetElement> = {
  strength: "water",
  dexterity: "light",
  intelligence: "earth",
  constitution: "shadow",
  luck: "fire",
};

const ELEMENTS: PetElement[] = ["shadow", "light", "earth", "fire", "water"];

const LEGACY_OWN_POTION_INDEXES = {
  type: [493, 494, 495],
  expires: [496, 497, 498],
  size: [499, 500, 501],
  life: 502,
};

const LEGACY_OTHER_POTION_INDEXES = {
  type: [194, 195, 196],
  size: [200, 201, 202],
  life: 203,
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

const mark = (
  fields: Record<string, NormalizedPlayerFieldMetadata>,
  path: string,
  status: NormalizedPlayerFieldStatus,
  provenance?: NormalizedPlayerFieldProvenance,
) => {
  fields[path] = provenance ? { status, provenance } : { status };
};

const hasArrayIndex = (values: unknown[] | null, index: number): boolean =>
  Boolean(values && index >= 0 && index < values.length && Object.prototype.hasOwnProperty.call(values, index));

const readNumber = (
  values: unknown[] | null,
  index: number,
  path: string,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
  unsupported = false,
): number | null => {
  if (unsupported) {
    mark(fields, path, "unsupported");
    return null;
  }

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

const readArrayField = (row: Record<string, unknown>, key: string): unknown[] | null =>
  Array.isArray(row[key]) ? (row[key] as unknown[]) : null;

const normalizePotionType = (rawType: number | null): number | null => {
  if (rawType == null) return null;
  if (rawType === 16) return 6;
  if (rawType === 0) return 0;
  return 1 + ((rawType - 1) % 5);
};

const createPotionSlot = (
  slot: 0 | 1 | 2,
  rawType: number | null,
  size: number | null,
  expires: number | null,
): NormalizedPotionSlot | null => {
  const type = normalizePotionType(rawType);
  const hasValue = (type ?? 0) > 0 || (size ?? 0) > 0 || (expires ?? 0) > 0;
  if (!hasValue) return null;

  return {
    slot,
    rawType,
    type,
    size,
    expires,
    attribute: type == null ? null : (POTION_TYPE_TO_ATTRIBUTE[type] ?? null),
    isLife: type == null ? null : type === 6,
  };
};

const offsetMilliseconds = (row: Record<string, unknown>): number => toFiniteNumberOrNull(row.offset) ?? 0;

const normalizeModernPotions = (
  row: Record<string, unknown>,
  layout: SfPlayerSaveLayout,
): NormalizedPotions => {
  const fields: Record<string, NormalizedPlayerFieldMetadata> = {};
  const potions = readArrayField(row, "potions");
  const offset = offsetMilliseconds(row);
  const slots: NormalizedPotionSlot[] = [];

  if (!potions) {
    mark(fields, "source", "missing");
  } else {
    mark(fields, "source", "available", "raw");
  }

  ([0, 1, 2] as const).forEach((slot) => {
    const rawType = readNumber(potions, 1 + slot, `slots.${slot}.type`, fields);
    const expireSeconds = readNumber(potions, 4 + slot, `slots.${slot}.expires`, fields);
    const size = readNumber(potions, 7 + slot, `slots.${slot}.size`, fields);
    const normalized = createPotionSlot(slot, rawType, size, expireSeconds == null ? null : expireSeconds * 1000 + offset);
    if (normalized) slots.push(normalized);
    else mark(fields, `slots.${slot}`, rawType == null || size == null ? "missing" : "available", rawType == null || size == null ? undefined : "raw");
  });

  const hasLifeSlot = slots.some((slot) => slot.isLife);
  mark(fields, "life.active", "available", "derived");
  mark(fields, "life.size", hasLifeSlot ? "available" : "missing", hasLifeSlot ? "derived" : undefined);

  return {
    source: potions ? "potions" : null,
    slots,
    life: {
      active: hasLifeSlot,
      size: hasLifeSlot ? 25 : null,
    },
    metadata: { layout, fields },
  };
};

const normalizeLegacyPotions = (
  row: Record<string, unknown>,
  saveArray: unknown[] | null,
  layout: "legacyOwn" | "legacyOther",
): NormalizedPotions => {
  const fields: Record<string, NormalizedPlayerFieldMetadata> = {};
  const offset = offsetMilliseconds(row);
  const indexes = layout === "legacyOwn" ? LEGACY_OWN_POTION_INDEXES : LEGACY_OTHER_POTION_INDEXES;
  const slots: NormalizedPotionSlot[] = [];

  mark(fields, "source", saveArray ? "available" : "missing", saveArray ? "raw" : undefined);

  ([0, 1, 2] as const).forEach((slot) => {
    const rawType = readNumber(saveArray, indexes.type[slot], `slots.${slot}.type`, fields);
    const expireSeconds =
      layout === "legacyOwn"
        ? readNumber(saveArray, LEGACY_OWN_POTION_INDEXES.expires[slot], `slots.${slot}.expires`, fields)
        : readNumber(saveArray, -1, `slots.${slot}.expires`, fields, true);
    const size = readNumber(saveArray, indexes.size[slot], `slots.${slot}.size`, fields);
    const normalized = createPotionSlot(slot, rawType, size, expireSeconds == null ? null : expireSeconds * 1000 + offset);
    if (normalized) slots.push(normalized);
    else mark(fields, `slots.${slot}`, rawType == null || size == null ? "missing" : "available", rawType == null || size == null ? undefined : "raw");
  });

  const lifeSize = readNumber(saveArray, indexes.life, "life.size", fields);
  const hasLifeSlot = slots.some((slot) => slot.isLife);
  const active = (lifeSize ?? 0) > 0 || hasLifeSlot;
  mark(fields, "life.active", "available", "derived");

  return {
    source: saveArray ? "save" : null,
    slots,
    life: {
      active,
      size: lifeSize ?? (hasLifeSlot ? 25 : null),
    },
    metadata: { layout, fields },
  };
};

export const normalizeSfPlayerPotions = (
  player: unknown,
  options: { layout?: SfPlayerSaveLayout; saveArray?: unknown[] | null } = {},
): NormalizedPotions | undefined => {
  const row = player && typeof player === "object" ? (player as Record<string, unknown>) : {};
  const saveArray = options.saveArray ?? readSfPlayerSaveArray(row);
  const layout = options.layout ?? detectSfPlayerSaveLayout(row, saveArray);

  if (layout === "currentCompact" || Array.isArray(row.potions)) return normalizeModernPotions(row, layout);
  if (layout === "legacyOwn" || layout === "legacyOther") return normalizeLegacyPotions(row, saveArray, layout);
  return undefined;
};

const countPositive = (values: number[]) => values.reduce((count, value) => count + (value > 0 ? 1 : 0), 0);
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const readPetBonus = (
  values: unknown[] | null,
  index: number,
  element: PetElement,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => readNumber(values, index, `bonuses.${element}`, fields);

const createAttributeBonuses = (bonuses: Record<PetElement, number | null>) => ({
  strength: bonuses.water,
  dexterity: bonuses.light,
  intelligence: bonuses.earth,
  constitution: bonuses.shadow,
  luck: bonuses.fire,
});

export const normalizeSfPlayerPets = (
  player: unknown,
  options: { layout?: SfPlayerSaveLayout } = {},
): NormalizedPets | undefined => {
  const row = player && typeof player === "object" ? (player as Record<string, unknown>) : {};
  const saveArray = readArrayField(row, "pets");
  const layout = options.layout ?? detectSfPlayerSaveLayout(row);
  const fields: Record<string, NormalizedPlayerFieldMetadata> = {};

  if (!saveArray) {
    mark(fields, "source", "missing");
    ELEMENTS.forEach((element) => mark(fields, `bonuses.${element}`, "missing"));
    Object.keys(PET_ATTRIBUTE_BONUS_ELEMENTS).forEach((attribute) => {
      mark(fields, `attributeBonuses.${attribute}`, "missing");
    });
    return {
      source: null,
      bonuses: { shadow: null, light: null, earth: null, fire: null, water: null },
      attributeBonuses: { strength: null, dexterity: null, intelligence: null, constitution: null, luck: null },
      metadata: { layout, fields },
    };
  }

  mark(fields, "source", "available", "raw");

  if (saveArray.length >= 109) {
    const levels = saveArray.slice(2, 102).map((value) => toFiniteNumberOrNull(value) ?? 0);
    const shadowLevels = levels.slice(0, 20);
    const lightLevels = levels.slice(20, 40);
    const earthLevels = levels.slice(40, 60);
    const fireLevels = levels.slice(60, 80);
    const waterLevels = levels.slice(80, 100);
    const bonuses = {
      shadow: readPetBonus(saveArray, 104, "shadow", fields),
      light: readPetBonus(saveArray, 105, "light", fields),
      earth: readPetBonus(saveArray, 106, "earth", fields),
      fire: readPetBonus(saveArray, 107, "fire", fields),
      water: readPetBonus(saveArray, 108, "water", fields),
    };
    const attributeBonuses = createAttributeBonuses(bonuses);
    Object.entries(PET_ATTRIBUTE_BONUS_ELEMENTS).forEach(([attribute, element]) => {
      mark(fields, `attributeBonuses.${attribute}`, bonuses[element] == null ? "missing" : "available", bonuses[element] == null ? undefined : "derived");
    });

    return {
      source: "pets",
      bonuses,
      attributeBonuses,
      own: {
        levels: {
          all: levels,
          shadow: shadowLevels,
          light: lightLevels,
          earth: earthLevels,
          fire: fireLevels,
          water: waterLevels,
        },
        counts: {
          shadow: countPositive(shadowLevels),
          light: countPositive(lightLevels),
          earth: countPositive(earthLevels),
          fire: countPositive(fireLevels),
          water: countPositive(waterLevels),
        },
        levelSums: {
          shadow: sum(shadowLevels),
          light: sum(lightLevels),
          earth: sum(earthLevels),
          fire: sum(fireLevels),
          water: sum(waterLevels),
        },
        totalCount: readNumber(saveArray, 103, "own.totalCount", fields),
        totalLevel: sum(levels),
      },
      metadata: { layout, fields },
    };
  }

  const bonuses = {
    shadow: readPetBonus(saveArray, 1, "shadow", fields),
    light: readPetBonus(saveArray, 2, "light", fields),
    earth: readPetBonus(saveArray, 3, "earth", fields),
    fire: readPetBonus(saveArray, 4, "fire", fields),
    water: readPetBonus(saveArray, 5, "water", fields),
  };
  const attributeBonuses = createAttributeBonuses(bonuses);
  Object.entries(PET_ATTRIBUTE_BONUS_ELEMENTS).forEach(([attribute, element]) => {
    mark(fields, `attributeBonuses.${attribute}`, bonuses[element] == null ? "missing" : "available", bonuses[element] == null ? undefined : "derived");
  });
  mark(fields, "own.levels", "unsupported");
  mark(fields, "own.counts", "unsupported");
  mark(fields, "own.levelSums", "unsupported");
  mark(fields, "own.totalCount", "unsupported");
  mark(fields, "own.totalLevel", "unsupported");

  return {
    source: "pets",
    bonuses,
    attributeBonuses,
    metadata: { layout, fields },
  };
};
