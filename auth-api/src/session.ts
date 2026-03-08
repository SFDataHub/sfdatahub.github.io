import jwt from "jsonwebtoken";

import { AUTH_JWT_SECRET, FRONTEND_BASE_URL, SESSION_COOKIE_DOMAIN } from "./config";

export const SESSION_COOKIE_NAME = "sfdatahub_session";
export const REFRESH_COOKIE_NAME = "sfdatahub_refresh";
const SESSION_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 14 * 24 * 60 * 60;
const isLocalSessionEnv =
  FRONTEND_BASE_URL.includes("localhost") ||
  process.env.NODE_ENV === "development" ||
  process.env.FUNCTIONS_EMULATOR === "true";

interface SessionPayload {
  sub: string;
  roles: string[];
  tokenType: "access";
  exp?: number;
  iat?: number;
}

interface RefreshPayload {
  sub: string;
  roles: string[];
  rememberMe: boolean;
  tokenType: "refresh";
  exp?: number;
  iat?: number;
}

type SessionIdentity = {
  userId: string;
  roles: string[];
};

export function createSessionToken(identity: SessionIdentity): string {
  const payload: SessionPayload = {
    sub: identity.userId,
    roles: identity.roles,
    tokenType: "access",
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
    if (!decoded?.sub || decoded.tokenType !== "access") {
      return null;
    }
    return {
      userId: decoded.sub,
      roles: Array.isArray(decoded.roles)
        ? decoded.roles.filter((role): role is string => typeof role === "string")
        : [],
    };
  } catch {
    return null;
  }
}

export function createRefreshToken(identity: SessionIdentity, rememberMe: boolean): string {
  const payload: RefreshPayload = {
    sub: identity.userId,
    roles: identity.roles,
    rememberMe,
    tokenType: "refresh",
  };

  return jwt.sign(payload, AUTH_JWT_SECRET, {
    expiresIn: REFRESH_TTL_SECONDS,
  });
}

export function verifyRefreshToken(
  token: string,
): { userId: string; roles: string[]; rememberMe: boolean } | null {
  try {
    const decoded = jwt.verify(token, AUTH_JWT_SECRET) as RefreshPayload;
    if (!decoded?.sub || decoded.tokenType !== "refresh") {
      return null;
    }
    return {
      userId: decoded.sub,
      roles: Array.isArray(decoded.roles)
        ? decoded.roles.filter((role): role is string => typeof role === "string")
        : [],
      rememberMe: decoded.rememberMe === true,
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
  if (!isLocalSessionEnv && SESSION_COOKIE_DOMAIN) {
    parts.push(`Domain=${SESSION_COOKIE_DOMAIN}`);
  }
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

export function buildRefreshCookie(token: string, rememberMe: boolean): string {
  const extra = rememberMe ? [`Max-Age=${REFRESH_TTL_SECONDS}`] : [];
  return buildCookieParts(REFRESH_COOKIE_NAME, token, extra);
}

export function buildClearRefreshCookie(): string {
  return buildCookieParts(REFRESH_COOKIE_NAME, "", ["Max-Age=0"]);
}
