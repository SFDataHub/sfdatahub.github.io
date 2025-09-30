import React, { useEffect, useRef } from "react";
import { useFilters } from "./FilterContext";

type Props = {
  open: boolean;
  onClose: () => void;
};

const PALETTE = {
  tile: "#1A2F4A",
  line: "#2B4C73",
  text: "#F5F9FF",
  text2: "#B0C4D9",
  input: "#0F2034",
  accent: "#5C8BC6",
  backdrop: "rgba(0,0,0,.5)",
};

export default function BottomFilterSheet({ open, onClose }: Props) {
  const {
    searchText, setSearchText,
    range, setRange,
    sortBy, setSortBy,
    quickFav, setQuickFav,
    quickActive, setQuickActive,
  } = useFilters();

  const rootRef = useRef<HTMLDivElement | null>(null);

  // ESC schließt
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Autofocus ins Suchfeld
  useEffect(() => {
    if (open && rootRef.current) {
      const el = rootRef.current.querySelector<HTMLInputElement>("#sheet-search");
      el?.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="filters-title"
      style={backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={rootRef} style={panel}>
        <div style={headerRow}>
          <h2 id="filters-title" style={{ fontSize: 16, margin: 0, color: PALETTE.text }}>Filters</h2>
          <button type="button" onClick={onClose} style={primaryBtn}>Done</button>
        </div>

        {/* Suche */}
        <div style={{ display: "grid", gap: 8 }}>
          <label htmlFor="sheet-search" className="sr-only">Search</label>
          <input
            id="sheet-search"
            name="sheet-search"
            type="text"
            placeholder="Search…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            aria-label="Search"
            autoComplete="off"
            style={input}
          />
        </div>

        {/* Range (Buttons – keine Radios) */}
        <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
          <span style={{ color: PALETTE.text2, fontSize: 12 }}>Range</span>
          <div role="group" aria-label="Range" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(["3d", "7d", "14d", "30d", "60d", "90d", "all"] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={range === r}
                onClick={() => setRange(r)}
                style={{ ...chip, ...(range === r ? chipActive : null) }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Sort (mit id/name + Labelbindung) */}
        <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
          <label htmlFor="sheet-toplists-sort" style={{ color: PALETTE.text2, fontSize: 12 }}>Sort</label>
          <select
            id="sheet-toplists-sort"
            name="sheet-toplists-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            aria-label="Sort"
            autoComplete="off"
            style={select}
          >
            <option value="sum">Base Sum</option>
            <option value="main">Main Base Stat</option>
            <option value="constitution">Constitution</option>
            <option value="level">Level</option>
            <option value="delta">Δ Rank</option>
            <option value="lastActivity" disabled>Last activity (disabled)</option>
          </select>
        </div>

        {/* Quick-Filter */}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setQuickFav((v) => !v)}
            aria-pressed={quickFav}
            style={{ ...chip, ...(quickFav ? chipActive : null) }}
          >
            ⭐ Favorites
          </button>
          <button
            type="button"
            onClick={() => setQuickActive((v) => !v)}
            aria-pressed={quickActive}
            style={{ ...chip, ...(quickActive ? chipActive : null) }}
          >
            ⚡ Active
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Styles ---------- */
const backdrop: React.CSSProperties = {
  position: "fixed", inset: 0, background: PALETTE.backdrop, zIndex: 60,
  display: "grid", alignItems: "end",
};

const panel: React.CSSProperties = {
  background: PALETTE.tile,
  borderTop: `1px solid ${PALETTE.line}`,
  borderLeft: `1px solid ${PALETTE.line}`,
  borderRight: `1px solid ${PALETTE.line}`,
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  padding: 16,
  color: PALETTE.text,
  maxHeight: "80vh",
  overflow: "auto",
};

const headerRow: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12,
};

const input: React.CSSProperties = {
  width: "100%",
  background: PALETTE.input,
  color: PALETTE.text,
  border: `1px solid ${PALETTE.line}`,
  borderRadius: 12,
  padding: "10px 12px",
};

const select: React.CSSProperties = {
  ...input,
  appearance: "none",
};

const chip: React.CSSProperties = {
  background: "#14273E",
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

/** Visually hidden helper (falls global nicht vorhanden) */
const srOnlyStyle = `
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
`.trim();

if (typeof document !== "undefined") {
  const id = "sf-sr-only-style";
  if (!document.getElementById(id)) {
    const tag = document.createElement("style");
    tag.id = id;
    tag.textContent = srOnlyStyle;
    document.head.appendChild(tag);
  }
}
