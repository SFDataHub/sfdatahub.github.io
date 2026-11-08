import { useTranslation } from "react-i18next";
import Tooltip from "../ui/Tooltip/Tooltip";
import type { GuildAnalyticsFusionMarker } from "../../lib/guilds/guildAnalyticsFusionMarkers";
import styles from "./GuildTrendChart.module.css";

/** The hint lives above the plot. The full-height line never intercepts scans. */
export default function GuildFusionMarkerHint({ marker }: { marker: GuildAnalyticsFusionMarker }) {
  const { t, i18n } = useTranslation();
  const date = new Date(marker.timestampMs).toLocaleDateString(i18n.resolvedLanguage ?? "en", { timeZone: "UTC" });
  const servers = `${marker.originServerCodes.join(", ")} → ${marker.targetServerCode}`;
  const description = t("dashboardFusion.description", { date, servers });
  return <Tooltip content={<><strong>{t("dashboardFusion.title")}</strong><p>{servers}</p><p>{date}</p></>}>
    <button type="button" className={`${styles.legendInfoButton} ${styles.fusionHint}`} aria-label={description} data-fusion-hint={marker.eventId} data-fusion-at={marker.timestampMs}>i</button>
  </Tooltip>;
}
