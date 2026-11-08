import { GOATCOUNTER_API_BASE_URL, GOATCOUNTER_API_TOKEN } from "../../../config";
import type { FetchRange, Hit } from "./metrics";

// stats/hits.count is a per-path session count, NOT a website unique total.
// Versioned v2 page events opt out individually; the fixed visitor event and
// existing normal page stream retain session detection. Never mix these streams.
// Contract: https://www.goatcounter.com/api.json and /help/js, /help/sessions.
export function createGoatCounterReader(): FetchRange {
  const token = GOATCOUNTER_API_TOKEN?.trim();
  if (!GOATCOUNTER_API_BASE_URL || !token) throw new Error("GoatCounter API is not configured");
  const base = new URL(GOATCOUNTER_API_BASE_URL.trim());
  base.pathname = base.pathname.replace(/(?:\/api\/v0)+\/?$/, "").replace(/\/+$/, "") + "/api/v0/";
  base.search = ""; base.hash = "";
  let lastRequest = 0, requests = 0;
  const deadline = Date.now() + 180000;
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  return async (start, end) => {
    const hits: Hit[] = [], seen = new Set<number>();
    for (let page = 0; page < 200; page++) {
      const endpoint = new URL("stats/hits", base);
      endpoint.searchParams.set("start", start);
      endpoint.searchParams.set("end", end);
      endpoint.searchParams.set("limit", "100");
      if (seen.size) endpoint.searchParams.set("exclude_paths", [...seen].join(","));
      // Never silently truncate or exceed the provider/request budget.
      if (endpoint.href.length > 14000) throw new Error("GoatCounter pagination URL limit reached");
      let response: Response | undefined;
      for (let attempt = 0; attempt <= 2; attempt++) {
        if (++requests > 240 || Date.now() > deadline) throw new Error("GoatCounter snapshot request budget exceeded");
        await pause(Math.max(0, 350 - (Date.now() - lastRequest)));
        lastRequest = Date.now();
        response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
        if (response.status !== 429 || attempt === 2) break;
        const retry = response.headers.get("retry-after");
        const seconds = retry === null ? NaN : Number(retry);
        const delay = Number.isFinite(seconds) ? seconds * 1000 : retry ? Date.parse(retry) - Date.now() : 1200 * (attempt + 1);
        await pause(Math.min(10000, Math.max(0, Number.isFinite(delay) ? delay : 1200)));
      }
      if (!response?.ok) throw new Error(`GoatCounter stats/hits failed (${response?.status})`);
      const payload = await response.json() as { hits?: unknown; more?: unknown };
      if (!Array.isArray(payload.hits) || typeof payload.more !== "boolean") throw new Error("Invalid GoatCounter hits response");
      for (const raw of payload.hits) {
        const row = raw as Hit;
        if (!row || typeof row.path !== "string" || typeof row.event !== "boolean" || !Number.isSafeInteger(row.path_id) || row.path_id < 1 || !Number.isSafeInteger(row.count) || row.count < 0 || seen.has(row.path_id)) throw new Error("Invalid or repeated GoatCounter path");
        seen.add(row.path_id); hits.push({ path: row.path, path_id: row.path_id, event: row.event, count: row.count });
      }
      if (!payload.more) return hits;
      if (!payload.hits.length) throw new Error("GoatCounter pagination made no progress");
    }
    throw new Error("GoatCounter pagination limit reached");
  };
}
