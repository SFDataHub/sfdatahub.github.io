import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import adminRouter from "./routes/admin";
import authRouter from "./routes/auth";
import adminAccessControlRouter from "./routes/adminAccessControl";
import internalAdminRouter from "./routes/internalAdmin";
import scanUploadsRouter from "./routes/scanUploads";
import userUploadInboxRouter from "./routes/userUploadInbox";
import scanUploadsPublicRouter from "./routes/scanUploadsPublic";
import { latestDiscordNewsHandler } from "./public/news/discord/latest.handler";
import { listDiscordNewsHandler } from "./public/news/discord/list.handler";
import { latestDiscordNewsByChannelHandler } from "./public/news/discord/latestByChannel.handler";

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.use("/auth", authRouter);
app.use("/admin", adminRouter);
app.use("/admin/access-control", adminAccessControlRouter);
app.use("/internal", internalAdminRouter);
app.use("/internal/scan-uploads", scanUploadsRouter);
app.use("/", scanUploadsPublicRouter);
app.use("/user", userUploadInboxRouter);
app.get("/public/news/discord/latest", latestDiscordNewsHandler);
app.get("/public/news/discord/list", listDiscordNewsHandler);
app.get("/public/news/discord/latest-by-channel", latestDiscordNewsByChannelHandler);

app.get("/health", (_req, res) => {
  // Lightweight readiness probe for Cloud Run/Functions
  res.json({ ok: true });
});

export default app;
