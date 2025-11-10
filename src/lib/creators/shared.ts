export type Platform = "YouTube" | "Twitch" | "TikTok" | "Discord";

export interface PlatformLink {
  type: Platform;
  url: string;
  verified?: boolean;
}

export interface Creator {
  id: string;
  name: string;
  avatar: string;
  description: string;
  language: string;
  subscribers: number;
  totalViews: number;
  weeklyViews: number;
  weeklyPosts: number;
  lastActive: string;
  platforms: PlatformLink[];
}

export interface SheetCreatorRow {
  name: string;
  code?: string;
  latestActivity?: string;
  youtube?: string;
  twitch?: string;
  drops?: string;
  discord?: string;
  avatar?: string;
}

export type CreatorWarningLevel = "warning" | "error";

export interface CreatorWarning {
  creator: string;
  scope: string;
  level: CreatorWarningLevel;
  message: string;
  source?: string;
}

export interface CreatorSnapshot {
  generatedAt: string;
  data: Creator[];
  warnings?: CreatorWarning[];
  stats?: {
    youtubeLookups?: number;
    twitchLookups?: number;
  };
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .replace(/-{2,}/g, "-")
    .trim();
}

export function parseSheetDate(value?: string): string {
  if (!value) return new Date().toISOString();
  const parts = value.split(".");
  if (parts.length === 3) {
    const [day, month, year] = parts.map((p) => parseInt(p, 10));
    if (!Number.isNaN(day) && !Number.isNaN(month) && !Number.isNaN(year)) {
      return new Date(year, month - 1, day).toISOString();
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export function ensureUrl(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.length) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("discord.gg")) return `https://${trimmed}`;
  if (trimmed.startsWith("discord.com")) return `https://${trimmed}`;
  if (trimmed.startsWith("www")) return `https://${trimmed}`;
  return trimmed.includes(".") ? `https://${trimmed}` : null;
}

export function buildDescription(row: SheetCreatorRow): string {
  const bits: string[] = [];
  if (row.code) bits.push(`Creator code: ${row.code}`);
  if (row.drops) bits.push(`Drops access: ${row.drops}`);
  bits.push("Imported from the SFDataHub community sheet.");
  return bits.join(" • ");
}

export function defaultAvatarFor(row: SheetCreatorRow): string {
  if (row.avatar) return row.avatar;
  const slug = slugify(row.code || row.name || "creator");
  return `/avatars/${slug}.png`;
}

export function sheetRowToCreator(row: SheetCreatorRow): Creator {
  const slug = slugify(row.code || row.name || "creator");
  const platforms: PlatformLink[] = [];
  const youtube = ensureUrl(row.youtube);
  if (youtube) platforms.push({ type: "YouTube", url: youtube });
  const twitch = ensureUrl(row.twitch);
  if (twitch) platforms.push({ type: "Twitch", url: twitch });
  const discord = ensureUrl(row.discord);
  if (discord) platforms.push({ type: "Discord", url: discord });

  return {
    id: `sheet-${slug}`,
    name: row.name,
    avatar: defaultAvatarFor(row),
    description: buildDescription(row),
    language: "de",
    subscribers: 0,
    totalViews: 0,
    weeklyViews: 0,
    weeklyPosts: row.drops ? 3 : 1,
    lastActive: parseSheetDate(row.latestActivity),
    platforms,
  };
}

export type { Creator as CreatorRecord };
