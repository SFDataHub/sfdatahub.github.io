import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { deleteDB } from "idb";

import type { GuildHubLogicalScanSnapshot } from "../../src/lib/guilds/localScanLibrary.ts";
import {
  buildFusionIdentityManagementReportFromSnapshots,
  confirmFusionIdentityLink,
  mergeReadyFusionIdentityItems,
  rejectFusionIdentityCandidate,
  unlinkFusionIdentityAlias,
} from "../../src/lib/identities/fusionIdentityManagement.ts";
import { createGuildIdentityStore } from "../../src/lib/identities/guildIdentityStore.ts";
import { createPlayerIdentityStore } from "../../src/lib/identities/playerIdentityStore.ts";

type MemberInput = {
  id: string;
  name: string;
  server: string;
  guildSegment: string;
  guildName: string;
  level?: number;
  classId?: string;
};

const COA = "01234567890123456789ab";
const OTHER_COA = "1111111111111111111111";

const member = ({ id, name, server, guildSegment, guildName, level = 10, classId = "1" }: MemberInput) => ({
  memberRef: id,
  name,
  classId,
  level,
  baseStats: null,
  totalStats: null,
  server,
  guildSegment,
  groupSegment: guildSegment,
  guildName,
  guildRole: "member" as const,
});

const group = (server: string, segment: string, name: string, memberCount: number, coaString: string) => ({
  identifier: `${server}_${segment}`,
  server,
  name,
  memberCount,
  coaString,
});

const snapshot = (
  id: string,
  timestampMs: number,
  server: string,
  members: MemberInput[],
  groups: unknown[],
): GuildHubLogicalScanSnapshot => ({
  id,
  timestamp: new Date(timestampMs).toISOString(),
  timestampMs,
  players: members.map((entry) => ({ identifier: entry.id })),
  groups,
  servers: [server],
  playerCount: members.length,
  groupCount: groups.length,
  guildCount: groups.length,
  rawData: { players: [], groups },
  normalizedMembers: members.map(member),
  sourceScanId: id,
  sourceScanFilename: `${id}.json`,
  sourceImportedAt: new Date(timestampMs).toISOString(),
});

const createSnapshots = () => [
  snapshot(
    "old-eu1",
    1000,
    "s1_eu",
    [
      { id: "s1_eu_p1", name: "Alice", server: "s1_eu", guildSegment: "g1", guildName: "Knights" },
      { id: "s1_eu_p2", name: "Bob", server: "s1_eu", guildSegment: "g1", guildName: "Knights" },
      { id: "s1_eu_p3", name: "Cid", server: "s1_eu", guildSegment: "g1", guildName: "Knights" },
      { id: "s1_eu_p4", name: "Dora", server: "s1_eu", guildSegment: "g2", guildName: "Visitors" },
      { id: "s1_eu_p5", name: "Eve", server: "s1_eu", guildSegment: "g2", guildName: "Visitors" },
    ],
    [group("s1_eu", "g1", "Knights", 3, COA), group("s1_eu", "g2", "Visitors", 2, OTHER_COA)],
  ),
  snapshot(
    "old-eu2",
    1200,
    "s2_eu",
    [{ id: "s2_eu_p9", name: "ManualOnly", server: "s2_eu", guildSegment: "g7", guildName: "Archive" }],
    [group("s2_eu", "g7", "Archive", 1, "3333333333333333333333")],
  ),
  snapshot(
    "new-f28-a",
    2000,
    "f28_net",
    [
      { id: "f28_net_p901", name: "Alice (s1_eu)", server: "f28_net", guildSegment: "g9", guildName: "Knights", level: 11 },
      { id: "f28_net_p902", name: "Bob (s1_eu)", server: "f28_net", guildSegment: "g9", guildName: "Knights", level: 11 },
      { id: "f28_net_p903", name: "Cid (s1_eu)", server: "f28_net", guildSegment: "g9", guildName: "Knights", level: 11 },
      { id: "f28_net_p904", name: "Dora (s1_eu)", server: "f28_net", guildSegment: "g9", guildName: "Knights", level: 11 },
      { id: "f28_net_p905", name: "Eve (s1_eu)", server: "f28_net", guildSegment: "g9", guildName: "Knights", level: 11 },
      { id: "f28_net_p999", name: "Native", server: "f28_net", guildSegment: "g8", guildName: "Newcomers", level: 1 },
    ],
    [group("f28_net", "g9", "Knights", 5, COA), group("f28_net", "g8", "Newcomers", 1, "2222222222222222222222")],
  ),
  snapshot(
    "new-f28-b",
    3000,
    "f28_net",
    [
      { id: "f28_net_p901", name: "Alice (s1_eu)", server: "f28_net", guildSegment: "g9", guildName: "Knights", level: 12 },
      { id: "f28_net_p902", name: "Bob (s1_eu)", server: "f28_net", guildSegment: "g9", guildName: "Knights", level: 12 },
      { id: "f28_net_p903", name: "Cid (s1_eu)", server: "f28_net", guildSegment: "g9", guildName: "Knights", level: 12 },
      { id: "f28_net_p904", name: "Dora (s1_eu)", server: "f28_net", guildSegment: "g9", guildName: "Knights", level: 12 },
      { id: "f28_net_p905", name: "Eve (s1_eu)", server: "f28_net", guildSegment: "g9", guildName: "Knights", level: 12 },
    ],
    [group("f28_net", "g9", "Knights", 5, COA)],
  ),
];

const createMikaReservationSnapshots = () => [
  snapshot(
    "mika-old-eu1",
    1000,
    "s1_eu",
    [
      { id: "s1_eu_p61", name: "Mika", server: "s1_eu", guildSegment: "g1", guildName: "Archive" },
      { id: "s1_eu_p62", name: "Aleendar", server: "s1_eu", guildSegment: "g1", guildName: "Archive" },
    ],
    [group("s1_eu", "g1", "Archive", 2, COA)],
  ),
  snapshot(
    "mika-new-f28",
    2000,
    "f28_net",
    [
      { id: "f28_net_p61", name: "Mika (s1_eu)", server: "f28_net", guildSegment: "g1", guildName: "Archive", level: 11 },
      { id: "f28_net_p62", name: "Aleendar (s1_eu)", server: "f28_net", guildSegment: "g1", guildName: "Archive", level: 11 },
    ],
    [group("f28_net", "g1", "Archive", 2, COA)],
  ),
];

const createPlayerDoubleClaimSnapshots = () => [
  snapshot(
    "claim-old-eu1",
    1000,
    "s1_eu",
    [{ id: "s1_eu_p900", name: "Old X", server: "s1_eu", guildSegment: "g1", guildName: "Archive" }],
    [group("s1_eu", "g1", "Archive", 1, COA)],
  ),
  snapshot(
    "claim-new-f28",
    2000,
    "f28_net",
    [
      { id: "f28_net_p900", name: "Old X (s1_eu)", server: "f28_net", guildSegment: "g1", guildName: "Archive", level: 11 },
      { id: "f28_net_p901", name: "Old X (s1_eu)", server: "f28_net", guildSegment: "g1", guildName: "Archive", level: 11 },
    ],
    [group("f28_net", "g1", "Archive", 2, COA)],
  ),
];

const createNoHistoricalObservationSnapshots = () => [
  snapshot(
    "lookup-old-eu1",
    1000,
    "s1_eu",
    [{ id: "s1_eu_p1", name: "Alice", server: "s1_eu", guildSegment: "g1", guildName: "Archive" }],
    [group("s1_eu", "g1", "Archive", 1, COA)],
  ),
  snapshot(
    "lookup-new-f28",
    2000,
    "f28_net",
    [{ id: "f28_net_p76550", name: "Milfiway (s1eu)", server: "f28_net", guildSegment: "g1", guildName: "Archive", level: 11, classId: "8" }],
    [group("f28_net", "g1", "Archive", 1, COA)],
  ),
];

const createUnsafeRenameSnapshots = () => [
  snapshot(
    "rename-old-eu1",
    1000,
    "s1_eu",
    [{ id: "s1_eu_p1", name: "ArchiveName", server: "s1_eu", guildSegment: "g1", guildName: "Archive" }],
    [group("s1_eu", "g1", "Archive", 1, COA)],
  ),
  snapshot(
    "rename-new-f28",
    2000,
    "f28_net",
    [{ id: "f28_net_p76551", name: "BrandNewName", server: "f28_net", guildSegment: "g1", guildName: "Archive", level: 11, classId: "2" }],
    [group("f28_net", "g1", "Archive", 1, COA)],
  ),
];

const createWeakOnlyPlayerSnapshots = (candidateCount: number) => [
  snapshot(
    `weak-old-eu2-${candidateCount}`,
    Date.parse("2026-01-02T12:00:09.395Z"),
    "s2_eu",
    Array.from({ length: candidateCount }, (_, index) => ({
      id: `s2_eu_p17795${index}`,
      name: `Darth Monk ${index + 1}`,
      server: "s2_eu",
      guildSegment: `old_g${index}`,
      guildName: "Archive",
      level: 10,
      classId: "8",
    })),
    [group("s2_eu", "old_g1", "Archive", candidateCount, COA)],
  ),
  snapshot(
    `weak-new-f28-${candidateCount}`,
    Date.parse("2026-09-05T09:10:55.210Z"),
    "f28_net",
    [{ id: `f28_net_p18171${candidateCount}`, name: "Luzie", server: "f28_net", guildSegment: "new_g1", guildName: "50Todsünden", level: 384, classId: "8" }],
    [group("f28_net", "new_g1", "50Todsünden", 1, OTHER_COA)],
  ),
];

const createSinglePlausiblePlayerSnapshots = () => [
  snapshot(
    "plausible-old-eu2",
    Date.parse("2026-01-02T12:00:09.395Z"),
    "s2_eu",
    [{ id: "s2_eu_p177952", name: "Darth Monk", server: "s2_eu", guildSegment: "shared_g1", guildName: "50Todsünden", level: 10, classId: "8" }],
    [group("s2_eu", "shared_g1", "50Todsünden", 1, COA)],
  ),
  snapshot(
    "plausible-new-f28",
    Date.parse("2026-09-05T09:10:55.210Z"),
    "f28_net",
    [{ id: "f28_net_p181717", name: "Luzie", server: "f28_net", guildSegment: "shared_g1", guildName: "50Todsünden", level: 384, classId: "8" }],
    [group("f28_net", "shared_g1", "50Todsünden", 1, COA)],
  ),
];

const dbSuffix = Date.now();
const playerDb = `fusion-identity-management-player-${dbSuffix}`;
const guildDb = `fusion-identity-management-guild-${dbSuffix}`;
await deleteDB(playerDb);
await deleteDB(guildDb);

const playerStore = createPlayerIdentityStore({ dbName: playerDb });
const guildStore = createGuildIdentityStore({ dbName: guildDb });
const snapshots = createSnapshots();
const before = JSON.stringify(snapshots);

let report = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });
assert.equal(report.scope.label, "EU1-EU4 -> F28");
assert.equal(report.scope.postFusionSnapshotCount, 2);
assert.equal(report.items.filter((item) => item.entityType === "player").length, 6);
assert.equal(report.items.filter((item) => item.entityType === "guild").length, 2);
assert.equal(report.items.filter((item) => item.currentIdentifier === "f28_net_p901").length, 1);

const knights = report.items.find((item) => item.entityType === "guild" && item.currentName === "Knights");
assert.ok(knights);
assert.equal(knights.status, "ready");
assert.equal(knights.readyCandidateIdentifier, "eu1_g1");
assert.ok(knights.memberMigrationEdges.some((edge) => edge.oldGuildIdentifier === "eu1_g2"));

const readyPlayers = report.items.filter((item) => item.entityType === "player" && item.status === "ready");
assert.equal(readyPlayers.length, 5);
const readyAlice = report.items.find((item) => item.currentIdentifier === "f28_net_p901");
const readyBob = report.items.find((item) => item.currentIdentifier === "f28_net_p902");
assert.equal(readyAlice?.candidates.length, 1);
assert.equal(readyAlice?.candidates[0]?.historicalIdentifier, "s1_eu_p1");
const firstAliceObservation = readyAlice?.observations.reduce((earliest, observation) =>
  observation.timestamp < earliest.timestamp ? observation : earliest,
);
const latestAliceObservation = readyAlice?.observations.at(-1);
const clonedFirstAliceObservation = firstAliceObservation ? structuredClone(firstAliceObservation) : null;
const clonedLatestAliceObservation = latestAliceObservation ? structuredClone(latestAliceObservation) : null;
assert.equal(readyAlice?.observations.length, 2);
assert.equal(readyAlice?.firstSeen, 2000);
assert.equal(clonedFirstAliceObservation?.timestamp, 2000);
assert.equal(clonedFirstAliceObservation?.classId, "1");
assert.equal(clonedFirstAliceObservation?.level, 11);
assert.equal(clonedFirstAliceObservation?.guildName, "Knights");
assert.equal(readyAlice?.lastSeen, 3000);
assert.equal(clonedLatestAliceObservation?.timestamp, 3000);
assert.equal(clonedLatestAliceObservation?.classId, "1");
assert.equal(clonedLatestAliceObservation?.level, 12);
assert.equal(clonedLatestAliceObservation?.guildName, "Knights");
assert.equal(
  readyBob?.candidates.some((candidate) => candidate.historicalIdentifier === "s1_eu_p1"),
  false,
);

const mergeResult = await mergeReadyFusionIdentityItems(report, { playerStore, guildStore });
assert.equal(mergeResult.players, 5);
assert.equal(mergeResult.guilds, 1);
assert.deepEqual(mergeResult.errors, []);
assert.equal(JSON.stringify(snapshots), before);

report = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });
assert.equal(report.items.find((item) => item.currentIdentifier === "f28_net_p901")?.status, "completed");
assert.equal(report.items.find((item) => item.currentIdentifier === "f28_g9")?.status, "completed");

await unlinkFusionIdentityAlias("guild", "eu1_g1", { guildStore });
report = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });
assert.equal(report.items.find((item) => item.currentIdentifier === "f28_g9")?.status, "ready");

await confirmFusionIdentityLink("player", "f28_net_p999", "s2_eu_p9", { playerStore });
report = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });
assert.equal(report.items.find((item) => item.currentIdentifier === "f28_net_p999")?.status, "completed");

const rejectPlayerDb = `fusion-identity-management-player-reject-${dbSuffix}`;
const rejectGuildDb = `fusion-identity-management-guild-reject-${dbSuffix}`;
await deleteDB(rejectPlayerDb);
await deleteDB(rejectGuildDb);
const rejectPlayerStore = createPlayerIdentityStore({ dbName: rejectPlayerDb });
const rejectGuildStore = createGuildIdentityStore({ dbName: rejectGuildDb });

await rejectFusionIdentityCandidate("player", "f28_net_p901", "s1_eu_p1", { playerStore: rejectPlayerStore });
await rejectFusionIdentityCandidate("guild", "f28_g9", "eu1_g1", { guildStore: rejectGuildStore });
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots,
  playerStore: rejectPlayerStore,
  guildStore: rejectGuildStore,
});
const rejectedAlice = report.items.find((item) => item.currentIdentifier === "f28_net_p901");
assert.equal(rejectedAlice?.status, "unresolved");
assert.equal(rejectedAlice?.candidates[0]?.rejected, true);
assert.equal(rejectedAlice?.readyCandidateIdentifier, null);
const rejectedKnights = report.items.find((item) => item.currentIdentifier === "f28_g9");
assert.equal(rejectedKnights?.status, "unresolved");
assert.ok(rejectedKnights?.memberMigrationEdges.some((edge) => edge.oldGuildIdentifier === "eu1_g2"));

const collisionPlayerDb = `fusion-identity-management-player-collision-${dbSuffix}`;
const collisionGuildDb = `fusion-identity-management-guild-collision-${dbSuffix}`;
await deleteDB(collisionPlayerDb);
await deleteDB(collisionGuildDb);
const collisionPlayerStore = createPlayerIdentityStore({ dbName: collisionPlayerDb });
const collisionGuildStore = createGuildIdentityStore({ dbName: collisionGuildDb });
await collisionPlayerStore.linkPlayerIdentifiers("s1_eu_p1", "f28_net_p777", {
  source: "manual",
  confirmedAt: "2026-09-16T00:00:00.000Z",
});
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots,
  playerStore: collisionPlayerStore,
  guildStore: collisionGuildStore,
});
const collisionAlice = report.items.find((item) => item.currentIdentifier === "f28_net_p901");
assert.notEqual(collisionAlice?.status, "ready");
assert.equal(
  collisionAlice?.candidates.some((candidate) => candidate.historicalIdentifier === "s1_eu_p1"),
  false,
);

const mikaPlayerDb = `fusion-identity-management-player-mika-${dbSuffix}`;
const mikaGuildDb = `fusion-identity-management-guild-mika-${dbSuffix}`;
await deleteDB(mikaPlayerDb);
await deleteDB(mikaGuildDb);
const mikaPlayerStore = createPlayerIdentityStore({ dbName: mikaPlayerDb });
const mikaGuildStore = createGuildIdentityStore({ dbName: mikaGuildDb });
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots: createMikaReservationSnapshots(),
  playerStore: mikaPlayerStore,
  guildStore: mikaGuildStore,
});
const mika = report.items.find((item) => item.currentIdentifier === "f28_net_p61");
const aleendar = report.items.find((item) => item.currentIdentifier === "f28_net_p62");
assert.equal(mika?.status, "ready");
assert.equal(mika?.readyCandidateIdentifier, "s1_eu_p61");
assert.deepEqual(
  mika?.candidates.map((candidate) => candidate.historicalIdentifier),
  ["s1_eu_p61"],
);
assert.equal(aleendar?.status, "ready");
assert.equal(
  aleendar?.candidates.some((candidate) => candidate.historicalIdentifier === "s1_eu_p61"),
  false,
);

const doubleClaimPlayerDb = `fusion-identity-management-player-double-claim-${dbSuffix}`;
const doubleClaimGuildDb = `fusion-identity-management-guild-double-claim-${dbSuffix}`;
await deleteDB(doubleClaimPlayerDb);
await deleteDB(doubleClaimGuildDb);
const doubleClaimPlayerStore = createPlayerIdentityStore({ dbName: doubleClaimPlayerDb });
const doubleClaimGuildStore = createGuildIdentityStore({ dbName: doubleClaimGuildDb });
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots: createPlayerDoubleClaimSnapshots(),
  playerStore: doubleClaimPlayerStore,
  guildStore: doubleClaimGuildStore,
});
const doubleClaimPlayers = report.items.filter((item) => item.entityType === "player" && item.currentIdentifier.startsWith("f28_net_p90"));
assert.equal(doubleClaimPlayers.length, 2);
doubleClaimPlayers.forEach((item) => {
  assert.equal(item.status, "review");
  assert.ok(item.reasons.includes("historical identity is claimed by multiple current identities"));
  assert.ok(item.candidates.some((candidate) => candidate.historicalIdentifier === "s1_eu_p900"));
});

const noObservationPlayerDb = `fusion-identity-management-player-no-observation-${dbSuffix}`;
const noObservationGuildDb = `fusion-identity-management-guild-no-observation-${dbSuffix}`;
await deleteDB(noObservationPlayerDb);
await deleteDB(noObservationGuildDb);
const noObservationPlayerStore = createPlayerIdentityStore({ dbName: noObservationPlayerDb });
const noObservationGuildStore = createGuildIdentityStore({ dbName: noObservationGuildDb });
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots: createNoHistoricalObservationSnapshots(),
  playerStore: noObservationPlayerStore,
  guildStore: noObservationGuildStore,
});
const milfiway = report.items.find((item) => item.currentIdentifier === "f28_net_p76550");
assert.equal(milfiway?.status, "noHistoricalObservation");
assert.equal(milfiway?.reasonCodes[0], "no-historical-observation");
assert.equal(milfiway?.diagnostics?.reliableHistoricalLookup?.baseName, "Milfiway");
assert.equal(milfiway?.diagnostics?.historicalSnapshotCount, 1);
assert.equal(report.summary.ready + report.summary.review + report.summary.unresolved + report.summary.noHistoricalObservation + report.summary.noHistory + report.summary.completed, report.summary.total);

const unsafeRenamePlayerDb = `fusion-identity-management-player-unsafe-rename-${dbSuffix}`;
const unsafeRenameGuildDb = `fusion-identity-management-guild-unsafe-rename-${dbSuffix}`;
await deleteDB(unsafeRenamePlayerDb);
await deleteDB(unsafeRenameGuildDb);
const unsafeRenamePlayerStore = createPlayerIdentityStore({ dbName: unsafeRenamePlayerDb });
const unsafeRenameGuildStore = createGuildIdentityStore({ dbName: unsafeRenameGuildDb });
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots: createUnsafeRenameSnapshots(),
  playerStore: unsafeRenamePlayerStore,
  guildStore: unsafeRenameGuildStore,
});
const unsafeRename = report.items.find((item) => item.currentIdentifier === "f28_net_p76551");
assert.equal(unsafeRename?.status, "unresolved");
assert.notEqual(unsafeRename?.status, "noHistoricalObservation");

const singleWeakPlayerDb = `fusion-identity-management-player-single-weak-${dbSuffix}`;
const singleWeakGuildDb = `fusion-identity-management-guild-single-weak-${dbSuffix}`;
await deleteDB(singleWeakPlayerDb);
await deleteDB(singleWeakGuildDb);
const singleWeakPlayerStore = createPlayerIdentityStore({ dbName: singleWeakPlayerDb });
const singleWeakGuildStore = createGuildIdentityStore({ dbName: singleWeakGuildDb });
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots: createWeakOnlyPlayerSnapshots(1),
  playerStore: singleWeakPlayerStore,
  guildStore: singleWeakGuildStore,
});
const singleWeak = report.items.find((item) => item.currentIdentifier === "f28_net_p181711");
assert.equal(singleWeak?.status, "unresolved");
assert.equal(singleWeak?.reasonCodes[0], "no-actionable-candidate");
assert.equal(singleWeak?.candidates.length, 0);
assert.equal(singleWeak?.diagnostics?.candidatePipeline.candidatesAfterExclusions, 1);
assert.equal(singleWeak?.diagnostics?.candidatePipeline.candidatesAfterReservations, 0);
assert.equal(singleWeak?.diagnostics?.candidatePipeline.finalCandidates, 0);

const multipleWeakPlayerDb = `fusion-identity-management-player-multiple-weak-${dbSuffix}`;
const multipleWeakGuildDb = `fusion-identity-management-guild-multiple-weak-${dbSuffix}`;
await deleteDB(multipleWeakPlayerDb);
await deleteDB(multipleWeakGuildDb);
const multipleWeakPlayerStore = createPlayerIdentityStore({ dbName: multipleWeakPlayerDb });
const multipleWeakGuildStore = createGuildIdentityStore({ dbName: multipleWeakGuildDb });
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots: createWeakOnlyPlayerSnapshots(10),
  playerStore: multipleWeakPlayerStore,
  guildStore: multipleWeakGuildStore,
});
const multipleWeak = report.items.find((item) => item.currentIdentifier === "f28_net_p1817110");
assert.equal(multipleWeak?.status, "unresolved");
assert.equal(multipleWeak?.reasonCodes[0], "no-actionable-candidate");
assert.equal(multipleWeak?.candidates.length, 0);
assert.equal(multipleWeak?.diagnostics?.candidatePipeline.candidatesAfterExclusions, 10);
assert.equal(multipleWeak?.diagnostics?.candidatePipeline.candidatesAfterReservations, 0);
assert.equal(multipleWeak?.diagnostics?.candidatePipeline.finalCandidates, 0);

const plausiblePlayerDb = `fusion-identity-management-player-plausible-${dbSuffix}`;
const plausibleGuildDb = `fusion-identity-management-guild-plausible-${dbSuffix}`;
await deleteDB(plausiblePlayerDb);
await deleteDB(plausibleGuildDb);
const plausiblePlayerStore = createPlayerIdentityStore({ dbName: plausiblePlayerDb });
const plausibleGuildStore = createGuildIdentityStore({ dbName: plausibleGuildDb });
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots: createSinglePlausiblePlayerSnapshots(),
  playerStore: plausiblePlayerStore,
  guildStore: plausibleGuildStore,
});
const plausible = report.items.find((item) => item.currentIdentifier === "f28_net_p181717");
assert.equal(plausible?.status, "review");
assert.equal(plausible?.reasonCodes[0], "insufficient-continuity");
assert.equal(plausible?.readyCandidateIdentifier, null);
assert.equal(plausible?.candidates.length, 1);
assert.equal(plausible?.candidates[0]?.historicalIdentifier, "s2_eu_p177952");
assert.equal(plausible?.candidates[0]?.entityType === "player" ? plausible.candidates[0].evidence.classification : null, "plausible");

await playerStore.close();
await guildStore.close();
await rejectPlayerStore.close();
await rejectGuildStore.close();
await collisionPlayerStore.close();
await collisionGuildStore.close();
await mikaPlayerStore.close();
await mikaGuildStore.close();
await doubleClaimPlayerStore.close();
await doubleClaimGuildStore.close();
await noObservationPlayerStore.close();
await noObservationGuildStore.close();
await unsafeRenamePlayerStore.close();
await unsafeRenameGuildStore.close();
await singleWeakPlayerStore.close();
await singleWeakGuildStore.close();
await multipleWeakPlayerStore.close();
await multipleWeakGuildStore.close();
await plausiblePlayerStore.close();
await plausibleGuildStore.close();
await deleteDB(playerDb);
await deleteDB(guildDb);
await deleteDB(rejectPlayerDb);
await deleteDB(rejectGuildDb);
await deleteDB(collisionPlayerDb);
await deleteDB(collisionGuildDb);
await deleteDB(mikaPlayerDb);
await deleteDB(mikaGuildDb);
await deleteDB(doubleClaimPlayerDb);
await deleteDB(doubleClaimGuildDb);
await deleteDB(noObservationPlayerDb);
await deleteDB(noObservationGuildDb);
await deleteDB(unsafeRenamePlayerDb);
await deleteDB(unsafeRenameGuildDb);
await deleteDB(singleWeakPlayerDb);
await deleteDB(singleWeakGuildDb);
await deleteDB(multipleWeakPlayerDb);
await deleteDB(multipleWeakGuildDb);
await deleteDB(plausiblePlayerDb);
await deleteDB(plausibleGuildDb);

console.log("fusionIdentityManagement test passed");
