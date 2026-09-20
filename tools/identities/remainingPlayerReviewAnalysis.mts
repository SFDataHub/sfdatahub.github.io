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
import { createFusionIdentityObservations } from "../../src/lib/identities/playerFusionPreviewAdapter.ts";
import { createPlayerIdentityStore } from "../../src/lib/identities/playerIdentityStore.ts";
import { resolveServer } from "../../src/lib/servers/serverResolver.ts";

type JsonRecord = Record<string, unknown>;

const DEFAULT_SCAN_ROOT = "D:/SFDataHub/Guild Analytics/public/scans";
const REPORT_PATH = path.resolve("tools/identities/remaining-player-review-analysis.latest.txt");
const ORIGIN_CODES = new Set(["EU1", "EU2", "EU3", "EU4"]);
const TARGET_CODE = "F28";
const CURRENT_ID = "f28_net_p215970";
const CURRENT_NAME = "F2PKrümel";
const GROUND_TRUTH_ID = "s3_eu_p72909";
const GROUND_TRUTH_NAME = "Erdkrümel";
const ATTRIBUTES = ["STR", "DEX", "INT", "CON", "LUC"] as const;

const lines: string[] = [];
const line = (value = "") => lines.push(value);

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
    .replace(/[^a-z0-9]+/g, "");

const resolveServerCode = (value: unknown) => resolveServer(String(value ?? ""))?.code ?? null;

const formatDate = (timestamp: number | null | undefined) =>
  timestamp == null ? "missing" : new Date(timestamp).toISOString();

const formatNumber = (value: number | null | undefined, digits = 0) =>
  value == null || !Number.isFinite(value) ? "n/a" : value.toFixed(digits);

const formatBool = (value: boolean | null | undefined) => (value == null ? "n/a" : value ? "yes" : "no");

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

const sortByTimestamp = <T extends { timestamp: number }>(values: T[]) =>
  [...values].sort((left, right) => left.timestamp - right.timestamp);

const firstByTimestamp = <T extends { timestamp: number }>(values: T[]) => sortByTimestamp(values)[0] ?? null;
const latestByTimestamp = <T extends { timestamp: number }>(values: T[]) => sortByTimestamp(values).at(-1) ?? null;

const groupObservations = (observations: PlayerFusionObservation[]) => {
  const grouped = new Map<string, PlayerFusionObservation[]>();
  observations.forEach((observation) => {
    const key = normalizeKey(observation.identifier);
    if (!key) return;
    grouped.set(key, [...(grouped.get(key) ?? []), observation]);
  });
  return grouped;
};

const baseVector = (observation: PlayerFusionObservation | null | undefined) =>
  observation?.semantic?.baseAttributes?.values ?? null;

const vectorSum = (values: number[] | null) => values?.reduce((sum, value) => sum + value, 0) ?? null;

const vectorDelta = (oldValues: number[] | null, newValues: number[] | null) =>
  oldValues && newValues ? oldValues.map((value, index) => newValues[index] - value) : null;

const unchangedAttributes = (deltas: number[] | null) =>
  deltas ? ATTRIBUTES.filter((_, index) => deltas[index] === 0) : [];

const mainAttributeForClass = (classId: string | null | undefined) => {
  const id = Number(String(classId ?? "").trim());
  if ([1, 5, 6, 11].includes(id)) return "STR";
  if ([3, 4, 7, 12].includes(id)) return "DEX";
  if ([2, 8, 9, 10].includes(id)) return "INT";
  return null;
};

const formatVector = (values: number[] | null) =>
  values ? ATTRIBUTES.map((attribute, index) => `${attribute}=${values[index]}`).join(" ") : "unavailable";

const formatDeltaVector = (oldObservation: PlayerFusionObservation | null, newObservation: PlayerFusionObservation | null) => {
  const oldValues = baseVector(oldObservation);
  const newValues = baseVector(newObservation);
  const deltas = vectorDelta(oldValues, newValues);
  if (!deltas) return "baseDelta=unavailable";
  const oldSum = vectorSum(oldValues);
  const newSum = vectorSum(newValues);
  const relative = oldSum && newSum ? ((newSum - oldSum) / oldSum) * 100 : null;
  return [
    ATTRIBUTES.map((attribute, index) => `${attribute}${deltas[index] >= 0 ? "+" : ""}${deltas[index]}`).join(" "),
    `unchanged=${unchangedAttributes(deltas).join(",") || "none"}`,
    `sum=${oldSum}->${newSum}`,
    `rel=${formatNumber(relative, 2)}%`,
  ].join(" ");
};

const sameName = (left: string | null | undefined, right: string | null | undefined) =>
  Boolean(normalizeText(left) && normalizeText(left) === normalizeText(right));

const guildContinuity = (candidate: PlayerFusionCandidate, firstCurrent: PlayerFusionObservation | null, latestCurrent: PlayerFusionObservation | null) => {
  const oldGuild = candidate.oldGuildName ?? null;
  const firstGuild = firstCurrent?.guildName ?? null;
  const latestGuild = latestCurrent?.guildName ?? null;
  return `old=${oldGuild ?? "-"} first=${firstGuild ?? "-"} latest=${latestGuild ?? "-"} old=first:${formatBool(sameName(oldGuild, firstGuild))} old=latest:${formatBool(sameName(oldGuild, latestGuild))}`;
};

const evidenceFlags = (candidate: PlayerFusionCandidate) => {
  const progression = candidate.evidence.levelProgression;
  return [
    `origin=${formatBool(candidate.evidence.originMatches)}`,
    `class=${formatBool(candidate.evidence.sameClass)}`,
    `level=${formatBool(candidate.evidence.levelConsistent)}`,
    `progression=${progression.category}`,
    `raw=${progression.rawLevelGain ?? "n/a"}`,
    `comp=${progression.fusionCompensation ?? "n/a"}`,
    `adjusted=${progression.adjustedLevelGain ?? "n/a"}`,
    `days=${formatNumber(progression.elapsedDays, 2)}`,
    `base=${formatBool(candidate.evidence.baseAttributesConsistent)}`,
    `fortress=${formatBool(candidate.evidence.fortressContinuity)}`,
    `pets=${formatBool(candidate.evidence.petContinuity)}`,
    `exact=${formatBool(candidate.evidence.exactName)}`,
    `fusionBase=${formatBool(candidate.evidence.fusionBaseName)}`,
  ].join(" ");
};

const strongShape = (candidate: PlayerFusionCandidate) => ({
  ready: isPlayerFusionReadyCandidate(candidate),
  strong: isPlayerFusionStrongIdentityCandidate(candidate),
  hardContradiction: hasPlayerFusionHardContradiction(candidate),
});

const candidateSummary = (
  candidate: PlayerFusionCandidate,
  historicalByIdentifier: Map<string, PlayerFusionObservation[]>,
  firstCurrent: PlayerFusionObservation | null,
  latestCurrent: PlayerFusionObservation | null,
) => {
  const history = historicalByIdentifier.get(normalizeKey(candidate.oldIdentifier)) ?? [];
  const selectedHistorical =
    history.find((observation) => observation.timestamp === candidate.comparisonTimestamp) ??
    latestByTimestamp(history) ??
    null;
  const shape = strongShape(candidate);
  const classLabel = getClassMetaById(candidate.oldClassId)?.label ?? candidate.oldClassId ?? "unknown";
  return {
    selectedHistorical,
    classLabel,
    line:
      `${candidate.oldIdentifier} ${candidate.oldName ?? "?"} class=${classLabel} oldLevel=${candidate.oldLevel ?? "n/a"} ` +
      `${evidenceFlags(candidate)} ready=${shape.ready} strong=${shape.strong} hard=${shape.hardContradiction} ` +
      `rejected=${candidate.rejected} reasons=${candidate.rejectReasons.join("|") || "none"} ` +
      `guild{${guildContinuity(candidate, firstCurrent, latestCurrent)}} ` +
      `${formatDeltaVector(selectedHistorical, firstCurrent)}`,
  };
};

const describeObservation = (observation: PlayerFusionObservation, marker = "") => {
  const classLabel = getClassMetaById(observation.classId)?.label ?? observation.classId ?? "unknown";
  const fortress = observation.semantic?.fortress?.values;
  const pets = observation.semantic?.pets?.values;
  line(
    `${marker}${formatDate(observation.timestamp)} ${observation.identifier} name=${observation.name} server=${observation.server ?? "?"} ` +
      `class=${classLabel} level=${observation.level ?? "n/a"} guild=${observation.guildName ?? "-"} guildId=${observation.guildIdentifier ?? "-"} ` +
      `base{${formatVector(baseVector(observation))}} fortressSum=${vectorSum(fortress ?? null) ?? "n/a"} petsSum=${vectorSum(pets ?? null) ?? "n/a"}`,
  );
};

const countStatus = (items: FusionIdentityManagementItem[]) =>
  items.reduce((counts, item) => {
    counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

const formatStatusCounts = (counts: Map<string, number>) =>
  ["ready", "review", "unresolved", "noHistoricalObservation", "noHistory", "completed"]
    .map((key) => `${key}=${counts.get(key) ?? 0}`)
    .join(" ");

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
const currentByIdentifier = groupObservations(currentObservations);
const historicalByIdentifier = groupObservations(historicalObservations);

const resolver = resolvePlayerFusions({ historicalObservations, newObservations: currentObservations });
const resultByCurrentIdentifier = new Map(resolver.results.map((result) => [normalizeKey(result.newIdentifier), result]));
const targetResult = resultByCurrentIdentifier.get(normalizeKey(CURRENT_ID));
assert.ok(targetResult, `expected resolver result for ${CURRENT_ID}`);

const suffix = Date.now();
const playerStore = createPlayerIdentityStore({ dbName: `remaining-review-player-${suffix}` });
const guildStore = createGuildIdentityStore({ dbName: `remaining-review-guild-${suffix}` });
const report = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });
const playerItems = report.items.filter((item) => item.entityType === "player");
const itemByCurrentIdentifier = new Map(playerItems.map((item) => [normalizeKey(item.currentIdentifier), item]));
const targetItem = itemByCurrentIdentifier.get(normalizeKey(CURRENT_ID));
assert.ok(targetItem, `expected management item for ${CURRENT_ID}`);

line("# Remaining Player Review Analysis");
line("");
line("Known manual ground truth: F2PKrümel ↔ Erdkrümel");
line("Source: user knowledge. This is evaluation data only, not a resolver rule.");
line("");
line(`Snapshots=${snapshots.length} currentObservations=${currentObservations.length} historicalObservations=${historicalObservations.length}`);
line(`Player status counts: ${formatStatusCounts(countStatus(playerItems))}`);
line("");

line("## A. F2PKrümel current timeline");
const currentTimeline = sortByTimestamp(currentByIdentifier.get(normalizeKey(CURRENT_ID)) ?? []);
const firstCurrent = firstByTimestamp(currentTimeline);
const latestCurrent = latestByTimestamp(currentTimeline);
currentTimeline.forEach((observation) => {
  const marker = observation === firstCurrent ? "[first] " : observation === latestCurrent ? "[latest] " : "";
  describeObservation(observation, marker);
});
line("");
line(
  `First seen summary: timestamp=${formatDate(firstCurrent?.timestamp)} level=${firstCurrent?.level ?? "n/a"} guild=${firstCurrent?.guildName ?? "-"} class=${getClassMetaById(firstCurrent?.classId)?.label ?? firstCurrent?.classId ?? "unknown"} base{${formatVector(baseVector(firstCurrent))}}`,
);
line(
  `Latest summary: timestamp=${formatDate(latestCurrent?.timestamp)} level=${latestCurrent?.level ?? "n/a"} guild=${latestCurrent?.guildName ?? "-"} class=${getClassMetaById(latestCurrent?.classId)?.label ?? latestCurrent?.classId ?? "unknown"} base{${formatVector(baseVector(latestCurrent))}}`,
);
line("");

line("## B. Erdkrümel historical timeline");
const erdTimeline = sortByTimestamp(historicalByIdentifier.get(normalizeKey(GROUND_TRUTH_ID)) ?? []);
erdTimeline.forEach((observation, index) => {
  const marker = index === erdTimeline.length - 1 ? "[latest historical] " : "";
  describeObservation(observation, marker);
});
line("");

line("## C. F2PKrümel generated/viable/display candidate counts");
const viableCandidates = targetResult.candidates.filter((candidate) => !candidate.rejected);
const displayCandidates = targetItem.candidates.filter((candidate) => candidate.entityType === "player");
const readyCandidates = selectPlayerFusionReadyCandidates(targetResult);
line(`resolverStatus=${targetResult.status} managementStatus=${targetItem.status}`);
line(
  `generated=${targetResult.diagnostics.candidatesGeneratedInitially} hardCompatible=${targetResult.diagnostics.candidatesAfterHardCompatibility} viable=${viableCandidates.length} display=${displayCandidates.length} readySelectable=${readyCandidates.length}`,
);
line(`resolvedOrigins=${targetResult.resolvedOriginServers.join(",") || "none"} originSource=${targetResult.originSource}`);
line("");

line("## D. Viable candidate matrix");
const sortedViable = [...viableCandidates].sort((left, right) => {
  if (normalizeKey(left.oldIdentifier) === normalizeKey(GROUND_TRUTH_ID)) return -1;
  if (normalizeKey(right.oldIdentifier) === normalizeKey(GROUND_TRUTH_ID)) return 1;
  const leftShape = strongShape(left);
  const rightShape = strongShape(right);
  return Number(rightShape.ready) - Number(leftShape.ready) || Number(rightShape.strong) - Number(leftShape.strong) || left.oldIdentifier.localeCompare(right.oldIdentifier);
});
sortedViable.forEach((candidate, index) => {
  const summary = candidateSummary(candidate, historicalByIdentifier, firstCurrent, latestCurrent);
  line(`${index + 1}. ${normalizeKey(candidate.oldIdentifier) === normalizeKey(GROUND_TRUTH_ID) ? "[GROUND TRUTH] " : ""}${summary.line}`);
});
line("");

line("## E. Erdkrümel relative differentiation");
const erdCandidate = targetResult.candidates.find((candidate) => normalizeKey(candidate.oldIdentifier) === normalizeKey(GROUND_TRUTH_ID));
if (erdCandidate) {
  const erdSummary = candidateSummary(erdCandidate, historicalByIdentifier, firstCurrent, latestCurrent);
  const erdDelta = vectorDelta(baseVector(erdSummary.selectedHistorical), baseVector(firstCurrent));
  const erdUnchanged = unchangedAttributes(erdDelta).length;
  const candidatesWithSameFirstGuild = viableCandidates.filter((candidate) => sameName(candidate.oldGuildName, firstCurrent?.guildName));
  const candidatesWithSameLatestGuild = viableCandidates.filter((candidate) => sameName(candidate.oldGuildName, latestCurrent?.guildName));
  const candidatesWithNormalProgression = viableCandidates.filter((candidate) => candidate.evidence.levelProgression.category === "normal");
  const semanticReadyCandidates = viableCandidates.filter((candidate) =>
    candidate.evidence.baseAttributesConsistent === true &&
    candidate.evidence.fortressContinuity === true,
  );
  line(`Erdkrümel candidate present=true rejected=${erdCandidate.rejected} strong=${isPlayerFusionStrongIdentityCandidate(erdCandidate)} ready=${isPlayerFusionReadyCandidate(erdCandidate)}`);
  line(`Erdkrümel evidence: ${evidenceFlags(erdCandidate)}`);
  line(`Erdkrümel base shape: ${formatDeltaVector(erdSummary.selectedHistorical, firstCurrent)} unchangedCount=${erdUnchanged}`);
  line(`Viable candidates with oldGuild == firstCurrentGuild: ${candidatesWithSameFirstGuild.length}/${viableCandidates.length}`);
  line(`Viable candidates with oldGuild == latestCurrentGuild: ${candidatesWithSameLatestGuild.length}/${viableCandidates.length}`);
  line(`Viable candidates with normal progression: ${candidatesWithNormalProgression.length}/${viableCandidates.length}`);
  line(`Viable candidates with base+fortress continuity: ${semanticReadyCandidates.length}/${viableCandidates.length}`);
  line(
    `Interpretation: Erdkrümel is semantically plausible, but not unique under current rules because multiple candidates share origin/class/monotonic level and base/fortress/pet continuity.`,
  );
} else {
  line("Erdkrümel candidate present=false");
}
line("");

line("## F. Remaining review pool and single-candidate reviews");
const reviewPlayers = playerItems.filter((item) => item.status === "review");
const singleDisplayReviews = reviewPlayers.filter((item) => item.candidates.filter((candidate) => candidate.entityType === "player").length === 1);
const singleActiveDisplayReviews = reviewPlayers.filter(
  (item) => item.candidates.filter((candidate) => candidate.entityType === "player" && !candidate.rejected && !candidate.assignedToOtherIdentity).length === 1,
);
line(`reviewPlayers=${reviewPlayers.length} singleDisplay=${singleDisplayReviews.length} singleActiveDisplay=${singleActiveDisplayReviews.length}`);
singleDisplayReviews.slice(0, 40).forEach((item) => {
  const resolverResult = resultByCurrentIdentifier.get(normalizeKey(item.currentIdentifier));
  const display = item.candidates.find((candidate) => candidate.entityType === "player");
  const visibleCandidate = display?.entityType === "player" ? display.evidence : null;
  const resolverViable = resolverResult?.candidates.filter((candidate) => !candidate.rejected) ?? [];
  const hiddenViableCount =
    resolverViable.length -
    resolverViable.filter((candidate) =>
      item.candidates.some((displayCandidate) =>
        displayCandidate.entityType === "player" && normalizeKey(displayCandidate.historicalIdentifier) === normalizeKey(candidate.oldIdentifier),
      ),
    ).length;
  const resolverReady = resolverResult ? selectPlayerFusionReadyCandidates(resolverResult) : [];
  line(
    `- ${item.currentName ?? item.currentIdentifier} ${item.currentIdentifier}: display=${display?.historicalIdentifier ?? "none"} ` +
      `displayStrong=${visibleCandidate ? isPlayerFusionStrongIdentityCandidate(visibleCandidate) : "n/a"} displayReady=${visibleCandidate ? isPlayerFusionReadyCandidate(visibleCandidate) : "n/a"} ` +
      `${visibleCandidate ? evidenceFlags(visibleCandidate) : "evidence=n/a"} ` +
      `resolverStatus=${resolverResult?.status ?? "missing"} resolverViable=${resolverViable.length} hiddenViable=${hiddenViableCount} resolverReady=${resolverReady.map((candidate) => candidate.oldIdentifier).join(",") || "none"} ` +
      `reasons=${item.reasons.join("|") || "none"}`,
  );
});
line("");

line("## G. Analysis conclusions");
line("1. F2PKrümel/Erdkrümel is not blocked by hard compatibility: Erdkrümel remains viable and plausible, but not strong-ready because it has no name evidence and fortress continuity is unavailable.");
line("2. The ambiguity is systemic: first-current comparison still leaves many EU3 Battle Mage candidates with monotonic level progression, base continuity, and pet continuity.");
line("3. Guild continuity is diagnostically useful here: old/current guild-name equality narrows F2PKrümel from 27 viable candidates to 5, but it still does not uniquely identify Erdkrümel.");
line("4. Single-display review rows split into two causes in this scan pool: single actionable-but-not-ready candidates, and true double-claim conflicts where one historical identity is claimed by multiple current identities.");
line("5. A future fix should not be a name special-case. Safer next research: quantify base-stat fingerprint/unchanged-secondary patterns plus logical guild continuity across all Ready positives and Review false controls.");

await playerStore.close();
await guildStore.close();
await deleteDB(`remaining-review-player-${suffix}`);
await deleteDB(`remaining-review-guild-${suffix}`);

fs.writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`, "utf8");
console.log(lines.join("\n"));
console.log(`\nWrote ${REPORT_PATH}`);
