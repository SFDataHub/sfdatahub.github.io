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

const member = ({
  id,
  name,
  server,
  guildSegment,
  guildName,
  level = 10,
  classId = "1",
}: MemberInput) => ({
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

const group = (
  server: string,
  segment: string,
  name: string,
  memberCount: number,
  coaString: string,
) => ({
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
      {
        id: "s1_eu_p1",
        name: "Alice",
        server: "s1_eu",
        guildSegment: "g1",
        guildName: "Knights",
      },
      {
        id: "s1_eu_p2",
        name: "Bob",
        server: "s1_eu",
        guildSegment: "g1",
        guildName: "Knights",
      },
      {
        id: "s1_eu_p3",
        name: "Cid",
        server: "s1_eu",
        guildSegment: "g1",
        guildName: "Knights",
      },
      {
        id: "s1_eu_p4",
        name: "Dora",
        server: "s1_eu",
        guildSegment: "g2",
        guildName: "Visitors",
      },
      {
        id: "s1_eu_p5",
        name: "Eve",
        server: "s1_eu",
        guildSegment: "g2",
        guildName: "Visitors",
      },
    ],
    [
      group("s1_eu", "g1", "Knights", 3, COA),
      group("s1_eu", "g2", "Visitors", 2, OTHER_COA),
    ],
  ),
  snapshot(
    "old-eu2",
    1200,
    "s2_eu",
    [
      {
        id: "s2_eu_p9",
        name: "ManualOnly",
        server: "s2_eu",
        guildSegment: "g7",
        guildName: "Archive",
      },
    ],
    [group("s2_eu", "g7", "Archive", 1, "3333333333333333333333")],
  ),
  snapshot(
    "new-f28-a",
    2000,
    "f28_net",
    [
      {
        id: "f28_net_p901",
        name: "Alice (s1_eu)",
        server: "f28_net",
        guildSegment: "g9",
        guildName: "Knights",
        level: 11,
      },
      {
        id: "f28_net_p902",
        name: "Bob (s1_eu)",
        server: "f28_net",
        guildSegment: "g9",
        guildName: "Knights",
        level: 11,
      },
      {
        id: "f28_net_p903",
        name: "Cid (s1_eu)",
        server: "f28_net",
        guildSegment: "g9",
        guildName: "Knights",
        level: 11,
      },
      {
        id: "f28_net_p904",
        name: "Dora (s1_eu)",
        server: "f28_net",
        guildSegment: "g9",
        guildName: "Knights",
        level: 11,
      },
      {
        id: "f28_net_p905",
        name: "Eve (s1_eu)",
        server: "f28_net",
        guildSegment: "g9",
        guildName: "Knights",
        level: 11,
      },
      {
        id: "f28_net_p999",
        name: "Native",
        server: "f28_net",
        guildSegment: "g8",
        guildName: "Newcomers",
        level: 1,
      },
    ],
    [
      group("f28_net", "g9", "Knights", 5, COA),
      group("f28_net", "g8", "Newcomers", 1, "2222222222222222222222"),
    ],
  ),
  snapshot(
    "new-f28-b",
    3000,
    "f28_net",
    [
      {
        id: "f28_net_p901",
        name: "Alice (s1_eu)",
        server: "f28_net",
        guildSegment: "g9",
        guildName: "Knights",
        level: 12,
      },
      {
        id: "f28_net_p902",
        name: "Bob (s1_eu)",
        server: "f28_net",
        guildSegment: "g9",
        guildName: "Knights",
        level: 12,
      },
      {
        id: "f28_net_p903",
        name: "Cid (s1_eu)",
        server: "f28_net",
        guildSegment: "g9",
        guildName: "Knights",
        level: 12,
      },
      {
        id: "f28_net_p904",
        name: "Dora (s1_eu)",
        server: "f28_net",
        guildSegment: "g9",
        guildName: "Knights",
        level: 12,
      },
      {
        id: "f28_net_p905",
        name: "Eve (s1_eu)",
        server: "f28_net",
        guildSegment: "g9",
        guildName: "Knights",
        level: 12,
      },
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
      {
        id: "s1_eu_p61",
        name: "Mika",
        server: "s1_eu",
        guildSegment: "g1",
        guildName: "Archive",
      },
      {
        id: "s1_eu_p62",
        name: "Aleendar",
        server: "s1_eu",
        guildSegment: "g1",
        guildName: "Archive",
      },
    ],
    [group("s1_eu", "g1", "Archive", 2, COA)],
  ),
  snapshot(
    "mika-new-f28",
    2000,
    "f28_net",
    [
      {
        id: "f28_net_p61",
        name: "Mika (s1_eu)",
        server: "f28_net",
        guildSegment: "g1",
        guildName: "Archive",
        level: 11,
      },
      {
        id: "f28_net_p62",
        name: "Aleendar (s1_eu)",
        server: "f28_net",
        guildSegment: "g1",
        guildName: "Archive",
        level: 11,
      },
    ],
    [group("f28_net", "g1", "Archive", 2, COA)],
  ),
];

const createPlayerDoubleClaimSnapshots = () => [
  snapshot(
    "claim-old-eu1",
    1000,
    "s1_eu",
    [
      {
        id: "s1_eu_p900",
        name: "Old X",
        server: "s1_eu",
        guildSegment: "g1",
        guildName: "Archive",
      },
    ],
    [group("s1_eu", "g1", "Archive", 1, COA)],
  ),
  snapshot(
    "claim-new-f28",
    2000,
    "f28_net",
    [
      {
        id: "f28_net_p900",
        name: "Old X (s1_eu)",
        server: "f28_net",
        guildSegment: "g1",
        guildName: "Archive",
        level: 11,
      },
      {
        id: "f28_net_p901",
        name: "Old X (s1_eu)",
        server: "f28_net",
        guildSegment: "g1",
        guildName: "Archive",
        level: 11,
      },
    ],
    [group("f28_net", "g1", "Archive", 2, COA)],
  ),
];

const createNoHistoricalObservationSnapshots = () => [
  snapshot(
    "lookup-old-eu1",
    1000,
    "s1_eu",
    [
      {
        id: "s1_eu_p1",
        name: "Alice",
        server: "s1_eu",
        guildSegment: "g1",
        guildName: "Archive",
      },
    ],
    [group("s1_eu", "g1", "Archive", 1, COA)],
  ),
  snapshot(
    "lookup-new-f28",
    2000,
    "f28_net",
    [
      {
        id: "f28_net_p76550",
        name: "Milfiway (s1eu)",
        server: "f28_net",
        guildSegment: "g1",
        guildName: "Archive",
        level: 11,
        classId: "8",
      },
    ],
    [group("f28_net", "g1", "Archive", 1, COA)],
  ),
];

const createUnsafeRenameSnapshots = () => [
  snapshot(
    "rename-old-eu1",
    1000,
    "s1_eu",
    [
      {
        id: "s1_eu_p1",
        name: "ArchiveName",
        server: "s1_eu",
        guildSegment: "g1",
        guildName: "Archive",
      },
    ],
    [group("s1_eu", "g1", "Archive", 1, COA)],
  ),
  snapshot(
    "rename-new-f28",
    2000,
    "f28_net",
    [
      {
        id: "f28_net_p76551",
        name: "BrandNewName",
        server: "f28_net",
        guildSegment: "g1",
        guildName: "Archive",
        level: 11,
        classId: "2",
      },
    ],
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
    [
      {
        id: `f28_net_p18171${candidateCount}`,
        name: "Luzie",
        server: "f28_net",
        guildSegment: "new_g1",
        guildName: "50Todsünden",
        level: 384,
        classId: "8",
      },
    ],
    [group("f28_net", "new_g1", "50Todsünden", 1, OTHER_COA)],
  ),
];

const createSinglePlausiblePlayerSnapshots = () => [
  snapshot(
    "plausible-old-eu2",
    Date.parse("2026-01-02T12:00:09.395Z"),
    "s2_eu",
    [
      {
        id: "s2_eu_p177952",
        name: "Darth Monk",
        server: "s2_eu",
        guildSegment: "shared_g1",
        guildName: "50Todsünden",
        level: 10,
        classId: "8",
      },
    ],
    [group("s2_eu", "shared_g1", "50Todsünden", 1, COA)],
  ),
  snapshot(
    "plausible-new-f28",
    Date.parse("2026-09-05T09:10:55.210Z"),
    "f28_net",
    [
      {
        id: "f28_net_p181717",
        name: "Luzie",
        server: "f28_net",
        guildSegment: "shared_g1",
        guildName: "50Todsünden",
        level: 384,
        classId: "8",
      },
    ],
    [group("f28_net", "shared_g1", "50Todsünden", 1, COA)],
  ),
];

const createSingleMemberDirectGuildSnapshots = () => [
  snapshot(
    "direct-guild-old-eu2",
    1000,
    "s2_eu",
    [
      {
        id: "s2_eu_p117",
        name: "Clerk",
        server: "s2_eu",
        guildSegment: "g117",
        guildName: "Ordnungsamt",
      },
    ],
    [group("s2_eu", "g117", "Ordnungsamt", 1, COA)],
  ),
  snapshot(
    "direct-guild-new-f28",
    2000,
    "f28_net",
    [
      {
        id: "f28_net_p5512",
        name: "Clerk (s2_eu)",
        server: "f28_net",
        guildSegment: "g5512",
        guildName: "Ordnungsamt",
        level: 11,
      },
    ],
    [group("f28_net", "g5512", "Ordnungsamt", 1, COA)],
  ),
];

const createSinglePlausibleGuildSnapshots = () => [
  snapshot(
    "plausible-guild-old-eu2",
    1000,
    "s2_eu",
    [
      {
        id: "s2_eu_p501",
        name: "Scout",
        server: "s2_eu",
        guildSegment: "g3397",
        guildName: "Crafts Army",
      },
    ],
    [group("s2_eu", "g3397", "Crafts Army", 43, COA)],
  ),
  snapshot(
    "plausible-guild-new-f28",
    2000,
    "f28_net",
    [
      {
        id: "f28_net_p501",
        name: "Scout (s2_eu)",
        server: "f28_net",
        guildSegment: "g16298",
        guildName: "Crafts Army",
        level: 11,
      },
    ],
    [group("f28_net", "g16298", "Crafts Army", 46, OTHER_COA)],
  ),
];

const createMultipleRelevantGuildSnapshots = () => [
  snapshot(
    "multiple-guild-old-eu1",
    1000,
    "s1_eu",
    [
      {
        id: "s1_eu_p801",
        name: "North",
        server: "s1_eu",
        guildSegment: "g801",
        guildName: "Shared Name",
      },
    ],
    [group("s1_eu", "g801", "Shared Name", 20, COA)],
  ),
  snapshot(
    "multiple-guild-old-eu2",
    1100,
    "s2_eu",
    [
      {
        id: "s2_eu_p802",
        name: "South",
        server: "s2_eu",
        guildSegment: "g802",
        guildName: "Shared Name",
      },
    ],
    [group("s2_eu", "g802", "Shared Name", 20, "4444444444444444444444")],
  ),
  snapshot(
    "multiple-guild-new-f28",
    2000,
    "f28_net",
    [
      {
        id: "f28_net_p801",
        name: "North (s1_eu)",
        server: "f28_net",
        guildSegment: "g880",
        guildName: "Shared Name",
        level: 11,
      },
      {
        id: "f28_net_p802",
        name: "South (s2_eu)",
        server: "f28_net",
        guildSegment: "g880",
        guildName: "Shared Name",
        level: 11,
      },
    ],
    [group("f28_net", "g880", "Shared Name", 40, OTHER_COA)],
  ),
];

const createDuplicateGuildMigrationSnapshots = () => [
  snapshot(
    "duplicate-migration-old-eu1",
    1000,
    "s1_eu",
    [
      {
        id: "s1_eu_p83",
        name: "Exile",
        server: "s1_eu",
        guildSegment: "g83",
        guildName: "Exil",
      },
    ],
    [group("s1_eu", "g83", "Exil", 1, COA)],
  ),
  snapshot(
    "duplicate-migration-new-f28-a",
    2000,
    "f28_net",
    [
      {
        id: "f28_net_p5512",
        name: "Exile (s1_eu)",
        server: "f28_net",
        guildSegment: "g5512",
        guildName: "Ordnungsamt",
        level: 11,
      },
    ],
    [group("f28_net", "g5512", "Ordnungsamt", 1, OTHER_COA)],
  ),
  snapshot(
    "duplicate-migration-new-f28-b",
    3000,
    "f28_net",
    [
      {
        id: "f28_net_p5512",
        name: "Exile (s1_eu)",
        server: "f28_net",
        guildSegment: "g5512",
        guildName: "Ordnungsamt",
        level: 12,
      },
    ],
    [group("f28_net", "g5512", "Ordnungsamt", 1, OTHER_COA)],
  ),
];

const createGuildFusionBaseNameSnapshots = () => [
  snapshot(
    "guild-base-old-eu2",
    1000,
    "s2_eu",
    [],
    [group("s2_eu", "g42", "The Brotherhood", 0, COA)],
  ),
  snapshot(
    "guild-base-new-f28",
    2000,
    "f28_net",
    [],
    [group("f28_net", "g42", "The Brotherhood (s2eu)", 0, OTHER_COA)],
  ),
];

const createGuildFusionBaseMissingSnapshots = () => [
  snapshot(
    "guild-base-missing-old-eu1",
    1000,
    "s1_eu",
    [],
    [group("s1_eu", "g1", "Archive", 0, COA)],
  ),
  snapshot(
    "guild-base-missing-new-f28",
    2000,
    "f28_net",
    [],
    [group("f28_net", "g42", "The Brotherhood (s2eu)", 0, OTHER_COA)],
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

let report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots,
  playerStore,
  guildStore,
});
assert.equal(report.scope.label, "EU1-EU4 -> F28");
assert.equal(report.scope.postFusionSnapshotCount, 2);
assert.equal(
  report.items.filter((item) => item.entityType === "player").length,
  6,
);
assert.equal(
  report.items.filter((item) => item.entityType === "guild").length,
  2,
);
assert.equal(
  report.items.filter((item) => item.currentIdentifier === "f28_net_p901")
    .length,
  1,
);

const knights = report.items.find(
  (item) => item.entityType === "guild" && item.currentName === "Knights",
);
assert.ok(knights);
assert.equal(knights.status, "ready");
assert.equal(knights.readyCandidateIdentifier, "eu1_g1");
assert.ok(
  knights.memberMigrationEdges.some(
    (edge) => edge.oldGuildIdentifier === "eu1_g2",
  ),
);
assert.equal(knights.memberStatusSummary?.totalMembers, 5);
assert.equal(knights.memberStatusSummary?.resolvedMembers, 5);
assert.equal(knights.memberStatusSummary?.readyMembers, 5);
assert.equal(knights.memberStatusSummary?.completedMembers, 0);
assert.equal(knights.memberStatusSummary?.reviewMembers, 0);
assert.equal(knights.memberStatusSummary?.memberRefsByStatus.review.length, 0);
assert.equal(knights.memberStatusSummary?.missingManagementEntries, 0);

const readyPlayers = report.items.filter(
  (item) => item.entityType === "player" && item.status === "ready",
);
assert.equal(readyPlayers.length, 5);
const readyAlice = report.items.find(
  (item) => item.currentIdentifier === "f28_net_p901",
);
const readyBob = report.items.find(
  (item) => item.currentIdentifier === "f28_net_p902",
);
assert.equal(readyAlice?.candidates.length, 1);
assert.equal(readyAlice?.candidates[0]?.historicalIdentifier, "s1_eu_p1");
const firstAliceObservation = readyAlice?.observations.reduce(
  (earliest, observation) =>
    observation.timestamp < earliest.timestamp ? observation : earliest,
);
const latestAliceObservation = readyAlice?.observations.at(-1);
const clonedFirstAliceObservation = firstAliceObservation
  ? structuredClone(firstAliceObservation)
  : null;
const clonedLatestAliceObservation = latestAliceObservation
  ? structuredClone(latestAliceObservation)
  : null;
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
  readyBob?.candidates.some(
    (candidate) => candidate.historicalIdentifier === "s1_eu_p1",
  ),
  false,
);

const mergeResult = await mergeReadyFusionIdentityItems(report, {
  playerStore,
  guildStore,
});
assert.equal(mergeResult.players, 5);
assert.equal(mergeResult.guilds, 1);
assert.deepEqual(mergeResult.errors, []);
assert.equal(JSON.stringify(snapshots), before);

report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots,
  playerStore,
  guildStore,
});
assert.equal(
  report.items.find((item) => item.currentIdentifier === "f28_net_p901")
    ?.status,
  "completed",
);
const completedKnights = report.items.find(
  (item) => item.currentIdentifier === "f28_g9",
);
assert.equal(completedKnights?.status, "completed");
assert.equal(completedKnights?.memberStatusSummary?.totalMembers, 5);
assert.equal(completedKnights?.memberStatusSummary?.resolvedMembers, 5);
assert.equal(completedKnights?.memberStatusSummary?.readyMembers, 0);
assert.equal(completedKnights?.memberStatusSummary?.completedMembers, 5);

await unlinkFusionIdentityAlias("guild", "eu1_g1", { guildStore });
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots,
  playerStore,
  guildStore,
});
assert.equal(
  report.items.find((item) => item.currentIdentifier === "f28_g9")?.status,
  "ready",
);

await confirmFusionIdentityLink("player", "f28_net_p999", "s2_eu_p9", {
  playerStore,
});
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots,
  playerStore,
  guildStore,
});
assert.equal(
  report.items.find((item) => item.currentIdentifier === "f28_net_p999")
    ?.status,
  "completed",
);

const rejectPlayerDb = `fusion-identity-management-player-reject-${dbSuffix}`;
const rejectGuildDb = `fusion-identity-management-guild-reject-${dbSuffix}`;
await deleteDB(rejectPlayerDb);
await deleteDB(rejectGuildDb);
const rejectPlayerStore = createPlayerIdentityStore({ dbName: rejectPlayerDb });
const rejectGuildStore = createGuildIdentityStore({ dbName: rejectGuildDb });

await rejectFusionIdentityCandidate("player", "f28_net_p901", "s1_eu_p1", {
  playerStore: rejectPlayerStore,
});
await rejectFusionIdentityCandidate("guild", "f28_g9", "eu1_g1", {
  guildStore: rejectGuildStore,
});
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots,
  playerStore: rejectPlayerStore,
  guildStore: rejectGuildStore,
});
const rejectedAlice = report.items.find(
  (item) => item.currentIdentifier === "f28_net_p901",
);
assert.equal(rejectedAlice?.status, "unresolved");
assert.equal(rejectedAlice?.candidates[0]?.rejected, true);
assert.equal(rejectedAlice?.readyCandidateIdentifier, null);
const rejectedKnights = report.items.find(
  (item) => item.currentIdentifier === "f28_g9",
);
assert.equal(rejectedKnights?.status, "unresolved");
assert.ok(
  rejectedKnights?.memberMigrationEdges.some(
    (edge) => edge.oldGuildIdentifier === "eu1_g2",
  ),
);

const collisionPlayerDb = `fusion-identity-management-player-collision-${dbSuffix}`;
const collisionGuildDb = `fusion-identity-management-guild-collision-${dbSuffix}`;
await deleteDB(collisionPlayerDb);
await deleteDB(collisionGuildDb);
const collisionPlayerStore = createPlayerIdentityStore({
  dbName: collisionPlayerDb,
});
const collisionGuildStore = createGuildIdentityStore({
  dbName: collisionGuildDb,
});
await collisionPlayerStore.linkPlayerIdentifiers("s1_eu_p1", "f28_net_p777", {
  source: "manual",
  confirmedAt: "2026-09-16T00:00:00.000Z",
});
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots,
  playerStore: collisionPlayerStore,
  guildStore: collisionGuildStore,
});
const collisionAlice = report.items.find(
  (item) => item.currentIdentifier === "f28_net_p901",
);
assert.notEqual(collisionAlice?.status, "ready");
assert.equal(
  collisionAlice?.candidates.some(
    (candidate) => candidate.historicalIdentifier === "s1_eu_p1",
  ),
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
const mika = report.items.find(
  (item) => item.currentIdentifier === "f28_net_p61",
);
const aleendar = report.items.find(
  (item) => item.currentIdentifier === "f28_net_p62",
);
assert.equal(mika?.status, "ready");
assert.equal(mika?.readyCandidateIdentifier, "s1_eu_p61");
assert.deepEqual(
  mika?.candidates.map((candidate) => candidate.historicalIdentifier),
  ["s1_eu_p61"],
);
assert.equal(aleendar?.status, "ready");
assert.equal(
  aleendar?.candidates.some(
    (candidate) => candidate.historicalIdentifier === "s1_eu_p61",
  ),
  false,
);

const doubleClaimPlayerDb = `fusion-identity-management-player-double-claim-${dbSuffix}`;
const doubleClaimGuildDb = `fusion-identity-management-guild-double-claim-${dbSuffix}`;
await deleteDB(doubleClaimPlayerDb);
await deleteDB(doubleClaimGuildDb);
const doubleClaimPlayerStore = createPlayerIdentityStore({
  dbName: doubleClaimPlayerDb,
});
const doubleClaimGuildStore = createGuildIdentityStore({
  dbName: doubleClaimGuildDb,
});
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots: createPlayerDoubleClaimSnapshots(),
  playerStore: doubleClaimPlayerStore,
  guildStore: doubleClaimGuildStore,
});
const doubleClaimPlayers = report.items.filter(
  (item) =>
    item.entityType === "player" &&
    item.currentIdentifier.startsWith("f28_net_p90"),
);
assert.equal(doubleClaimPlayers.length, 2);
doubleClaimPlayers.forEach((item) => {
  assert.equal(item.status, "review");
  assert.ok(
    item.reasons.includes(
      "historical identity is claimed by multiple current identities",
    ),
  );
  assert.ok(
    item.candidates.some(
      (candidate) => candidate.historicalIdentifier === "s1_eu_p900",
    ),
  );
});

const noObservationPlayerDb = `fusion-identity-management-player-no-observation-${dbSuffix}`;
const noObservationGuildDb = `fusion-identity-management-guild-no-observation-${dbSuffix}`;
await deleteDB(noObservationPlayerDb);
await deleteDB(noObservationGuildDb);
const noObservationPlayerStore = createPlayerIdentityStore({
  dbName: noObservationPlayerDb,
});
const noObservationGuildStore = createGuildIdentityStore({
  dbName: noObservationGuildDb,
});
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots: createNoHistoricalObservationSnapshots(),
  playerStore: noObservationPlayerStore,
  guildStore: noObservationGuildStore,
});
const milfiway = report.items.find(
  (item) => item.currentIdentifier === "f28_net_p76550",
);
assert.equal(milfiway?.status, "noHistoricalObservation");
assert.equal(milfiway?.reasonCodes[0], "no-historical-observation");
assert.equal(
  milfiway?.diagnostics?.reliableHistoricalLookup?.baseName,
  "Milfiway",
);
assert.equal(milfiway?.diagnostics?.historicalSnapshotCount, 1);
assert.equal(
  report.summary.ready +
    report.summary.review +
    report.summary.unresolved +
    report.summary.noHistoricalObservation +
    report.summary.noHistory +
    report.summary.completed,
  report.summary.total,
);

const unsafeRenamePlayerDb = `fusion-identity-management-player-unsafe-rename-${dbSuffix}`;
const unsafeRenameGuildDb = `fusion-identity-management-guild-unsafe-rename-${dbSuffix}`;
await deleteDB(unsafeRenamePlayerDb);
await deleteDB(unsafeRenameGuildDb);
const unsafeRenamePlayerStore = createPlayerIdentityStore({
  dbName: unsafeRenamePlayerDb,
});
const unsafeRenameGuildStore = createGuildIdentityStore({
  dbName: unsafeRenameGuildDb,
});
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots: createUnsafeRenameSnapshots(),
  playerStore: unsafeRenamePlayerStore,
  guildStore: unsafeRenameGuildStore,
});
const unsafeRename = report.items.find(
  (item) => item.currentIdentifier === "f28_net_p76551",
);
assert.equal(unsafeRename?.status, "unresolved");
assert.notEqual(unsafeRename?.status, "noHistoricalObservation");

const singleWeakPlayerDb = `fusion-identity-management-player-single-weak-${dbSuffix}`;
const singleWeakGuildDb = `fusion-identity-management-guild-single-weak-${dbSuffix}`;
await deleteDB(singleWeakPlayerDb);
await deleteDB(singleWeakGuildDb);
const singleWeakPlayerStore = createPlayerIdentityStore({
  dbName: singleWeakPlayerDb,
});
const singleWeakGuildStore = createGuildIdentityStore({
  dbName: singleWeakGuildDb,
});
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots: createWeakOnlyPlayerSnapshots(1),
  playerStore: singleWeakPlayerStore,
  guildStore: singleWeakGuildStore,
});
const singleWeak = report.items.find(
  (item) => item.currentIdentifier === "f28_net_p181711",
);
assert.equal(singleWeak?.status, "unresolved");
assert.equal(singleWeak?.reasonCodes[0], "no-actionable-candidate");
assert.equal(singleWeak?.candidates.length, 0);
assert.equal(
  singleWeak?.diagnostics?.candidatePipeline.candidatesAfterExclusions,
  1,
);
assert.equal(
  singleWeak?.diagnostics?.candidatePipeline.candidatesAfterReservations,
  0,
);
assert.equal(singleWeak?.diagnostics?.candidatePipeline.finalCandidates, 0);

const multipleWeakPlayerDb = `fusion-identity-management-player-multiple-weak-${dbSuffix}`;
const multipleWeakGuildDb = `fusion-identity-management-guild-multiple-weak-${dbSuffix}`;
await deleteDB(multipleWeakPlayerDb);
await deleteDB(multipleWeakGuildDb);
const multipleWeakPlayerStore = createPlayerIdentityStore({
  dbName: multipleWeakPlayerDb,
});
const multipleWeakGuildStore = createGuildIdentityStore({
  dbName: multipleWeakGuildDb,
});
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots: createWeakOnlyPlayerSnapshots(10),
  playerStore: multipleWeakPlayerStore,
  guildStore: multipleWeakGuildStore,
});
const multipleWeak = report.items.find(
  (item) => item.currentIdentifier === "f28_net_p1817110",
);
assert.equal(multipleWeak?.status, "unresolved");
assert.equal(multipleWeak?.reasonCodes[0], "no-actionable-candidate");
assert.equal(multipleWeak?.candidates.length, 0);
assert.equal(
  multipleWeak?.diagnostics?.candidatePipeline.candidatesAfterExclusions,
  10,
);
assert.equal(
  multipleWeak?.diagnostics?.candidatePipeline.candidatesAfterReservations,
  0,
);
assert.equal(multipleWeak?.diagnostics?.candidatePipeline.finalCandidates, 0);

const plausiblePlayerDb = `fusion-identity-management-player-plausible-${dbSuffix}`;
const plausibleGuildDb = `fusion-identity-management-guild-plausible-${dbSuffix}`;
await deleteDB(plausiblePlayerDb);
await deleteDB(plausibleGuildDb);
const plausiblePlayerStore = createPlayerIdentityStore({
  dbName: plausiblePlayerDb,
});
const plausibleGuildStore = createGuildIdentityStore({
  dbName: plausibleGuildDb,
});
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots: createSinglePlausiblePlayerSnapshots(),
  playerStore: plausiblePlayerStore,
  guildStore: plausibleGuildStore,
});
const plausible = report.items.find(
  (item) => item.currentIdentifier === "f28_net_p181717",
);
assert.equal(plausible?.status, "review");
assert.equal(plausible?.reasonCodes[0], "insufficient-player-evidence");
assert.equal(plausible?.readyCandidateIdentifier, null);
assert.equal(plausible?.candidates.length, 1);
assert.equal(plausible?.candidates[0]?.historicalIdentifier, "s2_eu_p177952");
assert.equal(
  plausible?.candidates[0]?.entityType === "player"
    ? plausible.candidates[0].evidence.classification
    : null,
  "plausible",
);
const plausiblePlayerGuild = report.items.find(
  (item) => item.entityType === "guild" && item.currentName === "50Todsünden",
);
assert.equal(plausiblePlayerGuild?.memberStatusSummary?.totalMembers, 1);
assert.equal(plausiblePlayerGuild?.memberStatusSummary?.resolvedMembers, 0);
assert.equal(plausiblePlayerGuild?.memberStatusSummary?.reviewMembers, 1);
assert.equal(
  plausiblePlayerGuild?.memberStatusSummary?.memberRefsByStatus.review.length,
  plausiblePlayerGuild?.memberStatusSummary?.reviewMembers,
);
assert.deepEqual(
  plausiblePlayerGuild?.memberStatusSummary?.memberRefsByStatus.review.map(
    (member) => member.identifier,
  ),
  ["f28_net_p181717"],
);
assert.equal(
  plausiblePlayerGuild?.memberStatusSummary?.missingManagementEntries,
  0,
);

const plausibleGuildPlayerDb = `fusion-identity-management-player-plausible-guild-${dbSuffix}`;
const plausibleGuildGuildDb = `fusion-identity-management-guild-plausible-guild-${dbSuffix}`;
await deleteDB(plausibleGuildPlayerDb);
await deleteDB(plausibleGuildGuildDb);
const plausibleGuildPlayerStore = createPlayerIdentityStore({
  dbName: plausibleGuildPlayerDb,
});
const plausibleGuildGuildStore = createGuildIdentityStore({
  dbName: plausibleGuildGuildDb,
});
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots: createSinglePlausibleGuildSnapshots(),
  playerStore: plausibleGuildPlayerStore,
  guildStore: plausibleGuildGuildStore,
});
const plausibleGuild = report.items.find(
  (item) =>
    item.entityType === "guild" && item.currentIdentifier === "f28_g16298",
);
assert.equal(plausibleGuild?.status, "review");
assert.equal(plausibleGuild?.reasonCodes[0], "insufficient-guild-evidence");
assert.equal(plausibleGuild?.readyCandidateIdentifier, null);
assert.equal(plausibleGuild?.candidates.length, 1);
assert.equal(
  plausibleGuild?.candidates[0]?.entityType === "guild"
    ? plausibleGuild.candidates[0].evidence.classification
    : null,
  "plausible",
);
assert.equal(
  plausibleGuild?.candidates[0]?.entityType === "guild"
    ? plausibleGuild.candidates[0].evidence.oldMemberCount
    : null,
  43,
);
assert.equal(
  plausibleGuild?.candidates[0]?.entityType === "guild"
    ? plausibleGuild.candidates[0].evidence.newMemberCount
    : null,
  46,
);
assert.equal(
  plausibleGuild?.candidates[0]?.entityType === "guild"
    ? plausibleGuild.candidates[0].evidence.matchedMemberCount
    : null,
  1,
);
assert.equal(plausibleGuild?.memberStatusSummary?.totalMembers, 46);
assert.equal(plausibleGuild?.memberStatusSummary?.resolvedMembers, 1);
assert.equal(plausibleGuild?.memberStatusSummary?.readyMembers, 1);
assert.equal(plausibleGuild?.memberStatusSummary?.missingManagementEntries, 45);

const multipleGuildPlayerDb = `fusion-identity-management-player-multiple-guild-${dbSuffix}`;
const multipleGuildGuildDb = `fusion-identity-management-guild-multiple-guild-${dbSuffix}`;
await deleteDB(multipleGuildPlayerDb);
await deleteDB(multipleGuildGuildDb);
const multipleGuildPlayerStore = createPlayerIdentityStore({
  dbName: multipleGuildPlayerDb,
});
const multipleGuildGuildStore = createGuildIdentityStore({
  dbName: multipleGuildGuildDb,
});
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots: createMultipleRelevantGuildSnapshots(),
  playerStore: multipleGuildPlayerStore,
  guildStore: multipleGuildGuildStore,
});
const multipleGuild = report.items.find(
  (item) =>
    item.entityType === "guild" && item.currentIdentifier === "f28_g880",
);
assert.equal(multipleGuild?.status, "review");
assert.equal(multipleGuild?.reasonCodes[0], "multiple-relevant-candidates");
assert.notEqual(multipleGuild?.reasonCodes[0], "insufficient-guild-evidence");
assert.equal(multipleGuild?.candidates.length, 2);

const directGuildPlayerDb = `fusion-identity-management-player-direct-guild-${dbSuffix}`;
const directGuildGuildDb = `fusion-identity-management-guild-direct-guild-${dbSuffix}`;
await deleteDB(directGuildPlayerDb);
await deleteDB(directGuildGuildDb);
const directGuildPlayerStore = createPlayerIdentityStore({
  dbName: directGuildPlayerDb,
});
const directGuildGuildStore = createGuildIdentityStore({
  dbName: directGuildGuildDb,
});
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots: createSingleMemberDirectGuildSnapshots(),
  playerStore: directGuildPlayerStore,
  guildStore: directGuildGuildStore,
});
const directGuild = report.items.find(
  (item) =>
    item.entityType === "guild" && item.currentIdentifier === "f28_g5512",
);
assert.equal(directGuild?.status, "ready");
assert.equal(directGuild?.readyCandidateIdentifier, "eu2_g117");
assert.equal(directGuild?.candidates.length, 1);
assert.equal(
  directGuild?.candidates[0]?.entityType === "guild"
    ? directGuild.candidates[0].evidence.classification
    : null,
  "strong",
);
assert.equal(
  directGuild?.candidates[0]?.entityType === "guild"
    ? directGuild.candidates[0].evidence.uniqueExactName
    : null,
  true,
);
assert.equal(
  directGuild?.candidates[0]?.entityType === "guild"
    ? directGuild.candidates[0].evidence.sameCoA
    : null,
  true,
);
assert.equal(
  directGuild?.candidates[0]?.entityType === "guild"
    ? directGuild.candidates[0].evidence.matchedMemberCount
    : null,
  1,
);

const duplicateMigrationPlayerDb = `fusion-identity-management-player-duplicate-migration-${dbSuffix}`;
const duplicateMigrationGuildDb = `fusion-identity-management-guild-duplicate-migration-${dbSuffix}`;
await deleteDB(duplicateMigrationPlayerDb);
await deleteDB(duplicateMigrationGuildDb);
const duplicateMigrationPlayerStore = createPlayerIdentityStore({
  dbName: duplicateMigrationPlayerDb,
});
const duplicateMigrationGuildStore = createGuildIdentityStore({
  dbName: duplicateMigrationGuildDb,
});
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots: createDuplicateGuildMigrationSnapshots(),
  playerStore: duplicateMigrationPlayerStore,
  guildStore: duplicateMigrationGuildStore,
});
const duplicateMigrationGuild = report.items.find(
  (item) =>
    item.entityType === "guild" && item.currentIdentifier === "f28_g5512",
);
assert.equal(
  duplicateMigrationGuild?.memberMigrationEdges.filter(
    (edge) => edge.oldGuildIdentifier === "eu1_g83",
  ).length,
  1,
);
assert.equal(
  duplicateMigrationGuild?.memberMigrationEdges.find(
    (edge) => edge.oldGuildIdentifier === "eu1_g83",
  )?.matchedMemberCount,
  1,
);

const guildBasePlayerDb = `fusion-identity-management-player-guild-base-${dbSuffix}`;
const guildBaseGuildDb = `fusion-identity-management-guild-guild-base-${dbSuffix}`;
await deleteDB(guildBasePlayerDb);
await deleteDB(guildBaseGuildDb);
const guildBasePlayerStore = createPlayerIdentityStore({
  dbName: guildBasePlayerDb,
});
const guildBaseGuildStore = createGuildIdentityStore({
  dbName: guildBaseGuildDb,
});
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots: createGuildFusionBaseNameSnapshots(),
  playerStore: guildBasePlayerStore,
  guildStore: guildBaseGuildStore,
});
const guildBase = report.items.find(
  (item) => item.entityType === "guild" && item.currentIdentifier === "f28_g42",
);
assert.equal(guildBase?.status, "ready");
assert.equal(guildBase?.readyCandidateIdentifier, "eu2_g42");
assert.equal(guildBase?.candidates.length, 1);
assert.equal(
  guildBase?.candidates[0]?.entityType === "guild"
    ? guildBase.candidates[0].evidence.classification
    : null,
  "strong",
);
assert.equal(
  guildBase?.candidates[0]?.entityType === "guild"
    ? guildBase.candidates[0].evidence.fusionBaseName
    : null,
  true,
);
assert.equal(
  guildBase?.candidates[0]?.entityType === "guild"
    ? guildBase.candidates[0].evidence.evidenceEntries.some(
        (entry) => entry.type === "fusion-base-name",
      )
    : false,
  true,
);

const guildBaseMissingPlayerDb = `fusion-identity-management-player-guild-base-missing-${dbSuffix}`;
const guildBaseMissingGuildDb = `fusion-identity-management-guild-guild-base-missing-${dbSuffix}`;
await deleteDB(guildBaseMissingPlayerDb);
await deleteDB(guildBaseMissingGuildDb);
const guildBaseMissingPlayerStore = createPlayerIdentityStore({
  dbName: guildBaseMissingPlayerDb,
});
const guildBaseMissingGuildStore = createGuildIdentityStore({
  dbName: guildBaseMissingGuildDb,
});
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots: createGuildFusionBaseMissingSnapshots(),
  playerStore: guildBaseMissingPlayerStore,
  guildStore: guildBaseMissingGuildStore,
});
const guildBaseMissing = report.items.find(
  (item) => item.entityType === "guild" && item.currentIdentifier === "f28_g42",
);
assert.equal(guildBaseMissing?.status, "noHistoricalObservation");
assert.equal(guildBaseMissing?.reasonCodes[0], "no-historical-observation");
assert.equal(
  guildBaseMissing?.diagnostics?.reliableHistoricalLookup?.type,
  "guild-fusion-base-name",
);
assert.equal(
  guildBaseMissing?.diagnostics?.reliableHistoricalLookup?.originServer,
  "EU2",
);
assert.equal(
  guildBaseMissing?.diagnostics?.reliableHistoricalLookup?.baseName,
  "The Brotherhood",
);
assert.equal(
  guildBaseMissing?.diagnostics?.reliableHistoricalLookup
    ?.matchingObservationCount,
  0,
);

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
await plausibleGuildPlayerStore.close();
await plausibleGuildGuildStore.close();
await multipleGuildPlayerStore.close();
await multipleGuildGuildStore.close();
await directGuildPlayerStore.close();
await directGuildGuildStore.close();
await duplicateMigrationPlayerStore.close();
await duplicateMigrationGuildStore.close();
await guildBasePlayerStore.close();
await guildBaseGuildStore.close();
await guildBaseMissingPlayerStore.close();
await guildBaseMissingGuildStore.close();
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
await deleteDB(plausibleGuildPlayerDb);
await deleteDB(plausibleGuildGuildDb);
await deleteDB(multipleGuildPlayerDb);
await deleteDB(multipleGuildGuildDb);
await deleteDB(directGuildPlayerDb);
await deleteDB(directGuildGuildDb);
await deleteDB(duplicateMigrationPlayerDb);
await deleteDB(duplicateMigrationGuildDb);
await deleteDB(guildBasePlayerDb);
await deleteDB(guildBaseGuildDb);
await deleteDB(guildBaseMissingPlayerDb);
await deleteDB(guildBaseMissingGuildDb);

console.log("fusionIdentityManagement test passed");
