export type PlayerLevelProgressionBucket =
  | "1-99"
  | "100-199"
  | "200-299"
  | "300-392"
  | "393-449"
  | "450-499"
  | "500-549"
  | "550-599"
  | "600+";

export type PlayerLevelProgressionCategory =
  | "normal"
  | "plausible-burst"
  | "extreme-contradiction"
  | "insufficient-sample"
  | "unavailable";

export type PlayerLevelProgressionEvidence = {
  category: PlayerLevelProgressionCategory;
  bucket: PlayerLevelProgressionBucket | null;
  rawLevelGain: number | null;
  fusionCompensation: number | null;
  adjustedLevelGain: number | null;
  elapsedDays: number | null;
  adjustedGain30: number | null;
  compensationAvailable: boolean;
  compensationUnavailableReason: string | null;
};

type ProgressionReference = {
  minSampleCount: number;
  normalGain: number;
  normalGain30: number;
  burstGain: number;
  burstGain30: number;
  extremeGain: number;
  extremeGain30: number;
};

export const PLAYER_LEVEL_PROGRESSION_BUCKETS: readonly PlayerLevelProgressionBucket[] = [
  "1-99",
  "100-199",
  "200-299",
  "300-392",
  "393-449",
  "450-499",
  "500-549",
  "550-599",
  "600+",
];

const PROGRESSION_REFERENCES: Partial<Record<PlayerLevelProgressionBucket, ProgressionReference>> = {
  "393-449": {
    minSampleCount: 23,
    normalGain: 55,
    normalGain30: 18,
    burstGain: 95,
    burstGain30: 40,
    extremeGain: 120,
    extremeGain30: 75,
  },
  "450-499": {
    minSampleCount: 29,
    normalGain: 45,
    normalGain30: 16,
    burstGain: 80,
    burstGain30: 35,
    extremeGain: 100,
    extremeGain30: 70,
  },
  "500-549": {
    minSampleCount: 29,
    normalGain: 12,
    normalGain30: 10,
    burstGain: 35,
    burstGain30: 28,
    extremeGain: 60,
    extremeGain30: 55,
  },
  "550-599": {
    minSampleCount: 10,
    normalGain: 12,
    normalGain30: 10,
    burstGain: 35,
    burstGain30: 28,
    extremeGain: 60,
    extremeGain30: 55,
  },
};

export const getPlayerLevelProgressionBucket = (level: number | null | undefined): PlayerLevelProgressionBucket | null => {
  if (level == null || !Number.isFinite(level) || level <= 0) return null;
  if (level <= 99) return "1-99";
  if (level <= 199) return "100-199";
  if (level <= 299) return "200-299";
  if (level <= 392) return "300-392";
  if (level <= 449) return "393-449";
  if (level <= 499) return "450-499";
  if (level <= 549) return "500-549";
  if (level <= 599) return "550-599";
  return "600+";
};

export const classifyPlayerLevelProgression = ({
  preLevel,
  postLevel,
  elapsedDays,
  fusionCompensation,
  compensationAvailable,
  compensationUnavailableReason = null,
}: {
  preLevel: number | null;
  postLevel: number | null;
  elapsedDays: number | null;
  fusionCompensation: number | null;
  compensationAvailable: boolean;
  compensationUnavailableReason?: string | null;
}): PlayerLevelProgressionEvidence => {
  const bucket = getPlayerLevelProgressionBucket(preLevel);
  const rawLevelGain = preLevel == null || postLevel == null ? null : postLevel - preLevel;
  const adjustedLevelGain =
    rawLevelGain == null || !compensationAvailable || fusionCompensation == null
      ? null
      : rawLevelGain - fusionCompensation;
  const adjustedGain30 =
    adjustedLevelGain != null && elapsedDays != null && elapsedDays > 0
      ? (adjustedLevelGain / elapsedDays) * 30
      : null;

  const base = {
    bucket,
    rawLevelGain,
    fusionCompensation: compensationAvailable ? fusionCompensation : null,
    adjustedLevelGain,
    elapsedDays,
    adjustedGain30,
    compensationAvailable,
    compensationUnavailableReason: compensationAvailable ? null : compensationUnavailableReason,
  };

  if (rawLevelGain == null || elapsedDays == null || elapsedDays <= 0 || !bucket) {
    return { ...base, category: "unavailable" };
  }

  if (!compensationAvailable || adjustedLevelGain == null || adjustedGain30 == null) {
    return { ...base, category: "unavailable" };
  }

  const reference = PROGRESSION_REFERENCES[bucket];
  if (!reference) {
    if (adjustedLevelGain >= 200 && adjustedGain30 >= 100) {
      return { ...base, category: "extreme-contradiction" };
    }
    return { ...base, category: "insufficient-sample" };
  }

  if (
    adjustedLevelGain >= reference.extremeGain ||
    (adjustedLevelGain >= reference.burstGain && adjustedGain30 >= reference.extremeGain30)
  ) {
    return { ...base, category: "extreme-contradiction" };
  }

  if (adjustedLevelGain <= reference.normalGain && adjustedGain30 <= reference.normalGain30) {
    return { ...base, category: "normal" };
  }

  if (adjustedLevelGain <= reference.burstGain || adjustedGain30 <= reference.burstGain30) {
    return { ...base, category: "plausible-burst" };
  }

  return { ...base, category: "extreme-contradiction" };
};

