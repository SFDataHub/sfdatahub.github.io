import assert from "node:assert/strict";

import { normalizeSfPlayerCharacterCore } from "../../src/lib/parsing/normalizedPlayer.ts";

const packLowerShort = (low: number, high = 0): number => low + (high << 16);
const packLegacyHeader = (type: number, socket = 0, enchantment = 0): number =>
  type + (socket << 16) + (enchantment << 24);
const packLegacyTail = (coins = 0, upgrades = 0, socketPower = 0): number =>
  coins + (upgrades << 8) + (socketPower << 16);

const modernItem = ({
  type,
  picIndex = 1,
  damageMin = 0,
  damageMax = 0,
  runeType,
  runeValue = 0,
}: {
  type: number;
  picIndex?: number;
  damageMin?: unknown;
  damageMax?: unknown;
  runeType?: number;
  runeValue?: unknown;
}) => [
  type,
  0,
  0,
  picIndex,
  0,
  damageMin,
  damageMax,
  0,
  0,
  runeType == null ? 0 : 30 + runeType,
  0,
  0,
  runeValue,
  100,
  0,
  0,
  0,
  1,
  0,
];

const legacyItem = ({
  type,
  picIndex = 1,
  damageMin = 0,
  damageMax = 0,
  runeType,
  runeValue = 0,
}: {
  type: number;
  picIndex?: number;
  damageMin?: number;
  damageMax?: number;
  runeType?: number;
  runeValue?: number;
}) => [
  packLegacyHeader(type),
  packLowerShort(picIndex),
  damageMin,
  damageMax,
  0,
  0,
  runeType == null ? 0 : 30 + runeType,
  0,
  0,
  runeValue,
  100,
  packLegacyTail(),
];

const fillCurrentSave = ({
  save,
  classId,
  level,
  bases,
  sourceArmor = 0,
  sourceDamageMin = 0,
  sourceDamageMax = 0,
}: {
  save: unknown[];
  classId: number;
  level: number;
  bases: [number, number, number, number, number];
  sourceArmor?: number;
  sourceDamageMin?: number;
  sourceDamageMax?: number;
}) => {
  save[1] = 1;
  save[3] = packLowerShort(level);
  save[4] = 1000;
  save[5] = 2000;
  save[6] = 3000;
  save[7] = 10;
  save[18] = packLowerShort(1);
  save[19] = 0;
  save[20] = packLowerShort(classId);
  save[23] = sourceArmor;
  save[24] = sourceDamageMin;
  save[25] = sourceDamageMax;
  bases.forEach((value, index) => {
    save[30 + index] = value;
  });
  [0, 0, 0, 0, 0].forEach((value, index) => {
    save[35 + index] = value;
  });
  [1, 2, 3, 4, 5].forEach((value, index) => {
    save[40 + index] = value;
  });
};

const fillLegacyOwnSave = ({
  save,
  classId,
  level,
  bases,
}: {
  save: unknown[];
  classId: number;
  level: number;
  bases: [number, number, number, number, number];
}) => {
  save[1] = 1;
  save[7] = packLowerShort(level);
  save[8] = 1000;
  save[9] = 2000;
  save[10] = 3000;
  save[11] = 10;
  save[27] = packLowerShort(1);
  save[28] = 0;
  save[29] = packLowerShort(classId);
  bases.forEach((value, index) => {
    save[30 + index] = value;
  });
  [0, 0, 0, 0, 0].forEach((value, index) => {
    save[35 + index] = value;
  });
  [1, 2, 3, 4, 5].forEach((value, index) => {
    save[40 + index] = value;
  });
};

const emptyPotions = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const emptyPets = [0, 0, 0, 0, 0, 0];

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave({
    save,
    classId: 1,
    level: 20,
    bases: [20, 0, 0, 13, 0],
    sourceArmor: 999,
    sourceDamageMin: 1,
    sourceDamageMax: 2,
  });
  const equippedItems = Array.from({ length: 190 }, () => 0);
  equippedItems.splice(0, 19, ...modernItem({ type: 2, damageMin: 100 }));
  equippedItems.splice(19, 19, ...modernItem({ type: 3, damageMin: 200 }));
  equippedItems.splice(8 * 19, 19, ...modernItem({ type: 1, damageMin: 10, damageMax: 20, runeType: 10, runeValue: 10 }));
  equippedItems.splice(9 * 19, 19, ...modernItem({ type: 8, damageMin: 50 }));

  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    equippedItems,
    potions: emptyPotions,
    pets: emptyPets,
    prefix: "s1",
  });

  assert.deepEqual(normalized.combat.source, { armor: 999, damage: { min: 1, max: 2 } });
  assert.equal(normalized.combat.armor, 350);
  assert.deepEqual(normalized.combat.damage, { min: 36, max: 70 });
  assert.equal(normalized.combat.health, 1365);
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave({ save, classId: 4, level: 20, bases: [0, 30, 0, 10, 0] });
  const equippedItems = Array.from({ length: 190 }, () => 0);
  equippedItems.splice(8 * 19, 19, ...modernItem({ type: 1, damageMin: 20, damageMax: 30 }));
  equippedItems.splice(9 * 19, 19, ...modernItem({ type: 1, damageMin: 40, damageMax: 50, runeType: 12, runeValue: 20 }));

  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    equippedItems,
    potions: emptyPotions,
    pets: emptyPets,
    prefix: "s1",
  });

  assert.deepEqual(normalized.combat.damage, {
    min: 80,
    max: 120,
    secondary: { min: 192, max: 240 },
  });
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave({ save, classId: 4, level: 20, bases: [0, 30, 0, 10, 0] });
  const equippedItems = Array.from({ length: 190 }, () => 0);
  equippedItems.splice(8 * 19, 19, ...modernItem({ type: 1, damageMin: 8, damageMax: 12 }));

  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    equippedItems,
    potions: emptyPotions,
    pets: emptyPets,
    prefix: "s1",
  });

  assert.deepEqual(normalized.combat.damage.secondary, { min: 76, max: 148 });
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave({ save, classId: 1, level: 20, bases: [20, 0, 0, 10, 0] });
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    equippedItems: Array.from({ length: 190 }, () => 0),
    potions: emptyPotions,
    pets: emptyPets,
    prefix: "s1",
  });

  assert.deepEqual(normalized.combat.damage, { min: 33, max: 63 });
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave({ save, classId: 1, level: 20, bases: [10, 0, 0, 13, 0] });
  const equippedItems = Array.from({ length: 190 }, () => 0);
  equippedItems.splice(0, 19, ...modernItem({ type: 2, runeType: 5, runeValue: 15 }));

  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    equippedItems,
    potions: [0, 16, 0, 0, 0, 0, 0, 25, 0, 0],
    pets: emptyPets,
    prefix: "s1",
  });

  assert.equal(normalized.runes.health, 15);
  assert.equal(normalized.potions?.life.size, 25);
  assert.equal(normalized.combat.health, 1961);
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave({ save, classId: 11, level: 20, bases: [10, 0, 0, 13, 0] });
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    equippedItems: Array.from({ length: 190 }, () => 0),
    potions: emptyPotions,
    pets: emptyPets,
    prefix: "s1",
  });

  assert.equal(normalized.combat.health, 1638);
}

{
  const modernSave = Array.from({ length: 70 }, () => 0);
  fillCurrentSave({ save: modernSave, classId: 1, level: 20, bases: [20, 0, 0, 13, 0] });
  const modernItems = Array.from({ length: 190 }, () => 0);
  modernItems.splice(0, 19, ...modernItem({ type: 2, damageMin: 123 }));
  modernItems.splice(8 * 19, 19, ...modernItem({ type: 1, damageMin: 10, damageMax: 20 }));

  const legacySave = Array.from({ length: 650 }, () => 0);
  fillLegacyOwnSave({ save: legacySave, classId: 1, level: 20, bases: [20, 0, 0, 13, 0] });
  legacySave.splice(48, 12, ...legacyItem({ type: 2, damageMin: 123 }));
  legacySave.splice(48 + 8 * 12, 12, ...legacyItem({ type: 1, damageMin: 10, damageMax: 20 }));

  const modern = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save: modernSave,
    equippedItems: modernItems,
    potions: emptyPotions,
    pets: emptyPets,
    prefix: "s1",
  });
  const legacy = normalizeSfPlayerCharacterCore({
    own: 1,
    save: legacySave,
    pets: emptyPets,
    prefix: "s1",
  });

  assert.deepEqual(modern.combat.damage, legacy.combat.damage);
  assert.equal(modern.combat.armor, legacy.combat.armor);
  assert.equal(modern.combat.health, legacy.combat.health);
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave({ save, classId: 1, level: 20, bases: [20, 0, 0, 13, 0] });
  const equippedItems = Array.from({ length: 190 }, () => 0);
  equippedItems.splice(8 * 19, 19, ...modernItem({ type: 1, damageMin: "bad", damageMax: 20 }));

  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    equippedItems,
    potions: emptyPotions,
    pets: emptyPets,
    prefix: "s1",
  });

  assert.deepEqual(normalized.combat.damage, { min: null, max: null });
  assert.equal(normalized.metadata.fields["combat.damage.weapon1"]?.status, "invalid");
  assert.equal(normalized.metadata.fields["combat.damage.min"]?.status, "invalid");
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave({ save, classId: 1, level: 20, bases: [20, 0, 0, 0, 0] });
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    equippedItems: Array.from({ length: 190 }, () => 0),
    potions: emptyPotions,
    pets: emptyPets,
    prefix: "s1",
  });

  assert.equal(normalized.combat.health, 0);
  assert.equal(normalized.metadata.fields["combat.health"]?.status, "available");
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave({ save, classId: 1, level: 20, bases: [20, 0, 0, 13, 0] });
  delete save[30 + 3];
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    equippedItems: Array.from({ length: 190 }, () => 0),
    potions: emptyPotions,
    pets: emptyPets,
    prefix: "s1",
  });

  assert.equal(normalized.combat.health, null);
  assert.equal(normalized.metadata.fields["combat.health"]?.status, "missing");
}

console.log("normalizedCombat.test.mts passed");
