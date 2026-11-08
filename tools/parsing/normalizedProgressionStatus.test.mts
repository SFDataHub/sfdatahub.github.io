import assert from "node:assert/strict";
import { buildLocalPlayerProfileModel } from "../../src/pages/GuildHub/localPlayerProfileAdapter.ts";

import { normalizeSfPlayerFortress } from "../../src/lib/parsing/normalizedFortress.ts";
import { normalizeSfPlayerCharacterCore } from "../../src/lib/parsing/normalizedPlayer.ts";
import { normalizeSfPlayerProgressionStatus } from "../../src/lib/parsing/normalizedProgressionStatus.ts";

const packLowerShort = (low: number, high = 0): number => low + (high << 16);
const packBytes = (b0: number, b1 = 0, b2 = 0, b3 = 0): number =>
  b0 + (b1 << 8) + (b2 << 16) + (b3 << 24);

const achievementsWithCount = (count: number): unknown[] => {
  const values = Array.from({ length: 282 }, () => 0);
  for (let index = 0; index < count; index += 1) values[index] = 1;
  return values;
};

const currentSave = (): unknown[] => {
  const save = Array.from({ length: 70 }, () => 0);
  save[1] = 101;
  save[3] = packLowerShort(20);
  save[18] = packLowerShort(1);
  save[19] = 0;
  save[20] = packLowerShort(1);
  return save;
};

{
  const save = currentSave();
  save[21] = packLowerShort(4, 99);
  save[26] = 50;
  save[28] = 40;
  save[29] = 123;
  save[66] = 12440;
  save[30] = 10999;

  const status = normalizeSfPlayerProgressionStatus({
    own: 1,
    saveVersion: 2,
    save,
    achievements: achievementsWithCount(112),
    offset: 1000,
  });

  assert.equal(status.metadata.layout, "currentCompact");
  assert.deepEqual(status.scrapbook, { count: 2440, maximum: 2506, percentage: 2440 / 2506 });
  assert.deepEqual(status.achievements, { count: 112, maximum: 141 });
  assert.deepEqual(status.mount, { type: 4, active: true, bonus: 50, expiresAt: 124000 });
  assert.deepEqual(status.portalBonuses, { health: 40, damage: 50 });
  assert.deepEqual(status.guildBonuses, { treasure: null, instructor: null, pet: null });
  assert.equal(status.metadata.fields["guildBonuses.treasure"]?.status, "unsupported");
  assert.equal(status.metadata.fields["scrapbook.count"]?.provenance, "derived");
  assert.equal(status.metadata.fields["achievements.count"]?.provenance, "calculated");
}

{
  const save = currentSave();
  save[21] = packLowerShort(0);
  save[26] = 0;
  save[28] = 0;
  save[29] = 0;
  save[66] = 10000;

  const status = normalizeSfPlayerProgressionStatus({
    own: 0,
    saveVersion: 2,
    save,
    achievements: achievementsWithCount(0),
  });

  assert.equal(status.metadata.layout, "currentCompact");
  assert.deepEqual(status.scrapbook, { count: 0, maximum: 2506, percentage: 0 });
  assert.deepEqual(status.achievements, { count: 0, maximum: 141 });
  assert.deepEqual(status.mount, { type: 0, active: false, bonus: 0, expiresAt: 0 });
  assert.deepEqual(status.portalBonuses, { health: 0, damage: 0 });
}

{
  const save = currentSave();
  save[21] = packLowerShort(9);
  save[29] = 1;
  save[66] = 10001;

  const status = normalizeSfPlayerProgressionStatus({
    own: 1,
    saveVersion: 2,
    save,
  });

  assert.equal(status.mount.type, 9);
  assert.equal(status.mount.active, true);
  assert.equal(status.mount.bonus, null);
  assert.equal(status.metadata.fields["mount.bonus"]?.status, "invalid");
  assert.equal(status.achievements.count, null);
  assert.equal(status.metadata.fields["achievements.count"]?.status, "missing");
}

{
  const save = Array.from({ length: 650 }, () => 0);
  save[1] = 1;
  save[7] = packLowerShort(100);
  save[27] = packLowerShort(1);
  save[28] = 0;
  save[29] = packLowerShort(1);
  save[286] = packLowerShort(0);
  save[438] = 10000;
  save[445] = packBytes(0, 0, 25, 50);
  save[451] = 999;
  save[623] = 15;
  save[624] = 15;
  save[629] = 600;

  const status = normalizeSfPlayerProgressionStatus({
    own: 1,
    save,
    achievements: achievementsWithCount(1),
    offset: -1000,
  });

  assert.equal(status.metadata.layout, "legacyOwn");
  assert.deepEqual(status.scrapbook, { count: 0, maximum: 2506, percentage: 0 });
  assert.deepEqual(status.mount, { type: 0, active: false, bonus: 0, expiresAt: 998000 });
  assert.deepEqual(status.portalBonuses, { health: 50, damage: 25 });
  assert.deepEqual(status.guildBonuses, { treasure: 15, instructor: 15, pet: 600 });
}

{
  const save = Array.from({ length: 261 }, () => 0);
  save[0] = 1;
  save[2] = packLowerShort(100);
  save[18] = packLowerShort(1);
  save[19] = 0;
  save[20] = packLowerShort(1);
  save[159] = packLowerShort(3);
  save[163] = 10005;
  save[252] = packBytes(0, 0, 7, 8);

  const status = normalizeSfPlayerProgressionStatus({
    own: 0,
    save,
  });

  assert.equal(status.metadata.layout, "legacyOther");
  assert.deepEqual(status.scrapbook, { count: 5, maximum: 2506, percentage: 5 / 2506 });
  assert.deepEqual(status.mount, { type: 3, active: true, bonus: 30, expiresAt: null });
  assert.equal(status.metadata.fields["mount.expiresAt"]?.status, "unsupported");
  assert.deepEqual(status.portalBonuses, { health: 8, damage: 7 });
  assert.equal(status.guildBonuses.pet, null);
  assert.equal(status.metadata.fields["guildBonuses.pet"]?.status, "unsupported");
}

{
  const status = normalizeSfPlayerProgressionStatus({ own: 1, identifier: "s1_p123" });

  assert.equal(status.metadata.layout, "unknown");
  assert.equal(status.scrapbook.count, null);
  assert.equal(status.achievements.count, null);
  assert.equal(status.mount.type, null);
  assert.equal(status.metadata.fields["scrapbook.count"]?.status, "unsupported");
}

{
  const save = currentSave();
  save[21] = packLowerShort(2);
  save[26] = 11;
  save[28] = 22;
  save[29] = 33;
  save[66] = 10010;
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    achievements: achievementsWithCount(2),
    fortress: Array.from({ length: 26 }, (_, index) => (index === 25 ? 20 : 1)),
  });

  assert.equal(normalized.progressionStatus.scrapbook.count, 10);
  assert.equal(normalized.progressionStatus.mount.bonus, 20);
  assert.equal(normalized.progressionStatus.portalBonuses.health, 22);
  assert.equal(normalized.fortress.knights, 20);
  assert.equal(normalized.fortress.gladiator, null);
  assert.equal(normalized.fortress.metadata.fields["fortress.gladiator"]?.status, "unsupported");
}

{
  const save = Array.from({ length: 650 }, () => 0);
  save[1] = 1;
  save[7] = packLowerShort(100);
  save[27] = packLowerShort(1);
  save[28] = 0;
  save[29] = packLowerShort(1);
  save[524] = 1;
  save[571] = 0;
  save[581] = 0;
  save[582] = 0;
  save[583] = 0;
  save[598] = 0;
  const tower = Array.from({ length: 455 }, () => 0);
  tower[454] = 15;

  const fortress = normalizeSfPlayerFortress({
    own: 1,
    save,
    tower,
  });

  assert.equal(fortress.metadata.layout, "legacyOwn");
  assert.equal(fortress.knights, 0);
  assert.equal(fortress.gladiator, 15);
  assert.equal(fortress.metadata.fields["fortress.knights"]?.status, "available");
}

{
  const save = Array.from({ length: 261 }, () => 0);
  save[0] = 1;
  save[2] = packLowerShort(100);
  save[18] = packLowerShort(1);
  save[19] = 0;
  save[20] = packLowerShort(1);
  save[208] = 1;
  save[244] = 0;
  save[247] = 0;
  save[248] = 0;
  save[260] = 12;

  const fortress = normalizeSfPlayerFortress({
    own: 0,
    save,
  });

  assert.equal(fortress.metadata.layout, "legacyOther");
  assert.equal(fortress.gladiator, 12);
  assert.equal(fortress.knights, null);
  assert.equal(fortress.metadata.fields["fortress.knights"]?.status, "unsupported");
}

console.log("normalizedProgressionStatus.test.mts passed");

// A reused pre-update seed must refresh only Scrapbook calculations on normal access.
for (const count of [0, 2440, 2506, null]) {
  const save = currentSave();
  save[66] = count == null ? null : 10000 + count;
  const rawPlayer = { own: 1, saveVersion: 2, save };
  const core = normalizeSfPlayerCharacterCore(rawPlayer);
  assert.equal(core.progressionStatus.scrapbook.maximum, 2506);
  assert.equal(core.progressionStatus.scrapbook.percentage, count == null ? null : count / 2506);
  const oldCore = { ...core, progressionStatus: { ...core.progressionStatus,
    scrapbook: { count, maximum: 2484, percentage: count == null ? null : count / 2484 } } };
  const input = { rawPlayer, sourceScanId: "scrapbook-contract", sourcePlayerKey: "f28_net_p101",
    scannedAtMs: 1, scannedAtIso: null, guild: { name: null, server: "f28_net" } };
  const coreLookup = new Map([[rawPlayer, oldCore]]);
  const seed = { ...input, normalizedCore: oldCore, coreLookup } as any;
  const before = JSON.stringify(rawPlayer);
  const profile = buildLocalPlayerProfileModel({ ...input, currentSeed: seed });
  assert.deepEqual(seed.normalizedCore.progressionStatus.scrapbook,
    { count, maximum: 2506, percentage: count == null ? null : count / 2506 });
  assert.equal(seed.normalizedCore.progressionStatus.mount, oldCore.progressionStatus.mount);
  assert.equal(seed.normalizedCore.attributes, oldCore.attributes);
  assert.equal(coreLookup.get(rawPlayer), seed.normalizedCore);
  assert.equal(profile.currentSeed?.normalizedCore, seed.normalizedCore);
  assert.equal(oldCore.progressionStatus.scrapbook.maximum, 2484);
  assert.equal(JSON.stringify(rawPlayer), before);
  if (count === 2506) assert.equal(profile.hero.metrics[2].gauge?.progress, 1);
  if (count === null) assert.equal(profile.hero.metrics[2].gauge?.centerTop, "-");
  const refreshed = seed.normalizedCore;
  buildLocalPlayerProfileModel({ ...input, currentSeed: seed });
  assert.equal(seed.normalizedCore, refreshed);
  // The dashboard's lookup path must receive the same upgrade without a full normalization.
  const lookupSeed = { ...input, coreLookup: new Map([[rawPlayer, oldCore]]) } as any;
  buildLocalPlayerProfileModel({ ...input, currentSeed: lookupSeed });
  assert.deepEqual(lookupSeed.normalizedCore.progressionStatus.scrapbook,
    refreshed.progressionStatus.scrapbook);
}
console.log("Scrapbook 2506 and reused 2484 seed contracts passed");
