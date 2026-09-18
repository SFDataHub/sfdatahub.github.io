import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { deleteDB } from "idb";

import {
  PlayerIdentityConflictError,
  createPlayerIdentityStore,
} from "../../src/lib/identities/playerIdentityStore.ts";

const dbName = `sfdatahub-local-identities-test-${Date.now()}`;
const metadata = { source: "manual" as const, confirmedAt: "2026-09-15T00:00:00.000Z" };
const A = "s3_eu_p111";
const B = "f28_net_p999";
const C = "future_net_p222";
const D = "f30_net_p333";

await deleteDB(dbName);

let store = createPlayerIdentityStore({ dbName });

assert.deepEqual(await store.getResolvedPlayerIdentifiers(A), [A]);
assert.equal(await store.getPlayerIdentity(A), null);

const firstLink = await store.linkPlayerIdentifiers(A, B, metadata);
assert.equal(firstLink.aliases.length, 2);
assert.deepEqual((await store.getPlayerAliases(firstLink.entity.entityId)).sort(), [B, A].sort());
assert.deepEqual((await store.getResolvedPlayerIdentifiers(B)).sort(), [A, B].sort());

const expanded = await store.linkPlayerIdentifiers(B, C, metadata);
assert.equal(expanded.entity.entityId, firstLink.entity.entityId);
assert.deepEqual((await store.getResolvedPlayerIdentifiers(A)).sort(), [A, B, C].sort());

await store.unlinkPlayerIdentifier(B);
assert.deepEqual((await store.getResolvedPlayerIdentifiers(A)).sort(), [A, C].sort());
assert.deepEqual(await store.getResolvedPlayerIdentifiers(B), [B]);

await store.linkPlayerIdentifiers(B, D, metadata);
const secondEntity = await store.getPlayerIdentity(B);
assert.ok(secondEntity);

const merged = await store.linkPlayerIdentifiers(C, D, metadata);
assert.equal(merged.entity.entityId, firstLink.entity.entityId);
assert.notEqual(merged.entity.entityId, secondEntity?.entityId);
assert.deepEqual((await store.getResolvedPlayerIdentifiers(D)).sort(), [A, B, C, D].sort());

await store.unlinkPlayerIdentifier(D);
await store.unlinkPlayerIdentifier(B);
assert.deepEqual((await store.getResolvedPlayerIdentifiers(A)).sort(), [A, C].sort());

await store.unlinkPlayerIdentifier(C);
assert.deepEqual(await store.getResolvedPlayerIdentifiers(A), [A]);
assert.deepEqual(await store.getResolvedPlayerIdentifiers(C), [C]);

await store.linkPlayerIdentifiers(A, C, metadata);
await store.rejectPlayerMatch(C, B);
await assert.rejects(
  () => store.linkPlayerIdentifiers(A, B, metadata),
  PlayerIdentityConflictError,
);
await store.removePlayerMatchRejection(C, B);
await store.unlinkPlayerIdentifier(C);

await store.rejectPlayerMatch(A, B);
assert.equal(await store.isPlayerMatchRejected(A, B), true);
assert.equal(await store.isPlayerMatchRejected(B, A), true);
assert.equal((await store.getPlayerMatchRejections(A)).length, 1);

await assert.rejects(
  () => store.linkPlayerIdentifiers(A, B, metadata),
  PlayerIdentityConflictError,
);

await store.removePlayerMatchRejection(A, B);
assert.equal(await store.isPlayerMatchRejected(A, B), false);

await store.linkPlayerIdentifiers(A, B, metadata);
await assert.rejects(
  () => store.rejectPlayerMatch(B, A),
  PlayerIdentityConflictError,
);

const persistedEntity = await store.getPlayerIdentity(A);
assert.ok(persistedEntity);
await store.rejectPlayerMatch(C, D);
await store.close();

store = createPlayerIdentityStore({ dbName });
assert.equal((await store.getPlayerIdentity(B))?.entityId, persistedEntity.entityId);
assert.deepEqual((await store.getResolvedPlayerIdentifiers(A)).sort(), [A, B].sort());
assert.equal(await store.isPlayerMatchRejected(D, C), true);

await store.close();
await deleteDB(dbName);

console.log("playerIdentityStore test passed");
