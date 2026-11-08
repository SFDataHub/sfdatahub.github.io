import { profilePeriod } from "../../lib/i18n/profilePresentation";
import React from "react";
import { useProfileAttributeSumMode } from "../../lib/settings/usePreferences";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import {
  type LocalAnalyticsSeries,
  type LocalPeriodRateSummary,
} from "./localPlayerAnalyticsModel";
import LocalPlayerHistoryChart, { PlayerHistoryDetails, playerHistorySeriesLabel } from "./LocalPlayerHistoryChart";
import { ChartDetailButton } from "../../pages/GuildHub/DashboardChartDetails";
import chartStyles from "../../pages/GuildHub/DashboardChartDetails.module.css";
import type { LocalPlayerProfileModel } from "./types";
import { PLAYER_VIEW_CHARTS, type PlayerChartMetric } from "../../lib/local-player-profile/viewCharts";
import { LocalPlayerComparisonSelect, useLocalPlayerComparison } from "./LocalPlayerComparison";

type LocalPlayerAnalyticsProps = {
  profile: LocalPlayerProfileModel;
};

function LocalPlayerAnalytics(_props: LocalPlayerAnalyticsProps) {
  const { t } = useTranslation();
  const { part, view, players, playerParts } = useLocalPlayerComparison();
  const sumMode = useProfileAttributeSumMode();
  const [detail, setDetail] = React.useState<{ metric: PlayerChartMetric; trigger: HTMLElement } | null>(null);
  const closeDetail = React.useCallback(() => setDetail(null), []);
  React.useEffect(closeDetail, [view, closeDetail]);
  const data = part.value?.view === view ? part.value : null;
  const charts = React.useMemo(() => data?.charts?.map(chart => ({ ...chart, series: [...chart.series,
    ...players.flatMap(player => {
      const value = playerParts[player.id]?.value;
      const comparison = value?.charts?.find(row => row.metric === chart.metric)?.series[0];
      if (!comparison) return [];
      return [{ ...comparison, id: `comparison:${player.selection.reference.identifier}:${chart.metric}`,
        label: `${value!.playerName} · ${player.selection.reference.serverNamespace.toUpperCase()}`, color: player.color }];
    }),
  ] })), [data, players, playerParts]);
  const metrics = PLAYER_VIEW_CHARTS[view];
  const title = (metric: PlayerChartMetric) => t(`playerProfile.history.metrics.${metric}`);
  const loading = part.status === "loading" || part.status === "not-requested";
  const animationKey = `${view}:${data?.comparison.selectedTimestamp ?? "full"}:${data?.comparison.currentTimestamp ?? "current"}`;
  const period = data ? (() => {
    const start = data.comparison.selectedTimestamp, end = data.comparison.currentTimestamp;
    if (start != null && end != null) return profilePeriod(start, end, !data.comparison.selectedPlayerAtStart);
    const times = charts?.flatMap(chart => chart.series[0]?.points.map(point => point.timestamp) ?? []) ?? [];
    return times.length ? profilePeriod(Math.min(...times), Math.max(...times)) : t("guildChartDetails.empty");
  })() : null;
  const selectedDetail = charts?.find(chart => chart.metric === detail?.metric);
  return <>
    {metrics.map((metric, index) => {
      const chart = charts?.find(chart => chart.metric === metric);
      const series = chart?.series ?? [];
      const hasPoints = series.some(row => row.points.length > 0);
      const baseRate = metric === "baseSum" && sumMode === "main-con";
      const rate = metric === "xp" ? data?.xp.rateSummary : baseRate ? data?.stats.rateSummary : null;
      return <AnalyticsShell key={metric} area={index === 0 ? "xp" : index === 1 ? "stats-dev" : "third"}
        metric={metric} title={title(metric)} subtitle={period ?? t(loading ? "guildChartDetails.loading" : "playerProfile.history.error")}>
        {index === 0 && <div className="local-profile-chart-comparison"><LocalPlayerComparisonSelect /></div>}
        {part.status === "partial" && <AnalyticsMessage text={t("playerProfile.localData.partial")} />}
        {!data && !loading && <button type="button" onClick={part.retry}>{t("playerProfile.localData.retry")}</button>}
        <ChartMeta legend={hasPoints ? <SeriesLegend series={series} status={players.map(player => {
          const playerPart = playerParts[player.id];
          const points = playerPart?.value?.charts?.find(row => row.metric === metric)?.series[0]?.points;
          if (points?.length) return null;
          return <span key={player.id} role="status" style={{ color: player.color }}>
            {player.selection.hit?.name ?? player.selection.favorite?.display.name} · {player.selection.reference.serverNamespace.toUpperCase()}: {t(!playerPart || playerPart.status === "loading" ? "guildChartDetails.loading" : playerPart.status === "error" ? "playerProfile.history.error" : "guildChartDetails.empty")}
            {playerPart?.status === "error" && <button type="button" onClick={playerPart.retry}>{t("playerProfile.localData.retry")}</button>}
          </span>;
        })} action={<ChartDetailButton title={title(metric)} onClick={trigger => setDetail({ metric, trigger })} />} /> : undefined}
          rate={metric === "xp" || baseRate ? <PeriodRateSummary label={t(metric === "xp" ? "playerProfile.history.xpPerDay" : "playerProfile.history.basePerDay")} summary={rate ?? null} valueKind={metric === "xp" ? "xp" : "base"} /> : null} />
        <ChartFrame>{hasPoints ? <LocalPlayerHistoryChart metric={metric} title={title(metric)} series={series} animationKey={`${metric}:${animationKey}`} timeDomain={data?.comparison.chartTimeDomain} />
          : <AnalyticsMessage text={t(loading ? "guildChartDetails.loading" : data ? data.comparison.options.length && !data.comparison.selectedPlayerAtStart ? "playerProfile.history.playerUnavailable" : "guildChartDetails.empty" : `playerProfile.localData.${part.status}`)} />}</ChartFrame>
      </AnalyticsShell>;
    })}
    {detail && selectedDetail && <PlayerHistoryDetails metric={detail.metric} title={title(detail.metric)} series={selectedDetail.series}
      animationKey={`${detail.metric}:${animationKey}`} timeDomain={data?.comparison.chartTimeDomain} trigger={detail.trigger} onClose={closeDetail} />}
  </>;
}
export default LocalPlayerAnalytics;

function AnalyticsShell({ area, metric, title, subtitle, children }: {
  area: "xp" | "stats-dev" | "third"; metric?: PlayerChartMetric; title: string; subtitle: string; children: React.ReactNode;
}) {
  return <section className={`local-player-analytics local-player-analytics--${area}`} data-player-chart={metric}>
    <header className="local-player-analytics__header"><h2>{title}</h2><span>{subtitle}</span></header>
    <div className="local-player-analytics__body">{children}</div>
  </section>;
}

function AnalyticsMessage({ text }: { text: string }) {
  return <div className="local-player-analytics__message" role="status">{text}</div>;
}

function ChartFrame({ children }: { children: React.ReactNode }) {
  return <div className="local-player-analytics__chart-frame">{children}</div>;
}

function SeriesLegend({ series, action, status }: { series: LocalAnalyticsSeries<number | null>[]; action?: React.ReactNode; status?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className={chartStyles.metricLegend}>
      {action}
      {status}
      {series.map((entry) => (
        <span key={entry.id} style={{ color: entry.color }}>
          {playerHistorySeriesLabel(entry, t)}
        </span>
      ))}
    </div>
  );
}

function ChartMeta({ legend, rate }: { legend?: React.ReactNode; rate: React.ReactNode }) {
  return (
    <div className="local-player-analytics__meta">
      {legend}
      {rate}
    </div>
  );
}

function PeriodRateSummary({
  label,
  summary,
  valueKind,
}: {
  label: string;
  summary: LocalPeriodRateSummary | null;
  valueKind: "xp" | "base";
}) {
  const { t, i18n } = useTranslation();
  return (
    <div className="local-player-analytics__rate-summary" aria-label={label}>
      <strong>{label}</strong>
      <dl>
        <div className="local-player-analytics__rate-row local-player-analytics__rate-row--player">
          <dt>{t("playerProfile.history.player")}</dt>
          <dd>{formatRate(summary?.player ?? null, valueKind, i18n.resolvedLanguage ?? "en", t("playerProfile.history.perDay"))}</dd>
        </div>
        <div className="local-player-analytics__rate-row local-player-analytics__rate-row--guild">
          <dt>{t("playerProfile.history.guildAverage")}</dt>
          <dd>{formatRate(summary?.guildAverage ?? null, valueKind, i18n.resolvedLanguage ?? "en", t("playerProfile.history.perDay"))}</dd>
        </div>
      </dl>
    </div>
  );
}

function formatCompact(value: number, locale = "en") {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatRate(value: number | null, valueKind: "xp" | "base", locale: string, perDay: string) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const magnitude = Math.abs(value);
  const formatted = valueKind === "xp" ? formatCompact(magnitude, locale) : formatBaseRateMagnitude(magnitude, locale);
  return `${sign}${formatted} / ${perDay}`;
}

function formatBaseRateMagnitude(value: number, locale: string) {
  if (value >= 10_000) {
    return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
  }
  if (value > 0 && value < 0.01) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(value);
  }
  if (value < 1) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
  }
  if (value < 100) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

export { buildTimeAxisTicks } from "../../lib/player-progress/chartTimeAxis";
