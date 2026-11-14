import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import request from "supertest";
const state = vi.hoisted(() => ({ store: new Map<string, any>(), reads: [] as string[], writes: [] as string[], failRead: false }));
vi.mock("../../../firebase", () => {
  const ref = (path: string): any => ({ path, id: path.split("/").pop(),
    get: async () => { if (state.failRead) throw Error("offline"); state.reads.push(path); return { id: path.split("/").pop(), exists: state.store.has(path), data: () => state.store.get(path) }; },
    set: async (value: any, options?: any) => { state.writes.push(path); state.store.set(path, options?.merge ? { ...state.store.get(path), ...value } : value); },
  });
  const collection = (path: string): any => ({ doc: (id: string) => ref(path + "/" + id), add: async (value: any) => { state.writes.push(path); return value; } });
  return { admin: { auth: () => ({ createCustomToken: vi.fn() }), firestore: { FieldValue: { serverTimestamp: () => null } } }, db: { collection,
    runTransaction: async (fn: any) => fn({ get: (r: any) => r.get(), set: (r: any, v: any, options: any) => r.set(v, options) }),
  } };
});
vi.mock("../../../config", () => ({ GOATCOUNTER_API_BASE_URL: "https://private-test.invalid", GOATCOUNTER_API_TOKEN: "test", UPLOAD_INBOX_TOKEN: "test", AUTH_JWT_SECRET: "test-secret", FRONTEND_BASE_URL: "http://localhost", SESSION_COOKIE_DOMAIN: "" }));
import { COLLECTION_DISPLAY, TOOL_CLICK_PREFIX, eventNames, normalizeToolTarget, usageEvent } from "./events";
import { buildEventStats, collectionTrackingStart } from "./eventStats";
import { buildDateRanges, refreshVisitorAnalyticsDetails } from "./syncSnapshot.handler";
import { clearVisitorReadCache, readVisitorSnapshot, invalidateVisitorReadCache } from "./readSnapshot";
import { PAGE_VIEW_PREFIX, WEBSITE_VISIT_PATH, type Hit } from "./metrics";
import visitor from "../../../routes/visitorAnalytics";
import admin from "../../../routes/admin";
import auth from "../../../routes/auth";
import { createSessionToken, verifySessionToken, createRefreshToken } from "../../../session";
const now = new Date("2026-11-14T16:00:00Z");
const row = (path: string, count: number, event = true): Hit => ({ path, count, event, path_id: 1 });
const range = buildDateRanges(now).today;
const app = express(); app.use(express.json(), cookieParser()); app.use("/api/admin/stats/visitor", visitor); app.use("/admin", admin); app.use("/auth", auth);
const cookie = (roles: string[]) => `sfdatahub_session=${createSessionToken({ userId: "operator", roles })}`;
beforeEach(() => { state.store.clear(); state.reads.length = state.writes.length = 0; state.failRead = false; clearVisitorReadCache(); vi.restoreAllMocks(); });

describe("private visitor data basis", () => {
  it("validates canonical open-ended tool targets without queries, fragments or credentials", () => {
    expect(normalizeToolTarget("https://NEW.12hp.de:443/new-tool/?account=secret#session")).toBe("https://new.12hp.de/new-tool");
    expect(normalizeToolTarget("http://other.example:8080/new-tool")).toBe("http://other.example:8080/new-tool");
    for (const input of [null, {}, 5, "/relative", "javascript:alert(1)", "data:text/html,test", "ftp://example.org", "https://a:b@example.org/", "https://", "https://x/a\nb", "https://x/" + "x".repeat(2048)]) expect(normalizeToolTarget(input)).toBeNull();
  });
  it("covers every fixed catalog entry and actual dynamic event families", () => {
    for (const path of eventNames) expect(usageEvent(path), path).not.toBeNull();
    for (const path of ["home/youtube/video-click/UCQ_QAobbdVw6ntDMAloTKww/-nCfhJI2TaI", "home/twitch/live-click/test_login", "dungeons/library/book-open/shadow-world", "help/qa/question-open/local-pool", "datahub/toplist/players/server-view/BLACKFOREST", "datahub/toplist/guilds/server-view/EU1", "datahub/setup/completed/servers/12"]) expect(usageEvent(path), path).not.toBeNull();
    for (const path of ["datahub/unknown", "home/youtube/video-click/bad/bad", "dungeons/library/book-open/unknown", "help/qa/question-open/?account=x", "datahub/setup/completed/servers/0", "datahub/toplist/players/server-view/?secret=x"]) expect(usageEvent(path)).toBeNull();
  });
  it("keeps website, legacy pages, v2 pages, actions and collection counters disjoint", () => {
    const hits = [row(WEBSITE_VISIT_PATH, 99), row("/sf-collection", 88, false), row(PAGE_VIEW_PREFIX + "/sf-collection", 77), row(COLLECTION_DISPLAY, 4), row(TOOL_CLICK_PREFIX + "https://sfgame.12hp.de/wb", 5), row(TOOL_CLICK_PREFIX + "https://new.example/", 2), row("datahub/uploads/import-success", 3), row("datahub/favorites/open", 6), row("dons-sf-collection:link-click", 100), row(TOOL_CLICK_PREFIX + "https://x/?secret=x", 100)];
    const result = buildEventStats(hits, range, null);
    expect(result.usage.count).toBe(9); expect(result.pageViewEvents.count).toBe(77);
    expect(result.collectionDisplays).toMatchObject({ count: 4, state: "observed", trackingStartedAt: null });
    expect(result.toolClicks.count).toBe(7); expect(result.toolClicks.targets.reduce((n, t) => n + t.count, 0)).toBe(7);
    expect(result.usage.categories.reduce((n, c) => n + c.count, 0)).toBe(result.usage.count);
  });
  it("distinguishes not recorded, observed, partial and measured zero", () => {
    expect(buildEventStats([], range, null).collectionDisplays).toMatchObject({ count: null, state: "not_recorded" });
    expect(buildEventStats([], range, "2026-11-14T10:00:00.000Z").toolClicks).toMatchObject({ count: 0, state: "partial", targets: [] });
    expect(buildEventStats([], range, range.startDateTime).collectionDisplays).toMatchObject({ count: 0, state: "available" });
    expect(buildEventStats([], range, "2027-01-01T00:00:00.000Z").collectionDisplays.count).toBeNull();
    for (const bad of ["2026-02-30T00:00:00Z", "2026-11-14", 1, null]) expect(collectionTrackingStart(bad)).toBeNull();
  });
  it.each([ ["2026-03-29T12:00:00Z", "2026-03-28T23:00:00.000Z", "2026-03-23", "2026-02-28"], ["2026-10-25T12:00:00Z", "2026-10-24T22:00:00.000Z", "2026-10-19", "2026-09-26"] ])("uses Berlin day and inclusive 7/30 calendar windows at %s", (iso, midnight, seven, thirty) => {
    const ranges = buildDateRanges(new Date(iso)); expect(ranges.today.startDateTime).toBe(midnight); expect(ranges.last7d.startDate).toBe(seven); expect(ranges.last30d.startDate).toBe(thirty); expect(ranges.today.endDateTime).toBe(new Date(iso).toISOString());
  });
  it("refreshes three paginated-reader windows once, supports old/current profiles and bounds only rankings", async () => {
    const hits = [row("/player/legacy", 9, false), row("/players/profile/older", 8, false), row("/guild/legacy", 7, false), row("/guilds/profile/older", 6, false), row("/data-hub/player-hub/player/eu1/s1_eu_p123?source=not-a-name", 5, false), row("/data-hub/guild-hub/guild/blackforest/black_forest_g23/dashboard", 4, false), row("/data-hub/player-hub/player/eu2/s1_eu_p123", 3, false), row("/guidehub-v2?tab=general&sub=quests", 2, false), row(COLLECTION_DISPLAY, 10), row(TOOL_CLICK_PREFIX + "https://x/", 20), ...Array.from({ length: 30 }, (_, i) => row("/page-" + i, 1, false))];
    const read = vi.fn(async () => hits); const result = await refreshVisitorAnalyticsDetails(read, now);
    expect(read.mock.calls).toHaveLength(3);
    expect(result.totals.today.visits).toBe(74); expect(result.topPages.last7d).toHaveLength(25);
    expect(result.topPlayers.last7d.map(x => x.identifier)).toEqual(["legacy", "older", "s1_eu_p123"]);
    expect(result.topGuilds.last7d.map(x => x.identifier)).toEqual(["legacy", "older", "black_forest_g23"]);
    expect(result.toolClicks.today.count).toBe(20); expect(result.collectionDisplays.today.count).toBe(10);
    expect(state.writes).toEqual(["analytics/visitor_config", "analytics/visitor_analytics", "analytics/visitor_config"]);
    expect(result.updatedAtIso).toBe(now.toISOString());
  });
  it("retains last valid metrics and age across provider errors and oversized refreshes", async () => {
    const old = { schemaVersion: 2, totals: { today: { visits: 42 } }, updatedAtIso: "2026-11-10T00:00:00Z" };
    state.store.set("analytics/visitor_analytics", old);
    await expect(refreshVisitorAnalyticsDetails(async () => { throw Error("upstream"); }, now)).rejects.toThrow("upstream");
    expect(state.store.get("analytics/visitor_analytics").totals).toEqual(old.totals);
    const result = await readVisitorSnapshot(now);
    expect(result.details).toMatchObject({ state: "error", error: "refresh_failed", stale: true, data: { totals: old.totals } });
    expect(result.details.ageSeconds).toBeGreaterThan(86400);
    const giant = Array.from({ length: 1500 }, (_, i) => row(TOOL_CLICK_PREFIX + `https://x.example/${i}/` + "a".repeat(220), 1));
    await expect(refreshVisitorAnalyticsDetails(async () => giant, now)).rejects.toThrow();
    expect(state.store.get("analytics/visitor_analytics").totals).toEqual(old.totals);
  });
  it("serves cached snapshots, absent/legacy data and read errors without provider calls or writes", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("forbidden"));
    expect((await readVisitorSnapshot(now)).details.state).toBe("not_available");
    state.store.set("analytics/visitor_analytics", { schemaVersion: 1, totals: {}, updatedAtIso: "2026-11-14T15:00:00Z" });
    invalidateVisitorReadCache(); const legacy = await readVisitorSnapshot(now);
    expect(legacy.details.state).toBe("legacy"); expect(legacy.availability.toolClicks).toBe("not_recorded");
    const reads = state.reads.length; await readVisitorSnapshot(now); expect(state.reads.length).toBe(reads);
    state.failRead = true; const fallback = await readVisitorSnapshot(new Date(now.getTime() + 61000));
    expect(fallback.details).toMatchObject({ state: "error", error: "snapshot_read_failed", stale: true, data: { schemaVersion: 1 } });
    expect(fetch).not.toHaveBeenCalled(); expect(state.writes).toEqual([]);
  });
  it("reuses authentic W283 public values as an older source and recognizes its real profile paths", async () => {
    const fixture = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "../tools/analytics/fixtures/visitor-public-w283.json"), "utf8"));
    state.store.set("visitor_metrics_public/bundled", fixture.website);
    const saved = await readVisitorSnapshot(now);
    expect(saved.website).toMatchObject({ state: "available", stale: true, asOf: fixture.provenance.sourceAsOf, data: { website: { today: 32, total: 301, dailyAverage: 60.2 }, dayCount: 5 } });
    // Only classification input; these test counts are not reconstructed history.
    const result = await refreshVisitorAnalyticsDetails(async () => fixture.profilePaths.map((p: string) => row(p, 1, false)), now);
    expect(result.topPlayers.last7d.length).toBeGreaterThan(0); expect(result.topGuilds.last7d.length).toBeGreaterThan(0);
    const groups = [];
    for (const p of fixture.profilePaths) {
      const single = await refreshVisitorAnalyticsDetails(async () => [row(p, 1, false)], now);
      expect(single.topPlayers.last7d.length + single.topGuilds.last7d.length, p).toBe(1); groups.push(p);
    }
    expect(groups.length).toBe(fixture.profilePaths.length);
  });
  it("guards direct reads and leaves settings, refresh and other admin APIs protected", async () => {
    const url = "/api/admin/stats/visitor/";
    expect((await request(app).get(url + "snapshot")).status).toBe(401);
    expect((await request(app).get(url + "snapshot").set("Cookie", "sfdatahub_session=invalid")).status).toBe(401);
    for (const roles of [["user"], ["creator"], ["mod"], ["moderator"], ["dev"], ["developer"]]) expect((await request(app).get(url + "snapshot").set("Cookie", cookie(roles))).status).toBe(403);
    for (const roles of [["user", "don"], ["admin"]]) {
      const r = await request(app).get(url + "snapshot").set("Cookie", cookie(roles)); expect(r.status).toBe(200); expect(r.headers["cache-control"]).toBe("private, no-store");
    }
    for (const method of ["get", "put"] as const) expect((await request(app)[method](url + "config").set("Cookie", cookie(["user", "don"]))).status).toBe(403);
    expect((await request(app).post(url + "refresh").set("Cookie", cookie(["user", "don"]))).status).toBe(403);
    expect((await request(app).get("/admin/users").set("Cookie", cookie(["user", "don"]))).status).toBe(403);
    expect(state.writes).toEqual([]);
  });
  it("stores Don as supplement, validates roles and carries it through real session/refresh handlers", async () => {
    state.store.set("users/target", { userId: "target", roles: ["user"], providers: {}, displayName: "Test", primaryProvider: "discord" });
    const r = await request(app).patch("/admin/users/target/roles").set("Cookie", cookie(["admin"])).send({ roles: ["don"] });
    expect(r.status).toBe(200); expect(state.store.get("users/target").roles).toEqual(["don", "user"]);
    expect((await request(app).patch("/admin/users/target/roles").set("Cookie", cookie(["admin"])).send({ roles: ["owner"] })).status).toBe(400);
    const roles = state.store.get("users/target").roles;
    const access = createSessionToken({ userId: "target", roles }); expect(verifySessionToken(access)?.roles).toEqual(roles);
    const session = await request(app).get("/auth/session").set("Cookie", "sfdatahub_session=" + access); expect(session.body.user.roles).toEqual(roles);
    const refreshed = await request(app).post("/auth/refresh").set("Cookie", "sfdatahub_refresh=" + createRefreshToken({ userId: "target", roles }, false));
    expect(refreshed.status).toBe(200);
    const set = refreshed.headers["set-cookie"][0].split(";")[0].split("=")[1]; expect(verifySessionToken(set)?.roles).toEqual(roles);
  });
  it("keeps independent verified collection start during ordinary admin config saves", async () => {
    const body = { startDate: "2026-10-01", sessionsVerified: true, collectionTrackingStartedAt: "2026-11-14T16:00:00Z" };
    const url = "/api/admin/stats/visitor/config";
    const r = await request(app).put(url).set("Cookie", cookie(["admin"])).send(body); expect(r.status).toBe(200);
    const saved = await request(app).put(url).set("Cookie", cookie(["admin"])).send({ startDate: "2026-10-01", sessionsVerified: true });
    expect(saved.body.collectionTrackingStartedAt).toBe("2026-11-14T16:00:00.000Z");
    expect((await request(app).put(url).set("Cookie", cookie(["admin"])).send({ ...body, collectionTrackingStartedAt: "2026-02-30T00:00:00Z" })).status).toBe(400);
  });
});
