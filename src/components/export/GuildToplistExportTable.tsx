import { formatScanDateTimeLabel } from "../../lib/ui/formatScanDateTimeLabel";
import { useTranslation } from "react-i18next";
import type { ToplistExportRow } from "./ToplistExportTable";

export type GuildToplistExportRow = ToplistExportRow & {
  _guildHofRank?: number | null;
  _guildHonor?: number | null;
  _guildRaids?: number | null;
  _guildPortal?: number | null;
  _guildHydra?: number | null;
  _guildPetLevel?: number | null;
  _guildMembers?: number | null;
};

type Props = {
  rows: GuildToplistExportRow[];
  width: number;
};

const fmtNum = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "" : new Intl.NumberFormat("de-DE").format(value);

const fmtGroupedInt = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return "";
  const rounded = Math.round(value);
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 })
    .format(rounded)
    .replace(/\./g, " ");
};

export default function GuildToplistExportTable({ rows, width }: Props) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        width: `${Math.max(1, Math.round(width))}px`,
        background: "#0C1C2E",
        color: "#E6EEF8",
      }}
    >
      <table className="toplists-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #2C4A73" }}>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>{t("toplists.columns.rank", "#")}</th>
            <th style={{ padding: "8px 6px" }}>{t("toplists.columns.server", "Server")}</th>
            <th style={{ padding: "8px 6px" }}>{t("toplists.columns.name", "Name")}</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>{t("toplists.columns.hofRank", "HoF Rank")}</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>{t("toplists.columns.honor", "Honor")}</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>{t("toplists.columns.raids", "Raids")}</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>{t("toplists.columns.portal", "Portal")}</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>{t("toplists.columns.hydra", "Hydra")}</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>{t("toplists.columns.petLevel", "Pet Level")}</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>{t("toplists.columns.members", "Members")}</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>{t("toplists.columns.avgLevel", "\u00F8 Level")}</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>{t("toplists.columns.avgMain", "\u00F8 Main")}</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>{t("toplists.columns.avgCon", "\u00F8 Con")}</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>{t("toplists.columns.avgSum", "\u00F8 Sum")}</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>{t("toplists.columns.lastScan", "Last Scan")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const sumValue = row._calculatedSum ?? row.sum;
            return (
              <tr key={`${row.identifier ?? row.name ?? "guild"}__${idx}`} style={{ borderBottom: "1px solid #2C4A73" }}>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{idx + 1}</td>
                <td style={{ padding: "8px 6px" }}>{row.server}</td>
                <td style={{ padding: "8px 6px" }}>{row.name}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row._guildHofRank)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtGroupedInt(row._guildHonor)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row._guildRaids)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row._guildPortal)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row._guildHydra)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row._guildPetLevel)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row._guildMembers)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row.level)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtGroupedInt(row.main)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtGroupedInt(row.con)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtGroupedInt(sumValue)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{formatScanDateTimeLabel(row.lastScan)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
