import type { FusionIdentityManagementReport } from "./fusionIdentityManagement";

export type FusionIdentityProgressPhase =
  | "loading"
  | "preparing"
  | "normalizing"
  | "player-histories"
  | "player-resolution"
  | "guild-resolution"
  | "assignment"
  | "report"
  | "done";

export type FusionIdentityProgress = {
  phase: FusionIdentityProgressPhase;
  current?: number;
  total?: number;
  message: string;
};

export type FusionIdentityWorkerTiming = {
  phase: FusionIdentityProgressPhase | "total";
  durationMs: number;
};

export type FusionIdentityWorkerRequest =
  | {
      type: "build-report";
      requestId: string;
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

