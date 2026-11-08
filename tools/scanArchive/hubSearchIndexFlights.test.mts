import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { loadScanArchiveSearchIndexSet, __scanArchiveSearchIndexServiceTestUtils as utils } from "../../src/lib/scanArchive/searchIndexService.ts";
import { putGuildHubArchiveSearchIndexCache } from "../../src/lib/guilds/localScanLibrary.ts";
import type { ScanArchiveEntry, ScanArchiveSearchIndexPayload } from "../../src/lib/scanArchive/types.ts";
const entry: ScanArchiveEntry = { id: "shared", server: "f8_net", timestamp: Date.UTC(2026, 9, 6), archiveYear: 2026, manifestRevision: 1,
  manifestUrl: "https://fixture.invalid/manifest.json", fileUrl: "https://fixture.invalid/shared.gz", path: "shared.gz", format: "sftools.raw.v1", compression: "gzip", sha256: "a".repeat(64),
  compressedBytes: 1, uncompressedBytes: 1, playerCount: 1, groupCount: 0,
  searchIndex: { schemaVersion: 1, path: "shared.index.gz", sha256: "b".repeat(64), compressedBytes: 1, uncompressedBytes: 1, playerCount: 1, groupCount: 0 } };
const payload: ScanArchiveSearchIndexPayload = { schemaVersion: 1, archiveScanId: entry.id, sourceSha256: entry.sha256, server: entry.server, timestamp: entry.timestamp,
  players: [{ name: "Player", identifier: "f8_net_p1" }], guilds: [] };
let release!: () => void, downloads = 0, cancellations = 0;
const gate = new Promise<void>(r => release = r);
const dependencies = { getCache: async () => null, putCache: putGuildHubArchiveSearchIndexCache,
  downloadSearchIndex: async (_entry: ScanArchiveEntry, signal?: AbortSignal) => { downloads++; signal?.addEventListener("abort", () => cancellations++); await gate; return payload; } };
const first = new AbortController(), second = new AbortController();
const a = loadScanArchiveSearchIndexSet([entry], { dependencies, signal: first.signal });
const b = loadScanArchiveSearchIndexSet([entry], { dependencies, signal: second.signal });
await new Promise(r => setTimeout(r, 15)); first.abort(); release();
const [one, two] = await Promise.all([a, b]);
assert.equal(one.failedIndexes[0].errorCode, "aborted"); assert.equal(two.loadedIndexes.length, 1);
assert.equal(downloads, 1); assert.equal(cancellations, 0); assert.equal(utils.inFlightCount(), 0);
console.log("PASS first consumer detaches without aborting second consumer; one download, terminal flight cleanup");
let failed = false;
const retryDeps = { ...dependencies, downloadSearchIndex: async () => { if (!failed) { failed = true; throw Error("network error"); } return payload; } };
assert.equal((await loadScanArchiveSearchIndexSet([entry], { dependencies: retryDeps })).failedIndexes.length, 1);
assert.equal((await loadScanArchiveSearchIndexSet([entry], { dependencies: retryDeps })).loadedIndexes.length, 1);
assert.equal(utils.inFlightCount(), 0);
console.log("PASS failed flight has no permanent veto; same scope retry succeeds");
let rejectGate!: (e: Error) => void;
const lastDeps = { ...dependencies, downloadSearchIndex: async (_: ScanArchiveEntry, signal?: AbortSignal) => new Promise<ScanArchiveSearchIndexPayload>((_, reject) => {
  rejectGate = reject; signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
}) };
const last = new AbortController(); const abandoned = loadScanArchiveSearchIndexSet([entry], { dependencies: lastDeps, signal: last.signal });
await new Promise(r => setTimeout(r, 10)); last.abort(); await abandoned;
assert.equal(utils.inFlightCount(), 0); rejectGate(new Error("late completion"));
console.log("PASS last consumer releases worker flight immediately; late rejection is consumed");
const older = { ...entry, id: "older", timestamp: entry.timestamp - 86400000, searchIndex: { ...entry.searchIndex!, sha256: "c".repeat(64) } };
const occurrences = await loadScanArchiveSearchIndexSet([entry, older], { dependencies: { ...dependencies, downloadSearchIndex: async e => ({ ...payload, archiveScanId: e.id, timestamp: e.timestamp }) } });
assert.equal(occurrences.searchSet.search("Player").length, 1);
assert.equal(occurrences.searchSet.search("Player", { preserveOccurrences: true }).length, 2);
assert.equal(occurrences.searchSet.getOccurrences().length, 2);
console.log("PASS legacy dedupe preserved; Dashboard retains nonmatching alternatives through complete slim occurrence contract");
