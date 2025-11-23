import jwt from "jsonwebtoken";

import { AUTH_JWT_SECRET, FRONTEND_BASE_URL } from "./config";
import type { UserDoc } from "./users";

export const SESSION_COOKIE_NAME = "sfdatahub_session";
const SESSION_TTL_SECONDS = 15 * 60;
const isLocalSessionEnv =
  FRONTEND_BASE_URL.includes("localhost") ||
  process.env.NODE_ENV === "development" ||
  process.env.FUNCTIONS_EMULATOR === "true";

interface SessionPayload {
  sub: string;
  roles: string[];
  exp?: number;
  iat?: number;
}

export function createSessionToken(user: UserDoc): string {
  const payload: SessionPayload = {
    sub: user.userId,
    roles: user.roles,
  };

  return jwt.sign(payload, AUTH_JWT_SECRET, {
    expiresIn: SESSION_TTL_SECONDS,
  });
}

export function verifySessionToken(
  token: string,
): { userId: string; roles: string[] } | null {
  try {
    const decoded = jwt.verify(token, AUTH_JWT_SECRET) as SessionPayload;
    if (!decoded?.sub) {
      return null;
    }
    return {
      userId: decoded.sub,
      roles: decoded.roles ?? [],
    };
  } catch {
    return null;
  }
}

const buildCookieParts = (name: string, value: string, extra: string[] = []) => {
  const sameSite = isLocalSessionEnv ? "Lax" : "None";
  const parts = [
    `${name}=${value}`,
    "HttpOnly",
    `SameSite=${sameSite}`,
    "Path=/",
    ...extra,
  ];
  if (!isLocalSessionEnv) {
    parts.push("Secure");
  }
  return parts.join("; ");
};

export function buildSessionCookie(token: string): string {
  return buildCookieParts(SESSION_COOKIE_NAME, token, [`Max-Age=${SESSION_TTL_SECONDS}`]);
}

export function buildClearSessionCookie(): string {
  return buildCookieParts(SESSION_COOKIE_NAME, "", ["Max-Age=0"]);
}
