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
  latestRecordAnnouncements?: DiscordLatestRecordAnnouncements;
};

export type DiscordListResponse = {
  updatedAt: string;
  items: DiscordNewsItem[];
};

export type DiscordRecordAnnouncementItem = {
  id: string;
  messageId: string;
  channelId: string;
  channelName: string;
  postedAt: string;
  content: string;
  author: string;
  imageUrl: string | null;
  jumpUrl: string;
  recordLabel?: string | null;
  holderDisplay?: string | null;
  scopeLabel?: string | null;
  server?: string | null;
  days?: string | null;
  previousHolderDisplay?: string | null;
  previousDays?: string | null;
  recordKey?: string | null;
  recordFamily?: string | null;
};

export type DiscordLatestRecordAnnouncements = {
  items: DiscordRecordAnnouncementItem[];
};
