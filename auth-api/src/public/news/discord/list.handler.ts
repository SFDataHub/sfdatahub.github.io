import type { Request, Response } from "express";

import {
  DISCORD_NEWS_BOT_TOKEN,
  DISCORD_NEWS_CACHE_TTL_SEC,
  DISCORD_NEWS_CHANNEL_IDS,
  DISCORD_NEWS_CORS_ORIGINS,
} from "../../../config";
import { getCachedValue, setCachedValue } from "./cache.memory";
import { DISCORD_NEWS_DEFAULT_TTL_SEC } from "./config";
import { fetchDiscordNewsItemsForChannel } from "./discord.client";
import type { DiscordNewsItem, DiscordNewsListResponse } from "./types";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

const parseJsonArray = (value?: string): string[] | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((entry) => String(entry)).filter((entry) => entry.length > 0);
  } catch {
    return null;
  }
};

const parseTtlSeconds = (
  value?: string,
  fallback = DISCORD_NEWS_DEFAULT_TTL_SEC,
): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const applyCors = (req: Request, res: Response, allowedOrigins: string[]): boolean => {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (!allowedOrigins.includes(origin)) {
    res.removeHeader("Access-Control-Allow-Origin");
    res.removeHeader("Access-Control-Allow-Credentials");
    return false;
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Vary", "Origin");
  return true;
};

const parseLimit = (value: unknown): number => {
  const parsed = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
};

export const listDiscordNewsHandler = async (req: Request, res: Response) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const allowedOrigins = parseJsonArray(DISCORD_NEWS_CORS_ORIGINS);
  if (!allowedOrigins || allowedOrigins.length === 0) {
    console.error("[discord-news] Missing DISCORD_NEWS_CORS_ORIGINS configuration");
    return res.status(500).json({ error: "missing_config" });
  }
  if (!applyCors(req, res, allowedOrigins)) {
    return res.status(403).json({ error: "cors_not_allowed" });
  }

  const channelIds = parseJsonArray(DISCORD_NEWS_CHANNEL_IDS);
  if (!channelIds || channelIds.length === 0) {
    console.error("[discord-news] Missing DISCORD_NEWS_CHANNEL_IDS configuration");
    return res.status(500).json({ error: "missing_config" });
  }

  const token = DISCORD_NEWS_BOT_TOKEN;
  if (!token) {
    console.error("[discord-news] Missing DISCORD_NEWS_BOT_TOKEN configuration");
    return res.status(500).json({ error: "missing_config" });
  }

  const ttlSeconds = parseTtlSeconds(
    DISCORD_NEWS_CACHE_TTL_SEC,
    DISCORD_NEWS_DEFAULT_TTL_SEC,
  );
  res.setHeader("Cache-Control", `public, max-age=${ttlSeconds}`);

  const limit = parseLimit(req.query.limit);
  const cacheKey = `list:${limit}:${channelIds.slice().sort().join(",")}`;
  const cached = getCachedValue<DiscordNewsListResponse>(cacheKey);
  if (cached) {
    return res.status(200).json(cached);
  }

  const perChannelItems = await Promise.all(
    channelIds.map((channelId) => fetchDiscordNewsItemsForChannel(channelId, token)),
  );
  const allItems = perChannelItems.flat();
  allItems.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const responseBody: DiscordNewsListResponse = {
    updatedAt: new Date().toISOString(),
    items: allItems.slice(0, limit),
  };

  setCachedValue(cacheKey, responseBody, ttlSeconds * 1000);

  return res.status(200).json(responseBody);
};
