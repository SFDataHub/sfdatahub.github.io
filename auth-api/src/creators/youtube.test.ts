import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { fakeYouTube, NOW, FIXTURE_CONFIG, FIXTURE_SOURCES } from "../../../tools/creators/fixtures/youtube/data";
import { collectYouTube } from "./youtube";
import { parseYouTubeSources, configuredYouTubeSources, matchesYouTubeSources } from "./sources";
import { isYouTubeSnapshot } from "./types";
vi.mock("../../../src/lib/auth/config", () => ({AUTH_BASE_URL: "https://fixture.invalid"}));
import { YouTubeFailure, youtubeDiagnostic, youtubeReason, logYouTubeFailure } from "./errors";
const state = vi.hoisted(() => ({ store: new Map<string, any>(), key: "fixture-key", sources: "", failRead: "", failPublish: false, fault: null as unknown, reads: [] as string[], writes: [] as string[], deletes: [] as string[] }));
vi.mock("../config", () => ({ get YOUTUBE_API_KEY() { return state.key; }, get YOUTUBE_SOURCES() { return state.sources; }, UPLOAD_INBOX_TOKEN: "fixture-internal", AUTH_JWT_SECRET: "fixture-signing-only", FRONTEND_BASE_URL: "http://localhost", SESSION_COOKIE_DOMAIN: undefined }));
vi.mock("../firebase", () => {
  function doc(path: string): any { return { path, get: async () => { state.reads.push(path); if (state.failRead === path) throw state.fault; return { exists: state.store.has(path), data: () => state.store.get(path) }; } }; }
  let queue = Promise.resolve();
  return { db: { collection: (name: string) => ({ doc: (id: string) => doc(`${name}/${id}`) }), runTransaction: (fn: any) => {
    const operation = queue.then(async () => {
      const writes: (() => void)[] = []; let publishesSnapshot = false;
      const result = await fn({ get: (ref: any) => ref.get(), set: (ref: any, data: any, options: any) => { if (ref.path === "creator_snapshots/creators-live.json") publishesSnapshot = true; writes.push(() => { state.writes.push(ref.path); state.store.set(ref.path, options?.merge ? { ...state.store.get(ref.path), ...structuredClone(data) } : structuredClone(data)); }); }, delete: (ref: any) => writes.push(() => { state.deletes.push(ref.path); state.store.delete(ref.path); }) });
      if (state.failPublish && publishesSnapshot) throw state.fault;
      writes.forEach(write => write()); return result;
    }); queue = operation.catch(() => {}); return operation;
  } } };
});
import { publicYouTubeCache } from "./publicSnapshot";
import { refreshYouTubeSnapshot, readYouTubeSnapshot } from "./service";
import { creatorRouter } from "./routes";
import { createSessionToken, SESSION_COOKIE_NAME } from "../session";
const app = express(); app.use(cookieParser()); app.use(creatorRouter);
const cookie = (roles: string[]) => `${SESSION_COOKIE_NAME}=${createSessionToken({ userId: "test-admin", roles })}`;
beforeEach(() => { publicYouTubeCache.clear(); state.store.clear(); state.reads.length = state.writes.length = state.deletes.length = 0; state.key = "fixture-key"; state.sources = JSON.stringify(FIXTURE_SOURCES); state.failRead = ""; state.failPublish = false; state.fault = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("central YouTube snapshot", () => {
  it("uses the provider medium channel image while retaining video thumbnails", async () => {
    const fake = fakeYouTube();
    const fetcher: typeof fetch = async (input, init) => {
      const response = await fake.fetcher(input, init);
      if (!new URL(String(input)).pathname.endsWith("channels")) return response;
      const data = await response.json() as any;
      for (const channel of data.items) channel.snippet.thumbnails.medium = { url: `https://fixture.invalid/${channel.id}-240.jpg`, width: 240, height: 240 };
      return new Response(JSON.stringify(data));
    };
    const data = await collectYouTube({ key: state.key, config: FIXTURE_CONFIG, now: NOW, fetcher });
    expect(data.snapshot.channels.every(channel => channel.avatar.endsWith(`${channel.id}-240.jpg`))).toBe(true);
    expect(data.snapshot.channels.every(channel => channel.videos.every(video => !!video.thumbnail))).toBe(true);
  });
  it("shares public three/ten variants, performs no writes and expires only the shared server response", async () => {
    const fake = fakeYouTube();
    const data = await collectYouTube({ key: state.key, config: FIXTURE_CONFIG, now: NOW, fetcher: fake.fetcher });
    state.store.set("creator_snapshots/creators-live.json", { youtube: data.snapshot });
    const clock = vi.spyOn(Date, "now").mockReturnValue(NOW);
    const [three, ten] = await Promise.all([request(app).get("/public/creators-live.json"), request(app).get("/public/creators-live.json?videos=10")]);
    expect(three.body.youtube.channels[0].videos).toHaveLength(3);
    expect(ten.body.youtube.channels[0].videos).toHaveLength(7);
    expect(state.reads).toHaveLength(2); expect(state.writes).toHaveLength(0); expect(state.deletes).toHaveLength(0);
    expect(three.headers["cache-control"]).toContain("public");
    await request(app).get("/public/creators-live.json?videos=10"); expect(state.reads).toHaveLength(2);
    clock.mockReturnValue(NOW + 60001);
    await request(app).get("/public/creators-live.json"); expect(state.reads).toHaveLength(4);
    expect(fake.calls).toHaveLength(data.snapshot.requests);
  });
  it("uses all exact sources, paginates oldest-first lists, deduplicates, counts publication dates and reuses ETags", async () => {
    const fake = fakeYouTube();
    const first = await collectYouTube({ key: state.key, config: FIXTURE_CONFIG, now: NOW, fetcher: fake.fetcher });
    expect(first.snapshot.channels).toHaveLength(7);
    for (const channel of first.snapshot.channels) {
      expect(channel.videos).toHaveLength(7); expect(channel.recentVideoCount).toBe(6); expect(channel.complete).toBe(true);
      expect(channel.videos[0].id.endsWith("-1")).toBe(true);
      expect(channel.videos.every(v => v.channelId === channel.id)).toBe(true);
    }
    expect(first.snapshot.channels.find(c => c.id === FIXTURE_SOURCES[6].channelId)?.subscribers).toBeNull();
    for (const source of FIXTURE_SOURCES) for (const playlist of source.playlistIds) expect(fake.calls.some(c => c.params.playlistId === playlist)).toBe(true);
    expect(fake.calls.some(c => c.resource === "search")).toBe(false);
    expect(fake.calls.filter(c => c.resource === "channels")).toHaveLength(1);
    const calls = fake.calls.length;
    const second = await collectYouTube({ key: state.key, config: FIXTURE_CONFIG, now: NOW, fetcher: fake.fetcher, cache: first.cache });
    expect(second.snapshot.channels).toEqual(first.snapshot.channels);
    expect(fake.calls.slice(calls).filter(c => c.resource === "playlistItems").every(c => c.etag)).toBe(true);
    expect(second.cache).toEqual(first.cache);
  });
  it("does not count playlist addition time, preserves ordering ties and omits unproved captions", async () => {
    const fake = fakeYouTube(); fake.videos.get("0-1").contentDetails.caption = "false";
    fake.videos.get("0-1").snippet.publishedAt = new Date(NOW - 31 * 86400000).toISOString();
    const { snapshot } = await collectYouTube({ key: state.key, config: FIXTURE_CONFIG, now: NOW, fetcher: fake.fetcher });
    expect(snapshot.channels.find(c => c.id === FIXTURE_SOURCES[0].channelId)?.recentVideoCount).toBe(5);
    expect(snapshot.channels.find(c => c.id === FIXTURE_SOURCES[0].channelId)?.videos[0].id).toBe("0-2");
  });
  it("rejects a pagination cycle without publishing an exact incomplete count", async () => {
    const fake = fakeYouTube(); const fetcher: typeof fetch = async (url, init) => {
      const response = await fake.fetcher(url, init);
      if (String(url).includes("/playlistItems") && !String(url).includes("videoId=")) {
        const data = await response.json(); data.nextPageToken = "cycle"; return new Response(JSON.stringify(data));
      }
      return response;
    };
    await expect(collectYouTube({ key: state.key, config: FIXTURE_CONFIG, now: NOW, fetcher })).rejects.toThrow("YOUTUBE_PAGINATION_CYCLE");
  });
  it("shares scheduled/manual generation, coalesces triggers, forces manual update and retains success on failure", async () => {
    const fake = fakeYouTube(); vi.stubGlobal("fetch", fake.fetcher); vi.spyOn(Date, "now").mockReturnValue(NOW);
    const [first, second] = await Promise.all([refreshYouTubeSnapshot(true), refreshYouTubeSnapshot(false)]);
    expect(second).toEqual(first); expect(fake.calls.filter(c => c.resource === "channels")).toHaveLength(1);
    expect(await readYouTubeSnapshot()).toEqual(first);
    await refreshYouTubeSnapshot(false); expect(fake.calls.filter(c => c.resource === "channels")).toHaveLength(1);
    await refreshYouTubeSnapshot(true); expect(fake.calls.filter(c => c.resource === "channels")).toHaveLength(2);
    const last = await readYouTubeSnapshot();
    vi.stubGlobal("fetch", async () => new Response("secret upstream body", { status: 500 }));
    await expect(refreshYouTubeSnapshot(true)).rejects.toThrow("YOUTUBE_API_REJECTED");
    expect(await readYouTubeSnapshot()).toEqual(last); expect(state.store.get("creator_sync/youtube")).toMatchObject({owner: "", expiresAt: 0});
    vi.unstubAllGlobals();
  });
  it("rejects direct unauthorized calls, revoked admins and concurrent instance leases; GET never generates", async () => {
    const fake = fakeYouTube(); vi.stubGlobal("fetch", fake.fetcher);
    expect((await request(app).post("/admin/creators/youtube/refresh")).status).toBe(401);
    expect((await request(app).post("/admin/creators/youtube/refresh").set("Cookie", cookie(["user"]))).status).toBe(403);
    expect((await request(app).post("/admin/creators/youtube/refresh").set("Cookie", cookie(["admin"]))).status).toBe(403);
    expect((await request(app).post("/internal/creators/youtube/refresh-snapshot")).status).toBe(401);
    state.store.set("users/test-admin", { roles: ["admin"], status: "active" });
    state.store.set("creator_sync/youtube", { owner: "other-instance", expiresAt: Date.now() + 60000 });
    expect((await request(app).post("/admin/creators/youtube/refresh").set("Cookie", cookie(["admin"]))).status).toBe(409);
    expect((await request(app).get("/public/creators-live.json")).status).toBe(503); expect(fake.calls).toHaveLength(0);
    state.store.delete("creator_sync/youtube");
    const response = await request(app).post("/admin/creators/youtube/refresh").set("Cookie", cookie(["admin"]));
    expect(response.status).toBe(200); expect(response.body.youtube.channels).toHaveLength(7);
    const count = fake.calls.length;
    expect((await request(app).get("/public/creators-live.json")).status).toBe(200); expect(fake.calls).toHaveLength(count);
    vi.unstubAllGlobals();
  });
});

describe("runtime source configuration", () => {
  it("normalizes, deduplicates and fingerprints without changing ID case or source semantics", () => {
    const first = FIXTURE_SOURCES[1], second = FIXTURE_SOURCES[0];
    const config = parseYouTubeSources(JSON.stringify([
      { channelId: " " + first.channelId + " ", playlistIds: [first.playlistIds[1], " " + first.playlistIds[0] + " ", first.playlistIds[0]] },
      { channelId: first.channelId, playlistIds: [first.playlistIds[2]] }, second,
    ]));
    expect(config).toEqual(parseYouTubeSources(JSON.stringify([second, first])));
    expect(config.sources.find(source => source.channelId === first.channelId)?.playlistIds).toEqual([...first.playlistIds].sort());
    expect(configuredYouTubeSources(JSON.stringify([first]))).toBe(configuredYouTubeSources(JSON.stringify([first])));
    expect(parseYouTubeSources(JSON.stringify([{ channelId: second.channelId }]))).toEqual(parseYouTubeSources(JSON.stringify([second])));
    expect(parseYouTubeSources(JSON.stringify([first, { channelId: first.channelId }]))).toEqual(parseYouTubeSources(JSON.stringify([first])));
  });
  it.each([undefined, "", " ", "[]", "null", "{}", "{", "[null]", "[1]",
    JSON.stringify([{channelId: "invalid"}]), JSON.stringify([{channelId: FIXTURE_SOURCES[0].channelId, playlistIds: "PLx"}]),
    JSON.stringify([{channelId: FIXTURE_SOURCES[0].channelId, playlistIds: [" "]}]),
    JSON.stringify([{channelId: FIXTURE_SOURCES[0].channelId, playlistIds: [17]}]),
    JSON.stringify([{channelId: FIXTURE_SOURCES[0].channelId, playlistIds: null}]),
    JSON.stringify([{channelId: FIXTURE_SOURCES[0].channelId, name: "unsupported"}]),
  ])("rejects invalid source configuration %s", raw => {
    expect(() => parseYouTubeSources(raw)).toThrow("YOUTUBE_SOURCES_INVALID");
  });
  it("uses uploads only for omitted/empty playlists and explicit lists exclusively", async () => {
    const sources = FIXTURE_SOURCES.slice(0, 2), fake = fakeYouTube(sources);
    const config = parseYouTubeSources(JSON.stringify(sources));
    const {snapshot} = await collectYouTube({key: state.key, config, now: NOW, fetcher: fake.fetcher});
    expect(snapshot.sourceCount).toBe(2);
    expect(snapshot.channels.every(channel => channel.name.startsWith("Synthetic channel "))).toBe(true);
    expect(snapshot.channels.every(channel => channel.url === `https://www.youtube.com/channel/${channel.id}`)).toBe(true);
    const lists = fake.calls.filter(call => call.resource === "playlistItems").map(call => call.params.playlistId);
    expect(lists).toContain("uploads-0");
    expect(lists).toContain("uploads-1");
    // Uploads are candidates only; configured membership still gates selection.
    sources[1].playlistIds.forEach(id => expect(lists).toContain(id));
  });
  it("accepts more than seven sources and batches channels/videos within fifty IDs", async () => {
    const sources = Array.from({length: 51}, (_, index) => ({channelId: "UC" + String(index).padStart(22, "0"), playlistIds: []}));
    const fake = fakeYouTube(sources), config = parseYouTubeSources(JSON.stringify(sources));
    const {snapshot} = await collectYouTube({key: state.key, config, now: NOW, fetcher: fake.fetcher});
    expect(snapshot.channels).toHaveLength(51);
    expect(matchesYouTubeSources(snapshot, config)).toBe(true);
    expect(fake.calls.filter(call => call.resource === "channels").map(call => call.params.id.split(",").length)).toEqual([50, 1]);
    expect(fake.calls.filter(call => call.resource === "videos").every(call => call.params.id.split(",").length <= 50)).toBe(true);
  });
  it("fetches duplicate playlists only once per page, including across channels", async () => {
    const sources = FIXTURE_SOURCES.slice(0, 2).map(source => ({channelId: source.channelId, playlistIds: ["PLShared"]}));
    const fake = fakeYouTube(sources);
    const config = parseYouTubeSources(JSON.stringify([...sources, sources[0]]));
    const result = await collectYouTube({key: state.key, config, now: NOW, fetcher: fake.fetcher});
    expect(result.snapshot.channels).toHaveLength(2);
    expect(fake.calls.filter(call => call.resource === "playlistItems" && call.params.playlistId === "PLShared" && !call.params.videoId)).toHaveLength(2);
  });
  it("reconciles add/remove/playlist changes within the hour, retains matching pages and skips equivalent configuration", async () => {
    const sources = FIXTURE_SOURCES.slice(0, 3).map(source => ({...source, playlistIds: [...source.playlistIds]}));
    sources[1].playlistIds.push("PLChanged");
    const fake = fakeYouTube(sources);
    vi.stubGlobal("fetch", fake.fetcher); vi.spyOn(Date, "now").mockReturnValue(NOW);
    state.sources = JSON.stringify(FIXTURE_SOURCES.slice(0, 2));
    const first = await refreshYouTubeSnapshot(false);
    const count = fake.calls.length;
    state.sources = JSON.stringify([...FIXTURE_SOURCES.slice(0, 2)].reverse());
    expect(await refreshYouTubeSnapshot(false)).toEqual(first);
    expect(fake.calls).toHaveLength(count);
    state.sources = JSON.stringify(FIXTURE_SOURCES.slice(0, 3));
    const added = await refreshYouTubeSnapshot(false);
    expect(added.channels).toHaveLength(3); expect(added.sourcesFingerprint).not.toBe(first.sourcesFingerprint);
    const callsAfterAdd = fake.calls.length;
    state.sources = JSON.stringify(FIXTURE_SOURCES.slice(1, 3));
    const removed = await refreshYouTubeSnapshot(false);
    expect(removed.channels).toHaveLength(2); expect(removed.channels.some(channel => channel.id === FIXTURE_SOURCES[0].channelId)).toBe(false);
    const reused = fake.calls.slice(callsAfterAdd).filter(call => call.resource === "playlistItems");
    expect(reused.length).toBeGreaterThan(0); expect(reused.every(call => call.etag)).toBe(true);
    const callsAfterRemove = fake.calls.length;
    state.sources = JSON.stringify([{...FIXTURE_SOURCES[1], playlistIds: ["PLChanged"]}, FIXTURE_SOURCES[2]]);
    const changed = await refreshYouTubeSnapshot(false);
    expect(changed.sourcesFingerprint).not.toBe(removed.sourcesFingerprint);
    const changedCalls = fake.calls.slice(callsAfterRemove).filter(call => call.resource === "playlistItems");
    expect(changedCalls.filter(call => call.params.playlistId === "PLChanged").every(call => !call.etag)).toBe(true);
    expect(changedCalls.filter(call => call.params.playlistId !== "PLChanged").every(call => call.etag)).toBe(true);
    expect(changedCalls.some(call => FIXTURE_SOURCES[1].playlistIds.includes(call.params.playlistId))).toBe(false);
    expect((await readYouTubeSnapshot())?.sourcesFingerprint).toBe(changed.sourcesFingerprint);
    const lastCount = fake.calls.length;
    await refreshYouTubeSnapshot(false); expect(fake.calls).toHaveLength(lastCount);
    // Removed-channel documents may remain reusable; none are globally deleted.
    expect(state.store.has("creator_youtube_cache/b_root")).toBe(true);
  });
  it("rejects missing channels and malformed responses rather than publishing incomplete results", async () => {
    const fake = fakeYouTube(), config = parseYouTubeSources(JSON.stringify(FIXTURE_SOURCES));
    const fetcher: typeof fetch = async (input, init) => {
      if (String(input).includes("/channels")) return new Response(JSON.stringify({items: []}));
      return fake.fetcher(input, init);
    };
    await expect(collectYouTube({key: state.key, config, now: NOW, fetcher})).rejects.toThrow("YOUTUBE_CHANNEL_MISSING");
    await expect(collectYouTube({key: state.key, config, now: NOW, fetcher: async () => new Response("{}")})).rejects.toThrow("YOUTUBE_RESPONSE_INVALID");
  });
  it("retains the successful snapshot/cache for invalid configuration, missing key and failed explicit playlist", async () => {
    const fake = fakeYouTube(); vi.stubGlobal("fetch", fake.fetcher); vi.spyOn(Date, "now").mockReturnValue(NOW);
    await refreshYouTubeSnapshot(false);
    const successful = structuredClone([...state.store]);
    state.sources = "[]";
    const invalid = await request(app).post("/internal/creators/youtube/refresh-snapshot").set("x-internal-token", "fixture-internal");
    expect(invalid.status).toBe(503); expect(invalid.body.error).toBe("YOUTUBE_SOURCES_INVALID");
    expect(invalid.body).toEqual({ error: "YOUTUBE_SOURCES_INVALID" });
    expect([...state.store]).toEqual(successful);
    state.sources = JSON.stringify(FIXTURE_SOURCES);
    state.key = "";
    await expect(refreshYouTubeSnapshot(true)).rejects.toThrow("YOUTUBE_NOT_CONFIGURED");
    expect([...state.store]).toEqual(successful);
    state.key = "fixture-key";
    state.sources = JSON.stringify([{channelId: FIXTURE_SOURCES[1].channelId, playlistIds: ["PLBroken"]}]);
    const paths: string[] = [];
    vi.stubGlobal("fetch", async (url, init) => {
      paths.push(String(url));
      return String(url).includes("/playlistItems") ? new Response("private upstream body", {status: 404}) : fake.fetcher(url, init);
    });
    await expect(refreshYouTubeSnapshot(false)).rejects.toThrow("YOUTUBE_PLAYLIST_MISSING");
    expect(paths.some(url => new URL(url).searchParams.get("playlistId")?.startsWith("uploads-"))).toBe(false);
    expect([...state.store]).toEqual(successful);
    expect((await request(app).get("/public/creators-live.json")).status).toBe(200);
  });
  it("rejects fresh snapshots with a missing/duplicate channel even when the fingerprint agrees", async () => {
    const fake = fakeYouTube(); vi.stubGlobal("fetch", fake.fetcher); vi.spyOn(Date, "now").mockReturnValue(NOW);
    const good = await refreshYouTubeSnapshot(false);
    state.store.get("creator_snapshots/creators-live.json").youtube.channels.pop();
    const count = fake.calls.length;
    const repaired = await refreshYouTubeSnapshot(false);
    expect(repaired.channels).toHaveLength(FIXTURE_SOURCES.length); expect(fake.calls.length).toBeGreaterThan(count);
    const duplicate = structuredClone(good); duplicate.channels[1] = duplicate.channels[0];
    expect(isYouTubeSnapshot(duplicate)).toBe(false);
    const different = structuredClone(good); different.channels[0].id = "UC" + "z".repeat(22);
    different.channels[0].videos.forEach(video => {video.channelId = different.channels[0].id;});
    expect(matchesYouTubeSources(different, parseYouTubeSources(state.sources))).toBe(false);
  });
});

describe("YouTube frontend consumer", () => {
  it("accepts a variable server count and rejects malformed/incomplete/duplicate snapshots on GET and refresh", async () => {
    vi.resetModules();
    const { loadYouTubeSnapshot } = await import("../../../src/lib/creators/youtubeClient");
    const sources = FIXTURE_SOURCES.slice(0, 2), fake = fakeYouTube(sources);
    const {snapshot} = await collectYouTube({key: state.key, config: parseYouTubeSources(JSON.stringify(sources)), now: NOW, fetcher: fake.fetcher});
    const calls: any[] = [];
    vi.stubGlobal("fetch", async (url, options) => {calls.push({url, options}); return new Response(JSON.stringify({youtube: snapshot}));});
    expect(await loadYouTubeSnapshot()).toEqual(snapshot);
    expect(await loadYouTubeSnapshot(true)).toEqual(snapshot);
    expect(calls.map(call => call.options.method)).toEqual(["GET", "POST"]);
    expect(calls.map(call => call.options.credentials)).toEqual(["omit", "include"]);
    const invalid = [
      {...snapshot, channels: snapshot.channels.slice(0, 1)},
      {...snapshot, channels: [snapshot.channels[0], snapshot.channels[0]]},
      {...snapshot, generatedAt: "invalid"},
      {...snapshot, channels: [{...snapshot.channels[0], videos: [{}]}, snapshot.channels[1]]},
      {...snapshot, sourceCount: undefined},
    ];
    for (const youtube of invalid) {
      // A fresh browser has no last-good snapshot to retain on invalid network data.
      vi.resetModules();
      const { loadYouTubeSnapshot } = await import("../../../src/lib/creators/youtubeClient");
      vi.stubGlobal("fetch", async () => new Response(JSON.stringify({youtube})));
      await expect(loadYouTubeSnapshot()).rejects.toThrow("loadError");
      await expect(loadYouTubeSnapshot(true)).rejects.toThrow("refreshError");
    }
  });
});

describe("safe YouTube failure transparency (simulated upstream/storage)", () => {
  const snapshotPath = "creator_snapshots/creators-live.json";
  const adminPost = () => request(app).post("/admin/creators/youtube/refresh").set("Cookie", cookie(["admin"]));
  const grantAdmin = () => state.store.set("users/test-admin", { roles: ["admin"], status: "active" });
  const sensitive = () => ["AI" + "za" + "Q".repeat(35), "private-" + "cookie-" + "marker", "private-" + "token-" + "marker"];
  const noLeak = (values: string[], output: unknown) => values.every(value => !JSON.stringify(output).includes(value));

  it("preserves an approved API reason and source context only for admins; keeps snapshot and cleans logs", async () => {
    const secrets = sensitive(), log = vi.spyOn(console, "error").mockImplementation(() => {});
    state.key = secrets[0]; state.sources = JSON.stringify([FIXTURE_SOURCES[1]]);
    grantAdmin(); vi.spyOn(Date, "now").mockReturnValue(NOW);
    const fake = fakeYouTube(); vi.stubGlobal("fetch", fake.fetcher);
    const good = await refreshYouTubeSnapshot(true);
    vi.stubGlobal("fetch", async (url, init) => new URL(String(url)).searchParams.get("playlistId") === [...FIXTURE_SOURCES[1].playlistIds].sort()[0]
      ? new Response(JSON.stringify({error: {message: secrets.join(" "), errors: [{reason: secrets[0]}, {reason: "quotaExceeded", message: secrets[1]}], details: {url: String(url), Authorization: secrets[2]}}}), {status: 403})
      : fake.fetcher(url, init));
    const response = await adminPost();
    expect(response.status).toBe(503);
    expect(response.body).toEqual({error: "YOUTUBE_API_REJECTED", diagnostic: {
      code: "YOUTUBE_API_REJECTED", stage: "playlist_items", httpStatus: 403, reason: "quotaExceeded",
      channelId: FIXTURE_SOURCES[1].channelId, playlistId: [...FIXTURE_SOURCES[1].playlistIds].sort()[0],
    }});
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(await readYouTubeSnapshot()).toEqual(good);
    const internal = await request(app).post("/internal/creators/youtube/refresh-snapshot").set("x-internal-token", "fixture-internal");
    // A matching young snapshot is legitimately reused by the hourly endpoint.
    expect(internal.status).toBe(200);
    expect(noLeak(secrets, [response.body, log.mock.calls])).toBe(true);
  });

  it("distinguishes an atomic publish failure and retains snapshot/cache; next manual attempt succeeds", async () => {
    const secrets = sensitive(), log = vi.spyOn(console, "error").mockImplementation(() => {});
    grantAdmin(); vi.spyOn(Date, "now").mockReturnValue(NOW);
    const fake = fakeYouTube(); vi.stubGlobal("fetch", fake.fetcher);
    const good = await refreshYouTubeSnapshot(true), successful = structuredClone([...state.store]);
    state.fault = Object.assign(new Error(secrets.join(" ")), {code: 7, details: secrets[0], metadata: {authorization: secrets[2]}});
    fake.videos.get("0-1").snippet.title = "Changed title";
    state.failPublish = true;
    const response = await adminPost();
    expect(response.status).toBe(503);
    expect(response.body).toEqual({error: "YOUTUBE_SNAPSHOT_WRITE_FAILED", diagnostic: {
      code: "YOUTUBE_SNAPSHOT_WRITE_FAILED", stage: "publish_snapshot", storageCode: "permission-denied",
    }});
    expect([...state.store]).toEqual(successful);
    expect(await readYouTubeSnapshot()).toEqual(good);
    expect(noLeak(secrets, [response.body, log.mock.calls])).toBe(true);
    state.failPublish = false;
    expect((await adminPost()).status).toBe(200);
  });

  it("separates snapshot reads from publication and gives public/internal callers no technical details", async () => {
    const secrets = sensitive(), log = vi.spyOn(console, "error").mockImplementation(() => {});
    grantAdmin(); state.failRead = snapshotPath;
    state.fault = Object.assign(new Error(secrets[0]), {code: 14, details: secrets[1]});
    const publicRead = await request(app).get("/public/creators-live.json");
    expect(publicRead.status).toBe(503);
    expect(publicRead.body).toEqual({error: "YOUTUBE_SNAPSHOT_UNAVAILABLE"});
    const admin = await adminPost();
    expect(admin.body).toEqual({error: "YOUTUBE_SNAPSHOT_READ_FAILED", diagnostic: {
      code: "YOUTUBE_SNAPSHOT_READ_FAILED", stage: "read_snapshot", storageCode: "unavailable",
    }});
    const internal = await request(app).post("/internal/creators/youtube/refresh-snapshot").set("x-internal-token", "fixture-internal");
    expect(internal.body).toEqual({error: "YOUTUBE_SNAPSHOT_READ_FAILED"});
    expect(noLeak(secrets, [admin.body, publicRead.body, internal.body, log.mock.calls])).toBe(true);
  });

  it("allows a new manual attempt after absent snapshot and failed first synchronization", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    grantAdmin();
    expect((await request(app).get("/public/creators-live.json")).body).toEqual({error: "YOUTUBE_SNAPSHOT_MISSING"});
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({error: {errors: [{reason: "forbidden"}]}}), {status: 403}));
    const failed = await adminPost();
    expect(failed.status).toBe(503); expect(failed.body.error).toBe("YOUTUBE_API_REJECTED");
    expect(await readYouTubeSnapshot()).toBeNull();
    expect(state.store.get("creator_sync/youtube")).toMatchObject({owner: "", expiresAt: 0});
    vi.stubGlobal("fetch", fakeYouTube().fetcher);
    expect((await adminPost()).status).toBe(200);
    expect(await readYouTubeSnapshot()).not.toBeNull();
    expect(log).toHaveBeenCalled();
  });

  it("reports configuration, missing playlist and busy lease with fixed sanitized context", async () => {
    const secrets = sensitive(), log = vi.spyOn(console, "error").mockImplementation(() => {});
    grantAdmin(); state.sources = secrets[0];
    const configuration = await adminPost();
    expect(configuration.body).toEqual({error: "YOUTUBE_SOURCES_INVALID", diagnostic: {code: "YOUTUBE_SOURCES_INVALID", stage: "configuration"}});
    state.sources = JSON.stringify([FIXTURE_SOURCES[1]]);
    const fake = fakeYouTube();
    vi.stubGlobal("fetch", async (url, init) => String(url).includes("/playlistItems")
      ? new Response(JSON.stringify({error:{message:secrets[0],errors:[{reason:"playlistNotFound"}]}}), {status:404})
      : fake.fetcher(url, init));
    const missing = await adminPost();
    expect(missing.body.error).toBe("YOUTUBE_PLAYLIST_MISSING");
    expect(missing.body.diagnostic).toMatchObject({stage:"playlist_items",httpStatus:404,reason:"playlistNotFound",channelId:FIXTURE_SOURCES[1].channelId});
    state.store.set("creator_sync/youtube", {owner:"other-instance",expiresAt:Date.now()+60000});
    const busy = await adminPost();
    expect(busy.status).toBe(409); expect(busy.headers["retry-after"]).toBe("5");
    expect(busy.body).toEqual({error:"YOUTUBE_SYNC_BUSY",diagnostic:{code:"YOUTUBE_SYNC_BUSY",stage:"acquire_lock"}});
    expect(noLeak(secrets, [configuration.body,missing.body,busy.body,log.mock.calls])).toBe(true);
  });

  it("distinguishes request timeout, network failure and malformed response without copying exception text", async () => {
    const secrets = sensitive();
    const cases = [
      {code:"YOUTUBE_TIMEOUT",fetcher:async()=>{throw new DOMException(secrets[0],"TimeoutError");}},
      {code:"YOUTUBE_UNREACHABLE",fetcher:async()=>{throw new Error(secrets.join(" "));}},
      {code:"YOUTUBE_RESPONSE_INVALID",fetcher:async()=>new Response(secrets.join(" "))},
    ];
    for(const item of cases){
      const error = await collectYouTube({key:secrets[0],config:FIXTURE_CONFIG,fetcher:item.fetcher}).catch(error=>error);
      const diagnostic = youtubeDiagnostic(error);
      expect(diagnostic).toEqual({code:item.code,stage:"channels"});
      expect(noLeak(secrets,diagnostic)).toBe(true);
    }
  });

  it("cleans unknown/malicious failures, unapproved reasons, fake IDs and credential-like fields", () => {
    const secrets = sensitive(), log = vi.spyOn(console,"error").mockImplementation(()=>{});
    const raw = Object.assign(new Error(secrets.join(" ")), {url:"https://example.invalid/?key="+secrets[0],headers:{Cookie:secrets[1]},reason:"quotaExceeded"});
    expect(youtubeDiagnostic(raw)).toEqual({code:"YOUTUBE_REFRESH_FAILED",stage:"refresh"});
    logYouTubeFailure(raw);
    const error = new YouTubeFailure("YOUTUBE_API_REJECTED",{
      stage:"playlist_items",httpStatus:403,reason:secrets[0],channelId:secrets[0],playlistId:"PL"+secrets[0],message:secrets[1],
    } as any);
    expect(youtubeDiagnostic(error)).toEqual({code:"YOUTUBE_API_REJECTED",stage:"playlist_items",httpStatus:403});
    expect(youtubeReason({error:{errors:[{reason:secrets[0],message:secrets[1]}]}})).toBeUndefined();
    expect(noLeak(secrets,[youtubeDiagnostic(error),log.mock.calls])).toBe(true);
  });

  it("frontend keeps only approved response codes and distinguishes absent snapshot, busy and untrusted error text", async () => {
    const secrets = sensitive();
    for(const item of [
      {status:503,error:"YOUTUBE_SNAPSHOT_MISSING",refresh:false,message:"snapshotMissing",code:"YOUTUBE_SNAPSHOT_MISSING"},
      {status:503,error:"YOUTUBE_API_REJECTED",refresh:true,message:"refreshError",code:"YOUTUBE_API_REJECTED"},
      {status:409,error:secrets[0],refresh:true,message:"busy",code:"YOUTUBE_SYNC_BUSY"},
      {status:503,error:secrets[0],refresh:true,message:"refreshError",code:"YOUTUBE_REFRESH_FAILED"},
      {status:503,error:"YOUTUBE_SNAPSHOT_READ_FAILED",refresh:false,message:"loadError",code:"YOUTUBE_SNAPSHOT_UNAVAILABLE"},
    ]){
      vi.resetModules();
      const { loadYouTubeSnapshot, YouTubeClientError } = await import("../../../src/lib/creators/youtubeClient");
      vi.stubGlobal("fetch",async()=>new Response(JSON.stringify({error:item.error,message:secrets[0],diagnostic:{stage:secrets[1],reason:secrets[2]}}),{status:item.status}));
      const error = await loadYouTubeSnapshot(item.refresh).catch(error=>error);
      expect(error).toBeInstanceOf(YouTubeClientError);
      expect(error.message).toBe(item.message);expect(error.code).toBe(item.code);
      expect(noLeak(secrets,[error.message,error.code,error.stack])).toBe(true);
    }
  });
});

describe("Patch 1.1.2 storage", () => {
  it("selects ten public own videos by publication date across arbitrary lists and keeps the old three-video response", async () => {
    const source = FIXTURE_SOURCES[0], config = parseYouTubeSources(JSON.stringify([source])), fake = fakeYouTube([source]);
    const ids = Array.from({ length: 17 }, (_, i) => "selection-" + i);
    ids.forEach((id, i) => fake.videos.set(id, { id, snippet: { channelId: i === 2 ? "foreign" : source.channelId, title: id, publishedAt: new Date(NOW - (40 + i) * 86400000).toISOString() }, status: { privacyStatus: i === 0 ? "private" : "public" }, contentDetails: { duration: "PT1M" } }));
    fake.videos.delete(ids[1]);
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("playlistItems")) return new Response(JSON.stringify({ etag: "ordered", items: [...ids].reverse().concat(ids[4]).map(id => ({ contentDetails: { videoId: id, videoPublishedAt: new Date(NOW - (40 + Number(id.split("-")[1])) * 86400000).toISOString() } })) }));
      return fake.fetcher(input, init);
    };
    vi.stubGlobal("fetch", fetcher); state.sources = JSON.stringify([source]); vi.spyOn(Date, "now").mockReturnValue(NOW);
    const result = await refreshYouTubeSnapshot(true);
    expect(result.channels[0].videos.map(video => video.id)).toEqual(ids.slice(3, 13));
    expect(result.channels[0].recentVideoCount).toBe(0);
    expect(isYouTubeSnapshot(result)).toBe(true);
    expect((await request(app).get("/public/creators-live.json")).body.youtube.channels[0].videos).toHaveLength(3);
    expect((await request(app).get("/public/creators-live.json?videos=10")).body.youtube.channels[0].videos).toHaveLength(10);
    expect(state.store.get("creator_snapshots/creators-live.json").youtube.channels[0].videos).toHaveLength(10);
  });
  it("measures separate document operations and preserves payload bytes when only check time changes", async () => {
    const fake = fakeYouTube(); vi.stubGlobal("fetch", fake.fetcher);
    const clock = vi.spyOn(Date, "now").mockReturnValue(NOW), ledger: Record<string, unknown> = {};
    let previous: unknown;
    for (const [index, label] of ["initial", "unchanged", "changed"].entries()) {
      clock.mockReturnValue(NOW + index * 3600001);
      if (label === "changed") fake.videos.get("0-1").snippet.title = "One small change";
      state.reads.length = state.writes.length = state.deletes.length = 0;
      const result = await refreshYouTubeSnapshot(true);
      ledger[label] = { reads: state.reads.length, writes: state.writes.length, deletes: state.deletes.length, cacheWrites: state.writes.filter(path => path.startsWith("creator_youtube_cache/")).length, payloadWrites: state.writes.filter(path => path.startsWith("creator_snapshots/")).length };
      if (label === "unchanged") {
        expect(state.store.get("creator_snapshots/creators-live.json")).toEqual(previous);
        expect(state.writes).toEqual(["creator_sync/youtube", "creator_sync/youtube"]);
        expect(result.generatedAt).toBe(new Date(NOW + 3600001).toISOString());
      }
      expect(state.deletes).toHaveLength(0);
      previous = structuredClone(state.store.get("creator_snapshots/creators-live.json"));
    }
    state.reads.length = state.writes.length = state.deletes.length = 0;
    await request(app).get("/public/creators-live.json?videos=10");
    ledger.public = { reads: state.reads.length, writes: state.writes.length, deletes: state.deletes.length };
    console.log("SIMULATED_YOUTUBE_DOCUMENT_OPERATIONS " + JSON.stringify(ledger));
    expect(ledger).toMatchObject({ initial: { reads: 10, writes: 4, deletes: 0 }, unchanged: { reads: 4, writes: 2, deletes: 0 }, changed: { reads: 4, writes: 4, cacheWrites: 1, payloadWrites: 1 }, public: { reads: 0, writes: 0, deletes: 0 } });
  });
  it("reuses legacy channel pages before migration and retains cache-read diagnostics", async () => {
    const fake = fakeYouTube(), first = await collectYouTube({ key: state.key, config: FIXTURE_CONFIG, now: NOW, fetcher: fake.fetcher });
    for (const [id, value] of Object.entries(first.cache)) state.store.set("creator_youtube_cache/" + id, value);
    const before = fake.calls.length; vi.stubGlobal("fetch", fake.fetcher); vi.spyOn(Date, "now").mockReturnValue(NOW);
    await refreshYouTubeSnapshot(true);
    expect(fake.calls.slice(before).filter(call => call.resource === "playlistItems").every(call => call.etag)).toBe(true);
    const snapshot = state.store.get("creator_snapshots/creators-live.json");
    state.failRead = "creator_youtube_cache/b_root"; state.fault = { code: 14 };
    const error = await refreshYouTubeSnapshot(true).catch(error => error);
    expect(youtubeDiagnostic(error)).toMatchObject({ code: "YOUTUBE_CACHE_READ_FAILED", stage: "read_cache", storageCode: "unavailable" });
    expect(state.store.get("creator_snapshots/creators-live.json")).toEqual(snapshot);
  });
});

describe("current uploads and persistent source membership", () => {
  function library(total = 2721, restricted = true) {
    const channelId = FIXTURE_SOURCES[2].channelId, playlistId = "PLHistoricalOldestFirst";
    const config = parseYouTubeSources(JSON.stringify([{ channelId, playlistIds: restricted ? [playlistId] : [] }]));
    const publishedAt = (i: number) => new Date(NOW - (total - 1 - i) * 86400000).toISOString();
    const ids = Array.from({ length: total }, (_, i) => `library-${i}`), selected = new Set(ids);
    const records = new Map(ids.map((id, i) => [id, { id, snippet: { channelId, title: id, publishedAt: publishedAt(i) }, contentDetails: { duration: "PT2M" }, status: { privacyStatus: "public" } }]));
    const calls: { resource: string; playlistId?: string; videoId?: string; token?: string }[] = [];
    let transferred = 0;
    const fetcher: typeof fetch = async input => {
      const url = new URL(String(input)), resource = url.pathname.split("/").pop()!, p = url.searchParams;
      calls.push({ resource, playlistId: p.get("playlistId") ?? undefined, videoId: p.get("videoId") ?? undefined, token: p.get("pageToken") ?? undefined });
      let data: any;
      if (resource === "channels") data = { items: [{ id: channelId, snippet: { title: "Synthetic mixed library" }, contentDetails: { relatedPlaylists: { uploads: "UUFixtureLibrary" } } }] };
      else if (resource === "videos") data = { items: p.get("id")!.split(",").map(id => records.get(id)).filter(Boolean) };
      else {
        const list = p.get("playlistId") === playlistId ? ids.filter(id => selected.has(id)) : [...ids].reverse();
        const start = Number(p.get("pageToken") || 0);
        const items = p.has("videoId") ? list.filter(id => id === p.get("videoId")) : list.slice(start, start + 50);
        if (p.has("videoId") && (!items.length || !records.has(p.get("videoId")!))) {
          const body = JSON.stringify({error:{errors:[{reason:"videoNotFound"}]}});
          transferred += Buffer.byteLength(body); return new Response(body, {status:404});
        }
        data = { etag: "library", ...(!p.has("videoId") && start + 50 < list.length ? { nextPageToken: String(start + 50) } : {}), items: items.map(id => ({ contentDetails: { videoId: id, videoPublishedAt: records.get(id)?.snippet.publishedAt }, snippet: { videoOwnerChannelId: channelId } })) };
      }
      const body = JSON.stringify(data); transferred += Buffer.byteLength(body); return new Response(body);
    };
    return { config, channelId, playlistId, records, selected, ids, calls, fetcher, bytes: () => transferred };
  }
  it("indexes a 2721-entry oldest-first source once and reuses it while keeping 30-day counts beyond ten", async () => {
    const fake = library(), first = await collectYouTube({ key: state.key, config: fake.config, now: NOW, fetcher: fake.fetcher });
    const channel = first.snapshot.channels[0];
    expect(channel.videos.map(v => v.id)).toEqual(fake.ids.slice(-10).reverse());
    expect(channel.recentVideoCount).toBe(31); expect(channel.complete).toBe(true);
    const bootstrap = () => fake.calls.filter(c => c.playlistId === fake.playlistId && !c.videoId);
    expect(bootstrap()).toHaveLength(55);
    const before = fake.calls.length, bytes = fake.bytes();
    const second = await collectYouTube({ key: state.key, config: fake.config, now: NOW + 3600000, fetcher: fake.fetcher, cache: first.cache });
    expect(bootstrap()).toHaveLength(55);
    expect(second.snapshot.channels[0].videos).toEqual(channel.videos);
    expect(second.snapshot.channels[0].recentVideoCount).toBe(30);
    expect(fake.calls.slice(before).filter(c => c.playlistId === "UUFixtureLibrary")).toHaveLength(1);
    console.log("SIMULATED_2721_LIBRARY " + JSON.stringify({coldRequests: before, warmRequests: fake.calls.length - before, coldJsonBytes: bytes, warmJsonBytes: fake.bytes() - bytes, historicalPagesCold: 55, historicalPagesWarm: 0}));
  });
  it("checks new/late recent membership, excludes other games and removes lost memberships on a warm run", async () => {
    const fake = library(70); fake.selected.delete(fake.ids.at(-1)!);
    const first = await collectYouTube({ key: state.key, config: fake.config, now: NOW, fetcher: fake.fetcher });
    expect(first.snapshot.channels[0].videos[0].id).toBe("library-68");
    fake.selected.add("library-69"); fake.selected.delete("library-68");
    const second = await collectYouTube({ key: state.key, config: fake.config, now: NOW, fetcher: fake.fetcher, cache: first.cache });
    expect(second.snapshot.channels[0].videos[0].id).toBe("library-69");
    expect(second.snapshot.channels[0].videos.some(v => v.id === "library-68")).toBe(false);
    fake.ids.push("new-mixed-upload");
    fake.records.set("new-mixed-upload", {id:"new-mixed-upload",snippet:{channelId:fake.channelId,title:"Other game",publishedAt:new Date(NOW).toISOString()},contentDetails:{duration:"PT1M"},status:{privacyStatus:"public"}});
    const third = await collectYouTube({ key: state.key, config: fake.config, now: NOW, fetcher: fake.fetcher, cache: second.cache });
    expect(third.snapshot.channels[0].videos.some(v => v.id === "new-mixed-upload")).toBe(false);
    fake.selected.add("new-mixed-upload");
    const fourth = await collectYouTube({ key: state.key, config: fake.config, now: NOW, fetcher: fake.fetcher, cache: third.cache });
    expect(fourth.snapshot.channels[0].videos.some(v => v.id === "new-mixed-upload")).toBe(true);
  });
  it("drops unavailable historical probes before publishing so an unchanged warm cache needs no write", async () => {
    const fake = library(70); fake.records.delete("library-0");
    const first = await collectYouTube({ key: state.key, config: fake.config, now: NOW, fetcher: fake.fetcher });
    expect(first.cache[fake.channelId].pages[`${fake.playlistId}:video:library-0`]).toBeUndefined();
    const second = await collectYouTube({ key: state.key, config: fake.config, now: NOW, fetcher: fake.fetcher, cache: first.cache });
    expect(second.cache).toEqual(first.cache);
    expect(second.snapshot.channels).toEqual(first.snapshot.channels);
  });
  it("keeps uploads unrestricted for an empty selection and backfills unavailable/future candidates", async () => {
    const fake = library(15, false);
    fake.records.get("library-14")!.status.privacyStatus = "private";
    fake.records.delete("library-13");
    fake.records.get("library-12")!.snippet.publishedAt = new Date(NOW + 86400000).toISOString();
    const result = await collectYouTube({ key: state.key, config: fake.config, now: NOW, fetcher: fake.fetcher });
    expect(result.snapshot.channels[0].videos.map(v => v.id)).toEqual(fake.ids.slice(2, 12).reverse());
    expect(result.snapshot.channels[0].recentVideoCount).toBe(12);
    expect(fake.calls.some(c => c.playlistId === fake.playlistId)).toBe(false);
  });
});
