import ToplistRankingValue from "./ToplistRankingValue";
import { PLAYER_ATTRIBUTE_COLUMNS, playerAttributeColumn, playerAttributeValue, playerRatioLabel } from "../../lib/toplists/playerAttributeColumns";
import { useToplistAutoSize } from "./useToplistAutoSize";
import ToplistViewPicker from "./ToplistViewControls";
import LocalSortHeader from "./LocalSortHeader";
import { toplistColumnLabel, type LocalTableColumnsProps } from "../../lib/toplists/toplistColumns";
﻿import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { createPortal } from "react-dom";
import { useFilters, type DaysFilter } from "../../components/Filters/FilterContext";
import { getClassIconUrl } from "../../components/ui/shared/classIcons";
import { type ToplistCaptureStatus } from "../../components/export/ToplistExportController";
import NeonCoreButton from "../../components/ui/NeonCoreButton";

import { useToplistsData, type PlayerScopeStatus } from "../../context/ToplistsDataContextCore";
import { useFavoriteMembership } from "../../lib/data-hub/useFavoriteMembership";
import type { ToplistPlayerRow } from "../../lib/toplists/toplistContracts";
import { formatScanDateTimeLabel } from "../../lib/ui/formatScanDateTimeLabel";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
  PLAYER_TOPLIST_CON_RANK_COLORS as CON_RANK_COLORS,
  PLAYER_TOPLIST_LEVEL_RANK_COLORS as LEVEL_RANK_COLORS,
  PLAYER_TOPLIST_MAIN_RANK_COLORS as MAIN_RANK_COLORS,
  buildPlayerToplistCompareKey,
  buildPlayerToplistDecorMap,
  getPlayerToplistFrameStyle as getFrameStyle,
  getPlayerToplistMineTone as getMineTone,
  getPlayerToplistRankTone as getRankTone,
  resolvePlayerToplistRowIdentifier,
} from "./playerToplistDecor";
import {
  formatToplistDelta,
  formatToplistNumberWithSpaceGrouping,
  getToplistRankDeltaDisplay,
} from "./toplistCompareDisplay";
import { useToplistRowFocus, type ToplistFocusRequest, type ToplistFocusResult } from "./useToplistRowFocus";
import "../../styles/Toplist.css";

const normalizeServerList = (list: string[]) => {
  const set = new Set<string>();
  list.forEach((entry) => {
    const normalized = entry.trim().toUpperCase();
    if (normalized) set.add(normalized);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
};

export type PlayerPresetReadOnlyData = {
  rows: ToplistPlayerRow[];
  allRows?: ToplistPlayerRow[];
  window?: {
    start: number; total: number; contextKey: string;
    onChange: (start: number) => void;
    stats?: { average: number | null; max: number | null };
    decor?: Record<string, import("./playerToplistDecor").PlayerToplistCellDecor>;
  };
  tableLoading: boolean;
  compareLoading: boolean;
  compareExpected: boolean;
  showCompare: boolean;
  compareError: string | null;
  playerError: string | null;
  playerLastUpdatedAt: number | null;
  playerScopeStatus: PlayerScopeStatus | null;
  playerAvgMode: "base" | "total";
};

type TableDataViewHandle = {
  getPresetReadOnlyData: () => PlayerPresetReadOnlyData;
};

const normalizeClassList = (list: string[]) => {
  const set = new Set<string>();
  list.forEach((entry) => {
    const normalized = entry
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-");
    if (normalized) set.add(normalized);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
};

const normalizeGuildKey = (value: string | null | undefined) =>
  (value ?? "").toString().trim().toLowerCase();

const normalizeFavoriteIdentifier = (value: unknown): string | null => {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw || null;
};

const resolveToplistRowIdentifier = resolvePlayerToplistRowIdentifier;

const buildPlayerFavoriteIdentifierFromRow = (row: ToplistPlayerRow): string | null => {
  return normalizeFavoriteIdentifier(resolveToplistRowIdentifier(row));
};

type ToplistColumnKey = string;
type ToplistColumnAlign = "left" | "center" | "right";

type ToplistColumnDef = {
  key: ToplistColumnKey;
  label: string;
  width: string;
  align: ToplistColumnAlign;
  hidden?: boolean;
};

const DEFAULT_TOPLIST_COLUMNS: ReadonlyArray<ToplistColumnDef> = [
  { key: "rank", label: "#", width: "4%", align: "right" },
  { key: "rankDelta", label: "Δ Rank", width: "6%", align: "center" },
  { key: "server", label: "Server", width: "7%", align: "left", hidden: true },
  { key: "name", label: "Player", width: "22%", align: "left" },
  { key: "class", label: "Class", width: "5%", align: "center", hidden: true },
  { key: "guild", label: "Guild", width: "11%", align: "left" },
  { key: "level", label: "Level", width: "6%", align: "right" },
  { key: "main", label: "Main", width: "6%", align: "right" },
  { key: "con", label: "Con", width: "6%", align: "right" },
  { key: "sum", label: "Sum", width: "6%", align: "right" },
  { key: "statsPerDay", label: "Stats/Day", width: "7%", align: "right" },
  { key: "ratio", label: "Ratio", width: "6%", align: "center" },
  { key: "mine", label: "Mine", width: "5%", align: "right" },
  { key: "treasury", label: "Treasury", width: "6%", align: "right" },
  { key: "lastScan", label: "Last Scan", width: "9%", align: "right" },
];

const TOPLIST_COLUMNS: ReadonlyArray<ToplistColumnDef> = [...DEFAULT_TOPLIST_COLUMNS,
  ...["overallRank", "serverRank", "classRank"].map(key => ({ key, label: key, width: "6%", align: "center" as const })),
  ...PLAYER_ATTRIBUTE_COLUMNS.map(c => ({ key: c.key, label: c.label, width: "6%", align: "right" as const })),
];
const TOPLIST_VISIBLE_COLUMNS = DEFAULT_TOPLIST_COLUMNS.filter((column) => !column.hidden);

const customColumnWidth = (key: string) => key === "name" ? 250 : key === "guild" ? 160 : key === "lastScan" ? 150 : 105;

const TOPLIST_TABLE_STYLE: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  fontVariantNumeric: "tabular-nums",
};

const TOPLIST_HEADER_ROW_STYLE: React.CSSProperties = {
  borderBottom: "1px solid #2C4A73",
};

const TOPLIST_CELL_BASE_STYLE: React.CSSProperties = {
  padding: "8px 8px",
  verticalAlign: "middle",
  lineHeight: 1.25,
};

const TOPLIST_HEADER_LABEL_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  width: "100%",
  minHeight: "100%",
  boxSizing: "border-box",
  minWidth: 0,
  maxWidth: "100%",
};

const TOPLIST_HEADER_LABEL_ALIGN_STYLE: Record<ToplistColumnAlign, Pick<React.CSSProperties, "justifyContent">> = {
  left: { justifyContent: "flex-start" },
  center: { justifyContent: "center" },
  right: { justifyContent: "flex-end" },
};

const TOPLIST_TEXT_CELL_CONTENT_STYLE: React.CSSProperties = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  lineHeight: 1.3,
  minWidth: 0,
  maxWidth: "100%",
};

const TOPLIST_NAME_CELL_STACK_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "center",
  flex: "1 1 auto",
  maxWidth: "none",
  minHeight: "100%",
  boxSizing: "border-box",
  minWidth: 0,
};

const TOPLIST_NAME_CELL_LAYOUT_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 12,
  width: "100%",
  minHeight: "100%",
  boxSizing: "border-box",
  minWidth: 0,
};

const TOPLIST_NAME_CELL_ICON_CONTENT_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  flex: "0 0 30px",
  minWidth: 30,
};

const TOPLIST_SECONDARY_TEXT_CELL_CONTENT_STYLE: React.CSSProperties = {
  ...TOPLIST_TEXT_CELL_CONTENT_STYLE,
  marginTop: 1,
  fontSize: 11,
  lineHeight: 1.2,
  color: "var(--text-soft)",
};

const TOPLIST_FLEX_COLUMN_RIGHT_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  justifyContent: "center",
};

const TOPLIST_FLEX_COLUMN_CENTER_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
};

const TOPLIST_DELTA_SUBTEXT_STYLE: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.8,
};

const TOPLIST_LAST_SCAN_CONTENT_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 6,
  width: "100%",
  minHeight: "100%",
  boxSizing: "border-box",
  minWidth: 0,
  paddingRight: 1,
};

const TOPLIST_BADGE_CELL_CONTAINER_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  justifyContent: "center",
  minHeight: "100%",
  boxSizing: "border-box",
};

const TOPLIST_LAST_SCAN_LABEL_STYLE: React.CSSProperties = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flex: "1 1 auto",
  minWidth: 0,
  maxWidth: "100%",
  textAlign: "right",
};

const TOPLIST_CELL_STYLE_BY_KEY = TOPLIST_COLUMNS.reduce((acc, column) => {
  acc[column.key] = { ...TOPLIST_CELL_BASE_STYLE, textAlign: column.align };
  return acc;
}, {} as Record<ToplistColumnKey, React.CSSProperties>);

const CENTERED_TOPLIST_CELL_STYLE_BY_KEY = TOPLIST_COLUMNS.reduce((acc, column) => {
  acc[column.key] = { ...TOPLIST_CELL_BASE_STYLE, textAlign: "center" };
  return acc;
}, {} as Record<ToplistColumnKey, React.CSSProperties>);

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const computeLastScanColor = (lastScan: unknown, nowMs: number): string | null => {
  if (!lastScan) return null;
  let ts: number | null = null;
  if (typeof lastScan === "number") {
    ts = lastScan < 1e12 ? lastScan * 1000 : lastScan;
  } else {
    const raw = String(lastScan).trim();
    if (!raw) return null;
    if (/^\d{10,13}$/.test(raw)) {
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      ts = n < 1e12 ? n * 1000 : n;
    } else {
      ts = parseLastScanString(raw);
    }
  }
  if (ts == null || !Number.isFinite(ts)) return null;
  const days = Math.max(0, Math.floor((nowMs - ts) / MS_PER_DAY));
  if (days <= 0) return "#34d399"; // today
  if (days === 1) return "#4ade80";
  if (days <= 3) return "#a3e635";
  if (days <= 7) return "#facc15";
  if (days <= 14) return "#f97316";
  if (days <= 30) return "#ef4444";
  return "#b91c1c";
};

function parseLastScanString(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const parts = raw.split(/\s+/);
  const datePart = parts[0] ?? "";
  const timePart = parts[1] ?? "";
  const dateBits = datePart.split(".");
  if (dateBits.length !== 3) return null;
  const day = Number(dateBits[0]);
  const month = Number(dateBits[1]);
  const year = Number(dateBits[2]);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  let hours = 0;
  let minutes = 0;
  if (timePart) {
    const timeBits = timePart.split(":");
    if (timeBits.length < 2) return null;
    hours = Number(timeBits[0]);
    minutes = Number(timeBits[1]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  }
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date.getTime();
}
const formatLastScanDisplay = (value: string | number | null | undefined): string => {
  return formatScanDateTimeLabel(value);
};
function ValueCrossfade({
  value,
  fadeKey,
  durationMs = 200,
  minWidthCh = 9,
  textAlign = "right",
}: {
  value: string | number;
  fadeKey: string;
  durationMs?: number;
  minWidthCh?: number;
  textAlign?: "left" | "center" | "right";
}) {
  const nextText = String(value ?? "");
  const [prevText, setPrevText] = React.useState<string | null>(null);
  const [showNext, setShowNext] = React.useState(true);
  const lastTextRef = React.useRef(nextText);
  const lastFadeKeyRef = React.useRef(fadeKey);
  const transitionSeqRef = React.useRef(0);

  React.useEffect(() => {
    if (lastTextRef.current === nextText && lastFadeKeyRef.current === fadeKey) return;

    const seq = transitionSeqRef.current + 1;
    transitionSeqRef.current = seq;
    setPrevText(lastTextRef.current);
    lastTextRef.current = nextText;
    lastFadeKeyRef.current = fadeKey;
    setShowNext(false);

    const rafId = window.requestAnimationFrame(() => {
      if (transitionSeqRef.current !== seq) return;
      setShowNext(true);
    });
    const timeoutId = window.setTimeout(() => {
      if (transitionSeqRef.current !== seq) return;
      setPrevText(null);
    }, durationMs);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
    };
  }, [nextText, fadeKey, durationMs]);

  if (prevText == null) {
    return (
      <span style={{ display: "inline-block", minWidth: `${minWidthCh}ch`, textAlign, fontVariantNumeric: "tabular-nums" }}>
        {nextText}
      </span>
    );
  }

  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        minWidth: `${minWidthCh}ch`,
        textAlign,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ visibility: "hidden" }}>{nextText}</span>
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          opacity: showNext ? 0 : 1,
          transition: `opacity ${durationMs}ms ease`,
        }}
      >
        {prevText}
      </span>
      <span
        style={{
          position: "absolute",
          inset: 0,
          opacity: showNext ? 1 : 0,
          transition: `opacity ${durationMs}ms ease`,
        }}
      >
        {nextText}
      </span>
    </span>
  );
}

function PlayerAvgModeControls({
  mode,
  updating,
  onChange,
  label,
  ariaLabel,
  baseLabel,
  totalLabel,
  updatingLabel,
  disabled = false,
}: {
  mode: "base" | "total";
  updating: boolean;
  onChange: (nextMode: "base" | "total") => void;
  label: string;
  ariaLabel: string;
  baseLabel: string;
  totalLabel: string;
  updatingLabel: string;
  disabled?: boolean;
}) {
  return (
    <>
      <span style={{ color: "#B0C4D9", fontSize: 12, opacity: disabled ? 0.4 : 1 }}>{label}</span>
      <div
        role="group"
        aria-label={ariaLabel}
        aria-disabled={disabled}
        style={{ opacity: disabled ? 0.4 : 1, display: "inline-flex", gap: 4, background: "#14273E", border: "1px solid #2B4C73", padding: 4, borderRadius: 12 }}
      >
        <button
          type="button"
          disabled={disabled}
          aria-pressed={mode === "base"}
          onClick={() => onChange("base")}
          style={{
            background: mode === "base" ? "#25456B" : "transparent",
            border: `1px solid ${mode === "base" ? "#5C8BC6" : "transparent"}`,
            color: "#F5F9FF",
            borderRadius: 10,
            padding: "6px 10px",
            cursor: disabled ? "default" : "pointer",
          }}
        >
          {baseLabel}
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={mode === "total"}
          onClick={() => onChange("total")}
          style={{
            background: mode === "total" ? "#25456B" : "transparent",
            border: `1px solid ${mode === "total" ? "#5C8BC6" : "transparent"}`,
            color: "#F5F9FF",
            borderRadius: 10,
            padding: "6px 10px",
            cursor: disabled ? "default" : "pointer",
          }}
        >
          {totalLabel}
        </button>
      </div>
      {updating && (
        <span style={{ color: "#B0C4D9", fontSize: 12 }} aria-live="polite">
          {updatingLabel}
        </span>
      )}
    </>
  );
}

// HUD -> Provider Sort mapping
function mapSort(sortBy: string): { key: string; dir: "asc" | "desc" } {
  switch (sortBy) {
    case "level":        return { key: "level",    dir: "desc" };
    case "main":         return { key: "main",     dir: "desc" };
    case "constitution": return { key: "con",      dir: "desc" };
    case "sum":          return { key: "sum",      dir: "desc" };
    case "statsDay":     return { key: "statsDay", dir: "desc" };
    case "mine":         return { key: "mine",     dir: "desc" };
    case "mainTotal":    return { key: "mainTotal", dir: "desc" };
    case "conTotal":     return { key: "conTotal",  dir: "desc" };
    case "sumTotal":     return { key: "sumTotal",  dir: "desc" };
    case "statsDayTotal":return { key: "statsDayTotal", dir: "desc" };
    case "xpProgress":   return { key: "xpProgress", dir: "desc" };
    case "xpTotal":      return { key: "xpTotal",   dir: "desc" };
    case "lastActivity": // solange nicht vorhanden -> Last Scan
    case "lastScan":     return { key: "lastScan", dir: "desc" };
    case "name":         return { key: "name",     dir: "asc" };
    default:              return { key: "level",    dir: "desc" };
  }
}

let PLAYER_AVG_MODE_CACHE: "base" | "total" = "base";

function deriveGroupFromServers(servers: string[]): string {
  const first = (servers[0] || "").toUpperCase();
  if (first.startsWith("EU")) return "EU";
  if (first.startsWith("US") || first.startsWith("NA") || first.startsWith("AM")) return "US";
  if (first.startsWith("F")) return "FUSION";
  if (first) return "INT";
  return "EU";
}

type TableDataViewProps = LocalTableColumnsProps & {
  /** Optional local body state. Public consumers keep their existing defaults. */
  localLayout?: boolean;
  /** Share local cell alignment with the DataHub PNG capture. */
  centerCellContents?: boolean;
  localLoadingContent?: React.ReactNode;
  localNoticeContent?: React.ReactNode;
  servers: string[];
  classes: string[];
  range: DaysFilter;
  sortKey: string;
  compareMode: "off" | "progress" | "months";
  progressSinceMonth: string;
  compareFromMonth: string;
  compareToMonth: string;
  showAvgModeControl: boolean;
  focusIdentifier: string | null;
  focusRank: number | null;
  focusNonce?: number | string | null;
  focusRequest?: ToplistFocusRequest | null;
  onFocusResult?: (result: ToplistFocusResult) => void;
  tableRef: React.RefObject<HTMLDivElement>;
  renderMode?: "live" | "preset";
  presetAmount?: number | null;
  onCaptureStatusChange?: (status: ToplistCaptureStatus) => void;
  presetReadOnlyData?: PlayerPresetReadOnlyData | null;
  onPlayerAvgModeChange?: (nextMode: "base" | "total") => void;
  readOnlyHasMoreRows?: boolean;
  onReadOnlyRowsEndVisible?: () => void;
  onOpenPlayerProfile?: (row: ToplistPlayerRow) => void;
  onOpenGuildProfile?: (row: ToplistPlayerRow) => void;
};

export const TableDataView = React.forwardRef<TableDataViewHandle, TableDataViewProps>(function TableDataView({
  localLayout = false, centerCellContents = localLayout, localLoadingContent, localNoticeContent, localColumns, localColumnWidths, localSort, onLocalSort, servers, classes, range, sortKey, compareMode, showAvgModeControl, focusIdentifier, focusRank, focusNonce = null, focusRequest, onFocusResult, tableRef, renderMode = "live", presetAmount = null, onCaptureStatusChange, presetReadOnlyData = null, onPlayerAvgModeChange, readOnlyHasMoreRows = false, onReadOnlyRowsEndVisible, onOpenPlayerProfile, onOpenGuildProfile,
}, ref) {
  const activeColumns = localColumns ? localColumns.flatMap(key => { const column = TOPLIST_COLUMNS.find(c => c.key === key); return column ? [column] : []; }) : TOPLIST_VISIBLE_COLUMNS;
  const columnCount = activeColumns.length;
  const cellStyles = centerCellContents ? CENTERED_TOPLIST_CELL_STYLE_BY_KEY : TOPLIST_CELL_STYLE_BY_KEY;
  const numberColumnStyle: React.CSSProperties = centerCellContents ? TOPLIST_FLEX_COLUMN_CENTER_STYLE : TOPLIST_FLEX_COLUMN_RIGHT_STYLE;
  const lastScanStyle: React.CSSProperties = centerCellContents ? { ...TOPLIST_LAST_SCAN_CONTENT_STYLE, justifyContent: "center" } : TOPLIST_LAST_SCAN_CONTENT_STYLE;
  const lastScanLabelStyle: React.CSSProperties = centerCellContents ? { ...TOPLIST_LAST_SCAN_LABEL_STYLE, flex: "0 1 auto", textAlign: "center" as const } : TOPLIST_LAST_SCAN_LABEL_STYLE;
  const badgeColumnStyle: React.CSSProperties = centerCellContents ? { ...TOPLIST_BADGE_CELL_CONTAINER_STYLE, alignItems: "center" } : TOPLIST_BADGE_CELL_CONTAINER_STYLE;
  const nameLayoutStyle: React.CSSProperties = centerCellContents ? { ...TOPLIST_NAME_CELL_LAYOUT_STYLE, justifyContent: "center" } : TOPLIST_NAME_CELL_LAYOUT_STYLE;
  const nameStackStyle: React.CSSProperties = centerCellContents ? { ...TOPLIST_NAME_CELL_STACK_STYLE, flex: "0 1 auto", alignItems: "center" } : TOPLIST_NAME_CELL_STACK_STYLE;
  const nameIconStyle: React.CSSProperties = centerCellContents ? { ...TOPLIST_NAME_CELL_ICON_CONTENT_STYLE, flex: "0 0 auto", minWidth: 0 } : TOPLIST_NAME_CELL_ICON_CONTENT_STYLE;

  const tableStyle = localColumns ? { ...TOPLIST_TABLE_STYLE, width: activeColumns.reduce((sum, c) => sum + (localColumnWidths?.[c.key] ?? customColumnWidth(c.key)), 0) } : TOPLIST_TABLE_STYLE;
  const { t } = useTranslation();
  const { guilds, favoritesOnly } = useFilters();
  const { filterFavorites: sharedFavorites } = useFavoriteMembership();
  const {
    playerRows,
    playerLoading,
    playerError,
    playerLastUpdatedAt,
    playerScopeStatus,
    setFilters,
    setSort,
  } = useToplistsData();
  const navigate = useNavigate();
  const location = useLocation();
  const isPresetRender = renderMode === "preset";
  const hasReadOnlyData = Boolean(presetReadOnlyData);
  const resolvedPresetAmount = presetAmount ?? 50;
  const captureRowLimit = isPresetRender ? resolvedPresetAmount : null;
  const isCompactToplistView = useMediaQuery("(max-width: 1099px)") && !isPresetRender;
  const [expandedMobileRowKey, setExpandedMobileRowKey] = React.useState<string | null>(null);

  const hasServers = (servers?.length ?? 0) > 0;
  const [playerAvgMode, setPlayerAvgMode] = React.useState<"base" | "total">(() => PLAYER_AVG_MODE_CACHE);
  const effectivePlayerAvgMode = hasReadOnlyData ? (presetReadOnlyData?.playerAvgMode ?? playerAvgMode) : playerAvgMode;
  const [isPlayerAvgModePending, startPlayerAvgModeTransition] = React.useTransition();
  const [showPlayerUpdating, setShowPlayerUpdating] = React.useState(false);
  const [playerAvgModeSlot, setPlayerAvgModeSlot] = React.useState<HTMLElement | null>(null);
  const playerPendingStartedAtRef = React.useRef<number | null>(null);
  const playerPendingHideTimeoutRef = React.useRef<number | null>(null);
  const playerPendingPrevRef = React.useRef(false);
  const playerSortSensitiveRef = React.useRef(new Set(["main", "constitution", "sum"]));

  const handlePlayerAvgModeChange = React.useCallback((nextMode: "base" | "total") => {
    if (hasReadOnlyData) {
      if (nextMode !== effectivePlayerAvgMode) onPlayerAvgModeChange?.(nextMode);
      return;
    }
    if (nextMode === playerAvgMode) return;
    PLAYER_AVG_MODE_CACHE = nextMode;
    if (playerSortSensitiveRef.current.has(sortKey)) {
      startPlayerAvgModeTransition(() => {
        setPlayerAvgMode(nextMode);
      });
      return;
    }
    setPlayerAvgMode(nextMode);
  }, [effectivePlayerAvgMode, hasReadOnlyData, onPlayerAvgModeChange, playerAvgMode, sortKey, startPlayerAvgModeTransition]);
  React.useEffect(() => {
    playerSortSensitiveRef.current = new Set(["main", "constitution", "sum", "statsDay"]);
  }, []);

  React.useEffect(() => {
    PLAYER_AVG_MODE_CACHE = playerAvgMode;
  }, [playerAvgMode]);

  React.useEffect(() => {
    if (isPlayerAvgModePending && !playerPendingPrevRef.current) {
      if (playerPendingHideTimeoutRef.current != null) {
        window.clearTimeout(playerPendingHideTimeoutRef.current);
        playerPendingHideTimeoutRef.current = null;
      }
      playerPendingStartedAtRef.current = Date.now();
      setShowPlayerUpdating(true);
    }

    if (!isPlayerAvgModePending && playerPendingPrevRef.current) {
      const startedAt = playerPendingStartedAtRef.current ?? Date.now();
      const elapsed = Date.now() - startedAt;
      const remainingMs = Math.max(0, 300 - elapsed);
      playerPendingHideTimeoutRef.current = window.setTimeout(() => {
        setShowPlayerUpdating(false);
        playerPendingStartedAtRef.current = null;
        playerPendingHideTimeoutRef.current = null;
      }, remainingMs);
    }

    playerPendingPrevRef.current = isPlayerAvgModePending;
  }, [isPlayerAvgModePending]);

  React.useEffect(() => {
    return () => {
      if (playerPendingHideTimeoutRef.current != null) {
        window.clearTimeout(playerPendingHideTimeoutRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const resolveSlot = () => {
      const el = document.getElementById("player-avg-mode-slot");
      setPlayerAvgModeSlot((prev) => (prev === el ? prev : el));
    };
    resolveSlot();
    const observer = new MutationObserver(resolveSlot);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
    };
  }, []);

  // HUD-Filter -> Provider
  useEffect(() => {
    if (isPresetRender || hasReadOnlyData) return;
    const providerRange =
      range === "all" ? "all" : range === 60 ? "30d" : `${range}d`;
    const normalized = normalizeServerList(servers);
    const normalizedCls = normalizeClassList(classes);
    const group = deriveGroupFromServers(normalized);
    setFilters({
      servers: normalized,
      classes: normalizedCls,
      timeRange: providerRange as any,
      group,
    });
  }, [servers, classes, hasReadOnlyData, isPresetRender, range, setFilters]);

  useEffect(() => {
    if (isPresetRender || hasReadOnlyData) return;
    const s = mapSort(sortKey);
    setSort(s);
  }, [hasReadOnlyData, isPresetRender, sortKey, setSort]);
  const effectiveSort = React.useMemo(
    () => mapSort(sortKey),
    [sortKey]
  );

  const formatDeWithSpaceGrouping = formatToplistNumberWithSpaceGrouping;
  const fmtNum = (n: number | null | undefined) => {
    if (n == null || !Number.isFinite(n)) return "";
    return formatDeWithSpaceGrouping(n);
  };
  const fmtDelta = (n: number | null | undefined) => formatToplistDelta(n, fmtNum);
  const getRankDeltaDisplay = (value: number | string | null | undefined, compareMissing: boolean) =>
    getToplistRankDeltaDisplay(value, compareMissing, fmtNum);
  const getStatsDayVariant = (value: number | null | undefined, avg: number | null) => {
    if (value == null || avg == null || !Number.isFinite(value) || !Number.isFinite(avg) || avg === 0) return "";
    const ratio = value / avg;
    if (ratio >= 1.25) return "pos2";
    if (ratio >= 1.10) return "pos1";
    if (ratio >= 0.95) return "mid0";
    if (ratio >= 0.80) return "mid1";
    if (ratio >= 0.60) return "neg1";
    if (ratio > 0) return "neg2";
    return "neg3";
  };
  const fmtDate = (ts: number | null | undefined) => {
    return formatScanDateTimeLabel(ts);
  };
  const fmtDateObj = (d: Date | null | undefined) => (d ? d.toLocaleString() : "�");

  const readOnlyAllRows = hasReadOnlyData ? (presetReadOnlyData?.allRows ?? presetReadOnlyData?.rows ?? []) : [];
  const readOnlyVisibleRows = hasReadOnlyData ? (presetReadOnlyData?.rows ?? readOnlyAllRows) : [];
  const rows = hasReadOnlyData ? readOnlyAllRows : (playerRows || []);
  const favoritePlayerSet = React.useMemo(() => {
    const keys = Object.keys(sharedFavorites.players ?? {});
    return new Set(keys.map((key) => key.trim().toLowerCase()).filter(Boolean));
  }, [sharedFavorites.players]);
  const selectedGuildSet = React.useMemo(() => {
    const keys = (guilds || []).map(normalizeGuildKey).filter(Boolean);
    return keys.length ? new Set(keys) : null;
  }, [guilds]);
  const hasGuildData = React.useMemo(() => {
    return rows.some((row) => Boolean(normalizeGuildKey(row.guild)));
  }, [rows]);

  const filteredRows = React.useMemo(() => {
    let nextRows = rows;

    if (selectedGuildSet && hasGuildData) {
      nextRows = nextRows.filter((row) => {
        const key = normalizeGuildKey(row.guild);
        return key ? selectedGuildSet.has(key) : false;
      });
    }

    if (favoritesOnly) {
      nextRows = nextRows.filter((row) => {
        const identifier = buildPlayerFavoriteIdentifierFromRow(row);
        return !!(identifier && favoritePlayerSet.has(identifier));
      });
    }

    return nextRows;
  }, [rows, selectedGuildSet, hasGuildData, favoritesOnly, favoritePlayerSet]);

  const compareLoading = presetReadOnlyData?.compareLoading ?? false;
  const showCompare = presetReadOnlyData?.showCompare ?? false;
  const activeCompareError = presetReadOnlyData?.compareError ?? null;
  const tableLoading = hasReadOnlyData ? (presetReadOnlyData?.tableLoading ?? false) : playerLoading;
  const effectivePlayerError = hasReadOnlyData ? (presetReadOnlyData?.playerError ?? null) : playerError;
  const effectivePlayerLastUpdatedAt = hasReadOnlyData ? (presetReadOnlyData?.playerLastUpdatedAt ?? null) : playerLastUpdatedAt;
  const effectivePlayerScopeStatus = hasReadOnlyData ? (presetReadOnlyData?.playerScopeStatus ?? null) : playerScopeStatus;
  const buildCompareKey = React.useCallback((row: ToplistPlayerRow) => buildPlayerToplistCompareKey(row), []);
  const enhancedRows = React.useMemo(() => hasReadOnlyData
    ? readOnlyAllRows
    : filteredRows.map((row, idx) => ({ ...row, _rank: idx + 1 })), [hasReadOnlyData, readOnlyAllRows, filteredRows]);
  const renderedRows = React.useMemo(
    () => {
      if (hasReadOnlyData && !isPresetRender) return readOnlyVisibleRows;
      return captureRowLimit == null ? enhancedRows : enhancedRows.slice(0, captureRowLimit);
    },
    [captureRowLimit, enhancedRows, hasReadOnlyData, isPresetRender, readOnlyVisibleRows]
  );
  const presentation = presetReadOnlyData?.window;
  const rowWindow = !isPresetRender ? presentation : undefined;
  const statusRowCount = rowWindow?.total ?? (hasReadOnlyData ? enhancedRows.length : renderedRows.length);
  const mobileRenderedRowKeys = React.useMemo(() => {
    const keys = new Set<string>();
    renderedRows.forEach((row) => keys.add(buildCompareKey(row)));
    return keys;
  }, [buildCompareKey, renderedRows]);

  React.useEffect(() => {
    setExpandedMobileRowKey((prev) => (prev && mobileRenderedRowKeys.has(prev) ? prev : null));
  }, [mobileRenderedRowKeys]);

  const avgTop100StatsPerDay = (() => {
    if (presentation?.stats) return presentation.stats.average;
    if (!showCompare) return null;
    const topRows = enhancedRows.slice(0, 100);
    let sum = 0;
    let count = 0;
    topRows.forEach((row) => {
      const value = (row as any)._statsPerDay;
      if (typeof value === "number" && Number.isFinite(value)) {
        sum += value;
        count += 1;
      }
    });
    return count ? sum / count : null;
  })();
  const maxStatsPerDay = (() => {
    if (presentation?.stats) return presentation.stats.max;
    if (!showCompare) return null;
    let max: number | null = null;
    enhancedRows.forEach((row) => {
      const value = (row as any)._statsPerDay;
      if (typeof value === "number" && Number.isFinite(value)) {
        if (max == null || value > max) max = value;
      }
    });
    return max;
  })();

  const decorMap = React.useMemo(
    () => buildPlayerToplistDecorMap(enhancedRows, effectivePlayerAvgMode, buildCompareKey),
    [enhancedRows, buildCompareKey, effectivePlayerAvgMode],
  );

  const nowMs = Date.now();
  const statusLabel = !hasServers
    ? t("toplists.status.noServerSelected", "No server selected")
    : tableLoading
      ? t("toplists.status.loading", "Loading...")
      : effectivePlayerError
        ? t("toplists.status.error", "Error")
        : t("toplists.status.ready", "Ready");
  const tableScrollRef = React.useRef<HTMLDivElement | null>(null);
  const readOnlyLoadMoreSentinelRef = React.useRef<HTMLDivElement | null>(null);
  const [tableScrollbarWidth, setTableScrollbarWidth] = React.useState(0);
  const virtualRowHeight = showCompare ? 72 : 64;
  const virtualRowKeys = React.useMemo(
    () => renderedRows.map((row) => resolveToplistRowIdentifier(row)),
    [renderedRows]
  );
  const rowIndexByIdentifier = React.useMemo(() => {
    const indexMap = new Map<string, number>();
    renderedRows.forEach((row, idx) => {
      const identifier = resolveToplistRowIdentifier(row);
      if (!identifier || indexMap.has(identifier)) return;
      indexMap.set(identifier, idx + (rowWindow?.start ?? 0));
    });
    return indexMap;
  }, [renderedRows, rowWindow?.start]);
  const rowVirtualizer = useVirtualizer({
    count: rowWindow?.total ?? renderedRows.length,
    getScrollElement: () => isPresetRender ? null : isCompactToplistView ? rowWindow ? tableRef.current : null : tableScrollRef.current,
    estimateSize: () => isCompactToplistView && rowWindow ? 86 : virtualRowHeight,
    overscan: 14,
    getItemKey: (index) => rowWindow ? index : virtualRowKeys[index] ?? `missing-identifier-row-${index}`,
  });
  const windowItems = rowVirtualizer.getVirtualItems();
  const wantedWindowStart = Math.max(0, Math.floor((windowItems[0]?.index ?? 0) / 100) * 100);
  React.useEffect(() => {
    if (rowWindow && windowItems.length && (wantedWindowStart < rowWindow.start ||
        windowItems[windowItems.length - 1].index >= rowWindow.start + renderedRows.length)) {
      rowWindow.onChange(wantedWindowStart);
    }
  }, [rowWindow?.contextKey, rowWindow?.start, rowWindow?.onChange, wantedWindowStart, renderedRows.length, windowItems[windowItems.length - 1]?.index]);
  React.useLayoutEffect(() => {
    if (!rowWindow) return;
    rowVirtualizer.measure();
    rowVirtualizer.scrollToOffset(0);
  }, [rowWindow?.contextKey]);
  const highlightedIdentifier = useToplistRowFocus({
    focusIdentifier,
    focusNonce,
    focusRequest,
    onFocusResult,
    scrollContainerRef: tableRef,
    disabled: isPresetRender || !hasServers || tableLoading,
    rowIndexByIdentifier,
    scrollToIndex: isCompactToplistView && !rowWindow ? undefined : (targetIndex) => {
      rowVirtualizer.scrollToIndex(targetIndex, { align: "center", behavior: "auto" });
    },
  });
  const compareExpected = presetReadOnlyData?.compareExpected ?? false;
  const virtualTotalSize = Math.round(rowVirtualizer.getTotalSize());
  const firstRenderedKey = renderedRows.length > 0 ? buildCompareKey(renderedRows[0]) : "";
  const lastRenderedKey = renderedRows.length > 0 ? buildCompareKey(renderedRows[renderedRows.length - 1]) : "";
  const captureReady =
    !tableLoading &&
    renderedRows.length > 0 &&
    (!compareExpected || (!compareLoading && showCompare && virtualRowHeight === 72));
  const captureStabilityKey = [
    renderMode,
    compareMode,
    compareExpected ? "cmp:1" : "cmp:0",
    compareLoading ? "cmpLoading:1" : "cmpLoading:0",
    showCompare ? "showCompare:1" : "showCompare:0",
    tableLoading ? "loading:1" : "loading:0",
    `rows:${renderedRows.length}`,
    `rowH:${virtualRowHeight}`,
    `virt:${virtualTotalSize}`,
    `first:${firstRenderedKey}`,
    `last:${lastRenderedKey}`,
  ].join("|");

  React.useEffect(() => {
    if (!onCaptureStatusChange) return;
    onCaptureStatusChange({
      loading: tableLoading,
      rowCount: renderedRows.length,
      ready: captureReady,
      stabilityKey: captureStabilityKey,
      compareLoading,
      compareExpected,
      showCompare,
      virtualRowHeight,
      virtualTotalSize,
    });
  }, [
    captureReady,
    captureStabilityKey,
    compareExpected,
    compareLoading,
    onCaptureStatusChange,
    renderedRows.length,
    showCompare,
    tableLoading,
    virtualRowHeight,
    virtualTotalSize,
  ]);

  React.useEffect(() => {
    if (!hasReadOnlyData || isPresetRender || !readOnlyHasMoreRows || !onReadOnlyRowsEndVisible) return;
    const sentinel = readOnlyLoadMoreSentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        onReadOnlyRowsEndVisible();
      }
    }, {
      root: isCompactToplistView ? null : tableScrollRef.current,
      rootMargin: "160px 0px",
      threshold: 0,
    });
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [
    hasReadOnlyData,
    isCompactToplistView,
    isPresetRender,
    onReadOnlyRowsEndVisible,
    readOnlyHasMoreRows,
    renderedRows.length,
  ]);

  const getPresetReadOnlyData = React.useCallback((): PlayerPresetReadOnlyData => ({
    rows: enhancedRows.slice(0, 150),
    allRows: enhancedRows,
    tableLoading,
    compareLoading,
    compareExpected,
    showCompare,
    compareError: activeCompareError,
    playerError: effectivePlayerError,
    playerLastUpdatedAt: effectivePlayerLastUpdatedAt,
    playerScopeStatus: effectivePlayerScopeStatus,
    playerAvgMode: effectivePlayerAvgMode,
  }), [
    activeCompareError,
    compareExpected,
    compareLoading,
    effectivePlayerAvgMode,
    effectivePlayerError,
    effectivePlayerLastUpdatedAt,
    effectivePlayerScopeStatus,
    enhancedRows,
    showCompare,
    tableLoading,
  ]);

  React.useImperativeHandle(ref, () => ({
    getPresetReadOnlyData,
  }), [getPresetReadOnlyData]);

  React.useEffect(() => {
    if (isPresetRender) return;
    const scrollEl = tableScrollRef.current;
    if (!scrollEl) return;

    const updateScrollbarWidth = () => {
      const nextWidth = Math.max(0, scrollEl.offsetWidth - scrollEl.clientWidth);
      setTableScrollbarWidth((prevWidth) => (prevWidth === nextWidth ? prevWidth : nextWidth));
    };

    updateScrollbarWidth();
    const resizeObserver = new ResizeObserver(updateScrollbarWidth);
    resizeObserver.observe(scrollEl);

    return () => {
      resizeObserver.disconnect();
    };
  }, [hasServers, isPresetRender, renderedRows.length, showCompare]);

  void focusRank;

  const renderDelta = (value: number | null, missing: boolean, hideIfNull = false) => {
    if (!showCompare) return null;
    if (missing) {
      return <div style={TOPLIST_DELTA_SUBTEXT_STYLE}>-</div>;
    }
    if (value == null && hideIfNull) return null;
    return (
      <div style={TOPLIST_DELTA_SUBTEXT_STYLE}>
        {value == null ? t("toplists.deltaNew", "NEW") : fmtDelta(value)}
      </div>
    );
  };

  const formatMetricText = (value: React.ReactNode) => {
    const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
    return text || "-";
  };

  const getRowDisplayData = (r: ToplistPlayerRow, i: number) => {
    const rankDelta = showCompare ? (r as any)._rankDelta : null;
    const deltas = (r as any)._delta || {};
    const compareMissing = showCompare ? Boolean((r as any)._compareMissing) : false;
    const rankDeltaDisplay = showCompare ? getRankDeltaDisplay(rankDelta, compareMissing) : null;
    const statsPerDayValue = showCompare ? (r as any)._statsPerDay : null;
    const statsDaysValue = showCompare ? (r as any)._statsDays : null;
    const statsPerDayText = statsPerDayValue == null ? "-" : fmtNum(statsPerDayValue);
    const statsDaysText = statsDaysValue == null ? "-" : `${statsDaysValue}d`;
    const statsDayVariant = getStatsDayVariant(statsPerDayValue, avgTop100StatsPerDay);
    const isBestStatsDay =
      statsPerDayValue != null &&
      maxStatsPerDay != null &&
      statsPerDayValue === maxStatsPerDay;
    const statsDayClassName = isBestStatsDay
      ? "stats-day-chip stats-day-chip--best"
      : statsDayVariant
        ? `stats-day-chip stats-day-chip--${statsDayVariant}`
        : "stats-day-chip";
    const lastScanDotColor = computeLastScanColor((r as any).lastScan, nowMs);
    const lastScanLabel = formatLastScanDisplay((r as any).lastScan);
    const classKey = String(r.class ?? "").trim();
    const classIconUrl = getClassIconUrl(classKey, 48);
    const sublineServer = String(r.server ?? "").trim();
    const sublineText = sublineServer;
    const profileIdentifier = resolveToplistRowIdentifier(r);
    const rowKey = profileIdentifier ?? `missing-identifier-row-${i}`;
    const accordionKey = buildCompareKey(r);
    const isFocusedRow = Boolean(profileIdentifier && highlightedIdentifier === profileIdentifier);
    const decor = presentation ? { ...decorMap.get(buildCompareKey(r)), mainRank: undefined, conRank: undefined, levelRank: undefined, ...presentation.decor?.[buildCompareKey(r)] } : decorMap.get(buildCompareKey(r));
    const mainTone = getRankTone(decor?.mainRank, MAIN_RANK_COLORS);
    const conTone = getRankTone(decor?.conRank, CON_RANK_COLORS);
    const levelTone = getRankTone(decor?.levelRank, LEVEL_RANK_COLORS);
    const mineTone = getMineTone(decor?.mineTier);
    const calculatedSum = (r as any)._calculatedSum ?? 0;
    const displayMain = effectivePlayerAvgMode === "total" ? r.mainTotal : r.main;
    const displayCon = effectivePlayerAvgMode === "total" ? r.conTotal : r.con;
    const displaySum = effectivePlayerAvgMode === "total" ? r.sumTotal : calculatedSum;
    const mainDeltaValue = effectivePlayerAvgMode === "total" ? (deltas.mainTotal ?? null) : (deltas.main ?? null);
    const conDeltaValue = effectivePlayerAvgMode === "total" ? (deltas.conTotal ?? null) : (deltas.con ?? null);
    const sumDeltaValue = effectivePlayerAvgMode === "total" ? (deltas.sumTotal ?? null) : (deltas.sum ?? null);

    return {
      accordionKey,
      calculatedSum,
      classIconUrl,
      classKey,
      compareMissing,
      conDeltaValue,
      conTone,
      deltas,
      displayCon,
      displayMain,
      displaySum,
      isFocusedRow,
      lastScanDotColor,
      lastScanLabel,
      levelTone,
      mainDeltaValue,
      mainTone,
      mineTone,
      profileIdentifier,
      rankDeltaDisplay,
      rowKey,
      statsDayClassName,
      statsDaysText,
      statsPerDayText,
      sublineServer,
      sublineText,
      sumDeltaValue,
    };
  };

  const getSortMetric = (
    r: ToplistPlayerRow,
    row: ReturnType<typeof getRowDisplayData>,
  ) => {
    const valueOrDash = (value: React.ReactNode) => formatMetricText(value);
    switch (effectiveSort.key) {
      case "name":
        return { label: t("toplists.columns.player", "Player"), value: valueOrDash(r.name) };
      case "lastScan":
        return { label: t("toplists.columns.lastScan", "Last Scan"), value: valueOrDash(row.lastScanLabel) };
      case "main":
      case "mainTotal":
        return { label: t("toplists.columns.main", "Main"), value: valueOrDash(fmtNum(row.displayMain)) };
      case "con":
      case "conTotal":
        return { label: t("toplists.columns.con", "Con"), value: valueOrDash(fmtNum(row.displayCon)) };
      case "sum":
      case "sumTotal":
        return { label: t("toplists.columns.sum", "Sum"), value: valueOrDash(fmtNum(row.displaySum)) };
      case "statsDay":
      case "statsDayTotal":
        return { label: t("toplists.columns.statsPerDay", "Stats/Day"), value: valueOrDash(row.statsPerDayText) };
      case "ratio":
        return { label: t("toplists.columns.ratio", "Ratio"), value: valueOrDash((r as any)._ratioLabel ?? r.ratio) };
      case "mine":
        return { label: t("toplists.columns.mine", "Mine"), value: valueOrDash(fmtNum(r.mine)) };
      case "treasury":
        return { label: t("toplists.columns.treasury", "Treasury"), value: valueOrDash(fmtNum(r.treasury)) };
      case "xpProgress":
        return { label: t("toplists.columns.xpProgress", "XP Progress"), value: valueOrDash(fmtNum((r as any).xpProgress)) };
      case "xpTotal":
        return { label: t("toplists.columns.xpTotal", "XP Total"), value: valueOrDash(fmtNum((r as any).xpTotal)) };
      case "level":
      default:
        return { label: t("toplists.columns.level", "Level"), value: valueOrDash(fmtNum(r.level)) };
    }
  };

  const renderMobileDetailItem = (
    key: string,
    label: React.ReactNode,
    value: React.ReactNode,
    delta?: React.ReactNode,
    className = "",
  ) => (
    <div key={key} className={`toplists-mobile-detail-item${className ? ` ${className}` : ""}`}>
      <div className="toplists-mobile-detail-label">{label}</div>
      <div className="toplists-mobile-detail-value">
        {value}
        {delta}
      </div>
    </div>
  );

  const compactMetricColumn = ({"name": "player", "lastScan": "lastScan", "main": "main", "mainTotal": "main", "con": "con", "conTotal": "con", "sum": "sum", "sumTotal": "sum", "statsDay": "statsPerDay", "statsDayTotal": "statsPerDay", "ratio": "ratio", "mine": "mine", "treasury": "treasury", "xpProgress": "xpProgress", "xpTotal": "xpTotal", "level": "level"} as Record<string, string>)[effectiveSort.key] ?? "level";

  const renderMobileAccordion = () => (
    <div
      ref={tableRef}
      className="toplists-mobile-list"
      style={rowWindow ? { display: "block", maxHeight: "65vh", overflowY: "auto", minHeight: 160 } : undefined}
      data-toplists-export-root="true"
    >
      {localLayout && <div data-local-toplist-header="true" className="toplists-mobile-summary" style={{ borderBottom: "1px solid #2C4A73", cursor: "default", fontSize: 12, fontWeight: 600 }}>
        <span>#</span><span>{t("toplists.columns.player")} / {t("toplists.columns.server")}</span><span>{t(`toplists.columns.${compactMetricColumn}`)}</span><span aria-hidden />
      </div>}
      {localLayout && <div data-local-toplist-body="true">{localNoticeContent}{localLoadingContent}</div>}
      {rowWindow && windowItems[0]?.start > 0 && <div aria-hidden style={{ height: windowItems[0].start }} />}
      {(localLoadingContent ? [] : rowWindow ? windowItems : renderedRows.map((_, index) => ({ index }))).map(({ index: i }) => {
        const r = renderedRows[i - (rowWindow?.start ?? 0)];
        if (!r) return rowWindow ? <div key={`pending-${i}`} aria-hidden style={{ height: rowVirtualizer.getVirtualItems().find(item => item.index === i)?.size ?? 86 }} /> : null;
        const row = getRowDisplayData(r, i);
        const sortMetric = getSortMetric(r, row);
        const isExpanded = expandedMobileRowKey === row.accordionKey;
        const guildName = String(r.guild ?? "").trim();
        const detailId = `toplist-mobile-details-${i}`;
        const openPlayerProfile = () => {
          if (onOpenPlayerProfile) { onOpenPlayerProfile(r); return; }

        };

        const content = (
          <div
            key={row.accordionKey}
            className={`toplists-mobile-row${row.isFocusedRow ? " toplists-mobile-row--focused" : ""}${isExpanded ? " toplists-mobile-row--open" : ""}`}
            data-sfh-identifier={row.profileIdentifier ?? undefined}
            data-sfh-server={r.server ?? undefined}
          >
            <button
              type="button"
              className="toplists-mobile-summary"
              aria-expanded={isExpanded}
              aria-controls={detailId}
              onClick={() => setExpandedMobileRowKey((prev) => (prev === row.accordionKey ? null : row.accordionKey))}
            >
              <span className="toplists-mobile-rank">
                #{hasReadOnlyData ? ((r as any)._rank ?? (r as any).tableRank ?? i + 1) : i + 1}
                {row.rankDeltaDisplay ? (
                  <span className={`rank-delta-chip rank-delta-chip--${row.rankDeltaDisplay.variant}`}>
                    {row.rankDeltaDisplay.text}
                  </span>
                ) : null}
              </span>
              <span className="toplists-mobile-player">
                <span className="toplists-mobile-class">
                  {row.classIconUrl ? (
                    <img
                      src={row.classIconUrl}
                      alt={row.classKey || t("toplists.columns.class", "Class")}
                      loading="lazy"
                      className="class-icon-toplist"
                    />
                  ) : (
                    <span>{row.classKey}</span>
                  )}
                </span>
                <span className="toplists-mobile-player-copy">
                  <span className="toplists-mobile-name">{r.name}</span>
                  <span className="toplists-mobile-guild">{guildName || "-"}</span>
                  <span className="toplists-mobile-meta">
                    {[row.sublineServer, `${t("toplists.columns.level", "Level")} ${fmtNum(r.level) || "-"}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </span>
              <span className="toplists-mobile-metric">
                <span className="toplists-mobile-metric-value">
                  <ValueCrossfade value={sortMetric.value} fadeKey={`${effectiveSort.key}:${effectivePlayerAvgMode}`} minWidthCh={0} />
                </span>
                <span className="toplists-mobile-metric-label">{sortMetric.label}</span>
              </span>
              <span className="toplists-mobile-chevron" aria-hidden />
            </button>
            {isExpanded && (
              <div id={detailId} className="toplists-mobile-details">
                <div
                  className="toplists-mobile-actions"
                  onClick={(event) => event.stopPropagation()}
                >
                  <NeonCoreButton
                    label={t("toplists.mobileActions.playerProfile", "Player profile")}
                    title={t("toplists.mobileActions.playerProfile", "Player profile")}
                    icon={null}
                    disabled={!row.profileIdentifier}
                    className="toplists-mobile-action-button"
                    onClick={openPlayerProfile}
                  />
                  <NeonCoreButton
                    label={t("toplists.mobileActions.guildProfile", "Guild profile")}
                    title={t("toplists.mobileActions.guildProfile", "Guild profile")}
                    icon={null}
                    disabled={!guildName}
                    className="toplists-mobile-action-button"
                    onClick={() => {
                      if (!guildName) return;
                      void onOpenGuildProfile?.(r);
                    }}
                  />
                </div>
                {renderMobileDetailItem("level", t("toplists.columns.level", "Level"), <span style={getFrameStyle(row.levelTone)}>{fmtNum(r.level) || "-"}</span>, renderDelta(row.deltas.level ?? null, row.compareMissing))}
                {renderMobileDetailItem("main", t("toplists.columns.main", "Main"), <span style={getFrameStyle(row.mainTone)}>{fmtNum(row.displayMain) || "-"}</span>, renderDelta(row.mainDeltaValue, row.compareMissing))}
                {renderMobileDetailItem("con", t("toplists.columns.con", "Con"), <span style={getFrameStyle(row.conTone)}>{fmtNum(row.displayCon) || "-"}</span>, renderDelta(row.conDeltaValue, row.compareMissing))}
                {renderMobileDetailItem("sum", t("toplists.columns.sum", "Sum"), fmtNum(row.displaySum) || "-", renderDelta(row.sumDeltaValue, row.compareMissing))}
                {renderMobileDetailItem(
                  "statsPerDay",
                  t("toplists.columns.statsPerDay", "Stats/Day"),
                  <span className={row.statsDayClassName}>{row.statsPerDayText}</span>,
                  <div style={TOPLIST_DELTA_SUBTEXT_STYLE}>{row.statsDaysText}</div>,
                )}
                {renderMobileDetailItem("ratio", t("toplists.columns.ratio", "Ratio"), formatMetricText((r as any)._ratioLabel ?? r.ratio), renderDelta(row.deltas.ratio ?? null, row.compareMissing, true))}
                {renderMobileDetailItem("mine", t("toplists.columns.mine", "Mine"), <span style={getFrameStyle(row.mineTone)}>{fmtNum(r.mine) || "-"}</span>, renderDelta(row.deltas.mine ?? null, row.compareMissing))}
                {renderMobileDetailItem("treasury", t("toplists.columns.treasury", "Treasury"), fmtNum(r.treasury) || "-", renderDelta(row.deltas.treasury ?? null, row.compareMissing))}
                {renderMobileDetailItem(
                  "lastScan",
                  t("toplists.columns.lastScan", "Last Scan"),
                  <span className="toplists-mobile-last-scan">
                    <span>{formatMetricText(row.lastScanLabel)}</span>
                    {row.lastScanDotColor && <span aria-hidden style={{ background: row.lastScanDotColor }} />}
                  </span>
                  ,
                  undefined,
                  "toplists-mobile-detail-item--wide",
                )}
              </div>
            )}
          </div>
        );
        return rowWindow ? <div key={row.accordionKey} data-index={i} ref={rowVirtualizer.measureElement} style={{ paddingBottom: 8 }}>{content}</div> : content;
      })}
      {rowWindow && windowItems.length > 0 && <div aria-hidden style={{ height: Math.max(0, rowVirtualizer.getTotalSize() - windowItems[windowItems.length - 1].end) }} />}
      {tableLoading && !localLoadingContent && renderedRows.length === 0 && (
        <div className="toplists-mobile-empty">{t("toplists.table.loading", "Loading...")}</div>
      )}
      {!tableLoading && !effectivePlayerError && renderedRows.length === 0 && (
        <div className="toplists-mobile-empty">{t("toplists.table.noResults", "No results")}</div>
      )}
      {hasReadOnlyData && readOnlyHasMoreRows && <div ref={readOnlyLoadMoreSentinelRef} aria-hidden style={{ height: 1 }} />}
    </div>
  );

  const renderToplistColGroup = () => (
    <colgroup>
      {activeColumns.map((column) => (
        <col key={column.key} style={{ width: localColumns ? (localColumnWidths?.[column.key] ?? customColumnWidth(column.key)) : column.width }} />
      ))}
    </colgroup>
  );

  const renderToplistHeader = () => (
    <table className="toplists-table toplists-table--header" style={tableStyle}>
      {renderToplistColGroup()}
      <thead>
        <tr style={TOPLIST_HEADER_ROW_STYLE}>
          {activeColumns.map((column) => (
            <LocalSortHeader key={column.key} kind="players" localValueMode={effectivePlayerAvgMode} columnKey={column.key} localSort={localSort} onLocalSort={onLocalSort} style={TOPLIST_CELL_STYLE_BY_KEY[column.key]}>
              <span style={{ ...TOPLIST_HEADER_LABEL_STYLE, ...TOPLIST_HEADER_LABEL_ALIGN_STYLE[column.align] }}>
                {toplistColumnLabel("players", column.key, t)}
              </span>
            </LocalSortHeader>
          ))}
        </tr>
      </thead>
    </table>
  );

  const renderToplistTableBody = (opts: {
    imgLoading: "lazy" | "eager";
    measure?: boolean;
  }) => {
    const rows = localLoadingContent ? [] : opts.measure ? enhancedRows : renderedRows;
    const virtualItems = isPresetRender || opts.measure ? [] : rowVirtualizer.getVirtualItems();
    const rowIndices = opts.measure ? rows.map((_, idx) => idx) : isPresetRender ? rows.map((_, idx) => idx) : virtualItems.map((virtualRow) => virtualRow.index);
    const topSpacerHeight = isPresetRender || !virtualItems.length ? 0 : virtualItems[0].start;
    const bottomSpacerHeight = isPresetRender || !virtualItems.length
      ? 0
      : Math.max(0, rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end);
    return (
    <table className="toplists-table toplists-table--body" style={tableStyle}>
      {renderToplistColGroup()}
      <tbody>
        {(localNoticeContent || localLoadingContent) && <tr><td colSpan={columnCount} style={{ padding: 0 }}>{localNoticeContent}{localLoadingContent}</td></tr>}
        {!isPresetRender && rows.length > 0 && topSpacerHeight > 0 && (
          <tr aria-hidden>
            <td colSpan={columnCount} style={{ height: topSpacerHeight, padding: 0, border: 0 }} />
          </tr>
        )}
        {rowIndices.map((i) => {
          const r = rows[i - (opts.measure ? 0 : rowWindow?.start ?? 0)];
          if (!r) return rowWindow ? <tr key={`pending-${i}`} aria-hidden><td colSpan={columnCount} style={{ height: virtualRowHeight, padding: 0, border: 0 }} /></tr> : null;
          const rankDelta = showCompare ? (r as any)._rankDelta : null;
          const deltas = (r as any)._delta || {};
          const compareMissing = showCompare ? Boolean((r as any)._compareMissing) : false;
          const rankDeltaDisplay = showCompare ? getRankDeltaDisplay(rankDelta, compareMissing) : null;
          const statsPerDayValue = showCompare ? (r as any)._statsPerDay : null;
          const statsDaysValue = showCompare ? (r as any)._statsDays : null;
          const statsPerDayText = statsPerDayValue == null ? "-" : fmtNum(statsPerDayValue);
          const statsDaysText = statsDaysValue == null ? "-" : `${statsDaysValue}d`;
          const statsDayVariant = getStatsDayVariant(statsPerDayValue, avgTop100StatsPerDay);
          const isBestStatsDay =
            statsPerDayValue != null &&
            maxStatsPerDay != null &&
            statsPerDayValue === maxStatsPerDay;
          const statsDayClassName = isBestStatsDay
            ? "stats-day-chip stats-day-chip--best"
            : statsDayVariant
              ? `stats-day-chip stats-day-chip--${statsDayVariant}`
              : "stats-day-chip";
          const lastScanDotColor = computeLastScanColor((r as any).lastScan, nowMs);
          const lastScanLabel = formatLastScanDisplay((r as any).lastScan);
          const classKey = String(r.class ?? "").trim();
          const classIconUrl = getClassIconUrl(classKey, 48);
          const sublineServer = String(r.server ?? "").trim();
          const sublineText = sublineServer;
          const profileIdentifier = resolveToplistRowIdentifier(r);
          const rowKey = profileIdentifier ?? `missing-identifier-row-${i}`;
          const isFocusedRow = Boolean(profileIdentifier && highlightedIdentifier === profileIdentifier);
          const decor = presentation ? { ...decorMap.get(buildCompareKey(r)), mainRank: undefined, conRank: undefined, levelRank: undefined, ...presentation.decor?.[buildCompareKey(r)] } : decorMap.get(buildCompareKey(r));
          const mainTone = getRankTone(decor?.mainRank, MAIN_RANK_COLORS);
          const conTone = getRankTone(decor?.conRank, CON_RANK_COLORS);
          const levelTone = getRankTone(decor?.levelRank, LEVEL_RANK_COLORS);
          const mineTone = getMineTone(decor?.mineTier);
          const calculatedSum = (r as any)._calculatedSum ?? 0;
          const displayMain = effectivePlayerAvgMode === "total" ? r.mainTotal : r.main;
          const displayCon = effectivePlayerAvgMode === "total" ? r.conTotal : r.con;
          const displaySum = effectivePlayerAvgMode === "total" ? r.sumTotal : calculatedSum;
          const mainDeltaValue = effectivePlayerAvgMode === "total" ? (deltas.mainTotal ?? null) : (deltas.main ?? null);
          const conDeltaValue = effectivePlayerAvgMode === "total" ? (deltas.conTotal ?? null) : (deltas.con ?? null);
          const sumDeltaValue = effectivePlayerAvgMode === "total" ? (deltas.sumTotal ?? null) : (deltas.sum ?? null);
          const renderDelta = (value: number | null, missing: boolean, hideIfNull = false) => {
            if (!showCompare) return null;
            if (missing) {
              return <div style={TOPLIST_DELTA_SUBTEXT_STYLE}>-</div>;
            }
            if (value == null && hideIfNull) return null;
            return (
              <div style={TOPLIST_DELTA_SUBTEXT_STYLE}>
                {value == null ? t("toplists.deltaNew", "NEW") : fmtDelta(value)}
              </div>
            );
          };
          const rowOnClick = (event: React.MouseEvent<HTMLTableRowElement>) => {
            event.preventDefault();
            event.stopPropagation();
            if (isPresetRender && !onOpenPlayerProfile) return;
            if (onOpenPlayerProfile) {
              onOpenPlayerProfile(r);
              return;
            }

          };

          return (
            <tr
              key={rowKey}
              className={`toplists-row${isFocusedRow ? " toplists-row--focused" : ""}`}
              data-sfh-identifier={profileIdentifier ?? undefined}
              data-sfh-server={r.server ?? undefined}
              style={{
                borderBottom: "1px solid #2C4A73",
                cursor: "pointer",
                userSelect: "none",
                height: virtualRowHeight,
              }}
              onClick={rowOnClick}
            >
              {activeColumns.map(column => { const attribute = playerAttributeColumn(column.key);
              if (attribute) {
                const value = playerAttributeValue(r, attribute);
                return <td key={column.key} style={cellStyles[column.key]}>
                  <div style={numberColumnStyle}>
                    <span>{attribute.stat === "Ratio" ? playerRatioLabel(value) : fmtNum(value)}</span>
                    {attribute.delta && renderDelta(deltas[attribute.delta] ?? null, compareMissing)}
                  </div>
                </td>;
              }
              switch (column.key) {
case "rank": return (<td key={column.key} style={cellStyles.rank}>{hasReadOnlyData ? ((r as any)._rank ?? (r as any).tableRank ?? i + 1) : i + 1}</td>);
case "overallRank":
case "serverRank":
case "classRank": return <td key={column.key} style={cellStyles[column.key]}><ToplistRankingValue rankings={r.rankings} rankKey={column.key} showCompare={showCompare} /></td>;
case "rankDelta": return (<td key={column.key} style={cellStyles.rankDelta}>
                <span style={TOPLIST_TEXT_CELL_CONTENT_STYLE}>
                  {rankDeltaDisplay ? (
                    <span className={`rank-delta-chip rank-delta-chip--${rankDeltaDisplay.variant}`}>
                      {rankDeltaDisplay.text}
                    </span>
                  ) : ""}
                </span>
              </td>);
case "name": return (<td key={column.key} style={cellStyles.name}>
                <div style={nameLayoutStyle}>
                  <span style={nameIconStyle}>
                    {classIconUrl ? (
                      <img
                        src={classIconUrl}
                        alt={classKey || t("toplists.columns.class", "Class")}
                        loading={opts.imgLoading}
                        className="class-icon-toplist"
                        style={{ display: "block", objectFit: "contain", width: 24, height: 24 }}
                      />
                    ) : (
                      <span>{classKey}</span>
                    )}
                  </span>
                  <div style={nameStackStyle}>
                    <span style={TOPLIST_TEXT_CELL_CONTENT_STYLE}>{r.name}</span>
                    <span style={TOPLIST_SECONDARY_TEXT_CELL_CONTENT_STYLE}>{sublineText}</span>
                  </div>
                </div>
              </td>);
case "guild": return (<td key={column.key} style={cellStyles.guild}>
                {String(r.guild ?? "").trim() ? (
                  <span
                    style={{ display: "block", width: "100%", minWidth: 0 }}
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <NeonCoreButton
                      onClick={() => {
                        if (isPresetRender) return;
                        void onOpenGuildProfile?.(r);
                      }}
                      title={String(r.guild ?? "")}
                      label={String(r.guild ?? "")}
                      icon={null}
                      className={`w-full min-w-0 ${centerCellContents ? "justify-center" : "justify-start"} rounded-lg px-2 py-1 text-xs font-medium leading-tight`}
                    />
                  </span>
                ) : (
                  <span style={TOPLIST_TEXT_CELL_CONTENT_STYLE}>{r.guild ?? ""}</span>
                )}
              </td>);
case "level": return (<td key={column.key} style={cellStyles.level}>
                <div style={badgeColumnStyle}>
                  <span style={getFrameStyle(levelTone)}>{fmtNum(r.level)}</span>
                  {renderDelta(deltas.level ?? null, compareMissing)}
                </div>
              </td>);
case "main": return (<td key={column.key} style={cellStyles.main}>
                <div style={badgeColumnStyle}>
                  <span style={getFrameStyle(mainTone)}>
                    <ValueCrossfade textAlign={centerCellContents ? "center" : "right"} value={fmtNum(displayMain)} fadeKey={effectivePlayerAvgMode} minWidthCh={0} />
                  </span>
                  {renderDelta(mainDeltaValue, compareMissing)}
                </div>
              </td>);
case "con": return (<td key={column.key} style={cellStyles.con}>
                <div style={badgeColumnStyle}>
                  <span style={getFrameStyle(conTone)}>
                    <ValueCrossfade textAlign={centerCellContents ? "center" : "right"} value={fmtNum(displayCon)} fadeKey={effectivePlayerAvgMode} minWidthCh={0} />
                  </span>
                  {renderDelta(conDeltaValue, compareMissing)}
                </div>
              </td>);
case "sum": return (<td key={column.key} style={cellStyles.sum}>
                <div style={numberColumnStyle}>
                  <span>
                    <ValueCrossfade textAlign={centerCellContents ? "center" : "right"} value={fmtNum(displaySum)} fadeKey={effectivePlayerAvgMode} />
                  </span>
                  {renderDelta(sumDeltaValue, compareMissing)}
                </div>
              </td>);
case "statsPerDay": return (<td key={column.key} style={cellStyles.statsPerDay}>
                <div style={numberColumnStyle}>
                  <span className={statsDayClassName}>{statsPerDayText}</span>
                  <div style={TOPLIST_DELTA_SUBTEXT_STYLE}>{statsDaysText}</div>
                </div>
              </td>);
case "ratio": return (<td key={column.key} style={cellStyles.ratio}>
                <div style={TOPLIST_FLEX_COLUMN_CENTER_STYLE}>
                  <span>{(r as any)._ratioLabel ?? r.ratio ?? "-"}</span>
                  {renderDelta(deltas.ratio ?? null, compareMissing, true)}
                </div>
              </td>);
case "mine": return (<td key={column.key} style={cellStyles.mine}>
                <div style={badgeColumnStyle}>
                  <span style={getFrameStyle(mineTone)}>{fmtNum(r.mine)}</span>
                  {renderDelta(deltas.mine ?? null, compareMissing)}
                </div>
              </td>);
case "treasury": return (<td key={column.key} style={cellStyles.treasury}>
                <div style={numberColumnStyle}>
                  <span>{fmtNum(r.treasury)}</span>
                  {renderDelta(deltas.treasury ?? null, compareMissing)}
                </div>
              </td>);
case "lastScan": return (<td key={column.key} style={cellStyles.lastScan}>
                <span style={lastScanStyle}>
                  <span style={lastScanLabelStyle}>{lastScanLabel}</span>
                  {lastScanDotColor && (
                    <span
                      aria-hidden
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: lastScanDotColor,
                        boxShadow: "0 0 6px rgba(0, 0, 0, 0.35)",
                      }}
                    />
                  )}
                </span>
              </td>);
case "server": return <td key={column.key} style={cellStyles.server}>{r.server ?? "-"}</td>;
case "class": return <td key={column.key} style={cellStyles.class}>{classKey || "-"}</td>;
default: return null;
} })}
</tr>
          );
        })}
        {tableLoading && !localLoadingContent && rows.length === 0 && (
          <tr><td colSpan={columnCount} style={{ padding: 12 }}>{t("toplists.table.loading", "Loading...")}</td></tr>
        )}
        {!tableLoading && !effectivePlayerError && rows.length === 0 && (
          <tr><td colSpan={columnCount} style={{ padding: 12 }}>{t("toplists.table.noResults", "No results")}</td></tr>
        )}
        {!isPresetRender && rows.length > 0 && bottomSpacerHeight > 0 && (
          <tr aria-hidden>
            <td colSpan={columnCount} style={{ height: bottomSpacerHeight, padding: 0, border: 0 }} />
          </tr>
        )}
      </tbody>
    </table>
    );
  };
  const autoSizePortal = useToplistAutoSize("players", localLayout && !isPresetRender, activeColumns.map(c => c.key), () => <>{renderToplistHeader()}{renderToplistTableBody({ imgLoading: "eager", measure: true })}</>);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: isPresetRender ? 0 : 12, minHeight: 0, height: isPresetRender ? "auto" : "100%" }}>
      {autoSizePortal}
      <div style={{ opacity: 0.8, fontSize: 12, display: "flex", justifyContent: "space-between", ...(localLayout ? { height: 18, minHeight: 18, whiteSpace: "nowrap", position: "relative" as const, zIndex: 5 } : {}) }}>
        <div style={{ display: "flex", alignItems: "center" }}>{localLayout && <ToplistViewPicker kind="players" />}{statusLabel} - {statusRowCount} {t("toplists.status.rows", { count: statusRowCount })}</div>
        <div>{effectivePlayerLastUpdatedAt ? t("toplists.status.updated", "Updated: {{value}}", { value: fmtDate(effectivePlayerLastUpdatedAt) }) : null}</div>
      </div>
      {showAvgModeControl && playerAvgModeSlot &&
        createPortal(
          <PlayerAvgModeControls
            disabled={localLayout && !!localColumns}
            mode={effectivePlayerAvgMode}
            updating={showPlayerUpdating}
            onChange={handlePlayerAvgModeChange}
            label={t("toplists.players.avgMode.label", "Values")}
            ariaLabel={t("toplists.players.avgMode.aria", "Player average mode")}
            baseLabel={t("toplists.players.avgMode.base", "Base")}
            totalLabel={t("toplists.players.avgMode.total", "Total")}
            updatingLabel={t("toplists.players.avgMode.updating", "Updating...")}
          />,
          playerAvgModeSlot
        )}
      {!localLayout && compareMode !== "off" && activeCompareError && (
        <div style={{ fontSize: 12, color: "#ffb347" }}>
          {activeCompareError}
        </div>
      )}
      {effectivePlayerScopeStatus && (
        <div style={{ opacity: 0.75, fontSize: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <span>
            {t("toplists.players.scope.summary", "Scope {{scopeId}} - {{changes}}/{{minChanges}} changes since last rebuild", {
              scopeId: effectivePlayerScopeStatus.scopeId,
              changes: effectivePlayerScopeStatus.changesSinceLastRebuild,
              minChanges: effectivePlayerScopeStatus.minChanges ?? "?",
            })}
          </span>
          <span>
            {t("toplists.players.scope.autoRebuild", "Auto rebuild at {{minChanges}} changes or after {{maxAgeDays}} days", {
              minChanges: effectivePlayerScopeStatus.minChanges ?? "?",
              maxAgeDays: effectivePlayerScopeStatus.maxAgeDays ?? "?",
            })}
          </span>
          <span>
            {t("toplists.players.scope.lastRebuild", "Last rebuild: {{value}}", {
              value: fmtDateObj(effectivePlayerScopeStatus.lastRebuildAt),
            })}
          </span>
        </div>
      )}

      {hasServers && effectivePlayerError && !localLayout && (
        <div style={{ border: "1px solid #2C4A73", borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{t("toplists.status.error", "Error")}</div>
          <div style={{ wordBreak: "break-all" }}>{effectivePlayerError}</div>
          <button
            onClick={() => navigate(`${location.pathname}${location.search}${location.hash}`)}
            style={{ marginTop: 8 }}
          >
            {t("toplists.actions.retry", "Retry")}
          </button>
        </div>
      )}

      {!hasServers ? (
        <div style={{ padding: 12, color: "#B0C4D9" }}>
          {t("toplists.players.selectServerHint", "Please select at least one server.")}
        </div>
      ) : isCompactToplistView ? (
        renderMobileAccordion()
      ) : (
        <>
          <div
            ref={tableRef}
            className="toplists-table-viewport"
            data-toplists-export-root="true"
            style={{ flex: isPresetRender ? "0 0 auto" : "1 1 auto", minHeight: 0, overflow: isPresetRender ? "visible" : undefined, ...(localColumns ? (isPresetRender ? { width: Number(tableStyle.width) } : { overflowX: "auto" }) : {}) }}
          >
            <div className="toplists-table-header" style={{ paddingRight: isPresetRender ? 0 : tableScrollbarWidth, ...(localColumns ? { minWidth: Number(tableStyle.width) + (isPresetRender ? 0 : tableScrollbarWidth) } : {}) }}>
              {renderToplistHeader()}
            </div>
            <div
              ref={tableScrollRef}
              className="toplists-table-scroll"
              data-toplists-export-scroll="true"
              style={{ ...(isPresetRender ? { overflow: "visible", maxHeight: "none", flex: "0 0 auto" } : rowWindow ? { minHeight: 160, maxHeight: "65vh", overflowY: "auto" as const } : localLayout ? { minHeight: 160 } : {}), ...(localColumns ? { minWidth: Number(tableStyle.width) + (isPresetRender ? 0 : tableScrollbarWidth) } : {}) }}
            >
              {renderToplistTableBody({ imgLoading: isPresetRender ? "eager" : "lazy" })}
              {hasReadOnlyData && readOnlyHasMoreRows && <div ref={readOnlyLoadMoreSentinelRef} aria-hidden style={{ height: 1 }} />}
            </div>
          </div>
        </>
      )}
    </div>
  );
});

