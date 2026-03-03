// src/components/toplists/GuildToplists.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
  getLatestGuildToplistSnapshotCached,
  type FirestoreToplistGuildRow,
  type FirestoreLatestGuildToplistSnapshot,
  type FirestoreLatestGuildToplistResult,
} from "../../lib/api/toplistsFirestore";
import { SERVERS } from "../../data/servers";
import i18n from "../../i18n";
import { useFilters } from "../../components/Filters/FilterContext";
import { useAuth } from "../../context/AuthContext";
import { formatScanDateTimeLabel } from "../../lib/ui/formatScanDateTimeLabel";
import type { ToplistExportRow } from "../../components/export/ToplistExportTable";
import GuildProfileOverlay from "../../components/ProfileOverlay/GuildProfileOverlay";

type GuildToplistsProps = {
  serverCodes?: string[];
  sortKey?: string;
  tableRef?: React.RefObject<HTMLDivElement>;
  exportSnapshotRef?: React.MutableRefObject<{
    rows: ToplistExportRow[];
    showCompare: boolean;
  }>;
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

const TOPLIST_CELL_STYLE_BY_KEY = GUILD_COLUMNS.reduce((acc, column) => {
  acc[column.key] = { ...TOPLIST_CELL_BASE_STYLE, textAlign: column.align };
  return acc;
}, {} as Record<GuildColumnKey, React.CSSProperties>);

const normalizeServerList = (list: string[]) => {
  const set = new Set<string>();
  list.forEach((entry) => {
    const normalized = String(entry || "").trim().toUpperCase();
    if (normalized) set.add(normalized);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
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
  const explicitIdentifier = String((row as any).identifier ?? "").trim();
  if (explicitIdentifier) return explicitIdentifier.toLowerCase();
  const guildId = String(row.guildId ?? "").trim();
  const server = String(row.server ?? "").trim().toLowerCase();
  if (!guildId || !server) return null;
  return `${server}_g${guildId}`;
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
    case "guildAvgSum":
    case "guildLastScan":
      return String(value).trim();
    default:
      return "guildAvgLevel";
  }
};

const buildGuildExportRows = (rows: FirestoreToplistGuildRow[]): ToplistExportRow[] => {
  return rows.map((row) => ({
    identifier: `${String(row.server ?? "").trim()}_g${String(row.guildId ?? "").trim()}`,
    playerId: String(row.guildId ?? "").trim() || null,
    flag: null,
    deltaRank: null,
    server: String(row.server ?? ""),
    name: String(row.name ?? ""),
    class: "",
    level: row.avgLevel,
    guild: String(row.name ?? ""),
    main: row.avgBaseMain,
    con: row.avgConBase,
    sum: row.avgSumBaseTotal,
    ratio: null,
    mainTotal: row.avgAttrTotal,
    conTotal: row.avgConTotal,
    sumTotal: row.avgTotalStats,
    xpProgress: null,
    xpTotal: null,
    mine: row.avgMine,
    treasury: row.avgTreasury,
    lastScan: row.latestScanAtSec != null ? String(row.latestScanAtSec) : row.lastScan,
    deltaSum: null,
    _calculatedSum: row.avgSumBaseTotal,
  }));
};

const formatLastScanDisplay = (value: unknown): string => formatScanDateTimeLabel(value);

export default function GuildToplists({ serverCodes, sortKey, tableRef, exportSnapshotRef }: GuildToplistsProps) {
  const { favoritesOnly } = useFilters();
  const { user } = useAuth();
  const [rows, setRows] = useState<FirestoreToplistGuildRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [selectedGuildProfile, setSelectedGuildProfile] = useState<{
    identifier: string;
    guildId: string;
    name: string | null;
    server: string | null;
  } | null>(null);
  const [tableScrollbarWidth, setTableScrollbarWidth] = useState(0);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    if (!resolvedServers.length) {
      setRows([]);
      setUpdatedAt(null);
      setError(i18n.t("toplistsPage.errors.noSnapshot", "No snapshot yet for this server."));
      setLoading(false);
      return () => {
        active = false;
      };
    }

    Promise.all(resolvedServers.map((serverCode) => getLatestGuildToplistSnapshotCached(serverCode)))
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
          let errorMsg = "Firestore Fehler";
          if (firstErrorCode === "not_found") {
            errorMsg = i18n.t("toplistsPage.errors.noSnapshot", "No snapshot yet for this server.");
          } else if (firstErrorCode === "decode_error") {
            errorMsg = "Fehler beim Lesen der Daten";
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
        setError("Unerwarteter Fehler beim Laden");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [resolvedServerKey]);

  const fmtNum = (n: number | null | undefined) => (n == null ? "" : new Intl.NumberFormat("en").format(n));
  const fmtDate = (ts: number | null | undefined) => {
    return formatScanDateTimeLabel(ts);
  };

  const favoriteGuildSet = useMemo(() => {
    const keys = Object.keys(user?.favorites?.guilds ?? {});
    return new Set(keys.map((key) => normalizeFavoriteIdentifier(key)).filter((v): v is string => !!v));
  }, [user?.favorites?.guilds]);

  const activeSortKey = resolveGuildSort(sortKey);

  const displayRows = useMemo(() => {
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
        case "guildAvgSum":
          cmp = compareNumberDesc(a.avgSumBaseTotal, b.avgSumBaseTotal);
          break;
        case "guildLastScan":
          cmp = compareNumberDesc(resolveGuildLastScanSec(a), resolveGuildLastScanSec(b));
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
  }, [rows, favoritesOnly, user, favoriteGuildSet, activeSortKey]);

  const rowVirtualizer = useVirtualizer({
    count: displayRows.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 56,
    overscan: 12,
    getItemKey: (index) => resolveGuildIdentifier(displayRows[index]) ?? `guild-row-${index}`,
  });

  useEffect(() => {
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
  }, [displayRows.length]);

  const exportRows = useMemo(() => buildGuildExportRows(displayRows), [displayRows]);

  useEffect(() => {
    if (!exportSnapshotRef) return;
    exportSnapshotRef.current = {
      rows: exportRows,
      showCompare: false,
    };
  }, [exportRows, exportSnapshotRef]);

  const renderGuildColGroup = () => (
    <colgroup>
      {GUILD_COLUMNS.map((column) => (
        <col key={column.key} style={{ width: column.width }} />
      ))}
    </colgroup>
  );

  const renderGuildHeader = () => (
    <table className="toplists-table toplists-table--header" style={TOPLIST_TABLE_STYLE}>
      {renderGuildColGroup()}
      <thead>
        <tr style={TOPLIST_HEADER_ROW_STYLE}>
          {GUILD_COLUMNS.map((column) => (
            <th key={column.key} style={TOPLIST_CELL_STYLE_BY_KEY[column.key]}>
              <span style={TOPLIST_HEADER_LABEL_STYLE}>{column.label}</span>
            </th>
          ))}
        </tr>
      </thead>
    </table>
  );

  const renderGuildBody = () => {
    const virtualItems = rowVirtualizer.getVirtualItems();
    const topSpacerHeight = virtualItems.length ? virtualItems[0].start : 0;
    const bottomSpacerHeight = virtualItems.length
      ? Math.max(0, rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end)
      : 0;

    return (
      <table className="toplists-table toplists-table--body" style={TOPLIST_TABLE_STYLE}>
        {renderGuildColGroup()}
        <tbody>
          {displayRows.length > 0 && topSpacerHeight > 0 && (
            <tr aria-hidden>
              <td colSpan={GUILD_TABLE_COL_SPAN} style={{ height: topSpacerHeight, padding: 0, border: 0 }} />
            </tr>
          )}
          {virtualItems.map((virtualRow) => {
            const idx = virtualRow.index;
            const row = displayRows[idx];
            if (!row) return null;
            const rowIdentifier = resolveGuildIdentifier(row);
            const rowKey = rowIdentifier ?? `${row.guildId}-${row.server}-${idx}`;
            const isFocusedRow = Boolean(
              rowIdentifier &&
              selectedGuildProfile?.identifier &&
              selectedGuildProfile.identifier === rowIdentifier
            );
            const lastScanSec = resolveGuildLastScanSec(row);
            const rowOnClick = (event: React.MouseEvent<HTMLTableRowElement>) => {
              event.preventDefault();
              event.stopPropagation();
              const guildId = String(row.guildId ?? "").trim();
              if (!guildId) return;
              setSelectedGuildProfile({
                identifier: rowIdentifier ?? `${String(row.server ?? "").trim().toLowerCase()}_g${guildId}`,
                guildId,
                name: typeof row.name === "string" ? row.name : null,
                server: typeof row.server === "string" ? row.server : null,
              });
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
                <td style={TOPLIST_CELL_STYLE_BY_KEY.honor}>{fmtNum(row.honor)}</td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.raids}>{fmtNum(row.raids)}</td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.portal}>{fmtNum(row.portalFloor)}</td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.hydra}>{fmtNum(row.hydra)}</td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.petLevel}>{fmtNum(row.instructor)}</td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.members}>{fmtNum(row.memberCount)}</td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.avgLevel}>{fmtNum(row.avgLevel)}</td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.avgMain}>{fmtNum(row.avgBaseMain)}</td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.avgCon}>{fmtNum(row.avgConBase)}</td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.avgSum}>{fmtNum(row.avgSumBaseTotal)}</td>
                <td style={TOPLIST_CELL_STYLE_BY_KEY.lastScan}>
                  <span style={TOPLIST_LAST_SCAN_CONTENT_STYLE}>
                    <span style={TOPLIST_LAST_SCAN_LABEL_STYLE}>{formatLastScanDisplay(lastScanSec)}</span>
                  </span>
                </td>
              </tr>
            );
          })}
          {loading && displayRows.length === 0 && (
            <tr>
              <td colSpan={GUILD_TABLE_COL_SPAN} style={{ padding: 12 }}>Loading...</td>
            </tr>
          )}
          {!loading && !error && displayRows.length === 0 && (
            <tr>
              <td colSpan={GUILD_TABLE_COL_SPAN} style={{ padding: 12 }}>No results</td>
            </tr>
          )}
          {displayRows.length > 0 && bottomSpacerHeight > 0 && (
            <tr aria-hidden>
              <td colSpan={GUILD_TABLE_COL_SPAN} style={{ height: bottomSpacerHeight, padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    );
  };

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
      <div style={{ opacity: 0.8, fontSize: 12 }}>
        Guilds - snapshots (latest){resolvedServers.length ? ` - ${resolvedServers.join(", ")}` : ""}
      </div>
      <div style={{ opacity: 0.8, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
        <div>{loading ? "Loading..." : error ? "Error" : "Ready"} - {displayRows.length} rows</div>
        <div>{updatedAt ? `Updated: ${fmtDate(updatedAt)}` : null}</div>
      </div>

      {error && (
        <div style={{ border: "1px solid #2C4A73", borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Error</div>
          <div style={{ wordBreak: "break-all" }}>{error}</div>
          <button onClick={() => navigate(`${location.pathname}${location.search}${location.hash}`)} style={{ marginTop: 8 }}>
            Retry
          </button>
        </div>
      )}

      <div ref={tableRef} className="toplists-table-viewport">
        <div className="toplists-table-header" style={{ paddingRight: tableScrollbarWidth }}>
          {renderGuildHeader()}
        </div>
        <div ref={tableScrollRef} className="toplists-table-scroll">
          {renderGuildBody()}
        </div>
      </div>
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
