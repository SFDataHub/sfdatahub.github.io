// src/components/search/UniversalSearch.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import {
  collectionGroup,
  endAt,
  getDocs,
  limit,
  orderBy,
  query as fsQuery,
  startAt,
  where,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { CLASSES } from "../../data/classes";
import { toDriveThumbProxy } from "../../lib/urls";

/** -------- Types -------- */
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

type Hit = PlayerHit | GuildHit;

/** ---------- helpers ---------- */
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

/** Klassenicon: matcht Label (case-insensitiv) → proxied Drive-Thumbnail */
function iconUrlByLabel(label?: string | null, size = 64): string | undefined {
  if (!label) return undefined;
  const strip = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const target = strip(label);

  let c = CLASSES.find((cl) => strip(cl.label) === target);
  if (!c) c = CLASSES.find((cl) => strip(cl.label).startsWith(target) || target.startsWith(strip(cl.label)));
  if (!c) return undefined;

  // Wichtig: Proxy-Thumb (wie in deinen HUD-Filtern), damit kein 403/Redirect
  return toDriveThumbProxy(c.iconUrl, size);
}

function getRootAndId(docSnap: any): { root?: string; id?: string } {
  const latestCol = docSnap.ref.parent;            // .../latest
  const parentDoc = latestCol?.parent;             // .../players/{id} ODER .../guilds/{id}
  const rootCol   = parentDoc?.parent;             // /players ODER /guilds
  return { root: rootCol?.id, id: parentDoc?.id };
}

export default function UniversalSearch({
  placeholder = "Suchen … (Spieler & Gilden)",
  maxPerSection = 8,
}: {
  placeholder?: string;
  maxPerSection?: number;
}) {
  const navigate = useNavigate();
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [players, setPlayers] = React.useState<PlayerHit[]>([]);
  const [guilds, setGuilds] = React.useState<GuildHit[]>([]);
  const [activeIndex, setActiveIndex] = React.useState<number>(-1);
  const boxRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      setError(null);
      const term = debounced;
      if (term.length < 1) {
        setPlayers([]); setGuilds([]); setActiveIndex(-1);
        return;
      }
      setLoading(true);
      try {
        const cg = collectionGroup(db, "latest");
        const folded = fold(term);

        // Prefix-Query
        const snapPrefix = await getDocs(
          fsQuery(
            cg,
            orderBy("nameFold"),
            startAt(folded),
            endAt(folded + "\uf8ff"),
            limit(maxPerSection * 4)
          )
        );

        // Ngram-Query
        const snapNgram = await getDocs(
          fsQuery(cg, where("nameNgrams", "array-contains", folded), limit(maxPerSection * 4))
        );

        if (cancelled) return;

        const seenP = new Set<string>();
        const seenG = new Set<string>();
        const rowsP: PlayerHit[] = [];
        const rowsG: GuildHit[] = [];

        function consider(docSnap: any) {
          const d = docSnap.data() as any;
          const isPlayer = !!d.playerId && !d.guildIdentifier;
          const isGuild  = !!d.guildIdentifier && !d.playerId;
          const { root, id } = getRootAndId(docSnap);
          const safeId = id || d.playerId || d.guildIdentifier || "";

          if (isPlayer || root === "players") {
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

          if (isGuild || root === "guilds") {
            if (!safeId || seenG.has(safeId)) return;
            seenG.add(safeId);
            rowsG.push({
              kind: "guild",
              id: safeId,
              name: d.name ?? d.values?.Name ?? null,
              nameFold: d.nameFold ?? null,
              server: d.server ?? d.values?.Server ?? null,
              memberCount: toNumberLoose(
                d.memberCount ?? d.values?.["Guild Member Count"] ?? d.values?.GuildMemberCount
              ),
              hofRank: toNumberLoose(
                d.hofRank ??
                  d.values?.["Hall of Fame Rank"] ??
                  d.values?.HoF ??
                  d.values?.Rank ??
                  d.values?.["Guild Rank"]
              ),
              ts: toNumberLoose(d.timestamp),
            });
            return;
          }
        }

        snapPrefix.forEach(consider);
        snapNgram.forEach(consider);

        setPlayers(rowsP.slice(0, maxPerSection));
        setGuilds(rowsG.slice(0, maxPerSection));
        setActiveIndex(rowsP.length + rowsG.length ? 0 : -1);
      } catch (e: any) {
        setError(e?.message || "Unbekannter Fehler bei der Suche.");
        setPlayers([]); setGuilds([]); setActiveIndex(-1);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [debounced, maxPerSection]);

  React.useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(ev.target as Node)) {
        setPlayers([]); setGuilds([]); setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const navigateTo = (hit: Hit) => {
    if (hit.kind === "player") navigate(`/player/${encodeURIComponent(hit.id)}`);
    else navigate(`/guild/${encodeURIComponent(hit.id)}`);
    setPlayers([]); setGuilds([]); setActiveIndex(-1); setQ("");
  };

  const flat: Hit[] = [...players, ...guilds];
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!flat.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => (i + 1) % flat.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => (i - 1 + flat.length) % flat.length); }
    else if (e.key === "Enter")  { e.preventDefault(); const hit = flat[activeIndex >= 0 ? activeIndex : 0]; if (hit) navigateTo(hit); }
    else if (e.key === "Escape") { setPlayers([]); setGuilds([]); setActiveIndex(-1); }
  };

  return (
    <div ref={boxRef} style={sx.wrap}>
      <input
        style={sx.input}
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label="Spieler und Gilden suchen"
      />

      {(loading || error || players.length || guilds.length) && (
        <div style={sx.dropdown}>
          {loading && <div style={sx.hint}>Suche…</div>}
          {error && !loading && <div style={sx.err}>⚠️ {error}</div>}

          {!loading && !error && (players.length > 0 || guilds.length > 0) && (
            <>
              {players.length > 0 && (
                <>
                  <div style={sx.sectionHdr}>Spieler</div>
                  {players.map((h, idx) => {
                    const active = idx === activeIndex;
                    const iconUrl = iconUrlByLabel(h.className, 64);
                    return (
                      <button
                        key={`p-${h.id}-${idx}`}
                        onClick={() => navigateTo(h)}
                        style={active ? sx.itemActive : sx.item}
                        title={h.name || ""}
                        onMouseEnter={() => setActiveIndex(idx)}
                      >
                        <div style={sx.iconBox}>
                          {iconUrl ? (
                            <img
                              src={iconUrl}
                              alt=""
                              style={sx.iconImg}
                              onError={(ev) => {
                                // sauberer Fallback ohne broken-image-Icon
                                const parent = ev.currentTarget.parentElement;
                                if (parent) parent.innerHTML = `<div style="font-size:12px;color:#B0C4D9;">🎭</div>`;
                              }}
                            />
                          ) : (
                            <div style={sx.iconFallback}>
                              {(h.className || " ? ").toString().slice(0, 2)}
                            </div>
                          )}
                        </div>

                        <div style={sx.meta}>
                          <div style={sx.line1}>
                            <span style={sx.name}>{h.name ?? "Unbekannt"}</span>
                            {isNum(h.level) && <span style={sx.badge}>Lvl {h.level}</span>}
                          </div>
                          <div style={sx.line2}>
                            {h.guildName ? <span>⟦{h.guildName}⟧</span> : <span style={sx.muted}>—</span>}
                            <span style={sx.sep}>•</span>
                            <span>{h.className ?? "Klasse ?"}</span>
                            <span style={sx.sep}>•</span>
                            <span>{h.server ?? "Server ?"}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}

              {guilds.length > 0 && (
                <>
                  <div style={sx.sectionHdr}>Gilden</div>
                  {guilds.map((h, gi) => {
                    const globalIndex = players.length + gi;
                    const active = globalIndex === activeIndex;
                    return (
                      <button
                        key={`g-${h.id}-${gi}`}
                        onClick={() => navigateTo(h)}
                        style={active ? sx.itemActive : sx.item}
                        title={h.name || ""}
                        onMouseEnter={() => setActiveIndex(globalIndex)}
                      >
                        <div style={sx.iconBox}>🏰</div>
                        <div style={sx.meta}>
                          <div style={sx.line1}>
                            <span style={sx.name}>{h.name ?? "Unbekannt"}</span>
                            {isNum(h.hofRank) && <span style={sx.badge}>HoF #{h.hofRank}</span>}
                          </div>
                          <div style={sx.line2}>
                            <span>{h.server ?? "Server ?"}</span>
                            <span style={sx.sep}>•</span>
                            <span>{isNum(h.memberCount) ? `${h.memberCount} Mitglieder` : "Mitglieder ?"}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </>
          )}

          {!loading && !error && players.length === 0 && guilds.length === 0 && debounced.length >= 1 && (
            <div style={sx.hint}>Keine Treffer</div>
          )}
        </div>
      )}
    </div>
  );
}

/** ---------- styles ---------- */
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
  iconImg: { width: "100%", height: "100%", objectFit: "contain" as const },
  iconFallback: { fontSize: 12, color: "#B0C4D9" },
  meta: { display: "flex", flexDirection: "column" as const, minWidth: 0 },
  line1: { display: "flex", alignItems: "center", gap: 8 },
  name: { fontWeight: 700, color: "#F5F9FF" },
  badge: { fontSize: 12, background: "rgba(45,78,120,0.4)", padding: "2px 6px", borderRadius: 6 },
  line2: { display: "flex", alignItems: "center", gap: 6, color: "#B0C4D9", fontSize: 12 },
  sep: { opacity: 0.6 },
  muted: { opacity: 0.7 },
};
