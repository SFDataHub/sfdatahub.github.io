import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { openDB } from "idb";
import { seedLocalSourceValidityFixture } from "./localSourceValidityFixture.mts";
import { findLocalPlayerEntryCandidates, resolveLocalProfileEntry, LocalProfileEntryError } from "../../src/lib/data-hub/localProfileEntry.ts";
import { favoriteReference } from "../../src/lib/data-hub/hubFavoritesContract.ts";
import { deleteGuildHubLocalScans, updateGuildHubLocalScan, resetHubSearchProjections, readHubSearchProjectionInventory, importGuildHubLocalScan } from "../../src/lib/guilds/localScanLibrary.ts";
import { resolveHubSearchTarget } from "../../src/lib/data-hub/hubTargetResolver.ts";
import type { HubSearchHit } from "../../src/lib/data-hub/hubSearchService.ts";
import { linkPlayerIdentifiers, unlinkPlayerIdentifier } from "../../src/lib/identities/playerIdentityStore.ts";
const old = Date.UTC(2026, 8, 1), now = Date.UTC(2026, 9, 1);
const player = (at: number, name = "Same Name") => ({ identifier: "am1_net_p42", prefix: "am1_net", timestamp: at, name, class: 1, level: at === now ? 150 : 100, xpTotal: at === now ? 2000 : 1000 });
const { scan } = await seedLocalSourceValidityFixture({ id: "w42-am1", contentHash: "w42-am1-hash", filename: "B.json", importedAt: new Date(now).toISOString(),
  scannedAt: new Date(now).toISOString(), servers: ["am1_net"], playerCount: 2, groupCount: 0, rawData: { players: [player(old), player(now)], groups: [] } });
await seedLocalSourceValidityFixture({ id: "w42-other", contentHash: "w42-other-hash", filename: "A.json", importedAt: new Date(now + 1000).toISOString(),
  scannedAt: new Date(now + 1000).toISOString(), servers: ["f28_net"], playerCount: 1, groupCount: 0,
  rawData: { players: [{ ...player(now + 1000), identifier: "f28_net_p42", prefix: "f28_net" }], groups: [] } });
const entity = favoriteReference("player", "am1_net_p42")!;
const get = IDBObjectStore.prototype.get, all = IDBObjectStore.prototype.getAll;
let reads: string[] = [], pools = 0;
IDBObjectStore.prototype.get = function (key) { if (this.name === "scans") reads.push(String(key)); return get.call(this, key); };
IDBObjectStore.prototype.getAll = function (...args) { if (this.name === "scans") pools++; return all.apply(this, args); };
const reject = (code: string) => (e: unknown) => e instanceof LocalProfileEntryError && e.code === code;
try {
  const cold = await findLocalPlayerEntryCandidates([entity]);
  assert.equal(cold.complete, true); assert.deepEqual(cold.candidates.map(c => [c.row, c.at]), [[entity.identifier, now], [entity.identifier, old]]);
  assert.deepEqual(reads, [scan.id, scan.id]); // named preparation + guarded projection commit
  assert.equal(pools, 0);
  assert.ok((await readHubSearchProjectionInventory()).projections.has(scan.id));
  reads = [];
  const free = await resolveLocalProfileEntry({ entity, observation: { kind: "free" } });
  const exact = await resolveLocalProfileEntry({ entity, observation: { kind: "exact", anchor: { source: scan.id, at: now, row: entity.identifier, hash: scan.contentHash } } });
  assert.deepEqual(free.hero, exact.hero); assert.deepEqual(free.currentSeed?.rawPlayer, exact.currentSeed?.rawPlayer);
  assert.deepEqual(reads, [scan.id, scan.id]);
  assert.equal(free.analytics.scannedAtMs, now);
  const historical = await resolveLocalProfileEntry({ entity, observation: { kind: "exact", anchor: { source: scan.id, at: old } } });
  assert.equal(historical.analytics.scannedAtMs, old); assert.equal(historical.currentSeed?.rawPlayer.level, 100);
  const hit: HubSearchHit = { key: "am1", kind: "player", name: "Same Name", reference: entity, references: [entity], names: ["Same Name"], occurrences: [], identity: "literal", revision: 1, queryGeneration: 1 };
  reads = [];
  const target = await resolveHubSearchTarget(hit, { mode: "profile", allowed: () => true, accessAllowed: () => true });
  assert.equal(target.path, "/data-hub/player-hub/player/am1/am1_net_p42"); assert.equal(reads.length, 0);
  console.log("PASS all-server cold/warm chooser, named reads only, no downloads, identity namespace and exact historical parity");
  await linkPlayerIdentifiers(entity.identifier, "f28_net_p42", { source: "manual" });
  const alias = await resolveLocalProfileEntry({ entity, observation: { kind: "free" } });
  assert.equal(alias.currentSeed?.rawIdentifier, "f28_net_p42"); assert.equal(alias.analytics.scannedAtMs, now + 1000);
  assert.equal((await resolveLocalProfileEntry({ entity, observation: { kind: "exact", anchor: { source: scan.id, at: old } } })).analytics.scannedAtMs, old);
  await unlinkPlayerIdentifier("f28_net_p42");
  const poolsBeforeFixtureSetup = pools;
  const tie = await seedLocalSourceValidityFixture({ id: "w42-tie", contentHash: "w42-tie-hash", filename: "A.json", importedAt: new Date(old).toISOString(),
    scannedAt: new Date(now).toISOString(), servers: ["am1_net"], playerCount: 1, groupCount: 0, rawData: { players: [player(now, "Tie winner")], groups: [] } });
  pools = poolsBeforeFixtureSetup; // The fixture initializer reads its own setup inventory.
  assert.equal((await resolveLocalProfileEntry({ entity, observation: { kind: "free" } })).hero.playerName, "Tie winner");
  await deleteGuildHubLocalScans([tie.scan.id]);
  console.log("PASS confirmed aliases only, exact historical anchor across aliases, filename tie before importedAt");
  await resetHubSearchProjections([scan.id]); reads = [];
  assert.equal((await findLocalPlayerEntryCandidates([entity])).candidates[0].at, now); assert.deepEqual(reads, [scan.id, scan.id]);
  await updateGuildHubLocalScan(scan.id, "B.json", JSON.stringify({ players: [player(now, "Changed")], groups: [] }));
  assert.equal((await resolveLocalProfileEntry({ entity, observation: { kind: "free" } })).hero.playerName, "Changed");
  await assert.rejects(resolveLocalProfileEntry({ entity, observation: { kind: "exact", anchor: { source: scan.id, at: now, hash: scan.contentHash } } }), reject("changed"));
  await assert.rejects(resolveLocalProfileEntry({ entity: favoriteReference("player", "am1_net_p999")!, observation: { kind: "free" } }), reject("missing"));
  await updateGuildHubLocalScan(scan.id, "B.json", JSON.stringify({ players: [player(now), player(now)], groups: [] }));
  await assert.rejects(resolveLocalProfileEntry({ entity, observation: { kind: "free" } }), reject("ambiguous"));
  await assert.rejects(resolveLocalProfileEntry({ entity, observation: { kind: "free" } }, undefined, () => false), e => e instanceof DOMException && e.name === "AbortError");
  console.log("PASS reset, source/hash change, missing player, duplicate observation and abort guards");
  const db = await openDB("sfdatahub-local-data");
  const summary = await db.get("scanSummaries", scan.id);
  await db.put("scanSummaries", { ...summary, normalizerVersion: -1 });
  await assert.rejects(resolveLocalProfileEntry({ entity, observation: { kind: "free" } }), reject("unknown"));
  await db.put("scanSummaries", summary);
  await db.delete("scanSummaries", scan.id);
  await assert.rejects(resolveLocalProfileEntry({ entity, observation: { kind: "free" } }), reject("unknown"));
  await db.put("scanSummaries", summary); db.close();
  await updateGuildHubLocalScan(scan.id, "B.json", JSON.stringify({ players: Array.from({ length: 600 }, (_, i) => ({ ...player(now), identifier: `am1_net_p${i + 1}` })), groups: [] }));
  await resetHubSearchProjections([scan.id]);
  let reset: Promise<void> | undefined, triggered = false;
  IDBObjectStore.prototype.get = function (key) {
    const request = get.call(this, key);
    if (this.name === "scans" && key === scan.id && !triggered) {
      triggered = true;
      request.addEventListener("success", () => { setTimeout(() => { reset = resetHubSearchProjections([scan.id]); }, 0); });
    }
    return request;
  };
  await assert.rejects(findLocalPlayerEntryCandidates([entity]), reject("changed"));
  await reset;
  IDBObjectStore.prototype.get = function (key) { if (this.name === "scans") reads.push(String(key)); return get.call(this, key); };
  assert.equal((await resolveLocalProfileEntry({ entity, observation: { kind: "free" } })).currentSeed?.rawIdentifier, entity.identifier);
  console.log("PASS reset during cooperative preparation rejects obsolete selection and retry succeeds");
  await deleteGuildHubLocalScans([scan.id]);
  await assert.rejects(resolveLocalProfileEntry({ entity, observation: { kind: "free" } }), reject("missing"));
  const personal = await importGuildHubLocalScan("personal.json", JSON.stringify({ players: [{ ...player(old, "Personal local player"), identifier: "am1_net_p8007" }], groups: [] }));
  const local = await resolveLocalProfileEntry({ entity: favoriteReference("player", "am1_net_p8007")!, observation: { kind: "free" } });
  assert.equal(local.hero.playerName, "Personal local player"); assert.equal(local.currentSeed?.sourceScanId, personal.scan.id); assert.equal(local.analytics.scannedAtMs, old);
  assert.equal(pools, 0);
  console.log("PASS invalid/incomplete metadata stays unknown, deletion never substitutes another server, personal import, zero Raw pools");
} finally {
  IDBObjectStore.prototype.get = get; IDBObjectStore.prototype.getAll = all;
  (await openDB("sfdatahub-local-data")).close(); (await openDB("sfdatahub-guild-hub")).close();
}
