import { Router, type Request, type Response } from "express";
import { UPLOAD_INBOX_TOKEN, YOUTUBE_API_KEY } from "../config";
import { requireAdmin, requireUser } from "../middleware/auth";
import { db } from "../firebase";
import { readYouTubeSnapshot, refreshYouTubeSnapshot } from "./service";
import { publicYouTubeCache } from "./publicSnapshot";
import { logYouTubeFailure, youtubeStorage } from "./errors";

const privateValues = () => [YOUTUBE_API_KEY, UPLOAD_INBOX_TOKEN].filter((value): value is string => Boolean(value));
// Old open clients validate at most three videos. Opt-in changes transport only;
// the one stored public snapshot always contains up to ten.
const responseSnapshot = (youtube: Awaited<ReturnType<typeof refreshYouTubeSnapshot>>, req: Request) => req.query.videos === "10" ? youtube :
  { ...youtube, channels: youtube.channels.map(channel => ({ ...channel, videos: channel.videos.slice(0, 3) })) };
export const creatorRouter = Router();
creatorRouter.get("/public/creators-live.json", async (req, res) => {
  try {
    const youtube = await readYouTubeSnapshot();
    if (!youtube) { res.setHeader("Cache-Control", "no-store"); return res.status(503).json({ error: "YOUTUBE_SNAPSHOT_MISSING" }); }
    const age = Math.max(0, Math.floor((publicYouTubeCache.expiresAt - Date.now()) / 1000));
    res.setHeader("Cache-Control", `public, max-age=${age}, s-maxage=${age}, must-revalidate`);
    return res.json({ generatedAt: youtube.generatedAt, youtube: responseSnapshot(youtube, req) });
  } catch (error) {
    logYouTubeFailure(error, { code: "YOUTUBE_SNAPSHOT_READ_FAILED", stage: "read_snapshot" }, privateValues());
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({ error: "YOUTUBE_SNAPSHOT_UNAVAILABLE" });
  }
});
function failedRefresh(error: unknown, res: Response, admin: boolean) {
  const diagnostic = logYouTubeFailure(error, undefined, privateValues());
  const busy = diagnostic.code === "YOUTUBE_SYNC_BUSY";
  res.setHeader("Cache-Control", "no-store");
  if (busy) res.setHeader("Retry-After", "5");
  return res.status(busy ? 409 : 503).json(admin ? { error: diagnostic.code, diagnostic } : { error: diagnostic.code });
}
async function refresh(req: Request, res: Response) {
  const admin = req.path.startsWith("/admin/");
  try {
    res.setHeader("Cache-Control", "no-store");
    const youtube = await refreshYouTubeSnapshot(admin);
    return res.json({ generatedAt: youtube.generatedAt, youtube: responseSnapshot(youtube, req) });
  } catch (error) { return failedRefresh(error, res, admin); }
}
creatorRouter.post("/admin/creators/youtube/refresh", requireUser, requireAdmin, async (req, res, next) => {
  // Confirm the current role/status as well as the signed session's role.
  try {
    const user = await youtubeStorage("ADMIN_CHECK_UNAVAILABLE", "verify_admin", () =>
      db.collection("users").doc(req.sessionUser!.userId).get());
    const data = user.data();
    if (!data?.roles?.includes("admin") || ["banned", "suspended"].includes(data.status)) return res.status(403).json({ error: "Admin access required." });
    return next();
  } catch (error) { return failedRefresh(error, res, true); }
}, refresh);
creatorRouter.post("/internal/creators/youtube/refresh-snapshot", (req, res, next) => {
  if (!UPLOAD_INBOX_TOKEN || req.header("x-internal-token") !== UPLOAD_INBOX_TOKEN) return res.status(401).json({ error: "Unauthorized" });
  return next();
}, refresh);
