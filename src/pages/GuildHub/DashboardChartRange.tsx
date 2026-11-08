import { profileDateTime } from "../../lib/i18n/profilePresentation";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import styles from "./DashboardChartDetails.module.css";

export { guildChartRangeStart } from "./dashboardChartWindow";
export type { GuildChartRangeSelection, GuildChartRangeControl } from "./dashboardChartWindow";
import type { GuildChartRangeControl, GuildChartRangeSelection } from "./dashboardChartWindow";
export default function DashboardChartRange({ value, times, onChange }: GuildChartRangeControl) {
  const { t } = useTranslation();
  return <label className={styles.rangeSelect}>
    <span>{t("guildProfileRange.period")}</span>
    <select data-guild-chart-range value={value} onChange={event => onChange(event.target.value as GuildChartRangeSelection)}>
      <option value="12months">{t("guildProfileRange.last12")}</option>
      {times.map(at => <option key={at} value={String(at)}>{t("guildProfileRange.from", { date: profileDateTime(new Date(at).toISOString()) })}</option>)}
      <option value="all">{t("guildProfileRange.all")}</option>
    </select>
  </label>;
}
