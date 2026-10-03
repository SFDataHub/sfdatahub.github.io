import type {
  ScanArchiveBuilderConflict,
  ScanArchiveBuilderCoreProgressPhase,
  ScanArchiveBuilderUsageMode,
  ScanArchiveBuilderWarning,
  ScanArchivePlannedFile,
} from "./archiveBuilderCore";
import type { ScanArchiveManifest } from "./types";
import type { ScanArchiveBuilderMonthlyTarget } from "./scanArchiveBuilderMonthly";

export type ScanArchiveBuilderProgressPhase =
  | "idle"
  | "parsing"
  | "validating"
  | "loading-monthly"
  | "grouping"
  | "compressing"
  | "hashing"
  | "manifest-merge"
  | "zip-building"
  | "ready"
  | "error"
  | "cancelled";

export type ScanArchiveBuilderProgress = {
  phase: ScanArchiveBuilderProgressPhase;
  current?: number;
  total?: number;
  message: string;
};

export type ScanArchiveBuilderManifestSource =
  | {
      kind: "catalog";
      manifestUrl: string;
      year: number;
      scanCount: number;
    }
  | {
      kind: "override";
      filename: string;
      year: number;
      scanCount: number;
    };

export type ScanArchiveBuilderBlocker = {
  code: string;
  cause: string;
  remedy: string;
};

export type { ScanArchiveBuilderUsageMode };

export type ScanArchiveBuilderInspection = {
  inspectionId: string;
  years: number[];
  months: string[];
  servers: string[];
  batchCount: number;
  targets?: Array<{ server: string; month: string }>;
  blockers: ScanArchiveBuilderBlocker[];
};

export type ScanArchiveBuilderRequest =
  | {
      type: "inspect";
      requestId: string;
      inputFile: File;
    }
  | {
      type: "build";
      requestId: string;
      inspectionId: string;
      manifest: ScanArchiveManifest;
      manifestSource: ScanArchiveBuilderManifestSource;
      usageMode: ScanArchiveBuilderUsageMode;
      catalogUrl?: string;
      allowCurrentRollback?: boolean;
    }
  | {
      type: "discard-build";
      requestId: string;
    }
  | {
      type: "cancel";
      requestId: string;
    };

export type ScanArchiveBuilderFileResult = Pick<
  ScanArchivePlannedFile<Uint8Array>,
  "kind" | "scanId" | "relativePath" | "action" | "compressedBytes" | "sha256"
>;

export type ScanArchiveBuilderResult = {
  year: number;
  usageMode: ScanArchiveBuilderUsageMode;
  monthlyTargets: ScanArchiveBuilderMonthlyTarget[];
  manifestSource: ScanArchiveBuilderManifestSource;
  manifestBefore: ScanArchiveManifest;
  manifestAfter: ScanArchiveManifest;
  batchCount: number;
  files: ScanArchiveBuilderFileResult[];
  conflicts: ScanArchiveBuilderConflict[];
  warnings: ScanArchiveBuilderWarning[];
  toplistChanges: {
    current: Array<{ server: string; from?: string; to: string }>;
    monthly: Array<{ month: string; server: string; from?: string; to: string }>;
  };
  summary: {
    newScans: number;
    filesToWrite: number;
    skippedIdenticalFiles: number;
    zipBytes: number;
  };
  zipBytes: ArrayBuffer;
  zipFilename: string;
  blockers: ScanArchiveBuilderBlocker[];
};

export type ScanArchiveBuilderResponse =
  | {
      type: "progress";
      requestId: string;
      progress: ScanArchiveBuilderProgress;
    }
  | {
      type: "inspected";
      requestId: string;
      inspection: ScanArchiveBuilderInspection;
    }
  | {
      type: "complete";
      requestId: string;
      result: ScanArchiveBuilderResult;
    }
  | {
      type: "error";
      requestId: string;
      phase?: ScanArchiveBuilderProgressPhase;
      message: string;
      blocker?: ScanArchiveBuilderBlocker;
    }
  | {
      type: "cancelled";
      requestId: string;
    };

export const mapCoreBuilderPhase = (phase: ScanArchiveBuilderCoreProgressPhase): ScanArchiveBuilderProgressPhase =>
  phase;
