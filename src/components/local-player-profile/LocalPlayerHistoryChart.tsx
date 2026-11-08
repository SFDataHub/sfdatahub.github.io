import { profileDateTime } from "../../lib/i18n/profilePresentation";
import { useAnalyticsView } from "../../lib/analytics/localEvents";
import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { HistoryLines, type HistoryPlot } from "../../pages/GuildHub/DashboardHistoryChart";
import type { GapChartScanPoint } from "../ui/charts/AnchoredLineChart";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { hasBackCloseLayer, useBackClose } from "../../hooks/useBackClose";
import type { PlayerChartMetric } from "../../lib/local-player-profile/viewCharts";
import type { TFunction } from "i18next";
import type { LocalAnalyticsPoint, LocalAnalyticsSeries, LocalAnalyticsTimeDomain } from "./localPlayerAnalyticsModel";
import shared from "../../pages/GuildHub/DashboardChartDetails.module.css";
import dialog from "../guilds/LocalGuildRankingOverlay.module.css";
import styles from "./LocalPlayerHistoryChart.module.css";

export function playerHistorySeriesLabel(series: LocalAnalyticsSeries<number | null>, t: (key: string) => string) {
  return series.id.startsWith("view-") ? t(`playerProfile.history.metrics.${series.id.slice(5)}`) : series.id === "guild-average-xp" ? t("playerProfile.history.guildAverage")
    : series.id === "focused-base-stats" ? t("playerProfile.history.base") : series.label;
}

function playerHistoryValue(point: LocalAnalyticsPoint<number | null> | undefined, metric: PlayerChartMetric, t: TFunction, locale: string): string {
  if (!point) return t("guildHistory.unavailable");
  if (point.value == null) return t("playerProfile.history.missingMetric", {
    metric: t(`playerProfile.history.metrics.${metric}`), date: profileDateTime(point.timestamp),
  });
  return point.value.toLocaleString(locale, { maximumFractionDigits: 2 });
}

type Props = {
  series: LocalAnalyticsSeries<number | null>[];
  metric: PlayerChartMetric;
  animationKey: string;
  timeDomain?: LocalAnalyticsTimeDomain | null;
  title: string;
};

// Presentation adapter only: the existing worker projection and comparison owner
// supply every visible point, including confirmed aliases and local imports.
export default function LocalPlayerHistoryChart(props: Props) {
  return <PlayerHistoryPlot {...props} />;
}

function PlayerHistoryPlot({ series, metric, timeDomain, animationKey }: Props) {
  const { t, i18n } = useTranslation();
  const [hover, setHover] = React.useState<{ series: LocalAnalyticsSeries<number | null>[]; point: GapChartScanPoint } | null>(null);
  const [scan, setScan] = React.useState<{ series: LocalAnalyticsSeries<number | null>[]; point: GapChartScanPoint } | null>(null);
  const history = React.useMemo<HistoryPlot>(() => ({
    times: [...new Set(series.flatMap(row => row.points.map(point => point.timestamp)))].sort((a, b) => a - b),
    timeDomain: timeDomain ? { startMs: timeDomain.min, endMs: timeDomain.max } : null,
  }), [series, timeDomain]);
  const lines = React.useMemo(() => series.map(row => ({
    key: row.id, label: playerHistorySeriesLabel(row, t), color: row.color, points: [],
    timePoints: row.points.map(point => ({ timestampMs: point.timestamp, observationKey: point.observationKey, value: point.value })),
  })), [series, t]);
  const onHover = React.useCallback((point: GapChartScanPoint | null) => {
    setHover(current => point ? current?.series === series && current.point.seriesKey === point.seriesKey && current.point.timestampMs === point.timestampMs ? current : { series, point } : null);
  }, [series]);
  const activeHover = hover?.series === series ? hover.point : null;
  const activeScan = scan?.series === series ? scan.point : null;
  const building = metric === "mine" || metric === "treasury";
  const format = (point: LocalAnalyticsPoint<number | null> | undefined) => playerHistoryValue(point, metric, t, i18n.resolvedLanguage ?? "en");
  const scanLabel = (point: GapChartScanPoint) => point.seriesLabel + " · " + profileDateTime(point.timestampMs) + " · " + format(series.find(row => row.id === point.seriesKey)?.points.find(row => row.timestamp === point.timestampMs));
  return <div className={styles.plot} data-player-history={animationKey}>
    <HistoryLines history={history} series={lines} selectedKeys={[]} progressStyle semanticKey={animationKey}
      bridgeGaps={building} showMissingObservations={building} scanPointLabel={building ? scanLabel : undefined}
      onHoverScanPoint={onHover} onScanSelect={point => setScan({ series, point })} />
    {activeHover && !activeScan && <div className={shared.compareValues + " " + styles.hover} data-player-history-hover aria-live="polite">
      <p>{profileDateTime(activeHover.timestampMs)}</p>
      <dl>{series.map(row => {
        const point = row.points.find(point => point.timestamp === activeHover.timestampMs);
        return <div key={row.id}><dt><i style={{ background: row.color }} aria-hidden />{playerHistorySeriesLabel(row, t)}</dt><dd>{format(point)}</dd></div>;
      })}</dl>
    </div>}
    {activeScan && <div className={shared.scanPopover} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setScan(null); } }}>
      <section className={shared.scanDetails} aria-live="polite" data-player-history-scan>
        <div className={shared.heading}><h3>{profileDateTime(activeScan.timestampMs)}</h3><button type="button" onClick={() => setScan(null)} aria-label={t("localProfileRoute.close")}>×</button></div>
        <dl>{series.map(row => {
          const point = row.points.find(point => point.timestamp === activeScan.timestampMs);
          return <div key={row.id}><dt>{playerHistorySeriesLabel(row, t)}</dt><dd data-player-history-field={row.id}>{format(point)}</dd></div>;
        })}</dl>
      </section>
    </div>}
  </div>;
}

export function PlayerHistoryDetails({ trigger, onClose, ...props }: Props & { trigger: HTMLElement; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const panel = React.useRef<HTMLDivElement>(null), titleId = React.useId();
  useAnalyticsView("datahub/player/chart-details");
  const requestClose = React.useCallback(() => { if (hasBackCloseLayer()) window.history.back(); else onClose(); }, [onClose]);
  useFocusTrap(panel, true);
  useBackClose(true, onClose);
  React.useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); requestClose(); } };
    window.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", escape); if (trigger.isConnected) trigger.focus({ preventScroll: true }); };
  }, [requestClose, trigger]);
  return createPortal(<div className={dialog.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}>
    <div className={dialog.panel + " " + shared.panel} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panel} data-player-history-details>
      <div className={dialog.header}><h2 id={titleId}>{props.title}</h2><button type="button" onClick={requestClose} aria-label={t("localProfileRoute.close")}><X size={20} aria-hidden /></button></div>
      <div className={dialog.scroll}>
        {props.timeDomain && <p className={shared.metricLegend}>{profileDateTime(props.timeDomain.min)} – {profileDateTime(props.timeDomain.max)}</p>}
        <div className={shared.metricLegend}>{props.series.map(row => <span key={row.id} style={{ color: row.color }}>{playerHistorySeriesLabel(row, t)}</span>)}</div>
        <div className={styles.expanded}><PlayerHistoryPlot {...props} /></div>
        <div className={shared.tableScroll}><table><caption>{t("guildChartDetails.values")}</caption>
          <thead><tr><th>{t("playerProfile.history.series")}</th><th>{t("guildChartDetails.date")}</th><th>{t("guildChartDetails.value")}</th></tr></thead>
          <tbody>{props.series.flatMap(row => row.points.map(point => <tr key={row.id + ":" + point.timestamp}>
            <td>{playerHistorySeriesLabel(row, t)}</td><td>{profileDateTime(point.timestamp)}</td><td>{playerHistoryValue(point, props.metric, t, i18n.resolvedLanguage ?? "en")}</td>
          </tr>))}</tbody>
        </table></div>
      </div>
    </div>
  </div>, document.body);
}
