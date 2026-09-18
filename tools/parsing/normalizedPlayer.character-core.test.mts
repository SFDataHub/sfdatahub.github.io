import assert from "node:assert/strict";

import { normalizeSfPlayerCharacterCore } from "../../src/lib/parsing/normalizedPlayer.ts";
import { detectSfPlayerSaveLayout } from "../../src/lib/parsing/playerSaveLayout.ts";

const packLowerShort = (low: number, high = 0): number => low + (high << 16);
const packBytes = (b0: number, b1 = 0, b2 = 0, b3 = 0): number => b0 + (b1 << 8) + (b2 << 16) + (b3 << 24);

const setAttributeBlock = (save: unknown[], baseStart: number, bonusStart: number, purchasedStart: number | null) => {
  for (let index = 0; index < 5; index += 1) {
    save[baseStart + index] = 10 + index;
    save[bonusStart + index] = 20 + index;
    if (purchasedStart != null) save[purchasedStart + index] = 30 + index;
  }
};

{
  const save = Array.from({ length: 70 }, () => 0);
  save[1] = 1859;
  save[3] = packLowerShort(412, 99);
  save[4] = 1000;
  save[5] = 2000;
  save[6] = 3000;
  save[7] = 44;
  save[18] = packLowerShort(2, 999);
  save[19] = packBytes(2);
  save[20] = packLowerShort(3, 777);
  save[23] = 111;
  save[24] = 12;
  save[25] = 34;
  setAttributeBlock(save, 30, 35, 40);
  save[48] = 9999;

  const player = {
    own: 1,
    saveVersion: 2,
    save,
    identifier: "s1_p1859",
    prefix: "s1",
    name: "Format70",
  };
  const normalized = normalizeSfPlayerCharacterCore(player);

  assert.equal(detectSfPlayerSaveLayout(player), "currentCompact");
  assert.equal(normalized.metadata.layout, "currentCompact");
  assert.equal(normalized.identity.id, 1859);
  assert.equal(normalized.identity.identifier, "s1_p1859");
  assert.equal(normalized.identity.class, 3);
  assert.equal(normalized.identity.race, 2);
  assert.equal(normalized.identity.gender, "female");
  assert.equal(normalized.identity.own, true);
  assert.deepEqual(normalized.progression, { level: 412, xp: 1000, xpNext: 2000, honor: 3000, rank: 44 });
  assert.deepEqual(
    (({ base, bonus, purchased }) => ({ base, bonus, purchased }))(normalized.attributes.dexterity),
    { base: 11, bonus: 21, purchased: 31 },
  );
  assert.deepEqual(normalized.combat.source, { armor: 111, damage: { min: 12, max: 34 } });
  assert.equal(normalized.combat.armor, null);
  assert.equal(normalized.combat.health, 59472);
  assert.equal(normalized.metadata.fields["attributes.dexterity.base"]?.status, "available");
  assert.equal("items" in normalized, false);
}

{
  const save = Array.from({ length: 650 }, () => 0);
  save[1] = 77;
  save[7] = packLowerShort(500, 12);
  save[8] = 1500;
  save[9] = 2500;
  save[10] = 3500;
  save[11] = 45;
  save[27] = packLowerShort(6, 444);
  save[28] = packBytes(1);
  save[29] = packLowerShort(5, 333);
  setAttributeBlock(save, 30, 35, 40);
  save[447] = 999;
  save[448] = 80;
  save[449] = 160;

  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    save,
    identifier: "s3_p77",
    prefix: "s3",
    name: "Legacy Own",
  });

  assert.equal(normalized.metadata.layout, "legacyOwn");
  assert.equal(normalized.identity.id, 77);
  assert.equal(normalized.identity.class, 5);
  assert.equal(normalized.identity.race, 6);
  assert.equal(normalized.progression.level, 500);
  assert.deepEqual(
    (({ base, bonus, purchased }) => ({ base, bonus, purchased }))(normalized.attributes.luck),
    { base: 14, bonus: 24, purchased: 34 },
  );
  assert.deepEqual(normalized.combat.source, { armor: 999, damage: { min: 80, max: 160 } });
}

{
  const save = Array.from({ length: 256 }, () => 0);
  save[0] = 88;
  save[2] = packLowerShort(277, 77);
  save[3] = 1700;
  save[4] = 2700;
  save[5] = 3700;
  save[6] = 46;
  save[18] = packLowerShort(4, 222);
  save[19] = packBytes(0);
  save[20] = packLowerShort(8, 111);
  setAttributeBlock(save, 21, 26, null);
  save[31] = 999;
  save[168] = 444;
  save[169] = 55;
  save[170] = 66;

  const normalized = normalizeSfPlayerCharacterCore({
    own: 0,
    save,
    prefix: "s9",
    name: "Legacy Other",
  });

  assert.equal(normalized.metadata.layout, "legacyOther");
  assert.equal(normalized.identity.id, 88);
  assert.equal(normalized.identity.identifier, "s9_p88");
  assert.equal(normalized.identity.gender, "male");
  assert.equal(normalized.progression.level, 277);
  assert.deepEqual(
    (({ base, bonus, purchased }) => ({ base, bonus, purchased }))(normalized.attributes.strength),
    { base: 10, bonus: 20, purchased: null },
  );
  assert.equal(normalized.metadata.fields["attributes.strength.purchased"]?.status, "unsupported");
  assert.deepEqual(normalized.combat.source, { armor: 444, damage: { min: 55, max: 66 } });
}

{
  const save: unknown[] = Array.from({ length: 70 }, () => 0);
  save[1] = 99;
  save[3] = packLowerShort(1);
  save[4] = "not-a-number";
  delete save[5];

  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    prefix: "s1",
  });

  assert.equal(normalized.metadata.layout, "currentCompact");
  assert.equal(normalized.progression.xp, null);
  assert.equal(normalized.metadata.fields["progression.xp"]?.status, "invalid");
  assert.equal(normalized.progression.xpNext, null);
  assert.equal(normalized.metadata.fields["progression.xpNext"]?.status, "missing");
  assert.equal(normalized.identity.name, null);
  assert.equal(normalized.metadata.fields["identity.name"]?.status, "missing");
}

{
  const normalized = normalizeSfPlayerCharacterCore({ own: 1, identifier: "s1_p123" });

  assert.equal(normalized.metadata.layout, "unknown");
  assert.equal(normalized.identity.id, 123);
  assert.equal(normalized.metadata.fields["identity.id"]?.status, "available");
  assert.equal(normalized.metadata.fields["identity.id"]?.provenance, "derived");
  assert.equal(normalized.metadata.fields["progression.level"]?.status, "unsupported");
}

console.log("normalizedPlayer.character-core.test.mts passed");
