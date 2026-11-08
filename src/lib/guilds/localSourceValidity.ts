import { GUILD_SCAN_NORMALIZER_VERSION } from "./guildScanNormalizer";

// Bump when normalizedPlayer/normalizedGuild, parseSfJson or the shared stat
// readers change their output contract. Independent of each consumer's derivation.
export const LOCAL_SCAN_CORE_NORMALIZER_VERSION = 1;

export type LocalSourceValidity = {
  sourceGeneration: string;
  normalizerVersion: number;
  coreNormalizerVersion: number;
};

export function hasCurrentLocalSourceValidity(
  value: Partial<LocalSourceValidity> | null | undefined,
): value is LocalSourceValidity {
  return Boolean(
    value && typeof value.sourceGeneration === "string" && value.sourceGeneration.length > 0 &&
    value.normalizerVersion === GUILD_SCAN_NORMALIZER_VERSION &&
    value.coreNormalizerVersion === LOCAL_SCAN_CORE_NORMALIZER_VERSION,
  );
}

export function matchesLocalSourceValidity(
  left: Partial<LocalSourceValidity> | null | undefined,
  right: Partial<LocalSourceValidity> | null | undefined,
) {
  return hasCurrentLocalSourceValidity(left) && hasCurrentLocalSourceValidity(right) &&
    left.sourceGeneration === right.sourceGeneration;
}

export function localSourceValidityKey(value: Partial<LocalSourceValidity>) {
  return JSON.stringify([value.sourceGeneration, value.normalizerVersion, value.coreNormalizerVersion]);
}
