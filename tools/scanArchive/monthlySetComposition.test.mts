import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "fflate";
import { composeMonthlySet } from "../../src/lib/scanArchive/monthlySetComposition.ts";
import { deriveLocalToplistsFromConfirmedScans } from "../../src/lib/toplists/localToplistDerivation.ts";
import { LOCAL_TOPLIST_DERIVATION_VERSION, localToplistDatasetId } from "../../src/lib/toplists/localToplistStore.ts";
import { buildScanArchiveBatches, createScanArchiveBuildPlanCore } from "../../src/lib/scanArchive/archiveBuilderCore.ts";
import { loadOrBuildLocalToplistSnapshots } from "../../src/lib/toplists/localToplistService.ts";
import { createScanArchiveEntryFromToplistSelection } from "../../src/lib/scanArchive/searchIndexService.ts";
import { resolveScanArchiveMonthlyToplistScan } from "../../src/lib/scanArchive/toplistSelection.ts";
import type { ScanArchiveManifest } from "../../src/lib/scanArchive/types.ts";

const server = "f8_net", t1 = Date.UTC(2026, 8, 5, 9), t2 = t1 + 60_000, t3 = t2 + 60_000;
const sha = "a".repeat(64);
function raw(timestamp: number, size: number, available = size, level = 100, guildId = 1) {
  const save: number[] = [];
  save[0] = guildId;
  for (let i = 0; i < size; i++) { save[14 + i] = i + 1; save[64 + i] = level; save[314 + i] = i ? 3 : 1; }
  return {
    players: Array.from({ length: available }, (_, i) => ({ prefix: server, timestamp, identifier: `${server}_p${i + 1}`, playerId: i + 1, name: `P${i + 1}`, level, class: 1, guildIdentifier: `${server}_g${guildId}`, values: { Base: 1000, "Base Strength": 1000, "Base Constitution": 500 } })),
    groups: [{ prefix: server, timestamp, identifier: `${server}_g${guildId}`, name: "Guild", save }],
  };
}
function derive(payload: ReturnType<typeof raw>) {
  const timestamp = payload.groups[0].timestamp;
  const result = deriveLocalToplistsFromConfirmedScans([{ manifestYear: 2026, archiveScanId: `${server}:${timestamp}`, archiveSha256: sha, server, scanTimestamp: timestamp, localScanId: `local:${timestamp}`, rawScan: payload, confirmation: { kind: "archiveSource", archiveScanId: `${server}:${timestamp}`, archiveSha256: sha } }]);
  assert.equal(result.status, "complete");
  return { playerRows: result.players, guildRows: result.guilds };
}
for (const size of [1, 49, 50]) {
  const full = derive(raw(t1, size)), newer = derive(raw(t2, size, size, 200)), late = derive(raw(t3, size, 0));
  for (const candidates of [[full, late], [late, full]]) {
    const merged = composeMonthlySet(candidates);
    assert.equal(merged.guildRows[0].memberBasisStatus, "complete");
    assert.equal(merged.guildRows[0].avgLevel, 100);
    assert.equal(merged.guildRows[0].archiveScanId, `${server}:${t1}`);
    assert.equal(merged.playerRows.length, size);
  }
  const selected = composeMonthlySet([full, newer, late]);
  assert.deepEqual(selected, composeMonthlySet([late, newer, full]));
  assert.equal(selected.guildRows[0].avgLevel, 200);
  assert.equal(selected.guildRows[0].memberBasisCount, size);
  assert(selected.playerRows.every(row => row.scanTimestamp === t2 && row.level === 200));
}
const partial = derive(raw(t1, 49, 48)), full = derive(raw(t2, 49, 49, 200)), late = derive(raw(t3, 49, 0));
assert.equal(partial.guildRows[0].memberBasisStatus, "incomplete");
assert.equal(composeMonthlySet([partial, full, late]).guildRows[0].avgLevel, 200);
const noFull = composeMonthlySet([derive(raw(t2, 49, 48, 200)), partial, late]);
assert.equal(noFull.guildRows[0].scanTimestamp, t1);
assert.equal(noFull.guildRows[0].avgLevel, null);
assert.equal(noFull.playerRows[0].level, 100);
const extra = derive(raw(t2, 49, 49));
extra.guildRows = [];
assert.equal(composeMonthlySet([partial, extra]).playerRows.length, 49);
assert.equal(composeMonthlySet([partial, extra]).playerRows.find(row => row.playerId === "1")?.scanTimestamp, t1);
assert.equal(composeMonthlySet([partial, extra]).playerRows.find(row => row.playerId === "49")?.scanTimestamp, t2);
// Same IDs with a wrong timestamp or guild cannot complete a source.
const wrongGuild = raw(t2, 49);
wrongGuild.players[48].guildIdentifier = `${server}_g2`;
assert.equal(derive(wrongGuild).guildRows[0].memberBasisStatus, "incomplete");
assert.equal(LOCAL_TOPLIST_DERIVATION_VERSION, 4);
const encoder = new TextEncoder();
const dependencies = { gzip: (s: string) => gzipSync(encoder.encode(s), { level: 9, mtime: 0 }), sha256: (b: Uint8Array) => createHash("sha256").update(b).digest("hex"), byteLength: (b: Uint8Array) => b.length, utf8ByteLength: (s: string) => encoder.encode(s).length };
const empty: ScanArchiveManifest = { schemaVersion: 1, archiveYear: 2026, revision: 0, updatedAt: "2026-01-01T00:00:00Z", scanCount: 0, serverCount: 0, scans: [] };
const batches = (payload: ReturnType<typeof raw>) => buildScanArchiveBatches(JSON.stringify(payload), 2026);
const baseRaw = raw(t1, 49, 48), newerRaw = raw(t2, 49, 49, 200);
newerRaw.groups[0].name = "Complete winner";
const base = await createScanArchiveBuildPlanCore({ year: 2026, manifest: empty, inputBatches: batches(baseRaw), usageMode: "create-monthly" }, dependencies);
const add = await createScanArchiveBuildPlanCore({ year: 2026, manifest: base.manifestAfter, inputBatches: batches(newerRaw), usageMode: "add-monthly", loadMonthlyRawScan: async () => baseRaw }, dependencies);
assert.deepEqual(add.conflicts, []);
assert.equal(add.batches[0].players.length, 49);
assert.equal(add.batches[0].groups.length, 1);
assert.equal(add.monthlyTargets[0].updatedPlayers, 48);
assert.equal(add.monthlyTargets[0].addedPlayers, 1);
assert.equal(add.monthlyTargets[0].updatedGuilds, 1);
const archived = JSON.parse(new TextDecoder().decode(gunzipSync(add.files.find(file => file.kind === "raw")!.bytes!)));
assert.equal(derive(archived).guildRows[0].memberBasisStatus, "complete");
assert.equal(derive(archived).guildRows[0].avgLevel, 200);
// Alias duplicates must retain the exact matched member row, rather than
// taking a different raw row sharing its canonical ID but another guild.
const aliases = raw(t3, 1, 1, 300);
aliases.players.unshift({ ...aliases.players[0], identifier: "f8_p1", guildIdentifier: `${server}_g2`, level: 999 });
const aliasedAdd = await createScanArchiveBuildPlanCore({ year: 2026, manifest: add.manifestAfter, inputBatches: batches(aliases), usageMode: "add-monthly", loadMonthlyRawScan: async scan => scan.timestamp === t1 ? baseRaw : newerRaw }, dependencies);
assert.deepEqual(aliasedAdd.conflicts, []);
assert.equal(aliasedAdd.batches[0].players.length, 1);
assert.equal(aliasedAdd.batches[0].players[0].identifier, `${server}_p1`);
assert.equal(derive(aliasedAdd.batches[0] as any).guildRows[0].avgLevel, 300);
const older = await createScanArchiveBuildPlanCore({ year: 2026, manifest: add.manifestAfter, inputBatches: batches(raw(t1 - 60_000, 49)), usageMode: "add-monthly", loadMonthlyRawScan: async scan => scan.timestamp === t1 ? baseRaw : newerRaw }, dependencies);
assert(older.conflicts.some(c => c.code === "add_no_new_ids"));
assert.equal(older.files.length, 0);
const redundant = await createScanArchiveBuildPlanCore({ year: 2026, manifest: add.manifestAfter, inputBatches: batches(raw(t3, 49, 0)), usageMode: "add-monthly", loadMonthlyRawScan: async scan => scan.timestamp === t1 ? baseRaw : newerRaw }, dependencies);
assert(redundant.conflicts.some(c => c.code === "add_no_new_ids"));
assert.equal(redundant.files.length, 0);
// Create keeps every physical batch; loading its explicit reference uses the
// exact same service path as an existing archive set or a completed Add.
const combined = { players: [...baseRaw.players, ...newerRaw.players], groups: [...baseRaw.groups, ...newerRaw.groups, ...raw(t3, 49, 0).groups] };
const create = await createScanArchiveBuildPlanCore({ year: 2026, manifest: empty, inputBatches: buildScanArchiveBatches(JSON.stringify(combined), 2026), usageMode: "create-monthly" }, dependencies);
assert.deepEqual(create.conflicts, []);
const selection = resolveScanArchiveMonthlyToplistScan([create.manifestAfter], server, "2026-09");
assert.equal(selection.status, "selected");
const entries = createScanArchiveEntryFromToplistSelection(selection, { 2026: "https://example.test/manifest.json" });
const sources = new Map(create.files.filter(f => f.kind === "raw").map(f => [f.scanId, JSON.parse(new TextDecoder().decode(gunzipSync(f.bytes!)))]));
const service = await loadOrBuildLocalToplistSnapshots(entries, { dependencies: {
  acquireEntries: async es => ({ status: "complete", localScanIds: es.map(e => e.id), selectedArchives: es.map(e => ({ archiveScanId: e.id, archiveSha256: e.sha256, localScanId: e.id, status: "already-local" })), failedArchives: [], networkAccessed: false }),
  getLocalScan: async id => ({ id, contentHash: id, rawData: sources.get(id), archiveSource: { archiveScanId: id, sha256: entries.find(e => e.id === id)!.sha256 } }) as any,
  deriveInWorker: async scans => {
    const d = deriveLocalToplistsFromConfirmedScans(scans.map(source => ({ ...source, rawScan: sources.get(source.archiveScanId) })));
    return d.snapshots.map(meta => ({ ...meta, snapshotMeta: meta, playerRows: d.players.filter(p => p.archiveScanId === meta.archiveScanId), guildRows: d.guilds.filter(g => g.archiveScanId === meta.archiveScanId), issues: d.issues, localContentHash: meta.archiveScanId }));
  },
} });
assert.equal(service.status, "complete");
assert.deepEqual(service.guildRows.map(g => [g.archiveScanId, g.avgLevel]), [[`${server}:${t2}`, 200]]);
assert(service.playerRows.every(p => p.scanTimestamp === t2));
// Initialize the real view/search worker with the production service result.
let response: any;
(globalThis as any).postMessage = (message: any) => { response = message; };
await import("../../src/workers/localToplistView.worker.ts");
let requestId = 0;
const send = (message: any) => {
  response = undefined;
  (globalThis as any).onmessage({ data: { ...message, requestId: ++requestId } });
  assert.equal(response?.ok, true);
  return response;
};
const datasetId = localToplistDatasetId(entries);
send({ type: "init", datasetId, playerRows: service.playerRows, guildRows: service.guildRows });
const search = send({ type: "search", datasetId, query: "Complete winner", categories: ["guilds"] });
assert.equal(search.results.length, 1);
assert.equal(search.results[0].identifier, "f8__1");
assert.equal(search.results[0].label, "Complete winner");
const view = send({ type: "view", datasetId, tab: "guilds", filters: {}, sort: { metricKey: "guildAvgLevel", direction: "desc" }, page: 1, pageSize: 10 });
assert.equal(view.guildRows[0].avgLevel, 200);
assert.equal(view.guildRows[0].archiveScanId, `${server}:${t2}`);
console.log("monthlySetComposition.test: ok");
