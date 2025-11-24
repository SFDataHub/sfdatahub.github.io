import React, { useEffect, useMemo, useState } from "react";
import "./creators.css";

import creatorSheet from "../../data/creatorSheet";
import { Creator, Platform, SheetCreatorRow, sheetRowToCreator } from "../../lib/creators/shared";
import { useCreatorSnapshot } from "../../hooks/useCreatorSnapshot";

type SortKey = "subs" | "views" | "activity" | "language";

type DisplayMode = "cards" | "table" | "json";

type DataMode = "static" | "dynamic";

const SHEET_SOURCE_ROWS: SheetCreatorRow[] = creatorSheet;

const SHEET_CREATORS: Creator[] = SHEET_SOURCE_ROWS.map(sheetRowToCreator);

const SAMPLE_CREATORS: Creator[] = [...SHEET_CREATORS];

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
  const [activeWithin, setActiveWithin] = useState<number>(365);

  // Spotlight
  const [spotlightId, setSpotlightId] = useState<string | null>(null);

  // Dynamic API state
  const [apiUrl, setApiUrl] = useState<string>("");
  const [apiLoading, setApiLoading] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string>("");
  const [apiData, setApiData] = useState<Creator[] | null>(null);

  const { snapshot, error: snapshotError } = useCreatorSnapshot();

  const managedData = snapshot?.data?.length ? snapshot.data : null;
  const staticFallback = managedData ?? SAMPLE_CREATORS;

  const baseData = dataMode === "static" ? staticFallback : apiData ?? managedData ?? [];

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

  const noResults = filtered.length === 0;

  return (
    <section className="cc-wrap">
      <div className="cc-heading">
        <h1>Content Creator Hub</h1>
        <p className="cc-sub">Profiles, stats and links to community creators.</p>
        {snapshot && (
          <p className="cc-sync">
            <span>Live stats synced {new Date(snapshot.generatedAt).toLocaleString()}</span>
            <span>{snapshot.data.length} profiles</span>
          </p>
        )}
        {snapshotError && <p className="cc-sync-error">{snapshotError}</p>}
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
          {noResults && (
            <div className="cc-empty">
              <h3>No creators match the filters</h3>
              <p>Adjust activity range or other filters to see results.</p>
            </div>
          )}
          {!noResults && displayMode === "cards" && (
            <div className="cc-grid">
              {filtered.map((c) => (
                <CreatorCard key={c.id} c={c} />
              ))}
            </div>
          )}
          {!noResults && displayMode === "table" && <TableView data={filtered} />}
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
