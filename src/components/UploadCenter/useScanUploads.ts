import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
  documentId,
} from "firebase/firestore";
import { useEffect, useState } from "react";

import { db } from "../../lib/firebase";
import { beginReadScope, endReadScope, traceGetDocs, type FirestoreTraceScope } from "../../lib/debug/firestoreReadTrace";

const CACHE_KEY_PREFIX = "sfdatahub:uploadCenter:scanUploads:v1:";
const SCAN_UPLOAD_LIMIT = 5;

type SerializedTimestamp = { seconds: number; nanoseconds: number };

export type ScanUploadDoc = {
  id: string;
  scanId?: string;
  queueId?: string;
  source?: string;
  discordUserId?: string | null;
  discordUsername?: string | null;
  serverCode?: string | null;
  hasPlayersCsv?: boolean;
  hasGuildsCsv?: boolean;
  status?: string;
  storagePaths?: {
    playersCsv?: string | null;
    guildsCsv?: string | null;
  };
  uploadedAt?: Timestamp | null;
  lastError?: string | null;
};

export type UseScanUploadsResult = {
  items: ScanUploadDoc[];
  loading: boolean;
  error: Error | null;
};

type CachedScanUploadDoc = Omit<ScanUploadDoc, "uploadedAt"> & {
  uploadedAt?: SerializedTimestamp | null;
};

type ScanUploadCache = {
  savedAtMs: number;
  lastUploadedAt: SerializedTimestamp | null;
  items: CachedScanUploadDoc[];
};

const normalizeTimestamp = (value?: Timestamp | SerializedTimestamp | null): SerializedTimestamp | null => {
  if (!value) return null;
  if ("seconds" in value && "nanoseconds" in value) {
    return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  return null;
};

const timestampToMillis = (value?: Timestamp | SerializedTimestamp | null): number => {
  if (!value) return -Infinity;
  if (value instanceof Timestamp) return value.toMillis();
  if ("seconds" in value && "nanoseconds" in value) {
    return value.seconds * 1000 + value.nanoseconds / 1_000_000;
  }
  return -Infinity;
};

const deserializeCachedDoc = (doc: CachedScanUploadDoc): ScanUploadDoc => ({
  ...doc,
  uploadedAt: doc.uploadedAt ? new Timestamp(doc.uploadedAt.seconds, doc.uploadedAt.nanoseconds) : null,
});

const serializeForCache = (doc: ScanUploadDoc): CachedScanUploadDoc => ({
  ...doc,
  uploadedAt: normalizeTimestamp(doc.uploadedAt),
});

const getLatestUploadedAt = (docs: Array<ScanUploadDoc | CachedScanUploadDoc>): SerializedTimestamp | null => {
  let latest: SerializedTimestamp | null = null;
  let latestMillis = -Infinity;
  docs.forEach((doc) => {
    const ts = normalizeTimestamp("uploadedAt" in doc ? doc.uploadedAt ?? null : null);
    const ms = timestampToMillis(ts);
    if (ms > latestMillis && ts) {
      latest = ts;
      latestMillis = ms;
    }
  });
  return latest;
};

const mergeUploads = (existing: ScanUploadDoc[], incoming: ScanUploadDoc[]): ScanUploadDoc[] => {
  const merged = new Map<string, ScanUploadDoc>();
  const pushDoc = (doc: ScanUploadDoc) => {
    const key = doc.id || doc.scanId;
    if (!key) return;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, doc);
      return;
    }
    const currentMs = timestampToMillis(current.uploadedAt);
    const incomingMs = timestampToMillis(doc.uploadedAt);
    merged.set(key, incomingMs >= currentMs ? doc : current);
  };

  existing.forEach(pushDoc);
  incoming.forEach(pushDoc);

  return Array.from(merged.values())
    .sort((a, b) => timestampToMillis(b.uploadedAt) - timestampToMillis(a.uploadedAt))
    .slice(0, SCAN_UPLOAD_LIMIT);
};

const collectIdsForTimestamp = (
  docs: ScanUploadDoc[],
  target: SerializedTimestamp | null,
): string[] => {
  if (!target) return [];
  const targetMs = timestampToMillis(target);
  return docs
    .filter((doc) => timestampToMillis(doc.uploadedAt) === targetMs)
    .map((doc) => doc.id)
    .filter((id): id is string => Boolean(id));
};

const readCache = (key: string): ScanUploadCache | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed as ScanUploadCache;
  } catch (err) {
    console.warn("[upload-center] Failed to read scan uploads cache", err);
    return null;
  }
};

const writeCache = (key: string, docs: ScanUploadDoc[]) => {
  if (typeof window === "undefined") return;
  try {
    const payload: ScanUploadCache = {
      savedAtMs: Date.now(),
      lastUploadedAt: getLatestUploadedAt(docs),
      items: docs.map(serializeForCache),
    };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    console.warn("[upload-center] Failed to persist scan uploads cache", err);
  }
};

const inFlightDeltaChecks = new Map<string, Promise<void>>();

export const useScanUploads = (discordUserId?: string | null): UseScanUploadsResult => {
  const [items, setItems] = useState<ScanUploadDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!discordUserId) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    const cacheKey = `${CACHE_KEY_PREFIX}${discordUserId}`;
    const cached = readCache(cacheKey);
    const cachedItems = cached ? cached.items.map(deserializeCachedDoc) : [];
    const cachedLastUploadedAt = cached?.lastUploadedAt || getLatestUploadedAt(cachedItems);
    const seenIdsAtLastTimestamp = collectIdsForTimestamp(cachedItems, cachedLastUploadedAt);

    setError(null);
    if (cachedItems.length > 0) {
      setItems(cachedItems);
      setLoading(false);
    } else {
      setItems([]);
      setLoading(true);
    }

    const loadInitial = async () => {
      const scope: FirestoreTraceScope = beginReadScope("UploadCenter:scanUploads");
      try {
        const scanUploadsRef = collection(db, "scan_uploads");
        const q = query(
          scanUploadsRef,
          where("discordUserId", "==", discordUserId),
          orderBy("uploadedAt", "desc"),
          limit(SCAN_UPLOAD_LIMIT),
        );
        const snapshot = await traceGetDocs(scope, { path: scanUploadsRef.path }, () => getDocs(q));
        if (!active) return;
        const docs = snapshot.docs.map(
          (doc) =>
            ({
              id: doc.id,
              ...doc.data(),
            }) as ScanUploadDoc,
        );
        console.log(
          `[upload-center] Loaded ${docs.length} scan_uploads for current user (remote sessions)`,
        );
        setItems(docs);
        writeCache(cacheKey, docs);
      } catch (err) {
        if (!active) return;
        console.error(
          "[upload-center] Failed to load scan_uploads for current user (index may be required)",
          err,
        );
        setError(err instanceof Error ? err : new Error("Failed to load scan uploads"));
        setItems([]);
      } finally {
        endReadScope(scope);
        if (active) setLoading(false);
      }
    };

    const runDelta = async (
      lastUploadedAt: SerializedTimestamp,
      seenIdsForLastTimestamp: string[],
    ) => {
      const deltaKey = `${discordUserId}:${lastUploadedAt.seconds}:${lastUploadedAt.nanoseconds}`;
      const existing = inFlightDeltaChecks.get(deltaKey);
      if (existing) {
        await existing;
        return;
      }

      const scope: FirestoreTraceScope = beginReadScope("UploadCenter:scanUploads");
      const promise = (async () => {
        try {
          const scanUploadsRef = collection(db, "scan_uploads");
          const lastTimestamp = new Timestamp(lastUploadedAt.seconds, lastUploadedAt.nanoseconds);
          const deltaQuery = query(
            scanUploadsRef,
            where("discordUserId", "==", discordUserId),
            orderBy("uploadedAt", "asc"),
            where("uploadedAt", ">", lastTimestamp),
          );
          const snapshot = await traceGetDocs(scope, { path: scanUploadsRef.path }, () => getDocs(deltaQuery));
          if (!active) return;
          let docs = snapshot.docs.map(
            (doc) =>
              ({
                id: doc.id,
                ...doc.data(),
              }) as ScanUploadDoc,
          );

          if (docs.length === 0 && seenIdsForLastTimestamp.length > 0) {
            const unseenIds = seenIdsForLastTimestamp.slice(0, 10);
            const equalityQuery = query(
              scanUploadsRef,
              where("discordUserId", "==", discordUserId),
              where("uploadedAt", "==", lastTimestamp),
              where(documentId(), "not-in", unseenIds),
              orderBy(documentId()),
            );
            const equalitySnapshot = await traceGetDocs(
              scope,
              { path: scanUploadsRef.path },
              () => getDocs(equalityQuery),
            );
            if (!active) return;
            docs = equalitySnapshot.docs.map(
              (doc) =>
                ({
                  id: doc.id,
                  ...doc.data(),
                }) as ScanUploadDoc,
            );
          }

          if (docs.length === 0) {
            console.log("[upload-center] No new scan_uploads found; using cached entries");
            return;
          }
          setItems((prev) => {
            const merged = mergeUploads(prev.length ? prev : cachedItems, docs);
            writeCache(cacheKey, merged);
            return merged;
          });
        } catch (err) {
          if (!active) return;
          console.error(
            "[upload-center] Delta refresh for scan_uploads failed (index may be required)",
            err,
          );
        } finally {
          endReadScope(scope);
        }
      })();

      const trackedPromise = promise.finally(() => {
        inFlightDeltaChecks.delete(deltaKey);
      });

      inFlightDeltaChecks.set(deltaKey, trackedPromise);
      await trackedPromise;
    };

    if (cachedItems.length > 0 && cachedLastUploadedAt) {
      void runDelta(cachedLastUploadedAt, seenIdsAtLastTimestamp);
    } else {
      void loadInitial();
    }

    return () => {
      active = false;
    };
  }, [discordUserId]);

  return { items, loading, error };
};
