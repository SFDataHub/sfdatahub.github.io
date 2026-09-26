import assert from "node:assert/strict";

import { getFusionIdentityAnalyzeActionState } from "../../src/lib/identities/fusionIdentityAnalyzeAction.ts";

const baseInput = {
  analysisSupported: true,
  isLocallyMatchable: true,
  hasCurrentInputData: true,
  cacheState: "never-analyzed" as const,
};

assert.deepEqual(getFusionIdentityAnalyzeActionState(baseInput), {
  enabled: true,
  reason: "ready",
});

assert.deepEqual(
  getFusionIdentityAnalyzeActionState({
    ...baseInput,
    cacheState: "fresh",
  }),
  {
    enabled: false,
    reason: "fresh",
  },
);

assert.deepEqual(
  getFusionIdentityAnalyzeActionState({
    ...baseInput,
    cacheState: "stale",
  }),
  {
    enabled: true,
    reason: "ready",
  },
);

assert.deepEqual(
  getFusionIdentityAnalyzeActionState({
    ...baseInput,
    cacheState: "error",
  }),
  {
    enabled: true,
    reason: "ready",
  },
);

assert.deepEqual(
  getFusionIdentityAnalyzeActionState({
    ...baseInput,
    cacheState: "running",
  }),
  {
    enabled: false,
    reason: "running",
  },
);

assert.deepEqual(
  getFusionIdentityAnalyzeActionState({
    ...baseInput,
    isAnyAnalysisRunning: true,
  }),
  {
    enabled: false,
    reason: "running",
  },
);

assert.deepEqual(
  getFusionIdentityAnalyzeActionState({
    ...baseInput,
    isLocallyMatchable: false,
  }),
  {
    enabled: false,
    reason: "not-locally-matchable",
  },
);

assert.deepEqual(
  getFusionIdentityAnalyzeActionState({
    ...baseInput,
    analysisSupported: false,
  }),
  {
    enabled: false,
    reason: "unsupported",
  },
);

assert.deepEqual(
  getFusionIdentityAnalyzeActionState({
    ...baseInput,
    hasCurrentInputData: false,
  }),
  {
    enabled: false,
    reason: "no-current-data",
  },
);

console.log("fusionIdentityAnalyzeAction test passed");
