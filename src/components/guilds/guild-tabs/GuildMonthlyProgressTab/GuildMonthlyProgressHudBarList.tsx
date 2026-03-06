import React from "react";
import styles from "./GuildMonthlyProgressTab.module.css";
import { getClassIconUrl } from "../../../ui/shared/classIcons";
import { getGuildClassAccent, getGuildMutedAccent } from "../../classColors";
import type { TableColumn, TableRow } from "./GuildMonthlyProgressTab.types";

type Props = {
  columns: TableColumn[];
  rows: TableRow[];
  scopeKey: string;
};

function formatNum(n: number | string | null | undefined) {
  if (n === null || n === undefined || n === "") return "—";
  const v = typeof n === "number" ? n : Number(String(n).replace(/[^\d.-]/g, ""));
  if (!isFinite(v)) return String(n);
  if (Math.abs(v) >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + "B";
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(2) + "K";
  return v.toLocaleString("en-US");
}

const parseNumeric = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const getHudColumns = (columns: TableColumn[]) =>
  columns.filter((column) => column.key !== "rank" && column.key !== "name");

const pickPrimaryHudMetric = (columns: TableColumn[]) => {
  const keys = columns.map((column) => column.key);
  const preferred = ["delta", "total", "sum", "xp", "main", "con", "level"];
  for (const key of preferred) {
    if (keys.includes(key)) return key;
  }
  return keys[0] ?? null;
};

const formatHudValue = (column: TableColumn, row: TableRow) => {
  const raw = row[column.key];
  if (column.format === "num") return formatNum(raw as any);
  if (raw === null || raw === undefined || raw === "") return "—";
  return String(raw);
};

export default function GuildMonthlyProgressHudBarList({ columns, rows, scopeKey }: Props) {
  if (!rows.length) {
    return <div className={styles.hudNoData}>No data</div>;
  }

  const metricColumns = getHudColumns(columns);
  const primaryMetricKey = pickPrimaryHudMetric(metricColumns);
  const primaryMetricColumn = metricColumns.find((column) => column.key === primaryMetricKey) ?? null;
  const maxPrimaryValue = rows.reduce((max, row) => {
    if (!primaryMetricColumn) return max;
    const value = parseNumeric(row[primaryMetricColumn.key]);
    const normalized = value == null ? 0 : Math.abs(value);
    return Math.max(max, normalized);
  }, 0);

  return (
    <div className={styles.hudBarList}>
      {rows.map((row, rowIndex) => {
        const classLabel = typeof row.class === "string" ? row.class : null;
        const classAccent = getGuildClassAccent(classLabel) ?? "hsl(212 46% 57%)";
        const iconUrl = classLabel ? getClassIconUrl(classLabel, 256) : undefined;
        const rankValue = parseNumeric(row.rank) ?? rowIndex + 1;
        const mutedLow =
          getGuildMutedAccent(classLabel, 0.24) ??
          getGuildMutedAccent(classAccent, 0.24) ??
          "#2d4764";
        const mutedMid =
          getGuildMutedAccent(classLabel, 0.36) ??
          getGuildMutedAccent(classAccent, 0.36) ??
          "#375777";
        const mutedHigh =
          getGuildMutedAccent(classLabel, 0.48) ??
          getGuildMutedAccent(classAccent, 0.48) ??
          "#44698b";

        const primaryValue = primaryMetricColumn ? parseNumeric(row[primaryMetricColumn.key]) : null;
        const rel =
          maxPrimaryValue > 0 && primaryValue != null
            ? Math.max(0, Math.min(1, Math.abs(primaryValue) / maxPrimaryValue))
            : 0;

        const detailColumns = metricColumns.filter((column) => column.key !== primaryMetricKey);
        const rowNameRaw = row.name;
        const rowName = rowNameRaw === null || rowNameRaw === undefined || rowNameRaw === "" ? "—" : String(rowNameRaw);

        return (
          <div
            key={`${scopeKey}-${row.id ?? `${rowName}-${rowIndex}`}`}
            className={styles.hudBarItem}
            style={{
              boxShadow: "0 0 0 1px rgba(43, 76, 115, 0.88) inset",
            }}
          >
            <div
              className={styles.hudBarFill}
              style={{
                width: `${Math.round(rel * 100)}%`,
                background: `linear-gradient(90deg, ${mutedHigh}CC 0%, ${mutedMid}88 52%, ${mutedLow}00 100%)`,
              }}
            />
            <div className={styles.hudBarContent}>
              <div className={styles.hudBarIconSlot}>
                <span
                  className={styles.hudBarIconFrame}
                  style={{
                    boxShadow: `0 0 0 1px ${mutedMid}B3 inset`,
                  }}
                  title={`Rank ${rankValue}`}
                >
                  {iconUrl ? (
                    <img
                      src={iconUrl}
                      alt=""
                      className={styles.hudBarIconImage}
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer"
                      loading="eager"
                      decoding="sync"
                    />
                  ) : null}
                </span>
              </div>

              <div className={styles.hudBarMain}>
                <div className={styles.hudBarInlineRow}>
                  <div className={styles.hudBarName} title={rowName}>
                    {rowName}
                  </div>

                  {detailColumns.length > 0 ? (
                    <div className={styles.hudBarDetails}>
                      {detailColumns.map((column) => (
                        <span
                          key={`${scopeKey}-${row.id ?? rowIndex}-${column.key}`}
                          className={styles.hudBarDetailChip}
                          style={{ borderColor: `${classAccent}59` }}
                        >
                          <span className={styles.hudBarDetailLabel}>{column.label}</span>
                          <span className={styles.hudBarDetailValue}>{formatHudValue(column, row)}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className={styles.hudBarPrimaryValue}>
                    {primaryMetricColumn ? formatHudValue(primaryMetricColumn, row) : "—"}
                  </div>
                </div>
              </div>
            </div>
            <div
              className={styles.hudBarHoverTint}
              style={{ background: `linear-gradient(100deg, ${mutedLow}14 0%, ${mutedMid}1A 100%)` }}
            />
          </div>
        );
      })}
    </div>
  );
}
