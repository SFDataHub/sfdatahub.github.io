import { artifactPath } from '../codex/workspace.mjs';
import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { openDB } from "idb";
import { writeFileSync } from "node:fs";
import { seedLocalSourceValidityFixture } from "./localSourceValidityFixture.mts";
import { HubSearchController, defaultHubSearchQuery } from "../../src/lib/data-hub/hubSearchService.ts";
import { buildHubSearchProjection, HUB_SEARCH_KEY_PREFIX, HUB_SEARCH_PROJECTION_VERSION, isHubSearchProjectionCurrent } from "../../src/lib/data-hub/hubSearchProjection.ts";
import { readHubSearchAppearance, searchClassId } from "../../src/lib/data-hub/hubSearchAppearance.ts";
import { constrainHubSearchQuery } from "../../src/lib/data-hub/useHubSearch.ts";
import { HubSearchRecentsStore, HUB_SEARCH_RECENTS_KEY, hubRecentKey, recentFromHubHit, parseHubSearchRecent, type HubRecentEntity } from "../../src/lib/data-hub/hubSearchRecents.ts";
import * as scans from "../../src/lib/guilds/localScanLibrary.ts";
import { resolveHubSearchTarget } from "../../src/lib/data-hub/hubTargetResolver.ts";

const at = Date.UTC(2026, 9, 9), oldAt = at - 86400000;
const save = Array<number>(70).fill(0); save[8] = 1; save[9] = 403; save[10] = 2; save[11] = 3; save[13] = 2; save[14] = 1; save[18] = 1; save[19] = 1; save[20] = 1;
const portrait = readHubSearchAppearance("player", { save, saveVersion: 2 });
assert.equal(portrait.classId, 1); assert.equal(portrait.portrait?.hair, 3); assert.equal(portrait.portrait?.hairColor, 4);
const legacy = Array<number>(710).fill(0); legacy[17] = 2; legacy[18] = 302; legacy[27] = 8; legacy[28] = 2; legacy[29] = 2;
assert.equal(readHubSearchAppearance("player", { save: legacy, own: 1 }).portrait?.race, 8);
assert.equal(readHubSearchAppearance("player", { save: [1], class: 2 }).portrait, null);
assert.equal(readHubSearchAppearance("player", { save: save.map((v, i) => i === 19 ? 0 : v), saveVersion: 2 }).portrait, null);
assert.equal(searchClassId("Mage"), 2); assert.equal(searchClassId(999), null);
assert.equal(readHubSearchAppearance("guild", {}, "not-coa").coaString, null);

let storageValue: string | null = null, writes = 0;
const memory = { getItem: (key: string) => { assert.equal(key, HUB_SEARCH_RECENTS_KEY); return storageValue; }, setItem: (key: string, value: string) => { assert.equal(key, HUB_SEARCH_RECENTS_KEY); storageValue = value; writes++; } };
const recents = new HubSearchRecentsStore(() => memory);
assert.equal(recents.getSnapshot().entries.length, 0); assert.equal(writes, 0);
recents.add({ kind: "query", text: "  Two   words " }); recents.add({ kind: "query", text: "two words" });
assert.equal(recents.getSnapshot().entries.length, 1);
const entity: HubRecentEntity = { kind: "entity", entityKind: "player", identifier: "f8_net_p39", serverNamespace: "f8", name: "Old name", anchor: null };
recents.add(entity);
for (let i = 0; i < 25; i++) recents.add({ kind: "query", text: `Query ${i}` });
recents.add(entity); assert.equal(recents.getSnapshot().entries.length, 20);
recents.remove(hubRecentKey(entity)); assert.equal(recents.getSnapshot().entries.length, 19);
assert.deepEqual(new HubSearchRecentsStore(() => memory).getSnapshot().entries, recents.getSnapshot().entries);
const beforeReads = writes; recents.getSnapshot(); recents.getSnapshot(); assert.equal(writes, beforeReads);
const failing = new HubSearchRecentsStore(() => ({ getItem() { throw Error("blocked"); }, setItem() { throw Error("quota"); } }));
failing.add(entity); assert.equal(failing.getSnapshot().entries.length, 1); assert.equal(failing.getSnapshot().error, true);
assert.equal(parseHubSearchRecent({ ...entity, identifier: "f8_net_p1", serverNamespace: "f9" }), null);
const clean = parseHubSearchRecent({ ...entity, rawData: { private: true }, portrait: save });
assert(clean); assert(!JSON.stringify(clean).includes("rawData")); assert(!JSON.stringify(clean).includes("portrait"));
const withImage = parseHubSearchRecent({ ...entity, appearance: { ...portrait, portrait: { ...portrait.portrait, save, profile: { private: true } }, emblemUrl: "https://drive.google.com/private" } });
assert(withImage?.kind === "entity" && withImage.appearance?.portrait);
assert(!JSON.stringify(withImage).includes('"save"')); assert(!JSON.stringify(withImage).includes('"profile"')); assert(!JSON.stringify(withImage).includes('drive.google'));
const imageStore = new HubSearchRecentsStore(() => memory); imageStore.add(withImage);
assert.deepEqual(new HubSearchRecentsStore(() => memory).getSnapshot().entries[0], withImage);
assert.equal(parseHubSearchRecent({ ...entity, appearance: { invalid: true } })?.kind, "entity", "bad image data keeps a valid legacy reference usable with placeholder");
for (const rawRecord of ["{broken", "x".repeat(64_001), JSON.stringify({ version: 999, entries: [] })]) {
  const damaged = new HubSearchRecentsStore(() => ({ getItem: () => rawRecord, setItem: () => { throw Error("render must never write"); } }));
  assert.equal(damaged.getSnapshot().entries.length, 0); assert.equal(damaged.getSnapshot().error, true);
}
const boundedStore = new HubSearchRecentsStore(() => ({ getItem: () => JSON.stringify({ version: 1, entries: [null, { ...entity, serverNamespace: "f9" }, ...Array.from({ length: 500 }, (_, i) => ({ kind: "query", text: `Stored ${i}` }))] }), setItem: () => { throw Error("render must never write"); } }));
assert.equal(boundedStore.getSnapshot().entries.length, 20); assert.equal(boundedStore.getSnapshot().error, false);

const restored = { ...defaultHubSearchQuery, text: "kept", mode: "toplist" as const, kind: "guild" as const, scope: { kind: "historical" as const, from: "2026-01", to: "2026-09", server: "F8" } };
assert.deepEqual(constrainHubSearchQuery(restored, undefined, true), { ...restored, kind: "both", scope: { kind: "current" } });
assert.deepEqual(constrainHubSearchQuery(restored, "player", true), { ...restored, kind: "player", mode: "profile" });

const players = Array.from({ length: 40 }, (_, i) => ({ identifier: `f8_net_p${i}`, prefix: "f8_net", name: `Player ${i.toString().padStart(2, "0")}`, timestamp: at, class: 1, save, saveVersion: 2 }));
const raw = { players: [...players, { ...players[0], name: "Earlier", timestamp: oldAt }], groups: [
  { identifier: "f8_net_g1", prefix: "f8_net", name: "Guild", timestamp: oldAt, coaString: "0000000000000000000000" },
  { identifier: "f8_net_g1", prefix: "f8_net", name: "Guild", timestamp: at, coaString: "1111111111111111111111" },
] };
const { scan, summary } = await seedLocalSourceValidityFixture({ id: "w24-migration", filename: "fixture.json", contentHash: "same-raw-hash", importedAt: new Date(at).toISOString(), scannedAt: null, servers: ["f8_net"], playerCount: 41, groupCount: 2, rawData: raw });
const db = await openDB("sfdatahub-local-data");
const inv = await scans.readHubSearchProjectionInventory();
const projection = buildHubSearchProjection(scan, scans.readGuildHubSearchRows(scan), inv.resetFor(scan.id));
assert.equal(HUB_SEARCH_PROJECTION_VERSION, 2);
assert.equal(projection.documents.find(d => d.name === "Earlier")?.at, oldAt);
assert.deepEqual(projection.documents.filter(d => d.kind === "guild").map(d => d.appearance.coaString), ["0000000000000000000000", "1111111111111111111111"]);
assert(!JSON.stringify(projection).includes('"save"'));
const oldProjection = { ...projection, version: 1, documents: projection.documents.map(({ appearance: _appearance, ...d }) => d) };
await db.put("metadata", { key: HUB_SEARCH_KEY_PREFIX + scan.id, value: oldProjection, updatedAt: new Date(at).toISOString() });
const sourceBefore = await db.get("scans", scan.id), summaryBefore = await db.get("scanSummaries", scan.id);
let reads = 0, commits = 0;
const dependencies = { loadArchive: async () => ({ entries: [], failed: 0, unknown: 0 }),
  readRaw: async (id: string) => { reads++; return scans.readGuildHubLocalScanForSearch(id); },
  putProjection: async (...args: Parameters<typeof scans.putHubSearchProjection>) => { commits++; return scans.putHubSearchProjection(...args); } };
const wait = async (c: HubSearchController) => { for (let i = 0; i < 1000; i++) { if (!c.getSnapshot().local.preparing && !c.getSnapshot().archive.preparing) return; await new Promise(r => setTimeout(r, 5)); } throw Error("preparation timeout"); };
const controller = new HubSearchController(dependencies); controller.start({ ...defaultHubSearchQuery, text: "Player" }); await wait(controller);
assert.equal(reads, 1); assert.equal(commits, 1);
const migrated = (await scans.readHubSearchProjectionInventory()).projections.get(scan.id)!;
assert.equal(migrated.version, 2); assert(isHubSearchProjectionCurrent(migrated, summary, scan.contentHash, inv.resetFor(scan.id)));
assert.deepEqual(await db.get("scans", scan.id), sourceBefore); assert.deepEqual(await db.get("scanSummaries", scan.id), summaryBefore);
const migration = { rawReads: reads, projectionWrites: commits, projectionBytes: controller.costs.projectionBytes };
controller.dispose();
const warm = new HubSearchController(dependencies); warm.start({ ...defaultHubSearchQuery, text: "Player" }); await wait(warm);
assert.equal(warm.getSnapshot().hits.length, 30); assert(!warm.getSnapshot().hits.some(hit => hit.reference?.identifier === entity.identifier));
const resolved = await warm.resolveRecent(entity); assert(resolved); assert.equal(resolved.hit.reference?.identifier, entity.identifier);
const toplist = await resolveHubSearchTarget(resolved.hit, { mode: "toplist", allowed: () => warm.isHitCurrent(resolved.hit), accessAllowed: () => true });
assert.equal(toplist.state.hubToplistTarget?.identifiers[0], entity.identifier);
const exact = recentFromHubHit(warm.getSnapshot().hits[0], warm.getSnapshot().hits[0].occurrences.find(o => o.at === oldAt))!;
assert.equal(exact.anchor?.kind, "local");
const exactResolved = await warm.resolveRecent(exact); assert(exactResolved?.occurrence); assert.equal(exactResolved.occurrence.at, oldAt);
const target = await resolveHubSearchTarget(exactResolved.hit, { mode: "profile", historical: exactResolved.occurrence, allowed: () => warm.isHitCurrent(exactResolved.hit), accessAllowed: () => true });
assert.equal(new URLSearchParams(target.path.split("?")[1]).get("at"), String(oldAt));
const missingExact = { ...exact, anchor: { ...exact.anchor!, kind: "local" as const, source: scan.id, row: "missing-row", at: oldAt, hash: scan.contentHash } };
assert.equal(await warm.resolveRecent(missingExact), null);
for (const text of ["x", "", "Player", "Unrelated", "39"]) warm.setQuery({ ...defaultHubSearchQuery, text });
assert(await warm.resolveRecent(entity)); assert.equal(reads, 1); assert.equal(commits, 1);
const stable = { rawReads: reads - migration.rawReads, projectionWrites: commits - migration.projectionWrites };
await scans.updateGuildHubLocalScan(scan.id, "renamed.json", JSON.stringify({ ...raw, players: raw.players.map(p => p.identifier === entity.identifier ? { ...p, name: "Renamed target" } : p) }));
await wait(warm);
const renamed = await warm.resolveRecent(entity); assert(renamed); assert.equal(renamed.hit.name, "Renamed target");
assert.equal(await warm.resolveRecent(exact), null, "changed exact source hash cannot silently open a newer observation");
await scans.deleteGuildHubLocalScans([scan.id]); await wait(warm);
assert.equal(await warm.resolveRecent(entity), null); warm.dispose();

// A held fresh-lookup reply cannot outlive query/source/controller generations.
const seeded = await seedLocalSourceValidityFixture({ ...scan, id: "w24-race" });
const race = new HubSearchController({ ...dependencies }); race.start(defaultHubSearchQuery); await wait(race);
let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
const delayed = new HubSearchController({ ...dependencies, readProjections: async () => { await gate; return scans.readHubSearchProjectionInventory(); } });
delayed.start(defaultHubSearchQuery); release(); await wait(delayed);
let releaseRead!: () => void; const held = new Promise<void>(resolve => { releaseRead = resolve; });
const reader = new HubSearchController({ ...dependencies, readProjections: async () => { if (holding) await held; return scans.readHubSearchProjectionInventory(); } });
let holding = false; reader.start(defaultHubSearchQuery); await wait(reader); holding = true;
const late = reader.resolveRecent(entity); reader.dispose(); releaseRead(); assert.equal(await late, null);
race.dispose(); delayed.dispose(); await scans.deleteGuildHubLocalScans([seeded.scan.id]); db.close();
writeFileSync(artifactPath("tmp/w24/presentation-node-results.json"), JSON.stringify({ versionBefore: 1, versionAfter: 2, migration, warmOpeningAndQueriesAndRecentLookup: stable,
  groups: ["minimal appearance/saveversions/fallbacks", "mixed 20 recents/dedupe/remove/reload/storage error", "stored v1 automatic renewal with unchanged Raw/Summary", "query-independent 31st+ reference / short query / renamed entity", "exact observation / changed hash / missing locator / delete", "late reference response after dispose"] }, null, 2) + "\n");
console.log("PASS W24 appearance, Recents, stored-version automatic renewal, warm costs, fresh reference targets and races");
