import { detectSfPlayerSaveLayout, type SfPlayerSaveLayout } from "./playerSaveLayout";
import type { NormalizedPlayerFieldMetadata, NormalizedPlayerFieldProvenance, NormalizedPlayerFieldStatus } from "./normalizedPlayer";

type ResourceKey =
  | "mushrooms"
  | "goldRaw"
  | "gold"
  | "coins"
  | "hourglass"
  | "wood"
  | "secretWood"
  | "stone"
  | "secretStone"
  | "metal"
  | "crystals"
  | "souls"
  | "shadowFood"
  | "lightFood"
  | "earthFood"
  | "fireFood"
  | "waterFood";

export type NormalizedPlayerResources = {
  currencies: {
    mushrooms: {
      current: number | null;
      paid: number | null;
      free: number | null;
      total: number | null;
    };
    gold: {
      raw: number | null;
      value: number | null;
    };
    coins: number | null;
    hourglass: number | null;
  };
  fortress: {
    wood: number | null;
    stone: number | null;
    secretWood: number | null;
    secretStone: number | null;
  };
  smithy: {
    metal: number | null;
    crystals: number | null;
  };
  underworld: {
    souls: number | null;
  };
  pets: {
    shadowFood: number | null;
    lightFood: number | null;
    earthFood: number | null;
    fireFood: number | null;
    waterFood: number | null;
  };
  metadata: {
    layout: SfPlayerSaveLayout;
    fields: Record<string, NormalizedPlayerFieldMetadata>;
  };
};

const RESOURCE_ARRAY_INDEX: Record<Exclude<ResourceKey, "gold">, number> = {
  mushrooms: 1,
  goldRaw: 2,
  coins: 3,
  hourglass: 4,
  wood: 5,
  secretWood: 6,
  stone: 7,
  secretStone: 8,
  metal: 9,
  crystals: 10,
  souls: 11,
  shadowFood: 12,
  lightFood: 13,
  earthFood: 14,
  fireFood: 15,
  waterFood: 16,
};

const RESOURCE_OBJECT_KEY: Record<Exclude<ResourceKey, "gold">, string> = {
  mushrooms: "mushrooms",
  goldRaw: "gold",
  coins: "coins",
  hourglass: "hourglass",
  wood: "wood",
  secretWood: "secretWood",
  stone: "stone",
  secretStone: "secretStone",
  metal: "metal",
  crystals: "crystals",
  souls: "souls",
  shadowFood: "shadowFood",
  lightFood: "lightFood",
  earthFood: "earthFood",
  fireFood: "fireFood",
  waterFood: "waterFood",
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

const createEmptyResources = (
  layout: SfPlayerSaveLayout,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): NormalizedPlayerResources => ({
  currencies: {
    mushrooms: { current: null, paid: null, free: null, total: null },
    gold: { raw: null, value: null },
    coins: null,
    hourglass: null,
  },
  fortress: {
    wood: null,
    stone: null,
    secretWood: null,
    secretStone: null,
  },
  smithy: {
    metal: null,
    crystals: null,
  },
  underworld: {
    souls: null,
  },
  pets: {
    shadowFood: null,
    lightFood: null,
    earthFood: null,
    fireFood: null,
    waterFood: null,
  },
  metadata: { layout, fields },
});

const FIELD_PATHS: Record<ResourceKey, string> = {
  mushrooms: "resources.currencies.mushrooms.current",
  goldRaw: "resources.currencies.gold.raw",
  gold: "resources.currencies.gold.value",
  coins: "resources.currencies.coins",
  hourglass: "resources.currencies.hourglass",
  wood: "resources.fortress.wood",
  secretWood: "resources.fortress.secretWood",
  stone: "resources.fortress.stone",
  secretStone: "resources.fortress.secretStone",
  metal: "resources.smithy.metal",
  crystals: "resources.smithy.crystals",
  souls: "resources.underworld.souls",
  shadowFood: "resources.pets.shadowFood",
  lightFood: "resources.pets.lightFood",
  earthFood: "resources.pets.earthFood",
  fireFood: "resources.pets.fireFood",
  waterFood: "resources.pets.waterFood",
};

const readResource = (
  source: unknown,
  key: Exclude<ResourceKey, "gold">,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  const path = FIELD_PATHS[key];
  if (Array.isArray(source)) {
    const index = RESOURCE_ARRAY_INDEX[key];
    if (!hasArrayIndex(source, index)) {
      mark(fields, path, "missing");
      return null;
    }

    const value = toFiniteNumberOrNull(source[index]);
    mark(fields, path, value == null ? "invalid" : "available", value == null ? undefined : "raw");
    return value;
  }

  const record = asRecord(source);
  if (!record || !Object.prototype.hasOwnProperty.call(record, RESOURCE_OBJECT_KEY[key])) {
    mark(fields, path, "missing");
    return null;
  }

  const value = toFiniteNumberOrNull(record[RESOURCE_OBJECT_KEY[key]]);
  mark(fields, path, value == null ? "invalid" : "available", value == null ? undefined : "raw");
  return value;
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

const markAll = (fields: Record<string, NormalizedPlayerFieldMetadata>, status: NormalizedPlayerFieldStatus) => {
  Object.values(FIELD_PATHS).forEach((path) => mark(fields, path, status));
  mark(fields, "resources.currencies.mushrooms.paid", status);
  mark(fields, "resources.currencies.mushrooms.free", status);
  mark(fields, "resources.currencies.mushrooms.total", status);
};

export const normalizeSfPlayerResources = (
  player: unknown,
  options: { layout?: SfPlayerSaveLayout } = {},
): NormalizedPlayerResources => {
  const row = player && typeof player === "object" ? (player as Record<string, unknown>) : {};
  const layout = options.layout ?? detectSfPlayerSaveLayout(row);
  const fields: Record<string, NormalizedPlayerFieldMetadata> = {};
  const resources = createEmptyResources(layout, fields);
  const own = toFiniteNumberOrNull(row.own) === 1 || row.own === true;

  if (!own) {
    markAll(fields, "unsupported");
    return resources;
  }

  const source = row.resources;
  if (source == null) {
    markAll(fields, layout === "unknown" ? "unsupported" : "missing");
    return resources;
  }

  const mushrooms = readResource(source, "mushrooms", fields);
  const goldRaw = readResource(source, "goldRaw", fields);

  resources.currencies.mushrooms.current = mushrooms;
  resources.currencies.gold.raw = goldRaw;
  resources.currencies.gold.value = goldRaw == null ? null : goldRaw / 100;
  mark(fields, FIELD_PATHS.gold, goldRaw == null ? fields[FIELD_PATHS.goldRaw]?.status ?? "missing" : "available", goldRaw == null ? undefined : "derived");

  resources.currencies.coins = readResource(source, "coins", fields);
  resources.currencies.hourglass = readResource(source, "hourglass", fields);
  resources.fortress.wood = readResource(source, "wood", fields);
  resources.fortress.secretWood = readResource(source, "secretWood", fields);
  resources.fortress.stone = readResource(source, "stone", fields);
  resources.fortress.secretStone = readResource(source, "secretStone", fields);
  resources.smithy.metal = readResource(source, "metal", fields);
  resources.smithy.crystals = readResource(source, "crystals", fields);
  resources.underworld.souls = readResource(source, "souls", fields);
  resources.pets.shadowFood = readResource(source, "shadowFood", fields);
  resources.pets.lightFood = readResource(source, "lightFood", fields);
  resources.pets.earthFood = readResource(source, "earthFood", fields);
  resources.pets.fireFood = readResource(source, "fireFood", fields);
  resources.pets.waterFood = readResource(source, "waterFood", fields);

  resources.currencies.mushrooms.paid = readStatusNumber(row.status, 13, "resources.currencies.mushrooms.paid", fields);
  resources.currencies.mushrooms.free = readStatusNumber(row.status, 15, "resources.currencies.mushrooms.free", fields);
  if (resources.currencies.mushrooms.paid == null || resources.currencies.mushrooms.free == null) {
    const sourceStatus =
      fields["resources.currencies.mushrooms.paid"]?.status === "invalid" ||
      fields["resources.currencies.mushrooms.free"]?.status === "invalid"
        ? "invalid"
        : "missing";
    mark(fields, "resources.currencies.mushrooms.total", sourceStatus);
  } else {
    resources.currencies.mushrooms.total = resources.currencies.mushrooms.paid + resources.currencies.mushrooms.free;
    mark(fields, "resources.currencies.mushrooms.total", "available", "calculated");
  }

  return resources;
};
