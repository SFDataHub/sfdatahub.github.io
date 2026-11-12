import type { YouTubeCache } from "./youtube";
import { digest } from "../storage/bundles";

type Fragment = { channel: string; kind: "pages" | "videos" | "indexes"; key: string; part: number; data: string };
// Split individual pages/details too: a single huge channel or page cannot force
// an oversized document. Fixed fragments affect only that entry when it changes.
export function cacheEntries(cache: YouTubeCache): Record<string, Fragment> {
  const entries: Record<string, Fragment> = {};
  for (const [channel, value] of Object.entries(cache)) for (const kind of ["pages", "videos", "indexes"] as const) {
    for (const [key, item] of Object.entries(value[kind] ?? {})) {
      const text = JSON.stringify(item);
      for (let offset = 0, part = 0; offset < text.length; part++) {
        let end = Math.min(text.length, offset + 16384);
        if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
        const fragment = { channel, kind, key, part, data: text.slice(offset, end) };
        offset = end;
        entries[digest([channel, kind, key, part])] = fragment;
      }
    }
  }
  return entries;
}
export function restoreCache(documents: Array<Record<string, unknown>>): YouTubeCache {
  const grouped = new Map<string, Fragment[]>(), cache: YouTubeCache = {};
  for (const document of documents) for (const raw of Object.values(document.entries as Record<string, Fragment>)) {
    const key = JSON.stringify([raw.channel, raw.kind, raw.key]);
    const list = grouped.get(key) ?? []; list.push(raw); grouped.set(key, list);
  }
  for (const fragments of grouped.values()) {
    fragments.sort((a, b) => a.part - b.part);
    if (fragments.some((f, index) => f.part !== index)) throw Error("Incomplete cache fragments");
    const { channel, kind, key } = fragments[0];
    const value = JSON.parse(fragments.map(f => f.data).join(""));
    const restored = cache[channel] ??= { pages: {}, videos: {} };
    if (kind === "indexes") restored.indexes ??= {};
    restored[kind]![key] = value;
  }
  return cache;
}
