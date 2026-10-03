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
      entry: ScanArchiveEntry;
    }
  | {
      type: "cancel";
      requestId: string;
    };

export type ScanArchiveSearchIndexWorkerResponse =
  | {
      type: "progress";
      requestId: string;
      progress: ScanArchiveSearchIndexProgress;
    }
  | {
      type: "complete";
      requestId: string;
      payload: ScanArchiveSearchIndexPayload;
    }
  | {
      type: "error";
      requestId: string;
      phase?: ScanArchiveSearchIndexProgressPhase;
      message: string;
    }
  | {
      type: "cancelled";
      requestId: string;
    };
