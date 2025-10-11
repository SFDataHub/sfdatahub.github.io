import React, { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";

/** Layout-Modus */
type Mode = "sheet" | "modal";
type RegionKey = "EU" | "US" | "INT" | "Fusion";

type Props = {
  /** Sichtbarkeit wird ausschließlich über Props gesteuert */
  open: boolean;
  onClose: () => void;

  /** Layout: "modal" (zentriert) oder "sheet" (Bottom-Sheet) */
  mode?: Mode;

  /** Serverdaten: { EU: [...], US: [...], INT: [...], Fusion: [...] } */
  serversByRegion: Record<RegionKey, string[]>;

  /** aktuell ausgewählte Server */
  selected: string[];

  /** Toggle einzelner Server */
  onToggle: (server: string) => void;

  /** Alle Server einer Region selektieren */
  onSelectAllInRegion?: (region: RegionKey) => void;

  /** Alles abwählen */
  onClearAll: () => void;
};

const PALETTE = {
  tile: "#1A2F4A",
  line: "#2B4C73",
  chip: "#14273E",
  text: "#F5F9FF",
  text2: "#B0C4D9",
  backdrop: "rgba(0,0,0,.5)",
  input: "#0F2034",
  accent: "#5C8BC6",
};

export default function ServerSheet({
  open,
  onClose,
  mode = "modal",
  serversByRegion,
  selected,
  onToggle,
  onSelectAllInRegion,
  onClearAll,
}: Props) {
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  // --- NEU: optional geladene Liste aus Firestore, wenn props leer sind ---
  const [loadedByRegion, setLoadedByRegion] = useState<Record<RegionKey, string[]> | null>(null);
  const [loading, setLoading] = useState(false);

  // ESC schließt
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus-Trap rudimentär
  useEffect(() => {
    if (open && rootRef.current) {
      const el = rootRef.current.querySelector<HTMLInputElement>("#sheet-serversearch");
      el?.focus();
    }
  }, [open]);

  // Prüfen, ob props leer sind
  const propsAreEmpty = useMemo(() => {
    const keys: RegionKey[] = ["EU", "US", "INT", "Fusion"];
    return keys.every((k) => !serversByRegion?.[k]?.length);
  }, [serversByRegion]);

  // Falls props leer -> beim Öffnen Firestore holen
  useEffect(() => {
    if (!open) return;
    if (!propsAreEmpty) return; // wir haben Daten via Props – nichts tun
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        const snap = await getDoc(doc(db, "stats_public", "toplists_bundle_v1"));
        if (!alive) return;
        const data: any = snap.data() || {};
        // servers kann Array oder JSON-String sein
        const raw: string[] = Array.isArray(data.servers) ? data.servers : JSON.parse(data.servers || "[]");
        setLoadedByRegion(groupByRegion(raw));
      } catch {
        setLoadedByRegion(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, propsAreEmpty]);

  // Effektiv genutzte Liste (Props haben Vorrang)
  const effectiveByRegion: Record<RegionKey, string[]> = useMemo(() => {
    if (!propsAreEmpty) return serversByRegion;
    return (
      loadedByRegion ?? {
        EU: [],
        US: [],
        INT: [],
        Fusion: [],
      }
    );
  }, [propsAreEmpty, serversByRegion, loadedByRegion]);

  const regions = useMemo(() => Object.keys(effectiveByRegion) as RegionKey[], [effectiveByRegion]);

  const filterMatches = (name: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return name.toLowerCase().includes(q);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="server-dialog-title"
      style={backdropStyle}
      onClick={(e) => {
        // Klick auf Backdrop schließt
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={rootRef}
        style={mode === "modal" ? modalStyle : sheetStyle}
        className="sf-server-sheet"
      >
        {/* Header */}
        <div style={headerRow}>
          <h2 id="server-dialog-title" style={h2Style}>Select servers</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClearAll} style={ghostBtn}>Clear</button>
            <button type="button" onClick={onClose} style={primaryBtn}>Done</button>
          </div>
        </div>

        {/* Suche */}
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <label htmlFor="sheet-serversearch" className="sr-only">Search servers</label>
          <input
            id="sheet-serversearch"
            name="sheet-serversearch"
            type="text"
            placeholder="Search servers…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search servers"
            autoComplete="off"
            style={searchInput}
          />
        </div>

        {/* Listen nach Regionen */}
        <div style={{ display: "grid", gap: 16, maxHeight: "60vh", overflow: "auto" }}>
          {regions.map((region) => {
            const list = (effectiveByRegion[region] || []).filter(filterMatches);
            return (
              <section key={region} aria-labelledby={`region-${region}`}>
                <div style={regionHeader}>
                  <h3 id={`region-${region}`} style={h3Style}>
                    {region} {loading && propsAreEmpty ? <span style={{ marginLeft: 6, fontSize: 12, color: PALETTE.text2 }}>(loading…)</span> : null}
                  </h3>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      style={ghostBtn}
                      onClick={() => {
                        if (onSelectAllInRegion) {
                          onSelectAllInRegion(region);
                        } else {
                          // Fallback: alles in Region aktivieren
                          const toAdd = list.filter((s) => !selected.includes(s));
                          toAdd.forEach(onToggle);
                        }
                      }}
                    >
                      Select all
                    </button>
                  </div>
                </div>
                <div style={chipRow}>
                  {list.map((srv) => {
                    const active = selected.includes(srv);
                    return (
                      <button
                        key={srv}
                        type="button"
                        onClick={() => onToggle(srv)}
                        aria-pressed={active}
                        title={srv}
                        style={{ ...chip, ...(active ? chipActive : null) }}
                      >
                        {srv}
                      </button>
                    );
                  })}
                  {list.length === 0 && (
                    <div style={{ color: PALETTE.text2, fontSize: 13, padding: "4px 2px" }}>
                      {loading && propsAreEmpty ? "Loading…" : "No servers found"}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Gruppiert eine flache Serverliste nach Regionen */
function groupByRegion(all: string[]): Record<RegionKey, string[]> {
  const out: Record<RegionKey, string[]> = { EU: [], US: [], INT: [], Fusion: [] };

  for (const s of all) {
    const up = s.toUpperCase();
    if (up.startsWith("EU")) out.EU.push(s);
    else if (up.startsWith("US") || up.startsWith("NA") || up.startsWith("AM")) out.US.push(s);
    else if (up.startsWith("F")) out.Fusion.push(s);
    else out.INT.push(s);
  }

  // stabile Sortierung
  (Object.keys(out) as RegionKey[]).forEach((k) => out[k].sort(naturalCompare));
  return out;
}

/** EU2, EU10 natürlich sortieren */
function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/* ---------- Styles (inline, 1:1 aus deiner Datei) ---------- */
const backdropStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: PALETTE.backdrop, zIndex: 50,
  display: "grid", placeItems: "center", padding: 16,
};

const modalStyle: React.CSSProperties = {
  width: "min(900px, 100%)",
  background: PALETTE.tile,
  border: `1px solid ${PALETTE.line}`,
  borderRadius: 16,
  boxShadow: "0 10px 40px rgba(0,0,0,.4)",
  padding: 16,
  color: PALETTE.text,
};

const sheetStyle: React.CSSProperties = {
  ...modalStyle,
  width: "min(900px, 100%)",
  marginTop: "auto",
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
};

const headerRow: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12,
};
const h2Style: React.CSSProperties = { fontSize: 18, margin: 0 };
const h3Style: React.CSSProperties = { fontSize: 14, margin: 0, color: PALETTE.text2 };

const searchInput: React.CSSProperties = {
  width: "100%", background: PALETTE.input, color: PALETTE.text,
  border: `1px solid ${PALETTE.line}`, borderRadius: 12, padding: "10px 12px",
};

const regionHeader: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8,
};

const chipRow: React.CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: 8,
};

const chip: React.CSSProperties = {
  background: PALETTE.chip,
  border: `1px solid ${PALETTE.line}`,
  padding: "6px 10px",
  borderRadius: 999,
  color: PALETTE.text,
};
const chipActive: React.CSSProperties = {
  outline: `2px solid ${PALETTE.accent}`,
  boxShadow: "inset 0 0 16px rgba(92,139,198,.25)",
};

const primaryBtn: React.CSSProperties = {
  background: "#25456B",
  color: PALETTE.text,
  border: `1px solid ${PALETTE.accent}`,
  borderRadius: 10,
  padding: "8px 12px",
};
const ghostBtn: React.CSSProperties = {
  background: "transparent",
  color: PALETTE.text,
  border: `1px solid ${PALETTE.line}`,
  borderRadius: 10,
  padding: "8px 12px",
};

/** Visually hidden helper (falls du keine globale .sr-only Klasse hast) */
const srOnlyStyle = `
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
`.trim();

/* Optional: registriere die .sr-only Klasse einmalig */
if (typeof document !== "undefined") {
  const id = "sf-sr-only-style";
  if (!document.getElementById(id)) {
    const tag = document.createElement("style");
    tag.id = id;
    tag.textContent = srOnlyStyle;
    document.head.appendChild(tag);
  }
}
