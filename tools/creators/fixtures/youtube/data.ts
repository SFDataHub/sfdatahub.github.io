// Deliberately synthetic edge cases. These are not evidence of live source validity.
import fixtureSources from "./sources.json";
import { parseYouTubeSources } from "../../../../auth-api/src/creators/sources";
export const FIXTURE_SOURCES: {channelId: string; playlistIds: string[]}[] = fixtureSources;
export const FIXTURE_CONFIG = parseYouTubeSources(JSON.stringify(FIXTURE_SOURCES));
export const NOW = Date.parse("2026-11-11T12:00:00Z");
const date = (days: number) => new Date(NOW - days * 86400000).toISOString();
export function fakeYouTube(sources: readonly {channelId: string; playlistIds?: readonly string[]}[] = FIXTURE_SOURCES) {
  const YOUTUBE_SOURCES = sources.map((source, index) => ({id: source.channelId, playlists: source.playlistIds ?? [], name: `Synthetic channel ${index}`}));
  const calls: { resource: string; params: Record<string, string>; etag?: string }[] = [];
  const videos = new Map<string, any>();
  for (const [index, source] of YOUTUBE_SOURCES.entries()) {
    for (let n = 0; n < 7; n++) {
      const id = `${index}-${n}`;
      videos.set(id, { id, snippet: { channelId: source.id, title: `${source.name}: video ${n}`, publishedAt: date(n === 0 ? 1000 : n + index), defaultAudioLanguage: index === 4 ? "hu" : "de", thumbnails: { high: { url: "https://i.ytimg.com/vi/test/hqdefault.jpg" } } }, contentDetails: { duration: "PT12M34S", caption: n % 2 ? "true" : "false" }, status: { privacyStatus: "public" } });
    }
  }
  const fetcher = async (input: any, init?: RequestInit) => {
    const url = new URL(String(input));
    const resource = url.pathname.split("/").pop()!;
    const params = Object.fromEntries(url.searchParams); delete params.key;
    const etag = (init?.headers as Record<string, string>)?.["If-None-Match"];
    calls.push({ resource, params, etag });
    let data: any;
    if (resource === "channels") data = { items: YOUTUBE_SOURCES.map((source, index) => ({ id: source.id, snippet: { title: source.name, thumbnails: { high: { url: "https://yt3.googleusercontent.com/test" } } }, contentDetails: { relatedPlaylists: { uploads: `uploads-${index}` } }, statistics: index === 6 ? { hiddenSubscriberCount: true } : { subscriberCount: "12400" } })).filter(channel => params.id.split(",").includes(channel.id)) };
    else if (resource === "playlistItems") {
      const index = YOUTUBE_SOURCES.findIndex((source, i) => (source.playlists as readonly string[]).includes(params.playlistId) || params.playlistId === `uploads-${i}`);
      if (index < 0) throw Error(`Unexpected fixture source ${params.playlistId}`);
      if (etag) return new Response(null, { status: 304 });
      const first = !params.pageToken;
      const nums = params.videoId ? [0, 1, 2, 3, 4, 5, 6].filter(n => `${index}-${n}` === params.videoId)
        : params.playlistId.startsWith("uploads-") ? first ? [1, 2, 3] : [3, 4, 5, 6, 0]
        : first ? [0, 1, 2] : [2, 3, 4, 5, 6];
      data = { etag: '"fixture-etag"', ...(first && !params.videoId ? { nextPageToken: "second" } : {}), items: nums.map(n => ({ snippet: { publishedAt: date(0), videoOwnerChannelId: YOUTUBE_SOURCES[index].id }, contentDetails: { videoId: `${index}-${n}`, videoPublishedAt: videos.get(`${index}-${n}`).snippet.publishedAt } })) };
      if (!first && !params.videoId) data.items.push({ snippet: { videoOwnerChannelId: "foreign" }, contentDetails: { videoId: "foreign", videoPublishedAt: date(0) } });
    } else if (resource === "videos") data = { items: params.id.split(",").map(id => videos.get(id)).filter(Boolean) };
    else throw Error(`Unexpected fixture resource ${resource}`);
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return { calls, videos, fetcher: fetcher as typeof fetch };
}
