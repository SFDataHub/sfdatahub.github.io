// src/pages/Home.tsx
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ContentShell from "../components/ContentShell";
import styles from "./Home.module.css";

// Datenquellen (client-seitig lesbar)
const NEWS_FEED_URL = "";            // Discord-News (JSON, gemergt serverseitig)
const TWITCH_LIVE_URL = "";          // Twitch-Live (JSON, gefiltert serverseitig)
const SCHEDULE_CSV_URL = "";         // Streaming-Plan (CSV, optional)

// Creators CSVs (öffentlich, mergen)
const CREATOR_CSVS = [
  "https://docs.google.com/spreadsheets/d/1lbUvWgD_G96CqiZlAevApQC64XqKOVJ0Y1IUBXNCQpE/export?format=csv&gid=0",         // DE
  "https://docs.google.com/spreadsheets/d/1lbUvWgD_G96CqiZlAevApQC64XqKOVJ0Y1IUBXNCQpE/export?format=csv&gid=805252729",   // EN
  "https://docs.google.com/spreadsheets/d/1lbUvWgD_G96CqiZlAevApQC64XqKOVJ0Y1IUBXNCQpE/export?format=csv&gid=966577378",   // Czech
  "https://docs.google.com/spreadsheets/d/1lbUvWgD_G96CqiZlAevApQC64XqKOVJ0Y1IUBXNCQpE/export?format=csv&gid=1783754800",  // Polish
  "https://docs.google.com/spreadsheets/d/1lbUvWgD_G96CqiZlAevApQC64XqKOVJ0Y1IUBXNCQpE/export?format=csv&gid=1322077146",  // Hungarian
  "https://docs.google.com/spreadsheets/d/1lbUvWgD_G96CqiZlAevApQC64XqKOVJ0Y1IUBXNCQpE/export?format=csv&gid=2086043774",  // French
];

type AnyRecord = Record<string, any>;

async function loadCreatorsMerged(): Promise<AnyRecord[]> {
  const all: AnyRecord[] = [];
  for (const url of CREATOR_CSVS) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const txt = await res.text();
      const rows = parseCsv(txt);
      all.push(...rows);
    } catch {
      // ignore single feed errors, continue merging
    }
  }
  const map = new Map<string, AnyRecord>();
  for (const r of all) {
    const name = String(r["Creator Name"] || r["creator_name"] || r["name"] || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, r);
  }
  return Array.from(map.values());
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) { out.push(cur); cur = ""; }
    else { cur += ch; }
  }
  out.push(cur);
  return out;
}

function parseCsv(input: string): AnyRecord[] {
  const lines = input.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: AnyRecord = {};
    headers.forEach((h, i) => (row[h.trim()] = (cells[i] ?? "").trim()));
    return row;
  });
}

function formatTimeAgo(isoOrEpoch?: string | number): string {
  try {
    const now = Date.now();
    const t = typeof isoOrEpoch === "number" ? isoOrEpoch : Date.parse(String(isoOrEpoch ?? now));
    const diff = Math.max(0, now - t);
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const d = Math.floor(hr / 24);
    return `${d}d`;
  } catch { return ""; }
}

function extractYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const p = u.pathname.toLowerCase();
      if (p.startsWith("/shorts/")) return p.split("/")[2] || null;
    }
  } catch {}
  return null;
}

// Kachel-Grid
type Tile = { to: string; label: string; icon?: string };
const TILE_ROUTES: Tile[] = [
  { to: "/toplists/", label: "Toplists" },
  { to: "/guidehub/?tab=calculators", label: "GuideHub" },
  { to: "/players/", label: "Players" },
  { to: "/guilds/", label: "Guilds" },
  { to: "/community/", label: "Community" },
  { to: "/magazine/historybook/", label: "Historybook" },
  { to: "/creator-hub/", label: "Creator Hub" },
  { to: "/help/", label: "Help" },
  { to: "/settings/", label: "Settings" },
];

const ICON_MANIFEST: Record<string, string> = {
  // optional: "/toplists/": "/icons/toplists.svg"
};

// ---------- Subcomponents ----------

const TileGrid: React.FC = () => (
  <section className={styles.card} data-i18n-scope="home.tiles">
    <header className={styles.header}>
      <span className={styles.title} data-i18n="home.title">Home</span>
      <span className={styles.subtitle} data-i18n="home.subtitle">Welcome back</span>
    </header>
    <div className={styles.tileGrid} role="list">
      {TILE_ROUTES.map((t) => (
        <Link key={t.to} to={t.to} role="listitem" className={styles.tile} aria-label={t.label}>
          {ICON_MANIFEST[t.to] ? (
            <img src={ICON_MANIFEST[t.to]} alt="" className={styles.tileIcon} />
          ) : (
            <div className={styles.tileIconFallback} aria-hidden>{t.label.slice(0,2).toUpperCase()}</div>
          )}
          <div className={styles.tileLabel} data-i18n={`nav.${t.label.toLowerCase()}`}>{t.label}</div>
        </Link>
      ))}
    </div>
  </section>
);

type NewsItem = { id?: string; author?: string; text?: string; image?: string; url?: string; timestamp?: number | string };
const NewsFeed: React.FC = () => {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load(){
      if(!NEWS_FEED_URL){ setItems([]); return; }
      try {
        const res = await fetch(NEWS_FEED_URL, { cache: "no-store" });
        const data = await res.json();
        const flat: NewsItem[] = normalizeNews(data).sort((a,b)=> (new Date(b.timestamp??0).getTime()) - (new Date(a.timestamp??0).getTime()));
        if(alive) setItems(flat.slice(0,5));
      } catch(e: any){ if(alive){ setError(String(e?.message||e||"error")); setItems([]);} }
    }
    load();
    return ()=>{ alive = false; };
  }, []);

  function normalizeNews(data: any): NewsItem[] {
    const arr: any[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.channels)
        ? data.channels.flatMap((c: any) => c?.items || c?.messages || [])
        : Object.values((data && typeof data === 'object' ? data : {})).flatMap((v: any) => Array.isArray(v) ? v : []);
    return arr.map((it) => ({
      id: it.id ?? it.message_id ?? undefined,
      author: it.author ?? it.username ?? it.user ?? undefined,
      text: it.text ?? it.content ?? "",
      image: it.image ?? it.image_url ?? it.media?.[0]?.url ?? undefined,
      url: it.url ?? it.link ?? undefined,
      timestamp: it.timestamp ?? it.createdAt ?? it.created_at ?? Date.now(),
    }));
  }

  const empty = !items || items.length === 0;

  return (
    <section className={styles.card} data-i18n-scope="home.news" aria-busy={items==null}>
      <header className={styles.header}>
        <span className={styles.title} data-i18n="home.news.title">Community news</span>
      </header>
      <div className={styles.newsList}>
        {items?.map((n) => (
          <article key={n.id ?? `${n.author}-${n.timestamp}`} className={styles.newsItem}>
            <div className={styles.newsMeta}>
              <span className={styles.newsAuthor}>{n.author || "Discord"}</span>
              <span className={styles.newsTime}>{formatTimeAgo(n.timestamp)}</span>
            </div>
            <p className={styles.newsText}>{n.text}</p>
            {n.image && <img src={n.image} alt="" className={styles.newsImage} />}
            {n.url && (
              <a href={n.url} target="_blank" rel="noreferrer" className={styles.linkBtn} data-i18n="home.news.open_on_discord">Auf Discord öffnen</a>
            )}
          </article>
        ))}
        {empty && <div className={styles.empty} data-i18n="home.news.empty">No news yet</div>}
      </div>
      {error && <div className={styles.errorNote} aria-live="polite">{error}</div>}
    </section>
  );
};

const YouTubeCarousel: React.FC = () => {
  const [items, setItems] = useState<{ title: string; url: string; thumb?: string }[]>([]);
  const [index, setIndex] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    async function load(){
      try {
        const merged = await loadCreatorsMerged();
        const slides = merged.map((r) => {
          const name = String(r["Creator Name"] || r["creator_name"] || r["name"] || "").trim();
          const y = String(r["YouTube Link"] || r["youtube"] || r["YouTube"] || "").trim();
          if(!y) return null;
          const vid = extractYouTubeVideoId(y);
          const thumb = vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : undefined;
          return { title: name, url: y, thumb };
        }).filter(Boolean).slice(0,12) as { title: string; url: string; thumb?: string }[];
        if(alive) setItems(slides);
      } catch { if(alive) setItems([]); }
    }
    load();
    return ()=>{ alive = false; };
  }, []);

  useEffect(() => {
    if(items.length <= 1) return;
    timer.current = window.setInterval(() => setIndex((i)=> (i+1) % items.length), 6000);
    return ()=>{ if(timer.current) window.clearInterval(timer.current); };
  }, [items]);

  const prev = () => setIndex((i)=> (i-1 + items.length) % Math.max(items.length,1));
  const next = () => setIndex((i)=> (i+1) % Math.max(items.length,1));
  const onKey = (e: React.KeyboardEvent) => { if(e.key==="ArrowLeft"){e.preventDefault();prev();} if(e.key==="ArrowRight"){e.preventDefault();next();} };

  return (
    <section className={styles.card} data-i18n-scope="home.youtube">
      <header className={styles.header}>
        <span className={styles.title} data-i18n="home.youtube.title">YouTube</span>
        <div className={styles.carouselCtrls}>
          <button className={styles.navBtn} onClick={prev} aria-label="Prev">◀</button>
          <button className={styles.navBtn} onClick={next} aria-label="Next">▶</button>
        </div>
      </header>
      <div className={styles.carousel} tabIndex={0} onKeyDown={onKey} aria-roledescription="carousel">
        {items.length === 0 ? (
          <div className={styles.empty}>No videos</div>
        ) : (
          items.map((it, i) => (
            <a key={it.url} href={it.url} target="_blank" rel="noreferrer"
               className={[styles.slide, i===index?styles.slideActive:styles.slideInactive].join(" ")}
            >
              {it.thumb ? <img src={it.thumb} alt="" className={styles.slideThumb} /> : (
                <div className={styles.slideFallback}>{it.title.slice(0,2).toUpperCase()}</div>
              )}
              <div className={styles.slideCaption}>{it.title}</div>
            </a>
          ))
        )}
      </div>
    </section>
  );
};

type LiveItem = { id?: string; name: string; url: string; avatar?: string; viewers?: number };
const LiveNow: React.FC<{ onOpenSchedule: () => void }> = ({ onOpenSchedule }) => {
  const [live, setLive] = useState<LiveItem[] | null>(null);
  const [twitchMap, setTwitchMap] = useState<Map<string,string>>(new Map());
  const [index, setIndex] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    async function load(){
      if(!TWITCH_LIVE_URL){ setLive([]); return; }
      try{
        const res = await fetch(TWITCH_LIVE_URL, { cache: "no-store" });
        const data = await res.json();
        const arr: LiveItem[] = Array.isArray(data) ? data : (Array.isArray(data?.live) ? data.live : []);
        if(alive) setLive(arr);
      } catch { if(alive) setLive([]); }
    }
    load();
    return ()=>{ alive = false; };
  }, []);

  // Load Twitch links from creator CSVs to enrich missing URLs
  useEffect(() => {
    let alive = true;
    async function loadTwitch(){
      try{
        const creators = await loadCreatorsMerged();
        const m = new Map<string,string>();
        for(const r of creators){
          const name = String(r["Creator Name"] || r["creator_name"] || r["name"] || "").trim();
          const twitch = String(r["Twitch Link"] || r["twitch"] || r["Twitch"] || "").trim();
          if(!name || !twitch) continue;
          // normalize to channel handle key
          const channel = (() => { try { const u = new URL(twitch); return u.pathname.replace(/^\//,'').toLowerCase(); } catch { return twitch.toLowerCase(); } })();
          if(channel) m.set(channel, twitch);
          m.set(name.toLowerCase(), twitch);
        }
        if(alive) setTwitchMap(m);
      } catch {
        if(alive) setTwitchMap(new Map());
      }
    }
    loadTwitch();
    return ()=>{ alive = false; };
  }, []);

  useEffect(() => {
    if(!live || live.length <= 1) return;
    timer.current = window.setInterval(() => setIndex((i)=> (i+1) % live.length), 8000);
    return ()=>{ if(timer.current) window.clearInterval(timer.current); };
  }, [live]);

  if(!live || live.length === 0){
    return (
      <section className={styles.card} data-i18n-scope="home.live">
        <header className={styles.header}>
          <span className={styles.title} data-i18n="home.live.title">Live now</span>
        </header>
        <div className={styles.empty} data-i18n="home.live.none">Nobody is live right now.</div>
        <div className={styles.actionsRight}>
          <button className={styles.primaryBtn} onClick={onOpenSchedule} data-i18n="home.schedule.open">Streaming-Plan anzeigen</button>
        </div>
      </section>
    );
  }

  const cur = live[index];
  const resolvedUrl = (() => {
    const byName = (cur?.name || "").toLowerCase();
    if (cur?.url) return cur.url;
    if (!byName) return undefined;
    // try by provided name direct
    if (twitchMap.has(byName)) return twitchMap.get(byName);
    // try channel path = name
    if (twitchMap.has(byName.replace(/^@/,""))) return twitchMap.get(byName.replace(/^@/,""));
    // generic fallback
    return `https://www.twitch.tv/${byName}`;
  })();
  return (
    <section className={styles.card} data-i18n-scope="home.live">
      <header className={styles.header}>
        <span className={styles.title} data-i18n="home.live.title">Live now</span>
      </header>
      <div className={styles.liveCard}>
        {cur?.avatar ? (
          <img src={cur.avatar} alt="" className={styles.liveAvatar} />
        ) : (
          <div className={styles.liveAvatarFallback} aria-hidden>{cur?.name?.slice(0,2).toUpperCase()}</div>
        )}
        <div className={styles.liveInfo}>
          <div className={styles.liveName}>{cur?.name}</div>
          <div className={styles.liveMeta}>
            <span className={styles.liveBadge}>LIVE</span>
            {typeof cur?.viewers === 'number' && <span className={styles.liveViewers}>{cur.viewers.toLocaleString()} viewers</span>}
          </div>
        </div>
        {resolvedUrl && <a href={resolvedUrl} target="_blank" rel="noreferrer" className={styles.primaryBtn} data-i18n="home.live.open_on_twitch">Auf Twitch öffnen</a>}
      </div>
      <div className={styles.carouselCtrls}>
        <button className={styles.navBtn} onClick={()=> setIndex((i)=> (i-1+live.length) % live.length)} aria-label="Prev">◀</button>
        <button className={styles.navBtn} onClick={()=> setIndex((i)=> (i+1) % live.length)} aria-label="Next">▶</button>
      </div>
    </section>
  );
};

type ScheduleRow = { weekday: string; start_utc: string; end_utc: string; timezone: string; platform: string; channel_url: string; streamer: string; title: string };
const ScheduleModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [rows, setRows] = useState<ScheduleRow[] | null>(null);
  const [platform, setPlatform] = useState("All");
  const [query, setQuery] = useState("");
  const [todayOnly, setTodayOnly] = useState(false);

  useEffect(() => {
    if(!open) return;
    let alive = true;
    async function load(){
      if(!SCHEDULE_CSV_URL){ setRows([]); return; }
      try{
        const res = await fetch(SCHEDULE_CSV_URL, { cache: "no-store" });
        const txt = await res.text();
        const parsed = parseCsv(txt) as AnyRecord[];
        const mapped: ScheduleRow[] = parsed.map((r)=>({
          weekday: String(r.weekday || r.Weekday || r.day || "").trim(),
          start_utc: String(r.start_utc || r.StartUTC || r.start || "").trim(),
          end_utc: String(r.end_utc || r.EndUTC || r.end || "").trim(),
          timezone: String(r.timezone || r.Timezone || r.tz || "UTC").trim(),
          platform: String(r.platform || r.Platform || "All").trim(),
          channel_url: String(r.channel_url || r.Channel || r.url || "").trim(),
          streamer: String(r.streamer || r.Streamer || r.creator || "").trim(),
          title: String(r.title || r.Title || "").trim(),
        }));
        if(alive) setRows(mapped);
      } catch { if(alive) setRows([]); }
    }
    load();
    return ()=>{ alive = false; };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if(e.key === 'Escape') onClose(); };
    if(open) window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if(!open) return null;

  const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(new Date());
  const filtered = (rows || []).filter((r) => {
    if(platform !== 'All' && r.platform.toLowerCase() !== platform.toLowerCase()) return false;
    if(todayOnly && r.weekday && r.weekday.toLowerCase() !== dayLabel.toLowerCase()) return false;
    if(query){ const q = query.toLowerCase(); if(!(`${r.streamer} ${r.title}`.toLowerCase().includes(q))) return false; }
    return true;
  });

  const hasTemplateOnly = (rows?.length ?? 0) === 0;

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="schedule-title">
      <div className={styles.modal}>
        <header className={styles.modalHeader}>
          <h2 id="schedule-title" className={styles.modalTitle} data-i18n="home.schedule.title">Streaming-Plan</h2>
          <button className={styles.closeBtn} onClick={onClose} data-i18n="home.schedule.close">Schließen</button>
        </header>
        <div className={styles.modalFilters}>
          <label className={styles.formRow}>
            <span data-i18n="home.schedule.platform">Platform</span>
            <select value={platform} onChange={(e)=> setPlatform(e.target.value)} className={styles.select}>
              <option value="All">All</option>
              <option value="Twitch">Twitch</option>
              <option value="YouTube">YouTube</option>
            </select>
          </label>
          <label className={styles.formRow}>
            <span data-i18n="home.schedule.search">Search</span>
            <input value={query} onChange={(e)=> setQuery(e.target.value)} className={styles.input} placeholder="Streamer / Title" />
          </label>
          <label className={styles.formRowCheckbox}>
            <input type="checkbox" checked={todayOnly} onChange={(e)=> setTodayOnly(e.target.checked)} />
            <span data-i18n="home.schedule.today">Nur heute</span>
          </label>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>weekday</th>
                <th>start_utc</th>
                <th>end_utc</th>
                <th>timezone</th>
                <th>platform</th>
                <th>channel_url</th>
                <th>streamer</th>
                <th>title</th>
              </tr>
            </thead>
            <tbody>
              {hasTemplateOnly ? (
                <tr><td colSpan={8} className={styles.empty}>No schedule yet</td></tr>
              ) : (
                filtered.map((r, i) => (
                  <tr key={i}>
                    <td>{r.weekday}</td>
                    <td>{r.start_utc}</td>
                    <td>{r.end_utc}</td>
                    <td>{r.timezone}</td>
                    <td>{r.platform}</td>
                    <td>{r.channel_url ? <a href={r.channel_url} target="_blank" rel="noreferrer">link</a> : ''}</td>
                    <td>{r.streamer}</td>
                    <td>{r.title}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const Home: React.FC = () => {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  return (
    <ContentShell title="home.title" subtitle="home.subtitle">
      {/* Row 0 – Kachel-Grid */}
      <div className={styles.row}>
        <div className={styles.colFull}>
          <TileGrid />
        </div>
      </div>
      {/* Row 1 – News & YouTube */}
      <div className={styles.row}>
        <div className={styles.colCommunity}>
          <NewsFeed />
        </div>
        <div className={styles.colGuides}>
          <YouTubeCarousel />
        </div>
      </div>
      {/* Row 2 – Live & Plan */}
      <div className={styles.row}>
        <div className={styles.colFull}>
          <LiveNow onOpenSchedule={() => setScheduleOpen(true)} />
        </div>
      </div>
      <ScheduleModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
    </ContentShell>
  );
};

export default Home;
