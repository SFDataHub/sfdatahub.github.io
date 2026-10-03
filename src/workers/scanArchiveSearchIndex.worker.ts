import {
  getScanArchiveSearchIndexUrl,
  validateDownloadedScanArchiveSearchIndex,
} from "../lib/scanArchive/compressedJson";
import type {
  ScanArchiveSearchIndexProgress,
  ScanArchiveSearchIndexProgressPhase,
  ScanArchiveSearchIndexWorkerRequest,
  ScanArchiveSearchIndexWorkerResponse,
} from "../lib/scanArchive/searchIndexWorkerTypes";

let activeRequestId: string | null = null;
const cancelledRequests = new Set<string>();

const postWorkerMessage = (message: ScanArchiveSearchIndexWorkerResponse) => {
  globalThis.postMessage(message);
};

const serializeError = (error: unknown) =>
  error instanceof Error ? error.message : "Scanarchiv-Suchindex-Download fehlgeschlagen.";

const runRequest = async (request: Extract<ScanArchiveSearchIndexWorkerRequest, { type: "download-search-index" }>) => {
  activeRequestId = request.requestId;
  cancelledRequests.delete(request.requestId);
  let currentPhase: ScanArchiveSearchIndexProgressPhase | undefined;

  const emitProgress = (progress: ScanArchiveSearchIndexProgress) => {
    if (cancelledRequests.has(request.requestId) || activeRequestId !== request.requestId) return;
    currentPhase = progress.phase;
    postWorkerMessage({ type: "progress", requestId: request.requestId, progress });
  };

  const assertActive = () => {
    if (cancelledRequests.has(request.requestId) || activeRequestId !== request.requestId) {
      throw new Error("cancelled");
    }
  };

  try {
    if (!request.entry.searchIndex) throw new Error(`Archivscan ${request.entry.id} hat keinen Suchindex.`);
    emitProgress({ phase: "downloading", message: "Suchindex wird geladen." });
    const response = await fetch(getScanArchiveSearchIndexUrl(request.entry), { cache: "no-cache" });
    if (!response.ok) throw new Error(`Suchindex-Download fehlgeschlagen (${response.status}).`);
    const compressed = await response.arrayBuffer();
    assertActive();

    emitProgress({
      phase: "hashing",
      message: "Suchindex-Pruefsumme wird berechnet.",
      loadedBytes: compressed.byteLength,
      totalBytes: request.entry.searchIndex.compressedBytes,
    });
    emitProgress({ phase: "decompressing", message: "Suchindex-gzip wird entpackt." });
    emitProgress({ phase: "validating", message: "Suchindex wird geprueft." });
    const payload = await validateDownloadedScanArchiveSearchIndex(request.entry, compressed);
    assertActive();

    emitProgress({ phase: "done", message: "Suchindex wurde geprueft." });
    postWorkerMessage({ type: "complete", requestId: request.requestId, payload });
  } catch (error) {
    if (serializeError(error) === "cancelled" || cancelledRequests.has(request.requestId) || activeRequestId !== request.requestId) {
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

globalThis.addEventListener("message", (event: MessageEvent<ScanArchiveSearchIndexWorkerRequest>) => {
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
