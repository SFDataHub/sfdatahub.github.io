import type { NormalizedPets, NormalizedPotions } from "./normalizedConsumables";
import type { NormalizedPlayerItems } from "./normalizedItem";
import type {
  NormalizedPlayerAttribute,
  NormalizedPlayerFieldMetadata,
  NormalizedPlayerFieldProvenance,
  NormalizedPlayerFieldStatus,
} from "./normalizedPlayer";

export type NormalizedAttributeKey = "strength" | "dexterity" | "intelligence" | "constitution" | "luck";

type AttributeDefinition = {
  key: NormalizedAttributeKey;
  typeId: 1 | 2 | 3 | 4 | 5;
};

const ATTRIBUTE_DEFINITIONS: AttributeDefinition[] = [
  { key: "strength", typeId: 1 },
  { key: "dexterity", typeId: 2 },
  { key: "intelligence", typeId: 3 },
  { key: "constitution", typeId: 4 },
  { key: "luck", typeId: 5 },
];

const BATTLEMAGE_CLASS = 5;
const BERSERKER_CLASS = 6;
const ASSASSIN_CLASS = 4;

const mark = (
  fields: Record<string, NormalizedPlayerFieldMetadata>,
  path: string,
  status: NormalizedPlayerFieldStatus,
  provenance?: NormalizedPlayerFieldProvenance,
) => {
  fields[path] = provenance ? { status, provenance } : { status };
};

const markCalculated = (
  fields: Record<string, NormalizedPlayerFieldMetadata>,
  path: string,
  value: number | null,
  missing = false,
) => {
  mark(fields, path, value == null || missing ? "missing" : "available", value == null || missing ? undefined : "calculated");
};

const getPrimaryAttribute = (characterClass: number | null): NormalizedAttributeKey | null => {
  if (characterClass == null) return null;
  if ([1, 5, 6, 11].includes(characterClass)) return "strength";
  if ([3, 4, 7, 12].includes(characterClass)) return "dexterity";
  if ([2, 8, 9, 10].includes(characterClass)) return "intelligence";
  return null;
};

const getEquippedItems = (items: NormalizedPlayerItems | undefined) =>
  items?.equipped ? Object.values(items.equipped.slots) : null;

const calculateItemBonus = (
  items: NormalizedPlayerItems | undefined,
  attribute: NormalizedAttributeKey,
): number | null => {
  const equipped = getEquippedItems(items);
  if (!equipped) return null;

  return equipped.reduce(
    (total, item) =>
      total +
      item.attributes.reduce(
        (itemTotal, itemAttribute) =>
          itemAttribute.affectedAttributes.includes(attribute) ? itemTotal + itemAttribute.value : itemTotal,
        0,
      ),
    0,
  );
};

const calculateUpgradeBonus = (
  items: NormalizedPlayerItems | undefined,
  attribute: NormalizedAttributeKey,
): number | null => {
  const equipped = getEquippedItems(items);
  if (!equipped) return null;

  return equipped.reduce((total, item) => {
    if ((item.upgrades ?? 0) <= 0 || item.upgradeMultiplier == null) return total;

    return (
      total +
      item.attributes.reduce((itemTotal, itemAttribute) => {
        if (!itemAttribute.affectedAttributes.includes(attribute)) return itemTotal;
        return itemTotal + itemAttribute.value - Math.floor(itemAttribute.value / item.upgradeMultiplier!);
      }, 0)
    );
  }, 0);
};

const calculateGemBonus = (
  items: NormalizedPlayerItems | undefined,
  definition: AttributeDefinition,
  characterClass: number | null,
  primaryAttribute: NormalizedAttributeKey | null,
): number | null => {
  const equipped = getEquippedItems(items);
  if (!equipped) return null;

  return equipped.reduce((total, item) => {
    if (!item.socket.hasGem || item.socket.gemType == null || item.socket.gemValue == null) return total;

    const matches =
      item.socket.gemType === definition.typeId ||
      item.socket.gemType === 6 ||
      (item.socket.gemType === 7 && (definition.key === primaryAttribute || definition.key === "constitution"));
    if (!matches) return total;

    const weaponMultiplier = item.type === 1 && characterClass !== ASSASSIN_CLASS ? 2 : 1;
    return total + item.socket.gemValue * weaponMultiplier;
  }, 0);
};

const calculatePotionBonus = (
  potions: NormalizedPotions | undefined,
  definition: AttributeDefinition,
  base: number,
  classBonus: number,
  equipment: number,
): number | null => {
  if (!potions || potions.source == null) return null;

  const size = potions.slots
    .filter((slot) => slot.type === definition.typeId && slot.size != null && !slot.isLife)
    .reduce<number | null>((best, slot) => Math.max(best ?? 0, slot.size ?? 0), null);
  if (size == null) return 0;

  return Math.ceil(((base + classBonus + equipment) * size) / 100);
};

const calculatePetBonus = (
  pets: NormalizedPets | undefined,
  attribute: NormalizedAttributeKey,
  base: number,
  equipment: number,
  classBonus: number,
  potion: number,
): number | null => {
  if (!pets || pets.source == null) return null;
  const petBonus = pets.attributeBonuses[attribute];
  if (petBonus == null) return null;
  return Math.ceil(((base + equipment + classBonus + potion) * petBonus) / 100);
};

export const calculateSfPlayerAttributes = (
  attributes: Record<NormalizedAttributeKey, NormalizedPlayerAttribute>,
  options: {
    characterClass: number | null;
    items?: NormalizedPlayerItems;
    potions?: NormalizedPotions;
    pets?: NormalizedPets;
    fields: Record<string, NormalizedPlayerFieldMetadata>;
  },
): Record<NormalizedAttributeKey, NormalizedPlayerAttribute> => {
  const primaryAttribute = getPrimaryAttribute(options.characterClass);
  const calculated = { ...attributes };

  ATTRIBUTE_DEFINITIONS.forEach((definition) => {
    const current = { ...calculated[definition.key] };
    const base = current.base;
    const items = calculateItemBonus(options.items, definition.key);
    const upgrades = calculateUpgradeBonus(options.items, definition.key);
    const gems = calculateGemBonus(options.items, definition, options.characterClass, primaryAttribute);
    const equipment = items == null || gems == null ? null : items + gems;
    const itemsBase = items == null || upgrades == null ? null : items - upgrades;
    const classBonus =
      equipment == null || items == null
        ? null
        : options.characterClass === BATTLEMAGE_CLASS
          ? Math.ceil((equipment * 11) / 100)
          : options.characterClass === BERSERKER_CLASS
            ? Math.ceil((items * 11) / 100)
            : 0;
    const potion =
      base == null || classBonus == null || equipment == null
        ? null
        : calculatePotionBonus(options.potions, definition, base, classBonus, equipment);
    const pet =
      base == null || equipment == null || classBonus == null || potion == null
        ? null
        : calculatePetBonus(options.pets, definition.key, base, equipment, classBonus, potion);
    const total =
      base == null
        ? null
        : current.bonus != null && current.bonus > 0
          ? base + current.bonus
          : pet == null || potion == null || classBonus == null || equipment == null
            ? null
            : base + pet + potion + classBonus + equipment;

    const path = `attributes.${definition.key}`;
    markCalculated(options.fields, `${path}.items`, items);
    markCalculated(options.fields, `${path}.gems`, gems);
    markCalculated(options.fields, `${path}.upgrades`, upgrades);
    markCalculated(options.fields, `${path}.itemsBase`, itemsBase);
    markCalculated(options.fields, `${path}.equipment`, equipment);
    markCalculated(options.fields, `${path}.classBonus`, classBonus);
    markCalculated(options.fields, `${path}.potion`, potion);
    markCalculated(options.fields, `${path}.pet`, pet);
    markCalculated(options.fields, `${path}.total`, total);

    calculated[definition.key] = {
      ...current,
      items,
      gems,
      itemsBase,
      upgrades,
      equipment,
      classBonus,
      potion,
      pet,
      total,
    };
  });

  return calculated;
};
