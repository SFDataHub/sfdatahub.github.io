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

const toMillis = (value: any): number | null => {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value.toMillis === "function") {
    const millis = value.toMillis();
    return Number.isFinite(millis) ? millis : null;
  }
  return null;
};

const buildContentSignature = (data?: Record<string, any>): string => {
  if (!data || typeof data !== "object") return "";
  const hash =
    typeof data.hash === "string"
      ? data.hash
      : typeof data.contentHash === "string"
        ? data.contentHash
        : "";
  const updatedAtMs = toMillis(data.updatedAt);
  const players = Array.isArray(data.players) ? data.players : [];
  const len = players.length;
  const pick = (idx: number) => {
    const row = players[idx];
    if (!row || typeof row !== "object") return "";
    const id = String((row as any).playerId ?? (row as any).id ?? (row as any).name ?? "");
    const sum = String((row as any).sum ?? "");
    const level = String((row as any).level ?? "");
    return `${id}:${sum}:${level}`;
  };
  const first = len > 0 ? pick(0) : "";
  const middle = len > 2 ? pick(Math.floor(len / 2)) : "";
  const last = len > 1 ? pick(len - 1) : first;
  return [hash, updatedAtMs ?? "", len, first, middle, last].join("|");
};

export async function handlePublishPlayerLatestToplists(event: any) {
  const after = event.data?.after;
  if (!after?.exists) return;
  const data = after.data() as Record<string, any> | undefined;
  if (!data) return;

  const before = event.data?.before;
  const beforeData = before?.exists ? (before.data() as Record<string, any>) : null;
  const beforeSig = beforeData ? buildContentSignature(beforeData) : "";
  const afterSig = buildContentSignature(data);

  const hasDotPending = Object.prototype.hasOwnProperty.call(data, "meta.pendingSincePublish");
  const hasDotLastPublished = Object.prototype.hasOwnProperty.call(data, "meta.lastPublishedAt");
  const needsDotCleanup = hasDotPending || hasDotLastPublished;

  const contentChanged = !beforeData || !beforeSig || beforeSig !== afterSig;
  if (!contentChanged && !needsDotCleanup) {
    return;
  }

  const meta = (data.meta as Record<string, any> | undefined) ?? {};
  const nestedPendingRaw = (meta as any).pendingSincePublish;
  const nestedPending = Number(nestedPendingRaw);
  const nestedPendingValid = Number.isFinite(nestedPending);

  const dotPendingRaw = hasDotPending ? (data as any)["meta.pendingSincePublish"] : undefined;
  const dotPending = Number(dotPendingRaw);
  const dotPendingValid = Number.isFinite(dotPending);

  const pending = nestedPendingValid ? nestedPending : dotPendingValid ? dotPending : Number.NaN;
  const shouldMigratePending = !nestedPendingValid && dotPendingValid;

  const hasNestedLastPublished = Object.prototype.hasOwnProperty.call(meta, "lastPublishedAt");
  const dotLastPublished = hasDotLastPublished ? (data as any)["meta.lastPublishedAt"] : undefined;
  const shouldMigrateLastPublished =
    !hasNestedLastPublished && hasDotLastPublished && dotLastPublished != null;

  const shouldPublish = contentChanged && Number.isFinite(pending) && pending >= PUBLISH_THRESHOLD;
  if (!shouldPublish) {
    const updateArgs: any[] = [];
    if (shouldMigratePending) {
      updateArgs.push(
        new admin.firestore.FieldPath("meta", "pendingSincePublish"),
        pending,
      );
    }
    if (shouldMigrateLastPublished) {
      updateArgs.push(
        new admin.firestore.FieldPath("meta", "lastPublishedAt"),
        dotLastPublished,
      );
    }
    if (hasDotPending) {
      updateArgs.push(
        new admin.firestore.FieldPath("meta.pendingSincePublish"),
        admin.firestore.FieldValue.delete(),
      );
    }
    if (hasDotLastPublished) {
      updateArgs.push(
        new admin.firestore.FieldPath("meta.lastPublishedAt"),
        admin.firestore.FieldValue.delete(),
      );
    }
    if (updateArgs.length > 0) {
      await after.ref.update(...updateArgs);
    }
    return;
  }

  const serverCode = parseServerCode(event.params?.docId, data.server);
  if (!serverCode) {
    console.warn("[publishPlayerLatestToplists] Unable to resolve server code", {
      docId: event.params?.docId,
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
  const resetArgs: any[] = [
    new admin.firestore.FieldPath("meta", "pendingSincePublish"),
    nextPending,
    new admin.firestore.FieldPath("meta", "lastPublishedAt"),
    admin.firestore.FieldValue.serverTimestamp(),
  ];
  if (hasDotPending) {
    resetArgs.push(
      new admin.firestore.FieldPath("meta.pendingSincePublish"),
      admin.firestore.FieldValue.delete(),
    );
  }
  if (hasDotLastPublished) {
    resetArgs.push(
      new admin.firestore.FieldPath("meta.lastPublishedAt"),
      admin.firestore.FieldValue.delete(),
    );
  }
  await after.ref.update(...resetArgs);
}
