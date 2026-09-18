import type { NormalizedPotions } from "./normalizedConsumables";
import type { NormalizedPlayerItems } from "./normalizedItem";
import type {
  NormalizedPlayerAttribute,
  NormalizedPlayerFieldMetadata,
  NormalizedPlayerFieldProvenance,
  NormalizedPlayerFieldStatus,
} from "./normalizedPlayer";
import type { NormalizedPlayerRunes } from "./normalizedRunes";

export type NormalizedCombatDamageRange = {
  min: number | null;
  max: number | null;
};

export type NormalizedPlayerCombat = {
  source: {
    armor: number | null;
    damage: NormalizedCombatDamageRange;
  };
  armor: number | null;
  damage: NormalizedCombatDamageRange & {
    secondary?: NormalizedCombatDamageRange;
  };
  health: number | null;
};

type AttributeKey = "strength" | "dexterity" | "intelligence";

type ClassCombatConfig = {
  primaryAttribute: AttributeKey;
  healthMultiplier: number;
  weaponMultiplier: number;
};

const ASSASSIN_CLASS = 4;

const CLASS_CONFIG: Record<number, ClassCombatConfig> = {
  1: { primaryAttribute: "strength", healthMultiplier: 5, weaponMultiplier: 2 },
  2: { primaryAttribute: "intelligence", healthMultiplier: 2, weaponMultiplier: 4.5 },
  3: { primaryAttribute: "dexterity", healthMultiplier: 4, weaponMultiplier: 2.5 },
  4: { primaryAttribute: "dexterity", healthMultiplier: 4, weaponMultiplier: 2 },
  5: { primaryAttribute: "strength", healthMultiplier: 5, weaponMultiplier: 2 },
  6: { primaryAttribute: "strength", healthMultiplier: 4, weaponMultiplier: 2 },
  7: { primaryAttribute: "dexterity", healthMultiplier: 4, weaponMultiplier: 2.5 },
  8: { primaryAttribute: "intelligence", healthMultiplier: 5, weaponMultiplier: 4.5 },
  9: { primaryAttribute: "intelligence", healthMultiplier: 2, weaponMultiplier: 4.5 },
  10: { primaryAttribute: "intelligence", healthMultiplier: 4, weaponMultiplier: 4.5 },
  11: { primaryAttribute: "strength", healthMultiplier: 6, weaponMultiplier: 2 },
  12: { primaryAttribute: "dexterity", healthMultiplier: 4, weaponMultiplier: 2 },
};

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
  status: NormalizedPlayerFieldStatus = value == null ? "missing" : "available",
) => {
  mark(fields, path, status, status === "available" ? "calculated" : undefined);
};

const getEquipmentItems = (items: NormalizedPlayerItems | undefined) =>
  items?.equipped ? Object.values(items.equipped.slots) : null;

const calculateArmor = (
  items: NormalizedPlayerItems | undefined,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  const equipped = getEquipmentItems(items);
  if (!equipped) {
    mark(fields, "combat.armor", "missing");
    return null;
  }

  let invalid = false;
  const armor = equipped.reduce((total, item) => {
    if ((item.type ?? 0) <= 1) return total;
    if (item.armor == null) {
      invalid = true;
      return total;
    }
    return total + item.armor;
  }, 0);

  mark(fields, "combat.armor", invalid ? "invalid" : "available", invalid ? undefined : "calculated");
  return invalid ? null : armor;
};

const getBaseWeaponDamage = (
  level: number,
  config: ClassCombatConfig,
  characterClass: number | null,
  secondary = false,
): { min: number; max: number } => {
  if (level <= 10) return { min: 1, max: 2 };

  const multiplier = characterClass === ASSASSIN_CLASS ? (secondary ? 1.25 : 0.875) : 0.7;
  const num = multiplier * (level - 9) * config.weaponMultiplier;

  return {
    min: Math.max(1, Math.ceil((num * 2) / 3)),
    max: Math.max(2, Math.round((num * 4) / 3)),
  };
};

const getWeaponRange = (
  items: NormalizedPlayerItems | undefined,
  slot: "weapon1" | "weapon2",
  level: number,
  config: ClassCombatConfig,
  characterClass: number | null,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): { min: number; max: number } | null => {
  const item = items?.equipped?.slots[slot];
  const fallback = getBaseWeaponDamage(level, config, characterClass, slot === "weapon2");

  if (!item) {
    mark(fields, `combat.damage.${slot}`, "available", "calculated");
    return fallback;
  }

  if (item.damage == null || item.damage.min == null || item.damage.max == null) {
    mark(fields, `combat.damage.${slot}`, "invalid");
    return null;
  }

  mark(fields, `combat.damage.${slot}`, "available", "calculated");
  return item.damage.min >= fallback.min || item.damage.max >= fallback.max
    ? { min: item.damage.min, max: item.damage.max }
    : fallback;
};

const calculateDamageRange = (
  weapon: { min: number; max: number },
  primaryAttributeTotal: number,
  runeDamage: number,
): { min: number; max: number } => {
  const multiplier = (1 + primaryAttributeTotal / 10) * (1 + runeDamage / 100);
  return {
    min: Math.floor(weapon.min * multiplier),
    max: Math.ceil(weapon.max * multiplier),
  };
};

const calculateHealth = (
  constitutionTotal: number | null,
  level: number | null,
  config: ClassCombatConfig | null,
  potions: NormalizedPotions | undefined,
  runes: NormalizedPlayerRunes | undefined,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  if (constitutionTotal == null || level == null || config == null || !runes) {
    mark(fields, "combat.health", "missing");
    return null;
  }

  const lifePotionSize = potions?.life.active ? (potions.life.size ?? 25) : 0;
  const base = Math.floor(constitutionTotal * config.healthMultiplier * (level + 1));
  const withLifePotion = Math.floor(base * (1 + lifePotionSize / 100));
  const health = Math.trunc(withLifePotion * (1 + runes.health / 100));

  mark(fields, "combat.health", "available", "calculated");
  return health;
};

export const calculateSfPlayerCombat = (options: {
  characterClass: number | null;
  level: number | null;
  source: NormalizedPlayerCombat["source"];
  attributes: {
    strength: NormalizedPlayerAttribute;
    dexterity: NormalizedPlayerAttribute;
    intelligence: NormalizedPlayerAttribute;
    constitution: NormalizedPlayerAttribute;
  };
  items?: NormalizedPlayerItems;
  potions?: NormalizedPotions;
  runes?: NormalizedPlayerRunes;
  fields: Record<string, NormalizedPlayerFieldMetadata>;
}): NormalizedPlayerCombat => {
  const config = options.characterClass == null ? null : CLASS_CONFIG[options.characterClass] ?? null;
  const primaryTotal = config == null ? null : options.attributes[config.primaryAttribute].total;
  const armor = calculateArmor(options.items, options.fields);
  const health = calculateHealth(
    options.attributes.constitution.total,
    options.level,
    config,
    options.potions,
    options.runes,
    options.fields,
  );
  const damage: NormalizedPlayerCombat["damage"] = { min: null, max: null };

  if (options.level == null || config == null || primaryTotal == null || !options.runes) {
    markCalculated(options.fields, "combat.damage.min", null);
    markCalculated(options.fields, "combat.damage.max", null);
  } else {
    const weapon1 = getWeaponRange(options.items, "weapon1", options.level, config, options.characterClass, options.fields);
    if (weapon1) {
      const primary = calculateDamageRange(weapon1, primaryTotal, options.runes.damage.total);
      damage.min = primary.min;
      damage.max = primary.max;
      markCalculated(options.fields, "combat.damage.min", damage.min);
      markCalculated(options.fields, "combat.damage.max", damage.max);
    } else {
      markCalculated(options.fields, "combat.damage.min", null, "invalid");
      markCalculated(options.fields, "combat.damage.max", null, "invalid");
    }
  }

  if (options.characterClass === ASSASSIN_CLASS) {
    damage.secondary = { min: null, max: null };

    if (options.level == null || config == null || primaryTotal == null || !options.runes) {
      markCalculated(options.fields, "combat.damage.secondary.min", null);
      markCalculated(options.fields, "combat.damage.secondary.max", null);
    } else {
      const weapon2 = getWeaponRange(options.items, "weapon2", options.level, config, options.characterClass, options.fields);
      if (weapon2) {
        const secondary = calculateDamageRange(weapon2, primaryTotal, options.runes.damage.secondary.total);
        damage.secondary.min = secondary.min;
        damage.secondary.max = secondary.max;
        markCalculated(options.fields, "combat.damage.secondary.min", damage.secondary.min);
        markCalculated(options.fields, "combat.damage.secondary.max", damage.secondary.max);
      } else {
        markCalculated(options.fields, "combat.damage.secondary.min", null, "invalid");
        markCalculated(options.fields, "combat.damage.secondary.max", null, "invalid");
      }
    }
  }

  return {
    source: options.source,
    armor,
    damage,
    health,
  };
};
