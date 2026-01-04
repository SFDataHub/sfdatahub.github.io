import type { Request, Response } from "express";
import { createHash } from "crypto";

import {
  DISCORD_NEWS_BOT_TOKEN,
  DISCORD_NEWS_CHANNEL_IDS,
  DISCORD_NEWS_CHANNEL_LABELS,
  UPLOAD_INBOX_TOKEN,
} from "../../../config";
import { db } from "../../../firebase";
import { fetchDiscordNewsItemsForChannel } from "../../../public/news/discord/discord.client";
import type { DiscordNewsByChannelEntry, DiscordNewsItem } from "../../../public/news/discord/types";

const INTERNAL_HEADER = "x-internal-token";
const SNAPSHOT_COLLECTION = "stats_public";
const SNAPSHOT_DOC = "news_latestByChannel";
const UPDATE_INTERVAL_MS = 10 * 60 * 1000;
const CONTENT_TEXT_MAX = 600;

const parseChannelIds = (value?: string): string[] | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((entry) => String(entry)).filter((entry) => entry.length > 0);
  } catch {
    return null;
  }
};

const parseChannelLabels = (value?: string): Record<string, string> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.entries(parsed).reduce<Record<string, string>>((acc, [key, val]) => {
      const label = String(val ?? "").trim();
      if (label) acc[key] = label;
      return acc;
    }, {});
  } catch {
    return {};
  }
};

const selectLatestItem = (items: DiscordNewsItem[]): DiscordNewsItem | null => {
  return items.reduce<DiscordNewsItem | null>((latest, item) => {
    if (!latest) return item;
    return new Date(item.timestamp).getTime() > new Date(latest.timestamp).getTime()
      ? item
      : latest;
  }, null);
};

const truncateContent = (text: string): string => {
  if (text.length <= CONTENT_TEXT_MAX) return text;
  return text.slice(0, CONTENT_TEXT_MAX).trimEnd();
};

const normalizeItem = (item: DiscordNewsItem | null): DiscordNewsItem | null => {
  if (!item) return null;
  if (!item.contentText) return item;
  const contentText = truncateContent(item.contentText);
  if (contentText === item.contentText) return item;
  return {
    ...item,
    contentText,
  };
};

const buildHash = (items: DiscordNewsByChannelEntry[]): string => {
  const raw = items
    .map((entry) => `${entry.channelId}|${entry.item?.id ?? "-"}|${entry.item?.timestamp ?? "-"}`)
    .join("\n");
  return createHash("sha256").update(raw).digest("hex");
};

export const refreshDiscordNewsSnapshotHandler = async (req: Request, res: Response) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const secret = UPLOAD_INBOX_TOKEN;
  if (!secret) {
    return res.status(500).json({ error: "UPLOAD_INBOX_TOKEN is not configured." });
  }
  const token = req.header(INTERNAL_HEADER);
  if (!token || token !== secret) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const channelIds = parseChannelIds(DISCORD_NEWS_CHANNEL_IDS);
  if (!channelIds || channelIds.length === 0) {
    console.error("[news-snapshot] Missing DISCORD_NEWS_CHANNEL_IDS configuration");
    return res.status(500).json({ error: "missing_config" });
  }

  const botToken = DISCORD_NEWS_BOT_TOKEN;
  if (!botToken) {
    console.error("[news-snapshot] Missing DISCORD_NEWS_BOT_TOKEN configuration");
    return res.status(500).json({ error: "missing_config" });
  }

  const labels = parseChannelLabels(DISCORD_NEWS_CHANNEL_LABELS);
  const items = await Promise.all(
    channelIds.map(async (channelId) => {
      const channelItems = await fetchDiscordNewsItemsForChannel(channelId, botToken);
      const latestItem = selectLatestItem(channelItems);
      const entry: DiscordNewsByChannelEntry = {
        channelId,
        label: labels[channelId] ?? channelId,
        item: normalizeItem(latestItem),
      };
      return entry;
    }),
  );

  const hash = buildHash(items);
  const docRef = db.collection(SNAPSHOT_COLLECTION).doc(SNAPSHOT_DOC);
  const existingSnap = await docRef.get();
  const existingHash = existingSnap.exists ? (existingSnap.data() as any)?.hash : null;
  if (existingHash && existingHash === hash) {
    console.info(`[news-snapshot] unchanged=true hash=${hash}`);
    return res.status(200).json({
      unchanged: true,
      hash,
      updatedAt: (existingSnap.data() as any)?.updatedAt ?? null,
    });
  }

  const now = Date.now();
  await docRef.set(
    {
      updatedAt: now,
      nextUpdateAt: now + UPDATE_INTERVAL_MS,
      hash,
      items,
    },
    { merge: false },
  );

  console.info(`[news-snapshot] wrote hash=${hash} items=${items.length}`);
  return res.status(200).json({ ok: true, hash, updatedAt: now, items: items.length });
};
