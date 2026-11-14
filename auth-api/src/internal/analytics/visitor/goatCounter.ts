import { GOATCOUNTER_API_BASE_URL, GOATCOUNTER_API_TOKEN } from "../../../config";
import type { FetchRange, Hit } from "./metrics";
import { normalizeToolName } from "./events";
import { digest } from "../../../storage/bundles";
import { VisitorContinuationPause, type VisitorJournal } from "./continuationState";
import { summarizeSizes, type SizeCounts } from "./screenSizes";

export type VisitorReader = FetchRange & { stats?: () => { requests: number; cacheHits: number; elapsedMs: number; persistedQueries?: number; reusedPages?: number }; sizes?: (start: string, end: string, pathIds: number[]) => Promise<SizeCounts | null> };

// stats/hits.count is a per-path session count, NOT a website unique total.
// Versioned v2 page events opt out individually; the fixed visitor event and
// existing normal page stream retain session detection. Never mix these streams.
// Contract: https://www.goatcounter.com/api.json and /help/js, /help/sessions.
export function createGoatCounterReader(options?: { journal: VisitorJournal; functionDeadline: number }): VisitorReader {
  const token = GOATCOUNTER_API_TOKEN?.trim();
  if (!GOATCOUNTER_API_BASE_URL || !token) throw new Error("GoatCounter API is not configured");
  const base = new URL(GOATCOUNTER_API_BASE_URL.trim());
  base.pathname = base.pathname.replace(/(?:\/api\/v0)+\/?$/, "").replace(/\/+$/, "") + "/api/v0/";
  base.search = ""; base.hash = "";
  let lastRequest = 0, requests = 0, cacheHits = 0, persistedQueries = 0, reusedPages = 0;
  const started = Date.now(), deadline = started + 180000;
  const assertBudget = () => { if (Date.now() >= deadline) throw new Error("GoatCounter snapshot time budget exceeded"); };
  const memo = async <T>(cache: Map<string, Promise<T>>, key: string, build: () => Promise<T>) => {
    assertBudget();
    const previous = cache.get(key);
    if (previous) { cacheHits++; return previous; }
    const result = build().catch(error => { cache.delete(key); throw error; });
    cache.set(key, result); return result;
  };
  const hitsCache = new Map<string, Promise<Hit[]>>(), sizesCache = new Map<string, Promise<SizeCounts | null>>();
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const request = async (endpoint: URL) => {
    if (endpoint.href.length > 14000) throw new Error("GoatCounter pagination URL limit reached");
    let response: Response | undefined;
    for (let attempt = 0; attempt <= 2; attempt++) {
      // Reserve the full 10s HTTP timeout and 20s for checkpoint/publication/
      // lease release. The original hard reader and Function bounds stay intact.
      if (options && (requests >= 232 || Date.now() + 30000 >= Math.min(deadline, options.functionDeadline))) throw new VisitorContinuationPause();
      assertBudget();
      if (requests >= 240) throw new Error("GoatCounter snapshot request budget exceeded");
      const wait = Math.max(0, 350 - (Date.now() - lastRequest));
      if (options && Date.now() + wait + 30000 >= Math.min(deadline, options.functionDeadline)) throw new VisitorContinuationPause();
      if (Date.now() + wait >= deadline) throw new Error("GoatCounter snapshot time budget exceeded");
      await pause(wait);
      assertBudget(); requests++;
      lastRequest = Date.now();
      response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(Math.max(1, Math.min(10000, deadline - Date.now()))) });
      if (response.status !== 429 || attempt === 2) break;
      const retry = response.headers.get("retry-after");
      const seconds = retry === null ? NaN : Number(retry);
      const delay = Number.isFinite(seconds) ? seconds * 1000 : retry ? Date.parse(retry) - Date.now() : 1200 * (attempt + 1);
      const backoff = Math.max(0, Number.isFinite(delay) ? delay : 1200);
      // Never retry earlier than Retry-After, or sleep past the shared deadline.
      if (backoff > 10000 || Date.now() + backoff >= deadline) throw new Error("GoatCounter Retry-After exceeds snapshot budget");
      await pause(backoff);
    }
    if (!response?.ok) throw new Error(`GoatCounter ${endpoint.pathname} failed (${response?.status})`);
    return response;
  };
  const read: VisitorReader = (start, end) => memo(hitsCache, JSON.stringify([start, end]), async () => {
    const key = digest(["hits", start, end]), saved = options?.journal.get(key);
    if (saved && saved.kind !== "hits") throw Error("Invalid visitor hits checkpoint");
    const hits: Hit[] = saved ? [...saved.rows] : [], seen = new Set(hits.map(row => row.path_id));
    if (saved) { reusedPages += saved.page; if (saved.done) { persistedQueries++; cacheHits++; return hits; } }
    for (let page = saved?.page ?? 0; page < 200; page++) {
      const endpoint = new URL("stats/hits", base);
      endpoint.searchParams.set("start", start);
      endpoint.searchParams.set("end", end);
      endpoint.searchParams.set("limit", "100");
      if (seen.size) endpoint.searchParams.set("exclude_paths", [...seen].join(","));
      // Never silently truncate or exceed the provider/request budget.
      if (endpoint.href.length > 14000) throw new Error("GoatCounter pagination URL limit reached");
      const response = await request(endpoint);
      const payload = await response.json() as { hits?: unknown; more?: unknown };
      if (!Array.isArray(payload.hits) || typeof payload.more !== "boolean") throw new Error("Invalid GoatCounter hits response");
      for (const raw of payload.hits) {
        const row = raw as Hit;
        if (!row || typeof row.path !== "string" || typeof row.event !== "boolean" || !Number.isSafeInteger(row.path_id) || row.path_id < 1 || !Number.isSafeInteger(row.count) || row.count < 0 || seen.has(row.path_id)) throw new Error("Invalid or repeated GoatCounter path");
        const title = normalizeToolName(row.title);
        seen.add(row.path_id); hits.push({ path: row.path, path_id: row.path_id, event: row.event, count: row.count, ...(title ? { title } : {}) });
      }
      if (payload.more && !payload.hits.length) throw new Error("GoatCounter pagination made no progress");
      await options?.journal.put(key, { kind: "hits", page: page + 1, done: !payload.more, rows: hits });
      if (!payload.more) { assertBudget(); return hits; }
    }
    throw new Error("GoatCounter pagination limit reached");
  });
  read.assertBudget = assertBudget;
  read.stats = () => ({ requests, cacheHits, persistedQueries, reusedPages, elapsedMs: Date.now() - started });
  read.sizes = (start, end, pathIds) => memo(sizesCache, JSON.stringify([start, end, [...new Set(pathIds)].sort((a, b) => a - b)]), async () => {
    if (!pathIds.length || pathIds.some(id => !Number.isSafeInteger(id) || id < 1)) throw new Error("Sizes require explicit valid page IDs");
    const key = digest(["sizes", start, end, [...new Set(pathIds)].sort((a, b) => a - b)]), saved = options?.journal.get(key);
    if (saved && saved.kind !== "sizes") throw Error("Invalid visitor sizes checkpoint");
    const rows: { id: string; count: number }[] = saved ? [...saved.rows] : [], seen = new Set(rows.map(row => row.id));
    if (saved) { reusedPages += saved.page; if (saved.done) { persistedQueries++; cacheHits++; return summarizeSizes(rows); } }
    for (let page = saved?.page ?? 0; page < 200; page++) {
      const endpoint = new URL("stats/sizes", base);
      for (const [key, value] of Object.entries({ start, end, limit: "100", offset: String(rows.length), include_paths: [...new Set(pathIds)].join(",") })) endpoint.searchParams.set(key, value);
      const response = await request(endpoint);
      const payload = await response.json() as { stats?: unknown; more?: unknown };
      if (!Array.isArray(payload.stats) || typeof payload.more !== "boolean") throw new Error("Invalid GoatCounter sizes response");
      for (const raw of payload.stats) {
        const row = raw as { id: string; count: number };
        if (!row || typeof row.id !== "string" || seen.has(row.id) || !Number.isSafeInteger(row.count) || row.count < 0) throw new Error("Invalid or repeated GoatCounter size");
        seen.add(row.id); rows.push({ id: row.id, count: row.count });
      }
      if (payload.more && !payload.stats.length) throw new Error("GoatCounter sizes pagination made no progress");
      // Validate complete native classes before persisting a reusable result.
      if (!payload.more) summarizeSizes(rows);
      await options?.journal.put(key, { kind: "sizes", page: page + 1, done: !payload.more, rows });
      if (!payload.more) { assertBudget(); return summarizeSizes(rows); }
    }
    throw new Error("GoatCounter sizes pagination limit reached");
  });
  return read;
}
