export type DiscordNewsItem = {
  id: string;
  channelId: string;
  author: string;
  timestamp: string;
  contentText: string;
  imageUrl: string | null;
  jumpUrl: string;
};

export type DiscordLatestResponse = {
  updatedAt: string;
  item: DiscordNewsItem | null;
};

export type DiscordNewsByChannelEntry = {
  channelId: string;
  label: string;
  item: DiscordNewsItem | null;
};

export type DiscordByChannelResponse = {
  updatedAt: string;
  items: DiscordNewsByChannelEntry[];
};

export type DiscordByChannelSnapshot = {
  updatedAt: number | null;
  nextUpdateAt: number | null;
  hash: string;
  items: DiscordNewsByChannelEntry[];
};

export type DiscordListResponse = {
  updatedAt: string;
  items: DiscordNewsItem[];
};
