import type { Request, Response } from "express";

import { GOATCOUNTER_API_BASE_URL, GOATCOUNTER_API_TOKEN, UPLOAD_INBOX_TOKEN } from "../../../config";
import { admin, db } from "../../../firebase";

const INTERNAL_HEADER = "x-internal-token";
const SNAPSHOT_COLLECTION = "analytics";
const SNAPSHOT_DOC = "visitor_analytics";
const TIMEZONE = "Europe/Berlin";
const TOP_LIMIT = 25;
const GUIDE_PREFIXES = ["/guidehub-v2", "/guidehub"];
const GOATCOUNTER_API_PREFIX = "/api/v0";
const GOATCOUNTER_MIN_REQUEST_GAP_MS = 350;
const GOATCOUNTER_MAX_RETRIES = 2;
const GOATCOUNTER_RETRY_FALLBACK_MS = 1200;
const GOATCOUNTER_RETRY_MAX_MS = 10000;

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

type WindowAggregation = {
  range: DateRange;
  hits: AggregatedPathHit[];
};

type TotalAggregation = {
  range: DateRange;
  visits: number;
};

type GoatCounterRequestContext = {
  lastRequestStartedAt: number;
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

const normalizeGoatCounterApiBaseUrl = (value: string): URL => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("GOATCOUNTER_API_BASE_URL is not configured");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("GOATCOUNTER_API_BASE_URL must be an absolute URL");
  }

  const canonicalPrefix = GOATCOUNTER_API_PREFIX.replace(/\/+$/, "");
  let normalizedPath = parsed.pathname.replace(/\/+$/, "");

  while (normalizedPath.endsWith(canonicalPrefix)) {
    normalizedPath = normalizedPath.slice(0, normalizedPath.length - canonicalPrefix.length);
  }
  if (!normalizedPath.startsWith("/")) {
    normalizedPath = `/${normalizedPath}`;
  }
  if (normalizedPath === "/") {
    normalizedPath = "";
  }

  parsed.pathname = `${normalizedPath}${canonicalPrefix}/`;
  parsed.search = "";
  parsed.hash = "";

  return parsed;
};

const buildGoatCounterEndpointUrl = (
  apiBaseUrl: URL,
  endpointPath: "stats/hits" | "stats/total",
  range: DateRange,
): URL => {
  const endpoint = new URL(endpointPath, apiBaseUrl);
  endpoint.searchParams.set("start", range.startDateTime);
  endpoint.searchParams.set("end", range.endDateTime);
  return endpoint;
};

const toErrorBodyPreview = (body: string): string => {
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.slice(0, 220);
};

const wait = async (ms: number): Promise<void> => {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const parseRetryAfterMs = (retryAfterHeader: string | null): number | null => {
  if (!retryAfterHeader) return null;
  const trimmed = retryAfterHeader.trim();
  if (!trimmed) return null;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.round(seconds * 1000), GOATCOUNTER_RETRY_MAX_MS);
  }

  const retryAt = Date.parse(trimmed);
  if (Number.isNaN(retryAt)) return null;

  const deltaMs = retryAt - Date.now();
  if (deltaMs <= 0) return 0;
  return Math.min(deltaMs, GOATCOUNTER_RETRY_MAX_MS);
};

const waitForGoatCounterGap = async (context: GoatCounterRequestContext): Promise<void> => {
  const elapsed = Date.now() - context.lastRequestStartedAt;
  const waitMs = GOATCOUNTER_MIN_REQUEST_GAP_MS - elapsed;
  if (waitMs > 0) {
    await wait(waitMs);
  }
  context.lastRequestStartedAt = Date.now();
};

const fetchGoatCounterJson = async (
  endpoint: URL,
  token: string,
  context: GoatCounterRequestContext,
): Promise<unknown> => {
  const endpointLabel = `${endpoint.origin}${endpoint.pathname}${endpoint.search}`;

  for (let attempt = 0; attempt <= GOATCOUNTER_MAX_RETRIES; attempt += 1) {
    await waitForGoatCounterGap(context);

    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (response.ok) {
      return (await response.json()) as unknown;
    }

    if (response.status === 429 && attempt < GOATCOUNTER_MAX_RETRIES) {
      const retryAfterMs =
        parseRetryAfterMs(response.headers.get("retry-after")) ??
        Math.min(
          GOATCOUNTER_RETRY_FALLBACK_MS * (attempt + 1),
          GOATCOUNTER_RETRY_MAX_MS,
        );

      console.warn(
        `[visitor-analytics] GoatCounter rate limited endpoint=${endpointLabel} status=429 attempt=${attempt + 1}/${GOATCOUNTER_MAX_RETRIES + 1} retryInMs=${retryAfterMs}`,
      );
      await wait(retryAfterMs);
      continue;
    }

    const bodyPreview = toErrorBodyPreview(await response.text());
    throw new Error(
      `[visitor-analytics] GoatCounter request failed endpoint=${endpointLabel} status=${response.status} body="${bodyPreview}"`,
    );
  }

  throw new Error(`[visitor-analytics] GoatCounter request exhausted retries endpoint=${endpointLabel}`);
};

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

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parsePathText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const extractRawHitEntries = (payload: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(payload)) {
    return payload.map((entry) => toRecord(entry)).filter(Boolean) as Array<Record<string, unknown>>;
  }

  const payloadRecord = toRecord(payload);
  if (!payloadRecord) return [];

  const listCandidates = [
    payloadRecord.hits,
    payloadRecord.items,
    payloadRecord.results,
    payloadRecord.data,
  ];

  for (const candidate of listCandidates) {
    if (Array.isArray(candidate)) {
      return candidate.map((entry) => toRecord(entry)).filter(Boolean) as Array<Record<string, unknown>>;
    }
    const maybeMap = toRecord(candidate);
    if (maybeMap) {
      const fromMap = Object.entries(maybeMap)
        .map(([path, count]) => ({ path, count }))
        .filter((entry) => parseNumber(entry.count) !== null);
      if (fromMap.length > 0) {
        return fromMap;
      }
    }
  }

  return [];
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

const toGoatHits = (payload: unknown): GoatHit[] => {
  const entries = extractRawHitEntries(payload);
  const hits: GoatHit[] = [];

  for (const entry of entries) {
    const path =
      parsePathText(entry.path) ??
      parsePathText(entry.url) ??
      parsePathText(entry.pathname) ??
      parsePathText(entry.page);
    const count =
      parseNumber(entry.count) ??
      parseNumber(entry.visits) ??
      parseNumber(entry.hits) ??
      parseNumber(entry.total) ??
      parseNumber(entry.n);

    if (!path || count === null || count <= 0) {
      continue;
    }

    hits.push({ path, count });
  }

  return hits;
};

const extractTotalVisits = (payload: unknown): number | null => {
  const direct = parseNumber(payload);
  if (direct !== null) return direct;

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const nested = extractTotalVisits(entry);
      if (nested !== null) return nested;
    }
    return null;
  }

  const record = toRecord(payload);
  if (!record) return null;

  const directCandidates = ["count", "total", "visits", "hits", "n"];
  for (const key of directCandidates) {
    const value = parseNumber(record[key]);
    if (value !== null) return value;
  }

  const nestedCandidates = ["total", "stats", "result", "data", "items"];
  for (const key of nestedCandidates) {
    const nested = extractTotalVisits(record[key]);
    if (nested !== null) return nested;
  }

  return null;
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

const fetchHitsForRange = async (
  apiBaseUrl: URL,
  token: string,
  range: DateRange,
  requestContext: GoatCounterRequestContext,
): Promise<WindowAggregation> => {
  const endpoint = buildGoatCounterEndpointUrl(apiBaseUrl, "stats/hits", range);
  const payload = await fetchGoatCounterJson(endpoint, token, requestContext);
  const hits = toGoatHits(payload);
  const aggregated = aggregateHits(hits);

  return {
    range,
    hits: aggregated,
  };
};

const fetchTotalForRange = async (
  apiBaseUrl: URL,
  token: string,
  range: DateRange,
  requestContext: GoatCounterRequestContext,
): Promise<TotalAggregation> => {
  const endpoint = buildGoatCounterEndpointUrl(apiBaseUrl, "stats/total", range);
  const payload = await fetchGoatCounterJson(endpoint, token, requestContext);
  const visits = extractTotalVisits(payload);
  if (visits === null) {
    throw new Error("[visitor-analytics] Unable to parse totals from GoatCounter stats/total response");
  }

  return {
    range,
    visits,
  };
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

const ensureConfig = (): { apiBaseUrl: URL; token: string } => {
  if (!GOATCOUNTER_API_BASE_URL || GOATCOUNTER_API_BASE_URL.trim().length === 0) {
    throw new Error("GOATCOUNTER_API_BASE_URL is not configured");
  }
  if (!GOATCOUNTER_API_TOKEN || GOATCOUNTER_API_TOKEN.trim().length === 0) {
    throw new Error("GOATCOUNTER_API_TOKEN is not configured");
  }

  return {
    apiBaseUrl: normalizeGoatCounterApiBaseUrl(GOATCOUNTER_API_BASE_URL),
    token: GOATCOUNTER_API_TOKEN,
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

export const syncVisitorAnalyticsSnapshotHandler = async (req: Request, res: Response) => {
  if (!UPLOAD_INBOX_TOKEN) {
    return res.status(500).json({ ok: false, error: "UPLOAD_INBOX_TOKEN is not configured." });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const { apiBaseUrl, token } = ensureConfig();
    const ranges = buildDateRanges();
    const requestContext: GoatCounterRequestContext = { lastRequestStartedAt: 0 };

    const todayTotals = await fetchTotalForRange(apiBaseUrl, token, ranges.today, requestContext);
    const last7dTotals = await fetchTotalForRange(apiBaseUrl, token, ranges.last7d, requestContext);
    const last30dTotals = await fetchTotalForRange(apiBaseUrl, token, ranges.last30d, requestContext);
    const last7dHits = await fetchHitsForRange(apiBaseUrl, token, ranges.last7d, requestContext);
    const last30dHits = await fetchHitsForRange(apiBaseUrl, token, ranges.last30d, requestContext);

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

    return res.json({
      ok: true,
      docPath: `${SNAPSHOT_COLLECTION}/${SNAPSHOT_DOC}`,
      timezone: TIMEZONE,
      totals: {
        today: todayTotals.visits,
        last7d: last7dTotals.visits,
        last30d: last30dTotals.visits,
      },
    });
  } catch (error) {
    console.error("[visitor-analytics] Failed to sync snapshot", error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to sync visitor analytics snapshot",
    });
  }
};
