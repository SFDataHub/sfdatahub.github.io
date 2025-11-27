import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import adminRouter from "./routes/admin";
import authRouter from "./routes/auth";
import adminAccessControlRouter from "./routes/adminAccessControl";
import internalAdminRouter from "./routes/internalAdmin";

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

app.get("/health", (_req, res) => {
  // Lightweight readiness probe for Cloud Run/Functions
  res.json({ ok: true });
});

export default app;
