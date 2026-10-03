// src/components/toplists/GuildToplists.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import {
  type FirestoreLatestGuildToplistResult,
} from "../../lib/api/toplistsFirestore";
import type { ToplistGuildRow, ToplistGuildSnapshot } from "../../lib/toplists/toplistContracts";
import { SERVERS } from "../../data/servers";
import { useFilters } from "../../components/Filters/FilterContext";
import { useAuth } from "../../context/AuthContext";
import { useToplistsData } from "../../context/ToplistsDataContextCore";
import { formatScanDateTimeLabel } from "../../lib/ui/formatScanDateTimeLabel";
import type { ToplistCaptureStatus } from "../../components/export/ToplistExportController";
import GuildProfileOverlay from "../../components/ProfileOverlay/GuildProfileOverlay";
import NeonCoreButton from "../../components/ui/NeonCoreButton";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
  formatToplistDelta,
  getToplistRankDeltaDisplay,
} from "./toplistCompareDisplay";
import { useToplistRowFocus } from "./useToplistRowFocus";

type GuildToplistsProps = {
  serverCodes?: string[];
  sortKey?: string;
  showAvgModeControl?: boolean;
  tableRef?: React.RefObject<HTMLDivElement>;
  renderMode?: "live" | "preset";
  presetAmount?: number | null;
  onCaptureStatusChange?: (status: ToplistCaptureStatus) => void;
  presetReadOnlyData?: GuildToplistsPresetData | null;
  onPresetReadOnlyDataChange?: (data: GuildToplistsPresetData) => void;
  onAvgModeChange?: (nextMode: "base" | "total") => void;
  renderFirestoreGuildOverlay?: boolean;
  focusIdentifier?: string | null;
  focusNonce?: number | string | null;
};

export type GuildToplistsPresetData = {
  rows: ToplistGuildRow[];
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
  avgMode: "base" | "total";
  compareLoading?: boolean;
  compareExpected?: boolean;
  showCompare?: boolean;
  compareError?: string | null;
};

type GuildColumnKey =
  | "rank"
  | "server"
  | "name"
  | "hofRank"
  | "honor"
  | "raids"
  | "portal"
  | "hydra"
  | "petLevel"
  | "members"
  | "avgLevel"
  | "avgMain"
  | "avgCon"
  | "avgSum"
  | "lastScan";

type GuildColumnAlign = "left" | "center" | "right";

type GuildColumnDef = {
  key: GuildColumnKey;
  label: string;
  width: string;
  align: GuildColumnAlign;
};

const GUILD_COLUMNS: ReadonlyArray<GuildColumnDef> = [
  { key: "rank", label: "#", width: "4%", align: "right" },
  { key: "server", label: "Server", width: "6%", align: "left" },
  { key: "name", label: "Name", width: "14%", align: "left" },
  { key: "hofRank", label: "HoF Rank", width: "6%", align: "right" },
  { key: "honor", label: "Honor", width: "7%", align: "right" },
  { key: "raids", label: "Raids", width: "5%", align: "right" },
  { key: "portal", label: "Portal", width: "5%", align: "right" },
  { key: "hydra", label: "Hydra", width: "5%", align: "right" },
  { key: "petLevel", label: "Pet Level", width: "6%", align: "right" },
  { key: "members", label: "Members", width: "7%", align: "right" },
  { key: "avgLevel", label: "\u00F8 Level", width: "7%", align: "right" },
  { key: "avgMain", label: "\u00F8 Main", width: "7%", align: "right" },
  { key: "avgCon", label: "\u00F8 Con", width: "7%", align: "right" },
  { key: "avgSum", label: "\u00F8 Sum", width: "7%", align: "right" },
  { key: "lastScan", label: "Last Scan", width: "7%", align: "right" },
];

const GUILD_TABLE_COL_SPAN = GUILD_COLUMNS.length;

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

const TOPLIST_HEADER_LABEL_ALIGN_STYLE: Record<GuildColumnAlign, Pick<React.CSSProperties, "justifyContent">> = {
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

const TOPLIST_FLEX_COLUMN_RIGHT_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  justifyContent: "center",
  gap: 2,
};

const TOPLIST_FLEX_COLUMN_CENTER_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
};

const TOPLIST_DELTA_SUBTEXT_STYLE: React.CSSProperties = {
  color: "#8FE6A8",
  fontSize: 11,
  lineHeight: 1.1,
  whiteSpace: "nowrap",
};

const TOPLIST_CELL_STYLE_BY_KEY = GUILD_COLUMNS.reduce((acc, column) => {
  acc[column.key] = { ...TOPLIST_CELL_BASE_STYLE, textAlign: column.align };
  return acc;
}, {} as Record<GuildColumnKey, React.CSSProperties>);

const GuildToplistColGroup = React.memo(function GuildToplistColGroup() {
  return (
    <colgroup>
      {GUILD_COLUMNS.map((column) => (
        <col key={column.key} style={{ width: column.width }} />
      ))}
    </colgroup>
  );
});

const GuildToplistHeader = React.memo(function GuildToplistHeader() {
  const { t } = useTranslation();
  return (
    <table className="toplists-table toplists-table--header" style={TOPLIST_TABLE_STYLE}>
      <GuildToplistColGroup />
      <thead>
        <tr style={TOPLIST_HEADER_ROW_STYLE}>
          {GUILD_COLUMNS.map((column) => (
            <th key={column.key} style={TOPLIST_CELL_STYLE_BY_KEY[column.key]}>
              <span style={{ ...TOPLIST_HEADER_LABEL_STYLE, ...TOPLIST_HEADER_LABEL_ALIGN_STYLE[column.align] }}>
                {t(`toplists.columns.${column.key}`, column.label)}
              </span>
            </th>
          ))}
        </tr>
      </thead>
    </table>
  );
});

const normalizeServerList = (list: string[]) => {
  const set = new Set<string>();
  list.forEach((entry) => {
    const normalized = String(entry || "").trim().toUpperCase();
    if (normalized) set.add(normalized);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
};

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

const normalizeGuildFocusIdentifier = (value: unknown): string | null => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const canonicalMatch = raw.match(/^(.+?)__(.+)$/);
  if (canonicalMatch) {
    return buildGuildToplistIdentifier(canonicalMatch[1], canonicalMatch[2]);
  }
  const legacyMatch = raw.match(/^(.+?)_g(.+)$/);
  if (legacyMatch) {
    return buildGuildToplistIdentifier(legacyMatch[1], legacyMatch[2]);
  }
  return null;
};

const normalizeFavoriteIdentifier = (value: unknown): string | null => {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw || null;
};

const buildCanonicalFavoriteServerKey = (value: unknown): string | null => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (/^[a-z0-9]+_(?:eu|net)$/.test(raw)) return raw;

  const euMatch = raw.match(/^s?(\d+)$/);
  if (euMatch) return `s${euMatch[1]}_eu`;
  const euCodeMatch = raw.match(/^eu(\d+)$/);
  if (euCodeMatch) return `s${euCodeMatch[1]}_eu`;
  const fusionMatch = raw.match(/^f(\d+)$/);
  if (fusionMatch) return `f${fusionMatch[1]}_net`;
  const amMatch = raw.match(/^am(\d+)$/);
  if (amMatch) return `am${amMatch[1]}_net`;
  return null;
};

const buildGuildFavoriteIdentifierFromRow = (row: ToplistGuildRow): string | null => {
  const guildId = String(row.guildId ?? "").trim();
  if (!guildId) return null;
  const serverKey = buildCanonicalFavoriteServerKey(row.server);
  if (!serverKey) return null;
  return `${serverKey}_g${guildId}`.toLowerCase();
};

const resolveGuildIdentifier = (row: ToplistGuildRow): string | null => {
  const fromRowFields = buildGuildToplistIdentifier(row.server, row.guildId);
  if (fromRowFields) return fromRowFields;
  const explicitIdentifier = normalizeGuildFocusIdentifier((row as any).identifier);
  if (explicitIdentifier) return explicitIdentifier;
  return null;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return null;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
};

const normalizeGuildNumericRow = (row: ToplistGuildRow): ToplistGuildRow => ({
  ...row,
  hofRank: toFiniteNumber(row.hofRank),
  honor: toFiniteNumber(row.honor),
  raids: toFiniteNumber(row.raids),
  portalFloor: toFiniteNumber(row.portalFloor),
  hydra: toFiniteNumber(row.hydra),
  petLevel: toFiniteNumber(row.petLevel),
  instructor: toFiniteNumber(row.instructor),
  memberCount: toFiniteNumber(row.memberCount),
  avgLevel: toFiniteNumber(row.avgLevel),
  avgBaseMain: toFiniteNumber(row.avgBaseMain),
  avgConBase: toFiniteNumber(row.avgConBase),
  avgSumBaseTotal: toFiniteNumber(row.avgSumBaseTotal),
  avgAttrTotal: toFiniteNumber(row.avgAttrTotal),
  avgConTotal: toFiniteNumber(row.avgConTotal),
  avgTotalStats: toFiniteNumber(row.avgTotalStats),
  avgMine: toFiniteNumber(row.avgMine),
  avgTreasury: toFiniteNumber(row.avgTreasury),
  sumAvg: toFiniteNumber(row.sumAvg),
  latestScanAtSec: toFiniteNumber(row.latestScanAtSec),
  lastScan: row.lastScan == null ? null : String(row.lastScan).trim() || null,
});

const resolveGuildLastScanSec = (row: ToplistGuildRow): number | null => {
  const latestScanAtSec = toFiniteNumber(row.latestScanAtSec);
  if (latestScanAtSec != null) return latestScanAtSec;
  return toFiniteNumber(row.lastScan);
};

const compareNumberDesc = (aVal: unknown, bVal: unknown) => {
  const aNum = toFiniteNumber(aVal);
  const bNum = toFiniteNumber(bVal);
  if (aNum == null && bNum == null) return 0;
  if (aNum == null) return 1;
  if (bNum == null) return -1;
  return bNum - aNum;
};

const compareTextAsc = (aVal: string, bVal: string) =>
  aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: "base" });

const resolveGuildSort = (value: string | null | undefined) => {
  switch (String(value ?? "").trim()) {
    case "guildMembers":
    case "guildAvgLevel":
    case "guildAvgMain":
    case "guildAvgCon":
    case "guildAvgSum":
    case "guildRaids":
    case "guildHydra":
      return String(value).trim();
    default:
      return "guildAvgLevel";
  }
};

const getGuildAvgMain = (row: ToplistGuildRow, mode: "base" | "total") =>
  mode === "total" ? row.avgAttrTotal : row.avgBaseMain;

const getGuildAvgCon = (row: ToplistGuildRow, mode: "base" | "total") =>
  mode === "total" ? row.avgConTotal : row.avgConBase;

const getGuildAvgSum = (row: ToplistGuildRow, mode: "base" | "total") =>
  mode === "total" ? row.avgTotalStats : row.avgSumBaseTotal;

function GuildAvgModeControls({
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

const formatLastScanDisplay = (value: unknown): string => formatScanDateTimeLabel(value);

export default function GuildToplists({
  serverCodes,
  sortKey,
  showAvgModeControl = true,
  tableRef,
  renderMode = "live",
  presetAmount = null,
  onCaptureStatusChange,
  presetReadOnlyData = null,
  onAvgModeChange,
  renderFirestoreGuildOverlay = true,
  focusIdentifier = null,
  focusNonce = null,
}: GuildToplistsProps) {
  const { t, i18n } = useTranslation();
  const { favoritesOnly } = useFilters();
  const { user } = useAuth();
  const { getGuildToplistSnapshotCached } = useToplistsData();
  const isPresetRender = renderMode === "preset";
  const hasReadOnlyData = Boolean(presetReadOnlyData);
  const resolvedPresetAmount = presetAmount ?? 50;
  const captureRowLimit = isPresetRender ? resolvedPresetAmount : null;
  const isCompactToplistView = useMediaQuery("(max-width: 1099px)") && !isPresetRender;
  const [rows, setRows] = useState<ToplistGuildRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [guildAvgMode, setGuildAvgMode] = useState<"base" | "total">("base");
  const [expandedMobileGuildKey, setExpandedMobileGuildKey] = useState<string | null>(null);
  const [selectedGuildProfile, setSelectedGuildProfile] = useState<{
    identifier: string;
    guildId: string;
    name: string | null;
    server: string | null;
  } | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const captureStatusSignatureRef = useRef<string>("");
  const navigate = useNavigate();
  const location = useLocation();

  const resolvedServers = useMemo(() => {
    const normalized = normalizeServerList(serverCodes ?? []);
    if (normalized.length) return normalized;
    if (hasReadOnlyData) return [];
    const fallback = SERVERS.find((server) => server.id)?.id || "EU1";
    const fallbackCode = String(fallback).toUpperCase();
    return fallbackCode ? [fallbackCode] : [];
  }, [hasReadOnlyData, serverCodes]);
  const resolvedServerKey = useMemo(() => resolvedServers.join(","), [resolvedServers]);
  const i18nLanguageKey = i18n.resolvedLanguage || i18n.language || "";
  const tNoSnapshot = useMemo(
    () => i18n.t("toplistsPage.errors.noSnapshot", "No snapshot yet for this server."),
    [i18n, i18nLanguageKey]
  );
  const tFirestoreError = useMemo(
    () => i18n.t("toplistsPage.errors.firestore", "Firestore error"),
    [i18n, i18nLanguageKey]
  );
  const tDecodeError = useMemo(
    () => i18n.t("toplistsPage.errors.decode", "Could not decode data"),
    [i18n, i18nLanguageKey]
  );
  const tUnexpectedError = useMemo(
    () => i18n.t("toplistsPage.errors.unexpectedLoad", "Unexpected error while loading"),
    [i18n, i18nLanguageKey]
  );
  const getGuildToplistSnapshotCachedRef = useRef(getGuildToplistSnapshotCached);
  const errorMessagesRef = useRef({
    noSnapshot: tNoSnapshot,
    firestore: tFirestoreError,
    decode: tDecodeError,
    unexpected: tUnexpectedError,
  });

  useEffect(() => {
    getGuildToplistSnapshotCachedRef.current = getGuildToplistSnapshotCached;
  }, [getGuildToplistSnapshotCached]);

  useEffect(() => {
    errorMessagesRef.current = {
      noSnapshot: tNoSnapshot,
      firestore: tFirestoreError,
      decode: tDecodeError,
      unexpected: tUnexpectedError,
    };
  }, [tNoSnapshot, tFirestoreError, tDecodeError, tUnexpectedError]);

  useEffect(() => {
    if (isPresetRender || hasReadOnlyData) return;
    let active = true;
    const currentMessages = errorMessagesRef.current;
    const serversForFetch = resolvedServerKey
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    setLoading(true);
    setError(null);

    if (!serversForFetch.length) {
      setRows([]);
      setUpdatedAt(null);
      setError(currentMessages.noSnapshot);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    Promise.all(serversForFetch.map((serverCode) => getGuildToplistSnapshotCachedRef.current(serverCode)))
      .then((results) => {
        if (!active) return;
        const snapshots: ToplistGuildSnapshot[] = [];
        let firstErrorCode: string | null = null;
        let firstErrorDetail: string | null = null;

        results.forEach((result: FirestoreLatestGuildToplistResult) => {
          if (result.ok) {
            snapshots.push(result.snapshot);
          } else if (!firstErrorCode) {
            const err: any = result;
            firstErrorCode = err.error ?? null;
            firstErrorDetail = err.detail ?? null;
          }
        });

        if (!snapshots.length) {
          const detail = firstErrorDetail ? ` (${firstErrorDetail})` : "";
          let errorMsg = currentMessages.firestore;
          if (firstErrorCode === "not_found") {
            errorMsg = currentMessages.noSnapshot;
          } else if (firstErrorCode === "decode_error") {
            errorMsg = currentMessages.decode;
          }
          setRows([]);
          setUpdatedAt(null);
          setError(`${errorMsg}${detail}`);
          return;
        }

        let nextUpdatedAt: number | null = null;
        const mergedByIdentifier = new Map<string, ToplistGuildRow>();
        const mergedWithoutIdentifier: ToplistGuildRow[] = [];

        snapshots.forEach((snapshot) => {
          if (snapshot.updatedAt != null) {
            nextUpdatedAt = nextUpdatedAt == null ? snapshot.updatedAt : Math.max(nextUpdatedAt, snapshot.updatedAt);
          }

          const guilds = Array.isArray(snapshot.guilds) ? snapshot.guilds : [];
          guilds.forEach((rawRow: ToplistGuildRow) => {
            const row = normalizeGuildNumericRow(rawRow);
            const identifier = resolveGuildIdentifier(row);
            if (!identifier) {
              mergedWithoutIdentifier.push(row);
              return;
            }

            const existing = mergedByIdentifier.get(identifier);
            if (!existing) {
              mergedByIdentifier.set(identifier, row);
              return;
            }

            const existingScanSec = resolveGuildLastScanSec(existing);
            const nextScanSec = resolveGuildLastScanSec(row);
            if (nextScanSec != null && (existingScanSec == null || nextScanSec > existingScanSec)) {
              mergedByIdentifier.set(identifier, row);
            }
          });
        });

        setRows([...mergedByIdentifier.values(), ...mergedWithoutIdentifier]);
        setUpdatedAt(nextUpdatedAt);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        console.error("[GuildToplists] unexpected error", err);
        setRows([]);
        setUpdatedAt(null);
        setError(currentMessages.unexpected);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [hasReadOnlyData, isPresetRender, resolvedServerKey]);

  const fmtNum = (n: number | null | undefined) => (n == null ? "" : new Intl.NumberFormat("de-DE").format(n));
  const fmtGroupedInt = (n: number | null | undefined) => {
    if (n == null || !Number.isFinite(n)) return "";
    const rounded = Math.round(n);
    return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 })
      .format(rounded)
      .replace(/\./g, " ");
  };
  const fmtDelta = (n: number | null | undefined) => formatToplistDelta(n, (value) => fmtGroupedInt(value));
  const renderGuildDelta = (value: number | null | undefined, missing: boolean) => {
    if (!showCompare) return null;
    if (missing) return <div style={TOPLIST_DELTA_SUBTEXT_STYLE}>-</div>;
    if (value == null) return null;
    return <div style={TOPLIST_DELTA_SUBTEXT_STYLE}>{fmtDelta(value)}</div>;
  };
  const getGuildRowCompare = (row: ToplistGuildRow) => {
    const deltas = ((row as any)._delta ?? {}) as Record<string, number | null | undefined>;
    const compareMissing = showCompare ? Boolean((row as any)._compareMissing) : false;
    const rankDeltaDisplay = showCompare
      ? getToplistRankDeltaDisplay((row as any)._rankDelta, compareMissing, (value) => fmtGroupedInt(value))
      : null;
    return { deltas, compareMissing, rankDeltaDisplay };
  };
  const guildAvgMainDelta = (deltas: Record<string, number | null | undefined>) =>
    effectiveGuildAvgMode === "total" ? deltas.avgAttrTotal : deltas.avgBaseMain;
  const guildAvgConDelta = (deltas: Record<string, number | null | undefined>) =>
    effectiveGuildAvgMode === "total" ? deltas.avgConTotal : deltas.avgConBase;
  const guildAvgSumDelta = (deltas: Record<string, number | null | undefined>) =>
    effectiveGuildAvgMode === "total" ? deltas.avgTotalStats : deltas.avgSumBaseTotal;
  const fmtDate = (ts: number | null | undefined) => {
    return formatScanDateTimeLabel(ts);
  };

  const favoriteGuildSet = useMemo(() => {
    const keys = Object.keys(user?.favorites?.guilds ?? {});
    return new Set(keys.map((key) => normalizeFavoriteIdentifier(key)).filter((v): v is string => !!v));
  }, [user?.favorites?.guilds]);

  const activeSortKey = resolveGuildSort(sortKey);
  const activeGuildAvgMode = guildAvgMode === "total" ? "total" : "base";
  const effectiveGuildAvgMode = hasReadOnlyData ? (presetReadOnlyData?.avgMode ?? activeGuildAvgMode) : activeGuildAvgMode;
  const effectiveLoading = hasReadOnlyData ? (presetReadOnlyData?.loading ?? false) : loading;
  const effectiveError = hasReadOnlyData ? (presetReadOnlyData?.error ?? null) : error;
  const effectiveUpdatedAt = hasReadOnlyData ? (presetReadOnlyData?.updatedAt ?? null) : updatedAt;
  const compareLoading = hasReadOnlyData ? (presetReadOnlyData?.compareLoading ?? false) : false;
  const compareExpected = hasReadOnlyData ? (presetReadOnlyData?.compareExpected ?? false) : false;
  const showCompare = hasReadOnlyData ? (presetReadOnlyData?.showCompare ?? false) : false;
  const compareError = hasReadOnlyData ? (presetReadOnlyData?.compareError ?? null) : null;
  const avgSumSortMode: "base" | "total" = activeSortKey === "guildAvgSum" ? effectiveGuildAvgMode : "base";
  const handleGuildAvgModeChange = (nextMode: "base" | "total") => {
    if (hasReadOnlyData) {
      if (nextMode !== effectiveGuildAvgMode) onAvgModeChange?.(nextMode);
      return;
    }
    if (nextMode === guildAvgMode) return;
    setGuildAvgMode(nextMode);
  };


  const computedDisplayRows = useMemo(() => {
    let list = hasReadOnlyData ? [...(presetReadOnlyData?.rows ?? [])] : Array.isArray(rows) ? [...rows] : [];
    if (!list.length) return list;
    if (hasReadOnlyData) return list;

    if (favoritesOnly && user) {
      list = list.filter((row) => {
        const identifier = buildGuildFavoriteIdentifierFromRow(row);
        return !!(identifier && favoriteGuildSet.has(identifier));
      });
    }

    list.sort((a, b) => {
      let cmp = 0;
      switch (activeSortKey) {
        case "guildMembers":
          cmp = compareNumberDesc(a.memberCount, b.memberCount);
          break;
        case "guildAvgMain":
          cmp = compareNumberDesc(getGuildAvgMain(a, effectiveGuildAvgMode), getGuildAvgMain(b, effectiveGuildAvgMode));
          break;
        case "guildAvgCon":
          cmp = compareNumberDesc(getGuildAvgCon(a, effectiveGuildAvgMode), getGuildAvgCon(b, effectiveGuildAvgMode));
          break;
        case "guildAvgSum":
          cmp = compareNumberDesc(getGuildAvgSum(a, avgSumSortMode), getGuildAvgSum(b, avgSumSortMode));
          break;
        case "guildRaids":
          cmp = compareNumberDesc(a.raids, b.raids);
          break;
        case "guildHydra":
          cmp = compareNumberDesc(a.hydra, b.hydra);
          break;
        case "guildAvgLevel":
        default:
          cmp = compareNumberDesc(a.avgLevel, b.avgLevel);
          break;
      }
      if (cmp !== 0) return cmp;

      const nameCmp = compareTextAsc(String(a.name ?? ""), String(b.name ?? ""));
      if (nameCmp !== 0) return nameCmp;
      return compareTextAsc(String(a.server ?? ""), String(b.server ?? ""));
    });

    return list;
  }, [activeSortKey, avgSumSortMode, effectiveGuildAvgMode, favoriteGuildSet, favoritesOnly, hasReadOnlyData, presetReadOnlyData?.rows, rows, user]);
  const displayRows = useMemo(
    () => (hasReadOnlyData && isPresetRender ? (presetReadOnlyData?.rows ?? []) : computedDisplayRows),
    [computedDisplayRows, hasReadOnlyData, isPresetRender, presetReadOnlyData]
  );
  const renderedRows = useMemo(
    () => (captureRowLimit == null ? displayRows : displayRows.slice(0, captureRowLimit)),
    [captureRowLimit, displayRows]
  );
  const highlightedIdentifier = useToplistRowFocus({
    focusIdentifier,
    focusNonce,
    disabled: isPresetRender || effectiveLoading,
    scrollContainerRef: (tableRef ?? tableScrollRef) as React.RefObject<HTMLElement | null>,
  });
  const mobileRenderedGuildKeys = useMemo(() => {
    const keys = new Set<string>();
    renderedRows.forEach((row, idx) => {
      keys.add(resolveGuildIdentifier(row) ?? `${row.guildId}-${row.server}-${idx}`);
    });
    return keys;
  }, [renderedRows]);

  useEffect(() => {
    setExpandedMobileGuildKey((prev) => (prev && mobileRenderedGuildKeys.has(prev) ? prev : null));
  }, [mobileRenderedGuildKeys]);

  const virtualRowHeight = showCompare ? 72 : 56;
  const virtualTotalSize = renderedRows.length * virtualRowHeight;
  const firstRenderedIdentifier = renderedRows.length > 0 ? resolveGuildIdentifier(renderedRows[0]) ?? "" : "";
  const lastRenderedIdentifier =
    renderedRows.length > 0 ? resolveGuildIdentifier(renderedRows[renderedRows.length - 1]) ?? "" : "";
  const captureReady =
    !effectiveLoading &&
    renderedRows.length > 0 &&
    (!compareExpected || (!compareLoading && showCompare));
  const captureStabilityKey = [
    renderMode,
    effectiveLoading ? "loading:1" : "loading:0",
    `rows:${renderedRows.length}`,
    `sort:${activeSortKey}`,
    `avg:${effectiveGuildAvgMode}`,
    `rowH:${virtualRowHeight}`,
    compareExpected ? "cmp:1" : "cmp:0",
    compareLoading ? "cmpLoading:1" : "cmpLoading:0",
    showCompare ? "showCompare:1" : "showCompare:0",
    `virt:${virtualTotalSize}`,
    `first:${firstRenderedIdentifier}`,
    `last:${lastRenderedIdentifier}`,
  ].join("|");

  useEffect(() => {
    if (!isPresetRender) return;
    if (!onCaptureStatusChange) return;
    const nextStatus: ToplistCaptureStatus = {
      loading: effectiveLoading,
      rowCount: renderedRows.length,
      ready: captureReady,
      stabilityKey: captureStabilityKey,
      compareLoading,
      compareExpected,
      showCompare,
      virtualRowHeight,
      virtualTotalSize,
    };
    const signature = JSON.stringify(nextStatus);
    if (captureStatusSignatureRef.current === signature) return;
    captureStatusSignatureRef.current = signature;
    onCaptureStatusChange(nextStatus);
  }, [
    captureReady,
    captureStabilityKey,
    compareExpected,
    compareLoading,
    effectiveLoading,
    isPresetRender,
    onCaptureStatusChange,
    renderedRows.length,
    showCompare,
    virtualRowHeight,
    virtualTotalSize,
  ]);

  const openGuildProfile = (row: ToplistGuildRow) => {
    if (isPresetRender) return;
    const guildId = String(row.guildId ?? "").trim();
    if (!guildId) return;
    const rowIdentifier = resolveGuildIdentifier(row);
    setSelectedGuildProfile({
      identifier: rowIdentifier ?? buildGuildToplistIdentifier(row.server, guildId) ?? guildId,
      guildId,
      name: typeof row.name === "string" ? row.name : null,
      server: typeof row.server === "string" ? row.server : null,
    });
  };

  const getGuildSortMetric = (row: ToplistGuildRow) => {
    const valueOrDash = (value: string | number | null | undefined) => {
      const text = String(value ?? "").trim();
      return text || "-";
    };
    switch (activeSortKey) {
      case "guildMembers":
        return { label: t("toplists.columns.members", "Members"), value: valueOrDash(fmtNum(row.memberCount)) };
      case "guildAvgMain":
        return { label: t("toplists.columns.avgMain", "\u00F8 Main"), value: valueOrDash(fmtGroupedInt(getGuildAvgMain(row, effectiveGuildAvgMode))) };
      case "guildAvgCon":
        return { label: t("toplists.columns.avgCon", "\u00F8 Con"), value: valueOrDash(fmtGroupedInt(getGuildAvgCon(row, effectiveGuildAvgMode))) };
      case "guildAvgSum":
        return { label: t("toplists.columns.avgSum", "\u00F8 Sum"), value: valueOrDash(fmtGroupedInt(getGuildAvgSum(row, avgSumSortMode))) };
      case "guildRaids":
        return { label: t("toplists.columns.raids", "Raids"), value: valueOrDash(fmtNum(row.raids)) };
      case "guildHydra":
        return { label: t("toplists.columns.hydra", "Hydra"), value: valueOrDash(fmtNum(row.hydra)) };
      case "guildAvgLevel":
      default:
        return { label: t("toplists.columns.avgLevel", "\u00F8 Level"), value: valueOrDash(fmtNum(row.avgLevel)) };
    }
  };

  const renderGuildMobileDetailItem = (
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

  const renderGuildMobileAccordion = () => (
    <div
      ref={tableRef}
      className="toplists-mobile-list"
      data-toplists-export-root="true"
    >
      {renderedRows.map((row, idx) => {
        const rowIdentifier = resolveGuildIdentifier(row);
        const rowKey = rowIdentifier ?? `${row.guildId}-${row.server}-${idx}`;
        const isFocusedRow = Boolean(rowIdentifier && highlightedIdentifier === rowIdentifier);
        const isExpanded = expandedMobileGuildKey === rowKey;
        const lastScanSec = resolveGuildLastScanSec(row);
        const sortMetric = getGuildSortMetric(row);
        const guildName = String(row.name ?? "").trim() || "-";
        const guildServer = String(row.server ?? "").trim();
        const guildId = String(row.guildId ?? "").trim();
        const detailId = `toplist-guild-mobile-details-${idx}`;
        const compare = getGuildRowCompare(row);

        return (
          <div
            key={rowKey}
            className={`toplists-mobile-row${isExpanded ? " toplists-mobile-row--open" : ""}${isFocusedRow ? " toplists-mobile-row--focused" : ""}`}
            data-sfh-identifier={rowIdentifier ?? undefined}
          >
            <button
              type="button"
              className="toplists-mobile-summary"
              aria-expanded={isExpanded}
              aria-controls={detailId}
              onClick={() => setExpandedMobileGuildKey((prev) => (prev === rowKey ? null : rowKey))}
            >
              <span className="toplists-mobile-rank">
                #{idx + 1}
                {compare.rankDeltaDisplay ? (
                  <span className={`rank-delta-chip rank-delta-chip--${compare.rankDeltaDisplay.variant}`}>
                    {compare.rankDeltaDisplay.text}
                  </span>
                ) : null}
              </span>
              <span className="toplists-mobile-guild-identity">
                <span className="toplists-mobile-name">{guildName}</span>
                <span className="toplists-mobile-meta">{guildServer || "-"}</span>
              </span>
              <span className="toplists-mobile-metric">
                <span className="toplists-mobile-metric-value">{sortMetric.value}</span>
                <span className="toplists-mobile-metric-label">{sortMetric.label}</span>
              </span>
              <span className="toplists-mobile-chevron" aria-hidden />
            </button>
            {isExpanded && (
              <div id={detailId} className="toplists-mobile-details">
                <div
                  className="toplists-mobile-actions toplists-mobile-actions--single"
                  onClick={(event) => event.stopPropagation()}
                >
                  <NeonCoreButton
                    label={t("toplists.mobileActions.guildProfile", "Gildenprofil")}
                    title={t("toplists.mobileActions.guildProfile", "Gildenprofil")}
                    icon={null}
                    disabled={!guildId}
                    className="toplists-mobile-action-button"
                    onClick={() => openGuildProfile(row)}
                  />
                </div>
                {renderGuildMobileDetailItem("hofRank", t("toplists.columns.hofRank", "HoF Rank"), fmtNum(row.hofRank) || "-", renderGuildDelta(compare.deltas.hofRank, compare.compareMissing))}
                {renderGuildMobileDetailItem("honor", t("toplists.columns.honor", "Honor"), fmtGroupedInt(row.honor) || "-", renderGuildDelta(compare.deltas.honor, compare.compareMissing))}
                {renderGuildMobileDetailItem("raids", t("toplists.columns.raids", "Raids"), fmtNum(row.raids) || "-", renderGuildDelta(compare.deltas.raids, compare.compareMissing))}
                {renderGuildMobileDetailItem("portal", t("toplists.columns.portal", "Portal"), fmtNum(row.portalFloor) || "-", renderGuildDelta(compare.deltas.portalFloor, compare.compareMissing))}
                {renderGuildMobileDetailItem("hydra", t("toplists.columns.hydra", "Hydra"), fmtNum(row.hydra) || "-", renderGuildDelta(compare.deltas.hydra, compare.compareMissing))}
                {renderGuildMobileDetailItem("petLevel", t("toplists.columns.petLevel", "Pet Level"), fmtNum(row.petLevel) || "-", renderGuildDelta(compare.deltas.petLevel, compare.compareMissing))}
                {renderGuildMobileDetailItem("members", t("toplists.columns.members", "Members"), fmtNum(row.memberCount) || "-", renderGuildDelta(compare.deltas.memberCount, compare.compareMissing))}
                {renderGuildMobileDetailItem("avgLevel", t("toplists.columns.avgLevel", "\u00F8 Level"), fmtNum(row.avgLevel) || "-", renderGuildDelta(compare.deltas.avgLevel, compare.compareMissing))}
                {renderGuildMobileDetailItem("avgMain", t("toplists.columns.avgMain", "\u00F8 Main"), fmtGroupedInt(getGuildAvgMain(row, effectiveGuildAvgMode)) || "-", renderGuildDelta(guildAvgMainDelta(compare.deltas), compare.compareMissing))}
                {renderGuildMobileDetailItem("avgCon", t("toplists.columns.avgCon", "\u00F8 Con"), fmtGroupedInt(getGuildAvgCon(row, effectiveGuildAvgMode)) || "-", renderGuildDelta(guildAvgConDelta(compare.deltas), compare.compareMissing))}
                {renderGuildMobileDetailItem("avgSum", t("toplists.columns.avgSum", "\u00F8 Sum"), fmtGroupedInt(getGuildAvgSum(row, effectiveGuildAvgMode)) || "-", renderGuildDelta(guildAvgSumDelta(compare.deltas), compare.compareMissing))}
                {renderGuildMobileDetailItem(
                  "lastScan",
                  t("toplists.columns.lastScan", "Last Scan"),
                  formatLastScanDisplay(lastScanSec) || "-",
                  undefined,
                  "toplists-mobile-detail-item--wide",
                )}
              </div>
            )}
          </div>
        );
      })}
      {effectiveLoading && renderedRows.length === 0 && (
        <div className="toplists-mobile-empty">{t("toplists.table.loading", "Loading...")}</div>
      )}
      {!effectiveLoading && !effectiveError && renderedRows.length === 0 && (
        <div className="toplists-mobile-empty">{t("toplists.table.noResults", "No results")}</div>
      )}
    </div>
  );

  const renderGuildBody = () => {
    const rows = renderedRows;

    return (
      <table className="toplists-table toplists-table--body" style={TOPLIST_TABLE_STYLE}>
        <GuildToplistColGroup />
        <tbody>
          {rows.map((row, idx) => {
            const rowIdentifier = resolveGuildIdentifier(row);
            const rowKey = rowIdentifier ?? `${row.guildId}-${row.server}-${idx}`;
            const isFocusedRow = Boolean(rowIdentifier && highlightedIdentifier === rowIdentifier);
            const lastScanSec = resolveGuildLastScanSec(row);
            const compare = getGuildRowCompare(row);
            const rowOnClick = (event: React.MouseEvent<HTMLTableRowElement>) => {
              event.preventDefault();
              event.stopPropagation();
              openGuildProfile(row);
            };

            return (
              <tr
                key={rowKey}
                className={`toplists-row${isFocusedRow ? " toplists-row--focused" : ""}`}
                data-sfh-identifier={rowIdentifier ?? undefined}
                style={{
                  borderBottom: "1px solid #2C4A73",
                  cursor: "pointer",
                  userSelect: "none",
                  height: virtualRowHeight,
                }}
                onClick={rowOnClick}
              >
                <td style={TOPLIST_CELL_STYLE_BY_KEY.rank}>
                  <div style={TOPLIST_FLEX_COLUMN_CENTER_STYLE}>
                    <span>{idx + 1}</span>
                    {compare.rankDeltaDisplay ? (
                      <span className={`rank-delta-chip rank-delta-chip--${compare.rankDeltaDisplay.variant}`}>
                        {compare.rankDeltaDisplay.text}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.server}>
                  <span style={TOPLIST_TEXT_CELL_CONTENT_STYLE}>{row.server}</span>
                </td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.name}>
                  <span style={TOPLIST_TEXT_CELL_CONTENT_STYLE}>{row.name}</span>
                </td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.hofRank}>
                  <div style={TOPLIST_FLEX_COLUMN_RIGHT_STYLE}><span>{fmtNum(row.hofRank)}</span>{renderGuildDelta(compare.deltas.hofRank, compare.compareMissing)}</div>
                </td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.honor}>
                  <div style={TOPLIST_FLEX_COLUMN_RIGHT_STYLE}><span>{fmtGroupedInt(row.honor)}</span>{renderGuildDelta(compare.deltas.honor, compare.compareMissing)}</div>
                </td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.raids}>
                  <div style={TOPLIST_FLEX_COLUMN_RIGHT_STYLE}><span>{fmtNum(row.raids)}</span>{renderGuildDelta(compare.deltas.raids, compare.compareMissing)}</div>
                </td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.portal}>
                  <div style={TOPLIST_FLEX_COLUMN_RIGHT_STYLE}><span>{fmtNum(row.portalFloor)}</span>{renderGuildDelta(compare.deltas.portalFloor, compare.compareMissing)}</div>
                </td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.hydra}>
                  <div style={TOPLIST_FLEX_COLUMN_RIGHT_STYLE}><span>{fmtNum(row.hydra)}</span>{renderGuildDelta(compare.deltas.hydra, compare.compareMissing)}</div>
                </td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.petLevel}>
                  <div style={TOPLIST_FLEX_COLUMN_RIGHT_STYLE}><span>{fmtNum(row.petLevel)}</span>{renderGuildDelta(compare.deltas.petLevel, compare.compareMissing)}</div>
                </td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.members}>
                  <div style={TOPLIST_FLEX_COLUMN_RIGHT_STYLE}><span>{fmtNum(row.memberCount)}</span>{renderGuildDelta(compare.deltas.memberCount, compare.compareMissing)}</div>
                </td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.avgLevel}>
                  <div style={TOPLIST_FLEX_COLUMN_RIGHT_STYLE}><span>{fmtNum(row.avgLevel)}</span>{renderGuildDelta(compare.deltas.avgLevel, compare.compareMissing)}</div>
                </td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.avgMain}>
                  <div style={TOPLIST_FLEX_COLUMN_RIGHT_STYLE}>
                    <span style={{ display: "inline-block", minWidth: "9ch", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {fmtGroupedInt(getGuildAvgMain(row, effectiveGuildAvgMode))}
                    </span>
                    {renderGuildDelta(guildAvgMainDelta(compare.deltas), compare.compareMissing)}
                  </div>
                </td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.avgCon}>
                  <div style={TOPLIST_FLEX_COLUMN_RIGHT_STYLE}>
                    <span style={{ display: "inline-block", minWidth: "9ch", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {fmtGroupedInt(getGuildAvgCon(row, effectiveGuildAvgMode))}
                    </span>
                    {renderGuildDelta(guildAvgConDelta(compare.deltas), compare.compareMissing)}
                  </div>
                </td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.avgSum}>
                  <div style={TOPLIST_FLEX_COLUMN_RIGHT_STYLE}>
                    <span style={{ display: "inline-block", minWidth: "9ch", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {fmtGroupedInt(getGuildAvgSum(row, effectiveGuildAvgMode))}
                    </span>
                    {renderGuildDelta(guildAvgSumDelta(compare.deltas), compare.compareMissing)}
                  </div>
                </td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.lastScan}>
                  <span style={TOPLIST_LAST_SCAN_CONTENT_STYLE}>
                    <span style={TOPLIST_LAST_SCAN_LABEL_STYLE}>{formatLastScanDisplay(lastScanSec)}</span>
                  </span>
                </td>
              </tr>
            );
          })}
          {effectiveLoading && rows.length === 0 && (
            <tr>
              <td colSpan={GUILD_TABLE_COL_SPAN} style={{ padding: 12 }}>{t("toplists.table.loading", "Loading...")}</td>
            </tr>
          )}
          {!effectiveLoading && !effectiveError && rows.length === 0 && (
            <tr>
              <td colSpan={GUILD_TABLE_COL_SPAN} style={{ padding: 12 }}>{t("toplists.table.noResults", "No results")}</td>
            </tr>
          )}
        </tbody>
      </table>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: isPresetRender ? 0 : 12, minHeight: 0, height: isPresetRender ? "auto" : "100%" }}>
      <div style={{ opacity: 0.8, fontSize: 12 }}>
        {t("toplists.guilds.snapshotStatus", "Guilds - snapshots (latest)")}
        {resolvedServers.length ? ` - ${resolvedServers.join(", ")}` : ""}
      </div>
      <div style={{ opacity: 0.8, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
        <div>
          {effectiveLoading ? t("toplists.status.loading", "Loading...") : effectiveError ? t("toplists.status.error", "Error") : t("toplists.status.ready", "Ready")}
          {" - "}
          {renderedRows.length} {t("toplists.status.rows", "rows")}
        </div>
        <div>{effectiveUpdatedAt ? t("toplists.status.updated", "Updated: {{value}}", { value: fmtDate(effectiveUpdatedAt) }) : null}</div>
      </div>
      {showAvgModeControl && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, width: "fit-content" }}>
          <GuildAvgModeControls
            mode={effectiveGuildAvgMode}
            updating={false}
            onChange={handleGuildAvgModeChange}
            label={t("toplists.guilds.avgMode.label", "Values")}
            ariaLabel={t("toplists.guilds.avgMode.aria", "Guild average mode")}
            baseLabel={t("toplists.guilds.avgMode.base", "Base")}
            totalLabel={t("toplists.guilds.avgMode.total", "Total")}
            updatingLabel={t("toplists.guilds.avgMode.updating", "Updating...")}
          />
        </div>
      )}

      {effectiveError && (
        <div style={{ border: "1px solid #2C4A73", borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{t("toplists.status.error", "Error")}</div>
          <div style={{ wordBreak: "break-all" }}>{effectiveError}</div>
          <button onClick={() => navigate(`${location.pathname}${location.search}${location.hash}`)} style={{ marginTop: 8 }}>
            {t("toplists.actions.retry", "Retry")}
          </button>
        </div>
      )}

      {isCompactToplistView ? (
        renderGuildMobileAccordion()
      ) : (
        <div
          ref={tableRef}
          className="toplists-table-viewport"
          data-toplists-export-root="true"
          style={{ flex: isPresetRender ? "0 0 auto" : "1 1 auto", minHeight: 0, overflow: isPresetRender ? "visible" : undefined }}
        >
          <div className="toplists-table-header" style={{ paddingRight: 0 }}>
            <GuildToplistHeader />
          </div>
          <div
            ref={tableScrollRef}
            className="toplists-table-scroll"
            data-toplists-export-scroll="true"
            style={isPresetRender ? { overflow: "visible", maxHeight: "none", flex: "0 0 auto" } : undefined}
          >
            {renderGuildBody()}
          </div>
        </div>
      )}
      {!isPresetRender && renderFirestoreGuildOverlay && (
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
      )}
    </div>
  );
}
