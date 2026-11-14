import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCatalog, type CreatorCatalog } from "./types";
import { catalogDocuments, readCatalog } from "./storage";
import { createCatalogReader } from "./reader";
import { documentBytes, SAFE_DOCUMENT_BYTES } from "../storage/bundles";

const sample = (): CreatorCatalog => ({ schemaVersion: 1, creators: [{ id: "cr_001", name: "Creator", languages: ["de"], channels: [
  { platform: "youtube", name: "First", channelId: "UC" + "a".repeat(22), url: "https://www.youtube.com/channel/UC" + "a".repeat(22) },
  { platform: "youtube", name: "Second", channelId: "UC" + "b".repeat(22), url: "https://www.youtube.com/channel/UC" + "b".repeat(22) },
  { platform: "twitch", name: "Other name", login: "creator", url: "https://www.twitch.tv/creator" },
] }] });
afterEach(() => vi.restoreAllMocks());
describe("independent public creator catalog", () => {
  it("retains multiple channels and unknown Twitch IDs while stripping private fields", () => {
    const raw: any = sample(); raw.secret = "private"; raw.creators[0].email = "private"; raw.creators[0].channels[0].sourceConfig = "private";
    expect(parseCatalog(raw)).toEqual(sample()); expect(parseCatalog(raw).creators[0].channels[2]).not.toHaveProperty("userId");
  });
  it("rejects duplicate ownership, invented platforms and unsafe links", () => {
    const duplicate = sample(); duplicate.creators.push({ ...duplicate.creators[0], id: "cr_002" });
    expect(() => parseCatalog(duplicate)).toThrow();
    for (const url of ["javascript:alert(1)", "https://evil.example/channel/x"]) {
      const raw = sample(); raw.creators[0].channels[0].url = url; expect(() => parseCatalog(raw)).toThrow();
    }
  });
  it("uses exactly one document/read for small catalogs, with no write path", async () => {
    const docs = catalogDocuments(sample()), get = vi.fn(async (p: string) => docs.get(p));
    expect(docs.size).toBe(1); expect(await readCatalog(get)).toEqual(sample()); expect(get).toHaveBeenCalledTimes(1);
  });
  it("automatically splits oversized catalogs and oversized creators without data loss", async () => {
    const raw = sample(); raw.creators[0].name = "Ő😀".repeat(180000);
    const docs = catalogDocuments(raw);
    expect(docs.size).toBeGreaterThan(1);
    for (const [p, value] of docs) expect(documentBytes(p, value)).toBeLessThanOrEqual(SAFE_DOCUMENT_BYTES);
    expect(await readCatalog(async p => docs.get(p))).toEqual(raw);
    const part = [...docs.keys()].find(p => p.includes("/parts/"))!; docs.delete(part);
    await expect(readCatalog(async p => docs.get(p))).rejects.toThrow();
  });
  it("coalesces concurrent misses and uses a fixed cache expiry", async () => {
    let now = 100000; vi.spyOn(Date, "now").mockImplementation(() => now);
    let resolve!: (v: CreatorCatalog) => void;
    const load = vi.fn(() => new Promise<CreatorCatalog>(r => { resolve = r; }));
    const read = createCatalogReader(load, "test:catalog:concurrency");
    const a = read(), b = read(); resolve(sample()); await Promise.all([a, b]); expect(load).toHaveBeenCalledTimes(1);
    now += 59000; await read(); expect(load).toHaveBeenCalledTimes(1);
    now += 1001; const next = read(); resolve(sample()); await next; expect(load).toHaveBeenCalledTimes(2);
  });
  it("retains successful data and marks it stale after an outage, then recovers", async () => {
    let now = 500000; vi.spyOn(Date, "now").mockImplementation(() => now);
    const load = vi.fn().mockResolvedValueOnce(sample()).mockRejectedValueOnce(Error("outage")).mockResolvedValueOnce(sample());
    const read = createCatalogReader(load, "test:catalog:stale");
    expect((await read()).stale).toBe(false); now += 60001;
    expect(await read()).toEqual({ ...sample(), stale: true }); await read(); expect(load).toHaveBeenCalledTimes(2);
    now += 15001; expect((await read()).stale).toBe(false);
  });
});

vi.mock("../firebase", () => ({ db: { doc: vi.fn() } }));
describe("public creator endpoint", () => {
  it("serves the actual Express handler from bundled storage and sanitizes failures", async () => {
    const { db } = await import("../firebase"), { creatorHubHandler } = await import("./route");
    let now = 1000000; vi.spyOn(Date, "now").mockImplementation(() => now);
    const get = vi.fn(async () => ({ data: () => sample() })); vi.mocked(db.doc).mockReturnValue({ get } as any);
    const response: any = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    await Promise.all([creatorHubHandler({} as any, response), creatorHubHandler({} as any, response)]);
    expect(get).toHaveBeenCalledTimes(1); expect(response.json).toHaveBeenLastCalledWith({ ...sample(), stale: false });
    now += 60001; get.mockRejectedValueOnce(Error("secret backend detail"));
    await creatorHubHandler({} as any, response); expect(response.json).toHaveBeenLastCalledWith({ ...sample(), stale: true });
    expect(JSON.stringify(response.json.mock.calls)).not.toContain("secret backend");
  });
});
