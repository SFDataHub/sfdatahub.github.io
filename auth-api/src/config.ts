import dotenv from "dotenv";
import { defineSecret, defineString } from "firebase-functions/params";

export const IS_FUNCTIONS_RUNTIME = Boolean(process.env.K_SERVICE || process.env.FUNCTIONS_EMULATOR === "true");

if (!IS_FUNCTIONS_RUNTIME) {
  dotenv.config();
}

type Param = {
  value(): string | undefined;
};

const secrets = {
  DISCORD_CLIENT_SECRET: defineSecret("DISCORD_CLIENT_SECRET"),
  GOOGLE_CLIENT_SECRET: defineSecret("GOOGLE_CLIENT_SECRET"),
} as const;

const strings = {
  AUTH_JWT_SECRET: defineString("AUTH_JWT_SECRET"),
  PROJECT_ID: defineString("PROJECT_ID"),
  DISCORD_CLIENT_ID: defineString("DISCORD_CLIENT_ID"),
  DISCORD_REDIRECT_URI: defineString("DISCORD_REDIRECT_URI"),
  FRONTEND_BASE_URL: defineString("FRONTEND_BASE_URL"),
  SESSION_COOKIE_DOMAIN: defineString("SESSION_COOKIE_DOMAIN"),
  GOOGLE_CLIENT_ID: defineString("GOOGLE_CLIENT_ID"),
  GOOGLE_LINK_REDIRECT_URI: defineString("GOOGLE_LINK_REDIRECT_URI"),
} as const;

const readRuntimeValue = (key: string, param?: Param): string | undefined => {
  if (IS_FUNCTIONS_RUNTIME && param) {
    return param.value();
  }
  const value = process.env[key];
  return value && value.length > 0 ? value : undefined;
};

const requireValue = (key: string, param?: Param): string => {
  const value = readRuntimeValue(key, param);
  if (!value) {
    throw new Error(`[config] Missing required configuration: ${key}`);
  }
  return value;
};

export const PORT = Number(process.env.PORT ?? 4000);
export const AUTH_JWT_SECRET = requireValue("AUTH_JWT_SECRET", strings.AUTH_JWT_SECRET);
const resolveProjectId = (): string => {
  const explicit = readRuntimeValue("PROJECT_ID", strings.PROJECT_ID);
  const gcloudProject = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
  const projectId = explicit ?? gcloudProject;
  if (!projectId) {
    throw new Error("[config] Missing PROJECT_ID configuration");
  }
  return projectId;
};

export const PROJECT_ID = resolveProjectId();

export const DISCORD_CLIENT_ID = readRuntimeValue("DISCORD_CLIENT_ID", strings.DISCORD_CLIENT_ID);
export const DISCORD_CLIENT_SECRET = readRuntimeValue("DISCORD_CLIENT_SECRET", secrets.DISCORD_CLIENT_SECRET);
export const DISCORD_REDIRECT_URI = readRuntimeValue("DISCORD_REDIRECT_URI", strings.DISCORD_REDIRECT_URI);
export const FRONTEND_BASE_URL =
  readRuntimeValue("FRONTEND_BASE_URL", strings.FRONTEND_BASE_URL) ?? "http://localhost:5173";

// Optionale Cookie-Domain: explizit oder aus FRONTEND_BASE_URL abgeleitet (kein Domain-Flag für localhost/127.*)
const resolveCookieDomain = () => {
  const explicit = readRuntimeValue("SESSION_COOKIE_DOMAIN", strings.SESSION_COOKIE_DOMAIN);
  if (explicit) return explicit;
  try {
    const host = new URL(FRONTEND_BASE_URL).hostname;
    if (host === "localhost" || host.startsWith("127.")) {
      return undefined;
    }
    return `.${host}`;
  } catch {
    return undefined;
  }
};

export const SESSION_COOKIE_DOMAIN = resolveCookieDomain();
export const GOOGLE_CLIENT_ID = readRuntimeValue("GOOGLE_CLIENT_ID", strings.GOOGLE_CLIENT_ID);
export const GOOGLE_CLIENT_SECRET = readRuntimeValue("GOOGLE_CLIENT_SECRET", secrets.GOOGLE_CLIENT_SECRET);
export const GOOGLE_LINK_REDIRECT_URI = readRuntimeValue(
  "GOOGLE_LINK_REDIRECT_URI",
  strings.GOOGLE_LINK_REDIRECT_URI,
);
export const FUNCTION_SECRET_PARAMS = Object.values(secrets);
