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
const isDev = typeof import.meta !== "undefined" && !!import.meta.env?.DEV;
const globalTotals = new Map<string, number>();
let nextScopeId = 1;

const log = (...args: any[]) => {
  // eslint-disable-next-line no-console
  console.log(...args);
};

export const isFirestoreReadTraceEnabled = () => {
  if (!isDev) return false;
  if (typeof window === "undefined" || !window?.localStorage) return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
};

const shouldLogCallsite = () => {
  if (!isFirestoreReadTraceEnabled()) return false;
  if (typeof window === "undefined" || !window?.localStorage) return false;
  return window.localStorage.getItem(CALLSITE_KEY) === "1";
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
      !line.toLowerCase().includes("tracegetdocs"),
  );
  return filtered[1] || filtered[0];
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
  params: { collection?: string; path: string; op: string; docCount: number },
) => {
  if (!scope) return;
  const collection = normalizeCollection(params.collection || params.path);
  scope.reads.push({
    collection,
    path: params.path,
    op: params.op,
    docCount: params.docCount,
    startedAt: performance.now(),
    callsite: extractCallsite(),
  });
  globalTotals.set(collection, (globalTotals.get(collection) ?? 0) + params.docCount);
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
): Promise<T> => {
  const result = await getDocFn();
  const count = (result as any)?.exists ? ((result as any).exists() ? 1 : 0) : 1;
  recordRead(scope, {
    collection: normalizeCollection(ref.path),
    path: ref.path,
    op: "getDoc",
    docCount: count,
  });
  return result;
};

export const traceGetDocs = async <T>(
  scope: ScopeRecord | null,
  ref: { path?: string },
  getDocsFn: () => Promise<T>,
  opts?: { collectionHint?: string },
): Promise<T> => {
  const result = await getDocsFn();
  const size = (result as any)?.size ?? (Array.isArray((result as any)?.docs) ? (result as any).docs.length : 0);
  const path = ref.path ?? opts?.collectionHint ?? "unknown";
  recordRead(scope, {
    collection: normalizeCollection(path, opts?.collectionHint),
    path,
    op: "getDocs",
    docCount: typeof size === "number" ? size : 0,
  });
  return result;
};

if (isDev && typeof window !== "undefined") {
  (window as any).__SFH_FIRESTORE_TRACE__ = {
    enable: () => window.localStorage.setItem(STORAGE_KEY, "1"),
    disable: () => window.localStorage.removeItem(STORAGE_KEY),
    resetTotals: () => globalTotals.clear(),
    getTotals: () => Object.fromEntries(globalTotals.entries()),
    isEnabled: isFirestoreReadTraceEnabled,
  };
}

export type FirestoreTraceScope = ScopeRecord | null;
