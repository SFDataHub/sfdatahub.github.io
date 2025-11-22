import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import authRouter from "./routes/auth";

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

app.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

export default app;
