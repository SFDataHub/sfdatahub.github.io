import {
  analyzeScanCoverageSelection,
  buildScanCoverageResult,
  createScanCoverageOptions,
  type ScanCoverageProgress,
  type ScanCoverageProgressPhase,
  type ScanCoverageTiming,
} from "../lib/guilds/scanCoverageAnalysis";
import type {
  ScanCoverageWorkerRequest,
  ScanCoverageWorkerResponse,
} from "../lib/guilds/scanCoverageWorkerTypes";

let activeRequestId: string | null = null;
const cancelledRequests = new Set<string>();

const postWorkerMessage = (message: ScanCoverageWorkerResponse) => {
  globalThis.postMessage(message);
};

const createTimingTracker = () => {
  const totalStartedAt = performance.now();
  let activePhase: ScanCoverageProgressPhase | null = null;
  let activePhaseStartedAt = totalStartedAt;
  const durations = new Map<ScanCoverageProgressPhase | "total", number>();

  const addDuration = (phase: ScanCoverageProgressPhase | "total", durationMs: number) => {
    durations.set(phase, (durations.get(phase) ?? 0) + durationMs);
  };

  return {
    mark(progress: ScanCoverageProgress) {
      const now = performance.now();
      if (activePhase && activePhase !== progress.phase) {
        addDuration(activePhase, now - activePhaseStartedAt);
        activePhaseStartedAt = now;
      }
      activePhase = progress.phase;
    },
    finish(): ScanCoverageTiming[] {
      const now = performance.now();
      if (activePhase) addDuration(activePhase, now - activePhaseStartedAt);
      addDuration("total", now - totalStartedAt);
      return [...durations.entries()].map(([phase, durationMs]) => ({ phase, durationMs }));
    },
  };
};

const serializeError = (error: unknown) =>
  error instanceof Error ? error.message : "Scan coverage worker failed.";

const runRequest = async (request: Exclude<ScanCoverageWorkerRequest, { type: "cancel" }>) => {
  activeRequestId = request.requestId;
  cancelledRequests.delete(request.requestId);
  const timings = createTimingTracker();
  let currentPhase: ScanCoverageProgressPhase | undefined;

  const emitProgress = (progress: ScanCoverageProgress) => {
    if (cancelledRequests.has(request.requestId) || activeRequestId !== request.requestId) return;
    currentPhase = progress.phase;
    timings.mark(progress);
    postWorkerMessage({ type: "progress", requestId: request.requestId, progress });
  };

  try {
    if (request.type === "build-options") {
      emitProgress({
        phase: "mapping-snapshots",
        current: 0,
        total: request.summaries.length,
        message: "Teilscans und Server werden zugeordnet",
      });

      const options = request.summaries.flatMap((summary, index) => {
        if (cancelledRequests.has(request.requestId) || activeRequestId !== request.requestId) return [];
        const scanOptions = createScanCoverageOptions(summary, request.scans[index] ?? null);
        emitProgress({
          phase: "mapping-snapshots",
          current: index + 1,
          total: request.summaries.length,
          message: "Teilscans und Server werden zugeordnet",
        });
        return scanOptions;
      });

      if (cancelledRequests.has(request.requestId) || activeRequestId !== request.requestId) {
        postWorkerMessage({ type: "cancelled", requestId: request.requestId });
        return;
      }

      emitProgress({ phase: "done", message: "Scan-Abdeckung vorbereitet" });
      postWorkerMessage({
        type: "options-complete",
        requestId: request.requestId,
        options,
        timings: timings.finish(),
      });
      return;
    }

    if (request.type === "analyze-selection") {
      emitProgress({
        phase: "mapping-snapshots",
        current: 0,
        total: 1,
        message: "Teilscans und Server werden zugeordnet",
      });

      const analysis = analyzeScanCoverageSelection(request.scan, request.option, {
        onProgress: emitProgress,
      });

      if (cancelledRequests.has(request.requestId) || activeRequestId !== request.requestId) {
        postWorkerMessage({ type: "cancelled", requestId: request.requestId });
        return;
      }

      emitProgress({ phase: "done", message: "Scan-Abdeckung vorbereitet" });
      postWorkerMessage({
        type: "selection-complete",
        requestId: request.requestId,
        analysis,
        timings: timings.finish(),
      });
      return;
    }

    emitProgress({
      phase: "building-coverage",
      current: 0,
      total: request.rankLimit,
      message: "Scan-Abdeckung wird erstellt",
    });
    const coverage = buildScanCoverageResult(
      request.rankedPlayers,
      request.selectedServer,
      request.rankLimit,
    );
    emitProgress({
      phase: "building-coverage",
      current: request.rankLimit,
      total: request.rankLimit,
      message: "Scan-Abdeckung wird erstellt",
    });

    if (cancelledRequests.has(request.requestId) || activeRequestId !== request.requestId) {
      postWorkerMessage({ type: "cancelled", requestId: request.requestId });
      return;
    }

    emitProgress({ phase: "done", message: "Scan-Abdeckung vorbereitet" });
    postWorkerMessage({
      type: "coverage-complete",
      requestId: request.requestId,
      coverage,
      timings: timings.finish(),
    });
  } catch (error) {
    if (cancelledRequests.has(request.requestId) || activeRequestId !== request.requestId) {
      postWorkerMessage({ type: "cancelled", requestId: request.requestId });
      return;
    }
    postWorkerMessage({
      type: "error",
      requestId: request.requestId,
      phase: currentPhase,
      message: serializeError(error),
    });
  } finally {
    if (activeRequestId === request.requestId) activeRequestId = null;
    cancelledRequests.delete(request.requestId);
  }
};

globalThis.addEventListener("message", (event: MessageEvent<ScanCoverageWorkerRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    cancelledRequests.add(request.requestId);
    if (activeRequestId === request.requestId) activeRequestId = null;
    postWorkerMessage({ type: "cancelled", requestId: request.requestId });
    return;
  }

  if (activeRequestId && activeRequestId !== request.requestId) {
    cancelledRequests.add(activeRequestId);
  }

  void runRequest(request);
});
