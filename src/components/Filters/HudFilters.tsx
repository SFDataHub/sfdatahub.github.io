import { toplistColumns } from "../../lib/toplists/toplistColumns";
import { LOCAL_TOPLIST_METRICS } from "../../lib/toplists/localToplistMetrics";
// src/components/Filters/HudFilters.tsx
import React from "react";
import { useTranslation } from "react-i18next";
import { useFilters } from "./FilterContext";
import { CLASSES } from "../../data/classes";
import styles from "./filters.module.css";
import { ClassIconButton } from "./atoms";
import CompareControls from "./CompareControls";
import { getGuildClassAccent } from "../guilds/classColors";

type CompareMode = "off" | "progress" | "months";

type Props = {
  mode: "players" | "guilds";
  sortDirection?: "asc" | "desc";
  onToggleSortDirection?: () => void;
  sortValue: string;
  sortOptions?: readonly { metricKey: string; label: string }[];
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
  searchSlot?: React.ReactNode;
  hideServerButton?: boolean;
  localWindow?: boolean;
  onExportPng?: () => void;
  exportDisabled?: boolean;
  onResetAll?: () => void;
};

export default function HudFilters({
  mode,
  sortValue, sortOptions, sortDirection, onToggleSortDirection,
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
  searchSlot,
  hideServerButton = false,
  localWindow = false,
  onExportPng,
  exportDisabled,
  onResetAll,
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

  const isGuildMode = mode === "guilds";
  const guildLabel = t("toplists.filters.guilds.label", "Guilds");
  const guildPlaceholder = t("toplists.filters.guilds.placeholder", "All guilds");
  const guildEmpty = t("toplists.filters.guilds.empty", "No guilds in snapshot");
  const guildClear = t("toplists.filters.guilds.clear", "Clear");
  const exportPngLabel = t("toplists.exportDialog.title", "Export PNG");
  const favoritesChipLabel = t("nav.favorites", { defaultValue: "Favorites" });
  const sortLabel = t("toplists.filters.sort.label", "Sort.");
  const sortAriaLabel = t("toplists.filters.sort.aria", "Sort");
  const guildSelection = guilds.length
    ? t("toplists.filters.guilds.selected", "{{count}} selected", { count: guilds.length })
    : guildPlaceholder;

  return (
    <div className={`${styles.hudWrap} ${localWindow ? styles.localWindow : ""}`}>
      {!hideServerButton && (
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
          aria-label={t("guildHub.toplist.servers.selectedCount", { count: servers.length })}
          title={t("toplists.serverPicker.title")}
        >
          🌐 {t("toplists.columns.server")} {servers.length ? `(${servers.length})` : ""}
        </button>
      )}

      {!isGuildMode && (
        <>
        {localWindow && <div className={styles.classHeader}>
          <span>{t("toplists.filters.classes.selected", "Classes – selected ({{selection}})", { selection: CLASSES.every(c => classes.includes(c.key)) ? t("toplists.filters.classes.all", "All") : CLASSES.filter(c => classes.includes(c.key)).length })}</span>
          <div className={styles.classActions}>
            <button type="button" className={styles.hudSubBtn} onClick={() => setClasses(CLASSES.map(c => c.key))}>{t("toplists.filters.classes.all", "All")}</button>
            <button type="button" className={styles.hudSubBtn} onClick={() => setClasses([])}>{t("toplists.filters.classes.clear", "Clear")}</button>
          </div>
        </div>}
        <div className={styles.iconRow}>
          {CLASSES.map((c) => (
            <ClassIconButton
              key={c.key}
              active={classes.includes(c.key)}
              title={t(`toplists.classes.${c.key}`, c.label)}
              iconUrl={c.iconUrl}
              fallback={c.fallback}
              size={40}
              localDropdown={localWindow}
              classAccent={localWindow ? getGuildClassAccent(c.key) : undefined}
              onClick={() =>
                setClasses((prev) =>
                  prev.includes(c.key) ? prev.filter((k) => k !== c.key) : [...prev, c.key]
                )
              }
            />
          ))}
          {!localWindow && <div className={styles.inlineGroup}>
          <button type="button" className={styles.hudSubBtn} onClick={() => setClasses(CLASSES.map((c) => c.key))}>
            {t("toplists.filters.classes.all")}
          </button>
          <button type="button" className={styles.hudSubBtn} onClick={() => setClasses([])}>
            {t("toplists.filters.classes.clear")}
          </button>
          </div>}
        </div>
        </>
      )}

      <div className={localWindow ? styles.windowFields : styles.inlineGroup}>
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
          {sortLabel}
        </label>
        <div className={onToggleSortDirection ? styles.sortControls : styles.sortControlPassthrough}><select
          id="toplists-sort"
          name="toplists-sort"
          value={sortValue}
          onChange={(e) => onSortValueChange(e.target.value)}
          className={styles.sortSelect}
          aria-label={sortAriaLabel}
        >
          {sortOptions ? sortOptions.map(option => <option key={option.metricKey} value={option.metricKey}>{option.label}</option>) : <>
          {localWindow && LOCAL_TOPLIST_METRICS.filter(metric => toplistColumns(isGuildMode ? "guilds" : "players").some(column => column.metric === metric.metricKey) && metric.rowKind === (isGuildMode ? "guild" : "player") && !(isGuildMode ? ["guildMembers", "guildAvgLevel", "guildAvgMain", "guildAvgCon", "guildAvgSum", "guildRaids", "guildHydra"] : ["main", "mainTotal", "constitution", "conTotal", "sum", "statsDay", "sumTotal", "statsDayTotal", "level", "mine"]).includes(metric.metricKey)).map(metric => {
            const column = toplistColumns(isGuildMode ? "guilds" : "players").find(c => c.metric === metric.metricKey);
            return <option key={metric.metricKey} value={metric.metricKey}>{column ? t(`toplists.columns.${column.key === "name" && !isGuildMode ? "player" : column.key}`, column.label) : t(`toplists.columns.${metric.metricKey}`, metric.metricKey)}</option>;
          })}
          {isGuildMode ? (
            <>
              <option value="guildMembers">{t("toplists.filters.sort.guildOptions.guildMembers", "Members")}</option>
              <option value="guildAvgLevel">{t("toplists.filters.sort.guildOptions.guildAvgLevel", "ø Lv")}</option>
              <option value="guildAvgMain">{t("toplists.filters.sort.guildOptions.guildAvgMain", "ø Main")}</option>
              <option value="guildAvgCon">{t("toplists.filters.sort.guildOptions.guildAvgCon", "ø Con")}</option>
              <option value="guildAvgSum">{t("toplists.filters.sort.guildOptions.guildAvgSum", "ø Sum")}</option>
              <option value="guildRaids">{t("toplists.filters.sort.guildOptions.guildRaids", "Raids")}</option>
              <option value="guildHydra">{t("toplists.filters.sort.guildOptions.guildHydra", "Hydra")}</option>
            </>
          ) : (
            <>
              <option value="main">{t("toplists.filters.sort.playerOptions.main", "Main")}</option>
              <option value="mainTotal">{t("toplists.filters.sort.playerOptions.mainTotal", "Main (Total)")}</option>
              <option value="constitution">{t("toplists.filters.sort.playerOptions.constitution", "Constitution")}</option>
              <option value="conTotal">{t("toplists.filters.sort.playerOptions.conTotal", "Con (Total)")}</option>
              <option value="sum">{t("toplists.filters.sort.playerOptions.sum", "Base Stats")}</option>
              <option value="statsDay">{t("toplists.filters.sort.playerOptions.statsDay", "Stats/Day")}</option>
              <option value="sumTotal">{t("toplists.filters.sort.playerOptions.sumTotal", "Sum Total")}</option>
              <option value="statsDayTotal">{t("toplists.filters.sort.playerOptions.statsDayTotal", "Total Stats/day")}</option>
              <option value="level">{t("toplists.filters.sort.playerOptions.level", "Level")}</option>
              <option value="mine">{t("toplists.filters.sort.playerOptions.mine", "Mine")}</option>
            </>
          )}
          </>}
        </select>
        {onToggleSortDirection && <button type="button" className={styles.sortDirection} onClick={onToggleSortDirection}
          aria-label={t(`localSettings.toplists.${sortDirection === "asc" ? "ascending" : "descending"}`)} title={t(`localSettings.toplists.${sortDirection === "asc" ? "ascending" : "descending"}`)}>{sortDirection === "asc" ? "↑" : "↓"}</button>}
        </div>
      </div>

      {isGuildMode ? (
        <div id="guild-avg-mode-slot" className={styles.sortField} />
      ) : (
        <div id="player-avg-mode-slot" className={styles.sortField} />
      )}

      </div>

      {!localWindow && <CompareControls
        compareMode={compareMode} onCompareModeChange={onCompareModeChange}
        progressSinceMonth={progressSinceMonth} onProgressSinceMonthChange={onProgressSinceMonthChange}
        compareFromMonth={compareFromMonth} onCompareFromMonthChange={onCompareFromMonthChange}
        compareToMonth={compareToMonth} onCompareToMonthChange={onCompareToMonthChange}
        monthOptions={monthOptions} />}


      {searchSlot ? <div className={styles.searchSlot}>{searchSlot}</div> : null}

      <div className={localWindow ? styles.windowActions : "ml-auto flex items-center gap-2"}>
        <button
          type="button"
          className={`${styles.chip} ${favoritesOnly ? styles.isActive : ""}`.trim()}
          aria-pressed={favoritesOnly}
          onClick={() => {
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
        <button type="button" className={styles.hudSubBtn} onClick={onResetAll ?? resetAll}>
          {t("toplists.filters.reset")}
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
            title={t("toplists.filters.showHud")}
          >
            {t("toplists.filters.showHud")}
          </button>
        )}
      </div>
    </div>
  );
}
