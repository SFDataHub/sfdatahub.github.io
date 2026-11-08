import assert from "node:assert/strict";
import { averageLocalGuildMemberField, readLocalGuildPlayerStats, summarizeLocalGuildPlayerStats } from "../../src/pages/GuildHub/localGuildPlayerStats.ts";

const member = (key: string, raw: unknown) => ({ key, name: key, classLabel: "Warrior", playerStats: readLocalGuildPlayerStats(raw && typeof raw === "object" ? { class: 1, ...raw } : raw) });
const rows = Object.freeze([
  member("A", { Base: 100, "Base Constitution": 50, Attribute: 300, Constitution: 90 }),
  member("B", { values: { Base: 200, "Base Constitution": 40, Attribute: 250, Constitution: 120 } }),
  member("C", { latest: { values: { Base: 200, "Base Constitution": 60, Attribute: 400, Constitution: 80 } } }),
  member("D", { Base: 50, "Base Constitution": 80, Attribute: 500, Constitution: 50 }),
]);
const base = summarizeLocalGuildPlayerStats(rows, "base");
const total = summarizeLocalGuildPlayerStats(rows, "total");
assert.deepEqual(base.map(g => g.average), [137.5, 57.5, 195]);
assert.deepEqual(total.map(g => g.average), [362.5, 85, 447.5]);
assert.deepEqual(base.map(g => g.entries.map(e => e.key)), [["B", "C", "A"], ["D", "C", "A"], ["C", "B", "A"]]);
assert.deepEqual(total.map(g => g.entries.map(e => e.key)), [["D", "C", "A"], ["B", "A", "C"], ["D", "C", "A"]]);
assert.deepEqual(rows.map(r => r.key), ["A", "B", "C", "D"]);
assert.deepEqual(readLocalGuildPlayerStats({ class: 1, Base: 7, "Base Constitution": 8, Attribute: 9, Constitution: 10, sumBaseTotal: 123, totalStats: 456 }), {
  baseMain: 7, conBase: 8, sumBaseTotal: 15, attrTotal: 9, conTotal: 10, totalStats: 19,
});
const sparse = [member("missing", { Base: 30 }), member("zero", { Base: 0, "Base Constitution": 0 })];
assert.deepEqual(summarizeLocalGuildPlayerStats(sparse, "base").map(g => ({ average: g.average, names: g.entries.map(e => e.key) })), [
  { average: 15, names: ["missing", "zero"] }, { average: 0, names: ["zero"] }, { average: 0, names: ["zero"] },
]);
assert(summarizeLocalGuildPlayerStats(sparse, "total").every(g => g.average === null && g.entries.length === 0));
assert(summarizeLocalGuildPlayerStats([], "base").every(g => g.average === null && g.entries.length === 0));
assert.equal(summarizeLocalGuildPlayerStats([member("bad", { Base: NaN, Constitution: Infinity })], "base")[0].average, null);
// All three primary attributes use the established save reader and its pair sum.
for (const [classId, mainIndex] of [[1, 30], [2, 32], [3, 31]]) {
  const save = Array<number | null>(70).fill(null);
  save[29] = classId; save[mainIndex] = 100; save[mainIndex + 5] = 200; save[33] = 40; save[38] = 60;
  assert.deepEqual(readLocalGuildPlayerStats({ class: classId, saveVersion: 2, save }), {
    baseMain: 100, conBase: 40, sumBaseTotal: 140, attrTotal: 300, conTotal: 100, totalStats: 400,
  });
}
assert.deepEqual(summarizeLocalGuildPlayerStats([member("replacement", { Base: 9 })], "base")[0].entries.map(e => e.key), ["replacement"]);
// Independent public topN/avgOf formulas, applied to the same explicit fields.
for (const groups of [base, total]) for (const group of groups) {
  const values = rows.map(r => r.playerStats[group.field]).filter((v): v is number => typeof v === "number");
  assert.equal(group.average, values.reduce((a,b) => a+b, 0) / values.length);
  assert.deepEqual(group.entries.map(e => e.key), [...rows].filter(r => typeof r.playerStats[group.field] === "number")
    .sort((a,b) => (b.playerStats[group.field] ?? 0) - (a.playerStats[group.field] ?? 0)).slice(0,3).map(r => r.key));
}
console.log("PASS local guild averages, all six rankings, ties, explicit sums, missing/zero, save classes, replacements and public formulas");

// W69: overview projections agree with existing ranking averages, with an
// independent valid-value denominator for each field (including valid zero).
for (const group of [...base, ...total]) assert.equal(averageLocalGuildMemberField(rows, group.field), group.average);
assert.equal(averageLocalGuildMemberField(sparse, "baseMain"), 15);
assert.equal(averageLocalGuildMemberField(sparse, "conBase"), 0);
assert.equal(averageLocalGuildMemberField(sparse, "sumBaseTotal"), 0);
const fortress = [
  { playerStats: { ...rows[0].playerStats, treasury: 0, mine: 10 } },
  { playerStats: { ...rows[1].playerStats, treasury: 20, mine: null } },
  { playerStats: { ...rows[2].playerStats, treasury: null, mine: 30 } },
  { playerStats: { ...rows[3].playerStats, treasury: NaN, mine: Infinity } },
  {},
];
assert.equal(averageLocalGuildMemberField(fortress, "treasury"), 10);
assert.equal(averageLocalGuildMemberField(fortress, "mine"), 20);
assert.equal(averageLocalGuildMemberField([{}], "treasury"), null);
assert.equal(averageLocalGuildMemberField([], "mine"), null);
assert.equal(averageLocalGuildMemberField([{ playerStats: { ...rows[0].playerStats, mine: 9 } }], "mine"), 9);
console.log("PASS W69 prepared averages: ranking parity, independent denominators, null/nonfinite/zero and replacement");

// W132: strictly observed five-component sums are profile projections only.
const { normalizeSfPlayerCharacterCore } = await import("../../src/lib/parsing/normalizedPlayer.ts");
const { readProfileAllAttributeSums, readProfileAttributeSums } = await import("../../src/lib/players/profileAttributeSums.ts");
const { readLocalGuildMemberValues, projectLocalGuildMembers } = await import("../../src/pages/GuildHub/localGuildPlayerStats.ts");
const { dashboardArchiveMetric } = await import("../../src/pages/GuildHub/localGuildRanking.ts");
const save = Array<number | null>(70).fill(0); save[29] = 1;
for (let i = 0; i < 5; i++) { save[30 + i] = i * 10; save[35 + i] = 100; }
const raw = { class: 1, saveVersion: 2, save, baseStats: 123456, totalStats: 654321 };
const core = normalizeSfPlayerCharacterCore(raw);
assert.deepEqual(readProfileAttributeSums(raw, core), { "main-con": { base: 40, total: 240 }, "all-five": { base: 100, total: 600 } });
const broken = structuredClone(core); broken.attributes.luck.base = null;
assert.deepEqual(readProfileAllAttributeSums(broken), { base: null, total: 600 }, "missing Base does not erase valid Total");
broken.attributes.luck.base = -1; broken.attributes.luck.total = Infinity;
assert.deepEqual(readProfileAllAttributeSums(broken), { base: null, total: null });
assert.deepEqual(readProfileAllAttributeSums(null), { base: null, total: null });
const a = { key: "a", name: "A", classLabel: "Warrior", playerStats: readLocalGuildMemberValues(raw, core) };
const b = { key: "b", name: "B", classLabel: "Warrior", playerStats: { ...a.playerStats, sumBaseTotal: 50, profileAllSums: { base: 60, total: null } } };
const unchanged = structuredClone([a, b]);
assert.deepEqual(summarizeLocalGuildPlayerStats([a, b], "base")[2].entries.map(r => r.key), ["b", "a"]);
const projected = projectLocalGuildMembers([a, b], "all-five");
assert.deepEqual(summarizeLocalGuildPlayerStats(projected, "base")[2].entries.map(r => r.key), ["a", "b"]);
assert.equal(averageLocalGuildMemberField(projected, "sumBaseTotal"), 80);
assert.equal(averageLocalGuildMemberField(projected, "totalStats"), 600);
assert.deepEqual([a, b], unchanged, "projection does not mutate the prepared values");
assert.equal(dashboardArchiveMetric("avg-base"), "baseSum");
assert.equal(dashboardArchiveMetric("avg-base", "all-five"), "baseAllSum");
assert.equal(dashboardArchiveMetric("avg-total", "all-five"), "totalAllSum");
assert.equal(dashboardArchiveMetric("avg-base-main", "all-five"), "baseMain");
console.log("PASS W132 five components, real zero, missing/invalid, independent Base/Total, mode ranking/averages and archive metric");

// The loaded archive's own metric/status/rank controls the existing HUD.
const { dashboardRankingCounts } = await import("../../src/pages/GuildHub/localGuildRanking.ts");
const ranks = (rank:number|null) => ({server:rank,global:rank,serverClass:rank,globalClass:rank});
const archivePlayer:any = { statuses:{baseSum:"available",totalSum:"available",baseAllSum:"available",totalAllSum:"available"},
 ranks:{baseSum:ranks(50),totalSum:ranks(60),baseAllSum:ranks(700),totalAllSum:ranks(900)} };
const hud:any = {groups:[{members:[a],player:archivePlayer}],byKey:new Map(),unresolved:0};
assert.equal(dashboardRankingCounts(hud,"avg-base",100,1,"main-con").server.hits,1);
assert.equal(dashboardRankingCounts(hud,"avg-base",100,1,"all-five").server.hits,0);
assert.equal(dashboardRankingCounts(hud,"avg-base",1000,1,"all-five").global.hits,1);
assert.equal(dashboardRankingCounts(hud,"avg-total",500,1,"all-five").server.hits,0);
archivePlayer.statuses.baseAllSum="missing"; archivePlayer.ranks.baseAllSum=ranks(null);
assert.equal(dashboardRankingCounts(hud,"avg-base",100,1,"all-five").server.hits,null,"v1/missing five-sum rank never falls back to Main+CON");
console.log("PASS W132 loaded archive status/rank selects R100/R500/R1000 counts without Main+CON fallback");
