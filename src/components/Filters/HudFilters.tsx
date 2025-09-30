// src/components/Filters/HudFilters.tsx
import React from "react";
import { useFilters } from "./FilterContext";
import { CLASSES } from "../../data/classes";
import styles from "./filters.module.css";
import { ClassIconButton } from "./atoms";

export default function HudFilters() {
  const {
    // Filter states
    servers, // nur für den Counter/Label genutzt
    classes, setClasses,
    range, setRange,
    sortBy, setSortBy,
    quickFav, setQuickFav,
    quickActive, setQuickActive,

    // UI modes
    filterMode,

    // SEPARATE Sheets
    setBottomFilterOpen,       // allgemeiner Bottom-Filter
    serverSheetOpen,           // NUR Server-Picker (lesen für aria)
    setServerSheetOpen,        // NUR Server-Picker (öffnen/schließen)

    // helper
    resetAll,
  } = useFilters();

  return (
    <div className={styles.hudWrap}>
      {/* Server Picker (öffnet den separaten Server-Picker, NICHT den Bottom-Filter) */}
      <button
        type="button"
        className={styles.hudBtn}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setServerSheetOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={serverSheetOpen || false}
        aria-label={`Select servers${servers.length ? ` (${servers.length} selected)` : ""}`}
        title="Open Server Picker"
      >
        🌐 Servers {servers.length ? `(${servers.length})` : ""}
      </button>

      {/* Klassen: NUR Icon als Button (transparent) */}
      <div className={styles.iconRow}>
        {CLASSES.map((c) => (
          <ClassIconButton
            key={c.key}
            active={classes.includes(c.key)}
            title={c.label}
            iconUrl={c.iconUrl}   // Drive-/Asset-URL aus deinem CLASSES-Katalog
            fallback={c.fallback} // Emoji-Fallback falls Bild fehlschlägt
            size={40}
            onClick={() =>
              setClasses((prev) =>
                prev.includes(c.key) ? prev.filter((k) => k !== c.key) : [...prev, c.key]
              )
            }
          />
        ))}
        <button type="button" className={styles.hudSubBtn} onClick={() => setClasses(CLASSES.map((c) => c.key))}>
          All
        </button>
        <button type="button" className={styles.hudSubBtn} onClick={() => setClasses([])}>
          None
        </button>
      </div>

      {/* Range */}
      <div className={styles.segmented} role="group" aria-label="Range">
        {(["3d", "7d", "14d", "30d", "90d", "all"] as const).map((k) => (
          <button type="button" key={k} aria-pressed={range === k} onClick={() => setRange(k)}>
            {k}
          </button>
        ))}
      </div>

      {/* Sort */}
      <label className={styles.sortLabel}>
        Sort
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className={styles.sortSelect}
        >
          <option value="level">Level</option>
          <option value="scrapbook">Scrapbook</option>
          <option value="activity">Activity</option>
          <option value="lastScan">Last scan</option>
        </select>
      </label>

      {/* Quick chips */}
      <button
        type="button"
        className={`${styles.chip} ${quickFav ? styles.isActive : ""}`}
        onClick={() => setQuickFav((v) => !v)}
      >
        ⭐ Favorites
      </button>
      <button
        type="button"
        className={`${styles.chip} ${quickActive ? styles.isActive : ""}`}
        onClick={() => setQuickActive((v) => !v)}
      >
        ⚡ Active
      </button>

      {/* Right Side Actions */}
      <div className="ml-auto flex items-center gap-2">
        <button type="button" className={styles.hudSubBtn} onClick={resetAll}>
          Reset
        </button>

        {/* Der allgemeine Bottom-Filter bleibt separat und wird nur hier geöffnet */}
        {filterMode === "sheet" && (
          <button
            type="button"
            className={styles.hudBtn}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setBottomFilterOpen(true);
            }}
            title="Open Filters"
          >
            Open Filters
          </button>
        )}
      </div>
    </div>
  );
}
