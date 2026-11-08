import type { Request, Response } from "express";
import { createGoatCounterReader } from "./goatCounter";
import { publishMetrics } from "./metrics";

import { UPLOAD_INBOX_TOKEN } from "../../../config";
import { admin, db } from "../../../firebase";

const INTERNAL_HEADER = "x-internal-token";
const SNAPSHOT_COLLECTION = "analytics";
const SNAPSHOT_DOC = "visitor_analytics";
const TIMEZONE = "Europe/Berlin";
const TOP_LIMIT = 25;
const GUIDE_PREFIXES = ["/guidehub-v2", "/guidehub"];

type RangeKey = "today" | "last7d" | "last30d";

type DateRange = {
  startDate: string;
  endDate: string;
  startDateTime: string;
  endDateTime: string;
};

type GoatHit = {
  path: string;
  count: number;
};

type AggregatedPathHit = {
  path: string;
  basePath: string;
  count: number;
  tab: string | null;
  sub: string | null;
  sub2: string | null;
};

type SnapshotTopEntry = {
  path: string;
  count: number;
  type: string;
  identifier?: string;
  slug?: string;
};

type WindowSnapshotPayload = {
  startDate: string;
  endDate: string;
  visits: number;
};

type TotalAggregation = {
  range: DateRange;
  visits: number;
};

const berlinDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const berlinDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

const parseDateKey = (value: string): { year: number; month: number; day: number } | null => {
  const match = dateKeyPattern.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return { year, month, day };
};

const toDateKey = (date: Date): string => {
  const parts = berlinDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("[visitor-analytics] Failed to build timezone-aware date key");
  }
  return `${year}-${month}-${day}`;
};

const shiftDateKey = (dateKey: string, dayOffset: number): string => {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    throw new Error(`[visitor-analytics] Invalid date key: ${dateKey}`);
  }
  const shiftedUtc = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + dayOffset));
  const year = shiftedUtc.getUTCFullYear();
  const month = String(shiftedUtc.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shiftedUtc.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const extractDateTimeParts = (
  date: Date,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } => {
  const parts = berlinDateTimeFormatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const second = Number(parts.find((part) => part.type === "second")?.value);

  if (![year, month, day, hour, minute, second].every(Number.isFinite)) {
    throw new Error("[visitor-analytics] Failed to extract timezone-aware datetime parts");
  }

  return { year, month, day, hour, minute, second };
};

const getBerlinOffsetMsForInstant = (instant: Date): number => {
  const parts = extractDateTimeParts(instant);
  const berlinWallClockAsUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return berlinWallClockAsUtcMs - instant.getTime();
};

const berlinDateTimeToUtc = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date => {
  const utcGuessMs = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const firstOffsetMs = getBerlinOffsetMsForInstant(new Date(utcGuessMs));
  let resolvedUtcMs = utcGuessMs - firstOffsetMs;
  const secondOffsetMs = getBerlinOffsetMsForInstant(new Date(resolvedUtcMs));
  if (secondOffsetMs !== firstOffsetMs) {
    resolvedUtcMs = utcGuessMs - secondOffsetMs;
  }
  return new Date(resolvedUtcMs);
};

const toBerlinStartOfDayIso = (dateKey: string): string => {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    throw new Error(`[visitor-analytics] Invalid date key: ${dateKey}`);
  }
  return berlinDateTimeToUtc(parsed.year, parsed.month, parsed.day, 0, 0, 0).toISOString();
};

const normalizeBasePath = (pathName: string): string => {
  if (!pathName || pathName === "/") return "/";
  const ensured = pathName.startsWith("/") ? pathName : `/${pathName}`;
  return ensured.length > 1 ? ensured.replace(/\/+$/, "") : ensured;
};

const normalizePath = (rawPath: string): AggregatedPathHit | null => {
  const trimmed = rawPath.trim();
  if (!trimmed) return null;

  let parsedUrl: URL;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      parsedUrl = new URL(trimmed);
    } catch {
      return null;
    }
  } else {
    const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    try {
      parsedUrl = new URL(withLeadingSlash, "https://sfdatahub.invalid");
    } catch {
      return null;
    }
  }

  const basePath = normalizeBasePath(parsedUrl.pathname);
  const tab = parsedUrl.searchParams.get("tab");
  const sub = parsedUrl.searchParams.get("sub");
  const sub2 = parsedUrl.searchParams.get("sub2");

  const isGuidePath = GUIDE_PREFIXES.some(
    (prefix) => basePath === prefix || basePath.startsWith(`${prefix}/`),
  );

  let path = basePath;
  if (isGuidePath) {
    const search = new URLSearchParams();
    if (tab) search.set("tab", tab);
    if (sub) search.set("sub", sub);
    if (sub2) search.set("sub2", sub2);
    const query = search.toString();
    if (query.length > 0) {
      path = `${basePath}?${query}`;
    }
  }

  return {
    path,
    basePath,
    count: 0,
    tab,
    sub,
    sub2,
  };
};

const decodeSegment = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const aggregateHits = (hits: GoatHit[]): AggregatedPathHit[] => {
  const byPath = new Map<string, AggregatedPathHit>();

  for (const hit of hits) {
    const normalized = normalizePath(hit.path);
    if (!normalized) continue;

    const existing = byPath.get(normalized.path);
    if (existing) {
      existing.count += hit.count;
      continue;
    }

    byPath.set(normalized.path, {
      ...normalized,
      count: hit.count,
    });
  }

  return Array.from(byPath.values());
};

const sortTopEntries = (entries: SnapshotTopEntry[]): SnapshotTopEntry[] => {
  return entries
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.path.localeCompare(b.path);
    })
    .slice(0, TOP_LIMIT);
};

const buildTopPages = (hits: AggregatedPathHit[]): SnapshotTopEntry[] => {
  return sortTopEntries(hits.map((hit) => ({ path: hit.path, count: hit.count, type: "page" })));
};

const extractPlayerIdentifier = (basePath: string): string | null => {
  const shortRoute = /^\/player\/([^/]+)$/i.exec(basePath);
  if (shortRoute) return decodeSegment(shortRoute[1]);
  const profileRoute = /^\/players\/profile\/([^/]+)$/i.exec(basePath);
  if (profileRoute) return decodeSegment(profileRoute[1]);
  return null;
};

const extractGuildIdentifier = (basePath: string): string | null => {
  const shortRoute = /^\/guild\/([^/]+)$/i.exec(basePath);
  if (shortRoute) return decodeSegment(shortRoute[1]);
  const profileRoute = /^\/guilds\/profile\/([^/]+)$/i.exec(basePath);
  if (profileRoute) return decodeSegment(profileRoute[1]);
  return null;
};

const extractGuideSlug = (hit: AggregatedPathHit): string | null => {
  const matchedPrefix = GUIDE_PREFIXES.find(
    (prefix) => hit.basePath === prefix || hit.basePath.startsWith(`${prefix}/`),
  );
  if (!matchedPrefix) return null;

  const rest = hit.basePath.slice(matchedPrefix.length).replace(/^\/+/, "");
  if (rest.length > 0) {
    return decodeSegment(rest);
  }

  const querySegments = [hit.tab, hit.sub, hit.sub2].filter(
    (entry): entry is string => Boolean(entry && entry.trim().length > 0),
  );
  if (querySegments.length > 0) {
    return querySegments.join("/");
  }

  return null;
};

const buildTopPlayers = (hits: AggregatedPathHit[]): SnapshotTopEntry[] => {
  const entries: SnapshotTopEntry[] = [];
  for (const hit of hits) {
    const identifier = extractPlayerIdentifier(hit.basePath);
    if (!identifier) continue;
    entries.push({
      path: hit.path,
      count: hit.count,
      type: "player_profile",
      identifier,
    });
  }
  return sortTopEntries(entries);
};

const buildTopGuilds = (hits: AggregatedPathHit[]): SnapshotTopEntry[] => {
  const entries: SnapshotTopEntry[] = [];
  for (const hit of hits) {
    const identifier = extractGuildIdentifier(hit.basePath);
    if (!identifier) continue;
    entries.push({
      path: hit.path,
      count: hit.count,
      type: "guild_profile",
      identifier,
    });
  }
  return sortTopEntries(entries);
};

const buildTopGuides = (hits: AggregatedPathHit[]): SnapshotTopEntry[] => {
  const entries: SnapshotTopEntry[] = [];
  for (const hit of hits) {
    const slug = extractGuideSlug(hit);
    const isGuide = GUIDE_PREFIXES.some(
      (prefix) => hit.basePath === prefix || hit.basePath.startsWith(`${prefix}/`),
    );
    if (!isGuide) continue;
    entries.push({
      path: hit.path,
      count: hit.count,
      type: "guide",
      ...(slug ? { slug } : {}),
    });
  }
  return sortTopEntries(entries);
};

const buildDateRanges = (): Record<RangeKey, DateRange> => {
  const now = new Date();
  const nowDateTimeIso = now.toISOString();
  const today = toDateKey(now);
  const last7dStartDate = shiftDateKey(today, -6);
  const last30dStartDate = shiftDateKey(today, -29);

  return {
    today: {
      startDate: today,
      endDate: today,
      startDateTime: toBerlinStartOfDayIso(today),
      endDateTime: nowDateTimeIso,
    },
    last7d: {
      startDate: last7dStartDate,
      endDate: today,
      startDateTime: toBerlinStartOfDayIso(last7dStartDate),
      endDateTime: nowDateTimeIso,
    },
    last30d: {
      startDate: last30dStartDate,
      endDate: today,
      startDateTime: toBerlinStartOfDayIso(last30dStartDate),
      endDateTime: nowDateTimeIso,
    },
  };
};

const isAuthorized = (req: Request): boolean => {
  const secret = UPLOAD_INBOX_TOKEN;
  if (!secret) return false;
  const token = req.header(INTERNAL_HEADER);
  return Boolean(token && token === secret);
};

const toWindowPayload = (aggregation: TotalAggregation): WindowSnapshotPayload => ({
  startDate: aggregation.range.startDate,
  endDate: aggregation.range.endDate,
  visits: aggregation.visits,
});

export async function refreshVisitorAnalyticsDetails() {
    const read = createGoatCounterReader();
    const ranges = buildDateRanges();
    const fetchWindow = async (range: DateRange) => {
      const rows = (await read(range.startDateTime, range.endDateTime)).filter(hit => !hit.event);
      return { range, hits: aggregateHits(rows.map(hit => ({ path: hit.path, count: hit.count }))) };
    };
    const todayHits = await fetchWindow(ranges.today);
    const last7dHits = await fetchWindow(ranges.last7d);
    const last30dHits = await fetchWindow(ranges.last30d);
    const total = (window: typeof todayHits): TotalAggregation => ({ range: window.range, visits: window.hits.reduce((sum, hit) => sum + hit.count, 0) });
    const todayTotals = total(todayHits), last7dTotals = total(last7dHits), last30dTotals = total(last30dHits);
    const payload = {
      schemaVersion: 1,
      timezone: TIMEZONE,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
      totals: {
        today: toWindowPayload(todayTotals),
        last7d: toWindowPayload(last7dTotals),
        last30d: toWindowPayload(last30dTotals),
      },
      topPages: {
        last7d: buildTopPages(last7dHits.hits),
        last30d: buildTopPages(last30dHits.hits),
      },
      topPlayers: {
        last7d: buildTopPlayers(last7dHits.hits),
        last30d: buildTopPlayers(last30dHits.hits),
      },
      topGuilds: {
        last7d: buildTopGuilds(last7dHits.hits),
        last30d: buildTopGuilds(last30dHits.hits),
      },
      topGuides: {
        last7d: buildTopGuides(last7dHits.hits),
        last30d: buildTopGuides(last30dHits.hits),
      },
    };

    await db.collection(SNAPSHOT_COLLECTION).doc(SNAPSHOT_DOC).set(payload, { merge: false });

    return { ok: true, ...payload };
}

export const syncVisitorAnalyticsSnapshotHandler = async (req: Request, res: Response) => {
  if (!UPLOAD_INBOX_TOKEN) return res.status(500).json({ ok: false, error: "UPLOAD_INBOX_TOKEN is not configured." });
  if (!isAuthorized(req)) return res.status(401).json({ ok: false, error: "Unauthorized" });
  try {
    const result = await publishMetrics(createGoatCounterReader());
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[visitor-analytics] Failed to sync public snapshot", error);
    return res.status(500).json({ ok: false, error: "Failed to sync public visitor snapshot" });
  }
};
