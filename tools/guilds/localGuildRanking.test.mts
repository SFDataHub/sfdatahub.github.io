import assert from "node:assert/strict";
import { buildLocalGuildRanking, selectLocalGuildRankingComparison } from "../../src/pages/GuildHub/localGuildRanking.ts";
import { readFocusedPlayerStats } from "../../src/lib/players/focusedPlayerStats.ts";
import { readSfPlayerStats } from "../../src/lib/parsing/parseSfJson.ts";
import { normalizeSfPlayerCharacterCore } from "../../src/lib/parsing/normalizedPlayer.ts";
import { CLASSES } from "../../src/data/classes.ts";
import { buildLocalPlayerProfileModel } from "../../src/pages/GuildHub/localPlayerProfileAdapter.ts";
import { summarizeLocalGuildPlayerStats } from "../../src/pages/GuildHub/localGuildPlayerStats.ts";
import { buildPlayerIdentityResolutionIndex, type IdentityResolutionSnapshot } from "../../src/lib/identities/identityResolution.ts";
import type { GuildTrendSnapshot } from "../../src/pages/Playground/playerPerformanceModel.ts";

const raw = { class: 2, Base: 100, "Base Constitution": 80, Attribute: 150, Constitution: 120, sumBaseTotal: 9999, totalStats: 99999 };
assert.deepEqual(readFocusedPlayerStats(raw), { baseMain: 100, conBase: 80, sumBaseTotal: 180, attrTotal: 150, conTotal: 120, totalStats: 270 });
assert.equal(readSfPlayerStats(raw).baseStats, 9999, "global unspecific fields retain their established meanings");
assert.equal(readFocusedPlayerStats({ class: 1, Base: 10, totalStats: 999 }).sumBaseTotal, null);
assert.equal(readFocusedPlayerStats({ class: 1, Base: 0, "Base Constitution": 0, Attribute: 0, Constitution: 0 }).totalStats, 0);
assert.equal(readFocusedPlayerStats({ class: "unknown", Base: 10, "Base Constitution": 20 }).sumBaseTotal, null);
assert.equal(readFocusedPlayerStats({ class: "Mage", Base: 10, "Base Constitution": 20 }).sumBaseTotal, 30);
for (const meta of CLASSES) {
  const specific = { class: meta.id, values: { "Base Strength": 900, "Base Dexterity": 900, "Base Intelligence": 900, "Base Constitution": 80, "Base Luck": 900, Strength: 1900, Dexterity: 1900, Intelligence: 1900, Constitution: 120, Luck: 1900 } };
  const name = { strength: "Strength", dexterity: "Dexterity", intelligence: "Intelligence" }[meta.primaryAttribute];
  Object.assign(specific.values, { [`Base ${name}`]: 100, [name]: 150 });
  assert.equal(readFocusedPlayerStats(specific).sumBaseTotal, 180, meta.label + " named base components");
  assert.equal(readFocusedPlayerStats(specific).totalStats, 270, meta.label + " named total components");
  const core = normalizeSfPlayerCharacterCore({ class: meta.id });
  core.identity.class = meta.id;
  for (const attribute of Object.values(core.attributes)) { attribute.base = 900; attribute.total = 1900; }
  core.attributes[meta.primaryAttribute].base = 100; core.attributes[meta.primaryAttribute].total = 150;
  core.attributes.constitution.base = 80; core.attributes.constitution.total = 120;
  const stats = readFocusedPlayerStats({ ...raw, class: meta.id }, core);
  assert.equal(stats.sumBaseTotal, 180, meta.label + " base pair"); assert.equal(stats.totalStats, 270, meta.label + " total pair");
}
const model = buildLocalPlayerProfileModel({ rawPlayer: raw, sourceScanId: "existing-source", sourcePlayerKey: "f8_net_p1", scannedAtMs: 1000, scannedAtIso: null, guild: { name: "Guild", server: "F8" } });
assert.equal(model.hero.metrics?.find(metric => metric.label === "Total Base Stats")?.value, "180");
assert.equal(model.hero.totalStatsValue, 270, "existing stored five-attribute sums cannot displace profile pairs");

const member = (key: string, value: number | null) => ({ key, name: key, classLabel: "Warrior", playerStats: {
  baseMain: value, conBase: value == null ? 10 : value / 2, sumBaseTotal: value == null ? null : value * 1.5,
  attrTotal: value == null ? null : value * 2, conTotal: value == null ? null : value, totalStats: value == null ? null : value * 3,
} });
const current = [member("f8_net_p1", 250), member("f8_net_p3", 200), member("f8_net_p2", 150), member("f8_net_p4", 80), member("f8_net_p5", 0), member("f8_net_p6", null)];
const old = [member("f8_net_p99", 300), member("f8_net_p2", 220), member("f8_net_p3", 200), member("f8_net_p1", 80), member("f8_net_p5", 0)];
// Independently worked example: old ranks departed=1, B=2,C=3,A=4,F=5;
// current A=1,C=2,B=3,new=4,F=5,missing has no numeric rank.
const ranking = buildLocalGuildRanking(current, old, "main", "base", null);
assert.deepEqual(ranking.map(row => [row.rank, row.rankDelta, row.valueDelta]), [[1,3,170], [2,1,0], [3,-1,-70], [4,null,null], [5,0,0], [null,null,null]]);
for (const mode of ["base", "total"] as const) for (const [index, category] of (["main", "con", "sum"] as const).entries()) {
  const rows = buildLocalGuildRanking(current, old, category, mode, null);
  const top = summarizeLocalGuildPlayerStats(current, mode)[index];
  assert.deepEqual(rows.filter(row => row.rank != null).slice(0,3).map(row => [row.key,row.value]), top.entries.map(row => [row.key,row.value]));
  assert.equal(rows.length, current.length); assert(!rows.some(row => row.key === "f8_net_p99"));
}
const ties = [member("f8_net_p2",100),member("f8_net_p1",100)];
assert.deepEqual(buildLocalGuildRanking(ties, [], "sum", "base", null).map(row => [row.key,row.rank]), [["f8_net_p2",1],["f8_net_p1",2]]);
const identities: IdentityResolutionSnapshot = {
  players: buildPlayerIdentityResolutionIndex([{ entity: { entityId: "confirmed", createdAt: "0", updatedAt: "0" }, aliases: ["f8_net_p1","f7_net_p11"].map(identifier => ({ identifier, identifierKey: identifier, entityId: "confirmed", source: "manual", addedAt: "0" })) }]),
  guilds: { byIdentifier: new Map(), byIdentityId: new Map() },
};
assert.equal(buildLocalGuildRanking(current, [member("f7_net_p11",80)], "main", "base", identities)[0].valueDelta, 170);
assert.equal(buildLocalGuildRanking(current, [member("f7_net_p11",80)], "main", "base", null)[0].valueDelta, null);
const named = { ...member("scan:name:Alex", 100), name: "Alex" };
assert.equal(buildLocalGuildRanking([named], [named], "main", "base", identities)[0].valueDelta, null, "names never match history");
assert.equal(buildLocalGuildRanking(current, [member("f8_net_p1", 80), member("f7_net_p11",90)], "main", "base", identities)[0].valueDelta, null, "ambiguous identity is unavailable");
assert(buildLocalGuildRanking(current, [], "main", "base", null).every(row => row.valueDelta === null && row.rankDelta === null));
const now = Date.UTC(2026,9,12), day=86400000;
const snapshot = (days: number): GuildTrendSnapshot => ({ snapshotId: String(days), sourceScanId: String(days), sourceScanFilename: String(days), scannedAtMs: now-days*day, guildName: "Guild", guildIdentifier: "f8_net_g1", declaredMemberCount: 5, foundUniqueMemberCount: 5, validXpTotalCount: 5, validFocusedBaseStatsCount: 5, averageXpTotal: 10, averageFocusedBaseStats: 20 });
assert.equal(selectLocalGuildRankingComparison([snapshot(45),snapshot(35),snapshot(5),snapshot(-1)],now)?.scannedAtMs,now-35*day);
assert.equal(selectLocalGuildRankingComparison([snapshot(5),snapshot(20)],now)?.scannedAtMs,now-20*day,"fallback matches the profile's oldest available option below 30d");
assert.equal(selectLocalGuildRankingComparison([snapshot(-1),snapshot(0)],now),null,"no future or current comparison");
assert.equal(selectLocalGuildRankingComparison([],now),null);
console.log("PASS focused sums/classes/profile, full rankings, independent delta example, ties, missing/zero, confirmed aliases, ambiguity, departed/new members and shared comparison/fallback");
