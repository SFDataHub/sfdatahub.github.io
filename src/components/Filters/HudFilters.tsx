// src/components/Filters/HudFilters.tsx
import React from "react";
import { useTranslation } from "react-i18next";
import { useFilters } from "./FilterContext";
import { CLASSES } from "../../data/classes";
import styles from "./filters.module.css";
import { ClassIconButton } from "./atoms";
import { useAuth } from "../../context/AuthContext";

type CompareMode = "off" | "progress" | "months";

type Props = {
  mode: "players" | "guilds";
  sortValue: string;
  onSortValueChange: (value: string) => void;
  compareMode: CompareMode;
  onCompareModeChange: (mode: CompareMode) => void;
  progressSinceMonth: string;
  onProgressSinceMonthChange: (v: string) => void;
  compareFromMonth: string;
  onCompareFromMonthChange: (v: string) => void;
  compareToMonth: string;
  onCompareToMonthChange: (v: string) => void;
  monthOptions: string[];
  guildOptions: { value: string; label: string }[];
  onExportPng?: () => void;
  exportDisabled?: boolean;
};

export default function HudFilters({
  mode,
  sortValue,
  onSortValueChange,
  compareMode,
  onCompareModeChange,
  progressSinceMonth,
  onProgressSinceMonthChange,
  compareFromMonth,
  onCompareFromMonthChange,
  compareToMonth,
  onCompareToMonthChange,
  monthOptions,
  guildOptions,
  onExportPng,
  exportDisabled,
}: Props) {
  const { t } = useTranslation();
  const {
    servers,
    classes,
    setClasses,
    guilds,
    toggleGuild,
    clearGuilds,
    favoritesOnly,
    setFavoritesOnly,
    filterMode,
    setBottomFilterOpen,
    serverSheetOpen,
    setServerSheetOpen,
    resetAll,
  } = useFilters();
  const { user } = useAuth();

  const isGuildMode = mode === "guilds";
  const guildLabel = t("toplists.filters.guilds.label", "Guilds");
  const guildPlaceholder = t("toplists.filters.guilds.placeholder", "All guilds");
  const guildEmpty = t("toplists.filters.guilds.empty", "No guilds in snapshot");
  const guildClear = t("toplists.filters.guilds.clear", "Clear");
  const exportPngLabel = t("toplists.exportDialog.title", "Export PNG");
  const favoritesChipLabel = t("nav.favorites", { defaultValue: "Favorites" });
  const guildSelection = guilds.length
    ? t("toplists.filters.guilds.selected", "{{count}} selected", { count: guilds.length })
    : guildPlaceholder;

  return (
    <div className={styles.hudWrap}>
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

      {!isGuildMode && (
        <div className={styles.iconRow}>
          {CLASSES.map((c) => (
            <ClassIconButton
              key={c.key}
              active={classes.includes(c.key)}
              title={c.label}
              iconUrl={c.iconUrl}
              fallback={c.fallback}
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
      )}

      {!isGuildMode && (
        <div className={styles.guildField}>
          <span className={styles.guildLabel}>{guildLabel}</span>
          {guildOptions.length ? (
            <details className={styles.guildSelect}>
              <summary className={styles.guildSummary} aria-label={guildLabel}>
                <span className={styles.guildSummaryText}>{guildSelection}</span>
                <span className={styles.guildCaret} aria-hidden="true">v</span>
              </summary>
              <div className={styles.guildDropdown}>
                {guildOptions.map((option) => {
                  const checked = guilds.includes(option.value);
                  return (
                    <label key={option.value} className={styles.guildOption}>
                      <input type="checkbox" checked={checked} onChange={() => toggleGuild(option.value)} />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
                {guilds.length > 0 && (
                  <button type="button" className={styles.guildClear} onClick={clearGuilds}>
                    {guildClear}
                  </button>
                )}
              </div>
            </details>
          ) : (
            <span className={styles.guildEmptyText}>{guildEmpty}</span>
          )}
        </div>
      )}

      <div className={styles.sortField}>
        <label className={styles.sortLabel} htmlFor="toplists-sort">
          Sort.
        </label>
        <select
          id="toplists-sort"
          name="toplists-sort"
          value={sortValue}
          onChange={(e) => onSortValueChange(e.target.value)}
          className={styles.sortSelect}
          aria-label="Sort"
        >
          {isGuildMode ? (
            <>
              <option value="guildMembers">Members</option>
              <option value="guildAvgLevel">Avg Lv</option>
              <option value="guildAvgSum">Avg Sum</option>
              <option value="guildLastScan">Last Scan</option>
            </>
          ) : (
            <>
              <option value="main">Main</option>
              <option value="mainTotal">Main (Total)</option>
              <option value="constitution">Constitution</option>
              <option value="conTotal">Con (Total)</option>
              <option value="sum">Base Stats</option>
              <option value="statsDay">Stats/Day</option>
              <option value="sumTotal">Sum Total</option>
              <option value="statsDayTotal">Total Stats/day</option>
              <option value="level">Level</option>
              <option value="mine">Mine</option>
            </>
          )}
        </select>
      </div>

      {isGuildMode ? (
        <div id="guild-avg-mode-slot" className={styles.sortField} />
      ) : (
        <div id="player-avg-mode-slot" className={styles.sortField} />
      )}

      <div className={styles.compareBlock}>
        <span className={styles.compareBlockTitle}>{t("toplists.compareMode", "Compare Mode")}</span>
        <div className={styles.segmented} role="group" aria-label={t("toplists.compareMode", "Compare Mode")}>
          <button type="button" aria-pressed={compareMode === "off"} onClick={() => onCompareModeChange("off")}>
            {t("toplists.compareOff", "Off")}
          </button>
          <button
            type="button"
            aria-pressed={compareMode === "progress"}
            onClick={() => onCompareModeChange("progress")}
          >
            {t("toplists.compareMonth", "Progress since")}
          </button>
          <button type="button" aria-pressed={compareMode === "months"} onClick={() => onCompareModeChange("months")}>
            {t("toplists.compareMonths", "Compare months")}
          </button>
        </div>

        {compareMode === "progress" && (
          <div className={styles.compareInputsRow}>
            <label className={styles.compareField} htmlFor="toplists-compare-progress">
              <span className={styles.guildLabel}>{t("toplists.compareMonth", "Progress since")}</span>
              <select
                id="toplists-compare-progress"
                name="toplists-compare-progress"
                value={progressSinceMonth}
                onChange={(e) => onProgressSinceMonthChange(e.target.value)}
                className={styles.sortSelect}
                aria-label={t("toplists.compareMonth", "Progress since")}
              >
                <option value="">{t("toplists.compareOff", "Off")}</option>
                {monthOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {compareMode === "months" && (
          <div className={styles.compareInputsRow}>
            <label className={styles.compareField} htmlFor="toplists-compare-from">
              <span className={styles.guildLabel}>{t("toplists.compareFrom", "From")}</span>
              <select
                id="toplists-compare-from"
                name="toplists-compare-from"
                value={compareFromMonth}
                onChange={(e) => onCompareFromMonthChange(e.target.value)}
                className={styles.sortSelect}
                aria-label={t("toplists.compareFrom", "From")}
              >
                {monthOptions.map((opt) => (
                  <option key={`from-${opt}`} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.compareField} htmlFor="toplists-compare-to">
              <span className={styles.guildLabel}>{t("toplists.compareTo", "To")}</span>
              <select
                id="toplists-compare-to"
                name="toplists-compare-to"
                value={compareToMonth}
                onChange={(e) => onCompareToMonthChange(e.target.value)}
                className={styles.sortSelect}
                aria-label={t("toplists.compareTo", "To")}
              >
                {monthOptions.map((opt) => (
                  <option key={`to-${opt}`} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className={`${styles.chip} ${favoritesOnly ? styles.isActive : ""}`.trim()}
          aria-pressed={favoritesOnly}
          onClick={() => {
            if (!user) {
              const message = t("profile.favorite.authRequired", { defaultValue: "Sign in to use favorites." });
              if (typeof window !== "undefined") window.alert(message);
              return;
            }
            setFavoritesOnly(!favoritesOnly);
          }}
          title={favoritesChipLabel}
        >
          <span aria-hidden>⭐</span>
          <span>{favoritesChipLabel}</span>
        </button>
        <button
          type="button"
          className={styles.hudSubBtn}
          onClick={onExportPng}
          disabled={exportDisabled || !onExportPng}
          style={exportDisabled || !onExportPng ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
        >
          {exportPngLabel}
        </button>
        <button type="button" className={styles.hudSubBtn} onClick={resetAll}>
          Reset
        </button>

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
