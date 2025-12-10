import type { Request, Response } from "express";
import { Router } from "express";
import type { Timestamp } from "firebase-admin/firestore";

import { SCAN_UPLOAD_CSV_BUCKET } from "../config";
import { admin, db } from "../firebase";
import { requireUser } from "../middleware/auth";

type ScanUploadDoc = {
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

const SCAN_UPLOAD_COLLECTION = "scan_uploads";
const STORAGE_BASE_PATH = "scans";

const isAdmin = (roles: string[] = []) => roles.includes("admin");

const getDiscordIdFromUserId = (userId?: string) => {
  if (!userId) return null;
  const [provider, ...rest] = userId.split(":");
  if (provider !== "discord") return null;
  return rest.join(":") || null;
};

const resolveStoragePath = (
  doc: ScanUploadDoc,
  scanId: string,
  kind: "players" | "guilds",
): string => {
  const fromDoc =
    kind === "players" ? doc.storagePaths?.playersCsv : doc.storagePaths?.guildsCsv;
  if (fromDoc) return fromDoc;
  return `${STORAGE_BASE_PATH}/${scanId}/${kind}.csv`;
};

const createScanCsvHandler = (kind: "players" | "guilds") => {
  return async (req: Request, res: Response) => {
    const scanId = req.params.scanId;
    const sessionUser = req.sessionUser;
    if (!sessionUser) {
      return res.status(401).json({ error: "not_authenticated" });
    }

    try {
      const docRef = db.collection(SCAN_UPLOAD_COLLECTION).doc(scanId);
      const snap = await docRef.get();
      if (!snap.exists) {
        return res.status(404).json({ error: "scan_not_found" });
      }
      const data = snap.data() as ScanUploadDoc;

      const userRoles = sessionUser.roles ?? [];
      const userId = sessionUser.userId;
      const userDiscordId = getDiscordIdFromUserId(userId);
      const matchesOwner =
        (data.discordUserId && userDiscordId && data.discordUserId === userDiscordId) ||
        (data as any).userId === userId;
      if (!matchesOwner && !isAdmin(userRoles)) {
        return res.status(403).json({ error: "forbidden" });
      }

      const bucket = admin.storage().bucket(SCAN_UPLOAD_CSV_BUCKET);
      const filePath = resolveStoragePath(data, scanId, kind);
      const file = bucket.file(filePath);
      const [exists] = await file.exists();
      if (!exists) {
        return res.status(404).json({ error: "csv_not_found" });
      }

      console.log(
        `[scan-uploads] User ${userId} downloading ${kind} CSV for scan ${scanId} from ${filePath}`,
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${scanId}-${kind}.csv"`,
      );
      res.setHeader("Cache-Control", "private, max-age=60");

      const stream = file.createReadStream();
      stream.on("error", (err) => {
        console.error(
          `[scan-uploads] Failed to stream ${kind} CSV for scan ${scanId} from ${filePath}`,
          err,
        );
        if (!res.headersSent) {
          res.status(500).json({ error: "stream_error" });
        } else {
          res.end();
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error(
        `[scan-uploads] Unexpected error while serving ${kind} CSV for scan ${scanId}`,
        error,
      );
      return res.status(500).json({ error: "internal_error" });
    }
  };
};

const scanUploadsPublicRouter = Router();

scanUploadsPublicRouter.get(
  "/scan-uploads/:scanId/players.csv",
  requireUser,
  createScanCsvHandler("players"),
);

scanUploadsPublicRouter.get(
  "/scan-uploads/:scanId/guilds.csv",
  requireUser,
  createScanCsvHandler("guilds"),
);

export default scanUploadsPublicRouter;
