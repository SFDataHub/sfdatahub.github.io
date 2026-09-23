import type {
  GuildFusionCandidateClassification,
  GuildFusionEvidenceEntryType,
  GuildFusionEvidenceStrength,
} from "./guildFusionResolver";
import type {
  PlayerFusionCandidateClassification,
  PlayerFusionEvidenceEntryType,
  PlayerFusionEvidenceStrength,
  PlayerFusionRejectReason,
} from "./playerFusionResolver";

export type FusionEvidenceEntityType = "player" | "guild";
export type FusionEvidenceRank =
  | PlayerFusionEvidenceStrength
  | GuildFusionEvidenceStrength
  | "strongContradiction"
  | "hardContradiction";
export type FusionCandidateClassification =
  PlayerFusionCandidateClassification | GuildFusionCandidateClassification;

export type FusionEvidenceHelpDefinition = {
  titleKey: string;
  descriptionKey: string;
  effectKey?: string;
  cautionKey?: string;
};

export type FusionEvidenceGuideSignal = {
  entityType: FusionEvidenceEntityType;
  evidenceType: PlayerFusionEvidenceEntryType | GuildFusionEvidenceEntryType;
  rank: FusionEvidenceRank;
  labelKey: string;
};

export const FUSION_EVIDENCE_RANKS: FusionEvidenceRank[] = [
  "identityAnchor",
  "strongSupport",
  "support",
  "weakSupport",
  "neutral",
  "warning",
  "strongContradiction",
  "hardContradiction",
];

export const FUSION_EVIDENCE_RANK_HELP: Record<
  FusionEvidenceRank,
  FusionEvidenceHelpDefinition
> = {
  identityAnchor: {
    titleKey: "fusionIdentity.evidenceHelp.ranks.identityAnchor.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.ranks.identityAnchor.description",
  },
  strongSupport: {
    titleKey: "fusionIdentity.evidenceHelp.ranks.strongSupport.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.ranks.strongSupport.description",
  },
  support: {
    titleKey: "fusionIdentity.evidenceHelp.ranks.support.title",
    descriptionKey: "fusionIdentity.evidenceHelp.ranks.support.description",
  },
  weakSupport: {
    titleKey: "fusionIdentity.evidenceHelp.ranks.weakSupport.title",
    descriptionKey: "fusionIdentity.evidenceHelp.ranks.weakSupport.description",
  },
  neutral: {
    titleKey: "fusionIdentity.evidenceHelp.ranks.neutral.title",
    descriptionKey: "fusionIdentity.evidenceHelp.ranks.neutral.description",
  },
  warning: {
    titleKey: "fusionIdentity.evidenceHelp.ranks.warning.title",
    descriptionKey: "fusionIdentity.evidenceHelp.ranks.warning.description",
  },
  strongContradiction: {
    titleKey: "fusionIdentity.evidenceHelp.ranks.strongContradiction.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.ranks.strongContradiction.description",
  },
  hardContradiction: {
    titleKey: "fusionIdentity.evidenceHelp.ranks.hardContradiction.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.ranks.hardContradiction.description",
  },
};

export const FUSION_CLASSIFICATION_HELP: Record<
  FusionCandidateClassification,
  FusionEvidenceHelpDefinition
> = {
  rejected: {
    titleKey: "fusionIdentity.evidenceHelp.classification.rejected.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.classification.rejected.description",
    effectKey: "fusionIdentity.evidenceHelp.classification.rejected.effect",
  },
  weak: {
    titleKey: "fusionIdentity.evidenceHelp.classification.weak.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.classification.weak.description",
    effectKey: "fusionIdentity.evidenceHelp.classification.weak.effect",
  },
  plausible: {
    titleKey: "fusionIdentity.evidenceHelp.classification.plausible.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.classification.plausible.description",
    effectKey: "fusionIdentity.evidenceHelp.classification.plausible.effect",
  },
  strong: {
    titleKey: "fusionIdentity.evidenceHelp.classification.strong.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.classification.strong.description",
    effectKey: "fusionIdentity.evidenceHelp.classification.strong.effect",
  },
  anchored: {
    titleKey: "fusionIdentity.evidenceHelp.classification.anchored.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.classification.anchored.description",
    effectKey: "fusionIdentity.evidenceHelp.classification.anchored.effect",
  },
};

export const PLAYER_EVIDENCE_HELP: Record<
  PlayerFusionEvidenceEntryType,
  FusionEvidenceHelpDefinition
> = {
  "origin-compatibility": {
    titleKey: "fusionIdentity.evidenceHelp.player.originCompatibility.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.player.originCompatibility.description",
    effectKey: "fusionIdentity.evidenceHelp.player.originCompatibility.effect",
  },
  "class-compatibility": {
    titleKey: "fusionIdentity.evidenceHelp.player.classCompatibility.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.player.classCompatibility.description",
    effectKey: "fusionIdentity.evidenceHelp.player.classCompatibility.effect",
  },
  "level-monotonicity": {
    titleKey: "fusionIdentity.evidenceHelp.player.levelMonotonicity.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.player.levelMonotonicity.description",
    effectKey: "fusionIdentity.evidenceHelp.player.levelMonotonicity.effect",
    cautionKey: "fusionIdentity.evidenceHelp.player.levelMonotonicity.caution",
  },
  "level-progression": {
    titleKey: "fusionIdentity.evidenceHelp.player.levelProgression.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.player.levelProgression.description",
    effectKey: "fusionIdentity.evidenceHelp.player.levelProgression.effect",
  },
  "base-monotonicity": {
    titleKey: "fusionIdentity.evidenceHelp.player.baseMonotonicity.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.player.baseMonotonicity.description",
    effectKey: "fusionIdentity.evidenceHelp.player.baseMonotonicity.effect",
  },
  "base-unchanged-stats": {
    titleKey: "fusionIdentity.evidenceHelp.player.baseUnchangedStats.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.player.baseUnchangedStats.description",
    effectKey: "fusionIdentity.evidenceHelp.player.baseUnchangedStats.effect",
  },
  "base-secondary-stability": {
    titleKey: "fusionIdentity.evidenceHelp.player.baseSecondaryStability.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.player.baseSecondaryStability.description",
    effectKey:
      "fusionIdentity.evidenceHelp.player.baseSecondaryStability.effect",
  },
  "base-ordering": {
    titleKey: "fusionIdentity.evidenceHelp.player.baseOrdering.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.player.baseOrdering.description",
    effectKey: "fusionIdentity.evidenceHelp.player.baseOrdering.effect",
  },
  "fortress-continuity": {
    titleKey: "fusionIdentity.evidenceHelp.player.fortressContinuity.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.player.fortressContinuity.description",
    effectKey: "fusionIdentity.evidenceHelp.player.fortressContinuity.effect",
    cautionKey: "fusionIdentity.evidenceHelp.player.fortressContinuity.caution",
  },
  "pet-continuity": {
    titleKey: "fusionIdentity.evidenceHelp.player.petContinuity.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.player.petContinuity.description",
    effectKey: "fusionIdentity.evidenceHelp.player.petContinuity.effect",
  },
  "portrait-continuity": {
    titleKey: "fusionIdentity.evidenceHelp.player.portraitContinuity.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.player.portraitContinuity.description",
    effectKey: "fusionIdentity.evidenceHelp.player.portraitContinuity.effect",
    cautionKey: "fusionIdentity.evidenceHelp.player.portraitContinuity.caution",
  },
  "guild-continuity": {
    titleKey: "fusionIdentity.evidenceHelp.player.guildContinuity.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.player.guildContinuity.description",
    effectKey: "fusionIdentity.evidenceHelp.player.guildContinuity.effect",
  },
  "exact-name": {
    titleKey: "fusionIdentity.evidenceHelp.player.exactName.title",
    descriptionKey: "fusionIdentity.evidenceHelp.player.exactName.description",
    effectKey: "fusionIdentity.evidenceHelp.player.exactName.effect",
  },
  "fusion-base-name": {
    titleKey: "fusionIdentity.evidenceHelp.player.fusionBaseName.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.player.fusionBaseName.description",
    effectKey: "fusionIdentity.evidenceHelp.player.fusionBaseName.effect",
  },
  assignment: {
    titleKey: "fusionIdentity.evidenceHelp.player.assignment.title",
    descriptionKey: "fusionIdentity.evidenceHelp.player.assignment.description",
    effectKey: "fusionIdentity.evidenceHelp.player.assignment.effect",
  },
};

export const GUILD_EVIDENCE_HELP: Record<
  GuildFusionEvidenceEntryType,
  FusionEvidenceHelpDefinition
> = {
  "exact-name": {
    titleKey: "fusionIdentity.evidenceHelp.guild.exactName.title",
    descriptionKey: "fusionIdentity.evidenceHelp.guild.exactName.description",
    effectKey: "fusionIdentity.evidenceHelp.guild.exactName.effect",
  },
  "unique-exact-name": {
    titleKey: "fusionIdentity.evidenceHelp.guild.uniqueExactName.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.guild.uniqueExactName.description",
    effectKey: "fusionIdentity.evidenceHelp.guild.uniqueExactName.effect",
  },
  "fusion-base-name": {
    titleKey: "fusionIdentity.evidenceHelp.guild.fusionBaseName.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.guild.fusionBaseName.description",
    effectKey: "fusionIdentity.evidenceHelp.guild.fusionBaseName.effect",
  },
  "same-coa": {
    titleKey: "fusionIdentity.evidenceHelp.guild.sameCoa.title",
    descriptionKey: "fusionIdentity.evidenceHelp.guild.sameCoa.description",
    effectKey: "fusionIdentity.evidenceHelp.guild.sameCoa.effect",
    cautionKey: "fusionIdentity.evidenceHelp.guild.sameCoa.caution",
  },
  "member-flow": {
    titleKey: "fusionIdentity.evidenceHelp.guild.memberFlow.title",
    descriptionKey: "fusionIdentity.evidenceHelp.guild.memberFlow.description",
    effectKey: "fusionIdentity.evidenceHelp.guild.memberFlow.effect",
    cautionKey: "fusionIdentity.evidenceHelp.guild.memberFlow.caution",
  },
  "structural-rename": {
    titleKey: "fusionIdentity.evidenceHelp.guild.structuralRename.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.guild.structuralRename.description",
    effectKey: "fusionIdentity.evidenceHelp.guild.structuralRename.effect",
  },
  "leader-continuity": {
    titleKey: "fusionIdentity.evidenceHelp.guild.leaderContinuity.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.guild.leaderContinuity.description",
    effectKey: "fusionIdentity.evidenceHelp.guild.leaderContinuity.effect",
    cautionKey: "fusionIdentity.evidenceHelp.guild.leaderContinuity.caution",
  },
  "officer-continuity": {
    titleKey: "fusionIdentity.evidenceHelp.guild.officerContinuity.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.guild.officerContinuity.description",
    effectKey: "fusionIdentity.evidenceHelp.guild.officerContinuity.effect",
  },
  "leadership-core": {
    titleKey: "fusionIdentity.evidenceHelp.guild.leadershipCore.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.guild.leadershipCore.description",
    effectKey: "fusionIdentity.evidenceHelp.guild.leadershipCore.effect",
  },
  "guild-progression": {
    titleKey: "fusionIdentity.evidenceHelp.guild.guildProgression.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.guild.guildProgression.description",
    effectKey: "fusionIdentity.evidenceHelp.guild.guildProgression.effect",
  },
  assignment: {
    titleKey: "fusionIdentity.evidenceHelp.guild.assignment.title",
    descriptionKey: "fusionIdentity.evidenceHelp.guild.assignment.description",
    effectKey: "fusionIdentity.evidenceHelp.guild.assignment.effect",
  },
};

export const PLAYER_REJECT_REASON_HELP: Record<
  PlayerFusionRejectReason,
  FusionEvidenceHelpDefinition
> = {
  "different-class": {
    titleKey: "fusionIdentity.evidenceHelp.reject.differentClass.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.reject.differentClass.description",
    effectKey: "fusionIdentity.evidenceHelp.reject.hardRejectEffect",
  },
  "level-drop": {
    titleKey: "fusionIdentity.evidenceHelp.reject.levelDrop.title",
    descriptionKey: "fusionIdentity.evidenceHelp.reject.levelDrop.description",
    effectKey: "fusionIdentity.evidenceHelp.reject.hardRejectEffect",
  },
  "level-regression": {
    titleKey: "fusionIdentity.evidenceHelp.reject.levelRegression.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.reject.levelRegression.description",
    effectKey: "fusionIdentity.evidenceHelp.reject.hardRejectEffect",
  },
  "level-progression-extreme": {
    titleKey:
      "fusionIdentity.evidenceHelp.reject.levelProgressionExtreme.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.reject.levelProgressionExtreme.description",
    effectKey:
      "fusionIdentity.evidenceHelp.reject.levelProgressionExtreme.effect",
  },
  "origin-mismatch": {
    titleKey: "fusionIdentity.evidenceHelp.reject.originMismatch.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.reject.originMismatch.description",
    effectKey: "fusionIdentity.evidenceHelp.reject.hardRejectEffect",
  },
  "base-attributes-contradiction": {
    titleKey:
      "fusionIdentity.evidenceHelp.reject.baseAttributesContradiction.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.reject.baseAttributesContradiction.description",
    effectKey: "fusionIdentity.evidenceHelp.reject.hardRejectEffect",
  },
  "base-stat-regression": {
    titleKey: "fusionIdentity.evidenceHelp.reject.baseStatRegression.title",
    descriptionKey:
      "fusionIdentity.evidenceHelp.reject.baseStatRegression.description",
    effectKey: "fusionIdentity.evidenceHelp.reject.hardRejectEffect",
  },
};

export const FUSION_EVIDENCE_GUIDE_SIGNALS: FusionEvidenceGuideSignal[] = [
  {
    entityType: "player",
    evidenceType: "exact-name",
    rank: "identityAnchor",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.playerExactName",
  },
  {
    entityType: "player",
    evidenceType: "fusion-base-name",
    rank: "identityAnchor",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.playerFusionBaseName",
  },
  {
    entityType: "player",
    evidenceType: "base-unchanged-stats",
    rank: "strongSupport",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.baseUnchangedStats",
  },
  {
    entityType: "player",
    evidenceType: "base-secondary-stability",
    rank: "strongSupport",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.baseSecondaryStability",
  },
  {
    entityType: "player",
    evidenceType: "fortress-continuity",
    rank: "strongSupport",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.fortressContinuity",
  },
  {
    entityType: "player",
    evidenceType: "level-progression",
    rank: "support",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.normalLevelProgression",
  },
  {
    entityType: "player",
    evidenceType: "base-ordering",
    rank: "support",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.baseOrdering",
  },
  {
    entityType: "player",
    evidenceType: "guild-continuity",
    rank: "support",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.guildContinuity",
  },
  {
    entityType: "player",
    evidenceType: "level-progression",
    rank: "weakSupport",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.plausibleLevelBurst",
  },
  {
    entityType: "player",
    evidenceType: "pet-continuity",
    rank: "weakSupport",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.petContinuity",
  },
  {
    entityType: "player",
    evidenceType: "portrait-continuity",
    rank: "weakSupport",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.portraitContinuity",
  },
  {
    entityType: "player",
    evidenceType: "origin-compatibility",
    rank: "neutral",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.originCompatible",
  },
  {
    entityType: "player",
    evidenceType: "class-compatibility",
    rank: "neutral",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.classCompatible",
  },
  {
    entityType: "player",
    evidenceType: "level-monotonicity",
    rank: "neutral",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.levelNonDecreasing",
  },
  {
    entityType: "player",
    evidenceType: "base-monotonicity",
    rank: "neutral",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.baseNonDecreasing",
  },
  {
    entityType: "player",
    evidenceType: "fortress-continuity",
    rank: "neutral",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.fortressDiffers",
  },
  {
    entityType: "player",
    evidenceType: "level-progression",
    rank: "strongContradiction",
    labelKey:
      "fusionIdentity.evidenceHelp.guideSignals.unusuallyHighLevelProgression",
  },
  {
    entityType: "player",
    evidenceType: "class-compatibility",
    rank: "hardContradiction",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.classContradiction",
  },
  {
    entityType: "player",
    evidenceType: "level-monotonicity",
    rank: "hardContradiction",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.levelRegression",
  },
  {
    entityType: "player",
    evidenceType: "base-monotonicity",
    rank: "hardContradiction",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.baseRegression",
  },
  {
    entityType: "player",
    evidenceType: "origin-compatibility",
    rank: "hardContradiction",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.originMismatch",
  },

  {
    entityType: "guild",
    evidenceType: "exact-name",
    rank: "strongSupport",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.guildExactName",
  },
  {
    entityType: "guild",
    evidenceType: "unique-exact-name",
    rank: "strongSupport",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.uniqueGuildExactName",
  },
  {
    entityType: "guild",
    evidenceType: "fusion-base-name",
    rank: "strongSupport",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.guildFusionBaseName",
  },
  {
    entityType: "guild",
    evidenceType: "structural-rename",
    rank: "strongSupport",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.structuralRename",
  },
  {
    entityType: "guild",
    evidenceType: "member-flow",
    rank: "strongSupport",
    labelKey:
      "fusionIdentity.evidenceHelp.guideSignals.mutualDominantMemberFlow",
  },
  {
    entityType: "guild",
    evidenceType: "leader-continuity",
    rank: "strongSupport",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.leaderContinuity",
  },
  {
    entityType: "guild",
    evidenceType: "officer-continuity",
    rank: "strongSupport",
    labelKey:
      "fusionIdentity.evidenceHelp.guideSignals.multipleContinuedOfficers",
  },
  {
    entityType: "guild",
    evidenceType: "same-coa",
    rank: "support",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.sameCoa",
  },
  {
    entityType: "guild",
    evidenceType: "member-flow",
    rank: "support",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.guildMemberFlow",
  },
  {
    entityType: "guild",
    evidenceType: "officer-continuity",
    rank: "support",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.continuedOfficer",
  },
  {
    entityType: "guild",
    evidenceType: "leadership-core",
    rank: "support",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.leadershipCore",
  },
  {
    entityType: "guild",
    evidenceType: "member-flow",
    rank: "weakSupport",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.smallMemberFlow",
  },
  {
    entityType: "guild",
    evidenceType: "guild-progression",
    rank: "weakSupport",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.guildProgression",
  },
  {
    entityType: "guild",
    evidenceType: "leader-continuity",
    rank: "neutral",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.leaderUnavailable",
  },
  {
    entityType: "guild",
    evidenceType: "leader-continuity",
    rank: "warning",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.differentLeader",
  },
  {
    entityType: "guild",
    evidenceType: "assignment",
    rank: "warning",
    labelKey: "fusionIdentity.evidenceHelp.guideSignals.guildAssignment",
  },
];

export const getEvidenceHelp = (
  entityType: FusionEvidenceEntityType,
  evidenceType: string,
) =>
  entityType === "guild"
    ? (GUILD_EVIDENCE_HELP[evidenceType as GuildFusionEvidenceEntryType] ??
      null)
    : (PLAYER_EVIDENCE_HELP[evidenceType as PlayerFusionEvidenceEntryType] ??
      null);

export const getClassificationHelp = (classification: string) =>
  FUSION_CLASSIFICATION_HELP[classification as FusionCandidateClassification] ??
  null;

export const getPlayerRejectReasonHelp = (reason: string) =>
  PLAYER_REJECT_REASON_HELP[reason as PlayerFusionRejectReason] ?? null;
