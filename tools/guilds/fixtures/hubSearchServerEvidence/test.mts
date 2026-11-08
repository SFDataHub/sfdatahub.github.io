import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { openDB } from "idb";
import { seedLocalSourceValidityFixture } from "../../localSourceValidityFixture.mts";
import { buildHubSearchProjection, isHubSearchProjectionCurrent, HUB_SEARCH_PARSER_VERSION } from "../../../../src/lib/data-hub/hubSearchProjection.ts";
import { readGuildHubSearchRows, readHubSearchProjectionInventory, readGuildHubLocalScanForSearch } from "../../../../src/lib/guilds/localScanLibrary.ts";
import { HubSearchController, defaultHubSearchQuery } from "../../../../src/lib/data-hub/hubSearchService.ts";
import { resolveHubSearchTarget, parseHubToplistCommand } from "../../../../src/lib/data-hub/hubTargetResolver.ts";
import { resolveLocalProfileEntry } from "../../../../src/lib/data-hub/localProfileEntry.ts";
import { parseObservation } from "../../../../src/lib/data-hub/routes.ts";
import { readGuildScanMemberIdentity } from "../../../../src/lib/guilds/guildScanNormalizer.ts";

const at = Date.UTC(2026, 9, 17), later = at + 1000;
const player = (identifier: string, extra = {}) => ({ identifier, name: "Evidence Player", timestamp: at, ...extra });
assert.equal(readGuildScanMemberIdentity(player("F29_NET_P42"))?.memberRef, "f29_net_p42");
const { scan, summary } = await seedLocalSourceValidityFixture({ id: "server-evidence", contentHash: "server-evidence-hash",
  filename: "evidence.json", importedAt: new Date(at).toISOString(), scannedAt: null, servers: ["F29"], playerCount: 1, groupCount: 0,
  rawData: { players: [player("f29_net_p42", { groupname: "EU5 ENDGEGNER" })], groups: [] } });
function project(players: unknown[], groups: unknown[] = [], root = {}) {
  const input = { ...scan, rawData: { ...root, players, groups } };
  return buildHubSearchProjection(input, readGuildHubSearchRows(input), "[]").documents;
}
for (const groupname of ["ENDGEGNER", "EU5 ENDGEGNER", "F28 ENDGEGNER"]) {
  const docs = project([player("f29_net_p42", { groupname }), player("eu5_net_p42", { groupname })]);
  assert.deepEqual(docs.map(d => d.reference?.serverNamespace), ["f29", "eu5"]);
}
assert.equal(project([player("f29_net_p42", { group: "ENDGEGNER" })])[0].reference?.serverNamespace, "f29");
assert.equal(project([player("f29_net_p42", { server: "EU5" })])[0].reference, null);
assert.equal(project([player("f29_net_p42", { server: "F29", prefix: "EU5" })])[0].reference, null);
assert.equal(project([player("f29_net_p42", { latest: { values: { Server: "EU5" } } })])[0].reference, null);
assert.equal(project([player("f29_net_p42", { prefix: "f29.sfgame.net" })])[0].reference?.serverNamespace, "f29");
assert.equal(project([player("42", { groupname: "F29 ENDGEGNER" })])[0].reference, null);
assert.equal(project([player("42")], [], { prefix: "f29_net" })[0].reference?.serverNamespace, "f29");
assert.equal(project([player("42")], [], { prefix: "not-a-server" })[0].reference, null);
assert.equal(project([player("42")], [], { prefix: "F29", server: "EU5" })[0].reference, null);
assert.equal(project([player("42"), player("f29_net_p1")])[0].reference?.serverNamespace, "f29");
const mixed = [player("42"), player("f29_net_p1"), player("eu5_net_p1")];
assert.equal(project(mixed, [], { prefix: "f29_net" })[0].reference, null);
const sections = project([player("42"), player("f29_net_p1"), player("eu5_net_p1", { timestamp: later })], [], { prefix: "EU5" });
assert.equal(sections[0].reference?.serverNamespace, "f29");
assert.equal(project([player("42", { timestamp: undefined }), player("f29_net_p1"), player("eu5_net_p1")])[0].reference, null);
assert.equal(project([player("42", { group: "f29_net_g9" })])[0].reference?.serverNamespace, "f29");
assert.equal(project([player("f29_net_p42", { guild: "123" })])[0].guildIdentifier, null);
assert.equal(project([player("f29_net_p42", { guildIdentifier: "f29_net_g9" })])[0].guildIdentifier, "f29_net_g9");
assert.equal(project([], [{ identifier: "eu5_net_g9", name: "ENDGEGNER" }])[0].reference?.serverNamespace, "eu5");
assert.equal(project([], [{ identifier: "eu5_net_g9", prefix: "F29", name: "ENDGEGNER" }])[0].reference, null);
console.log("PASS physical refs, same guild names, explicit conflicts, aliases, incomplete refs and single/mixed sections");

// Seed the real old parser contract. The regular controller must replace it,
// then reuse the current projection without another Raw read.
const old = buildHubSearchProjection(scan, readGuildHubSearchRows(scan), "[]");
old.parserVersion = "memberIdentity:1/logicalSnapshots:1/guildIdentity:1";
old.documents[0].reference = null;
assert(!isHubSearchProjectionCurrent(old, summary, scan.contentHash, "[]"));
const db = await openDB("sfdatahub-local-data");
await db.put("metadata", { key: "hub-search:source:" + scan.id, value: old, updatedAt: new Date().toISOString() });
let rawReads = 0;
const controller = new HubSearchController({ loadArchive: async () => ({ entries: [], failed: 0, unknown: 0 }),
  readRaw: async id => { rawReads++; return readGuildHubLocalScanForSearch(id); } });
controller.start({ ...defaultHubSearchQuery, text: "Evidence Player" });
for (let i = 0; controller.getSnapshot().local.preparing && i < 500; i++) await new Promise(r => setTimeout(r, 10));
assert.equal(controller.getSnapshot().local.ready, 1);
const hit = controller.getSnapshot().hits[0];
assert.equal(hit.reference?.serverNamespace, "f29"); assert.equal(hit.identity, "literal");
const current = (await readHubSearchProjectionInventory()).projections.get(scan.id)!;
assert.equal(current.parserVersion, HUB_SEARCH_PARSER_VERSION);
assert.equal(rawReads, 1);
await controller.refreshLocal(); assert.equal(rawReads, 1);
const profile = await resolveHubSearchTarget(hit, { mode: "profile", historical: hit.occurrences[0], allowed: () => true, accessAllowed: () => true });
assert(profile.path.includes("/f29/"));
assert.equal(new URLSearchParams(profile.path.split("?")[1]).get("source"), scan.id);
assert.equal(new URLSearchParams(profile.path.split("?")[1]).get("row"), "f29_net_p42");
const opened = await resolveLocalProfileEntry({ entity: hit.reference!, observation: parseObservation("?" + profile.path.split("?")[1]) });
assert.equal(opened.sourcePlayerKey, "f29_net_p42");
assert.equal(opened.currentSeed?.rawIdentifier, "f29_net_p42");
const toplist = await resolveHubSearchTarget(hit, { mode: "toplist", allowed: () => true, accessAllowed: () => true });
const command = parseHubToplistCommand(toplist.state.hubToplistTarget)!;
assert.equal(command.server, "F29"); assert.deepEqual(command.identifiers, ["f29_net_p42"]);
controller.dispose(); db.close();
console.log("PASS old projection auto-renewal, warm reuse, unmatched profile observation and toplist target binding");

const partial = await seedLocalSourceValidityFixture({ ...scan, id: "server-evidence-partial", contentHash: "partial-hash",
  rawData: { prefix: "f29_net", players: [player("43", { groupname: "EU5 ENDGEGNER" })], groups: [] } });
const partialDoc = buildHubSearchProjection(partial.scan, readGuildHubSearchRows(partial.scan), "[]").documents[0];
const partialProfile = await resolveLocalProfileEntry({ entity: partialDoc.reference!, observation: { kind: "exact", anchor: {
  source: partial.scan.id, at, row: partialDoc.identifier!, hash: partial.scan.contentHash,
} } });
assert.equal(partialProfile.currentSeed?.rawIdentifier, "f29_p43");
assert.equal(partialProfile.sourceScanId, partial.scan.id);
console.log("PASS incomplete ID uses verified source context through actual profile seed creation");
