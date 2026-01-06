// src/pages/Home.tsx
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ContentShell from "../components/ContentShell";
import styles from "./Home.module.css";
import { fetchDiscordNewsSnapshot } from "./Home/newsSnapshot.client";
import type { DiscordByChannelSnapshot, DiscordNewsByChannelEntry } from "./Home/newsFeed.types";
import guideHubLogo from "../assets/logo_guidehub.png";

// Historybook cover (homepage preview)
const HISTORYBOOK_COVER_URL = "/flipbooks/sf-history-book/history_book_coverpage.png";
const GUIDEHUB_ROUTE = "/guidehub-v2";

// Datenquellen (client-seitig lesbar)
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

const NEWS_SNAPSHOT_CACHE_KEY = "sfh_news_latestByChannel_v1";
const NEWS_SNAPSHOT_FALLBACK_UPDATE_MS = 10 * 60 * 1000;

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

function clampText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const slice = trimmed.slice(0, Math.max(0, maxChars - 3)).trimEnd();
  return `${slice}...`;
}

function readSnapshotCache(): DiscordByChannelSnapshot | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(NEWS_SNAPSHOT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as DiscordByChannelSnapshot;
  } catch {
    return null;
  }
}

function writeSnapshotCache(snapshot: DiscordByChannelSnapshot): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(NEWS_SNAPSHOT_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore storage errors
  }
}

function resolveNextCheckAt(snapshot: DiscordByChannelSnapshot | null): number | null {
  if (!snapshot) return null;
  const now = Date.now();
  const next = typeof snapshot.nextUpdateAt === "number" ? snapshot.nextUpdateAt : null;
  if (next && next > now) return next;
  return now + NEWS_SNAPSHOT_FALLBACK_UPDATE_MS;
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
  { to: "/players/", label: "Players" },
  { to: "/guilds/", label: "Guilds" },
  { to: "/community/", label: "Community" },
  { to: "/creator-hub/", label: "Creator Hub" },
  { to: "/help", label: "Help" },
  { to: "/settings/", label: "Settings" },
];

const ICON_MANIFEST: Record<string, string> = {
  // optional: "/toplists/": "/icons/toplists.svg"
};

// ---------- Subcomponents ----------

const TileGrid: React.FC = () => {
  return (
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
            ) : t.to === GUIDEHUB_ROUTE ? (
              <img src={guideHubLogo} alt="" className={styles.tileIcon} />
            ) : (
              <div className={styles.tileIconFallback} aria-hidden>{t.label.slice(0,2).toUpperCase()}</div>
            )}
            <div className={styles.tileLabel} data-i18n={`nav.${t.label.toLowerCase()}`}>{t.label}</div>
          </Link>
        ))}
      </div>
    </section>
  );
};

const HistorybookCard: React.FC = () => {
  const historybookCover = HISTORYBOOK_COVER_URL;

  return (
    <section className={`${styles.card} ${styles.historybookCard}`} data-i18n-scope="home.historybook">
      <header className={styles.header}>
        <div className={styles.historybookHeader}>
          <div className={styles.historybookHeaderText}>
            <span className={styles.title} data-i18n="home.historybook.title">Historybook</span>
            <span className={styles.historybookCredit} data-i18n="home.historybook.credit">
              Historybook - created by Resist 2 Exist & DonMuErte
            </span>
          </div>
        </div>
      </header>
      <Link
        to="/sfmagazine/historybook"
        className={styles.historybookLink}
        aria-label="Open Historybook"
        data-i18n-aria-label="home.historybook.open"
      >
        <div className={styles.historybookCoverWrap}>
          {historybookCover ? (
            <img
              src={historybookCover}
              alt="Historybook cover"
              data-i18n="home.historybook.coverAlt"
              className={`${styles.historybookCover} ${styles.historybookCover3d}`}
              loading="eager"
              decoding="async"
            />
          ) : (
            <div className={`${styles.historybookCover} ${styles.historybookCover3d} ${styles.historybookPlaceholder}`} aria-hidden />
          )}
        </div>
      </Link>
    </section>
  );
};

const GuideHubCard: React.FC = () => {
  return (
    <section className={`${styles.card} ${styles.guidehubCard}`} data-i18n-scope="home.guidehub">
      <header className={styles.header}>
        <div className={styles.historybookHeader}>
          <div className={styles.historybookHeaderText}>
            <span className={styles.title} data-i18n="home.guidehub.title">GuideHub</span>
            <span className={styles.historybookCredit} data-i18n="home.guidehub.subtitle">Guides & calculators</span>
          </div>
        </div>
      </header>
      <Link
        to={GUIDEHUB_ROUTE}
        className={styles.historybookLink}
        aria-label="Open GuideHub"
        data-i18n-aria-label="home.guidehub.open"
      >
        <div className={styles.guidehubPreviewWrap}>
          <img
            src={guideHubLogo}
            alt="GuideHub preview"
            data-i18n="home.guidehub.previewAlt"
            className={styles.guidehubPreview}
            loading="eager"
            decoding="async"
          />
        </div>
      </Link>
    </section>
  );
};

const NewsFeed: React.FC = () => {
  const [index, setIndex] = useState<number>(0);
  const [data, setData] = useState<DiscordByChannelSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userSelectedRef = useRef(false);
  const autoSelectedOnceRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dataRef = useRef<DiscordByChannelSnapshot | null>(null);
  const hashRef = useRef<string | null>(null);
  const nextCheckAtRef = useRef<number | null>(null);

  const pickLatestIndex = (items: DiscordNewsByChannelEntry[]): number => {
    let pickedIndex = -1;
    let pickedTime = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < items.length; i++) {
      const ts = items[i]?.item?.timestamp;
      if (!ts) continue;
      const t = Date.parse(ts);
      if (Number.isNaN(t)) continue;
      if (t > pickedTime) {
        pickedTime = t;
        pickedIndex = i;
      }
    }
    return pickedIndex === -1 ? 0 : pickedIndex;
  };

  useEffect(() => {
    let alive = true;

    const clearTimer = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const scheduleNext = (snapshot: DiscordByChannelSnapshot | null) => {
      clearTimer();
      const nextAt = resolveNextCheckAt(snapshot);
      if (!nextAt) return;
      nextCheckAtRef.current = nextAt;
      const delay = Math.max(0, nextAt - Date.now());
      timerRef.current = window.setTimeout(() => {
        runFetch();
      }, delay);
    };

    const applySnapshot = (snapshot: DiscordByChannelSnapshot, writeCache: boolean) => {
      const nextHash = snapshot.hash || String(snapshot.updatedAt ?? "");
      const currentHash = hashRef.current;
      if (currentHash && currentHash === nextHash) {
        dataRef.current = snapshot;
        if (writeCache) writeSnapshotCache(snapshot);
        return;
      }
      hashRef.current = nextHash;
      dataRef.current = snapshot;
      setData(snapshot);
      if (writeCache) writeSnapshotCache(snapshot);
    };

    const runFetch = async () => {
      if (!alive) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (!dataRef.current) setLoading(true);
      try {
        const incoming = await fetchDiscordNewsSnapshot(controller.signal);
        if (!alive || controller.signal.aborted) return;
        if (incoming) {
          applySnapshot(incoming, true);
          setError(null);
          scheduleNext(incoming);
        }
      } catch (e: any) {
        if (!alive || controller.signal.aborted) return;
        setError(String(e?.message || e || "error"));
      } finally {
        if (alive && !controller.signal.aborted) {
          setLoading(false);
          scheduleNext(dataRef.current);
        }
      }
    };

    const cached = readSnapshotCache();
    if (cached) {
      applySnapshot(cached, false);
      setLoading(false);
    }

    const now = Date.now();
    const isCacheFresh =
      cached && typeof cached.nextUpdateAt === "number" && cached.nextUpdateAt > now;
    if (!isCacheFresh) {
      runFetch();
    } else {
      scheduleNext(cached);
    }

    const onVisibility = () => {
      if (!alive) return;
      if (document.visibilityState !== "visible") return;
      const nextAt = nextCheckAtRef.current;
      if (typeof nextAt === "number" && Date.now() > nextAt) {
        runFetch();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      alive = false;
      clearTimer();
      abortRef.current?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const items = data?.items ?? [];
    if (items.length === 0) {
      setIndex(0);
      return;
    }
    if (!userSelectedRef.current && !autoSelectedOnceRef.current) {
      setIndex(pickLatestIndex(items));
      autoSelectedOnceRef.current = true;
      return;
    }
    setIndex((prev) => Math.min(prev, items.length - 1));
  }, [data]);

  const totalChannels = data?.items.length ?? 0;
  const activeEntry = totalChannels > 0 ? data!.items[index] : null;
  const activeLabel = activeEntry?.label || activeEntry?.channelId || "";
  const channelEmpty = !loading && activeEntry && !activeEntry.item;

  const item = activeEntry?.item ?? null;
  const timeLabel = item ? formatTimeAgo(item.timestamp) : "";
  const authorLabel = item?.author || "Discord";
  const displayText = item?.contentText ? clampText(item.contentText, 240) : "";
  const cardLabel = item ? `${authorLabel} ${timeLabel}`.trim() : undefined;
  const empty = !loading && totalChannels === 0;

  const goPrev = () => {
    if (totalChannels <= 1) return;
    userSelectedRef.current = true;
    setIndex((i) => (i - 1 + totalChannels) % totalChannels);
  };
  const goNext = () => {
    if (totalChannels <= 1) return;
    userSelectedRef.current = true;
    setIndex((i) => (i + 1) % totalChannels);
  };

  return (
    <section className={styles.card} data-i18n-scope="home.news" aria-busy={loading}>
      <header className={styles.header}>
        <div className={styles.headerGroup}>
          <span className={styles.title} data-i18n="home.news.title">Community news</span>
          {activeLabel && (
            <span className={styles.subtitle} title={activeLabel}>
              {activeLabel}
            </span>
          )}
        </div>
        <div className={styles.carouselCtrls}>
          <button
            className={styles.navBtn}
            onClick={goPrev}
            disabled={totalChannels <= 1}
            aria-label="Previous channel"
            data-i18n-aria-label="home.news.prev"
          >
            ‹
          </button>
          <button
            className={styles.navBtn}
            onClick={goNext}
            disabled={totalChannels <= 1}
            aria-label="Next channel"
            data-i18n-aria-label="home.news.next"
          >
            ›
          </button>
        </div>
      </header>
      <div className={styles.newsList}>
        {loading && (
          <div className={styles.newsSkeleton} aria-hidden />
        )}
        {item && (
          <article
            className={[styles.newsCard, item.imageUrl ? styles.newsCardWithImage : ""].join(" ")}
            tabIndex={0}
          >
            <div className={styles.newsBody}>
              <div className={styles.newsMeta}>
                <span className={styles.newsAuthor}>{authorLabel}</span>
                <span className={styles.newsTime}>{timeLabel}</span>
              </div>
              {displayText && <p className={styles.newsText}>{displayText}</p>}
              <div className={styles.newsActions}>
                <a
                  href={item.jumpUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.linkBtn}
                  aria-label={cardLabel}
                  data-i18n="home.news.openOnDiscord"
                >
                  Open on Discord
                </a>
              </div>
            </div>
            {item.imageUrl && (
              <img
                src={item.imageUrl}
                alt=""
                className={styles.newsImage}
                loading="lazy"
                decoding="async"
              />
            )}
          </article>
        )}
        {channelEmpty && (
          <div className={styles.empty} data-i18n="home.news.emptyChannel">
            No recent news in this channel.
          </div>
        )}
        {empty && <div className={styles.empty} data-i18n="home.news.empty">No news yet.</div>}
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
      {/* Row 1 — News / Live */}
      <div className={`${styles.row} ${styles.rowSplit}`}>
        <div className={styles.splitMain}>
          <NewsFeed />
        </div>
        <div className={styles.splitSide}>
          <LiveNow onOpenSchedule={() => setScheduleOpen(true)} />
        </div>
      </div>
      {/* Row 2 — Historybook / YouTube */}
      <div className={`${styles.row} ${styles.rowSplit}`}>
        <div className={styles.splitMain}>
          <div className={styles.featuredRowWrap}>
            <HistorybookCard />
            <GuideHubCard />
          </div>
        </div>
        <div className={styles.splitSide}>
          <YouTubeCarousel />
        </div>
      </div>
      {/* Row 3 — Home */}
      <div className={styles.row}>
        <div className={styles.colFull}>
          <TileGrid />
        </div>
      </div>
      <ScheduleModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
    </ContentShell>
  );
};

export default Home;
