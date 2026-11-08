import assert from "node:assert/strict";
import {
  nextLocalToplistVisibleBatchSize,
  resolveLocalToplistSearchSelection,
  sameLocalToplistPendingTarget,
} from "../../src/pages/DataHub/localToplistSearchFlow.ts";
import type { LocalToplistSearchResult } from "../../src/lib/toplists/localToplistViewWorkerTypes.ts";

const result = (kind: LocalToplistSearchResult["kind"], overrides: Partial<LocalToplistSearchResult> = {}): LocalToplistSearchResult => ({
  kind,
  id: `${kind}:id`,
  label: kind === "server" ? "EU 5" : kind === "guild" ? "Guild A" : "Player A",
  server: "EU5",
  identifier: kind === "server" ? "EU5" : kind === "guild" ? "eu5__10" : "eu5_p1",
  status: "jumpable",
  score: 0,
  ...overrides,
});

assert.deepEqual(resolveLocalToplistSearchSelection("players", result("server"), "EU5", 1), {
  action: "select-server",
  server: "EU5",
});
assert.deepEqual(resolveLocalToplistSearchSelection("guilds", result("server"), "EU5", 2), {
  action: "select-server",
  server: "EU5",
});
assert.deepEqual(resolveLocalToplistSearchSelection("players", result("guild"), "EU5", 3), {
  action: "focus-guild",
  target: { kind: "guild", server: "EU5", identifier: "eu5__10", label: "Guild A", nonce: 3 },
  nextTab: "guilds",
});
assert.deepEqual(resolveLocalToplistSearchSelection("guilds", result("guild"), "EU5", 4), {
  action: "focus-guild",
  target: { kind: "guild", server: "EU5", identifier: "eu5__10", label: "Guild A", nonce: 4 },
  nextTab: null,
});
assert.deepEqual(resolveLocalToplistSearchSelection("players", result("player"), "EU5", 5), {
  action: "focus-player",
  target: { kind: "player", server: "EU5", identifier: "eu5_p1", label: "Player A", nonce: 5 },
  nextTab: null,
});
assert.deepEqual(resolveLocalToplistSearchSelection("guilds", result("player"), "EU5", 6), {
  action: "focus-player",
  target: { kind: "player", server: "EU5", identifier: "eu5_p1", label: "Player A", nonce: 6 },
  nextTab: "players",
});

assert.equal(nextLocalToplistVisibleBatchSize(99), 100);
assert.equal(nextLocalToplistVisibleBatchSize(100), 200);
assert.equal(nextLocalToplistVisibleBatchSize(998), 1000);
assert.equal(nextLocalToplistVisibleBatchSize(999), 1000);

const target = { kind: "player" as const, server: "EU5", identifier: "eu5_p1", label: "Player A", nonce: 1 };
assert.equal(sameLocalToplistPendingTarget(target, { ...target }), true);
assert.equal(sameLocalToplistPendingTarget(target, { ...target, nonce: 2 }), false);
assert.equal(sameLocalToplistPendingTarget(target, null), false);

console.log("localToplistSearchFlow.test: ok");

// An original archive guild occurrence enters the existing canonical table
// focus path without losing its provenance or switching away from Guilds.
const archiveGuild = {
  kind: "guild" as const, name: "Archive Guild", identifier: "s1_eu_g10", server: "s1_eu",
  archiveScanId: "source", archiveSha256: "a".repeat(64), searchIndexSha256: "b".repeat(64), scanTimestamp: 1, manifestYear: 2026,
};
const archiveAction = resolveLocalToplistSearchSelection("guilds", {
  kind: "guild", id: "archive", label: archiveGuild.name, identifier: archiveGuild.identifier, server: archiveGuild.server,
  status: "jumpable", score: 0, archive: archiveGuild,
}, "EU1", 99);
assert.equal(archiveAction.action, "focus-guild");
if (archiveAction.action === "focus-guild") {
  assert.equal(archiveAction.target.identifier, "eu1__10");
  assert.equal(archiveAction.target.archive, archiveGuild);
  assert.equal(archiveAction.nextTab, null);
}
