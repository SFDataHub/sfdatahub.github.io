import assert from "node:assert/strict";

import { normalizeSfPlayerCharacterCore } from "../../src/lib/parsing/normalizedPlayer.ts";

const packLowerShort = (low: number, high = 0): number => low + (high << 16);

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
};

const fillLegacyOtherSave = (save: unknown[], classId: number) => {
  save[0] = 1;
  save[2] = packLowerShort(100);
  save[3] = 1000;
  save[4] = 2000;
  save[5] = 3000;
  save[6] = 10;
  save[18] = packLowerShort(1);
  save[19] = 0;
  save[20] = packLowerShort(classId);
};

const createOwnPets = () => {
  const pets = Array.from({ length: 109 }, () => 0);
  for (let index = 0; index < 100; index += 1) {
    pets[2 + index] = index % 20 === 0 ? 10 : 0;
  }
  pets[103] = 5;
  pets[104] = 11;
  pets[105] = 12;
  pets[106] = 13;
  pets[107] = 14;
  pets[108] = 15;
  return pets;
};

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave(save, 3);
  save[50] = 999;
  const potions = [123, 2, 16, 5, 100, 200, 300, 10, 25, 15];
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    potions,
    pets: createOwnPets(),
    offset: 5000,
    prefix: "s1",
    name: "Modern Consumables",
  });

  assert.equal(normalized.potions?.source, "potions");
  assert.equal(normalized.potions?.slots.length, 3);
  assert.deepEqual(
    normalized.potions?.slots.map(({ type, size, expires, attribute, isLife }) => ({
      type,
      size,
      expires,
      attribute,
      isLife,
    })),
    [
      { type: 2, size: 10, expires: 105000, attribute: "dexterity", isLife: false },
      { type: 6, size: 25, expires: 205000, attribute: "life", isLife: true },
      { type: 5, size: 15, expires: 305000, attribute: "luck", isLife: false },
    ],
  );
  assert.deepEqual(normalized.potions?.life, { active: true, size: 25 });
  assert.equal(normalized.pets?.source, "pets");
  assert.deepEqual(normalized.pets?.bonuses, { shadow: 11, light: 12, earth: 13, fire: 14, water: 15 });
  assert.deepEqual(normalized.pets?.attributeBonuses, {
    strength: 15,
    dexterity: 12,
    intelligence: 13,
    constitution: 11,
    luck: 14,
  });
  assert.equal(normalized.pets?.own?.counts.shadow, 1);
  assert.equal(normalized.pets?.own?.levelSums.water, 10);
  assert.equal(normalized.pets?.own?.totalCount, 5);
  assert.equal(normalized.pets?.own?.totalLevel, 50);
}

{
  const save = Array.from({ length: 650 }, () => 0);
  fillLegacyOwnSave(save, 1);
  save[493] = 1;
  save[494] = 16;
  save[495] = 4;
  save[496] = 1000;
  save[497] = 2000;
  save[498] = 3000;
  save[499] = 10;
  save[500] = 25;
  save[501] = 20;
  save[502] = 25;
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    save,
    pets: createOwnPets(),
    offset: -1000,
    prefix: "s3",
    name: "Legacy Own Consumables",
  });

  assert.equal(normalized.potions?.source, "save");
  assert.deepEqual(
    normalized.potions?.slots.map(({ type, size, expires, attribute }) => ({ type, size, expires, attribute })),
    [
      { type: 1, size: 10, expires: 999000, attribute: "strength" },
      { type: 6, size: 25, expires: 1999000, attribute: "life" },
      { type: 4, size: 20, expires: 2999000, attribute: "constitution" },
    ],
  );
  assert.deepEqual(normalized.potions?.life, { active: true, size: 25 });
  assert.equal(normalized.pets?.own?.levels.all.length, 100);
  assert.equal(normalized.pets?.metadata.fields["own.totalCount"]?.status, "available");
}

{
  const save = Array.from({ length: 256 }, () => 0);
  fillLegacyOtherSave(save, 2);
  save[194] = 3;
  save[195] = 0;
  save[196] = 16;
  save[200] = 11;
  save[201] = 0;
  save[202] = 25;
  save[203] = 25;
  const normalized = normalizeSfPlayerCharacterCore({
    own: 0,
    save,
    pets: [0, 21, 22, 23, 24, 25],
    prefix: "s9",
    name: "Legacy Other Consumables",
  });

  assert.equal(normalized.potions?.source, "save");
  assert.deepEqual(
    normalized.potions?.slots.map(({ type, size, expires, attribute }) => ({ type, size, expires, attribute })),
    [
      { type: 3, size: 11, expires: null, attribute: "intelligence" },
      { type: 6, size: 25, expires: null, attribute: "life" },
    ],
  );
  assert.equal(normalized.potions?.metadata.fields["slots.0.expires"]?.status, "unsupported");
  assert.deepEqual(normalized.pets?.bonuses, { shadow: 21, light: 22, earth: 23, fire: 24, water: 25 });
  assert.deepEqual(normalized.pets?.attributeBonuses, {
    strength: 25,
    dexterity: 22,
    intelligence: 23,
    constitution: 21,
    luck: 24,
  });
  assert.equal(normalized.pets?.own, undefined);
  assert.equal(normalized.pets?.metadata.fields["own.levels"]?.status, "unsupported");
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave(save, 1);
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    potions: [0, "bad", 0, 0, 0, 0, 0, 0, 0, 0],
    prefix: "s1",
  });

  assert.equal(normalized.potions?.metadata.fields["slots.0.type"]?.status, "invalid");
  assert.equal(normalized.potions?.metadata.fields["slots.1"]?.status, "available");
  assert.equal(normalized.pets?.source, null);
  assert.equal(normalized.pets?.metadata.fields.source?.status, "missing");
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave(save, 1);
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    prefix: "s1",
  });

  assert.equal(normalized.potions?.source, null);
  assert.equal(normalized.potions?.metadata.fields.source?.status, "missing");
  assert.equal(normalized.potions?.slots.length, 0);
}

console.log("normalizedConsumables.test.mts passed");
