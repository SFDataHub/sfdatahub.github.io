import { CURRENT_FUSION_RESOLVER_VERSION } from "../lib/identities/fusionAnalysisCache";
import { captureLocalDataDependencies, revalidateLocalDataDependencies } from "../lib/local-data/localDataDependencies";
import { loadFusionIdentityManagementReport } from "../lib/identities/fusionIdentityManagement";
import type { FusionIdentityAnalysisScope } from "../lib/identities/fusionIdentityScopes";
import type {
  FusionIdentityProgress,
  FusionIdentityProgressPhase,
  FusionIdentityWorkerRequest,
  FusionIdentityWorkerResponse,
  FusionIdentityWorkerTiming,
} from "../lib/identities/fusionIdentityWorkerTypes";

let activeRequestId: string | null = null;
const cancelledRequests = new Set<string>();

const postWorkerMessage = (message: FusionIdentityWorkerResponse) => {
  globalThis.postMessage(message);
};

const createTimingTracker = () => {
  const totalStartedAt = performance.now();
  let activePhase: FusionIdentityProgressPhase | null = null;
  let activePhaseStartedAt = totalStartedAt;
  const durations = new Map<FusionIdentityWorkerTiming["phase"], number>();
  const extraTimings: FusionIdentityWorkerTiming[] = [];

  const addDuration = (phase: FusionIdentityWorkerTiming["phase"], durationMs: number) => {
    durations.set(phase, (durations.get(phase) ?? 0) + durationMs);
  };

  return {
    add(timing: FusionIdentityWorkerTiming) {
      extraTimings.push(timing);
    },
    mark(progress: FusionIdentityProgress) {
      const now = performance.now();
      if (activePhase && activePhase !== progress.phase) {
        addDuration(activePhase, now - activePhaseStartedAt);
        activePhaseStartedAt = now;
      }
      activePhase = progress.phase;
    },
    finish(): FusionIdentityWorkerTiming[] {
      const now = performance.now();
      if (activePhase) addDuration(activePhase, now - activePhaseStartedAt);
      addDuration("total", now - totalStartedAt);
      return [
        ...[...durations.entries()].map(([phase, durationMs]) => ({ phase, durationMs })),
        ...extraTimings,
      ];
    },
  };
};

const serializeError = (error: unknown) => (error instanceof Error ? error.message : "Could not build fusion identity report.");

const runBuildReport = async (
  requestId: string,
  scope?: FusionIdentityAnalysisScope,
) => {
  const workerRequestStartedAt = performance.now();
  activeRequestId = requestId;
  cancelledRequests.delete(requestId);
  const timings = createTimingTracker();
  let currentPhase: FusionIdentityProgressPhase | undefined;

  const emitProgress = (progress: FusionIdentityProgress) => {
    if (cancelledRequests.has(requestId) || activeRequestId !== requestId) return;
    currentPhase = progress.phase;
    timings.mark(progress);
    postWorkerMessage({ type: "progress", requestId, progress });
  };

  try {
    const dependencies = await captureLocalDataDependencies({ ...(scope ? { servers: [...scope.lineageServerCodes, ...scope.originServerCodes, scope.targetServerCode] } : { allSources: true }), allIdentities: true });
    const report = await loadFusionIdentityManagementReport(
      {},
      {
        onProgress: emitProgress,
        onTiming: (timing) => timings.add(timing),
        scope,
      },
    );
    if (cancelledRequests.has(requestId) || activeRequestId !== requestId) {
      postWorkerMessage({ type: "cancelled", requestId });
      return;
    }
    if (!(await revalidateLocalDataDependencies(dependencies)).current) throw new Error("Fusion dependencies changed during build.");
    emitProgress({ phase: "done", message: "Fusion identity report ready" });
    const workerComputeFinishedAt = performance.now();
    const finalTimings = timings.finish();
    finalTimings.push({
      phase: "worker:compute",
      durationMs: workerComputeFinishedAt - workerRequestStartedAt,
      count: 1,
    });
    report.dependencies = dependencies;
    postWorkerMessage({ type: "complete", resolverVersion: CURRENT_FUSION_RESOLVER_VERSION, requestId, report, dependencies, timings: finalTimings });
  } catch (error) {
    if (cancelledRequests.has(requestId) || activeRequestId !== requestId) {
      postWorkerMessage({ type: "cancelled", requestId });
      return;
    }
    postWorkerMessage({ type: "error", requestId, phase: currentPhase, message: serializeError(error) });
  } finally {
    if (activeRequestId === requestId) activeRequestId = null;
    cancelledRequests.delete(requestId);
  }
};

globalThis.addEventListener("message", (event: MessageEvent<FusionIdentityWorkerRequest>) => {
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

  void runBuildReport(request.requestId, request.scope);
});

