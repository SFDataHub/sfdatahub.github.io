import type { SfJsonPortrait } from "../parsing/types";
import type { NormalizedPlayerPortraitUnavailable } from "../parsing/normalizedPlayer";

export type PlayerPortraitAvailability =
  | "available"
  | "partial"
  | "missing"
  | "unsupported"
  | "invalid"
  | "rosterOnly";

export type PlayerPortraitAppearanceFingerprint = {
  mouth: number;
  hairStyle: number;
  hairColor: number;
  browsStyle: number;
  browsColor: number;
  eyes: number;
  beardNone: boolean;
  beardStyle: number | null;
  beardColor: number | null;
  nose: number;
  ears: number;
  extra: number;
  hornStyle: number | null;
  specialPortraitActive: boolean;
  specialPortraitId: number | null;
};

export type PlayerPortraitAppearanceSummary = {
  availability: PlayerPortraitAvailability;
  layout: SfJsonPortrait["layout"] | NormalizedPlayerPortraitUnavailable["layout"];
  fingerprint: PlayerPortraitAppearanceFingerprint | null;
};

export type PlayerPortraitAppearanceComparison =
  | {
      comparable: true;
      exact: boolean;
      oldFingerprint: PlayerPortraitAppearanceFingerprint;
      newFingerprint: PlayerPortraitAppearanceFingerprint;
    }
  | {
      comparable: false;
      exact: null;
      oldAvailability: PlayerPortraitAvailability | null;
      newAvailability: PlayerPortraitAvailability | null;
    };

const AVAILABLE_PORTRAIT_STATUSES = new Set(["available"]);

export const createPlayerPortraitAppearanceSummary = (
  portrait: SfJsonPortrait | NormalizedPlayerPortraitUnavailable | null | undefined,
): PlayerPortraitAppearanceSummary => {
  const availability = portrait?.status ?? "missing";
  if (
    !portrait ||
    !AVAILABLE_PORTRAIT_STATUSES.has(availability) ||
    !portrait.appearance
  ) {
    return {
      availability: availability as PlayerPortraitAvailability,
      layout: portrait?.layout ?? "unknown",
      fingerprint: null,
    };
  }

  const { appearance } = portrait;
  return {
    availability: "available",
    layout: portrait.layout,
    fingerprint: {
      mouth: appearance.mouth,
      hairStyle: appearance.hair.style,
      hairColor: appearance.hair.color,
      browsStyle: appearance.brows.style,
      browsColor: appearance.brows.color,
      eyes: appearance.eyes,
      beardNone: appearance.beard.none,
      beardStyle: appearance.beard.none ? null : appearance.beard.style,
      beardColor: appearance.beard.none ? null : appearance.beard.color,
      nose: appearance.nose,
      ears: appearance.ears,
      extra: appearance.extra,
      hornStyle: appearance.horn.renderable ? appearance.horn.style : null,
      specialPortraitActive: appearance.specialPortrait.active,
      specialPortraitId: appearance.specialPortrait.active
        ? appearance.specialPortrait.id
        : null,
    },
  };
};

export const comparePlayerPortraitAppearance = (
  oldPortrait: PlayerPortraitAppearanceSummary | null | undefined,
  newPortrait: PlayerPortraitAppearanceSummary | null | undefined,
): PlayerPortraitAppearanceComparison => {
  if (
    oldPortrait?.availability !== "available" ||
    newPortrait?.availability !== "available" ||
    !oldPortrait.fingerprint ||
    !newPortrait.fingerprint
  ) {
    return {
      comparable: false,
      exact: null,
      oldAvailability: oldPortrait?.availability ?? null,
      newAvailability: newPortrait?.availability ?? null,
    };
  }

  const exact =
    JSON.stringify(oldPortrait.fingerprint) ===
    JSON.stringify(newPortrait.fingerprint);

  return {
    comparable: true,
    exact,
    oldFingerprint: oldPortrait.fingerprint,
    newFingerprint: newPortrait.fingerprint,
  };
};
