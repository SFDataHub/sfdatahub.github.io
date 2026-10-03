import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync, unzipSync } from "fflate";
import { deleteDB } from "idb";
import { createScanArchiveBuildPlanCore, buildScanArchiveBatches } from "../../src/lib/scanArchive/archiveBuilderCore.ts";
import { acquireExplicitLocalFirstArchiveScans } from "../../src/lib/scanArchive/localFirstScanAcquisition.ts";
import { toScanArchiveEntries } from "../../src/lib/scanArchive/validation.ts";
import type { ScanArchiveManifest } from "../../src/lib/scanArchive/types.ts";
import type { ScanArchiveBuilderRequest, ScanArchiveBuilderResponse } from "../../src/lib/scanArchive/scanArchiveBuilderTypes.ts";

await deleteDB("sfdatahub-local-data");
await deleteDB("sfdatahub-guild-analytics");
const encoder = new TextEncoder();
const t1 = Date.UTC(2026, 8, 19, 21);
const t2 = t1 + 1_000;
const t3 = Date.UTC(2026, 8, 20, 21);
const row = (identifier: string, timestamp: number) => ({ prefix: "f8_net", timestamp, identifier, name: identifier });
const empty: ScanArchiveManifest = { schemaVersion: 1, archiveYear: 2026, revision: 0, updatedAt: "2026-01-01T00:00:00Z", scanCount: 0, serverCount: 0, scans: [] };
const base = await createScanArchiveBuildPlanCore({ year: 2026, manifest: empty, usageMode: "create-monthly", inputBatches: buildScanArchiveBatches(JSON.stringify({ players: [row("f8_p1", t1)], groups: [row("f8_g1", t2)] }), 2026) }, {
  gzip: (content) => gzipSync(encoder.encode(content), { mtime: 0 }),
  sha256: (bytes) => createHash("sha256").update(bytes).digest("hex"),
  byteLength: (bytes) => bytes.length, utf8ByteLength: (content) => encoder.encode(content).length,
});
assert.equal(base.conflicts.length, 0);
const manifestUrl = "https://example.test/2026/manifest.json";
const entries = toScanArchiveEntries(base.manifestAfter, manifestUrl);
const rawFiles = new Map(base.files.filter((file) => file.kind === "raw").map((file) => [file.scanId, file.bytes!]));
const acquired = await acquireExplicitLocalFirstArchiveScans(entries, { dependencies: { downloadArchiveEntry: async (entry) => ({ content: new TextDecoder().decode(gunzipSync(rawFiles.get(entry.id)!)) }) } });
assert.equal(acquired.status, "complete");

let listener: (event: MessageEvent<ScanArchiveBuilderRequest>) => void;
const terminals = new Map<string, (response: ScanArchiveBuilderResponse) => void>();
let onProgress: ((response: Extract<ScanArchiveBuilderResponse, { type: "progress" }>) => void) | undefined;
Object.assign(globalThis, { self: {
  postMessage(response: ScanArchiveBuilderResponse) {
    if (response.type === "progress") onProgress?.(response);
    else terminals.get(response.requestId)?.(response);
  },
  addEventListener(_type: string, next: typeof listener) { listener = next; },
} });
await import("../../src/workers/scanArchiveBuilder.worker.ts");
const send = (request: ScanArchiveBuilderRequest) => listener({ data: request } as MessageEvent<ScanArchiveBuilderRequest>);
const run = (request: ScanArchiveBuilderRequest): Promise<ScanArchiveBuilderResponse> => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`Worker timeout: ${request.requestId}`)), 10_000);
  terminals.set(request.requestId, (response) => { clearTimeout(timeout); terminals.delete(request.requestId); resolve(response); });
  send(request);
});
let parseCount = 0;
const content = JSON.stringify({ players: [row("f8_p1", t3), row("f8_p2", t3)], groups: [row("f8_g1", t3)] });
const inputFile = { text: async () => { parseCount++; return content; } } as File;
const inspected = await run({ type: "inspect", requestId: "inspect", inputFile });
assert.equal(inspected.type, "inspected");
if (inspected.type !== "inspected") throw new Error("Inspection failed");
const buildRequest = (requestId: string, usageMode: "add-monthly" | "create-monthly" | "archive-only", manifest = base.manifestAfter): ScanArchiveBuilderRequest => ({
  type: "build", requestId, inspectionId: inspected.inspection.inspectionId, manifest,
  manifestSource: { kind: "catalog", manifestUrl, year: 2026, scanCount: manifest.scanCount }, usageMode,
});
// Add consumes locally bound raw members without network or Raw arrays crossing
// the UI/worker boundary; metadata carries the exact baseline IDs and hashes.
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Unexpected network access: bound baseline is local"); };
const added = await run(buildRequest("add", "add-monthly"));
assert.equal(added.type, "complete", JSON.stringify(added));
if (added.type !== "complete") throw new Error("Add failed");
assert.equal(added.result.blockers.length, 0);
assert.equal(added.result.monthlyTargets[0].baseMembers.length, 2);
assert.equal(added.result.monthlyTargets[0].addedPlayers, 1);
assert.equal(added.result.monthlyTargets[0].skippedPlayers, 1);
assert.equal(added.result.monthlyTargets[0].skippedGuilds, 1);
assert.equal(added.result.files.length, 2);
const zip = unzipSync(new Uint8Array(added.result.zipBytes));
const rawPath = added.result.files.find((file) => file.kind === "raw")!.relativePath;
const raw = JSON.parse(new TextDecoder().decode(gunzipSync(zip[rawPath])));
assert.equal(raw.players.length, 1);
assert.equal(raw.players[0].identifier, "f8_p2");
assert.equal(raw.groups.length, 0);

const created = await run(buildRequest("create", "create-monthly"));
assert.equal(created.type, "complete");
if (created.type !== "complete") throw new Error("Create after Add failed");
assert.equal(created.result.blockers.length, 0);
assert.equal(created.result.monthlyTargets[0].addedPlayers, 2);
assert.equal(created.result.monthlyTargets[0].addedGuilds, 1);
assert.equal(parseCount, 1);

// A discarded Build is cancelled but retains its Inspection; a queued Build
// cannot receive stale results or an aborted previous acquisition.
onProgress = (response) => {
  if (response.requestId === "discarded" && response.progress.phase === "compressing") send({ type: "discard-build", requestId: "discarded" });
};
const discarded = await run(buildRequest("discarded", "archive-only"));
assert.equal(discarded.type, "cancelled");
onProgress = undefined;
const rebuilt = await run(buildRequest("rebuilt", "create-monthly"));
assert.equal(rebuilt.type, "complete");
assert.equal(parseCount, 1);

// Fully redundant Add returns an understandable blocker and no ZIP, through
// the real worker path and production local-first acquisition.
const redundantInput = await run({ type: "inspect", requestId: "redundant-inspect", inputFile: { text: async () => JSON.stringify({ players: [row("f8_p1", t3)], groups: [row("f8_g1", t3)] }) } as File });
assert.equal(redundantInput.type, "inspected");
if (redundantInput.type !== "inspected") throw new Error("Redundant inspection failed");
const redundantRequest = buildRequest("redundant", "add-monthly");
if (redundantRequest.type !== "build") throw new Error("Expected build");
redundantRequest.inspectionId = redundantInput.inspection.inspectionId;
const redundant = await run(redundantRequest);
assert.equal(redundant.type, "complete");
if (redundant.type !== "complete") throw new Error("Redundant build failed");
assert(redundant.result.blockers.some((blocker) => blocker.code === "add_no_new_ids"));
assert.equal(redundant.result.zipBytes.byteLength, 0);
assert.equal(redundant.result.files.length, 0);
const unavailableManifest = structuredClone(base.manifestAfter);
for (const scan of unavailableManifest.scans) scan.sha256 = "f".repeat(64);
const unavailable = await run({ ...redundantRequest, requestId: "unavailable", manifest: unavailableManifest });
assert.equal(unavailable.type, "complete");
if (unavailable.type !== "complete") throw new Error("Missing-member build failed");
assert.equal(unavailable.result.blockers.length, 2);
for (const entry of entries) assert(unavailable.result.blockers.some((blocker) => blocker.code === "add_member_unavailable" && blocker.cause.includes(entry.id) && blocker.cause.includes("f8_net/2026-09")));
assert.equal(unavailable.result.zipBytes.byteLength, 0);
assert.equal(unavailable.result.files.length, 0);
const queued = run({ ...redundantRequest, requestId: "queued" });
send({ type: "discard-build", requestId: "queued" });
assert.equal((await queued).type, "cancelled");
// Actual worker inspection errors carry their cause/remedy as structured data.
const unknown = await run({ type: "inspect", requestId: "unknown-server", inputFile: { text: async () => JSON.stringify({ players: [{ ...row("unknown_p1", t3), prefix: "unknown_builder_test_net" }], groups: [] }) } as File });
assert.equal(unknown.type, "error");
if (unknown.type !== "error") throw new Error("Unknown server was not blocked");
assert.equal(unknown.blocker?.code, "server_resolution_failed");
assert.match(unknown.blocker!.cause, /players\[0\].*unknown_builder_test_net/);
assert.match(unknown.blocker!.remedy, /Aliaszuordnung/);
assert.doesNotMatch(unknown.blocker!.remedy, /JSON/);
const malformed = await run({ type: "inspect", requestId: "malformed", inputFile: { text: async () => "{" } as File });
assert.equal(malformed.type, "error");
if (malformed.type !== "error") throw new Error("Malformed JSON was not blocked");
assert.equal(malformed.blocker?.code, "input_validation_failed");
assert.match(malformed.blocker!.remedy, /SFtools-JSON.*players\[\].*groups\[\]/);

// Cancel while the file is still being read; late text cannot resurrect input.
let releaseText!: (content: string) => void;
const delayedText = new Promise<string>(resolve => { releaseText = resolve; });
onProgress = response => {
  if (response.requestId === "late-inspection" && response.progress.phase === "parsing") {
    send({ type: "cancel", requestId: "late-inspection" });
    releaseText(content);
  }
};
const late = await run({ type: "inspect", requestId: "late-inspection", inputFile: { text: () => delayedText } as File });
assert.equal(late.type, "cancelled");
onProgress = undefined;

const amTimestamp = 1788598437385;
const amPlayer = { prefix: "am1_net", identifier: "am1_net_p2940", timestamp: amTimestamp, name: "AM player" };
const amGuild = { prefix: "am1_net", identifier: "am1_net_g4", timestamp: amTimestamp, name: "AM guild" };
let amReads = 0;
const amInspection = await run({ type: "inspect", requestId: "am1-inspection", inputFile: { text: async () => { amReads++; return JSON.stringify({ players: [amPlayer], groups: [amGuild] }); } } as File });
assert.equal(amInspection.type, "inspected");
if (amInspection.type !== "inspected") throw new Error("AM1 inspection failed");
assert.deepEqual(amInspection.inspection.blockers, []);
assert.deepEqual(amInspection.inspection.servers, ["am1_net"]);
for (const usageMode of ["create-monthly", "archive-only"] as const) {
  const amBuild = await run({ type: "build", requestId: `am1-${usageMode}`, inspectionId: amInspection.inspection.inspectionId, manifest: empty, manifestSource: { kind: "catalog", manifestUrl, year: 2026, scanCount: 0 }, usageMode });
  assert.equal(amBuild.type, "complete");
  if (amBuild.type !== "complete") throw new Error("AM1 build failed");
  assert.deepEqual(amBuild.result.blockers, []);
  const archive = unzipSync(new Uint8Array(amBuild.result.zipBytes));
  const file = amBuild.result.files.find(file => file.kind === "raw")!;
  assert.match(file.relativePath, /^2026-09\/am1_net\//);
  const raw = JSON.parse(new TextDecoder().decode(gunzipSync(archive[file.relativePath])));
  assert.deepEqual(raw.players, [amPlayer]);
  assert.deepEqual(raw.groups, [amGuild]);
}
assert.equal(amReads, 1);
// Admin Create can export September 5 while keeping September 19 Current.
const historicalServers = ["f8_net", "s30_eu", "stumblesteppe_net"];
const oldTimestamp = Date.UTC(2026, 8, 5, 8);
const historicalRow = (server: string, identifier: string, timestamp: number) => ({ ...row(identifier, timestamp), prefix: server });
const currentPlan = await createScanArchiveBuildPlanCore({ year: 2026, manifest: empty, usageMode: "create-monthly", inputBatches: buildScanArchiveBatches(JSON.stringify({ players: historicalServers.map(server => historicalRow(server, `${server}_pCurrent`, t1)), groups: historicalServers.map(server => historicalRow(server, `${server}_gCurrent`, t2)) }), 2026) }, {
  gzip: content => gzipSync(encoder.encode(content), { level: 9, mtime: 0 }),
  sha256: bytes => createHash("sha256").update(bytes).digest("hex"),
  byteLength: bytes => bytes.length, utf8ByteLength: content => encoder.encode(content).length,
});
const historicalPlayers = historicalServers.map(server => historicalRow(server, `${server}_pOld`, oldTimestamp));
const historicalGuilds = historicalServers.map(server => historicalRow(server, `${server}_gOld`, oldTimestamp + 1));
const historicalInspection = await run({ type: "inspect", requestId: "historical-inspection", inputFile: { text: async () => JSON.stringify({ players: historicalPlayers, groups: historicalGuilds }) } as File });
assert.equal(historicalInspection.type, "inspected");
if (historicalInspection.type !== "inspected") throw new Error("Historical inspection failed");
const historicalRequest: Extract<ScanArchiveBuilderRequest, { type: "build" }> = { type: "build", requestId: "historical-create", inspectionId: historicalInspection.inspection.inspectionId, manifest: currentPlan.manifestAfter, manifestSource: { kind: "catalog", manifestUrl, year: 2026, scanCount: currentPlan.manifestAfter.scanCount }, usageMode: "create-monthly", allowCurrentRollback: false };
const historicalResult = await run(historicalRequest);
assert.equal(historicalResult.type, "complete");
if (historicalResult.type !== "complete") throw new Error("Historical Create failed");
assert.deepEqual(historicalResult.result.blockers, []);
assert(historicalResult.result.zipBytes.byteLength > 0);
assert.deepEqual(historicalResult.result.manifestAfter.toplists!.current, currentPlan.manifestAfter.toplists!.current);
assert.equal(historicalResult.result.toplistChanges.current.length, 0);
assert.deepEqual(historicalResult.result.warnings.filter(w => w.code === "current_preserved").map(w => w.preservedCurrent!.server).sort(), historicalServers.slice().sort());
const historicalZip = unzipSync(new Uint8Array(historicalResult.result.zipBytes));
assert.equal(Object.keys(historicalZip).length, 13);
assert.deepEqual(JSON.parse(new TextDecoder().decode(historicalZip["manifest.json"])), historicalResult.result.manifestAfter);
for (const server of historicalServers) {
  assert.deepEqual(historicalResult.result.manifestAfter.toplists!.monthly!["2026-09"][server], { scanIds: [`${server}:${oldTimestamp}`, `${server}:${oldTimestamp + 1}`] });
  const rawFiles = historicalResult.result.files.filter(file => file.kind === "raw" && file.scanId.startsWith(`${server}:`));
  const rawRows = rawFiles.map(file => JSON.parse(new TextDecoder().decode(gunzipSync(historicalZip[file.relativePath]))));
  assert.deepEqual(rawRows.flatMap(payload => payload.players), historicalPlayers.filter(row => row.prefix === server));
  assert.deepEqual(rawRows.flatMap(payload => payload.groups), historicalGuilds.filter(row => row.prefix === server));
}
// A real scan-ID conflict still blocks ZIP generation even with this policy.
const historicalConflictManifest = structuredClone(historicalResult.result.manifestAfter);
historicalConflictManifest.scans.find(scan => scan.id === `f8_net:${oldTimestamp}`)!.sha256 = "f".repeat(64);
const historicalConflict = await run({ ...historicalRequest, requestId: "historical-conflict", manifest: historicalConflictManifest });
assert.equal(historicalConflict.type, "complete");
if (historicalConflict.type !== "complete") throw new Error("Historical conflict test failed");
assert(historicalConflict.result.blockers.some(b => b.code === "scan_id_conflict"));
assert.equal(historicalConflict.result.zipBytes.byteLength, 0);
assert.deepEqual(historicalConflict.result.manifestAfter.toplists, historicalConflictManifest.toplists);

// Supplement executed Core/Worker cases with the actual notice-list binding.
const pageSource = (await import("node:fs")).readFileSync(new URL("../../src/pages/Admin/ScanArchiveBuilder.tsx", import.meta.url), "utf8");
assert.match(pageSource, /!result.blockers.length && result.warnings.some/);
assert.match(pageSource, /result.warnings.filter\(\(warning\) => warning.code === "current_preserved"\).map/);
assert.match(pageSource, /role="status"[\s\S]*?warning.message/);
globalThis.fetch = originalFetch;
console.log("scanArchiveBuilderWorker.test: ok");
