import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { deleteDB } from "idb";

import { createGuildIdentityStore } from "../../src/lib/identities/guildIdentityStore.ts";
import {
  collectGuildIdentityObservations,
  collectPlayerIdentityObservations,
  loadIdentityResolutionSnapshot,
  resolveGuildIdentity,
  resolvePlayerIdentity,
} from "../../src/lib/identities/identityResolution.ts";
import { createPlayerIdentityStore } from "../../src/lib/identities/playerIdentityStore.ts";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const playerDbName = `sfdatahub-identity-resolution-player-test-${suffix}`;
const guildDbName = `sfdatahub-identity-resolution-guild-test-${suffix}`;
const playerMetadata = { source: "manual" as const, confirmedAt: "2026-09-20T00:00:00.000Z" };
const guildMetadata = { source: "automatic" as const, confirmedAt: "2026-09-21T00:00:00.000Z" };

await deleteDB(playerDbName);
await deleteDB(guildDbName);

let playerStore = createPlayerIdentityStore({ dbName: playerDbName });
let guildStore = createGuildIdentityStore({ dbName: guildDbName });

try {
  const playerFirst = await playerStore.linkPlayerIdentifiers("currentA", "oldA", playerMetadata);
  const guildFirst = await guildStore.linkGuildAliases("guildCurrent", "guildOld", guildMetadata);

  let snapshot = await loadIdentityResolutionSnapshot({ playerStore, guildStore });

  const currentA = resolvePlayerIdentity(snapshot, "currentA");
  const oldA = resolvePlayerIdentity(snapshot, "oldA");
  assert.equal(currentA.resolved, true);
  assert.equal(oldA.resolved, true);
  assert.equal(currentA.identityId, oldA.identityId);
  assert.deepEqual([...snapshot.players.byIdentifier.keys()].sort(), ["currenta", "olda"]);
  assert.equal(currentA.matchedAlias.source, "manual");
  assert.equal(currentA.matchedAlias.confirmedAt, playerMetadata.confirmedAt);

  const guildCurrent = resolveGuildIdentity(snapshot, "guildCurrent");
  const guildOld = resolveGuildIdentity(snapshot, "guildOld");
  assert.equal(guildCurrent.resolved, true);
  assert.equal(guildOld.resolved, true);
  assert.equal(guildCurrent.identityId, guildOld.identityId);
  assert.equal(guildCurrent.matchedAlias.source, "automatic");
  assert.equal(guildCurrent.matchedAlias.confirmedAt, guildMetadata.confirmedAt);

  await playerStore.linkPlayerIdentifiers("currentA", "intermediateA", playerMetadata);
  await playerStore.linkPlayerIdentifiers("intermediateA", "originalA", playerMetadata);

  snapshot = await loadIdentityResolutionSnapshot({ playerStore, guildStore });
  const multiStageIds = ["currentA", "oldA", "intermediateA", "originalA"].map((identifier) => {
    const resolution = resolvePlayerIdentity(snapshot, identifier);
    assert.equal(resolution.resolved, true);
    return resolution.identityId;
  });
  assert.equal(new Set(multiStageIds).size, 1);

  await playerStore.linkPlayerIdentifiers("b1", "b2", playerMetadata);
  const secondEntity = resolvePlayerIdentity(await loadIdentityResolutionSnapshot({ playerStore, guildStore }), "b1");
  assert.equal(secondEntity.resolved, true);
  assert.notEqual(secondEntity.identityId, playerFirst.entity.entityId);

  await playerStore.linkPlayerIdentifiers("oldA", "b1", playerMetadata);
  snapshot = await loadIdentityResolutionSnapshot({ playerStore, guildStore });
  const mergedIds = ["currentA", "oldA", "intermediateA", "originalA", "b1", "b2"].map((identifier) => {
    const resolution = resolvePlayerIdentity(snapshot, identifier);
    assert.equal(resolution.resolved, true);
    return resolution.identityId;
  });
  assert.equal(new Set(mergedIds).size, 1);
  assert.equal(snapshot.players.byIdentityId.size, 1);

  const oldSnapshot = snapshot;
  await playerStore.linkPlayerIdentifiers("currentA", "lateAlias", playerMetadata);
  assert.equal(resolvePlayerIdentity(oldSnapshot, "lateAlias").resolved, false);
  const refreshedSnapshot = await loadIdentityResolutionSnapshot({ playerStore, guildStore });
  assert.equal(resolvePlayerIdentity(refreshedSnapshot, "lateAlias").resolved, true);

  await playerStore.close();
  playerStore = createPlayerIdentityStore({ dbName: playerDbName });
  snapshot = await loadIdentityResolutionSnapshot({ playerStore, guildStore });
  assert.equal(resolvePlayerIdentity(snapshot, "lateAlias").identityId, resolvePlayerIdentity(snapshot, "b2").identityId);

  type PlayerObservation = {
    id: string;
    memberRef: string;
    snapshotTimestamp: number;
    guildIdentifier: string;
    level: number;
    name?: string;
  };

  const playerObservations: PlayerObservation[] = [
    { id: "scan-2024-old", memberRef: "oldA", snapshotTimestamp: 1_700_000_000_000, guildIdentifier: "Guild A", level: 500 },
    { id: "scan-2026-current", memberRef: "lateAlias", snapshotTimestamp: 1_760_000_000_000, guildIdentifier: "Guild B", level: 520 },
    { id: "duplicate-current", memberRef: "lateAlias", snapshotTimestamp: 1_760_000_000_000, guildIdentifier: "Guild B", level: 520 },
    { id: "duplicate-current", memberRef: "lateAlias", snapshotTimestamp: 1_760_000_000_000, guildIdentifier: "Guild B", level: 520 },
    { id: "name-only-not-linked", memberRef: "unlinked", snapshotTimestamp: 1_730_000_000_000, guildIdentifier: "Guild X", level: 999, name: "currentA" },
  ];

  const playerHistory = collectPlayerIdentityObservations(snapshot, "currentA", playerObservations);
  assert.equal(playerHistory.resolution.resolved, true);
  assert.deepEqual(
    playerHistory.observations.map((entry) => entry.observation.id),
    ["scan-2024-old", "duplicate-current", "scan-2026-current"],
  );
  assert.deepEqual(
    playerHistory.observations.map((entry) => entry.observation.guildIdentifier),
    ["Guild A", "Guild B", "Guild B"],
  );
  assert.deepEqual(
    playerHistory.observations.map((entry) => entry.observation.level),
    [500, 520, 520],
  );
  assert.equal(playerHistory.observations.some((entry) => entry.observation.id === "name-only-not-linked"), false);

  const afterScanDelete = collectPlayerIdentityObservations(
    snapshot,
    "currentA",
    playerObservations.filter((entry) => entry.id !== "scan-2024-old"),
  );
  assert.equal(resolvePlayerIdentity(snapshot, "oldA").resolved, true);
  assert.deepEqual(
    afterScanDelete.observations.map((entry) => entry.observation.id),
    ["duplicate-current", "scan-2026-current"],
  );

  const unresolvedHistory = collectPlayerIdentityObservations(snapshot, "unlinked", playerObservations);
  assert.equal(unresolvedHistory.resolution.resolved, false);
  assert.deepEqual(
    unresolvedHistory.observations.map((entry) => entry.observation.id),
    ["name-only-not-linked"],
  );

  type GuildObservation = {
    id: string;
    guildIdentifier: string;
    snapshotTimestamp: number;
    memberCount: number;
  };

  await guildStore.linkGuildAliases("guildCurrent", "guildArchive", guildMetadata);
  snapshot = await loadIdentityResolutionSnapshot({ playerStore, guildStore });
  const guildHistory = collectGuildIdentityObservations(snapshot, "guildOld", [
    { id: "guild-t1", guildIdentifier: "guildOld", snapshotTimestamp: 1_700_000_000_000, memberCount: 42 },
    { id: "guild-t2", guildIdentifier: "guildArchive", snapshotTimestamp: 1_760_000_000_000, memberCount: 48 },
    { id: "guild-other", guildIdentifier: "guildOther", snapshotTimestamp: 1_730_000_000_000, memberCount: 99 },
  ] satisfies GuildObservation[]);
  assert.equal(guildHistory.resolution.resolved, true);
  assert.equal(guildHistory.resolution.identityId, guildFirst.entity.entityId);
  assert.deepEqual(
    guildHistory.observations.map((entry) => entry.observation.memberCount),
    [42, 48],
  );
} finally {
  await playerStore.close();
  await guildStore.close();
  await deleteDB(playerDbName);
  await deleteDB(guildDbName);
}

console.log("identityResolution test passed");
