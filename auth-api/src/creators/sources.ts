import { createHash } from "node:crypto";
import { isYouTubeSnapshot, type YouTubeSnapshot } from "./types";

export interface YouTubeSource {
  readonly channelId: string;
  readonly playlistIds: readonly string[];
}
export interface YouTubeSourcesConfig {
  readonly sources: readonly YouTubeSource[];
  readonly fingerprint: string;
}
export class YouTubeSourcesError extends Error {
  constructor(detail: string) {
    super(`YOUTUBE_SOURCES_INVALID: ${detail}`);
  }
}

// This parser is independent of runtime configuration so fixtures need no credentials.
export function parseYouTubeSources(raw?: string): YouTubeSourcesConfig {
  if (!raw?.trim()) throw new YouTubeSourcesError("Set YOUTUBE_SOURCES to a non-empty JSON array.");
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new YouTubeSourcesError("YOUTUBE_SOURCES must contain valid JSON."); }
  if (!Array.isArray(value) || !value.length) throw new YouTubeSourcesError("Expected a non-empty array of channel objects.");
  const channels = new Map<string, Set<string>>();
  for (const [index, entry] of value.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new YouTubeSourcesError(`Entry ${index + 1} must be an object.`);
    if (Object.keys(entry).some(key => !["channelId", "playlistIds"].includes(key))) throw new YouTubeSourcesError(`Entry ${index + 1} supports only channelId and playlistIds.`);
    if (typeof entry.channelId !== "string" || !/^UC[A-Za-z0-9_-]{22}$/.test(entry.channelId.trim())) throw new YouTubeSourcesError(`Entry ${index + 1} requires a valid channelId.`);
    if (entry.playlistIds !== undefined && !Array.isArray(entry.playlistIds)) throw new YouTubeSourcesError(`Entry ${index + 1}: playlistIds must be an array.`);
    const id = entry.channelId.trim();
    const playlists = channels.get(id) ?? new Set<string>();
    for (const playlist of entry.playlistIds ?? []) {
      if (typeof playlist !== "string" || !/^[A-Za-z0-9_-]+$/.test(playlist.trim())) throw new YouTubeSourcesError(`Entry ${index + 1} contains an invalid playlist ID.`);
      playlists.add(playlist.trim());
    }
    // Duplicate entries merge explicit playlists; an empty duplicate never widens to uploads.
    channels.set(id, playlists);
  }
  const sources = Object.freeze([...channels].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([channelId, playlists]) => Object.freeze({ channelId, playlistIds: Object.freeze([...playlists].sort()) })));
  const fingerprint = createHash("sha256").update(JSON.stringify(sources)).digest("hex");
  return Object.freeze({ sources, fingerprint });
}

// One memoized interpretation feeds collection, cache addressing and completeness checks.
let parsed: { raw: string | undefined; config: YouTubeSourcesConfig } | undefined;
export function configuredYouTubeSources(raw?: string): YouTubeSourcesConfig {
  if (parsed && parsed.raw === raw) return parsed.config;
  const config = parseYouTubeSources(raw);
  parsed = { raw, config };
  return config;
}
export function matchesYouTubeSources(value: unknown, config: YouTubeSourcesConfig): value is YouTubeSnapshot {
  return isYouTubeSnapshot(value) && value.sourcesFingerprint === config.fingerprint &&
    value.channels.length === config.sources.length &&
    config.sources.every(source => value.channels.some(channel => channel.id === source.channelId));
}
