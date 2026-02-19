import type { Request, Response } from "express";

import {
  TWITCH_CHANNELS,
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  TWITCH_GAME_ID,
  TWITCH_LOG_FULL_RESPONSE,
} from "../../config";
import { getCachedValue, setCachedValue } from "./cache.memory";

const TWITCH_TOKEN_ENDPOINT = "https://id.twitch.tv/oauth2/token";
const TWITCH_STREAMS_ENDPOINT = "https://api.twitch.tv/helix/streams";
const LIVE_CACHE_TTL_MS = 180_000;
const TOKEN_REFRESH_BUFFER_MS = 60_000;

type TwitchTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

type TwitchStream = {
  id: string;
  user_login: string;
  user_name: string;
  title: string;
  viewer_count: number;
  started_at: string;
  thumbnail_url: string;
  game_id?: string;
  game_name?: string;
};

type TwitchStreamsResponse = {
  data: TwitchStream[];
};

type TwitchLiveResponse =
  | { live: false }
  | {
      live: true;
      items: Array<{
        channel: {
          login: string;
          displayName: string;
          url: string;
        };
        stream: {
          title: string;
          viewerCount: number;
          startedAt: string;
          thumbnailUrl: string;
        };
      }>;
    };

let cachedToken: { token: string; expiresAt: number } | null = null;

const parseChannels = (value?: string): { channels: string[]; invalid: string[] } | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const rawEntries = trimmed.split(/[,\s]+/);
  const channels: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const entry of rawEntries) {
    const login = entry.trim().toLowerCase();
    if (!login) continue;
    if (!/^[a-z0-9_]+$/.test(login)) {
      invalid.push(login);
      continue;
    }
    if (!seen.has(login)) {
      seen.add(login);
      channels.push(login);
    }
  }
  return { channels, invalid };
};

const getAppAccessToken = async (): Promise<string | null> => {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return null;
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + TOKEN_REFRESH_BUFFER_MS) {
    return cachedToken.token;
  }
  const body = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    client_secret: TWITCH_CLIENT_SECRET,
    grant_type: "client_credentials",
  });
  const res = await fetch(TWITCH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    console.error(`[twitch-live] token request failed status=${res.status}`);
    return null;
  }
  const payload = (await res.json()) as TwitchTokenResponse;
  if (!payload?.access_token || !payload?.expires_in) return null;
  cachedToken = {
    token: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };
  return cachedToken.token;
};

const renderThumbnail = (template?: string, width = 640, height = 360): string => {
  if (!template) return "";
  return template.replace("{width}", String(width)).replace("{height}", String(height));
};

const shouldLogFullResponse = (value?: string): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const isShakesAndFidget = (stream: TwitchStream): boolean => {
  if (TWITCH_GAME_ID) {
    return stream.game_id === TWITCH_GAME_ID;
  }
  return stream.game_name === "Shakes and Fidget";
};

const sortStreams = (streams: TwitchStream[]): TwitchStream[] =>
  streams.slice().sort((a, b) => b.viewer_count - a.viewer_count);

export const twitchLiveHandler = async (req: Request, res: Response) => {
  if (req.method !== "GET") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const parsed = parseChannels(TWITCH_CHANNELS);
  if (!parsed || parsed.channels.length === 0) {
    console.warn("[twitch-live] Missing TWITCH_CHANNELS configuration");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).json({ live: false } satisfies TwitchLiveResponse);
  }

  if (parsed.invalid.length > 0) {
    parsed.invalid.forEach((entry) => {
      console.warn(`[twitch-live] channel=${entry} reason=invalid_format`);
    });
  }

  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    console.error("[twitch-live] Missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET configuration");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(500).json({ error: "missing_config" });
  }

  const cacheKey = `live:${parsed.channels.slice().sort().join(",")}`;
  const cached = getCachedValue<TwitchLiveResponse>(cacheKey);
  res.setHeader("Cache-Control", `public, max-age=${Math.floor(LIVE_CACHE_TTL_MS / 1000)}`);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (cached) {
    return res.status(200).json(cached);
  }

  const token = await getAppAccessToken();
  if (!token) {
    return res.status(502).json({ error: "token_unavailable" });
  }

  const query = parsed.channels.map((login) => `user_login=${encodeURIComponent(login)}`).join("&");
  const response = await fetch(`${TWITCH_STREAMS_ENDPOINT}?${query}`, {
    headers: {
      "Client-ID": TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    console.error(`[twitch-live] stream request failed status=${response.status}`);
    return res.status(502).json({ error: "twitch_unavailable" });
  }

  const payload = (await response.json()) as TwitchStreamsResponse;
  if (shouldLogFullResponse(TWITCH_LOG_FULL_RESPONSE)) {
    const channelLabel = parsed.channels.join(",");
    console.log(
      `[twitch-live] helix/streams response ts=${new Date().toISOString()} channels=${channelLabel}\n${JSON.stringify(
        payload,
        null,
        2,
      )}`,
    );
  }
  const streams = Array.isArray(payload?.data) ? payload.data : [];
  const filtered = streams.filter(isShakesAndFidget);
  const sorted = sortStreams(filtered);

  const responseBody: TwitchLiveResponse =
    sorted.length > 0
      ? {
          live: true,
          items: sorted.map((stream) => ({
            channel: {
              login: stream.user_login,
              displayName: stream.user_name,
              url: `https://www.twitch.tv/${stream.user_login}`,
            },
            stream: {
              title: stream.title,
              viewerCount: stream.viewer_count,
              startedAt: stream.started_at,
              thumbnailUrl: renderThumbnail(stream.thumbnail_url),
            },
          })),
        }
      : { live: false };

  setCachedValue(cacheKey, responseBody, LIVE_CACHE_TTL_MS);
  return res.status(200).json(responseBody);
};
