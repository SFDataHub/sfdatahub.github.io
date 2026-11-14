import { db } from "../../../firebase";
import { liveRef } from "./metrics";

// Only private, role-guarded readers use this cache. GET never queries GoatCounter
// or publishes. Keep a last successful source when Firestore is unavailable.
type Source = "website" | "details";
const cache = new Map<Source, { data: FirebaseFirestore.DocumentData | null; readAt: number }>();
const TTL = 60_000;
export function invalidateVisitorReadCache() { for (const entry of cache.values()) entry.readAt = 0; }
export function clearVisitorReadCache() { cache.clear(); }
async function source(name: Source, now: Date) {
  const previous = cache.get(name);
  let data = previous?.data ?? null, error = false;
  if (!previous || now.getTime() - previous.readAt >= TTL) {
    try {
      const snapshot = await (name === "website" ? liveRef() : db.collection("analytics").doc("visitor_analytics")).get();
      data = snapshot.exists ? snapshot.data() ?? null : null;
      cache.set(name, { data, readAt: now.getTime() });
    } catch { error = true; }
  }
  const valid = name === "website" ? data?.complete === true && (data?.schemaVersion === 4 || data?.schemaVersion === 5)
    : (data?.schemaVersion === 1 || data?.schemaVersion === 2) && !!data?.totals;
  const asOf = valid ? (name === "website" ? data!.asOf : data!.updatedAtIso) ?? null : null;
  const ageSeconds = typeof asOf === "string" && Number.isFinite(Date.parse(asOf)) ? Math.max(0, Math.floor((now.getTime() - Date.parse(asOf)) / 1000)) : null;
  const refreshFailed = data?.lastRefresh?.state === "error";
  return { state: error || refreshFailed ? "error" : !valid ? "not_available" : name === "details" && data?.schemaVersion === 1 ? "legacy" : "available",
    asOf, ageSeconds, stale: ageSeconds === null || ageSeconds > 7200 || error || refreshFailed,
    error: error ? "snapshot_read_failed" : refreshFailed ? "refresh_failed" : null,
    data: valid ? data : null };
}
export async function readVisitorSnapshot(now = new Date()) {
  const [website, details] = await Promise.all([source("website", now), source("details", now)]);
  return { schemaVersion: 1, timezone: "Europe/Berlin", retrievedAt: now.toISOString(), website, details,
    availability: {
      website: website.data ? website.data.state : "not_available",
      legacyPages: details.data ? "available" : "not_available",
      eventUsage: details.data?.schemaVersion === 2 ? "available" : "not_recorded",
      collectionDisplays: details.data?.schemaVersion === 2 ? "per_window" : "not_recorded",
      toolClicks: details.data?.schemaVersion === 2 ? "per_window" : "not_recorded",
      screenSizes: details.data?.screenSizes ? "per_window" : "not_recorded",
      pageViewEvents: details.data?.schemaVersion === 2 ? "available" : "not_recorded",
    },
    limits: { topLists: 25, toolTargets: null, usageEvents: null },
  };
}
