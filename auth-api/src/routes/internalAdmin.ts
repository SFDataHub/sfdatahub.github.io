import { Router } from "express";

import { accessGroupSeeds, featureAccessSeeds } from "../admin/accessSeeds";
import { db } from "../firebase";

const INTERNAL_SEED_HEADER = "x-access-seed-token";

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

export default internalAdminRouter;
