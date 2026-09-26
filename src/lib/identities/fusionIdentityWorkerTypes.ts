import type { FusionIdentityManagementReport } from "./fusionIdentityManagement";
import type { FusionIdentityAnalysisScope } from "./fusionIdentityScopes";

export type FusionIdentityProgressPhase =
  | "loading"
  | "preparing"
  | "preparing-scan-pool"
  | "filtering-scope"
  | "normalizing"
  | "player-histories"
  | "preparing-histories"
  | "player-resolution"
  | "guild-resolution"
  | "assignment"
  | "report"
  | "finalizing"
  | "done";

export type FusionIdentityProgress = {
  phase: FusionIdentityProgressPhase;
  current?: number;
  total?: number;
  message: string;
};

export type FusionIdentityWorkerTiming = {
  phase: FusionIdentityProgressPhase | "total" | (string & {});
  durationMs: number;
  count?: number;
};

export type FusionIdentityWorkerRequest =
  | {
      type: "build-report";
      requestId: string;
      scope?: FusionIdentityAnalysisScope;
    }
  | {
      type: "cancel";
      requestId: string;
    };

export type FusionIdentityWorkerResponse =
  | {
      type: "progress";
      requestId: string;
      progress: FusionIdentityProgress;
    }
  | {
      type: "complete";
      requestId: string;
      report: FusionIdentityManagementReport;
      timings: FusionIdentityWorkerTiming[];
    }
  | {
      type: "error";
      requestId: string;
      phase?: FusionIdentityProgressPhase;
      message: string;
    }
  | {
      type: "cancelled";
      requestId: string;
    };
