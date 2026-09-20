import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { deleteDB } from "idb";

import { normalizeGuildScanMembers } from "../../src/lib/guilds/guildScanNormalizer.ts";
import type { GuildHubLogicalScanSnapshot } from "../../src/lib/guilds/localScanLibrary.ts";
import {
  buildFusionIdentityManagementReportFromSnapshots,
  type FusionIdentityCandidate,
  type FusionIdentityManagementItem,
} from "../../src/lib/identities/fusionIdentityManagement.ts";
import { createGuildIdentityStore } from "../../src/lib/identities/guildIdentityStore.ts";
import { createPlayerIdentityStore } from "../../src/lib/identities/playerIdentityStore.ts";
import { createFusionIdentityObservations } from "../../src/lib/identities/playerFusionPreviewAdapter.ts";
import {
  resolvePlayerFusions,
  selectPlayerFusionReadyCandidates,
  type PlayerFusionCandidate,
  type PlayerFusionObservation,
  type PlayerFusionPlayerResult,
} from "../../src/lib/identities/playerFusionResolver.ts";
import { resolveServer } from "../../src/lib/servers/serverResolver.ts";

type JsonRecord = Record<string, unknown>;

type Boundary = {
  preTimestamp: number | null;
  preLevel: number | null;
  postTimestamp: number | null;
  postLevel: number | null;
  elapsedDays: number | null;
  gain: number | null;
  gainPerDay: number | null;
  levelRegression: boolean | null;
};

type PositiveControl = Boundary & {
  currentIdentifier: string;
  currentName: string | null;
  historicalIdentifier: string;
  historicalName: string | null;
};

const DEFAULT_SCAN_ROOT = "D:/SFDataHub/Guild Analytics/public/scans";
const REPORT_PATH = path.resolve("tools/identities/hardiy-assignment-level-progression.latest.txt");
const ORIGIN_SERVER_CODES = new Set(["EU1", "EU2", "EU3", "EU4"]);
const TARGET_SERVER_CODE = "F28";
const HARDIY_CURRENT_IDENTIFIER = "f28_net_p4809";
const HARDIYDK_HISTORICAL_IDENTIFIER = "s1_eu_p7344";
const FOCUSED_HARDIY_NAMES = new Set(["darth monk", "hardiydk", "matti", "rover", "svenner1986"]);

const fullReportLines: string[] = [];
const originalConsoleLog = console.log.bind(console);
const shouldEchoLine = (line: string) =>
  line.startsWith("#") ||
  line.startsWith("Scans=") ||
  line.startsWith("Identity store") ||
  line.startsWith("Hardiy current=") ||
  line.startsWith("generated=") ||
  line.startsWith("managementReasons=") ||
  line.startsWith("historical alias:") ||
  line.startsWith("readyReservationOwners=") ||
  line.startsWith("rootCause=") ||
  line.startsWith("postReservation") ||
  line.startsWith("assignmentOrderAssessment=") ||
  line.startsWith("persistedLinksOrExclusions") ||
  line.startsWith("gain") ||
  line.startsWith("bucket ") ||
  line.startsWith("falseCandidates=") ||
  line.startsWith("extreme ") ||
  line.startsWith("No product") ||
  line.startsWith("- ") ||
  line.startsWith("claimant ") && line.includes("viable=true");

console.log = (...args: unknown[]) => {
  const line = args.map((arg) => String(arg)).join(" ");
  fullReportLines.push(line);
  if (shouldEchoLine(line)) originalConsoleLog(line);
};

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

const normalizeKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeText = (value: unknown) =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ");

const resolveServerCode = (value: unknown) => resolveServer(String(value ?? ""))?.code ?? null;

const formatDate = (timestamp: number | null) => timestamp == null ? "missing" : new Date(timestamp).toISOString();
const formatNumber = (value: number | null | undefined, digits = 2) => value == null ? "n/a" : value.toFixed(digits);
const formatEvidence = (value: boolean | null, hard = false) => {
  if (value === true) return "positive";
  if (value === false) return hard ? "hard-contradiction" : "contradiction";
  return "unavailable";
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

const groupByIdentifier = (observations: PlayerFusionObservation[]) => {
  const grouped = new Map<string, PlayerFusionObservation[]>();
  observations.forEach((observation) => {
    const key = normalizeKey(observation.identifier);
    if (!key) return;
    grouped.set(key, [...(grouped.get(key) ?? []), observation]);
  });
  return grouped;
};

const isReliableLevel = (observation: PlayerFusionObservation) =>
  typeof observation.level === "number" &&
  Number.isFinite(observation.level) &&
  observation.level > 0 &&
  (observation.levelAvailability == null || observation.levelAvailability === "available");

const boundaryFor = (
  candidate: PlayerFusionCandidate,
  currentResult: PlayerFusionPlayerResult,
  historicalByIdentifier: Map<string, PlayerFusionObservation[]>,
  currentByIdentifier: Map<string, PlayerFusionObservation[]>,
): Boundary => {
  const currentObservations = currentByIdentifier.get(normalizeKey(currentResult.newIdentifier)) ?? [];
  const post = [...currentObservations].sort((left, right) => left.timestamp - right.timestamp).find(isReliableLevel) ?? null;
  const historicalObservations = historicalByIdentifier.get(normalizeKey(candidate.oldIdentifier)) ?? [];
  const historicalBeforePost = post
    ? historicalObservations.filter((observation) => observation.timestamp < post.timestamp)
    : historicalObservations;
  const pre = [...(historicalBeforePost.length ? historicalBeforePost : historicalObservations)]
    .filter(isReliableLevel)
    .sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;

  const elapsedDays =
    pre && post ? Math.max(0, (post.timestamp - pre.timestamp) / (24 * 60 * 60 * 1000)) : null;
  const gain = pre?.level != null && post?.level != null ? post.level - pre.level : null;
  const gainPerDay = gain != null && elapsedDays != null && elapsedDays > 0 ? gain / elapsedDays : null;

  return {
    preTimestamp: pre?.timestamp ?? null,
    preLevel: pre?.level ?? null,
    postTimestamp: post?.timestamp ?? null,
    postLevel: post?.level ?? null,
    elapsedDays,
    gain,
    gainPerDay,
    levelRegression: gain == null ? null : gain < 0,
  };
};

const bucketForLevel = (level: number | null) => {
  if (level == null) return "unknown";
  if (level >= 500) return "500+";
  const start = Math.floor(level / 100) * 100;
  return `${start}-${start + 99}`;
};

const quantile = (values: number[], p: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))] ?? null;
};

const statsFor = (values: number[]) => ({
  count: values.length,
  min: values.length ? Math.min(...values) : null,
  median: quantile(values, 50),
  p90: quantile(values, 90),
  p95: quantile(values, 95),
  p99: quantile(values, 99),
  max: values.length ? Math.max(...values) : null,
});

const percentileRank = (values: number[], value: number | null) => {
  if (value == null || !values.length) return null;
  const belowOrEqual = values.filter((entry) => entry <= value).length;
  return (belowOrEqual / values.length) * 100;
};

const displayCandidateSort = (left: PlayerFusionCandidate, right: PlayerFusionCandidate) =>
  Number(right.evidence.exactName || right.evidence.fusionBaseName) -
    Number(left.evidence.exactName || left.evidence.fusionBaseName) ||
  Number(right.evidence.sameGuild === true) - Number(left.evidence.sameGuild === true) ||
  Number(right.evidence.baseAttributesConsistent === true) - Number(left.evidence.baseAttributesConsistent === true) ||
  Number(right.evidence.sameClass === true) - Number(left.evidence.sameClass === true) ||
  (right.oldLevel ?? 0) - (left.oldLevel ?? 0) ||
  left.oldIdentifier.localeCompare(right.oldIdentifier, undefined, { numeric: true, sensitivity: "base" });

const displayCandidatesFor = (candidates: PlayerFusionCandidate[]) =>
  [...candidates]
    .filter(
      (candidate) =>
        !candidate.rejectReasons.includes("level-regression") &&
        (!candidate.rejected || candidate.evidence.exactName || candidate.evidence.fusionBaseName),
    )
    .sort(displayCandidateSort)
    .slice(0, 25);

const itemForResult = (items: FusionIdentityManagementItem[], result: PlayerFusionPlayerResult) =>
  items.find((item) => normalizeKey(item.currentIdentifier) === normalizeKey(result.newIdentifier)) ?? null;

const managementCandidateFor = (item: FusionIdentityManagementItem | null, historicalIdentifier: string) =>
  item?.candidates.find((candidate) => normalizeKey(candidate.historicalIdentifier) === normalizeKey(historicalIdentifier)) ?? null;

const printCandidateLine = (
  prefix: string,
  candidate: PlayerFusionCandidate,
  boundary: Boundary,
  managementCandidate: FusionIdentityCandidate | null,
) => {
  console.log(
    `${prefix}${candidate.oldName ?? "unknown"} ${candidate.oldIdentifier} server=${candidate.oldServer ?? "unknown"} class=${candidate.oldClassId ?? "unknown"} ` +
      `resolverRejected=${candidate.rejected} viable=${!candidate.rejected} display=${Boolean(managementCandidate)} ` +
      `assignedElsewhere=${managementCandidate?.assignedToOtherIdentity ?? false} ready=${managementCandidate?.ready ?? false} ` +
      `pre=${boundary.preLevel ?? "n/a"}@${formatDate(boundary.preTimestamp)} post=${boundary.postLevel ?? "n/a"}@${formatDate(boundary.postTimestamp)} ` +
      `gain=${boundary.gain ?? "n/a"} days=${formatNumber(boundary.elapsedDays)} gainPerDay=${formatNumber(boundary.gainPerDay, 3)} regression=${boundary.levelRegression ?? "n/a"} ` +
      `evidence exact=${formatEvidence(candidate.evidence.exactName)} baseName=${formatEvidence(candidate.evidence.fusionBaseName)} ` +
      `origin=${formatEvidence(candidate.evidence.originMatches, candidate.rejectReasons.includes("origin-mismatch"))} ` +
      `class=${formatEvidence(candidate.evidence.sameClass, candidate.rejectReasons.includes("different-class"))} ` +
      `level=${formatEvidence(candidate.evidence.levelConsistent, candidate.rejectReasons.includes("level-regression"))} ` +
      `base=${formatEvidence(
        candidate.evidence.baseAttributesConsistent,
        candidate.rejectReasons.includes("base-stat-regression") || candidate.rejectReasons.includes("base-attributes-contradiction"),
      )} ` +
      `fortress=${formatEvidence(candidate.evidence.fortressContinuity)} pets=${formatEvidence(candidate.evidence.petContinuity)} ` +
      `guild=${candidate.evidence.sameGuild == null ? "unavailable" : candidate.evidence.sameGuild ? "positive" : "contradiction"} ` +
      `reasons=${candidate.rejectReasons.join("|") || "none"}`,
  );
};

const scanRoot = process.argv[2] ?? DEFAULT_SCAN_ROOT;
const snapshots = listJsonFiles(scanRoot)
  .map(readSnapshot)
  .filter((snapshot): snapshot is GuildHubLogicalScanSnapshot => Boolean(snapshot))
  .sort((left, right) => left.timestampMs - right.timestampMs);

assert.ok(snapshots.length > 0, "expected real scan snapshots");

const allPlayerObservations = snapshots.flatMap(createFusionIdentityObservations);
const historicalPlayerObservations = allPlayerObservations.filter((observation) =>
  ORIGIN_SERVER_CODES.has(resolveServerCode(observation.server) ?? ""),
);
const currentPlayerObservations = allPlayerObservations.filter(
  (observation) => resolveServerCode(observation.server) === TARGET_SERVER_CODE,
);
const historicalByIdentifier = groupByIdentifier(historicalPlayerObservations);
const currentByIdentifier = groupByIdentifier(currentPlayerObservations);
const resolverResults = resolvePlayerFusions({
  historicalObservations: historicalPlayerObservations,
  newObservations: currentPlayerObservations,
}).results;

const suffix = Date.now();
const playerDb = `hardiy-analysis-player-${suffix}`;
const guildDb = `hardiy-analysis-guild-${suffix}`;
const playerStore = createPlayerIdentityStore({ dbName: playerDb });
const guildStore = createGuildIdentityStore({ dbName: guildDb });

const report = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });
const playerItems = report.items.filter((item) => item.entityType === "player");
const playerEntities = await playerStore.listPlayerEntities();
const playerExclusions = await playerStore.listPlayerExclusions();

const hardiyResult = resolverResults.find((result) => normalizeKey(result.newIdentifier) === HARDIY_CURRENT_IDENTIFIER);
assert.ok(hardiyResult, "expected Hardiy resolver result");
const hardiyItem = itemForResult(playerItems, hardiyResult);
assert.ok(hardiyItem, "expected Hardiy management item");

const hardiyDisplayKeys = new Set(displayCandidatesFor(hardiyResult.candidates).map((candidate) => normalizeKey(candidate.oldIdentifier)));
const hardiyManagementKeys = new Set(hardiyItem.candidates.map((candidate) => normalizeKey(candidate.historicalIdentifier)));
const hardiyViable = hardiyResult.candidates.filter((candidate) => !candidate.rejected);

console.log("# Hardiy Assignment And Level Progression Analysis");
console.log(`Scans=${snapshots.length} historicalObservations=${historicalPlayerObservations.length} currentObservations=${currentPlayerObservations.length}`);
console.log(`Identity store check: playerEntities=${playerEntities.length} playerExclusions=${playerExclusions.length}`);

console.log("\n## A1 Hardiy resolver vs display vs global");
console.log(
  `Hardiy current=${hardiyItem.currentIdentifier} name=${hardiyItem.currentName ?? "unknown"} resolverStatus=${hardiyResult.status} ` +
    `managementStatus=${hardiyItem.status} reasonCodes=${hardiyItem.reasonCodes.join("|") || "none"} readyWinner=${hardiyItem.readyCandidateIdentifier ?? "none"}`,
);
console.log(
  `generated=${hardiyResult.candidates.length} viable=${hardiyViable.length} displayBeforeReservation=${hardiyDisplayKeys.size} ` +
    `displayAfterReservation=${hardiyItem.candidates.length} reservedAway=${[...hardiyDisplayKeys].filter((key) => !hardiyManagementKeys.has(key)).length}`,
);
console.log(`managementReasons=${hardiyItem.reasons.join("; ") || "none"}`);

console.log("\n## A2 Hardiy all generated candidates");
hardiyResult.candidates.forEach((candidate, index) => {
  const boundary = boundaryFor(candidate, hardiyResult, historicalByIdentifier, currentByIdentifier);
  printCandidateLine(
    `${index + 1}. `,
    candidate,
    boundary,
    managementCandidateFor(hardiyItem, candidate.oldIdentifier),
  );
});

console.log("\n## A3 Hardiy focused candidates");
hardiyResult.candidates
  .filter((candidate) => FOCUSED_HARDIY_NAMES.has(normalizeText(candidate.oldName)))
  .forEach((candidate) => {
    const boundary = boundaryFor(candidate, hardiyResult, historicalByIdentifier, currentByIdentifier);
    printCandidateLine("- ", candidate, boundary, managementCandidateFor(hardiyItem, candidate.oldIdentifier));
  });

const readyReservationOwnersByHistorical = new Map<string, FusionIdentityManagementItem[]>();
playerItems.forEach((item) => {
  if (item.status !== "ready" || !item.readyCandidateIdentifier) return;
  const key = normalizeKey(item.readyCandidateIdentifier);
  readyReservationOwnersByHistorical.set(key, [...(readyReservationOwnersByHistorical.get(key) ?? []), item]);
});

console.log("\n## A4 HardiyDK claim chain");
const hardiyDkClaimants = resolverResults
  .map((result) => {
    const candidate = result.candidates.find((entry) => normalizeKey(entry.oldIdentifier) === HARDIYDK_HISTORICAL_IDENTIFIER);
    if (!candidate) return null;
    const item = itemForResult(playerItems, result);
    const readyCandidate = selectPlayerFusionReadyCandidates(result)[0] ?? null;
    return { result, candidate, item, readyCandidate };
  })
  .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
console.log(`historical alias: ${HARDIYDK_HISTORICAL_IDENTIFIER}`);
console.log(`readyReservationOwners=${(readyReservationOwnersByHistorical.get(HARDIYDK_HISTORICAL_IDENTIFIER) ?? []).map((item) => `${item.currentName ?? item.currentIdentifier}/${item.currentIdentifier}`).join(", ") || "none"}`);
hardiyDkClaimants.forEach((entry, index) => {
  const boundary = boundaryFor(entry.candidate, entry.result, historicalByIdentifier, currentByIdentifier);
  const managementCandidate = managementCandidateFor(entry.item, entry.candidate.oldIdentifier);
  console.log(
    `claimant ${index + 1}: current=${entry.result.newIdentifier} name=${entry.item?.currentName ?? "unknown"} ` +
      `resolverStatus=${entry.result.status} managementStatus=${entry.item?.status ?? "missing"} ` +
      `generated=yes viable=${!entry.candidate.rejected} display=${Boolean(managementCandidate)} ` +
      `resolverReadyWinner=${entry.readyCandidate?.oldIdentifier ?? "none"} readyEligibility=${entry.readyCandidate?.oldIdentifier === entry.candidate.oldIdentifier} ` +
      `finalReadyWinner=${entry.item?.readyCandidateIdentifier ?? "none"} losesByReservation=${!managementCandidate && !entry.candidate.rejected} ` +
      `pre=${boundary.preLevel ?? "n/a"} post=${boundary.postLevel ?? "n/a"} gain=${boundary.gain ?? "n/a"} days=${formatNumber(boundary.elapsedDays)} ` +
      `evidence origin=${formatEvidence(entry.candidate.evidence.originMatches)} class=${formatEvidence(entry.candidate.evidence.sameClass)} ` +
      `level=${formatEvidence(entry.candidate.evidence.levelConsistent)} base=${formatEvidence(entry.candidate.evidence.baseAttributesConsistent)} ` +
      `fortress=${formatEvidence(entry.candidate.evidence.fortressContinuity)} pets=${formatEvidence(entry.candidate.evidence.petContinuity)} ` +
      `exact=${formatEvidence(entry.candidate.evidence.exactName)} baseName=${formatEvidence(entry.candidate.evidence.fusionBaseName)}`,
  );
});

const hardiyDkOwners = readyReservationOwnersByHistorical.get(HARDIYDK_HISTORICAL_IDENTIFIER) ?? [];
const hardiyHasHardiyDk = hardiyDkClaimants.some((entry) => entry.result.newIdentifier === HARDIY_CURRENT_IDENTIFIER);
const hardiyDkHardiyClaim = hardiyDkClaimants.find((entry) => entry.result.newIdentifier === HARDIY_CURRENT_IDENTIFIER);
const hardiyViableAfterReservations = hardiyItem.candidates.filter((candidate) => !candidate.rejected && !candidate.assignedToOtherIdentity);
let rootCause = "E. other cause";
if (hardiyDkOwners.length > 1) rootCause = "A. echter Double Claim";
else if (hardiyDkOwners.length === 1 && hardiyDkOwners[0]?.currentIdentifier !== HARDIY_CURRENT_IDENTIFIER) rootCause = "B. falscher anderer Ready Claim oder zumindest anderer Ready-Claim reserviert HardiyDK";
else if (hardiyHasHardiyDk && hardiyDkHardiyClaim?.readyCandidate?.oldIdentifier !== HARDIYDK_HISTORICAL_IDENTIFIER && hardiyViable.length > 1) rootCause = "D. HardiyDK ist nicht der Resolver-Winner";
else if (hardiyItem.status !== "ready" && hardiyViableAfterReservations.length === 1) rootCause = "C. Reservation-Recompute-Bug";

console.log("\n## A5 Root cause");
console.log(`rootCause=${rootCause}`);
console.log(
  `postReservationViableDisplayCandidates=${hardiyViableAfterReservations.length} ` +
    `postReservationCandidates=${hardiyItem.candidates.map((candidate) => `${candidate.historicalName ?? candidate.historicalIdentifier}:${candidate.historicalIdentifier}`).join(", ") || "none"}`,
);
console.log(
  `assignmentOrderAssessment=ready candidates are grouped by historical identifier before reservations; non-colliding ready owners reserve their historical id globally. ` +
    `No evidence of first-processed winner for ${HARDIYDK_HISTORICAL_IDENTIFIER}; owner count=${hardiyDkOwners.length}.`,
);
console.log(`persistedLinksOrExclusionsInAnalysisStore=${playerEntities.length || playerExclusions.length ? "yes" : "no"}`);

const positiveControls: PositiveControl[] = playerItems.flatMap((item) => {
  if (item.status !== "ready" || !item.readyCandidateIdentifier) return [];
  const result = resolverResults.find((entry) => normalizeKey(entry.newIdentifier) === normalizeKey(item.currentIdentifier));
  const candidate = result?.candidates.find((entry) => normalizeKey(entry.oldIdentifier) === normalizeKey(item.readyCandidateIdentifier));
  if (!result || !candidate) return [];
  const boundary = boundaryFor(candidate, result, historicalByIdentifier, currentByIdentifier);
  if (boundary.gain == null || boundary.gainPerDay == null || boundary.elapsedDays == null) return [];
  return [{
    ...boundary,
    currentIdentifier: item.currentIdentifier,
    currentName: item.currentName,
    historicalIdentifier: candidate.oldIdentifier,
    historicalName: candidate.oldName,
  }];
});

const gains = positiveControls.map((entry) => entry.gain).filter((value): value is number => value != null);
const rates = positiveControls.map((entry) => entry.gainPerDay).filter((value): value is number => value != null);
const printStats = (label: string, values: number[], digits = 2) => {
  const stats = statsFor(values);
  console.log(
    `${label}: count=${stats.count} min=${formatNumber(stats.min, digits)} median=${formatNumber(stats.median, digits)} ` +
      `p90=${formatNumber(stats.p90, digits)} p95=${formatNumber(stats.p95, digits)} p99=${formatNumber(stats.p99, digits)} max=${formatNumber(stats.max, digits)}`,
  );
};

console.log("\n## B1 Positive controls");
printStats("gain", gains, 0);
printStats("gainPerDay", rates, 3);

const buckets = [...new Set(positiveControls.map((entry) => bucketForLevel(entry.preLevel)))].sort((left, right) => {
  if (left === "500+") return 1;
  if (right === "500+") return -1;
  return Number(left.split("-")[0]) - Number(right.split("-")[0]);
});
console.log("\n## B2 Positive controls by starting level bucket");
buckets.forEach((bucket) => {
  const bucketControls = positiveControls.filter((entry) => bucketForLevel(entry.preLevel) === bucket);
  printStats(
    `bucket ${bucket} gain`,
    bucketControls.map((entry) => entry.gain).filter((value): value is number => value != null),
    0,
  );
  printStats(
    `bucket ${bucket} gainPerDay`,
    bucketControls.map((entry) => entry.gainPerDay).filter((value): value is number => value != null),
    3,
  );
});

const valuesForBucket = (bucket: string, selector: (entry: PositiveControl) => number | null) => {
  const bucketValues = positiveControls
    .filter((entry) => bucketForLevel(entry.preLevel) === bucket)
    .map(selector)
    .filter((value): value is number => value != null);
  return bucketValues.length >= 10 ? bucketValues : positiveControls.map(selector).filter((value): value is number => value != null);
};

console.log("\n## B3 Hardiy candidates vs positive controls");
hardiyResult.candidates
  .filter((candidate) => !candidate.rejected || FOCUSED_HARDIY_NAMES.has(normalizeText(candidate.oldName)))
  .sort(displayCandidateSort)
  .forEach((candidate) => {
    const boundary = boundaryFor(candidate, hardiyResult, historicalByIdentifier, currentByIdentifier);
    const bucket = bucketForLevel(boundary.preLevel);
    const bucketGains = valuesForBucket(bucket, (entry) => entry.gain);
    const bucketRates = valuesForBucket(bucket, (entry) => entry.gainPerDay);
    console.log(
      `${candidate.oldName ?? candidate.oldIdentifier} ${candidate.oldIdentifier}: pre=${boundary.preLevel ?? "n/a"} post=${boundary.postLevel ?? "n/a"} ` +
        `days=${formatNumber(boundary.elapsedDays)} gain=${boundary.gain ?? "n/a"} gainPerDay=${formatNumber(boundary.gainPerDay, 3)} ` +
        `bucket=${bucket} gainPercentile=${formatNumber(percentileRank(bucketGains, boundary.gain), 1)} ` +
        `ratePercentile=${formatNumber(percentileRank(bucketRates, boundary.gainPerDay), 1)} viable=${!candidate.rejected}`,
    );
  });

const falseCandidates = playerItems
  .filter((item) => item.status === "review")
  .flatMap((item) => {
    const result = resolverResults.find((entry) => normalizeKey(entry.newIdentifier) === normalizeKey(item.currentIdentifier));
    if (!result) return [];
    const ready = selectPlayerFusionReadyCandidates(result)[0] ?? null;
    return result.candidates
      .filter((candidate) => !candidate.rejected && normalizeKey(candidate.oldIdentifier) !== normalizeKey(ready?.oldIdentifier))
      .map((candidate) => ({
        item,
        candidate,
        boundary: boundaryFor(candidate, result, historicalByIdentifier, currentByIdentifier),
      }));
  })
  .filter((entry) => entry.boundary.gain != null && entry.boundary.gainPerDay != null);

const classifyAgainstControls = (boundary: Boundary) => {
  const bucket = bucketForLevel(boundary.preLevel);
  const bucketGains = valuesForBucket(bucket, (entry) => entry.gain);
  const bucketRates = valuesForBucket(bucket, (entry) => entry.gainPerDay);
  const maxGain = Math.max(...bucketGains);
  const maxRate = Math.max(...bucketRates);
  const p99Gain = quantile(bucketGains, 99) ?? maxGain;
  const p99Rate = quantile(bucketRates, 99) ?? maxRate;
  if ((boundary.gain ?? 0) > maxGain || (boundary.gainPerDay ?? 0) > maxRate) return "extreme";
  if ((boundary.gain ?? 0) <= p99Gain && (boundary.gainPerDay ?? 0) <= p99Rate) return "plausible";
  return "above-p99";
};

const falseControlCounts = falseCandidates.reduce(
  (counts, entry) => {
    const classification = classifyAgainstControls(entry.boundary);
    counts[classification] += 1;
    return counts;
  },
  { plausible: 0, "above-p99": 0, extreme: 0 } as Record<"plausible" | "above-p99" | "extreme", number>,
);

console.log("\n## B4 Review-pool false-control diagnostics");
console.log(
  `falseCandidates=${falseCandidates.length} plausible=${falseControlCounts.plausible} aboveP99=${falseControlCounts["above-p99"]} extreme=${falseControlCounts.extreme}`,
);
falseCandidates
  .filter((entry) => classifyAgainstControls(entry.boundary) === "extreme")
  .sort((left, right) => (right.boundary.gainPerDay ?? 0) - (left.boundary.gainPerDay ?? 0))
  .slice(0, 12)
  .forEach((entry) => {
    console.log(
      `extreme ${entry.item.currentName ?? entry.item.currentIdentifier} -> ${entry.candidate.oldName ?? entry.candidate.oldIdentifier}: ` +
        `pre=${entry.boundary.preLevel ?? "n/a"} post=${entry.boundary.postLevel ?? "n/a"} days=${formatNumber(entry.boundary.elapsedDays)} ` +
        `gain=${entry.boundary.gain ?? "n/a"} gainPerDay=${formatNumber(entry.boundary.gainPerDay, 3)}`,
    );
  });

console.log("\n## Conclusion prompts");
console.log("No product rule was changed. This script reports evidence for deciding whether a later level-growth rule is safe.");

fs.writeFileSync(REPORT_PATH, `${fullReportLines.join("\n")}\n`, "utf8");
originalConsoleLog(`\nFull detailed report written to ${REPORT_PATH}`);

await playerStore.close();
await guildStore.close();
await deleteDB(playerDb);
await deleteDB(guildDb);
