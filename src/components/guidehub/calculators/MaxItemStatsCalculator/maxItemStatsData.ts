export const QUALITY_THRESHOLD = 350;

export const QUALITY_350_PLUS_BASE = {
  a: 0.001756211,
  b: 1.04214299,
};

export const LEGENDARY_QUALITY_ABOVE = {
  a: 0.00182949,
  b: 1.11599,
  c: 18.08035,
};

export const QUALITY_MULTIPLIERS = {
  normal1: { below: 2, above: 1.25 },
  normal2: { below: 2, above: 5 / 3 },
  epic3: { below: 1.2, above: 1 },
  epic5: { below: 1, above: 5 / 6 },
};

export const LEGENDARY_BELOW = {
  offset: 20,
  multiplier: 1.2,
};

export const LEGENDARY_QUALITY_OFFSET = 10;

export const THEORETICAL_QUALITY_BASE_OFFSET = 3;

export const ARMOR_TYPES = [
  { key: "light", label: "Light", multiplier: 3 },
  { key: "medium", label: "Medium", multiplier: 7.5 },
  { key: "heavy", label: "Heavy", multiplier: 15 },
] as const;

export type ArmorType = (typeof ARMOR_TYPES)[number]["key"];

export const WEAPON_TYPES = [
  { key: "melee", label: "Melee", multiplier: 1 },
  { key: "ranged", label: "Ranged", multiplier: 1.25 },
  { key: "magic", label: "Magic", multiplier: 2.25 },
] as const;

export type WeaponType = (typeof WEAPON_TYPES)[number]["key"];

export const WEAPON_BASE = {
  cap: 1000,
  baseOffset: 1,
  baseMultiplier: 2,
};
