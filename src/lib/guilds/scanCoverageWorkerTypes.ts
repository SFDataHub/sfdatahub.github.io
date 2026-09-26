import type {
  ScanCoverageLocalScanInput,
  ScanCoverageProgress,
  ScanCoverageProgressPhase,
  ScanCoverageRankEntry,
  ScanCoverageResult,
  ScanCoverageScanOption,
  ScanCoverageSelectionAnalysis,
  ScanCoverageSummaryInput,
  ScanCoverageTiming,
} from "./scanCoverageAnalysis";

export type ScanCoverageWorkerRequest =
  | {
      type: "build-options";
      requestId: string;
      summaries: ScanCoverageSummaryInput[];
      scans: Array<ScanCoverageLocalScanInput | null>;
    }
  | {
      type: "analyze-selection";
      requestId: string;
      scan: ScanCoverageLocalScanInput;
      option: ScanCoverageScanOption;
    }
  | {
      type: "build-coverage";
      requestId: string;
      rankedPlayers: ScanCoverageRankEntry[];
      selectedServer: string;
      rankLimit: number;
    }
  | {
      type: "cancel";
      requestId: string;
    };

export type ScanCoverageWorkerResponse =
  | {
      type: "progress";
      requestId: string;
      progress: ScanCoverageProgress;
    }
  | {
      type: "options-complete";
      requestId: string;
      options: ScanCoverageScanOption[];
      timings: ScanCoverageTiming[];
    }
  | {
      type: "selection-complete";
      requestId: string;
      analysis: ScanCoverageSelectionAnalysis;
      timings: ScanCoverageTiming[];
    }
  | {
      type: "coverage-complete";
      requestId: string;
      coverage: ScanCoverageResult;
      timings: ScanCoverageTiming[];
    }
  | {
      type: "error";
      requestId: string;
      phase?: ScanCoverageProgressPhase;
      message: string;
    }
  | {
      type: "cancelled";
      requestId: string;
    };
