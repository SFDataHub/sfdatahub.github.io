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
  DISCORD_NEWS_BOT_TOKEN: defineSecret("DISCORD_NEWS_BOT_TOKEN"),
  UPLOAD_INBOX_TOKEN: defineSecret("UPLOAD_INBOX_TOKEN"),
  SCAN_UPLOAD_TOKEN: defineSecret("SCAN_UPLOAD_TOKEN"),
  TWITCH_CLIENT_SECRET: defineSecret("TWITCH_CLIENT_SECRET"),
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
  UPLOAD_INBOX_BUCKET: defineString("UPLOAD_INBOX_BUCKET"),
  SCAN_UPLOAD_CSV_BUCKET: defineString("SCAN_UPLOAD_CSV_BUCKET"),
  TWITCH_CLIENT_ID: defineString("TWITCH_CLIENT_ID"),
  TWITCH_CHANNELS: defineString("TWITCH_CHANNELS"),
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
export const DISCORD_NEWS_BOT_TOKEN = readRuntimeValue(
  "DISCORD_NEWS_BOT_TOKEN",
  secrets.DISCORD_NEWS_BOT_TOKEN,
);
export const DISCORD_NEWS_CHANNEL_IDS = readRuntimeValue("DISCORD_NEWS_CHANNEL_IDS");
export const DISCORD_NEWS_CHANNEL_LABELS = readRuntimeValue(
  "DISCORD_NEWS_CHANNEL_LABELS",
);
export const DISCORD_NEWS_CACHE_TTL_SEC = readRuntimeValue(
  "DISCORD_NEWS_CACHE_TTL_SEC",
);
export const DISCORD_NEWS_CORS_ORIGINS = readRuntimeValue(
  "DISCORD_NEWS_CORS_ORIGINS",
);
export const TWITCH_CLIENT_ID = readRuntimeValue("TWITCH_CLIENT_ID", strings.TWITCH_CLIENT_ID);
export const TWITCH_CLIENT_SECRET = readRuntimeValue("TWITCH_CLIENT_SECRET", secrets.TWITCH_CLIENT_SECRET);
export const TWITCH_CHANNELS = readRuntimeValue("TWITCH_CHANNELS", strings.TWITCH_CHANNELS);

const DEFAULT_DISCORD_NEWS_CORS_ORIGINS = [
  "https://sfdatahub.github.io",
  "http://localhost:5173",
  "https://sfdatahub.com",
  "https://www.sfdatahub.com",
];

const parseCorsOrigins = (value?: string): string[] => {
  if (!value) return DEFAULT_DISCORD_NEWS_CORS_ORIGINS;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_DISCORD_NEWS_CORS_ORIGINS;
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const entries = parsed.map((entry) => String(entry).trim()).filter(Boolean);
        return entries.length > 0 ? entries : DEFAULT_DISCORD_NEWS_CORS_ORIGINS;
      }
    } catch {
      return DEFAULT_DISCORD_NEWS_CORS_ORIGINS;
    }
  }
  const entries = trimmed
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.length > 0 ? entries : DEFAULT_DISCORD_NEWS_CORS_ORIGINS;
};

export const DISCORD_NEWS_CORS_ORIGINS_LIST = parseCorsOrigins(DISCORD_NEWS_CORS_ORIGINS);
export const FRONTEND_BASE_URL =
  readRuntimeValue("FRONTEND_BASE_URL", strings.FRONTEND_BASE_URL) ?? "http://localhost:5173";
export const UPLOAD_INBOX_BUCKET = requireValue("UPLOAD_INBOX_BUCKET", strings.UPLOAD_INBOX_BUCKET);
export const UPLOAD_INBOX_TOKEN = requireValue("UPLOAD_INBOX_TOKEN", secrets.UPLOAD_INBOX_TOKEN);
export const SCAN_UPLOAD_CSV_BUCKET = requireValue(
  "SCAN_UPLOAD_CSV_BUCKET",
  strings.SCAN_UPLOAD_CSV_BUCKET,
);
export const SCAN_UPLOAD_TOKEN = requireValue("SCAN_UPLOAD_TOKEN", secrets.SCAN_UPLOAD_TOKEN);

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
