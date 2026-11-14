import { randomUUID } from "node:crypto";
import { db } from "../firebase";
import { YOUTUBE_API_KEY, YOUTUBE_SOURCES } from "../config";
import { collectYouTube, type YouTubeCache } from "./youtube";
import { configuredYouTubeSources, matchesYouTubeSources } from "./sources";
import { YouTubeFailure, youtubeStorage, logYouTubeFailure } from "./errors";
import type { YouTubeSnapshot } from "./types";
import { publicYouTubeCache } from "./publicSnapshot";
import { cacheEntries, restoreCache } from "./cache";
import { assertAtomicSize, bundleId, digest, packBundles, type Layout } from "../storage/bundles";

const snapshotRef = db.collection("creator_snapshots").doc("creators-live.json");
// Read only during the atomic handover. Old binaries honor this permanent fence.
const legacyLockRef = db.collection("creator_sync").doc("youtube");
const legacyFence = { owner: "snapshot-document-v1", expiresAt: Number.MAX_SAFE_INTEGER };
const cacheRef = (id: string) => db.collection("creator_youtube_cache").doc(id);
type SyncResult = { snapshot: YouTubeSnapshot; refreshed: boolean };
let running: Promise<SyncResult> | null = null;
const content = ({ generatedAt: _time, requests: _requests, ...value }: YouTubeSnapshot) => value;
const checkedSnapshot = (snapshot: YouTubeSnapshot, lock: any): YouTubeSnapshot =>
  lock?.snapshotHash === digest(content(snapshot)) && typeof lock.checkedAt === "string" ? { ...snapshot, generatedAt: lock.checkedAt } : snapshot;
export async function readYouTubeSnapshot(): Promise<YouTubeSnapshot | null> {
  return publicYouTubeCache.read(() => youtubeStorage("YOUTUBE_SNAPSHOT_READ_FAILED", "read_snapshot", async () => {
    const doc = await snapshotRef.get();
    const data = doc.data();
    const snapshot = data?.youtube as YouTubeSnapshot | undefined;
    return snapshot ? checkedSnapshot(snapshot, data?.youtubeSync) : null;
  }));
}

async function synchronize(force: boolean): Promise<SyncResult> {
  const config = configuredYouTubeSources(YOUTUBE_SOURCES);
  if (!YOUTUBE_API_KEY) throw new YouTubeFailure("YOUTUBE_NOT_CONFIGURED", { stage: "configuration" });
  const owner = randomUUID(), started = Date.now();
  const acquired = await youtubeStorage("YOUTUBE_LOCK_FAILED", "acquire_lock", () => db.runTransaction(async tx => {
    const snapshot = await youtubeStorage("YOUTUBE_SNAPSHOT_READ_FAILED", "read_snapshot", () => tx.get(snapshotRef));
    const document = snapshot.data() ?? {};
    const migrated = document.youtubeSync?.version === 1;
    // Both reads precede writes. The legacy fence and shared lease commit together:
    // old acquirers conflict/retry; an expired old publisher fails its owner check.
    const coordination = migrated ? document.youtubeSync : (await tx.get(legacyLockRef)).data() ?? {};
    if ((coordination.expiresAt ?? 0) > started) throw new YouTubeFailure("YOUTUBE_SYNC_BUSY", { stage: "acquire_lock" });
    const stored = document.youtube;
    const previous = stored ? checkedSnapshot(stored, coordination) : undefined;
    const reusable = matchesYouTubeSources(previous, config);
    const skipped = !force && !!coordination.cacheLayout && reusable && started >= Date.parse(previous.generatedAt) &&
      started - Date.parse(previous.generatedAt) < 3600000;
    const shared = { ...coordination, version: 1, owner: skipped ? "" : owner, expiresAt: skipped ? 0 : started + 210000 };
    if (!migrated || !skipped) {
      assertAtomicSize([{ path: snapshotRef.path, value: { ...document, youtubeSync: shared } },
        ...(!migrated ? [{ path: legacyLockRef.path, value: { ...coordination, ...legacyFence } }] : [])]);
      if (!migrated) tx.set(legacyLockRef, legacyFence, { merge: true });
      tx.set(snapshotRef, { youtubeSync: shared }, { merge: true });
    }
    return { previous: reusable ? previous : undefined, coordination: shared, document, skipped };
  }));
  if (acquired.skipped) {
    publicYouTubeCache.publish(acquired.previous!);
    return { snapshot: acquired.previous!, refreshed: false };
  }
  try {
    const layout = acquired.coordination.cacheLayout as Layout | undefined;
    const stored = new Map<string, Record<string, unknown>>();
    const cache = await youtubeStorage("YOUTUBE_CACHE_READ_FAILED", "read_cache", async () => {
      if (layout) {
        const docs = await Promise.all(layout.map(prefix => cacheRef(bundleId(prefix)).get()));
        docs.forEach((doc, index) => { if (!doc.exists) throw Error("Missing cache bundle"); stored.set(bundleId(layout[index]), doc.data()!); });
        return restoreCache([...stored.values()]);
      }
      const legacy: YouTubeCache = {};
      const docs = await Promise.all(config.sources.map(source => cacheRef(source.channelId).get()));
      docs.forEach((doc, index) => { if (doc.exists) legacy[config.sources[index].channelId] = doc.data() as YouTubeCache[string]; });
      return legacy;
    });
    const result = await collectYouTube({ key: YOUTUBE_API_KEY, config, cache });
    if (!matchesYouTubeSources(result.snapshot, config)) throw new YouTubeFailure("YOUTUBE_SNAPSHOT_INCOMPLETE", { stage: "validate_snapshot" });
    await youtubeStorage("YOUTUBE_SNAPSHOT_WRITE_FAILED", "publish_snapshot", async () => {
      // Keep removed channels reusable without reading their legacy documents again.
      const packed = packBundles(cacheEntries({ ...cache, ...result.cache }), layout, id => cacheRef(id).path);
      const snapshotHash = digest(content(result.snapshot));
      const changed = !acquired.previous || digest(content(acquired.previous)) !== snapshotHash;
      const writes = [...packed.documents].filter(([id, value]) => !stored.has(id) || digest(stored.get(id)) !== digest(value)).map(([id, value]) => ({ ref: cacheRef(id), value }));
      const coordination = { ...acquired.coordination, owner: "", expiresAt: 0, cacheLayout: packed.leaves,
        checkedAt: result.snapshot.generatedAt, snapshotHash };
      assertAtomicSize([...writes.map(write => ({ path: write.ref.path, value: write.value })),
        { path: snapshotRef.path, value: { ...acquired.document, ...(changed ? { youtube: result.snapshot } : {}), youtubeSync: coordination } }]);
      await db.runTransaction(async tx => {
        const current = (await tx.get(snapshotRef)).data(), lock = current?.youtubeSync;
        if (lock?.owner !== owner || lock?.expiresAt <= Date.now()) throw new YouTubeFailure("YOUTUBE_LOCK_EXPIRED", { stage: "publish_snapshot" });
        assertAtomicSize([...writes.map(write => ({ path: write.ref.path, value: write.value })),
          { path: snapshotRef.path, value: { ...current, ...(changed ? { youtube: result.snapshot } : {}), youtubeSync: coordination } }]);
        for (const { ref, value } of writes) tx.set(ref, value);
        // An unchanged payload is deliberately absent from the write mask.
        tx.set(snapshotRef, { ...(changed ? { youtube: result.snapshot } : {}), youtubeSync: coordination }, { merge: true });
      });
    });
    publicYouTubeCache.publish(result.snapshot);
    return { snapshot: result.snapshot, refreshed: true };
  } catch (error) {
    await youtubeStorage("YOUTUBE_LOCK_FAILED", "release_lock", () => db.runTransaction(async tx => {
      const lock = (await tx.get(snapshotRef)).data()?.youtubeSync;
      if (lock?.owner === owner) tx.set(snapshotRef, { youtubeSync: { owner: "", expiresAt: 0 } }, { merge: true });
    })).catch(cleanupError => { logYouTubeFailure(cleanupError); });
    throw error;
  }
}
export function refreshYouTubeSnapshot(force = false): Promise<YouTubeSnapshot> {
  if (running) return running.then(result => force && !result.refreshed ? refreshYouTubeSnapshot(true) : result.snapshot);
  running = synchronize(force).finally(() => { running = null; });
  return running.then(result => result.snapshot);
}
