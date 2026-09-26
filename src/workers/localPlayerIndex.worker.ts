import { getGuildHubLocalScan } from "../lib/guilds/localScanLibrary";
import { createLocalPlayerIndexBuilder } from "../lib/player-search/localPlayerIndex";
import type {
  LocalPlayerIndexProgress,
  LocalPlayerIndexProgressPhase,
  LocalPlayerIndexTiming,
  LocalPlayerIndexWorkerRequest,
  LocalPlayerIndexWorkerResponse,
} from "../lib/player-search/localPlayerIndexClient";

let activeRequestId: string | null = null;
const cancelledRequests = new Set<string>();

const postWorkerMessage = (message: LocalPlayerIndexWorkerResponse) => {
  globalThis.postMessage(message);
};

const serializeError = (error: unknown) =>
  error instanceof Error ? error.message : "Could not build local player index.";

const createTimingTracker = () => {
  const totalStartedAt = performance.now();
  const durations = new Map<LocalPlayerIndexProgressPhase | "total", { durationMs: number; count: number }>();
  let activePhase: LocalPlayerIndexProgressPhase | null = null;
  let activePhaseStartedAt = totalStartedAt;

  const addDuration = (phase: LocalPlayerIndexProgressPhase | "total", durationMs: number) => {
    const current = durations.get(phase) ?? { durationMs: 0, count: 0 };
    durations.set(phase, { durationMs: current.durationMs + durationMs, count: current.count + 1 });
  };

  return {
    mark(progress: LocalPlayerIndexProgress) {
      const now = performance.now();
      if (activePhase && activePhase !== progress.phase) {
        addDuration(activePhase, now - activePhaseStartedAt);
        activePhaseStartedAt = now;
      }
      activePhase = progress.phase;
    },
    finish(): LocalPlayerIndexTiming[] {
      const now = performance.now();
      if (activePhase) addDuration(activePhase, now - activePhaseStartedAt);
      addDuration("total", now - totalStartedAt);
      return [...durations.entries()].map(([phase, timing]) => ({
        phase,
        durationMs: timing.durationMs,
        count: timing.count,
      }));
    },
  };
};

const isCancelled = (requestId: string) =>
  cancelledRequests.has(requestId) || activeRequestId !== requestId;

const runBuildIndex = async (request: Extract<LocalPlayerIndexWorkerRequest, { type: "build-index" }>) => {
  activeRequestId = request.requestId;
  cancelledRequests.delete(request.requestId);
  const timings = createTimingTracker();
  let currentPhase: LocalPlayerIndexProgressPhase | undefined;

  const emitProgress = (progress: LocalPlayerIndexProgress) => {
    if (isCancelled(request.requestId)) return;
    currentPhase = progress.phase;
    timings.mark(progress);
    postWorkerMessage({ type: "progress", requestId: request.requestId, progress });
  };

  try {
    const builder = createLocalPlayerIndexBuilder({ serverFilter: request.serverFilter });
    const total = request.summaries.length;

    emitProgress({ phase: "loading-scans", current: 0, total, message: "Lokale F28-Scans werden geladen" });

    for (let index = 0; index < request.summaries.length; index += 1) {
      if (isCancelled(request.requestId)) {
        postWorkerMessage({ type: "cancelled", requestId: request.requestId });
        return;
      }

      const summary = request.summaries[index];
      const scan = await getGuildHubLocalScan(summary.sourceScanId);
      emitProgress({
        phase: "loading-scans",
        current: index + 1,
        total,
        message: "Lokale F28-Scans werden geladen",
      });

      if (isCancelled(request.requestId)) {
        postWorkerMessage({ type: "cancelled", requestId: request.requestId });
        return;
      }

      if (!scan) continue;
      emitProgress({
        phase: "indexing-scans",
        current: index,
        total,
        message: "Lokaler Spielerindex wird aufgebaut",
      });
      builder.addScan({ scan, summary });
      emitProgress({
        phase: "indexing-scans",
        current: index + 1,
        total,
        message: "Lokaler Spielerindex wird aufgebaut",
      });
    }

    if (isCancelled(request.requestId)) {
      postWorkerMessage({ type: "cancelled", requestId: request.requestId });
      return;
    }

    const index = builder.finish();
    emitProgress({ phase: "done", message: "Lokaler Spielerindex bereit" });
    postWorkerMessage({
      type: "complete",
      requestId: request.requestId,
      index,
      stats: index.stats,
      timings: timings.finish(),
    });
  } catch (error) {
    if (isCancelled(request.requestId)) {
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

globalThis.addEventListener("message", (event: MessageEvent<LocalPlayerIndexWorkerRequest>) => {
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

  void runBuildIndex(request);
});
