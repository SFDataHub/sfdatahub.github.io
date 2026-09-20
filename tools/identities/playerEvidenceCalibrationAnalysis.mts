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
import { createPlayerIdentityStore } from "../../src/lib/identities/playerIdentityStore.ts";
import { createFusionIdentityObservations } from "../../src/lib/identities/playerFusionPreviewAdapter.ts";
import {
  hasPlayerFusionHardContradiction,
  isPlayerFusionReadyCandidate,
  isPlayerFusionStrongIdentityCandidate,
  resolvePlayerFusions,
  selectPlayerFusionReadyCandidates,
  type PlayerFusionCandidate,
  type PlayerFusionObservation,
  type PlayerFusionPlayerResult,
} from "../../src/lib/identities/playerFusionResolver.ts";
import { resolveServer } from "../../src/lib/servers/serverResolver.ts";

type JsonRecord = Record<string, unknown>;
type EvidenceTier =
  | "hardContradiction"
  | "strongContradiction"
  | "weakContradiction"
  | "neutral"
  | "weakSupport"
  | "support"
  | "strongSupport"
  | "identityAnchor";
type Attribute = (typeof ATTRIBUTES)[number];
type SampleKind = "positive" | "false";
type PositiveGroup = "P1-name-anchor" | "P2-semantic-ready" | "P3-rename-ground-truth";

type CandidateSample = {
  kind: SampleKind;
  group: PositiveGroup | "review-hard-false";
  currentIdentifier: string;
  currentName: string | null;
  result: PlayerFusionPlayerResult;
  candidate: PlayerFusionCandidate;
  pre: PlayerFusionObservation | null;
  post: PlayerFusionObservation | null;
};

type BaseShape = {
  available: boolean;
  monotonic: boolean | null;
  unchangedCount: number | null;
  unchangedAttributes: Attribute[];
  deltas: Array<number | null>;
  relativeDeltas: Array<number | null>;
  orderingStable: boolean | null;
  mainDelta: number | null;
  constitutionDelta: number | null;
  secondaryUnchangedCount: number | null;
  luckDelta: number | null;
  ratiosStable: {
    mainConstitution: boolean | null;
    secondaryPair: boolean | null;
    luckConstitution: boolean | null;
  };
};

const DEFAULT_SCAN_ROOT = "D:/SFDataHub/Guild Analytics/public/scans";
const REPORT_PATH = path.resolve("tools/identities/player-evidence-calibration-analysis.latest.txt");
const ORIGIN_CODES = new Set(["EU1", "EU2", "EU3", "EU4"]);
const TARGET_CODE = "F28";
const F2P_CURRENT_ID = "f28_net_p215970";
const ERD_HISTORICAL_ID = "s3_eu_p72909";
const ATTRIBUTES = ["STR", "DEX", "INT", "CON", "LUC"] as const;
const ATTRIBUTE_INDEX: Record<Attribute, number> = { STR: 0, DEX: 1, INT: 2, CON: 3, LUC: 4 };
const RELATED_ANALYSIS_TOOLS = [
  "playerEvidencePriorityAnalysis.mts",
  "remainingPlayerReviewAnalysis.mts",
  "playerLevelProgressionByOriginAnalysis.mts",
  "hardiyAssignmentAndLevelProgressionAnalysis.mts",
  "fusionSemanticEvidenceAnalysis.mts",
  "fusionObservationHistoryAnalysis.mts",
];

const lines: string[] = [];
const line = (value = "") => lines.push(value);

const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;

const toFiniteNumber = (value: unknown) => {
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
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const resolveServerCode = (value: unknown) => resolveServer(String(value ?? ""))?.code ?? null;

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

const groupObservations = (observations: PlayerFusionObservation[]) => {
  const grouped = new Map<string, PlayerFusionObservation[]>();
  observations.forEach((observation) => {
    const key = normalizeKey(observation.identifier);
    if (!key) return;
    grouped.set(key, [...(grouped.get(key) ?? []), observation]);
  });
  return grouped;
};

const sortByTimestamp = <T extends { timestamp: number }>(values: T[]) =>
  [...values].sort((left, right) => left.timestamp - right.timestamp);

const firstByTimestamp = <T extends { timestamp: number }>(values: T[]) => sortByTimestamp(values)[0] ?? null;
const latestByTimestamp = <T extends { timestamp: number }>(values: T[]) => sortByTimestamp(values).at(-1) ?? null;

const baseVector = (observation: PlayerFusionObservation | null | undefined) =>
  observation?.semantic?.baseAttributes?.availability === "available" ? observation.semantic.baseAttributes.values : null;

const vectorDelta = (pre: number[] | null, post: number[] | null) =>
  pre && post && pre.length === post.length ? pre.map((value, index) => post[index] - value) : null;

const formatDate = (timestamp: number | null | undefined) =>
  timestamp == null ? "missing" : new Date(timestamp).toISOString();

const formatNumber = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value) ? "n/a" : value.toFixed(digits);

const formatRate = (count: number, total: number) => `${count}/${total} (${total ? ((count / total) * 100).toFixed(1) : "0.0"}%)`;

const median = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const sameText = (left: unknown, right: unknown) => {
  const leftText = normalizeText(left);
  return Boolean(leftText && leftText === normalizeText(right));
};

const mainAttributeForClass = (classId: string | null | undefined): Attribute | null => {
  const id = Number(String(classId ?? "").trim());
  if ([1, 5, 6, 11].includes(id)) return "STR";
  if ([3, 4, 7, 12].includes(id)) return "DEX";
  if ([2, 8, 9, 10].includes(id)) return "INT";
  return null;
};

const secondaryAttributesForMain = (main: Attribute | null): Attribute[] =>
  ATTRIBUTES.filter((attribute) => attribute !== main && attribute !== "CON" && attribute !== "LUC");

const orderingSignature = (values: number[] | null) =>
  values
    ? ATTRIBUTES.map((attribute, index) => ({ attribute, value: values[index] }))
        .sort((left, right) => right.value - left.value || left.attribute.localeCompare(right.attribute))
        .map((entry) => entry.attribute)
        .join(">")
    : null;

const ratioClose = (preLeft: number | null, preRight: number | null, postLeft: number | null, postRight: number | null) => {
  if (preLeft == null || preRight == null || postLeft == null || postRight == null || preRight <= 0 || postRight <= 0) return null;
  const preRatio = preLeft / preRight;
  const postRatio = postLeft / postRight;
  const relativeChange = Math.abs(postRatio - preRatio) / Math.max(Math.abs(preRatio), 0.0001);
  return relativeChange <= 0.05;
};

const selectHistoricalObservation = (
  candidate: PlayerFusionCandidate,
  history: PlayerFusionObservation[],
  post: PlayerFusionObservation | null,
) => {
  const exactTimestamp = history.find((observation) => observation.timestamp === candidate.comparisonTimestamp);
  if (exactTimestamp) return exactTimestamp;
  const beforePost = post
    ? sortByTimestamp(history).filter((observation) => observation.timestamp < post.timestamp).at(-1) ?? null
    : null;
  return beforePost ?? latestByTimestamp(history);
};

const classifyPositiveGroup = (candidate: PlayerFusionCandidate): PositiveGroup => {
  if (candidate.evidence.exactName || candidate.evidence.fusionBaseName) return "P1-name-anchor";
  return "P2-semantic-ready";
};

const baseShapeFor = (sample: CandidateSample): BaseShape => {
  const pre = baseVector(sample.pre);
  const post = baseVector(sample.post);
  const deltas = vectorDelta(pre, post);
  const main = mainAttributeForClass(sample.candidate.oldClassId ?? sample.post?.classId);
  const secondary = secondaryAttributesForMain(main);
  const unchangedAttributes = deltas
    ? ATTRIBUTES.filter((_, index) => deltas[index] === 0)
    : [];
  const relativeDeltas =
    pre && post
      ? pre.map((value, index) => (post[index] - value) / Math.max(value, 1))
      : ATTRIBUTES.map(() => null);
  const mainIndex = main == null ? null : ATTRIBUTE_INDEX[main];
  const secondaryUnchangedCount = deltas
    ? secondary.filter((attribute) => deltas[ATTRIBUTE_INDEX[attribute]] === 0).length
    : null;
  const firstSecondary = secondary[0] ?? null;
  const secondSecondary = secondary[1] ?? null;

  return {
    available: Boolean(deltas),
    monotonic: deltas ? deltas.every((delta) => delta >= 0) : null,
    unchangedCount: deltas ? unchangedAttributes.length : null,
    unchangedAttributes,
    deltas: deltas ?? ATTRIBUTES.map(() => null),
    relativeDeltas,
    orderingStable: pre && post ? orderingSignature(pre) === orderingSignature(post) : null,
    mainDelta: deltas && mainIndex != null ? deltas[mainIndex] : null,
    constitutionDelta: deltas ? deltas[ATTRIBUTE_INDEX.CON] : null,
    secondaryUnchangedCount,
    luckDelta: deltas ? deltas[ATTRIBUTE_INDEX.LUC] : null,
    ratiosStable: {
      mainConstitution:
        pre && post && mainIndex != null
          ? ratioClose(pre[mainIndex], pre[ATTRIBUTE_INDEX.CON], post[mainIndex], post[ATTRIBUTE_INDEX.CON])
          : null,
      secondaryPair:
        pre && post && firstSecondary && secondSecondary
          ? ratioClose(
              pre[ATTRIBUTE_INDEX[firstSecondary]],
              pre[ATTRIBUTE_INDEX[secondSecondary]],
              post[ATTRIBUTE_INDEX[firstSecondary]],
              post[ATTRIBUTE_INDEX[secondSecondary]],
            )
          : null,
      luckConstitution: pre && post ? ratioClose(pre[ATTRIBUTE_INDEX.LUC], pre[ATTRIBUTE_INDEX.CON], post[ATTRIBUTE_INDEX.LUC], post[ATTRIBUTE_INDEX.CON]) : null,
    },
  };
};

const isHardFalseCandidate = (candidate: PlayerFusionCandidate) =>
  !candidate.rejected &&
  candidate.evidence.originMatches === true &&
  candidate.evidence.sameClass === true &&
  candidate.evidence.levelConsistent !== false &&
  candidate.evidence.baseAttributesConsistent === true;

const tierRecommendation = (positiveHits: number, positiveTotal: number, falseHits: number, falseTotal: number): EvidenceTier => {
  const positiveRate = positiveTotal ? positiveHits / positiveTotal : 0;
  const falseRate = falseTotal ? falseHits / falseTotal : 0;
  if (positiveRate === 1 && falseRate === 1) return "neutral";
  if (positiveRate >= 0.9 && falseRate <= 0.01) return "identityAnchor";
  if (positiveRate >= 0.1 && falseRate <= 0.01) return "strongSupport";
  if (positiveRate >= 0.05 && falseRate <= 0.03) return "support";
  if (positiveRate >= 0.65 && falseRate <= 0.08) return "strongSupport";
  if (positiveRate >= 0.45 && falseRate <= 0.3) return "support";
  if (positiveRate >= 0.25 && falseRate < positiveRate) return "weakSupport";
  if (falseRate > positiveRate * 1.5 && falseRate >= 0.25) return "weakContradiction";
  return "neutral";
};

const countWhere = (samples: CandidateSample[], predicate: (sample: CandidateSample, shape: BaseShape) => boolean) =>
  samples.reduce((count, sample) => count + (predicate(sample, baseShapeFor(sample)) ? 1 : 0), 0);

const printEvidenceMetric = (
  label: string,
  positives: CandidateSample[],
  falseControls: CandidateSample[],
  predicate: (sample: CandidateSample, shape: BaseShape) => boolean,
  forcedTier?: EvidenceTier,
) => {
  const positiveHits = countWhere(positives, predicate);
  const falseHits = countWhere(falseControls, predicate);
  const tier = forcedTier ?? tierRecommendation(positiveHits, positives.length, falseHits, falseControls.length);
  line(
    `${label}: positives=${formatRate(positiveHits, positives.length)} falseControls=${formatRate(falseHits, falseControls.length)} collision=${falseHits} suggested=${tier}`,
  );
};

const distribution = (samples: CandidateSample[], valueFor: (sample: CandidateSample, shape: BaseShape) => string | number | null) => {
  const counts = new Map<string, number>();
  samples.forEach((sample) => {
    const key = String(valueFor(sample, baseShapeFor(sample)) ?? "n/a");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
};

const printDistributionComparison = (
  title: string,
  keys: Array<string | number>,
  positives: CandidateSample[],
  falseControls: CandidateSample[],
  valueFor: (sample: CandidateSample, shape: BaseShape) => string | number | null,
) => {
  line(title);
  const positiveDistribution = distribution(positives, valueFor);
  const falseDistribution = distribution(falseControls, valueFor);
  line("| value | Positive Matches | False Candidates |");
  line("| ---: | ---: | ---: |");
  keys.forEach((key) => {
    const text = String(key);
    line(`| ${text} | ${positiveDistribution.get(text) ?? 0} | ${falseDistribution.get(text) ?? 0} |`);
  });
};

const sampleLabel = (sample: CandidateSample) =>
  `${sample.currentName ?? sample.currentIdentifier} -> ${sample.candidate.oldName ?? "?"} (${sample.candidate.oldIdentifier})`;

const describeShape = (sample: CandidateSample) => {
  const shape = baseShapeFor(sample);
  const deltas = ATTRIBUTES.map((attribute, index) => `${attribute}${shape.deltas[index] == null ? "n/a" : shape.deltas[index]! >= 0 ? `+${shape.deltas[index]}` : shape.deltas[index]}`).join(" ");
  return [
    `progression=${sample.candidate.evidence.levelProgression.category}`,
    `baseMonotonic=${shape.monotonic ?? "n/a"}`,
    `unchanged=${shape.unchangedAttributes.join(",") || "none"}`,
    `orderingStable=${shape.orderingStable ?? "n/a"}`,
    `guild=${sameText(sample.candidate.oldGuildName, sample.post?.guildName) ? "same" : "different-or-missing"}`,
    `fortress=${sample.candidate.evidence.fortressContinuity ?? "n/a"}`,
    `pets=${sample.candidate.evidence.petContinuity ?? "n/a"}`,
    deltas,
  ].join(" ");
};

const scanRoot = process.argv[2] ?? DEFAULT_SCAN_ROOT;
const snapshots = listJsonFiles(scanRoot)
  .map(readSnapshot)
  .filter((snapshot): snapshot is GuildHubLogicalScanSnapshot => Boolean(snapshot))
  .sort((left, right) => left.timestampMs - right.timestampMs);

assert.ok(snapshots.length > 0, "expected real scan snapshots");

const allObservations = snapshots.flatMap(createFusionIdentityObservations);
const historicalObservations = allObservations.filter((observation) => {
  const code = resolveServerCode(observation.server);
  return Boolean(code && ORIGIN_CODES.has(code));
});
const currentObservations = allObservations.filter((observation) => resolveServerCode(observation.server) === TARGET_CODE);
const historicalByIdentifier = groupObservations(historicalObservations);
const currentByIdentifier = groupObservations(currentObservations);
const resolver = resolvePlayerFusions({ historicalObservations, newObservations: currentObservations });
const resultByCurrentIdentifier = new Map(resolver.results.map((result) => [normalizeKey(result.newIdentifier), result]));

const suffix = Date.now();
const playerStore = createPlayerIdentityStore({ dbName: `player-evidence-calibration-${suffix}` });
const guildStore = createGuildIdentityStore({ dbName: `guild-evidence-calibration-${suffix}` });
const managementReport = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });
const playerItems = managementReport.items.filter((item): item is FusionIdentityManagementItem => item.entityType === "player");
const itemByCurrentIdentifier = new Map(playerItems.map((item) => [normalizeKey(item.currentIdentifier), item]));
const reviewItems = playerItems.filter((item) => item.status === "review");

const sampleFor = (result: PlayerFusionPlayerResult, candidate: PlayerFusionCandidate, kind: SampleKind, group: CandidateSample["group"]): CandidateSample | null => {
  const currentTimeline = currentByIdentifier.get(normalizeKey(result.newIdentifier)) ?? [];
  const post = firstByTimestamp(currentTimeline);
  const historicalTimeline = historicalByIdentifier.get(normalizeKey(candidate.oldIdentifier)) ?? [];
  const pre = selectHistoricalObservation(candidate, historicalTimeline, post);
  const item = itemByCurrentIdentifier.get(normalizeKey(result.newIdentifier));
  return {
    kind,
    group,
    currentIdentifier: result.newIdentifier,
    currentName: item?.currentName ?? post?.name ?? null,
    result,
    candidate,
    pre,
    post,
  };
};

const positiveSamples: CandidateSample[] = [];
resolver.results.forEach((result) => {
  const ready = selectPlayerFusionReadyCandidates(result);
  if (result.status !== "high-confidence" || ready.length !== 1) return;
  const candidate = ready[0];
  if (candidate.rejected || hasPlayerFusionHardContradiction(candidate)) return;
  const sample = sampleFor(result, candidate, "positive", classifyPositiveGroup(candidate));
  if (sample) positiveSamples.push(sample);
});

const f2pResult = resultByCurrentIdentifier.get(normalizeKey(F2P_CURRENT_ID));
assert.ok(f2pResult, `expected F2PKrümel resolver result ${F2P_CURRENT_ID}`);
const erdCandidate = f2pResult.candidates.find((candidate) => normalizeKey(candidate.oldIdentifier) === normalizeKey(ERD_HISTORICAL_ID));
assert.ok(erdCandidate, `expected Erdkrümel candidate ${ERD_HISTORICAL_ID}`);
const erdSample = sampleFor(f2pResult, erdCandidate, "positive", "P3-rename-ground-truth");
assert.ok(erdSample, "expected Erdkrümel sample");
positiveSamples.push(erdSample);

const falseControlSamples: CandidateSample[] = [];
const seenFalse = new Set<string>();
reviewItems.forEach((item) => {
  const result = resultByCurrentIdentifier.get(normalizeKey(item.currentIdentifier));
  if (!result) return;
  result.candidates.filter(isHardFalseCandidate).forEach((candidate) => {
    if (normalizeKey(item.currentIdentifier) === normalizeKey(F2P_CURRENT_ID) && normalizeKey(candidate.oldIdentifier) === normalizeKey(ERD_HISTORICAL_ID)) return;
    const key = `${normalizeKey(item.currentIdentifier)}::${normalizeKey(candidate.oldIdentifier)}`;
    if (seenFalse.has(key)) return;
    seenFalse.add(key);
    const sample = sampleFor(result, candidate, "false", "review-hard-false");
    if (sample) falseControlSamples.push(sample);
  });
});

const positiveByGroup = positiveSamples.reduce((counts, sample) => {
  counts.set(sample.group, (counts.get(sample.group) ?? 0) + 1);
  return counts;
}, new Map<string, number>());

line("# Player Evidence Calibration Analysis");
line("");
line("Scope: read-only analysis for EU1-EU4 -> F28 player fusion evidence. No resolver/UI/store/raw-scan mutation.");
line(`Snapshots=${snapshots.length} currentObservations=${currentObservations.length} historicalObservations=${historicalObservations.length}`);
line(`Player baseline: ready=${playerItems.filter((item) => item.status === "ready").length} review=${reviewItems.length} unresolved=${playerItems.filter((item) => item.status === "unresolved").length} noHistoricalObservation=${playerItems.filter((item) => item.status === "noHistoricalObservation").length} noHistory=${playerItems.filter((item) => item.status === "noHistory").length}`);
line(`Related prior tools considered: ${RELATED_ANALYSIS_TOOLS.join(", ")}`);
line("");

line("## A. Dataset and controls");
line(`Positive controls=${positiveSamples.length}`);
["P1-name-anchor", "P2-semantic-ready", "P3-rename-ground-truth"].forEach((group) => {
  line(`- ${group}: ${positiveByGroup.get(group) ?? 0}`);
});
line(`Hard false/ambiguous controls=${falseControlSamples.length}`);
line("False controls are restricted to review-pool candidates with same origin, same class, no level regression, and base monotonicity. Trivial origin/class rejects are excluded.");
line("");

line("## B. Current evidence families and proposed hard separation");
line("- Origin: reliable mismatch remains hardContradiction; resolved match is eligibility/weakSupport rather than identity evidence.");
line("- Class: mismatch remains hardContradiction; same class is eligibility/weakSupport.");
line("- Level monotonicity: regression remains hardContradiction; monotonic alone is weakSupport at most.");
line("- Level progression: normal/plausible-burst/extreme are plausibility modifiers, not identity anchors.");
line("- Base attributes: monotonicity is separate from unchanged-stat/fingerprint evidence.");
line("- Fortress/Pets: availability-aware continuity evidence; missing is neutral.");
line("- Logical guild continuity: availability-aware support signal; missing/unresolved is neutral.");
line("- Exact name / fusion base name / name history: direct identity anchors when not contradicted.");
line("- Assignment/reservation: global conflict control, not per-candidate support evidence.");
line("");

line("## C. Evidence collision metrics");
printEvidenceMetric("Exact name", positiveSamples, falseControlSamples, (sample) => sample.candidate.evidence.exactName, "identityAnchor");
printEvidenceMetric("Fusion base name", positiveSamples, falseControlSamples, (sample) => sample.candidate.evidence.fusionBaseName, "identityAnchor");
printEvidenceMetric("Same logical guild by name", positiveSamples, falseControlSamples, (sample) => sameText(sample.candidate.oldGuildName, sample.post?.guildName));
printEvidenceMetric("Level monotonicity", positiveSamples, falseControlSamples, (sample) => sample.candidate.evidence.levelConsistent !== false);
printEvidenceMetric("Level progression normal", positiveSamples, falseControlSamples, (sample) => sample.candidate.evidence.levelProgression.category === "normal");
printEvidenceMetric("Level progression plausible-burst", positiveSamples, falseControlSamples, (sample) => sample.candidate.evidence.levelProgression.category === "plausible-burst");
printEvidenceMetric("Level progression extreme", positiveSamples, falseControlSamples, (sample) => sample.candidate.evidence.levelProgression.category === "extreme-contradiction", "weakContradiction");
printEvidenceMetric("Base monotonicity", positiveSamples, falseControlSamples, (_sample, shape) => shape.monotonic === true);
printEvidenceMetric("Base ordering stable", positiveSamples, falseControlSamples, (_sample, shape) => shape.orderingStable === true);
printEvidenceMetric("3+ unchanged base stats", positiveSamples, falseControlSamples, (_sample, shape) => (shape.unchangedCount ?? -1) >= 3);
printEvidenceMetric("2 unchanged secondary base stats", positiveSamples, falseControlSamples, (_sample, shape) => (shape.secondaryUnchangedCount ?? -1) >= 2);
printEvidenceMetric("Main/constitution ratio stable within 5%", positiveSamples, falseControlSamples, (_sample, shape) => shape.ratiosStable.mainConstitution === true);
printEvidenceMetric("Secondary pair ratio stable within 5%", positiveSamples, falseControlSamples, (_sample, shape) => shape.ratiosStable.secondaryPair === true);
printEvidenceMetric("Luck/constitution ratio stable within 5%", positiveSamples, falseControlSamples, (_sample, shape) => shape.ratiosStable.luckConstitution === true);
printEvidenceMetric("Fortress continuity", positiveSamples, falseControlSamples, (sample) => sample.candidate.evidence.fortressContinuity === true);
printEvidenceMetric("Pet continuity", positiveSamples, falseControlSamples, (sample) => sample.candidate.evidence.petContinuity === true);
line("");

line("## D. Base attribute distributions");
printDistributionComparison("Unchanged base stat count", [0, 1, 2, 3, 4, 5, "n/a"], positiveSamples, falseControlSamples, (_sample, shape) => shape.unchangedCount);
line("");
line("Per-attribute unchanged and median delta:");
line("| attribute | positive unchanged | false unchanged | positive median delta | false median delta |");
line("| --- | ---: | ---: | ---: | ---: |");
ATTRIBUTES.forEach((attribute, index) => {
  const positiveShapes = positiveSamples.map(baseShapeFor);
  const falseShapes = falseControlSamples.map(baseShapeFor);
  const positiveUnchanged = positiveShapes.filter((shape) => shape.deltas[index] === 0).length;
  const falseUnchanged = falseShapes.filter((shape) => shape.deltas[index] === 0).length;
  const positiveDeltas = positiveShapes.map((shape) => shape.deltas[index]).filter((value): value is number => value != null);
  const falseDeltas = falseShapes.map((shape) => shape.deltas[index]).filter((value): value is number => value != null);
  line(
    `| ${attribute}.base | ${formatRate(positiveUnchanged, positiveShapes.length)} | ${formatRate(falseUnchanged, falseShapes.length)} | ${formatNumber(median(positiveDeltas), 0)} | ${formatNumber(median(falseDeltas), 0)} |`,
  );
});
line("");
line("Relative delta median by attribute:");
line("| attribute | positive median relative delta | false median relative delta |");
line("| --- | ---: | ---: |");
ATTRIBUTES.forEach((attribute, index) => {
  const positiveValues = positiveSamples
    .map((sample) => baseShapeFor(sample).relativeDeltas[index])
    .filter((value): value is number => value != null);
  const falseValues = falseControlSamples
    .map((sample) => baseShapeFor(sample).relativeDeltas[index])
    .filter((value): value is number => value != null);
  line(`| ${attribute}.base | ${formatNumber((median(positiveValues) ?? 0) * 100, 2)}% | ${formatNumber((median(falseValues) ?? 0) * 100, 2)}% |`);
});
line("");

line("## E. Fortress, pets, guild availability");
const availabilityMetric = (label: string, getter: (sample: CandidateSample) => boolean | null) => {
  const positiveAvailable = positiveSamples.filter((sample) => getter(sample) != null).length;
  const falseAvailable = falseControlSamples.filter((sample) => getter(sample) != null).length;
  const positiveTrue = positiveSamples.filter((sample) => getter(sample) === true).length;
  const falseTrue = falseControlSamples.filter((sample) => getter(sample) === true).length;
  const positiveFalse = positiveSamples.filter((sample) => getter(sample) === false).length;
  const falseFalse = falseControlSamples.filter((sample) => getter(sample) === false).length;
  line(`${label}: positive available=${formatRate(positiveAvailable, positiveSamples.length)} true=${positiveTrue} contradiction=${positiveFalse}; false available=${formatRate(falseAvailable, falseControlSamples.length)} true=${falseTrue} contradiction=${falseFalse}`);
};
availabilityMetric("Guild", (sample) => (sample.candidate.oldGuildName && sample.post?.guildName ? sameText(sample.candidate.oldGuildName, sample.post.guildName) : null));
availabilityMetric("Fortress", (sample) => sample.candidate.evidence.fortressContinuity);
availabilityMetric("Pets", (sample) => sample.candidate.evidence.petContinuity);
line("Missing/unavailable guild, fortress, or pets should remain neutral.");
line("");

line("## F. F2PKrümel / Erdkrümel deep dive");
const f2pViableSamples = f2pResult.candidates
  .filter((candidate) => !candidate.rejected)
  .map((candidate) => sampleFor(f2pResult, candidate, candidate.oldIdentifier === ERD_HISTORICAL_ID ? "positive" : "false", "review-hard-false"))
  .filter((sample): sample is CandidateSample => Boolean(sample));
line(`F2PKrümel viable candidates=${f2pViableSamples.length}`);
f2pViableSamples.forEach((sample, index) => {
  const marker = normalizeKey(sample.candidate.oldIdentifier) === normalizeKey(ERD_HISTORICAL_ID) ? "[GROUND TRUTH] " : "";
  line(`${index + 1}. ${marker}${sampleLabel(sample)} ${describeShape(sample)}`);
});
line("");
const erdShape = baseShapeFor(erdSample);
const sameGuildSubset = f2pViableSamples.filter((sample) => sameText(sample.candidate.oldGuildName, sample.post?.guildName));
const erdUnchangedPeers = f2pViableSamples.filter((sample) => baseShapeFor(sample).unchangedCount === erdShape.unchangedCount).length;
const erdBetterUnchangedCount = f2pViableSamples.filter(
  (sample) => (baseShapeFor(sample).unchangedCount ?? -1) > (erdShape.unchangedCount ?? -1),
).length;
const erdUnchangedRank =
  erdBetterUnchangedCount === 0 && erdUnchangedPeers <= 3
    ? "best/tied-best"
    : `common/no separation (${erdUnchangedPeers}/${f2pViableSamples.length} share this count)`;
const erdGuildRank = sameText(erdSample.candidate.oldGuildName, erdSample.post?.guildName) ? `shared with ${sameGuildSubset.length - 1} others` : "weak";
const erdLevelRank = erdSample.candidate.evidence.levelProgression.category;
line("Erdkrümel ordinal position:");
line(`- Base unchanged count: ${erdShape.unchangedCount ?? "n/a"} -> ${erdUnchangedRank}`);
line(`- Guild continuity: ${erdGuildRank}`);
line(`- Level progression: ${erdLevelRank}`);
line(`- Name evidence: exact=${erdSample.candidate.evidence.exactName} fusionBase=${erdSample.candidate.evidence.fusionBaseName} -> weak for rename case`);
line(`- Fortress evidence: ${erdSample.candidate.evidence.fortressContinuity ?? "unavailable"} -> neutral here`);
line(`- Pets evidence: ${erdSample.candidate.evidence.petContinuity ?? "unavailable"}`);
line("");
line("Same-guild candidate subset:");
sameGuildSubset.forEach((sample, index) => {
  const marker = normalizeKey(sample.candidate.oldIdentifier) === normalizeKey(ERD_HISTORICAL_ID) ? "[GROUND TRUTH] " : "";
  line(`${index + 1}. ${marker}${sampleLabel(sample)} ${describeShape(sample)}`);
});
line("");

line("## G. Ordinal evidence calibration draft");
line("| Evidence family | Proposed ordinal category | Rationale |");
line("| --- | --- | --- |");
line("| Class mismatch / reliable origin mismatch / reliable level regression / individual base-stat regression | hardContradiction | Already product hard rejects and should stay outside support weighting. |");
line("| Exact name / fusion base name | identityAnchor | Direct identity signal; still subject to hard contradictions and assignment conflicts. |");
line("| 3+ unchanged base stats, especially secondary stats | strongSupport candidate | More specific than monotonicity; keep empirical guard because false collisions still exist. |");
line("| Same confirmed logical guild | support candidate | Useful reducer, but F2PKrümel still has a same-guild collision set. |");
line("| Fortress continuity | support/strongSupport candidate when available | Often decisive for semantic-ready cases, but unavailable must stay neutral. |");
line("| Pet continuity | weakSupport/support candidate | Helpful but can collide across hard false controls. |");
line("| Base monotonicity | neutral eligibility / weakSupport only in combination | Too broad; all difficult false controls pass. |");
line("| Base ordering / simple ratios | diagnostic weakSupport | Needs combination with unchanged stats or guild; not an anchor alone. |");
line("| Level monotonicity | neutral eligibility | All difficult false controls pass; hard only on regression. |");
line("| Normal level progression | support modifier | Can break ties in current product logic, but not an identity anchor. |");
line("| Plausible burst | neutral/weakSupport | Acceptable but less selective than normal progression. |");
line("| Extreme positive progression | weakContradiction unless protected by identityAnchor/strong semantic evidence | Current warning/cleanup role is supported conceptually. |");
line("");

line("## H. Resolver architecture recommendation");
line("1. Keep hardContradictions as an independent gate before any positive evidence hierarchy.");
line("2. Represent evidence as named ordinal chips, not additive numeric weights.");
line("3. Split baseAttributesConsistent into baseMonotonicity plus fingerprint features: unchanged count, unchanged secondary stats, ordering, and small ratio checks.");
line("4. Treat missing guild/fortress/pets as neutral, never negative.");
line("5. Let assignment/reservation stay as global conflict handling after candidate evidence classification.");
line("6. Validate any future Ready rule against both positive controls and this review false-control pool before enabling it.");

await playerStore.close();
await guildStore.close();
await deleteDB(`player-evidence-calibration-${suffix}`);
await deleteDB(`guild-evidence-calibration-${suffix}`);

fs.writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`, "utf8");
console.log(lines.join("\n"));
console.log(`\nWrote ${REPORT_PATH}`);
