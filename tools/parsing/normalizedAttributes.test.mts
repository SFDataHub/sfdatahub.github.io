import assert from "node:assert/strict";

import { normalizeSfPlayerCharacterCore } from "../../src/lib/parsing/normalizedPlayer.ts";

const packLowerShort = (low: number, high = 0): number => low + (high << 16);
const packLegacyHeader = (type: number, socket: number, enchantment = 0): number =>
  type + (socket << 16) + (enchantment << 24);
const packLegacyTail = (coins = 0, upgrades = 0, socketPower = 0): number =>
  coins + (upgrades << 8) + (socketPower << 16);

const modernItem = ({
  type,
  socket = 0,
  picIndex,
  damageMin = 0,
  damageMax = 0,
  attributeTypes,
  attributeValues,
  upgrades = 0,
  socketPower = 0,
}: {
  type: number;
  socket?: number;
  picIndex: number;
  damageMin?: number;
  damageMax?: number;
  attributeTypes: [number, number, number];
  attributeValues: [number, number, number];
  upgrades?: number;
  socketPower?: number;
}) => [
  type,
  socket,
  0,
  picIndex,
  0,
  damageMin,
  damageMax,
  ...attributeTypes,
  ...attributeValues,
  100,
  0,
  upgrades,
  socketPower,
  1,
  0,
];

const legacyItem = ({
  type,
  socket = 0,
  picIndex,
  damageMin = 0,
  damageMax = 0,
  attributeTypes,
  attributeValues,
  upgrades = 0,
  socketPower = 0,
}: {
  type: number;
  socket?: number;
  picIndex: number;
  damageMin?: number;
  damageMax?: number;
  attributeTypes: [number, number, number];
  attributeValues: [number, number, number];
  upgrades?: number;
  socketPower?: number;
}) => [
  packLegacyHeader(type, socket),
  packLowerShort(picIndex),
  damageMin,
  damageMax,
  ...attributeTypes,
  ...attributeValues,
  100,
  packLegacyTail(0, upgrades, socketPower),
];

const fillCurrentSave = (save: unknown[], classId: number, bases = [100, 110, 120, 130, 140], bonuses = [0, 0, 0, 0, 0]) => {
  save[1] = 1;
  save[3] = packLowerShort(100);
  save[4] = 1000;
  save[5] = 2000;
  save[6] = 3000;
  save[7] = 10;
  save[18] = packLowerShort(1);
  save[19] = 0;
  save[20] = packLowerShort(classId);
  bases.forEach((value, index) => {
    save[30 + index] = value;
  });
  bonuses.forEach((value, index) => {
    save[35 + index] = value;
  });
  [1, 2, 3, 4, 5].forEach((value, index) => {
    save[40 + index] = value;
  });
};

const fillLegacyOwnSave = (save: unknown[], classId: number, bases = [100, 0, 0, 0, 0]) => {
  save[1] = 1;
  save[7] = packLowerShort(100);
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

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave(save, 5);
  const equippedItems = Array.from({ length: 190 }, () => 0);
  equippedItems.splice(
    0,
    19,
    ...modernItem({
      type: 2,
      socket: 11,
      picIndex: 51,
      attributeTypes: [1, 0, 0],
      attributeValues: [103, 0, 0],
      upgrades: 2,
      socketPower: 10,
    }),
  );
  equippedItems.splice(
    19,
    19,
    ...modernItem({
      type: 3,
      socket: 16,
      picIndex: 52,
      attributeTypes: [6, 0, 0],
      attributeValues: [5, 0, 0],
      socketPower: 20,
    }),
  );
  equippedItems.splice(
    3 * 19,
    19,
    ...modernItem({
      type: 4,
      picIndex: 53,
      attributeTypes: [1, 4, 5],
      attributeValues: [7, 6, 6],
    }),
  );
  equippedItems.splice(
    8 * 19,
    19,
    ...modernItem({
      type: 1,
      socket: 12,
      picIndex: 54,
      damageMin: 10,
      damageMax: 20,
      attributeTypes: [2, 0, 0],
      attributeValues: [40, 0, 0],
      socketPower: 8,
    }),
  );

  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    equippedItems,
    potions: [0, 1, 2, 16, 0, 0, 0, 10, 20, 25],
    pets: [0, 1, 2, 3, 4, 5],
    prefix: "s1",
    name: "Attribute Aggregation",
  });

  assert.deepEqual(
    (({ base, items, gems, itemsBase, upgrades, equipment, classBonus, potion, pet, total }) => ({
      base,
      items,
      gems,
      itemsBase,
      upgrades,
      equipment,
      classBonus,
      potion,
      pet,
      total,
    }))(normalized.attributes.strength),
    {
      base: 100,
      items: 115,
      gems: 20,
      itemsBase: 109,
      upgrades: 6,
      equipment: 135,
      classBonus: 15,
      potion: 25,
      pet: 14,
      total: 289,
    },
  );
  assert.deepEqual(
    (({ base, items, gems, equipment, classBonus, potion, pet, total }) => ({
      base,
      items,
      gems,
      equipment,
      classBonus,
      potion,
      pet,
      total,
    }))(normalized.attributes.dexterity),
    { base: 110, items: 45, gems: 10, equipment: 55, classBonus: 7, potion: 35, pet: 5, total: 212 },
  );
  assert.equal(normalized.attributes.intelligence.gems, 16);
  assert.equal(normalized.attributes.intelligence.total, 149);
  assert.equal(normalized.attributes.constitution.gems, 20);
  assert.equal(normalized.attributes.constitution.total, 168);
  assert.equal(normalized.attributes.luck.gems, 0);
  assert.equal(normalized.attributes.luck.total, 161);
  assert.equal(normalized.metadata.fields["attributes.strength.total"]?.provenance, "calculated");
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave(save, 4, [100, 100, 100, 100, 100]);
  const equippedItems = Array.from({ length: 190 }, () => 0);
  equippedItems.splice(
    8 * 19,
    19,
    ...modernItem({
      type: 1,
      socket: 11,
      picIndex: 1,
      attributeTypes: [0, 0, 0],
      attributeValues: [0, 0, 0],
      socketPower: 8,
    }),
  );
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    equippedItems,
    potions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    pets: [0, 0, 0, 0, 0, 0],
    prefix: "s1",
  });

  assert.equal(normalized.attributes.dexterity.gems, 8);
  assert.equal(normalized.attributes.dexterity.equipment, 8);
  assert.equal(normalized.attributes.dexterity.total, 108);
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave(save, 1, [100, 0, 0, 0, 0], [50, 0, 0, 0, 0]);
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    equippedItems: Array.from({ length: 190 }, () => 0),
    potions: [0, 1, 0, 0, 0, 0, 0, 25, 0, 0],
    pets: [0, 10, 10, 10, 10, 10],
    prefix: "s1",
  });

  assert.equal(normalized.attributes.strength.total, 150);
  assert.equal(normalized.attributes.strength.potion, 25);
  assert.equal(normalized.attributes.strength.pet, 13);
}

{
  const modernSave = Array.from({ length: 70 }, () => 0);
  fillCurrentSave(modernSave, 1, [100, 0, 0, 0, 0]);
  const modernItems = Array.from({ length: 190 }, () => 0);
  modernItems.splice(
    0,
    19,
    ...modernItem({
      type: 2,
      picIndex: 1,
      attributeTypes: [1, 0, 0],
      attributeValues: [50, 0, 0],
    }),
  );

  const legacySave = Array.from({ length: 650 }, () => 0);
  fillLegacyOwnSave(legacySave, 1, [100, 0, 0, 0, 0]);
  legacySave.splice(
    48,
    12,
    ...legacyItem({
      type: 2,
      picIndex: 1,
      attributeTypes: [1, 0, 0],
      attributeValues: [50, 0, 0],
    }),
  );

  const modern = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save: modernSave,
    equippedItems: modernItems,
    potions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    pets: [0, 0, 0, 0, 0, 0],
    prefix: "s1",
  });
  const legacy = normalizeSfPlayerCharacterCore({
    own: 1,
    save: legacySave,
    pets: [0, 0, 0, 0, 0, 0],
    prefix: "s1",
  });

  assert.equal(modern.attributes.strength.items, legacy.attributes.strength.items);
  assert.equal(modern.attributes.strength.equipment, legacy.attributes.strength.equipment);
  assert.equal(modern.attributes.strength.total, legacy.attributes.strength.total);
}

console.log("normalizedAttributes.test.mts passed");
