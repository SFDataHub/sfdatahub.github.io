import type { Request, Response } from "express";
import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";

import { UPLOAD_INBOX_BUCKET } from "../config";
import { admin, db } from "../firebase";
import { requireUser } from "../middleware/auth";
import type { LinkedPlayer, UserDoc } from "../users";

const userUploadInboxRouter = Router();

type UploadInboxDoc = {
  createdAt: Timestamp;
  downloadedAt: Timestamp | null;
  expiresAt: Timestamp;
  playersCount: number;
  guildsCount: number;
  server: string | null;
  source: string;
  storagePathPlayers: string | null;
  storagePathGuilds: string | null;
  status: "ready" | "downloaded" | "expired" | string;
};

const getInboxCollection = (userId: string) =>
  db.collection("users").doc(userId).collection("uploadInbox");

const serializeTimestamp = (value?: Timestamp | null): string | null =>
  value ? value.toDate().toISOString() : null;

const normalizePlayerId = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number") {
    return value.toString();
  }
  return null;
};

const readCsvFromStorage = async (path: string | null): Promise<string | null> => {
  if (!path) return null;
  try {
    const bucket = admin.storage().bucket(UPLOAD_INBOX_BUCKET);
    const [buffer] = await bucket.file(path).download();
    return buffer.toString("utf8");
  } catch (error) {
    console.warn("[uploadInbox] Failed to read CSV from storage", { path, error });
    return null;
  }
};

userUploadInboxRouter.use(requireUser);

userUploadInboxRouter.post("/unlink-character", async (req: Request, res: Response) => {
  const userId = req.sessionUser?.userId;
  const targetPlayerId = normalizePlayerId(req.body?.playerId);
  const rawServer = typeof req.body?.server === "string" ? req.body.server.trim() : "";
  const server = rawServer.length > 0 ? rawServer : null;

  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!targetPlayerId) {
    return res.status(400).json({ error: "playerId is required" });
  }

  try {
    const userRef = db.collection("users").doc(userId);

    const updatedLinkedPlayers = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(userRef);
      if (!snapshot.exists) {
        throw new Error("user_not_found");
      }

      const data = snapshot.data() as UserDoc;
      const current = Array.isArray(data.linkedPlayers) ? data.linkedPlayers : [];

      const matchesTarget = (player: LinkedPlayer): boolean => {
        const playerId = normalizePlayerId(player?.playerId);
        const idsMatch = Boolean(playerId) && playerId === targetPlayerId;
        const serverMatches = server
          ? typeof player?.server === "string" && player.server.toLowerCase() === server.toLowerCase()
          : true;
        return idsMatch && serverMatches;
      };

      if (!current.some(matchesTarget)) {
        throw new Error("linked_player_not_found");
      }

      const next = current.filter((player) => !matchesTarget(player));
      tx.update(userRef, { linkedPlayers: next });
      return next;
    });

    return res.json({
      ok: true,
      linkedPlayers: updatedLinkedPlayers,
    });
  } catch (error: any) {
    const code = error?.message;
    if (code === "user_not_found") {
      return res.status(404).json({ error: "User not found" });
    }
    if (code === "linked_player_not_found") {
      return res.status(404).json({ error: "Linked character not found" });
    }

    console.error("[unlinkCharacter] Failed to unlink character", error);
    return res.status(500).json({ error: "Failed to unlink character" });
  }
});

userUploadInboxRouter.get("/upload-inbox", async (req: Request, res: Response) => {
  try {
    const userId = req.sessionUser?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const nowTs = Timestamp.now();

    const snapshot = await getInboxCollection(userId)
      .where("expiresAt", ">", nowTs)
      .where("status", "in", ["ready", "downloaded"])
      .orderBy("expiresAt", "desc")
      .orderBy("createdAt", "desc")
      .get();

    const items = snapshot.docs.map((doc) => {
      const data = doc.data() as UploadInboxDoc;
      const createdAt =
        serializeTimestamp(data.createdAt) ??
        serializeTimestamp(data.expiresAt) ??
        new Date(0).toISOString();
      const expiresAt =
        serializeTimestamp(data.expiresAt) ?? serializeTimestamp(data.createdAt) ?? new Date(0).toISOString();
      return {
        scanId: doc.id,
        createdAt,
        downloadedAt: serializeTimestamp(data.downloadedAt),
        expiresAt,
        playersCount: data.playersCount ?? 0,
        guildsCount: data.guildsCount ?? 0,
        server: data.server ?? null,
        source: data.source ?? "discord",
        status: (data.status as "ready" | "downloaded" | "expired") ?? "ready",
      };
    });

    return res.json({ items });
  } catch (error) {
    console.error("[uploadInbox] Failed to list inbox entries", error);
    return res.status(500).json({ error: "Failed to list upload inbox entries." });
  }
});

userUploadInboxRouter.get(
  "/upload-inbox/:scanId/download",
  async (req: Request, res: Response) => {
    try {
      const userId = req.sessionUser?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const scanId = req.params.scanId;
      const docRef = getInboxCollection(userId).doc(scanId);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        return res.status(404).json({ error: "scan_not_found" });
      }

      const data = docSnap.data() as UploadInboxDoc;
      const now = Timestamp.now();
      const expiresAtMillis =
        (data.expiresAt && typeof data.expiresAt.toMillis === "function"
          ? data.expiresAt.toMillis()
          : 0) ?? 0;
      const hasExpired = expiresAtMillis <= now.toMillis() || data.status === "expired";
      if (hasExpired) {
        await docRef.set({ status: "expired" }, { merge: true }).catch(() => undefined);
        return res.status(410).json({ error: "scan_expired" });
      }

      if (data.status !== "ready" && data.status !== "downloaded") {
        return res.status(400).json({ error: "invalid_status" });
      }

      const playersCsv = await readCsvFromStorage(data.storagePathPlayers);
      const guildsCsv = await readCsvFromStorage(data.storagePathGuilds);

      let downloadedAt = data.downloadedAt;
      let status: "ready" | "downloaded" | "expired" =
        (data.status as "ready" | "downloaded" | "expired") ?? "ready";
      let expiresAt =
        data.expiresAt && typeof data.expiresAt.toMillis === "function"
          ? data.expiresAt
          : Timestamp.fromMillis(now.toMillis());

      if (data.status === "ready") {
        downloadedAt = now;
        status = "downloaded";
        const newExpiry = Timestamp.fromMillis(
          now.toMillis() + 7 * 24 * 60 * 60 * 1000,
        );
        expiresAt =
          expiresAt.toMillis() > newExpiry.toMillis() ? expiresAt : newExpiry;

        await docRef.set(
          {
            downloadedAt,
            status,
            expiresAt,
          },
          { merge: true },
        );
      }

      return res.json({
        scanId,
        playersCsv,
        guildsCsv,
        meta: {
          createdAt:
            serializeTimestamp(data.createdAt) ??
            serializeTimestamp(expiresAt) ??
            new Date(0).toISOString(),
          downloadedAt: serializeTimestamp(downloadedAt),
          expiresAt:
            serializeTimestamp(expiresAt) ??
            serializeTimestamp(data.expiresAt) ??
            new Date(0).toISOString(),
          playersCount: data.playersCount ?? 0,
          guildsCount: data.guildsCount ?? 0,
          server: data.server ?? null,
          source: data.source ?? "discord",
          status,
        },
      });
    } catch (error) {
      console.error("[uploadInbox] Failed to download inbox entry", error);
      return res.status(500).json({ error: "Failed to download upload inbox entry." });
    }
  },
);

export default userUploadInboxRouter;
