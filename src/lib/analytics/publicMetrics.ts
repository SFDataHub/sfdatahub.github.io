import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { cachedPublicRead, readPublicCache, writePublicCache, withPublicReadLock, publicationCheck, validPublicCheck, type PublicCheck } from "../cache/publicReadCache";

export type PublicMetric = { today: number; total: number; dailyAverage: number };
export type PublicManifest = {
  schemaVersion: 2 | 3 | 4; bundles?: Array<{ prefix: string; hash: string }>; generation: string; sequence?: number; basis?: string; dayCount: number; complete: true; state: "ready" | "not_configured" | "not_started" | "unverified";
  startDate: string | null; collectionStartDate: string | null; effectiveStartDate: string | null;
  fragments?: Array<{ id: string; hash: string }>;
  asOf: string; today: string; website: PublicMetric | null;
};
export type PublicMetrics = { manifest: PublicManifest; page: PublicMetric | null };
const collection = "visitor_metrics_public";
const cacheScope = `goatcounter:${db.app?.options.projectId ?? "unconfigured"}:schema4-v1`;
let manifestExpiresAt = 0;
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid snapshot");
  return value as Record<string, unknown>;
};
function metric(value: unknown): PublicMetric {
  const data = record(value);
  if (![data.today, data.total, data.dailyAverage].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0)) throw new Error("Invalid metric");
  return { today: data.today, total: data.total, dailyAverage: data.dailyAverage } as PublicMetric;
}
let sharedManifest: Promise<PublicManifest> | undefined;
let pendingManifest: Promise<PublicManifest> | undefined;
let latestManifest: PublicManifest | undefined;
const listeners = new Set<() => void>();
const HOUR = 3600000;
const PUBLICATION_DELAY = 120000;
let timer: ReturnType<typeof setTimeout> | undefined;
let attemptHour = -1;
let attempts = 0;
let retryAt = 0;
type PageResult = { value: PublicMetric | null; sequence?: number; basis?: string; stale?: boolean };
class PublicationChanged extends Error {}
const bundles = new Map<string, Promise<Record<string, unknown>>>();
const fragments = new Map<string, Promise<Record<string, unknown>>>();
async function verifiedFragment(id: string, hash: string, basis: string) {
  if (!fragments.has(hash)) {
    const request = (async () => {
      return verifiedDocument(id, hash, basis, true);
    })();
    fragments.set(hash, request);
    void request.catch(() => { if (fragments.get(hash) === request) fragments.delete(hash); });
  }
  return fragments.get(hash)!;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => JSON.stringify(key) + ":" + canonical(v)).join(",") + "}";
  return JSON.stringify(value);
}
async function sha256(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, "0")).join("");
}
const pages = new Map<string, Promise<PageResult>>();
const identity = (manifest: PublicManifest) => manifest.schemaVersion >= 3 ? manifest.generation + ":" + manifest.sequence : manifest.generation;

// One clock for all public readers. Sleeping tabs discard overdue hours and
// consider only the current hour on return; focus alone never triggers a read.
function scheduleRefresh() {
  clearTimeout(timer);
  timer = undefined;
  if (!listeners.size || document.visibilityState === "hidden" || pendingManifest) return;
  const now = Date.now();
  const hour = Math.floor(now / HOUR);
  let due = hour * HOUR + PUBLICATION_DELAY;
  if (Math.floor(Date.parse(latestManifest?.asOf ?? "") / HOUR) >= hour || (attemptHour === hour && attempts >= 2)) {
    due += HOUR;
  } else if (attemptHour === hour && attempts === 1) {
    due = retryAt;
  }
  timer = setTimeout(() => {
    timer = undefined;
    if (document.visibilityState === "hidden" || !listeners.size) return;
    // Reconsider after background suspension or a clock change before fetching.
    const currentHour = Math.floor(Date.now() / HOUR);
    if (currentHour !== hour || Date.now() < due) { scheduleRefresh(); return; }
    void readManifest(true).catch(() => {});
  }, Math.max(0, due - now));
}

function parseManifest(value: unknown): PublicManifest {
  const data = record(value);
  if ((data.schemaVersion !== 2 && data.schemaVersion !== 3 && data.schemaVersion !== 4) || data.complete !== true || typeof data.generation !== "string" || !["ready", "not_configured", "not_started", "unverified"].includes(String(data.state)) || !Number.isFinite(Date.parse(String(data.asOf))) || !/^\d{4}-\d{2}-\d{2}$/.test(String(data.today))) throw new Error("Incompatible snapshot");
  if (Number(data.schemaVersion) >= 3 && (!Number.isSafeInteger(data.sequence) || Number(data.sequence) < 1 || typeof data.basis !== "string" || data.generation !== (data.schemaVersion === 4 ? "bundled" : "live"))) throw new Error("Invalid live snapshot");
  if (data.schemaVersion === 4) {
    if (!Array.isArray(data.bundles) || !data.bundles.length) throw new Error("Missing bundle directory");
    const prefixes = new Set<string>();
    for (const raw of data.bundles) {
      const item = record(raw);
      if (typeof item.prefix !== "string" || !/^[01]{0,256}$/.test(item.prefix) || typeof item.hash !== "string" || !/^[a-f0-9]{64}$/.test(item.hash) || prefixes.has(item.prefix)) throw new Error("Invalid bundle directory");
      prefixes.add(item.prefix);
    }
    for (const prefix of prefixes) for (let i = 0; i < prefix.length; i++) if (prefixes.has(prefix.slice(0, i))) throw new Error("Overlapping bundles");
  }
  const dayCount = data.schemaVersion === 2 && data.state === "ready" ? (record(data.website).days as unknown[])?.length ?? data.dayCount : data.dayCount ?? 0;
  if (!Number.isInteger(dayCount) || Number(dayCount) < (data.state === "ready" ? 1 : 0) || Number(dayCount) > 30) throw new Error("Invalid day count");
  return { ...data, dayCount, website: data.state === "ready" ? metric(data.website) : null } as PublicManifest;
}
type ManifestState = { data: PublicManifest | null; check: PublicCheck; reconciledFor?: string };
const validManifestState = (value: unknown) => {
  const state = value as ManifestState;
  if (!state || !validPublicCheck(state.check)) return false;
  try { if (state.data !== null) parseManifest(state.data); return state.data === null || !!state.data; } catch { return false; }
};
async function verifiedDocument(id: string, hash: string, basis: string, fragment = false): Promise<Record<string, unknown>> {
  const key = `${cacheScope}:${fragment ? "fragment" : "bundle"}:${hash}`;
  const blocked = await readPublicCache(key + ":unavailable", value => (value as { unavailable?: boolean })?.unavailable === true);
  if (blocked) throw new PublicationChanged();
  const valid = async (value: unknown) => {
    const data = record(value);
    return data.schemaVersion === 4 && data.basis === basis && (!fragment || typeof data.data === "string") && await sha256(canonical(data)) === hash;
  };
  return cachedPublicRead(key, valid, async () => {
    const snapshot = await getDoc(doc(db, collection, "bundled", "pages", id));
    if (!snapshot.exists() || !await valid(snapshot.data())) {
      await writePublicCache(key + ":unavailable", { unavailable: true }, Math.max(Date.now() + 1, manifestExpiresAt));
      throw new PublicationChanged();
    }
    return record(snapshot.data());
  });
}

function readManifest(refresh = false, reconcile = false): Promise<PublicManifest> {
  if (pendingManifest) return pendingManifest;
  if (!refresh && sharedManifest && Date.now() < manifestExpiresAt) return sharedManifest;
  const request = withPublicReadLock(cacheScope + ":manifest", async () => {
    const cached = await readPublicCache<ManifestState>(cacheScope + ":manifest", validManifestState, true);
    const previous = cached?.value;
    if (previous) {
      attemptHour = previous.check.hour; attempts = previous.check.attempts; retryAt = previous.check.retryAt;
    }
    const originalIdentity = latestManifest ? identity(latestManifest) : previous?.data ? identity(previous.data) : undefined;
    if (cached && Date.now() < cached.expiresAt && (!reconcile || previous?.reconciledFor === originalIdentity)) {
      manifestExpiresAt = cached.expiresAt;
      if (!previous?.data) throw new Error("Snapshot unavailable");
      return previous.data;
    }
    let data = previous?.data ?? latestManifest ?? null;
    let failure: unknown;
    try {
      let snapshot = await getDoc(doc(db, collection, "bundled"));
      if (!snapshot.exists()) snapshot = await getDoc(doc(db, collection, "live"));
      if (!snapshot.exists()) snapshot = await getDoc(doc(db, collection, "current"));
      if (!snapshot.exists()) throw new Error("Snapshot unavailable");
      data = parseManifest(snapshot.data());
    } catch (error) { failure = error; }
    const next = publicationCheck(data?.asOf, previous?.check);
    const check = reconcile && previous ? previous.check : next.check;
    manifestExpiresAt = reconcile && cached ? Math.max(Date.now() + 1, cached.expiresAt) : next.expiresAt;
    attemptHour = check.hour; attempts = check.attempts; retryAt = check.retryAt;
    await writePublicCache(cacheScope + ":manifest", { data, check, ...(reconcile ? { reconciledFor: originalIdentity } : {}) } satisfies ManifestState, manifestExpiresAt);
    if (failure) throw failure;
    return data!;
  });
  pendingManifest = sharedManifest = request;
  void request.then(manifest => {
    const changed = !latestManifest || identity(latestManifest) !== identity(manifest);
    latestManifest = manifest;
    // Keep at most the current publication's page results. Existing callers can
    // finish their promises without retaining a history in memory.
    if (changed) {
      const fragmentHashes = new Set(manifest.fragments?.map(fragment => fragment.hash) ?? []);
      for (const key of fragments.keys()) if (!fragmentHashes.has(key)) fragments.delete(key);
      const hashes = new Set(manifest.bundles?.map(bundle => bundle.hash) ?? []);
      for (const key of bundles.keys()) if (!hashes.has(key)) bundles.delete(key);
      for (const key of pages.keys()) if (!key.startsWith(identity(manifest) + ":")) pages.delete(key);
    }
    // Scheduled attempts also retry a previously failed page. Reconciliation of
    // the same publication stays silent, avoiding missing-page feedback loops.
    if (changed || (refresh && !reconcile)) for (const listener of listeners) listener();
  }, () => {
    if (sharedManifest === request) sharedManifest = undefined;
  }).finally(() => { pendingManifest = undefined; scheduleRefresh(); });
  return request;
}

export function loadPublicManifest(): Promise<PublicManifest> {
  return readManifest();
}
async function pageMetric(manifest: PublicManifest, path: string): Promise<PageResult> {
  const key = identity(manifest) + ":" + path;
  if (!pages.has(key)) {
    const request = (async () => {
      const id = await sha256(path);
      if (manifest.schemaVersion === 4) {
        const bits = [...id].map(char => parseInt(char, 16).toString(2).padStart(4, "0")).join("");
        const descriptor = manifest.bundles!.find(bundle => bits.startsWith(bundle.prefix));
        if (!descriptor) throw new Error("Unresolved page bundle");
        if (!bundles.has(descriptor.hash)) {
          const request = (async () => {
            const data = await verifiedDocument("b_" + (descriptor.prefix || "root"), descriptor.hash, manifest.basis!);
            return record(data.entries);
          })();
          bundles.set(descriptor.hash, request);
          void request.catch(() => { if (bundles.get(descriptor.hash) === request) bundles.delete(descriptor.hash); });
        }
        try {
          const entries = await bundles.get(descriptor.hash)!;
          let row = entries[id];
          if (row !== undefined && Array.isArray(record(row).parts)) {
            const parts = record(row).parts as unknown[];
            if (!parts.length) throw new Error("Empty fragment list");
            const values = await Promise.all(parts.map((raw, index) => {
              const part = record(raw);
              if (part.id !== `f_${id}_${index}` || typeof part.hash !== "string" || !/^[a-f0-9]{64}$/.test(part.hash)) throw new Error("Invalid metric fragment address");
              return verifiedFragment(String(part.id), part.hash, manifest.basis!);
            }));
            row = JSON.parse(values.map(value => value.data).join(""));
          }
          if (row !== undefined && record(row).path !== path) throw new Error("Mismatched page path");
          return { value: row === undefined ? zero : metric(row), basis: manifest.basis, sequence: manifest.sequence };
        } catch (error) {
          if (error instanceof PublicationChanged) return { value: null, stale: true };
          throw error;
        }
      }
      const legacyKey = `${cacheScope}:legacy:${identity(manifest)}:${manifest.basis ?? ""}:${id}`;
      const guard = (value: unknown) => {
        const data = record(value);
        metric(data);
        return data.schemaVersion === manifest.schemaVersion && data.path === path &&
          (manifest.schemaVersion !== 2 || data.generation === manifest.generation) &&
          (manifest.schemaVersion !== 3 || (Number.isSafeInteger(data.sequence) && Number(data.sequence) >= 1 && typeof data.basis === "string"));
      };
      let data = (await readPublicCache<Record<string, any>>(legacyKey, guard))?.value;
      if (!data) {
        const snapshot = await getDoc(doc(db, collection, manifest.generation, "pages", id));
        if (!snapshot.exists()) return { value: null };
        data = record(snapshot.data());
        if (!guard(data)) throw new Error("Mismatched page snapshot");
        await writePublicCache(legacyKey, data, manifestExpiresAt);
      }
      return { value: metric(data), sequence: data.sequence, basis: data.basis };
    })();
    pages.set(key, request);
    void request.catch(() => { if (pages.get(key) === request) pages.delete(key); });
  }
  return pages.get(key)!;
}
const zero: PublicMetric = { today: 0, total: 0, dailyAverage: 0 };
const matches = (manifest: PublicManifest, page: PageResult) => page.value !== null && page.basis === manifest.basis && page.sequence! <= manifest.sequence!;
export async function loadPublicMetrics(path: string): Promise<PublicMetrics> {
  const manifest = await loadPublicManifest();
  if (manifest.state !== "ready") return { manifest, page: null };
  const page = await pageMetric(manifest, path);
  if (manifest.schemaVersion === 2) return { manifest, page: page.value ?? zero };
  if (matches(manifest, page)) return { manifest, page: page.value };
  // A mutable page may have advanced (or disappeared) after the manifest read.
  // Reconcile once, shared by all readers; never poll or show a mixed basis.
  const latest = await readManifest(true, true);
  if (identity(latest) === identity(manifest)) {
    if (page.value === null && !page.stale) {
      pages.set(identity(manifest) + ":" + path, Promise.resolve({ value: zero, basis: manifest.basis, sequence: manifest.sequence }));
      return { manifest, page: zero };
    }
    throw new Error("Publication changed during read");
  }
  if (latest.state !== "ready") return { manifest: latest, page: null };
  const next = await pageMetric(latest, path);
  if (!matches(latest, next)) throw new Error("Publication changed during retry");
  return { manifest: latest, page: next.value };
}
export function usePublicMetrics(path: string) {
  const [state, setState] = useState<{ path: string; data?: PublicMetrics; error?: boolean }>({ path });
  useEffect(() => {
    let active = true;
    let version = 0;
    const update = () => {
      const request = ++version;
      void loadPublicMetrics(path)
        .then(data => { if (active && version === request) setState({ path, data }); }, () => {
          if (active && version === request) setState(previous => previous.path === path && previous.data ? previous : { path, error: true });
        });
    };
    listeners.add(update);
    if (listeners.size === 1) document.addEventListener("visibilitychange", scheduleRefresh);
    update();
    scheduleRefresh();
    return () => {
      active = false;
      listeners.delete(update);
      if (!listeners.size) {
        clearTimeout(timer);
        timer = undefined;
        document.removeEventListener("visibilitychange", scheduleRefresh);
      }
    };
  }, [path]);
  return state.path === path ? state : { path };
}
