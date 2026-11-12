import { createRequire } from "node:module";
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

// AuthAPI is CommonJS; load its shared validator through the CLI's ESM boundary.
const { isYouTubeSnapshot } = createRequire(import.meta.url)("../../auth-api/src/creators/types") as typeof import("../../auth-api/src/creators/types");

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

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

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
    throw new Error(`Upstream HTTP ${res.status}`);
  }
  return (await res.json()) as T;
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
  const fallback = sheetRowToCreator(row);
  const enriched = { ...fallback, ...previousCreators.find(c => c.id === fallback.id), platforms: fallback.platforms };
  let lastActive = enriched.lastActive;

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

let previousCreators: Creator[] = [];
async function centralYouTube() {
  const base = process.env.AUTH_BASE_URL || process.env.VITE_AUTH_BASE_URL;
  const token = process.env.UPLOAD_INBOX_TOKEN;
  if (!base || !token) throw new Error("Central creator sync requires AUTH_BASE_URL and UPLOAD_INBOX_TOKEN (server-side only).");
  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/, "")}/internal/creators/youtube/refresh-snapshot?videos=10`, {
      method: "POST", headers: { "x-internal-token": token }, signal: AbortSignal.timeout(230000),
    });
  } catch { throw new Error("Central creator synchronization is unreachable."); }
  if (!response.ok) throw new Error(`Central creator synchronization failed (HTTP ${response.status}). Existing snapshot retained.`);
  const payload = await response.json();
  if (!isYouTubeSnapshot(payload?.youtube)) throw new Error("Central YouTube snapshot is incomplete.");
  return payload.youtube as NonNullable<CreatorSnapshot["youtube"]>;
}
async function run() {
  const previous: CreatorSnapshot = JSON.parse(await fs.readFile(OUTPUT, "utf8"));
  previousCreators = previous.data;
  // A static export is not a YouTube refresh: use the actual central generator.
  const youtube = await centralYouTube();
  logStep(`Syncing ${sheetRows.length} creators`);
  const warnings: CreatorWarning[] = [];
  const counters = { youtubeLookups: youtube.requests, twitchLookups: 0 };
  const data: Creator[] = [];

  for (const row of sheetRows) {
    const enriched = await hydrateCreator(row, warnings, counters);
    data.push(enriched);
  }

  const snapshot: CreatorSnapshot = {
    generatedAt: new Date().toISOString(),
    data,
    youtube,
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
