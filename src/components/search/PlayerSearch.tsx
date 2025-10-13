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

// Klassen-Mapping lokal einbinden (Icon-Auflösung findet hier statt)
import { CLASSES, CLASS_BY_KEY } from "../../data/classes";

type PlayerHit = {
  playerId: string;
  name: string | null;
  nameFold: string | null;
  guildName: string | null;
  className: string | null;
  level: number | null;
  server: string | null;
  updatedAtSec?: number | null;
};

export type PlayerSearchProps = {
  placeholder?: string;
  // Optional weiterhin erlaubt – wird nur genutzt, wenn übergeben.
  getClassIcon?: (className?: string | null) => string | undefined;
  maxResults?: number;
};

// Normalisierung für robuste Vergleiche (case/diakritik/sonderzeichen)
function fold(s?: string | null) {
  return String(s ?? "")
    .normalize("NFD")
    // @ts-ignore
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

// Interne, robuste Icon-Auflösung (nutzt labels & keys aus classes.ts)
function resolveClassIcon(className?: string | null): string | undefined {
  if (!className) return undefined;
  const canon = fold(className);

  // 1) Key-Treffer
  for (const k in CLASS_BY_KEY) {
    if (fold(k) === canon) {
      return CLASS_BY_KEY[k as keyof typeof CLASS_BY_KEY].iconUrl;
    }
  }
  // 2) Label-Treffer
  const byLabel = CLASSES.find((c) => fold(c.label) === canon);
  if (byLabel) return byLabel.iconUrl;

  // 3) startsWith / includes fallback
  const starts = CLASSES.find(
    (c) => fold(c.label).startsWith(canon) || fold(c.key).startsWith(canon)
  );
  if (starts) return starts.iconUrl;

  const contains = CLASSES.find(
    (c) => fold(c.label).includes(canon) || fold(c.key).includes(canon)
  );
  if (contains) return contains.iconUrl;

  return undefined;
}

export default function PlayerSearch({
  placeholder = "Suchen (Spieler)…",
  getClassIcon, // optional
  maxResults = 10,
}: PlayerSearchProps) {
  const navigate = useNavigate();
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hits, setHits] = React.useState<PlayerHit[]>([]);
  const [activeIndex, setActiveIndex] = React.useState<number>(-1);
  const boxRef = React.useRef<HTMLDivElement | null>(null);

  // Debounce
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  // Suche
  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setError(null);
      const term = debounced;
      if (term.length < 1) {
        setHits([]);
        setActiveIndex(-1);
        return;
      }
      setLoading(true);
      try {
        const cg = collectionGroup(db, "latest");
        const folded = term
          .normalize("NFD")
          // @ts-ignore
          .replace(/\p{Diacritic}/gu, "")
          .toLowerCase();

        // 1) Prefix-Query auf nameFold
        const qPrefix = fsQuery(
          cg,
          orderBy("nameFold"),
          startAt(folded),
          endAt(folded + "\uf8ff"),
          limit(maxResults)
        );
        const snapPrefix = await getDocs(qPrefix);

        // 2) Edge-Ngram Query auf nameNgrams (liefert schon ab 1 Zeichen)
        const qNgram = fsQuery(
          cg,
          where("nameNgrams", "array-contains", folded),
          limit(maxResults)
        );
        const snapNgram = await getDocs(qNgram);

        if (cancelled) return;

        // Merge (Prefix zuerst, dann Ngram ohne Duplikate)
        const seen = new Set<string>();
        const rows: PlayerHit[] = [];

        function pushDoc(docSnap: any) {
          const playerId = docSnap.ref.parent.parent?.id || "";
          if (!playerId || seen.has(playerId)) return;
          seen.add(playerId);
          const d = docSnap.data() as any;
          rows.push({
            playerId,
            name: d.name ?? null,
            nameFold: d.nameFold ?? null,
            guildName: d.guildName ?? d.values?.Guild ?? null,
            className: d.className ?? d.values?.Class ?? null,
            level: Number.isFinite(Number(d.level))
              ? Number(d.level)
              : Number.isFinite(Number(d.values?.Level))
              ? Number(d.values.Level)
              : null,
            server: d.server ?? d.values?.Server ?? null,
            updatedAtSec: Number.isFinite(Number(d.timestamp)) ? Number(d.timestamp) : null,
          });
        }

        snapPrefix.forEach(pushDoc);
        snapNgram.forEach(pushDoc);

        setHits(rows.slice(0, maxResults));
        setActiveIndex(rows.length ? 0 : -1);
      } catch (e: any) {
        setError(e?.message || "Unbekannter Fehler bei der Suche.");
        setHits([]);
        setActiveIndex(-1);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [debounced, maxResults]);

  // Outside-click
  React.useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(ev.target as Node)) {
        setHits([]);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function gotoHit(hit: PlayerHit) {
    if (!hit?.playerId) return;
    setHits([]);
    setActiveIndex(-1);
    setQ("");
    navigate(`/player/${encodeURIComponent(hit.playerId)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!hits.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((idx) => (idx + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((idx) => (idx - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const folded = q
        .trim()
        .normalize("NFD")
        // @ts-ignore
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase();
      const exact = hits.find((h) => (h.nameFold || "") === folded);
      if (exact) return gotoHit(exact);
      const first = hits[0];
      if (first) gotoHit(first);
    } else if (e.key === "Escape") {
      setHits([]);
      setActiveIndex(-1);
    }
  }

  // Wenn eine getClassIcon-Prop übergeben wird, nutzen wir sie bevorzugt.
  function iconFor(className?: string | null): string | undefined {
    const viaProp = getClassIcon?.(className);
    if (viaProp) return viaProp;
    return resolveClassIcon(className);
  }

  return (
    <div ref={boxRef} style={sx.wrap}>
      <input
        style={sx.input}
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label="Spieler suchen"
      />
      {(loading || error || hits.length > 0) && (
        <div style={sx.dropdown}>
          {loading && <div style={sx.hint}>Suche…</div>}
          {error && !loading && <div style={sx.err}>⚠️ {error}</div>}
          {!loading && !error && hits.length === 0 && debounced.length >= 1 && (
            <div style={sx.hint}>Kein Ergebnis – Scan hochladen</div>
          )}
          {!loading &&
            !error &&
            hits.map((h, i) => {
              const active = i === activeIndex;
              const iconUrl = iconFor(h.className);

              return (
                <button
                  key={`${h.playerId}-${i}`}
                  onClick={() => gotoHit(h)}
                  style={active ? sx.itemActive : sx.item}
                  title={h.name || ""}
                >
                  {/* Klassen-Icon statt Avatar */}
                  <div style={sx.iconBox}>
                    {iconUrl ? (
                      <img
                        src={iconUrl}
                        alt=""
                        style={sx.iconImg}
                        onError={(ev) => {
                          // Fallback: versuche Emoji-Fallback aus Mapping
                          const c =
                            CLASS_BY_KEY[h.className as keyof typeof CLASS_BY_KEY] ||
                            CLASSES.find((x) => fold(x.label) === fold(h.className || ""));
                          const fallbackEmoji = c?.fallback || "🎭";
                          // ersetze Bild durch Emoji
                          const el = ev.currentTarget;
                          const parent = el.parentElement;
                          if (parent) {
                            parent.innerHTML = `<div style="font-size:12px;color:#B0C4D9;">${fallbackEmoji}</div>`;
                          }
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
                      {typeof h.level === "number" && (
                        <span style={sx.level}>Lvl {h.level}</span>
                      )}
                    </div>
                    <div style={sx.line2}>
                      {h.guildName ? (
                        <span style={sx.guild}>⟦{h.guildName}⟧</span>
                      ) : (
                        <span style={sx.muted}>—</span>
                      )}
                      <span style={sx.sep}>•</span>
                      <span style={sx.classText}>{h.className ?? "Klasse ?"}</span>
                      <span style={sx.sep}>•</span>
                      <span style={sx.server}>{h.server ?? "Server ?"}</span>
                    </div>
                  </div>
                </button>
              );
            })}
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
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)", maxHeight: 420, overflowY: "auto",
  },
  hint: { padding: "10px 12px", color: "rgba(214,228,247,0.85)", fontSize: 14 },
  err: { padding: "10px 12px", color: "#ff8a8a", fontSize: 14 },
  item: {
    display: "flex", alignItems: "center", gap: 10, width: "100%", border: "none", background: "transparent",
    textAlign: "left" as const, padding: 10, borderRadius: 10, cursor: "pointer", color: "#fff",
  },
  itemActive: {
    display: "flex", alignItems: "center", gap: 10, width: "100%", border: "none", textAlign: "left" as const,
    padding: 10, borderRadius: 10, cursor: "pointer", color: "#fff", background: "rgba(45,78,120,0.35)",
    outline: "1px solid rgba(92,139,198,0.55)",
  },
  iconBox: { width: 36, height: 36, borderRadius: 8, background: "rgba(26,47,74,1)", display: "grid", placeItems: "center", overflow: "hidden", flexShrink: 0 },
  iconImg: { width: "100%", height: "100%", objectFit: "contain" as const },
  iconFallback: { fontSize: 12, color: "#B0C4D9" },
  meta: { display: "flex", flexDirection: "column" as const, minWidth: 0 },
  line1: { display: "flex", alignItems: "center", gap: 8 },
  name: { fontWeight: 700, color: "#F5F9FF" },
  level: { fontSize: 12, opacity: 0.9, background: "rgba(30,47,71,0.9)", padding: "2px 6px", borderRadius: 6 },
  line2: { display: "flex", alignItems: "center", gap: 6, color: "#B0C4D9", fontSize: 12 },
  sep: { opacity: 0.6 },
  guild: { color: "#D6E4F7" },
  classText: { color: "#8AA5C4" },
  server: { color: "#8AA5C4" },
};
