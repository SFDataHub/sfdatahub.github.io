// src/components/Filters/HudFilters.tsx
import React from "react";
import { useFilters, type DaysFilter } from "./FilterContext";
import { CLASSES } from "../../data/classes";
import styles from "./filters.module.css";
import { ClassIconButton } from "./atoms";

const RANGE_OPTIONS: { label: string; value: DaysFilter }[] = [
  { label: "3d", value: 3 },
  { label: "7d", value: 7 },
  { label: "14d", value: 14 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
  { label: "all", value: "all" },
];

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
        {RANGE_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.label}
            aria-pressed={range === option.value}
            onClick={() => setRange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Sort (mit id/name + Labelbindung) */}
      <label className={styles.sortLabel} htmlFor="toplists-sort">
        Sort
      </label>
      <select
        id="toplists-sort"
        name="toplists-sort"
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value as any)}
        className={styles.sortSelect}
        aria-label="Sort"
      >
        <option value="level">Level</option>
        <option value="scrapbook">Scrapbook</option>
        <option value="activity">Activity</option>
        <option value="lastScan">Last scan</option>
      </select>

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
