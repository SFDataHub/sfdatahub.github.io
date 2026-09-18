import assert from "node:assert/strict";

import { normalizeSfItem, normalizeSfPlayerItems } from "../../src/lib/parsing/normalizedItem.ts";
import { normalizeSfPlayerCharacterCore } from "../../src/lib/parsing/normalizedPlayer.ts";

const packLowerShort = (low: number, high = 0): number => low + (high << 16);
const packLegacyHeader = (type: number, socket: number, enchantment: number): number =>
  type + (socket << 16) + (enchantment << 24);
const packLegacyTail = (coins: number, upgrades: number, socketPower: number): number =>
  coins + (upgrades << 8) + (socketPower << 16);

const modernItem = ({
  type,
  socket = 0,
  enchantment = 0,
  picIndex,
  damageMin,
  damageMax,
  attributeTypes,
  attributeValues,
  gold = 0,
  mushrooms = 0,
  upgrades = 0,
  socketPower = 0,
  itemLevel = 0,
}: {
  type: number;
  socket?: number;
  enchantment?: number;
  picIndex: number;
  damageMin: number;
  damageMax: number;
  attributeTypes: [number, number, number];
  attributeValues: [number, number, number];
  gold?: number;
  mushrooms?: number;
  upgrades?: number;
  socketPower?: number;
  itemLevel?: number;
}) => [
  type,
  socket,
  enchantment,
  picIndex,
  0,
  damageMin,
  damageMax,
  ...attributeTypes,
  ...attributeValues,
  gold,
  mushrooms,
  upgrades,
  socketPower,
  itemLevel,
  0,
];

const legacyItem = ({
  type,
  socket = 0,
  enchantment = 0,
  picIndex,
  damageMin,
  damageMax,
  attributeTypes,
  attributeValues,
  gold = 0,
  mushrooms = 0,
  upgrades = 0,
  socketPower = 0,
}: {
  type: number;
  socket?: number;
  enchantment?: number;
  picIndex: number;
  damageMin: number;
  damageMax: number;
  attributeTypes: [number, number, number];
  attributeValues: [number, number, number];
  gold?: number;
  mushrooms?: number;
  upgrades?: number;
  socketPower?: number;
}) => [
  packLegacyHeader(type, socket, enchantment),
  packLowerShort(picIndex, 999),
  damageMin,
  damageMax,
  ...attributeTypes,
  ...attributeValues,
  gold,
  packLegacyTail(mushrooms, upgrades, socketPower),
];

const fillCharacterCore = (save: unknown[], classIndex: number, classId: number) => {
  save[1] = 1;
  save[3] = packLowerShort(100);
  save[4] = 1000;
  save[5] = 2000;
  save[6] = 3000;
  save[7] = 10;
  save[18] = packLowerShort(1);
  save[19] = 0;
  save[classIndex] = packLowerShort(classId);
};

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCharacterCore(save, 20, 4);
  save[48] = packLegacyHeader(9, 0, 0);
  const equippedItems = Array.from({ length: 190 }, () => 0);
  equippedItems.splice(
    0,
    19,
    ...modernItem({
      type: 2,
      socket: 12,
      enchantment: 4,
      picIndex: 1055,
      damageMin: 321,
      damageMax: 0,
      attributeTypes: [1, 6, 35],
      attributeValues: [100, 25, 7],
      gold: 12345,
      mushrooms: 2,
      upgrades: 3,
      socketPower: 50,
      itemLevel: 200,
    }),
  );
  equippedItems.splice(
    8 * 19,
    19,
    ...modernItem({
      type: 1,
      picIndex: 5,
      damageMin: 12,
      damageMax: 34,
      attributeTypes: [2, 4, 0],
      attributeValues: [99, 77, 0],
      upgrades: 1,
      itemLevel: 100,
    }),
  );

  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    equippedItems,
    prefix: "s1",
    name: "Modern Items",
  });
  const head = normalized.items?.equipped?.slots.head;
  const weapon1 = normalized.items?.equipped?.slots.weapon1;

  assert.equal(normalized.items?.equipped?.source, "equippedItems");
  assert.equal(normalized.items?.equipped?.format, "modern19");
  assert.equal(head?.type, 2);
  assert.equal(head?.class, 2);
  assert.equal(head?.index, 55);
  assert.equal(head?.isEpic, true);
  assert.equal(head?.armor, 321);
  assert.equal(head?.damage, null);
  assert.deepEqual(head?.attributes.map(({ type, value, affectedAttributes }) => ({ type, value, affectedAttributes })), [
    { type: "strength", value: 100, affectedAttributes: ["strength"] },
    {
      type: "all",
      value: 25,
      affectedAttributes: ["strength", "dexterity", "intelligence", "constitution", "luck"],
    },
  ]);
  assert.deepEqual(head?.socket, { hasSocket: true, hasGem: true, gemType: 3, gemValue: 50 });
  assert.deepEqual(head?.rune, { hasRune: true, type: 5, kind: "health", value: 7 });
  assert.deepEqual(head?.enchantment, { hasEnchantment: true, type: 4 });
  assert.equal(head?.upgrades, 3);
  assert.equal(head?.upgradeMultiplier, Math.pow(1.03, 3));
  assert.equal(head?.itemLevel, 200);
  assert.deepEqual(head?.sellPrice, { gold: 123.45, mushrooms: 2 });
  assert.deepEqual(weapon1?.damage, { min: 12, max: 34 });
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCharacterCore(save, 20, 1);
  save[48] = packLegacyHeader(2, 11, 3);

  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    prefix: "s1",
    name: "No Modern Items",
  });

  assert.equal(normalized.items, undefined);
}

{
  const save = Array.from({ length: 650 }, () => 0);
  fillCharacterCore(save, 29, 1);
  save.splice(
    48,
    12,
    ...legacyItem({
      type: 2,
      socket: 11,
      enchantment: 3,
      picIndex: 1051,
      damageMin: 444,
      damageMax: 0,
      attributeTypes: [1, 4, 5],
      attributeValues: [100, 88, 77],
      gold: 5000,
      mushrooms: 5,
      upgrades: 2,
      socketPower: 30,
    }),
  );
  save.splice(
    48 + 8 * 12,
    12,
    ...legacyItem({
      type: 1,
      picIndex: 7,
      damageMin: 12,
      damageMax: 24,
      attributeTypes: [2, 0, 0],
      attributeValues: [90, 0, 0],
    }),
  );

  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    save,
    identifier: "s3_p1",
    prefix: "s3",
    name: "Legacy Own Items",
  });
  const head = normalized.items?.equipped?.slots.head;

  assert.equal(normalized.items?.equipped?.source, "save");
  assert.equal(normalized.items?.equipped?.format, "legacy12");
  assert.equal(head?.type, 2);
  assert.equal(head?.armor, 444);
  assert.deepEqual(head?.attributes, [
    {
      slot: 1,
      typeId: 21,
      type: "strengthConstitutionLuck",
      value: 100,
      affectedAttributes: ["strength", "constitution", "luck"],
    },
  ]);
  assert.deepEqual(head?.socket, { hasSocket: true, hasGem: true, gemType: 2, gemValue: 30 });
  assert.deepEqual(head?.enchantment, { hasEnchantment: true, type: 3 });
  assert.equal(head?.upgrades, 2);
  assert.equal(head?.itemLevel, null);
  assert.equal(head?.metadata.fields.itemLevel?.status, "unsupported");
  assert.deepEqual(normalized.items?.equipped?.slots.weapon1?.damage, { min: 12, max: 24 });
}

{
  const save = Array.from({ length: 256 }, () => 0);
  save[0] = 2;
  save[2] = packLowerShort(100);
  save[3] = 1000;
  save[4] = 2000;
  save[5] = 3000;
  save[6] = 10;
  save[18] = packLowerShort(1);
  save[19] = 0;
  save[20] = packLowerShort(2);
  save.splice(
    48,
    12,
    ...legacyItem({
      type: 3,
      picIndex: 31,
      damageMin: 222,
      damageMax: 0,
      attributeTypes: [3, 4, 40],
      attributeValues: [80, 70, 9],
    }),
  );
  save.splice(
    48 + 9 * 12,
    12,
    ...legacyItem({
      type: 1,
      picIndex: 9,
      damageMin: 1,
      damageMax: 2,
      attributeTypes: [1, 0, 0],
      attributeValues: [1, 0, 0],
    }),
  );

  const normalized = normalizeSfPlayerCharacterCore({
    own: 0,
    save,
    prefix: "s9",
    name: "Legacy Other Items",
  });

  assert.equal(normalized.items?.equipped?.format, "legacy12");
  assert.equal(normalized.items?.equipped?.slots.head?.armor, 222);
  assert.deepEqual(normalized.items?.equipped?.slots.head?.rune, { hasRune: true, type: 10, kind: "damageFire", value: 9 });
  assert.equal(normalized.items?.equipped?.slots.weapon2, undefined);
  assert.equal(normalized.items?.equipped?.metadata.fields["slots.weapon2"]?.status, "unsupported");
}

{
  const item = normalizeSfItem("modern19", ["bad"]);

  assert.equal(item.type, null);
  assert.equal(item.metadata.fields.type?.status, "invalid");
  assert.equal(item.metadata.fields["socket.raw"]?.status, "missing");
}

{
  const equipped = normalizeSfPlayerItems(
    {
      equippedItems: modernItem({
        type: 2,
        picIndex: 1,
        damageMin: 1,
        damageMax: 0,
        attributeTypes: [1, 0, 0],
        attributeValues: [1, 0, 0],
      }),
    },
    { characterClass: 1 },
  );

  assert.equal(equipped?.equipped?.slots.head?.type, 2);
  assert.equal(equipped?.equipped?.metadata.fields["slots.body"]?.status, "missing");
}

console.log("normalizedItem.test.mts passed");
