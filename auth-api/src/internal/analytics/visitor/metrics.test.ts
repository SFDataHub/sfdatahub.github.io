import { hashBits } from "../../../storage/bundles";
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

const storedPage = (path: string): any => {
  const id = pathId(path), manifest = state.store.get("visitor_metrics_public/bundled");
  const prefix = manifest.bundles.find((bundle: any) => hashBits(id).startsWith(bundle.prefix)).prefix;
  return state.store.get("visitor_metrics_public/bundled/pages/b_" + (prefix || "root")).entries[id];
};
const state = vi.hoisted(() => ({ store: new Map<string, any>(), writes: [] as string[], reads: [] as string[], deletes: [] as string[], failCommit: false }));
vi.mock("../../../firebase", () => {
  const ref = (path: string): any => ({
    path, id: path.split("/").at(-1), collection: (name: string) => collection(path + "/" + name),
    get: async () => { state.reads.push(path); return { exists: state.store.has(path), data: () => state.store.get(path) }; },
    set: async (data: unknown) => { state.writes.push(path); state.store.set(path, data); },
  });
  const collection = (path: string): any => ({
    path, doc: (id: string) => ref(path + "/" + id),
    get: async () => {
      const docs = [...state.store].filter(([key]) => key.startsWith(path + "/") && key.split("/").length === path.split("/").length + 1).map(([key, value]) => ({ id: key.split("/").at(-1), ref: ref(key), data: () => value }));
      state.reads.push(...(docs.length ? docs.map(doc => doc.ref.path) : [path + " (empty query)"]));
      return { docs };
    },
  });
  return { admin: { firestore: { FieldValue: { serverTimestamp: () => null } } }, db: {
    collection,
    runTransaction: async (work: any) => {
      const pending: Array<() => void> = [];
      let publishing = false;
      const result = await work({ get: (r: any) => r.get(), set: (r: any, value: any) => {
        publishing ||= r.path === "visitor_metrics_public/bundled";
        pending.push(() => { state.writes.push(r.path); state.store.set(r.path, value); });
      }, delete: (r: any) => pending.push(() => { state.deletes.push(r.path); state.store.delete(r.path); }) });
      if (publishing && state.failCommit) throw Error("Commit interrupted");
      for (const write of pending) write();
      return result;
    },
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
beforeEach(() => { state.store.clear(); state.writes.length = state.reads.length = state.deletes.length = 0; state.failCommit = false; vi.restoreAllMocks(); });

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
  it("uses the selected start without inventing unavailable data or future zeroes", async () => {
    const read = vi.fn(async (_start: string, _end: string) => []);
    const result = await buildMetrics({ ...config, startDate: "2026-09-30" }, new Date("2026-10-01T12:00:00Z"), read);
    expect(result.manifest.effectiveStartDate).toBe("2026-09-30");
    expect(read.mock.calls[0][0]).toBe(berlinMidnight("2026-09-30"));
    expect(result.manifest.website?.total).toBe(0);
    for (const [patch, state] of [[{ startDate: null }, "not_configured"], [{ startDate: "2027-01-01" }, "not_started"], [{ sessionsVerified: false }, "unverified"]] as const) {
      read.mockClear(); const unavailable = await buildMetrics({ ...config, ...patch }, new Date("2026-10-01T12:00:00Z"), read);
      expect(unavailable.manifest.state).toBe(state); expect(unavailable.manifest.website).toBeNull(); expect(read).not.toHaveBeenCalled();
    }
    await expect(buildMetrics(config, new Date("2026-10-02T12:00:00Z"), async () => { throw Error("Missing day"); })).rejects.toThrow("Missing day");
  });
  it.each(["2026-11-07", "2026-11-08"])("replaces an old tomorrow-bound snapshot for selected %s without toggling confirmation", async startDate => {
    const now = new Date("2026-11-08T12:00:00Z");
    vi.spyOn(Date, "now").mockReturnValue(now.getTime());
    const legacy = { ...config, startDate, collectionStartDate: "2026-11-09" };
    state.store.set("analytics/visitor_config", legacy);
    state.store.set("visitor_metrics_public/current", { configRevision: legacy.revision, effectiveStartDate: "2026-11-09", asOf: new Date(now.getTime() - 30000).toISOString(), state: "not_started", generation: "old", website: null });
    const app = express(); app.use(express.json(), cookieParser()); app.use("/visitor", router);
    const cookie = `sfdatahub_session=${createSessionToken({ userId: "test", roles: ["admin"] })}`;
    const loaded = await request(app).get("/visitor/config").set("Cookie", cookie);
    expect(loaded.status).toBe(200);
    expect(loaded.body).toMatchObject({ startDate, collectionStartDate: startDate, sessionsVerified: true, revision: legacy.revision });
    // Reading normalizes old settings without writing config or fetching GoatCounter.
    expect(state.store.get("analytics/visitor_config")).toEqual(legacy);
    expect(state.writes).toEqual([]);
    const read = vi.fn(async (start: string, _end: string) => start === berlinMidnight("2026-11-08") ? [hit(WEBSITE_VISIT_PATH, 4, true), page("/help", 9), hit("/help", 888), hit("datahub/uploads/import-success", 999, true), hit("sfdatahub/website-visit", 777, true), hit("sfdatahub/page-view:/help", 666, true)] : []);
    // The next regular publication must not reuse a recent old-policy snapshot.
    expect(await publishMetrics(read, now)).toMatchObject({ skipped: false, state: "ready", pathCount: 1 });
    const first = state.store.get("visitor_metrics_public/bundled");
    const days = startDate === "2026-11-07" ? 2 : 1;
    expect(first).toMatchObject({ configRevision: legacy.revision, effectiveStartDate: startDate, collectionStartDate: startDate });
    expect(first.website).toMatchObject({ today: 4, total: 4, dailyAverage: 4 / days });
    expect(storedPage("/help")).toMatchObject({ today: 9, total: 9, dailyAverage: 9 / days });
    expect(read.mock.calls[0][0]).toBe(berlinMidnight(startDate));
    expect(read.mock.calls.at(-1)).toEqual([berlinMidnight("2026-11-08"), now.toISOString()]);
    expect(await publishMetrics(read, now)).toEqual({ skipped: true });
    expect(read).toHaveBeenCalledTimes(days);
    const saved = await request(app).put("/visitor/config").set("Cookie", cookie).send({ startDate, sessionsVerified: true });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ startDate, collectionStartDate: startDate, sessionsVerified: true });
    expect(saved.body.revision).not.toBe(legacy.revision);
    expect(state.store.get("analytics/visitor_config")).toEqual(saved.body);
    // Saving alone publishes nothing; the next job sees the new revision.
    expect(state.store.get("visitor_metrics_public/bundled")).toEqual(first);
    const next = await publishMetrics(read, now);
    expect(next).toMatchObject({ skipped: false, state: "ready" });
    expect(next.sequence).toBe(first.sequence + 1);
    expect(state.store.get("visitor_metrics_public/bundled").configRevision).toBe(saved.body.revision);
    expect(state.store.has("analytics/visitor_analytics")).toBe(false);
  });
  it("needs explicit confirmation but no historical collection field", async () => {
    const raw = { startDate: "2026-11-08", sessionsVerified: false, revision: "old" };
    const read = vi.fn(async () => [hit(WEBSITE_VISIT_PATH, 2, true)]);
    const now = new Date("2026-11-08T12:00:00Z");
    const unverified = await buildMetrics(parseConfig(raw), now, read);
    expect(unverified.manifest).toMatchObject({ state: "unverified", website: null });
    expect(read).not.toHaveBeenCalled();
    const confirmed = parseConfig({ ...raw, sessionsVerified: true });
    expect(confirmed.collectionStartDate).toBe(raw.startDate);
    expect((await buildMetrics(confirmed, now, read)).manifest).toMatchObject({ state: "ready", website: { today: 2 } });
    expect(parseConfig({ ...raw, startDate: "2026-02-30", sessionsVerified: true })).toMatchObject({ startDate: null, collectionStartDate: null });
  });
  it("publishes arbitrary profile paths atomically and retains the previous snapshot on failure", async () => {
    const now = new Date();
    const today = berlinDay(now);
    state.store.set("analytics/visitor_config", { ...config, startDate: today, collectionStartDate: today });
    const many = Array.from({ length: 35 }, (_, i) => page("/player/profile-" + i, i + 1, i + 1));
    const result = await publishMetrics(async () => [hit(WEBSITE_VISIT_PATH, 2, true, 99), ...many], now);
    const manifest = state.store.get("visitor_metrics_public/bundled");
    expect(manifest.website.total).toBe(2); expect(manifest.pathCount).toBe(35);
    expect(storedPage("/player/profile-34").total).toBe(35);
    expect(state.writes.indexOf("visitor_metrics_public/bundled")).toBeGreaterThan(state.writes.findIndex(path => path.includes("/pages/")));
    expect(await publishMetrics(async () => { throw Error("Must not query twice"); }, now)).toEqual({ skipped: true });
    await expect(publishMetrics(async () => { throw Error("Upstream failed"); }, new Date(now.getTime() + 3600001))).rejects.toThrow("Upstream failed");
    expect(state.store.get("visitor_metrics_public/bundled")).toEqual(manifest);
  });
  it.each([
    ["2026-11-08T19:00:22+01:00", "2026-11-08T20:00:17+01:00"],
    ["2026-11-08T20:48:50+01:00", "2026-11-08T21:01:03+01:00"],
    ["2026-10-25T02:00:22+02:00", "2026-10-25T02:00:17+01:00"],
    ["2026-03-29T01:00:22+01:00", "2026-03-29T03:00:17+02:00"],
  ])("publishes the new absolute hour from %s to %s, then reuses that hour", async (before, after) => {
    const firstTime = new Date(before), nextTime = new Date(after);
    const startDate = berlinDay(firstTime);
    state.store.set("analytics/visitor_config", { ...config, startDate });
    const clock = vi.spyOn(Date, "now").mockReturnValue(firstTime.getTime());
    const read = vi.fn(async () => [hit(WEBSITE_VISIT_PATH, 4, true), page("/help", 9)]);
    await publishMetrics(read, firstTime);
    const first = state.store.get("visitor_metrics_public/bundled");
    clock.mockReturnValue(nextTime.getTime());
    expect(await publishMetrics(read, nextTime)).toMatchObject({ skipped: false });
    const next = state.store.get("visitor_metrics_public/bundled");
    expect(next.sequence).toBe(first.sequence + 1);
    expect(next.asOf).toBe(nextTime.toISOString());
    const repeated = new Date(Math.floor(nextTime.getTime() / 3600000) * 3600000 + 59 * 60000);
    clock.mockReturnValue(repeated.getTime());
    expect(await publishMetrics(read, repeated)).toEqual({ skipped: true });
    expect(read).toHaveBeenCalledTimes(2);
    // A saved configuration must still invalidate an otherwise current hour.
    state.store.set("analytics/visitor_config", { ...config, startDate, revision: "changed" });
    expect(await publishMetrics(read, repeated)).toMatchObject({ skipped: false });
    expect(read).toHaveBeenCalledTimes(3);
  });
  it("keeps the lease and the last complete generation through overlapping and failed publications", async () => {
    const now = new Date("2026-11-08T19:00:17Z");
    vi.spyOn(Date, "now").mockReturnValue(now.getTime());
    state.store.set("analytics/visitor_config", { ...config, startDate: "2026-11-08" });
    const previous = { sequence: 7, generation: "bundled", asOf: "2026-11-08T18:00:22Z", complete: true };
    state.store.set("visitor_metrics_public/bundled", previous);
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const first = publishMetrics(async () => { await wait; throw Error("Provider failed"); }, now);
    // Let the first transaction acquire its lease before the second caller.
    await vi.waitFor(() => expect(state.store.has("analytics/visitor_sync_lease")).toBe(true));
    const read = vi.fn(async () => []);
    expect(await publishMetrics(read, now)).toEqual({ skipped: true });
    expect(read).not.toHaveBeenCalled();
    release();
    await expect(first).rejects.toThrow("Provider failed");
    expect(state.store.get("visitor_metrics_public/bundled")).toEqual(previous);
    expect(state.store.get("analytics/visitor_sync_lease").until).toBe(0);
    // A config change during construction must not publish staged page documents.
    await expect(publishMetrics(async () => {
      state.store.set("analytics/visitor_config", { ...config, revision: "changed-during-build" });
      return [page("/help", 9)];
    }, now)).rejects.toThrow("configuration or sync lease changed");
    expect(state.writes.some(path => path.includes("/pages/"))).toBe(false);
    expect(state.store.get("visitor_metrics_public/bundled")).toEqual(previous);
    expect(await publishMetrics(read, now)).toMatchObject({ skipped: false });
  });
  it("measures current-only document operations for 125 paths, unchanged, changed and new paths", async () => {
    const now = new Date("2026-11-12T10:00:00Z");
    const clock = vi.spyOn(Date, "now").mockReturnValue(now.getTime());
    state.store.set("analytics/visitor_config", { ...config, startDate: "2026-11-12" });
    const frozenLive = {schemaVersion: 3, complete: true, marker: "unchanged-W279"};
    state.store.set("visitor_metrics_public/live", frozenLive);
    const legacy = { generation: "legacy", complete: true, website: { total: 99 } };
    state.store.set("visitor_metrics_public/current", legacy);
    let rows = Array.from({ length: 125 }, (_, i) => page("/player/p" + i, i + 1));
    const ledger: Record<string, unknown> = {};
    for (const [i, label] of ["initial", "unchanged", "changed", "new"].entries()) {
      if (label === "changed") rows[0] = page("/player/p0", 22);
      if (label === "new") rows.push(page("/help/new", 3));
      state.reads.length = state.writes.length = state.deletes.length = 0;
      const time = new Date(now.getTime() + i * 3600000); clock.mockReturnValue(time.getTime());
      const result = await publishMetrics(async () => [hit(WEBSITE_VISIT_PATH, 99, true), ...rows], time);
      const counts = { reads: state.reads.length, writes: state.writes.length, deletes: state.deletes.length, pageWrites: result.pageWrites, indexWrites: result.indexWrites };
      ledger[label] = counts;
      expect(result.pageWrites).toBe(label === "unchanged" ? 0 : 1);
      expect(counts.deletes).toBe(0);
      expect(counts.writes).toBe(label === "unchanged" ? 3 : 4);
      expect(state.store.get("visitor_metrics_public/current")).toEqual(legacy);
      expect(state.store.get("visitor_metrics_public/live")).toEqual(frozenLive);
      expect(state.writes.some(path => /^visitor_metrics_public\/(?!bundled)/.test(path))).toBe(false);
    }
    console.log("SIMULATED_DOCUMENT_OPERATIONS " + JSON.stringify(ledger));
    expect(state.store.get("visitor_metrics_public/bundled").website).not.toHaveProperty("days");
    expect(state.store.get("visitor_metrics_public/bundled").dayCount).toBe(1);
  });
  it("preserves the complete public/index state on commit failure, then handles day/start/removal", async () => {
    const now = new Date("2026-11-12T22:00:00Z");
    const clock = vi.spyOn(Date, "now").mockReturnValue(now.getTime());
    state.store.set("analytics/visitor_config", { ...config, startDate: "2026-11-12" });
    await publishMetrics(async () => [page("/help", 4)], now);
    const before = JSON.stringify([...state.store].filter(([key]) => key !== "analytics/visitor_sync_lease"));
    state.failCommit = true;
    const midnight = new Date("2026-11-12T23:00:00Z"); clock.mockReturnValue(midnight.getTime());
    await expect(publishMetrics(async () => [page("/help", 8)], midnight)).rejects.toThrow("Commit interrupted");
    expect(JSON.stringify([...state.store].filter(([key]) => key !== "analytics/visitor_sync_lease"))).toBe(before);
    state.failCommit = false;
    await publishMetrics(async () => [page("/help", 8)], midnight);
    expect(state.store.get("visitor_metrics_public/bundled")).toMatchObject({ today: "2026-11-13", dayCount: 2 });
    state.store.set("analytics/visitor_config", { ...config, startDate: "2026-11-13", revision: "new" });
    const result = await publishMetrics(async () => [], midnight);
    expect(result.pageDeletes).toBe(0);
    expect(state.store.get("visitor_metrics_public/bundled")).toMatchObject({ dayCount: 1, pathCount: 0, effectiveStartDate: "2026-11-13" });
  });
  it("measures 512 KiB overflow and lossless oversized single-entry publication", async () => {
    const now = new Date("2026-11-12T10:00:00Z"), clock = vi.spyOn(Date, "now").mockReturnValue(now.getTime());
    state.store.set("analytics/visitor_config", { ...config, startDate: "2026-11-12" });
    const hugePath = "/player/" + "x".repeat(630000);
    const rows = Array.from({ length: 4000 }, (_, i) => page("/player/p" + i, i + 1));
    rows.push(page(hugePath, 7));
    const ledger: Record<string, unknown> = {};
    let oldManifest: any;
    for (const [index, label] of ["initial", "unchanged", "small", "hugeMetric"].entries()) {
      clock.mockReturnValue(now.getTime() + index * 3600001);
      if (label === "small") rows[0] = page("/player/p0", 99);
      if (label === "hugeMetric") rows[rows.length - 1] = page(hugePath, 8);
      state.reads.length = state.writes.length = state.deletes.length = 0;
      await publishMetrics(async () => rows, new Date(Date.now()));
      const manifest = state.store.get("visitor_metrics_public/bundled");
      const bundleWrites = state.writes.filter(p => p.includes("/pages/b_")).length;
      const fragmentWrites = state.writes.filter(p => p.includes("/pages/f_")).length;
      ledger[label] = { reads: state.reads.length, writes: state.writes.length, deletes: state.deletes.length, bundleWrites, fragmentWrites };
      expect(manifest.pathCount).toBe(4001); expect(manifest.bundles.length).toBeGreaterThan(1); expect(manifest.fragments.length).toBeGreaterThan(1);
      if (oldManifest) expect(manifest.bundles.map((b: any) => b.prefix)).toEqual(oldManifest.bundles.map((b: any) => b.prefix));
      if (label === "unchanged") { expect(bundleWrites).toBe(0); expect(fragmentWrites).toBe(0); }
      if (label === "small") { expect(bundleWrites).toBe(1); expect(fragmentWrites).toBe(0); }
      if (label === "hugeMetric") { expect(bundleWrites).toBe(1); expect(fragmentWrites).toBe(1); }
      const pointer = storedPage(hugePath);
      const rebuilt = JSON.parse(pointer.parts.map((part: any) => state.store.get("visitor_metrics_public/bundled/pages/" + part.id).data).join(""));
      expect(rebuilt).toEqual({ path: hugePath, today: label === "hugeMetric" ? 8 : 7, total: label === "hugeMetric" ? 8 : 7, dailyAverage: label === "hugeMetric" ? 8 : 7 });
      expect(state.deletes).toHaveLength(0); oldManifest = structuredClone(manifest);
    }
    console.log("SIMULATED_OVERFLOW_OPERATIONS " + JSON.stringify(ledger));
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
    for (const body of [{ startDate: "invalid", sessionsVerified: true }, { startDate: "2026-11-08" }, { startDate: "2026-11-08", sessionsVerified: "true" }]) {
      expect((await request(app).put("/visitor/config").set("Cookie", cookie(["admin"])).send(body)).status).toBe(400);
    }
    const now = new Date();
    const today = berlinDay(now);
    const saved = await request(app).put("/visitor/config").set("Cookie", cookie(["admin"])).send({ startDate: today, sessionsVerified: true });
    expect(saved.status).toBe(200); expect(saved.body.collectionStartDate).toBe(today);
    const read = vi.fn(async (_start: string, _end: string) => [hit(WEBSITE_VISIT_PATH, 4, true), page("/help", 9), hit("/help", 888), hit("datahub/uploads/import-success", 999, true)]);
    await publishMetrics(read, now);
    const first = state.store.get("visitor_metrics_public/bundled");
    expect(first.state).toBe("ready");
    expect(first.website).toMatchObject({ today: 4, total: 4, dailyAverage: 4 });
    expect(storedPage("/help")).toMatchObject({ today: 9, total: 9, dailyAverage: 9 });
    expect(read.mock.calls).toEqual([[berlinMidnight(today), now.toISOString()]]);
    const changed = await request(app).put("/visitor/config").set("Cookie", cookie(["admin"])).send({ startDate: "2027-01-01", sessionsVerified: true });
    expect(changed.body.collectionStartDate).toBe("2027-01-01");
    expect(changed.body.revision).not.toBe(saved.body.revision);
    expect(parseConfig(state.store.get("analytics/visitor_config")).startDate).toBe("2027-01-01");
    expect(state.store.has("analytics/visitor_analytics")).toBe(false);
  });
});
