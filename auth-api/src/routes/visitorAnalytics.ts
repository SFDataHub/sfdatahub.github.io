import { Router } from "express";
import { randomUUID } from "crypto";
import { requireAdmin, requireUser, requireVisitorReader } from "../middleware/auth";
import { db } from "../firebase";
import { configRef, parseConfig, validDay } from "../internal/analytics/visitor/metrics";
import { refreshVisitorAnalyticsDetails } from "../internal/analytics/visitor/syncSnapshot.handler";

import { readVisitorSnapshot, invalidateVisitorReadCache } from "../internal/analytics/visitor/readSnapshot";
import { collectionTrackingStart } from "../internal/analytics/visitor/eventStats";

const router = Router();
router.get("/snapshot", requireUser, requireVisitorReader, async (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  return res.json(await readVisitorSnapshot());
});
router.use(requireUser, requireAdmin);
router.get("/config", async (_req, res) => {
  try {
    const data = (await configRef().get()).data();
    return res.json({ ...parseConfig(data), collectionTrackingStartedAt: collectionTrackingStart(data?.collectionTrackingStartedAt) });
  }
  catch { return res.status(500).json({ error: "Failed to read visitor configuration" }); }
});
router.put("/config", async (req, res) => {
  if (!validDay(req.body?.startDate) || typeof req.body?.sessionsVerified !== "boolean") return res.status(400).json({ error: "A valid Berlin start date and session verification are required" });
  if (req.body.collectionTrackingStartedAt !== undefined && req.body.collectionTrackingStartedAt !== null && !collectionTrackingStart(req.body.collectionTrackingStartedAt)) return res.status(400).json({ error: "A valid verified collection tracking timestamp or null is required" });
  if (req.body.legacyPublicClients !== undefined && typeof req.body.legacyPublicClients !== "boolean") return res.status(400).json({ error: "legacyPublicClients must be boolean" });
  try {
    const config = await db.runTransaction(async tx => {
      // Confirmation verifies tracker deployment and Sessions, not a later date.
      const previous = (await tx.get(configRef())).data();
      const trackingStart = collectionTrackingStart(req.body.collectionTrackingStartedAt === undefined ? previous?.collectionTrackingStartedAt : req.body.collectionTrackingStartedAt);
      const next = { ...(trackingStart ? { collectionTrackingStartedAt: trackingStart } : {}), startDate: req.body.startDate, sessionsVerified: req.body.sessionsVerified, collectionStartDate: req.body.sessionsVerified ? req.body.startDate : null, revision: randomUUID() };
      // Preserve lease and all other settings; an explicit null still clears the
      // optional tracking date without exposing private coordination in the API.
      const { collectionTrackingStartedAt: _tracking, ...retained } = previous ?? {};
      const compatibility = req.body.legacyPublicClients ?? previous?.legacyPublicClients;
      tx.set(configRef(), { ...retained, ...next, ...(compatibility !== undefined ? { legacyPublicClients: compatibility } : {}) });
      return next;
    });
    return res.json(config);
  } catch { return res.status(500).json({ error: "Failed to save visitor configuration" }); }
});
router.post("/refresh", async (_req, res) => {
  try { return res.json(await refreshVisitorAnalyticsDetails()); }
  catch { return res.status(500).json({ error: "Failed to refresh admin visitor details" }); }
  finally { invalidateVisitorReadCache(); }
});
export default router;
