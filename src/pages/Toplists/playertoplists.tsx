import React, { useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import html2canvas from "html2canvas";
import { useVirtualizer } from "@tanstack/react-virtual";
import { createPortal } from "react-dom";
import ContentShell from "../../components/ContentShell";
import ProfileOverlay from "../../components/ProfileOverlay/ProfileOverlay";
import GuildProfileOverlay from "../../components/ProfileOverlay/GuildProfileOverlay";
import { useFilters, type DaysFilter } from "../../components/Filters/FilterContext";
import HudFilters from "../../components/Filters/HudFilters";
import ServerSheet from "../../components/Filters/ServerSheet";
import BottomFilterSheet from "../../components/Filters/BottomFilterSheet";
import ListSwitcher from "../../components/Filters/ListSwitcher";
import { getClassIconUrl } from "../../components/ui/shared/classIcons";
import SectionDividerHeader from "../../components/ui/shared/SectionDividerHeader";
import ToplistExportTable, { type ToplistExportRow } from "../../components/export/ToplistExportTable";
import GuildToplistExportTable from "../../components/export/GuildToplistExportTable";
import ToplistPngExportDialog, {
  type ToplistExportAmount,
  type ToplistExportSelection,
} from "../../components/export/ToplistPngExportDialog";
import NeonCoreButton from "../../components/ui/NeonCoreButton";

import { ToplistsProvider, useToplistsData, type Filters, type SortSpec } from "../../context/ToplistsDataContext";
import { useAuth } from "../../context/AuthContext";
import GuildToplists from "./guildtoplists";
import type { RegionKey } from "../../components/Filters/serverGroups";
import {
  getPlayerToplistSnapshotByDocId,
  type FirestoreLatestToplistSnapshot,
  type FirestoreToplistPlayerRow,
  type FirestoreLatestToplistResult,
} from "../../lib/api/toplistsFirestore";
import { normalizeServerKeyFromInput, parsePlayerIdentifier } from "../../lib/players/identifier";
import { formatScanDateTimeLabel } from "../../lib/ui/formatScanDateTimeLabel";
import "../../styles/Toplist.css";

const splitListParam = (value: string | null) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeServerList = (list: string[]) => {
  const set = new Set<string>();
  list.forEach((entry) => {
    const normalized = entry.trim().toUpperCase();
    if (normalized) set.add(normalized);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
};

const normalizeCompareServerKey = (value: string) => {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return "";
  const hostMatch = raw.match(/^S(\d+)(?:\.EU)?$/);
  if (hostMatch) return `EU${hostMatch[1]}`;
  const euMatch = raw.match(/^EU(\d+)$/);
  if (euMatch) return `EU${euMatch[1]}`;
  return raw;
};

const buildCompareDocId = (serverKey: string, month: string) =>
  `${normalizeCompareServerKey(serverKey)}__${month}`;
type CompareSnapshotScope = "players" | "guilds";
type ToplistsCompareMode = "off" | "progress" | "months";
type CompareSnapshotState = {
  rows: FirestoreToplistPlayerRow[];
  baselineServers: string[];
  missingServers: string[];
  error: string | null;
};
type ToplistExportKind = "players" | "guilds";
type ToplistExportSnapshot = {
  kind: ToplistExportKind;
  rows: ToplistExportRow[];
  showCompare: boolean;
};
type ToplistExportRenderState = {
  kind: ToplistExportKind;
  rows: ToplistExportRow[];
  showCompare: boolean;
  width: number;
  backgroundColor: string;
};

const COMPARE_SNAPSHOT_CACHE_PREFIX = "sf_compare_snapshot";

const normalizeCompareSnapshotServers = (servers: string[]) => {
  const set = new Set<string>();
  servers.forEach((server) => {
    const normalized = normalizeCompareServerKey(server).trim().toLowerCase();
    if (normalized) set.add(normalized);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
};

const buildCompareSnapshotCacheKey = ({
  scope,
  servers,
  month,
  mode,
}: {
  scope: CompareSnapshotScope;
  servers: string[];
  month: string;
  mode?: string;
}) => {
  const monthKey = String(month ?? "").trim();
  const serversKey = normalizeCompareSnapshotServers(servers).join("+");
  const modeKey = String(mode ?? "").trim();
  const modeSuffix = modeKey ? `__${modeKey.toLowerCase()}` : "";
  return `${COMPARE_SNAPSHOT_CACHE_PREFIX}__${scope}__${serversKey}__${monthKey}${modeSuffix}`;
};

const readCompareSnapshotCache = (key: string): CompareSnapshotState | null => {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const maybe = parsed as Partial<CompareSnapshotState>;
    if (!Array.isArray(maybe.rows)) return null;
    if (!Array.isArray(maybe.baselineServers)) return null;
    if (!Array.isArray(maybe.missingServers)) return null;
    if (maybe.error != null && typeof maybe.error !== "string") return null;
    return {
      rows: maybe.rows as FirestoreToplistPlayerRow[],
      baselineServers: maybe.baselineServers.map((server) => String(server || "").trim()).filter(Boolean),
      missingServers: maybe.missingServers.map((server) => String(server || "").trim()).filter(Boolean),
      error: maybe.error ?? null,
    };
  } catch {
    return null;
  }
};

const writeCompareSnapshotCache = (key: string, value: CompareSnapshotState) => {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage write errors (quota/privacy mode)
  }
};
const mergeCompareSnapshotRows = (snapshots: FirestoreLatestToplistSnapshot[]) => {
  const mergedRows: FirestoreToplistPlayerRow[] = [];
  for (const snapshot of snapshots) {
    const players = Array.isArray(snapshot.players) ? snapshot.players : [];
    for (const row of players) mergedRows.push({ ...row, server: snapshot.server || row.server });
  }
  return mergedRows;
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

const normalizeGuildIdentifierServer = (value: unknown): string => {
  const raw = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return "";
  const withoutSuffix = raw.replace(/\.(eu|net)$/, "");
  const hostMatch = withoutSuffix.match(/^s(\d+)$/);
  if (hostMatch) return `eu${hostMatch[1]}`;
  return withoutSuffix;
};

const buildGuildToplistIdentifier = (server: unknown, guildId: unknown): string | null => {
  const normalizedServer = normalizeGuildIdentifierServer(server);
  const normalizedGuildId = String(guildId ?? "").trim().toLowerCase();
  if (!normalizedServer || !normalizedGuildId) return null;
  return `${normalizedServer}__${normalizedGuildId}`;
};

const resolveDirectGuildIdFromPlayerRow = (row: FirestoreToplistPlayerRow): string | null => {
  const candidates = [
    (row as any).guildId,
    (row as any).guild_id,
    (row as any).guildIdentifier,
    (row as any).guild_identifier,
    (row as any).guild?.id,
    (row as any).value?.guildId,
    (row as any).value?.guild?.id,
    (row as any).data?.guildId,
  ];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }
  return null;
};

const normalizeFavoriteIdentifier = (value: unknown): string | null => {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw || null;
};

const resolveToplistRowIdentifier = (row: FirestoreToplistPlayerRow): string | null => {
  const candidates = [
    row.identifier,
    (row as any).original?.identifier,
    (row as any).value?.identifier,
    (row as any).data?.identifier,
    (row as any).player?.identifier,
    (row as any).value?.player?.identifier,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    if (parsePlayerIdentifier(trimmed)) return trimmed;
  }
  return null;
};

const buildPlayerFavoriteIdentifierFromRow = (row: FirestoreToplistPlayerRow): string | null => {
  return normalizeFavoriteIdentifier(resolveToplistRowIdentifier(row));
};

type ToplistColumnKey =
  | "rank"
  | "rankDelta"
  | "server"
  | "name"
  | "class"
  | "level"
  | "guild"
  | "main"
  | "con"
  | "sum"
  | "statsPerDay"
  | "ratio"
  | "mine"
  | "treasury"
  | "lastScan";

type ToplistColumnAlign = "left" | "center" | "right";

type ToplistColumnDef = {
  key: ToplistColumnKey;
  label: string;
  width: string;
  align: ToplistColumnAlign;
  hidden?: boolean;
};

const TOPLIST_COLUMNS: ReadonlyArray<ToplistColumnDef> = [
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

const TOPLIST_VISIBLE_COLUMNS = TOPLIST_COLUMNS.filter((column) => !column.hidden);
const TOPLIST_TABLE_COL_SPAN = TOPLIST_VISIBLE_COLUMNS.length;

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
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const TOPLIST_TEXT_CELL_CONTENT_STYLE: React.CSSProperties = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const TOPLIST_NAME_CELL_STACK_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "center",
  flex: "0 1 auto",
  maxWidth: "calc(100% - 30px)",
  minWidth: 0,
};

const TOPLIST_NAME_CELL_LAYOUT_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 12,
  width: "100%",
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
  marginTop: 2,
  fontSize: 11,
  lineHeight: 1.15,
  color: "var(--text-soft)",
};

const TOPLIST_FLEX_COLUMN_RIGHT_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
};

const TOPLIST_FLEX_COLUMN_CENTER_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
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
};

const TOPLIST_LAST_SCAN_LABEL_STYLE: React.CSSProperties = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const TOPLIST_CELL_STYLE_BY_KEY = TOPLIST_COLUMNS.reduce((acc, column) => {
  acc[column.key] = { ...TOPLIST_CELL_BASE_STYLE, textAlign: column.align };
  return acc;
}, {} as Record<ToplistColumnKey, React.CSSProperties>);

const listEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));
const formatMonth = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
const parseMonthKeyUtc = (value: string): Date | null => {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
};
const getDaysBetweenMonthKeys = (fromMonth: string, toMonth: string): number | null => {
  const from = parseMonthKeyUtc(fromMonth);
  const to = parseMonthKeyUtc(toMonth);
  if (!from || !to) return null;
  const diffDays = Math.round(Math.abs(to.getTime() - from.getTime()) / MS_PER_DAY);
  return Math.max(1, diffDays || 1);
};

const generateRecentMonths = (count: number) => {
  const months: string[] = [];
  const cursor = new Date();
  // Only include fully completed months: start from previous month.
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  for (let i = 0; i < count; i++) {
    months.push(formatMonth(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  return months;
};

const MIN_COMPARE_MONTH = "2026-01";
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

const toNumberSafe = (value: any): number | null => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const normalizeServerCode = (value: string) => value.trim().toUpperCase();
const normalizeClass = (value: string | null | undefined) =>
  value != null
    ? value
        .toLowerCase()
        .trim()
        .replace(/[\s_]+/g, "-")
        .replace(/-+/g, "-")
    : "";
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
const toMsFromLastScan = (value: string | number | null | undefined): number | null => {
  if (value == null) return null;
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{10,13}$/.test(raw)) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return n < 1e12 ? n * 1000 : n;
  }
  return parseLastScanString(raw);
};
const formatLastScanDisplay = (value: string | number | null | undefined): string => {
  return formatScanDateTimeLabel(value);
};
const deriveRatioMain = (main: number | null, con: number | null) => {
  const m = typeof main === "number" && Number.isFinite(main) ? main : 0;
  const c = typeof con === "number" && Number.isFinite(con) ? con : 0;
  const total = m + c;
  if (!(total > 0)) return null;
  return Math.round((m / total) * 100);
};
const computeStatsDay = (
  current: FirestoreToplistPlayerRow | null | undefined,
  baseline: FirestoreToplistPlayerRow | null | undefined,
  sumDeltaOverride?: number | null,
  daysOverride?: number | null,
  sumField: "sum" | "sumTotal" = "sum",
) => {
  if (!current || !baseline) return { days: null as number | null, perDay: null as number | null };
  let days: number | null = null;
  if (typeof daysOverride === "number" && Number.isFinite(daysOverride) && daysOverride > 0) {
    days = Math.max(1, Math.round(daysOverride));
  } else {
    const currentMs = toMsFromLastScan((current as any).lastScan);
    const baselineMs = toMsFromLastScan((baseline as any).lastScan);
    if (currentMs == null || baselineMs == null) {
      return { days: null as number | null, perDay: null as number | null };
    }
    const daysRaw = Math.abs(currentMs - baselineMs) / MS_PER_DAY;
    days = Math.max(1, Math.round(daysRaw));
  }
  let sumDelta = sumDeltaOverride;
  if (sumDelta == null) {
    const currSum = toNumberSafe((current as any)[sumField]);
    const prevSum = toNumberSafe((baseline as any)[sumField]);
    if (prevSum != null) {
      sumDelta = (currSum ?? 0) - prevSum;
    }
  }
  const perDay = sumDelta != null ? Math.round(sumDelta / days) : null;
  return { days, perDay };
};
const buildTieKey = (row: FirestoreToplistPlayerRow) => {
  const serverKey = normalizeServerCode(String(row.server ?? ""));
  const identifier = resolveToplistRowIdentifier(row);
  const idKey = String(identifier ?? row.name ?? "").trim();
  const classKey = String(row.class ?? "").trim();
  return `${serverKey}__${idKey}__${classKey}`;
};
const filterToplistRows = (rows: FirestoreToplistPlayerRow[], filters: Filters) => {
  const serverFilter = Array.isArray(filters.servers) ? filters.servers : [];
  const serverSet = serverFilter.length ? new Set(serverFilter.map(normalizeServerCode)) : null;
  const classFilter = Array.isArray(filters.classes) ? filters.classes : [];
  const classSet = classFilter.length ? new Set(classFilter.map(normalizeClass)) : null;
  const rangeDays = filters.timeRange === "all" ? null : Number(String(filters.timeRange).replace("d", ""));
  const cutoffMs = rangeDays && Number.isFinite(rangeDays) ? Date.now() - rangeDays * 86400000 : null;

  return rows.filter((row) => {
    if (serverSet && !serverSet.has(normalizeServerCode(String(row.server ?? "")))) return false;
    if (classSet && !classSet.has(normalizeClass(row.class))) return false;
    if (cutoffMs != null) {
      const lastScanMs = toMsFromLastScan(row.lastScan);
      if (lastScanMs != null && lastScanMs < cutoffMs) return false;
    }
    return true;
  });
};
const sortToplistRows = (rows: FirestoreToplistPlayerRow[], sort: SortSpec) => {
  const compareNumber = (aVal: number | null, bVal: number | null) => {
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    const diff = aVal - bVal;
    return sort.dir === "asc" ? diff : -diff;
  };
  const compareText = (aVal: string | null, bVal: string | null) => {
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    const diff = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: "base" });
    return sort.dir === "asc" ? diff : -diff;
  };
  const compareTie = (a: FirestoreToplistPlayerRow, b: FirestoreToplistPlayerRow) => {
    const cmp = buildTieKey(a).localeCompare(buildTieKey(b), undefined, { numeric: true, sensitivity: "base" });
    return sort.dir === "asc" ? cmp : -cmp;
  };

  rows.sort((a, b) => {
    let result = 0;
    switch (sort.key) {
      case "name": {
        const aName = String(a.name ?? "");
        const bName = String(b.name ?? "");
        const cmp = aName.localeCompare(bName, undefined, { sensitivity: "base" });
        result = sort.dir === "asc" ? cmp : -cmp;
        break;
      }
      case "lastScan": {
        const aMs = toMsFromLastScan(a.lastScan);
        const bMs = toMsFromLastScan(b.lastScan);
        result = compareNumber(aMs == null ? null : aMs, bMs == null ? null : bMs);
        break;
      }
      case "main":
        result = compareNumber(a.main, b.main);
        break;
      case "con":
        result = compareNumber(a.con, b.con);
        break;
      case "sum":
        result = compareNumber((a as any)._calculatedSum, (b as any)._calculatedSum);
        break;
      case "statsDay":
        result = compareNumber((a as any)._statsPerDayBase ?? (a as any)._statsPerDay, (b as any)._statsPerDayBase ?? (b as any)._statsPerDay);
        break;
      case "statsDayTotal":
        result = compareNumber((a as any)._statsPerDayTotal, (b as any)._statsPerDayTotal);
        break;
      case "ratio":
        result = compareNumber((a as any)._ratioMain, (b as any)._ratioMain);
        break;
      case "mine":
        result = compareNumber(a.mine, b.mine);
        break;
      case "treasury":
        result = compareNumber(a.treasury, b.treasury);
        break;
      case "mainTotal":
        result = compareNumber(a.mainTotal, b.mainTotal);
        break;
      case "conTotal":
        result = compareNumber(a.conTotal, b.conTotal);
        break;
      case "sumTotal":
        result = compareNumber(a.sumTotal, b.sumTotal);
        break;
      case "xpProgress":
        result = compareNumber(a.xpProgress, b.xpProgress);
        break;
      case "xpTotal":
        result = compareNumber(a.xpTotal, b.xpTotal);
        break;
      case "level":
      default:
        result = compareNumber(a.level, b.level);
        break;
    }
    if (result !== 0) return result;
    return compareTie(a, b);
  });

  return rows;
};
type CellDecor = {
  mainRank?: number;
  conRank?: number;
  levelRank?: number;
  mineTier?: 1 | 2 | 3 | 4;
};

const MAIN_RANK_COLORS = ["#f6e7a6", "#f4de89", "#f2d56d", "#f0cc51", "#edc236"];
const CON_RANK_COLORS = ["#ffe4b3", "#ffdda0", "#ffd68d", "#ffcf7a", "#ffc867"];
const LEVEL_RANK_COLORS = ["#9ec5ff", "#8ab7ff", "#76a9ff", "#629bff", "#4e8dff"];
const MINE_TIER_COLORS: Record<number, string> = {
  1: "#d8b4fe",
  2: "#c084fc",
  3: "#a855f7",
  4: "#f472b6",
};
const getRankTone = (rank: number | undefined, palette: string[]) =>
  rank && rank > 0 && rank <= palette.length ? palette[rank - 1] : null;
const getMineTone = (tier: number | undefined) =>
  tier ? MINE_TIER_COLORS[tier] ?? null : null;
const getFrameStyle = (color?: string | null): React.CSSProperties | undefined =>
  color
    ? {
        boxShadow: `inset 0 0 0 1px ${color}`,
        borderRadius: 6,
        padding: "0 4px",
        display: "inline-flex",
        alignItems: "center",
      }
    : undefined;

function ValueCrossfade({
  value,
  fadeKey,
  durationMs = 200,
  minWidthCh = 9,
}: {
  value: string | number;
  fadeKey: string;
  durationMs?: number;
  minWidthCh?: number;
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
      <span style={{ display: "inline-block", minWidth: `${minWidthCh}ch`, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
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
        textAlign: "right",
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
}: {
  mode: "base" | "total";
  updating: boolean;
  onChange: (nextMode: "base" | "total") => void;
  label: string;
  ariaLabel: string;
  baseLabel: string;
  totalLabel: string;
  updatingLabel: string;
}) {
  return (
    <>
      <span style={{ color: "#B0C4D9", fontSize: 12 }}>{label}</span>
      <div
        role="group"
        aria-label={ariaLabel}
        style={{ display: "inline-flex", gap: 4, background: "#14273E", border: "1px solid #2B4C73", padding: 4, borderRadius: 12 }}
      >
        <button
          type="button"
          aria-pressed={mode === "base"}
          onClick={() => onChange("base")}
          style={{
            background: mode === "base" ? "#25456B" : "transparent",
            border: `1px solid ${mode === "base" ? "#5C8BC6" : "transparent"}`,
            color: "#F5F9FF",
            borderRadius: 10,
            padding: "6px 10px",
            cursor: "pointer",
          }}
        >
          {baseLabel}
        </button>
        <button
          type="button"
          aria-pressed={mode === "total"}
          onClick={() => onChange("total")}
          style={{
            background: mode === "total" ? "#25456B" : "transparent",
            border: `1px solid ${mode === "total" ? "#5C8BC6" : "transparent"}`,
            color: "#F5F9FF",
            borderRadius: 10,
            padding: "6px 10px",
            cursor: "pointer",
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

const DEFAULT_GUILD_SORT = "guildAvgLevel";
const GUILD_SORT_KEYS = new Set([
  "guildMembers",
  "guildAvgLevel",
  "guildAvgMain",
  "guildAvgCon",
  "guildAvgSum",
  "guildRaids",
  "guildHydra",
]);
const resolveGuildSort = (value: string | null | undefined) =>
  GUILD_SORT_KEYS.has(String(value ?? "").trim()) ? String(value).trim() : DEFAULT_GUILD_SORT;
let PLAYER_AVG_MODE_CACHE: "base" | "total" = "base";

function deriveGroupFromServers(servers: string[]): string {
  const first = (servers[0] || "").toUpperCase();
  if (first.startsWith("EU")) return "EU";
  if (first.startsWith("US") || first.startsWith("NA") || first.startsWith("AM")) return "US";
  if (first.startsWith("F")) return "FUSION";
  if (first) return "INT";
  return "EU";
}

const resolveExportBackground = (tableRoot: HTMLElement) => {
  let node: HTMLElement | null = tableRoot;
  while (node) {
    const color = window.getComputedStyle(node).backgroundColor;
    if (color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)") {
      return color;
    }
    node = node.parentElement;
  }
  return "#0C1C2E";
};

const waitForAnimationFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const waitForImagesInNode = async (node: HTMLElement) => {
  const images = Array.from(node.querySelectorAll<HTMLImageElement>("img"));
  const pending = images.filter((img) => !img.complete);
  if (!pending.length) return;

  await Promise.all(
    pending.map(
      (img) =>
        new Promise<void>((resolve) => {
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        })
    )
  );
};

const deriveExportGuildNames = (rows: ToplistExportRow[]) => {
  const map = new Map<string, string>();
  rows.forEach((row) => {
    const name = String(row.guild ?? "").trim();
    if (!name) return;
    const key = normalizeGuildKey(name);
    if (!key || map.has(key)) return;
    map.set(key, name);
  });
  return Array.from(map.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
};

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function PlayerToplistsPage() {
  return (
    <ToplistsProvider>
      <PlayerToplistsPageContent />
    </ToplistsProvider>
  );
}

function PlayerToplistsPageContent() {
  const { t } = useTranslation();
  const filterCollapseStorageKey = "sf_toplists_hud_filters_collapsed_v1";
  const f = useFilters(); // MUSS innerhalb FilterProvider laufen
  const {
    filterMode, setFilterMode,
    listView, setListView,
    bottomFilterOpen, setBottomFilterOpen,
    serverSheetOpen, setServerSheetOpen,
    servers, setServers,
    classes, setClasses,
    setGuilds,
    range,
    sortBy,
    setSortBy,
  } = f;
  const { serverGroups, player } = useToplistsData();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const serverParam = searchParams.get("server");
  const serversParam = searchParams.get("servers");
  const classParam = searchParams.get("class");
  const classesParam = searchParams.get("classes");
  const tabParam = searchParams.get("tab");
  const focusParamRaw = searchParams.get("focus");
  const focusIdentifierParam = focusParamRaw?.trim() ? focusParamRaw.trim() : null;
  const rankParamRaw = searchParams.get("rank");
  const focusRankParam = React.useMemo(() => {
    if (!rankParamRaw) return null;
    const parsed = Number(rankParamRaw);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(1, Math.trunc(parsed));
  }, [rankParamRaw]);
  const activeTab = tabParam === "guilds" ? "guilds" : "players";
  const setActiveTab = React.useCallback((next: "players" | "guilds") => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", next);
    setSearchParams(nextParams);
  }, [searchParams, setSearchParams]);
  const [guildSortBy, setGuildSortBy] = React.useState<string>(DEFAULT_GUILD_SORT);
  const initialProgressCompareMonth = searchParams.get("compare") ?? "";
  const initialCompareModeParam = String(searchParams.get("compareMode") ?? "").trim().toLowerCase();
  const [compareMode, setCompareMode] = React.useState<ToplistsCompareMode>(() => {
    if (initialCompareModeParam === "months") return "months";
    if (initialCompareModeParam === "progress") return "progress";
    return initialProgressCompareMonth ? "progress" : "off";
  });
  const [progressSinceMonth, setProgressSinceMonth] = React.useState<string>(initialProgressCompareMonth);
  const [compareFromMonth, setCompareFromMonth] = React.useState<string>(searchParams.get("compareFrom") ?? "");
  const [compareToMonth, setCompareToMonth] = React.useState<string>(searchParams.get("compareTo") ?? "");
  const [filtersCollapsed, setFiltersCollapsed] = React.useState<boolean>(() => {
    try {
      if (typeof localStorage === "undefined") return false;
      return localStorage.getItem(filterCollapseStorageKey) === "1";
    } catch {
      return false;
    }
  });
  const monthOptions = React.useMemo(
    () => {
      // Keep completed months, but also allow selecting the current month for freshly generated backfill snapshots.
      const currentMonth = formatMonth(new Date());
      return Array.from(new Set([currentMonth, ...generateRecentMonths(17)])).filter((m) => m >= MIN_COMPARE_MONTH);
    },
    [],
  );
  const normalizeCompareMonthPair = React.useCallback((from: string, to: string) => {
    const nextFrom = String(from ?? "").trim();
    const nextTo = String(to ?? "").trim();
    if (nextFrom && nextTo && nextFrom > nextTo) {
      return { from: nextTo, to: nextFrom };
    }
    return { from: nextFrom, to: nextTo };
  }, []);
  const resolveDefaultCompareMonths = React.useCallback(() => {
    const latest = monthOptions[0] ?? "";
    if (!latest) return { from: "", to: "" };
    const latestIdx = monthOptions.indexOf(latest);
    const previous = latestIdx >= 0 ? (monthOptions[latestIdx + 1] ?? latest) : (monthOptions[1] ?? latest);
    return normalizeCompareMonthPair(previous, latest);
  }, [monthOptions, normalizeCompareMonthPair]);
  const isValidCompareMonth = React.useCallback(
    (value: string) => {
      const normalized = String(value ?? "").trim();
      return normalized.length > 0 && monthOptions.includes(normalized);
    },
    [monthOptions]
  );
  const handleCompareModeChange = React.useCallback((nextMode: ToplistsCompareMode) => {
    setCompareMode(nextMode);
    if (nextMode === "off") {
      setProgressSinceMonth("");
      setCompareFromMonth("");
      setCompareToMonth("");
      return;
    }
    if (nextMode === "progress") {
      setCompareFromMonth("");
      setCompareToMonth("");
      return;
    }
    setProgressSinceMonth("");
    const fallback = resolveDefaultCompareMonths();
    const nextToCandidate = isValidCompareMonth(compareToMonth) ? compareToMonth : fallback.to;
    const nextFromCandidate = isValidCompareMonth(compareFromMonth) ? compareFromMonth : fallback.from;
    const normalized = normalizeCompareMonthPair(nextFromCandidate, nextToCandidate);
    setCompareFromMonth(normalized.from);
    setCompareToMonth(normalized.to);
  }, [
    compareFromMonth,
    compareToMonth,
    isValidCompareMonth,
    normalizeCompareMonthPair,
    resolveDefaultCompareMonths,
  ]);

  React.useEffect(() => {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(filterCollapseStorageKey, filtersCollapsed ? "1" : "0");
    } catch {
      // ignore storage write errors
    }
  }, [filterCollapseStorageKey, filtersCollapsed]);
  const handleProgressSinceMonthChange = React.useCallback((value: string) => {
    const nextValue = String(value ?? "").trim();
    setProgressSinceMonth(nextValue);
    if (!nextValue) {
      setCompareMode("off");
    }
  }, []);
  const handleCompareFromMonthChange = React.useCallback((value: string) => {
    const nextFromRaw = String(value ?? "").trim();
    setCompareFromMonth((prevFrom) => {
      void prevFrom;
      const normalized = normalizeCompareMonthPair(nextFromRaw, compareToMonth);
      if (normalized.to !== compareToMonth) {
        setCompareToMonth(normalized.to);
      }
      return normalized.from;
    });
  }, [compareToMonth, normalizeCompareMonthPair]);
  const handleCompareToMonthChange = React.useCallback((value: string) => {
    const nextToRaw = String(value ?? "").trim();
    setCompareToMonth((prevTo) => {
      void prevTo;
      const normalized = normalizeCompareMonthPair(compareFromMonth, nextToRaw);
      if (normalized.from !== compareFromMonth) {
        setCompareFromMonth(normalized.from);
      }
      return normalized.to;
    });
  }, [compareFromMonth, normalizeCompareMonthPair]);
  React.useEffect(() => {
    if (compareMode !== "months") return;
    const fallback = resolveDefaultCompareMonths();
    const nextToCandidate = isValidCompareMonth(compareToMonth) ? compareToMonth : fallback.to;
    const nextFromCandidate = isValidCompareMonth(compareFromMonth) ? compareFromMonth : fallback.from;
    const normalized = normalizeCompareMonthPair(nextFromCandidate, nextToCandidate);
    if (normalized.from !== compareFromMonth) setCompareFromMonth(normalized.from);
    if (normalized.to !== compareToMonth) setCompareToMonth(normalized.to);
  }, [
    compareMode,
    compareFromMonth,
    compareToMonth,
    isValidCompareMonth,
    normalizeCompareMonthPair,
    resolveDefaultCompareMonths,
  ]);
  const hasServersSelected = (servers?.length ?? 0) > 0;
  const normalizedServers = React.useMemo(() => normalizeServerList(servers ?? []), [servers]);
  const normalizedClasses = React.useMemo(() => normalizeClassList(classes ?? []), [classes]);

  const urlServers = React.useMemo(() => {
    const raw = serverParam ?? serversParam;
    return normalizeServerList(splitListParam(raw));
  }, [serverParam, serversParam]);
  const urlClasses = React.useMemo(() => {
    const raw = classParam ?? classesParam;
    return normalizeClassList(splitListParam(raw));
  }, [classParam, classesParam]);

  const urlServersProvided = serverParam != null || serversParam != null;
  const urlClassesProvided = classParam != null || classesParam != null;

  const searchKey = React.useMemo(() => searchParams.toString(), [searchParams]);
  const normalizedServersKey = normalizedServers.join(",");
  const normalizedClassesKey = normalizedClasses.join(",");
  const urlServersKey = urlServers.join(",");
  const urlClassesKey = urlClasses.join(",");
  const prevServersKeyRef = React.useRef<string | null>(null);

  const normalizedServersRef = React.useRef(normalizedServers);
  const normalizedClassesRef = React.useRef(normalizedClasses);
  const setServersRef = React.useRef(setServers);
  const setClassesRef = React.useRef(setClasses);
  const lastUrlWriteRef = React.useRef<string | null>(null);
  const prevUrlSyncedServersKeyRef = React.useRef<string | null>(null);
  const tableRef = React.useRef<HTMLDivElement | null>(null);
  const tableExportSnapshotRef = React.useRef<ToplistExportSnapshot>({
    kind: "players",
    rows: [],
    showCompare: false,
  });
  const exportNodeRef = React.useRef<HTMLDivElement | null>(null);
  const [isExportDialogOpen, setIsExportDialogOpen] = React.useState(false);
  const [exportAmount, setExportAmount] = React.useState<ToplistExportAmount>(50);
  const [exportSelection, setExportSelection] = React.useState<ToplistExportSelection>("current");
  const [exportSelectedGuilds, setExportSelectedGuilds] = React.useState<string[]>([]);
  const [exportRangeEnabled, setExportRangeEnabled] = React.useState(false);
  const [exportRangeFrom, setExportRangeFrom] = React.useState(1);
  const [exportRangeTo, setExportRangeTo] = React.useState(50);
  const [exportDialogKind, setExportDialogKind] = React.useState<ToplistExportKind>("players");
  const [exportDialogRows, setExportDialogRows] = React.useState<ToplistExportRow[]>([]);
  const [exportDialogShowCompare, setExportDialogShowCompare] = React.useState(false);
  const [exportGuildOptions, setExportGuildOptions] = React.useState<string[]>([]);
  const [exportRenderState, setExportRenderState] = React.useState<ToplistExportRenderState | null>(null);
  const [exportRenderKey, setExportRenderKey] = React.useState(0);
  const [exportNonce, setExportNonce] = React.useState(0);
  const [isExportingPng, setIsExportingPng] = React.useState(false);
  const buildExportBaseRows = React.useCallback(
    (selection: ToplistExportSelection, selectedGuilds: string[]) => {
      if (selection !== "guilds") return exportDialogRows;
      if (!selectedGuilds.length) return [];
      const selectedGuildKeySet = new Set(selectedGuilds.map((entry) => normalizeGuildKey(entry)).filter(Boolean));
      return exportDialogRows.filter((row) => {
        const key = normalizeGuildKey(row.guild);
        return key ? selectedGuildKeySet.has(key) : false;
      });
    },
    [exportDialogRows]
  );
  const exportBaseRows = React.useMemo(
    () => buildExportBaseRows(exportSelection, exportSelectedGuilds),
    [buildExportBaseRows, exportSelection, exportSelectedGuilds]
  );
  const exportAvailableCount = exportBaseRows.length;
  const exportRangeMax = Math.max(1, exportAvailableCount);
  const exportRangeFromClamped = clampNumber(
    Number.isFinite(exportRangeFrom) ? exportRangeFrom : 1,
    1,
    exportRangeMax
  );
  const exportRangeToClamped = clampNumber(
    Number.isFinite(exportRangeTo) ? exportRangeTo : exportRangeFromClamped,
    exportRangeFromClamped,
    exportRangeMax
  );

  const openExportDialog = () => {
    const snapshot = tableExportSnapshotRef.current;
    const snapshotRows = Array.isArray(snapshot.rows) ? [...snapshot.rows] : [];
    setExportDialogKind(snapshot.kind);
    setExportDialogRows(snapshotRows);
    setExportDialogShowCompare(Boolean(snapshot.showCompare));
    setExportGuildOptions(deriveExportGuildNames(snapshotRows));
    setExportAmount(50);
    setExportSelection("current");
    setExportSelectedGuilds([]);
    setExportRangeEnabled(false);
    setExportRangeFrom(1);
    setExportRangeTo(50);
    setIsExportDialogOpen(true);
  };

  const handleToggleExportGuild = (guildName: string) => {
    setExportSelectedGuilds((prev) =>
      prev.includes(guildName) ? prev.filter((entry) => entry !== guildName) : [...prev, guildName]
    );
  };
  const handleExportAmountChange = (value: ToplistExportAmount) => {
    setExportAmount(value);
    if (!exportRangeEnabled) return;
    const nextTo = clampNumber(exportRangeFromClamped + (value - 1), exportRangeFromClamped, exportRangeMax);
    setExportRangeTo(nextTo);
  };
  const handleExportSelectionChange = (value: ToplistExportSelection) => {
    setExportSelection(value);
  };
  const handleExportRangeEnabledChange = (enabled: boolean) => {
    setExportRangeEnabled(enabled);
    if (!enabled) return;
    const from = exportRangeFromClamped;
    setExportRangeFrom(from);
    const nextTo = clampNumber(from + (exportAmount - 1), from, exportRangeMax);
    setExportRangeTo(nextTo);
  };
  const handleExportRangeFromChange = (value: number) => {
    const nextFrom = clampNumber(Number.isFinite(value) ? Math.trunc(value) : 1, 1, exportRangeMax);
    setExportRangeFrom(nextFrom);
    setExportRangeTo((prev) => {
      const prevNum = Number.isFinite(prev) ? prev : nextFrom;
      return clampNumber(prevNum, nextFrom, exportRangeMax);
    });
  };
  const handleExportRangeToChange = (value: number) => {
    const nextTo = clampNumber(
      Number.isFinite(value) ? Math.trunc(value) : exportRangeFromClamped,
      exportRangeFromClamped,
      exportRangeMax
    );
    setExportRangeTo(nextTo);
  };

  const handleConfirmExportPng = async () => {
    if (typeof document === "undefined") return;
    const tableRoot = tableRef.current;
    if (!tableRoot || isExportingPng) return;
    const baseRows = exportBaseRows;
    if (baseRows.length === 0) return;

    let rowsForExport: ToplistExportRow[] = [];
    if (exportRangeEnabled) {
      const rawFrom = Number.isFinite(exportRangeFrom) ? Math.trunc(exportRangeFrom) : 1;
      const rawTo = Number.isFinite(exportRangeTo) ? Math.trunc(exportRangeTo) : rawFrom;
      const from = clampNumber(rawFrom, 1, baseRows.length);
      const to = clampNumber(rawTo, from, baseRows.length);
      rowsForExport = baseRows.slice(from - 1, to);
    } else {
      rowsForExport = baseRows.slice(0, exportAmount);
    }
    const width = Math.max(1, Math.round(tableRoot.getBoundingClientRect().width || tableRoot.offsetWidth || 1));
    const backgroundColor = resolveExportBackground(tableRoot);
    const nextExportNonce = exportNonce + 1;
    const nextExportRenderKey = exportRenderKey + 1;

    setIsExportingPng(true);
    setExportNonce(nextExportNonce);
    setExportRenderKey(nextExportRenderKey);
    setExportRenderState({
      kind: exportDialogKind,
      rows: rowsForExport,
      showCompare: exportDialogShowCompare,
      width,
      backgroundColor,
    });

    try {
      await waitForAnimationFrame();
      await waitForAnimationFrame();
      const exportNode = exportNodeRef.current;
      if (!exportNode) return;
      await waitForImagesInNode(exportNode);

      const canvas = await html2canvas(exportNode, {
        backgroundColor,
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        imageTimeout: 15000,
      });

      await new Promise<void>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              console.error("[export] Failed to create PNG blob");
              reject(new Error("Failed to create PNG blob"));
              return;
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.download = "sfdatahub_toplist.png";
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
            resolve();
          },
          "image/png",
          1,
        );
      });
      setIsExportDialogOpen(false);
    } finally {
      setExportRenderState(null);
      setIsExportingPng(false);
    }
  };

  React.useEffect(() => {
    normalizedServersRef.current = normalizedServers;
  }, [normalizedServers]);

  React.useEffect(() => {
    normalizedClassesRef.current = normalizedClasses;
  }, [normalizedClasses]);

  React.useEffect(() => {
    setServersRef.current = setServers;
  }, [setServers]);

  React.useEffect(() => {
    setClassesRef.current = setClasses;
  }, [setClasses]);

  React.useEffect(() => {
    const prevKey = prevServersKeyRef.current;
    prevServersKeyRef.current = normalizedServersKey;
    if (prevKey != null && prevKey !== normalizedServersKey) {
      setGuilds([]);
    }
  }, [normalizedServersKey, setGuilds]);

  useEffect(() => {
    if (lastUrlWriteRef.current === searchKey) {
      lastUrlWriteRef.current = null;
      return;
    }

    if (urlServersProvided) {
      const nextServers = urlServers;
      if (!listEqual(normalizedServersRef.current, nextServers)) {
        setServersRef.current(nextServers);
      }
    }

    if (urlClassesProvided && !listEqual(normalizedClassesRef.current, urlClasses)) {
      setClassesRef.current(urlClasses);
    }
  }, [
    searchKey,
    urlServersProvided,
    urlClassesProvided,
    urlServersKey,
    urlClassesKey,
  ]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    const nextServers = normalizedServersKey;
    const nextClasses = normalizedClassesKey;
    const prevServersKey = prevUrlSyncedServersKeyRef.current;
    const serverSelectionChanged = prevServersKey != null && prevServersKey !== nextServers;
    prevUrlSyncedServersKeyRef.current = nextServers;

    if (nextServers) {
      nextParams.set("server", nextServers);
    } else {
      nextParams.delete("server");
    }
    nextParams.delete("servers");

    if (nextClasses) {
      nextParams.set("class", nextClasses);
    } else {
      nextParams.delete("class");
    }
    nextParams.delete("classes");

    // Focus deep-link should apply once. When server selection changes, clear it to avoid repeated re-highlighting.
    if (serverSelectionChanged) {
      nextParams.delete("focus");
      nextParams.delete("rank");
    }

    const nextKey = nextParams.toString();
    if (nextKey !== searchKey) {
      lastUrlWriteRef.current = nextKey;
      setSearchParams(nextParams, { replace: true });
    }
  }, [normalizedServersKey, normalizedClassesKey, searchKey, searchParams, setSearchParams]);

  const guildOptions = React.useMemo(() => {
    const rows = Array.isArray(player?.rows) ? player.rows : [];
    if (!rows.length) return [];
    const map = new Map<string, { value: string; label: string }>();
    rows.forEach((row) => {
      const name = String(row.guild ?? "").trim();
      if (!name) return;
      const key = normalizeGuildKey(name);
      if (!key) return;
      const serverCode =
        (row.server && String(row.server).trim().toUpperCase()) ||
        (normalizedServers.length === 1 ? normalizedServers[0] : "");
      const label = serverCode ? `${name} (${serverCode})` : name;
      if (!map.has(key)) {
        map.set(key, { value: name, label });
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
  }, [player?.rows, normalizedServers]);

  React.useEffect(() => {
    setGuildSortBy((prev) => resolveGuildSort(prev));
  }, []);
  const resolvedGuildSortBy = React.useMemo(() => resolveGuildSort(guildSortBy), [guildSortBy]);
  return (
    <>
      <ContentShell
        mode="card"
        leftWidth={0}
        rightWidth={0}
        subheader={
          filterMode === "hud" ? (
            <>
              <SectionDividerHeader title={t("toplists.headerLabel", "Toplists")} />
              <div className="mt-2 pb-3 grid grid-cols-[auto_auto_auto] justify-center items-center gap-6">
                <TopTab active={activeTab === "players"} onClick={() => setActiveTab("players")} label={t("nav.players", "Players")} />
                <button
                  type="button"
                  className="flex flex-col items-center justify-center gap-0.5 py-1 px-2"
                  style={{ transform: "translateY(50%)" }}
                  onClick={() => setFiltersCollapsed((prev) => !prev)}
                  aria-expanded={!filtersCollapsed}
                  aria-controls="toplists-hud-filters"
                  aria-label={
                    filtersCollapsed
                      ? t("toplists.filters.showHud", "Show filters")
                      : t("toplists.filters.hideHud", "Hide filters")
                  }
                >
                  <span style={{ color: "#B0C4D9", fontSize: 11, lineHeight: 1 }}>
                    {filtersCollapsed
                      ? t("toplists.filters.showHud", "Show filters")
                      : t("toplists.filters.hideHud", "Hide filters")}
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-4 w-4 transition-transform duration-200"
                    style={{
                      color: "#B0C4D9",
                      transform: filtersCollapsed ? "rotate(0deg)" : "rotate(180deg)",
                    }}
                  >
                    <path
                      d="M6 9l6 6 6-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <TopTab active={activeTab === "guilds"} onClick={() => setActiveTab("guilds")} label={t("nav.guilds", "Guilds")} />
              </div>
              {!filtersCollapsed && (
                <div id="toplists-hud-filters" className="mt-2">
                  <HudFilters
                    mode={activeTab}
                    sortValue={activeTab === "guilds" ? guildSortBy : (sortBy ?? "level")}
                    onSortValueChange={activeTab === "guilds" ? setGuildSortBy : setSortBy}
                    compareMode={compareMode}
                    onCompareModeChange={handleCompareModeChange}
                    progressSinceMonth={progressSinceMonth}
                    onProgressSinceMonthChange={handleProgressSinceMonthChange}
                    compareFromMonth={compareFromMonth}
                    onCompareFromMonthChange={handleCompareFromMonthChange}
                    compareToMonth={compareToMonth}
                    onCompareToMonthChange={handleCompareToMonthChange}
                    monthOptions={monthOptions}
                    guildOptions={guildOptions}
                    onExportPng={openExportDialog}
                    exportDisabled={!hasServersSelected || (activeTab === "players" && listView !== "table")}
                  />
                </div>
              )}
            </>
          ) : null
        }
        centerFramed={false}
        stickyTopbar
        stickySubheader={false}
        topbarHeight={56}
      >
        <ListSwitcher />

        {activeTab === "players" && listView === "table" && (
          <TableDataView
            servers={servers ?? []}
            classes={classes ?? []}
            range={(range ?? "all") as any}
            sortKey={sortBy ?? "level"}
            compareMode={compareMode}
            progressSinceMonth={progressSinceMonth}
            compareFromMonth={compareFromMonth}
            compareToMonth={compareToMonth}
            showAvgModeControl={!filtersCollapsed}
            focusIdentifier={focusIdentifierParam}
            focusRank={focusRankParam}
            tableRef={tableRef}
            exportSnapshotRef={tableExportSnapshotRef}
          />
        )}
        {activeTab === "guilds" && (
          <GuildToplists
            serverCodes={servers ?? []}
            sortKey={resolvedGuildSortBy}
            showAvgModeControl={!filtersCollapsed}
            tableRef={tableRef}
            exportSnapshotRef={tableExportSnapshotRef}
          />
        )}
      </ContentShell>

      <ServerSheet
        mode="modal"
        open={serverSheetOpen}
        onClose={() => setServerSheetOpen(false)}
        serversByRegion={serverGroups}
        selected={servers}
        onToggle={(s: string) =>
          setServers((prev: string[]) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
        }
        onSelectAllInRegion={(region: RegionKey) => setServers(serverGroups[region] ?? [])}
        onClearAll={() => setServers([])}
      />

      <BottomFilterSheet
        open={filterMode === "sheet" && bottomFilterOpen}
        onClose={() => setBottomFilterOpen(false)}
      />

      <ToplistPngExportDialog
        isOpen={isExportDialogOpen}
        amount={exportAmount}
        selection={exportSelection}
        guildOptions={exportGuildOptions}
        selectedGuilds={exportSelectedGuilds}
        availableCount={exportAvailableCount}
        rangeEnabled={exportRangeEnabled}
        rangeFrom={exportRangeFromClamped}
        rangeTo={exportRangeToClamped}
        exporting={isExportingPng}
        onAmountChange={handleExportAmountChange}
        onSelectionChange={handleExportSelectionChange}
        onToggleGuild={handleToggleExportGuild}
        onRangeEnabledChange={handleExportRangeEnabledChange}
        onRangeFromChange={handleExportRangeFromChange}
        onRangeToChange={handleExportRangeToChange}
        onCancel={() => {
          if (isExportingPng) return;
          setIsExportDialogOpen(false);
        }}
        onExport={handleConfirmExportPng}
      />

      {exportRenderState && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            transform: "translate3d(-12000px, 0, 0)",
            opacity: 0,
            pointerEvents: "none",
            width: `${exportRenderState.width}px`,
            background: exportRenderState.backgroundColor,
            padding: 0,
            margin: 0,
          }}
        >
          <div ref={exportNodeRef}>
            {exportRenderState.kind === "guilds" ? (
              <GuildToplistExportTable
                key={exportRenderKey}
                rows={exportRenderState.rows}
                width={exportRenderState.width}
              />
            ) : (
              <ToplistExportTable
                key={exportRenderKey}
                rows={exportRenderState.rows}
                showCompare={exportRenderState.showCompare}
                width={exportRenderState.width}
                exportNonce={exportNonce}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function TableDataView({
  servers, classes, range, sortKey, compareMode, progressSinceMonth, compareFromMonth, compareToMonth, showAvgModeControl, focusIdentifier, focusRank, tableRef, exportSnapshotRef,
}: {
  servers: string[];
  classes: string[];
  range: DaysFilter;
  sortKey: string;
  compareMode: ToplistsCompareMode;
  progressSinceMonth: string;
  compareFromMonth: string;
  compareToMonth: string;
  showAvgModeControl: boolean;
  focusIdentifier: string | null;
  focusRank: number | null;
  tableRef: React.RefObject<HTMLDivElement>;
  exportSnapshotRef: React.MutableRefObject<ToplistExportSnapshot>;
}) {
  const { t } = useTranslation();
  const { guilds, favoritesOnly } = useFilters();
  const { user } = useAuth();
  const {
    player,
    playerRows,
    playerLoading,
    playerError,
    playerLastUpdatedAt,
    playerScopeStatus,
    filters,
    setFilters,
    setSort,
    getGuildToplistSnapshotCached,
  } = useToplistsData();
  const navigate = useNavigate();
  const location = useLocation();

  const hasServers = (servers?.length ?? 0) > 0;
  const [playerAvgMode, setPlayerAvgMode] = React.useState<"base" | "total">(() => PLAYER_AVG_MODE_CACHE);
  const [isPlayerAvgModePending, startPlayerAvgModeTransition] = React.useTransition();
  const [showPlayerUpdating, setShowPlayerUpdating] = React.useState(false);
  const [playerAvgModeSlot, setPlayerAvgModeSlot] = React.useState<HTMLElement | null>(null);
  const playerPendingStartedAtRef = React.useRef<number | null>(null);
  const playerPendingHideTimeoutRef = React.useRef<number | null>(null);
  const playerPendingPrevRef = React.useRef(false);
  const playerSortSensitiveRef = React.useRef(new Set(["main", "constitution", "sum"]));

  const handlePlayerAvgModeChange = React.useCallback((nextMode: "base" | "total") => {
    if (nextMode === playerAvgMode) return;
    PLAYER_AVG_MODE_CACHE = nextMode;
    if (playerSortSensitiveRef.current.has(sortKey)) {
      startPlayerAvgModeTransition(() => {
        setPlayerAvgMode(nextMode);
      });
      return;
    }
    setPlayerAvgMode(nextMode);
  }, [playerAvgMode, sortKey, startPlayerAvgModeTransition]);
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
  }, [servers, classes, range, setFilters]);

  useEffect(() => {
    const s = mapSort(sortKey);
    setSort(s);
  }, [sortKey, setSort]);
  const effectiveSort = React.useMemo(
    () => mapSort(sortKey),
    [sortKey]
  );

  const formatDeWithSpaceGrouping = (value: number, options?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat("de-DE", options)
      .formatToParts(value)
      .map((part) => (part.type === "group" ? " " : part.value))
      .join("");
  const fmtNum = (n: number | null | undefined) => {
    if (n == null || !Number.isFinite(n)) return "";
    return formatDeWithSpaceGrouping(n);
  };
  const fmtDelta = (n: number | null | undefined) => {
    if (n == null) return "";
    const formatted = fmtNum(Math.abs(n));
    if (!formatted) return String(n);
    return n > 0 ? `+${formatted}` : `-${formatted}`;
  };
  const getRankDeltaDisplay = (value: number | string | null | undefined, compareMissing: boolean) => {
    if (compareMissing) {
      return { text: "n/a", variant: "na" as const };
    }
    if (value == null || value === "") {
      return { text: "n/a", variant: "na" as const };
    }
    let parsed: number | null = null;
    if (typeof value === "number") {
      parsed = value;
    } else if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed || /^n\/a$/i.test(trimmed)) {
        return { text: "n/a", variant: "na" as const };
      }
      const numeric = Number(trimmed);
      parsed = Number.isFinite(numeric) ? numeric : null;
    }
    if (parsed == null || !Number.isFinite(parsed)) {
      return { text: "n/a", variant: "na" as const };
    }
    if (parsed === 0 || Object.is(parsed, -0)) {
      return { text: "-", variant: "zero" as const };
    }
    const absText = fmtNum(Math.abs(parsed));
    const signedText = parsed > 0 ? `+${absText}` : `-${absText}`;
    return { text: signedText, variant: parsed > 0 ? "pos" as const : "neg" as const };
  };
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

  const rows = playerRows || [];
  const isCompareMonthsMode = compareMode === "months";
  const progressBaselineMonth = String(progressSinceMonth ?? "").trim();
  const compareFromMonthValue = String(compareFromMonth ?? "").trim();
  const compareToMonthValue = String(compareToMonth ?? "").trim();
  const activeBaselineCompareMonth = compareMode === "progress"
    ? progressBaselineMonth
    : compareMode === "months"
      ? compareFromMonthValue
      : "";
  const activeTargetCompareMonth = isCompareMonthsMode ? compareToMonthValue : "";
  const favoritePlayerSet = React.useMemo(() => {
    const keys = Object.keys(user?.favorites?.players ?? {});
    return new Set(keys.map((key) => key.trim().toLowerCase()).filter(Boolean));
  }, [user?.favorites?.players]);
  const selectedGuildSet = React.useMemo(() => {
    const keys = (guilds || []).map(normalizeGuildKey).filter(Boolean);
    return keys.length ? new Set(keys) : null;
  }, [guilds]);
  const hasGuildData = React.useMemo(() => {
    const rawRows = Array.isArray(player?.rows) ? player.rows : [];
    return rawRows.some((row) => Boolean(normalizeGuildKey(row.guild)));
  }, [player?.rows]);

  const filteredRows = React.useMemo(() => {
    let nextRows = rows;

    if (selectedGuildSet && hasGuildData) {
      nextRows = nextRows.filter((row) => {
        const key = normalizeGuildKey(row.guild);
        return key ? selectedGuildSet.has(key) : false;
      });
    }

    if (favoritesOnly && user) {
      nextRows = nextRows.filter((row) => {
        const identifier = buildPlayerFavoriteIdentifierFromRow(row);
        return !!(identifier && favoritePlayerSet.has(identifier));
      });
    }

    return nextRows;
  }, [rows, selectedGuildSet, hasGuildData, favoritesOnly, user, favoritePlayerSet]);

  const [searchParams, setSearchParams] = useSearchParams();
  const [compareState, setCompareState] = React.useState<{
    rows: FirestoreToplistPlayerRow[];
    loading: boolean;
    baselineServers: string[];
    missingServers: string[];
    error: string | null;
  }>({ rows: [], loading: false, baselineServers: [], missingServers: [], error: null });
  const [compareTargetState, setCompareTargetState] = React.useState<{
    rows: FirestoreToplistPlayerRow[];
    loading: boolean;
    baselineServers: string[];
    missingServers: string[];
    error: string | null;
  }>({ rows: [], loading: false, baselineServers: [], missingServers: [], error: null });

  const compareServersKey = React.useMemo(
    () => normalizeServerList(servers).join(","),
    [servers]
  );
  const compareServers = React.useMemo(
    () => (compareServersKey ? compareServersKey.split(",").filter(Boolean) : []),
    [compareServersKey]
  );
  const baselineServerSet = React.useMemo(() => {
    const normalized = (compareState.baselineServers || [])
      .map((server) => String(server).trim().toUpperCase())
      .filter(Boolean);
    return new Set(normalized);
  }, [compareState.baselineServers]);
  const compareLoading =
    compareState.loading || (isCompareMonthsMode ? compareTargetState.loading : false);
  const showCompare =
    Boolean(activeBaselineCompareMonth) &&
    (!isCompareMonthsMode || Boolean(activeTargetCompareMonth)) &&
    !compareLoading;

  // persist compare selection in URL (optional param)
  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    const normalizedMode =
      compareMode === "months"
        ? "months"
        : compareMode === "progress" && activeBaselineCompareMonth
          ? "progress"
          : "off";
    if (normalizedMode === "progress" && activeBaselineCompareMonth) {
      nextParams.set("compare", activeBaselineCompareMonth);
    } else {
      nextParams.delete("compare");
    }
    if (normalizedMode === "months") {
      nextParams.set("compareMode", "months");
      if (compareFromMonthValue) nextParams.set("compareFrom", compareFromMonthValue);
      else nextParams.delete("compareFrom");
      if (compareToMonthValue) nextParams.set("compareTo", compareToMonthValue);
      else nextParams.delete("compareTo");
    } else {
      if (normalizedMode === "progress") nextParams.set("compareMode", "progress");
      else nextParams.delete("compareMode");
      nextParams.delete("compareFrom");
      nextParams.delete("compareTo");
    }
    if (normalizedMode === "off") {
      nextParams.delete("compareMode");
    }
    const prevKey = searchParams.toString();
    const nextKey = nextParams.toString();
    if (prevKey !== nextKey) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [
    compareMode,
    activeBaselineCompareMonth,
    compareFromMonthValue,
    compareToMonthValue,
    searchParams,
    setSearchParams,
  ]);

  // Load monthly baseline snapshot(s) for comparison
  useEffect(() => {
    let cancelled = false;
    const normalizedCompareMonth = activeBaselineCompareMonth;
    const compareDisabled =
      !normalizedCompareMonth || normalizedCompareMonth.toLowerCase() === "off";

    if (compareDisabled) {
      setCompareState({ rows: [], loading: false, baselineServers: [], missingServers: [], error: null });
      return () => {
        cancelled = true;
      };
    }

    if (!compareServers.length) {
      setCompareState({ rows: [], loading: false, baselineServers: [], missingServers: [], error: null });
      return () => {
        cancelled = true;
      };
    }

    const docIds = compareServers.map((s) => buildCompareDocId(s, normalizedCompareMonth));
    const compareCacheKey = buildCompareSnapshotCacheKey({
      scope: "players",
      servers: compareServers,
      month: normalizedCompareMonth,
    });
    const cachedCompareState = readCompareSnapshotCache(compareCacheKey);
    if (cachedCompareState) {
      setCompareState({
        ...cachedCompareState,
        loading: false,
      });
      return () => {
        cancelled = true;
      };
    }

    setCompareState((prev) => ({
      ...prev,
      loading: true,
      baselineServers: [],
      missingServers: [],
      error: null,
    }));

    (async () => {
      const results: FirestoreLatestToplistResult[] = await Promise.all(
        docIds.map((docId) => getPlayerToplistSnapshotByDocId(docId))
      );
      if (cancelled) return;

      const snapshots: FirestoreLatestToplistSnapshot[] = [];
      const baselineServers: string[] = [];
      const missingServers: string[] = [];
      let firstErrorCode: string | null = null;
      let firstErrorDetail: string | null = null;

      results.forEach((result: FirestoreLatestToplistResult, idx) => {
        const docId = docIds[idx];
        if (result.ok) {
          const serverKey = (docId.split("__")[0] || "").trim();
          baselineServers.push(serverKey);
          snapshots.push({
            ...result.snapshot,
            server: serverKey || result.snapshot.server,
          });
        } else {
          const err: any = result;
          missingServers.push(docId);
          if (!firstErrorCode) {
            firstErrorCode = err.error ?? null;
            firstErrorDetail = err.detail ?? null;
          }
        }
      });

      const mergedRows = snapshots.length ? mergeCompareSnapshotRows(snapshots) : [];
      const missingKey = missingServers.length ? missingServers.join(", ") : null;
      const errorMsg = missingServers.length
        ? t("toplists.compareMissingSnapshot", "Baseline missing for {{key}}.", { key: missingKey ?? "" })
        : (firstErrorDetail ?? firstErrorCode ?? null);

      const nextState = {
        rows: mergedRows,
        loading: false,
        baselineServers,
        missingServers,
        error: errorMsg,
      };
      setCompareState(nextState);
      if (!missingServers.length) {
        writeCompareSnapshotCache(compareCacheKey, {
          rows: nextState.rows,
          baselineServers: nextState.baselineServers,
          missingServers: [],
          error: null,
        });
      }
    })().catch((err) => {
      if (cancelled) return;
      const missingKey = docIds.join(", ");
      const msg = t("toplists.compareMissingSnapshot", "Baseline missing for {{key}}.", { key: missingKey });
      setCompareState({
        rows: [],
        loading: false,
        baselineServers: [],
        missingServers: docIds,
        error: msg,
      });
      console.warn("[ToplistsPlayersCompare] snapshot fetch failed", err);
    });

    return () => {
      cancelled = true;
    };
  }, [activeBaselineCompareMonth, compareServersKey, t]);

  // Load compare target snapshot(s) when comparing month-to-month (visible list = "to" month)
  useEffect(() => {
    let cancelled = false;
    const normalizedTargetMonth = activeTargetCompareMonth;
    const compareDisabled =
      !isCompareMonthsMode ||
      !normalizedTargetMonth ||
      normalizedTargetMonth.toLowerCase() === "off";

    if (compareDisabled) {
      setCompareTargetState({ rows: [], loading: false, baselineServers: [], missingServers: [], error: null });
      return () => {
        cancelled = true;
      };
    }

    if (!compareServers.length) {
      setCompareTargetState({ rows: [], loading: false, baselineServers: [], missingServers: [], error: null });
      return () => {
        cancelled = true;
      };
    }

    const docIds = compareServers.map((s) => buildCompareDocId(s, normalizedTargetMonth));

    setCompareTargetState((prev) => ({
      ...prev,
      loading: true,
      baselineServers: [],
      missingServers: [],
      error: null,
    }));

    (async () => {
      const results: FirestoreLatestToplistResult[] = await Promise.all(
        docIds.map((docId) => getPlayerToplistSnapshotByDocId(docId))
      );
      if (cancelled) return;

      const snapshots: FirestoreLatestToplistSnapshot[] = [];
      const snapshotServers: string[] = [];
      const missingServers: string[] = [];
      let firstErrorCode: string | null = null;
      let firstErrorDetail: string | null = null;

      results.forEach((result: FirestoreLatestToplistResult, idx) => {
        const docId = docIds[idx];
        if (result.ok) {
          const serverKey = (docId.split("__")[0] || "").trim();
          snapshotServers.push(serverKey);
          snapshots.push({
            ...result.snapshot,
            server: serverKey || result.snapshot.server,
          });
        } else {
          const err: any = result;
          missingServers.push(docId);
          if (!firstErrorCode) {
            firstErrorCode = err.error ?? null;
            firstErrorDetail = err.detail ?? null;
          }
        }
      });

      const mergedRows = snapshots.length ? mergeCompareSnapshotRows(snapshots) : [];
      const missingKey = missingServers.length ? missingServers.join(", ") : null;
      const errorMsg = missingServers.length
        ? t("toplists.compareMissingSnapshot", "Baseline missing for {{key}}.", { key: missingKey ?? "" })
        : (firstErrorDetail ?? firstErrorCode ?? null);

      const nextState = {
        rows: mergedRows,
        loading: false,
        baselineServers: snapshotServers,
        missingServers,
        error: errorMsg,
      };
      setCompareTargetState(nextState);
    })().catch((err) => {
      if (cancelled) return;
      const missingKey = docIds.join(", ");
      const msg = t("toplists.compareMissingSnapshot", "Baseline missing for {{key}}.", { key: missingKey });
      setCompareTargetState({
        rows: [],
        loading: false,
        baselineServers: [],
        missingServers: docIds,
        error: msg,
      });
      console.warn("[ToplistsPlayersCompare] target snapshot fetch failed", err);
    });

    return () => {
      cancelled = true;
    };
  }, [activeTargetCompareMonth, compareServersKey, compareServers, isCompareMonthsMode, t]);

  const compareMonthsTargetRows = React.useMemo(() => {
    if (!isCompareMonthsMode) return [] as FirestoreToplistPlayerRow[];

    let nextRows = Array.isArray(compareTargetState.rows) ? [...compareTargetState.rows] : [];
    if (!nextRows.length) return nextRows;

    nextRows = nextRows.map((row) => {
      const mainRatio = deriveRatioMain(row.main, row.con);
      const existingRatioLabelRaw = typeof row.ratio === "string" ? row.ratio.trim() : "";
      const existingRatioLabel = existingRatioLabelRaw && existingRatioLabelRaw.includes("/")
        ? existingRatioLabelRaw
        : null;
      const ratioLabel = existingRatioLabel ?? (mainRatio == null ? "-" : `${mainRatio}/${100 - mainRatio}`);
      const calculatedSum = (row.main ?? 0) + (row.con ?? 0);
      return {
        ...row,
        ratio: ratioLabel,
        _ratioLabel: ratioLabel,
        _ratioMain: mainRatio,
        _calculatedSum: calculatedSum,
      } as any;
    });

    nextRows = filterToplistRows(nextRows, filters);

    if (selectedGuildSet && hasGuildData) {
      nextRows = nextRows.filter((row) => {
        const key = normalizeGuildKey(row.guild);
        return key ? selectedGuildSet.has(key) : false;
      });
    }

    if (favoritesOnly && user) {
      nextRows = nextRows.filter((row) => {
        const identifier = buildPlayerFavoriteIdentifierFromRow(row);
        return !!(identifier && favoritePlayerSet.has(identifier));
      });
    }

    if (effectiveSort.key !== "statsDay" && effectiveSort.key !== "statsDayTotal") {
      sortToplistRows(nextRows, effectiveSort);
    }

    return nextRows;
  }, [
    isCompareMonthsMode,
    compareTargetState.rows,
    filters,
    selectedGuildSet,
    hasGuildData,
    favoritesOnly,
    user,
    favoritePlayerSet,
    effectiveSort,
  ]);

  const effectiveCompareMode: ToplistsCompareMode = React.useMemo(() => {
    if (compareMode === "months") {
      return activeBaselineCompareMonth && activeTargetCompareMonth ? "months" : "off";
    }
    if (compareMode === "progress") {
      return activeBaselineCompareMonth ? "progress" : "off";
    }
    return "off";
  }, [compareMode, activeBaselineCompareMonth, activeTargetCompareMonth]);
  const effectiveCompareDaysOverride = React.useMemo(() => {
    if (effectiveCompareMode !== "months") return null;
    return getDaysBetweenMonthKeys(activeBaselineCompareMonth, activeTargetCompareMonth);
  }, [effectiveCompareMode, activeBaselineCompareMonth, activeTargetCompareMonth]);
  const effectiveCurrentRows = effectiveCompareMode === "months" ? compareMonthsTargetRows : filteredRows;
  const effectiveBaselineRows = effectiveCompareMode === "off" ? [] : compareState.rows;
  const activeCompareError =
    effectiveCompareMode === "months"
      ? (compareTargetState.error ?? compareState.error)
      : compareState.error;
  const tableLoading =
    effectiveCompareMode === "months"
      ? (compareTargetState.loading || compareState.loading)
      : playerLoading;

  const buildRowKey = React.useCallback((row: FirestoreToplistPlayerRow, fallbackIndex?: number) => {
    const identifier = resolveToplistRowIdentifier(row);
    if (identifier) return identifier;
    const serverKey = normalizeServerCode(String(row.server ?? ""));
    const nameKey = String(row.name ?? "").trim();
    const classKey = String(row.class ?? "").trim();
    const suffix = fallbackIndex != null ? String(fallbackIndex) : "na";
    return `missing-identifier:${serverKey}__${nameKey}__${classKey}__${suffix}`;
  }, []);
  const buildCompareKey = React.useCallback((row: FirestoreToplistPlayerRow) => {
    const identifier = resolveToplistRowIdentifier(row);
    if (identifier) return identifier;
    return buildRowKey(row);
  }, [buildRowKey]);

  const baselineRowByKey = React.useMemo(() => {
    const map = new Map<string, FirestoreToplistPlayerRow>();
    if (!showCompare) return map;
    effectiveBaselineRows.forEach((row) => {
      const key = buildCompareKey(row);
      if (!map.has(key)) {
        map.set(key, row);
      }
    });
    return map;
  }, [showCompare, effectiveBaselineRows, buildCompareKey]);

  const currentRowsWithCompare = React.useMemo(() => {
    if (!showCompare) return effectiveCurrentRows;
    return effectiveCurrentRows.map((row) => {
      const key = buildCompareKey(row);
      const past = baselineRowByKey.get(key);
      const serverKey = normalizeServerCode(String((row as any).server ?? ""));
      const baselineExists = baselineServerSet.has(serverKey);
      const compareMissing = !baselineExists || !past;
      const delta = (field: keyof FirestoreToplistPlayerRow) => {
        if (compareMissing || !past) return null;
        if (field === "ratio") return null;
        const curr = toNumberSafe((row as any)[field]);
        const prev = toNumberSafe((past as any)[field]);
        if (prev == null) return null;
        return (curr ?? 0) - prev;
      };
      const levelDelta = delta("level");
      const mainDelta = delta("main");
      const conDelta = delta("con");
      const sumDelta = delta("sum");
      const mainTotalDelta = delta("mainTotal");
      const conTotalDelta = delta("conTotal");
      const sumTotalDelta = delta("sumTotal");
      const xpProgressDelta = delta("xpProgress");
      const xpTotalDelta = delta("xpTotal");
      const ratioDelta = delta("ratio");
      const mineDelta = delta("mine");
      const treasuryDelta = delta("treasury");
      let statsDays: number | null = null;
      let statsPerDay: number | null = null;
      let statsDaysBase: number | null = null;
      let statsPerDayBase: number | null = null;
      let statsDaysTotal: number | null = null;
      let statsPerDayTotal: number | null = null;
      if (!compareMissing && past) {
        const statsBase = computeStatsDay(row, past, sumDelta, effectiveCompareDaysOverride, "sum");
        const statsTotal = computeStatsDay(row, past, sumTotalDelta, effectiveCompareDaysOverride, "sumTotal");
        statsDaysBase = statsBase.days;
        statsPerDayBase = statsBase.perDay;
        statsDaysTotal = statsTotal.days;
        statsPerDayTotal = statsTotal.perDay;
        if (playerAvgMode === "total") {
          statsDays = statsDaysTotal;
          statsPerDay = statsPerDayTotal;
        } else {
          statsDays = statsDaysBase;
          statsPerDay = statsPerDayBase;
        }
      }
      return {
        ...row,
        _compareMissing: compareMissing,
        _statsPerDay: statsPerDay,
        _statsDays: statsDays,
        _statsPerDayBase: statsPerDayBase,
        _statsDaysBase: statsDaysBase,
        _statsPerDayTotal: statsPerDayTotal,
        _statsDaysTotal: statsDaysTotal,
        _delta: {
          level: levelDelta,
          main: mainDelta,
          con: conDelta,
          sum: sumDelta,
          mainTotal: mainTotalDelta,
          conTotal: conTotalDelta,
          sumTotal: sumTotalDelta,
          xpProgress: xpProgressDelta,
          xpTotal: xpTotalDelta,
          ratio: ratioDelta,
          mine: mineDelta,
          treasury: treasuryDelta,
        },
      };
    });
  }, [
    showCompare,
    effectiveCurrentRows,
    buildCompareKey,
    baselineRowByKey,
    baselineServerSet,
    effectiveCompareDaysOverride,
    playerAvgMode,
  ]);

  const currentRowByKey = React.useMemo(() => {
    const map = new Map<string, FirestoreToplistPlayerRow>();
    currentRowsWithCompare.forEach((row) => {
      const key = buildCompareKey(row);
      if (!map.has(key)) {
        map.set(key, row);
      }
    });
    return map;
  }, [currentRowsWithCompare, buildCompareKey]);

  const baselineRowLimit = React.useMemo(() => {
    if (!showCompare) return null;
    const counts = new Map<string, number>();
    effectiveBaselineRows.forEach((row) => {
      const serverKey = normalizeServerCode(String(row.server ?? ""));
      const next = (counts.get(serverKey) || 0) + 1;
      counts.set(serverKey, next);
    });
    let max = 0;
    counts.forEach((value) => {
      if (value > max) max = value;
    });
    return max || null;
  }, [showCompare, effectiveBaselineRows]);

  const baselineCombinedRows = React.useMemo(() => {
    if (!showCompare) return [];
    let rows = Array.isArray(effectiveBaselineRows) ? [...effectiveBaselineRows] : [];
    if (!rows.length) return rows;

    rows = rows.map((row) => {
      const mainRatio = deriveRatioMain(row.main, row.con);
      const currentMatch = currentRowByKey.get(buildCompareKey(row));
      const stats = currentMatch
        ? {
            base: computeStatsDay(currentMatch, row, undefined, effectiveCompareDaysOverride, "sum"),
            total: computeStatsDay(currentMatch, row, undefined, effectiveCompareDaysOverride, "sumTotal"),
          }
        : { base: { days: null, perDay: null }, total: { days: null, perDay: null } };
      const calculatedSum = (row.main ?? 0) + (row.con ?? 0);
      return {
        ...row,
        _ratioMain: mainRatio,
        _statsPerDay: playerAvgMode === "total" ? stats.total.perDay : stats.base.perDay,
        _statsDays: playerAvgMode === "total" ? stats.total.days : stats.base.days,
        _statsPerDayBase: stats.base.perDay,
        _statsDaysBase: stats.base.days,
        _statsPerDayTotal: stats.total.perDay,
        _statsDaysTotal: stats.total.days,
        _calculatedSum: calculatedSum,
      } as any;
    });

    rows = filterToplistRows(rows, filters);

    rows = sortToplistRows(rows, effectiveSort);

    if (baselineRowLimit != null && baselineRowLimit > 0 && rows.length > baselineRowLimit) {
      rows = rows.slice(0, baselineRowLimit);
    }

    if (selectedGuildSet && hasGuildData) {
      rows = rows.filter((row) => {
        const key = normalizeGuildKey(row.guild);
        return key ? selectedGuildSet.has(key) : false;
      });
    }

    return rows;
  }, [
    showCompare,
    effectiveBaselineRows,
    filters,
    effectiveSort,
    selectedGuildSet,
    hasGuildData,
    baselineRowLimit,
    currentRowByKey,
    buildCompareKey,
    effectiveCompareDaysOverride,
    playerAvgMode,
  ]);

  const baselineRankByKey = React.useMemo(() => {
    const map = new Map<string, number>();
    if (!showCompare) return map;
    baselineCombinedRows.forEach((row, idx) => {
      const key = buildCompareKey(row);
      if (!map.has(key)) {
        map.set(key, idx + 1);
      }
    });
    return map;
  }, [showCompare, baselineCombinedRows, buildCompareKey]);

  const currentSortedRows = React.useMemo(() => {
    if (!showCompare || (effectiveSort.key !== "statsDay" && effectiveSort.key !== "statsDayTotal")) {
      return currentRowsWithCompare;
    }
    const next = [...currentRowsWithCompare];
    sortToplistRows(next, effectiveSort);
    return next;
  }, [showCompare, currentRowsWithCompare, effectiveSort]);

  const currentRankByKey = React.useMemo(() => {
    const map = new Map<string, number>();
    currentSortedRows.forEach((row, idx) => {
      const key = buildCompareKey(row);
      if (!map.has(key)) {
        map.set(key, idx + 1);
      }
    });
    return map;
  }, [currentSortedRows, buildCompareKey]);

  const enhancedRows = React.useMemo(() => {
    return currentSortedRows.map((row, idx) => {
      if (!showCompare) {
        return { ...row, _rank: idx + 1 };
      }
      const key = buildCompareKey(row);
      const currentRank = currentRankByKey.get(key) ?? (idx + 1);
      const baselineRank = baselineRankByKey.get(key);
      const rankDelta = baselineRank != null && currentRank != null ? baselineRank - currentRank : null;
      return {
        ...row,
        _rank: idx + 1,
        _rankDelta: rankDelta,
      };
    });
  }, [showCompare, currentSortedRows, buildCompareKey, baselineRankByKey, currentRankByKey]);
  exportSnapshotRef.current = {
    kind: "players",
    rows: enhancedRows as ToplistExportRow[],
    showCompare,
  };

  const avgTop100StatsPerDay = (() => {
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

  const decorMap = React.useMemo(() => {
    const map = new Map<string, CellDecor>();
    const rows = enhancedRows;
    const keyFor = (row: FirestoreToplistPlayerRow) => buildCompareKey(row);

    const ensure = (row: FirestoreToplistPlayerRow) => {
      const key = keyFor(row);
      let entry = map.get(key);
      if (!entry) {
        entry = {};
        map.set(key, entry);
      }
      return entry;
    };

    const rankBy = (
      valueGetter: (row: FirestoreToplistPlayerRow) => number | null,
      field: "mainRank" | "conRank" | "levelRank",
    ) => {
      const ranked = rows
        .map((row, idx) => {
          const value = valueGetter(row);
          if (value == null) return null;
          return { row, value, idx };
        })
        .filter(Boolean) as { row: FirestoreToplistPlayerRow; value: number; idx: number }[];
      ranked.sort((a, b) => b.value - a.value || a.idx - b.idx);
      ranked.slice(0, 5).forEach((entry, i) => {
        ensure(entry.row)[field] = i + 1;
      });
    };

    rankBy(
      (row) => toNumberSafe(playerAvgMode === "total" ? row.mainTotal : row.main),
      "mainRank"
    );
    rankBy(
      (row) => toNumberSafe(playerAvgMode === "total" ? row.conTotal : row.con),
      "conRank"
    );
    rankBy((row) => toNumberSafe(row.level), "levelRank");

    rows.forEach((row) => {
      const mineValue = toNumberSafe(row.mine);
      if (mineValue == null) return;
      const tier =
        mineValue >= 100 ? 4 :
        mineValue >= 80 ? 3 :
        mineValue >= 65 ? 2 :
        mineValue >= 50 ? 1 :
        null;
      if (tier) ensure(row).mineTier = tier as 1 | 2 | 3 | 4;
    });

    return map;
  }, [enhancedRows, buildCompareKey, playerAvgMode]);

  const nowMs = Date.now();
  const statusLabel = !hasServers
    ? t("toplists.status.noServerSelected", "No server selected")
    : tableLoading || compareState.loading
      ? t("toplists.status.loading", "Loading...")
      : playerError
        ? t("toplists.status.error", "Error")
        : t("toplists.status.ready", "Ready");
  const [selectedPlayerProfile, setSelectedPlayerProfile] = React.useState<{
    identifier: string;
    name: string | null;
    server: string | null;
  } | null>(null);
  const [selectedGuildProfile, setSelectedGuildProfile] = React.useState<{
    identifier: string;
    guildId: string;
    name: string | null;
    server: string | null;
  } | null>(null);
  const [highlightedIdentifier, setHighlightedIdentifier] = React.useState<string | null>(null);
  const focusHandledRef = React.useRef<string | null>(null);
  const focusHighlightTimeoutRef = React.useRef<number | null>(null);
  const tableScrollRef = React.useRef<HTMLDivElement | null>(null);
  const guildLookupCacheRef = React.useRef<Map<string, string | null>>(new Map());
  const [tableScrollbarWidth, setTableScrollbarWidth] = React.useState(0);
  const virtualRowHeight = showCompare ? 72 : 64;
  const virtualRowKeys = React.useMemo(
    () => enhancedRows.map((row) => resolveToplistRowIdentifier(row)),
    [enhancedRows]
  );
  const rowIndexByIdentifier = React.useMemo(() => {
    const indexMap = new Map<string, number>();
    enhancedRows.forEach((row, idx) => {
      const identifier = resolveToplistRowIdentifier(row);
      if (!identifier || indexMap.has(identifier)) return;
      indexMap.set(identifier, idx);
    });
    return indexMap;
  }, [enhancedRows]);
  const rowVirtualizer = useVirtualizer({
    count: enhancedRows.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => virtualRowHeight,
    overscan: 14,
    getItemKey: (index) => virtualRowKeys[index] ?? `missing-identifier-row-${index}`,
  });

  const resolveGuildOverlayTarget = React.useCallback(
    async (row: FirestoreToplistPlayerRow): Promise<{ guildId: string; serverCode: string } | null> => {
      const directGuildId = resolveDirectGuildIdFromPlayerRow(row);
      const serverCode = normalizeServerKeyFromInput(row.server) ?? "";
      if (directGuildId) {
        return { guildId: directGuildId, serverCode };
      }

      const guildName = String(row.guild ?? "").trim();
      if (!guildName || !serverCode) return null;

      const cacheKey = `${serverCode.toLowerCase()}::${normalizeGuildKey(guildName)}`;
      if (guildLookupCacheRef.current.has(cacheKey)) {
        const cached = guildLookupCacheRef.current.get(cacheKey);
        if (!cached) return null;
        return { guildId: cached, serverCode };
      }

      try {
        const result = await getGuildToplistSnapshotCached(serverCode);
        if (!result.ok) {
          guildLookupCacheRef.current.set(cacheKey, null);
          return null;
        }

        const guildNameKey = normalizeGuildKey(guildName);
        const match = result.snapshot.guilds.find((guildRow) => normalizeGuildKey(guildRow.name) === guildNameKey);
        const guildId = String(match?.guildId ?? "").trim();
        guildLookupCacheRef.current.set(cacheKey, guildId || null);
        if (!guildId) return null;
        return { guildId, serverCode };
      } catch {
        guildLookupCacheRef.current.set(cacheKey, null);
        return null;
      }
    },
    [getGuildToplistSnapshotCached]
  );

  const handleGuildCellClick = React.useCallback(
    async (row: FirestoreToplistPlayerRow) => {
      const guildName = String(row.guild ?? "").trim();
      if (!guildName) return;

      const resolved = await resolveGuildOverlayTarget(row);
      if (!resolved) return;

      setSelectedGuildProfile({
        identifier: buildGuildToplistIdentifier(resolved.serverCode || row.server, resolved.guildId) ?? resolved.guildId,
        guildId: resolved.guildId,
        name: guildName,
        server: typeof row.server === "string" ? row.server : resolved.serverCode || null,
      });
    },
    [resolveGuildOverlayTarget]
  );

  React.useEffect(() => {
    focusHandledRef.current = null;
    setHighlightedIdentifier(null);
    if (focusHighlightTimeoutRef.current != null) {
      window.clearTimeout(focusHighlightTimeoutRef.current);
      focusHighlightTimeoutRef.current = null;
    }
  }, [focusIdentifier]);

  React.useEffect(() => {
    return () => {
      if (focusHighlightTimeoutRef.current != null) {
        window.clearTimeout(focusHighlightTimeoutRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
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
  }, [hasServers, enhancedRows.length, showCompare]);

  React.useEffect(() => {
    void focusRank;

    if (!focusIdentifier || !hasServers || playerLoading) return;
    if (focusHandledRef.current === focusIdentifier) return;
    const targetIndex = rowIndexByIdentifier.get(focusIdentifier);
    if (targetIndex == null) return;
    focusHandledRef.current = focusIdentifier;
    rowVirtualizer.scrollToIndex(targetIndex, { align: "center", behavior: "smooth" });
    setHighlightedIdentifier(focusIdentifier);

    if (focusHighlightTimeoutRef.current != null) {
      window.clearTimeout(focusHighlightTimeoutRef.current);
    }
    focusHighlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedIdentifier((prev) => (prev === focusIdentifier ? null : prev));
      focusHighlightTimeoutRef.current = null;
    }, 2600);
  }, [focusIdentifier, focusRank, hasServers, playerLoading, rowIndexByIdentifier, rowVirtualizer]);

  const renderToplistColGroup = () => (
    <colgroup>
      {TOPLIST_VISIBLE_COLUMNS.map((column) => (
        <col key={column.key} style={{ width: column.width }} />
      ))}
    </colgroup>
  );

  const renderToplistHeader = () => (
    <table className="toplists-table toplists-table--header" style={TOPLIST_TABLE_STYLE}>
      {renderToplistColGroup()}
      <thead>
        <tr style={TOPLIST_HEADER_ROW_STYLE}>
          {TOPLIST_VISIBLE_COLUMNS.map((column) => (
            <th key={column.key} style={TOPLIST_CELL_STYLE_BY_KEY[column.key]}>
              <span style={TOPLIST_HEADER_LABEL_STYLE}>
                {column.key === "name"
                  ? t("toplists.columns.player", "Player")
                  : t(`toplists.columns.${column.key}`, column.label)}
              </span>
            </th>
          ))}
        </tr>
      </thead>
    </table>
  );

  const renderToplistTableBody = (opts: {
    imgLoading: "lazy" | "eager";
  }) => {
    const rows = enhancedRows;
    const virtualItems = rowVirtualizer.getVirtualItems();
    const topSpacerHeight = virtualItems.length ? virtualItems[0].start : 0;
    const bottomSpacerHeight = virtualItems.length
      ? Math.max(0, rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end)
      : 0;
    return (
    <table className="toplists-table toplists-table--body" style={TOPLIST_TABLE_STYLE}>
      {renderToplistColGroup()}
      <tbody>
        {rows.length > 0 && topSpacerHeight > 0 && (
          <tr aria-hidden>
            <td colSpan={TOPLIST_TABLE_COL_SPAN} style={{ height: topSpacerHeight, padding: 0, border: 0 }} />
          </tr>
        )}
        {virtualItems.map((virtualRow) => {
          const i = virtualRow.index;
          const r = rows[i];
          if (!r) return null;
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
          const decor = decorMap.get(buildCompareKey(r));
          const mainTone = getRankTone(decor?.mainRank, MAIN_RANK_COLORS);
          const conTone = getRankTone(decor?.conRank, CON_RANK_COLORS);
          const levelTone = getRankTone(decor?.levelRank, LEVEL_RANK_COLORS);
          const mineTone = getMineTone(decor?.mineTier);
          const calculatedSum = (r as any)._calculatedSum ?? 0;
          const displayMain = playerAvgMode === "total" ? r.mainTotal : r.main;
          const displayCon = playerAvgMode === "total" ? r.conTotal : r.con;
          const displaySum = playerAvgMode === "total" ? r.sumTotal : calculatedSum;
          const mainDeltaValue = playerAvgMode === "total" ? (deltas.mainTotal ?? null) : (deltas.main ?? null);
          const conDeltaValue = playerAvgMode === "total" ? (deltas.conTotal ?? null) : (deltas.con ?? null);
          const sumDeltaValue = playerAvgMode === "total" ? (deltas.sumTotal ?? null) : (deltas.sum ?? null);
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
            if (!profileIdentifier) return;
            setSelectedPlayerProfile({
              identifier: profileIdentifier,
              name: typeof r.name === "string" ? r.name : null,
              server: typeof r.server === "string" ? r.server : null,
            });
          };

          return (
            <tr
              key={rowKey}
              className={`toplists-row${isFocusedRow ? " toplists-row--focused" : ""}`}
              data-sfh-identifier={profileIdentifier ?? undefined}
              style={{
                borderBottom: "1px solid #2C4A73",
                cursor: "pointer",
                userSelect: "none",
                height: virtualRowHeight,
              }}
              onClick={rowOnClick}
            >
              <td style={TOPLIST_CELL_STYLE_BY_KEY.rank}>{i + 1}</td>
              <td style={TOPLIST_CELL_STYLE_BY_KEY.rankDelta}>
                <span style={TOPLIST_TEXT_CELL_CONTENT_STYLE}>
                  {rankDeltaDisplay ? (
                    <span className={`rank-delta-chip rank-delta-chip--${rankDeltaDisplay.variant}`}>
                      {rankDeltaDisplay.text}
                    </span>
                  ) : ""}
                </span>
              </td>
              <td style={TOPLIST_CELL_STYLE_BY_KEY.name}>
                <div style={TOPLIST_NAME_CELL_LAYOUT_STYLE}>
                  <span style={TOPLIST_NAME_CELL_ICON_CONTENT_STYLE}>
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
                  <div style={TOPLIST_NAME_CELL_STACK_STYLE}>
                    <span style={TOPLIST_TEXT_CELL_CONTENT_STYLE}>{r.name}</span>
                    <span style={TOPLIST_SECONDARY_TEXT_CELL_CONTENT_STYLE}>{sublineText}</span>
                  </div>
                </div>
              </td>
              <td style={TOPLIST_CELL_STYLE_BY_KEY.guild}>
                {String(r.guild ?? "").trim() ? (
                  <span
                    style={{ display: "block", width: "100%", minWidth: 0 }}
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <NeonCoreButton
                      onClick={() => {
                        void handleGuildCellClick(r);
                      }}
                      title={String(r.guild ?? "")}
                      label={String(r.guild ?? "")}
                      icon={null}
                      className="w-full justify-start rounded-lg px-2 py-1 text-xs font-medium"
                    />
                  </span>
                ) : (
                  <span style={TOPLIST_TEXT_CELL_CONTENT_STYLE}>{r.guild ?? ""}</span>
                )}
              </td>
              <td style={TOPLIST_CELL_STYLE_BY_KEY.level}>
                <div style={TOPLIST_FLEX_COLUMN_RIGHT_STYLE}>
                  <span style={getFrameStyle(levelTone)}>{fmtNum(r.level)}</span>
                  {renderDelta(deltas.level ?? null, compareMissing)}
                </div>
              </td>
              <td style={TOPLIST_CELL_STYLE_BY_KEY.main}>
                <div style={TOPLIST_FLEX_COLUMN_RIGHT_STYLE}>
                  <span style={getFrameStyle(mainTone)}>
                    <ValueCrossfade value={fmtNum(displayMain)} fadeKey={playerAvgMode} minWidthCh={0} />
                  </span>
                  {renderDelta(mainDeltaValue, compareMissing)}
                </div>
              </td>
              <td style={TOPLIST_CELL_STYLE_BY_KEY.con}>
                <div style={TOPLIST_FLEX_COLUMN_RIGHT_STYLE}>
                  <span style={getFrameStyle(conTone)}>
                    <ValueCrossfade value={fmtNum(displayCon)} fadeKey={playerAvgMode} minWidthCh={0} />
                  </span>
                  {renderDelta(conDeltaValue, compareMissing)}
                </div>
              </td>
              <td style={TOPLIST_CELL_STYLE_BY_KEY.sum}>
                <div style={TOPLIST_FLEX_COLUMN_RIGHT_STYLE}>
                  <span>
                    <ValueCrossfade value={fmtNum(displaySum)} fadeKey={playerAvgMode} />
                  </span>
                  {renderDelta(sumDeltaValue, compareMissing)}
                </div>
              </td>
              <td style={TOPLIST_CELL_STYLE_BY_KEY.statsPerDay}>
                <div style={TOPLIST_FLEX_COLUMN_RIGHT_STYLE}>
                  <span className={statsDayClassName}>{statsPerDayText}</span>
                  <div style={TOPLIST_DELTA_SUBTEXT_STYLE}>{statsDaysText}</div>
                </div>
              </td>
              <td style={TOPLIST_CELL_STYLE_BY_KEY.ratio}>
                <div style={TOPLIST_FLEX_COLUMN_CENTER_STYLE}>
                  <span>{(r as any)._ratioLabel ?? r.ratio ?? "-"}</span>
                  {renderDelta(deltas.ratio ?? null, compareMissing, true)}
                </div>
              </td>
              <td style={TOPLIST_CELL_STYLE_BY_KEY.mine}>
                <div style={TOPLIST_FLEX_COLUMN_RIGHT_STYLE}>
                  <span style={getFrameStyle(mineTone)}>{fmtNum(r.mine)}</span>
                  {renderDelta(deltas.mine ?? null, compareMissing)}
                </div>
              </td>
              <td style={TOPLIST_CELL_STYLE_BY_KEY.treasury}>
                <div style={TOPLIST_FLEX_COLUMN_RIGHT_STYLE}>
                  <span>{fmtNum(r.treasury)}</span>
                  {renderDelta(deltas.treasury ?? null, compareMissing)}
                </div>
              </td>
              <td style={TOPLIST_CELL_STYLE_BY_KEY.lastScan}>
                <span style={TOPLIST_LAST_SCAN_CONTENT_STYLE}>
                  <span style={TOPLIST_LAST_SCAN_LABEL_STYLE}>{lastScanLabel}</span>
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
              </td>
            </tr>
          );
        })}
        {tableLoading && enhancedRows.length === 0 && (
          <tr><td colSpan={TOPLIST_TABLE_COL_SPAN} style={{ padding: 12 }}>{t("toplists.table.loading", "Loading...")}</td></tr>
        )}
        {!tableLoading && !playerError && enhancedRows.length === 0 && (
          <tr><td colSpan={TOPLIST_TABLE_COL_SPAN} style={{ padding: 12 }}>{t("toplists.table.noResults", "No results")}</td></tr>
        )}
        {rows.length > 0 && bottomSpacerHeight > 0 && (
          <tr aria-hidden>
            <td colSpan={TOPLIST_TABLE_COL_SPAN} style={{ height: bottomSpacerHeight, padding: 0, border: 0 }} />
          </tr>
        )}
      </tbody>
    </table>
    );
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12, minHeight: 0, height: "100%" }}>
      <div style={{ opacity: 0.8, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
        <div>{statusLabel} - {enhancedRows.length} {t("toplists.status.rows", "rows")}</div>
        <div>{playerLastUpdatedAt ? t("toplists.status.updated", "Updated: {{value}}", { value: fmtDate(playerLastUpdatedAt) }) : null}</div>
      </div>
      {showAvgModeControl && playerAvgModeSlot &&
        createPortal(
          <PlayerAvgModeControls
            mode={playerAvgMode}
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
      {(activeBaselineCompareMonth || activeTargetCompareMonth) && activeCompareError && (
        <div style={{ fontSize: 12, color: "#ffb347" }}>
          {activeCompareError}
        </div>
      )}
      {playerScopeStatus && (
        <div style={{ opacity: 0.75, fontSize: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <span>
            {t("toplists.players.scope.summary", "Scope {{scopeId}} - {{changes}}/{{minChanges}} changes since last rebuild", {
              scopeId: playerScopeStatus.scopeId,
              changes: playerScopeStatus.changesSinceLastRebuild,
              minChanges: playerScopeStatus.minChanges ?? "?",
            })}
          </span>
          <span>
            {t("toplists.players.scope.autoRebuild", "Auto rebuild at {{minChanges}} changes or after {{maxAgeDays}} days", {
              minChanges: playerScopeStatus.minChanges ?? "?",
              maxAgeDays: playerScopeStatus.maxAgeDays ?? "?",
            })}
          </span>
          <span>
            {t("toplists.players.scope.lastRebuild", "Last rebuild: {{value}}", {
              value: fmtDateObj(playerScopeStatus.lastRebuildAt),
            })}
          </span>
        </div>
      )}

      {hasServers && playerError && (
        <div style={{ border: "1px solid #2C4A73", borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{t("toplists.status.error", "Error")}</div>
          <div style={{ wordBreak: "break-all" }}>{playerError}</div>
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
      ) : (
        <>
          <div ref={tableRef} className="toplists-table-viewport" style={{ flex: "1 1 auto", minHeight: 0 }}>
            <div className="toplists-table-header" style={{ paddingRight: tableScrollbarWidth }}>
              {renderToplistHeader()}
            </div>
            <div ref={tableScrollRef} className="toplists-table-scroll">
              {renderToplistTableBody({ imgLoading: "lazy" })}
            </div>
          </div>
        </>
      )}
      <ProfileOverlay
        isOpen={Boolean(selectedPlayerProfile?.identifier)}
        playerIdentifier={selectedPlayerProfile?.identifier ?? null}
        playerName={
          selectedPlayerProfile
            ? [selectedPlayerProfile.name, selectedPlayerProfile.server].filter(Boolean).join(" - ")
            : null
        }
        onClose={() => setSelectedPlayerProfile(null)}
      />
      <GuildProfileOverlay
        isOpen={Boolean(selectedGuildProfile?.guildId)}
        guildId={selectedGuildProfile?.guildId ?? null}
        guildName={
          selectedGuildProfile
            ? [selectedGuildProfile.name, selectedGuildProfile.server].filter(Boolean).join(" - ")
            : null
        }
        onClose={() => setSelectedGuildProfile(null)}
      />
    </div>
  );
}

function TopTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg px-3 py-1.5 text-sm text-white border",
        active ? "bg-[#25456B] border-[#5C8BC6]" : "border-transparent",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
