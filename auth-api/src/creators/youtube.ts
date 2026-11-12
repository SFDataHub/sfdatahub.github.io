import type { YouTubeChannel, YouTubeSnapshot, YouTubeVideo } from "./types";

import { matchesYouTubeSources, type YouTubeSourcesConfig } from "./sources";
import { YouTubeFailure, youtubeReason, isYouTubeTimeout } from "./errors";

type Entry = { id: string; publishedAt: string; owner: string };
type Page = { etag: string; next: string; entries: Entry[] };
type Index = { entries: Entry[]; end: boolean };
export interface ChannelCache { pages: Record<string, Page>; videos: Record<string, YouTubeVideo>; indexes?: Record<string, Index>; }
export type YouTubeCache = Record<string, ChannelCache>;
const DAY = 86400000;
const dateOrder = (a: { id: string; publishedAt: string }, b: { id: string; publishedAt: string }) =>
  Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id);
const thumbnail = (v: any): string => v?.maxres?.url || v?.high?.url || v?.medium?.url || v?.default?.url || "";

export async function collectYouTube(options: {
  key: string;
  config: YouTubeSourcesConfig;
  cache?: YouTubeCache;
  now?: number;
  fetcher?: typeof fetch;
}): Promise<{ snapshot: YouTubeSnapshot; cache: YouTubeCache }> {
  if (!options.key) throw new YouTubeFailure("YOUTUBE_NOT_CONFIGURED", { stage: "configuration" });
  const now = options.now ?? Date.now(), cutoff = now - 30 * DAY;
  const fetcher = options.fetcher ?? fetch;
  const deadline = Date.now() + 180000;
  let requests = 0;
  async function api(resource: "channels" | "playlistItems" | "videos", params: Record<string, string>, etag?: string, source: { channelId?: string; playlistId?: string } = {}): Promise<any> {
    const context = { stage: resource === "playlistItems" ? "playlist_items" as const : resource, ...source };
    if (Date.now() >= deadline) throw new YouTubeFailure("YOUTUBE_TIMEOUT", context);
    const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
    Object.entries({ ...params, key: options.key }).forEach(([k, v]) => url.searchParams.set(k, v));
    requests++;
    let response: Response;
    try {
      response = await fetcher(url, { headers: etag ? { "If-None-Match": etag } : {}, signal: AbortSignal.timeout(Math.min(15000, deadline - Date.now())) });
    } catch (error) { throw new YouTubeFailure(isYouTubeTimeout(error) ? "YOUTUBE_TIMEOUT" : "YOUTUBE_UNREACHABLE", context); }
    if (response.status === 304) return null;
    if (!response.ok) {
      let reason;
      // Only approved reason tokens survive. Never retain body, message, URL or headers.
      try { reason = youtubeReason(await response.json()); } catch { /* Status remains useful without a valid body. */ }
      // A documented negative single-video lookup is not a missing playlist.
      // The playlist was indexed successfully; do not abort mixed-channel scans.
      if (resource === "playlistItems" && params.videoId && response.status === 404 && reason === "videoNotFound") return { items: [] };
      const code = resource === "playlistItems" && (response.status === 404 || reason === "playlistNotFound") ? "YOUTUBE_PLAYLIST_MISSING"
        : reason === "channelNotFound" ? "YOUTUBE_CHANNEL_MISSING" : "YOUTUBE_API_REJECTED";
      throw new YouTubeFailure(code, { ...context, httpStatus: response.status, reason });
    }
    let result;
    try { result = await response.json(); }
    catch (error) { throw new YouTubeFailure(isYouTubeTimeout(error) ? "YOUTUBE_TIMEOUT" : "YOUTUBE_RESPONSE_INVALID", context); }
    if (!Array.isArray(result?.items) || result.items.some((item: any) => !item || typeof item !== "object" || Array.isArray(item)) ||
        (result.nextPageToken !== undefined && typeof result.nextPageToken !== "string") ||
        (result.etag !== undefined && typeof result.etag !== "string")) throw new YouTubeFailure("YOUTUBE_RESPONSE_INVALID", context);
    return result;
  }
  const metadata = new Map<string, any>();
  for (let offset = 0; offset < options.config.sources.length; offset += 50) {
    const batch = options.config.sources.slice(offset, offset + 50);
    const result = await api("channels", { part: "snippet,statistics,contentDetails", id: batch.map(source => source.channelId).join(","), maxResults: "50", fields: "items(id,snippet(title,thumbnails,defaultLanguage),statistics(subscriberCount,hiddenSubscriberCount),contentDetails/relatedPlaylists/uploads)" }, undefined, batch.length === 1 ? { channelId: batch[0].channelId } : {});
    if (!Array.isArray(result?.items)) throw new YouTubeFailure("YOUTUBE_RESPONSE_INVALID", { stage: "channels" });
    for (const channel of result.items) metadata.set(channel.id, channel);
  }
  const playlistPages = new Map<string, Page>();
  const cache: YouTubeCache = {}, channels: YouTubeChannel[] = [];
  for (const source of options.config.sources) {
    const channel = metadata.get(source.channelId);
    if (!channel) throw new YouTubeFailure("YOUTUBE_CHANNEL_MISSING", { stage: "channels", channelId: source.channelId });
    if (typeof channel.snippet?.title !== "string" || !channel.snippet.title.trim()) throw new YouTubeFailure("YOUTUBE_CHANNEL_METADATA_MISSING", { stage: "channels", channelId: source.channelId });
    const old = options.cache?.[source.channelId];
    const current: ChannelCache = { pages: {}, videos: {}, indexes: {} };
    cache[source.channelId] = current;
    const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) throw new YouTubeFailure("YOUTUBE_UPLOADS_MISSING", { stage: "channels", channelId: source.channelId });
    const entries = new Map<string, Entry>();
    const own = (entry: Entry) => !entry.owner || entry.owner === source.channelId;
    async function page(playlistId: string, token = "", videoId = ""): Promise<Page> {
      const key = videoId ? `${playlistId}:video:${videoId}` : `${playlistId}:${token}`;
      const previous = old?.pages[key];
      let value = playlistPages.get(key);
      if (!value) {
        const result = await api("playlistItems", { part: "snippet,contentDetails", playlistId, maxResults: "50",
          fields: "etag,nextPageToken,items(contentDetails(videoId,videoPublishedAt),snippet(videoOwnerChannelId,resourceId/videoId))",
          ...(token ? { pageToken: token } : {}), ...(videoId ? { videoId } : {}) }, previous?.etag, { channelId: source.channelId, playlistId });
        value = result ? { etag: result.etag || "", next: result.nextPageToken || "", entries: result.items.map((item: any) => ({
          id: item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || "",
          publishedAt: item.contentDetails?.videoPublishedAt || "", owner: item.snippet?.videoOwnerChannelId || "",
        })).filter((entry: Entry) => entry.id) } : previous;
        if (!value) throw new YouTubeFailure("YOUTUBE_CACHE_MISSING", { stage: "playlist_items", channelId: source.channelId, playlistId });
        playlistPages.set(key, value);
      }
      current.pages[key] = value;
      return value;
    }
    // One-time source indexing, independent of playlist order. Reuse legacy pages
    // and persist the result: hourly runs never paginate these historical lists.
    const indexes = new Map<string, Map<string, Entry>>();
    for (const playlistId of source.playlistIds) {
      const known = old?.indexes?.[playlistId];
      const index = new Map<string, Entry>();
      if (known?.end) known.entries.filter(own).forEach(entry => index.set(entry.id, entry));
      else {
        let token = "";
        const tokens = new Set<string>();
        do {
          if (tokens.has(token)) throw new YouTubeFailure("YOUTUBE_PAGINATION_CYCLE", { stage: "playlist_items", channelId: source.channelId, playlistId });
          tokens.add(token);
          const value = await page(playlistId, token);
          value.entries.filter(own).forEach(entry => index.set(entry.id, entry));
          token = value.next;
        } while (token);
      }
      indexes.set(playlistId, index);
      index.forEach(entry => entries.set(entry.id, entry));
    }
    const details = new Map<string, YouTubeVideo>(), checked = new Set<string>(), matched = new Set<string>();
    async function membership(entry: Entry) {
      if (!source.playlistIds.length || matched.has(entry.id)) return;
      matched.add(entry.id);
      let selected = false;
      // videoId is a documented SINGLE-video filter, never a comma-separated batch
      // or a title/game heuristic. Refresh relevant known matches as well as misses.
      const preferred = [...source.playlistIds].sort((a, b) => Number(indexes.get(b)!.has(entry.id)) - Number(indexes.get(a)!.has(entry.id)));
      for (const playlistId of preferred) {
        const index = indexes.get(playlistId)!;
        const value = await page(playlistId, "", entry.id);
        const member = value.entries.find(item => item.id === entry.id && own(item));
        if (member) { index.set(entry.id, member); selected = true; break; }
        else index.delete(entry.id);
      }
      if (!selected) entries.delete(entry.id);
    }
    async function loadDetails(ids: string[]) {
      ids.forEach(id => checked.add(id));
      const query = `videos:${ids.join(",")}`, previous = old?.pages[query];
      const result = await api("videos", { part: "snippet,contentDetails,status", id: ids.join(","),
        fields: "etag,items(id,snippet(channelId,title,publishedAt,liveBroadcastContent,thumbnails,defaultAudioLanguage,defaultLanguage),contentDetails(duration,caption),status/privacyStatus)" }, previous?.etag, { channelId: source.channelId });
      current.pages[query] = result ? { etag: result.etag || "", next: "", entries: [] } : previous!;
      if (!result) {
        if (!previous) throw new YouTubeFailure("YOUTUBE_CACHE_MISSING", { stage: "videos", channelId: source.channelId });
        for (const id of ids) if (old?.videos[id]) details.set(id, old.videos[id]);
        return;
      }
      for (const v of result.items) {
        if (Date.parse(v.snippet?.publishedAt) > now) current.pages[query].etag = "";
        if (v.snippet?.channelId !== source.channelId || v.status?.privacyStatus !== "public" || v.snippet?.liveBroadcastContent === "upcoming") continue;
        if (!Number.isFinite(Date.parse(v.snippet?.publishedAt)) || Date.parse(v.snippet.publishedAt) > now) continue;
        details.set(v.id, { id: v.id, channelId: source.channelId, title: v.snippet.title, thumbnail: thumbnail(v.snippet.thumbnails),
          publishedAt: v.snippet.publishedAt, duration: v.contentDetails?.duration || "", caption: v.contentDetails?.caption === "true",
          languages: [...new Set<string>([v.snippet.defaultAudioLanguage, v.snippet.defaultLanguage].filter(Boolean))] });
      }
    }
    async function hydrate() {
      for (;;) {
        const sorted = [...entries.values()].sort(dateOrder);
        const recent = sorted.filter(entry => !checked.has(entry.id) && (!entry.publishedAt || Date.parse(entry.publishedAt) >= cutoff));
        const next = recent.length ? recent.slice(0, 50) : details.size < 10 ? sorted.filter(entry => !checked.has(entry.id)).slice(0, 10 - details.size) : [];
        if (!next.length) break;
        // Bound independent single-video lookups; do not serialize an entire
        // recent window or introduce retries/unbounded upstream concurrency.
        for (let offset = 0; offset < next.length; offset += 5) {
          const batch = await Promise.allSettled(next.slice(offset, offset + 5).map(async entry => {
            await membership(entry); if (!entries.has(entry.id)) checked.add(entry.id);
          }));
          for (const result of batch) if (result.status === "rejected") throw result.reason;
        }
        const ids = next.filter(entry => entries.has(entry.id)).map(entry => entry.id);
        if (ids.length) await loadDetails(ids);
      }
    }
    // Uploads provide new candidates. The retained recent window plus a head
    // overlap avoids rereading older upload pages on warm runs.
    const priorUploads = old?.indexes?.[uploads];
    const uploaded = new Map<string, Entry>(priorUploads?.entries.map(entry => [entry.id, entry]) ?? []);
    let token = "", end = false;
    const tokens = new Set<string>();
    do {
      if (tokens.has(token)) throw new YouTubeFailure("YOUTUBE_PAGINATION_CYCLE", { stage: "playlist_items", channelId: source.channelId, playlistId: uploads });
      tokens.add(token);
      const value = await page(uploads, token);
      const overlap = value.entries.some(entry => uploaded.has(entry.id));
      value.entries.filter(own).forEach(entry => uploaded.set(entry.id, entry));
      // Seed recent missed/late playlist additions; historical source matches came
      // from the persistent index, so unrelated old uploads need no game checks.
      for (const entry of uploaded.values()) if (!source.playlistIds.length || !entry.publishedAt || Date.parse(entry.publishedAt) >= cutoff) entries.set(entry.id, entry);
      token = value.next; end = !token || (overlap && !!priorUploads?.end);
      const coveredWindow = value.entries.some(entry => Number.isFinite(Date.parse(entry.publishedAt)) && Date.parse(entry.publishedAt) < cutoff);
      if (!token || coveredWindow || (overlap && priorUploads)) {
        // Canonical batches cover the retained window together on cold and warm
        // runs, so identical data retains identical query ETags/cache bundles.
        await hydrate();
        if (!token || source.playlistIds.length || details.size >= 10) break;
      }
    } while (token);
    // A 30-day boundary limits the count, never playlist position or top-ten sort.
    const videos = [...details.values()].sort(dateOrder);
    const keepUploads = new Set([...uploaded.values()].sort(dateOrder).slice(0, 50).map(entry => entry.id));
    current.indexes![uploads] = { entries: [...uploaded.values()].filter(entry => keepUploads.has(entry.id) || details.has(entry.id) || !entry.publishedAt || Date.parse(entry.publishedAt) >= cutoff).sort(dateOrder), end };
    for (const [playlistId, index] of indexes) current.indexes![playlistId] = { entries: [...index.values()].sort(dateOrder), end: true };
    // Keep upload-page ETags stable; raw historical pages are replaced by the
    // persistent index. Query metadata is retained only while still relevant.
    for (const [key, value] of Object.entries(old?.pages ?? {})) if (key.startsWith(`${uploads}:`) && !current.pages[key]) current.pages[key] = value;
    for (const key of Object.keys(current.pages)) if (source.playlistIds.some(id => key.startsWith(`${id}:`) && !key.startsWith(`${id}:video:`))) delete current.pages[key];
    const retainedIds = new Set(Object.values(current.indexes!).flatMap(index => index.entries.map(entry => entry.id)));
    for (const key of Object.keys(current.pages)) {
      const marker = key.indexOf(":video:");
      if (marker >= 0 && !retainedIds.has(key.slice(marker + 7))) delete current.pages[key];
    }
    for (const v of videos) current.videos[v.id] = v;
    const complete = true;
    const languages = [...new Set(videos.flatMap(v => v.languages))];
    if (!languages.length && channel.snippet?.defaultLanguage) languages.push(channel.snippet.defaultLanguage);
    const subscribers = channel.statistics?.hiddenSubscriberCount || channel.statistics?.subscriberCount == null ? null : Number(channel.statistics.subscriberCount);
    channels.push({ id: source.channelId, name: channel.snippet.title, url: `https://www.youtube.com/channel/${channel.id}`,
      avatar: channel.snippet?.thumbnails?.medium?.url || channel.snippet?.thumbnails?.default?.url || thumbnail(channel.snippet?.thumbnails), subscribers: subscribers !== null && Number.isFinite(subscribers) ? subscribers : null,
      languages, languageSource: languages.length ? "youtube" : "unknown",
      recentVideoCount: videos.filter(v => Date.parse(v.publishedAt) >= cutoff).length, complete, videos: videos.slice(0, 10) });
  }
  channels.sort((a, b) => (Date.parse(b.videos[0]?.publishedAt || "") || 0) - (Date.parse(a.videos[0]?.publishedAt || "") || 0) || a.id.localeCompare(b.id));
  const snapshot: YouTubeSnapshot = { generatedAt: new Date(now).toISOString(), sourcesFingerprint: options.config.fingerprint,
    sourceCount: options.config.sources.length, channels, requests };
  if (!matchesYouTubeSources(snapshot, options.config)) throw new YouTubeFailure("YOUTUBE_SNAPSHOT_INCOMPLETE", { stage: "validate_snapshot" });
  return { snapshot, cache };
}
