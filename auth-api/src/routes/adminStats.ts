import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import { admin, db } from "../firebase";
import { requireAdmin, requireModerator } from "../middleware/auth";

const adminStatsRouter = Router();

adminStatsRouter.use(requireModerator);
adminStatsRouter.use(requireAdmin);

const classCountsSchema = z.record(z.string().min(1).max(64), z.number().int().min(0));
const classPercentsSchema = z.record(z.string().min(1).max(64), z.number().min(0).max(1));

const playerServerSnapshotSchema = z.object({
  sampleCount: z.number().int().min(0),
  avgLevel: z.number().finite().optional(),
  avgHonor: z.number().finite().optional(),
  avgTotalStats: z.number().finite().optional(),
  classCounts: classCountsSchema,
  classPercents: classPercentsSchema.optional(),
});

const guildServerSnapshotSchema = z.object({
  guildCount: z.number().int().min(0),
  avgMemberCount: z.number().finite().optional(),
});

const serverSnapshotSchema = z
  .object({
    players: playerServerSnapshotSchema.optional(),
    guilds: guildServerSnapshotSchema.optional(),
  })
  .refine((value) => Boolean(value.players || value.guilds), {
    message: "Each server entry must contain players and/or guilds data.",
  });

const buildServerOverviewSchema = z.object({
  schemaVersion: z.literal(1).optional(),
  monthKey: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  servers: z.record(z.string().min(1).max(64), serverSnapshotSchema),
});

adminStatsRouter.post("/server-overview/build", async (req: Request, res: Response) => {
  const parsed = buildServerOverviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  try {
    const payload = parsed.data;
    await db.collection("stats_public").doc("server_overview").set(
      {
        schemaVersion: 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(payload.monthKey ? { monthKey: payload.monthKey } : {}),
        servers: payload.servers,
      },
      { merge: false },
    );

    return res.json({
      ok: true,
      docPath: "stats_public/server_overview",
      schemaVersion: 1,
      monthKey: payload.monthKey ?? null,
      serverCount: Object.keys(payload.servers).length,
    });
  } catch (error) {
    console.error("[adminStats] Failed to build server overview snapshot", error);
    return res.status(500).json({ error: "Failed to build server overview snapshot" });
  }
});

export default adminStatsRouter;
