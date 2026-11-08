import { auditEnter, auditValue, auditReturn, auditError, auditLeave, auditFields, auditDiscard, auditAcceptWorker, auditWorkerResult } from "../lib/data-hub/runtimeAudit";
import type {
  ScanArchiveDownloadProgress,
  ScanArchiveDownloadProgressPhase,
  ScanArchiveDownloadRequest,
  ScanArchiveDownloadResponse,
} from "../lib/scanArchive/downloadWorkerTypes";
import { gunzipArrayBuffer, sha256Hex } from "../lib/scanArchive/compressedJson";
import { validateScanArchivePayload } from "../lib/scanArchive/validation";
import { createGuildHubLocalScanImportPreview, deriveGuildHubLogicalScanSnapshots } from "../lib/guilds/localScanLibrary";

let activeRequestId: string | null = null;
const cancelledRequests = new Set<string>();

const postWorkerMessage = (message: ScanArchiveDownloadResponse) => {
  globalThis.postMessage(message);
};

const serializeError = (error: unknown) =>
  error instanceof Error ? error.message : "Scanarchiv-Download fehlgeschlagen.";

const runRequest = async (request: Exclude<ScanArchiveDownloadRequest, { type: "cancel" }>) => {
    const __audit1 = auditAcceptWorker(request.audit);
const postWorkerMessage = (message: Parameters<typeof globalThis.postMessage>[0]) => { globalThis.postMessage(__audit1 && message.type !== "progress" ? { ...message, auditReport: auditWorkerResult(__audit1, message.type === "error" ? "failed" : message.type === "cancelled" ? "aborted" : "completed") } : message); };
    try {
  activeRequestId = request.requestId;
  cancelledRequests.delete(request.requestId);
  let currentPhase: ScanArchiveDownloadProgressPhase | undefined;

  const emitProgress = (progress: ScanArchiveDownloadProgress) => {
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
    if (request.type === "preview-local-scan") {
      emitProgress({ phase: "validating", message: "Preparing local scan preview" });
      const scan = await (auditValue(__audit1, auditEnter(__audit1, "local-scan-preview"),
        createGuildHubLocalScanImportPreview(request.filename, request.content)));
      const snapshots = auditValue(__audit1, auditEnter(__audit1, "local-scan-preview-statistics", "sync-elapsed"), deriveGuildHubLogicalScanSnapshots(scan));
      const statistics = {
        normalizedMemberCount: snapshots.reduce((sum, snapshot) => sum + snapshot.normalizedMembers.length, 0),
        snapshots: snapshots.map(({ timestamp, playerCount, guildCount }) => ({ timestamp, playerCount, guildCount })),
      };
      assertActive();
      postWorkerMessage({ type: "preview-complete", requestId: request.requestId, scan, statistics });
      return;
    }
    emitProgress({ phase: "downloading", message: "Archivdatei wird geladen." });
    const response = await (auditValue(__audit1, auditEnter(__audit1, "fetch"), (fetch(request.entry.fileUrl, { cache: "no-cache" }))));
    if (!response.ok) throw new Error(`Download fehlgeschlagen (${response.status}).`);
    const compressed = await (auditValue(__audit1, auditEnter(__audit1, "response.arrayBuffer"), (response.arrayBuffer())));
    assertActive();

    if (compressed.byteLength !== request.entry.compressedBytes) {
      throw new Error("Downloadgroesse stimmt nicht mit dem Manifest ueberein.");
    }

    emitProgress({
      phase: "hashing",
      message: "Pruefsumme wird berechnet.",
      loadedBytes: compressed.byteLength,
      totalBytes: request.entry.compressedBytes,
    });
    const digest = await (auditValue(__audit1, auditEnter(__audit1, "sha256Hex"), (sha256Hex(compressed))));
    assertActive();
    if (digest !== request.entry.sha256.toLowerCase()) {
      throw new Error("SHA-256-Pruefsumme stimmt nicht mit dem Manifest ueberein.");
    }

    emitProgress({ phase: "decompressing", message: "gzip-Datei wird entpackt." });
    const rawBytes = await (auditValue(__audit1, auditEnter(__audit1, "gunzipArrayBuffer"), (gunzipArrayBuffer(compressed))));
    assertActive();
    if (rawBytes.byteLength !== request.entry.uncompressedBytes) {
      throw new Error("Entpackte Groesse stimmt nicht mit dem Manifest ueberein.");
    }

    const content = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
    emitProgress({ phase: "validating", message: "Rohdaten werden geprueft." });
    const payload = (auditValue(__audit1, auditEnter(__audit1, "JSON.parse", "sync-elapsed"), (JSON.parse(content)))) as unknown;
    const validatedPayload = validateScanArchivePayload(payload, request.entry);

    emitProgress({ phase: "done", message: "Archivscan wurde geprueft." });
    postWorkerMessage({
      type: "complete",
      requestId: request.requestId,
      content,
      playerCount: validatedPayload.players.length,
      groupCount: validatedPayload.groups.length,
    });
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

globalThis.addEventListener("message", (event: MessageEvent<ScanArchiveDownloadRequest>) => {
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
