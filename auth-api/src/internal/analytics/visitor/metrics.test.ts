import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

const state = vi.hoisted(() => ({ store: new Map<string, any>(), writes: [] as string[] }));
vi.mock("../../../firebase", () => {
  const ref = (path: string): any => ({
    path, collection: (name: string) => collection(path + "/" + name),
    get: async () => ({ exists: state.store.has(path), data: () => state.store.get(path) }),
    set: async (data: unknown) => { state.writes.push(path); state.store.set(path, data); },
  });
  const collection = (path: string): any => ({
    doc: (id: string) => ref(path + "/" + id),
    where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }),
  });
  return { admin: { firestore: { FieldValue: { serverTimestamp: () => null } } }, db: {
    collection,
    batch: () => { const pending: Array<() => Promise<void>> = []; return { set: (r: any, value: any) => pending.push(() => r.set(value)), commit: async () => { for (const write of pending) await write(); } }; },
    runTransaction: (work: any) => work({ get: (r: any) => r.get(), set: (r: any, value: any) => r.set(value), delete: (r: any) => state.store.delete(r.path) }),
    recursiveDelete: async () => {},
  } };
});
vi.mock("../../../config", () => ({ GOATCOUNTER_API_BASE_URL: "https://test.goatcounter.com/api/v0/api/v0/", GOATCOUNTER_API_TOKEN: "private-test-key", UPLOAD_INBOX_TOKEN: "private-internal", AUTH_JWT_SECRET: "private-jwt", FRONTEND_BASE_URL: "http://localhost", SESSION_COOKIE_DOMAIN: "" }));

import { berlinDay, berlinMidnight, buildMetrics, parseConfig, pathId, publishMetrics, shiftDay, validDay, WEBSITE_VISIT_PATH, PAGE_VIEW_PREFIX, type Hit } from "./metrics";
import { createGoatCounterReader } from "./goatCounter";
import router from "../../../routes/visitorAnalytics";
import { createSessionToken } from "../../../session";
import { syncVisitorAnalyticsSnapshotHandler } from "./syncSnapshot.handler";

const hit = (path: string, count: number, event = false, path_id = 1): Hit => ({ path, count, event, path_id });
const page = (path: string, count: number, id = 1) => hit(PAGE_VIEW_PREFIX + path, count, true, id);
const config = { startDate: "2026-10-01", collectionStartDate: "2026-10-01", sessionsVerified: true, revision: "one" };
beforeEach(() => { state.store.clear(); state.writes.length = 0; vi.restoreAllMocks(); });

describe("Public visitor metric contract", () => {
  it("uses Berlin calendar dates through both DST changes and rejects invalid dates", () => {
    expect(berlinDay(new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25");
    expect(berlinMidnight("2026-03-29")).toBe("2026-03-28T23:00:00.000Z");
    expect(berlinMidnight("2026-03-30")).toBe("2026-03-29T22:00:00.000Z");
    expect(berlinMidnight("2026-10-25")).toBe("2026-10-24T22:00:00.000Z");
    expect(berlinMidnight("2026-10-26")).toBe("2026-10-25T23:00:00.000Z");
    expect(shiftDay("2026-10-25", 1)).toBe("2026-10-26");
    for (const date of ["2026-02-30", "2026-99-99", "garbage", null]) expect(validDay(date)).toBe(false);
  });
  it.each([1, 5, 30, 31])("uses day %s with zero days and the current partial day", async day => {
    const today = shiftDay(config.startDate, day - 1);
    const read = vi.fn(async (start: string) => {
      if (day === 31 && start === berlinMidnight(config.startDate)) return [hit(WEBSITE_VISIT_PATH, 35, true), page("/player/a", 70)];
      const date = berlinDay(new Date(start));
      return date === today ? [hit(WEBSITE_VISIT_PATH, 5, true), page("/player/a", 10), hit("datahub/uploads/import-success", 999, true), hit("/player/a", 888), page("/player/b", 3)] : [];
    });
    const result = await buildMetrics(config, new Date(today + "T10:15:00Z"), read);
    expect(result.manifest.website?.dailyAverage).toBe(5 / Math.min(day, 30));
    expect(result.manifest.website?.today).toBe(5);
    expect(result.manifest.website?.total).toBe(day === 31 ? 35 : 5);
    expect(result.pages.get("/player/a")?.dailyAverage).toBe(10 / Math.min(day, 30));
    expect(result.pages.get("/player/a")?.total).toBe(day === 31 ? 70 : 10);
    expect(result.pages.size).toBe(day === 31 ? 1 : 2);
    expect(result.manifest.website?.days).toHaveLength(Math.min(day, 30));
    if (day > 1) expect(read.mock.calls[0][1]).toBe(new Date(Date.parse(berlinMidnight(shiftDay(berlinDay(new Date(read.mock.calls[0][0])), 1))) - 1).toISOString());
  });
  it("does not invent pre-collection history, unavailable data or future zeroes", async () => {
    const read = vi.fn(async () => []);
    const result = await buildMetrics({ ...config, startDate: "2020-01-01" }, new Date("2026-10-01T12:00:00Z"), read);
    expect(result.manifest.effectiveStartDate).toBe("2026-10-01");
    expect(result.manifest.website?.total).toBe(0);
    for (const patch of [{ startDate: null }, { startDate: "2027-01-01" }, { sessionsVerified: false }]) {
      read.mockClear(); const unavailable = await buildMetrics({ ...config, ...patch }, new Date("2026-10-01T12:00:00Z"), read);
      expect(unavailable.manifest.website).toBeNull(); expect(read).not.toHaveBeenCalled();
    }
    await expect(buildMetrics(config, new Date("2026-10-02T12:00:00Z"), async () => { throw Error("Missing day"); })).rejects.toThrow("Missing day");
  });
  it("publishes arbitrary profile paths atomically and retains the previous snapshot on failure", async () => {
    const now = new Date();
    const today = berlinDay(now);
    state.store.set("analytics/visitor_config", { ...config, startDate: today, collectionStartDate: today });
    const many = Array.from({ length: 35 }, (_, i) => page("/player/profile-" + i, i + 1, i + 1));
    const result = await publishMetrics(async () => [hit(WEBSITE_VISIT_PATH, 2, true, 99), ...many], now);
    const manifest = state.store.get("visitor_metrics_public/current");
    expect(manifest.website.total).toBe(2); expect(manifest.pathCount).toBe(35);
    expect(state.store.get(`visitor_metrics_public/${result.generation}/pages/${pathId("/player/profile-34")}`).total).toBe(35);
    expect(state.writes.indexOf("visitor_metrics_public/current")).toBeGreaterThan(state.writes.findIndex(path => path.includes("/pages/")));
    expect(await publishMetrics(async () => { throw Error("Must not query twice"); }, now)).toEqual({ skipped: true });
    await expect(publishMetrics(async () => { throw Error("Upstream failed"); }, new Date(now.getTime() + 3600001))).rejects.toThrow("Upstream failed");
    expect(state.store.get("visitor_metrics_public/current")).toEqual(manifest);
  });
  it("fully paginates documented hit rows and never treats response total as website visitors", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify(urls.length === 1 ? { total: 999999, more: true, hits: [hit("/player/a", 3, false, 7)] } : { total: 123456, more: false, hits: [hit(WEBSITE_VISIT_PATH, 1, true, 8)] }));
    }));
    const rows = await createGoatCounterReader()(berlinMidnight("2026-10-25"), "2026-10-25T12:00:00Z");
    expect(rows.map(row => row.count)).toEqual([3, 1]);
    expect(new URL(urls[1]).searchParams.get("exclude_paths")).toBe("7");
    expect(new URL(urls[0]).pathname).toBe("/api/v0/stats/hits");
    vi.unstubAllGlobals();
  });
  it("rejects incomplete/repeated provider responses rather than publishing truncated zeroes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ hits: [hit("/a", 1)], more: true }))));
    await expect(createGoatCounterReader()(berlinMidnight("2026-10-25"), "2026-10-25T12:00:00Z")).rejects.toThrow("repeated");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ total: 9 }))));
    await expect(createGoatCounterReader()(berlinMidnight("2026-10-25"), "2026-10-25T12:00:00Z")).rejects.toThrow("Invalid GoatCounter");
    vi.unstubAllGlobals();
  });
  it("protects settings/admin refresh/internal sync and activates only after explicit confirmation", async () => {
    const app = express(); app.use(express.json(), cookieParser()); app.use("/visitor", router); app.post("/sync", syncVisitorAnalyticsSnapshotHandler);
    const cookie = (roles: string[]) => `sfdatahub_session=${createSessionToken({ userId: "test", roles })}`;
    expect((await request(app).get("/visitor/config")).status).toBe(401);
    expect((await request(app).post("/visitor/refresh").set("Cookie", cookie(["user"])) ).status).toBe(403);
    expect((await request(app).put("/visitor/config").set("Cookie", cookie(["mod"])).send({ startDate: "2026-10-01", sessionsVerified: true })).status).toBe(403);
    expect((await request(app).post("/sync")).status).toBe(401);
    expect((await request(app).put("/visitor/config").set("Cookie", cookie(["admin"])).send({ startDate: "2026-02-30", sessionsVerified: true })).status).toBe(400);
    const saved = await request(app).put("/visitor/config").set("Cookie", cookie(["admin"])).send({ startDate: "2020-01-01", sessionsVerified: true });
    expect(saved.status).toBe(200); expect(saved.body.collectionStartDate).toBe(shiftDay(berlinDay(new Date()), 1));
    const changed = await request(app).put("/visitor/config").set("Cookie", cookie(["admin"])).send({ startDate: "2027-01-01", sessionsVerified: true });
    expect(changed.body.collectionStartDate).toBe(saved.body.collectionStartDate);
    expect(parseConfig(state.store.get("analytics/visitor_config")).startDate).toBe("2027-01-01");
    expect(state.store.has("analytics/visitor_analytics")).toBe(false);
  });
});
