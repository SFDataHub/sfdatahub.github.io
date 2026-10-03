import type {
  AttributeCode,
  AttributeCompositionBreakdown,
  AttributeCompositionItem,
  LatestValuesStatsModel,
} from "../../lib/parsing/latestValues";
import type { NormalizedPlayer } from "../../lib/parsing/normalizedPlayer";

export type AttributeCompositionSourceKey =
  | "base"
  | "baseItems"
  | "upgrades"
  | "equipment"
  | "gems"
  | "pet"
  | "potion"
  | "petBonus"
  | "other";

export type AttributeCompositionMainSourceKey = "base" | "baseItems" | "upgrades" | "gems" | "petBonus" | "potion";

export type AttributeCompositionModel = {
  attributes: AttributeCompositionItem[];
};

export type AttributeCompositionSegment = {
  sourceKey: AttributeCompositionSourceKey;
  label: string;
  value: number;
  widthPct: number;
  iconPlaceholder: string;
  shadeIndex: number;
  isBarSegment: boolean;
  isInteractive: boolean;
};

export type AttributeCompositionSourceState =
  | { status: "known"; value: number }
  | { status: "unknown" };

export type AttributeCompositionSourceTotals = Record<AttributeCompositionMainSourceKey, AttributeCompositionSourceState>;

export type AttributeCompositionRadarAxis = {
  key: AttributeCompositionMainSourceKey;
  label: string;
  rawValue: number;
  displayScore: number;
};

export type AttributeCompositionRadarModel = {
  axes: AttributeCompositionRadarAxis[];
  maxValue: number;
};

export const ATTRIBUTE_COMPOSITION_CODES: AttributeCode[] = ["str", "dex", "int", "con", "lck"];

export const ATTRIBUTE_COMPOSITION_SOURCE_META: Record<
  AttributeCompositionSourceKey,
  { iconPlaceholder: string; shadeIndex: number }
> = {
  base: { iconPlaceholder: "BA", shadeIndex: -1 },
  baseItems: { iconPlaceholder: "BI", shadeIndex: 0 },
  upgrades: { iconPlaceholder: "UP", shadeIndex: 1 },
  equipment: { iconPlaceholder: "EQ", shadeIndex: 2 },
  gems: { iconPlaceholder: "GM", shadeIndex: 3 },
  pet: { iconPlaceholder: "PB", shadeIndex: 4 },
  potion: { iconPlaceholder: "PO", shadeIndex: 5 },
  petBonus: { iconPlaceholder: "PC", shadeIndex: 5 },
  other: { iconPlaceholder: "OT", shadeIndex: 2 },
};

export const ATTRIBUTE_COMPOSITION_RADAR_LABELS: Record<AttributeCompositionMainSourceKey, string> = {
  base: "BA",
  baseItems: "BI",
  upgrades: "UP",
  gems: "GM",
  petBonus: "PB",
  potion: "PO",
};

const NORMALIZED_ATTRIBUTE_BY_CODE: Record<AttributeCode, keyof NormalizedPlayer["attributes"]> = {
  str: "strength",
  dex: "dexterity",
  int: "intelligence",
  con: "constitution",
  lck: "luck",
};

export const createAttributeCompositionModelFromStats = (
  stats: Pick<LatestValuesStatsModel, "attributeComposition">,
): AttributeCompositionModel => ({
  attributes: stats.attributeComposition,
});

export const createAttributeCompositionModelFromNormalizedAttributes = (
  attributes: NormalizedPlayer["attributes"],
): AttributeCompositionModel => ({
  attributes: ATTRIBUTE_COMPOSITION_CODES.map((code) => {
    const attribute = attributes[NORMALIZED_ATTRIBUTE_BY_CODE[code]];
    return {
      code,
      total: attribute.total,
      base: attribute.base,
      bonus: attribute.bonus,
      breakdown: {
        baseItems: attribute.itemsBase,
        upgrades: attribute.upgrades,
        equipment: attribute.equipment,
        gems: attribute.gems,
        pet: attribute.pet,
        potion: attribute.potion,
        items: attribute.items,
        petBonus: null,
      },
    };
  }),
});

const isKnownNumber = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

const sourceStateFromValues = (values: Array<number | null | undefined>): AttributeCompositionSourceState => {
  if (!values.every(isKnownNumber)) return { status: "unknown" };
  return { status: "known", value: values.reduce((sum, value) => sum + value, 0) };
};

export const aggregateAttributeCompositionSourceTotals = (
  composition: AttributeCompositionModel | null | undefined,
): AttributeCompositionSourceTotals | null => {
  if (!composition) return null;
  const byCode = new Map(composition.attributes.map((attribute) => [attribute.code, attribute]));
  const attributes = ATTRIBUTE_COMPOSITION_CODES.map((code) => byCode.get(code));
  if (attributes.some((attribute) => !attribute)) return null;

  const typedAttributes = attributes as AttributeCompositionItem[];
  return {
    base: sourceStateFromValues(typedAttributes.map((attribute) => attribute.base)),
    baseItems: sourceStateFromValues(typedAttributes.map((attribute) => attribute.breakdown.baseItems)),
    upgrades: sourceStateFromValues(typedAttributes.map((attribute) => attribute.breakdown.upgrades)),
    gems: sourceStateFromValues(typedAttributes.map((attribute) => attribute.breakdown.gems)),
    petBonus: sourceStateFromValues(typedAttributes.map((attribute) => attribute.breakdown.pet)),
    potion: sourceStateFromValues(typedAttributes.map((attribute) => attribute.breakdown.potion)),
  };
};

export const buildAttributeCompositionRadarModel = (
  composition: AttributeCompositionModel | null | undefined,
): AttributeCompositionRadarModel | null => {
  const totals = aggregateAttributeCompositionSourceTotals(composition);
  if (!totals) return null;

  const keys: AttributeCompositionMainSourceKey[] = ["base", "baseItems", "upgrades", "gems", "petBonus", "potion"];
  const values: AttributeCompositionRadarAxis[] = [];
  for (const key of keys) {
    const state = totals[key];
    if (state.status !== "known") return null;
    values.push({
      key,
      label: ATTRIBUTE_COMPOSITION_RADAR_LABELS[key],
      rawValue: state.value,
      displayScore: 0,
    });
  }

  const maxValue = Math.max(...values.map((axis) => axis.rawValue));
  if (!Number.isFinite(maxValue) || maxValue <= 0) return null;

  return {
    maxValue,
    axes: values.map((axis) => ({
      ...axis,
      displayScore: Math.max(0, (axis.rawValue / maxValue) * 100),
    })),
  };
};

export const buildAttributeCompositionSegments = (
  labels: Record<Exclude<AttributeCompositionSourceKey, "other">, string> & { other: string },
  base: number | null,
  breakdown: AttributeCompositionBreakdown,
  total: number | null,
): AttributeCompositionSegment[] => {
  const segments: Array<Omit<AttributeCompositionSegment, "widthPct">> = [];
  let bonusContributionSum = 0;
  const pushSourceSegment = (
    sourceKey: Exclude<AttributeCompositionSourceKey, "other">,
    label: string,
    value: number | null | undefined,
    options?: { isBarSegment?: boolean; isInteractive?: boolean; countTowardsBase?: boolean },
  ) => {
    if (!isKnownNumber(value) || value <= 0) return;
    const isBarSegment = options?.isBarSegment ?? true;
    const isInteractive = options?.isInteractive ?? isBarSegment;
    const countTowardsBase = options?.countTowardsBase ?? isBarSegment;
    if (countTowardsBase) {
      bonusContributionSum += value;
    }
    segments.push({
      sourceKey,
      label,
      value,
      iconPlaceholder: ATTRIBUTE_COMPOSITION_SOURCE_META[sourceKey].iconPlaceholder,
      shadeIndex: ATTRIBUTE_COMPOSITION_SOURCE_META[sourceKey].shadeIndex,
      isBarSegment,
      isInteractive,
    });
  };

  pushSourceSegment("base", labels.base, base, {
    isBarSegment: true,
    isInteractive: true,
    countTowardsBase: false,
  });
  pushSourceSegment("baseItems", labels.baseItems, breakdown.baseItems);
  pushSourceSegment("upgrades", labels.upgrades, breakdown.upgrades);
  pushSourceSegment("equipment", labels.equipment, breakdown.equipment);
  pushSourceSegment("gems", labels.gems, breakdown.gems);
  pushSourceSegment("pet", labels.pet, breakdown.pet);
  pushSourceSegment("potion", labels.potion, breakdown.potion);

  const fallbackBaseValue =
    base == null && isKnownNumber(total)
      ? Math.max(0, total - Math.max(0, bonusContributionSum))
      : null;

  if (fallbackBaseValue != null && fallbackBaseValue > 0) {
    segments.unshift({
      sourceKey: "base",
      label: labels.base,
      value: fallbackBaseValue,
      iconPlaceholder: ATTRIBUTE_COMPOSITION_SOURCE_META.base.iconPlaceholder,
      shadeIndex: ATTRIBUTE_COMPOSITION_SOURCE_META.base.shadeIndex,
      isBarSegment: true,
      isInteractive: true,
    });
  }

  pushSourceSegment("petBonus", labels.petBonus, breakdown.petBonus, {
    isBarSegment: false,
    isInteractive: false,
    countTowardsBase: false,
  });

  if (!segments.length && isKnownNumber(total) && total > 0) {
    segments.push({
      sourceKey: "other",
      label: labels.other,
      value: total,
      iconPlaceholder: ATTRIBUTE_COMPOSITION_SOURCE_META.other.iconPlaceholder,
      shadeIndex: ATTRIBUTE_COMPOSITION_SOURCE_META.other.shadeIndex,
      isBarSegment: true,
      isInteractive: true,
    });
  }

  const barSegments = segments.filter((segment) => segment.isBarSegment);
  const sum = barSegments.reduce((acc, segment) => acc + segment.value, 0);
  const denominator = Math.max(sum, total ?? 0, 1);

  return segments.map((segment) => ({
    ...segment,
    widthPct: segment.isBarSegment ? Math.max(0, Math.min(100, (segment.value / denominator) * 100)) : 0,
  }));
};
