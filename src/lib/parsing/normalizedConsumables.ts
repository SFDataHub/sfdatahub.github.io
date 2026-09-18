import { detectSfPlayerSaveLayout, readSfPlayerSaveArray, type SfPlayerSaveLayout } from "./playerSaveLayout";
import type { NormalizedPlayerFieldMetadata, NormalizedPlayerFieldProvenance, NormalizedPlayerFieldStatus } from "./normalizedPlayer";

type AttributeName = "strength" | "dexterity" | "intelligence" | "constitution" | "luck";
type PotionAttributeName = AttributeName | "life" | null;
type PetElement = "shadow" | "light" | "earth" | "fire" | "water";

type NormalizedPetEntry = {
  id: number;
  element: PetElement;
  elementIndex: number;
  collectionIndex: number;
  level: number | null;
  found: boolean | null;
};

type NormalizedPetElementSummary = {
  element: PetElement;
  elementIndex: number;
  levels: number[] | null;
  pets: NormalizedPetEntry[] | null;
  count: number | null;
  levelSum: number | null;
  bonus: number | null;
  habitatProgress: number | null;
  food: number | null;
};

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
  elements: Record<PetElement, NormalizedPetElementSummary>;
  collection: {
    pets: NormalizedPetEntry[];
    totalPets: number;
    petsPerElement: number;
  } | null;
  rank: number | null;
  honor: number | null;
  habitatProgress: Record<PetElement, number | null>;
  foods: Record<PetElement, number | null>;
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
    habitatProgress: Record<PetElement, number | null>;
    rank: number | null;
    honor: number | null;
    foods: Record<PetElement, number | null>;
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
const PETS_PER_ELEMENT = 20;
const TOTAL_PETS = 100;

const PET_BONUS_INDEXES: Record<PetElement, number> = {
  shadow: 104,
  light: 105,
  earth: 106,
  fire: 107,
  water: 108,
};

const OTHER_PET_BONUS_INDEXES: Record<PetElement, number> = {
  shadow: 1,
  light: 2,
  earth: 3,
  fire: 4,
  water: 5,
};

const PET_HABITAT_INDEXES: Record<PetElement, number> = {
  shadow: 210,
  light: 211,
  earth: 212,
  fire: 213,
  water: 214,
};

const PET_FOOD_INDEXES: Record<PetElement, number> = {
  shadow: 259,
  light: 260,
  earth: 261,
  fire: 262,
  water: 263,
};

const RESOURCE_FOOD_KEYS: Record<PetElement, string> = {
  shadow: "shadowFood",
  light: "lightFood",
  earth: "earthFood",
  fire: "fireFood",
  water: "waterFood",
};

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

const readPetValues = (row: Record<string, unknown>): unknown[] | null => {
  const pets = row.pets;
  if (Array.isArray(pets)) return pets;
  if (pets && typeof pets === "object" && Array.isArray((pets as { values?: unknown[] }).values)) {
    return (pets as { values: unknown[] }).values;
  }
  return null;
};

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

const emptyElementSummaries = (
  bonuses: Record<PetElement, number | null>,
  habitatProgress: Record<PetElement, number | null>,
  foods: Record<PetElement, number | null>,
): Record<PetElement, NormalizedPetElementSummary> =>
  Object.fromEntries(
    ELEMENTS.map((element, elementIndex) => [
      element,
      {
        element,
        elementIndex,
        levels: null,
        pets: null,
        count: null,
        levelSum: null,
        bonus: bonuses[element],
        habitatProgress: habitatProgress[element],
        food: foods[element],
      },
    ]),
  ) as Record<PetElement, NormalizedPetElementSummary>;

const readResourceFood = (row: Record<string, unknown>, element: PetElement): number | null => {
  const resources = row.resources;
  if (!resources || typeof resources !== "object") return null;
  if (Array.isArray(resources)) return toFiniteNumberOrNull(resources[12 + ELEMENTS.indexOf(element)]);
  return toFiniteNumberOrNull((resources as Record<string, unknown>)[RESOURCE_FOOD_KEYS[element]]);
};

const readPetFood = (
  row: Record<string, unknown>,
  values: unknown[] | null,
  element: PetElement,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  const raw = readNumber(values, PET_FOOD_INDEXES[element], `foods.${element}`, fields);
  if ((raw ?? 0) !== 0) return raw;

  const fallback = readResourceFood(row, element);
  if (fallback == null) return raw;

  mark(fields, `foods.${element}`, "available", "derived");
  return fallback;
};

const markUnsupportedOwnPetDetails = (fields: Record<string, NormalizedPlayerFieldMetadata>) => {
  mark(fields, "collection", "unsupported");
  ELEMENTS.forEach((element) => {
    mark(fields, `elements.${element}.levels`, "unsupported");
    mark(fields, `elements.${element}.pets`, "unsupported");
    mark(fields, `elements.${element}.count`, "unsupported");
    mark(fields, `elements.${element}.levelSum`, "unsupported");
    mark(fields, `habitatProgress.${element}`, "unsupported");
    mark(fields, `foods.${element}`, "unsupported");
  });
  mark(fields, "own.levels", "unsupported");
  mark(fields, "own.counts", "unsupported");
  mark(fields, "own.levelSums", "unsupported");
  mark(fields, "own.totalCount", "unsupported");
  mark(fields, "own.totalLevel", "unsupported");
  mark(fields, "rank", "unsupported");
  mark(fields, "honor", "unsupported");
};

export const normalizeSfPlayerPets = (
  player: unknown,
  options: { layout?: SfPlayerSaveLayout } = {},
): NormalizedPets | undefined => {
  const row = player && typeof player === "object" ? (player as Record<string, unknown>) : {};
  const saveArray = readPetValues(row);
  const layout = options.layout ?? detectSfPlayerSaveLayout(row);
  const fields: Record<string, NormalizedPlayerFieldMetadata> = {};

  if (!saveArray) {
    mark(fields, "source", "missing");
    ELEMENTS.forEach((element) => mark(fields, `bonuses.${element}`, "missing"));
    Object.keys(PET_ATTRIBUTE_BONUS_ELEMENTS).forEach((attribute) => {
      mark(fields, `attributeBonuses.${attribute}`, "missing");
    });
    mark(fields, "collection", "missing");
    ELEMENTS.forEach((element) => {
      mark(fields, `elements.${element}.levels`, "missing");
      mark(fields, `elements.${element}.pets`, "missing");
      mark(fields, `elements.${element}.count`, "missing");
      mark(fields, `elements.${element}.levelSum`, "missing");
      mark(fields, `habitatProgress.${element}`, "missing");
      mark(fields, `foods.${element}`, "missing");
    });
    mark(fields, "rank", "missing");
    mark(fields, "honor", "missing");
    const bonuses = { shadow: null, light: null, earth: null, fire: null, water: null };
    const habitatProgress = { shadow: null, light: null, earth: null, fire: null, water: null };
    const foods = { shadow: null, light: null, earth: null, fire: null, water: null };
    return {
      source: null,
      bonuses,
      attributeBonuses: { strength: null, dexterity: null, intelligence: null, constitution: null, luck: null },
      elements: emptyElementSummaries(bonuses, habitatProgress, foods),
      collection: null,
      rank: null,
      honor: null,
      habitatProgress,
      foods,
      metadata: { layout, fields },
    };
  }

  mark(fields, "source", "available", "raw");

  if (saveArray.length >= 109) {
    const levels = saveArray.slice(2, 102).map((value, index) => {
      const level = toFiniteNumberOrNull(value);
      const path = `collection.pets.${index}.level`;
      if (level == null) {
        mark(fields, path, "invalid");
        mark(fields, `collection.pets.${index}.found`, "invalid");
        return 0;
      }
      mark(fields, path, "available", "raw");
      mark(fields, `collection.pets.${index}.found`, "available", "derived");
      return level;
    });
    const shadowLevels = levels.slice(0, 20);
    const lightLevels = levels.slice(20, 40);
    const earthLevels = levels.slice(40, 60);
    const fireLevels = levels.slice(60, 80);
    const waterLevels = levels.slice(80, 100);
    const bonuses = {
      shadow: readPetBonus(saveArray, PET_BONUS_INDEXES.shadow, "shadow", fields),
      light: readPetBonus(saveArray, PET_BONUS_INDEXES.light, "light", fields),
      earth: readPetBonus(saveArray, PET_BONUS_INDEXES.earth, "earth", fields),
      fire: readPetBonus(saveArray, PET_BONUS_INDEXES.fire, "fire", fields),
      water: readPetBonus(saveArray, PET_BONUS_INDEXES.water, "water", fields),
    };
    const habitatProgress = {
      shadow: readNumber(saveArray, PET_HABITAT_INDEXES.shadow, "habitatProgress.shadow", fields),
      light: readNumber(saveArray, PET_HABITAT_INDEXES.light, "habitatProgress.light", fields),
      earth: readNumber(saveArray, PET_HABITAT_INDEXES.earth, "habitatProgress.earth", fields),
      fire: readNumber(saveArray, PET_HABITAT_INDEXES.fire, "habitatProgress.fire", fields),
      water: readNumber(saveArray, PET_HABITAT_INDEXES.water, "habitatProgress.water", fields),
    };
    const foods = {
      shadow: readPetFood(row, saveArray, "shadow", fields),
      light: readPetFood(row, saveArray, "light", fields),
      earth: readPetFood(row, saveArray, "earth", fields),
      fire: readPetFood(row, saveArray, "fire", fields),
      water: readPetFood(row, saveArray, "water", fields),
    };
    const levelGroups = {
      shadow: shadowLevels,
      light: lightLevels,
      earth: earthLevels,
      fire: fireLevels,
      water: waterLevels,
    };
    const pets = levels.map((level, collectionIndex) => {
      const elementIndex = Math.trunc(collectionIndex / PETS_PER_ELEMENT);
      const element = ELEMENTS[elementIndex] ?? "shadow";
      return {
        id: collectionIndex,
        element,
        elementIndex: collectionIndex % PETS_PER_ELEMENT,
        collectionIndex,
        level,
        found: level > 0,
      };
    });
    const counts = {
      shadow: countPositive(shadowLevels),
      light: countPositive(lightLevels),
      earth: countPositive(earthLevels),
      fire: countPositive(fireLevels),
      water: countPositive(waterLevels),
    };
    const levelSums = {
      shadow: sum(shadowLevels),
      light: sum(lightLevels),
      earth: sum(earthLevels),
      fire: sum(fireLevels),
      water: sum(waterLevels),
    };
    const elements = Object.fromEntries(
      ELEMENTS.map((element, elementIndex) => {
        mark(fields, `elements.${element}.levels`, "available", "raw");
        mark(fields, `elements.${element}.pets`, "available", "derived");
        mark(fields, `elements.${element}.count`, "available", "derived");
        mark(fields, `elements.${element}.levelSum`, "available", "derived");
        return [
          element,
          {
            element,
            elementIndex,
            levels: levelGroups[element],
            pets: pets.slice(elementIndex * PETS_PER_ELEMENT, (elementIndex + 1) * PETS_PER_ELEMENT),
            count: counts[element],
            levelSum: levelSums[element],
            bonus: bonuses[element],
            habitatProgress: habitatProgress[element],
            food: foods[element],
          },
        ];
      }),
    ) as Record<PetElement, NormalizedPetElementSummary>;
    const attributeBonuses = createAttributeBonuses(bonuses);
    Object.entries(PET_ATTRIBUTE_BONUS_ELEMENTS).forEach(([attribute, element]) => {
      mark(fields, `attributeBonuses.${attribute}`, bonuses[element] == null ? "missing" : "available", bonuses[element] == null ? undefined : "derived");
    });
    mark(fields, "collection", "available", "derived");
    const rank = readNumber(saveArray, 233, "rank", fields);
    const honor = readNumber(saveArray, 234, "honor", fields);
    const totalCount = readNumber(saveArray, 103, "own.totalCount", fields);
    const totalLevel = sum(levels);
    mark(fields, "own.totalLevel", "available", "derived");

    return {
      source: "pets",
      bonuses,
      attributeBonuses,
      elements,
      collection: {
        pets,
        totalPets: TOTAL_PETS,
        petsPerElement: PETS_PER_ELEMENT,
      },
      rank,
      honor,
      habitatProgress,
      foods,
      own: {
        levels: {
          all: levels,
          shadow: shadowLevels,
          light: lightLevels,
          earth: earthLevels,
          fire: fireLevels,
          water: waterLevels,
        },
        counts,
        levelSums,
        totalCount,
        totalLevel,
        habitatProgress,
        rank,
        honor,
        foods,
      },
      metadata: { layout, fields },
    };
  }

  const bonuses = {
    shadow: readPetBonus(saveArray, OTHER_PET_BONUS_INDEXES.shadow, "shadow", fields),
    light: readPetBonus(saveArray, OTHER_PET_BONUS_INDEXES.light, "light", fields),
    earth: readPetBonus(saveArray, OTHER_PET_BONUS_INDEXES.earth, "earth", fields),
    fire: readPetBonus(saveArray, OTHER_PET_BONUS_INDEXES.fire, "fire", fields),
    water: readPetBonus(saveArray, OTHER_PET_BONUS_INDEXES.water, "water", fields),
  };
  const habitatProgress = { shadow: null, light: null, earth: null, fire: null, water: null };
  const foods = { shadow: null, light: null, earth: null, fire: null, water: null };
  const attributeBonuses = createAttributeBonuses(bonuses);
  Object.entries(PET_ATTRIBUTE_BONUS_ELEMENTS).forEach(([attribute, element]) => {
    mark(fields, `attributeBonuses.${attribute}`, bonuses[element] == null ? "missing" : "available", bonuses[element] == null ? undefined : "derived");
  });
  markUnsupportedOwnPetDetails(fields);

  return {
    source: "pets",
    bonuses,
    attributeBonuses,
    elements: emptyElementSummaries(bonuses, habitatProgress, foods),
    collection: null,
    rank: null,
    honor: null,
    habitatProgress,
    foods,
    metadata: { layout, fields },
  };
};
