import type { LocalServerCode } from "./serverRegistry";

export type LocalServerFusionCompensationPolicy = "none" | "levelGoldV1";

export type LocalServerFusionRelation = {
  from: LocalServerCode;
  to: LocalServerCode;
  fusionEvent?: {
    effectiveDate?: string;
    compensationPolicy?: LocalServerFusionCompensationPolicy;
  };
};

export const LOCAL_SERVER_FUSIONS = [
  { from: "EU1", to: "F28", fusionEvent: { compensationPolicy: "levelGoldV1" } },
  { from: "EU2", to: "F28", fusionEvent: { compensationPolicy: "levelGoldV1" } },
  { from: "EU3", to: "F28", fusionEvent: { compensationPolicy: "levelGoldV1" } },
  { from: "EU4", to: "F28", fusionEvent: { compensationPolicy: "levelGoldV1" } },
] as const satisfies readonly LocalServerFusionRelation[];
