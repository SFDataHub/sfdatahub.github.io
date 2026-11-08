import { auditPhaseBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave, auditFields, auditDiscard, auditAcceptWorker, auditWorkerResult } from "../lib/data-hub/runtimeAudit";
import { matchesLocalSourceValidity } from "../lib/guilds/localSourceValidity";
import { getSfDataHubLocalScan } from "../lib/guilds/localScanLibrary";
import { deriveLocalToplistsFromConfirmedScans } from "../lib/toplists/localToplistDerivation";
import type {
  LocalToplistDerivationProgress,
  LocalToplistDerivationWorkerRequest,
  LocalToplistDerivationWorkerResponse,
  LocalToplistDerivationWorkerSource,
  LocalToplistDerivedSnapshotPayload,
} from "../lib/toplists/localToplistWorkerTypes";

let activeRequestId: string | null = null;
const cancelledRequests = new Set<string>();

const postWorkerMessage = (message: LocalToplistDerivationWorkerResponse) => {
  globalThis.postMessage(message);
};

const serializeError = (error: unknown) =>
  error instanceof Error ? error.message : "Lokale Toplisten-Ableitung fehlgeschlagen.";

const isCancelled = (requestId: string) =>
  cancelledRequests.has(requestId) || activeRequestId !== requestId;

const buildSnapshot = async (
  source: LocalToplistDerivationWorkerSource,
  requestId: string,
): Promise<LocalToplistDerivedSnapshotPayload> => {
    const __audit1 = auditPhaseBegin("buildSnapshot", undefined, "async-container");

    try {
  const scan = await (auditValue(__audit1, auditEnter(__audit1, "getSfDataHubLocalScan"), (getSfDataHubLocalScan(source.localScanId))));
  if (isCancelled(requestId)) throw new Error("cancelled");
  if (!scan) throw new Error(`Lokaler Scan wurde nicht gefunden: ${source.localScanId}`);
  if (scan.contentHash !== source.localContentHash || !matchesLocalSourceValidity(scan, source)) {
    throw new Error(`Lokaler Scan-Content-Hash passt nicht zur bestaetigten Quelle: ${source.localScanId}`);
  }

  const derived = (auditValue(__audit1, auditEnter(__audit1, "deriveLocalToplistsFromConfirmedScans", "sync-elapsed"), (deriveLocalToplistsFromConfirmedScans([{
    manifestYear: source.manifestYear,
    archiveScanId: source.archiveScanId,
    archiveSha256: source.archiveSha256,
    server: source.server,
    scanTimestamp: source.scanTimestamp,
    localScanId: source.localScanId,
    rawScan: scan.rawData,
    confirmation: source.confirmation,
  }]))));
  if (isCancelled(requestId)) throw new Error("cancelled");
  const snapshotMeta = derived.snapshots[0];
  if (!snapshotMeta || derived.status === "empty") {
    throw new Error(derived.issues[0]?.message ?? `Archivscan ${source.archiveScanId} konnte nicht abgeleitet werden.`);
  }

  return auditReturn(__audit1, {
    manifestYear: source.manifestYear,
    archiveScanId: source.archiveScanId,
    archiveSha256: source.archiveSha256,
    server: snapshotMeta.server,
    scanTimestamp: source.scanTimestamp,
    localScanId: source.localScanId,
    localContentHash: source.localContentHash,
    resetGeneration: source.resetGeneration,
    dependencies: source.dependencies,
    sourceGeneration: scan.sourceGeneration,
    normalizerVersion: scan.normalizerVersion,
    coreNormalizerVersion: scan.coreNormalizerVersion,
    playerRows: derived.players,
    guildRows: derived.guilds,
    snapshotMeta,
    issues: derived.issues,
  });

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
};

const runDerivation = async (request: Extract<LocalToplistDerivationWorkerRequest, { type: "derive-toplists" }>) => {
    const __audit2 = auditAcceptWorker(request.audit);
const postWorkerMessage = (message: Parameters<typeof globalThis.postMessage>[0]) => { globalThis.postMessage(__audit2 && message.type !== "progress" ? { ...message, auditReport: auditWorkerResult(__audit2, message.type === "error" ? "failed" : message.type === "cancelled" ? "aborted" : "completed") } : message); };
    try {
  activeRequestId = request.requestId;
  cancelledRequests.delete(request.requestId);
  let currentPhase: LocalToplistDerivationProgress["phase"] | undefined;

  const emitProgress = (progress: LocalToplistDerivationProgress) => {
    if (isCancelled(request.requestId)) return;
    currentPhase = progress.phase;
    postWorkerMessage({ type: "progress", requestId: request.requestId, progress });
  };

  try {
    const snapshots: LocalToplistDerivedSnapshotPayload[] = [];
    const total = request.sources.length;

    emitProgress({ phase: "loading-scans", current: 0, total, message: "Lokale Archivscans werden geladen." });
    for (let index = 0; index < request.sources.length; index += 1) {
      if (isCancelled(request.requestId)) {
        postWorkerMessage({ type: "cancelled", requestId: request.requestId });
        return auditReturn(__audit2, undefined);
      }
      emitProgress({ phase: "deriving", current: index, total, message: "Lokale Toplisten werden abgeleitet." });
      snapshots.push(await (auditValue(__audit2, auditEnter(__audit2, "buildSnapshot"), ((auditValue(__audit2, auditEnter(__audit2, "buildSnapshot", "sync-elapsed"), (buildSnapshot(request.sources[index], request.requestId))))))));
      emitProgress({ phase: "deriving", current: index + 1, total, message: "Lokale Toplisten werden abgeleitet." });
    }

    if (isCancelled(request.requestId)) {
      postWorkerMessage({ type: "cancelled", requestId: request.requestId });
      return auditReturn(__audit2, undefined);
    }
    emitProgress({ phase: "done", current: total, total, message: "Lokale Toplisten sind bereit." });
    postWorkerMessage({ type: "complete", requestId: request.requestId, snapshots });
  } catch (error) { if (__audit2) auditFields(__audit2, { caughtErrorClass: error instanceof Error ? error.name : "unknown" });
    if (serializeError(error) === "cancelled" || isCancelled(request.requestId)) {
      postWorkerMessage({ type: "cancelled", requestId: request.requestId });
      return (__audit2 && auditDiscard(__audit2), auditReturn(__audit2, undefined));
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

    } catch (__auditError) { auditError(__audit2, __auditError); throw __auditError; }
    finally { auditLeave(__audit2); }
};

globalThis.addEventListener("message", (event: MessageEvent<LocalToplistDerivationWorkerRequest>) => {
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

  void runDerivation(request);
});
