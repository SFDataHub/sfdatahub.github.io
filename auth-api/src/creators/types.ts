export interface YouTubeVideo {
  id: string;
  channelId: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
  duration: string;
  caption: boolean;
  languages: string[];
}
export interface YouTubeChannel {
  id: string;
  name: string;
  url: string;
  avatar: string;
  subscribers: number | null;
  languages: string[];
  languageSource: "youtube" | "creator" | "unknown";
  recentVideoCount: number;
  complete: boolean;
  videos: YouTubeVideo[];
}
export interface YouTubeSnapshot {
  generatedAt: string;
  sourcesFingerprint: string;
  sourceCount: number;
  channels: YouTubeChannel[];
  requests: number;
}

const record = (value: any): value is Record<string, any> => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: any): value is string => typeof value === "string";
const date = (value: any): boolean => text(value) && Number.isFinite(Date.parse(value));
const count = (value: any): boolean => Number.isSafeInteger(value) && value >= 0;
const languages = (value: any): boolean => Array.isArray(value) && value.every(code => text(code) && /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(code));

// Consumers validate the server's declared count and structure, never a second source list.
export function isYouTubeSnapshot(value: unknown): value is YouTubeSnapshot {
  if (!record(value) || !date(value.generatedAt) || !count(value.requests) ||
      !text(value.sourcesFingerprint) || !/^[a-f0-9]{64}$/.test(value.sourcesFingerprint) ||
      !count(value.sourceCount) || !value.sourceCount ||
      !Array.isArray(value.channels) || value.channels.length !== value.sourceCount) return false;
  const ids = new Set<string>();
  return value.channels.every((channel: any) => {
    if (!record(channel) || !text(channel.id) || !/^UC[A-Za-z0-9_-]{22}$/.test(channel.id) || ids.has(channel.id) ||
        !text(channel.name) || !channel.name.trim() || !text(channel.url) ||
        !/^https:\/\/www\.youtube\.com\/(?:channel\/UC[A-Za-z0-9_-]{22}|@[^\s/?#]+)$/.test(channel.url) ||
        !text(channel.avatar) || !(channel.subscribers === null || count(channel.subscribers)) ||
        !languages(channel.languages) || !["youtube", "creator", "unknown"].includes(channel.languageSource) ||
        !count(channel.recentVideoCount) || typeof channel.complete !== "boolean" ||
        !Array.isArray(channel.videos) || channel.videos.length > 10) return false;
    ids.add(channel.id);
    const videos = new Set<string>();
    return channel.videos.every((video: any) => {
      if (!record(video) || !text(video.id) || !video.id.trim() || videos.has(video.id) || video.channelId !== channel.id ||
          !text(video.title) || !video.title.trim() || !text(video.thumbnail) || !date(video.publishedAt) ||
          !text(video.duration) || typeof video.caption !== "boolean" || !languages(video.languages)) return false;
      videos.add(video.id);
      return true;
    });
  });
}
