import { auditCurrent, auditSpan, auditSpanEnd, auditEvent, auditFields, auditError, auditWorkerEnvelope, auditMergeWorker } from "../data-hub/runtimeAudit";
import i18n from "i18next";
import type {
  ScanArchiveDownloadProgress,
  ScanArchiveDownloadRequest,
  ScanArchiveDownloadResponse,
  PreparedLocalScanImport,
} from "./downloadWorkerTypes";
import type { ScanArchiveEntry } from "./types";

export class ScanArchiveDownloadCancelledError extends Error {
  constructor() {
    super("scan_archive_download_cancelled");
    this.name = "ScanArchiveDownloadCancelledError";
  }
}

export type ScanArchiveDownloadWorkerLike = {
  postMessage(message: ScanArchiveDownloadRequest): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: MessageEvent<ScanArchiveDownloadResponse>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<ScanArchiveDownloadResponse>) => void): void;
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
};

export type ScanArchiveDownloadRun = {
  requestId: string;
  promise: Promise<{ content: string; playerCount: number; groupCount: number }>;
  cancel(): void;
};

const createRequestId = () => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `scan-archive-download-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export const createScanArchiveDownloadWorker = (): ScanArchiveDownloadWorkerLike =>
  new Worker(new URL("../../workers/scanArchiveDownload.worker.ts", import.meta.url), { type: "module" });

export function startScanArchiveDownloadWorkerRun(options: {
  entry: ScanArchiveEntry;
  requestId?: string;
  workerFactory?: () => ScanArchiveDownloadWorkerLike;
  onProgress?: (progress: ScanArchiveDownloadProgress) => void;
}): ScanArchiveDownloadRun {
  const ownerAudit = auditCurrent();
  const requestId = options.requestId ?? createRequestId();
  const constructorAudit = auditSpan(ownerAudit, "worker-constructor-call", "sync-elapsed");
  const worker = (options.workerFactory ?? createScanArchiveDownloadWorker)();
  auditSpanEnd(ownerAudit, constructorAudit);
  if (ownerAudit) auditFields(ownerAudit, { workerReady: "unknown; no readiness event", workerInstanceId: requestId, workerKind: "download" });
  const roundtripAudit = auditSpan(ownerAudit, "worker-request-roundtrip");
  let settled = false;
  let rejectRun: (reason?: unknown) => void = () => undefined;
  let handleMessage: (event: MessageEvent<ScanArchiveDownloadResponse>) => void = () => undefined;
  let handleError: (event: ErrorEvent) => void = () => undefined;

  const cleanup = () => {
    worker.removeEventListener("message", handleMessage);
    worker.removeEventListener("error", handleError);
  };

  const promise = new Promise<{ content: string; playerCount: number; groupCount: number }>((resolve, reject) => {
    rejectRun = reject;

    handleMessage = (event) => {
      const message = event.data;
      if (message.requestId !== requestId || settled) return;

      if (message.type === "progress") {
        options.onProgress?.(message.progress);
        return;
      }
      if (message.type === "preview-complete") return;

      auditMergeWorker(ownerAudit, message.auditReport);
      auditSpanEnd(ownerAudit, roundtripAudit);
      auditEvent(ownerAudit, "worker-response-receipt");
      settled = true;
      cleanup();
      worker.terminate();

      if (message.type === "complete") {
        resolve({ content: message.content, playerCount: message.playerCount, groupCount: message.groupCount });
        return;
      }
      if (message.type === "cancelled") {
        reject(new ScanArchiveDownloadCancelledError());
        return;
      }
      reject(new Error(message.message));
    };

    handleError = (event) => {
      auditError(ownerAudit, new Error(event.message));
      auditSpanEnd(ownerAudit, roundtripAudit);
      if (settled) return;
      settled = true;
      cleanup();
      worker.terminate();
      reject(new Error(event.message || "Scanarchiv-Download fehlgeschlagen."));
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    const sendAudit = auditSpan(ownerAudit, "postMessage-call", "sync-elapsed");
    try { worker.postMessage({ type: "download", requestId, entry: options.entry, ...(ownerAudit ? { audit: auditWorkerEnvelope(ownerAudit, requestId, requestId) } : undefined) }); } finally { auditSpanEnd(ownerAudit, sendAudit); }
  });

  return {
    requestId,
    promise,
    cancel() {
      if (settled) return;
      auditEvent(ownerAudit, "worker-cancel-and-terminate");
      auditSpanEnd(ownerAudit, roundtripAudit);
      settled = true;
      cleanup();
      try {
        worker.postMessage({ type: "cancel", requestId });
      } catch {
        // Worker may already be gone.
      }
      worker.terminate();
      rejectRun(new ScanArchiveDownloadCancelledError());
    },
  };
}

/** Local file preview uses the existing decode/validation worker. It performs
 * no writes; the confirmed DataJob retains ownership of the normal commit. */
export function prepareLocalScanImportInWorker(options: {
  filename: string;
  content: string;
  signal?: AbortSignal;
  workerFactory?: () => ScanArchiveDownloadWorkerLike;
}): Promise<PreparedLocalScanImport> {
  if (options.signal?.aborted) return Promise.reject(new DOMException("Local scan preview cancelled.", "AbortError"));
  const owner = auditCurrent();
  const requestId = createRequestId();
  const construct = auditSpan(owner, "local-preview:worker-constructor", "sync-elapsed");
  const worker = (options.workerFactory ?? createScanArchiveDownloadWorker)();
  auditSpanEnd(owner, construct);
  const roundtrip = auditSpan(owner, "local-preview:worker-roundtrip");
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.terminate();
      options.signal?.removeEventListener("abort", onAbort);
      auditSpanEnd(owner, roundtrip);
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(event.message || i18n.t("localScanImport.previewFailed", { defaultValue: "Could not prepare the local scan." })));
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Local scan preview cancelled.", "AbortError"));
    };
    const onMessage = (event: MessageEvent<ScanArchiveDownloadResponse>) => {
      const message = event.data;
      if (message.requestId !== requestId || message.type === "progress") return;
      auditMergeWorker(owner, message.auditReport);
      cleanup();
      if (message.type === "preview-complete") resolve({ scan: message.scan, statistics: message.statistics });
      else reject(new Error(message.type === "error" ? message.message : i18n.t("localScanImport.previewInterrupted", { defaultValue: "Local scan preparation was interrupted." })));
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) { onAbort(); return; }
    const send = auditSpan(owner, "local-preview:postMessage", "sync-elapsed");
    try {
      worker.postMessage({ type: "preview-local-scan", requestId, filename: options.filename, content: options.content,
        ...(owner ? { audit: auditWorkerEnvelope(owner, requestId, requestId) } : {}) });
    } catch (error) {
      cleanup();
      reject(error);
    } finally { auditSpanEnd(owner, send); }
  });
}
