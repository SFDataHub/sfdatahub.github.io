import type { AuditEnvelope, AuditReport } from "../data-hub/runtimeAudit";
import type { ScanArchiveEntry, ScanArchiveSearchIndexPayload } from "./types";

export type ScanArchiveSearchIndexProgressPhase =
  | "downloading"
  | "hashing"
  | "decompressing"
  | "validating"
  | "done";

export type ScanArchiveSearchIndexProgress = {
  phase: ScanArchiveSearchIndexProgressPhase;
  message: string;
  loadedBytes?: number;
  totalBytes?: number;
};

export type ScanArchiveSearchIndexWorkerRequest =
  | {
      type: "download-search-index";
      requestId: string;
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
      entry: ScanArchiveEntry;
    }
  | {
      type: "cancel";
      requestId: string;
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
    };

export type ScanArchiveSearchIndexWorkerResponse =
  | {
      type: "progress";
      requestId: string;
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
      progress: ScanArchiveSearchIndexProgress;
    }
  | {
      type: "complete";
      requestId: string;
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
      payload: ScanArchiveSearchIndexPayload;
    }
  | {
      type: "error";
      requestId: string;
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
      phase?: ScanArchiveSearchIndexProgressPhase;
      message: string;
    }
  | {
      type: "cancelled";
      requestId: string;
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
    };
