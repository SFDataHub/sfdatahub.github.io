import type { LocalServerCode } from "./serverRegistry";

export type LocalServerFusionRelation = {
  from: LocalServerCode;
  to: LocalServerCode;
  effectiveAt?: string;
};

export const LOCAL_SERVER_FUSIONS = [
  { from: "EU1", to: "F28" },
  { from: "EU2", to: "F28" },
  { from: "EU3", to: "F28" },
  { from: "EU4", to: "F28" },
] as const satisfies readonly LocalServerFusionRelation[];
