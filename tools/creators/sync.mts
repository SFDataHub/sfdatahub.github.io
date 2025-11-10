import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sheetRows from "../../src/data/creatorSheet";
import {
  Creator,
  CreatorSnapshot,
  CreatorWarning,
  SheetCreatorRow,
  sheetRowToCreator,
} from "../../src/lib/creators/shared";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../");
const OUTPUT = path.join(ROOT, "public", "data", "creators-live.json");

async function loadEnvFile(filePath: string) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .forEach((line) => {
        const idx = line.indexOf("=");
        if (idx === -1) return;
        const key = line.slice(0, idx).trim();
        let val = line.slice(idx + 1).trim();
        if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = val;
      });
  } catch {}
}

// Load local env files (no external dependency required)
await loadEnvFile(path.join(ROOT, ".env.local"));
await loadEnvFile(path.join(ROOT, ".env"));

const YT_KEY = process.env.YOUTUBE_API_KEY;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

type Optional<T> = T | null | undefined;

interface YouTubeStats {
  channelId: string;
  subscribers?: number;
  totalViews?: number;
  lastUpload?: string;
}

interface TwitchStats {
  userId: string;
  totalViews?: number;
  lastActivity?: string;
}

function logStep(message: string) {
  process.stdout.write(`\n• ${message}`);
}

function warn(warnings: CreatorWarning[], warning: CreatorWarning) {
  warnings.push(warning);
  console.warn(`\n! ${warning.scope}: ${warning.message}`);
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} for ${url}\n${text}`);
  }
  return (await res.json()) as T;
}

function extractYouTubeLookup(url: string): Optional<{ type: string; value: string }> {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (err) {
    return null;
  }
  const pathname = parsed.pathname.replace(/\/+$/, "");
  if (pathname.includes("@")) {
    const at = pathname.lastIndexOf("@");
    const rest = pathname.substring(at + 1);
    const handle = rest.split("/")[0];
    return { type: "handle", value: handle };
  }
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length >= 2) {
    const [prefix, value] = parts;
    if (prefix === "channel") return { type: "channel", value };
    if (prefix === "user") return { type: "user", value };
    if (prefix === "c") return { type: "custom", value };
  }
  return null;
}

async function fetchYouTubeStats(url: string): Promise<YouTubeStats | null> {
  if (!YT_KEY) return null;
  const lookup = extractYouTubeLookup(url);
  if (!lookup) return null;

  async function getChannelById(id: string) {
    const data = await fetchJSON<any>(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${id}&key=${YT_KEY}`
    );
    return data.items?.[0];
  }

  async function getChannelByUsername(username: string) {
    const data = await fetchJSON<any>(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&forUsername=${encodeURIComponent(
        username
      )}&key=${YT_KEY}`
    );
    return data.items?.[0];
  }

  async function searchChannel(query: string) {
    const search = await fetchJSON<any>(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(
        query
      )}&maxResults=1&key=${YT_KEY}`
    );
    const channelId = search.items?.[0]?.snippet?.channelId;
    if (!channelId) return null;
    return getChannelById(channelId);
  }

  let channel: any = null;
  switch (lookup.type) {
    case "channel":
      channel = await getChannelById(lookup.value);
      break;
    case "user":
      channel = await getChannelByUsername(lookup.value);
      break;
    case "custom":
      channel = (await searchChannel(lookup.value)) || (await searchChannel(`@${lookup.value}`));
      break;
    case "handle":
      channel = await searchChannel(lookup.value.startsWith("@") ? lookup.value : `@${lookup.value}`);
      break;
    default:
      break;
  }

  // Last‑chance fallback: try search without @ if still missing
  if (!channel) {
    const plain = lookup.value.replace(/^@/, "");
    channel = await searchChannel(plain);
  }

  if (!channel) return null;

  const channelId: string = channel.id;
  const statistics = channel.statistics ?? {};
  const subscribers = statistics.hiddenSubscriberCount ? undefined : Number(statistics.subscriberCount ?? 0);
  const totalViews = Number(statistics.viewCount ?? 0);

  const latest = await fetchJSON<any>(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&type=video&maxResults=1&key=${YT_KEY}`
  );
  const lastUpload = latest.items?.[0]?.snippet?.publishedAt ?? channel.snippet?.publishedAt;

  return {
    channelId,
    subscribers: Number.isNaN(subscribers) ? undefined : subscribers,
    totalViews: Number.isNaN(totalViews) ? undefined : totalViews,
    lastUpload,
  };
}

let twitchToken: { token: string; expires: number } | null = null;

async function getTwitchAppToken(): Promise<string | null> {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return null;
  const now = Date.now();
  if (twitchToken && twitchToken.expires > now + 60_000) {
    return twitchToken.token;
  }
  const body = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    client_secret: TWITCH_CLIENT_SECRET,
    grant_type: "client_credentials",
  });
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twitch auth failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  twitchToken = {
    token: json.access_token,
    expires: now + (json.expires_in - 120) * 1000,
  };
  return twitchToken.token;
}

async function fetchTwitchStats(url: string): Promise<TwitchStats | null> {
  if (!url) return null;
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return null;

  const match = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
  if (!match) return null;
  const login = match[1].toLowerCase();
  const token = await getTwitchAppToken();
  if (!token) return null;

  const headers = {
    "Client-ID": TWITCH_CLIENT_ID,
    Authorization: `Bearer ${token}`,
  };

  const userRes = await fetchJSON<any>(`https://api.twitch.tv/helix/users?login=${login}`, { headers });
  const user = userRes.data?.[0];
  if (!user) return null;

  const userId = user.id as string;
  const totalViews = Number(user.view_count ?? 0);

  let lastActivity: string | undefined;
  const streams = await fetchJSON<any>(`https://api.twitch.tv/helix/streams?user_id=${userId}`, { headers });
  if (streams.data?.length) {
    lastActivity = streams.data[0].started_at;
  } else {
    const videos = await fetchJSON<any>(`https://api.twitch.tv/helix/videos?user_id=${userId}&first=1&sort=time`, {
      headers,
    });
    lastActivity = videos.data?.[0]?.published_at;
  }

  return {
    userId,
    totalViews: Number.isNaN(totalViews) ? undefined : totalViews,
    lastActivity,
  };
}

function mostRecent(current: string, candidate?: string | null): string {
  if (!candidate) return current;
  if (!current) return candidate;
  return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
}

async function hydrateCreator(
  row: SheetCreatorRow,
  warnings: CreatorWarning[],
  counters: { youtubeLookups: number; twitchLookups: number }
): Promise<Creator> {
  const enriched = sheetRowToCreator(row);
  let lastActive = enriched.lastActive;

  if (row.youtube) {
    if (!YT_KEY) {
      warn(warnings, {
        creator: row.name,
        scope: "youtube",
        level: "warning",
        message: "YOUTUBE_API_KEY missing, skipping YouTube stats",
      });
    } else {
      try {
        const stats = await fetchYouTubeStats(row.youtube);
        counters.youtubeLookups += 1;
        if (stats) {
          if (typeof stats.subscribers === "number") enriched.subscribers = Math.max(enriched.subscribers, stats.subscribers);
          if (typeof stats.totalViews === "number") enriched.totalViews = Math.max(enriched.totalViews, stats.totalViews);
          lastActive = mostRecent(lastActive, stats.lastUpload);
        } else {
          warn(warnings, {
            creator: row.name,
            scope: "youtube",
            level: "warning",
            message: "Could not resolve channel",
            source: row.youtube,
          });
        }
      } catch (err: any) {
        warn(warnings, {
          creator: row.name,
          scope: "youtube",
          level: "error",
          message: err?.message || "YouTube lookup failed",
          source: row.youtube,
        });
      }
    }
  }

  if (row.twitch) {
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
      warn(warnings, {
        creator: row.name,
        scope: "twitch",
        level: "warning",
        message: "Twitch credentials missing, skipping Twitch stats",
      });
    } else {
      try {
        const stats = await fetchTwitchStats(row.twitch);
        counters.twitchLookups += 1;
        if (stats) {
          if (typeof stats.totalViews === "number") {
            enriched.totalViews = Math.max(enriched.totalViews, stats.totalViews);
          }
          lastActive = mostRecent(lastActive, stats.lastActivity);
        } else {
          warn(warnings, {
            creator: row.name,
            scope: "twitch",
            level: "warning",
            message: "Could not resolve Twitch channel",
            source: row.twitch,
          });
        }
      } catch (err: any) {
        warn(warnings, {
          creator: row.name,
          scope: "twitch",
          level: "error",
          message: err?.message || "Twitch lookup failed",
          source: row.twitch,
        });
      }
    }
  }

  enriched.lastActive = lastActive;
  return enriched;
}

async function run() {
  logStep(`Syncing ${sheetRows.length} creators`);
  const warnings: CreatorWarning[] = [];
  const counters = { youtubeLookups: 0, twitchLookups: 0 };
  const data: Creator[] = [];

  for (const row of sheetRows) {
    const enriched = await hydrateCreator(row, warnings, counters);
    data.push(enriched);
  }

  const snapshot: CreatorSnapshot = {
    generatedAt: new Date().toISOString(),
    data,
    warnings,
    stats: counters,
  };

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, JSON.stringify(snapshot, null, 2));

  logStep(`Snapshot written to ${OUTPUT}`);
}

run().catch((err) => {
  console.error("\nCreator sync failed", err);
  process.exitCode = 1;
});
