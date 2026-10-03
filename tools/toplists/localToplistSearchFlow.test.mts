import assert from "node:assert/strict";
import {
  nextLocalToplistVisibleBatchSize,
  resolveLocalToplistSearchSelection,
  sameLocalToplistPendingTarget,
} from "../../src/pages/GuildHub/localToplistSearchFlow.ts";
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
