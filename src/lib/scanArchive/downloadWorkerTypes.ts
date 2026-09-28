import type { ScanArchiveEntry } from "./types";

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
      type: "download";
      requestId: string;
      entry: ScanArchiveEntry;
    }
  | {
      type: "cancel";
      requestId: string;
    };

export type ScanArchiveDownloadResponse =
  | {
      type: "progress";
      requestId: string;
      progress: ScanArchiveDownloadProgress;
    }
  | {
      type: "complete";
      requestId: string;
      content: string;
      playerCount: number;
      groupCount: number;
    }
  | {
      type: "error";
      requestId: string;
      phase?: ScanArchiveDownloadProgressPhase;
      message: string;
    }
  | {
      type: "cancelled";
      requestId: string;
    };
