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
const lockRef = db.collection("creator_sync").doc("youtube");
const cacheRef = (id: string) => db.collection("creator_youtube_cache").doc(id);
type SyncResult = { snapshot: YouTubeSnapshot; refreshed: boolean };
let running: Promise<SyncResult> | null = null;
const content = ({ generatedAt: _time, requests: _requests, ...value }: YouTubeSnapshot) => value;
const checkedSnapshot = (snapshot: YouTubeSnapshot, lock: any): YouTubeSnapshot =>
  lock?.snapshotHash === digest(content(snapshot)) && typeof lock.checkedAt === "string" ? { ...snapshot, generatedAt: lock.checkedAt } : snapshot;
export async function readYouTubeSnapshot(): Promise<YouTubeSnapshot | null> {
  return publicYouTubeCache.read(() => youtubeStorage("YOUTUBE_SNAPSHOT_READ_FAILED", "read_snapshot", async () => {
    // One transaction avoids pairing a new successful-check time with old data.
    return db.runTransaction(async tx => {
      const [doc, lock] = await Promise.all([tx.get(snapshotRef), tx.get(lockRef)]);
      const snapshot = doc.data()?.youtube as YouTubeSnapshot | undefined;
      return snapshot ? checkedSnapshot(snapshot, lock.data()) : null;
    });
  }));
}

async function synchronize(force: boolean): Promise<SyncResult> {
  const config = configuredYouTubeSources(YOUTUBE_SOURCES);
  if (!YOUTUBE_API_KEY) throw new YouTubeFailure("YOUTUBE_NOT_CONFIGURED", { stage: "configuration" });
  const owner = randomUUID(), started = Date.now();
  const acquired = await youtubeStorage("YOUTUBE_LOCK_FAILED", "acquire_lock", () => db.runTransaction(async tx => {
    const [lock, snapshot] = await Promise.all([
      tx.get(lockRef),
      youtubeStorage("YOUTUBE_SNAPSHOT_READ_FAILED", "read_snapshot", () => tx.get(snapshotRef)),
    ]);
    const coordination = lock.data() ?? {};
    if ((coordination.expiresAt ?? 0) > started) throw new YouTubeFailure("YOUTUBE_SYNC_BUSY", { stage: "acquire_lock" });
    const stored = snapshot.data()?.youtube;
    const previous = stored ? checkedSnapshot(stored, coordination) : undefined;
    const reusable = matchesYouTubeSources(previous, config);
    if (!force && coordination.cacheLayout && reusable && started >= Date.parse(previous.generatedAt) &&
        started - Date.parse(previous.generatedAt) < 3600000) return { previous, coordination, skipped: true };
    tx.set(lockRef, { ...coordination, owner, expiresAt: started + 210000 });
    return { previous: reusable ? previous : undefined, coordination, skipped: false };
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
        ...(changed ? [{ path: snapshotRef.path, value: { youtube: result.snapshot } }] : []), { path: lockRef.path, value: coordination }]);
      await db.runTransaction(async tx => {
        const lock = await tx.get(lockRef);
        if (lock.data()?.owner !== owner || lock.data()?.expiresAt <= Date.now()) throw new YouTubeFailure("YOUTUBE_LOCK_EXPIRED", { stage: "publish_snapshot" });
        for (const { ref, value } of writes) tx.set(ref, value);
        if (changed) tx.set(snapshotRef, { youtube: result.snapshot }, { merge: true });
        tx.set(lockRef, coordination);
      });
    });
    publicYouTubeCache.publish(result.snapshot);
    return { snapshot: result.snapshot, refreshed: true };
  } catch (error) {
    await youtubeStorage("YOUTUBE_LOCK_FAILED", "release_lock", () => db.runTransaction(async tx => {
      const lock = await tx.get(lockRef);
      if (lock.data()?.owner === owner) tx.set(lockRef, { ...lock.data(), owner: "", expiresAt: 0 });
    })).catch(cleanupError => { logYouTubeFailure(cleanupError); });
    throw error;
  }
}
export function refreshYouTubeSnapshot(force = false): Promise<YouTubeSnapshot> {
  if (running) return running.then(result => force && !result.refreshed ? refreshYouTubeSnapshot(true) : result.snapshot);
  running = synchronize(force).finally(() => { running = null; });
  return running.then(result => result.snapshot);
}
