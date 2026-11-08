import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { importGuildHubLocalScan, listGuildHubScanSummaries, selectGuildHubRawSnapshot } from "../../src/lib/guilds/localScanLibrary.ts";
import { ensureGuildAnalyticsSourceDataFromSummaries } from "../../src/lib/guilds/localGuildAnalyticsStore.ts";
import { loadIdentityResolutionSnapshot } from "../../src/lib/identities/identityResolution.ts";
import { linkPlayerIdentifiers } from "../../src/lib/identities/playerIdentityStore.ts";
import { selectTransferGuildStands, readTransferGuildStands, buildCurrentTransferGuildLookup, buildCurrentTransferGuildLookupCooperatively, buildTransferGuildLookup, resolveTransferGuildStatus } from "../../src/pages/GuildHub/dashboardTransferGuilds.ts";
const now = Date.UTC(2026, 9, 6, 12), old = now - 35 * 86400000;
const group = (id: number, name: string, at: number) => ({ identifier: `f8_net_g${id}`, prefix: "f8_net", timestamp: at, name, memberCount: 1 });
const player = (id: number, guild: number, at: number) => ({ identifier: `f8_net_p${id}`, prefix: "f8_net", timestamp: at, name: `Player ${id}`, class: 1, level: 100, group: `f8_net_g${guild}`, groupname: "Untrusted display name", values: { Base: 200, "Base Constitution": 100 } });
await linkPlayerIdentifiers("f8_net_p1", "f8_net_p11", { source: "manual" });
await linkPlayerIdentifiers("f8_net_p2", "f8_net_p22", { source: "manual" });
const history = await importGuildHubLocalScan("w62-history.json", JSON.stringify({ players: [player(11, 2, old), player(2, 1, old), player(3, 1, old)], groups: [group(1, "Selected Guild", old), group(2, "Previous Guild", old)] }));
const current = await importGuildHubLocalScan("w62-current.json", JSON.stringify({ players: [player(1, 1, now), player(22, 3, now), player(4, 99, now)], groups: [group(1, "Selected Guild", now), group(3, "New Guild", now)] }));
const identities = await loadIdentityResolutionSnapshot();
const summaries = (await listGuildHubScanSummaries()).filter(s => s.sourceScanId === history.scan.id);
let rawReads = 0;
const data = await ensureGuildAnalyticsSourceDataFromSummaries(summaries, { readSourceIds: [history.scan.id], loadSourceById: async () => { rawReads++; return history.scan; } });
assert.equal(rawReads, 0, "existing imported preparation needs no new raw read");
const from = buildTransferGuildLookup(data.members.filter(m => m.snapshotTimestamp === old), data.guilds.filter(g => g.snapshotTimestamp === old));
const to = buildCurrentTransferGuildLookup(selectGuildHubRawSnapshot(current.scan, now)!);
assert.deepEqual(resolveTransferGuildStatus(from, "f8_net_p1", identities), { kind: "guild", name: "Previous Guild" }, "joined player's historical alias outside selected guild");
assert.deepEqual(resolveTransferGuildStatus(to, "f8_net_p2", identities), { kind: "guild", name: "New Guild" }, "departed player's current alias outside selected guild");
assert.deepEqual(resolveTransferGuildStatus(to, "f8_net_p3", identities), { kind: "unavailable", reason: "no-observation" }, "absent current player cannot prove guildlessness or a new guild");
assert.deepEqual(resolveTransferGuildStatus(to, "f8_net_p4", identities), { kind: "unavailable", reason: "missing-membership" }, "missing group identifier resolution omits stale player display name");
assert.deepEqual(resolveTransferGuildStatus(from, "f8_net_p99", identities), { kind: "unavailable", reason: "no-observation" });
assert.deepEqual(resolveTransferGuildStatus(null, "f8_net_p1", identities), { kind: "unavailable", reason: "not-checked" });
const conflict = new Map<string, import("../../src/pages/GuildHub/dashboardTransferGuilds.ts").TransferGuildStatus>([["f8_net_p11", { kind: "guild", name: "A" }], ["f8_net_p1", { kind: "unavailable" }]]);
assert.deepEqual(resolveTransferGuildStatus(conflict, "f8_net_p1", identities), { kind: "unavailable" }, "exact unresolved observation wins over an alias suggestion");
console.log("PASS W62 exact historical/current scan guild evidence, external roster players, existing aliases, missing player/group evidence, no raw read for prepared history");

for (const at of [old, now]) {
 const raw = { players: [{ ...player(5, 0, at), group: 0, groupname: "" }, { ...player(6, 0, at), group: undefined, groupname: undefined }, { ...player(7, 0, at), group: 0, guildId: 99 }], groups: [] };
 const imported = await importGuildHubLocalScan(`w62-status-${at}.json`, JSON.stringify(raw));
 const snapshot = selectGuildHubRawSnapshot(imported.scan, at)!;
 let lookup = buildCurrentTransferGuildLookup(snapshot);
 if (at === old) {
  const evidence = await ensureGuildAnalyticsSourceDataFromSummaries((await listGuildHubScanSummaries()).filter(s => s.sourceScanId === imported.scan.id), { readSourceIds: [imported.scan.id], loadSourceById: async () => { throw Error("No extra raw read"); } });
  lookup = buildTransferGuildLookup(evidence.members, evidence.guilds);
 }
 assert.deepEqual(resolveTransferGuildStatus(lookup, "f8_net_p5", identities), { kind: "none" }, "explicit zero guild in both scan directions");
 assert.deepEqual(resolveTransferGuildStatus(lookup, "f8_net_p6", identities), { kind: "unavailable", reason: "missing-membership" }, "missing fields in both directions");
 assert.deepEqual(resolveTransferGuildStatus(lookup, "f8_net_p7", identities), { kind: "unavailable", reason: "conflict" }, "contradictory zero/nonzero guild identifiers");
}
console.log("PASS W62 named guild, explicit no guild and unavailable evidence for historical joins/current departures");

// Cooperative preparation keeps all outside/duplicate observations and yields
// without publishing a result after its owning dashboard request expires.
const largeSnapshot = {players: Array.from({length: 1200}, (_,i) => player(i % 180, i % 4, now)), groups: [group(1, "One", now), group(2, "Two", now)]};
assert.deepEqual(await buildCurrentTransferGuildLookupCooperatively(largeSnapshot), buildCurrentTransferGuildLookup(largeSnapshot));
let expired = false;
const pendingLookup = buildCurrentTransferGuildLookupCooperatively(largeSnapshot, null, () => !expired);
expired = true;
await assert.rejects(pendingLookup, /dashboard_context_changed/);
console.log("PASS W107 cooperative complete transfer evidence and expired request");

// Other OG namespaces use their own existing >=28-day comparison observation.
// A newer ineligible stand and an arbitrary older stand must not win.
const externalAt = old + 7 * 60000;
const externalPlayer = { identifier:"s7_eu_p800", prefix:"s7_eu", timestamp:externalAt, name:"External", class:1, group:"s7_eu_g2" };
const externalGuild = { identifier:"s7_eu_g2", prefix:"s7_eu", timestamp:externalAt, name:"Observed OG guild" };
const external = await importGuildHubLocalScan("other-og.json", JSON.stringify({players:[externalPlayer],groups:[externalGuild]}));
await importGuildHubLocalScan("other-og-older.json", JSON.stringify({players:[{...externalPlayer,timestamp:externalAt-86400000}],groups:[{...externalGuild,timestamp:externalAt-86400000,name:"Older guild"}]}));
await importGuildHubLocalScan("other-og-too-new.json", JSON.stringify({players:[{...externalPlayer,timestamp:now-86400000}],groups:[{...externalGuild,timestamp:now-86400000,name:"Too new"}]}));
// The existing identity graph resolves the entire chain; no second fusion list.
await linkPlayerIdentifiers("s7_eu_p800", "f7_net_p1800", {source:"manual"});
await linkPlayerIdentifiers("f7_net_p1800", "f8_net_p2800", {source:"manual"});
const chain = await loadIdentityResolutionSnapshot();
const inventory = await listGuildHubScanSummaries();
const selected = {sourceScanId:history.scan.id,scannedAtMs:old,server:"f8_net"};
const stands = selectTransferGuildStands(inventory,["f8_net_p2800"],chain,now,selected);
assert.equal(stands[0],selected,"selected comparison roster is pinned");
assert.equal(stands.find(s=>s.server==="EU7")?.sourceScanId,external.scan.id);
assert.equal(stands.find(s=>s.server==="EU7")?.scannedAtMs,externalAt,"OG need not match selected milliseconds");
const combined = await readTransferGuildStands(stands.slice(1),inventory,from);
assert.deepEqual(resolveTransferGuildStatus(combined,"f8_net_p2800",chain),{kind:"guild",name:"Observed OG guild"},"chained alias and namespaced guild 2 resolve to the OG observation, not selected server guild 2");
await assert.rejects(readTransferGuildStands(stands.slice(1),inventory,from,()=>false),/dashboard_context_changed/);
console.log("PASS W128 targeted OG source selection, independent scan times, server namespaces, latest eligible stand, existing chained identity and stale-result rejection");
