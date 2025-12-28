export const DISCORD_NEWS_DEFAULT_TTL_SEC = 120;
export const DISCORD_NEWS_DEFAULT_MAX_PER_CHANNEL = 5;
export const DISCORD_NEWS_USER_AGENT = "SFDataHub-NewsBot (https://sfdatahub.github.io, 1.0)";
export const DISCORD_NEWS_REQUEST_TIMEOUT_MS = 5000;

const readBooleanEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;
  return value.toLowerCase() === "true";
};

export const DISCORD_NEWS_MAX_PER_CHANNEL = (() => {
  const raw = Number(process.env.DISCORD_NEWS_MAX_PER_CHANNEL);
  if (!Number.isFinite(raw) || raw <= 0) return DISCORD_NEWS_DEFAULT_MAX_PER_CHANNEL;
  return Math.floor(raw);
})();

export const DISCORD_NEWS_ACCEPT_EMBED_ONLY = readBooleanEnv(
  process.env.DISCORD_NEWS_ACCEPT_EMBED_ONLY,
  true,
);
export const DISCORD_NEWS_ACCEPT_ATTACH_ONLY = readBooleanEnv(
  process.env.DISCORD_NEWS_ACCEPT_ATTACH_ONLY,
  true,
);

export const DISCORD_NEWS_DEBUG_KEY =
  process.env.DISCORD_NEWS_DEBUG_KEY && process.env.DISCORD_NEWS_DEBUG_KEY.length > 0
    ? process.env.DISCORD_NEWS_DEBUG_KEY
    : undefined;
