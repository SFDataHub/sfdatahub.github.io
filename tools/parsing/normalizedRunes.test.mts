import assert from "node:assert/strict";

import { normalizeSfItem } from "../../src/lib/parsing/normalizedItem.ts";
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
  runeValue,
}: {
  type: number;
  picIndex?: number;
  damageMin?: number;
  damageMax?: number;
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
  runeValue ?? 0,
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
  runeValue,
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
  runeValue ?? 0,
  100,
  packLegacyTail(),
];

const fillCurrentSave = (save: unknown[], classId: number) => {
  save[1] = 1;
  save[3] = packLowerShort(100);
  save[4] = 1000;
  save[5] = 2000;
  save[6] = 3000;
  save[7] = 10;
  save[18] = packLowerShort(1);
  save[19] = 0;
  save[20] = packLowerShort(classId);
  [10, 10, 10, 10, 10].forEach((value, index) => {
    save[30 + index] = value;
  });
  [0, 0, 0, 0, 0].forEach((value, index) => {
    save[35 + index] = value;
  });
  [1, 2, 3, 4, 5].forEach((value, index) => {
    save[40 + index] = value;
  });
};

const fillLegacyOwnSave = (save: unknown[], classId: number) => {
  save[1] = 1;
  save[7] = packLowerShort(100);
  save[8] = 1000;
  save[9] = 2000;
  save[10] = 3000;
  save[11] = 10;
  save[27] = packLowerShort(1);
  save[28] = 0;
  save[29] = packLowerShort(classId);
  [10, 10, 10, 10, 10].forEach((value, index) => {
    save[30 + index] = value;
  });
  [0, 0, 0, 0, 0].forEach((value, index) => {
    save[35 + index] = value;
  });
  [1, 2, 3, 4, 5].forEach((value, index) => {
    save[40 + index] = value;
  });
};

{
  const expectedKinds = [
    "gold",
    "epicChance",
    "itemQuality",
    "xp",
    "health",
    "resistanceFire",
    "resistanceCold",
    "resistanceLightning",
    "resistanceAll",
    "damageFire",
    "damageCold",
    "damageLightning",
  ];

  expectedKinds.forEach((kind, index) => {
    const item = normalizeSfItem("modern19", modernItem({ type: 2, runeType: index + 1, runeValue: 7 }));
    assert.equal(item.rune.kind, kind);
    assert.equal(item.rune.value, 7);
  });

  const unknown = normalizeSfItem("modern19", modernItem({ type: 2, runeType: 13, runeValue: 7 }));
  assert.equal(unknown.rune.kind, "unknown");
  assert.equal(unknown.metadata.fields["rune.kind"]?.status, "invalid");
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave(save, 1);
  const equippedItems = Array.from({ length: 190 }, () => 0);
  equippedItems.splice(0, 19, ...modernItem({ type: 2, runeType: 1, runeValue: 30 }));
  equippedItems.splice(19, 19, ...modernItem({ type: 3, runeType: 1, runeValue: 30 }));
  equippedItems.splice(2 * 19, 19, ...modernItem({ type: 4, runeType: 2, runeValue: 60 }));
  equippedItems.splice(3 * 19, 19, ...modernItem({ type: 5, runeType: 3, runeValue: 7 }));
  equippedItems.splice(4 * 19, 19, ...modernItem({ type: 6, runeType: 4, runeValue: 20 }));
  equippedItems.splice(5 * 19, 19, ...modernItem({ type: 7, runeType: 5, runeValue: 20 }));
  equippedItems.splice(6 * 19, 19, ...modernItem({ type: 8, runeType: 6, runeValue: 90 }));
  equippedItems.splice(7 * 19, 19, ...modernItem({ type: 9, runeType: 9, runeValue: 60 }));
  equippedItems.splice(8 * 19, 19, ...modernItem({ type: 1, damageMin: 1, damageMax: 2, runeType: 11, runeValue: 70 }));
  equippedItems.splice(9 * 19, 19, ...modernItem({ type: 1, damageMin: 1, damageMax: 2, runeType: 10, runeValue: 50 }));

  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    equippedItems,
    prefix: "s1",
  });

  assert.equal(normalized.runes.gold, 50);
  assert.equal(normalized.runes.epicChance, 50);
  assert.equal(normalized.runes.itemQuality, 5);
  assert.equal(normalized.runes.xp, 10);
  assert.equal(normalized.runes.health, 15);
  assert.deepEqual(normalized.runes.damage, {
    total: 60,
    fire: 0,
    cold: 60,
    lightning: 0,
    secondary: { total: 0, fire: 0, cold: 0, lightning: 0 },
  });
  assert.deepEqual(normalized.runes.resistance, {
    total: 75,
    fire: 75,
    cold: 60,
    lightning: 60,
  });
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave(save, 4);
  const equippedItems = Array.from({ length: 190 }, () => 0);
  equippedItems.splice(8 * 19, 19, ...modernItem({ type: 1, damageMin: 1, damageMax: 2, runeType: 10, runeValue: 50 }));
  equippedItems.splice(9 * 19, 19, ...modernItem({ type: 1, damageMin: 1, damageMax: 2, runeType: 12, runeValue: 40 }));

  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    equippedItems,
    prefix: "s1",
  });

  assert.deepEqual(normalized.runes.damage, {
    total: 50,
    fire: 50,
    cold: 0,
    lightning: 0,
    secondary: { total: 40, fire: 0, cold: 0, lightning: 40 },
  });
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave(save, 1);
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    equippedItems: Array.from({ length: 190 }, () => 0),
    prefix: "s1",
  });

  assert.equal(normalized.runes.gold, 0);
  assert.equal(normalized.runes.xp, 0);
  assert.equal(normalized.runes.metadata.fields["runes.gold"]?.status, "available");
}

{
  const modernSave = Array.from({ length: 70 }, () => 0);
  fillCurrentSave(modernSave, 1);
  const modernItems = Array.from({ length: 190 }, () => 0);
  modernItems.splice(0, 19, ...modernItem({ type: 2, runeType: 4, runeValue: 7 }));

  const legacySave = Array.from({ length: 650 }, () => 0);
  fillLegacyOwnSave(legacySave, 1);
  legacySave.splice(48, 12, ...legacyItem({ type: 2, runeType: 4, runeValue: 7 }));

  const modern = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save: modernSave,
    equippedItems: modernItems,
    prefix: "s1",
  });
  const legacy = normalizeSfPlayerCharacterCore({
    own: 1,
    save: legacySave,
    prefix: "s1",
  });

  assert.equal(modern.runes.xp, 7);
  assert.equal(legacy.runes.xp, 7);
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave(save, 1);
  const equippedItems = Array.from({ length: 190 }, () => 0);
  equippedItems.splice(0, 19, ...modernItem({ type: 2, runeType: 13, runeValue: 5 }));
  equippedItems.splice(19, 19, ...modernItem({ type: 3, runeType: 1, runeValue: "bad" }));

  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    equippedItems,
    prefix: "s1",
  });

  assert.equal(normalized.runes.gold, 0);
  assert.equal(normalized.runes.metadata.fields["runes.unknownRune"]?.status, "invalid");
  assert.equal(normalized.runes.metadata.fields["runes.invalidRuneValue"]?.status, "invalid");
}

console.log("normalizedRunes.test.mts passed");
