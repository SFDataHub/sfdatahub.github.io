import { profileDateTime } from "../../lib/i18n/profilePresentation";
import DashboardChartRange, { type GuildChartRangeControl } from "./DashboardChartRange";
import React from "react";
import { buildGuildAnalyticsFusionMarkers } from "../../lib/guilds/guildAnalyticsFusionMarkers";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { GuildEmblemArtwork, useGuildEmblemVisual } from "../../components/guilds/GuildEmblem";
import Tooltip from "../../components/ui/Tooltip/Tooltip";
import { guildIconByIdentifier } from "../../data/guilds";
import { GUILD_ACCENT_FALLBACK } from "../../lib/ui/guildAccent";
import type { GapChartScanPoint } from "../../components/ui/charts/AnchoredLineChart";
import { HistoryLines, ChartHistoryInfo, ScanValueDetails, dashboardCompareCoverageLabel, historyMetricLabelKey, type HistoryScanDetails } from "./DashboardHistoryChart";
import { guildComparisonSeries, type DashboardGuildComparison } from "./dashboardGuildComparison";
import { dashboardHistoryValue, dashboardModeMetrics, type DashboardHistory, type DashboardHistoryMetric } from "./dashboardHistory";
import type { DashboardMemberMode } from "./localGuildRanking";
import type { CompareGuildEmblemSource } from "./dashboardCompareEmblems";
import styles from "./DashboardChartDetails.module.css";
import { comparePlayerSeries } from "./dashboardMemberChartModel";

const emblemSourceKey = (row: GuildRow, source?: CompareGuildEmblemSource) => JSON.stringify([row.name, source?.coaString, source?.identifier]);
type GuildRow = DashboardGuildComparison["displayRows"][number];
export type ComparePresentation = {
  comparisonValues?: Partial<Record<DashboardHistoryMetric, number | null>>;
  currentAt: number;
  comparisonStand: { at: number; sourceScanId: string } | null;
  emblems: Readonly<Record<string, CompareGuildEmblemSource>>;
};

// Metric shades depend only on the guild accent and metric, never visible order.
export function compareMetricColor(accent: string, metric: DashboardHistoryMetric) {
  if (["baseMain", "attrTotal", "treasury"].includes(metric)) return `color-mix(in srgb, ${accent} 68%, #d8eafa)`;
  if (["conBase", "conTotal"].includes(metric)) return `color-mix(in srgb, ${accent} 82%, #355270)`;
  return accent;
}

function CompareEmblem({ row, source, current, selected, onToggle, onAccent, onEmphasis, onKeyboardEmphasis }: {
  row: GuildRow; source?: CompareGuildEmblemSource; current: boolean; selected: boolean; onEmphasis: (key: string | null) => void; onKeyboardEmphasis: (key: string | null) => void; onToggle: (key: string) => void; onAccent: (key: string, accent: string, ready: boolean, source: string) => void;
}) {
  const { t } = useTranslation();
  const latest = [...row.byTime.values()].sort((a, b) => b.guild.snapshotTimestamp - a.guild.snapshotTimestamp)[0]?.guild;
  const emblemUrl = guildIconByIdentifier(source?.identifier ?? latest?.guildIdentifier, 96).thumb;
  const { accent, visualEmblemUrl, ready } = useGuildEmblemVisual({ coaString: source?.coaString, emblemUrl, name: row.name });
  const sourceKey = emblemSourceKey(row, source);
  React.useLayoutEffect(() => onAccent(row.key, accent, ready, sourceKey), [row.key, accent, ready, sourceKey, onAccent]);
  const title = [row.name, latest?.server, current && t("guildHistory.current")].filter(Boolean).join(" · ");
  return <Tooltip content={title}><button type="button" className={styles.guildEmblem} style={{ "--guild-card-accent": accent } as React.CSSProperties}
    data-comparison-guild={row.key} data-current-guild={current || undefined} aria-label={title} aria-pressed={current || selected} aria-disabled={current || undefined}
    onPointerEnter={() => onEmphasis(row.key)} onPointerLeave={() => onEmphasis(null)}
    onFocus={event => onKeyboardEmphasis(event.currentTarget.matches(":focus-visible") ? row.key : null)}
    onBlur={() => onKeyboardEmphasis(null)}
    onClick={() => { if (!current) onToggle(row.key); }}>
    <GuildEmblemArtwork size="compact" visualEmblemUrl={visualEmblemUrl} fallbackLabel={row.name.trim().charAt(0).toUpperCase() || "G"} />
  </button></Tooltip>;
}

function ComparePreviewEmblem({ row, source, onEmphasis }: {
  row: GuildRow; source?: CompareGuildEmblemSource; onEmphasis: (key: string | null) => void;
}) {
  const latest = [...row.byTime.values()].sort((a, b) => b.guild.snapshotTimestamp - a.guild.snapshotTimestamp)[0]?.guild;
  const emblemUrl = guildIconByIdentifier(source?.identifier ?? latest?.guildIdentifier, 96).thumb;
  const { accent, visualEmblemUrl } = useGuildEmblemVisual({ coaString: source?.coaString, emblemUrl, name: row.name });
  return <span className={styles.profileGuildPreviewEmblem} role="img" aria-label={[row.name, latest?.server].filter(Boolean).join(" · ")}
    style={{ "--guild-card-accent": accent } as React.CSSProperties} data-compare-preview-guild={row.key}
    onPointerEnter={() => onEmphasis(row.key)} onPointerLeave={() => onEmphasis(null)} onPointerCancel={() => onEmphasis(null)}>
    <GuildEmblemArtwork size="compact" visualEmblemUrl={visualEmblemUrl} fallbackLabel={row.name.trim().charAt(0).toUpperCase() || "G"} />
  </span>;
}

export function CompareDisplay({ mode, metrics, selectedMetrics, onToggleMetric, closeSignal, children, onClose, metricLabel }: {
  mode: DashboardMemberMode; metrics: readonly DashboardHistoryMetric[]; selectedMetrics: readonly DashboardHistoryMetric[];
  onToggleMetric: (metric: DashboardHistoryMetric) => void; closeSignal?: unknown; children: React.ReactNode; onClose: () => void;
  metricLabel?: (metric: DashboardHistoryMetric) => string;
}) {
  const { t } = useTranslation(), id = React.useId();
  const location = useLocation();
  const [open, setOpen] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null), trigger = React.useRef<HTMLButtonElement>(null), popup = React.useRef<HTMLDivElement>(null);
  const [popupStyle, setPopupStyle] = React.useState<React.CSSProperties>({});
  React.useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const button = trigger.current, node = root.current; if (!button || !node) return;
      const bounds = button.closest<HTMLElement>('[data-compare-scroll], main')?.getBoundingClientRect();
      const box = button.getBoundingClientRect(), origin = node.getBoundingClientRect();
      const left = Math.max(8, bounds?.left ?? 0) + 8, right = Math.min(window.innerWidth - 8, bounds?.right ?? window.innerWidth) - 8;
      const width = Math.max(0, Math.min(392, right - left));
      const top = Math.max(8, bounds?.top ?? 0) + 8;
      const bottom = Math.min(window.innerHeight - 8, bounds?.bottom ?? window.innerHeight) - 8;
      const below = Math.max(0, bottom - box.bottom - 6), above = Math.max(0, box.top - top - 6);
      // Prefer the button's lower right edge; fit upward when it offers more room.
      const contentHeight = popup.current?.scrollHeight ?? 0;
      const upward = contentHeight > below && above > below;
      const height = Math.min(contentHeight, upward ? above : below);
      const next = { width, left: Math.max(left, Math.min(box.right - width, right - width)) - origin.left,
        top: (upward ? box.top - 6 - height : box.bottom + 6) - origin.top,
        maxHeight: upward ? above : below };
      setPopupStyle(current => Object.keys(next).every(key => current[key as keyof typeof next] === next[key as keyof typeof next]) ? current : next);
    };
    position();
    const observer = new ResizeObserver(position);
    if (popup.current) observer.observe(popup.current);
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [open]);
  React.useEffect(() => setOpen(false), [closeSignal, mode, location]);
  React.useEffect(() => { if (!open) onClose(); }, [open, onClose]);
  React.useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus({ preventScroll: true });
    };
    const checkVisible = () => {
      const button = trigger.current; if (!button) return;
      const scroller = button.closest<HTMLElement>('[data-compare-scroll], main');
      const bounds = scroller?.getBoundingClientRect();
      const box = button.getBoundingClientRect();
      const compact = scroller?.querySelector<HTMLElement>('[data-guild-header][data-compact-ready="true"]');
      const visibleTop = Math.max(0, bounds?.top ?? 0, compact?.getBoundingClientRect().bottom ?? 0);
      if (box.top < visibleTop || box.bottom > Math.min(window.innerHeight, bounds?.bottom ?? window.innerHeight) || box.right <= 0 || box.left >= window.innerWidth) setOpen(false);
    };
    window.addEventListener("pointerdown", outside);
    // Capture Escape before the enclosing overlay's close handler.
    window.addEventListener("keydown", escape, true);
    window.addEventListener("scroll", checkVisible, true);
    window.addEventListener("resize", checkVisible);
    checkVisible();
    return () => { window.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", escape, true); window.removeEventListener("scroll", checkVisible, true); window.removeEventListener("resize", checkVisible); };
  }, [open]);
  return <div className={styles.displayRoot} ref={root}>
    <button ref={trigger} type="button" className={styles.displayTrigger} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)} data-compare-display>{t("dashboardCompare.display")}<ChevronDown size={14} aria-hidden /></button>
    <div ref={popup} hidden={!open} id={id} style={popupStyle} className={styles.displayPopup} role="region" aria-label={t("dashboardCompare.display")} data-compare-display-popup={open ? "" : undefined}>
      {children}<div className={styles.displayChoices}>
      {(mode === "base" || mode === "total") && <div className={styles.metricChoices} aria-label={t("guildHistory.metrics")}>{metrics.map(metric => <label key={metric} className={styles.metricToggle}><input type="checkbox" checked={selectedMetrics.includes(metric)} onChange={() => onToggleMetric(metric)} /><span>{metricLabel ? metricLabel(metric) : t("dashboardCompare.averages." + metric)}</span></label>)}</div>}
    </div></div>
  </div>;
}

export default function DashboardCompareChart({ comparison, mode, selectedMetrics, onToggleMetric, selectedGuilds, onToggleGuild, onSelectGuilds, headingAction, loading, error, currentAt, comparisonStand, comparisonValues, emblems, closeDisplaySignal, informationTarget, singleGuild = false, profileHud = false, playerComparison, chartRange }: ComparePresentation & {
  chartRange?: GuildChartRangeControl;
  playerComparison?: { history: DashboardHistory; selected: readonly string[] };
  singleGuild?: boolean; comparison: DashboardGuildComparison; mode: DashboardMemberMode; selectedMetrics: readonly DashboardHistoryMetric[];
  onToggleMetric: (metric: DashboardHistoryMetric) => void; onSelectGuilds: (keys: readonly string[]) => void;
  selectedGuilds: readonly string[]; onToggleGuild: (key: string) => void; headingAction?: React.ReactNode; profileHud?: boolean; loading?: boolean; error?: string | null; closeDisplaySignal?: unknown; informationTarget?: HTMLElement | null;
}) {
  const { t, i18n } = useTranslation();
  const hof = mode === "general";
  const availableRows = hof ? comparison.hofDisplayRows : comparison.displayRows;
  const metrics = dashboardModeMetrics(mode);
  const label = React.useCallback((metric: DashboardHistoryMetric) => t(metric === "hof" ? playerComparison ? "dashboardCompare.guildHof" : historyMetricLabelKey(metric) : "dashboardCompare.averages." + metric), [t, !!playerComparison]);
  const canToggleMetrics = mode === "base" || mode === "total";
  const activeMetrics = metrics.filter(metric => !canToggleMetrics || selectedMetrics.includes(metric));
  const playerLabel = React.useCallback((metric: DashboardHistoryMetric) => t(metric === "hof" ? "dashboardCompare.playerHof" : historyMetricLabelKey(metric)), [t]);
  const playerSeries = React.useMemo(() => playerComparison ? comparePlayerSeries(playerComparison.history, playerComparison.selected, activeMetrics, playerLabel) : [], [playerComparison?.history, playerComparison?.selected, mode, selectedMetrics, playerLabel]);
  const playerPoints = React.useMemo(() => new Map(playerSeries.map(series => [series.key, { series, row: playerComparison!.history.rows.find(row => row.member.key === series.memberKey)! }])), [playerSeries, playerComparison?.history]);
  const playerOwners = React.useMemo(() => new Map([...playerPoints.values()].map(entry => [entry.series.ownerKey, entry.row])), [playerPoints]);
  const preparedSeries = React.useMemo(() => guildComparisonSeries(comparison, mode, label), [comparison, mode, label]);
  const [visuals, setVisuals] = React.useState<Record<string, { accent: string; ready: boolean; source: string }>>({});
  const onAccent = React.useCallback((key: string, accent: string, ready: boolean, source: string) => setVisuals(current => current[key]?.accent === accent && current[key]?.ready === ready && current[key]?.source === source ? current : { ...current, [key]: { accent, ready, source } }), []);
  const accents = React.useMemo(() => Object.fromEntries(Object.entries(visuals).map(([key, visual]) => [key, visual.accent])), [visuals]);
  // The ranked pool stays mounted; selection alone controls every chart layer.
  const displayRows = React.useMemo(() => availableRows.filter(row => row.key === comparison.currentGuildKey || !singleGuild && selectedGuilds.includes(row.key)), [comparison, availableRows, selectedGuilds, singleGuild]);
  const allSelected = displayRows.length === availableRows.length;
  const [pointerGuild, setPointerGuild] = React.useState<string | null>(null);
  const [focusedGuild, setFocusedGuild] = React.useState<string | null>(null);
  const emphasisGuild = pointerGuild ?? focusedGuild;
  const clearEmphasis = React.useCallback(() => { setPointerGuild(null); setFocusedGuild(null); }, []);
  const colorsReady = displayRows.every(row => visuals[row.key]?.ready && visuals[row.key]?.source === emblemSourceKey(row, emblems[row.key]));
  const visibleGuilds = React.useMemo(() => new Set(displayRows.map(row => row.key)), [displayRows]);
  const plot = React.useMemo(() => {
    const guildTimes = (hof ? comparison.hofTimes : comparison.times).filter(at => displayRows.some(row => hof ? comparison.hof.get(row.key)?.has(at) : row.byTime.has(at)));
    const times = playerComparison ? [...new Set([...guildTimes, ...playerSeries.flatMap(row => row.timePoints.map(point => point.timestampMs))])].sort((a, b) => a - b) : guildTimes;
    return { times, timeDomain: times.length ? { startMs: times[0], endMs: times[times.length - 1] } : null };
  }, [comparison, displayRows, hof, playerSeries, !!playerComparison]);
  const fusionMarkers = React.useMemo(() => buildGuildAnalyticsFusionMarkers(
    displayRows.flatMap(row => comparison.fusionServersByGuild.get(row.key) ?? []), plot.timeDomain,
  ), [comparison, displayRows, plot]);
  const plotTimes = React.useMemo(() => new Set(plot.times), [plot]);
  const guildSeries = React.useMemo(() => preparedSeries.filter(row => visibleGuilds.has(row.ownerKey) && (!canToggleMetrics || selectedMetrics.includes(row.metric)))
    .map(row => ({ ...row, key: playerComparison ? JSON.stringify(["guild", row.key]) : row.key, timePoints: row.timePoints?.filter(point => plotTimes.has(point.timestampMs)), color: compareMetricColor(accents[row.ownerKey] ?? GUILD_ACCENT_FALLBACK, row.metric) })), [preparedSeries, visibleGuilds, canToggleMetrics, selectedMetrics, accents, plotTimes, !!playerComparison]);
  const series = React.useMemo(() => [...guildSeries, ...playerSeries.map(row => ({ ...row, color: compareMetricColor(row.color, row.metric) }))], [guildSeries, playerSeries]);
  const emptySelection = !activeMetrics.length;
  const comparePoints = React.useMemo(() => new Map(guildSeries.map(row => [row.key,
    { metric: row.metric, owner: availableRows.find(owner => owner.key === row.ownerKey) }])), [guildSeries, availableRows]);
  const pointCoverage = React.useCallback((point: GapChartScanPoint) => {
    const entry = comparePoints.get(point.seriesKey);
    return entry?.owner?.byTime.get(point.timestampMs)?.progress[entry.metric]?.coverage;
  }, [comparePoints]);
  const isPartialScanPoint = React.useCallback((point: GapChartScanPoint) => Boolean(pointCoverage(point)?.partial), [pointCoverage]);
  const scanPointNote = React.useCallback((point: GapChartScanPoint) => {
    const coverage = pointCoverage(point); return coverage ? dashboardCompareCoverageLabel(coverage, t) : "";
  }, [pointCoverage, t]);
  const highlighted = React.useMemo(() => series.map(row => row.key), [series]);
  const emphasized = React.useMemo(() => series.filter(row => row.ownerKey === emphasisGuild).map(row => row.key), [series, emphasisGuild]);
  const [scan, setScan] = React.useState<{ owner: string; at: number } | null>(null);
  const [hover, setHover] = React.useState<{ owner: string; at: number } | null>(null);
  const onHover = React.useCallback((point: GapChartScanPoint | null) => {
    const owner = point && (comparePoints.get(point.seriesKey)?.owner?.key ?? playerPoints.get(point.seriesKey)?.series.ownerKey);
    setHover(current => owner && point ? current?.owner === owner && current.at === point.timestampMs ? current : { owner, at: point.timestampMs } : current === null ? current : null);
  }, [comparePoints, playerPoints]);
  React.useEffect(() => { setHover(null); setScan(null); }, [mode, selectedGuilds, selectedMetrics, comparison, playerComparison?.selected]);
  const details = React.useMemo<HistoryScanDetails | null>(() => {
    const player = scan && playerOwners.get(scan.owner);
    if (player && scan) {
      const observation = player.byTime.get(scan.at);
      return { owner: player.member.name + (hof ? " · " + playerLabel("hof") : ""), at: scan.at,
        records: observation ? [{ source: observation.sourceScanFilename, values: Object.fromEntries((hof ? ["hof"] as const : metrics).map(metric => [metric, dashboardHistoryValue(observation, metric)])) }] : [] };
    }
    const row = scan && visibleGuilds.has(scan.owner) ? availableRows.find(row => row.key === scan.owner) : null;
    if (!row || !scan) return null;
    const stand = row.byTime.get(scan.at);
    if (hof) {
      const observation = comparison.hof.get(row.key)?.get(scan.at);
      return { owner: row.name + (playerComparison ? " · " + label("hof") : ""), at: scan.at, records: observation ? [{ source: observation.server + " · " + observation.identifier, values: { hof: observation.rank } }] : [] };
    }
    const all: DashboardHistoryMetric[] = ["xp", "baseMain", "conBase", "base", "attrTotal", "conTotal", "total", "mine", "treasury"];
    return { owner: row.name, at: scan.at, averages: true, records: stand ? [{ source: stand.guild.sourceScanFilename, roster: stand.complete ? stand : undefined, values: Object.fromEntries(all.map(metric => [metric, stand.progress[metric].value])), notes: Object.fromEntries(all.map(metric => [metric, dashboardCompareCoverageLabel(stand.progress[metric].coverage, t)])) }] : [] };
  }, [scan, comparison, availableRows, visibleGuilds, t, hof, playerOwners, playerLabel, label]);
  const visibleHover = hover && visibleGuilds.has(hover.owner) ? hover : null;
  const valueOwner = availableRows.find(row => row.key === (visibleHover?.owner ?? comparison.currentGuildKey));
  const hofObservation = valueOwner ? visibleHover
    ? comparison.hof.get(valueOwner.key)?.get(visibleHover.at)
    : [...(comparison.hof.get(valueOwner.key)?.values() ?? [])].sort((a, b) => b.at - a.at)[0] : undefined;
  const at = visibleHover?.at ?? (hof ? hofObservation?.at ?? currentAt : currentAt);
  const stand = valueOwner?.byTime.get(at);
  const previous = comparisonStand ? valueOwner?.byTime.get(comparisonStand.at) : undefined;
  const validPrevious = previous?.guild.sourceScanId === comparisonStand?.sourceScanId ? previous : undefined;
  const format = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? t("dashboardCompare.unavailable") : value.toLocaleString(i18n.resolvedLanguage ?? "en", { maximumFractionDigits: hof ? 0 : 2 });
  const guildValues = (
    <div className={styles.compareValues} data-compare-values data-value-context={visibleHover ? "scan" : "current"}>
      <p><strong>{valueOwner?.name ?? t("guildHistory.current")}</strong> · {hof && !hofObservation ? t("dashboardCompare.unavailable") : profileDateTime(at)}</p>
      {!visibleHover && !hof && <p>{t("guildProfileRange.comparisonScan")} · {comparisonStand ? profileDateTime(comparisonStand.at) : t("dashboardCompare.unavailable")}</p>}
      {hof && <p>{hofObservation?.server ?? "—"} · {t("guildHistory.hofObserved")}</p>}
      <dl>{activeMetrics.map(metric => {
        const value = hof ? undefined : stand?.progress[metric];
        // Strict prepared values keep W92 partial averages out of global delta rules.
        const currentValue = stand?.values[metric], oldValue = valueOwner?.key === comparison.currentGuildKey && comparisonValues ? comparisonValues[metric] : validPrevious?.values[metric];
        const delta = currentValue != null && oldValue != null ? currentValue - oldValue : null;
        return <div key={metric} data-compare-value={metric}><dt><i aria-hidden style={{ background: compareMetricColor(accents[valueOwner?.key ?? ""] ?? GUILD_ACCENT_FALLBACK, metric) }} />{label(metric)}</dt><dd>{format(hof ? hofObservation?.rank : value?.value)}{!visibleHover && !hof && <small data-compare-delta={delta ?? "unavailable"}> · Δ {delta != null && delta > 0 ? "+" : ""}{format(delta)}</small>}</dd>{value && <small data-compare-coverage>{dashboardCompareCoverageLabel(value.coverage, t)}</small>}</div>;
      })}</dl>
    </div>
  );
  const hoveredPlayer = hover && playerOwners.get(hover.owner);
  const values = hoveredPlayer && hover ? <div className={styles.compareValues} data-compare-values data-value-context="scan" data-player-values={hoveredPlayer.member.key}>
    <p><strong>{hoveredPlayer.member.name}</strong> · {profileDateTime(hover.at)}</p>
    <dl>{activeMetrics.map(metric => <div key={metric} data-compare-value={metric}><dt><i aria-hidden style={{ background: playerSeries.find(row => row.memberKey === hoveredPlayer.member.key && row.metric === metric)?.color }} />{playerLabel(metric)}</dt><dd>{format(dashboardHistoryValue(hoveredPlayer.byTime.get(hover.at), metric))}</dd></div>)}</dl>
  </div> : guildValues;
  return <section className={styles.compare} data-guild-compare data-compare-mode={mode}>
    <div className={styles.heading} data-profile-chart-hud={profileHud || undefined}><h2 data-profile-title-group={profileHud || undefined}>{profileHud && headingAction}{t(singleGuild ? "guildChartDetails.trend" : "guildChartDetails.compare")}{!profileHud && headingAction}{profileHud && <ChartHistoryInfo hof={hof} bridgeGaps={mode === "fortress"} partialAverages={!hof} />}</h2><div className={styles.compareActions}>
      <div hidden={singleGuild && !chartRange}><CompareDisplay mode={mode} metrics={metrics} selectedMetrics={selectedMetrics} onToggleMetric={onToggleMetric} closeSignal={closeDisplaySignal} onClose={clearEmphasis}>
        {!singleGuild && availableRows.some(row => row.key !== comparison.currentGuildKey) && <button type="button" className={styles.selectGuilds} data-compare-select-all onClick={() => onSelectGuilds(allSelected ? [] : availableRows.map(row => row.key))}>{t(allSelected ? "dashboardCompare.onlyMainGuild" : "dashboardCompare.selectAll")}</button>}
        <div hidden={singleGuild} className={styles.guildLegend} aria-label={t("guildHistory.guilds")}>{availableRows.map(row => <div key={row.key}><CompareEmblem row={row} source={emblems[row.key]} current={row.key === comparison.currentGuildKey} selected={selectedGuilds.includes(row.key)} onToggle={onToggleGuild} onAccent={onAccent} onEmphasis={setPointerGuild} onKeyboardEmphasis={setFocusedGuild} /></div>)}</div>
        {playerSeries.length > 0 && <div className={styles.metricLegend} data-compare-player-legend>{playerSeries.map(row => <span key={row.key} style={{ color: row.color }}>{row.label}</span>)}</div>}
        {playerComparison && hof && <div className={styles.metricLegend}>{label("hof")} · {playerLabel("hof")}</div>}
        {chartRange && <DashboardChartRange {...chartRange} />}
      </CompareDisplay></div>
      {!profileHud && <ChartHistoryInfo hof={hof} bridgeGaps={mode === "fortress"} partialAverages={!hof} />}
    </div></div>
    {profileHud && !singleGuild && <div className={styles.profileGuildPreview} data-compare-preview aria-label={t("guildHistory.guilds")}>
      {displayRows.map(row => <ComparePreviewEmblem key={row.key} row={row} source={emblems[row.key]} onEmphasis={setPointerGuild} />)}
    </div>}
    {(loading || error) && !comparison.times.length || !colorsReady ? <p role="status">{t(error ? "guildDashboardState.loadFailed" : "guildChartDetails.loading")}</p> : emptySelection ? <p className={styles.metricEmpty} role="status">{t("dashboardCompare.selectMetrics")}</p> : <HistoryLines connectObservedRanks={hof} fusionMarkers={fusionMarkers} rankAxis={hof} progressStyle semanticKey={mode} isPartialScanPoint={isPartialScanPoint} scanPointNote={scanPointNote} bridgeGaps={mode === "fortress"} history={plot} series={series} selectedKeys={highlighted} emphasizedKeys={emphasized} onHoverScanPoint={onHover} onScanSelect={point => { const owner = comparePoints.get(point.seriesKey)?.owner?.key ?? playerPoints.get(point.seriesKey)?.series.ownerKey; if (owner) setScan({ owner, at: point.timestampMs }); }} />}
    {informationTarget ? createPortal(values, informationTarget) : values}
    {details && <div className={styles.scanPopover}><ScanValueDetails details={details} onClose={() => setScan(null)} /></div>}
  </section>;
}
