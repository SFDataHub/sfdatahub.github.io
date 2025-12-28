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

export type DiscordListResponse = {
  updatedAt: string;
  items: DiscordNewsItem[];
};
