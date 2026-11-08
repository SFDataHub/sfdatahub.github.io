import { Router } from "express";
import { randomUUID } from "crypto";
import { requireAdmin, requireModerator } from "../middleware/auth";
import { db } from "../firebase";
import { berlinDay, configRef, parseConfig, shiftDay, validDay } from "../internal/analytics/visitor/metrics";
import { refreshVisitorAnalyticsDetails } from "../internal/analytics/visitor/syncSnapshot.handler";

const router = Router();
router.use(requireModerator, requireAdmin);
router.get("/config", async (_req, res) => {
  try { return res.json(parseConfig((await configRef().get()).data())); }
  catch { return res.status(500).json({ error: "Failed to read visitor configuration" }); }
});
router.put("/config", async (req, res) => {
  if (!validDay(req.body?.startDate) || typeof req.body?.sessionsVerified !== "boolean") return res.status(400).json({ error: "A valid Berlin start date and session verification are required" });
  try {
    const config = await db.runTransaction(async tx => {
      const previous = parseConfig((await tx.get(configRef())).data());
      // Activated only after the deployed tracker and Sessions setting have
      // been checked. Never pretend that the new measurements existed earlier.
      const next = { startDate: req.body.startDate, sessionsVerified: req.body.sessionsVerified, collectionStartDate: req.body.sessionsVerified && !previous.sessionsVerified ? shiftDay(berlinDay(new Date()), 1) : previous.collectionStartDate, revision: randomUUID() };
      tx.set(configRef(), next);
      return next;
    });
    return res.json(config);
  } catch { return res.status(500).json({ error: "Failed to save visitor configuration" }); }
});
router.post("/refresh", async (_req, res) => {
  try { return res.json(await refreshVisitorAnalyticsDetails()); }
  catch { return res.status(500).json({ error: "Failed to refresh admin visitor details" }); }
});
export default router;
