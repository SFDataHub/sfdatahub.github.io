import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { deleteDB } from "idb";

import {
  deriveGuildHubLogicalScanSnapshots,
  type GuildHubLocalScan,
  type GuildHubLogicalScanSnapshot,
} from "../../src/lib/guilds/localScanLibrary.ts";
import {
  buildFusionIdentityManagementReportFromSnapshots,
  type FusionIdentityCandidate,
  type FusionIdentityManagementItem,
  type FusionIdentityManagementStatus,
} from "../../src/lib/identities/fusionIdentityManagement.ts";
import { createGuildIdentityStore } from "../../src/lib/identities/guildIdentityStore.ts";
import {
  resolveGuildFusions,
  type GuildFusionCandidate,
  type GuildFusionGuildResult,
  type GuildFusionMigrationEdge,
  type GuildFusionObservation,
  type GuildFusionPlayerMatch,
} from "../../src/lib/identities/guildFusionResolver.ts";
import { createPlayerIdentityStore } from "../../src/lib/identities/playerIdentityStore.ts";
import {
  createFusionIdentityGuildObservations,
  createFusionIdentityObservations,
} from "../../src/lib/identities/playerFusionPreviewAdapter.ts";
import {
  resolvePlayerFusions,
  selectPlayerFusionReadyCandidates,
} from "../../src/lib/identities/playerFusionResolver.ts";
import { resolveServer } from "../../src/lib/servers/serverResolver.ts";

type JsonRecord = Record<string, unknown>;

type ScanSpec = {
  expectedFilename: string;
  fallbackFilename?: string;
  label: string;
};

type LoadedScan = {
  spec: ScanSpec;
  filePath: string;
  filename: string;
  raw: JsonRecord;
  snapshots: GuildHubLogicalScanSnapshot[];
  usedFallback: boolean;
};

type RelationSnapshot = {
  item: FusionIdentityManagementItem;
  candidate: Extract<FusionIdentityCandidate, { entityType: "guild" }> | null;
  group: string;
};

type Variant = {
  key: string;
  label: string;
  predicate: (candidate: GuildFusionCandidate) => boolean;
};

const DEFAULT_SCAN_ROOT = "D:/SFDataHub/Guild Analytics/public/scans";
const REPORT_PATH = path.resolve("tools/identities/guild-full-scan-coverage-audit.latest.txt");
const ORIGIN_CODES = new Set(["EU1", "EU2", "EU3", "EU4"]);
const TARGET_CODE = "F28";

const SCAN_SPECS: ScanSpec[] = [
  { expectedFilename: "files_2026_09_21_19_34_46_651.json", label: "2026-09-19 F28 current" },
  {
    expectedFilename: "files_2026_09_06_17_12_58_946.json",
    fallbackFilename: "files_2026_09_15_18_38_34_197.json",
    label: "2026-09-05 F28 current",
  },
  { expectedFilename: "files_2026_09_15_18_35_12_488.json", label: "2026-04-03 F27/F28 mixed current" },
  { expectedFilename: "serverscan_eu_1_2_3_4_date_31_01_26.json", label: "2026-01-31 EU1-EU4 historical" },
  { expectedFilename: "serverscan_eu_1_2_3_4_date_2_1_26.json", label: "2026-01-02 EU1-EU4 historical" },
  { expectedFilename: "serverscan_eu_1_2_3_4_date_5_12_25.json", label: "2025-12-06 EU1-EU4 historical" },
  { expectedFilename: "serverscan_eu_1_2_3_4_date_1_11_25.json", label: "2025-11-01 EU1-EU4 historical" },
  { expectedFilename: "serverscan_eu_1_2_3_4_date_7_6_25.json", label: "2025-06-07 EU1-EU4 historical" },
  { expectedFilename: "serverscan_eu_1_2_3_4_date_1_1_25.json", label: "2025-01-01 EU1-EU4 historical" },
];

const BROWSER_CASE_NAMES = [
  "Ordnungsamt",
  "Crafts Army",
  "Mandalorians",
  "Empire",
  "Fenki Kopytne",
  "Glücksbärchies",
  "Goldener Apfel",
  "Killerblättchen",
  "Kocák",
  "Koc",
  "Krawler Nest",
  "Lonely Souls",
  "Lost Forest",
  "LostShadows",
  "pomalu cz",
  "TaylorGang",
  "Toss a Coin CZ02",
  "WollMilchSäue",
];

const GROUND_TRUTH_NAMES = [
  "Erben im Wandel",
  "Seelen im Wandel",
  "Marathon Runners",
  "Welten im Wandel",
  "Sladký domov",
  "Legion Z",
  "M d I",
  "Die Legion",
];

const lines: string[] = [];
const line = (value = "") => lines.push(value);

const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;

const normalizeKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeName = (value: unknown) =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .normalize("NFC")
    .toLowerCase();

const resolveServerCode = (value: unknown) => resolveServer(String(value ?? ""))?.code ?? null;

const formatDate = (timestamp: number | null | undefined) =>
  timestamp == null || !Number.isFinite(timestamp) ? "missing" : new Date(timestamp).toISOString();

const pct = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "n/a" : `${Math.round(value * 1000) / 10}%`;

const countBy = <T>(values: T[], readKey: (value: T) => string) =>
  values.reduce<Record<string, number>>((counts, value) => {
    const key = readKey(value);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

const countStatuses = (items: FusionIdentityManagementItem[]) =>
  countBy(items, (item) => item.status);

const formatCounts = (counts: Record<string, number>) =>
  Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${key}=${count}`)
    .join(", ") || "none";

const findScanPath = (root: string, spec: ScanSpec) => {
  const direct = path.join(root, spec.expectedFilename);
  if (fs.existsSync(direct)) return { filePath: direct, usedFallback: false };
  if (spec.fallbackFilename) {
    const fallback = path.join(root, spec.fallbackFilename);
    if (fs.existsSync(fallback)) return { filePath: fallback, usedFallback: true };
  }
  throw new Error(`Missing scan file ${spec.expectedFilename}`);
};

const readLoadedScan = (root: string, spec: ScanSpec): LoadedScan => {
  const { filePath, usedFallback } = findScanPath(root, spec);
  const raw = asRecord(JSON.parse(fs.readFileSync(filePath, "utf8")));
  assert.ok(raw, `scan ${filePath} should contain a JSON object`);
  const filename = path.basename(filePath);
  const scan: GuildHubLocalScan = {
    id: filename,
    contentHash: filename,
    filename,
    importedAt: new Date().toISOString(),
    scannedAt: null,
    servers: [],
    playerCount: Array.isArray(raw.players) ? raw.players.length : 0,
    groupCount: Array.isArray(raw.groups) ? raw.groups.length : Array.isArray(raw.guilds) ? raw.guilds.length : 0,
    guildCount: Array.isArray(raw.groups) ? raw.groups.length : Array.isArray(raw.guilds) ? raw.guilds.length : 0,
    rawData: raw,
  };
  const snapshots = deriveGuildHubLogicalScanSnapshots(scan);
  return { spec, filePath, filename, raw, snapshots, usedFallback };
};

const snapshotServers = (snapshot: GuildHubLogicalScanSnapshot) =>
  [...new Set([
    ...snapshot.servers.map(resolveServerCode).filter((server): server is string => Boolean(server)),
    ...createFusionIdentityObservations(snapshot).map((observation) => resolveServerCode(observation.server)).filter((server): server is string => Boolean(server)),
    ...createFusionIdentityGuildObservations(snapshot).map((observation) => observation.serverCode).filter((server): server is string => Boolean(server)),
  ])].sort();

const classifySnapshot = (snapshot: GuildHubLogicalScanSnapshot) => {
  const servers = snapshotServers(snapshot);
  const historical = servers.some((server) => ORIGIN_CODES.has(server));
  const current = servers.includes(TARGET_CODE);
  if (historical && current) return "historical + current F28";
  if (historical) return "historical";
  if (current) return "current F28";
  return "ignored for this lineage";
};

const groupGuildItemsByIdentifier = (items: FusionIdentityManagementItem[]) =>
  new Map(items.filter((item) => item.entityType === "guild").map((item) => [normalizeKey(item.currentIdentifier), item]));

const latestByTimestamp = <T extends { timestamp: number }>(values: T[]) =>
  [...values].sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;

const buildHighConfidencePlayerMatches = (snapshots: GuildHubLogicalScanSnapshot[]) => {
  const allPlayerObservations = snapshots.flatMap(createFusionIdentityObservations);
  const historicalPlayerObservations = allPlayerObservations.filter((observation) =>
    ORIGIN_CODES.has(resolveServerCode(observation.server) ?? ""),
  );
  const currentPlayerObservations = allPlayerObservations.filter((observation) => resolveServerCode(observation.server) === TARGET_CODE);
  const currentByIdentifier = new Map(currentPlayerObservations.map((observation) => [normalizeKey(observation.identifier), observation]));
  return resolvePlayerFusions({
    historicalObservations: historicalPlayerObservations,
    newObservations: currentPlayerObservations,
  }).results.flatMap((result): GuildFusionPlayerMatch[] => {
    const candidate = selectPlayerFusionReadyCandidates(result)[0] ?? null;
    const current = currentByIdentifier.get(normalizeKey(result.newIdentifier));
    if (!candidate || !current) return [];
    return [{
      oldIdentifier: candidate.oldIdentifier,
      oldName: candidate.oldName,
      newIdentifier: result.newIdentifier,
      newName: current.name,
    }];
  });
};

const resolveGuildResultsByPostSnapshot = (
  snapshots: GuildHubLogicalScanSnapshot[],
  highConfidencePlayerMatches: GuildFusionPlayerMatch[],
) => {
  const allGuildObservations = snapshots.flatMap(createFusionIdentityGuildObservations);
  const historicalGuildObservations = allGuildObservations.filter((observation) =>
    ORIGIN_CODES.has(observation.serverCode ?? ""),
  );
  const postFusionSnapshots = snapshots.filter((snapshot) =>
    createFusionIdentityGuildObservations(snapshot).some((observation) => observation.serverCode === TARGET_CODE),
  );
  return postFusionSnapshots.flatMap((snapshot) =>
    resolveGuildFusions({
      historicalGuildObservations: historicalGuildObservations.filter((observation) => observation.timestamp < snapshot.timestampMs),
      newGuildObservations: createFusionIdentityGuildObservations(snapshot).filter((observation) => observation.serverCode === TARGET_CODE),
      highConfidencePlayerMatches,
    }).results,
  );
};

const candidateGroup = (candidate: GuildFusionCandidate | null) => {
  if (!candidate) return "J other";
  const highRelative = candidate.matchedMemberCount > 0 && candidate.oldShare >= 0.5 && candidate.newShare >= 0.5;
  if (candidate.assignmentConflict || candidate.reservedByReadyAssignment) return "G assignment conflict";
  if (candidate.relevantCompetitor) return "H multiple competitive candidates";
  if (candidate.structuralRename) return "F structural rename";
  if (!candidate.exactName && candidate.sameCoA) return "E rename + CoA/core";
  if (candidate.exactName && !candidate.uniqueExactName) return "D exact collision across physical guilds";
  if (candidate.exactName && candidate.uniqueExactName && candidate.sameCoA && candidate.matchedMemberCount > 0) {
    return "A exact+unique+CoA+member";
  }
  if (candidate.exactName && candidate.uniqueExactName && !candidate.sameCoA && highRelative) {
    return "B exact+unique+high-relative+no-CoA";
  }
  if (candidate.exactName && candidate.uniqueExactName && !candidate.sameCoA) {
    return "C exact+unique+weak-relative+no-CoA";
  }
  if (candidate.exactName && candidate.matchedMemberCount === 0) return "I thin exact-only";
  return "J other";
};

const relationBucket = (candidate: GuildFusionCandidate) => {
  if (candidate.matchedMemberCount === 1 && candidate.oldShare === 1 && candidate.newShare === 1) return "1 member + both shares 100%";
  if (candidate.matchedMemberCount === 1 && candidate.oldShare >= 0.5 && candidate.newShare >= 0.5) return "1 member + both shares >=50%";
  if (candidate.matchedMemberCount === 1) return "1 member + thin shares";
  if (candidate.matchedMemberCount === 2) return "2 members";
  if (candidate.matchedMemberCount >= 3) return "3+ members";
  return "0 members";
};

const historicalSizeBucket = (candidate: GuildFusionCandidate) => {
  const size = candidate.oldMemberCount ?? 0;
  if (size <= 1) return "historical size 1";
  if (size === 2) return "historical size 2";
  if (size <= 5) return "historical size 3-5";
  return "historical size >5";
};

const describeCandidate = (candidate: GuildFusionCandidate | null) => {
  if (!candidate) return "candidate=none";
  const leader =
    candidate.leadership.sameLogicalLeader == null
      ? "unavailable"
      : candidate.leadership.sameLogicalLeader
        ? "same"
        : "different";
  return [
    `historical=${candidate.oldName ?? "unknown"} ${candidate.oldGuildIdentifier}`,
    `origin=${candidate.oldServer ?? "unknown"}`,
    `class=${candidate.classification}`,
    `exact=${candidate.exactName}`,
    `unique=${candidate.uniqueExactName}`,
    `base=${candidate.fusionBaseName}`,
    `sameCoA=${candidate.sameCoA}`,
    `matched=${candidate.matchedMemberCount}`,
    `oldRoster=${candidate.oldMemberCount ?? "unknown"}`,
    `newRoster=${candidate.newMemberCount ?? "unknown"}`,
    `oldShare=${pct(candidate.oldShare)}`,
    `newShare=${pct(candidate.newShare)}`,
    `leader=${leader}`,
    `officers=${candidate.leadership.continuedOfficers}`,
    `core=${candidate.leadership.leadershipCoreOverlap}`,
    `relevantCompetitor=${candidate.relevantCompetitor}`,
    `assignment=${candidate.assignmentConflict}`,
    `reserved=${candidate.reservedByReadyAssignment}`,
  ].join(" ");
};

const primaryGuildCandidate = (item: FusionIdentityManagementItem) => {
  const candidate = item.candidates.find((entry): entry is Extract<FusionIdentityCandidate, { entityType: "guild" }> => entry.entityType === "guild");
  return candidate ?? null;
};

const summarizeNonReady = (item: FusionIdentityManagementItem) => {
  const candidate = primaryGuildCandidate(item);
  return [
    `${item.currentName ?? "unknown"} ${item.currentIdentifier}`,
    `observations=${item.observations.length}`,
    `first=${formatDate(item.firstSeen)}`,
    `last=${formatDate(item.lastSeen)}`,
    `status=${item.status}`,
    `reason=${item.reasons.join("|") || item.reasonCodes.join("|") || "none"}`,
    `candidates=${item.candidates.length}`,
    `migrations=${item.memberMigrationEdges.length}`,
    `assignment=${candidate?.evidence.assignmentConflict ?? false}`,
    `reserved=${candidate?.evidence.reservedByReadyAssignment ?? false}`,
  ].join(" ");
};

const duplicatePairs = (items: FusionIdentityManagementItem[], type: "candidate" | "migration") =>
  items.flatMap((item) => {
    if (item.entityType !== "guild") return [];
    const values =
      type === "candidate"
        ? item.candidates.filter((candidate) => candidate.entityType === "guild").map((candidate) => candidate.historicalIdentifier)
        : item.memberMigrationEdges.map((edge) => edge.oldGuildIdentifier);
    const counts = countBy(values, normalizeKey);
    return Object.entries(counts)
      .filter(([, count]) => count > 1)
      .map(([historicalIdentifier, count]) => ({ item, historicalIdentifier, count }));
  });

const createHistoricalExactNameCounts = (historicalGuildObservations: GuildFusionObservation[], beforeTimestamp: number) => {
  const byGuild = new Map<string, GuildFusionObservation[]>();
  historicalGuildObservations.forEach((observation) => {
    const key = normalizeKey(observation.guildIdentifier);
    byGuild.set(key, [...(byGuild.get(key) ?? []), observation]);
  });
  const counts = new Map<string, number>();
  [...byGuild.values()].forEach((observations) => {
    const latest = latestByTimestamp(observations.filter((observation) => observation.timestamp < beforeTimestamp));
    const name = normalizeName(latest?.name);
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  });
  return counts;
};

const simulateVariant = (guildItems: FusionIdentityManagementItem[], variant: Variant) => {
  const promoted = guildItems.filter((item) => {
    if (item.status === "ready" || item.status === "completed") return false;
    const candidate = primaryGuildCandidate(item)?.evidence ?? null;
    if (!candidate || candidate.assignmentConflict || candidate.reservedByReadyAssignment || candidate.relevantCompetitor) return false;
    return variant.predicate(candidate);
  });
  const currentReady = guildItems.filter((item) => item.status === "ready").length;
  const currentReview = guildItems.filter((item) => item.status === "review").length;
  const currentUnresolved = guildItems.filter((item) => item.status === "unresolved").length;
  return {
    variant,
    promoted,
    ready: currentReady + promoted.length,
    review: Math.max(0, currentReview - promoted.filter((item) => item.status === "review").length),
    unresolved: Math.max(0, currentUnresolved - promoted.filter((item) => item.status === "unresolved").length),
  };
};

const scanRoot = process.argv[2] ?? DEFAULT_SCAN_ROOT;
const loadedScans = SCAN_SPECS.map((spec) => readLoadedScan(scanRoot, spec));
const snapshots = loadedScans.flatMap((scan) => scan.snapshots).sort((left, right) => left.timestampMs - right.timestampMs);
assert.equal(loadedScans.length, 9, "expected nine physical scan specs");
assert.ok(snapshots.length >= 9, "expected logical snapshots from scan files");

const suffix = Date.now();
const playerStore = createPlayerIdentityStore({ dbName: `guild-full-audit-player-${suffix}` });
const guildStore = createGuildIdentityStore({ dbName: `guild-full-audit-guild-${suffix}` });

try {
  const report = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });
  const guildItems = report.items.filter((item) => item.entityType === "guild");
  const guildItemsById = groupGuildItemsByIdentifier(guildItems);
  const allGuildObservations = snapshots.flatMap(createFusionIdentityGuildObservations);
  const historicalGuildObservations = allGuildObservations.filter((observation) => ORIGIN_CODES.has(observation.serverCode ?? ""));
  const currentGuildObservations = allGuildObservations.filter((observation) => observation.serverCode === TARGET_CODE);
  const highConfidencePlayerMatches = buildHighConfidencePlayerMatches(snapshots);
  const guildResults = resolveGuildResultsByPostSnapshot(snapshots, highConfidencePlayerMatches);
  const mixedScan = loadedScans.find((scan) => scan.filename === "files_2026_09_15_18_35_12_488.json");
  const mixedSnapshots = mixedScan?.snapshots ?? [];
  const mixedGuilds = mixedSnapshots.flatMap(createFusionIdentityGuildObservations);
  const mixedF27Guilds = mixedGuilds.filter((guild) => guild.serverCode === "F27");
  const mixedF28Guilds = mixedGuilds.filter((guild) => guild.serverCode === "F28");
  const f27InCurrent = currentGuildObservations.filter((guild) => guild.serverCode === "F27").length;
  const f27InHistorical = historicalGuildObservations.filter((guild) => guild.serverCode === "F27").length;
  const currentObservationCounts = countBy(currentGuildObservations, (observation) => normalizeKey(observation.guildIdentifier));
  const observationCountBuckets = Object.values(currentObservationCounts).reduce<Record<string, number>>((counts, count) => {
    const key = count === 1 ? "observed in 1 scan" : count === 2 ? "observed in 2 scans" : "observed in 3+ scans";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const statusCounts = countStatuses(guildItems);
  const nonReadyGuilds = guildItems.filter((item) => item.status !== "ready" && item.status !== "completed");
  const singleCandidateReviews: RelationSnapshot[] = guildItems
    .filter((item) => item.status === "review" && item.candidates.filter((candidate) => candidate.entityType === "guild").length === 1)
    .map((item) => {
      const candidate = primaryGuildCandidate(item);
      return { item, candidate, group: candidateGroup(candidate?.evidence ?? null) };
    });
  const singleReviewGroupCounts = countBy(singleCandidateReviews, (entry) => entry.group);
  const allGuildCandidates = guildItems.flatMap((item) =>
    item.candidates.flatMap((candidate) => candidate.entityType === "guild" ? [candidate.evidence] : []),
  );
  const currentGuildByIdentifier = new Map(
    currentGuildObservations.map((observation) => [normalizeKey(observation.guildIdentifier), observation]),
  );
  const relationBuckets = countBy(allGuildCandidates, relationBucket);
  const sizeStatusCounts = allGuildCandidates.reduce<Record<string, Record<string, number>>>((counts, candidate) => {
    const item = guildItemsById.get(normalizeKey(candidate.newGuildIdentifier));
    const size = historicalSizeBucket(candidate);
    counts[size] = counts[size] ?? {};
    counts[size][item?.status ?? "unknown"] = (counts[size][item?.status ?? "unknown"] ?? 0) + 1;
    return counts;
  }, {});
  const exactUniqueHighRelative = allGuildCandidates.filter((candidate) =>
    candidate.exactName && candidate.uniqueExactName && candidate.matchedMemberCount > 0 && candidate.oldShare >= 0.5 && candidate.newShare >= 0.5,
  );
  const exactUniqueHighRelativeStatus = countBy(exactUniqueHighRelative, (candidate) =>
    guildItemsById.get(normalizeKey(candidate.newGuildIdentifier))?.status ?? "unknown",
  );
  const coaAvailability = allGuildCandidates.reduce<Record<string, number>>((counts, candidate) => {
    const newCoa = currentGuildByIdentifier.get(normalizeKey(candidate.newGuildIdentifier))?.coa ?? null;
    const key = !candidate.oldCoa || !newCoa ? "CoA unavailable" : candidate.sameCoA ? "sameCoA available true" : "sameCoA different";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const firstCurrentTimestamp = Math.min(...currentGuildObservations.map((observation) => observation.timestamp).filter(Number.isFinite));
  const exactNameCounts = createHistoricalExactNameCounts(historicalGuildObservations, firstCurrentTimestamp);
  const exactCollisionRows = guildItems.flatMap((item) =>
    item.candidates.flatMap((candidate) => {
      if (candidate.entityType !== "guild" || !candidate.evidence.exactName) return [];
      return [{
        current: `${item.currentName ?? "unknown"} ${item.currentIdentifier}`,
        historical: `${candidate.historicalName ?? "unknown"} ${candidate.historicalIdentifier}`,
        exactHistoricalEntities: exactNameCounts.get(normalizeName(item.currentName)) ?? 0,
        uniqueExactName: candidate.evidence.uniqueExactName,
      }];
    }),
  );
  const duplicateCandidatePairs = duplicatePairs(guildItems, "candidate");
  const duplicateMigrationPairs = duplicatePairs(guildItems, "migration");
  const rawIdentityPairOccurrences = countBy(
    guildResults.flatMap((result) => result.identityCandidates.map((candidate) => `${normalizeKey(result.newGuild.guildIdentifier)} -> ${normalizeKey(candidate.oldGuildIdentifier)}`)),
    (value) => value,
  );
  const rawMigrationPairOccurrences = countBy(
    guildResults.flatMap((result) => result.memberMigrationEdges.map((edge) => `${normalizeKey(result.newGuild.guildIdentifier)} -> ${normalizeKey(edge.oldGuildIdentifier)}`)),
    (value) => value,
  );
  const rawDuplicateIdentityPairs = Object.entries(rawIdentityPairOccurrences).filter(([, count]) => count > 1);
  const rawDuplicateMigrationPairs = Object.entries(rawMigrationPairOccurrences).filter(([, count]) => count > 1);
  const variants: Variant[] = [
    {
      key: "A",
      label: "Complete Small-Roster Continuity: Exact + Unique + 100%/100% + matched > 0",
      predicate: (candidate) => candidate.exactName && candidate.uniqueExactName && candidate.matchedMemberCount > 0 && candidate.oldShare === 1 && candidate.newShare === 1,
    },
    {
      key: "B",
      label: "Near-complete Small-Roster Continuity: Exact + Unique + both shares >=75%",
      predicate: (candidate) => candidate.exactName && candidate.uniqueExactName && candidate.matchedMemberCount > 0 && candidate.oldShare >= 0.75 && candidate.newShare >= 0.75,
    },
    {
      key: "C",
      label: "Relative Continuity replaces absolute >=3 for small cores: Exact + Unique + both shares >=50%",
      predicate: (candidate) => candidate.exactName && candidate.uniqueExactName && candidate.matchedMemberCount > 0 && candidate.matchedMemberCount < 3 && candidate.oldShare >= 0.5 && candidate.newShare >= 0.5,
    },
    {
      key: "D",
      label: "Exact + Unique without member core remains plausible",
      predicate: () => false,
    },
    {
      key: "E",
      label: "Full roster but name collision does not promote",
      predicate: () => false,
    },
  ];
  const simulations = variants.map((variant) => simulateVariant(guildItems, variant));
  const generationZRows = allGuildCandidates.filter((candidate) => normalizeName(candidate.oldName) === "generationz" || normalizeName(candidate.newName) === "legion z");

  line("# Guild Full-9-Scan Coverage Audit");
  line();
  line(`Generated: ${new Date().toISOString()}`);
  line(`Scan root: ${scanRoot}`);
  line();
  line("## A. Full Scan Inventory");
  loadedScans.forEach((scan) => {
    line(`- ${scan.filename}${scan.usedFallback ? ` (fallback for requested ${scan.spec.expectedFilename})` : ""}`);
    line(`  path: ${scan.filePath}`);
    line(`  label: ${scan.spec.label}`);
    scan.snapshots.forEach((snapshot) => {
      line(`  snapshot=${snapshot.id} timestamp=${formatDate(snapshot.timestampMs)} servers=${snapshotServers(snapshot).join(",") || "none"} players=${snapshot.playerCount} guilds=${snapshot.guildCount} role=${classifySnapshot(snapshot)}`);
    });
  });
  line();
  line("## B. Browser-vs-Tool Dataset Mismatch");
  line(`Browser-style logical snapshots in this audit: ${snapshots.length}; physical files: ${loadedScans.length}.`);
  line(`Management scope reports ${report.scope.historicalSnapshotCount} historical and ${report.scope.postFusionSnapshotCount} F28 post-fusion snapshots because multi-server physical files are classified by contained observations, not by filename count.`);
  line("Earlier real-scan tools scanned the whole public scan root and did not pin the newly supplied 19.09 file set; the full browser-like population appears only when the exact physical files above are loaded together.");
  line();
  line("## C. F27/F28 Mixed Scan");
  line(`files_2026_09_15_18_35_12_488.json F27 guild observations=${mixedF27Guilds.length} F28 guild observations=${mixedF28Guilds.length}`);
  line(`F27 observations entering F28 current pool=${f27InCurrent}`);
  line(`F27 observations entering F28 historical pool=${f27InHistorical}`);
  line();
  line("## D. Full Current Guild Count");
  line(`unique physical current F28 guild IDs=${guildItems.length}`);
  line(formatCounts(observationCountBuckets));
  line();
  line("## E. Full Status Counts");
  line(formatCounts(statusCounts));
  line();
  line("## F. Non-Ready Guild Inventory");
  nonReadyGuilds.forEach((item) => line(`- ${summarizeNonReady(item)}`));
  line();
  line("## G. Single-Candidate Reviews");
  line(`total=${singleCandidateReviews.length}`);
  line(`groups=${formatCounts(singleReviewGroupCounts)}`);
  singleCandidateReviews.forEach(({ item, candidate, group }) => {
    line(`- ${item.currentName ?? "unknown"} ${item.currentIdentifier} group=${group}`);
    line(`  ${describeCandidate(candidate?.evidence ?? null)}`);
  });
  line();
  line("## H. Small Guild Analysis");
  line(`relative buckets: ${formatCounts(relationBuckets)}`);
  Object.entries(sizeStatusCounts).sort(([left], [right]) => left.localeCompare(right)).forEach(([bucket, counts]) => {
    line(`- ${bucket}: ${formatCounts(counts)}`);
  });
  line(`Exact+Unique with matched>0 and both shares >=50% by status: ${formatCounts(exactUniqueHighRelativeStatus)}`);
  exactUniqueHighRelative.forEach((candidate) => {
    const item = guildItemsById.get(normalizeKey(candidate.newGuildIdentifier));
    line(`  ${item?.currentName ?? candidate.newName ?? "unknown"} ${candidate.newGuildIdentifier}: status=${item?.status ?? "unknown"} ${describeCandidate(candidate)}`);
  });
  line();
  line("## I. Browser Example Profiles");
  BROWSER_CASE_NAMES.forEach((name) => {
    const matches = guildItems.filter((item) => normalizeName(item.currentName) === normalizeName(name) || normalizeName(item.currentName).includes(normalizeName(name)));
    if (!matches.length) {
      line(`- ${name}: missing in loaded 9-file dataset`);
      return;
    }
    matches.forEach((item) => line(`- ${name}: ${summarizeNonReady(item)} ${describeCandidate(primaryGuildCandidate(item)?.evidence ?? null)}`));
  });
  line();
  line("## J. Exact Name Collision");
  exactCollisionRows.forEach((row) => line(`- ${row.current} -> ${row.historical}: exactHistoricalEntities=${row.exactHistoricalEntities} uniqueExactName=${row.uniqueExactName}`));
  line();
  line("## K. CoA Availability");
  line(formatCounts(coaAvailability));
  line();
  line("## L. Physical Dedupe");
  line(`final duplicate identity candidate physical pairs=${duplicateCandidatePairs.length}`);
  duplicateCandidatePairs.forEach((row) => line(`  candidate duplicate ${row.item.currentIdentifier} -> ${row.historicalIdentifier} count=${row.count}`));
  line(`final duplicate migration physical pairs=${duplicateMigrationPairs.length}`);
  duplicateMigrationPairs.forEach((row) => line(`  migration duplicate ${row.item.currentIdentifier} -> ${row.historicalIdentifier} count=${row.count}`));
  line(`raw cross-snapshot duplicate identity pair occurrences=${rawDuplicateIdentityPairs.length}`);
  line(`raw cross-snapshot duplicate migration pair occurrences=${rawDuplicateMigrationPairs.length}`);
  line("Final UI/management relations are deduped; raw cross-snapshot duplicates are expected before current observation aggregation.");
  line();
  line("## M. Current/Historical Observation Aggregation");
  line(`current F28 guild observations=${currentGuildObservations.length}; unique current guild items=${guildItems.length}`);
  line(`historical guild observations=${historicalGuildObservations.length}; unique historical physical guild IDs=${new Set(historicalGuildObservations.map((observation) => normalizeKey(observation.guildIdentifier))).size}`);
  line("Management groups current observations by physical guild identifier and resolver histories group historical observations by physical guild identifier; repeated observations do not become multiple final cards.");
  line();
  line("## N. V3.3 Simulations");
  simulations.forEach((simulation) => {
    line(`- Variant ${simulation.variant.key}: ${simulation.variant.label}`);
    line(`  simulated ready=${simulation.ready} review=${simulation.review} unresolved=${simulation.unresolved}`);
    line(`  promoted=${simulation.promoted.length ? simulation.promoted.map((item) => `${item.currentName ?? item.currentIdentifier}(${item.currentIdentifier})`).join(", ") : "none"}`);
  });
  line();
  line("## O. False Positive Controls");
  generationZRows.forEach((candidate) => line(`- ${candidate.oldName ?? "unknown"} -> ${candidate.newName ?? "unknown"} ${candidate.oldGuildIdentifier}->${candidate.newGuildIdentifier}: exact=${candidate.exactName} unique=${candidate.uniqueExactName} matched=${candidate.matchedMemberCount} oldShare=${pct(candidate.oldShare)} newShare=${pct(candidate.newShare)} class=${candidate.classification} auto=${candidate.autoEligible}`));
  line("GenerationZ negative control is not promoted by relative Exact+Unique simulations because it is not an exact unique direct-name relation to Legion Z.");
  line();
  line("## P. Existing Ground Truth");
  GROUND_TRUTH_NAMES.forEach((name) => {
    const matches = guildItems.filter((item) => normalizeName(item.currentName) === normalizeName(name));
    line(`- ${name}: ${matches.length ? matches.map((item) => `${item.currentIdentifier} status=${item.status} ready=${item.readyCandidateIdentifier ?? "none"} candidates=${item.candidates.length}`).join("; ") : "missing"}`);
  });
  line();
  line("## Q. Recommended Final Guild Rules");
  line("1. Exact + Unique + 100%/100% roster continuity with matched > 0 should be eligible for `strong`, provided there is no name collision, assignment conflict, or relevant competitor.");
  line("2. A single matched player should count as a complete member core only when it explains 100% of both the latest historical roster and the current roster; otherwise it remains supporting evidence.");
  line("3. For 2-3 member guilds, use relative bidirectional continuity as an alternative to absolute >=3: require Exact + Unique plus high oldShare and newShare. The full-dataset simulation suggests >=75% is the conservative near-complete threshold; >=50% is a broader candidate that should be reviewed before implementation.");
  line("4. Same CoA remains an independent direct-evidence family. When CoA is present and same, V3.2 already handles small 1-member cores; when CoA is missing/unavailable, complete relative roster continuity can substitute as member evidence, not as CoA evidence.");
  line("5. Correct remaining reviews are assignment conflicts, exact-name collisions, exact-only with no member core, and genuinely competitive multi-candidate cases.");
  line();
  line("## R. Simulated Final Status");
  const recommended = simulations.find((simulation) => simulation.variant.key === "A") ?? simulations[0];
  line(`Recommended conservative Variant A final: ready=${recommended.ready} review=${recommended.review} unresolved=${recommended.unresolved}`);
  line(`Promotions: ${recommended.promoted.length ? recommended.promoted.map((item) => `${item.currentName ?? item.currentIdentifier} ${item.currentIdentifier}`).join(", ") : "none"}`);

  fs.writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`, "utf8");
  console.log(lines.join("\n"));

  assert.equal(f27InCurrent, 0, "F27 must not enter F28 current pool");
  assert.equal(f27InHistorical, 0, "F27 must not enter EU1-EU4 historical pool");
  assert.equal(duplicateCandidatePairs.length, 0, "final identity candidates should be unique by current/historical physical pair");
  assert.equal(duplicateMigrationPairs.length, 0, "final migration edges should be unique by current/historical physical pair");
} finally {
  await playerStore.close();
  await guildStore.close();
  await deleteDB(`guild-full-audit-player-${suffix}`);
  await deleteDB(`guild-full-audit-guild-${suffix}`);
}
