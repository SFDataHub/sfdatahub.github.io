import type { NextFunction, Request, Response } from "express";

import { SESSION_COOKIE_NAME, verifySessionToken } from "../session";

type SessionContext = {
  userId: string;
  roles: string[];
};

declare module "express-serve-static-core" {
  // Augment Express request with our session context
  interface Request {
    sessionUser?: SessionContext;
  }
}

const hasAdminRole = (roles: string[]): boolean => roles.includes("admin");
const hasModeratorRole = (roles: string[]): boolean =>
  hasAdminRole(roles) || roles.includes("mod");

export const requireModerator = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid session token" });
  }

  const roles = payload.roles ?? [];
  if (!hasModeratorRole(roles)) {
    return res.status(403).json({ error: "Missing or insufficient permissions." });
  }

  req.sessionUser = {
    userId: payload.userId,
    roles,
  };
  return next();
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const roles = req.sessionUser?.roles ?? [];
  if (!hasAdminRole(roles)) {
    return res.status(403).json({ error: "Admin access required." });
  }

  return next();
};
