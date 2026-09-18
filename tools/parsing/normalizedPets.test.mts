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

const createFullOwnPets = () => {
  const pets = Array.from({ length: 264 }, () => 0);
  pets[2] = 9;
  pets[3] = 0;
  pets[21] = 1;
  pets[22] = 2;
  pets[42] = 12;
  pets[63] = 7;
  pets[82] = 5;
  pets[101] = 20;
  pets[103] = 7;
  pets[104] = 11;
  pets[105] = 12;
  pets[106] = 13;
  pets[107] = 14;
  pets[108] = 15;
  pets[210] = 3;
  pets[211] = 4;
  pets[212] = 5;
  pets[213] = 6;
  pets[214] = 7;
  pets[233] = 321;
  pets[234] = 654321;
  pets[259] = 8;
  pets[260] = 9;
  pets[261] = 10;
  pets[262] = 11;
  pets[263] = 12;
  return pets;
};

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave(save, 3);
  save[60] = 99999;
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    pets: createFullOwnPets(),
    prefix: "s1",
    name: "Format70 Own Pets",
  });

  assert.equal(normalized.pets?.collection?.totalPets, 100);
  assert.equal(normalized.pets?.collection?.petsPerElement, 20);
  assert.equal(normalized.pets?.collection?.pets[0]?.id, 0);
  assert.equal(normalized.pets?.collection?.pets[0]?.element, "shadow");
  assert.equal(normalized.pets?.collection?.pets[20]?.element, "light");
  assert.equal(normalized.pets?.collection?.pets[99]?.element, "water");
  assert.equal(normalized.pets?.collection?.pets[1]?.level, 0);
  assert.equal(normalized.pets?.collection?.pets[1]?.found, false);
  assert.equal(normalized.pets?.collection?.pets[99]?.level, 20);
  assert.equal(normalized.pets?.collection?.pets[99]?.found, true);
  assert.equal(normalized.pets?.elements.shadow.count, 2);
  assert.equal(normalized.pets?.elements.water.levelSum, 25);
  assert.deepEqual(normalized.pets?.bonuses, { shadow: 11, light: 12, earth: 13, fire: 14, water: 15 });
  assert.deepEqual(normalized.pets?.attributeBonuses, {
    strength: 15,
    dexterity: 12,
    intelligence: 13,
    constitution: 11,
    luck: 14,
  });
  assert.equal(normalized.pets?.habitatProgress.fire, 6);
  assert.equal(normalized.pets?.rank, 321);
  assert.equal(normalized.pets?.honor, 654321);
  assert.equal(normalized.pets?.foods.water, 12);
  assert.equal(normalized.pets?.metadata.fields["collection.pets.1.level"]?.status, "available");
  assert.equal(normalized.pets?.metadata.fields["elements.water.levelSum"]?.provenance, "derived");
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave(save, 2);
  const normalized = normalizeSfPlayerCharacterCore({
    own: 0,
    saveVersion: 2,
    save,
    pets: [0, 21, 22, 23, 24, 25],
    prefix: "s2",
    name: "Format70 Other Pets",
  });

  assert.deepEqual(normalized.pets?.bonuses, { shadow: 21, light: 22, earth: 23, fire: 24, water: 25 });
  assert.equal(normalized.pets?.collection, null);
  assert.equal(normalized.pets?.elements.shadow.levels, null);
  assert.equal(normalized.pets?.metadata.fields.collection?.status, "unsupported");
  assert.equal(normalized.pets?.metadata.fields["foods.shadow"]?.status, "unsupported");
}

{
  const save = Array.from({ length: 650 }, () => 0);
  fillLegacyOwnSave(save, 1);
  save[629] = 600;
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    save,
    pets: createFullOwnPets(),
    prefix: "s3",
    name: "Legacy Own Pets",
  });

  assert.equal(normalized.pets?.own?.totalCount, 7);
  assert.equal(normalized.pets?.own?.totalLevel, 56);
  assert.equal(normalized.pets?.elements.earth.count, 1);
  assert.equal(normalized.progressionStatus.guildBonuses.pet, 600);
  assert.equal(normalized.pets?.bonuses.water, 15);
  assert.notEqual(normalized.progressionStatus.guildBonuses.pet, normalized.pets?.bonuses.water);
}

{
  const save = Array.from({ length: 256 }, () => 0);
  fillLegacyOtherSave(save, 4);
  const normalized = normalizeSfPlayerCharacterCore({
    own: 0,
    save,
    pets: [0, 1, 2, 3, 4, 5],
    prefix: "s4",
    name: "Legacy Other Pets",
  });

  assert.equal(normalized.pets?.attributeBonuses.strength, 5);
  assert.equal(normalized.pets?.collection, null);
  assert.equal(normalized.pets?.rank, null);
  assert.equal(normalized.pets?.metadata.fields.rank?.status, "unsupported");
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave(save, 1);
  const pets = createFullOwnPets();
  pets[5] = "bad";
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    pets,
    prefix: "s5",
  });

  assert.equal(normalized.pets?.collection?.pets[3]?.level, 0);
  assert.equal(normalized.pets?.metadata.fields["collection.pets.3.level"]?.status, "invalid");
  assert.equal(normalized.pets?.metadata.fields["collection.pets.3.found"]?.status, "invalid");
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave(save, 1);
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    prefix: "s6",
  });

  assert.equal(normalized.pets?.source, null);
  assert.equal(normalized.pets?.collection, null);
  assert.equal(normalized.pets?.metadata.fields.source?.status, "missing");
  assert.equal(normalized.pets?.metadata.fields["elements.shadow.levels"]?.status, "missing");
}

console.log("normalizedPets.test.mts passed");
