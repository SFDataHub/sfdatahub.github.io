import { profileLocale, profileNumber, profilePercent, profileDate, profileDateTime, profileClassLabel } from "../../lib/i18n/profilePresentation";
import DashboardChartRange, { type GuildChartRangeControl } from "./DashboardChartRange";
import { useAnalyticsView } from "../../lib/analytics/localEvents";
import { useLocation } from "react-router-dom";
import { useActualProfileLocation } from "../../lib/data-hub/profileNavigation";
import React from "react";
import { buildGuildAnalyticsFusionMarkers, type GuildAnalyticsFusionMarker } from "../../lib/guilds/guildAnalyticsFusionMarkers";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { hasBackCloseLayer, useBackClose } from "../../hooks/useBackClose";
import { getClassIconUrl } from "../../components/ui/shared/classIcons";
import { HistoryLines, ChartHistoryInfo, ScanValueDetails, historyMetricLabelKey, type HistoryScanDetails } from "./DashboardHistoryChart";
import type { DashboardGuildComparison } from "./dashboardGuildComparison";
import DashboardCompareChart, { CompareDisplay, type ComparePresentation } from "./DashboardCompareChart";
export { default as DashboardCompareChart } from "./DashboardCompareChart";
import { dashboardHistoryValue, dashboardModeMetrics, type DashboardHistoryMetric } from "./dashboardHistory";
import type { DashboardMemberMode } from "./localGuildRanking";
import GuildTrendChart, { getGuildTrendMetric, guildTrendRateDigits, type GuildTrendChartMetric, type GuildTrendChartInterval } from "../../components/guild-trend/GuildTrendChart";
import GuildClassDistributionPie from "../../components/guilds/GuildClassOverview/GuildClassDistributionPie";
import { buildDashboardMemberTrends, type DashboardHistory, type DashboardHistoryMember } from "./dashboardHistory";
import dialog from "../../components/guilds/LocalGuildRankingOverlay.module.css";
import styles from "./DashboardChartDetails.module.css";
import overlay from "./DashboardCompareOverlay.module.css";
import DashboardMembersPanel, { type DashboardCompareMembers } from "./DashboardMembersPanel";
import { toggleMemberSelection } from "./dashboardMemberChartModel";
const noopClose = () => {};
const number = (value: number | null | undefined, maximumFractionDigits = 2) => value == null || !Number.isFinite(value) ? "—" : value.toLocaleString(profileLocale(), { maximumFractionDigits });
const date = (value: number) => profileDate(value, { day: "numeric", month: "numeric", year: "numeric" });

export function ChartDetailButton({ title, onClick }: { title: string; onClick: (trigger: HTMLElement) => void }) {
  const { t } = useTranslation();
  return <button type="button" className={styles.detailButton} aria-label={t("guildChartDetails.open", { title })} title={t("guildChartDetails.open", { title })} onClick={event => onClick(event.currentTarget)}><Search size={16} aria-hidden /></button>;
}
type CompareDetailState = ComparePresentation & {
  chartRange?: GuildChartRangeControl;
  comparison: DashboardGuildComparison;
  selectedMetrics?: readonly DashboardHistoryMetric[];
  selectedGuilds?: readonly string[];
};
function CompareDetails({ comparison, mode: initialMode, selectedMetrics, selectedGuilds, history, memberPanel, ...presentation }: CompareDetailState & {
  history: DashboardHistory; memberPanel?: DashboardCompareMembers;
  mode: DashboardMemberMode; loading?: boolean; error?: string | null;
}) {
  const { t } = useTranslation();
  // Snapshot the Dashboard selection on mount; all later changes stay in this overlay.
  const [mode, setMode] = React.useState(initialMode);
  const [metrics, setMetrics] = React.useState<readonly DashboardHistoryMetric[]>(() => [...(selectedMetrics ?? ["base", "total"])]);
  const [guilds, setGuilds] = React.useState<readonly string[]>(() => [...(selectedGuilds ?? [])]);
  const [players, setPlayers] = React.useState<string[]>([]);
  const widthPreference = React.useRef<{ guildId: string; narrow: boolean } | null>(null);
  const toggleGuild = (key: string) => setGuilds(current => current.includes(key) ? current.filter(value => value !== key) : [...current, key]);
  const toggleMetric = (metric: DashboardHistoryMetric) => setMetrics(current => current.includes(metric) ? current.filter(value => value !== metric) : [...current, metric]);
  return <div className={overlay.workspace} data-compare-workspace>
    {memberPanel && <DashboardMembersPanel {...memberPanel} overlayLayout guildId={comparison.currentGuildKey} widthPreference={widthPreference} mode={mode} selectedClasses={[]} selectedMemberKeys={players} onMemberSelect={member => setPlayers(current => toggleMemberSelection(current, member.key))} />}
    <div className={styles.compareDetail + " " + overlay.chartPane}>
    <div className={styles.modeToggle} role="group" aria-label={t("dashboardCompare.mode")} data-compare-mode-toggle>
      {(["general", "progress", "base", "total", "fortress"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>{t("dashboardCompare.modes." + value)}</button>)}
    </div>
    <DashboardCompareChart {...presentation} comparison={comparison} mode={mode} selectedGuilds={guilds} onToggleGuild={toggleGuild} onSelectGuilds={setGuilds} selectedMetrics={metrics} onToggleMetric={toggleMetric} playerComparison={{ history, selected: players }} />
    </div>
  </div>;
}
export default function DashboardChartDetails({ kind, history, members, metric: initialMetric, mode = "general", compare, compareMembers, intervals, loading, error, onClose, trigger, fusionMarkers, chartRange }: {
  chartRange?: GuildChartRangeControl;
  compareMembers?: DashboardCompareMembers;
  fusionMarkers?: readonly GuildAnalyticsFusionMarker[];
  kind: "classes" | "trend" | "compare"; history: DashboardHistory; members: readonly DashboardHistoryMember[];
  metric: GuildTrendChartMetric | null; mode?: DashboardMemberMode; compare?: CompareDetailState; intervals: GuildTrendChartInterval[]; loading?: boolean; error?: string | null; onClose: () => void; trigger: HTMLElement | null;
}) {
  const { t } = useTranslation();
  const titleId = React.useId(), panel = React.useRef<HTMLDivElement>(null);
  const location = useLocation(), actualLocation = useActualProfileLocation();
  const covered = location.key !== actualLocation.key;
  const coveredRef = React.useRef(covered);
  coveredRef.current = covered;
  useAnalyticsView("datahub/guild/chart-details");
  const [bounds, setBounds] = React.useState<{ left: number; width: number } | null>(null);
  React.useLayoutEffect(() => {
    if (kind !== "compare") return;
    // ContentShell's center main sits inside the padded ContentFrame/Frame.
    // Anchor to that local Frame, including its padding and empty rail tracks.
    const shell = trigger?.closest("main")?.closest<HTMLElement>("section.relative.w-full.overflow-hidden.border");
    const update = () => {
      const rect = shell?.getBoundingClientRect();
      const left = rect?.left ?? 20, width = rect?.width ?? innerWidth - 40;
      setBounds(current => current?.left === left && current.width === width ? current : { left, width });
    };
    update(); const observer = new ResizeObserver(update); if (shell) observer.observe(shell);
    window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [kind, trigger]);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [metric, setMetric] = React.useState<GuildTrendChartMetric>(initialMetric ?? "xp");
  const metricOptions = dashboardModeMetrics(mode).filter((value): value is GuildTrendChartMetric => value !== "hof");
  const metricLabel = React.useCallback((metric: DashboardHistoryMetric) => t(historyMetricLabelKey(metric)), [t]);
  const [scan, setScan] = React.useState<{ owner: string; at: number } | null>(null);
  const scanDetails = React.useMemo<HistoryScanDetails | null>(() => {
    const row = scan ? history.rows.find(row => row.member.key === scan.owner) : null;
    if (!row || !scan) return null;
    const records = row.observations.filter(value => value.snapshotTimestamp === scan.at);
    const metrics: DashboardHistoryMetric[] = ["xp","baseMain","conBase","base","attrTotal","conTotal","total","mine","treasury"];
    return { owner: row.member.name, at: scan.at, records: records.map(record => ({ source: record.sourceScanFilename, level: record.level, values: Object.fromEntries(metrics.map(metric => [metric, dashboardHistoryValue(record, metric)])) })) };
  }, [scan, history]);
  const selectedFusionMarkers = React.useMemo(() => selected.length ? buildGuildAnalyticsFusionMarkers(
    history.rows.filter(row => selected.includes(row.member.key)).flatMap(row => row.observations.map(observation => observation.server)), history.timeDomain,
  ) : fusionMarkers, [selected, history, fusionMarkers]);
  const trends = React.useMemo(() => kind === "trend" && selected.length > 0 ? buildDashboardMemberTrends(history, metric) : [], [history, metric, kind, selected.length > 0]);
  const toggle = (key: string) => setSelected(current => current.includes(key) ? current.filter(value => value !== key) : [...current, key]);
  const pool = selected.length ? members.filter(member => selected.includes(member.key)) : members;
  const entries = [...new Set(pool.map(member => member.classLabel ?? t("guildChartDetails.unknown")))].map(classLabel => ({ classLabel, classMeta: pool.find(member => member.classLabel === classLabel)?.classMeta ?? null, count: pool.filter(member => (member.classLabel ?? t("guildChartDetails.unknown")) === classLabel).length }));
  const requestClose = React.useCallback(() => { if (hasBackCloseLayer()) window.history.back(); else onClose(); }, [onClose]);
  useFocusTrap(panel, !covered);
  useBackClose(true, onClose);
  React.useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !coveredRef.current) { event.preventDefault(); requestClose(); } };
    window.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", escape); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, [requestClose, trigger]);
  return createPortal(<div className={dialog.backdrop + (kind === "compare" ? " " + overlay.backdrop : "")} style={{ visibility: covered ? "hidden" : undefined }} aria-hidden={covered || undefined} onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}>
    <div className={dialog.panel + " " + styles.panel + (kind === "compare" ? " " + overlay.panel : "")} style={kind === "compare" && bounds ? { "--compare-shell-left": bounds.left + "px", "--compare-shell-width": bounds.width + "px" } as React.CSSProperties : undefined} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panel} data-guild-chart-details={kind}>
      <div className={dialog.header}><h2 id={titleId}>{t("guildChartDetails." + kind)}</h2><button type="button" aria-label={t("localProfileRoute.close")} onClick={requestClose}><X size={20} aria-hidden /></button></div>
      <div className={dialog.scroll + (kind === "compare" ? " " + overlay.body : "")} data-compare-scroll={kind === "compare" ? "" : undefined}>
        {kind === "trend" && mode === "general" ? compare && <div className={styles.compareDetail}><DashboardCompareChart {...compare} chartRange={chartRange} singleGuild mode="general" selectedMetrics={[]} onToggleMetric={() => {}} selectedGuilds={[]} onToggleGuild={() => {}} onSelectGuilds={() => {}} loading={loading} error={error} /></div> : kind === "compare" ? compare && <CompareDetails {...compare} chartRange={chartRange} history={history} memberPanel={compareMembers} mode={mode} loading={loading} error={error} /> : <>
        {kind === "trend" && <CompareDisplay mode="progress" metrics={[]} selectedMetrics={[]} onToggleMetric={() => {}} onClose={noopClose}>
          <label className={styles.rangeSelect}>{t("dashboardTrend.metricSelection")}<select value={metric} data-trend-metric onChange={event => setMetric(event.target.value as GuildTrendChartMetric)}>{metricOptions.map(value => <option key={value} value={value}>{t("dashboardTrend.metrics." + value)}</option>)}</select></label>
          {chartRange && <DashboardChartRange {...chartRange} />}
        </CompareDisplay>}
        {kind !== "classes" && <div className={styles.heading}><div className={styles.metricLegend}>{[metric].map(metric => <span key={metric}>{!selected.length ? "Ø " : ""}{metricLabel(metric)}</span>)}</div><ChartHistoryInfo /></div>}
        {kind === "trend" && selected.length > 0 && <p>{t("guildChartDetails.memberRates")}</p>}
        <div className={styles.detailGrid}><div className={styles.visual}>
          {kind === "classes" ? <><GuildClassDistributionPie entries={entries} heading={false} renderIcon={entry => <img src={getClassIconUrl(entry.classLabel)} alt="" />} /><p>{t("guildChartDetails.memberCount", { count: pool.length })}</p><ul>{entries.map(entry => <li key={entry.classLabel}>{profileClassLabel(entry.classLabel)}: {profileNumber(entry.count)} · {profilePercent(pool.length ? entry.count / pool.length * 100 : 0, 2)}</li>)}</ul></>
            : (loading || error) && !intervals.length ? <p role="status">{t(error ? "guildDashboardState.loadFailed" : "guildChartDetails.loading")}</p>
            : kind === "trend" && !selected.length ? <GuildTrendChart averageLabels fusionMarkers={fusionMarkers} intervals={intervals} metric={metric} animateBuild showTrendInfo title={t("guildChartDetails.trend")} />
            : <HistoryLines fusionMarkers={selectedFusionMarkers} auditFamily="F11" history={history} series={trends} selectedKeys={selected} onScanSelect={point => setScan({ owner: point.seriesKey, at: point.timestampMs })} />}
        </div><fieldset className={styles.members}><legend>{t("guildChartDetails.members")}</legend><button type="button" onClick={() => setSelected([])}>{t("guildChartDetails.clear")}</button>{members.map(member => <label key={member.key}><input type="checkbox" checked={selected.includes(member.key)} onChange={() => toggle(member.key)} /><span>{member.name}</span><small>{profileClassLabel(member.classLabel)}</small></label>)}</fieldset></div>
        {scanDetails && <ScanValueDetails details={scanDetails} onClose={() => setScan(null)} />}
        {kind !== "classes" && <><p>{t("guildChartDetails.missing")}</p>
          <div className={styles.tableScroll}><table><caption>{t(kind === "trend" ? selected.length ? "guildChartDetails.intervalDetails" : "dashboardTrend.intervalDetails" : "guildChartDetails.values")}</caption><thead><tr><th>{t(!selected.length ? "dashboardTrend.guildAverage" : "guildChartDetails.member")}</th><th>{t("guildChartDetails.date")}</th><th>{t("guildChartDetails.value")}</th>{kind === "trend" && <><th>{t("guildChartDetails.intervalGrowth")}</th><th>{t("guildChartDetails.perDay")}</th></>}</tr></thead><tbody>
          {!selected.length && intervals.map((interval, index) => {
            const value = getGuildTrendMetric(interval, metric), pair = interval.coverage?.[metric];
            const state = !value ? null : pair?.end.partial ? "normal" : pair?.start.partial ? "faint" : "none";
            return <tr key={index} data-guild-interval-detail={index} data-trend-hatch-state={state ?? undefined}>
              <th scope="row">Ø {t("dashboardTrend.metrics." + metric)}</th><td>{date(interval.start.scannedAtMs)} – {date(interval.end.scannedAtMs)}
                {pair && <div>{(["start", "end"] as const).map(end => <div key={end}>{t("dashboardTrend.coverage", { end: t("dashboardTrend." + end), date: profileDateTime(interval[end].scannedAtMs), used: pair[end].used, declared: pair[end].declared ?? "—" })}{pair[end].reason ? " · " + t("dashboardCompare.excluded." + pair[end].reason, pair[end]) : ""}</div>)}</div>}
                {state && state !== "none" ? <div>{t("dashboardTrend.hatchingDescription." + state)}</div> : !value ? <div>{t("dashboardTrend.excludedInterval")}</div> : null}
              </td><td>{number(value?.endAverage)}</td><td>{number(value?.absoluteGrowth)}</td><td>{number(value?.perDay, guildTrendRateDigits(metric))}</td>
            </tr>;
          })}
          {trends.filter(row => !selected.length || selected.includes(row.key)).flatMap(row => row.pairs.map(pair => <tr key={row.key + pair.end.scannedAtMs}><th scope="row">{row.label}</th><td>{date(pair.start.scannedAtMs)} – {date(pair.end.scannedAtMs)}</td><td>{number(pair.endValue)}</td><td>{number(pair.growth)}</td><td>{number(pair.perDay, guildTrendRateDigits(metric))}</td></tr>))}
          </tbody></table></div></>}
        </>}
      </div>
    </div>
  </div>, document.body);
}
