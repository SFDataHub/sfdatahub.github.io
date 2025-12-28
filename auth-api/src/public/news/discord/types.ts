export type DiscordApiAuthor = {
  id: string;
  username: string;
  global_name?: string | null;
  discriminator?: string;
};

export type DiscordApiAttachment = {
  id: string;
  url: string;
  filename?: string | null;
  content_type?: string | null;
  width?: number | null;
  height?: number | null;
};

export type DiscordApiEmbed = {
  url?: string | null;
  title?: string | null;
  description?: string | null;
  fields?: Array<{ name?: string | null; value?: string | null }>;
  image?: { url?: string | null } | null;
  thumbnail?: { url?: string | null } | null;
};

export type DiscordApiMessage = {
  id: string;
  channel_id: string;
  guild_id?: string;
  type?: number;
  author?: DiscordApiAuthor;
  content?: string;
  timestamp?: string;
  attachments?: DiscordApiAttachment[];
  embeds?: DiscordApiEmbed[];
};

export type DiscordNewsItem = {
  id: string;
  channelId: string;
  author: string;
  timestamp: string;
  contentText: string;
  imageUrl: string | null;
  jumpUrl: string;
};

export type DiscordNewsResponse = {
  updatedAt: string;
  item: DiscordNewsItem | null;
};

export type DiscordNewsListResponse = {
  updatedAt: string;
  items: DiscordNewsItem[];
};

export type DiscordNewsByChannelEntry = {
  channelId: string;
  label: string;
  item: DiscordNewsItem | null;
};

export type DiscordNewsByChannelResponse = {
  updatedAt: string;
  items: DiscordNewsByChannelEntry[];
};

export type DiscordNewsChannelDiagnostics = {
  channelId: string;
  fetched: number;
  usable: number;
  picked: string | null;
  source?: "content" | "embed" | "attachment" | "none";
  reason?: string;
};
