import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDB } from "idb";
import { parseHubSearchText, matchesHubSearchServer } from "../../../../src/lib/data-hub/hubSearchQuery.ts";
import { aggregateHubSearchHits, defaultHubSearchQuery, HubSearchController, type HubSearchOccurrence } from "../../../../src/lib/data-hub/hubSearchService.ts";
import { favoriteReference } from "../../../../src/lib/data-hub/hubFavoritesContract.ts";
import { resolveServer, validateServerRegistry } from "../../../../src/lib/servers/serverResolver.ts";
import { seedLocalSourceValidityFixture } from "../../localSourceValidityFixture.mts";
import { buildHubSearchProjection, HUB_SEARCH_PARSER_VERSION } from "../../../../src/lib/data-hub/hubSearchProjection.ts";
import { readGuildHubSearchRows, readGuildHubLocalScanForSearch, readHubSearchProjectionInventory } from "../../../../src/lib/guilds/localScanLibrary.ts";
import { linkPlayerIdentifiers } from "../../../../src/lib/identities/playerIdentityStore.ts";
import { loadIdentityResolutionSnapshot } from "../../../../src/lib/identities/identityResolution.ts";
import { resolveHubSearchTarget } from "../../../../src/lib/data-hub/hubTargetResolver.ts";
import { resolveLocalProfileEntry } from "../../../../src/lib/data-hub/localProfileEntry.ts";
import { parseObservation } from "../../../../src/lib/data-hub/routes.ts";

assert.deepEqual(validateServerRegistry(), []);
const aliases = JSON.parse(readFileSync(new URL("./historical-aliases.json", import.meta.url), "utf8"));
const codes = ["PT1", "RTL2", "INGAME", "GAMONA", "BUFFED", "BR1", "XCHAR"];
aliases.players.forEach((p: { prefix: string }, i: number) => assert.equal(resolveServer(p.prefix)?.code, codes[i]));
for (const [text, server, expected] of [
  ["darth, F8", "F8", true], ["darth, F8", "F80", false],
  ["darth, F", "F8", true], ["darth, F", "DE1", false],
  ["darth, EU", "EU5", true], ["darth, EU", "F8", false],
  ["darth, buffed_de", "BUFFED", true], ["darth, buffed_de", "F1", false],
  ["darth, unmatched", "F8", false], ["darth,", "F8", true], ["darth", "F8", true],
] as const) assert.equal(matchesHubSearchServer(parseHubSearchText(text), server), expected, text);
assert.equal(parseHubSearchText("  ＤＡＲＴＨ  ,  f8  ").name, "darth");

function occurrence(id: string, name: string, at: number, kind: "player" | "guild" = "player", quality: HubSearchOccurrence["timeQuality"] = "observation"): HubSearchOccurrence {
  const reference = favoriteReference(kind, id)!;
  return { kind, identifier: id, name, at, timeQuality: quality, reference, server: reference.serverNamespace };
}
const old = Array.from({ length: 40 }, (_, i) => occurrence(`s1_de_p${i + 1}`, "Deinnachbar", 100));
const rows = [...old, occurrence("f8_net_p42", "Deinnachbar", 200), occurrence("f80_net_p43", "Deinnachbar", 300),
  occurrence("f8_net_p44", "Deinnachbar Plus", 400), occurrence("eu5_net_p45", "Darth Monk", 500),
  occurrence("f8_net_p46", "Darth Monk", 600), occurrence("f8_net_g47", "Endgegner", 700, "guild"),
  occurrence("eu5_net_g48", "Endgegner", 800, "guild"), occurrence("f8_net_p49", "Deinnachbar", 9999999, "player", "file")];
const controller = new HubSearchController();
const probe = controller as unknown as { localDocuments: HubSearchOccurrence[]; archiveDocuments: HubSearchOccurrence[] };
probe.localDocuments = rows.slice(0, 42); probe.archiveDocuments = rows.slice(42);
for (const kind of ["player", "guild", "both"] as const) for (const text of ["deinnachbar", "deinNachbar, F8", "Endgegner, F8", "Endgegner, F", "Darth Monk, F", "darth, F", "darth, EU", "darth", "darth,", "darth, missing", ",F8", "a,F8"]) {
  const query = { ...defaultHubSearchQuery, text, kind };
  controller.setQuery(query);
  const state = controller.getSnapshot();
  assert.deepEqual({ hits: state.hits, limited: state.limited }, aggregateHubSearchHits(rows, undefined, query, state.revision, state.queryGeneration));
  for (const hit of state.hits) assert(hit.occurrences.every(o => matchesHubSearchServer(parseHubSearchText(text), o.server)));
  if (text === "deinNachbar, F8" && kind !== "guild") {
    assert.deepEqual(state.hits.map(h => h.reference?.identifier), ["f8_net_p42", "f8_net_p49", "f8_net_p44"]);
    assert(!state.limited); assert(state.hits.every(h => h.observationBound));
  }
  if (text === "deinnachbar" && kind !== "guild") {
    assert(state.limited); assert.equal(state.hits[0].reference?.identifier, "f80_net_p43");
    assert.equal(state.hits[1].reference?.identifier, "f8_net_p42");
    assert(!state.hits.some(h => h.reference?.identifier === "f8_net_p44")); // Exact matches precede newer prefixes.
  }
  if ([",F8", "a,F8", "darth, missing"].includes(text)) assert.equal(state.hits.length, 0);
}
controller.dispose();
console.log("PASS shared parsing, literal aliases, exact/group filters, pre-limit ordering, name quality and both aggregation paths");

const at = Date.UTC(2026, 9, 4);
const { scan } = await seedLocalSourceValidityFixture({ id: "filter-aliases", contentHash: "alias-filter-hash", filename: "aliases.json",
  importedAt: new Date(at + 999999).toISOString(), scannedAt: null, servers: [], playerCount: 10, groupCount: 0,
  rawData: { players: [...aliases.players, { identifier: "f8_net_p42", name: "Darth Monk", timestamp: at },
    { identifier: "eu5_net_p42", name: "Darth Monk", timestamp: at + 1000 },
    { identifier: "f8_net_p99", prefix: "EU5", name: "Conflict", timestamp: at }], groups: [] } });
const oldProjection = buildHubSearchProjection(scan, readGuildHubSearchRows(scan), "[]");
oldProjection.parserVersion = "memberIdentity:2/logicalSnapshots:1/guildIdentity:2/serverEvidence:1";
for (const doc of oldProjection.documents.slice(0, 7)) { doc.reference = null; doc.server = null; doc.referenceQuality = "unresolved"; }
const db = await openDB("sfdatahub-local-data");
await db.put("metadata", { key: "hub-search:source:" + scan.id, value: oldProjection, updatedAt: new Date().toISOString() });
await linkPlayerIdentifiers("f8_net_p42", "eu5_net_p42", { source: "manual" });
let rawReads = 0;
const actual = new HubSearchController({ loadArchive: async () => ({ entries: [], failed: 0, unknown: 0 }),
  readRaw: async id => { rawReads++; return readGuildHubLocalScanForSearch(id); } });
actual.start({ ...defaultHubSearchQuery, text: "Darth, F8", kind: "player" });
for (let i = 0; actual.getSnapshot().local.preparing && i < 500; i++) await new Promise(r => setTimeout(r, 10));
const renewed = (await readHubSearchProjectionInventory()).projections.get(scan.id)!;
assert.equal(renewed.parserVersion, HUB_SEARCH_PARSER_VERSION); assert.equal(rawReads, 1);
assert.deepEqual(renewed.documents.slice(0, 7).map(d => d.reference?.serverNamespace), codes.map(c => c.toLowerCase()));
assert.equal(renewed.documents.at(-1)?.reference, null);
const status = actual.getSnapshot().local;
assert.equal(status.ready, status.total); assert.equal(status.unknown, 0); assert.equal(status.unresolved, 1); assert(!status.preparing && !status.error);
const hit = actual.getSnapshot().hits[0];
assert.equal(hit.identity, "confirmed"); assert.equal(hit.occurrences.length, 1); assert.equal(hit.reference?.serverNamespace, "f8");
const target = await resolveHubSearchTarget(hit, { mode: "profile", allowed: () => true, accessAllowed: () => true });
const observation = parseObservation("?" + target.path.split("?")[1]);
assert.equal(observation.kind, "exact");
const profile = await resolveLocalProfileEntry({ entity: hit.reference!, observation });
assert.equal(profile.sourcePlayerKey, "f8_net_p42"); assert.equal(profile.currentSeed?.scannedAtMs, at);
const toplist = await resolveHubSearchTarget(hit, { mode: "toplist", allowed: () => true, accessAllowed: () => true });
assert.equal(toplist.state.hubToplistTarget?.server, "F8"); assert.deepEqual(toplist.state.hubToplistTarget?.identifiers, ["f8_net_p42"]);
await actual.refreshLocal(); assert.equal(rawReads, 1);
const identities = await loadIdentityResolutionSnapshot(); assert.equal(identities.players.byIdentityId.size, 1);
actual.dispose(); db.close();
console.log("PASS W196 projection auto-renewal and warm reuse; unresolved status; conflict protection; confirmed identity filtered display/profile anchor/toplist");
