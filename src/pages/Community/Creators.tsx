import React, { useEffect, useMemo, useState } from "react";
import "./creators.css";

type Platform = "YouTube" | "Twitch" | "TikTok" | "Discord";

type SortKey = "subs" | "views" | "activity" | "language";

type DisplayMode = "cards" | "table" | "json";

type DataMode = "static" | "dynamic";

interface PlatformLink {
  type: Platform;
  url: string;
  verified?: boolean;
}

interface Creator {
  id: string;
  name: string;
  avatar: string; // URL or path in /public
  description: string;
  language: string; // e.g. "de", "en"
  subscribers: number;
  totalViews: number;
  weeklyViews: number;
  weeklyPosts: number;
  lastActive: string; // ISO date
  platforms: PlatformLink[];
}

interface SheetCreatorRow {
  name: string;
  code?: string;
  latestActivity?: string;
  youtube?: string;
  twitch?: string;
  drops?: string;
  discord?: string;
  avatar?: string;
}

const SHEET_SOURCE_ROWS: SheetCreatorRow[] = [
  {
    name: "DORZER",
    code: "Dorzer",
    latestActivity: "23.09.2025",
    youtube: "https://www.youtube.com/@DORZER",
    twitch: "https://www.twitch.tv/dorzer",
    drops: "Droplets",
    discord: "https://discord.gg/EWEgrCq",
  },
  {
    name: "Sergio Kurai",
    latestActivity: "01.05.2025",
    youtube: "https://www.youtube.com/@SergioKurai",
    twitch: "https://www.twitch.tv/sergiokuraiyt",
    discord: "https://discord.com/invite/BsuxhMWQYa",
  },
  {
    name: "Lootenant",
    latestActivity: "23.09.2025",
    youtube: "https://www.youtube.com/@Lootenant",
    twitch: "https://www.twitch.tv/lootenantsf",
  },
  {
    name: "Belleghar",
    latestActivity: "24.09.2025",
    youtube: "https://www.youtube.com/@Bellegahr/videos",
    twitch: "https://www.twitch.tv/bellegahr",
  },
  {
    name: "halo",
    latestActivity: "24.09.2025",
    youtube: "https://www.youtube.com/@GPS71xCyn",
    twitch: "https://www.twitch.tv/haloxmd",
  },
  {
    name: "Gorgoss",
    code: "Gorgoss",
    latestActivity: "15.09.2025",
    youtube: "https://www.youtube.com/@Gorgoss8000",
    twitch: "https://www.twitch.tv/gorgoss9000",
    discord: "https://discord.com/invite/J3gXmaRpbM",
  },
  {
    name: "TUNY",
    code: "Tuny",
    latestActivity: "23.09.2025",
    youtube: "https://www.youtube.com/@tuny-yt",
    twitch: "https://www.twitch.tv/tunyghost",
    drops: "Drops",
    discord: "https://discord.com/invite/tunysschuppen",
  },
  {
    name: "AlphaTV",
    latestActivity: "08.07.2025",
    youtube: "https://www.youtube.com/@AlphaTV01",
  },
  {
    name: "Salz_Live",
    latestActivity: "24.09.2025",
    youtube: "https://www.youtube.com/@Salz_Live",
    twitch: "https://www.twitch.tv/salz_live",
  },
  {
    name: "Kepsoo",
    code: "Kepsoo",
    latestActivity: "22.09.2025",
    youtube: "https://www.youtube.com/@kepsoo",
    discord: "https://discord.gg/FreedomSF",
  },
  {
    name: "Kysuel",
    latestActivity: "24.09.2025",
    youtube: "https://www.youtube.com/@Kysuel",
    twitch: "https://www.twitch.tv/kysuel",
  },
  {
    name: "Niisa",
    code: "Niisa",
    latestActivity: "22.09.2025",
    youtube: "https://www.youtube.com/channel/UCMSTL1cRbnfii2rbQIPJMAA",
    twitch: "https://www.twitch.tv/kysuel",
    drops: "Droplets",
    discord: "https://discord.com/invite/niisa",
  },
  {
    name: "BanditSF",
    code: "Bandit",
    latestActivity: "24.09.2025",
    twitch: "https://www.twitch.tv/banditsf",
    discord: "https://discord.com/invite/QSUBnB3MDW",
  },
  {
    name: "MoZone",
    code: "moZone",
    latestActivity: "24.09.2025",
    youtube: "https://www.youtube.com/mozone",
    twitch: "https://www.twitch.tv/mozonetv",
    drops: "Drops",
    discord: "https://discord.com/invite/cbhT3ZZqkG",
  },
  {
    name: "CHAZE",
    code: "CHAZE",
    latestActivity: "22.09.2025",
    youtube: "https://www.twitch.tv/chaze",
    twitch: "https://www.twitch.tv/chaze",
    drops: "Droplets",
    discord: "https://discord.com/invite/kCXvXVceaE",
  },
  {
    name: "MoxTales",
    latestActivity: "24.09.2025",
    youtube: "https://www.youtube.com/@MoxTales",
    twitch: "https://www.twitch.tv/moxtales",
    drops: "Droplets",
    discord: "https://discord.com/invite/rHuzrwbhcV",
  },
  {
    name: "feena1986",
    latestActivity: "22.09.2025",
    twitch: "https://www.twitch.tv/feena1986",
    drops: "Droplets",
  },
  {
    name: "Blackhammerplay",
    latestActivity: "01.08.2025",
    youtube: "https://www.youtube.com/channel/UCSbUYoE8AhJR0gVLK96USlQ",
    twitch: "https://www.twitch.tv/blackhammerplay",
    drops: "Droplets",
    discord: "https://discord.com/invite/u3mX7sfVHN",
  },
  {
    name: "Crappa",
    latestActivity: "23.09.2025",
    youtube: "https://www.youtube.com/@Crappa",
    twitch: "https://www.twitch.tv/crappa",
    drops: "Droplets",
  },
  {
    name: "der_cyberpunk",
    latestActivity: "24.09.2025",
    youtube: "https://www.youtube.com/c/dercyberpunk",
    twitch: "https://www.twitch.tv/der_cyberpunk",
    drops: "Droplets",
    discord: "https://discord.com/invite/GKV38UWCja",
  },
  {
    name: "Terste",
    latestActivity: "19.09.2025",
    youtube: "https://www.youtube.com/channel/UCq8Z8IO_3SG5Q-55fnb2gLA",
    twitch: "https://www.twitch.tv/terste",
    drops: "Droplets",
    discord: "https://discord.com/invite/4XzTYgt",
  },
  {
    name: "UweReinholzen",
    latestActivity: "24.09.2025",
    youtube: "https://www.youtube.com/channel/UC-fk4horLbcxpKqwY-XEwAg",
    twitch: "https://www.twitch.tv/uwereinholzen",
    drops: "Droplets",
    discord: "https://discord.com/invite/Qya8yBbfrg",
  },
  {
    name: "MrMoregame",
    latestActivity: "19.09.2025",
    youtube: "https://www.youtube.com/user/MrMoregame",
    twitch: "https://www.twitch.tv/mrmoregame",
    drops: "Droplets",
  },
  {
    name: "ChromieDE",
    latestActivity: "24.09.2025",
    youtube: "https://www.youtube.com/channel/UChts6QeisFXtH1B8YrJBB-A",
    twitch: "https://www.twitch.tv/chromiede",
    drops: "Droplets",
    discord: "https://discord.com/invite/tHrHt56",
  },
  {
    name: "eGoLeipzig",
    latestActivity: "24.09.2025",
    twitch: "https://www.twitch.tv/egoleipzig",
  },
  {
    name: "Aurikos_Zonestos",
    latestActivity: "23.09.2025",
    youtube: "https://www.youtube.com/channel/UCumWgXIj3ca-oEGOv40-QJg",
    twitch: "https://www.twitch.tv/aurikos_zonestos",
  },
  {
    name: "xmaexel",
    latestActivity: "24.09.2025",
    twitch: "https://www.twitch.tv/xmaexel",
    discord: "https://discord.com/invite/maexel",
  },
  {
    name: "Hunrizzle",
    code: "Hunrizzle",
    latestActivity: "01.09.2025",
    youtube: "https://www.youtube.com/@HunrizzleTV",
    discord: "https://discord.com/invite/V8ukg7GAyQ",
  },
  {
    name: "Spielestyler",
    code: "Spielestyler",
    latestActivity: "24.09.2025",
    youtube: "https://www.youtube.com/Spielestyler",
    twitch: "https://www.twitch.tv/spielestyler",
    discord: "https://discord.com/invite/aAzzvgs",
  },
  {
    name: "Plotz",
    latestActivity: "24.09.2025",
    twitch: "https://www.twitch.tv/plotz",
  },
  {
    name: "Chriddel",
    latestActivity: "24.09.2025",
    twitch: "https://www.twitch.tv/chriddel",
    discord: "https://discord.com/invite/ZQNDTD6",
  },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .replace(/-{2,}/g, "-")
    .trim();
}

function parseSheetDate(value?: string): string {
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

function ensureUrl(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.length) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("discord.gg")) return `https://${trimmed}`;
  if (trimmed.startsWith("discord.com")) return `https://${trimmed}`;
  if (trimmed.startsWith("www")) return `https://${trimmed}`;
  return trimmed.includes(".") ? `https://${trimmed}` : null;
}

function buildDescription(row: SheetCreatorRow): string {
  const bits: string[] = [];
  if (row.code) bits.push(`Creator code: ${row.code}`);
  if (row.drops) bits.push(`Drops access: ${row.drops}`);
  bits.push("Imported from the SFDataHub community sheet.");
  return bits.join(" • ");
}

function defaultAvatarFor(row: SheetCreatorRow): string {
  if (row.avatar) return row.avatar;
  const slug = slugify(row.code || row.name || "creator");
  return `/avatars/${slug}.png`;
}

function sheetRowToCreator(row: SheetCreatorRow): Creator {
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

const SHEET_CREATORS: Creator[] = SHEET_SOURCE_ROWS.map(sheetRowToCreator);

const SAMPLE_CREATORS: Creator[] = [
  {
    id: "c1",
    name: "PixelPaul",
    avatar: "/avatars/pixelpaul.png",
    description: "Indie Dev, Datenvisualisierung und Vite-Live-Streams.",
    language: "de",
    subscribers: 54000,
    totalViews: 4200000,
    weeklyViews: 58000,
    weeklyPosts: 4,
    lastActive: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    platforms: [
      { type: "YouTube", url: "https://youtube.com/@pixelpaul", verified: true },
      { type: "Twitch", url: "https://twitch.tv/pixelpaul" },
      { type: "Discord", url: "https://discord.gg/example" },
    ],
  },
  {
    id: "c2",
    name: "DataDoro",
    avatar: "/avatars/datadoro.jpg",
    description: "Kurzclips zu SQL und Datenpipelines, humorvoll erklärt.",
    language: "de",
    subscribers: 120000,
    totalViews: 11800000,
    weeklyViews: 210000,
    weeklyPosts: 9,
    lastActive: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString(),
    platforms: [
      { type: "TikTok", url: "https://tiktok.com/@datadoro", verified: true },
      { type: "YouTube", url: "https://youtube.com/@datadoro" },
    ],
  },
  {
    id: "c3",
    name: "StreamStats",
    avatar: "/avatars/streamstats.png",
    description: "Livestreams zu Analytics, ML Ops und Observability.",
    language: "en",
    subscribers: 30500,
    totalViews: 2800000,
    weeklyViews: 32000,
    weeklyPosts: 2,
    lastActive: new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString(),
    platforms: [
      { type: "Twitch", url: "https://twitch.tv/streamstats", verified: true },
      { type: "YouTube", url: "https://youtube.com/@streamstats" },
      { type: "Discord", url: "https://discord.gg/example2" },
    ],
  },
  {
    id: "c4",
    name: "KiraCodes",
    avatar: "/avatars/kiracodes.jpg",
    description: "Full‑stack Tutorials und Live‑Debugging.",
    language: "de",
    subscribers: 8800,
    totalViews: 640000,
    weeklyViews: 16000,
    weeklyPosts: 3,
    lastActive: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    platforms: [
      { type: "YouTube", url: "https://youtube.com/@kiracodes", verified: true },
      { type: "Discord", url: "https://discord.gg/example3" },
    ],
  },
  ...SHEET_CREATORS,
];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatStat(value: number, suffix?: string, formatter: (n: number) => string = formatNumber) {
  if (value <= 0) return "—";
  const val = formatter(value);
  return suffix ? `${val} ${suffix}` : val;
}

function daysSince(dateIso: string): number {
  const d = new Date(dateIso).getTime();
  return Math.max(0, Math.round((Date.now() - d) / (24 * 3600 * 1000)));
}

function bySortKey(key: SortKey, dir: "asc" | "desc") {
  const mul = dir === "asc" ? 1 : -1;
  return (a: Creator, b: Creator) => {
    switch (key) {
      case "subs":
        return (a.subscribers - b.subscribers) * mul;
      case "views":
        return (a.totalViews - b.totalViews) * mul;
      case "activity":
        return (daysSince(a.lastActive) - daysSince(b.lastActive)) * mul * -1; // more recent first if desc
      case "language":
        return a.language.localeCompare(b.language) * mul;
      default:
        return 0;
    }
  };
}

function platformIcon(p: Platform) {
  // Minimal, generic SVG markers used solely as identifiers (not brand reproductions)
  const common = { width: 16, height: 16 } as const;
  switch (p) {
    case "YouTube":
      return (
        <svg {...common} viewBox="0 0 24 24" aria-label="YouTube">
          <rect x="2" y="6" width="20" height="12" rx="3" className="cc-ico-y" />
          <polygon points="10,9 16,12 10,15" className="cc-ico-y-play" />
        </svg>
      );
    case "Twitch":
      return (
        <svg {...common} viewBox="0 0 24 24" aria-label="Twitch">
          <path d="M4 4h16v10l-4 4h-4l-2 2H8v-2H4z" className="cc-ico-t" />
          <rect x="10" y="8" width="2" height="4" className="cc-ico-t-eye" />
          <rect x="14" y="8" width="2" height="4" className="cc-ico-t-eye" />
        </svg>
      );
    case "TikTok":
      return (
        <svg {...common} viewBox="0 0 24 24" aria-label="TikTok">
          <circle cx="8" cy="16" r="4" className="cc-ico-tt" />
          <path d="M12 6v9" className="cc-ico-tt-note" />
          <path d="M12 6c2 3 5 4 7 4" className="cc-ico-tt-note" />
        </svg>
      );
    case "Discord":
      return (
        <svg {...common} viewBox="0 0 24 24" aria-label="Discord">
          <rect x="4" y="6" width="16" height="10" rx="4" className="cc-ico-d" />
          <circle cx="10" cy="11" r="1" className="cc-ico-d-eye" />
          <circle cx="14" cy="11" r="1" className="cc-ico-d-eye" />
        </svg>
      );
  }
}

function CreatorCard({ c }: { c: Creator }) {
  return (
    <article className="cc-card" key={c.id}>
      <header className="cc-card-head">
        <img
          src={c.avatar}
          alt={`${c.name} avatar`}
          className="cc-avatar"
          onError={(e) => {
            const t = e.currentTarget as HTMLImageElement;
            t.onerror = null;
            t.src =
              "data:image/svg+xml;charset=UTF-8," +
              encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="100%" height="100%" rx="32" fill="#0b1a2d"/><text x="50%" y="52%" text-anchor="middle" font-size="12" fill="#94b8ff">No Img</text></svg>'
              );
          }}
        />
        <div className="cc-card-title">
          <h3 className="cc-name">{c.name}</h3>
          <div className="cc-platforms" aria-label="Platforms">
            {c.platforms.map((pl) => (
              <a
                key={pl.type}
                href={pl.url}
                target="_blank"
                rel="noopener noreferrer"
                title={`${pl.type}${pl.verified ? " (verified)" : ""}`}
                className="cc-platform-link"
              >
                {platformIcon(pl.type)}
                <span className="cc-sr">{pl.type}</span>
              </a>
            ))}
          </div>
        </div>
      </header>
      <p className="cc-desc">{c.description}</p>
      <div className="cc-stats">
        <span title="Subscribers">{formatStat(c.subscribers, "subs")}</span>
        <span title="Total views">{formatStat(c.totalViews, "views")}</span>
        <span title="Weekly views">{formatStat(c.weeklyViews, "/wk")}</span>
        <span title="Weekly posts">{formatStat(c.weeklyPosts, "posts/wk", (n) => `${n}`)}</span>
      </div>
      <footer className="cc-meta">
        <span className="cc-badge">{c.language.toUpperCase()}</span>
        <span className="cc-meta-right">active {daysSince(c.lastActive)}d ago</span>
      </footer>
    </article>
  );
}

function TableView({ data }: { data: Creator[] }) {
  return (
    <div className="cc-table-wrap">
      <table className="cc-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Lang</th>
            <th>Subs</th>
            <th>Total Views</th>
            <th>Weekly Views</th>
            <th>Weekly Posts</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c) => (
            <tr key={c.id}>
              <td>
                <div className="cc-table-name">
                  <img src={c.avatar} alt="" className="cc-avatar-sm" />
                  <span>{c.name}</span>
                </div>
              </td>
              <td>{c.language.toUpperCase()}</td>
              <td>{formatStat(c.subscribers)}</td>
              <td>{formatStat(c.totalViews)}</td>
              <td>{formatStat(c.weeklyViews)}</td>
              <td>{formatStat(c.weeklyPosts, undefined, (n) => `${n}`)}</td>
              <td>{daysSince(c.lastActive)}d</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CommunityCreators() {
  const [dataMode, setDataMode] = useState<DataMode>("static");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("cards");
  const [sortKey, setSortKey] = useState<SortKey>("subs");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<"all" | Platform>("all");
  const [minSubs, setMinSubs] = useState<number>(0);
  const [activeWithin, setActiveWithin] = useState<number>(30);

  // Spotlight
  const [spotlightId, setSpotlightId] = useState<string | null>(null);

  // Dynamic API state
  const [apiUrl, setApiUrl] = useState<string>("");
  const [apiLoading, setApiLoading] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string>("");
  const [apiData, setApiData] = useState<Creator[] | null>(null);

  const baseData = dataMode === "static" ? SAMPLE_CREATORS : apiData ?? [];

  const languages = useMemo(() => {
    const set = new Set(baseData.map((c) => c.language));
    return Array.from(set).sort();
  }, [baseData]);

  const filtered = useMemo(() => {
    return baseData
      .filter((c) => (languageFilter === "all" ? true : c.language === languageFilter))
      .filter((c) => (platformFilter === "all" ? true : c.platforms.some((p) => p.type === platformFilter)))
      .filter((c) => c.subscribers >= minSubs)
      .filter((c) => daysSince(c.lastActive) <= activeWithin)
      .slice()
      .sort(bySortKey(sortKey, sortDir));
  }, [baseData, languageFilter, platformFilter, minSubs, activeWithin, sortKey, sortDir]);

  // Pick spotlight if none yet
  useEffect(() => {
    if (!spotlightId && filtered.length) {
      const rnd = filtered[Math.floor(Math.random() * filtered.length)];
      setSpotlightId(rnd.id);
    }
  }, [filtered, spotlightId]);

  const spotlight = useMemo(() => filtered.find((c) => c.id === spotlightId) || null, [filtered, spotlightId]);

  const topWeeklyViews = useMemo(() => filtered.slice().sort((a, b) => b.weeklyViews - a.weeklyViews).slice(0, 5), [filtered]);
  const topWeeklyPosts = useMemo(() => filtered.slice().sort((a, b) => b.weeklyPosts - a.weeklyPosts).slice(0, 5), [filtered]);

  async function tryFetchApi() {
    setApiError("");
    setApiLoading(true);
    try {
      const res = await fetch(apiUrl, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const parsed: Creator[] = Array.isArray(json)
        ? (json as Creator[])
        : Array.isArray(json?.data)
        ? (json.data as Creator[])
        : [];
      setApiData(parsed);
    } catch (e: any) {
      setApiError(e?.message || "Fetch failed");
    } finally {
      setApiLoading(false);
    }
  }

  return (
    <section className="cc-wrap">
      <div className="cc-heading">
        <h1>Content Creator Hub</h1>
        <p className="cc-sub">Profiles, stats and links to community creators.</p>
      </div>

      <div className="cc-toolbar">
        <div className="cc-toolbar-row">
          <label className="cc-field">
            <span>Data</span>
            <select value={dataMode} onChange={(e) => setDataMode(e.target.value as DataMode)}>
              <option value="static">Static</option>
              <option value="dynamic">Dynamic (API)</option>
            </select>
          </label>
          <label className="cc-field">
            <span>View</span>
            <select value={displayMode} onChange={(e) => setDisplayMode(e.target.value as DisplayMode)}>
              <option value="cards">Cards</option>
              <option value="table">Table</option>
              <option value="json">JSON</option>
            </select>
          </label>
          <label className="cc-field">
            <span>Sort by</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="subs">Subs</option>
              <option value="views">Views</option>
              <option value="activity">Activity</option>
              <option value="language">Language</option>
            </select>
          </label>
          <label className="cc-field">
            <span>Dir</span>
            <select value={sortDir} onChange={(e) => setSortDir(e.target.value as any)}>
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </label>
        </div>
        <div className="cc-toolbar-row">
          <label className="cc-field">
            <span>Language</span>
            <select value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value)}>
              <option value="all">All</option>
              {languages.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="cc-field">
            <span>Platform</span>
            <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value as any)}>
              <option value="all">All</option>
              <option value="YouTube">YouTube</option>
              <option value="Twitch">Twitch</option>
              <option value="TikTok">TikTok</option>
              <option value="Discord">Discord</option>
            </select>
          </label>
          <label className="cc-field">
            <span>Min subs</span>
            <input
              type="number"
              min={0}
              value={minSubs}
              onChange={(e) => setMinSubs(Number(e.target.value || 0))}
              placeholder="0"
            />
          </label>
          <label className="cc-field">
            <span>Active within</span>
            <select value={activeWithin} onChange={(e) => setActiveWithin(Number(e.target.value))}>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={365}>365 days</option>
            </select>
          </label>
        </div>
      </div>

      {dataMode === "dynamic" && (
        <div className="cc-api">
          <div className="cc-api-ctrls">
            <label className="cc-field cc-field-grow">
              <span>API URL</span>
              <input
                type="url"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://api.example.com/creators"
              />
            </label>
            <button className="cc-btn" onClick={tryFetchApi} disabled={!apiUrl || apiLoading}>
              {apiLoading ? "Loading…" : "Fetch"}
            </button>
          </div>
          {apiError && <div className="cc-api-error">{apiError}</div>}
          <div className="cc-api-hint">
            Expected JSON: array of Creator objects or an object with a "data" array. Only public data. No embedding without
            permission.
          </div>
        </div>
      )}

      {/* Spotlight */}
      {spotlight && (
        <div className="cc-spotlight">
          <div className="cc-spot-head">
            <h2>Random CC Spotlight</h2>
            <button
              className="cc-btn cc-btn-ghost"
              onClick={() => {
                if (!filtered.length) return;
                const next = filtered[Math.floor(Math.random() * filtered.length)];
                setSpotlightId(next.id);
              }}
            >
              Shuffle
            </button>
          </div>
          <CreatorCard c={spotlight} />
        </div>
      )}

      <div className="cc-main">
        <div className="cc-main-left">
          {displayMode === "cards" && (
            <div className="cc-grid">
              {filtered.map((c) => (
                <CreatorCard key={c.id} c={c} />
              ))}
            </div>
          )}
          {displayMode === "table" && <TableView data={filtered} />}
          {displayMode === "json" && (
            <pre className="cc-json" aria-label="JSON">
              {JSON.stringify(filtered, null, 2)}
            </pre>
          )}
        </div>
        <aside className="cc-main-right">
          <div className="cc-side">
            <h3>Weekly Toplists</h3>
            <div className="cc-toplist">
              <div>
                <h4>By Weekly Views</h4>
                <ol>
                  {topWeeklyViews.map((c) => (
                    <li key={c.id}>
                      <span>{c.name}</span>
                      <span className="cc-top-val">{formatNumber(c.weeklyViews)}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <h4>By Weekly Posts</h4>
                <ol>
                  {topWeeklyPosts.map((c) => (
                    <li key={c.id}>
                      <span>{c.name}</span>
                      <span className="cc-top-val">{c.weeklyPosts}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
          <div className="cc-side cc-legal">
            <h3>Legal & Disclaimer</h3>
            <ul>
              <li>Only public data; no embedding without permission.</li>
              <li>Logos/icons used solely as identifiers, respecting brand guidelines.</li>
              <li>
                Disclaimer: "Profiles belong to their creators; all rights remain with owners; SFDataHub only lists & links."
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
