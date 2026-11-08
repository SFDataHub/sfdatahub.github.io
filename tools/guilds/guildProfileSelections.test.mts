import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { importGuildHubLocalScan, listGuildHubScanSummaries } from "../../src/lib/guilds/localScanLibrary.ts";
import { linkPlayerIdentifiers } from "../../src/lib/identities/playerIdentityStore.ts";
import { loadDashboardMemberComparison, memberComparisonObservationKey } from "../../src/pages/GuildHub/dashboardMemberComparison.ts";
import { readLocalGuildMemberValues } from "../../src/pages/GuildHub/localGuildPlayerStats.ts";
import { startSharedGuildTrendRun, type GuildTrendHistory } from "../../src/lib/local-player-profile/cardTrendExecution.ts";
import { sharedAnalyticsPreparation } from "../../src/lib/local-player-profile/sharedPreparation.ts";
import { buildDashboardGuildComparison, buildDashboardGuildTrendIntervals } from "../../src/pages/GuildHub/dashboardGuildComparison.ts";
import { guildChartRangeStart } from "../../src/pages/GuildHub/dashboardChartWindow.ts";
assert.equal(memberComparisonObservationKey({ sourceScanId: "one", scannedAtMs: 1, guildIdentifier: "f28_net_g9108" }), memberComparisonObservationKey({ sourceScanId: "one", scannedAtMs: 1, guildIdentifier: "f28_g9108" }));
assert.notEqual(memberComparisonObservationKey({ sourceScanId: "one", scannedAtMs: 1, guildIdentifier: "f28_net_g9108" }), memberComparisonObservationKey({ sourceScanId: "one", scannedAtMs: 1, guildIdentifier: "f29_g9108" }));
const day = 86400000, now = Date.UTC(2026, 10, 2), startMs = guildChartRangeStart("12months", now);
assert.equal(startMs, Date.UTC(2025, 10, 2));
assert.equal(guildChartRangeStart("12months", Date.UTC(2024, 1, 29)), Date.UTC(2023, 1, 28));
const row = (at: number, base: number, id = "f8_net_p1", group = "f8_net_g1") => ({ identifier: id, prefix: id.replace(/_p[^_]+$/, ""), timestamp: at, name: "Same name", class: 1, level: 100, xpTotal: base * 100, group, groupname: group, values: { Base: base, "Base Constitution": base, Attribute: base * 2, Constitution: base } });
const group = (at: number, count = 1) => ({ identifier: "f8_net_g1", prefix: "f8_net", timestamp: at, name: "Guild", memberCount: count });
const add = (name: string, at: number, base: number, count = 1) => importGuildHubLocalScan(name + ".json", JSON.stringify({ players: [row(at, base)], groups: [group(at, count)] }));
await add("unneeded-ancient", Date.UTC(2024, 0, 1), 1);
await add("basis", startMs - 10 * day, 10);
await add("incomplete-nearer-basis", startMs - day, 11, 2);
for (let i = 0; i < 16; i++) await add("visible-" + i, startMs + i * 20 * day, 20 + i);
const current = await add("current", now, 100);
const summaries = await listGuildHubScanSummaries(), preparation = sharedAnalyticsPreparation.acquire("visible");
let history: GuildTrendHistory | undefined;
const execute = async (begin: number) => {
  const run = startSharedGuildTrendRun({ summaries, guildTarget: { logoIdentifier: "f8_net_g1", server: "f8_net" }, includeServerHistory: true, sourceScope: "dashboard-guild", memberRefs: ["f8_net_p1"], chartWindow: { startMs: begin, endMs: now }, preparation, onHistory: value => { history = value; } });
  try { await run.promise; } finally { run.cancel(); }
  return buildDashboardGuildComparison(history, "f8_net", "f8_net_g1", now, current.scan.id);
};
try {
  const chart = await execute(startMs);
  assert.equal(chart.times.length, 17, "all observations, not twelve points");
  assert(chart.times.every(at => at >= startMs));
  assert(!history!.data.guilds.some(g => g.snapshotTimestamp === Date.UTC(2024, 0, 1)), "ancient history never enters prepared projection");
  const intervals = buildDashboardGuildTrendIntervals(chart);
  assert.equal(intervals[0].start.scannedAtMs, startMs - 10 * day, "last eligible complete prior basis");
  assert.equal(intervals[0].end.scannedAtMs, startMs);
  assert.equal(intervals.length, chart.times.length, "basis has no extra bar");
  const before = sharedAnalyticsPreparation.inspect();
  const all = await execute(0), after = sharedAnalyticsPreparation.inspect();
  assert(all.times.includes(Date.UTC(2024, 0, 1)));
  assert.equal(after.sourceJobs - before.sourceJobs, 1, "extension only prepares the additional ancient source");
} finally { preparation.release(); }
// A selected old guild roster and its outside-guild player values use the same
// temporal ceiling, including a confirmed multi-stage identity.
const oldAt = Date.UTC(2025, 0, 1), preferredAt = now - 35 * day;
await linkPlayerIdentifiers("f8_net_p1", "f7_net_p11", { source: "manual" });
await linkPlayerIdentifiers("f7_net_p11", "s1_eu_p21", { source: "manual" });
const roster = await importGuildHubLocalScan("selected-old-roster.json", JSON.stringify({ players: [row(oldAt, 7, "f8_net_p99")], groups: [group(oldAt)] }));
await importGuildHubLocalScan("outside-old.json", JSON.stringify({ players: [row(oldAt, 5, "s1_eu_p21", "s1_eu_g9")], groups: [] }));
await importGuildHubLocalScan("outside-28day.json", JSON.stringify({ players: [row(preferredAt, 90, "s1_eu_p21", "s1_eu_g9")], groups: [] }));
const members = [{ key: "f8_net_p1", name: "Same name", classLabel: "Warrior", playerStats: readLocalGuildMemberValues(row(now, 100)) }];
const input = { summaries: await listGuildHubScanSummaries(), currentSourceId: current.scan.id, currentTimestamp: now, guild: { name: "Guild", server: "f8_net", logoIdentifier: "f8_net_g1" }, members, diagnostic: true };
const selectedComparison = { sourceScanId: roster.scan.id, scannedAtMs: oldAt, guildIdentifier: "f8_net_g1" };
const manual = await loadDashboardMemberComparison({ ...input, selectedComparison });
const ranked = manual.comparison.rankings!.base!.main![0];
assert.deepEqual([ranked.valueDelta, ranked.rankDelta, ranked.rankStatus], [95, null, "new"]);
assert.equal(manual.comparison.valueSources!.find(source => source.key === "s1_eu_p21")!.scannedAtMs, oldAt, "no much newer four-week replacement");
assert.equal(manual.comparison.comparisonValues!.baseMain, 7, "guild average uses historical guild roster only");
assert.equal(manual.work.rawReads, 2, "one guild source plus one batched player source");
assert.equal(manual.comparison.timestamp, oldAt);
console.log("PASS common chart window, invisible eligible basis, incremental source reuse, explicit old comparison and multi-stage outside-guild player values/new rank");
