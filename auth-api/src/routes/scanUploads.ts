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

type UploadQuotaRoleOverride = {
  enabled?: boolean;
  dailyGuildLimit?: number;
  dailyPlayerLimit?: number;
};

type UploadQuotaConfig = {
  enabled?: boolean;
  dailyGuildLimit: number;
  dailyPlayerLimit: number;
  roles?: Record<string, UploadQuotaRoleOverride | undefined>;
};

const DEFAULT_UPLOAD_QUOTA: UploadQuotaConfig = {
  enabled: true,
  dailyGuildLimit: 9999,
  dailyPlayerLimit: 999999,
};

const parseNonNegativeNumber = (value: unknown): number | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
};

const loadUploadQuotaConfig = async (): Promise<UploadQuotaConfig> => {
  try {
    const snap = await db.collection("upload_quota_config").doc("default").get();
    if (!snap.exists) {
      console.warn("[scanUploads] Missing upload_quota_config/default, using defaults");
      return DEFAULT_UPLOAD_QUOTA;
    }
    const data = snap.data() ?? {};
    const maybeGuildLimit = parseNonNegativeNumber((data as any).dailyGuildLimit);
    const maybePlayerLimit = parseNonNegativeNumber((data as any).dailyPlayerLimit);
    const rolesRaw = (data as any).roles;
    const rolesParsed: UploadQuotaConfig["roles"] = {};
    if (rolesRaw && typeof rolesRaw === "object") {
      Object.entries(rolesRaw as Record<string, unknown>).forEach(([role, override]) => {
        if (!override || typeof override !== "object") return;
        const ov = override as Record<string, unknown>;
        const enabled = typeof ov.enabled === "boolean" ? ov.enabled : undefined;
        const guildLimit = parseNonNegativeNumber(ov.dailyGuildLimit);
        const playerLimit = parseNonNegativeNumber(ov.dailyPlayerLimit);
        const clean: UploadQuotaRoleOverride = {};
        if (enabled !== undefined) clean.enabled = enabled;
        if (guildLimit !== null) clean.dailyGuildLimit = guildLimit;
        if (playerLimit !== null) clean.dailyPlayerLimit = playerLimit;
        if (Object.keys(clean).length > 0) {
          rolesParsed[role.toLowerCase()] = clean;
        }
      });
    }

    const config: UploadQuotaConfig = {
      enabled: typeof (data as any).enabled === "boolean" ? (data as any).enabled : DEFAULT_UPLOAD_QUOTA.enabled,
      dailyGuildLimit: maybeGuildLimit ?? DEFAULT_UPLOAD_QUOTA.dailyGuildLimit,
      dailyPlayerLimit: maybePlayerLimit ?? DEFAULT_UPLOAD_QUOTA.dailyPlayerLimit,
    };
    if (Object.keys(rolesParsed).length > 0) {
      config.roles = rolesParsed;
    }
    return config;
  } catch (error) {
    console.error("[scanUploads] Failed to load upload quota config, using defaults", error);
    return DEFAULT_UPLOAD_QUOTA;
  }
};

const resolveQuotaLimitsForUser = (
  config: UploadQuotaConfig,
  userRoles: string[],
): { dailyGuildLimit: number; dailyPlayerLimit: number } => {
  const normalizedRoles = Array.isArray(userRoles)
    ? userRoles.filter((role): role is string => typeof role === "string" && role.length > 0).map((r) => r.toLowerCase())
    : [];

  for (const role of normalizedRoles) {
    const override = config.roles?.[role];
    if (!override || override.enabled === false) {
      continue;
    }
    return {
      dailyGuildLimit: override.dailyGuildLimit ?? config.dailyGuildLimit,
      dailyPlayerLimit: override.dailyPlayerLimit ?? config.dailyPlayerLimit,
    };
  }

  return {
    dailyGuildLimit: config.dailyGuildLimit,
    dailyPlayerLimit: config.dailyPlayerLimit,
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
      usage: {
        playersUsedToday: number;
        guildsUsedToday: number;
      };
      limits: {
        dailyGuildLimit: number;
        dailyPlayerLimit: number;
      };
      deltas: {
        players: number;
        guilds: number;
      };
      unlimited: {
        players: boolean;
        guilds: boolean;
      };
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

const reserveUploadQuotaForUser = async (
  discordUserId: string,
  playersDelta: number,
  guildsDelta: number,
): Promise<QuotaReservation> => {
  const today = formatTodayString();
  const userId = `discord:${discordUserId}`;
  const userRef = db.collection("users").doc(userId);
  const quotaConfig = await loadUploadQuotaConfig();
  const safePlayersDelta = Math.max(0, Number(playersDelta) || 0);
  const safeGuildsDelta = Math.max(0, Number(guildsDelta) || 0);

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
      const userRoles: string[] = Array.isArray((userData as any).roles)
        ? ((userData as any).roles as string[])
        : [];
      if (typeof (userData as any).role === "string") {
        userRoles.unshift((userData as any).role as string);
      }

      const limits = resolveQuotaLimitsForUser(quotaConfig, userRoles);
      const usage = ((userData as any).uploadCenter as any)?.usage ?? {};
      const lastDate = typeof usage?.date === "string" ? (usage.date as string) : null;
      const isToday = lastDate === today;
      const playersUsedToday = isToday ? Number(usage?.players ?? 0) || 0 : 0;
      const guildsUsedToday = isToday ? Number(usage?.guilds ?? 0) || 0 : 0;

      const isUnlimitedPlayers = !limits.dailyPlayerLimit || limits.dailyPlayerLimit <= 0;
      const isUnlimitedGuilds = !limits.dailyGuildLimit || limits.dailyGuildLimit <= 0;

      const nextPlayersUsed = playersUsedToday + safePlayersDelta;
      const nextGuildsUsed = guildsUsedToday + safeGuildsDelta;

      if (!isUnlimitedPlayers && limits.dailyPlayerLimit > 0 && nextPlayersUsed > limits.dailyPlayerLimit) {
        return {
          ok: false,
          status: 429,
          code: "quota_exhausted",
          message: "Player upload limit reached for today. Please try again tomorrow or contact an admin.",
        } satisfies QuotaReservation;
      }

      if (!isUnlimitedGuilds && limits.dailyGuildLimit > 0 && nextGuildsUsed > limits.dailyGuildLimit) {
        return {
          ok: false,
          status: 429,
          code: "quota_exhausted",
          message: "Guild upload limit reached for today. Please try again tomorrow or contact an admin.",
        } satisfies QuotaReservation;
      }

      tx.update(userRef, {
        uploadCenter: {
          ...((userData as any).uploadCenter ?? {}),
          usage: {
            date: today,
            players: nextPlayersUsed,
            guilds: nextGuildsUsed,
          },
        },
        role: typeof (userData as any).role === "string" ? (userData as any).role : role,
      });

      return {
        ok: true,
        userId,
        role,
        date: today,
        userRef,
        applied: true,
        usage: {
          playersUsedToday: nextPlayersUsed,
          guildsUsedToday: nextGuildsUsed,
        },
        limits: {
          dailyGuildLimit: limits.dailyGuildLimit,
          dailyPlayerLimit: limits.dailyPlayerLimit,
        },
        deltas: {
          players: safePlayersDelta,
          guilds: safeGuildsDelta,
        },
        unlimited: {
          players: isUnlimitedPlayers,
          guilds: isUnlimitedGuilds,
        },
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
      const usage = ((data as any).uploadCenter as any)?.usage ?? {};
      const lastDate = typeof usage?.date === "string" ? (usage.date as string) : null;
      if (lastDate && lastDate !== reservation.date) {
        return;
      }

      const playersUsed = Number(usage?.players ?? 0) || 0;
      const guildsUsed = Number(usage?.guilds ?? 0) || 0;
      const nextPlayers = Math.max(playersUsed - reservation.deltas.players, 0);
      const nextGuilds = Math.max(guildsUsed - reservation.deltas.guilds, 0);

      tx.update(reservation.userRef, {
        uploadCenter: {
          ...((data as any).uploadCenter ?? {}),
          usage: {
            date: reservation.date,
            players: nextPlayers,
            guilds: nextGuilds,
          },
        },
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
const countCsvRows = (csv?: string): number => {
  if (!csv) return 0;
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) return 0;
  return Math.max(lines.length - 1, 0);
};

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

  const playersDelta = countCsvRows(payload.playersCsv);
  const guildsDelta = countCsvRows(payload.guildsCsv);

  const quotaReservation = await reserveUploadQuotaForUser(
    payload.discordUser.id,
    playersDelta,
    guildsDelta,
  );
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
