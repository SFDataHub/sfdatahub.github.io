import type { Request, Response } from "express";
import { Router } from "express";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

import { accessGroupSeeds, featureAccessSeeds } from "../admin/accessSeeds";
import { UPLOAD_INBOX_BUCKET, UPLOAD_INBOX_TOKEN } from "../config";
import { admin, db } from "../firebase";

const INTERNAL_SEED_HEADER = "x-access-seed-token";
const INTERNAL_UPLOAD_INBOX_HEADER = "x-internal-token";
const UPLOAD_INBOX_BASE_PATH = "user-upload-inbox";

const internalAdminRouter = Router();

internalAdminRouter.post("/seed/access-control", async (req, res) => {
  const secret = process.env.ACCESS_SEED_TOKEN;
  if (!secret) {
    return res
      .status(500)
      .json({ ok: false, error: "ACCESS_SEED_TOKEN is not configured." });
  }

  const token = req.header(INTERNAL_SEED_HEADER);
  if (!token || token !== secret) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  let featureCount = 0;
  let groupCount = 0;

  try {
    for (const seed of featureAccessSeeds) {
      await db.collection("feature_access").doc(seed.id).set(seed, { merge: true });
      featureCount += 1;
    }

    for (const seed of accessGroupSeeds) {
      await db.collection("access_groups").doc(seed.id).set(seed, { merge: true });
      groupCount += 1;
    }

    return res.json({ ok: true, featureCount, groupCount });
  } catch (error) {
    console.error("[internalAdmin] Failed to seed access control", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to seed access control collections.",
      partial: { featureCount, groupCount },
    });
  }
});

const uploadInboxPayloadSchema = z.object({
  discordUserId: z.string().min(1),
  scanId: z.string().min(1),
  playersCount: z.number().int().min(0),
  guildsCount: z.number().int().min(0),
  playerIds: z.array(z.string()),
  guildIds: z.array(z.string()),
  server: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  playersCsvBase64: z
    .string()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  guildsCsvBase64: z
    .string()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

type UploadInboxAddPayload = z.infer<typeof uploadInboxPayloadSchema>;

const decodeBase64 = (value?: string) => {
  if (!value) return null;
  try {
    return Buffer.from(value, "base64");
  } catch (error) {
    return null;
  }
};

internalAdminRouter.post("/upload-inbox/add", async (req: Request, res: Response) => {
  try {
    const secret = UPLOAD_INBOX_TOKEN;
    if (!secret) {
      return res
        .status(500)
        .json({ ok: false, error: "UPLOAD_INBOX_TOKEN is not configured." });
    }

    const token = req.header(INTERNAL_UPLOAD_INBOX_HEADER);
    if (!token || token !== secret) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const parsed = uploadInboxPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.message });
    }
    const payload: UploadInboxAddPayload = parsed.data;

    const userDocId = `discord:${payload.discordUserId}`;
    const userRef = db.collection("users").doc(userDocId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res
        .status(404)
        .json({ ok: false, error: `User not found for discordUserId ${payload.discordUserId}` });
    }
    const userData = userSnap.data() as Record<string, unknown> | undefined;

    const bucket = admin.storage().bucket(UPLOAD_INBOX_BUCKET);
    let storagePathPlayers: string | null = null;
    let storagePathGuilds: string | null = null;

    if (payload.playersCsvBase64) {
      const buffer = decodeBase64(payload.playersCsvBase64);
      if (!buffer) {
        return res.status(400).json({ ok: false, error: "Invalid Base64 for playersCsvBase64" });
      }
      storagePathPlayers = `${UPLOAD_INBOX_BASE_PATH}/${userDocId}/${payload.scanId}/players.csv`;
      await bucket.file(storagePathPlayers).save(buffer, { contentType: "text/csv" });
    }

    if (payload.guildsCsvBase64) {
      const buffer = decodeBase64(payload.guildsCsvBase64);
      if (!buffer) {
        return res.status(400).json({ ok: false, error: "Invalid Base64 for guildsCsvBase64" });
      }
      storagePathGuilds = `${UPLOAD_INBOX_BASE_PATH}/${userDocId}/${payload.scanId}/guilds.csv`;
      await bucket.file(storagePathGuilds).save(buffer, { contentType: "text/csv" });
    }

    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(now.toMillis() + 7 * 24 * 60 * 60 * 1000);
    const inboxRef = userRef.collection("uploadInbox").doc(payload.scanId);
    const inboxSnap = await inboxRef.get();

    await inboxRef.set(
      {
        createdAt: now,
        downloadedAt: null,
        expiresAt,
        playersCount: payload.playersCount,
        guildsCount: payload.guildsCount,
        server: payload.server ?? null,
        source: payload.source ?? "discord",
        storagePathPlayers,
        storagePathGuilds,
        status: "ready",
      },
      { merge: false },
    );

    if (inboxSnap.exists) {
      console.warn(
        `[uploadInbox] Overwriting existing uploadInbox doc for user ${userDocId} and scan ${payload.scanId}`,
      );
    }

    const updateData: Record<string, FirebaseFirestore.FieldValue | unknown> = {
      "communityScans.totalScans": FieldValue.increment(1),
      "communityScans.totalPlayersUploaded": FieldValue.increment(payload.playersCount),
      "communityScans.totalGuildsUploaded": FieldValue.increment(payload.guildsCount),
    };
    if (payload.playerIds.length) {
      updateData["communityScans.uniquePlayerIds"] = FieldValue.arrayUnion(...payload.playerIds);
    } else if (!userData?.communityScans || !(userData as any).communityScans?.uniquePlayerIds) {
      updateData["communityScans.uniquePlayerIds"] = [];
    }
    if (payload.guildIds.length) {
      updateData["communityScans.uniqueGuildIds"] = FieldValue.arrayUnion(...payload.guildIds);
    } else if (!userData?.communityScans || !(userData as any).communityScans?.uniqueGuildIds) {
      updateData["communityScans.uniqueGuildIds"] = [];
    }
    await userRef.update(updateData);

    return res.json({
      ok: true,
      userId: userDocId,
      scanId: payload.scanId,
      inboxDocPath: `users/${userDocId}/uploadInbox/${payload.scanId}`,
    });
  } catch (error) {
    console.error("[uploadInbox] Failed to add upload inbox entry", error);
    return res.status(500).json({ ok: false, error: "Failed to add upload inbox entry." });
  }
});

export default internalAdminRouter;
