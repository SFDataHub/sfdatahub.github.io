import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicYouTubeCache } from "./publicSnapshot";
import type { YouTubeSnapshot } from "./types";

const now = Date.parse("2026-11-12T16:30:00Z");
const snapshot = (minute = 0): YouTubeSnapshot => ({
  generatedAt: new Date(now + minute * 60000).toISOString(), sourcesFingerprint: "a".repeat(64), sourceCount: 1, requests: 1,
  channels: [{ id: "UC" + "0".repeat(22), name: "Public fixture", url: "https://www.youtube.com/channel/UC" + "0".repeat(22), avatar: "", subscribers: null, languages: [], languageSource: "unknown", complete: true, recentVideoCount: 0, videos: [] }],
});
beforeEach(() => { vi.restoreAllMocks(); vi.spyOn(Date, "now").mockReturnValue(now); });
describe("public YouTube response cache", () => {
  it("coalesces concurrent readers and never slides the successful expiry on a hit", async () => {
    const cache = new PublicYouTubeCache(), data = snapshot();
    let finish!: (value: YouTubeSnapshot) => void;
    const read = vi.fn(() => new Promise<YouTubeSnapshot>(resolve => { finish = resolve; }));
    const a = cache.read(read), b = cache.read(read); expect(a).toBe(b); expect(read).toHaveBeenCalledTimes(1);
    finish(data); expect(await a).toEqual(data); const expires = cache.expiresAt;
    vi.mocked(Date.now).mockReturnValue(now + 59000); expect(await cache.read(read)).toEqual(data); expect(cache.expiresAt).toBe(expires);
    vi.mocked(Date.now).mockReturnValue(now + 60000); await cache.read(async () => data); expect(cache.expiresAt).toBe(now + 120000);
  });
  it("manual publication wins over a GET that started earlier", async () => {
    const cache = new PublicYouTubeCache(); let finish!: (value: YouTubeSnapshot) => void;
    const pending = cache.read(() => new Promise<YouTubeSnapshot>(resolve => { finish = resolve; }));
    cache.publish(snapshot(1)); finish(snapshot()); expect(await pending).toEqual(snapshot(1));
    expect(await cache.read(async () => { throw Error("should not read"); })).toEqual(snapshot(1));
  });
  it("preserves the actual last success on read failure or temporarily absent storage", async () => {
    const cache = new PublicYouTubeCache(); cache.publish(snapshot()); vi.mocked(Date.now).mockReturnValue(now + 60001);
    expect(await cache.read(async () => { throw Error("simulated outage"); })).toEqual(snapshot());
    vi.mocked(Date.now).mockReturnValue(now + 66000); expect(await cache.read(async () => null)).toEqual(snapshot());
    expect((await cache.read(async () => snapshot(1)))!.generatedAt).toBe(snapshot().generatedAt);
  });
  it("does not retain a missing first snapshot longer than five seconds", async () => {
    const cache = new PublicYouTubeCache(), missing = vi.fn(async () => null);
    expect(await cache.read(missing)).toBeNull(); expect(await cache.read(missing)).toBeNull(); expect(missing).toHaveBeenCalledTimes(1);
    vi.mocked(Date.now).mockReturnValue(now + 5000); expect(await cache.read(async () => snapshot())).toEqual(snapshot());
  });
  it("bounds cache freshness at the publication boundary and keeps instances independent", async () => {
    vi.mocked(Date.now).mockReturnValue(Date.parse("2026-11-12T17:01:50Z"));
    const first = new PublicYouTubeCache(), second = new PublicYouTubeCache(), read = vi.fn(async () => snapshot());
    await first.read(read); expect(first.expiresAt).toBe(Date.parse("2026-11-12T17:02:00Z"));
    await second.read(read); expect(read).toHaveBeenCalledTimes(2);
  });
});
