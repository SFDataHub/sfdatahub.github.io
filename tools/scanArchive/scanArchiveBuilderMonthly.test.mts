import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "fflate";
import { buildScanArchiveBatches, createScanArchiveBuildPlanCore, type ScanArchiveBuilderCoreOptions } from "../../src/lib/scanArchive/archiveBuilderCore.ts";
import type { ScanArchiveManifest } from "../../src/lib/scanArchive/types.ts";
import type { ScanArchiveBuilderRawPayload } from "../../src/lib/scanArchive/scanArchiveBuilderMonthly.ts";
import { validateScanArchiveManifest } from "../../src/lib/scanArchive/validation.ts";

const year = 2026;
const t1 = Date.UTC(year, 8, 19, 21);
const t2 = Date.UTC(year, 8, 19, 22);
const t3 = Date.UTC(year, 8, 20, 21);
const t4 = Date.UTC(year, 8, 21, 21);
const s = "f8_net";
const empty: ScanArchiveManifest = { schemaVersion: 1, archiveYear: year, revision: 0, updatedAt: "2026-01-01T00:00:00Z", scanCount: 0, serverCount: 0, scans: [] };
const encoder = new TextEncoder();
const deps = {
  gzip: (content: string) => gzipSync(encoder.encode(content), { level: 9, mtime: 0 }),
  sha256: (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex"),
  byteLength: (bytes: Uint8Array) => bytes.byteLength,
  utf8ByteLength: (content: string) => encoder.encode(content).byteLength,
};
const row = (identifier: string, timestamp = t1, server = s, name = identifier) => ({ prefix: server, timestamp, identifier, name });
const batches = (players: ReturnType<typeof row>[], groups: ReturnType<typeof row>[]) => buildScanArchiveBatches(JSON.stringify({ players, groups }), year);
const build = (options: Omit<ScanArchiveBuilderCoreOptions<Uint8Array>, "year">) => createScanArchiveBuildPlanCore({ year, ...options }, deps);
const payloads = (plan: Awaited<ReturnType<typeof build>>) => new Map(plan.files.filter((file) => file.kind === "raw" && file.bytes).map((file) => [file.scanId, JSON.parse(new TextDecoder().decode(gunzipSync(file.bytes!))) as ScanArchiveBuilderRawPayload]));
const base = await build({ manifest: empty, inputBatches: batches([row("f8_p1")], [row("f8_g1")]), setImportedAsMonthly: "2026-09", setImportedAsCurrent: true });
assert.equal(base.conflicts.length, 0);
const baseRaw = payloads(base);

// Create replaces only the selected reference, including multiple timestamps
// and split datatypes, and retains every pre-existing physical scan.
const foreign = await build({ manifest: base.manifestAfter, inputBatches: batches([row("f8_p9", t2)], [row("f8_g9", t2)]), usageMode: "archive-only" });
const create = await build({ manifest: foreign.manifestAfter, inputBatches: batches([row("f8_p2", t3)], [row("f8_g2", t4)]), usageMode: "create-monthly" });
assert.equal(create.conflicts.length, 0);
assert.equal(create.manifestAfter.scans.length, 4);
assert.deepEqual(create.manifestAfter.scans.slice(0, 2), foreign.manifestAfter.scans);
assert.deepEqual(create.manifestAfter.toplists?.monthly?.["2026-09"]?.[s], { scanIds: [`${s}:${t3}`, `${s}:${t4}`] });
assert.deepEqual(create.manifestAfter.toplists?.current?.[s], create.manifestAfter.toplists?.monthly?.["2026-09"]?.[s]);
validateScanArchiveManifest(create.manifestAfter, year);
const incompleteCreate = await build({ manifest: empty, inputBatches: batches([row("f8_p1")], []), usageMode: "create-monthly" });
assert(incompleteCreate.conflicts.some((conflict) => conflict.code === "toplist_missing_set_data"));

// Legacy Add loads the exact referenced member, ignores an unselected archive
// scan, accepts next-day timestamps, and independently dedupes players/guilds.
const importBatches = batches([
  row("F8_NET_p1", t3), row("f8_p2", t3, s, "older"), row("f8_p2", t4, s, "winner"),
  row("f8_p2", t4, s, "same-scan duplicate"), row("f8_p9", t3), row("shared", t3),
], [row("f8_g1", t3), row("shared", t4)]);
const original = JSON.stringify(importBatches);
const loaded: string[] = [];
const add = await build({ manifest: foreign.manifestAfter, inputBatches: importBatches, usageMode: "add-monthly", loadMonthlyRawScan: async (scan) => { loaded.push(scan.id); return baseRaw.get(scan.id)!; } });
assert.equal(add.conflicts.length, 0);
assert.deepEqual(loaded, [`${s}:${t1}`]);
assert.equal(JSON.stringify(importBatches), original);
const reversed = await build({ manifest: foreign.manifestAfter, inputBatches: [...importBatches].reverse(), usageMode: "add-monthly", loadMonthlyRawScan: async (scan) => baseRaw.get(scan.id)! });
assert.equal(reversed.conflicts.length, 0);
assert.deepEqual([...payloads(reversed)].sort(([left], [right]) => left.localeCompare(right)), [...payloads(add)].sort(([left], [right]) => left.localeCompare(right)));
assert.deepEqual(add.monthlyTargets[0], {
  server: s, month: "2026-09", baseMembers: [{ id: base.manifestAfter.scans[0].id, sha256: base.manifestAfter.scans[0].sha256 }],
  skippedPlayers: 1, skippedGuilds: 1, duplicatePlayers: 2, duplicateGuilds: 0, addedPlayers: 3, addedGuilds: 1, updatedPlayers: 0, updatedGuilds: 0,
});
const expectedIds = [`${s}:${t1}`, `${s}:${t3}`, `${s}:${t4}`];
assert.deepEqual(add.manifestAfter.toplists?.monthly?.["2026-09"]?.[s], { scanIds: expectedIds });
assert.deepEqual(add.manifestAfter.toplists?.current?.[s], { scanIds: expectedIds });
const addRaw = payloads(add);
assert.deepEqual(addRaw.get(`${s}:${t3}`)?.players.map((player) => player.identifier), ["f8_p2", "f8_p9", "shared"]);
assert.equal(addRaw.get(`${s}:${t3}`)?.groups.length, 0);
assert.equal(addRaw.get(`${s}:${t3}`)?.players[0].name, "older");
assert.equal(addRaw.get(`${s}:${t4}`)?.players.length, 0);
for (const file of add.files) {
  assert(file.bytes);
  const entry = add.manifestAfter.scans.find((scan) => scan.id === file.scanId)!;
  const payload = JSON.parse(new TextDecoder().decode(gunzipSync(file.bytes)));
  assert.equal(file.compressedBytes, file.bytes.length);
  assert.equal(file.sha256, deps.sha256(file.bytes));
  assert.equal(payload.players.length, entry.playerCount);
  assert.equal((file.kind === "raw" ? payload.groups : payload.guilds).length, entry.groupCount);
  if (file.kind === "searchIndex") {
    assert.equal(payload.sourceSha256, entry.sha256);
    assert.deepEqual(payload.players.map((player: { identifier: string }) => player.identifier), addRaw.get(file.scanId)!.players.map((player) => player.identifier));
  }
}

// Rebuilding the original inspection in Create keeps rows skipped during Add.
const createAfterAdd = await build({ manifest: empty, inputBatches: importBatches, usageMode: "create-monthly" });
assert.equal(createAfterAdd.conflicts.length, 0);
assert.equal(createAfterAdd.monthlyTargets[0].addedPlayers, 6);
assert.equal(JSON.stringify(importBatches), original);

// Subsequent Add sees IDs from every member. Empty batches are dropped, and
// player-only / guild-only additions remain valid through the whole set.
const allRaw = new Map([...baseRaw, ...addRaw]);
const more = await build({ manifest: add.manifestAfter, inputBatches: batches([row("f8_p1", t4 + 1), row("f8_p2", t4 + 1), row("f8_p3", t4 + 2)], [row("shared", t4 + 1), row("f8_g3", t4 + 3)]), usageMode: "add-monthly", loadMonthlyRawScan: async (scan) => allRaw.get(scan.id)! });
assert.equal(more.conflicts.length, 0);
assert.equal(more.monthlyTargets[0].baseMembers.length, 3);
assert.equal(more.monthlyTargets[0].skippedPlayers, 2);
assert.equal(more.monthlyTargets[0].skippedGuilds, 1);
assert.deepEqual(more.batches.map((batch) => [batch.timestamp, batch.players.length, batch.groups.length]), [[t4 + 2, 1, 0], [t4 + 3, 0, 1]]);

const redundant = await build({ manifest: add.manifestAfter, inputBatches: batches([row("f8_p2", t4 + 1)], [row("shared", t4 + 1)]), usageMode: "add-monthly", loadMonthlyRawScan: async (scan) => allRaw.get(scan.id)! });
assert(redundant.conflicts.some((conflict) => conflict.code === "add_no_new_ids"));
assert.equal(redundant.files.length, 0);
assert.deepEqual(redundant.manifestAfter, redundant.manifestBefore);

const missing = await build({ manifest: empty, inputBatches: batches([row("p1", t1), row("p1", t1, "s30_eu")], []), usageMode: "add-monthly" });
assert.deepEqual(missing.conflicts.map((conflict) => conflict.code), ["add_target_missing", "add_target_missing"]);
assert(missing.conflicts[0].message.includes("f8_net/2026-09"));
assert(missing.conflicts[1].message.includes("s30_eu/2026-09"));
const partial = await build({ manifest: add.manifestAfter, inputBatches: batches([row("new", t4 + 1)], []), usageMode: "add-monthly", loadMonthlyRawScan: async (scan) => {
  if (scan.timestamp === t1) return baseRaw.get(scan.id)!;
  if (scan.timestamp === t3) throw new Error("SHA mismatch");
  return { players: [], groups: [] };
} });
assert.equal(partial.conflicts.length, 2);
assert(partial.conflicts.every((conflict) => conflict.code === "add_member_unavailable" && conflict.message.includes("f8_net/2026-09") && conflict.message.includes("SHA")));
assert(partial.conflicts.some((conflict) => conflict.scanId === `${s}:${t3}`));
assert(partial.conflicts.some((conflict) => conflict.scanId === `${s}:${t4}`));
assert.equal(partial.files.length, 0);

// Same identifiers on other servers remain distinct; player and guild IDs
// also remain distinct even if their raw strings coincide.
const twoServers = await build({ manifest: empty, inputBatches: batches([row("f8_p1"), row("s30_p1", t1, "s30_eu")], [row("shared"), row("shared", t1, "s30_eu")]), usageMode: "create-monthly" });
const twoRaw = payloads(twoServers);
const separated = await build({ manifest: twoServers.manifestAfter, inputBatches: batches([row("shared", t3), row("p2", t3, "s30_eu")], [row("shared", t3), row("newGuild", t3, "s30_eu")]), usageMode: "add-monthly", loadMonthlyRawScan: async (scan) => twoRaw.get(scan.id)! });
assert.equal(separated.conflicts.length, 0);
assert.equal(separated.monthlyTargets[0].addedPlayers, 1);
assert.equal(separated.monthlyTargets[0].skippedGuilds, 1);
assert.equal(separated.monthlyTargets[1].addedPlayers, 1);
assert.equal(separated.monthlyTargets[1].addedGuilds, 1);

const collision = await build({ manifest: base.manifestAfter, inputBatches: batches([row("new", t1)], []), usageMode: "add-monthly", loadMonthlyRawScan: async (scan) => baseRaw.get(scan.id)! });
assert(collision.conflicts.some((conflict) => conflict.code === "scan_id_conflict" && conflict.message.includes(`${s}:${t1}`)));
assert.deepEqual(collision.manifestAfter.toplists, base.manifestAfter.toplists);
const pathCollision = await build({ manifest: base.manifestAfter, inputBatches: batches([row("new", t3)], []), usageMode: "add-monthly", loadMonthlyRawScan: async (scan) => baseRaw.get(scan.id)!, existingFiles: new Map([[`2026-09/${s}/2026-09-20_210000000Z.json.gz`, { sha256: "a".repeat(64), compressedBytes: 1 }]]) });
assert(pathCollision.conflicts.some((conflict) => conflict.code === "target_path_conflict"));

// Add to an older month preserves a newer Current. Create still obeys the
// established Current rollback blocker, including a multi-member Current.
const october = Date.UTC(year, 9, 1);
const newer = await build({ manifest: add.manifestAfter, inputBatches: batches([row("oct", october)], [row("octGuild", october + 1)]), usageMode: "create-monthly" });
assert.equal(newer.conflicts.length, 0);
const olderAdd = await build({ manifest: newer.manifestAfter, inputBatches: batches([row("oldMonthNew", t4 + 10)], []), usageMode: "add-monthly", loadMonthlyRawScan: async (scan) => allRaw.get(scan.id)! });
assert.equal(olderAdd.conflicts.length, 0);
assert.deepEqual(olderAdd.manifestAfter.toplists?.current, newer.manifestAfter.toplists?.current);
const rollback = await build({ manifest: newer.manifestAfter, inputBatches: batches([row("replacement", t4 + 20)], [row("replacementGuild", t4 + 20)]), usageMode: "create-monthly" });
assert(rollback.conflicts.some((conflict) => conflict.code === "toplist_current_rollback"));
const archiveOnly = await build({ manifest: add.manifestAfter, inputBatches: batches([row("f8_p1", t4 + 30)], [row("f8_g1", t4 + 30)]), usageMode: "archive-only", loadMonthlyRawScan: async () => { throw new Error("Archive-only must not load baseline"); } });
assert.equal(archiveOnly.conflicts.length, 0);
assert.equal(archiveOnly.batches[0].players.length, 1);
assert.deepEqual(archiveOnly.manifestAfter.toplists, add.manifestAfter.toplists);
const invalid = structuredClone(base.manifestAfter);
invalid.toplists!.monthly!["2026-09"][s] = { scanIds: ["missing"] };
await assert.rejects(build({ manifest: invalid, inputBatches: importBatches, usageMode: "add-monthly" }), /nicht im Manifest/);

// Admin Create writes historical monthly sets without rolling back Current.
const servers = [s, "s30_eu", "stumblesteppe_net"];
const sept5 = Date.UTC(year, 8, 5, 7);
const sept6 = Date.UTC(year, 8, 6, 7);
const currentBase = await build({ manifest: empty, usageMode: "create-monthly", inputBatches: batches(servers.map(server => row(`${server}_pCurrent`, t1, server)), servers.map(server => row(`${server}_gCurrent`, t2, server))) });
const historicalBatches = batches(servers.map(server => row(`${server}_pHistorical`, sept5, server)), servers.map(server => row(`${server}_gHistorical`, sept5 + 1, server)));
const beforeHistorical = JSON.stringify(currentBase.manifestAfter);
const historical = await build({ manifest: currentBase.manifestAfter, usageMode: "create-monthly", preserveNewerCurrent: true, inputBatches: historicalBatches });
assert.deepEqual(historical.conflicts, []);
assert.equal(JSON.stringify(currentBase.manifestAfter), beforeHistorical);
assert.deepEqual(historical.manifestAfter.toplists!.current, currentBase.manifestAfter.toplists!.current);
assert.equal(historical.summary.filesToWrite, 12);
assert.equal(historical.manifestAfter.scans.length, currentBase.manifestAfter.scans.length + 6);
for (const server of servers) {
  assert.deepEqual(historical.manifestAfter.toplists!.monthly!["2026-09"][server], { scanIds: [`${server}:${sept5}`, `${server}:${sept5 + 1}`] });
  const notice = historical.warnings.find(w => w.preservedCurrent?.server === server)!;
  assert.equal(notice.code, "current_preserved");
  assert.deepEqual(notice.preservedCurrent, { server, month: "2026-09", monthlyScanIds: [`${server}:${sept5}`, `${server}:${sept5 + 1}`], monthlyTimestamp: sept5 + 1, currentScanIds: [`${server}:${t1}`, `${server}:${t2}`], currentTimestamp: t2 });
  assert(notice.message.includes(server) && notice.message.includes("2026-09"));
  assert(notice.message.includes(new Date(sept5 + 1).toISOString()) && notice.message.includes(new Date(t2).toISOString()));
  assert.match(notice.message, /wird geschrieben.*bleibt unveraendert/);
  assert.doesNotMatch(notice.message, /Archive-only/);
}
assert.equal(historical.warnings.filter(w => w.code === "current_preserved").length, servers.length);
const unordered = structuredClone(currentBase.manifestAfter);
for (const server of servers) (unordered.toplists!.current![server] as { scanIds: string[] }).scanIds.reverse();
const reversedHistorical = await build({ manifest: unordered, usageMode: "create-monthly", preserveNewerCurrent: true, inputBatches: [...historicalBatches].reverse() });
assert.deepEqual(reversedHistorical.manifestAfter.toplists, historical.manifestAfter.toplists);
assert.deepEqual(reversedHistorical.warnings.filter(w => w.code === "current_preserved"), historical.warnings.filter(w => w.code === "current_preserved"));
// Max member timestamp decides even if the candidate is newer than only the
// first Current member, or its first member is older than Current.
const between = await build({ manifest: currentBase.manifestAfter, usageMode: "create-monthly", preserveNewerCurrent: true, inputBatches: batches([row("between", t1 + 1)], [row("betweenGuild", t1 + 1)]) });
assert.deepEqual(between.manifestAfter.toplists!.current, currentBase.manifestAfter.toplists!.current);
assert.equal(between.warnings.find(w => w.code === "current_preserved")?.preservedCurrent?.currentTimestamp, t2);
const newerSet = await build({ manifest: currentBase.manifestAfter, usageMode: "create-monthly", preserveNewerCurrent: true, inputBatches: batches([row("olderMember", sept5)], [row("latestMember", t3)]) });
assert.deepEqual(newerSet.conflicts, []);
assert.deepEqual(newerSet.manifestAfter.toplists!.current![s], { scanIds: [`${s}:${sept5}`, `${s}:${t3}`] });
assert.equal(newerSet.warnings.filter(w => w.code === "current_preserved").length, 0);
const august = Date.UTC(year, 7, 5);
const olderMonth = await build({ manifest: currentBase.manifestAfter, usageMode: "create-monthly", preserveNewerCurrent: true, inputBatches: batches([row("aug", august)], [row("augGuild", august)]) });
assert.deepEqual(olderMonth.conflicts, []);
assert.deepEqual(olderMonth.manifestAfter.toplists!.current, currentBase.manifestAfter.toplists!.current);
assert.deepEqual(olderMonth.manifestAfter.toplists!.monthly!["2026-08"][s], { scanIds: [`${s}:${august}`] });
assert.deepEqual(olderMonth.manifestAfter.toplists!.monthly!["2026-09"], currentBase.manifestAfter.toplists!.monthly!["2026-09"]);
// Historical August Create retains the complete September baseline and Current,
// even when both monthly sets contain separate player and guild timestamps.
const augustSetBatches = batches(
  servers.map(server => row(`${server}_pAugust`, august, server)),
  servers.map(server => row(`${server}_gAugust`, august + 1, server)),
);
const augustCreateOptions = {
  manifest: currentBase.manifestAfter, usageMode: "create-monthly" as const,
  preserveNewerCurrent: true, updatedAt: currentBase.manifestAfter.updatedAt,
};
const augustCreate = await build({ ...augustCreateOptions, inputBatches: augustSetBatches });
const reverseAugustCreate = await build({ ...augustCreateOptions, inputBatches: [...augustSetBatches].reverse() });
assert.deepEqual(augustCreate.conflicts, []);
assert.deepEqual(reverseAugustCreate.manifestAfter, augustCreate.manifestAfter);
assert.deepEqual(augustCreate.manifestAfter.toplists!.current, currentBase.manifestAfter.toplists!.current);
assert.deepEqual(augustCreate.manifestAfter.toplists!.monthly!["2026-09"], currentBase.manifestAfter.toplists!.monthly!["2026-09"]);
for (const server of servers) {
  assert.deepEqual(augustCreate.manifestAfter.toplists!.monthly!["2026-08"][server], { scanIds: [`${server}:${august}`, `${server}:${august + 1}`] });
}
for (const scan of currentBase.manifestAfter.scans) assert.deepEqual(augustCreate.manifestAfter.scans.find(item => item.id === scan.id), scan);
validateScanArchiveManifest(augustCreate.manifestAfter, year);

const noCurrent = structuredClone(currentBase.manifestAfter);
delete noCurrent.toplists!.current;
const firstCurrent = await build({ manifest: noCurrent, usageMode: "create-monthly", preserveNewerCurrent: true, inputBatches: historicalBatches });
assert.deepEqual(firstCurrent.conflicts, []);
assert.deepEqual(firstCurrent.manifestAfter.toplists!.current, firstCurrent.manifestAfter.toplists!.monthly!["2026-09"]);
const repeated = await build({ manifest: historical.manifestAfter, usageMode: "create-monthly", preserveNewerCurrent: true, inputBatches: historicalBatches });
assert.deepEqual(repeated.conflicts, []);
assert.deepEqual(repeated.manifestAfter, historical.manifestAfter);
assert.equal(repeated.summary.filesToWrite, 0);
// Equal representative timestamps retain the established set replacement rule;
// differing bytes for the same scan ID still cause a conflict.
const equalTime = await build({ manifest: currentBase.manifestAfter, usageMode: "create-monthly", preserveNewerCurrent: true, inputBatches: batches([row("equalTimePlayer", sept5)], [row(`${s}_gCurrent`, t2)]) });
assert.deepEqual(equalTime.conflicts, []);
assert.deepEqual(equalTime.manifestAfter.toplists!.current![s], { scanIds: [`${s}:${sept5}`, `${s}:${t2}`] });
assert.equal(equalTime.warnings.filter(w => w.code === "current_preserved").length, 0);
const equalConflict = await build({ manifest: currentBase.manifestAfter, usageMode: "create-monthly", preserveNewerCurrent: true, inputBatches: batches([row("changed", t2)], [row("changedGuild", t2)]) });
assert(equalConflict.conflicts.some(c => c.code === "scan_id_conflict"));
assert.deepEqual(equalConflict.manifestAfter.toplists, currentBase.manifestAfter.toplists);
const historicalRaw = payloads(historical);
const historicalAdd = await build({ manifest: historical.manifestAfter, usageMode: "add-monthly", preserveNewerCurrent: true, inputBatches: batches([row(`${s}_pHistorical`, sept6), row("newHistoricalPlayer", sept6)], [row(`${s}_gHistorical`, sept6), row("newHistoricalGuild", sept6)]), loadMonthlyRawScan: async scan => historicalRaw.get(scan.id)! });
assert.deepEqual(historicalAdd.conflicts, []);
assert.deepEqual(historicalAdd.manifestAfter.toplists!.current, currentBase.manifestAfter.toplists!.current);
assert.deepEqual(historicalAdd.manifestAfter.toplists!.monthly!["2026-09"][s], { scanIds: [`${s}:${sept5}`, `${s}:${sept5 + 1}`, `${s}:${sept6}`] });
assert.equal(historicalAdd.monthlyTargets[0].skippedPlayers, 1);
assert.equal(historicalAdd.monthlyTargets[0].skippedGuilds, 1);
assert.equal(historicalAdd.monthlyTargets[0].addedPlayers, 1);
assert.equal(historicalAdd.monthlyTargets[0].addedGuilds, 1);
assert.equal(historicalAdd.warnings.find(w => w.code === "current_preserved")?.preservedCurrent?.monthlyTimestamp, sept6);
const historicalArchive = await build({ manifest: currentBase.manifestAfter, usageMode: "archive-only", preserveNewerCurrent: true, inputBatches: historicalBatches });
assert.deepEqual(historicalArchive.conflicts, []);
assert.deepEqual(historicalArchive.manifestAfter.toplists, currentBase.manifestAfter.toplists);
assert.equal(historicalArchive.warnings.filter(w => w.code === "current_preserved").length, 0);
const historicalPathConflict = await build({ manifest: currentBase.manifestAfter, usageMode: "create-monthly", preserveNewerCurrent: true, inputBatches: historicalBatches, existingFiles: new Map([[historicalBatches[0].path, { sha256: "f".repeat(64), compressedBytes: 1 }]]) });
assert(historicalPathConflict.conflicts.some(c => c.code === "target_path_conflict"));
assert.deepEqual(historicalPathConflict.manifestAfter.toplists, currentBase.manifestAfter.toplists);
// Default Core/CLI policy and the explicit rollback override remain available.
const defaultBlocked = await build({ manifest: currentBase.manifestAfter, usageMode: "create-monthly", inputBatches: historicalBatches });
assert.equal(defaultBlocked.conflicts.filter(c => c.code === "toplist_current_rollback").length, servers.length);
const explicitRollback = await build({ manifest: currentBase.manifestAfter, usageMode: "create-monthly", allowCurrentRollback: true, inputBatches: historicalBatches });
assert.deepEqual(explicitRollback.conflicts, []);
assert.deepEqual(explicitRollback.manifestAfter.toplists!.current, explicitRollback.manifestAfter.toplists!.monthly!["2026-09"]);

console.log("scanArchiveBuilderMonthly.test: ok");
