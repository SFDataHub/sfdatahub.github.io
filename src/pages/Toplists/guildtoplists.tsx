// src/components/toplists/GuildToplists.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import {
  type FirestoreToplistGuildRow,
  type FirestoreLatestGuildToplistSnapshot,
  type FirestoreLatestGuildToplistResult,
} from "../../lib/api/toplistsFirestore";
import { SERVERS } from "../../data/servers";
import { useFilters } from "../../components/Filters/FilterContext";
import { useAuth } from "../../context/AuthContext";
import { useToplistsData } from "../../context/ToplistsDataContext";
import { formatScanDateTimeLabel } from "../../lib/ui/formatScanDateTimeLabel";
import type { ToplistExportAmount } from "../../components/export/ToplistPngExportDialog";
import type { ToplistCaptureStatus } from "../../components/export/ToplistExportController";
import GuildProfileOverlay from "../../components/ProfileOverlay/GuildProfileOverlay";

type GuildToplistsProps = {
  serverCodes?: string[];
  sortKey?: string;
  showAvgModeControl?: boolean;
  tableRef?: React.RefObject<HTMLDivElement>;
  renderMode?: "live" | "preset";
  presetAmount?: ToplistExportAmount | null;
  onCaptureStatusChange?: (status: ToplistCaptureStatus) => void;
  presetReadOnlyData?: GuildToplistsPresetData | null;
  onPresetReadOnlyDataChange?: (data: GuildToplistsPresetData) => void;
};

export type GuildToplistsPresetData = {
  rows: FirestoreToplistGuildRow[];
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
  avgMode: "base" | "total";
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

const buildGuildFavoriteIdentifierFromRow = (row: FirestoreToplistGuildRow): string | null => {
  const guildId = String(row.guildId ?? "").trim();
  if (!guildId) return null;
  const serverKey = buildCanonicalFavoriteServerKey(row.server);
  if (!serverKey) return null;
  return `${serverKey}_g${guildId}`.toLowerCase();
};

const resolveGuildIdentifier = (row: FirestoreToplistGuildRow): string | null => {
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

const normalizeGuildNumericRow = (row: FirestoreToplistGuildRow): FirestoreToplistGuildRow => ({
  ...row,
  hofRank: toFiniteNumber(row.hofRank),
  honor: toFiniteNumber(row.honor),
  raids: toFiniteNumber(row.raids),
  portalFloor: toFiniteNumber(row.portalFloor),
  hydra: toFiniteNumber(row.hydra),
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

const resolveGuildLastScanSec = (row: FirestoreToplistGuildRow): number | null => {
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

const getGuildAvgMain = (row: FirestoreToplistGuildRow, mode: "base" | "total") =>
  mode === "total" ? row.avgAttrTotal : row.avgBaseMain;

const getGuildAvgCon = (row: FirestoreToplistGuildRow, mode: "base" | "total") =>
  mode === "total" ? row.avgConTotal : row.avgConBase;

const getGuildAvgSum = (row: FirestoreToplistGuildRow, mode: "base" | "total") =>
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
}: GuildToplistsProps) {
  const { t, i18n } = useTranslation();
  const { favoritesOnly } = useFilters();
  const { user } = useAuth();
  const { getGuildToplistSnapshotCached } = useToplistsData();
  const isPresetRender = renderMode === "preset";
  const resolvedPresetAmount = presetAmount ?? 50;
  const captureRowLimit = isPresetRender ? resolvedPresetAmount : null;
  const [rows, setRows] = useState<FirestoreToplistGuildRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [guildAvgMode, setGuildAvgMode] = useState<"base" | "total">("base");
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
    const fallback = SERVERS.find((server) => server.id)?.id || "EU1";
    const fallbackCode = String(fallback).toUpperCase();
    return fallbackCode ? [fallbackCode] : [];
  }, [serverCodes]);
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
    if (isPresetRender) return;
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
        const snapshots: FirestoreLatestGuildToplistSnapshot[] = [];
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
        const mergedByIdentifier = new Map<string, FirestoreToplistGuildRow>();
        const mergedWithoutIdentifier: FirestoreToplistGuildRow[] = [];

        snapshots.forEach((snapshot) => {
          if (snapshot.updatedAt != null) {
            nextUpdatedAt = nextUpdatedAt == null ? snapshot.updatedAt : Math.max(nextUpdatedAt, snapshot.updatedAt);
          }

          const guilds = Array.isArray(snapshot.guilds) ? snapshot.guilds : [];
          guilds.forEach((rawRow: FirestoreToplistGuildRow) => {
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
  }, [isPresetRender, resolvedServerKey]);

  const fmtNum = (n: number | null | undefined) => (n == null ? "" : new Intl.NumberFormat("de-DE").format(n));
  const fmtGroupedInt = (n: number | null | undefined) => {
    if (n == null || !Number.isFinite(n)) return "";
    const rounded = Math.round(n);
    return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 })
      .format(rounded)
      .replace(/\./g, " ");
  };
  const fmtDate = (ts: number | null | undefined) => {
    return formatScanDateTimeLabel(ts);
  };

  const favoriteGuildSet = useMemo(() => {
    const keys = Object.keys(user?.favorites?.guilds ?? {});
    return new Set(keys.map((key) => normalizeFavoriteIdentifier(key)).filter((v): v is string => !!v));
  }, [user?.favorites?.guilds]);

  const activeSortKey = resolveGuildSort(sortKey);
  const activeGuildAvgMode = guildAvgMode === "total" ? "total" : "base";
  const effectiveGuildAvgMode = isPresetRender ? (presetReadOnlyData?.avgMode ?? activeGuildAvgMode) : activeGuildAvgMode;
  const effectiveLoading = isPresetRender ? (presetReadOnlyData?.loading ?? false) : loading;
  const effectiveError = isPresetRender ? (presetReadOnlyData?.error ?? null) : error;
  const effectiveUpdatedAt = isPresetRender ? (presetReadOnlyData?.updatedAt ?? null) : updatedAt;
  const avgSumSortMode: "base" | "total" = activeSortKey === "guildAvgSum" ? activeGuildAvgMode : "base";
  const handleGuildAvgModeChange = (nextMode: "base" | "total") => {
    if (nextMode === guildAvgMode) return;
    setGuildAvgMode(nextMode);
  };


  const computedDisplayRows = useMemo(() => {
    let list = Array.isArray(rows) ? [...rows] : [];
    if (!list.length) return list;

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
          cmp = compareNumberDesc(getGuildAvgMain(a, activeGuildAvgMode), getGuildAvgMain(b, activeGuildAvgMode));
          break;
        case "guildAvgCon":
          cmp = compareNumberDesc(getGuildAvgCon(a, activeGuildAvgMode), getGuildAvgCon(b, activeGuildAvgMode));
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
  }, [rows, favoritesOnly, user, favoriteGuildSet, activeSortKey, avgSumSortMode, activeGuildAvgMode]);
  const displayRows = useMemo(
    () => (isPresetRender ? (presetReadOnlyData?.rows ?? []) : computedDisplayRows),
    [computedDisplayRows, isPresetRender, presetReadOnlyData]
  );
  const renderedRows = useMemo(
    () => (captureRowLimit == null ? displayRows : displayRows.slice(0, captureRowLimit)),
    [captureRowLimit, displayRows]
  );

  const virtualTotalSize = renderedRows.length * 56;
  const firstRenderedIdentifier = renderedRows.length > 0 ? resolveGuildIdentifier(renderedRows[0]) ?? "" : "";
  const lastRenderedIdentifier =
    renderedRows.length > 0 ? resolveGuildIdentifier(renderedRows[renderedRows.length - 1]) ?? "" : "";
  const captureReady = !effectiveLoading && renderedRows.length > 0;
  const captureStabilityKey = [
    renderMode,
    effectiveLoading ? "loading:1" : "loading:0",
    `rows:${renderedRows.length}`,
    `sort:${activeSortKey}`,
    `avg:${effectiveGuildAvgMode}`,
    "rowH:56",
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
      compareLoading: false,
      compareExpected: false,
      showCompare: false,
      virtualRowHeight: 56,
      virtualTotalSize,
    };
    const signature = JSON.stringify(nextStatus);
    if (captureStatusSignatureRef.current === signature) return;
    captureStatusSignatureRef.current = signature;
    onCaptureStatusChange(nextStatus);
  }, [
    captureReady,
    captureStabilityKey,
    effectiveLoading,
    isPresetRender,
    onCaptureStatusChange,
    renderedRows.length,
    virtualTotalSize,
  ]);

  const renderGuildBody = () => {
    const rows = renderedRows;

    return (
      <table className="toplists-table toplists-table--body" style={TOPLIST_TABLE_STYLE}>
        <GuildToplistColGroup />
        <tbody>
          {rows.map((row, idx) => {
            const rowIdentifier = resolveGuildIdentifier(row);
            const rowKey = rowIdentifier ?? `${row.guildId}-${row.server}-${idx}`;
            const lastScanSec = resolveGuildLastScanSec(row);
            const rowOnClick = (event: React.MouseEvent<HTMLTableRowElement>) => {
              event.preventDefault();
              event.stopPropagation();
              if (isPresetRender) return;
              const guildId = String(row.guildId ?? "").trim();
              if (!guildId) return;
              setSelectedGuildProfile({
                identifier: rowIdentifier ?? buildGuildToplistIdentifier(row.server, guildId) ?? guildId,
                guildId,
                name: typeof row.name === "string" ? row.name : null,
                server: typeof row.server === "string" ? row.server : null,
              });
            };

            return (
              <tr
                key={rowKey}
                className="toplists-row"
                data-sfh-identifier={rowIdentifier ?? undefined}
                style={{
                  borderBottom: "1px solid #2C4A73",
                  cursor: "pointer",
                  userSelect: "none",
                  height: 56,
                }}
                onClick={rowOnClick}
              >
                <td style={TOPLIST_CELL_STYLE_BY_KEY.rank}>{idx + 1}</td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.server}>
                  <span style={TOPLIST_TEXT_CELL_CONTENT_STYLE}>{row.server}</span>
                </td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.name}>
                  <span style={TOPLIST_TEXT_CELL_CONTENT_STYLE}>{row.name}</span>
                </td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.hofRank}>{fmtNum(row.hofRank)}</td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.honor}>{fmtGroupedInt(row.honor)}</td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.raids}>{fmtNum(row.raids)}</td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.portal}>{fmtNum(row.portalFloor)}</td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.hydra}>{fmtNum(row.hydra)}</td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.petLevel}>{fmtNum(row.instructor)}</td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.members}>{fmtNum(row.memberCount)}</td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.avgLevel}>{fmtNum(row.avgLevel)}</td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.avgMain}>
                  <span style={{ display: "inline-block", minWidth: "9ch", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {fmtGroupedInt(getGuildAvgMain(row, effectiveGuildAvgMode))}
                  </span>
                </td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.avgCon}>
                  <span style={{ display: "inline-block", minWidth: "9ch", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {fmtGroupedInt(getGuildAvgCon(row, effectiveGuildAvgMode))}
                  </span>
                </td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.avgSum}>
                  <span style={{ display: "inline-block", minWidth: "9ch", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {fmtGroupedInt(getGuildAvgSum(row, effectiveGuildAvgMode))}
                  </span>
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
            mode={activeGuildAvgMode}
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
      {!isPresetRender && (
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
