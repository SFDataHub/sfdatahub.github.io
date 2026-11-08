import assert from "node:assert/strict";
import { buildGuildScanDetails } from "../../src/pages/GuildHub/dashboardScanDetails.ts";
import { loadIdentityResolutionSnapshot } from "../../src/lib/identities/identityResolution.ts";
import { linkGuildAliases } from "../../src/lib/identities/guildIdentityStore.ts";
import "fake-indexeddb/auto";
import type { GuildHubScanSummary } from "../../src/lib/guilds/localScanLibrary.ts";
import type { ScanArchiveEntry, ScanArchiveSearchIndexPayload } from "../../src/lib/scanArchive/types.ts";
const now = Date.UTC(2026, 9, 6), older = now - 31 * 86400000;
const guild = { name: "Selected", server: "F8", guildId: "48", logoIdentifier: "f8_net_g48" };
function summary(id: string, identifier: string, at: number): GuildHubScanSummary {
  return { sourceScanId: id, filename: id + ".json", importedAtIso: new Date(now).toISOString(), scannedAt: new Date(at).toISOString(), lastSnapshotTimestamp: at, analyticsEnabled: true, contentHash: id,
    guilds: [{ guildIdentifier: identifier, guildId: identifier, name: "Selected", server: identifier.startsWith("f7") ? "F7" : "F8", sourceScannedAt: new Date(at).toISOString(), memberCount: 50, hofRank: 2 }], playerCount: 100, guildCount: 2, logicalScanCount: 1 } as GuildHubScanSummary;
}
const current = { sourceScanId: "current", scannedAtMs: now };
let summaries = [summary("current", "f8_net_g48", now), summary("same-time", "f8_net_g48", now), summary("old", "f8_net_g47", older), summary("other", "f8_net_g99", now), summary("other-server", "f7_net_g48", now)];
let rows = buildGuildScanDetails({ guild, summaries, identities: null, current, comparisons: [] });
assert.deepEqual(rows.map(r => r.sourceScanId).sort(), ["current", "same-time"]);
assert.equal(rows.filter(r => r.current).length, 1);
assert(rows.every(r => r.comparisons.length === 0));
await linkGuildAliases("f8_net_g48", "f8_net_g47", { source: "manual" });
await linkGuildAliases("f8_net_g48", "f7_net_g48", { source: "manual" });
const identities = await loadIdentityResolutionSnapshot();
rows = buildGuildScanDetails({ guild, summaries, identities, current, comparisons: [{ sourceScanId: "old", scannedAtMs: older, guildIdentifier: "f8_g47", label: "ranking" }] });
assert.equal(rows.length, 4);
assert.deepEqual(rows.find(r => r.sourceScanId === "old")?.comparisons, ["ranking"]);
assert.equal(rows.find(r => r.sourceScanId === "same-time")?.current, false);
assert(!rows.some(r => r.sourceScanId === "other"));
// Preserve per-guild observation times in a merged file, not just its last time.
const merged = summary("merged", "f8_net_g48", older);
merged.guilds.push({ ...merged.guilds[0], sourceScannedAt: new Date(now).toISOString() });
merged.lastSnapshotTimestamp = now;
rows = buildGuildScanDetails({ guild, summaries: [merged], identities, current: { sourceScanId: "merged", scannedAtMs: older }, comparisons: [{ sourceScanId: "merged", scannedAtMs: now, label: "transfer" }] });
assert.equal(rows.length, 2);assert.equal(rows.find(r => r.current)?.at, older);assert.deepEqual(rows.find(r => r.at === now)?.comparisons, ["transfer"]);
const entry = { id: "archive", sha256: "abc", timestamp: older, server: "f8_net", path: "archive.json.gz", playerCount: 100, groupCount: 2 } as ScanArchiveEntry;
const payload = { guilds: [{ identifier: "f8_net_g47", name: "Historical" }] } as ScanArchiveSearchIndexPayload;
rows = buildGuildScanDetails({ guild, summaries, identities, current, comparisons: [], cachedIndexes: [{ entry, payload }] });
assert.equal(rows.filter(r => !r.local).length, 1);
assert(rows.filter(r => !r.local).every(r => !r.current && r.comparisons.length === 0));
// Only an explicit, content-bound archive binding merges an archive occurrence.
summaries[2].archiveBindings = [{ archiveScanId: "archive", sha256: "abc", localScanId: "old", localContentHash: "wrong" }] as any;
rows = buildGuildScanDetails({ guild, summaries, identities, current, comparisons: [], cachedIndexes: [{ entry, payload }] });assert.equal(rows.filter(r => !r.local).length, 1);
summaries[2].archiveBindings[0].localContentHash = "old";
rows = buildGuildScanDetails({ guild, summaries, identities, current, comparisons: [], cachedIndexes: [{ entry, payload }] });assert.equal(rows.filter(r => !r.local).length, 0);
assert.deepEqual(buildGuildScanDetails({ guild, summaries: [], identities, current, comparisons: [] }), []);
const switched = { ...guild, guildId: "99", logoIdentifier: "f8_net_g99" };
rows = buildGuildScanDetails({ guild: switched, summaries, identities, current, comparisons: [] });assert.deepEqual(rows.map(r => r.sourceScanId), ["other"]);
// Missing times remain unknown and acquire neither stand marker.
const unknown = summary("unknown", "f8_net_g48", now);unknown.guilds[0].sourceScannedAt = null;unknown.lastSnapshotTimestamp = null;unknown.scannedAt = null;
rows = buildGuildScanDetails({ guild, summaries: [unknown], identities, current, comparisons: [] });assert.equal(rows[0].at, null);assert.equal(rows[0].current, false);
console.log("PASS guild scan details: scope, confirmed aliases, same-time sources, merged observations, exact markers, archive bindings, empty/missing and selection changes");

// Slice membership is proof for this guild; unrelated file timestamps are not.
const bundled = summary("bundle", "f8_net_g48", now);
bundled.snapshotTimestamps = [older, older - 86400000, now];
bundled.fusionInventorySlices = [{ timestampMs: older, server: "F8", guildIdentifiers: ["f8_net_g48"], sourceScanFilename: "old.json", sourceImportedAt: "2026-10-01" }, { timestampMs: older - 86400000, server: "F8", guildIdentifiers: ["f8_net_g99"] }] as any;
rows = buildGuildScanDetails({ guild, summaries: [bundled], identities, current: { sourceScanId: "bundle", scannedAtMs: now }, comparisons: [] });
assert.deepEqual(rows.map(r => r.at), [now, older]);assert.equal(rows[1].memberCount, null);
rows = buildGuildScanDetails({ guild, summaries: [bundled], identities, current: { sourceScanId: "bundle", scannedAtMs: older + 1 }, currentGuild: { name: "Selected", server: "F8", memberCount: 40, hofRank: 3 }, comparisons: [{ sourceScanId: "bundle", scannedAtMs: older + 2, guildIdentifier: "f8_net_g48", label: "ranking" }] });
assert.equal(rows.find(r => r.current)?.at, older + 1);assert.deepEqual(rows.find(r => r.at === older + 2)?.comparisons, ["ranking"]);

// W68 correction: full confirmed F28 identity, including pre-fusion spellings.
const f28 = { name: "Welten im Wandel", server: "F28", guildId: "9108", logoIdentifier: "f28_net_g9108" };
await linkGuildAliases("f28_g9108", "eu3_g1", { source: "automatic" });
await linkGuildAliases("eu3_g1", "eu1_g1033", { source: "imported" });
const fullIdentity = await loadIdentityResolutionSnapshot();
const f28Summary = summary("f28-now", "f28_net_g9108", now);f28Summary.guilds[0].server = "F28";
const preFusion = summary("pre-fusion", "s3_eu_g1", older);preFusion.guilds[0].server = "EU3";preFusion.guilds[0].name = "Welten im Wandel (alt)";
const olderFusion = summary("pre-fusion-2", "s1_eu_g1033", older-86400000);olderFusion.guilds[0].server = "EU1";
const unrelated = summary("same-name-other-id", "s3_eu_g2", older);unrelated.guilds[0].server = "EU3";unrelated.guilds[0].name = f28.name;
const f28Input = { guild: f28, summaries: [f28Summary,preFusion,olderFusion,unrelated], identities: fullIdentity, current: { sourceScanId: "f28-now", scannedAtMs: now, guildIdentifier: "f28_g9108" }, comparisons: [{sourceScanId:"pre-fusion",scannedAtMs:older,guildIdentifier:"eu3_g1",label:"ranking"}] };
rows = buildGuildScanDetails(f28Input);
assert.deepEqual(rows.map(r=>r.sourceScanId),["f28-now","pre-fusion","pre-fusion-2"]);
assert.deepEqual(rows.map(r=>[r.guildIdentifier,r.server]),[["f28_net_g9108","F28"],["s3_eu_g1","EU3"],["s1_eu_g1033","EU1"]]);
assert.deepEqual(rows[1].comparisons,["ranking"]);assert(rows[0].current);
const oldArchive = {...entry,id:"pre-fusion-archive",server:"s3_eu",timestamp:older-2*86400000};
rows=buildGuildScanDetails({...f28Input,cachedIndexes:[{entry:oldArchive,payload:{...payload,guilds:[{identifier:"s3_eu_g1",name:"Historical"}]}}]});
assert(rows.some(r=>!r.local&&r.guildIdentifier==="s3_eu_g1"&&r.server==="s3_eu"));
assert.deepEqual(buildGuildScanDetails({...f28Input,identities:null,comparisons:[]}).map(r=>r.sourceScanId),["f28-now"]);
console.log("PASS complete confirmed identity: f28_net/f28, eu3/s3_eu, transitive EU1 alias, historical server/identifier, archive, unrelated same-name exclusion");
