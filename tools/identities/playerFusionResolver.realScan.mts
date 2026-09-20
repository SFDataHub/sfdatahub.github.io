import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { normalizeGuildScanMembers } from "../../src/lib/guilds/guildScanNormalizer.ts";
import { resolveServer } from "../../src/lib/servers/serverResolver.ts";
import {
  createPlayerFusionSemanticSummary,
} from "../../src/lib/identities/playerFusionPreviewAdapter.ts";
import {
  resolvePlayerFusions,
  selectPlayerFusionReadyCandidates,
  type PlayerFusionObservation,
  type PlayerFusionPlayerResult,
  type PlayerFusionResultStatus,
} from "../../src/lib/identities/playerFusionResolver.ts";

type JsonRecord = Record<string, unknown>;

type ScanFile = {
  filePath: string;
  fileName: string;
  timestamp: number;
  observations: PlayerFusionObservation[];
};

const DEFAULT_SCAN_ROOT = "D:/SFDataHub/Guild Analytics/public/scans";
const TARGET_DATES = new Set(["2026-02-21", "2026-04-03", "2026-09-05"]);
const ORIGIN_SERVER_CODES = new Set(["EU1", "EU2", "EU3", "EU4"]);
const TARGET_FUSION_SERVER = "F28";

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

const readCurrentCompactOriginNumericId = (player: JsonRecord | null) => {
  if (!player) return null;
  const saveVersion = toFiniteNumber(player.saveVersion);
  const save = Array.isArray(player.save) ? player.save : null;
  if (saveVersion !== 2 || save?.length !== 70) return null;
  return toFiniteNumber(save[68]);
};

const listJsonFiles = (root: string): string[] => {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listJsonFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".json") ? [fullPath] : [];
  });
};

const readRawScan = (filePath: string): JsonRecord | null => {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return asRecord(parsed);
};

const getScanTimestamp = (raw: JsonRecord): number | null => {
  const players = Array.isArray(raw.players) ? raw.players.map(asRecord).filter(Boolean) : [];
  const firstPlayerTimestamp = players.map((player) => toFiniteNumber(player?.timestamp)).find((timestamp) => timestamp != null);
  return firstPlayerTimestamp ?? toFiniteNumber(raw.timestamp);
};

const normalizeIdentifierKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const readScanFile = (filePath: string): ScanFile | null => {
  const raw = readRawScan(filePath);
  if (!raw || !Array.isArray(raw.players)) return null;

  const timestamp = getScanTimestamp(raw);
  if (timestamp == null) return null;

  const rawPlayersByIdentifier = new Map<string, JsonRecord>();
  raw.players.map(asRecord).forEach((player) => {
    const identifier = normalizeIdentifierKey(player?.identifier);
    if (identifier && player) rawPlayersByIdentifier.set(identifier, player);
  });

  const observations = normalizeGuildScanMembers(raw).map((member): PlayerFusionObservation => {
    const rawPlayer = rawPlayersByIdentifier.get(normalizeIdentifierKey(member.memberRef)) ?? null;
    return {
      identifier: member.memberRef,
      server: member.server,
      timestamp,
      name: member.name,
      classId: member.classId,
      level: member.level,
      levelAvailability: typeof member.level === "number" && Number.isFinite(member.level) && member.level > 0 ? "available" : "missing",
      guildIdentifier: member.guildSegment ?? member.groupSegment,
      guildName: member.guildName,
      originNumericId: readCurrentCompactOriginNumericId(rawPlayer),
      semantic: createPlayerFusionSemanticSummary(rawPlayer),
    };
  });

  return {
    filePath,
    fileName: path.basename(filePath),
    timestamp,
    observations,
  };
};

const isOriginObservation = (observation: PlayerFusionObservation) => {
  const code = resolveServer(observation.server)?.code;
  return Boolean(code && ORIGIN_SERVER_CODES.has(code));
};

const isTargetFusionObservation = (observation: PlayerFusionObservation) =>
  resolveServer(observation.server)?.code === TARGET_FUSION_SERVER;

const dateKey = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

const summarizeStatus = (results: PlayerFusionPlayerResult[]) => {
  const counts = new Map<PlayerFusionResultStatus, number>();
  results.forEach((result) => counts.set(result.status, (counts.get(result.status) ?? 0) + 1));
  return counts;
};

const countByOriginSource = (results: PlayerFusionPlayerResult[]) => {
  const counts = new Map<string, number>();
  results.forEach((result) => counts.set(result.originSource, (counts.get(result.originSource) ?? 0) + 1));
  return counts;
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const formatCounts = (counts: Map<string, number>, keys: string[]) =>
  keys.map((key) => `${key}: ${counts.get(key) ?? 0}`).join(", ");

const collectProblemCases = (results: PlayerFusionPlayerResult[]) => {
  const cases: string[] = [];

  const push = (label: string, result: PlayerFusionPlayerResult, detail: string) => {
    if (cases.filter((entry) => entry.startsWith(label)).length >= 4) return;
    cases.push(`${label} ${result.newIdentifier}: ${detail}`);
  };

  results.forEach((result) => {
    const viable = result.candidates.filter((candidate) => !candidate.rejected);
    const exactMatches = viable.filter((candidate) => candidate.evidence.exactName || candidate.evidence.fusionBaseName);
    if (exactMatches.length > 1) push("multiple-name-candidates", result, `${exactMatches.length} exact/base matches`);
    if (result.originSource === "unknown") push("no-origin", result, "origin could not be resolved");
    if (result.status === "conflict") push("one-to-one-conflict", result, result.reasons.join("; "));
    if (result.status === "no-predecessor") push("native-current-server", result, result.reasons.join("; "));
    if (!exactMatches.length && viable.length) push("rename-or-no-name-match", result, `${viable.length} viable non-name candidates`);
    if (viable.some((candidate) => candidate.evidence.baseAttributesConsistent === true)) {
      push("semantic-base-match", result, `${viable.filter((candidate) => candidate.evidence.baseAttributesConsistent === true).length} base-compatible candidates`);
    }
    if (!result.candidates.length && result.status !== "no-predecessor") push("no-historical-candidate", result, result.reasons.join("; "));

    const levelRegression = result.candidates.find((candidate) => candidate.rejectReasons.includes("level-regression"));
    if (levelRegression) push("level-conflict", result, `${levelRegression.oldIdentifier} level regressed`);
    const baseContradiction = result.candidates.find((candidate) =>
      candidate.rejectReasons.includes("base-stat-regression") || candidate.rejectReasons.includes("base-attributes-contradiction"),
    );
    if (baseContradiction) push("base-attribute-conflict", result, `${baseContradiction.oldIdentifier} base attributes regressed`);
  });

  return cases.slice(0, 28);
};

const scanRoot = process.argv[2] ?? DEFAULT_SCAN_ROOT;
const scans = listJsonFiles(scanRoot)
  .filter((filePath) => !filePath.endsWith(`${path.sep}manifest.json`))
  .map(readScanFile)
  .filter((scan): scan is ScanFile => Boolean(scan))
  .sort((left, right) => left.timestamp - right.timestamp);

const postScans = scans.filter((scan) => TARGET_DATES.has(dateKey(scan.timestamp)));

assert.equal(postScans.length, 3, "expected real February, April, and September 2026 post-fusion scans");

postScans.forEach((postScan) => {
  const historicalObservations = scans
    .filter((scan) => scan.timestamp < postScan.timestamp)
    .flatMap((scan) => scan.observations)
    .filter(isOriginObservation);
  const newObservations = postScan.observations.filter(isTargetFusionObservation);

  assert.ok(newObservations.length > 0, `${postScan.fileName} should contain F28 players`);
  assert.ok(historicalObservations.length > 0, `${postScan.fileName} should have pre-fusion history`);

  const result = resolvePlayerFusions({ historicalObservations, newObservations });
  const statuses = summarizeStatus(result.results);
  const originSources = countByOriginSource(result.results);
  const beforeCounts = result.results.map((entry) => entry.candidatesBeforeHardFilters);
  const afterCounts = result.results.map((entry) => entry.candidatesAfterHardFilters);
  const strongNameMatches = result.results.filter((entry) =>
    entry.candidates.some(
      (candidate) => !candidate.rejected && (candidate.evidence.exactName || candidate.evidence.fusionBaseName),
    ),
  ).length;
  const semanticReadyMatches = result.results.filter((entry) => selectPlayerFusionReadyCandidates(entry).length > 0).length;
  const semanticRejectedCandidates = result.results.reduce(
    (count, entry) =>
      count +
      entry.candidates.filter(
        (candidate) =>
          candidate.rejectReasons.includes("base-stat-regression") ||
          candidate.rejectReasons.includes("base-attributes-contradiction"),
      ).length,
    0,
  );
  const makio = result.results.find((entry) => entry.newIdentifier.toLowerCase() === "f28_net_p209891");

  console.log(`\n${dateKey(postScan.timestamp)} ${postScan.fileName}`);
  console.log(`F28 players: ${newObservations.length}`);
  console.log(
    formatCounts(originSources, ["currentServerNoPredecessor", "numeric", "fusionSuffix", "fusionLineage", "unknown"]),
  );
  console.log(formatCounts(statuses, ["high-confidence", "candidate", "ambiguous", "unresolved", "conflict", "no-predecessor"]));
  console.log(
    `candidate counts before filters total=${sum(beforeCounts)} max=${Math.max(...beforeCounts)} after filters total=${sum(afterCounts)} max=${Math.max(...afterCounts)}`,
  );
  console.log(`exact/base-name viable results: ${strongNameMatches}`);
  console.log(`ready-capable results: ${semanticReadyMatches}`);
  console.log(`base-attribute rejected candidates: ${semanticRejectedCandidates}`);
  if (makio) {
    const best = selectPlayerFusionReadyCandidates(makio)[0] ?? makio.candidates.find((candidate) => !candidate.rejected) ?? makio.candidates[0];
    console.log(
      `Makio: status=${makio.status} origin=${makio.originSource} candidate=${best?.oldIdentifier ?? "none"} base=${best?.evidence.baseAttributesConsistent ?? "n/a"} level=${best?.evidence.levelConsistent ?? "n/a"} class=${best?.evidence.sameClass ?? "n/a"}`,
    );
  }
  console.log("problem cases:");
  collectProblemCases(result.results).forEach((entry) => console.log(`- ${entry}`));
});

console.log("\nplayerFusionResolver real scan analysis passed");
