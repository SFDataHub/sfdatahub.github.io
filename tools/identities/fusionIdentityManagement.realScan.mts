import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { deleteDB } from "idb";

import { normalizeGuildScanMembers } from "../../src/lib/guilds/guildScanNormalizer.ts";
import type { GuildHubLogicalScanSnapshot } from "../../src/lib/guilds/localScanLibrary.ts";
import {
  buildFusionIdentityManagementReportFromSnapshots,
  type FusionIdentityManagementStatus,
} from "../../src/lib/identities/fusionIdentityManagement.ts";
import { createGuildIdentityStore } from "../../src/lib/identities/guildIdentityStore.ts";
import { createPlayerIdentityStore } from "../../src/lib/identities/playerIdentityStore.ts";
import { createFusionIdentityObservations } from "../../src/lib/identities/playerFusionPreviewAdapter.ts";
import {
  resolvePlayerFusions,
  type PlayerFusionCandidateClassification,
  type PlayerFusionEvidenceEntryType,
  type PlayerFusionEvidenceStrength,
} from "../../src/lib/identities/playerFusionResolver.ts";
import { resolveServer } from "../../src/lib/servers/serverResolver.ts";

type JsonRecord = Record<string, unknown>;

const DEFAULT_SCAN_ROOT = "D:/SFDataHub/Guild Analytics/public/scans";
const GUILD_CASES: Array<{
  label: string;
  currentName: string;
  historicalId?: string;
  expectedStatus?: FusionIdentityManagementStatus;
  expectedReady?: boolean;
}> = [
  { label: "Magic Mushrooms", currentName: "Magic Mushrooms", historicalId: "eu1_g8", expectedStatus: "ready", expectedReady: true },
  { label: "Hangover", currentName: "Hangover", expectedStatus: "ready", expectedReady: true },
  { label: "Dead End -> Erben im Wandel", currentName: "Erben im Wandel", historicalId: "eu4_g14", expectedStatus: "review" },
  { label: "Die Legion -> Legion Z", currentName: "Legion Z", historicalId: "eu3_g4877", expectedStatus: "review" },
  { label: "GenerationZ -> Legion Z", currentName: "Legion Z", historicalId: "eu4_g1352" },
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

const normalizeKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/ß/g, "ss")
    .toLowerCase();

const countByStatus = (statuses: FusionIdentityManagementStatus[]) =>
  statuses.reduce(
    (counts, status) => ({ ...counts, [status]: (counts[status] ?? 0) + 1 }),
    {} as Record<FusionIdentityManagementStatus, number>,
  );

const ORIGIN_SERVER_CODES = new Set(["EU1", "EU2", "EU3", "EU4"]);
const TARGET_SERVER_CODE = "F28";
const resolveServerCode = (value: unknown) => resolveServer(String(value ?? ""))?.code ?? null;
const EXPECTED_PLAYER_EVIDENCE_STRENGTHS = new Set<PlayerFusionEvidenceStrength>([
  "hardContradiction",
  "strongContradiction",
  "neutral",
  "weakSupport",
  "support",
  "strongSupport",
  "identityAnchor",
]);
const EXPECTED_PLAYER_CANDIDATE_CLASSIFICATIONS = new Set<PlayerFusionCandidateClassification>([
  "rejected",
  "weak",
  "plausible",
  "strong",
  "anchored",
]);
const EXPECTED_PLAYER_EVIDENCE_TYPES = new Set<PlayerFusionEvidenceEntryType>([
  "origin-compatibility",
  "class-compatibility",
  "level-monotonicity",
  "level-progression",
  "base-monotonicity",
  "base-unchanged-stats",
  "base-secondary-stability",
  "base-ordering",
  "fortress-continuity",
  "pet-continuity",
  "guild-continuity",
  "exact-name",
  "fusion-base-name",
  "assignment",
]);

const scanRoot = process.argv[2] ?? DEFAULT_SCAN_ROOT;
const snapshots = listJsonFiles(scanRoot)
  .map(readSnapshot)
  .filter((snapshot): snapshot is GuildHubLogicalScanSnapshot => Boolean(snapshot))
  .sort((left, right) => left.timestampMs - right.timestampMs);

assert.ok(snapshots.length > 0, "expected real scan snapshots");

const suffix = Date.now();
const playerStore = createPlayerIdentityStore({ dbName: `fusion-real-player-${suffix}` });
const guildStore = createGuildIdentityStore({ dbName: `fusion-real-guild-${suffix}` });

const report = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });
const previousReport = await buildFusionIdentityManagementReportFromSnapshots(
  { snapshots, playerStore, guildStore },
  { enablePlayerLevelProgressionEvidence: false },
);
const playerItems = report.items.filter((item) => item.entityType === "player");
const guildItems = report.items.filter((item) => item.entityType === "guild");
const previousPlayerItems = previousReport.items.filter((item) => item.entityType === "player");
const previousPlayerById = new Map(previousPlayerItems.map((item) => [item.id, item]));
const playerCounts = countByStatus(playerItems.map((item) => item.status));
const previousPlayerCounts = countByStatus(previousPlayerItems.map((item) => item.status));
const guildCounts = countByStatus(guildItems.map((item) => item.status));
const levelRegressionRemovedTotal = playerItems.reduce(
  (total, item) => total + (item.diagnostics?.candidatePipeline.candidatesRejectedByLevelRegression ?? 0),
  0,
);
const levelProgressionRemovedTotal = playerItems.reduce(
  (total, item) => total + (item.diagnostics?.candidatePipeline.candidatesRejectedByLevelProgression ?? 0),
  0,
);
const playerItemsWithLevelRegressionRemoved = playerItems.filter(
  (item) => (item.diagnostics?.candidatePipeline.candidatesRejectedByLevelRegression ?? 0) > 0,
);
const playerItemsWithLevelProgressionRemoved = playerItems.filter(
  (item) => (item.diagnostics?.candidatePipeline.candidatesRejectedByLevelProgression ?? 0) > 0,
);
const previousStatusAffected = (status: FusionIdentityManagementStatus) =>
  playerItemsWithLevelProgressionRemoved.filter((item) => previousPlayerById.get(item.id)?.status === status).length;
const transitionCount = (from: FusionIdentityManagementStatus, to: FusionIdentityManagementStatus) =>
  playerItems.filter((item) => previousPlayerById.get(item.id)?.status === from && item.status === to).length;
const previousReviewItems = previousPlayerItems.filter((item) => item.status === "review");
const previousReviewDeltas = previousReviewItems.reduce(
  (counts, previousItem) => {
    const nextItem = playerItems.find((item) => item.id === previousItem.id);
    if (!nextItem) return counts;
    if (nextItem.candidates.length < previousItem.candidates.length) counts.fewerCandidates += 1;
    if (nextItem.status === "ready") counts.promotedToReady += 1;
    if (nextItem.candidates.length === previousItem.candidates.length) counts.unchanged += 1;
    return counts;
  },
  { fewerCandidates: 0, promotedToReady: 0, unchanged: 0 },
);
const allPlayerObservations = snapshots.flatMap(createFusionIdentityObservations);
const historicalPlayerObservations = allPlayerObservations.filter((observation) =>
  ORIGIN_SERVER_CODES.has(resolveServerCode(observation.server) ?? ""),
);
const currentPlayerObservations = allPlayerObservations.filter(
  (observation) => resolveServerCode(observation.server) === TARGET_SERVER_CODE,
);
const strictPlayerResults = resolvePlayerFusions({
  historicalObservations: historicalPlayerObservations,
  newObservations: currentPlayerObservations,
}).results;
const legacyPlayerResults = resolvePlayerFusions({
  historicalObservations: historicalPlayerObservations,
  newObservations: currentPlayerObservations,
  enableLevelProgressionEvidence: false,
}).results;
const playerEvidenceAudit = strictPlayerResults.reduce(
  (audit, result) => {
    result.candidates.forEach((candidate) => {
      audit.candidates += 1;
      if (!EXPECTED_PLAYER_CANDIDATE_CLASSIFICATIONS.has(candidate.classification)) audit.missingOrUnknownClassification += 1;
      candidate.evidence.entries.forEach((entry) => {
        audit.entries += 1;
        if (!entry.type || !EXPECTED_PLAYER_EVIDENCE_TYPES.has(entry.type)) audit.missingOrUnknownType += 1;
        if (!entry.strength || !EXPECTED_PLAYER_EVIDENCE_STRENGTHS.has(entry.strength)) audit.missingOrUnknownStrength += 1;
        if (typeof entry.label !== "string" || !entry.label.trim()) audit.missingLabel += 1;
      });
    });
    return audit;
  },
  {
    candidates: 0,
    entries: 0,
    missingOrUnknownClassification: 0,
    missingOrUnknownType: 0,
    missingOrUnknownStrength: 0,
    missingLabel: 0,
  },
);
const strictResultByIdentifier = new Map(strictPlayerResults.map((result) => [normalizeKey(result.newIdentifier), result]));
const readyRegressions = playerItems
  .map((item) => ({ item, previous: previousPlayerById.get(item.id) ?? null }))
  .filter(({ item, previous }) => previous?.status === "ready" && item.status !== "ready");
const readyPlayerCandidates = playerItems.flatMap((item) =>
  item.status === "ready"
    ? item.candidates.filter((candidate) => candidate.entityType === "player" && candidate.ready)
    : [],
);
const readyClassMismatch = readyPlayerCandidates.filter((candidate) =>
  candidate.entityType === "player" && candidate.evidence.rejectReasons.includes("different-class"),
).length;
const readyLevelRegression = readyPlayerCandidates.filter(
  (candidate) =>
    candidate.entityType === "player" &&
    (candidate.evidence.rejectReasons.includes("level-regression") || candidate.evidence.rejectReasons.includes("level-drop")),
).length;
const readyBaseRegression = readyPlayerCandidates.filter(
  (candidate) =>
    candidate.entityType === "player" &&
    (candidate.evidence.rejectReasons.includes("base-stat-regression") ||
      candidate.evidence.rejectReasons.includes("base-attributes-contradiction")),
).length;

console.log("Fusion Identity Management real scan regression");
console.log(`Scans included: ${report.scope.allSnapshotCount}`);
console.log(`History range: ${report.scope.firstHistoricalTimestamp} - ${report.scope.lastHistoricalTimestamp}`);
console.log(`Unique post-fusion players: ${playerItems.length}`);
console.log(`Unique post-fusion guilds: ${guildItems.length}`);
console.log(
  `Players ready=${playerCounts.ready ?? 0} review=${playerCounts.review ?? 0} unresolved=${playerCounts.unresolved ?? 0} noHistoricalObservation=${playerCounts.noHistoricalObservation ?? 0} noHistory=${playerCounts.noHistory ?? 0} completed=${playerCounts.completed ?? 0}`,
);
console.log(
  `Previous players ready=${previousPlayerCounts.ready ?? 0} review=${previousPlayerCounts.review ?? 0} unresolved=${previousPlayerCounts.unresolved ?? 0} noHistoricalObservation=${previousPlayerCounts.noHistoricalObservation ?? 0} noHistory=${previousPlayerCounts.noHistory ?? 0} completed=${previousPlayerCounts.completed ?? 0}`,
);
console.log(
  `Guilds ready=${guildCounts.ready ?? 0} review=${guildCounts.review ?? 0} unresolved=${guildCounts.unresolved ?? 0} noHistoricalObservation=${guildCounts.noHistoricalObservation ?? 0} noHistory=${guildCounts.noHistory ?? 0} completed=${guildCounts.completed ?? 0}`,
);
console.log(`level-contradiction candidates removed = ${levelRegressionRemovedTotal}`);
console.log(`extreme-progression candidates removed = ${levelProgressionRemovedTotal}`);
console.log(
  `player evidence schema audit: candidates=${playerEvidenceAudit.candidates} entries=${playerEvidenceAudit.entries} missingOrUnknownClassification=${playerEvidenceAudit.missingOrUnknownClassification} missingOrUnknownType=${playerEvidenceAudit.missingOrUnknownType} missingOrUnknownStrength=${playerEvidenceAudit.missingOrUnknownStrength} missingLabel=${playerEvidenceAudit.missingLabel}`,
);
console.log(
  `previous Ready affected? ${previousStatusAffected("ready")} | previous Review affected? ${previousStatusAffected("review")} | previous Unresolved affected? ${previousStatusAffected("unresolved")}`,
);
console.log(
  `status transitions: Ready->Ready=${transitionCount("ready", "ready")} Ready->Review=${transitionCount("ready", "review")} Ready->Unresolved=${transitionCount("ready", "unresolved")} Review->Ready=${transitionCount("review", "ready")} Review->Review=${transitionCount("review", "review")} Review->Unresolved=${transitionCount("review", "unresolved")}`,
);
console.log("Ready regressions:");
readyRegressions.forEach(({ item, previous }) => {
  const result = strictResultByIdentifier.get(normalizeKey(item.currentIdentifier));
  const previousReady = previous?.readyCandidateIdentifier ?? "none";
  const previousCandidate = result?.candidates.find((candidate) => normalizeKey(candidate.oldIdentifier) === normalizeKey(previousReady));
  console.log(
    `- ${item.currentName ?? item.currentIdentifier}: current=${item.currentIdentifier} ${previous?.status ?? "missing"}->${item.status} previousReady=${previousReady} reason=${item.reasonCodes.join("|") || "none"} previousCandidateRejected=${previousCandidate?.rejected ?? "missing"} previousCandidateReasons=${previousCandidate?.rejectReasons.join("|") || "none"} previousCandidateProgression=${previousCandidate?.evidence.levelProgression.category ?? "missing"}`,
  );
});
console.log(
  `Ready hard contradiction audit: classMismatch=${readyClassMismatch} levelRegression=${readyLevelRegression} baseStatRegression=${readyBaseRegression}`,
);
console.log(
  `previous review candidate delta: reviews with fewer candidates=${previousReviewDeltas.fewerCandidates}, reviews promoted to ready=${previousReviewDeltas.promotedToReady}, reviews unchanged=${previousReviewDeltas.unchanged}`,
);
assert.equal(readyClassMismatch, 0, "final ready player matches should not include class mismatches");
assert.equal(readyLevelRegression, 0, "final ready player matches should not include level regressions");
assert.equal(readyBaseRegression, 0, "final ready player matches should not include base-stat regressions");
assert.equal(playerEvidenceAudit.missingOrUnknownClassification, 0, "real-scan candidates should have known classifications");
assert.equal(playerEvidenceAudit.missingOrUnknownType, 0, "real-scan evidence entries should have known types");
assert.equal(playerEvidenceAudit.missingOrUnknownStrength, 0, "real-scan evidence entries should have known strengths");
assert.equal(playerEvidenceAudit.missingLabel, 0, "real-scan evidence entries should have labels");
assert.equal(
  report.summary.ready + report.summary.review + report.summary.unresolved + report.summary.noHistoricalObservation + report.summary.noHistory + report.summary.completed,
  report.summary.total,
  "summary counts should add up to total",
);
console.log("Ground-truth guild cases:");

GUILD_CASES.forEach((item) => {
  const matches = guildItems.filter((entry) => normalizeKey(entry.currentName) === normalizeKey(item.currentName));
  const withCandidate = item.historicalId
    ? matches.find((entry) =>
        entry.candidates.some((candidate) => normalizeKey(candidate.historicalIdentifier) === normalizeKey(item.historicalId)),
      )
    : matches.find((entry) => entry.candidates.length > 0);
  const withMigration = item.historicalId
    ? matches.find((entry) =>
        entry.memberMigrationEdges.some((edge) => normalizeKey(edge.oldGuildIdentifier) === normalizeKey(item.historicalId)),
      )
    : matches.find((entry) => entry.memberMigrationEdges.length > 0);
  const selected = withCandidate ?? withMigration ?? matches[0] ?? null;
  const candidate = item.historicalId
    ? selected?.candidates.find((entry) => normalizeKey(entry.historicalIdentifier) === normalizeKey(item.historicalId))
    : selected?.candidates[0];
  const migration = item.historicalId
    ? selected?.memberMigrationEdges.find((entry) => normalizeKey(entry.oldGuildIdentifier) === normalizeKey(item.historicalId))
    : selected?.memberMigrationEdges[0];

  console.log(
    `- ${item.label}: current=${selected?.currentIdentifier ?? "missing"} status=${selected?.status ?? "missing"} historical=${candidate?.historicalIdentifier ?? migration?.oldGuildIdentifier ?? "missing"} candidate=${candidate ? "yes" : "no"} migration=${migration ? "yes" : "no"} ready=${candidate?.ready ?? false} matched=${candidate?.entityType === "guild" ? candidate.evidence.matchedMemberCount : migration?.matchedMemberCount ?? 0}`,
  );
  assert.ok(selected, `${item.label} current guild should be present`);
  assert.ok(candidate || migration, `${item.label} should have identity or migration evidence`);
  if (item.expectedStatus) assert.equal(selected.status, item.expectedStatus, `${item.label} status`);
  if (item.expectedReady != null) assert.equal(candidate?.ready ?? false, item.expectedReady, `${item.label} ready candidate`);
});

const mika = playerItems.find((item) => normalizeKey(item.currentName) === "mika");
const aleendar = playerItems.find((item) => normalizeKey(item.currentName) === "aleendar");
const makio = playerItems.find((item) => normalizeKey(item.currentIdentifier) === "f28_net_p209891" || normalizeKey(item.currentName) === "makio");
const hardiy = playerItems.find((item) => normalizeKey(item.currentName) === "hardiy");
const zachi = playerItems.find((item) => normalizeKey(item.currentIdentifier) === "f28_net_p234559" || normalizeKey(item.currentName) === "zachi");
const luzie = playerItems.find((item) => normalizeKey(item.currentIdentifier) === "f28_net_p181717" || normalizeKey(item.currentName) === "luzie");
const hardiyPrevious = hardiy ? previousPlayerById.get(hardiy.id) : previousPlayerItems.find((item) => normalizeKey(item.currentName) === "hardiy");
const hardiyCurrentCandidateKeys = new Set(hardiy?.candidates.map((candidate) => normalizeKey(candidate.historicalIdentifier)) ?? []);
const hardiyRemovedCandidates =
  hardiyPrevious?.candidates.filter((candidate) => !hardiyCurrentCandidateKeys.has(normalizeKey(candidate.historicalIdentifier))) ?? [];
const strictHardiy = hardiy
  ? strictPlayerResults.find((result) => normalizeKey(result.newIdentifier) === normalizeKey(hardiy.currentIdentifier))
  : null;
const legacyHardiy = hardiy
  ? legacyPlayerResults.find((result) => normalizeKey(result.newIdentifier) === normalizeKey(hardiy.currentIdentifier))
  : null;
const hardiyLevelRegressionCandidates =
  strictHardiy?.candidates.filter((candidate) => candidate.rejectReasons.includes("level-regression")) ?? [];
const hardiyLevelProgressionCandidates =
  strictHardiy?.candidates.filter((candidate) => candidate.rejectReasons.includes("level-progression-extreme")) ?? [];
const hardiyNamedCandidateNames = new Set(["darth monk", "hardiydk", "matti"]);
const hardiyFocusedCandidates = strictHardiy?.candidates.filter(
  (candidate) => candidate.oldName && hardiyNamedCandidateNames.has(normalizeKey(candidate.oldName)),
) ?? [];
const semanticDifferentiated = playerItems
  .filter((item) =>
    item.status === "ready" &&
    item.candidates.some(
      (candidate) =>
        candidate.entityType === "player" &&
        candidate.ready &&
        candidate.evidence.evidence.baseAttributesConsistent === true &&
        !candidate.evidence.evidence.exactName &&
        !candidate.evidence.evidence.fusionBaseName,
    ),
  )
  .slice(0, 12);
const historyCases = playerItems
  .filter((item) => item.status === "ready" && item.observations.length > 1 && item.candidates.some((candidate) => candidate.entityType === "player" && candidate.ready))
  .slice(0, 6);
console.log("Ground-truth player cases:");
console.log(
  `- Mika: current=${mika?.currentIdentifier ?? "missing"} status=${mika?.status ?? "missing"} ready=${mika?.readyCandidateIdentifier ?? "missing"} candidates=${mika?.candidates.length ?? 0}`,
);
console.log(
  `- Aleendar: current=${aleendar?.currentIdentifier ?? "missing"} status=${aleendar?.status ?? "missing"} ready=${aleendar?.readyCandidateIdentifier ?? "missing"} candidates=${aleendar?.candidates.length ?? 0}`,
);
console.log(
  `- Makio: current=${makio?.currentIdentifier ?? "missing"} status=${makio?.status ?? "missing"} ready=${makio?.readyCandidateIdentifier ?? "missing"} candidates=${makio?.candidates.length ?? 0}`,
);
console.log(
  `- Zachi: current=${zachi?.currentIdentifier ?? "missing"} status=${zachi?.status ?? "missing"} ready=${zachi?.readyCandidateIdentifier ?? "missing"} candidates=${zachi?.candidates.length ?? 0} reasons=${zachi?.reasonCodes.join("|") || "none"}`,
);
console.log(
  `- Luzie: current=${luzie?.currentIdentifier ?? "missing"} status=${luzie?.status ?? "missing"} candidates=${luzie?.candidates.length ?? 0} reasons=${luzie?.reasonCodes.join("|") || "none"}`,
);
luzie?.candidates.forEach((candidate) => {
  if (candidate.entityType !== "player") return;
  console.log(
    `  luzieCandidate=${candidate.historicalIdentifier} name=${candidate.historicalName ?? "unknown"} classification=${candidate.evidence.classification} level=${candidate.evidence.evidence.levelConsistent} progression=${candidate.evidence.evidence.levelProgression.category} base=${candidate.evidence.evidence.baseAttributesConsistent} fortress=${candidate.evidence.evidence.fortressContinuity} pets=${candidate.evidence.evidence.petContinuity} exact=${candidate.evidence.evidence.exactName} baseName=${candidate.evidence.evidence.fusionBaseName} guild=${candidate.evidence.evidence.sameGuild}`,
  );
});
console.log(
  `- Hardiy: current=${hardiy?.currentIdentifier ?? hardiyPrevious?.currentIdentifier ?? "missing"} beforeStatus=${hardiyPrevious?.status ?? "missing"} afterStatus=${hardiy?.status ?? "missing"} beforeDisplayCandidates=${hardiyPrevious?.candidates.length ?? 0} afterDisplayCandidates=${hardiy?.candidates.length ?? 0} beforeViableCandidates=${legacyHardiy?.candidates.filter((candidate) => !candidate.rejected).length ?? 0} afterViableCandidates=${strictHardiy?.candidates.filter((candidate) => !candidate.rejected).length ?? 0} winner=${hardiy?.status === "ready" ? hardiy.readyCandidateIdentifier ?? "missing" : "none"} removedLevelRegression=${hardiyLevelRegressionCandidates.length} removedExtremeProgression=${hardiyLevelProgressionCandidates.length}`,
);
hardiyRemovedCandidates.forEach((candidate) => {
  if (candidate.entityType !== "player") return;
  console.log(
    `  removed=${candidate.historicalName ?? candidate.historicalIdentifier} ${candidate.historicalIdentifier} Lv${candidate.evidence.oldLevel ?? "n/a"} class=${candidate.evidence.evidence.sameClass} level=${candidate.evidence.evidence.levelConsistent} base=${candidate.evidence.evidence.baseAttributesConsistent} fortress=${candidate.evidence.evidence.fortressContinuity} pets=${candidate.evidence.evidence.petContinuity} exact=${candidate.evidence.evidence.exactName} baseName=${candidate.evidence.evidence.fusionBaseName}`,
  );
});
hardiyFocusedCandidates.forEach((candidate) => {
  console.log(
    `  focused=${candidate.oldName ?? candidate.oldIdentifier} ${candidate.oldIdentifier} Lv${candidate.oldLevel ?? "n/a"} rejected=${candidate.rejected} reasons=${candidate.rejectReasons.join("|") || "none"} level=${candidate.evidence.levelConsistent} progression=${candidate.evidence.levelProgression.category} rawGain=${candidate.evidence.levelProgression.rawLevelGain ?? "n/a"} comp=${candidate.evidence.levelProgression.fusionCompensation ?? "n/a"} adjusted=${candidate.evidence.levelProgression.adjustedLevelGain ?? "n/a"} base=${candidate.evidence.baseAttributesConsistent} fortress=${candidate.evidence.fortressContinuity} pets=${candidate.evidence.petContinuity} exact=${candidate.evidence.exactName} baseName=${candidate.evidence.fusionBaseName}`,
  );
});
hardiyLevelRegressionCandidates.slice(0, 10).forEach((candidate) => {
  console.log(
    `  levelRegression=${candidate.oldName ?? candidate.oldIdentifier} ${candidate.oldIdentifier} Lv${candidate.oldLevel ?? "n/a"} reasons=${candidate.rejectReasons.join("|") || "none"}`,
  );
});
makio?.candidates.slice(0, 10).forEach((candidate) => {
  if (candidate.entityType !== "player") return;
  console.log(
    `  candidate=${candidate.historicalIdentifier} selected=${makio.readyCandidateIdentifier === candidate.historicalIdentifier} rejected=${candidate.rejected} class=${candidate.evidence.evidence.sameClass} level=${candidate.evidence.evidence.levelConsistent} progression=${candidate.evidence.evidence.levelProgression.category} base=${candidate.evidence.evidence.baseAttributesConsistent} fortress=${candidate.evidence.evidence.fortressContinuity} pets=${candidate.evidence.evidence.petContinuity} exact=${candidate.evidence.evidence.exactName} baseName=${candidate.evidence.evidence.fusionBaseName} reasons=${candidate.evidence.rejectReasons.join("|") || "none"}`,
  );
});
zachi?.candidates.slice(0, 10).forEach((candidate) => {
  if (candidate.entityType !== "player") return;
  console.log(
    `  zachiCandidate=${candidate.historicalIdentifier} selected=${zachi.readyCandidateIdentifier === candidate.historicalIdentifier} rejected=${candidate.rejected} assignedElsewhere=${candidate.assignedToOtherIdentity} ready=${candidate.ready} class=${candidate.evidence.evidence.sameClass} level=${candidate.evidence.evidence.levelConsistent} progression=${candidate.evidence.evidence.levelProgression.category} base=${candidate.evidence.evidence.baseAttributesConsistent} fortress=${candidate.evidence.evidence.fortressContinuity} pets=${candidate.evidence.evidence.petContinuity} exact=${candidate.evidence.evidence.exactName} baseName=${candidate.evidence.evidence.fusionBaseName} reasons=${candidate.evidence.rejectReasons.join("|") || "none"}`,
  );
});
console.log("Semantic differentiation cases:");
semanticDifferentiated.forEach((item) => {
  const ready = item.candidates.find((candidate) => candidate.ready);
  console.log(
    `- ${item.currentName ?? item.currentIdentifier}: current=${item.currentIdentifier} ready=${ready?.historicalIdentifier ?? "missing"} observations=${item.observations.length}`,
  );
});
console.log("History-aware cases:");
historyCases.forEach((item) => {
  console.log(
    `- ${item.currentName ?? item.currentIdentifier}: current=${item.currentIdentifier} status=${item.status} ready=${item.readyCandidateIdentifier ?? "missing"} observations=${item.observations.length}`,
  );
});
assert.ok(mika, "expected Mika in global player pool");
assert.ok(aleendar, "expected Aleendar in global player pool");
assert.ok(makio, "expected Makio in global player pool");
assert.ok(zachi, "expected Zachi in global player pool");
assert.ok(luzie, "expected Luzie in global player pool");
assert.equal(makio.status, "ready");
assert.equal(makio.readyCandidateIdentifier, "s3_eu_p53199");
assert.equal(zachi.status, "ready");
assert.equal(zachi.readyCandidateIdentifier, "s3_eu_p130868");
assert.equal(luzie.status, "review");
assert.ok(luzie.candidates.length > 0, "Luzie should keep actionable candidates when they exist");
assert.equal(
  luzie.candidates.some((candidate) => normalizeKey(candidate.historicalIdentifier) === "s2_eu_p177952"),
  false,
  "Luzie should not show weak Darth Monk as an actionable historical identity",
);
assert.equal(
  luzie.candidates.some((candidate) => candidate.entityType === "player" && candidate.evidence.classification === "weak"),
  false,
  "Luzie should not show weak player candidates as actionable historical identities",
);
assert.ok(semanticDifferentiated.length > 0, "expected semantic differentiation examples");
assert.ok(historyCases.length >= 6, "expected at least six history-aware player cases");
assert.equal(mika.status, "ready");
assert.ok(mika.readyCandidateIdentifier, "Mika should have a ready historical identity");
assert.equal(
  aleendar.candidates.some((candidate) => normalizeKey(candidate.historicalIdentifier) === normalizeKey(mika.readyCandidateIdentifier)),
  false,
  "Aleendar should not list Mika's reserved historical identity",
);

assert.ok(playerItems.length > 0, "expected post-fusion players");
assert.ok(guildItems.length > 0, "expected post-fusion guilds");
assert.ok(guildItems.some((item) => item.currentName === "Magic Mushrooms"), "expected Magic Mushrooms in global guild pool");
assert.ok(guildItems.some((item) => item.currentName === "Erben im Wandel"), "expected Erben im Wandel in global guild pool");
assert.ok(guildItems.some((item) => item.currentName === "Legion Z"), "expected Legion Z in global guild pool");

await playerStore.close();
await guildStore.close();
await deleteDB(`fusion-real-player-${suffix}`);
await deleteDB(`fusion-real-guild-${suffix}`);

console.log("fusionIdentityManagement real scan regression passed");
