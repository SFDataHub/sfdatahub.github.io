import type { Request, Response } from "express";

import {
  DISCORD_NEWS_BOT_TOKEN,
  DISCORD_NEWS_CACHE_TTL_SEC,
  DISCORD_NEWS_CHANNEL_IDS,
  DISCORD_NEWS_CORS_ORIGINS_LIST,
} from "../../../config";
import { getCachedValue, setCachedValue } from "./cache.memory";
import { DISCORD_NEWS_DEFAULT_TTL_SEC } from "./config";
import { applyDiscordNewsCors } from "./cors";
import { fetchDiscordNewsItemsForChannel } from "./discord.client";
import type { DiscordNewsItem, DiscordNewsListResponse } from "./types";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

const parseTtlSeconds = (
  value?: string,
  fallback = DISCORD_NEWS_DEFAULT_TTL_SEC,
): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const CHANNEL_ID_PATTERN = /^\d{17,20}$/;

const parseChannelIds = (value?: string): { valid: string[]; invalid: string[] } | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let entries: unknown[];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) return null;
      entries = parsed;
    } catch {
      return null;
    }
  } else {
    entries = trimmed.split(/[,\s]+/);
  }

  const valid: string[] = [];
  const invalid: string[] = [];

  for (const entry of entries) {
    if (typeof entry !== "string") {
      const raw = String(entry ?? "").trim();
      if (raw) invalid.push(raw);
      continue;
    }
    const id = entry.trim();
    if (!id) continue;
    if (CHANNEL_ID_PATTERN.test(id)) {
      valid.push(id);
    } else {
      invalid.push(id);
    }
  }

  return { valid, invalid };
};

const parseLimit = (value: unknown): number => {
  const parsed = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
};

export const listDiscordNewsHandler = async (req: Request, res: Response) => {
  const { allowed } = applyDiscordNewsCors(req, res, DISCORD_NEWS_CORS_ORIGINS_LIST);
  if (req.method === "OPTIONS") {
    if (!allowed) {
      return res.status(403).send();
    }
    return res.status(204).send();
  }
  if (!allowed) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(403).json({ error: "cors_not_allowed" });
  }
  if (req.method !== "GET") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const parsedChannelIds = parseChannelIds(DISCORD_NEWS_CHANNEL_IDS);
  if (!parsedChannelIds || parsedChannelIds.valid.length === 0) {
    console.error("[discord-news] Missing DISCORD_NEWS_CHANNEL_IDS configuration");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(500).json({ error: "missing_config" });
  }

  if (parsedChannelIds.invalid.length > 0) {
    parsedChannelIds.invalid.forEach((channelId) => {
      console.warn(`[discord-news] ch=${channelId} reason=invalidChannelIdFormat`);
    });
  }

  const channelIds = parsedChannelIds.valid;

  const token = DISCORD_NEWS_BOT_TOKEN;
  if (!token) {
    console.error("[discord-news] Missing DISCORD_NEWS_BOT_TOKEN configuration");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(500).json({ error: "missing_config" });
  }

  const ttlSeconds = parseTtlSeconds(
    DISCORD_NEWS_CACHE_TTL_SEC,
    DISCORD_NEWS_DEFAULT_TTL_SEC,
  );
  res.setHeader("Cache-Control", `public, max-age=${ttlSeconds}`);
  res.setHeader("Content-Type", "application/json; charset=utf-8");

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
