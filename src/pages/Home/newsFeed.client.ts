import type {
  DiscordByChannelResponse,
  DiscordLatestResponse,
  DiscordListResponse,
} from "./newsFeed.types";

const DEFAULT_TTL_MS = 120 * 1000;
const DEFAULT_RETRY_COUNT = 1;
const RETRY_DELAY_MS = 250;

let cached: DiscordLatestResponse | null = null;
let cachedAt = 0;
let inflight: Promise<DiscordLatestResponse | null> | null = null;
let listInflight: Promise<DiscordListResponse | null> | null = null;
let byChannelCached: DiscordByChannelResponse | null = null;
let byChannelCachedAt = 0;
let byChannelInflight: Promise<DiscordByChannelResponse | null> | null = null;

type FetchOptions = {
  ttlMs?: number;
  retryCount?: number;
};

export async function fetchLatestDiscordNews(
  url: string,
  options: FetchOptions = {}
): Promise<DiscordLatestResponse | null> {
  if (!url) return null;

  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();
  if (cached && now - cachedAt < ttlMs) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    const result = await fetchWithRetry(url, options.retryCount ?? DEFAULT_RETRY_COUNT);
    if (result) {
      cached = result;
      cachedAt = Date.now();
    }
    return result;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export async function fetchDiscordNewsByChannel(
  url: string,
  options: FetchOptions = {}
): Promise<DiscordByChannelResponse | null> {
  if (!url) return null;

  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();
  if (byChannelCached && now - byChannelCachedAt < ttlMs) return byChannelCached;
  if (byChannelInflight) return byChannelInflight;

  byChannelInflight = (async () => {
    const result = await fetchByChannelWithRetry(url, options.retryCount ?? DEFAULT_RETRY_COUNT);
    if (result) {
      byChannelCached = result;
      byChannelCachedAt = Date.now();
    }
    return result;
  })();

  try {
    return await byChannelInflight;
  } finally {
    byChannelInflight = null;
  }
}

export async function fetchRecentDiscordNews(
  latestUrl: string,
  limit = 5,
  options: FetchOptions = {}
): Promise<DiscordListResponse | null> {
  if (!latestUrl) return null;
  if (listInflight) return listInflight;

  const listUrl = buildListUrl(latestUrl, limit);
  listInflight = fetchListWithRetry(listUrl, options.retryCount ?? DEFAULT_RETRY_COUNT);
  try {
    return await listInflight;
  } finally {
    listInflight = null;
  }
}

async function fetchWithRetry(url: string, retryCount: number): Promise<DiscordLatestResponse | null> {
  let lastError: unknown = null;
  const attempts = Math.max(0, retryCount) + 1;

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as DiscordLatestResponse;
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  if (cached) return cached;
  if (lastError) throw lastError;
  return null;
}

async function fetchListWithRetry(
  url: string,
  retryCount: number
): Promise<DiscordListResponse | null> {
  let lastError: unknown = null;
  const attempts = Math.max(0, retryCount) + 1;

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as DiscordListResponse;
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  if (lastError) throw lastError;
  return null;
}

async function fetchByChannelWithRetry(
  url: string,
  retryCount: number
): Promise<DiscordByChannelResponse | null> {
  let lastError: unknown = null;
  const attempts = Math.max(0, retryCount) + 1;

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as DiscordByChannelResponse;
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  if (byChannelCached) return byChannelCached;
  if (lastError) throw lastError;
  return null;
}

function buildListUrl(latestUrl: string, limit: number): string {
  const url = new URL(latestUrl);
  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/latest")) {
    url.pathname = `${path.slice(0, -"/latest".length)}/list`;
  } else if (path.endsWith("/list")) {
    url.pathname = path;
  } else {
    url.pathname = `${path}/list`;
  }
  url.searchParams.set("limit", String(limit));
  return url.toString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
