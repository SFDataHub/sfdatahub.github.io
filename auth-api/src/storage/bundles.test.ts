import { describe, expect, it } from "vitest";
import { documentBytes, packBundles, digest, SAFE_DOCUMENT_BYTES, assertAtomicSize } from "./bundles";
import { cacheEntries, restoreCache } from "../creators/cache";
import { fragmentEntries } from "./fragments";
import type { YouTubeCache } from "../creators/youtube";

describe("size-bounded persistent bundles", () => {
  it("counts UTF-8, field names, nested structures and document names", () => {
    expect(documentBytes("c/d", { word: "é😀", map: { n: 2 }, list: [true, null, "x"] })).toBe(16 + 2 + 2 + 32 + 5 + 7 + 4 + 32 + 2 + 8 + 5 + 1 + 1 + 2);
    expect(documentBytes("c/d", { value: "😀".repeat(150000) })).toBeGreaterThan(SAFE_DOCUMENT_BYTES);
  });
  it("losslessly splits one large channel, keeps ETags and Unicode, and changes only one existing leaf", () => {
    const cache: YouTubeCache = { UCfixture: { pages: {}, videos: {} } };
    for (let i = 0; i < 12; i++) cache.UCfixture.pages["playlist:" + i] = { etag: "tag-" + i, next: String(i + 1), entries: [{ id: "字😀".repeat(18000), owner: "UCfixture", publishedAt: "2026-11-12T12:00:00Z" }] };
    const path = (id: string) => "creator_youtube_cache/" + id;
    const first = packBundles(cacheEntries(cache), undefined, path);
    expect(first.documents.size).toBeGreaterThan(1);
    expect(restoreCache([...first.documents.values()])).toEqual(cache);
    for (const [id, value] of first.documents) expect(documentBytes(path(id), value)).toBeLessThanOrEqual(SAFE_DOCUMENT_BYTES);
    const unchanged = packBundles(cacheEntries(cache), first.leaves, path);
    expect(unchanged).toEqual(first);
    cache.UCfixture.pages["playlist:0"].etag = "new-tag";
    const next = packBundles(cacheEntries(cache), first.leaves, path);
    expect(next.leaves).toEqual(first.leaves);
    const changed = [...next.documents].filter(([id, value]) => digest(first.documents.get(id)) !== digest(value));
    expect(changed).toHaveLength(1);
    const empty = packBundles({}, next.leaves, path);
    expect(empty.leaves).toEqual(next.leaves);
    console.log("SIMULATED_LARGE_CHANNEL_BYTES " + JSON.stringify({ leaves: first.documents.size, bytes: [...first.documents].map(([id, value]) => documentBytes(path(id), value)), changedLeaves: changed.length }));
  });
  it("splits overflowing 512 KiB public bundles locally without truncation", () => {
    const rows = Object.fromEntries(Array.from({ length: 4000 }, (_, i) => [digest(i), { path: "/player/" + i, today: i, total: i, dailyAverage: i }]));
    const path = (id: string) => "visitor_metrics_public/bundled/pages/" + id;
    const first = packBundles(rows, undefined, path, value => ({ ...value, basis: "day", schemaVersion: 4 }));
    expect(first.documents.size).toBeGreaterThan(1);
    expect(Object.values(Object.fromEntries(first.documents)).reduce((sum, doc) => sum + Object.keys(doc.entries as object).length, 0)).toBe(4000);
    for (const [id, value] of first.documents) expect(documentBytes(path(id), value)).toBeLessThanOrEqual(SAFE_DOCUMENT_BYTES);
    const key = digest(10); rows[key] = { path: "/player/10", today: 99, total: 99, dailyAverage: 99 };
    const changed = packBundles(rows, first.leaves, path, value => ({ ...value, basis: "day", schemaVersion: 4 }));
    expect(changed.leaves).toEqual(first.leaves);
    expect([...changed.documents].filter(([id, value]) => digest(first.documents.get(id)) !== digest(value))).toHaveLength(1);
    expect(() => assertAtomicSize([{ path: "a/b", value: { data: "x".repeat(600000) } }])).toThrow("safe size");
    console.log("SIMULATED_PUBLIC_4000_BYTES " + JSON.stringify({ leaves: first.documents.size, bytes: [...first.documents].map(([id, value]) => documentBytes(path(id), value)) }));
  });
  it("reassembles one oversized Unicode metric entry without splitting surrogate pairs", () => {
    const key = digest("page"), value = { path: "/" + "字😀".repeat(100000), today: 1, total: 1, dailyAverage: 1 };
    const prepared = fragmentEntries({ [key]: value }, "basis", id => "visitor_metrics_public/bundled/pages/" + id);
    const pointer = prepared.entries[key] as { parts: Array<{ id: string; hash: string }> };
    expect(pointer.parts.length).toBeGreaterThan(1);
    const text = pointer.parts.map(part => {
      const fragment = prepared.fragments.get(part.id)!;
      expect(digest(fragment)).toBe(part.hash);
      expect(documentBytes("visitor_metrics_public/bundled/pages/" + part.id, fragment)).toBeLessThanOrEqual(SAFE_DOCUMENT_BYTES);
      // Encoding/decoding every fragment models actual Firestore UTF-8 storage.
      return Buffer.from(fragment.data as string, "utf8").toString("utf8");
    }).join("");
    expect(JSON.parse(text)).toEqual(value);
  });

  it("splits only the affected existing public leaf when it later overflows", () => {
    const entries = Object.fromEntries(Array.from({ length: 4000 }, (_, i) => [digest(i), { path: "/player/" + i, today: i, total: i, dailyAverage: i }]));
    const path = (id: string) => "visitor_metrics_public/bundled/pages/" + id;
    const wrap = (value: { entries: Record<string, unknown> }) => ({ ...value, schemaVersion: 4, basis: "basis" });
    const before = packBundles(entries, undefined, path, wrap);
    const id = digest("one growing leaf"); entries[id] = { path: "/player/" + "x".repeat(240000), today: 1, total: 1, dailyAverage: 1 };
    const after = packBundles(entries, before.leaves, path, wrap);
    expect(after.documents.size).toBe(3);
    const unchanged = [...after.documents].filter(([key, value]) => before.documents.has(key) && digest(before.documents.get(key)) === digest(value));
    expect(unchanged).toHaveLength(1);
    const writes = [...after.documents].filter(([key, value]) => !before.documents.has(key) || digest(before.documents.get(key)) !== digest(value));
    expect(writes).toHaveLength(2);
    console.log("SIMULATED_LOCAL_SPLIT " + JSON.stringify({ before: before.leaves, after: after.leaves, unchangedDocuments: unchanged.map(([id]) => id), changedOrNewDocuments: writes.map(([id]) => id), documentWrites: 2, documentDeletes: 0, syncModel: { reads: 5, writes: 5, deletes: 0 }, publicColdModel: { reads: 2, writes: 0, deletes: 0 } }));
  });

});
