import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { openDB } from "idb";
import { captureLocalDataDependencies } from "../../src/lib/local-data/localDataDependencies.ts";
import { normalizeSfPlayerCharacterCore } from "../../src/lib/parsing/normalizedPlayer.ts";
import { seedLocalSourceValidityFixture } from "./localSourceValidityFixture.mts";
import { createLocalPlayerCurrentSeed, resolveLocalPlayerCurrentSeed, isLocalPlayerCurrentSeedValid, type LocalPlayerObservation } from "../../src/pages/GuildHub/localPlayerCurrentSeed.ts";
import { buildLocalPlayerProfileModel } from "../../src/pages/GuildHub/localPlayerProfileAdapter.ts";
import { updateGuildHubLocalScan, deleteGuildHubLocalScans } from "../../src/lib/guilds/localScanLibrary.ts";

const time = Date.UTC(2026, 9, 6, 12);
const oldTime = time - 60 * 86_400_000;
const rawPlayer = (timestamp: number, name: string) => ({ identifier: "f8_net_p1", prefix: "f8_net", timestamp, name, class: 1, level: 100, guildIdentifier: "f8_net_g1", guildName: "Seed Guild", rank: 12 });
const { scan } = await seedLocalSourceValidityFixture({
  id: "w05-seed", contentHash: "seed-hash", filename: "Seed.json", importedAt: new Date(time).toISOString(),
  scannedAt: new Date(time).toISOString(), servers: ["f8_net"], playerCount: 2, groupCount: 2,
  rawData: { players: [rawPlayer(oldTime, "Historical"), rawPlayer(time, "Current")],
    groups: [oldTime, time].map(timestamp => ({ identifier: "f8_net_g1", prefix: "f8_net", timestamp, name: "Seed Guild" })) },
});
const dependencies = await captureLocalDataDependencies({ sourceIds: [scan.id] });
const context = { scan, dependencies, coreLookup: new Map() };
const target: LocalPlayerObservation = { sourceScanId: scan.id, sourcePlayerKey: "f8_net_p1", sourceMemberRef: "f8_net_p1",
  scannedAtMs: time, scannedAtIso: new Date(time).toISOString(), guild: { name: "Seed Guild", server: "F8", identifier: "f8_net_g1" } };
const seed = createLocalPlayerCurrentSeed(context, target);
assert.ok(seed);
assert.equal(seed.rawPlayer.name, "Current");
assert.equal(seed.rawIdentifier, "f8_net_p1");
assert.equal(seed.guildPlayers.length, 1);
assert.equal(seed.normalizedCore, undefined, "seed creation must not normalize a pool");

const db = await openDB("sfdatahub-local-data");
const originalGet = IDBObjectStore.prototype.get;
let rawReads = 0;
IDBObjectStore.prototype.get = function (key) {
  if (this.name === "scans") rawReads++;
  return originalGet.call(this, key);
};
try {
  assert.equal(await resolveLocalPlayerCurrentSeed(target, seed), seed);
  assert.equal(rawReads, 0, "valid seed checks metadata, never Rawpayload");
  const core = normalizeSfPlayerCharacterCore(seed.rawPlayer);
  context.coreLookup.set(seed.rawPlayer, core);
  const prepared = createLocalPlayerCurrentSeed(context, target);
  assert.ok(prepared);
  const model = buildLocalPlayerProfileModel({ ...target, rawPlayer: prepared.rawPlayer, currentSeed: prepared });
  assert.equal(model.currentSeed?.normalizedCore, core, "adapter reuses exact complete core object");
  const missingCoreContext = { ...context, coreLookup: new Map() };
  const missingCoreSeed = createLocalPlayerCurrentSeed(missingCoreContext, target)!;
  assert.equal(missingCoreSeed.normalizedCore, undefined);
  const unpreparedModel = buildLocalPlayerProfileModel({ ...target, rawPlayer: missingCoreSeed.rawPlayer, currentSeed: missingCoreSeed });
  assert.ok(unpreparedModel.currentSeed?.normalizedCore);
  assert.equal(missingCoreContext.coreLookup.get(seed.rawPlayer), unpreparedModel.currentSeed?.normalizedCore);
  console.log("PASS valid seed: zero Rawpayload reads; complete core reused; missing core prepared in adapter");

  const historical = await resolveLocalPlayerCurrentSeed({ ...target, scannedAtMs: oldTime, scannedAtIso: new Date(oldTime).toISOString() });
  assert.ok(historical);
  assert.equal(historical.rawPlayer.name, "Historical", "newer row must not displace clicked Compare observation");
  assert.equal(rawReads, 1, "unseeded caller reads precisely the named source");
  assert.equal(createLocalPlayerCurrentSeed(context, { ...target, scannedAtMs: time - 1 }), null);
  assert.equal(createLocalPlayerCurrentSeed({ ...context, scan: { ...scan, rawData: { players: [seed.rawPlayer, { ...seed.rawPlayer }], groups: [] } } }, target), null, "ambiguous row is missing");
  assert.equal(createLocalPlayerCurrentSeed({ ...context, scan: { ...scan, rawData: { players: [{ ...seed.rawPlayer, timestamp: undefined }], groups: [] } } }, target), null, "unverified set header is not a row observation");
  assert.equal(createLocalPlayerCurrentSeed(context, { ...target, guild: { ...target.guild, server: "F9" } }), null);
  console.log("PASS physical source/time/server anchors, multiple observations, ambiguity and missing row time");

  let allowed = true;
  const stopped = await resolveLocalPlayerCurrentSeed(target, undefined, () => allowed = false);
  assert.equal(stopped, null);
  assert.equal(rawReads, 1, "invalidation after dependencies prevents source read");
  const replacement = { ...scan, filename: "Changed.json", contentHash: "new-hash", rawData: { players: [rawPlayer(time, "Changed")], groups: [] } };
  await updateGuildHubLocalScan(scan.id, replacement.filename, JSON.stringify(replacement.rawData));
  assert.equal(await isLocalPlayerCurrentSeedValid(seed, target), false);
  const before = rawReads;
  const fallback = await resolveLocalPlayerCurrentSeed(target, seed);
  assert.equal(fallback?.rawPlayer.name, "Changed");
  assert.equal(rawReads - before, 1, "changed source uses one targeted fallback");
  await deleteGuildHubLocalScans([scan.id]);
  assert.equal(await isLocalPlayerCurrentSeedValid(fallback!, target), false);
  assert.equal(await resolveLocalPlayerCurrentSeed(target, fallback!), null);
  assert.equal(await db.getKey("scans", scan.id), undefined);
  console.log("PASS changed receipt, exact source fallback, source deletion and no acquisition");
} finally {
  IDBObjectStore.prototype.get = originalGet;
  db.close();
}
