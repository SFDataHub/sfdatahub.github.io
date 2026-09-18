import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { deleteDB } from "idb";

import {
  GuildIdentityConflictError,
  createGuildIdentityStore,
} from "../../src/lib/identities/guildIdentityStore.ts";

const dbName = `sfdatahub-local-guild-identities-test-${Date.now()}`;
const metadata = { source: "manual" as const, confirmedAt: "2026-09-16T00:00:00.000Z" };
const A = "s1eu_g101";
const B = "f28_net_g901";
const C = "s2eu_g202";
const D = "f28_net_g902";

await deleteDB(dbName);

let store = createGuildIdentityStore({ dbName });

assert.equal(await store.getGuildEntityForAlias(A), null);

const firstLink = await store.linkGuildAliases(A, B, metadata);
assert.equal(firstLink.aliases.length, 2);
assert.deepEqual((await store.getGuildAliases(firstLink.entity.entityId)).sort(), [A, B].sort());

await store.linkGuildAliases(B, C, metadata);
assert.deepEqual((await store.getGuildAliases(firstLink.entity.entityId)).sort(), [A, B, C].sort());

await store.unlinkGuildAlias(B);
assert.deepEqual((await store.getGuildAliases(firstLink.entity.entityId)).sort(), [A, C].sort());
assert.equal(await store.getGuildEntityForAlias(B), null);

await store.linkGuildAliases(B, D, metadata);
const secondEntity = await store.getGuildEntityForAlias(B);
assert.ok(secondEntity);

const merged = await store.mergeGuildEntities(C, D, metadata);
assert.equal(merged.entity.entityId, firstLink.entity.entityId);
assert.notEqual(merged.entity.entityId, secondEntity?.entityId);
assert.deepEqual((await store.getGuildAliases(merged.entity.entityId)).sort(), [A, B, C, D].sort());

await store.unlinkGuildAlias(D);
await store.unlinkGuildAlias(B);
assert.deepEqual((await store.getGuildAliases(merged.entity.entityId)).sort(), [A, C].sort());

await store.rejectGuildLink(A, B);
assert.equal(await store.isGuildLinkRejected(A, B), true);
assert.equal(await store.isGuildLinkRejected(B, A), true);
assert.equal((await store.getGuildLinkRejections(A)).length, 1);

await assert.rejects(
  () => store.linkGuildAliases(A, B, metadata),
  GuildIdentityConflictError,
);

await store.removeGuildLinkRejection(A, B);
await store.linkGuildAliases(A, B, metadata);
await assert.rejects(
  () => store.rejectGuildLink(B, A),
  GuildIdentityConflictError,
);

const listed = await store.listGuildEntities();
assert.equal(listed.length, 1);
assert.deepEqual(listed[0]?.aliases.map((alias) => alias.identifier).sort(), [A, B, C].sort());

const persistedEntity = await store.getGuildEntityForAlias(A);
assert.ok(persistedEntity);
await store.close();

store = createGuildIdentityStore({ dbName });
assert.equal((await store.getGuildEntityForAlias(B))?.entityId, persistedEntity.entityId);

await store.close();
await deleteDB(dbName);

console.log("guildIdentityStore test passed");
