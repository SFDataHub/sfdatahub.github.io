// Dev-only Firestore read tracing helpers
// Toggles (localStorage, only active in DEV):
// - localStorage["sfh:debug:firestoreReads"]="1"         -> enable tracing
// - localStorage["sfh:debug:firestoreReadsCallsite"]="1" -> include callsite hints

type ReadEntry = {
  collection: string;
  path: string;
  op: string;
  docCount: number;
  startedAt: number;
  endedAt?: number;
  callsite?: string;
  label?: string;
};

type ScopeRecord = {
  id: number;
  name: string;
  startedAt: number;
  endedAt?: number;
  reads: ReadEntry[];
};

const STORAGE_KEY = "sfh:debug:firestoreReads";
const CALLSITE_KEY = "sfh:debug:firestoreReadsCallsite";
const STORAGE_KEY_ALIAS = "sf_debug_firestore_reads";
const CALLSITE_KEY_ALIAS = "sf_debug_firestore_reads_callsite";
const isDev = typeof import.meta !== "undefined" && !!import.meta.env?.DEV;
const globalTotals = new Map<string, number>();
const readTotalsByPath = new Map<string, { total: number; ops: Record<string, number> }>();
const readTotalsByOp = new Map<string, number>();
const readTotalsByCallsite = new Map<string, number>();
const listenerTotalsByPath = new Map<string, { callbacks: number; docs: number }>();
const activeListeners = new Map<number, ListenerRecord>();
let nextScopeId = 1;
let nextListenerId = 1;
let listenerCallbackTotal = 0;
let listenerReadTotal = 0;
let activeSession: { name?: string; startedAt: number } | null = null;

const log = (...args: any[]) => {
  // eslint-disable-next-line no-console
  console.log(...args);
};

export const isFirestoreReadTraceEnabled = () => {
  if (!isDev) return false;
  if (typeof window === "undefined" || !window?.localStorage) return false;
  return (
    window.localStorage.getItem(STORAGE_KEY) === "1" ||
    window.localStorage.getItem(STORAGE_KEY_ALIAS) === "1"
  );
};

const shouldLogCallsite = () => {
  if (!isFirestoreReadTraceEnabled()) return false;
  if (typeof window === "undefined" || !window?.localStorage) return false;
  return (
    window.localStorage.getItem(CALLSITE_KEY) === "1" ||
    window.localStorage.getItem(CALLSITE_KEY_ALIAS) === "1"
  );
};

const normalizeCollection = (path: string, fallback?: string) => {
  if (!path) return fallback ?? "unknown";
  const segments = path.split("/").filter(Boolean);
  return segments[0] || fallback || "unknown";
};

const extractCallsite = () => {
  if (!shouldLogCallsite()) return undefined;
  const err = new Error();
  if (!err.stack) return undefined;
  const lines = err.stack.split("\n").map((l) => l.trim());
  const filtered = lines.filter(
    (line) =>
      line &&
      !line.toLowerCase().includes("firestorereadtrace") &&
      !line.toLowerCase().includes("tracegetdoc") &&
      !line.toLowerCase().includes("tracegetdocs") &&
      !line.toLowerCase().includes("traceonsnapshot"),
  );
  return filtered[1] || filtered[0];
};

const normalizePath = (path?: string) => path?.trim() || "unknown";

const countSnapshotDocs = (snapshot: any): number => {
  if (!snapshot) return 0;
  if (typeof snapshot.size === "number") return snapshot.size;
  if (Array.isArray(snapshot.docs)) return snapshot.docs.length;
  if (typeof snapshot.exists === "function") return snapshot.exists() ? 1 : 0;
  if (typeof snapshot.exists === "boolean") return snapshot.exists ? 1 : 0;
  return 0;
};

type ListenerRecord = {
  id: number;
  path: string;
  startedAt: number;
  endedAt?: number;
  callbacks: number;
  docs: number;
  callsite?: string;
  label?: string;
};

export const beginReadScope = (name: string): ScopeRecord | null => {
  if (!isFirestoreReadTraceEnabled()) return null;
  return {
    id: nextScopeId++,
    name,
    startedAt: performance.now(),
    reads: [],
  };
};

export const recordRead = (
  scope: ScopeRecord | null,
  params: { collection?: string; path: string; op: string; docCount: number; label?: string; callsite?: string },
) => {
  if (!isFirestoreReadTraceEnabled()) return;
  const path = normalizePath(params.path);
  const collection = normalizeCollection(params.collection || path);
  const callsite = params.callsite ?? params.label ?? extractCallsite();

  if (scope) {
    scope.reads.push({
      collection,
      path,
      op: params.op,
      docCount: params.docCount,
      startedAt: performance.now(),
      callsite,
      label: params.label,
    });
  }

  globalTotals.set(collection, (globalTotals.get(collection) ?? 0) + params.docCount);
  const pathEntry = readTotalsByPath.get(path) ?? { total: 0, ops: {} };
  pathEntry.total += params.docCount;
  pathEntry.ops[params.op] = (pathEntry.ops[params.op] ?? 0) + params.docCount;
  readTotalsByPath.set(path, pathEntry);
  readTotalsByOp.set(params.op, (readTotalsByOp.get(params.op) ?? 0) + params.docCount);
  if (callsite) {
    readTotalsByCallsite.set(callsite, (readTotalsByCallsite.get(callsite) ?? 0) + params.docCount);
  }
};

export const endReadScope = (scope: ScopeRecord | null) => {
  if (!scope) return;
  scope.endedAt = performance.now();
  const duration = Math.round(scope.endedAt - scope.startedAt);
  const breakdown = scope.reads.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.collection] = (acc[entry.collection] ?? 0) + entry.docCount;
    return acc;
  }, {});
  const total = scope.reads.reduce((sum, entry) => sum + entry.docCount, 0);
  const details = scope.reads.map((entry) => ({
    op: entry.op,
    path: entry.path,
    collection: entry.collection,
    docs: entry.docCount,
    callsite: entry.callsite,
  }));

  const label = `[FirestoreTrace] ${scope.name} - ${total} reads in ${duration}ms`;
  // eslint-disable-next-line no-console
  console.groupCollapsed(label);
  log("Breakdown by collection", breakdown);
  log("Entries", details);
  if (shouldLogCallsite()) {
    const topCallsite = scope.reads.find((entry) => entry.callsite)?.callsite;
    if (topCallsite) {
      log("Top callsite", topCallsite);
    }
  }
  log("Totals (page lifetime)", Object.fromEntries(globalTotals.entries()));
  // eslint-disable-next-line no-console
  console.groupEnd();
};

export const traceGetDoc = async <T>(
  scope: ScopeRecord | null,
  ref: { path: string },
  getDocFn: () => Promise<T>,
  opts?: { label?: string },
): Promise<T> => {
  const result = await getDocFn();
  const count = (result as any)?.exists ? ((result as any).exists() ? 1 : 0) : 1;
  recordRead(scope, {
    collection: normalizeCollection(ref.path),
    path: ref.path,
    op: "getDoc",
    docCount: count,
    label: opts?.label,
  });
  return result;
};

export const traceGetDocs = async <T>(
  scope: ScopeRecord | null,
  ref: { path?: string },
  getDocsFn: () => Promise<T>,
  opts?: { collectionHint?: string; label?: string },
): Promise<T> => {
  const result = await getDocsFn();
  const size = (result as any)?.size ?? (Array.isArray((result as any)?.docs) ? (result as any).docs.length : 0);
  const path = ref.path ?? opts?.collectionHint ?? "unknown";
  recordRead(scope, {
    collection: normalizeCollection(path, opts?.collectionHint),
    path,
    op: "getDocs",
    docCount: typeof size === "number" ? size : 0,
    label: opts?.label,
  });
  return result;
};

export const traceOnSnapshot = <T>(
  scope: ScopeRecord | null,
  ref: { path?: string },
  subscribe: (next: (snapshot: T) => void, error?: (err: unknown) => void) => () => void,
  onNext: (snapshot: T) => void,
  onError?: (err: unknown) => void,
  opts?: { collectionHint?: string; label?: string },
): (() => void) => {
  if (!isFirestoreReadTraceEnabled()) {
    return subscribe(onNext, onError);
  }

  const path = normalizePath(ref.path ?? opts?.collectionHint);
  const callsite = opts?.label ?? extractCallsite();
  const id = nextListenerId++;
  const record: ListenerRecord = {
    id,
    path,
    startedAt: performance.now(),
    callbacks: 0,
    docs: 0,
    callsite,
    label: opts?.label,
  };
  activeListeners.set(id, record);

  const wrappedNext = (snapshot: T) => {
    const docs = countSnapshotDocs(snapshot);
    record.callbacks += 1;
    record.docs += docs;
    listenerCallbackTotal += 1;
    listenerReadTotal += docs;
    const totals = listenerTotalsByPath.get(path) ?? { callbacks: 0, docs: 0 };
    totals.callbacks += 1;
    totals.docs += docs;
    listenerTotalsByPath.set(path, totals);
    recordRead(scope, {
      collection: normalizeCollection(path, opts?.collectionHint),
      path,
      op: "onSnapshot",
      docCount: docs,
      label: opts?.label,
      callsite,
    });
    onNext(snapshot);
  };

  const unsubscribe = subscribe(wrappedNext, onError);

  return () => {
    const existing = activeListeners.get(id);
    if (existing) {
      existing.endedAt = performance.now();
      activeListeners.delete(id);
    }
    unsubscribe();
  };
};

export const resetReadTraceTotals = () => {
  if (!isFirestoreReadTraceEnabled()) return;
  globalTotals.clear();
  readTotalsByPath.clear();
  readTotalsByOp.clear();
  readTotalsByCallsite.clear();
  listenerTotalsByPath.clear();
  listenerCallbackTotal = 0;
  listenerReadTotal = 0;
  activeListeners.forEach((listener) => {
    listener.callbacks = 0;
    listener.docs = 0;
  });
};

export const startReadTraceSession = (name?: string) => {
  if (!isFirestoreReadTraceEnabled()) return;
  resetReadTraceTotals();
  activeSession = { name, startedAt: performance.now() };
};

export const reportReadSummary = (name?: string, opts?: { topN?: number }) => {
  if (!isFirestoreReadTraceEnabled()) return;
  const topN = opts?.topN ?? 10;
  const sessionName = name || activeSession?.name;
  const sessionSuffix = sessionName ? ` (${sessionName})` : "";

  const totals = {
    getDoc: readTotalsByOp.get("getDoc") ?? 0,
    getDocs: readTotalsByOp.get("getDocs") ?? 0,
  };
  const totalReads = totals.getDoc + totals.getDocs;

  const topPaths = Array.from(readTotalsByPath.entries())
    .map(([path, info]) => ({ path, total: info.total, ops: info.ops }))
    .sort((a, b) => b.total - a.total)
    .slice(0, topN);

  const topCallsites = Array.from(readTotalsByCallsite.entries())
    .map(([callsite, count]) => ({ callsite, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);

  const activeList = Array.from(activeListeners.values())
    .map((listener) => ({
      path: listener.path,
      callbacks: listener.callbacks,
      docs: listener.docs,
      callsite: listener.callsite,
    }))
    .sort((a, b) => b.callbacks - a.callbacks);

  const topListenerPaths = Array.from(listenerTotalsByPath.entries())
    .map(([path, info]) => ({ path, callbacks: info.callbacks, docs: info.docs }))
    .sort((a, b) => b.callbacks - a.callbacks)
    .slice(0, topN);

  // eslint-disable-next-line no-console
  console.groupCollapsed(`[FirestoreTrace] READ SUMMARY${sessionSuffix}`);
  log("Totals", { ...totals, total: totalReads });
  log("Top paths", topPaths);
  if (topCallsites.length > 0) {
    log("Top callsites", topCallsites);
  }
  // eslint-disable-next-line no-console
  console.groupEnd();

  // eslint-disable-next-line no-console
  console.groupCollapsed(`[FirestoreTrace] LISTENER SUMMARY${sessionSuffix}`);
  log("Listener callbacks", {
    total: listenerCallbackTotal,
    estimatedReads: listenerReadTotal,
  });
  log("Listeners active", activeList.length ? activeList : "None");
  if (topListenerPaths.length > 0) {
    log("Top listener paths", topListenerPaths);
  }
  // eslint-disable-next-line no-console
  console.groupEnd();
};

if (isDev && typeof window !== "undefined") {
  (window as any).__SFH_FIRESTORE_TRACE__ = {
    enable: () => {
      window.localStorage.setItem(STORAGE_KEY, "1");
      window.localStorage.setItem(STORAGE_KEY_ALIAS, "1");
    },
    disable: () => {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(STORAGE_KEY_ALIAS);
    },
    resetTotals: () => resetReadTraceTotals(),
    getTotals: () => Object.fromEntries(globalTotals.entries()),
    isEnabled: isFirestoreReadTraceEnabled,
    reportSummary: reportReadSummary,
    startSession: startReadTraceSession,
  };
}

export type FirestoreTraceScope = ScopeRecord | null;
