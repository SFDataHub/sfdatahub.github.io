import React from "react";
import { useNavigate } from "react-router-dom";
import {
  collectionGroup,
  collection,
  endAt,
  getDocs,
  limit,
  orderBy,
  query as fsQuery,
  startAt,
  where,
} from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { db } from "../../lib/firebase";
import { CLASSES } from "../../data/classes";
import { toDriveThumbProxy } from "../../lib/urls";
import { beginReadScope, endReadScope, traceGetDocs } from "../../lib/debug/firestoreReadTrace";
import {
  getCachedSuggestions,
  normalizeQuery,
  setCachedSuggestions,
} from "../../lib/search/searchCache";

type PlayerHit = {
  kind: "player";
  id: string;
  name: string | null;
  nameFold: string | null;
  server: string | null;
  guildName: string | null;
  className: string | null;
  level: number | null;
  ts?: number | null;
};

type GuildHit = {
  kind: "guild";
  id: string;
  name: string | null;
  nameFold: string | null;
  server: string | null;
  memberCount: number | null;
  hofRank: number | null;
  ts?: number | null;
};

type ServerHit = {
  kind: "server";
  id: string;
  displayName: string | null;
  code: string | null;
  host: string | null;
  region: string | null;
  type: string | null;
  numericId: number | null;
  active: boolean | null;
};

type Hit = PlayerHit | GuildHit | ServerHit;

const MIN_CHARS = 3;
const DEBOUNCE_MS = 350;
const FS_LIMIT = 25;
const SUGGEST_LIMIT = 10;
const RECENTS_KEY = "sfh:search:recents";
const RECENTS_MAX = 20;

type RecentEntry =
  | { kind: "query"; value: string }
  | {
      kind: "player" | "guild";
      id: string;
      server?: string | null;
      name?: string | null;
      className?: string | null;
      level?: number | null;
      guildName?: string | null;
    };

const isNum = (n: any): n is number => Number.isFinite(n);
const toNumberLoose = (v: any): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const fold = (s?: string | null) =>
  String(s ?? "")
    .normalize("NFD")
    // @ts-ignore
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const loadRecents = (): RecentEntry[] => {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(RECENTS_KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, RECENTS_MAX).map((entry: any) => {
      if (entry?.kind === "player" || entry?.kind === "guild") {
        return {
          kind: entry.kind,
          id: String(entry.id ?? entry.value ?? ""),
          server: entry.server ?? entry.serverId ?? null,
          name: entry.name ?? entry.label ?? null,
          className: entry.className ?? null,
          level: typeof entry.level === "number" ? entry.level : null,
          guildName: entry.guildName ?? null,
        } as RecentEntry;
      }
      if (entry?.kind === "query") {
        return { kind: "query", value: String(entry.value ?? "") };
      }
      return null;
    }).filter(Boolean) as RecentEntry[];
  } catch {
    return [];
  }
};

const keyForRecent = (entry: RecentEntry) => {
  if (entry.kind === "query") return `query:${entry.value}`;
  const server = entry.server ?? "";
  return `${entry.kind}:${server}:${entry.id}`;
};

const upgradeFromPlayerProfileCache = (entry: RecentEntry): RecentEntry => {
  if (entry.kind !== "player") return entry;
  if (entry.name && entry.className && entry.server) return entry;
  if (typeof window === "undefined") return entry;
  try {
    const raw = window.localStorage.getItem(`player-profile-cache:${entry.id}`);
    if (!raw) return entry;
    const parsed = JSON.parse(raw);
    const data = parsed?.data || {};
    return {
      ...entry,
      name: entry.name ?? data.name ?? null,
      className: entry.className ?? data.className ?? null,
      server: entry.server ?? data.server ?? null,
      level: entry.level ?? (typeof data.level === "number" ? data.level : null),
      guildName: entry.guildName ?? data.guild ?? null,
    };
  } catch {
    return entry;
  }
};

const persistRecent = (entry: RecentEntry) => {
  if (typeof window === "undefined") return;
  try {
    const existing = loadRecents().map(upgradeFromPlayerProfileCache);
    const target = entry.kind === "player" ? upgradeFromPlayerProfileCache(entry) : entry;
    const targetKey = keyForRecent(target);
    const deduped = [target, ...existing.filter((e) => keyForRecent(e) !== targetKey)];
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(deduped.slice(0, RECENTS_MAX)));
  } catch {
    // ignore
  }
};

const removeRecent = (key: string, setState: (next: RecentEntry[]) => void) => {
  try {
    const filtered = loadRecents().filter((r) => keyForRecent(r) !== key);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(filtered));
    setState(filtered);
  } catch {
    setState((prev) => prev.filter((r) => keyForRecent(r) !== key));
  }
};

function iconUrlByLabel(label?: string | null, size = 64): string | undefined {
  if (!label) return undefined;
  const strip = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const target = strip(label);

  let c = CLASSES.find((cl) => strip(cl.label) === target);
  if (!c) c = CLASSES.find((cl) => strip(cl.label).startsWith(target) || target.startsWith(strip(cl.label)));
  if (!c) return undefined;

  return toDriveThumbProxy(c.iconUrl, size);
}

function getRootAndId(docSnap: any): { root?: string; id?: string } {
  const latestCol = docSnap.ref.parent; // .../latest
  const parentDoc = latestCol?.parent; // .../{root}/{id}
  const rootCol = parentDoc?.parent; // /players | /guilds
  return { root: rootCol?.id, id: parentDoc?.id };
}

export default function UniversalSearch({
  placeholder = "Suchen … (Spieler, Gilden, Server)",
  maxPerSection = 8,
  getClassIcon,
}: {
  placeholder?: string;
  maxPerSection?: number;
  getClassIcon?: (className?: string | null, size?: number) => string | undefined;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [players, setPlayers] = React.useState<PlayerHit[]>([]);
  const [guilds, setGuilds] = React.useState<GuildHit[]>([]);
  const [servers, setServers] = React.useState<ServerHit[]>([]);
  const [playersHasMore, setPlayersHasMore] = React.useState(false);
  const [guildsHasMore, setGuildsHasMore] = React.useState(false);
  const [recents, setRecents] = React.useState<RecentEntry[]>(loadRecents());
  const [activeIndex, setActiveIndex] = React.useState<number>(-1);
  const [isOpen, setIsOpen] = React.useState(false);
  const [hasFocus, setHasFocus] = React.useState(false);
  const [lastSource, setLastSource] = React.useState<"cache" | "live" | null>(null);
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const requestSeq = React.useRef(0);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      const term = debounced;
      const qNorm = normalizeQuery(term);
      if (term.length < MIN_CHARS) {
        setPlayers([]);
        setGuilds([]);
        setServers([]);
        setPlayersHasMore(false);
        setGuildsHasMore(false);
        setActiveIndex(recents.length ? 0 : -1);
        setLastSource(null);
        return;
      }

      // Cache-first: if hit, use and skip Firestore entirely.
      const cached = getCachedSuggestions(qNorm);
      if (cached) {
        setPlayers(
          cached.players.slice(0, SUGGEST_LIMIT).map((p) => ({
            kind: "player",
            id: String(p.playerId),
            name: p.name,
            server: p.server ?? null,
            className: p.className ?? null,
            guildName: p.guildName ?? null,
            nameFold: null,
            level: null,
          })),
        );
        setGuilds(
          cached.guilds.slice(0, SUGGEST_LIMIT).map((g) => ({
            kind: "guild",
            id: g.guildId,
            name: g.name,
            server: g.server ?? null,
            memberCount: null,
            hofRank: null,
          })),
        );
        setPlayersHasMore(cached.playersHasMore);
        setGuildsHasMore(cached.guildsHasMore);
        setServers([]);
        setActiveIndex(cached.players.length + cached.guilds.length ? 0 : -1);
        setLastSource("cache");
        return;
      }

      setIsOpen(true);
      const scope = beginReadScope("Search:universal");
      setError(null);
      setLoading(true);
      const seq = ++requestSeq.current;
      try {
        const folded = fold(term);

        const cg = collectionGroup(db, "latest");

        const prefixQuery = fsQuery(
          cg,
          orderBy("nameFold"),
          startAt(folded),
          endAt(folded + "\uf8ff"),
          limit(FS_LIMIT),
        );
        const snapPrefix = await traceGetDocs(scope, prefixQuery, () => getDocs(prefixQuery), {
          collectionHint: "latest",
        });

        const ngramQuery = fsQuery(cg, where("nameNgrams", "array-contains", folded), limit(FS_LIMIT));
        const snapNgram = await traceGetDocs(scope, ngramQuery, () => getDocs(ngramQuery), {
          collectionHint: "latest",
        });

        const seenP = new Set<string>();
        const seenG = new Set<string>();
        const rowsP: PlayerHit[] = [];
        const rowsG: GuildHit[] = [];

        function considerPG(docSnap: any) {
          const d = docSnap.data() as any;
          const { root, id } = getRootAndId(docSnap);
          const safeId = id || d.playerId || d.guildIdentifier || "";

          if (root === "players" || (!!d.playerId && !d.guildIdentifier)) {
            if (!safeId || seenP.has(safeId)) return;
            seenP.add(safeId);
            rowsP.push({
              kind: "player",
              id: safeId,
              name: d.name ?? d.values?.Name ?? null,
              nameFold: d.nameFold ?? null,
              server: d.server ?? d.values?.Server ?? null,
              guildName: d.guildName ?? d.values?.Guild ?? null,
              className: d.className ?? d.values?.Class ?? null,
              level: toNumberLoose(d.level ?? d.values?.Level),
              ts: toNumberLoose(d.timestamp),
            });
            return;
          }

          if (root === "guilds" || (!!d.guildIdentifier && !d.playerId)) {
            if (!safeId || seenG.has(safeId)) return;
            seenG.add(safeId);
            rowsG.push({
              kind: "guild",
              id: safeId,
              name: d.name ?? d.values?.Name ?? null,
              nameFold: d.nameFold ?? null,
              server: d.server ?? d.values?.Server ?? null,
              memberCount: toNumberLoose(
                d.memberCount ?? d.values?.["Guild Member Count"] ?? d.values?.GuildMemberCount,
              ),
              hofRank: toNumberLoose(
                d.hofRank ??
                  d.values?.["Hall of Fame Rank"] ??
                  d.values?.HoF ??
                  d.values?.Rank ??
                  d.values?.["Guild Rank"],
              ),
              ts: toNumberLoose(d.timestamp),
            });
            return;
          }
        }

        snapPrefix.forEach(considerPG);
        snapNgram.forEach(considerPG);

        const playersTrimmed = rowsP.slice(0, FS_LIMIT);
        const guildsTrimmed = rowsG.slice(0, FS_LIMIT);

        if (seq !== requestSeq.current || cancelled) {
          endReadScope(scope);
          return;
        }

        const serversCol = collection(db, "servers");
        const lower = term.toLowerCase();
        const upper = term.toUpperCase();

        const serverQueryPromises = [
          traceGetDocs(
            scope,
            fsQuery(serversCol, orderBy("displayName"), startAt(term), endAt(term + "\uf8ff"), limit(maxPerSection)),
            () =>
              getDocs(
                fsQuery(serversCol, orderBy("displayName"), startAt(term), endAt(term + "\uf8ff"), limit(maxPerSection)),
              ),
            { collectionHint: "servers" },
          ),
          traceGetDocs(
            scope,
            fsQuery(serversCol, orderBy("code"), startAt(upper), endAt(upper + "\uf8ff"), limit(maxPerSection)),
            () => getDocs(fsQuery(serversCol, orderBy("code"), startAt(upper), endAt(upper + "\uf8ff"), limit(maxPerSection))),
            { collectionHint: "servers" },
          ),
          traceGetDocs(
            scope,
            fsQuery(serversCol, orderBy("host"), startAt(lower), endAt(lower + "\uf8ff"), limit(maxPerSection)),
            () => getDocs(fsQuery(serversCol, orderBy("host"), startAt(lower), endAt(lower + "\uf8ff"), limit(maxPerSection))),
            { collectionHint: "servers" },
          ),
        ];

        const snaps = await Promise.allSettled(serverQueryPromises);

        const seenS = new Set<string>();
        const rowsS: ServerHit[] = [];
        for (const res of snaps) {
          if (res.status !== "fulfilled") continue;
          res.value.forEach((docSnap: any) => {
            const d = docSnap.data() as any;
            const id = docSnap.id as string;
            if (!id || seenS.has(id)) return;
            seenS.add(id);
            rowsS.push({
              kind: "server",
              id,
              displayName: d.displayName ?? null,
              code: d.code ?? null,
              host: d.host ?? null,
              region: d.region ?? null,
              type: d.type ?? null,
              numericId: toNumberLoose(d.numericId),
              active: typeof d.active === "boolean" ? d.active : null,
            });
          });
        }

        const merged: Array<PlayerHit | GuildHit> = [];
        const add = (list: Array<PlayerHit | GuildHit>) => {
          for (const item of list) {
            if (merged.length >= SUGGEST_LIMIT) break;
            merged.push(item);
          }
        };
        add(playersTrimmed);
        add(guildsTrimmed);
        if (merged.length < SUGGEST_LIMIT) {
          add(playersTrimmed.slice(merged.length));
          add(guildsTrimmed.slice(merged.length));
        }

        setPlayers(merged.filter((h) => h.kind === "player") as PlayerHit[]);
        setGuilds(merged.filter((h) => h.kind === "guild") as GuildHit[]);
        setServers(rowsS.slice(0, maxPerSection));
        setPlayersHasMore(playersTrimmed.length === FS_LIMIT);
        setGuildsHasMore(guildsTrimmed.length === FS_LIMIT);
        setActiveIndex(merged.length + rowsS.length ? 0 : -1);
        setLastSource("live");

        // Persist cache (store capped lists but include hasMore flags)
        setCachedSuggestions(qNorm, {
          players: playersTrimmed.map((p) => ({
            playerId: p.id,
            name: p.name,
            server: p.server,
            className: p.className,
            guildName: p.guildName,
          })),
          guilds: guildsTrimmed.map((g) => ({
            guildId: g.id,
            name: g.name,
            server: g.server ?? undefined,
          })),
          playersHasMore: playersTrimmed.length === FS_LIMIT,
          guildsHasMore: guildsTrimmed.length === FS_LIMIT,
        });
      } catch (e: any) {
        setError(e?.message || "Unbekannter Fehler bei der Suche.");
        setPlayers([]);
        setGuilds([]);
        setServers([]);
        setActiveIndex(-1);
      } finally {
        endReadScope(scope);
        setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [debounced, maxPerSection, recents.length]);

  React.useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      if (!boxRef.current) return;
      if (boxRef.current.contains(ev.target as Node)) return;
      setPlayers([]);
      setGuilds([]);
      setServers([]);
      setActiveIndex(-1);
      setIsOpen(false);
      setHasFocus(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const showRecents = isOpen && q.trim().length < MIN_CHARS && recents.length > 0;
  const shouldShowDropdown =
    isOpen &&
    (loading || error || showRecents || [...players, ...guilds, ...servers].length > 0 || (hasFocus && q.trim().length < MIN_CHARS));

  const recentHits: Hit[] = recents
    .filter((r): r is Extract<RecentEntry, { kind: "player" | "guild" }> => r.kind === "player" || r.kind === "guild")
    .map((r) =>
      r.kind === "player"
        ? {
            kind: "player" as const,
            id: r.id,
            name: r.name ?? null,
            nameFold: null,
            server: r.server ?? null,
            guildName: r.guildName ?? null,
            className: r.className ?? null,
            level: r.level ?? null,
            ts: null,
          }
        : {
            kind: "guild" as const,
            id: r.id,
            name: r.name ?? null,
            nameFold: null,
            server: r.server ?? null,
            memberCount: null,
            hofRank: null,
            ts: null,
          },
    );

  const flat: Hit[] = showRecents ? recentHits : [...players, ...guilds, ...servers];

  const navigateTo = (hit: Hit) => {
    if (hit.kind === "player") {
      persistRecent({
        kind: "player",
        id: hit.id,
        name: hit.name,
        className: hit.className,
        level: hit.level,
        guildName: hit.guildName,
        server: hit.server,
      });
      setRecents(loadRecents());
      navigate(`/player/${encodeURIComponent(hit.id)}`);
    } else if (hit.kind === "guild") {
      persistRecent({
        kind: "guild",
        id: hit.id,
        name: hit.name,
        server: hit.server,
      });
      setRecents(loadRecents());
      navigate(`/guild/${encodeURIComponent(hit.id)}`);
    } else {
      navigate(`/server/${encodeURIComponent(hit.id)}`);
    }
    setPlayers([]);
    setGuilds([]);
    setServers([]);
    setActiveIndex(-1);
    setQ("");
    setIsOpen(false);
    setLastSource(null);
  };

  const handleEnterToResults = () => {
    if (q.trim().length < MIN_CHARS) return;
    persistRecent({ kind: "query", value: q.trim() });
    setRecents(loadRecents());
    navigate(`/search?q=${encodeURIComponent(q.trim())}`);
    setIsOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && flat[activeIndex]) {
        navigateTo(flat[activeIndex]);
      } else {
        handleEnterToResults();
      }
      return;
    }
    if (e.key === "Escape") {
      setPlayers([]);
      setGuilds([]);
      setServers([]);
      setActiveIndex(-1);
      setIsOpen(false);
      return;
    }
    if (!flat.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
    }
  };

  const renderPlayerRow = (h: PlayerHit, idx: number, isRecent = false, recentKey?: string) => {
    const active = idx === activeIndex;
    return (
      <button
        key={`p-${h.id}-${idx}-${isRecent ? "r" : "s"}`}
        onClick={() => navigateTo(h)}
        style={active ? sx.itemActive : sx.item}
        title={h.name || ""}
        onMouseEnter={() => setActiveIndex(idx)}
      >
        <div style={sx.iconBox}>
          {getClassIcon ? (
            <img
              src={getClassIcon(h.className ?? undefined, 64)}
              alt={h.className ?? "class icon"}
              style={sx.iconImgShadow}
              loading="lazy"
            />
          ) : (
            <span style={sx.iconFallback}>{h.className ?? "?"}</span>
          )}
        </div>
        <div style={sx.meta}>
          <div style={sx.line1}>
            <span style={sx.name}>{h.name ?? h.id}</span>
            {isNum(h.level) && <span style={sx.badge}>Lvl {h.level}</span>}
            {isRecent && <span style={sx.recentsBadge}>{t("search.recentLabel", "Recent")}</span>}
            {isRecent && recentKey && (
              <button
                type="button"
                style={sx.clearBtn}
                aria-label={t("search.removeRecent", "Remove")}
                onClick={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  removeRecent(recentKey, setRecents);
                }}
              >
                ×
              </button>
            )}
          </div>
          <div style={sx.line2}>
            <span>{h.className ?? "Klasse ?"}</span>
            <span style={sx.sep}>·</span>
            <span>{h.server ?? "Server ?"}</span>
          </div>
        </div>
      </button>
    );
  };

  const renderGuildRow = (h: GuildHit, idx: number, isRecent = false, recentKey?: string) => {
    const active = idx === activeIndex;
    return (
      <button
        key={`g-${h.id}-${idx}-${isRecent ? "r" : "s"}`}
        onClick={() => navigateTo(h)}
        style={active ? sx.itemActive : sx.item}
        title={h.name || ""}
        onMouseEnter={() => setActiveIndex(idx)}
      >
        <div style={sx.iconBox}>🏰</div>
        <div style={sx.meta}>
          <div style={sx.line1}>
            <span style={sx.name}>{h.name ?? h.id}</span>
            {isNum(h.hofRank) && <span style={sx.badge}>HoF #{h.hofRank}</span>}
            {isRecent && <span style={sx.recentsBadge}>{t("search.recentLabel", "Recent")}</span>}
            {isRecent && recentKey && (
              <button
                type="button"
                style={sx.clearBtn}
                aria-label={t("search.removeRecent", "Remove")}
                onClick={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  removeRecent(recentKey, setRecents);
                }}
              >
                ×
              </button>
            )}
          </div>
          <div style={sx.line2}>
            <span>{h.server ?? "Server ?"}</span>
            <span style={sx.sep}>·</span>
            <span>
              {isNum(h.memberCount)
                ? t("search.guildMembers", "{{count}} members", { count: h.memberCount })
                : t("search.guildMembersUnknown", "Members ?")}
            </span>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div ref={boxRef} style={sx.wrap}>
      <input
        style={sx.input}
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => {
          setHasFocus(true);
          setIsOpen(true);
        }}
        onBlur={() => {
          // Leave dropdown state to outside click handler to avoid swallowing item clicks.
          setHasFocus(false);
        }}
        aria-label={t("search.inputLabel", "Spieler, Gilden und Server suchen")}
      />

      {shouldShowDropdown && (
        <div style={sx.dropdown}>
          {loading && <div style={sx.hint}>{t("search.loading", "Laden …")}</div>}
          {error && <div style={sx.err}>{error}</div>}

          {!loading && !error && showRecents && (
            <>
              <div style={sx.sectionHdr}>{t("search.recents", "Recent searches")}</div>
              {recents.length === 0 && (
                <div style={sx.hint}>{t("search.minCharsHint", "Type at least 3 characters…")}</div>
              )}
              {recents.map((entry, idx) => {
                if (entry.kind === "query") {
                  const key = keyForRecent(entry);
                  return (
                    <button
                      key={`rq-${idx}`}
                      style={sx.item}
                      onClick={() => {
                        setQ(entry.value);
                        setDebounced(entry.value);
                        setIsOpen(false);
                        setRecents(loadRecents());
                      }}
                    >
                      <div style={sx.meta}>
                        <div style={sx.line1}>
                          <span style={sx.name}>{entry.value}</span>
                          <span style={sx.recentsBadge}>{t("search.recentLabel", "Recent")}</span>
                          <button
                            type="button"
                            style={sx.clearBtn}
                            aria-label={t("search.removeRecent", "Remove")}
                            onClick={(ev) => {
                              ev.preventDefault();
                              ev.stopPropagation();
                              removeRecent(key, setRecents);
                            }}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </button>
                  );
                }
                if (entry.kind === "player") {
                  const hit: PlayerHit = {
                    kind: "player",
                    id: entry.id,
                    name: entry.name ?? null,
                    nameFold: null,
                    server: entry.server ?? null,
                    guildName: entry.guildName ?? null,
                    className: entry.className ?? null,
                    level: entry.level ?? null,
                    ts: null,
                  };
                  const key = keyForRecent(entry);
                  return (
                    <React.Fragment key={`rp-${entry.id}-${idx}`}>
                      {renderPlayerRow(hit, idx, true, key)}
                    </React.Fragment>
                  );
                }
                if (entry.kind === "guild") {
                  const hit: GuildHit = {
                    kind: "guild",
                    id: entry.id,
                    name: entry.name ?? null,
                    nameFold: null,
                    server: entry.server ?? null,
                    memberCount: null,
                    hofRank: null,
                    ts: null,
                  };
                  const key = keyForRecent(entry);
                  return (
                    <React.Fragment key={`rg-${entry.id}-${idx}`}>
                      {renderGuildRow(hit, idx + players.length, true, key)}
                    </React.Fragment>
                  );
                }
                return null;
              })}
            </>
          )}

          {!loading && !error && !showRecents && flat.length === 0 && (
            <div style={sx.hint}>{t("search.noResults", "No results")}</div>
          )}

          {!loading && !error && players.length > 0 && (
            <>
              <div style={sx.sectionHdr}>{t("search.players", "Players")}</div>
              {players.map((h, pi) => renderPlayerRow(h, pi))}
            </>
          )}

          {!loading && !error && guilds.length > 0 && (
            <>
              <div style={sx.sectionHdr}>{t("search.guilds", "Guilds")}</div>
              {guilds.map((h, gi) => {
                const globalIndex = players.length + gi;
                return renderGuildRow(h, globalIndex);
              })}
            </>
          )}

          {!loading && !error && servers.length > 0 && (
            <>
              <div style={sx.sectionHdr}>{t("search.servers", "Servers")}</div>
              {servers.map((h, si) => {
                const globalIndex = players.length + guilds.length + si;
                const active = globalIndex === activeIndex;
                return (
                  <button
                    key={`s-${h.id}-${si}`}
                    onClick={() => navigateTo(h)}
                    style={active ? sx.itemActive : sx.item}
                    title={h.displayName || h.code || h.host || ""}
                    onMouseEnter={() => setActiveIndex(globalIndex)}
                  >
                    <div style={sx.iconBoxPlain}>
                      <div style={sx.serverGlyph}>🌐</div>
                    </div>
                    <div style={sx.meta}>
                      <div style={sx.line1}>
                        <span style={sx.name}>{h.displayName ?? h.code ?? h.host ?? h.id}</span>
                        {h.active != null && (
                          <span style={sx.badge}>
                            {h.active ? t("search.active", "Active") : t("search.inactive", "Inactive")}
                          </span>
                        )}
                      </div>
                      <div style={sx.line2}>
                        <span>{h.code ?? "?"}</span>
                        <span style={sx.sep}>·</span>
                        <span>{h.host ?? "?"}</span>
                        <span style={sx.sep}>·</span>
                        <span>{h.region ?? "?"}</span>
                        {h.type ? (
                          <>
                            <span style={sx.sep}>·</span>
                            <span>{h.type.toUpperCase()}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </>
          )}

          {(playersHasMore || guildsHasMore) && (
            <button style={sx.moreCta} onClick={handleEnterToResults}>
              {t("search.moreResults", "More results… press Enter")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const sx: Record<string, React.CSSProperties> = {
  wrap: { position: "relative", display: "flex", alignItems: "center", width: "100%", maxWidth: 560 },
  input: {
    width: "100%", height: 40, padding: "0 12px", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", outline: "none",
  },
  dropdown: {
    position: "absolute", top: "110%", left: 0, right: 0, background: "rgba(12,28,46,0.97)",
    border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 6, zIndex: 50,
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)", maxHeight: 440, overflowY: "auto",
  },
  sectionHdr: { margin: "6px 6px 4px", padding: "2px 6px", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: "rgba(214,228,247,0.85)" },
  hint: { padding: "10px 12px", color: "rgba(214,228,247,0.85)", fontSize: 14 },
  err: { padding: "10px 12px", color: "#ff8a8a", fontSize: 14 },
  item: { display: "flex", alignItems: "center", gap: 10, width: "100%", border: "none", background: "transparent", textAlign: "left" as const, padding: 10, borderRadius: 10, cursor: "pointer", color: "#fff" },
  itemActive: { display: "flex", alignItems: "center", gap: 10, width: "100%", border: "none", textAlign: "left" as const, padding: 10, borderRadius: 10, cursor: "pointer", color: "#fff", background: "rgba(45,78,120,0.35)", outline: "1px solid rgba(92,139,198,0.55)" },

  iconBox: { width: 36, height: 36, borderRadius: 8, background: "rgba(26,47,74,1)", display: "grid", placeItems: "center", overflow: "hidden", flexShrink: 0 },
  iconBoxPlain: { width: 36, height: 36, display: "grid", placeItems: "center", background: "transparent", flexShrink: 0 },

  iconImgShadow: {
    width: "100%", height: "100%", objectFit: "contain",
    background: "transparent",
    filter: "drop-shadow(0 2px 3px rgba(0,0,0,.45)) drop-shadow(0 6px 10px rgba(0,0,0,.28))",
  } as React.CSSProperties,

  serverGlyph: {
    fontSize: 22,
    lineHeight: "1",
    filter: "drop-shadow(0 2px 3px rgba(0,0,0,.45)) drop-shadow(0 6px 10px rgba(0,0,0,.28))",
  },

  iconFallback: { fontSize: 12, color: "#B0C4D9" },
  meta: { display: "flex", flexDirection: "column" as const, minWidth: 0 },
  line1: { display: "flex", alignItems: "center", gap: 8 },
  name: { fontWeight: 700, color: "#F5F9FF" },
  badge: { fontSize: 12, background: "rgba(45,78,120,0.4)", padding: "2px 6px", borderRadius: 6 },
  line2: { display: "flex", alignItems: "center", gap: 6, color: "#B0C4D9", fontSize: 12 },
  sep: { opacity: 0.6 },
  moreCta: {
    width: "100%",
    border: "1px dashed rgba(255,255,255,0.3)",
    background: "transparent",
    color: "#d6e4f7",
    padding: "10px 12px",
    borderRadius: 10,
    cursor: "pointer",
    marginTop: 8,
  },
  recentsBadge: {
    marginLeft: 8,
    fontSize: 11,
    color: "#8aa5c4",
    border: "1px solid rgba(255,255,255,0.2)",
    padding: "0 6px",
    borderRadius: 12,
  },
  clearBtn: {
    marginLeft: 8,
    background: "transparent",
    border: "none",
    color: "rgba(214,228,247,0.85)",
    cursor: "pointer",
    fontSize: 12,
    padding: "0 4px",
  },
};
