import type { FusionIdentityAnalysisCacheState } from "./fusionAnalysisCache";

export type FusionIdentityAnalyzeActionReason =
  | "ready"
  | "unsupported"
  | "not-locally-matchable"
  | "no-current-data"
  | "running"
  | "fresh";

export type FusionIdentityAnalyzeActionInput = {
  analysisSupported: boolean;
  isLocallyMatchable: boolean;
  hasCurrentInputData: boolean;
  cacheState: FusionIdentityAnalysisCacheState;
  isAnyAnalysisRunning?: boolean;
};

export type FusionIdentityAnalyzeActionState = {
  enabled: boolean;
  reason: FusionIdentityAnalyzeActionReason;
};

export const getFusionIdentityAnalyzeActionState = (
  input: FusionIdentityAnalyzeActionInput,
): FusionIdentityAnalyzeActionState => {
  if (!input.analysisSupported) return { enabled: false, reason: "unsupported" };
  if (!input.isLocallyMatchable)
    return { enabled: false, reason: "not-locally-matchable" };
  if (!input.hasCurrentInputData)
    return { enabled: false, reason: "no-current-data" };
  if (input.isAnyAnalysisRunning || input.cacheState === "running")
    return { enabled: false, reason: "running" };
  if (input.cacheState === "fresh") return { enabled: false, reason: "fresh" };
  return { enabled: true, reason: "ready" };
};
