import assert from "node:assert/strict";
import { buildPlayerViewCharts } from "../../src/lib/local-player-profile/playerViewChartsProjection";
import type { ProfileHistoryMember } from "../../src/lib/local-player-profile/profileSumHistory";
import type { LocalPlayerAnalyticsResult } from "../../src/components/local-player-profile/localPlayerAnalyticsModel";
import { collectPlayerPerformanceTargetHistory, dedupeSnapshots } from "../../src/pages/Playground/playerPerformanceModel";
import { buildPlayerIdentityResolutionIndex, buildGuildIdentityResolutionIndex, type IdentityResolutionSnapshot } from "../../src/lib/identities/identityResolution";
import { PLAYER_VIEW_CHARTS } from "../../src/lib/local-player-profile/viewCharts";

const times = [1000, 2000, 3000];
const rows = times.map((time, index): ProfileHistoryMember => ({
  id: `scan-${index}::${time}::member::s1_eu_p1::0`, snapshotId: `scan-${index}::${time}`, sourceScanId: `scan-${index}`,
  sourceScanFilename: "local-sftools.json", snapshotTimestamp: time, memberRef: "s1_eu_p1", name: "Player", classId: "1", level: 1,
  baseStats: null, totalStats: null, xpTotal: 10, focusedBaseStats: 30,
  hofRank: 120 - index, baseMain: 10, conBase: 20, attrTotal: 100, conTotal: 200, focusedTotalStats: 300,
  mine: index === 0 ? null : index - 1, treasury: 0, server: "EU1", guildSegment: null, groupSegment: null, guildIdentifier: null, guildName: null,
  profileSums: { "main-con": { base: 30, total: 300 }, "all-five": { base: 100, total: 1000 } },
}));
const data = { members: rows, snapshots: [], guilds: [] };
const identity = { players: buildPlayerIdentityResolutionIndex([]), guilds: buildGuildIdentityResolutionIndex([]) } as IdentityResolutionSnapshot;
// No complete guild is needed for observed HoF/building/attribute values.
const snapshots = dedupeSnapshots(collectPlayerPerformanceTargetHistory(data, identity, { name: "Player", server: "EU1", memberRef: "s1_eu_p1" }));
assert.equal(snapshots.length, 3);
const xp = [{ id: "player-xp", label: "Player", color: "green", points: [{ timestamp: 2000, label: "time", value: 10, detail: "xp" }] }];
const result = { comparison: { selectedTimestamp: 1000, currentTimestamp: 3000 }, xp: { series: xp } } as LocalPlayerAnalyticsResult;
for (const view of Object.keys(PLAYER_VIEW_CHARTS) as (keyof typeof PLAYER_VIEW_CHARTS)[]) {
  const charts = buildPlayerViewCharts(view, "main-con", snapshots, data, result);
  assert.deepEqual(charts.map(chart => chart.metric), PLAYER_VIEW_CHARTS[view]);
}
const fortress = buildPlayerViewCharts("fortress", "main-con", snapshots, data, result);
assert.deepEqual(fortress[0].series[0].points.map(p => [p.timestamp, p.value]), [[2000, 0], [3000, 1]]);
assert.deepEqual(fortress[1].series[0].points.map(p => p.value), [0, 0, 0]);
assert.deepEqual(buildPlayerViewCharts("general", "main-con", snapshots, data, result)[0].series[0].points.map(p => p.value), [120, 119, 118]);
assert.deepEqual(buildPlayerViewCharts("base", "main-con", snapshots, data, result).map(c => c.series[0].points[0].value), [30, 10, 20]);
assert.deepEqual(buildPlayerViewCharts("total", "main-con", snapshots, data, result).map(c => c.series[0].points[0].value), [300, 100, 200]);
assert.equal(buildPlayerViewCharts("base", "all-five", snapshots, data, result)[0].series[0].points[0].value, 100);
assert.equal(buildPlayerViewCharts("total", "all-five", snapshots, data, result)[0].series[0].points[0].value, 1000);
assert.equal(buildPlayerViewCharts("progress", "main-con", snapshots, data, result)[0].series, xp);
const selected = { ...result, comparison: { ...result.comparison, selectedTimestamp: 2000, currentTimestamp: 2000 } };
assert.deepEqual(buildPlayerViewCharts("general", "main-con", snapshots, data, selected)[0].series[0].points.map(p => p.value), [119]);
const wrongSource = { ...data, members: [{ ...rows[0], sourceScanId: "unrelated", hofRank: 1 }] };
assert.equal(buildPlayerViewCharts("general", "main-con", snapshots, wrongSource, result)[0].series[0].points.length, 0);
const duplicates = { ...data, members: [...rows, { ...rows[0], hofRank: 999 }] };
assert.equal(buildPlayerViewCharts("general", "main-con", snapshots, duplicates, result)[0].series[0].points[0].value, 999);
console.log("PASS player view chart contracts: five views, existing sums, zero/missing, local singleton history, physical observations, period, XP reuse");
