import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { deleteDB } from "idb";

import { getClassMetaById } from "../../src/data/classes.ts";
import { normalizeGuildScanMembers } from "../../src/lib/guilds/guildScanNormalizer.ts";
import type { GuildHubLogicalScanSnapshot } from "../../src/lib/guilds/localScanLibrary.ts";
import {
  buildFusionIdentityManagementReportFromSnapshots,
  type FusionIdentityManagementItem,
} from "../../src/lib/identities/fusionIdentityManagement.ts";
import { createGuildIdentityStore } from "../../src/lib/identities/guildIdentityStore.ts";
import { createFusionIdentityObservations } from "../../src/lib/identities/playerFusionPreviewAdapter.ts";
import { createPlayerIdentityStore } from "../../src/lib/identities/playerIdentityStore.ts";
import { resolveServer } from "../../src/lib/servers/serverResolver.ts";

type JsonRecord = Record<string, unknown>;

const DEFAULT_SCAN_ROOT = "D:/SFDataHub/Guild Analytics/public/scans";
const TARGET_SERVER_CODE = "F28";
const TARGET_PLAYERS = [
  { identifier: "f28_net_p159602", name: "0g4R" },
  { identifier: "f28_net_p47616", name: "AchillesGR" },
  { identifier: "f28_net_p288481", name: "AjaxLegacy" },
  { identifier: "f28_net_p306095", name: "Aleendar" },
];

const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getScanTimestamp = (raw: JsonRecord): number | null => {
  const players = Array.isArray(raw.players) ? raw.players.map(asRecord).filter(Boolean) : [];
  return players.map((player) => toFiniteNumber(player?.timestamp)).find((timestamp) => timestamp != null) ?? null;
};

const listJsonFiles = (root: string): string[] =>
  fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listJsonFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".json") && entry.name !== "manifest.json" ? [fullPath] : [];
  });

const readSnapshot = (filePath: string): GuildHubLogicalScanSnapshot | null => {
  const raw = asRecord(JSON.parse(fs.readFileSync(filePath, "utf8")));
  if (!raw || !Array.isArray(raw.players)) return null;
  const timestampMs = getScanTimestamp(raw);
  if (timestampMs == null) return null;
  const groups = Array.isArray(raw.groups) ? raw.groups : Array.isArray(raw.guilds) ? raw.guilds : [];
  const fileName = path.basename(filePath);

  return {
    id: `${fileName}::${timestampMs}`,
    timestamp: new Date(timestampMs).toISOString(),
    timestampMs,
    players: raw.players,
    groups,
    servers: [],
    playerCount: raw.players.length,
    groupCount: groups.length,
    guildCount: groups.length,
    rawData: { ...raw, players: raw.players, groups },
    normalizedMembers: normalizeGuildScanMembers(raw),
    sourceScanId: fileName,
    sourceScanFilename: fileName,
    sourceImportedAt: new Date(timestampMs).toISOString(),
  };
};

const normalizeIdentifierKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const latestByTimestamp = <T extends { timestamp: number }>(values: T[]) =>
  values.reduce<T | null>((latest, value) => (latest == null || value.timestamp > latest.timestamp ? value : latest), null);

const earliestByTimestamp = <T extends { timestamp: number }>(values: T[]) =>
  values.reduce<T | null>((earliest, value) => (earliest == null || value.timestamp < earliest.timestamp ? value : earliest), null);

const latestSummaryObservation = (item: FusionIdentityManagementItem) => latestByTimestamp(item.observations);
const earliestSummaryObservation = (item: FusionIdentityManagementItem) => earliestByTimestamp(item.observations);

const formatTimestamp = (timestamp: number | null | undefined) => (timestamp ? new Date(timestamp).toISOString() : "missing");

const scanRoot = process.argv[2] ?? DEFAULT_SCAN_ROOT;
const snapshots = listJsonFiles(scanRoot)
  .map(readSnapshot)
  .filter((snapshot): snapshot is GuildHubLogicalScanSnapshot => Boolean(snapshot))
  .sort((left, right) => left.timestampMs - right.timestampMs);

assert.ok(snapshots.length > 0, "expected real scan snapshots");

const allObservations = snapshots
  .flatMap(createFusionIdentityObservations)
  .filter((observation) => resolveServer(observation.server)?.code === TARGET_SERVER_CODE);

const suffix = Date.now();
const playerStore = createPlayerIdentityStore({ dbName: `current-detail-player-${suffix}` });
const guildStore = createGuildIdentityStore({ dbName: `current-detail-guild-${suffix}` });
const report = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });

console.log("Current player detail regression:");
let multiObservationTargets = 0;
for (const target of TARGET_PLAYERS) {
  const observations = allObservations.filter(
    (observation) => normalizeIdentifierKey(observation.identifier) === normalizeIdentifierKey(target.identifier),
  );
  const firstObservation = earliestByTimestamp(observations);
  const latestObservation = latestByTimestamp(observations);
  const item = report.items.find(
    (entry) => entry.entityType === "player" && normalizeIdentifierKey(entry.currentIdentifier) === normalizeIdentifierKey(target.identifier),
  );
  const firstReportObservation = item ? earliestSummaryObservation(item) : null;
  const latestReportObservation = item ? latestSummaryObservation(item) : null;
  const clonedFirstReportObservation = firstReportObservation ? structuredClone(firstReportObservation) : null;
  const clonedReportObservation = latestReportObservation ? structuredClone(latestReportObservation) : null;
  const classLabel = getClassMetaById(clonedReportObservation?.classId)?.label ?? null;
  if (observations.length > 1) multiObservationTargets += 1;

  console.log(
    `${target.name} ${target.identifier} first=${formatTimestamp(firstObservation?.timestamp)} ` +
      `firstLevel=${firstObservation?.level ?? "missing"} firstGuild=${firstObservation?.guildName ?? "missing"} ` +
      `latest=${formatTimestamp(latestObservation?.timestamp)} latestLevel=${latestObservation?.level ?? "missing"} latestGuild=${latestObservation?.guildName ?? "missing"} ` +
      `reportClass=${clonedReportObservation?.classId ?? "missing"} classLabel=${classLabel ?? "missing"} ` +
      `firstReportLevel=${clonedFirstReportObservation?.level ?? "missing"} firstReportGuild=${clonedFirstReportObservation?.guildName ?? "missing"} ` +
      `latestReportLevel=${clonedReportObservation?.level ?? "missing"} latestReportGuild=${clonedReportObservation?.guildName ?? "missing"}`,
  );

  assert.ok(firstObservation, `${target.identifier} should exist in current observations`);
  assert.ok(latestObservation, `${target.identifier} should exist in current observations`);
  assert.ok(item, `${target.identifier} should exist in management report`);
  assert.equal(firstReportObservation?.timestamp, firstObservation?.timestamp, `${target.identifier} should use first observation`);
  assert.equal(item?.firstSeen, firstObservation?.timestamp, `${target.identifier} firstSeen should match first observation`);
  assert.equal(latestReportObservation?.timestamp, latestObservation?.timestamp, `${target.identifier} should use latest observation`);
  assert.equal(item?.lastSeen, latestObservation?.timestamp, `${target.identifier} lastSeen should match latest observation`);
  assert.ok(clonedReportObservation?.classId, `${target.identifier} should preserve classId through report/clone`);
  assert.ok(classLabel, `${target.identifier} should resolve class label`);
  assert.equal(clonedFirstReportObservation?.level, firstObservation?.level, `${target.identifier} should preserve first level through report/clone`);
  assert.equal(clonedFirstReportObservation?.guildName, firstObservation?.guildName, `${target.identifier} should preserve first guildName through report/clone`);
  assert.equal(clonedReportObservation?.level, latestObservation?.level, `${target.identifier} should preserve level through report/clone`);
  assert.equal(clonedReportObservation?.guildName, latestObservation?.guildName, `${target.identifier} should preserve guildName through report/clone`);
}
assert.ok(multiObservationTargets > 0, "expected at least one multi-observation current player regression target");

const playerStatuses = report.items.filter((item) => item.entityType === "player").reduce(
  (counts, item) => ({ ...counts, [item.status]: (counts[item.status] ?? 0) + 1 }),
  {} as Record<string, number>,
);
assert.equal(playerStatuses.ready, 1251, "ready player count should stay unchanged");
assert.equal(playerStatuses.review, 37, "review player count should stay unchanged");
assert.equal(playerStatuses.unresolved, 2, "unresolved player count should stay unchanged");
assert.equal(playerStatuses.noHistoricalObservation, 2, "no historical observation player count should stay unchanged");
assert.equal(playerStatuses.noHistory, 1, "no historical data player count should stay unchanged");
assert.equal(playerStatuses.completed ?? 0, 0, "completed player count should stay unchanged");

await playerStore.close();
await guildStore.close();
await deleteDB(`current-detail-player-${suffix}`);
await deleteDB(`current-detail-guild-${suffix}`);

console.log("current player detail regression passed");
