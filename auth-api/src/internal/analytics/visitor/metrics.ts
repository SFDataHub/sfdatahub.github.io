import { createHash, randomUUID } from "crypto";
import { db } from "../../../firebase";
import { fragmentEntries } from "../../../storage/fragments";
import { assertAtomicSize, bundleId, digest, packBundles } from "../../../storage/bundles";

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

// Older current/live pointers stay frozen for already-open clients during rollout.
export const liveRef = () => db.collection(PUBLIC_COLLECTION).doc("bundled");
const compact = ({ today, total, dailyAverage }: Metric) => ({ today, total, dailyAverage });

/** Stable size-bounded bundles; manifest hashes replace private page indexes. */
export async function publishMetrics(fetchRange: FetchRange, now = new Date()) {
  const leaseRef = db.collection("analytics").doc("visitor_sync_lease");
  const leaseId = randomUUID();
  const acquired = await db.runTransaction(async tx => {
    const [lease, configDoc, current] = await Promise.all([tx.get(leaseRef), tx.get(configRef()), tx.get(liveRef())]);
    const config = parseConfig(configDoc.data());
    const previous = current.data();
    if ((lease.data()?.until ?? 0) > now.getTime()) return null;
    if (previous?.complete === true && previous?.schemaVersion === 4 && previous?.configRevision === config.revision && previous?.effectiveStartDate === config.startDate && Math.floor(Date.parse(previous.asOf) / 3600000) === Math.floor(now.getTime() / 3600000)) return null;
    tx.set(leaseRef, { id: leaseId, until: now.getTime() + 240000 });
    return { config, previous, sequence: (previous?.sequence ?? 0) + 1 };
  });
  if (!acquired) return { skipped: true };
  let committed = false;
  try {
    const { config, previous, sequence } = acquired;
    const { manifest, pages } = await buildMetrics(config, now, fetchRange);
    if (pages.size > 20000) throw new Error("Visitor snapshot exceeds 20000 paths; previous snapshot retained");
    const dayCount = manifest.website?.days.length ?? 0;
    const basis = JSON.stringify([manifest.state, manifest.effectiveStartDate, manifest.today, dayCount]);
    const entries: Record<string, unknown> = {};
    for (const [path, metric] of pages) entries[pathId(path)] = { path, ...compact(metric) };
    const oldBundles = (previous?.bundles ?? []) as Array<{ prefix: string; hash: string }>;
    const pageCollection = liveRef().collection("pages");
    const prepared = fragmentEntries(entries, basis, id => pageCollection.doc(id).path);
    const packed = packBundles(prepared.entries, oldBundles.length ? oldBundles.map(bundle => bundle.prefix) : undefined,
      id => pageCollection.doc(id).path, bundle => ({ schemaVersion: 4, basis, ...bundle }));
    const bundles = packed.leaves.map(prefix => ({ prefix, hash: digest(packed.documents.get(bundleId(prefix))) }));
    const fragments = [...prepared.fragments].map(([id, value]) => ({ id, hash: digest(value) }));
    const oldFragments = (previous?.fragments ?? []) as Array<{ id: string; hash: string }>;
    const snapshot = { ...manifest, schemaVersion: 4, generation: "bundled", sequence, basis, bundles, fragments,
      dayCount, website: manifest.website ? compact(manifest.website) : null, pathCount: pages.size, complete: true };
    const writes = bundles.filter(bundle => oldBundles.find(old => old.prefix === bundle.prefix)?.hash !== bundle.hash)
      .map(bundle => ({ ref: pageCollection.doc(bundleId(bundle.prefix)), value: packed.documents.get(bundleId(bundle.prefix))! }));
    for (const fragment of fragments) if (oldFragments.find(old => old.id === fragment.id)?.hash !== fragment.hash) {
      writes.push({ ref: pageCollection.doc(fragment.id), value: prepared.fragments.get(fragment.id)! });
    }
    assertAtomicSize([...writes.map(write => ({ path: write.ref.path, value: write.value })), { path: liveRef().path, value: snapshot }]);
    const operations = await db.runTransaction(async tx => {
      const [latest, lease] = await Promise.all([tx.get(configRef()), tx.get(leaseRef)]);
      if (JSON.stringify(parseConfig(latest.data())) !== JSON.stringify(config) || lease.data()?.id !== leaseId || lease.data()?.until < Date.now()) throw new Error("Visitor configuration or sync lease changed; previous snapshot retained");
      for (const { ref, value } of writes) tx.set(ref, value);
      tx.set(liveRef(), snapshot);
      tx.set(leaseRef, { id: "", until: 0 });
      return { pageWrites: writes.length, pageDeletes: 0, indexWrites: 0 };
    });
    committed = true;
    return { skipped: false, generation: "bundled", sequence, state: manifest.state, pathCount: pages.size, ...operations };
  } finally {
    if (!committed) await db.runTransaction(async tx => {
      const lease = await tx.get(leaseRef);
      if (lease.data()?.id === leaseId) tx.set(leaseRef, { id: "", until: 0 });
    });
  }
}
