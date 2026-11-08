import { auditEnter, auditValue, auditReturn, auditError, auditLeave, auditFields, auditDiscard, auditAcceptWorker, auditWorkerResult } from "../lib/data-hub/runtimeAudit";
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
    const __audit1 = auditAcceptWorker(request.audit);
const postWorkerMessage = (message: Parameters<typeof globalThis.postMessage>[0]) => { globalThis.postMessage(__audit1 && message.type !== "progress" ? { ...message, auditReport: auditWorkerResult(__audit1, message.type === "error" ? "failed" : message.type === "cancelled" ? "aborted" : "completed") } : message); };
    try {
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
    const response = await (auditValue(__audit1, auditEnter(__audit1, "fetch"), (fetch(getScanArchiveSearchIndexUrl(request.entry), { cache: "no-cache" }))));
    if (!response.ok) throw new Error(`Suchindex-Download fehlgeschlagen (${response.status}).`);
    const compressed = await (auditValue(__audit1, auditEnter(__audit1, "response.arrayBuffer"), (response.arrayBuffer())));
    assertActive();

    emitProgress({
      phase: "hashing",
      message: "Suchindex-Pruefsumme wird berechnet.",
      loadedBytes: compressed.byteLength,
      totalBytes: request.entry.searchIndex.compressedBytes,
    });
    emitProgress({ phase: "decompressing", message: "Suchindex-gzip wird entpackt." });
    emitProgress({ phase: "validating", message: "Suchindex wird geprueft." });
    const payload = await (auditValue(__audit1, auditEnter(__audit1, "validateDownloadedScanArchiveSearchIndex"), (validateDownloadedScanArchiveSearchIndex(request.entry, compressed))));
    assertActive();

    emitProgress({ phase: "done", message: "Suchindex wurde geprueft." });
    postWorkerMessage({ type: "complete", requestId: request.requestId, payload });
  } catch (error) { if (__audit1) auditFields(__audit1, { caughtErrorClass: error instanceof Error ? error.name : "unknown" });
    if (serializeError(error) === "cancelled" || cancelledRequests.has(request.requestId) || activeRequestId !== request.requestId) {
      postWorkerMessage({ type: "cancelled", requestId: request.requestId });
      return (__audit1 && auditDiscard(__audit1), auditReturn(__audit1, undefined));
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

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
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
