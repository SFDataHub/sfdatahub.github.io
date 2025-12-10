import type { Request, Response } from "express";
import { Router } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { SCAN_UPLOAD_CSV_BUCKET, SCAN_UPLOAD_TOKEN } from "../config";
import { admin, db } from "../firebase";

const SCAN_UPLOAD_HEADER = "x-scan-upload-token";
const SCAN_UPLOAD_COLLECTION = "scan_uploads";
const STORAGE_BASE_PATH = "scans";

const formatTodayString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

type NormalizedRole = "admin" | "moderator" | "user";

const DAILY_SCAN_UPLOAD_LIMIT: Record<NormalizedRole, number> = {
  admin: Number.POSITIVE_INFINITY,
  moderator: 20,
  user: 5,
};

const normalizeRole = (userData: Record<string, unknown>): NormalizedRole => {
  const rawRole =
    typeof (userData as any).role === "string"
      ? ((userData as any).role as string).toLowerCase()
      : null;
  const rolesArray = Array.isArray((userData as any).roles)
    ? ((userData as any).roles as string[]).map((role) => role.toLowerCase())
    : [];

  if (rawRole === "admin" || rolesArray.includes("admin")) return "admin";
  if (
    rawRole === "moderator" ||
    rawRole === "mod" ||
    rolesArray.includes("moderator") ||
    rolesArray.includes("mod")
  ) {
    return "moderator";
  }
  return "user";
};

const resolveDailyLimit = (
  role: NormalizedRole,
  userData: Record<string, unknown>,
): number => {
  const explicit =
    (userData as any).dailyUploadLimit ?? (userData as any).scanUploadDailyLimit;
  const parsed = Number(explicit);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;

  const fallback = DAILY_SCAN_UPLOAD_LIMIT[role];
  if (Number.isFinite(fallback)) return fallback;
  return DAILY_SCAN_UPLOAD_LIMIT.user;
};

type QuotaSnapshot = {
  dailyLimit: number;
  remaining: number;
  totalToday: number;
  isToday: boolean;
};

const buildQuotaSnapshot = (
  userData: Record<string, unknown>,
  role: NormalizedRole,
  today: string,
): QuotaSnapshot => {
  const dailyLimit = resolveDailyLimit(role, userData);
  const lastUploadDate =
    typeof (userData as any).lastUploadDate === "string"
      ? ((userData as any).lastUploadDate as string)
      : null;
  const isToday = lastUploadDate === today;
  const remainingRaw = Number((userData as any).remainingUploads);
  const totalRaw = Number((userData as any).totalUploadsToday);

  const remaining = isToday && Number.isFinite(remainingRaw) ? remainingRaw : dailyLimit;
  const totalToday = isToday && Number.isFinite(totalRaw) ? totalRaw : 0;

  return {
    dailyLimit,
    remaining,
    totalToday,
    isToday,
  };
};

type QuotaReservation =
  | {
      ok: true;
      userId: string;
      role: NormalizedRole;
      applied: boolean;
      date: string;
      userRef: FirebaseFirestore.DocumentReference;
      remainingAfter?: number;
      totalAfter?: number;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

const reserveUploadQuotaForUser = async (
  discordUserId: string,
): Promise<QuotaReservation> => {
  const today = formatTodayString();
  const userId = `discord:${discordUserId}`;
  const userRef = db.collection("users").doc(userId);

  try {
    const reservation = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) {
        return {
          ok: false,
          status: 404,
          code: "user_not_found",
          message: `User not found for discordUserId ${discordUserId}`,
        } satisfies QuotaReservation;
      }

      const userData = (snap.data() ?? {}) as Record<string, unknown>;
      const role = normalizeRole(userData);
      const quota = buildQuotaSnapshot(userData, role, today);

      if (role === "admin") {
        const updatePayload: Record<string, unknown> = {
          lastUploadDate: today,
          totalUploadsToday: quota.totalToday + 1,
        };
        if (typeof (userData as any).role !== "string") {
          updatePayload.role = role;
        }
        tx.update(userRef, updatePayload);
        return {
          ok: true,
          userId,
          role,
          applied: false,
          date: today,
          userRef,
        } satisfies QuotaReservation;
      }

      if (!Number.isFinite(quota.dailyLimit)) {
        return {
          ok: false,
          status: 500,
          code: "invalid_quota",
          message: "User quota configuration is invalid.",
        } satisfies QuotaReservation;
      }

      if (quota.remaining <= 0) {
        return {
          ok: false,
          status: 429,
          code: "quota_exhausted",
          message:
            "Upload limit reached for today. Please try again tomorrow or contact an admin.",
        } satisfies QuotaReservation;
      }

      const remainingAfter = quota.remaining - 1;
      const totalAfter = quota.totalToday + 1;

      tx.update(userRef, {
        remainingUploads: remainingAfter,
        totalUploadsToday: totalAfter,
        lastUploadDate: today,
        dailyUploadLimit: quota.dailyLimit,
        role: typeof (userData as any).role === "string" ? (userData as any).role : role,
      });

      return {
        ok: true,
        userId,
        role,
        applied: true,
        remainingAfter,
        totalAfter,
        date: today,
        userRef,
      } satisfies QuotaReservation;
    });

    return reservation as QuotaReservation;
  } catch (error) {
    console.error("[scanUploads] Failed to reserve upload quota", { error, userId });
    return {
      ok: false,
      status: 500,
      code: "quota_check_failed",
      message: "Failed to check upload quota.",
    };
  }
};

const refundQuotaReservation = async (reservation: QuotaReservation) => {
  if (!reservation || !reservation.ok || !reservation.applied) return;

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(reservation.userRef);
      if (!snap.exists) return;

      const data = snap.data() ?? {};
      const lastUploadDate =
        typeof (data as any).lastUploadDate === "string"
          ? ((data as any).lastUploadDate as string)
          : null;
      if (lastUploadDate && lastUploadDate !== reservation.date) {
        return;
      }

      const remainingRaw = Number((data as any).remainingUploads);
      const totalRaw = Number((data as any).totalUploadsToday);
      const nextRemaining = Number.isFinite(remainingRaw) ? remainingRaw + 1 : 1;
      const nextTotal = Number.isFinite(totalRaw) && totalRaw > 0 ? totalRaw - 1 : 0;

      tx.update(reservation.userRef, {
        remainingUploads: nextRemaining,
        totalUploadsToday: nextTotal,
      });
    });
  } catch (error) {
    console.error("[scanUploads] Failed to refund quota reservation after upload error", {
      error,
      userId: reservation.userId,
    });
  }
};

const scanUploadSchema = z
  .object({
    source: z.string().min(1),
    queueId: z.string().min(1),
    discordUser: z
      .object({
        id: z.string().min(1).optional(),
        username: z.string().min(1).optional(),
      })
      .optional(),
    serverCode: z.string().min(1).optional(),
    playersCsv: z
      .string()
      .optional()
      .transform((value) => (value && value.trim().length > 0 ? value : undefined)),
    guildsCsv: z
      .string()
      .optional()
      .transform((value) => (value && value.trim().length > 0 ? value : undefined)),
  })
  .refine((value) => Boolean(value.playersCsv || value.guildsCsv), {
    message: "playersCsv or guildsCsv is required",
  });

type ScanUploadPayload = z.infer<typeof scanUploadSchema>;

const scanUploadsRouter = Router();

const toCsvBuffer = (value: string) => Buffer.from(value, "utf8");

scanUploadsRouter.post("/", async (req: Request, res: Response) => {
  const token = req.header(SCAN_UPLOAD_HEADER);
  if (!token || token !== SCAN_UPLOAD_TOKEN) {
    console.warn("[scanUploads] Unauthorized upload attempt", { hasToken: Boolean(token) });
    return res.status(401).json({ error: "unauthorized" });
  }

  const parsed = scanUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    console.warn("[scanUploads] Invalid payload", parsed.error.format());
    return res.status(400).json({ error: "invalid_payload", message: parsed.error.message });
  }
  const payload: ScanUploadPayload = parsed.data;

  const hasPlayersCsv = Boolean(payload.playersCsv);
  const hasGuildsCsv = Boolean(payload.guildsCsv);

  if (!payload.discordUser?.id) {
    console.warn("[scanUploads] Missing discordUser.id for quota check", {
      queueId: payload.queueId,
      source: payload.source,
    });
    return res.status(400).json({ error: "missing_user", message: "discordUser.id is required" });
  }

  const quotaReservation = await reserveUploadQuotaForUser(payload.discordUser.id);
  if (!quotaReservation.ok) {
    return res.status(quotaReservation.status).json({
      error: quotaReservation.code,
      message: quotaReservation.message,
    });
  }

  const scanDocRef = db.collection(SCAN_UPLOAD_COLLECTION).doc();
  const scanId = scanDocRef.id;
  try {
    await scanDocRef.set({
      scanId,
      source: payload.source,
      queueId: payload.queueId,
      discordUserId: payload.discordUser?.id ?? null,
      discordUsername: payload.discordUser?.username ?? null,
      serverCode: payload.serverCode ?? null,
      hasPlayersCsv,
      hasGuildsCsv,
      status: "pending",
      storagePaths: {
        playersCsv: null,
        guildsCsv: null,
      },
      uploadedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("[scanUploads] Failed to create scan_uploads doc", error);
    await refundQuotaReservation(quotaReservation);
    return res.status(500).json({ error: "firestore_write_failed" });
  }

  const bucket = admin.storage().bucket(SCAN_UPLOAD_CSV_BUCKET);
  let playersCsvPath: string | null = null;
  let guildsCsvPath: string | null = null;

  try {
    if (payload.playersCsv) {
      const path = `${STORAGE_BASE_PATH}/${scanId}/players.csv`;
      await bucket
        .file(path)
        .save(toCsvBuffer(payload.playersCsv), { contentType: "text/csv; charset=utf-8" });
      playersCsvPath = path;
    }
    if (payload.guildsCsv) {
      const path = `${STORAGE_BASE_PATH}/${scanId}/guilds.csv`;
      await bucket
        .file(path)
        .save(toCsvBuffer(payload.guildsCsv), { contentType: "text/csv; charset=utf-8" });
      guildsCsvPath = path;
    }

    await scanDocRef.update({
      storagePaths: {
        playersCsv: playersCsvPath,
        guildsCsv: guildsCsvPath,
      },
      status: "stored",
    });
  } catch (error) {
    console.error(`[scanUploads] Failed to store CSVs for scan ${scanId}`, error);
    const errorCode =
      !playersCsvPath && payload.playersCsv
        ? "players_csv_upload_failed"
        : !guildsCsvPath && payload.guildsCsv
          ? "guilds_csv_upload_failed"
          : "storage_upload_failed";
    await scanDocRef
      .update({
        status: "error",
        lastError: errorCode,
      })
      .catch((updateError) =>
        console.error(`[scanUploads] Failed to persist error status for ${scanId}`, updateError),
      );
    await refundQuotaReservation(quotaReservation);
    return res.status(500).json({ error: "storage_upload_failed" });
  }

  return res.status(201).json({
    scanId,
    queueId: payload.queueId,
    uploadedAt: new Date().toISOString(),
    hasPlayersCsv,
    hasGuildsCsv,
  });
});

export default scanUploadsRouter;
