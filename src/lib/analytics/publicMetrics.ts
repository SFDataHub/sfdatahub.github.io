import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

export type PublicMetric = { today: number; total: number; dailyAverage: number; days: Array<{ day: string; count: number }> };
export type PublicManifest = {
  schemaVersion: 2; generation: string; complete: true; state: "ready" | "not_configured" | "not_started" | "unverified";
  startDate: string | null; collectionStartDate: string | null; effectiveStartDate: string | null;
  asOf: string; today: string; website: PublicMetric | null;
};
export type PublicMetrics = { manifest: PublicManifest; page: PublicMetric | null };
const collection = "visitor_metrics_public";
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid snapshot");
  return value as Record<string, unknown>;
};
function metric(value: unknown): PublicMetric {
  const data = record(value);
  if (![data.today, data.total, data.dailyAverage].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0) || !Array.isArray(data.days) || data.days.length < 1 || data.days.length > 30) throw new Error("Invalid metric");
  for (const day of data.days) if (typeof day?.day !== "string" || !Number.isSafeInteger(day.count) || day.count < 0) throw new Error("Invalid daily metric");
  return data as PublicMetric;
}
let sharedManifest: Promise<PublicManifest> | undefined;
let pendingManifest: Promise<PublicManifest> | undefined;
let latestManifest: PublicManifest | undefined;
const listeners = new Set<() => void>();
const HOUR = 3600000;
const PUBLICATION_DELAY = 120000;
const RETRY_DELAY = 180000;
let timer: ReturnType<typeof setTimeout> | undefined;
let attemptHour = -1;
let attempts = 0;
let retryAt = 0;
const pages = new Map<string, Promise<PublicMetric | null>>();

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

function readManifest(refresh = false): Promise<PublicManifest> {
  if (pendingManifest) return pendingManifest;
  if (!refresh && sharedManifest) return sharedManifest;
  const now = Date.now();
  const hour = Math.floor(now / HOUR);
  // The initial read also counts if it already falls in the refresh window.
  if (now >= hour * HOUR + PUBLICATION_DELAY) {
    if (attemptHour !== hour) { attemptHour = hour; attempts = 0; }
    attempts++;
    retryAt = now + RETRY_DELAY;
  }
  const request = (async () => {
    const snapshot = await getDoc(doc(db, collection, "current"));
    if (!snapshot.exists()) throw new Error("Snapshot unavailable");
    const data = record(snapshot.data());
    if (data.schemaVersion !== 2 || data.complete !== true || typeof data.generation !== "string" || !["ready", "not_configured", "not_started", "unverified"].includes(String(data.state)) || !Number.isFinite(Date.parse(String(data.asOf))) || !/^\d{4}-\d{2}-\d{2}$/.test(String(data.today))) throw new Error("Incompatible snapshot");
    if (data.state === "ready") metric(data.website);
    return data as PublicManifest;
  })();
  pendingManifest = sharedManifest = request;
  void request.then(manifest => {
    latestManifest = manifest;
    for (const listener of listeners) listener();
  }, () => {
    if (sharedManifest === request) sharedManifest = undefined;
  }).finally(() => { pendingManifest = undefined; scheduleRefresh(); });
  return request;
}

export function loadPublicManifest(): Promise<PublicManifest> {
  return readManifest();
}
async function pageMetric(manifest: PublicManifest, path: string): Promise<PublicMetric | null> {
  if (manifest.state !== "ready") return null;
  const key = manifest.generation + ":" + path;
  if (!pages.has(key)) {
    const request = (async () => {
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(path));
      const id = [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, "0")).join("");
      const snapshot = await getDoc(doc(db, collection, manifest.generation, "pages", id));
      // A successful missing-document read from a COMPLETE immutable generation
      // means zero. Permission/network/format errors must never become zeroes.
      if (!snapshot.exists()) return { today: 0, total: 0, dailyAverage: 0, days: manifest.website!.days.map(({ day }) => ({ day, count: 0 })) };
      const data = snapshot.data();
      if (data.schemaVersion !== 2 || data.generation !== manifest.generation || data.path !== path) throw new Error("Mismatched page snapshot");
      return metric(data);
    })();
    pages.set(key, request);
    // Failed reads may recover at the next scheduled update. Successful immutable
    // generation/path pairs, including confirmed zeroes, remain reusable.
    void request.catch(() => { if (pages.get(key) === request) pages.delete(key); });
  }
  return pages.get(key)!;
}
export function usePublicMetrics(path: string) {
  const [state, setState] = useState<{ path: string; data?: PublicMetrics; error?: boolean }>({ path });
  useEffect(() => {
    let active = true;
    let version = 0;
    const update = () => {
      const request = ++version;
      void loadPublicManifest().then(async manifest => ({ manifest, page: await pageMetric(manifest, path) }))
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
