import { onDocumentWritten } from "firebase-functions/v2/firestore";

import { admin, db } from "../firebase";

const PUBLISH_THRESHOLD = 100;
const SNAPSHOT_PREFIX = "snapshot_";
const SNAPSHOT_SUFFIX = "_player_derived";

const parseServerCode = (docId: string, fallback?: unknown): string | null => {
  if (typeof docId === "string") {
    const trimmed = docId.trim();
    if (trimmed.startsWith(SNAPSHOT_PREFIX) && trimmed.endsWith(SNAPSHOT_SUFFIX)) {
      const core = trimmed.slice(SNAPSHOT_PREFIX.length, trimmed.length - SNAPSHOT_SUFFIX.length);
      const serverCode = core.trim();
      if (serverCode) return serverCode.toUpperCase();
    }
  }
  const fallbackStr = typeof fallback === "string" ? fallback.trim() : "";
  return fallbackStr ? fallbackStr.toUpperCase() : null;
};

export const publishPlayerLatestToplists = onDocumentWritten(
  {
    region: "europe-west1",
    document: "stats_cache_player_derived/{docId}",
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const data = after.data() as Record<string, any> | undefined;
    if (!data) return;

    const meta = (data.meta as Record<string, any> | undefined) ?? {};
    const pending = Number(meta.pendingSincePublish ?? 0);
    if (!Number.isFinite(pending) || pending < PUBLISH_THRESHOLD) return;

    const serverCode = parseServerCode(event.params.docId, data.server);
    if (!serverCode) {
      console.warn("[publishPlayerLatestToplists] Unable to resolve server code", {
        docId: event.params.docId,
        server: data.server,
      });
      return;
    }

    const players = Array.isArray(data.players) ? data.players : [];
    const updatedAt = data.updatedAt ?? null;

    const publicRef = db.doc(
      `stats_public/toplists_players_v1/lists/latest_toplists/servers/${serverCode}`,
    );
    await publicRef.set(
      {
        server: serverCode,
        updatedAt,
        players,
        publishedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const nextPending = pending % PUBLISH_THRESHOLD;
    await after.ref.set(
      {
        "meta.pendingSincePublish": nextPending,
        "meta.lastPublishedAt": admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  },
);
