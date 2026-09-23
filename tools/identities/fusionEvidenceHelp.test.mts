import assert from "node:assert/strict";

import {
  FUSION_CLASSIFICATION_HELP,
  FUSION_EVIDENCE_GUIDE_SIGNALS,
  FUSION_EVIDENCE_RANK_HELP,
  FUSION_EVIDENCE_RANKS,
  GUILD_EVIDENCE_HELP,
  PLAYER_EVIDENCE_HELP,
  PLAYER_REJECT_REASON_HELP,
  getClassificationHelp,
  getEvidenceHelp,
  getPlayerRejectReasonHelp,
  type FusionEvidenceHelpDefinition,
} from "../../src/lib/identities/fusionEvidenceHelp.ts";
import type { GuildFusionEvidenceEntryType } from "../../src/lib/identities/guildFusionResolver.ts";
import type {
  PlayerFusionEvidenceEntryType,
  PlayerFusionRejectReason,
} from "../../src/lib/identities/playerFusionResolver.ts";

const expectedClassifications = [
  "anchored",
  "plausible",
  "rejected",
  "strong",
  "weak",
].sort();
const expectedPlayerEvidenceTypes: PlayerFusionEvidenceEntryType[] = [
  "assignment",
  "base-monotonicity",
  "base-ordering",
  "base-secondary-stability",
  "base-unchanged-stats",
  "class-compatibility",
  "exact-name",
  "fortress-continuity",
  "fusion-base-name",
  "guild-continuity",
  "level-monotonicity",
  "level-progression",
  "origin-compatibility",
  "pet-continuity",
  "portrait-continuity",
];
const expectedGuildEvidenceTypes: GuildFusionEvidenceEntryType[] = [
  "assignment",
  "exact-name",
  "fusion-base-name",
  "guild-progression",
  "leader-continuity",
  "leadership-core",
  "member-flow",
  "officer-continuity",
  "same-coa",
  "structural-rename",
  "unique-exact-name",
];
const expectedRejectReasons: PlayerFusionRejectReason[] = [
  "base-attributes-contradiction",
  "base-stat-regression",
  "different-class",
  "level-drop",
  "level-progression-extreme",
  "level-regression",
  "origin-mismatch",
];

const assertHelpDefinition = (
  definition: FusionEvidenceHelpDefinition | null,
  label: string,
) => {
  assert.ok(definition, `${label} is missing help metadata`);
  assert.ok(definition.titleKey, `${label} is missing a title key`);
  assert.ok(definition.descriptionKey, `${label} is missing a description key`);
  assert.equal(
    "strength" in definition,
    false,
    `${label} must not hardcode runtime strength`,
  );
};

assert.deepEqual(
  Object.keys(FUSION_CLASSIFICATION_HELP).sort(),
  expectedClassifications,
);
for (const classification of expectedClassifications) {
  assertHelpDefinition(
    getClassificationHelp(classification),
    `classification ${classification}`,
  );
}

assert.deepEqual(
  Object.keys(PLAYER_EVIDENCE_HELP).sort(),
  [...expectedPlayerEvidenceTypes].sort(),
);
for (const evidenceType of expectedPlayerEvidenceTypes) {
  assertHelpDefinition(
    getEvidenceHelp("player", evidenceType),
    `player evidence ${evidenceType}`,
  );
}

assert.deepEqual(
  Object.keys(GUILD_EVIDENCE_HELP).sort(),
  [...expectedGuildEvidenceTypes].sort(),
);
for (const evidenceType of expectedGuildEvidenceTypes) {
  assertHelpDefinition(
    getEvidenceHelp("guild", evidenceType),
    `guild evidence ${evidenceType}`,
  );
}

assert.deepEqual(
  Object.keys(PLAYER_REJECT_REASON_HELP).sort(),
  [...expectedRejectReasons].sort(),
);
for (const reason of expectedRejectReasons) {
  assertHelpDefinition(
    getPlayerRejectReasonHelp(reason),
    `player reject reason ${reason}`,
  );
}

for (const rank of FUSION_EVIDENCE_RANKS) {
  assertHelpDefinition(
    FUSION_EVIDENCE_RANK_HELP[rank],
    `evidence rank ${rank}`,
  );
}

for (const signal of FUSION_EVIDENCE_GUIDE_SIGNALS) {
  assert.ok(
    FUSION_EVIDENCE_RANKS.includes(signal.rank),
    `guide signal ${signal.labelKey} uses an unknown rank`,
  );
  assertHelpDefinition(
    getEvidenceHelp(signal.entityType, signal.evidenceType),
    `guide signal ${signal.labelKey}`,
  );
}

console.log("fusionEvidenceHelp.test.mts passed");
