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
  const scan = await getSfDataHubLocalScan(source.localScanId);
  if (isCancelled(requestId)) throw new Error("cancelled");
  if (!scan) throw new Error(`Lokaler Scan wurde nicht gefunden: ${source.localScanId}`);
  if (scan.contentHash !== source.localContentHash) {
    throw new Error(`Lokaler Scan-Content-Hash passt nicht zur bestaetigten Quelle: ${source.localScanId}`);
  }

  const derived = deriveLocalToplistsFromConfirmedScans([{
    manifestYear: source.manifestYear,
    archiveScanId: source.archiveScanId,
    archiveSha256: source.archiveSha256,
    server: source.server,
    scanTimestamp: source.scanTimestamp,
    localScanId: source.localScanId,
    rawScan: scan.rawData,
    confirmation: source.confirmation,
  }]);
  if (isCancelled(requestId)) throw new Error("cancelled");
  const snapshotMeta = derived.snapshots[0];
  if (!snapshotMeta || derived.status === "empty") {
    throw new Error(derived.issues[0]?.message ?? `Archivscan ${source.archiveScanId} konnte nicht abgeleitet werden.`);
  }

  return {
    manifestYear: source.manifestYear,
    archiveScanId: source.archiveScanId,
    archiveSha256: source.archiveSha256,
    server: snapshotMeta.server,
    scanTimestamp: source.scanTimestamp,
    localScanId: source.localScanId,
    localContentHash: source.localContentHash,
    playerRows: derived.players,
    guildRows: derived.guilds,
    snapshotMeta,
    issues: derived.issues,
  };
};

const runDerivation = async (request: Extract<LocalToplistDerivationWorkerRequest, { type: "derive-toplists" }>) => {
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
        return;
      }
      emitProgress({ phase: "deriving", current: index, total, message: "Lokale Toplisten werden abgeleitet." });
      snapshots.push(await buildSnapshot(request.sources[index], request.requestId));
      emitProgress({ phase: "deriving", current: index + 1, total, message: "Lokale Toplisten werden abgeleitet." });
    }

    if (isCancelled(request.requestId)) {
      postWorkerMessage({ type: "cancelled", requestId: request.requestId });
      return;
    }
    emitProgress({ phase: "done", current: total, total, message: "Lokale Toplisten sind bereit." });
    postWorkerMessage({ type: "complete", requestId: request.requestId, snapshots });
  } catch (error) {
    if (serializeError(error) === "cancelled" || isCancelled(request.requestId)) {
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
