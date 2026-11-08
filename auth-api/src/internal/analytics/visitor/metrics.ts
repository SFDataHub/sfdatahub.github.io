import { createHash, randomUUID } from "crypto";
import { db } from "../../../firebase";

export const METRIC_VERSION = 2;
export const WEBSITE_VISIT_PATH = "sfdatahub/website-visit-v2";
export const PAGE_VIEW_PREFIX = "sfdatahub/page-view-v2:";
export const PUBLIC_COLLECTION = "visitor_metrics_public";
export const configRef = () => db.collection("analytics").doc("visitor_config");
export const publicRef = () => db.collection(PUBLIC_COLLECTION).doc("current");
const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });
export function berlinDay(date: Date): string {
  const parts = formatter.formatToParts(date);
  return ["year", "month", "day"].map(key => parts.find(part => part.type === key)!.value).join("-");
}
export function shiftDay(day: string, amount: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + amount)).toISOString().slice(0, 10);
}
export function validDay(day: unknown): day is string {
  try { return typeof day === "string" && /^20\d\d-\d\d-\d\d$/.test(day) && shiftDay(day, 0) === day; } catch { return false; }
}
export function berlinMidnight(day: string): string {
  // At Berlin midnight UTC is still the previous calendar date. Resolve the
  // offset at that instant; calendar arithmetic also handles 23/25 hour days.
  const utc = Date.parse(day + "T00:00:00Z");
  const offset = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", timeZoneName: "shortOffset" }).formatToParts(utc - 2 * 3600000).find(part => part.type === "timeZoneName")?.value;
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(offset ?? "");
  if (!match) throw new Error("Unable to resolve Berlin timezone offset");
  const offsetMs = (Number(match[2]) * 60 + Number(match[3] ?? 0)) * 60000 * (match[1] === "+" ? 1 : -1);
  return new Date(utc - offsetMs).toISOString();
}
export type Hit = { path: string; path_id: number; event: boolean; count: number };
export type FetchRange = (start: string, end: string) => Promise<Hit[]>;
export type Metric = { today: number; total: number; dailyAverage: number; days: Array<{ day: string; count: number }> };
export type MetricsConfig = { startDate: string | null; collectionStartDate: string | null; sessionsVerified: boolean; revision: string };
export function parseConfig(data: FirebaseFirestore.DocumentData | undefined): MetricsConfig {
  return {
    startDate: validDay(data?.startDate) ? data!.startDate : null,
    // Keep the existing field as a compatibility alias. Old confirmation dates
    // must not block v2 data within the explicitly selected period.
    collectionStartDate: data?.sessionsVerified === true && validDay(data?.startDate) ? data!.startDate : null,
    sessionsVerified: data?.sessionsVerified === true,
    revision: typeof data?.revision === "string" ? data.revision : "",
  };
}
export function pathId(path: string): string { return createHash("sha256").update(path).digest("hex"); }
export function normalPage(path: string): string | null {
  // The client already sends canonical tracking paths. Do not group profiles,
  // introduce guide tabs, or turn custom events into public page paths.
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  const url = new URL(path, "https://sfdatahub.invalid");
  if (url.pathname === "/toplists") return url.searchParams.get("tab") === "guilds" ? "/toplists/guilds" : "/toplists/players";
  return url.pathname || "/";
}
function counts(hits: Hit[]): { visitors: number; pages: Map<string, number> } {
  let visitors = 0;
  const pages = new Map<string, number>();
  for (const hit of hits) {
    if (hit.event && hit.path === WEBSITE_VISIT_PATH) { visitors += hit.count; continue; }
    if (!hit.event || !hit.path.startsWith(PAGE_VIEW_PREFIX)) continue;
    const path = normalPage(hit.path.slice(PAGE_VIEW_PREFIX.length));
    if (path) pages.set(path, (pages.get(path) ?? 0) + hit.count);
  }
  return { visitors, pages };
}

export async function buildMetrics(config: MetricsConfig, now: Date, fetchRange: FetchRange) {
  const today = berlinDay(now);
  const effectiveStartDate = config.startDate;
  const base = {
    schemaVersion: METRIC_VERSION, timezone: "Europe/Berlin", startDate: config.startDate,
    collectionStartDate: config.sessionsVerified ? config.startDate : null, effectiveStartDate,
    configRevision: config.revision, asOf: now.toISOString(), today,
  };
  const state = !config.startDate ? "not_configured" : !config.sessionsVerified ? "unverified" : effectiveStartDate! > today ? "not_started" : "ready";
  if (state !== "ready") return { manifest: { ...base, state, website: null }, pages: new Map<string, Metric>() };
  const start = effectiveStartDate!;
  const averageStart = [start, shiftDay(today, -29)].sort()[1];
  const days: string[] = [];
  for (let day = averageStart; day <= today; day = shiftDay(day, 1)) days.push(day);
  // Each range is requested in actual Berlin UTC boundaries. GoatCounter's
  // response chart timezone is deliberately not used to assign calendar days.
  const daily: Array<ReturnType<typeof counts>> = [];
  for (const day of days) {
    const end = day === today ? now.toISOString() : new Date(Date.parse(berlinMidnight(shiftDay(day, 1))) - 1).toISOString();
    daily.push(counts(await fetchRange(berlinMidnight(day), end)));
  }
  // The same first 1..30 days supply total and average. Older periods require
  // one extra fully paginated range; no legacy stats/total values are imported.
  const total = start === averageStart ? {
    visitors: daily.reduce((sum, day) => sum + day.visitors, 0),
    pages: new Map<string, number>(),
  } : counts(await fetchRange(berlinMidnight(start), now.toISOString()));
  if (start === averageStart) for (const day of daily) for (const [path, count] of day.pages) total.pages.set(path, (total.pages.get(path) ?? 0) + count);
  const metric = (sum: number, values: number[]): Metric => ({ today: values[values.length - 1], total: sum, dailyAverage: values.reduce((a, b) => a + b, 0) / days.length, days: days.map((day, i) => ({ day, count: values[i] })) });
  const pages = new Map<string, Metric>();
  for (const [path, count] of total.pages) pages.set(path, metric(count, daily.map(day => day.pages.get(path) ?? 0)));
  return { manifest: { ...base, state, website: metric(total.visitors, daily.map(day => day.visitors)) }, pages };
}

/** Only the authenticated hourly job publishes; readers never contact GoatCounter.
 * Immutable generations let a cached manifest and later navigation share one basis.
 */
export async function publishMetrics(fetchRange: FetchRange, now = new Date()) {
  const leaseRef = db.collection("analytics").doc("visitor_sync_lease");
  const leaseId = randomUUID();
  const acquired = await db.runTransaction(async tx => {
    const [lease, configDoc, current] = await Promise.all([tx.get(leaseRef), tx.get(configRef()), tx.get(publicRef())]);
    const config = parseConfig(configDoc.data());
    const previous = current.data();
    if ((lease.data()?.until ?? 0) > now.getTime()) return false;
    // A recent snapshot made with the old confirmation-date clamp is stale,
    // even when the stored configuration revision has not changed.
    // Absolute hour buckets tolerate scheduler jitter and delayed starts. Berlin's
    // repeated autumn hour has two distinct UTC buckets; elapsed minutes do not
    // identify which scheduled hour the snapshot actually covers.
    if (previous?.complete === true && previous?.schemaVersion === METRIC_VERSION && previous?.configRevision === config.revision && previous?.effectiveStartDate === config.startDate && Math.floor(Date.parse(previous.asOf) / 3600000) === Math.floor(now.getTime() / 3600000)) return false;
    tx.set(leaseRef, { id: leaseId, until: now.getTime() + 240000 });
    return true;
  });
  if (!acquired) return { skipped: true };
  try {
    const config = parseConfig((await configRef().get()).data());
    const { manifest, pages } = await buildMetrics(config, now, fetchRange);
    const generation = `${now.getTime()}-${leaseId}`;
    const generationRef = db.collection(PUBLIC_COLLECTION).doc(generation);
    // Smaller than Firestore's document/batch limits even with 30 daily values.
    // Fail rather than publish a partial index when operational bounds are hit.
    if (pages.size > 20000) throw new Error("Visitor snapshot exceeds 20000 paths; previous snapshot retained");
    await generationRef.set({ createdAt: now.getTime(), expiresAt: now.getTime() + 48 * 3600000 });
    const entries = [...pages];
    for (let offset = 0; offset < entries.length; offset += 400) {
      const batch = db.batch();
      for (const [path, metric] of entries.slice(offset, offset + 400)) {
        batch.set(generationRef.collection("pages").doc(pathId(path)), { schemaVersion: METRIC_VERSION, generation, path, ...metric });
      }
      await batch.commit();
    }
    const snapshot = { ...manifest, generation, pathCount: pages.size, complete: true };
    await db.runTransaction(async tx => {
      const [latest, lease] = await Promise.all([tx.get(configRef()), tx.get(leaseRef)]);
      if (parseConfig(latest.data()).revision !== config.revision || lease.data()?.id !== leaseId || lease.data()?.until < Date.now()) throw new Error("Visitor configuration or sync lease changed; unpublished generation discarded");
      tx.set(publicRef(), snapshot);
    });
    // Bounded housekeeping. Cached frontend manifests expire after two hours;
    // generations remain readable for 48 hours, including failed publications.
    const expired = await db.collection(PUBLIC_COLLECTION).where("expiresAt", "<", now.getTime()).limit(2).get();
    for (const old of expired.docs) await db.recursiveDelete(old.ref);
    return { skipped: false, generation, state: manifest.state, pathCount: pages.size };
  } finally {
    await db.runTransaction(async tx => { const lease = await tx.get(leaseRef); if (lease.data()?.id === leaseId) tx.delete(leaseRef); });
  }
}
