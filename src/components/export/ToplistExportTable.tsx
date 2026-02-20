import type { FirestoreToplistPlayerRow } from "../../lib/api/toplistsFirestore";
import { getClassIconUrl } from "../ui/shared/classIcons";

export type ToplistExportRow = FirestoreToplistPlayerRow & {
  _rankDelta?: number | null;
  _statsPerDay?: number | null;
  _statsDays?: number | null;
  _ratioLabel?: string | null;
  _calculatedSum?: number | null;
  _compareMissing?: boolean;
};

type Props = {
  rows: ToplistExportRow[];
  showCompare: boolean;
  width: number;
  exportNonce: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const parseLastScanString = (value: string): number | null => {
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
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date.getTime();
};

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

const computeLastScanColor = (lastScan: unknown, nowMs: number): string | null => {
  if (!lastScan) return null;
  let ts: number | null = null;
  if (typeof lastScan === "number") {
    ts = lastScan < 1e12 ? lastScan * 1000 : lastScan;
  } else {
    ts = toMsFromLastScan(String(lastScan));
  }
  if (ts == null || !Number.isFinite(ts)) return null;
  const days = Math.max(0, Math.floor((nowMs - ts) / MS_PER_DAY));
  if (days <= 0) return "#34d399";
  if (days === 1) return "#4ade80";
  if (days <= 3) return "#a3e635";
  if (days <= 7) return "#facc15";
  if (days <= 14) return "#f97316";
  if (days <= 30) return "#ef4444";
  return "#b91c1c";
};

const fmtNum = (n: number | null | undefined) => (n == null ? "" : new Intl.NumberFormat("en").format(n));

const getRankDeltaDisplay = (value: number | null | undefined, compareMissing: boolean): string => {
  if (compareMissing) return "n/a";
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (value === 0 || Object.is(value, -0)) return "-";
  const abs = fmtNum(Math.abs(value));
  return value > 0 ? `+${abs}` : `-${abs}`;
};

const addQueryParams = (url: string, params: Record<string, string | number>) => {
  const hashIndex = url.indexOf("#");
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  if (!query) return url;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${query}${hash}`;
};

const resolveExportRowKey = (row: ToplistExportRow, index: number) => {
  const playerId = (row as any).playerId ?? (row as any).id ?? null;
  if (playerId != null && String(playerId).trim()) return String(playerId).trim();
  const identifierCandidates = [
    (row as any).identifier,
    (row as any).original?.identifier,
    (row as any).value?.identifier,
    (row as any).data?.identifier,
    (row as any).player?.identifier,
    (row as any).value?.player?.identifier,
  ];
  for (const candidate of identifierCandidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return `${row.server ?? ""}__${row.name ?? ""}__${row.class ?? ""}__${index}`;
};

export default function ToplistExportTable({ rows, showCompare, width, exportNonce }: Props) {
  const nowMs = Date.now();
  return (
    <div
      style={{
        width: `${Math.max(1, Math.round(width))}px`,
        background: "#0C1C2E",
        color: "#E6EEF8",
      }}
    >
      <table
        className="toplists-table"
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
      >
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #2C4A73" }}>
            <th style={{ padding: "8px 6px" }}>#</th>
            <th style={{ padding: "8px 6px" }}>{"\u0394 Rank"}</th>
            <th style={{ padding: "8px 6px" }}>Server</th>
            <th style={{ padding: "8px 6px" }}>Name</th>
            <th style={{ padding: "8px 6px", textAlign: "center", width: 60 }}>Class</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>Level</th>
            <th style={{ padding: "8px 6px" }}>Guild</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>Main</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>Con</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>Sum</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>Stats/Day</th>
            <th style={{ padding: "8px 6px" }}>Ratio</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>Mine</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>Treasury</th>
            <th style={{ padding: "8px 6px" }}>Last Scan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const rankDelta = showCompare ? row._rankDelta ?? null : null;
            const compareMissing = showCompare ? Boolean(row._compareMissing) : false;
            const classKey = String(row.class ?? "").trim();
            const classIconUrl = getClassIconUrl(classKey, 48);
            const stableRowKey = resolveExportRowKey(row, idx);
            const classIconExportUrl = classIconUrl
              ? addQueryParams(classIconUrl, { exp: exportNonce, row: stableRowKey })
              : null;
            const sumValue = row._calculatedSum ?? ((row.main ?? 0) + (row.con ?? 0));
            const statsPerDayValue = showCompare ? row._statsPerDay ?? null : null;
            const statsDaysValue = showCompare ? row._statsDays ?? null : null;
            const lastScanDotColor = computeLastScanColor(row.lastScan, nowMs);

            return (
              <tr
                key={`${row.name}__${row.server}__${row.class ?? ""}__${idx}`}
                style={{ borderBottom: "1px solid #2C4A73" }}
              >
                <td style={{ padding: "8px 6px" }}>{idx + 1}</td>
                <td style={{ padding: "8px 6px" }}>
                  {showCompare ? getRankDeltaDisplay(rankDelta, compareMissing) : ""}
                </td>
                <td style={{ padding: "8px 6px" }}>{row.server}</td>
                <td style={{ padding: "8px 6px" }}>{row.name}</td>
                <td style={{ padding: "8px 6px", textAlign: "center" }}>
                  {classIconExportUrl ? (
                    <img
                      src={classIconExportUrl}
                      alt={classKey || "class"}
                      loading="eager"
                      decoding="sync"
                      className="class-icon-toplist"
                      style={{ display: "inline-block", objectFit: "contain" }}
                    />
                  ) : (
                    <span>{classKey}</span>
                  )}
                </td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row.level)}</td>
                <td style={{ padding: "8px 6px" }}>{row.guild ?? ""}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row.main)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row.con)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(sumValue)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <span>{statsPerDayValue == null ? "-" : fmtNum(statsPerDayValue)}</span>
                    <span style={{ fontSize: 11, opacity: 0.8 }}>
                      {statsDaysValue == null ? "-" : `${statsDaysValue}d`}
                    </span>
                  </div>
                </td>
                <td style={{ padding: "8px 6px" }}>{row._ratioLabel ?? row.ratio ?? "-"}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row.mine)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row.treasury)}</td>
                <td style={{ padding: "8px 6px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span>{row.lastScan ?? ""}</span>
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
        </tbody>
      </table>
    </div>
  );
}
