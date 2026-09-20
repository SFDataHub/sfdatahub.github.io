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
  type FusionIdentityManagementStatus,
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

type CaseDefinition = {
  label: string;
  currentName: string;
  focusHistoricalNames: string[];
};

type BaseAttributeComparison = {
  attribute: string;
  pre: number | null;
  post: number | null;
  delta: number | null;
  availability: string;
  regression: boolean;
};

const DEFAULT_SCAN_ROOT = "D:/SFDataHub/Guild Analytics/public/scans";
const REPORT_PATH = path.resolve("tools/identities/player-evidence-priority-analysis.latest.txt");
const ORIGIN_SERVER_CODES = new Set(["EU1", "EU2", "EU3", "EU4"]);
const TARGET_SERVER_CODE = "F28";
const ATTRIBUTE_LABELS = ["STR.base", "DEX.base", "INT.base", "CON.base", "LUC.base"];
const CASES: CaseDefinition[] = [
  {
    label: "Jurik Joriksson",
    currentName: "Jurik Joriksson",
    focusHistoricalNames: ["Jurik Joriksson"],
  },
  {
    label: "Derton",
    currentName: "Derton",
    focusHistoricalNames: ["Derton"],
  },
  {
    label: "Zachi",
    currentName: "Zachi",
    focusHistoricalNames: ["Zachi"],
  },
  {
    label: "Hardiy",
    currentName: "Hardiy",
    focusHistoricalNames: ["HardiyDK", "Darth Monk", "Matti", "Rover", "Svenner1986"],
  },
];

const reportLines: string[] = [];
const line = (value = "") => {
  reportLines.push(value);
  console.log(value);
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
    .replace(/ß/g, "ss")
    .toLowerCase();

const normalizeText = (value: unknown) =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/\s+/g, " ");

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

const formatDate = (value: number | null | undefined) => (value == null ? "missing" : new Date(value).toISOString());
const formatNumber = (value: number | null | undefined, digits = 2) =>
  value == null ? "n/a" : value.toFixed(digits);

const isReliableLevel = (observation: PlayerFusionObservation) =>
  typeof observation.level === "number" &&
  Number.isFinite(observation.level) &&
  observation.level > 0 &&
  (observation.levelAvailability == null || observation.levelAvailability === "available");

const groupByIdentifier = (observations: PlayerFusionObservation[]) => {
  const grouped = new Map<string, PlayerFusionObservation[]>();
  observations.forEach((observation) => {
    const key = normalizeKey(observation.identifier);
    if (!key) return;
    grouped.set(key, [...(grouped.get(key) ?? []), observation]);
  });
  return grouped;
};

const latestReliableBefore = (observations: PlayerFusionObservation[], boundaryTimestamp: number | null) =>
  [...observations]
    .filter((observation) => isReliableLevel(observation) && (boundaryTimestamp == null || observation.timestamp < boundaryTimestamp))
    .sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;

const earliestReliable = (observations: PlayerFusionObservation[]) =>
  [...observations].filter(isReliableLevel).sort((left, right) => left.timestamp - right.timestamp)[0] ?? null;

const formatObservation = (observation: PlayerFusionObservation) =>
  `${formatDate(observation.timestamp)} server=${resolveServerCode(observation.server) ?? observation.server ?? "unknown"} ` +
  `name=${observation.name} class=${observation.classId ?? "n/a"} level=${observation.level ?? "n/a"} ` +
  `guild=${observation.guildIdentifier ?? observation.guildName ?? "n/a"} baseAvailability=${observation.semantic?.baseAttributes?.availability ?? "missing"} ` +
  `base=[${observation.semantic?.baseAttributes?.values?.join(",") ?? "n/a"}]`;

const compareBaseAttributes = (
  oldObservation: PlayerFusionObservation | null,
  newObservation: PlayerFusionObservation | null,
): BaseAttributeComparison[] => {
  const oldVector = oldObservation?.semantic?.baseAttributes ?? null;
  const newVector = newObservation?.semantic?.baseAttributes ?? null;
  return ATTRIBUTE_LABELS.map((attribute, index) => {
    const pre = oldVector?.availability === "available" ? oldVector.values?.[index] ?? null : null;
    const post = newVector?.availability === "available" ? newVector.values?.[index] ?? null : null;
    const delta = pre == null || post == null ? null : post - pre;
    const availability =
      oldVector?.availability === "available" && newVector?.availability === "available"
        ? "available"
        : `pre=${oldVector?.availability ?? "missing"} post=${newVector?.availability ?? "missing"}`;
    return {
      attribute,
      pre,
      post,
      delta,
      availability,
      regression: delta != null && delta < 0,
    };
  });
};

const hasBaseRegression = (comparisons: BaseAttributeComparison[]) =>
  comparisons.some((comparison) => comparison.regression);

const hardContradictionsFor = (candidate: PlayerFusionCandidate, baseComparisons: BaseAttributeComparison[]) => ({
  classMismatch: candidate.rejectReasons.includes("different-class"),
  levelRegression: candidate.rejectReasons.includes("level-regression") || candidate.rejectReasons.includes("level-drop"),
  baseRegression:
    candidate.rejectReasons.includes("base-stat-regression") ||
    candidate.rejectReasons.includes("base-attributes-contradiction") ||
    hasBaseRegression(baseComparisons),
});

const strongIdentitySignalsFor = (candidate: PlayerFusionCandidate, wasPreviousReady: boolean) => ({
  exactName: candidate.evidence.exactName,
  fusionBaseName: candidate.evidence.fusionBaseName,
  previousReadyWinner: wasPreviousReady,
  semanticReadyShape:
    candidate.evidence.sameClass === true &&
    candidate.evidence.baseAttributesConsistent === true &&
    candidate.evidence.fortressContinuity === true,
});

const summarizeCandidate = (
  candidate: PlayerFusionCandidate,
  currentObservations: PlayerFusionObservation[],
  historicalObservations: PlayerFusionObservation[],
  wasPreviousReady: boolean,
) => {
  const post = earliestReliable(currentObservations);
  const pre = latestReliableBefore(historicalObservations, post?.timestamp ?? null);
  const base = compareBaseAttributes(pre, post);
  const hard = hardContradictionsFor(candidate, base);
  const strong = strongIdentitySignalsFor(candidate, wasPreviousReady);
  const rawGain = pre?.level != null && post?.level != null ? post.level - pre.level : null;

  return {
    candidate,
    pre,
    post,
    base,
    hard,
    strong,
    rawGain,
    elapsedDays: pre && post ? (post.timestamp - pre.timestamp) / (24 * 60 * 60 * 1000) : null,
    hardContradiction: hard.classMismatch || hard.levelRegression || hard.baseRegression,
    strongIdentity: strong.exactName || strong.fusionBaseName || strong.semanticReadyShape,
  };
};

const statusCounts = (items: FusionIdentityManagementItem[]) =>
  items.reduce(
    (counts, item) => ({ ...counts, [item.status]: (counts[item.status] ?? 0) + 1 }),
    {} as Record<FusionIdentityManagementStatus, number>,
  );

const candidateLine = (summary: ReturnType<typeof summarizeCandidate>) => {
  const progression = summary.candidate.evidence.levelProgression;
  return (
    `${summary.candidate.oldName ?? summary.candidate.oldIdentifier} ${summary.candidate.oldIdentifier} ` +
    `rejected=${summary.candidate.rejected} reasons=${summary.candidate.rejectReasons.join("|") || "none"} ` +
    `origin=${summary.candidate.evidence.originMatches} class=${summary.candidate.evidence.sameClass} ` +
    `levelMonotonic=${summary.candidate.evidence.levelConsistent} progression=${progression.category} ` +
    `raw=${progression.rawLevelGain ?? summary.rawGain ?? "n/a"} comp=${progression.fusionCompensation ?? "n/a"} ` +
    `adjusted=${progression.adjustedLevelGain ?? "n/a"} elapsed=${formatNumber(progression.elapsedDays ?? summary.elapsedDays)} ` +
    `base=${summary.candidate.evidence.baseAttributesConsistent} fortress=${summary.candidate.evidence.fortressContinuity} ` +
    `pets=${summary.candidate.evidence.petContinuity} exact=${summary.candidate.evidence.exactName} baseName=${summary.candidate.evidence.fusionBaseName}`
  );
};

const scanRoot = process.argv[2] ?? DEFAULT_SCAN_ROOT;
const snapshots = listJsonFiles(scanRoot)
  .map(readSnapshot)
  .filter((snapshot): snapshot is GuildHubLogicalScanSnapshot => Boolean(snapshot))
  .sort((left, right) => left.timestampMs - right.timestampMs);
assert.ok(snapshots.length > 0, "expected real scan snapshots");

const allObservations = snapshots.flatMap(createFusionIdentityObservations);
const currentObservations = allObservations.filter(
  (observation) => resolveServerCode(observation.server) === TARGET_SERVER_CODE,
);
const historicalObservations = allObservations.filter((observation) =>
  ORIGIN_SERVER_CODES.has(resolveServerCode(observation.server) ?? ""),
);
const observationsByIdentifier = groupByIdentifier(allObservations);
const currentByIdentifier = groupByIdentifier(currentObservations);
const historicalByIdentifier = groupByIdentifier(historicalObservations);

const strictResults = resolvePlayerFusions({
  historicalObservations,
  newObservations: currentObservations,
}).results;
const previousResults = resolvePlayerFusions({
  historicalObservations,
  newObservations: currentObservations,
  enableLevelProgressionEvidence: false,
}).results;
const strictResultByCurrent = new Map(strictResults.map((result) => [normalizeKey(result.newIdentifier), result]));
const previousResultByCurrent = new Map(previousResults.map((result) => [normalizeKey(result.newIdentifier), result]));

const suffix = Date.now();
const currentPlayerStore = createPlayerIdentityStore({ dbName: `evidence-priority-current-player-${suffix}` });
const currentGuildStore = createGuildIdentityStore({ dbName: `evidence-priority-current-guild-${suffix}` });
const previousPlayerStore = createPlayerIdentityStore({ dbName: `evidence-priority-previous-player-${suffix}` });
const previousGuildStore = createGuildIdentityStore({ dbName: `evidence-priority-previous-guild-${suffix}` });

const currentReport = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots,
  playerStore: currentPlayerStore,
  guildStore: currentGuildStore,
});
const previousReport = await buildFusionIdentityManagementReportFromSnapshots(
  { snapshots, playerStore: previousPlayerStore, guildStore: previousGuildStore },
  { enablePlayerLevelProgressionEvidence: false },
);

const currentPlayerItems = currentReport.items.filter((item) => item.entityType === "player");
const previousPlayerItems = previousReport.items.filter((item) => item.entityType === "player");
const currentItemById = new Map(currentPlayerItems.map((item) => [item.id, item]));
const previousItemById = new Map(previousPlayerItems.map((item) => [item.id, item]));

const findCurrentItemByName = (name: string) =>
  currentPlayerItems.find((item) => normalizeText(item.currentName) === normalizeText(name)) ?? null;

const findPreviousItem = (currentItem: FusionIdentityManagementItem | null) =>
  currentItem ? previousItemById.get(currentItem.id) ?? null : null;

const previousReadyCandidates = previousPlayerItems
  .filter((item) => item.status === "ready" && item.readyCandidateIdentifier)
  .flatMap((previousItem) => {
    const currentItem = currentItemById.get(previousItem.id);
    const result = strictResultByCurrent.get(normalizeKey(previousItem.currentIdentifier));
    const candidate = result?.candidates.find(
      (entry) => normalizeKey(entry.oldIdentifier) === normalizeKey(previousItem.readyCandidateIdentifier),
    );
    if (!currentItem || !candidate || !previousItem.readyCandidateIdentifier) return [];
    const summary = summarizeCandidate(
      candidate,
      currentByIdentifier.get(normalizeKey(currentItem.currentIdentifier)) ?? [],
      historicalByIdentifier.get(normalizeKey(previousItem.readyCandidateIdentifier)) ?? [],
      true,
    );
    return [{ previousItem, currentItem, summary }];
  });

const readyWarnings = previousReadyCandidates.filter(
  (entry) =>
    entry.summary.candidate.evidence.levelProgression.category === "extreme-contradiction" &&
    !entry.summary.hardContradiction,
);
const readyTrueHardContradictions = previousReadyCandidates.filter((entry) => entry.summary.hardContradiction);
const positiveBaseComparisons = previousReadyCandidates.flatMap((entry) => entry.summary.base);
const falseCandidateSummaries = currentPlayerItems.flatMap((item) => {
  const result = strictResultByCurrent.get(normalizeKey(item.currentIdentifier));
  if (!result) return [];
  return result.candidates
    .filter((candidate) => candidate.evidence.originMatches === true && candidate.evidence.sameClass === true)
    .filter((candidate) => !selectPlayerFusionReadyCandidates(result).some((ready) => ready.oldIdentifier === candidate.oldIdentifier))
    .map((candidate) => ({
      item,
      summary: summarizeCandidate(
        candidate,
        currentByIdentifier.get(normalizeKey(item.currentIdentifier)) ?? [],
        historicalByIdentifier.get(normalizeKey(candidate.oldIdentifier)) ?? [],
        false,
      ),
    }));
});
const falseBaseRegression = falseCandidateSummaries.filter((entry) => hasBaseRegression(entry.summary.base));
const falseBaseRegressionPlayers = new Set(
  falseBaseRegression.map((entry) => entry.item.currentIdentifier),
);

const simulateCase = (currentItem: FusionIdentityManagementItem, previousItem: FusionIdentityManagementItem | null) => {
  const result = strictResultByCurrent.get(normalizeKey(currentItem.currentIdentifier));
  if (!result) return { status: "unresolved", winner: null, reason: "no resolver result" };
  const previousReady = previousItem?.readyCandidateIdentifier ?? null;
  const currentObs = currentByIdentifier.get(normalizeKey(currentItem.currentIdentifier)) ?? [];
  const summaries = result.candidates.map((candidate) =>
    summarizeCandidate(
      candidate,
      currentObs,
      historicalByIdentifier.get(normalizeKey(candidate.oldIdentifier)) ?? [],
      previousReady != null && normalizeKey(candidate.oldIdentifier) === normalizeKey(previousReady),
    ),
  );
  const afterHard = summaries.filter((summary) => !summary.hardContradiction);
  const nameStrong = afterHard.filter((summary) => summary.strong.exactName || summary.strong.fusionBaseName);
  const semanticStrong = afterHard.filter((summary) => summary.strong.semanticReadyShape);
  const normalSemanticStrong = semanticStrong.filter(
    (summary) => summary.candidate.evidence.levelProgression.category === "normal",
  );
  const protectedStrong = nameStrong.length
    ? nameStrong
    : normalSemanticStrong.length === 1
      ? normalSemanticStrong
      : semanticStrong.length === 1
        ? semanticStrong
        : [];
  if (protectedStrong.length === 1) {
    return {
      status: "ready",
      winner: protectedStrong[0]?.candidate.oldIdentifier ?? null,
      reason: "unique strong identity without hard contradiction; progression warning only",
    };
  }
  const cleaned = afterHard.filter(
    (summary) =>
      protectedStrong.some((protectedSummary) => protectedSummary.candidate.oldIdentifier === summary.candidate.oldIdentifier) ||
      summary.candidate.evidence.levelProgression.category !== "extreme-contradiction",
  );
  const readyLike = cleaned.filter(
    (summary) =>
      summary.candidate.evidence.exactName ||
      summary.candidate.evidence.fusionBaseName ||
      (summary.candidate.evidence.sameClass === true &&
        summary.candidate.evidence.baseAttributesConsistent === true &&
        summary.candidate.evidence.fortressContinuity === true),
  );
  if (readyLike.length === 1) {
    return {
      status: "ready",
      winner: readyLike[0]?.candidate.oldIdentifier ?? null,
      reason: "ambiguous cleanup leaves one ready-like candidate",
    };
  }
  if (cleaned.length > 0) {
    return {
      status: "review",
      winner: null,
      reason: `${cleaned.length} candidates remain after hard contradictions and weak progression cleanup`,
    };
  }
  return {
    status: "unresolved",
    winner: null,
    reason: "all candidates removed by hard contradictions",
  };
};

line("# Player Evidence Priority Analysis");
line(`Report generated: ${new Date().toISOString()}`);
line(`Scan root=${scanRoot}`);
line(`Snapshots=${snapshots.length}`);
line("");

line("## A. Evidence Hierarchy Today");
line("Current resolver hard-rejects class mismatch, reliable level regression, base-stat regression, and origin mismatch.");
line("Extreme positive level progression is now plausibility evidence: it warns on protected strong matches and removes only weak cleanup candidates.");
line("Strong identity is derived from current evidence such as exact/fusion-base name or semantic-ready continuity, not from previous Ready status.");
line(`Previous counts: ${JSON.stringify(statusCounts(previousPlayerItems))}`);
line(`Current counts: ${JSON.stringify(statusCounts(currentPlayerItems))}`);

for (const caseDefinition of CASES) {
  const currentItem = findCurrentItemByName(caseDefinition.currentName);
  const previousItem = findPreviousItem(currentItem);
  line("");
  line(`## ${caseDefinition.label}`);
  if (!currentItem) {
    line("missing current item");
    continue;
  }
  const result = strictResultByCurrent.get(normalizeKey(currentItem.currentIdentifier));
  const previousResult = previousResultByCurrent.get(normalizeKey(currentItem.currentIdentifier));
  const previousReady = previousItem?.readyCandidateIdentifier ?? null;
  line(`current=${currentItem.currentIdentifier} name=${currentItem.currentName} statusToday=${currentItem.status} statusPrevious=${previousItem?.status ?? "missing"} previousReady=${previousReady ?? "none"} readyToday=${currentItem.readyCandidateIdentifier ?? "none"}`);
  line(`reasonCodesToday=${currentItem.reasonCodes.join("|") || "none"} reasonsToday=${currentItem.reasons.join(" || ") || "none"}`);
  line(`origin=${result?.resolvedOriginServers.join(",") || "unknown"} originSource=${result?.originSource ?? "missing"} previousStatus=${previousResult?.status ?? "missing"} currentStatus=${result?.status ?? "missing"}`);
  const currentOwnersOfPreviousReady = previousReady
    ? currentPlayerItems.filter((item) => normalizeKey(item.readyCandidateIdentifier) === normalizeKey(previousReady))
    : [];
  line(
    `reservationForPreviousReady=${previousReady ?? "none"} ownersToday=${
      currentOwnersOfPreviousReady
        .map((item) => `${item.currentName ?? item.currentIdentifier}(${item.currentIdentifier})`)
        .join(", ") || "none"
    }`,
  );
  const levelRegressionCandidates = result?.candidates.filter((candidate) => candidate.rejectReasons.includes("level-regression")) ?? [];
  line(
    `levelRegressionCandidates=${levelRegressionCandidates.length} ${
      levelRegressionCandidates
        .slice(0, 8)
        .map((candidate) => `${candidate.oldName ?? candidate.oldIdentifier}[${candidate.oldIdentifier}]`)
        .join(", ") || "none"
    }`,
  );
  line("Current observations:");
  (observationsByIdentifier.get(normalizeKey(currentItem.currentIdentifier)) ?? []).forEach((observation) =>
    line(`- ${formatObservation(observation)}`),
  );

  const focusCandidates = result?.candidates.filter((candidate) => {
    if (previousReady && normalizeKey(candidate.oldIdentifier) === normalizeKey(previousReady)) return true;
    return caseDefinition.focusHistoricalNames.some((name) => normalizeText(candidate.oldName) === normalizeText(name));
  }) ?? [];
  line("Candidate pipeline focus:");
  focusCandidates.forEach((candidate) => {
    const wasPreviousReady = Boolean(previousReady && normalizeKey(candidate.oldIdentifier) === normalizeKey(previousReady));
    const historical = historicalByIdentifier.get(normalizeKey(candidate.oldIdentifier)) ?? [];
    const summary = summarizeCandidate(
      candidate,
      currentByIdentifier.get(normalizeKey(currentItem.currentIdentifier)) ?? [],
      historical,
      wasPreviousReady,
    );
    line(`- ${candidateLine(summary)} previousReady=${wasPreviousReady} hardContradiction=${summary.hardContradiction} strongIdentity=${summary.strongIdentity}`);
    line(`  selectedPre=${summary.pre ? formatObservation(summary.pre) : "missing"}`);
    line(`  selectedPost=${summary.post ? formatObservation(summary.post) : "missing"}`);
    line("  base attributes:");
    summary.base.forEach((comparison) => {
      line(
        `  - ${comparison.attribute} pre=${comparison.pre ?? "n/a"} post=${comparison.post ?? "n/a"} delta=${comparison.delta ?? "n/a"} availability=${comparison.availability} regression=${comparison.regression}`,
      );
    });
    line("  historical observations:");
    historical.forEach((observation) => line(`  - ${formatObservation(observation)}`));
  });

  const simulation = simulateCase(currentItem, previousItem ?? null);
  line(`Simulation: status=${simulation.status} winner=${simulation.winner ?? "none"} reason=${simulation.reason}`);
}

line("");
line("## F. Base Stats Positive Controls");
line(`previousReadyMatchesCompared=${previousReadyCandidates.length}`);
line(`baseAttributeCellsCompared=${positiveBaseComparisons.length}`);
line(`positiveBaseRegressionCells=${positiveBaseComparisons.filter((comparison) => comparison.regression).length}`);
line(`previousReadyMatchesWithAnyHardContradiction=${readyTrueHardContradictions.length}`);
readyTrueHardContradictions.slice(0, 20).forEach((entry) =>
  line(
    `- ${entry.currentItem.currentName ?? entry.currentItem.currentIdentifier} current=${entry.currentItem.currentIdentifier} previousReady=${entry.previousItem.readyCandidateIdentifier} hard=${JSON.stringify(entry.summary.hard)} progression=${entry.summary.candidate.evidence.levelProgression.category}`,
  ),
);

line("");
line("## G. Base Regression False Candidates");
line(`falseCandidatesCompared=${falseCandidateSummaries.length}`);
line(`falseCandidatesWithAnyBaseRegression=${falseBaseRegression.length}`);
line(`reviewPlayersAffectedByBaseRegression=${falseBaseRegressionPlayers.size}`);

line("");
line("## H. Current Ready Warning Cases");
line(`previousReadyExtremeProgressionWithoutHardContradiction=${readyWarnings.length}`);
readyWarnings.slice(0, 50).forEach((entry) =>
  line(
    `- ${entry.currentItem.currentName ?? entry.currentItem.currentIdentifier} current=${entry.currentItem.currentIdentifier} historical=${entry.summary.candidate.oldName ?? entry.summary.candidate.oldIdentifier} ${entry.summary.candidate.oldIdentifier} progression=${entry.summary.candidate.evidence.levelProgression.category} raw=${entry.summary.candidate.evidence.levelProgression.rawLevelGain ?? "n/a"} adjusted=${entry.summary.candidate.evidence.levelProgression.adjustedLevelGain ?? "n/a"} strong exact=${entry.summary.strong.exactName} baseName=${entry.summary.strong.fusionBaseName} previousReady=${entry.summary.strong.previousReadyWinner} semantic=${entry.summary.strong.semanticReadyShape}`,
  ),
);

line("");
line("## I. Simulated New Hierarchy Summary");
CASES.forEach((caseDefinition) => {
  const currentItem = findCurrentItemByName(caseDefinition.currentName);
  const previousItem = findPreviousItem(currentItem);
  if (!currentItem) return;
  const simulation = simulateCase(currentItem, previousItem ?? null);
  line(
    `${caseDefinition.label}: product=${currentItem.status} simulated=${simulation.status} winner=${simulation.winner ?? "none"} reason=${simulation.reason}`,
  );
});

line("");
line("## J. Implemented Hierarchy");
line("Class mismatch, reliable level regression, and any reliable individual base-stat regression are hard contradictions.");
line("Extreme positive progression is warning-only for protected strong identity matches and cleanup evidence for weak alternatives.");
line("Global assignment/reservation still runs after candidate evaluation; strong-winner protection does not override assignment conflicts.");
line("Ready items do not carry progression or reservation reason codes after recompute.");
line("No Historical Observation remains reserved for missing matching observations, not for candidates eliminated by contradictions.");

fs.writeFileSync(REPORT_PATH, `${reportLines.join("\n")}\n`, "utf8");
line("");
line(`Full report written to ${REPORT_PATH}`);

await currentPlayerStore.close();
await currentGuildStore.close();
await previousPlayerStore.close();
await previousGuildStore.close();
await deleteDB(`evidence-priority-current-player-${suffix}`);
await deleteDB(`evidence-priority-current-guild-${suffix}`);
await deleteDB(`evidence-priority-previous-player-${suffix}`);
await deleteDB(`evidence-priority-previous-guild-${suffix}`);
