import { isVisitorContinuationPause } from "./continuationState";
import { createHash, randomUUID } from "crypto";
import { db } from "../../../firebase";
import { fragmentEntries } from "../../../storage/fragments";
import { assertAtomicSize, bundleId, digest, documentBytes, SAFE_DOCUMENT_BYTES, packBundles } from "../../../storage/bundles";

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
export type Hit = { path: string; path_id: number; event: boolean; count: number; title?: string };
export type FetchRange = ((start: string, end: string) => Promise<Hit[]>) & { assertBudget?: () => void } & import("./continuationState").VisitorPublicationHooks;
export type Metric = { today: number; total: number; dailyAverage: number; days: Array<{ day: string; count: number }> };
export type MetricsConfig = { startDate: string | null; collectionStartDate: string | null; sessionsVerified: boolean; revision: string; legacyPublicClients?: boolean };
export function parseConfig(data: FirebaseFirestore.DocumentData | undefined): MetricsConfig {
  return {
    startDate: validDay(data?.startDate) ? data!.startDate : null,
    // Keep the existing field as a compatibility alias. Old confirmation dates
    // must not block v2 data within the explicitly selected period.
    collectionStartDate: data?.sessionsVerified === true && validDay(data?.startDate) ? data!.startDate : null,
    sessionsVerified: data?.sessionsVerified === true,
    revision: typeof data?.revision === "string" ? data.revision : "",
    legacyPublicClients: data?.legacyPublicClients !== false,
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

// Compare evaluation settings only, never mutable coordination fields.
export const settingsHash = (data: FirebaseFirestore.DocumentData | undefined) => digest({
  ...parseConfig(data), collectionTrackingStartedAt: data?.collectionTrackingStartedAt ?? null,
});
const legacyFence = { id: "config-document-v1", until: Number.MAX_SAFE_INTEGER };

/** Inline small snapshots, retain stable addressed bundles for larger histories. */
export async function publishMetrics(fetchRange: FetchRange, now = new Date()) {
  const legacyLeaseRef = db.collection("analytics").doc("visitor_sync_lease");
  const leaseId = randomUUID();
  const acquired = await db.runTransaction(async tx => {
    const [configDoc, current] = await Promise.all([tx.get(configRef()), tx.get(liveRef())]);
    const document = configDoc.data() ?? {}, config = parseConfig(document), previous = current.data();
    const migrated = document.syncLease?.version === 1;
    const lease = migrated ? document.syncLease : (await tx.get(legacyLeaseRef)).data() ?? {};
    // An old settings handler used replace-set and may erase our coordination.
    // Never steal an unprovable active owner after such a mixed-version write.
    if (!migrated && lease.id === legacyFence.id) throw new Error("Visitor coordination removed; stop old configuration writers before restoring the shared lease");
    const work = document.visitorWork;
    if (work && work.owner !== fetchRange.workOwner && (work.until > Date.now() || work.state === "pending" && work.configSettingsHash === settingsHash(document)))
      return { skipped: true as const, reason: "busy" as const, asOf: previous?.asOf ?? null };
    if ((lease.until ?? 0) > Date.now()) return { skipped: true as const, reason: "busy" as const, asOf: previous?.asOf ?? null };
    if (Date.parse(previous?.asOf) > now.getTime()) return { skipped: true as const, reason: "current" as const, asOf: previous?.asOf };
    const skipped = previous?.complete === true && previous?.storageVersion === 1 && previous?.lastRefresh?.state !== "error" &&
      previous?.configSettingsHash === settingsHash(document) &&
      Math.floor(Date.parse(previous.asOf) / 3600000) >= Math.floor(now.getTime() / 3600000);
    if (!migrated || !skipped) {
      const shared = { version: 1, id: skipped ? "" : leaseId, until: skipped ? 0 : Date.now() + 240000 };
      assertAtomicSize([{ path: configRef().path, value: { ...document, syncLease: shared } },
        ...(!migrated ? [{ path: legacyLeaseRef.path, value: legacyFence }] : [])]);
      if (!migrated) tx.set(legacyLeaseRef, legacyFence);
      tx.set(configRef(), { syncLease: shared }, { merge: true });
    }
    return skipped ? { skipped: true as const, reason: "current" as const, asOf: previous.asOf }
      : { skipped: false as const, config, previous, sequence: (previous?.sequence ?? 0) + 1, settings: settingsHash(document) };
  });
  if (acquired.skipped) return acquired;
  let committed = false, paused = false;
  try {
    const { config, previous, sequence } = acquired;
    const { manifest, pages } = await buildMetrics(config, now, fetchRange);
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
    // During rollout schema-4 clients still need their addressed page bundles.
    // Admin can retire that bridge explicitly after old clients/backends stop.
    const compatibility = config.legacyPublicClients !== false;
    const base = { ...manifest, schemaVersion: compatibility ? 4 : 5, storageVersion: 1,
      generation: "bundled", sequence, basis, fragments, dayCount, configSettingsHash: acquired.settings,
      lastRefresh: { state: "ok", attemptedAt: now.toISOString() },
      website: manifest.website ? compact(manifest.website) : null, pathCount: pages.size, complete: true };
    const inline = { ...base, bundles: compatibility ? bundles : [], inlineEntries: prepared.entries };
    const fitsInline = documentBytes(liveRef().path, inline) <= SAFE_DOCUMENT_BYTES;
    const snapshot = fitsInline ? inline : { ...base, bundles };
    const externalBundles = compatibility || !fitsInline ? bundles : [];
    const writes = externalBundles.filter(bundle => oldBundles.find(old => old.prefix === bundle.prefix)?.hash !== bundle.hash)
      .map(bundle => ({ ref: pageCollection.doc(bundleId(bundle.prefix)), value: packed.documents.get(bundleId(bundle.prefix))! }));
    for (const fragment of fragments) if (oldFragments.find(old => old.id === fragment.id)?.hash !== fragment.hash) {
      writes.push({ ref: pageCollection.doc(fragment.id), value: prepared.fragments.get(fragment.id)! });
    }
    assertAtomicSize([...writes.map(write => ({ path: write.ref.path, value: write.value })), { path: liveRef().path, value: snapshot }]);
    const progress = fetchRange.preparePublication?.();
    const operations = await db.runTransaction(async tx => {
      const latest = (await tx.get(configRef())).data(), lease = latest?.syncLease;
      fetchRange.assertBudget?.();
      fetchRange.assertCurrent?.(latest);
      if (settingsHash(latest) !== acquired.settings || lease?.id !== leaseId || !(lease?.until > Date.now())) throw new Error("Visitor configuration or sync lease changed; previous snapshot retained");
      const configPatch = { syncLease: { version: 1, id: "", until: 0 }, ...progress?.configPatch };
      assertAtomicSize([...writes.map(write => ({ path: write.ref.path, value: write.value })),
        ...(progress?.writes ?? []).map(write => ({ path: write.ref.path, value: write.value })),
        { path: liveRef().path, value: snapshot }, { path: configRef().path, value: { ...latest, ...configPatch } }]);
      for (const { ref, value } of writes) tx.set(ref, value);
      tx.set(liveRef(), snapshot);
      for (const write of progress?.writes ?? []) tx.set(write.ref, write.value);
      tx.set(configRef(), configPatch, { merge: true });
      return { pageWrites: writes.length, pageDeletes: 0, indexWrites: 0 };
    });
    committed = true;
    progress?.committed();
    return { skipped: false, generation: "bundled", sequence, state: manifest.state, asOf: manifest.asOf, pathCount: pages.size, ...operations };
  } catch (error) {
    paused = isVisitorContinuationPause(error);
    throw error;
  } finally {
    if (!committed) await db.runTransaction(async tx => {
      const latest = (await tx.get(configRef())).data(), lease = latest?.syncLease;
      if (lease?.id !== leaseId) return;
      // A superseded/expired attempt must never change a newer result.
      if (!paused && lease.until > Date.now() && settingsHash(latest) === acquired.settings) {
        const lastRefresh = { state: "error", attemptedAt: now.toISOString(), code: "refresh_failed" };
        try {
          assertAtomicSize([{ path: liveRef().path, value: { ...acquired.previous, lastRefresh } }]);
          tx.set(liveRef(), { lastRefresh }, { merge: true });
        } catch { /* Keep a full valid public document intact. */ }
      }
      tx.set(configRef(), { syncLease: { version: 1, id: "", until: 0 } }, { merge: true });
    });
  }
}
