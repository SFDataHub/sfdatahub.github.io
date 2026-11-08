import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { openDB } from "idb";
import { normalizeGuildScanMember, readGuildScanMemberIdentity } from "../../src/lib/guilds/guildScanNormalizer.ts";
import { importGuildHubLocalScan, updateGuildHubLocalScan, getGuildHubLocalScan, listGuildHubScanSummaries } from "../../src/lib/guilds/localScanLibrary.ts";
import { ensureGuildAnalyticsDerivedDataFromSummaries, readGuildAnalyticsDerivedSource, resetGuildAnalyticsDerivedData } from "../../src/lib/guilds/localGuildAnalyticsStore.ts";

// The Raw association must keep the full member normalizer's acceptance, ref
// and fallback semantics even for duplicate refs and incomplete legacy rows.
const rows: unknown[] = [
  null, 1, [], {}, { name: "Missing ID" }, { identifier: "f8_net_p1" },
  { identifier: "F8_NET_P1", name: "Alpha", level: 100 },
  { playerId: "12", name: "Fallback" }, { id: 13, Name: "Numeric" },
  { values: { "Player ID": "14", Name: "Values", Server: "f8_net" } },
  { latest: { identifier: "f8_net_p15", name: "Latest" } },
  { identifier: "f7_net_p1", name: "Other server", prefix: "f7_net" },
  { identifier: "f8_net_p2", name: "?", values: { Name: "Valid fallback" } },
  { identifier: "f8_net_p3", name: "Save", save: [1, 2, 3] },
];
for (const fallback of [null, "f8_net", "F9"])
  for (const row of rows) {
    const full = normalizeGuildScanMember(row, fallback);
    const identity = readGuildScanMemberIdentity(row, fallback);
    assert.equal(Boolean(identity), Boolean(full));
    if (full) assert.deepEqual(identity, Object.fromEntries(
      ["memberRef", "name", "server", "guildSegment", "groupSegment", "guildName"].map(key => [key, (full as any)[key]]),
    ));
  }
console.log("PASS Raw identity association: 42 acceptance/ref/server/name/guild cases");

const older = Date.UTC(2026, 8, 6, 12), current = Date.UTC(2026, 9, 6, 12);
const player = (timestamp: number, xpTotal: number) => ({ identifier: "f8_net_p1", name: "Alpha", prefix: "f8_net", timestamp,
  class: 1, level: 100, xpTotal, baseMain: 100, conBase: 100, guildIdentifier: "f8_net_g1", guildName: "Guild" });
const raw = { players: [player(older, 1000), null, { name: "Missing ID", timestamp: current },
  player(current, 2000), { ...player(current, 2020), identifier: "F8_NET_P1" }],
  groups: [older, current].map(timestamp => ({ identifier: "f8_net_g1", prefix: "f8_net", name: "Guild", timestamp, memberCount: 1 })) };
const { scan } = await importGuildHubLocalScan("preparation.json", JSON.stringify(raw));
const summaries = await listGuildHubScanSummaries();
const summary = summaries.find(s => s.sourceScanId === scan.id)!;
assert.deepEqual(summary.snapshotTimestamps, [older, current]);
assert.equal(summary.logicalScanCount, 2);
assert.equal(summary.guilds.length, 1);
assert.equal(summary.guilds[0].sourceScannedAt, new Date(current).toISOString());
const data = await readGuildAnalyticsDerivedSource(scan.id);
assert.deepEqual(data.members.map(m => [m.snapshotTimestamp, m.memberRef, m.xpTotal]),
  [[older, "f8_net_p1", 1000], [current, "f8_net_p1", 2000], [current, "f8_net_p1", 2020]]);
assert.equal(new Set(data.members.map(m => m.id)).size, 3);
const options = { readSourceIds: [scan.id], loadSourceById: getGuildHubLocalScan };
await resetGuildAnalyticsDerivedData();
assert.deepEqual(await ensureGuildAnalyticsDerivedDataFromSummaries([summary], options), data);
const changed = await updateGuildHubLocalScan(scan.id, "preparation.json", JSON.stringify({ ...raw,
  players: raw.players.map(p => p && "identifier" in p ? { ...p, level: 150 } : p) }));
assert.ok(changed);
assert.notEqual(changed.sourceGeneration, scan.sourceGeneration);
const updated = await readGuildAnalyticsDerivedSource(scan.id);
assert.ok(updated.members.every(m => m.level === 150));
assert.deepEqual(updated.members.map(m => m.xpTotal), data.members.map(m => m.xpTotal));
const db = await openDB("sfdatahub-local-data");
const live = await db.get("scans", scan.id), liveSummary = await db.get("scanSummaries", scan.id);
await db.put("scans", { ...live, normalizerVersion: live.normalizerVersion - 1 });
await db.put("scanSummaries", { ...liveSummary, normalizerVersion: liveSummary.normalizerVersion - 1 });
const repaired = await getGuildHubLocalScan(scan.id);
assert.ok(repaired);
assert.notEqual(repaired.sourceGeneration, changed.sourceGeneration);
assert.deepEqual((await db.get("scanSummaries", scan.id)).snapshotTimestamps, [older, current]);
db.close();
console.log("PASS multi-time summary/latest identity, duplicate Raw XP association/order, reset, same-ID update and version repair");
