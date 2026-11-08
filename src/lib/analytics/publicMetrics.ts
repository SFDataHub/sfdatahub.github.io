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
const pages = new Map<string, Promise<PublicMetric | null>>();
export function loadPublicManifest(): Promise<PublicManifest> {
  return sharedManifest ??= (async () => {
    const snapshot = await getDoc(doc(db, collection, "current"));
    if (!snapshot.exists()) throw new Error("Snapshot unavailable");
    const data = record(snapshot.data());
    if (data.schemaVersion !== 2 || data.complete !== true || typeof data.generation !== "string" || !["ready", "not_configured", "not_started", "unverified"].includes(String(data.state)) || !Number.isFinite(Date.parse(String(data.asOf))) || !/^\d{4}-\d{2}-\d{2}$/.test(String(data.today))) throw new Error("Incompatible snapshot");
    if (data.state === "ready") metric(data.website);
    return data as PublicManifest;
  })();
}
async function pageMetric(manifest: PublicManifest, path: string): Promise<PublicMetric | null> {
  if (manifest.state !== "ready") return null;
  const key = manifest.generation + ":" + path;
  if (!pages.has(key)) pages.set(key, (async () => {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(path));
    const id = [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, "0")).join("");
    const snapshot = await getDoc(doc(db, collection, manifest.generation, "pages", id));
    // A successful missing-document read from a COMPLETE immutable generation
    // means zero. Permission/network/format errors must never become zeroes.
    if (!snapshot.exists()) return { today: 0, total: 0, dailyAverage: 0, days: manifest.website!.days.map(({ day }) => ({ day, count: 0 })) };
    const data = snapshot.data();
    if (data.schemaVersion !== 2 || data.generation !== manifest.generation || data.path !== path) throw new Error("Mismatched page snapshot");
    return metric(data);
  })());
  return pages.get(key)!;
}
export function usePublicMetrics(path: string) {
  const [state, setState] = useState<{ path: string; data?: PublicMetrics; error?: boolean }>({ path });
  useEffect(() => {
    let active = true;
    void loadPublicManifest().then(async manifest => ({ manifest, page: await pageMetric(manifest, path) }))
      .then(data => { if (active) setState({ path, data }); }, () => { if (active) setState({ path, error: true }); });
    return () => { active = false; };
  }, [path]);
  return state.path === path ? state : { path };
}
