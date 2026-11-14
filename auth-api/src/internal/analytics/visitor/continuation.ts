import { randomUUID } from "crypto";
import { deflateSync, inflateSync } from "zlib";
import { db } from "../../../firebase";
import { GOATCOUNTER_API_BASE_URL, GOATCOUNTER_API_TOKEN } from "../../../config";
import { assertAtomicSize, bundleId, digest, documentBytes, packBundles, SAFE_DOCUMENT_BYTES } from "../../../storage/bundles";
import { configRef, parseConfig, publishMetrics, settingsHash } from "./metrics";
import { createGoatCounterReader } from "./goatCounter";
import { syncVisitorAnalyticsDetails } from "./syncSnapshot.handler";
import { invalidateVisitorReadCache } from "./readSnapshot";
import { isVisitorContinuationPause, type QueryState, type VisitorJournal } from "./continuationState";

const workRef = () => db.collection("analytics").doc("visitor_work");
const dataRef = (id: string) => workRef().collection("bundles").doc(id);
type Work = {
  id: string; settings: string; configSettingsHash: string;
  config: ReturnType<typeof parseConfig> & { collectionTrackingStartedAt: string | null };
  asOf: string; phase: "public" | "private" | "complete"; checkpoint: number;
  pages: number; queries: number;
  cursor: { key: string; page: number; done: boolean } | null;
};
type StoredWork = Work & {
  version: 2; entriesHash: string; inlineEntries?: Record<string, string>;
  layout: string[]; bundles: Array<{ prefix: string; hash: string }>;
};
type LegacyWork = Work & { version: 1; bundles: Array<{ slot: number; hash: string }> };
type Stored = StoredWork | LegacyWork;
type Write = { ref: FirebaseFirestore.DocumentReference; value: Record<string, unknown> };
const workSettings = (config: FirebaseFirestore.DocumentData | undefined) => digest([
  settingsHash(config), GOATCOUNTER_API_BASE_URL, GOATCOUNTER_API_TOKEN,
]); // Only this digest is persisted, never the provider secret.
const marker = (work: Work, owner: string, until: number) => ({
  id: work.id, owner, until, state: work.phase === "complete" ? "complete" : "pending",
  configSettingsHash: work.configSettingsHash,
});
const metadata = (work: Work): Work => ({
  id: work.id, settings: work.settings, configSettingsHash: work.configSettingsHash, config: work.config,
  asOf: work.asOf, phase: work.phase, checkpoint: work.checkpoint, pages: work.pages, queries: work.queries, cursor: work.cursor,
});

/** Same inline/hash-trie organization as public publication, privately
 * addressed. Pure preparation: neither query updates nor packing perform I/O. */
export function prepareVisitorWorkStorage(work: Work, entries: Record<string, string>, previous?: Stored) {
  const layout = previous?.version === 2 ? previous.layout : [];
  let root: StoredWork = { ...metadata(work), version: 2, entriesHash: digest(entries), layout,
    inlineEntries: { ...entries }, bundles: [] };
  const writes: Write[] = [];
  if (documentBytes(workRef().path, root) > SAFE_DOCUMENT_BYTES) {
    const basis = work.id;
    // Individual encoded queries retain W307's <=512 KiB capacity. The required
    // inputs fit individually; fragments keyed by changing time-window hashes
    // would create a history of documents. No new fragment lifecycle is needed.
    const packed = packBundles(entries, layout.length ? layout : undefined,
      id => dataRef(id).path, bundle => ({ schemaVersion: 4, basis, ...bundle }));
    const bundles = packed.leaves.map(prefix => ({ prefix, hash: digest(packed.documents.get(bundleId(prefix))) }));
    const { inlineEntries: _inline, ...external } = root;
    root = { ...external, layout: packed.leaves, bundles };
    for (const bundle of bundles) if (previous?.version !== 2 || previous.bundles.find(b => b.prefix === bundle.prefix)?.hash !== bundle.hash)
      writes.push({ ref: dataRef(bundleId(bundle.prefix)), value: packed.documents.get(bundleId(bundle.prefix))! });
  }
  // An unchanged saved root needs no full rewrite just to release a lease.
  if (!previous || digest(root) !== digest(previous)) {
    root = { ...root, checkpoint: work.checkpoint + 1 };
    writes.push({ ref: workRef(), value: root });
  }
  assertAtomicSize(writes.map(write => ({ path: write.ref.path, value: write.value })));
  return { root, writes };
}

async function loadEntries(work: Stored): Promise<Record<string, string>> {
  if (work.version === 1) {
    // Read-only compatibility with existing W307 checkpoints. No slot allocator,
    // slot writes, deletion or speculative reset of their contents.
    if (work.bundles.length > 8 || new Set(work.bundles.map(b => b.slot)).size !== work.bundles.length) throw Error("Invalid legacy visitor work layout");
    const entries: Record<string, string> = {};
    for (const bundle of work.bundles) {
      if (!Number.isInteger(bundle.slot) || bundle.slot < 0 || bundle.slot >= 8) throw Error("Invalid legacy visitor work slot");
      const ref = dataRef("w_" + bundle.slot), value = (await ref.get()).data();
      if (!value || value.version !== 1 || value.id !== work.id || digest(value) !== bundle.hash || documentBytes(ref.path, value) > SAFE_DOCUMENT_BYTES) throw Error("Visitor checkpoint data missing or inconsistent");
      for (const [key, encoded] of Object.entries(value.entries)) {
        if (key in entries || typeof encoded !== "string") throw Error("Invalid legacy visitor query");
        entries[key] = encoded;
      }
    }
    return entries;
  }
  if (work.inlineEntries !== undefined) {
    if (digest(work.inlineEntries) !== work.entriesHash) throw Error("Visitor inline checkpoint integrity failed");
    return { ...work.inlineEntries };
  }
  const entries: Record<string, string> = {};
  for (const bundle of work.bundles) {
    const ref = dataRef(bundleId(bundle.prefix)), value = (await ref.get()).data();
    if (!value || value.schemaVersion !== 4 || value.basis !== work.id || digest(value) !== bundle.hash || documentBytes(ref.path, value) > SAFE_DOCUMENT_BYTES) throw Error("Visitor checkpoint data missing or inconsistent");
    for (const [key, encoded] of Object.entries(value.entries)) {
      if (key in entries) throw Error("Repeated visitor query key");
      if (typeof encoded !== "string") throw Error("Invalid visitor query entry");
      entries[key] = encoded;
    }
  }
  if (digest(entries) !== work.entriesHash) throw Error("Visitor checkpoint entries integrity failed");
  return entries;
}

export async function resumeVisitorAnalytics(now = new Date()) {
  const owner = randomUUID(), functionDeadline = Date.now() + 240000;
  const acquired = await db.runTransaction(async tx => {
    const [configDoc, previousDoc] = await Promise.all([tx.get(configRef()), tx.get(workRef())]);
    const config = configDoc.data() ?? {}, previous = previousDoc.data() as Stored | undefined;
    const settings = workSettings(config);
    if (config.visitorWork?.until > Date.now() || config.syncLease?.until > Date.now() || config.privateSync?.until > Date.now())
      return { skipped: true as const, busy: true };
    if (previous && previous.version !== 1 && previous.version !== 2) throw Error("Unsupported visitor work version");
    if (previous?.settings === settings && previous.phase === "complete" &&
        Math.floor(Date.parse(previous.asOf) / 3600000) >= Math.floor(now.getTime() / 3600000))
      return { skipped: true as const, busy: false, asOf: previous.asOf };
    const resuming = previous?.settings === settings && previous.phase !== "complete";
    const work: Work = resuming ? metadata(previous!) : {
      id: randomUUID(), settings, configSettingsHash: settingsHash(config),
      config: { ...parseConfig(config), collectionTrackingStartedAt: config.collectionTrackingStartedAt ?? null },
      asOf: now.toISOString(), phase: "public", checkpoint: 0, pages: 0, queries: 0, cursor: null,
    };
    const prepared = resuming ? undefined : prepareVisitorWorkStorage(work, {}, previous);
    const coordination = marker(work, owner, functionDeadline);
    assertAtomicSize([...(prepared?.writes ?? []).map(w => ({ path: w.ref.path, value: w.value })),
      { path: configRef().path, value: { ...config, visitorWork: coordination } }]);
    for (const write of prepared?.writes ?? []) tx.set(write.ref, write.value);
    tx.set(configRef(), { visitorWork: coordination }, { merge: true });
    return { skipped: false as const, work, stored: resuming ? previous! : prepared!.root };
  });
  if (acquired.skipped) return { ok: !acquired.busy, pending: acquired.busy, skipped: true, asOf: acquired.asOf ?? null,
    public: { ok: !acquired.busy, skipped: true }, private: { ok: !acquired.busy, skipped: true } };
  let work = acquired.work, stored = acquired.stored;
  let entries: Record<string, string> = {}, loaded = false, read: ReturnType<typeof createGoatCounterReader> | undefined;
  // Always build from the last successfully committed root, including checkpoint.
  work = { ...work, checkpoint: stored.checkpoint };
  const assertCurrent = (config: FirebaseFirestore.DocumentData | undefined) => {
    const lease = config?.visitorWork;
    if (lease?.owner !== owner || lease.id !== work.id || !(lease.until > Date.now()) || workSettings(config) !== work.settings)
      throw Error("Visitor continuation superseded or configuration changed");
  };
  const prepare = (next: Work, release: boolean) => {
    const prepared = loaded ? prepareVisitorWorkStorage(next, next.phase === "complete" ? {} : entries, stored) : { root: stored, writes: [] as Write[] };
    const configPatch = release ? { visitorWork: marker(next, "", 0) } : {};
    return { ...prepared, configPatch, committed: () => { stored = prepared.root; work = { ...next, checkpoint: stored.checkpoint }; } };
  };
  const save = async (next: Work) => {
    const progress = prepare(next, true);
    await db.runTransaction(async tx => {
      const config = (await tx.get(configRef())).data(); assertCurrent(config);
      assertAtomicSize([...progress.writes.map(w => ({ path: w.ref.path, value: w.value })),
        { path: configRef().path, value: { ...config, ...progress.configPatch } }]);
      for (const write of progress.writes) tx.set(write.ref, write.value);
      tx.set(configRef(), progress.configPatch, { merge: true });
    });
    progress.committed();
  };
  const journal: VisitorJournal = {
    get(key) {
      return entries[key] === undefined ? undefined : JSON.parse(inflateSync(Buffer.from(entries[key], "base64"), { maxOutputLength: 8 * 1024 * 1024 }).toString("utf8")) as QueryState;
    },
    async put(key, value) {
      const json = Buffer.from(JSON.stringify(value));
      if (json.length > 8 * 1024 * 1024) throw Error("Visitor query checkpoint exceeds decoded size limit");
      entries[key] = deflateSync(json).toString("base64");
      work = { ...work, pages: work.pages + 1, queries: work.queries + (value.done ? 1 : 0), cursor: { key, page: value.page, done: value.done } };
      // Memory only: no fixed page/query checkpoints or configuration reads.
    },
  };
  let publicResult: unknown = { skipped: true }, privateResult: unknown = { skipped: true };
  try {
    entries = await loadEntries(stored); loaded = true;
    read = createGoatCounterReader({ journal, functionDeadline });
    read.workOwner = owner; read.assertCurrent = assertCurrent;
    read.preparePublication = () => prepare({ ...work, phase: work.phase === "public" ? "private" : "complete",
      ...(work.phase === "private" ? { cursor: null } : {}) }, work.phase === "private");
    const measurement = new Date(work.asOf);
    if (work.phase === "public") {
      publicResult = { ok: true, ...await publishMetrics(read, measurement) };
      if ((publicResult as { reason?: string }).reason === "busy") throw Error("Visitor public writer busy");
      // A previously complete public snapshot can skip the publication hook.
      // Its phase change is coalesced with the next pause/error/private commit.
      if (work.phase === "public") work = { ...work, phase: "private" };
    }
    privateResult = { ok: true, ...await syncVisitorAnalyticsDetails(read, measurement) };
    if ((privateResult as { reason?: string }).reason === "busy") throw Error("Visitor private writer busy");
    if (work.phase !== "complete") await save({ ...work, phase: "complete", cursor: null });
    invalidateVisitorReadCache();
    return { ok: true, pending: false, asOf: work.asOf, public: publicResult, private: privateResult, requests: read.stats?.() };
  } catch (error) {
    const planned = isVisitorContinuationPause(error);
    try { await save(work); }
    catch (checkpointError) { console.error("[visitor-analytics] Continuation checkpoint failed", checkpointError); }
    if (!planned) console.error("[visitor-analytics] Continuation failed", error);
    invalidateVisitorReadCache();
    return { ok: false, pending: planned, error: planned ? "continuation_pending" : "refresh_failed", asOf: work.asOf,
      public: publicResult, private: privateResult, requests: read?.stats?.() };
  }
}
