import { auditCurrent, auditSpan, auditSpanEnd, auditEvent, auditFields, auditError, auditWorkerEnvelope, auditMergeWorker } from "../data-hub/runtimeAudit";
import type {
  LocalToplistDerivationProgress,
  LocalToplistDerivationWorkerRequest,
  LocalToplistDerivationWorkerResponse,
  LocalToplistDerivationWorkerSource,
  LocalToplistDerivedSnapshotPayload,
} from "./localToplistWorkerTypes";

export class LocalToplistDerivationCancelledError extends Error {
  constructor() {
    super("local_toplist_derivation_cancelled");
    this.name = "LocalToplistDerivationCancelledError";
  }
}

export type LocalToplistDerivationWorkerLike = {
  postMessage(message: LocalToplistDerivationWorkerRequest): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: MessageEvent<LocalToplistDerivationWorkerResponse>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<LocalToplistDerivationWorkerResponse>) => void): void;
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
};

export type LocalToplistDerivationWorkerRun = {
  requestId: string;
  promise: Promise<LocalToplistDerivedSnapshotPayload[]>;
  cancel(): void;
};

const createRequestId = () => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `local-toplist-derivation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export const createLocalToplistDerivationWorker = (): LocalToplistDerivationWorkerLike =>
  new Worker(new URL("../../workers/localToplistDerivation.worker.ts", import.meta.url), { type: "module" });

export function startLocalToplistDerivationWorkerRun(options: {
  sources: LocalToplistDerivationWorkerSource[];
  requestId?: string;
  workerFactory?: () => LocalToplistDerivationWorkerLike;
  onProgress?: (progress: LocalToplistDerivationProgress) => void;
}): LocalToplistDerivationWorkerRun {
  const ownerAudit = auditCurrent();
  const requestId = options.requestId ?? createRequestId();
  const constructorAudit = auditSpan(ownerAudit, "worker-constructor-call", "sync-elapsed");
  const worker = (options.workerFactory ?? createLocalToplistDerivationWorker)();
  auditSpanEnd(ownerAudit, constructorAudit);
  if (ownerAudit) auditFields(ownerAudit, { workerReady: "unknown; no readiness event", workerInstanceId: requestId, workerKind: "derive-toplists" });
  const roundtripAudit = auditSpan(ownerAudit, "worker-request-roundtrip");
  let settled = false;
  let rejectRun: (reason?: unknown) => void = () => undefined;
  let handleMessage: (event: MessageEvent<LocalToplistDerivationWorkerResponse>) => void = () => undefined;
  let handleError: (event: ErrorEvent) => void = () => undefined;

  const cleanup = () => {
    worker.removeEventListener("message", handleMessage);
    worker.removeEventListener("error", handleError);
  };

  const promise = new Promise<LocalToplistDerivedSnapshotPayload[]>((resolve, reject) => {
    rejectRun = reject;

    handleMessage = (event) => {
      const message = event.data;
      if (message.requestId !== requestId || settled) return;

      if (message.type === "progress") {
        options.onProgress?.(message.progress);
        return;
      }

      auditMergeWorker(ownerAudit, message.auditReport);
      auditSpanEnd(ownerAudit, roundtripAudit);
      auditEvent(ownerAudit, "worker-response-receipt");
      settled = true;
      cleanup();
      worker.terminate();

      if (message.type === "complete") {
        resolve(message.snapshots);
        return;
      }
      if (message.type === "cancelled") {
        reject(new LocalToplistDerivationCancelledError());
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
      reject(new Error(event.message || "Lokale Toplisten-Ableitung fehlgeschlagen."));
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    const sendAudit = auditSpan(ownerAudit, "postMessage-call", "sync-elapsed");
    try { worker.postMessage({ type: "derive-toplists", requestId, sources: options.sources, ...(ownerAudit ? { audit: auditWorkerEnvelope(ownerAudit, requestId, requestId) } : undefined) }); } finally { auditSpanEnd(ownerAudit, sendAudit); }
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
      rejectRun(new LocalToplistDerivationCancelledError());
    },
  };
}
