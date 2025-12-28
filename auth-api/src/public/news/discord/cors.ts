import type { Request, Response } from "express";

const ALLOW_METHODS = "GET, OPTIONS";

type CorsResult = {
  allowed: boolean;
};

export const applyDiscordNewsCors = (
  req: Request,
  res: Response,
  allowedOrigins: string[],
): CorsResult => {
  const origin = req.headers.origin;
  if (!origin) {
    return { allowed: true };
  }
  if (!allowedOrigins.includes(origin)) {
    return { allowed: false };
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", ALLOW_METHODS);
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Vary", "Origin");
  return { allowed: true };
};
