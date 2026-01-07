import type {
  DiscordApiMessage,
  DiscordNewsChannelDiagnostics,
  DiscordNewsItem,
} from "./types";
import {
  DISCORD_NEWS_ACCEPT_ATTACH_ONLY,
  DISCORD_NEWS_ACCEPT_EMBED_ONLY,
  DISCORD_NEWS_MAX_PER_CHANNEL,
  DISCORD_NEWS_REQUEST_TIMEOUT_MS,
  DISCORD_NEWS_USER_AGENT,
} from "./config";

const DISCORD_API_BASE_URL = "https://discord.com/api/v10";

type FetchMessagesResult = {
  messages: DiscordApiMessage[] | null;
  failureReason?: string;
  status?: number;
  errorBody?: string;
};

const logNotice = (message: string) => {
  console.warn(`[discord-news] ${message}`);
};

const toSnippet = (value: string): string => {
  return value.replace(/\s+/g, " ").trim().slice(0, 200);
};

const cleanContentText = (value: string): string => {
  return value
    .replace(/<@!?\d+>/g, "@user")
    .replace(/<@&\d+>/g, "@role")
    .replace(/<#\d+>/g, "#channel")
    .replace(/<a?:\w+:\d+>/g, ":emoji:")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const MAX_EMBED_TEXT_LENGTH = 360;

const resolveContentText = (message: DiscordApiMessage): string => {
  const direct = message.content ?? "";
  if (direct.trim().length > 0) return cleanContentText(direct);
  for (const embed of message.embeds ?? []) {
    const embedText = embed.description ?? embed.title ?? "";
    if (embedText.trim().length > 0) {
      return cleanContentText(embedText);
    }
  }
  return "";
};

const resolveEmbedText = (message: DiscordApiMessage): string => {
  const embed = message.embeds?.[0];
  if (!embed) return "";
  const fieldValues = (embed.fields ?? [])
    .map((field) => field.value ?? "")
    .filter((value) => value.trim().length > 0);
  const parts = [embed.title, embed.description, ...fieldValues].filter(
    (value): value is string => Boolean(value && value.trim().length > 0),
  );
  if (parts.length === 0) return "";
  const combined = parts.join(" - ");
  return cleanContentText(combined).slice(0, MAX_EMBED_TEXT_LENGTH);
};

const resolveAttachmentImage = (message: DiscordApiMessage): {
  url: string | null;
  label: string;
} => {
  const attachments = message.attachments ?? [];
  for (const attachment of attachments) {
    const contentType = attachment.content_type ?? "";
    if (contentType.startsWith("image/")) {
      return { url: attachment.url, label: attachment.filename ?? "Image attachment" };
    }
    const name = attachment.filename ?? "";
    if (/\.(png|jpe?g|webp|gif)$/i.test(name)) {
      return { url: attachment.url, label: attachment.filename ?? "Image attachment" };
    }
    if (attachment.width && attachment.height) {
      return { url: attachment.url, label: attachment.filename ?? "Image attachment" };
    }
  }
  return { url: null, label: "" };
};

const fetchLatestDiscordMessages = async (
  channelId: string,
  token: string,
): Promise<FetchMessagesResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCORD_NEWS_REQUEST_TIMEOUT_MS);
  try {
    const encodedChannelId = encodeURIComponent(channelId);
    const response = await fetch(
      `${DISCORD_API_BASE_URL}/channels/${encodedChannelId}/messages?limit=${DISCORD_NEWS_MAX_PER_CHANNEL}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bot ${token}`,
          "User-Agent": DISCORD_NEWS_USER_AGENT,
          Accept: "application/json",
        },
        signal: controller.signal,
      },
    );

    const status = response.status;
    if (status !== 200) {
      const bodyText = toSnippet(await response.text());
      if (status === 401 || status === 403) {
        logNotice(
          `Auth error status=${status} channelId=${channelId}${bodyText ? ` body="${bodyText}"` : ""}`,
        );
        return { messages: null, failureReason: "authError", status, errorBody: bodyText || undefined };
      }
      if (status === 404) {
        logNotice(
          `Unknown channel channelId=${channelId}${bodyText ? ` body="${bodyText}"` : ""}`,
        );
        return {
          messages: null,
          failureReason: "unknownChannel",
          status,
          errorBody: bodyText || undefined,
        };
      }
      if (status === 429) {
        const retryAfter = response.headers.get("retry-after");
        logNotice(
          `Rate limited status=429 channelId=${channelId} retryAfter=${retryAfter ?? "unknown"}${bodyText ? ` body="${bodyText}"` : ""}`,
        );
        return {
          messages: null,
          failureReason: "rateLimited",
          status,
          errorBody: bodyText || undefined,
        };
      }
      logNotice(`HTTP ${status} channelId=${channelId} body="${bodyText}"`);
      return { messages: null, failureReason: "httpError", status, errorBody: bodyText || undefined };
    }

    const contentType = response.headers.get("content-type") ?? "";
    const rawBody = await response.text();
    if (!contentType.toLowerCase().includes("application/json")) {
      const snippet = toSnippet(rawBody);
      logNotice(`Non-JSON response status=${status} channelId=${channelId} body="${snippet}"`);
      return {
        messages: null,
        failureReason: "nonJson",
        status,
        errorBody: snippet || undefined,
      };
    }

    try {
      return { messages: JSON.parse(rawBody) as DiscordApiMessage[] };
    } catch {
      const snippet = toSnippet(rawBody);
      logNotice(
        `Failed to parse JSON status=${status} channelId=${channelId} body="${snippet}"`,
      );
      return {
        messages: null,
        failureReason: "parseFailed",
        status,
        errorBody: snippet || undefined,
      };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      logNotice(`Request timed out channelId=${channelId}`);
    } else {
      logNotice(
        `Request failed channelId=${channelId} error="${
          error instanceof Error ? error.message : "unknown"
        }"`,
      );
    }
    return { messages: null, failureReason: "requestFailed" };
  } finally {
    clearTimeout(timeout);
  }
};

const pickImageUrl = (message: DiscordApiMessage): string | null => {
  const attachments = message.attachments ?? [];
  for (const attachment of attachments) {
    const contentType = attachment.content_type ?? "";
    if (contentType.startsWith("image/")) return attachment.url;
    if (attachment.width && attachment.height) return attachment.url;
  }

  const embeds = message.embeds ?? [];
  for (const embed of embeds) {
    const embedUrl = embed.image?.url ?? embed.thumbnail?.url ?? null;
    if (embedUrl) return embedUrl;
  }

  return null;
};

const buildJumpUrl = (message: DiscordApiMessage): string => {
  const guildId = message.guild_id ?? "@me";
  return `https://discord.com/channels/${guildId}/${message.channel_id}/${message.id}`;
};

const buildNewsItem = (
  message: DiscordApiMessage,
  contentText: string,
  imageUrl: string | null,
): DiscordNewsItem | null => {
  const timestamp = message.timestamp;
  if (!message.id || !message.channel_id || !timestamp) {
    return null;
  }
  const author = message.author?.global_name || message.author?.username || "Unknown";
  return {
    id: message.id,
    channelId: message.channel_id,
    author,
    timestamp,
    contentText,
    imageUrl,
    jumpUrl: buildJumpUrl(message),
  };
};

const evaluateMessage = (
  message: DiscordApiMessage,
): {
  usable: boolean;
  reason?: string;
  contentText: string;
  imageUrl: string | null;
  source: "content" | "embed" | "attachment" | "none";
} => {
  if (typeof message.type === "number" && message.type !== 0) {
    return {
      usable: false,
      reason: "systemType",
      contentText: "",
      imageUrl: null,
      source: "none",
    };
  }

  const contentText = resolveContentText(message);
  if (contentText) {
    return {
      usable: true,
      contentText,
      imageUrl: pickImageUrl(message),
      source: "content",
    };
  }

  if (DISCORD_NEWS_ACCEPT_EMBED_ONLY) {
    const embedText = resolveEmbedText(message);
    if (embedText) {
      return {
        usable: true,
        contentText: embedText,
        imageUrl: pickImageUrl(message),
        source: "embed",
      };
    }
    const embedImage = pickImageUrl(message);
    if (embedImage) {
      return {
        usable: true,
        contentText: "Embed update",
        imageUrl: embedImage,
        source: "embed",
      };
    }
  }

  if (DISCORD_NEWS_ACCEPT_ATTACH_ONLY) {
    const attachment = resolveAttachmentImage(message);
    if (attachment.url) {
      return {
        usable: true,
        contentText: cleanContentText(attachment.label || "Image attachment"),
        imageUrl: attachment.url,
        source: "attachment",
      };
    }
  }

  if (!message.id || !message.channel_id || !message.timestamp) {
    return {
      usable: false,
      reason: "missingFields",
      contentText: "",
      imageUrl: null,
      source: "none",
    };
  }

  return {
    usable: false,
    reason: "noContent",
    contentText: "",
    imageUrl: null,
    source: "none",
  };
};

const pickLatestUsableMessage = (
  messages: DiscordApiMessage[],
): {
  message: DiscordApiMessage | null;
  usableCount: number;
  lastRejectedReason?: string;
  contentText: string;
  imageUrl: string | null;
  source: "content" | "embed" | "attachment" | "none";
} => {
  let usableCount = 0;
  let lastRejectedReason: string | undefined;
  let picked: DiscordApiMessage | null = null;
  let pickedContentText = "";
  let pickedImageUrl: string | null = null;
  let pickedSource: "content" | "embed" | "attachment" | "none" = "none";

  for (const message of messages) {
    const evaluation = evaluateMessage(message);
    if (!evaluation.usable) {
      lastRejectedReason = evaluation.reason;
      continue;
    }
    usableCount += 1;
    if (!picked) {
      picked = message;
      pickedContentText = evaluation.contentText;
      pickedImageUrl = evaluation.imageUrl;
      pickedSource = evaluation.source;
    }
  }

  return {
    message: picked,
    usableCount,
    lastRejectedReason,
    contentText: pickedContentText,
    imageUrl: pickedImageUrl,
    source: pickedSource,
  };
};

export const fetchLatestDiscordMessage = async (
  channelId: string,
  token: string,
): Promise<DiscordNewsItem | null> => {
  const result = await fetchLatestDiscordMessageWithDiagnostics(channelId, token);
  return result.item;
};

export const fetchLatestDiscordMessageWithDiagnostics = async (
  channelId: string,
  token: string,
): Promise<{ item: DiscordNewsItem | null; diagnostics: DiscordNewsChannelDiagnostics }> => {
  const { messages, failureReason } = await fetchLatestDiscordMessages(channelId, token);
  if (!messages) {
    const diagnostics: DiscordNewsChannelDiagnostics = {
      channelId,
      fetched: 0,
      usable: 0,
      picked: null,
      reason: failureReason ?? "fetchFailed",
    };
    logNotice(
      `ch=${channelId} fetched=0 usable=0 picked=none reason=${diagnostics.reason}`,
    );
    return { item: null, diagnostics };
  }

  const { message, usableCount, lastRejectedReason, contentText, imageUrl, source } =
    pickLatestUsableMessage(messages);

  const diagnostics: DiscordNewsChannelDiagnostics = {
    channelId,
    fetched: messages.length,
    usable: usableCount,
    picked: message?.id ?? null,
    reason: usableCount === 0 ? lastRejectedReason ?? "noUsable" : undefined,
    source: message ? source : "none",
  };

  logNotice(
    `ch=${channelId} fetched=${diagnostics.fetched} usable=${diagnostics.usable} picked=${
      diagnostics.picked ?? "none"
    }${diagnostics.reason ? ` reason=${diagnostics.reason}` : ""}`,
  );

  if (!message) {
    return { item: null, diagnostics };
  }

  const item = buildNewsItem(message, contentText, imageUrl);
  if (!item) {
    const fallbackDiagnostics: DiscordNewsChannelDiagnostics = {
      ...diagnostics,
      usable: 0,
      picked: null,
      reason: "missingFields",
      source: "none",
    };
    logNotice(
      `ch=${channelId} fetched=${fallbackDiagnostics.fetched} usable=0 picked=none reason=${fallbackDiagnostics.reason}`,
    );
    return { item: null, diagnostics: fallbackDiagnostics };
  }

  return { item, diagnostics };
};

export const fetchDiscordNewsItemsForChannelWithDiagnostics = async (
  channelId: string,
  token: string,
): Promise<{
  items: DiscordNewsItem[];
  diagnostics: {
    channelId: string;
    fetched: number;
    usable: number;
    reason?: string;
    status?: number;
    errorBody?: string;
  };
}> => {
  const { messages, failureReason, status, errorBody } = await fetchLatestDiscordMessages(
    channelId,
    token,
  );
  if (!messages) {
    return {
      items: [],
      diagnostics: {
        channelId,
        fetched: 0,
        usable: 0,
        reason: failureReason ?? "fetchFailed",
        status,
        errorBody,
      },
    };
  }

  const items: DiscordNewsItem[] = [];
  let usableCount = 0;
  let lastRejectedReason: string | undefined;

  for (const message of messages) {
    const evaluation = evaluateMessage(message);
    if (!evaluation.usable) {
      lastRejectedReason = evaluation.reason;
      continue;
    }
    const item = buildNewsItem(message, evaluation.contentText, evaluation.imageUrl);
    if (!item) {
      lastRejectedReason = "missingFields";
      continue;
    }
    usableCount += 1;
    items.push(item);
  }

  return {
    items,
    diagnostics: {
      channelId,
      fetched: messages.length,
      usable: usableCount,
      reason: usableCount === 0 ? lastRejectedReason ?? "noUsable" : undefined,
    },
  };
};

export const fetchDiscordNewsItemsForChannel = async (
  channelId: string,
  token: string,
): Promise<DiscordNewsItem[]> => {
  const { messages } = await fetchLatestDiscordMessages(channelId, token);
  if (!messages) return [];

  const items: DiscordNewsItem[] = [];
  for (const message of messages) {
    const evaluation = evaluateMessage(message);
    if (!evaluation.usable) {
      continue;
    }
    const item = buildNewsItem(message, evaluation.contentText, evaluation.imageUrl);
    if (item) {
      items.push(item);
    }
  }
  return items;
};
