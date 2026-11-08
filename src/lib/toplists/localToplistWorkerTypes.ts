import type { AuditEnvelope, AuditReport } from "../data-hub/runtimeAudit";
import type { LocalDependencyReceipt } from "../local-data/localDataDependencies";
import type { LocalSourceValidity } from "../guilds/localSourceValidity";
import type {
  LocalGuildToplistRow,
  LocalPlayerToplistRow,
  LocalToplistConfirmation,
  LocalToplistIssue,
  LocalToplistSnapshotMeta,
} from "./localToplistTypes";

export type LocalToplistDerivationWorkerSource = Partial<LocalSourceValidity> & {
  resetGeneration?: string;
  dependencies?: LocalDependencyReceipt;
  manifestYear: number;
  archiveScanId: string;
  archiveSha256: string;
  server: string;
  scanTimestamp: number;
  localScanId: string;
  localContentHash: string;
  confirmation: LocalToplistConfirmation;
};

export type LocalToplistDerivedSnapshotPayload = Partial<LocalSourceValidity> & {
  resetGeneration?: string;
  dependencies?: LocalDependencyReceipt;
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
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
      sources: LocalToplistDerivationWorkerSource[];
    }
  | {
      type: "cancel";
      requestId: string;
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
    };

export type LocalToplistDerivationWorkerResponse =
  | {
      type: "progress";
      requestId: string;
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
      progress: LocalToplistDerivationProgress;
    }
  | {
      type: "complete";
      requestId: string;
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
      snapshots: LocalToplistDerivedSnapshotPayload[];
    }
  | {
      type: "error";
      requestId: string;
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
      phase?: LocalToplistDerivationProgressPhase;
      message: string;
    }
  | {
      type: "cancelled";
      requestId: string;
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
    };
