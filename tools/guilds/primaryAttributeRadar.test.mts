import assert from "node:assert/strict";
import test from "node:test";
import { buildPrimaryAttributeRadar as buildRadar, primaryRadarFraction, type PrimaryRadarBasis } from "../../src/lib/local-player-profile/primaryAttributeRadar";
import { buildPlayerIdentityResolutionIndex, buildGuildIdentityResolutionIndex } from "../../src/lib/identities/identityResolution";
import type { ProfileHistoryMember } from "../../src/lib/local-player-profile/profileSumHistory";
import type { LocalPlayerProfileModel } from "../../src/components/local-player-profile/types";
import { resolvePrimaryRadarReference } from "../../src/lib/local-player-profile/primaryRadarReference";
import type { LocalToplistArchiveContext } from "../../src/pages/DataHub/localToplistPageModel";

const at = Date.parse("2026-09-05T09:15:57Z");
const basis: PrimaryRadarBasis = { identity: { players: buildPlayerIdentityResolutionIndex([]) },
  sources: [{ sourceScanId: "current", sourceGeneration: "generation", contentHash: "current-hash", snapshotTimestamps: [at, at - 1000] }] };
const buildPrimaryAttributeRadar = (rows: readonly ProfileHistoryMember[], target: LocalPlayerProfileModel,
  month: string, mode: "main-con" | "all-five", selected = basis) => buildRadar(rows, target, month, mode, selected);
const profile = { sourceScanId: "current", sourcePlayerKey: "s5_eu_p1", analytics: { server: "EU5", memberRef: "s5_eu_p1", scannedAtMs: at } } as LocalPlayerProfileModel;
const row = (id: number, classId: string | null, value: number | null, overrides: Partial<ProfileHistoryMember> = {}): ProfileHistoryMember => ({
  id: String(id), sourceScanId: "current", snapshotTimestamp: at, memberRef: `s5_eu_p${id}`, server: "s5_eu", classId,
  level: value, mine: value, treasury: value,
  profileSums: { "main-con": { base: value, total: value === null ? null : value * 2 }, "all-five": { base: value === null ? null : value * 3, total: value === null ? null : value * 4 } },
  sourceGeneration: "generation", snapshotId: `${overrides.sourceScanId ?? "current"}::${overrides.snapshotTimestamp ?? at}`, ...overrides,
} as ProfileHistoryMember);

test("Dex average includes all exact Dex classes and the player; maxima include every server class", () => {
  const rows = [row(1, "Scout", 10), row(2, "Assassin", 30), row(3, "7", 20), row(4, "12", 40), row(5, "Warrior", 100), row(6, "Mage", 200), row(7, "Scout impostor", 300)];
  const model = buildPrimaryAttributeRadar(rows, profile, "2026-09", "main-con")!;
  assert.equal(model.primary, "dexterity"); assert.equal(model.groupSize, 4); assert.equal(model.population, 7);
  assert.deepEqual(model.axes.map(a => a.key), ["base", "total", "level", "mine", "treasury"]);
  assert.deepEqual(model.axes.map(a => a.average), [25, 50, 25, 25, 25]);
  assert.deepEqual(model.axes.map(a => a.maximum), [300, 600, 300, 100, 45]);
  assert.equal(primaryRadarFraction(model.axes[0].average, model.axes[0].maximum), 25 / 300);
});
test("missing and invalid values have independent valid counts; real zero is retained", () => {
  const model = buildPrimaryAttributeRadar([row(1, "3", 0), row(2, "4", null, { level: 10, mine: -1, treasury: NaN })], profile, "2026-09", "main-con")!;
  assert.deepEqual(model.axes.map(a => a.count), [1, 1, 2, 1, 1]);
  assert.deepEqual(model.axes.map(a => a.average), [0, 0, 5, 0, 0]);
  assert.equal(primaryRadarFraction(0, 0), null); assert.equal(primaryRadarFraction(null, 10), null);
  assert.equal(primaryRadarFraction(0, 10), 0); assert.equal(primaryRadarFraction(5, Infinity), null);
});
test("the saved sum mode changes both stats axes without changing level/buildings", () => {
  const model = buildPrimaryAttributeRadar([row(1, "Scout", 10), row(2, "Assassin", 30)], profile, "2026-09", "all-five")!;
  assert.deepEqual(model.axes.map(a => a.player), [30, 40, 10, 10, 10]);
  assert.deepEqual(model.axes.map(a => a.average), [60, 80, 20, 20, 20]);
});
test("other servers and months cannot enter either population; original and fusion servers stay separate", () => {
  const rows = [row(1, "Scout", 10), row(2, "Scout", 900, { server: "F28" }), row(3, "Scout", 900, { snapshotTimestamp: Date.parse("2026-08-02") })];
  assert.equal(buildPrimaryAttributeRadar(rows, profile, "2026-09", "main-con")!.population, 1);
  assert.equal(buildPrimaryAttributeRadar(rows, profile, "2026-08", "main-con"), null);
});
test("missing, historical, ambiguous or unknown-class player observations cannot fabricate a comparison", () => {
  assert.equal(buildPrimaryAttributeRadar([row(2, "Scout", 10)], profile, "2026-09", "main-con"), null);
  assert.equal(buildPrimaryAttributeRadar([row(1, "Scout", 10, { sourceScanId: "old" })], profile, "2026-09", "main-con"), null);
  assert.equal(buildPrimaryAttributeRadar([row(1, "Scout-like", 10)], profile, "2026-09", "main-con"), null);
  assert.equal(buildPrimaryAttributeRadar([row(1, "Scout", 10), row(1, "Scout", 20)], profile, "2026-09", "main-con"), null);
});
test("a monthly pool counts each literal player once, using the latest observation", () => {
  const model = buildPrimaryAttributeRadar([row(1, "Scout", 10), row(2, "Assassin", 5, { snapshotTimestamp: at - 1000 }), row(2, "Assassin", 30)], profile, "2026-09", "main-con")!;
  assert.equal(model.population, 2); assert.equal(model.axes[0].average, 20);
});

function identities(groups: string[][]): PrimaryRadarBasis {
  return { ...basis, identity: { players: buildPlayerIdentityResolutionIndex(groups.map((references, index) => ({
    entity: { entityId: `confirmed-${index}`, createdAt: "0", updatedAt: "0" },
    aliases: references.map(identifier => ({ identifier, identifierKey: identifier.toLowerCase(), entityId: `confirmed-${index}`,
      addedAt: "0", confirmedAt: "0", source: "manual" as const })),
  }))) } };
}

const fusionProfile = { ...profile, sourceScanId: "user", sourcePlayerKey: "f29_net_p11",
  analytics: { ...profile.analytics, server: "F29", memberRef: "f29_net_p11", scannedAtMs: at + 40 * 86400000 } };
const referenceContext = (servers: string[], issues: LocalToplistArchiveContext["issues"] = []) => ({
  entries: servers.map(server => ({ id: server, server, timestamp: at })), issues,
} as LocalToplistArchiveContext);

test("personal OG selection uses confirmed provenance and preserves physical Current priority", () => {
  const identity = identities([["s5_eu_p1", "f29_net_p11"]]).identity;
  assert.equal(resolvePrimaryRadarReference(referenceContext(["EU5", "EU6"]), identity, fusionProfile)!.server, "EU5");
  assert.equal(resolvePrimaryRadarReference(referenceContext(["EU5", "F29"]), identity, fusionProfile)!.server, "F29");
  assert.equal(resolvePrimaryRadarReference(referenceContext(["EU6"]), identity, fusionProfile), null);
  assert.equal(resolvePrimaryRadarReference(referenceContext(["EU5"]), basis.identity, fusionProfile), null);
  const conflict = identities([["s5_eu_p1", "s6_eu_p1", "f29_net_p11"]]).identity;
  assert.equal(resolvePrimaryRadarReference(referenceContext(["EU5", "EU6"]), conflict, fusionProfile), null);
  for (const code of ["catalog-error", "manifest-error", "current-conflict", "entry-missing"] as const)
    assert.throws(() => resolvePrimaryRadarReference(referenceContext(["EU5"], [{ code, server: "F29", message: "failure" }]), identity, fusionProfile));
  const mixed = referenceContext(["F29", "F29", "EU5"]);
  mixed.entries[1].timestamp = Date.parse("2026-08-02");
  assert.throws(() => resolvePrimaryRadarReference(mixed, identity, fusionProfile));
});

test("personal OG reference reuses the shared multistage origin resolver", () => {
  const target = { ...fusionProfile, sourcePlayerKey: "maerwynn_p102",
    analytics: { ...fusionProfile.analytics, server: "MAERWYNN", memberRef: "maerwynn_p102" } };
  const identity = identities([["123playgames_p100", "f4_p101", "maerwynn_p102"]]).identity;
  assert.equal(resolvePrimaryRadarReference(referenceContext(["123PLAYGAMES", "F4"]), identity, target)!.server, "123PLAYGAMES");
  assert.equal(resolvePrimaryRadarReference(referenceContext(["F4"]), identity, target), null);
});

test("a validated Current pool is independent of the profile's historical source/time anchor", () => {
  const anchored = { ...profile, sourceScanId: "profile-october", analytics: { ...profile.analytics, scannedAtMs: Date.parse("2026-10-04") } };
  assert.equal(buildRadar([row(1, "Scout", 10)], anchored, "2026-09", "main-con", basis)!.axes[0].player, 10);
  assert.equal(anchored.sourceScanId, "profile-october");
});

test("the shared confirmed resolver links a logical reference to the physical Current observation", () => {
  const confirmed = identities([["s5_eu_p1", "f29_net_p11"]]);
  const logical = { ...profile, analytics: { ...profile.analytics, memberRef: "f29_net_p11" } };
  assert.equal(buildRadar([row(1, "Scout", 10)], logical, "2026-09", "main-con", confirmed)!.axes[0].player, 10);
  assert.equal(buildRadar([row(1, "Scout", 10)], logical, "2026-09", "main-con", basis), null);
  assert.equal(buildRadar([row(1, "Scout", 10, { server: "F29", memberRef: "f29_net_p11" })], logical, "2026-09", "main-con", confirmed), null);
});

test("confirmed aliases in the same population count once; equally timed contradictions remain unavailable", () => {
  const confirmed = identities([["s5_eu_p1", "s5_eu_p2"]]);
  const model = buildRadar([row(1, "Scout", 10, { snapshotTimestamp: at - 1000 }), row(2, "Scout", 20)], profile, "2026-09", "main-con", confirmed)!;
  assert.equal(model.population, 1); assert.equal(model.groupSize, 1); assert.equal(model.axes[0].average, 20);
  assert.equal(buildRadar([row(1, "Scout", 10), row(2, "Scout", 20)], profile, "2026-09", "main-con", confirmed), null);
});

test("missing and conflicting identities cannot fall back to names or bare player numbers", () => {
  assert.equal(buildRadar([row(2, "Scout", 20, { name: "Hero" })], profile, "2026-09", "main-con", basis), null);
  const conflict = identities([["s5_eu_p1"], ["eu5_p1"]]);
  assert.equal(buildRadar([row(1, "Scout", 10)], profile, "2026-09", "main-con", conflict), null);
  assert.equal(buildRadar([row(1, "Scout", 10, { server: "EU6", memberRef: "s6_eu_p1" })], profile, "2026-09", "main-con", basis), null);
});

test("selected source, generation, snapshot, timestamp and hash proofs remain mandatory", () => {
  for (const overrides of [{ sourceScanId: "other" }, { sourceGeneration: "old" }, { snapshotId: "wrong" }, { snapshotTimestamp: at + 1 }]) {
    assert.equal(buildRadar([row(1, "Scout", 10, overrides)], profile, "2026-09", "main-con", basis), null);
  }
  assert.equal(buildRadar([row(1, "Scout", 10)], profile, "2026-09", "main-con", { ...basis, sources: [{ ...basis.sources[0], contentHash: "" }] }), null);
});

const localBasis = (monthly: ProfileHistoryMember[], local: ProfileHistoryMember[], guilds: NonNullable<PrimaryRadarBasis["local"]>["data"]["guilds"] = [], confirmed = basis): PrimaryRadarBasis => ({
  ...confirmed, identity: { ...confirmed.identity, guilds: buildGuildIdentityResolutionIndex([]) },
  local: { data: { snapshots: [], members: [...monthly, ...local], guilds },
    sources: [...confirmed.sources, ...[...new Set(local.map(row => row.sourceScanId))].filter(id => !confirmed.sources.some(source => source.sourceScanId === id)).map(id => ({
      sourceScanId: id, sourceGeneration: "generation", contentHash: "local-hash", snapshotTimestamps: [...new Set(local.filter(row => row.sourceScanId === id).map(row => row.snapshotTimestamp))],
    }))] },
});
const recent = (id: number, value: number | null, overrides: Partial<ProfileHistoryMember> = {}) => row(id, "Scout", value, {
  sourceScanId: "user", sourceScanFilename: "own-sftools.json", snapshotTimestamp: at + 40 * 86400000,
  snapshotId: `user::${at + 40 * 86400000}`, ...overrides,
});

test("W173: monthly modes keep separate populations, latest local player and fixed maxima", () => {
  const monthly = [row(1, "Scout", 10), row(2, "Assassin", 30), row(3, "Scout", 20), row(4, "Mage", 100)];
  const selected = localBasis(monthly, [recent(1, 200, { mine: null, treasury: null })]);
  const expected = { main: [20, 3], class: [15, 2], server: [40, 4] } as const;
  for (const comparison of ["main", "class", "server"] as const) {
    const model = buildRadar(monthly, profile, "2026-09", "main-con", selected, comparison)!;
    assert.equal(model.axes[0].average, expected[comparison][0]); assert.equal(model.groupSize, expected[comparison][1]);
    assert.deepEqual(model.axes.map(axis => axis.player), [200, 400, 200, null, null]);
    assert.equal(model.axes[0].maximum, 100); assert.equal(primaryRadarFraction(model.axes[0].player, model.axes[0].maximum), 1);
    assert.equal(model.axes[0].player, 200); assert.equal(model.playerScan.filename, "own-sftools.json");
    assert.equal(model.playerScan.timestamp, at + 40 * 86400000); assert.equal(model.month, "2026-09");
  }
});

test("W173: confirmed fusion identity takes newest physical observation without crossing monthly populations", () => {
  const monthly = [row(1, "Scout", 10), row(2, "Assassin", 30)];
  const latest = recent(11, 200, { memberRef: "f29_net_p11", server: "F29" });
  const selected = localBasis(monthly, [latest], [], identities([["s5_eu_p1", "f29_net_p11"]]));
  const model = buildRadar(monthly, profile, "2026-09", "main-con", selected)!;
  assert.equal(model.playerScan.memberRef, "f29_net_p11"); assert.equal(model.axes[0].player, 200);
  assert.equal(model.population, 2); assert.equal(model.axes[0].average, 20); assert.equal(model.axes[0].maximum, 30);
  assert.equal(buildRadar(monthly, profile, "2026-09", "main-con", localBasis(monthly, [latest]))!.axes[0].player, 10);
});

test("OG monthly modes and maxima keep the newest confirmed fusion player independent", () => {
  const monthly = [row(1, "Scout", 10), row(2, "Assassin", 30), row(3, "Scout", 20), row(4, "Mage", 100),
    row(5, "Scout", 9999, { server: "EU6", memberRef: "s6_eu_p5" })];
  const latest = recent(11, 200, { memberRef: "f29_net_p11", server: "F29", mine: null, treasury: 50 });
  const selected = localBasis(monthly, [latest], [], identities([["s5_eu_p1", "f29_net_p11"]]));
  const expected = { main: [20, 3], class: [15, 2], server: [40, 4] } as const;
  assert.equal(buildRadar(monthly, fusionProfile, "2026-09", "main-con", selected), null);
  for (const comparison of ["main", "class", "server"] as const) {
    const model = buildRadar(monthly, fusionProfile, "2026-09", "main-con", selected, comparison, "EU5")!;
    assert.equal(model.referenceServer, "EU5"); assert.equal(model.population, 4);
    assert.equal(model.axes[0].average, expected[comparison][0]); assert.equal(model.groupSize, expected[comparison][1]);
    assert.deepEqual(model.axes.map(axis => axis.maximum), [100, 200, 100, 100, 45]);
    assert.deepEqual(model.axes.map(axis => axis.player), [200, 400, 200, null, 50]);
    assert.equal(model.playerScan.server, "F29"); assert.equal(model.playerScan.memberRef, "f29_net_p11");
    assert.equal(model.playerScan.timestamp, latest.snapshotTimestamp);
  }
  assert.equal(fusionProfile.analytics.server, "F29");
});

test("W173: guild uses latest eligible declared roster, five missing allowed and six rejected", () => {
  const monthly = [row(1, "Scout", 10), row(2, "Mage", 100)];
  const guildRef = "s5_eu_g1";
  const local = Array.from({ length: 45 }, (_, i) => recent(i + 1, i + 20, { guildIdentifier: guildRef, focusedBaseStats: i + 20, focusedTotalStats: (i + 20) * 2, baseMain: i + 20, conBase: 0, attrTotal: (i + 20) * 2, conTotal: 0, classId: i % 2 ? "Mage" : "Scout" }));
  const guild = { id: "guild", sourceScanId: "user", sourceScanFilename: "own-sftools.json", sourceGeneration: "generation", snapshotId: local[0].snapshotId,
    snapshotTimestamp: local[0].snapshotTimestamp, guildIdentifier: guildRef, guildName: "All classes", server: "EU5", guildSegment: "1", memberCount: 50, declaredMemberCount: 50,
    averageLevel: null, averageBaseStats: null, averageTotalStats: null };
  const selected = localBasis(monthly, local, [guild]);
  const model = buildRadar(monthly, profile, "2026-09", "main-con", selected, "guild")!;
  assert.equal(model.groupSize, 45); assert.equal(model.axes[0].average, 42); assert.equal(model.axes[2].average, 42);
  assert.equal(model.comparisonScan?.sourceScanId, "user"); assert.equal(model.axes[0].maximum, 100);
  const incomplete = buildRadar(monthly, profile, "2026-09", "main-con", localBasis(monthly, local.slice(0, 44), [guild]), "guild")!;
  assert.equal(incomplete.comparisonAvailable, false); assert(incomplete.axes.every(axis => axis.average === null));
  const newer = { ...guild, id: "newer", sourceScanId: "newer", snapshotTimestamp: guild.snapshotTimestamp + 1000, snapshotId: `newer::${guild.snapshotTimestamp + 1000}` };
  const sparse = local.slice(0, 44).map(row => ({ ...row, sourceScanId: newer.sourceScanId, snapshotTimestamp: newer.snapshotTimestamp, snapshotId: newer.snapshotId }));
  const fallback = buildRadar(monthly, profile, "2026-09", "main-con", localBasis(monthly, [...local, ...sparse], [guild, newer]), "guild")!;
  assert.equal(fallback.comparisonScan?.sourceScanId, "user"); assert.equal(fallback.playerScan.sourceScanId, "newer");
});

test("W173: ambiguous newest player, missing guild and invalid scale stay honest", () => {
  const monthly = [row(1, "Scout", 10)];
  assert.equal(buildRadar(monthly, profile, "2026-09", "main-con", localBasis(monthly, [recent(1, 200), recent(1, 201)])), null);
  const unavailable = buildRadar(monthly, profile, "2026-09", "main-con", localBasis(monthly, [recent(1, 200)]), "guild")!;
  assert.equal(unavailable.axes[0].player, 200); assert.equal(unavailable.comparisonAvailable, false);
  assert.equal(primaryRadarFraction(200, null), null); assert.equal(primaryRadarFraction(200, 0), null);
});


test("W173: confirmed guild fusion reuses an older physical guild roster and deduplicates confirmed peers", () => {
  const monthly = [row(1, "Scout", 10), row(2, "Mage", 100)];
  const roster = Array.from({ length: 45 }, (_, i) => recent(i + 1, i + 20, {
    sourceScanId: "guild", sourceScanFilename: "guild-source.json", snapshotTimestamp: at + 39 * 86400000,
    snapshotId: `guild::${at + 39 * 86400000}`, guildIdentifier: "s5_eu_g1", baseMain: i + 20, conBase: 0,
    focusedBaseStats: i + 20, attrTotal: 2 * (i + 20), conTotal: 0, focusedTotalStats: 2 * (i + 20),
  }));
  const latest = recent(1111, 200, { server: "F29", memberRef: "f29_net_p1111", guildIdentifier: "f29_net_g11" });
  const duplicate = { ...roster[1], id: "confirmed-peer", memberRef: "f29_net_p90002" };
  const guild = { id: "guild", sourceScanId: "guild", sourceScanFilename: "guild-source.json", sourceGeneration: "generation",
    snapshotId: roster[0].snapshotId, snapshotTimestamp: roster[0].snapshotTimestamp, guildIdentifier: "s5_eu_g1", guildSegment: "1",
    server: "EU5", guildName: "Confirmed guild", memberCount: 50, declaredMemberCount: 50, averageLevel: null, averageBaseStats: null, averageTotalStats: null };
  const selected = localBasis(monthly, [...roster, duplicate, latest], [guild], identities([["s5_eu_p1", "f29_net_p1111"], ["s5_eu_p2", "f29_net_p90002"]]));
  selected.identity.guilds = buildGuildIdentityResolutionIndex([{ entity: { entityId: "guild-confirmed", createdAt: "0", updatedAt: "0" }, aliases:
    ["s5_eu_g1", "f29_net_g11"].map(identifier => ({ identifier, identifierKey: identifier, entityId: "guild-confirmed", addedAt: "0", confirmedAt: "0", source: "manual" as const })) }]);
  const model = buildRadar(monthly, profile, "2026-09", "main-con", selected, "guild")!;
  assert.equal(model.playerScan.memberRef, "f29_net_p1111"); assert.equal(model.comparisonScan?.guildIdentifier, "s5_eu_g1");
  assert.equal(model.comparisonScan?.sourceScanId, "guild"); assert.equal(model.groupSize, 45);
  assert.equal(model.axes[0].count, 45); assert.equal(model.axes[0].average, 42); assert.equal(model.axes[0].player, 200);
});
