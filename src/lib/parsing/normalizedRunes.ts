import type { NormalizedEquipmentSlotKey, NormalizedItem, NormalizedPlayerItems } from "./normalizedItem";
import type { NormalizedPlayerFieldMetadata, NormalizedPlayerFieldProvenance, NormalizedPlayerFieldStatus } from "./normalizedPlayer";

export type NormalizedPlayerRuneDamage = {
  total: number;
  fire: number;
  cold: number;
  lightning: number;
};

export type NormalizedPlayerRunes = {
  gold: number;
  xp: number;
  epicChance: number;
  itemQuality: number;
  health: number;
  damage: NormalizedPlayerRuneDamage & {
    secondary: NormalizedPlayerRuneDamage;
  };
  resistance: {
    total: number;
    fire: number;
    cold: number;
    lightning: number;
  };
  metadata: {
    fields: Record<string, NormalizedPlayerFieldMetadata>;
  };
};

const ASSASSIN_CLASS = 4;

const RUNE_CAPS = {
  gold: 50,
  epicChance: 50,
  itemQuality: 5,
  xp: 10,
  health: 15,
  resistanceElement: 75,
  resistanceTotal: 75,
  resistancePartContribution: 25,
  damage: 60,
};

const RUNE_FIELDS = [
  "runes.gold",
  "runes.xp",
  "runes.epicChance",
  "runes.itemQuality",
  "runes.health",
  "runes.damage.total",
  "runes.damage.fire",
  "runes.damage.cold",
  "runes.damage.lightning",
  "runes.damage.secondary.total",
  "runes.damage.secondary.fire",
  "runes.damage.secondary.cold",
  "runes.damage.secondary.lightning",
  "runes.resistance.total",
  "runes.resistance.fire",
  "runes.resistance.cold",
  "runes.resistance.lightning",
] as const;

const clamp = (value: number, max: number) => Math.min(max, value);

const mark = (
  fields: Record<string, NormalizedPlayerFieldMetadata>,
  path: string,
  status: NormalizedPlayerFieldStatus,
  provenance?: NormalizedPlayerFieldProvenance,
) => {
  fields[path] = provenance ? { status, provenance } : { status };
};

const markRuneFields = (
  fields: Record<string, NormalizedPlayerFieldMetadata>,
  status: NormalizedPlayerFieldStatus,
  provenance?: NormalizedPlayerFieldProvenance,
) => {
  RUNE_FIELDS.forEach((field) => mark(fields, field, status, provenance));
};

const createEmptyRunes = (): NormalizedPlayerRunes => ({
  gold: 0,
  xp: 0,
  epicChance: 0,
  itemQuality: 0,
  health: 0,
  damage: {
    total: 0,
    fire: 0,
    cold: 0,
    lightning: 0,
    secondary: {
      total: 0,
      fire: 0,
      cold: 0,
      lightning: 0,
    },
  },
  resistance: {
    total: 0,
    fire: 0,
    cold: 0,
    lightning: 0,
  },
  metadata: {
    fields: {},
  },
});

const isWeaponSlot = (slot: NormalizedEquipmentSlotKey | null): slot is "weapon1" | "weapon2" =>
  slot === "weapon1" || slot === "weapon2";

const addWeaponDamageRune = (target: NormalizedPlayerRuneDamage, item: NormalizedItem, value: number) => {
  if (item.rune.kind !== "damageFire" && item.rune.kind !== "damageCold" && item.rune.kind !== "damageLightning") return;

  target.total += value;
  if (item.rune.kind === "damageFire") target.fire = value;
  if (item.rune.kind === "damageCold") target.cold = value;
  if (item.rune.kind === "damageLightning") target.lightning = value;
};

export const calculateSfPlayerRunes = (
  items: NormalizedPlayerItems | undefined,
  options: {
    characterClass?: number | null;
  } = {},
): NormalizedPlayerRunes => {
  const runes = createEmptyRunes();
  const fields = runes.metadata.fields;
  const equipped = items?.equipped;

  if (!equipped) {
    markRuneFields(fields, "missing");
    return runes;
  }

  markRuneFields(fields, "available", "calculated");

  let resistanceFirePart = 0;
  let resistanceColdPart = 0;
  let resistanceLightningPart = 0;
  let resistanceAll = 0;

  Object.values(equipped.slots).forEach((item) => {
    if (!item?.rune.hasRune) return;

    if (item.rune.kind == null || item.rune.kind === "unknown") {
      mark(fields, "runes.unknownRune", "invalid", "derived");
      return;
    }

    if (item.rune.value == null) {
      mark(fields, "runes.invalidRuneValue", "invalid", "derived");
      return;
    }

    const value = item.rune.value;

    if (isWeaponSlot(item.slot) && item.type === 1) {
      if (item.slot === "weapon1") {
        addWeaponDamageRune(runes.damage, item, value);
      } else if (item.slot === "weapon2" && options.characterClass === ASSASSIN_CLASS) {
        addWeaponDamageRune(runes.damage.secondary, item, value);
      }
      return;
    }

    if (item.type === 1) return;

    if (item.rune.kind === "gold") runes.gold += value;
    if (item.rune.kind === "epicChance") runes.epicChance += value;
    if (item.rune.kind === "itemQuality") runes.itemQuality += value;
    if (item.rune.kind === "xp") runes.xp += value;
    if (item.rune.kind === "health") runes.health += value;
    if (item.rune.kind === "resistanceFire") {
      runes.resistance.fire += value;
      resistanceFirePart += value;
    }
    if (item.rune.kind === "resistanceCold") {
      runes.resistance.cold += value;
      resistanceColdPart += value;
    }
    if (item.rune.kind === "resistanceLightning") {
      runes.resistance.lightning += value;
      resistanceLightningPart += value;
    }
    if (item.rune.kind === "resistanceAll") {
      runes.resistance.fire += value;
      runes.resistance.cold += value;
      runes.resistance.lightning += value;
      resistanceAll += value;
    }
  });

  runes.gold = clamp(runes.gold, RUNE_CAPS.gold);
  runes.epicChance = clamp(runes.epicChance, RUNE_CAPS.epicChance);
  runes.itemQuality = clamp(runes.itemQuality, RUNE_CAPS.itemQuality);
  runes.xp = clamp(runes.xp, RUNE_CAPS.xp);
  runes.health = clamp(runes.health, RUNE_CAPS.health);

  runes.resistance.fire = clamp(runes.resistance.fire, RUNE_CAPS.resistanceElement);
  runes.resistance.cold = clamp(runes.resistance.cold, RUNE_CAPS.resistanceElement);
  runes.resistance.lightning = clamp(runes.resistance.lightning, RUNE_CAPS.resistanceElement);
  runes.resistance.total = clamp(
    resistanceAll +
      clamp(Math.trunc(resistanceFirePart / 3), RUNE_CAPS.resistancePartContribution) +
      clamp(Math.trunc(resistanceColdPart / 3), RUNE_CAPS.resistancePartContribution) +
      clamp(Math.trunc(resistanceLightningPart / 3), RUNE_CAPS.resistancePartContribution),
    RUNE_CAPS.resistanceTotal,
  );

  runes.damage.total = clamp(runes.damage.total, RUNE_CAPS.damage);
  runes.damage.fire = clamp(runes.damage.fire, RUNE_CAPS.damage);
  runes.damage.cold = clamp(runes.damage.cold, RUNE_CAPS.damage);
  runes.damage.lightning = clamp(runes.damage.lightning, RUNE_CAPS.damage);
  runes.damage.secondary.total = clamp(runes.damage.secondary.total, RUNE_CAPS.damage);
  runes.damage.secondary.fire = clamp(runes.damage.secondary.fire, RUNE_CAPS.damage);
  runes.damage.secondary.cold = clamp(runes.damage.secondary.cold, RUNE_CAPS.damage);
  runes.damage.secondary.lightning = clamp(runes.damage.secondary.lightning, RUNE_CAPS.damage);

  return runes;
};
