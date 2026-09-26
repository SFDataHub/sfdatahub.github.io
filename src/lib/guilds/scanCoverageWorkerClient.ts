import type {
  ScanCoverageLocalScanInput,
  ScanCoverageProgress,
  ScanCoverageRankEntry,
  ScanCoverageScanOption,
  ScanCoverageSelectionAnalysis,
  ScanCoverageSummaryInput,
  ScanCoverageTiming,
  ScanCoverageResult,
} from "./scanCoverageAnalysis";
import type {
  ScanCoverageWorkerRequest,
  ScanCoverageWorkerResponse,
} from "./scanCoverageWorkerTypes";

export class ScanCoverageWorkerCancelledError extends Error {
  constructor() {
    super("scan_coverage_worker_cancelled");
    this.name = "ScanCoverageWorkerCancelledError";
  }
}

export type ScanCoverageWorkerLike = {
  postMessage(message: ScanCoverageWorkerRequest): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: MessageEvent<ScanCoverageWorkerResponse>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<ScanCoverageWorkerResponse>) => void): void;
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
};

type ScanCoverageWorkerOperationResult =
  | {
      kind: "options";
      options: ScanCoverageScanOption[];
      timings: ScanCoverageTiming[];
    }
  | {
      kind: "selection";
      analysis: ScanCoverageSelectionAnalysis;
      timings: ScanCoverageTiming[];
    }
  | {
      kind: "coverage";
      coverage: ScanCoverageResult;
      timings: ScanCoverageTiming[];
    };

export type ScanCoverageWorkerRun = {
  requestId: string;
  promise: Promise<ScanCoverageWorkerOperationResult>;
  cancel(): void;
};

type StartScanCoverageWorkerRunOptions =
  | {
      type: "build-options";
      requestId?: string;
      summaries: ScanCoverageSummaryInput[];
      scans: Array<ScanCoverageLocalScanInput | null>;
      workerFactory?: () => ScanCoverageWorkerLike;
      onProgress?: (progress: ScanCoverageProgress) => void;
    }
  | {
      type: "analyze-selection";
      requestId?: string;
      scan: ScanCoverageLocalScanInput;
      option: ScanCoverageScanOption;
      workerFactory?: () => ScanCoverageWorkerLike;
      onProgress?: (progress: ScanCoverageProgress) => void;
    }
  | {
      type: "build-coverage";
      requestId?: string;
      rankedPlayers: ScanCoverageRankEntry[];
      selectedServer: string;
      rankLimit: number;
      workerFactory?: () => ScanCoverageWorkerLike;
      onProgress?: (progress: ScanCoverageProgress) => void;
    };

const createRequestId = () => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `scan-coverage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export const createScanCoverageWorker = (): ScanCoverageWorkerLike =>
  new Worker(new URL("../../workers/scanCoverage.worker.ts", import.meta.url), { type: "module" });

export const startScanCoverageWorkerRun = (
  options: StartScanCoverageWorkerRunOptions,
): ScanCoverageWorkerRun => {
  const requestId = options.requestId ?? createRequestId();
  const worker = (options.workerFactory ?? createScanCoverageWorker)();
  let settled = false;
  let handleMessage: (event: MessageEvent<ScanCoverageWorkerResponse>) => void = () => undefined;
  let handleError: (event: ErrorEvent) => void = () => undefined;
  let rejectRun: (reason?: unknown) => void = () => undefined;

  const cleanup = () => {
    worker.removeEventListener("message", handleMessage);
    worker.removeEventListener("error", handleError);
  };

  const promise = new Promise<ScanCoverageWorkerOperationResult>((resolve, reject) => {
    rejectRun = reject;

    handleMessage = (event) => {
      const message = event.data;
      if (message.requestId !== requestId || settled) return;

      if (message.type === "progress") {
        options.onProgress?.(message.progress);
        return;
      }

      settled = true;
      cleanup();

      if (message.type === "options-complete") {
        resolve({ kind: "options", options: message.options, timings: message.timings });
        worker.terminate();
        return;
      }

      if (message.type === "selection-complete") {
        resolve({ kind: "selection", analysis: message.analysis, timings: message.timings });
        worker.terminate();
        return;
      }

      if (message.type === "coverage-complete") {
        resolve({ kind: "coverage", coverage: message.coverage, timings: message.timings });
        worker.terminate();
        return;
      }

      worker.terminate();
      if (message.type === "cancelled") {
        reject(new ScanCoverageWorkerCancelledError());
        return;
      }

      reject(new Error(message.message));
    };

    handleError = (event) => {
      if (settled) return;
      settled = true;
      cleanup();
      worker.terminate();
      reject(new Error(event.message || "Scan coverage worker failed."));
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);

    if (options.type === "build-options") {
      worker.postMessage({
        type: "build-options",
        requestId,
        summaries: options.summaries,
        scans: options.scans,
      });
      return;
    }

    if (options.type === "analyze-selection") {
      worker.postMessage({
        type: "analyze-selection",
        requestId,
        scan: options.scan,
        option: options.option,
      });
      return;
    }

    worker.postMessage({
      type: "build-coverage",
      requestId,
      rankedPlayers: options.rankedPlayers,
      selectedServer: options.selectedServer,
      rankLimit: options.rankLimit,
    });
  });

  return {
    requestId,
    promise,
    cancel() {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        worker.postMessage({ type: "cancel", requestId });
      } catch {
        // Worker may already be gone.
      }
      worker.terminate();
      rejectRun(new ScanCoverageWorkerCancelledError());
    },
  };
};
