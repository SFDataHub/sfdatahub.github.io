import type {
  ScanArchiveDownloadProgress,
  ScanArchiveDownloadProgressPhase,
  ScanArchiveDownloadRequest,
  ScanArchiveDownloadResponse,
} from "../lib/scanArchive/downloadWorkerTypes";
import { validateScanArchivePayload } from "../lib/scanArchive/validation";

let activeRequestId: string | null = null;
const cancelledRequests = new Set<string>();

const postWorkerMessage = (message: ScanArchiveDownloadResponse) => {
  globalThis.postMessage(message);
};

const serializeError = (error: unknown) =>
  error instanceof Error ? error.message : "Scanarchiv-Download fehlgeschlagen.";

const sha256Hex = async (bytes: ArrayBuffer) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const gunzip = async (bytes: ArrayBuffer) => {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("gzip-Entpackung wird von diesem Browser nicht unterstuetzt.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
};

const runRequest = async (request: Exclude<ScanArchiveDownloadRequest, { type: "cancel" }>) => {
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
    emitProgress({ phase: "downloading", message: "Archivdatei wird geladen." });
    const response = await fetch(request.entry.fileUrl, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Download fehlgeschlagen (${response.status}).`);
    const compressed = await response.arrayBuffer();
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
    const digest = await sha256Hex(compressed);
    assertActive();
    if (digest !== request.entry.sha256.toLowerCase()) {
      throw new Error("SHA-256-Pruefsumme stimmt nicht mit dem Manifest ueberein.");
    }

    emitProgress({ phase: "decompressing", message: "gzip-Datei wird entpackt." });
    const rawBytes = await gunzip(compressed);
    assertActive();
    if (rawBytes.byteLength !== request.entry.uncompressedBytes) {
      throw new Error("Entpackte Groesse stimmt nicht mit dem Manifest ueberein.");
    }

    const content = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
    emitProgress({ phase: "validating", message: "Rohdaten werden geprueft." });
    const payload = JSON.parse(content) as unknown;
    const validatedPayload = validateScanArchivePayload(payload, request.entry);

    emitProgress({ phase: "done", message: "Archivscan wurde geprueft." });
    postWorkerMessage({
      type: "complete",
      requestId: request.requestId,
      content,
      playerCount: validatedPayload.players.length,
      groupCount: validatedPayload.groups.length,
    });
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
