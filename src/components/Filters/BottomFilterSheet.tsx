import React, { useEffect, useRef } from "react";
import { CLASSES } from "../../data/classes";
import { useTranslation } from "react-i18next";
import { useFilters, type DaysFilter } from "./FilterContext";
import type { LocalToplistSearchResult } from "../../lib/toplists/localToplistViewWorkerTypes";

type Props = {
  searchModeSlot?: React.ReactNode;
  searchFieldClassName?: string;
  searchGlyphSlot?: React.ReactNode;
  searchLabel?: string;
  searchPlaceholder?: string;
  open: boolean;
  onClose: () => void;
  localSearchLoading?: boolean;
  localSearchResults?: LocalToplistSearchResult[];
  onLocalSearchResultSelect?: (result: LocalToplistSearchResult) => void;
  localSearchEmptyText?: string;
  localSearchNotice?: string;
  onLocalSearchRetry?: () => void;
  renderLocalSearchArtwork?: (result: LocalToplistSearchResult) => React.ReactNode;
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

export default function BottomFilterSheet({
  open,
  onClose,
  searchModeSlot,
  searchFieldClassName,
  searchGlyphSlot,
  searchLabel,
  searchPlaceholder,
  localSearchLoading = false,
  localSearchResults = [],
  onLocalSearchResultSelect,
  localSearchEmptyText,
  localSearchNotice,
  onLocalSearchRetry,
  renderLocalSearchArtwork,
}: Props) {
  const { t } = useTranslation();
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

  const showLocalResults = Boolean(onLocalSearchResultSelect);
  const groupedLocalResults = {
    player: localSearchResults.filter((result) => result.kind === "player"),
    guild: localSearchResults.filter((result) => result.kind === "guild"),
    server: localSearchResults.filter((result) => result.kind === "server"),
  };

  const renderLocalResultGroup = (
    kind: keyof typeof groupedLocalResults,
    label: string,
  ) => {
    const results = groupedLocalResults[kind];
    if (!results.length) return null;
    return (
      <div style={resultGroup}>
        <div style={resultGroupTitle}>{label}</div>
        {results.map((result) => {
          const disabled = result.status !== "jumpable";
          const detailParts = [
            result.server,
            result.kind === "player" ? t(`toplists.classes.${CLASSES.find(c => c.key === result.className || c.label === result.className)?.key}`, result.className ?? "") : null,
            result.kind === "player" ? result.guildName : null,
            disabled ? t("toplists.search.outsideScope") : null,
          ].filter(Boolean);
          return (
            <button
              key={`${result.kind}:${result.id}`}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                onLocalSearchResultSelect?.(result);
              }}
              style={{ ...resultButton, ...(disabled ? resultButtonDisabled : null) }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              {renderLocalSearchArtwork?.(result)}
              <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
              <span style={resultLabel}>{result.label}</span>
              <span style={resultMeta}>{detailParts.join(" · ")}</span>
              </span></span>
            </button>
          );
        })}
      </div>
    );
  };

  const rangeButtons: { label: string; value: DaysFilter }[] = [
    { label: "3d", value: 3 },
    { label: "7d", value: 7 },
    { label: "14d", value: 14 },
    { label: "30d", value: 30 },
    { label: "60d", value: 60 },
    { label: "90d", value: 90 },
    { label: "all", value: "all" },
  ];

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
          <h2 id="filters-title" style={{ fontSize: 16, margin: 0, color: PALETTE.text }}>{t("toplists.filters.windowTitle")}</h2>
          <button type="button" onClick={onClose} style={primaryBtn}>{t("toplists.serverPicker.done")}</button>
        </div>

        {/* Suche */}
        <div style={{ display: "grid", gap: 8 }}>
          <div className={searchFieldClassName} style={searchFieldClassName ? undefined : { display: "grid", gap: 8 }}>
            {searchGlyphSlot}
            <label htmlFor="sheet-search" className="sr-only">{searchLabel ?? t("toplists.search.label")}</label>
            <input
              id="sheet-search"
              name="sheet-search"
              type="text"
              placeholder={searchPlaceholder ?? t("toplists.search.placeholder")}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              aria-label={searchLabel ?? t("toplists.search.label")}
              autoComplete="off"
              style={searchFieldClassName ? undefined : input}
            />
            {searchModeSlot}
          </div>
          {showLocalResults && (
            <div style={resultsPanel} aria-live="polite">
              {localSearchLoading ? (
                <div style={resultStatus}>{t("toplists.status.loading", "Loading...")}</div>
              ) : localSearchResults.length ? (
                <>
                  {renderLocalResultGroup("player", t("toplists.search.players", "Players"))}
                  {renderLocalResultGroup("guild", t("toplists.search.guilds", "Guilds"))}
                  {renderLocalResultGroup("server", t("toplists.search.servers", "Servers"))}
                  {localSearchNotice ? <div style={resultStatus}>{localSearchNotice}</div> : null}
                </>
              ) : searchText.trim().length ? (
                <div style={resultStatus}>{localSearchEmptyText ?? t("toplists.search.empty", "No local results.")}</div>
              ) : null}
              {localSearchNotice && onLocalSearchRetry ? <button type="button" onClick={onLocalSearchRetry}>{t("toplists.actions.retry")}</button> : null}
            </div>
          )}
        </div>

        {/* Range (Buttons – keine Radios) */}
        <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
          <span style={{ color: PALETTE.text2, fontSize: 12 }}>{t("toplists.filters.range")}</span>
          <div role="group" aria-label={t("toplists.filters.range")} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {rangeButtons.map((option) => (
              <button
                key={option.value === "all" ? t("toplists.filters.classes.all") : t("toplists.filters.days", { count: option.value })}
                type="button"
                aria-pressed={range === option.value}
                onClick={() => setRange(option.value)}
                style={{ ...chip, ...(range === option.value ? chipActive : null) }}
              >
                {option.value === "all" ? t("toplists.filters.classes.all") : t("toplists.filters.days", { count: option.value })}
              </button>
            ))}
          </div>
        </div>

        {/* Sort (mit id/name + Labelbindung) */}
        <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
          <label htmlFor="sheet-toplists-sort" style={{ color: PALETTE.text2, fontSize: 12 }}>
            {t("toplists.filters.sort.label", "Sort.")}
          </label>
          <select
            id="sheet-toplists-sort"
            name="sheet-toplists-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            aria-label={t("toplists.filters.sort.aria", "Sort")}
            autoComplete="off"
          style={select}
        >
          <option value="main">{t("toplists.filters.sort.playerOptions.main", "Main")}</option>
          <option value="constitution">{t("toplists.filters.sort.playerOptions.constitution", "Constitution")}</option>
          <option value="sum">{t("toplists.filters.sort.playerOptions.sum", "Base Stats")}</option>
          <option value="statsDay">{t("toplists.filters.sort.playerOptions.statsDay", "Stats/Day")}</option>
          <option value="level">{t("toplists.filters.sort.playerOptions.level", "Level")}</option>
          <option value="mine">{t("toplists.filters.sort.playerOptions.mine", "Mine")}</option>
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
            ⭐ {t("nav.favorites")}
          </button>
          <button
            type="button"
            onClick={() => setQuickActive((v) => !v)}
            aria-pressed={quickActive}
            style={{ ...chip, ...(quickActive ? chipActive : null) }}
          >
            ⚡ {t("search.active")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Styles ---------- */
const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: "var(--app-overlay-inset, var(--topbar-h, 0px) 0 0 0)",
  background: PALETTE.backdrop,
  zIndex: 60,
  display: "grid", alignItems: "end",
  boxSizing: "border-box",
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

const resultsPanel: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const resultGroup: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const resultGroupTitle: React.CSSProperties = {
  color: PALETTE.text2,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
};

const resultButton: React.CSSProperties = {
  display: "grid",
  gap: 3,
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: `1px solid ${PALETTE.line}`,
  background: "#14273E",
  color: PALETTE.text,
  textAlign: "left",
};

const resultButtonDisabled: React.CSSProperties = {
  opacity: 0.55,
  cursor: "not-allowed",
};

const resultLabel: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 13,
  fontWeight: 700,
};

const resultMeta: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: PALETTE.text2,
  fontSize: 12,
};

const resultStatus: React.CSSProperties = {
  color: PALETTE.text2,
  fontSize: 12,
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
