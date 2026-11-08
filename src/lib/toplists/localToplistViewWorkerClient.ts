import { auditBegin, auditPhaseBegin, auditReturn, auditError, auditLeave, auditCurrent, auditSpan, auditSpanEnd, auditEvent, auditWorkerEnvelope, auditMergeWorker, auditCall, type AuditRun, auditId } from "../data-hub/runtimeAudit";
import type { LocalGuildToplistRow, LocalPlayerToplistRow } from "./localToplistTypes";
import { localToplistContentRevision, localToplistDataContextKey } from "./localToplistDatasetRevision";
import type {
  LocalToplistViewWorkerInitRequest, LocalToplistViewWorkerResponse,
  LocalToplistViewWorkerSearchRequest, LocalToplistViewWorkerSearchSuccess,
  LocalToplistViewWorkerSuccess, LocalToplistViewWorkerViewRequest,
} from "./localToplistViewWorkerTypes";

export class LocalToplistViewWorkerCancelledError extends Error {
  constructor() { super("local_toplist_view_worker_cancelled"); this.name = "LocalToplistViewWorkerCancelledError"; }
}
type Success = LocalToplistViewWorkerSuccess | LocalToplistViewWorkerSearchSuccess;
type Message = Omit<LocalToplistViewWorkerInitRequest, "requestId"> | Omit<LocalToplistViewWorkerViewRequest, "requestId"> | Omit<LocalToplistViewWorkerSearchRequest, "requestId">;
type Pending = { resolve: (response: Success) => void; reject: (reason: unknown) => void; key: string; type: string; timer: ReturnType<typeof setTimeout>; audit: AuditRun | null; roundtrip: ReturnType<typeof auditSpan> };
let nextRequestId = 1;

export class LocalToplistViewWorkerSession {
  private worker: Worker | null = null;
  private auditInstance: string | undefined;
  private readonly pending = new Map<number, Pending>();
  private active: { datasetId: string; contentRevision: string; key: string } | null = null;
  private ready: LocalToplistViewWorkerSuccess | null = null;
  private init: Promise<LocalToplistViewWorkerSuccess> | null = null;
  private disposed = false;

  constructor() { this.worker = this.createWorker(); }

  private createWorker() {
    // Stable dev URLs may still be served by an installed cache-first service worker.
    // Vite strips source URL queries; append the contract to its generated dev URL.
    // Production already uses a content-hashed worker URL.
    const constructorAudit = auditSpan(auditCurrent(), "worker-constructor-call", "sync-elapsed");
    const worker = new Worker(new URL("../../workers/localToplistView.worker.ts", import.meta.url).href +
      (import.meta.env?.DEV ? "&content-contract=1" : ""), { type: "module" });
    auditSpanEnd(auditCurrent(), constructorAudit);
    this.auditInstance = undefined;
    worker.onmessage = (event: MessageEvent<LocalToplistViewWorkerResponse>) => {
      if (worker !== this.worker) return;
      const response = event.data;
      const pending = this.pending.get(response?.requestId);
      if (!pending) return;
      auditMergeWorker(pending.audit, response.auditReport);
      auditSpanEnd(pending.audit, pending.roundtrip);
      if (response.ok && response.type === "init") auditEvent(pending.audit, "worker-dataset-ready-observed");
      this.pending.delete(response.requestId);
      clearTimeout(pending.timer);
      if (pending.key !== this.active?.key) pending.reject(new LocalToplistViewWorkerCancelledError());
      else if (!response.ok) {
        const error = new Error(response.error);
        pending.reject(error);
        this.failWorker(error);
      }
      else if (response.type !== pending.type || response.datasetId !== this.active.datasetId || response.contentRevision !== this.active.contentRevision) {
        const error = new Error("local_toplist_view_worker_response_binding_mismatch");
        pending.reject(error);
        this.failWorker(error);
      } else pending.resolve(response);
    };
    worker.onerror = event => { if (worker === this.worker) this.failWorker(new Error(event.message || "local_toplist_view_worker_error")); };
    worker.onmessageerror = () => { if (worker === this.worker) this.failWorker(new Error("local_toplist_view_worker_message_error")); };
    return worker;
  }

  setData(datasetId: string, playerRows: LocalPlayerToplistRow[], guildRows: LocalGuildToplistRow[],
    contentRevision = localToplistContentRevision([playerRows, guildRows])) {
    if (this.disposed) return Promise.reject(new LocalToplistViewWorkerCancelledError());
    if (!this.worker) this.worker = this.createWorker();
    const key = localToplistDataContextKey(datasetId, contentRevision);
    if (key === this.active?.key) {
      if (this.ready) return Promise.resolve(this.ready);
      if (this.init) return this.init;
    }
    this.rejectAll(new LocalToplistViewWorkerCancelledError());
    this.active = { datasetId, contentRevision, key };
    const init = this.send({ type: "init", datasetId, contentRevision, playerRows, guildRows }).then(response => {
      if (this.active?.key !== key || this.init !== init) throw new LocalToplistViewWorkerCancelledError();
      this.ready = response as LocalToplistViewWorkerSuccess;
      this.init = null;
      return this.ready;
    }).catch(error => {
      if (this.init === init) { this.init = null; this.ready = null; }
      throw error;
    });
    this.init = init;
    return init;
  }

  requestView(request: Omit<LocalToplistViewWorkerViewRequest, "requestId" | "type">) {
    const __audit1 = auditPhaseBegin("requestView");
    try {
    return auditReturn(__audit1, (__audit1 ? auditCall(__audit1, "view-request-dispatch", () => this.request({ ...request, type: "view" })) : this.request({ ...request, type: "view" })) as Promise<LocalToplistViewWorkerSuccess>);

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
}
  requestSearch(request: Omit<LocalToplistViewWorkerSearchRequest, "requestId" | "type">) {
    const __audit2 = auditBegin("F22", "requestSearch");
    try {
    return auditReturn(__audit2, (__audit2 ? auditCall(__audit2, "search-request-dispatch", () => this.request({ ...request, type: "search" })) : this.request({ ...request, type: "search" })) as Promise<LocalToplistViewWorkerSearchSuccess>);

    } catch (__auditError) { auditError(__audit2, __auditError); throw __auditError; }
    finally { auditLeave(__audit2); }
}
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
    this.rejectAll(new LocalToplistViewWorkerCancelledError());
  }
  private request(request: Omit<LocalToplistViewWorkerViewRequest, "requestId"> | Omit<LocalToplistViewWorkerSearchRequest, "requestId">) {
    if (!this.ready || request.datasetId !== this.active?.datasetId ||
      (request.contentRevision != null && request.contentRevision !== this.active?.contentRevision)) {
      return Promise.reject(new LocalToplistViewWorkerCancelledError());
    }
    return this.send({ ...request, contentRevision: this.active.contentRevision });
  }
  private send(request: Message) {
    if (this.disposed) return Promise.reject(new LocalToplistViewWorkerCancelledError());
    const audit = auditCurrent();
    if (audit && !this.auditInstance) this.auditInstance = auditId("toplist-view-worker");
    const requestId = nextRequestId++;
    return new Promise<Success>((resolve, reject) => {
      const timer = setTimeout(() => this.failWorker(new Error("local_toplist_view_worker_timeout")), 15000);
      this.pending.set(requestId, { audit, roundtrip: auditSpan(audit, "worker-request-roundtrip"), resolve, reject, timer, key: this.active!.key, type: request.type });
      const sendAudit = auditSpan(audit, "postMessage-call", "sync-elapsed");
      try { this.worker!.postMessage({ ...request, requestId, ...(audit ? { audit: auditWorkerEnvelope(audit, this.auditInstance!, String(requestId)) } : undefined) }); }
      catch (error) { this.failWorker(error); } finally { auditSpanEnd(audit, sendAudit); }
    });
  }
  private failWorker(reason: unknown) {
    this.worker?.terminate();
    this.worker = null;
    this.rejectAll(reason);
  }
  private rejectAll(reason: unknown) {
    for (const pending of this.pending.values()) { auditError(pending.audit, reason); auditSpanEnd(pending.audit, pending.roundtrip); clearTimeout(pending.timer); pending.reject(reason); }
    this.pending.clear();
    this.ready = null;
    this.init = null;
  }
}
