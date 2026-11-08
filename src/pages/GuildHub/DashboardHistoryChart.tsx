import { profileDateTime } from "../../lib/i18n/profilePresentation";
import React from "react";
import GuildFusionMarkerHint from "../../components/guild-trend/GuildFusionMarkerHint";
import type { GuildAnalyticsFusionMarker } from "../../lib/guilds/guildAnalyticsFusionMarkers";
import type { TFunction } from "i18next";
import type { DashboardProgressCoverage } from "./dashboardGuildComparison";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { AnchoredLineChart, type AnchoredLineChartSeries, type GapChartScanPoint } from "../../components/ui/charts/AnchoredLineChart";
import { buildTimeAxisTicks } from "../../components/local-player-profile/LocalPlayerAnalytics";
import { dashboardModeMetrics, dashboardHistoryValue, type DashboardHistory, type DashboardHistoryMetric } from "./dashboardHistory";
import { dashboardSeriesColor, type DashboardHistorySeries } from "./dashboardGuildComparison";
import type { DashboardMemberMode } from "./localGuildRanking";
import styles from "./DashboardChartDetails.module.css";
import trendStyles from "../../components/guild-trend/GuildTrendChart.module.css";
const EMPTY: number[] = [];
export type HistoryPlot = Pick<DashboardHistory, "times" | "timeDomain">;
export const historyMetricLabelKey = (metric: DashboardHistoryMetric) => "guildHistory." + metric;
export function memberHistorySeries(history: DashboardHistory, mode: DashboardMemberMode, label: (metric: DashboardHistoryMetric) => string): DashboardHistorySeries[] {
  const metrics = dashboardModeMetrics(mode);
  return history.rows.flatMap((row, index) => metrics.map((metric, metricIndex) => ({ key: row.member.key + '::' + metric, ownerKey: row.member.key, metric, label: row.member.name + ' · ' + label(metric), color: dashboardSeriesColor(index, metricIndex, metrics.length), points: [],
    timePoints: history.times.map(timestampMs => ({ timestampMs, value: dashboardHistoryValue(row.byTime.get(timestampMs), metric) })) })));
}

export function HistoryLines({ history, series, selectedKeys, emphasizedKeys, isPartialScanPoint, scanPointNote, onScanSelect, onHoverSeries, onHoverScanPoint, bridgeGaps = false, progressStyle = false, showMissingObservations = false, scanPointLabel, rankAxis = false, connectObservedRanks = false, strictGaps = false, fusionMarkers, semanticKey = "guild-history", auditFamily = "F37" }: {
  history: HistoryPlot; series: AnchoredLineChartSeries[]; selectedKeys: readonly string[]; emphasizedKeys?: readonly string[];
  isPartialScanPoint?: (point: GapChartScanPoint) => boolean; scanPointNote?: (point: GapChartScanPoint) => string;
  fusionMarkers?: readonly GuildAnalyticsFusionMarker[];
  showMissingObservations?: boolean; scanPointLabel?: (point: GapChartScanPoint) => string;
  strictGaps?: boolean; connectObservedRanks?: boolean; rankAxis?: boolean; auditFamily?: "F37" | "F11"; bridgeGaps?: boolean; progressStyle?: boolean; semanticKey?: string;
  onHoverScanPoint?: (point: GapChartScanPoint | null) => void;
  onScanSelect?: (point: GapChartScanPoint) => void; onHoverSeries?: (key: string | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const formatter = React.useMemo(() => new Intl.NumberFormat(i18n.resolvedLanguage ?? "en", rankAxis ? { maximumFractionDigits: 0 } : { notation: "compact", maximumFractionDigits: 1 }), [i18n.resolvedLanguage, rankAxis]);
  const verticalMarkers = React.useMemo(() => fusionMarkers?.map(marker => ({
    ...marker, hint: <GuildFusionMarkerHint marker={marker} />,
  })), [fusionMarkers]);
  const yFormat = React.useCallback((value: number) => formatter.format(value), [formatter]);
  const frame = React.useRef<HTMLDivElement>(null), [size, setSize] = React.useState({ width: 0, height: 0 });
  const hasScans = history.times.length > 0 && series.length > 0;
  const hasValues = series.some(row => row.timePoints?.some(point => point.value != null));
  React.useLayoutEffect(() => {
    const node = frame.current; if (!node) return;
    const update = () => { const width = Math.round(node.clientWidth), height = Math.round(node.clientHeight); setSize(current => current.width === width && current.height === height ? current : { width, height }); };
    update(); const observer = new ResizeObserver(update); observer.observe(node); return () => observer.disconnect();
  }, [hasScans]);
  const ticks = React.useMemo(() => history.timeDomain ? buildTimeAxisTicks(history.timeDomain.startMs, history.timeDomain.endMs, Math.max(1, size.width - 108), i18n.resolvedLanguage ?? "en").map(tick => ({ timestampMs: tick.timestamp, label: tick.label })) : [], [history, size.width, i18n.resolvedLanguage]);
  return hasScans ? <div className={styles.lineFrame} ref={frame} data-dashboard-history-lines data-no-measurements={!hasValues || undefined}>
    {!hasValues && <p className={styles.noMeasurements} role="status">{t("guildChartDetails.empty")}</p>}
    {size.width > 0 && size.height > 0 && <AnchoredLineChart verticalMarkers={verticalMarkers} rankAxis={rankAxis} auditFamily={auditFamily} auditArea={auditFamily === "F37" ? "guild-progress" : "guild-member-trend"} auditInput={series} initialSize={size} points={EMPTY} yValueFormatter={yFormat} series={series} timeDomain={history.timeDomain} timeTicks={ticks} showAvg={false} showFill={false} showDots={false} highlightedSeriesKeys={selectedKeys} emphasizedSeriesKeys={emphasizedKeys} semanticKey={semanticKey} progressStyle={progressStyle} showScanPoints connectMissingValues={!strictGaps && (connectObservedRanks || !bridgeGaps && !rankAxis)} showMissingObservations={showMissingObservations} hideMissingScanPoints={progressStyle && !rankAxis && !showMissingObservations} showMissingConnections={bridgeGaps} onScanPointSelect={onScanSelect} onHoverScanPointChange={onHoverScanPoint} onHoverSeriesKeyChange={onHoverSeries} isPartialScanPoint={isPartialScanPoint} scanPointLabel={scanPointLabel ?? (point => point.seriesLabel + ' · ' + profileDateTime(point.timestampMs) + ' · ' + (point.value == null ? t("guildHistory.unavailable") : point.value.toLocaleString(i18n.resolvedLanguage ?? "en")) + (scanPointNote?.(point) ? " · " + scanPointNote(point) : ""))} />}
  </div> : <p role="status">{t("guildChartDetails.empty")}</p>;
}

export function ChartHistoryInfo({ bridgeGaps = false, partialAverages = false, hof = false, title, children }: { bridgeGaps?: boolean; partialAverages?: boolean; hof?: boolean; title?: string; children?: React.ReactNode }) {
  const { t } = useTranslation(), id = React.useId(), [open, setOpen] = React.useState(false), root = React.useRef<HTMLDivElement>(null);
  const heading = title ?? t("guildHistory.legend");
  React.useEffect(() => { if (!open) return; const close = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); }; window.addEventListener('pointerdown', close); return () => window.removeEventListener('pointerdown', close); }, [open]);
  return <div className={styles.infoRoot} ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => { if (open && event.key === 'Escape') { event.stopPropagation(); setOpen(false); } }}>
    <button type="button" className={trendStyles.legendInfoButton} aria-label={heading} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)} data-history-info>i</button>
    {open && <div id={id} className={trendStyles.infoPopup + ' ' + styles.historyInfo} role="region" aria-label={heading}>
      <strong>{heading}</strong>{children ?? (hof ? <p>{t("guildHistory.hofHelp")}</p> : <><p><span className={styles.legendSolid} aria-hidden />{t(partialAverages ? "dashboardCompare.solid" : "guildHistory.solid")}</p>{bridgeGaps && <p><span className={styles.legendDashed} aria-hidden />{t("guildHistory.dashed")}</p>}{!partialAverages && <><p><span className={styles.legendHollow} aria-hidden />{t("guildHistory.marker")}</p><p>{t("guildHistory.rail")}</p></>}{partialAverages && <><p><span className={styles.legendHatched} aria-hidden />{t("dashboardCompare.partialMarker")}</p><p>{t("dashboardCompare.partialLine")}</p><p>{t("dashboardCompare.composition")}</p></>}</>)}
    </div>}
  </div>;
}
export type HistoryScanDetails = { owner: string; at: number; averages?: boolean; records: { source: string; level?: number | null; values: Partial<Record<DashboardHistoryMetric, number | null>>; notes?: Partial<Record<DashboardHistoryMetric, string>>; roster?: { declared: number | null; found: number; complete: boolean } }[] };
export function ScanValueDetails({ details, onClose }: { details: HistoryScanDetails; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const metrics: DashboardHistoryMetric[] = details.records.some(record => "hof" in record.values) ? ["hof"] : ["xp", "baseMain", "conBase", "base", "attrTotal", "conTotal", "total", "mine", "treasury"];
  const format = (value: number | null | undefined) => value == null ? t("guildHistory.unavailable") : value.toLocaleString(i18n.resolvedLanguage ?? 'en', { maximumFractionDigits: 2 });
  return <section className={styles.scanDetails} aria-live="polite" data-history-scan-details><div className={styles.heading}><h3>{details.owner} · {profileDateTime(details.at)}</h3><button type="button" onClick={onClose} aria-label={t("localProfileRoute.close")}>×</button></div>
    {details.records.length ? details.records.map((record, index) => <div key={index}><p>{record.source}</p>{record.roster && <p>{t("guildHistory.roster", { found: record.roster.found, declared: record.roster.declared ?? '—' })}{!record.roster.complete && ' · ' + t("guildHistory.incomplete")}</p>}<dl>{record.level !== undefined && <div><dt>{t("guildHistory.level")}</dt><dd>{format(record.level)}</dd></div>}{metrics.map(metric => <div key={metric}><dt>{t(details.averages ? "dashboardCompare.averages." + metric : historyMetricLabelKey(metric))}</dt><dd data-history-field={metric}>{format(record.values[metric])}{record.notes?.[metric] && <small data-compare-coverage> · {record.notes[metric]}</small>}</dd></div>)}</dl></div>) : <p>{t("guildHistory.unavailable")}</p>}
  </section>;
}

// Shared by Dashboard Compare and its guild comparison overlay.
export function dashboardCompareCoverageLabel(coverage: DashboardProgressCoverage, t: TFunction): string {
  if (coverage.reason) return t("dashboardCompare.excluded." + coverage.reason, { used: coverage.used, declared: coverage.declared ?? "—", found: coverage.found });
  if (!coverage.partial) return "";
  const roster = coverage.declared == null
    ? t("dashboardCompare.unknown", { found: coverage.found })
    : t("dashboardCompare.known", { found: coverage.found, declared: coverage.declared, used: coverage.used });
  return roster + (coverage.declared == null
    ? " " + t("dashboardCompare.used", { used: coverage.used }) : "");
}
