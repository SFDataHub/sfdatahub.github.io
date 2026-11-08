import type { AuditEnvelope, AuditReport } from "../data-hub/runtimeAudit";
import type { ScanArchiveEntry } from "./types";
import type { GuildHubLocalScan, GuildHubScanPreviewStatistics } from "../guilds/localScanLibrary";

export type PreparedLocalScanImport = { scan: GuildHubLocalScan; statistics: GuildHubScanPreviewStatistics };

export type ScanArchiveDownloadProgressPhase =
  | "downloading"
  | "hashing"
  | "decompressing"
  | "validating"
  | "done";

export type ScanArchiveDownloadProgress = {
  phase: ScanArchiveDownloadProgressPhase;
  message: string;
  loadedBytes?: number;
  totalBytes?: number;
};

export type ScanArchiveDownloadRequest =
  | {
      type: "preview-local-scan";
      requestId: string;
      filename: string;
      content: string;
      audit?: AuditEnvelope;
    }
  | {
      type: "download";
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

export type ScanArchiveDownloadResponse =
  | {
      type: "preview-complete";
      requestId: string;
      scan: GuildHubLocalScan;
      statistics: GuildHubScanPreviewStatistics;
      auditReport?: AuditReport;
    }
  | {
      type: "progress";
      requestId: string;
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
      progress: ScanArchiveDownloadProgress;
    }
  | {
      type: "complete";
      requestId: string;
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
      content: string;
      playerCount: number;
      groupCount: number;
    }
  | {
      type: "error";
      requestId: string;
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
      phase?: ScanArchiveDownloadProgressPhase;
      message: string;
    }
  | {
      type: "cancelled";
      requestId: string;
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
    };
