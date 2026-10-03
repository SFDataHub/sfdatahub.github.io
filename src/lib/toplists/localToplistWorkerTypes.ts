import type {
  LocalGuildToplistRow,
  LocalPlayerToplistRow,
  LocalToplistConfirmation,
  LocalToplistIssue,
  LocalToplistSnapshotMeta,
} from "./localToplistTypes";

export type LocalToplistDerivationWorkerSource = {
  manifestYear: number;
  archiveScanId: string;
  archiveSha256: string;
  server: string;
  scanTimestamp: number;
  localScanId: string;
  localContentHash: string;
  confirmation: LocalToplistConfirmation;
};

export type LocalToplistDerivedSnapshotPayload = {
  manifestYear: number;
  archiveScanId: string;
  archiveSha256: string;
  server: string;
  scanTimestamp: number;
  localScanId: string;
  localContentHash: string;
  playerRows: LocalPlayerToplistRow[];
  guildRows: LocalGuildToplistRow[];
  snapshotMeta: LocalToplistSnapshotMeta;
  issues: LocalToplistIssue[];
};

export type LocalToplistDerivationProgressPhase = "loading-scans" | "deriving" | "done";

export type LocalToplistDerivationProgress = {
  phase: LocalToplistDerivationProgressPhase;
  current?: number;
  total?: number;
  message: string;
};

export type LocalToplistDerivationWorkerRequest =
  | {
      type: "derive-toplists";
      requestId: string;
      sources: LocalToplistDerivationWorkerSource[];
    }
  | {
      type: "cancel";
      requestId: string;
    };

export type LocalToplistDerivationWorkerResponse =
  | {
      type: "progress";
      requestId: string;
      progress: LocalToplistDerivationProgress;
    }
  | {
      type: "complete";
      requestId: string;
      snapshots: LocalToplistDerivedSnapshotPayload[];
    }
  | {
      type: "error";
      requestId: string;
      phase?: LocalToplistDerivationProgressPhase;
      message: string;
    }
  | {
      type: "cancelled";
      requestId: string;
    };
