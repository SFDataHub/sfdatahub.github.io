import type { Request, Response } from "express";
import { createHash } from "crypto";

import {
  DISCORD_NEWS_BOT_TOKEN,
  DISCORD_NEWS_CHANNEL_IDS,
  DISCORD_NEWS_CHANNEL_LABELS,
  UPLOAD_INBOX_TOKEN,
} from "../../../config";
import { db } from "../../../firebase";
import { fetchDiscordNewsItemsForChannelWithDiagnostics } from "../../../public/news/discord/discord.client";
import type { DiscordNewsByChannelEntry, DiscordNewsItem } from "../../../public/news/discord/types";

const INTERNAL_HEADER = "x-internal-token";
const SNAPSHOT_COLLECTION = "stats_public";
const SNAPSHOT_DOC = "news_latestByChannel";
const UPDATE_INTERVAL_MS = 10 * 60 * 1000;
const CONTENT_TEXT_MAX = 600;
const CHANNEL_ID_PATTERN = /^\d{17,20}$/;
const RECORD_ANNOUNCEMENTS_LIMIT = 5;

type DiscordRecordAnnouncementItem = {
  id: string;
  messageId: string;
  channelId: string;
  channelName: string;
  postedAt: string;
  content: string;
  author: string;
  imageUrl: string | null;
  jumpUrl: string;
};

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

const parseChannelLabels = (value?: string): Record<string, string> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.entries(parsed).reduce<Record<string, string>>((acc, [key, val]) => {
      const normalizedKey = String(key ?? "").trim();
      const label = String(val ?? "").trim();
      if (normalizedKey && label) acc[normalizedKey] = label;
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

const normalizeLabelToken = (value: string): string => {
  const cleaned = value.replace(/^#+/, "").trim();
  if (!cleaned) return "";
  const parts = cleaned.split(/[\s_-]+/).filter(Boolean);
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const extractLabelFromText = (value?: string | null): string | null => {
  if (!value) return null;
  const match = value.match(/#([a-z0-9][a-z0-9_-]{1,50})/i);
  if (!match) return null;
  const normalized = normalizeLabelToken(match[1]);
  return normalized || null;
};

const resolveLabel = (
  channelId: string,
  labels: Record<string, string>,
  item: DiscordNewsItem | null,
  debugEnabled: boolean,
): string => {
  const mapped = labels[channelId];
  if (mapped && mapped.trim().length > 0) {
    return mapped;
  }
  const fallback =
    (item ? extractLabelFromText(item.contentText) : null) ??
    (item ? extractLabelFromText(item.author) : null);
  if (debugEnabled) {
    const fallbackSource = fallback ? "metadata" : "channelId";
    console.warn(
      `[news-snapshot] missingLabelMapping channelId=${channelId} fallback=${fallbackSource}`,
    );
  }
  return fallback ?? channelId;
};

const isRecordChannelLabel = (label?: string): boolean => {
  if (!label) return false;
  const normalized = label
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /\brecords?\b/.test(normalized);
};

const splitChannelIdsByLabels = (
  channelIds: string[],
  labels: Record<string, string>,
): { newsChannelIds: string[]; recordChannelIds: string[] } => {
  const newsChannelIds: string[] = [];
  const recordChannelIds: string[] = [];

  for (const channelId of channelIds) {
    if (isRecordChannelLabel(labels[channelId])) {
      recordChannelIds.push(channelId);
      continue;
    }
    newsChannelIds.push(channelId);
  }

  return { newsChannelIds, recordChannelIds };
};

const toRecordAnnouncementItem = (
  item: DiscordNewsItem,
  channelName: string,
): DiscordRecordAnnouncementItem => {
  return {
    id: item.id,
    messageId: item.id,
    channelId: item.channelId,
    channelName,
    postedAt: item.timestamp,
    content: truncateContent(item.contentText),
    author: item.author,
    imageUrl: item.imageUrl,
    jumpUrl: item.jumpUrl,
  };
};

const buildLatestRecordAnnouncements = (
  entries: DiscordRecordAnnouncementItem[],
): { items: DiscordRecordAnnouncementItem[] } => {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime(),
  );
  return { items: sorted.slice(0, RECORD_ANNOUNCEMENTS_LIMIT) };
};

const buildHash = (
  items: DiscordNewsByChannelEntry[],
  recordAnnouncements: DiscordRecordAnnouncementItem[],
): string => {
  const newsRaw = items
    .map((entry) => `${entry.channelId}|${entry.item?.id ?? "-"}|${entry.item?.timestamp ?? "-"}`)
    .join("\n");
  const recordsRaw = recordAnnouncements
    .map(
      (entry) =>
        `${entry.channelId}|${entry.messageId}|${entry.postedAt}|${entry.content}|${entry.imageUrl ?? "-"}`,
    )
    .join("\n");
  return createHash("sha256").update(`${newsRaw}\n---\n${recordsRaw}`).digest("hex");
};

const hasLatestRecordAnnouncements = (value: unknown): boolean => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const latestRecordAnnouncements = (value as { latestRecordAnnouncements?: unknown })
    .latestRecordAnnouncements;
  if (!latestRecordAnnouncements || typeof latestRecordAnnouncements !== "object") return false;
  const items = (latestRecordAnnouncements as { items?: unknown }).items;
  return Array.isArray(items);
};

type SnapshotDiagnostics = {
  channelId: string;
  fetched: number;
  usable: number;
  picked: string | null;
  reason?: string;
  status?: number;
  errorBody?: string;
};

const logSnapshotDiagnostics = (diagnostics: SnapshotDiagnostics): void => {
  const picked = diagnostics.picked ?? "none";
  const statusText = diagnostics.status ? ` status=${diagnostics.status}` : "";
  const reasonText = diagnostics.reason ? ` reason=${diagnostics.reason}` : "";
  const bodyText = diagnostics.errorBody ? ` body="${diagnostics.errorBody}"` : "";
  const line = `[news-snapshot] ch=${diagnostics.channelId} fetched=${diagnostics.fetched} usable=${diagnostics.usable} picked=${picked}${statusText}${reasonText}${bodyText}`;
  if (diagnostics.reason) {
    console.warn(line);
  } else {
    console.info(line);
  }
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

  const debugKey = process.env.DISCORD_NEWS_DEBUG_KEY;
  const debugEnabled = Boolean(debugKey) && req.header("X-Admin-Key") === debugKey;

  const parsedChannelIds = parseChannelIds(DISCORD_NEWS_CHANNEL_IDS);
  if (!parsedChannelIds || (parsedChannelIds.valid.length === 0 && parsedChannelIds.invalid.length === 0)) {
    console.warn("[news-snapshot] Missing DISCORD_NEWS_CHANNEL_IDS configuration");
    return res.status(200).json({ skipped: true, reason: "missing_channel_ids" });
  }

  const botToken = DISCORD_NEWS_BOT_TOKEN;
  if (!botToken) {
    console.error("[news-snapshot] Missing DISCORD_NEWS_BOT_TOKEN configuration");
    return res.status(500).json({ error: "missing_config" });
  }

  const labels = parseChannelLabels(DISCORD_NEWS_CHANNEL_LABELS);
  const { newsChannelIds, recordChannelIds } = splitChannelIdsByLabels(parsedChannelIds.valid, labels);

  const invalidEntries: DiscordNewsByChannelEntry[] = parsedChannelIds.invalid.map((channelId) => {
    logSnapshotDiagnostics({
      channelId,
      fetched: 0,
      usable: 0,
      picked: null,
      reason: "invalidChannelIdFormat",
    });
    return {
      channelId,
      label: labels[channelId] ?? channelId,
      item: null,
    };
  });

  const validEntries = await Promise.all(
    newsChannelIds.map(async (channelId) => {
      const result = await fetchDiscordNewsItemsForChannelWithDiagnostics(channelId, botToken);
      const latestItem = selectLatestItem(result.items);
      logSnapshotDiagnostics({
        ...result.diagnostics,
        picked: latestItem?.id ?? null,
      });
      const entry: DiscordNewsByChannelEntry = {
        channelId,
        label: resolveLabel(channelId, labels, latestItem, debugEnabled),
        item: normalizeItem(latestItem),
      };
      return entry;
    }),
  );

  const items = [...invalidEntries, ...validEntries];

  const recordAnnouncements = (
    await Promise.all(
      recordChannelIds.map(async (channelId) => {
        const result = await fetchDiscordNewsItemsForChannelWithDiagnostics(channelId, botToken);
        const latestItem = selectLatestItem(result.items);
        logSnapshotDiagnostics({
          ...result.diagnostics,
          picked: latestItem?.id ?? null,
        });
        const channelName = labels[channelId] ?? channelId;
        return result.items.map((item) => toRecordAnnouncementItem(item, channelName));
      }),
    )
  ).flat();
  const latestRecordAnnouncements = buildLatestRecordAnnouncements(recordAnnouncements);

  const hash = buildHash(items, latestRecordAnnouncements.items);
  const docRef = db.collection(SNAPSHOT_COLLECTION).doc(SNAPSHOT_DOC);
  const existingSnap = await docRef.get();
  const existingData = existingSnap.exists ? existingSnap.data() : undefined;
  const existingHash = existingData && typeof existingData.hash === "string" ? existingData.hash : null;
  const hasRecordAnnouncements = hasLatestRecordAnnouncements(existingData);
  if (existingHash && existingHash === hash && hasRecordAnnouncements) {
    console.info(`[news-snapshot] unchanged=true hash=${hash}`);
    return res.status(200).json({
      unchanged: true,
      hash,
      updatedAt: existingData && typeof existingData.updatedAt === "number" ? existingData.updatedAt : null,
    });
  }

  const now = Date.now();
  await docRef.set(
    {
      updatedAt: now,
      nextUpdateAt: now + UPDATE_INTERVAL_MS,
      hash,
      items,
      latestRecordAnnouncements,
    },
    { merge: false },
  );

  console.info(`[news-snapshot] wrote hash=${hash} items=${items.length}`);
  return res.status(200).json({ ok: true, hash, updatedAt: now, items: items.length });
};
