import React from "react";
import { DataHubLoadingState } from "../../components/ui/shared/DataHubLoadingState";
import type { GuildSnapshotCompletenessReport } from "../../lib/guilds/guildSnapshotCompleteness";
import { listGuildHubScanSummaries } from "../../lib/guilds/localScanLibrary";
import type {
  GuildTrendBuildResult,
  GuildTrendInterval,
  GuildTrendMetric,
  GuildTrendPeriod,
  PlayerPerformancePeriodKey,
} from "./playerPerformanceModel";
import {
  PlayerPerformanceWorkerCancelledError,
  startPlayerPerformanceWorkerRun,
  type PlayerPerformanceProgress,
  type PlayerPerformanceWorkerRun,
} from "./playerPerformanceWorkerClient";
import styles from "./ProgressVisualsPage.module.css";

const PERIOD_KEYS: PlayerPerformancePeriodKey[] = ["short", "medium", "long"];

export default function PlayerPerformancePage() {
  const [selectedPeriod, setSelectedPeriod] = React.useState<PlayerPerformancePeriodKey>("short");
  const [result, setResult] = React.useState<GuildTrendBuildResult | null>(null);
  const [progress, setProgress] = React.useState<PlayerPerformanceProgress | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const activeInventoryKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let workerRun: PlayerPerformanceWorkerRun | null = null;

    const load = async () => {
      setLoading(true);
      setError(null);
      setProgress(null);
      try {
        const summaries = await listGuildHubScanSummaries();
        if (cancelled) return;
        const inventoryKey = buildScanInventoryKey(summaries);
        if (activeInventoryKeyRef.current === inventoryKey) return;
        activeInventoryKeyRef.current = inventoryKey;
        workerRun = startPlayerPerformanceWorkerRun({
          summaries,
          onProgress: (nextProgress) => {
            if (!cancelled) setProgress(nextProgress);
          },
        });
        const nextResult = await workerRun.promise;
        if (cancelled) return;
        setResult(nextResult);
        const firstAvailable = PERIOD_KEYS.find((key) => nextResult.periods[key].interval);
        if (firstAvailable) setSelectedPeriod(firstAvailable);
      } catch (loadError) {
        if (loadError instanceof PlayerPerformanceWorkerCancelledError || cancelled) return;
        console.error("[GuildTrendPage] failed to build guild trend", loadError);
        if (!cancelled) setError("Gildentrend konnte nicht aus den lokalen Analytics-Daten erstellt werden.");
      } finally {
        if (!cancelled) setLoading(false);
        if (cancelled) activeInventoryKeyRef.current = null;
      }
    };

    void load();

    return () => {
      cancelled = true;
      workerRun?.cancel();
    };
  }, []);

  const selectedInterval = result?.periods[selectedPeriod]?.interval ?? null;
  const firstSnapshot = result?.snapshots[0] ?? null;
  const lastSnapshot = result?.snapshots.length ? result.snapshots[result.snapshots.length - 1] : null;

  return (
    <main className={styles.page}>
      <section className={styles.headerPanel}>
        <div>
          <p className={styles.kicker}>Playground</p>
          <h1>Gildentrend</h1>
          <p>
            Prototyp für die historische Entwicklung der Testgilde mit vollständigen Snapshot-Durchschnitten, absoluten Ständen und gewichteten Tagestrends.
          </p>
        </div>
        {result ? (
          <div className={styles.scanBadge}>
            <strong>{result.loadedScanCount.toLocaleString("de-DE")}</strong>
            <span>lokale Scans</span>
          </div>
        ) : null}
      </section>

      {loading ? (
        <section className={styles.loadingPanel}>
          <DataHubLoadingState
            title="Gildentrend wird geladen"
            message={progress?.message ?? "Lokale Analytics-Daten werden vorbereitet."}
          />
        </section>
      ) : error ? (
        <section className={styles.statePanel}>{error}</section>
      ) : !result || result.status === "empty" || result.status === "missing-guild" ? (
        <section className={styles.statePanel}>{result?.message ?? "Keine verwertbaren Gildendaten gefunden."}</section>
      ) : (
        <>
          <section className={styles.controls}>
            <div className={styles.playerSummary}>
              <span>Testgilde</span>
              <strong>{result.guild?.name ?? "Welten im Wandel"}</strong>
              <small>{result.guild?.identifier ?? "Guild-Identity nicht verfügbar"}</small>
            </div>
            <div className={styles.playerSummary}>
              <span>Vollständige Snapshots</span>
              <strong>{result.snapshots.length.toLocaleString("de-DE")}</strong>
              <small>
                {firstSnapshot && lastSnapshot
                  ? `${formatDate(firstSnapshot.scannedAtMs)} bis ${formatDate(lastSnapshot.scannedAtMs)}`
                  : "Keine Zeitreihe"}
              </small>
            </div>
            <div className={styles.periodControls} aria-label="Ausgewählter Zeitraum">
              {PERIOD_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={!result.periods[key].interval}
                  data-active={selectedPeriod === key}
                  onClick={() => setSelectedPeriod(key)}
                >
                  {result.periods[key].label}
                  {result.periods[key].interval ? <span>{result.periods[key].interval?.fullDays} Tage</span> : <span>fehlt</span>}
                </button>
              ))}
            </div>
          </section>

          {result.message ? <section className={styles.statePanel}>{result.message}</section> : null}

          <section className={styles.periodCardGrid}>
            {PERIOD_KEYS.map((key) => (
              <PeriodCard
                key={key}
                period={result.periods[key]}
                active={selectedPeriod === key}
                onSelect={() => setSelectedPeriod(key)}
              />
            ))}
          </section>

          <GuildTrendChart
            title="Gilden-XP-Entwicklung"
            metric="xp"
            intervals={result.intervals}
            selectedInterval={selectedInterval}
            excludedGuildSnapshots={result.excludedGuildSnapshots}
          />
          <GuildTrendChart
            title="Gilden-Basiswerte-Entwicklung"
            metric="base"
            intervals={result.intervals}
            selectedInterval={selectedInterval}
            excludedGuildSnapshots={result.excludedGuildSnapshots}
          />
        </>
      )}
    </main>
  );
}

function buildScanInventoryKey(summaries: Awaited<ReturnType<typeof listGuildHubScanSummaries>>) {
  return summaries
    .map((summary) => [
      summary.sourceScanId,
      summary.updatedAtIso ?? summary.updatedAt,
      summary.contentHash ?? "",
      summary.analyticsEnabled ? "analytics" : "raw",
    ].join(":"))
    .sort()
    .join("|");
}

function PeriodCard({
  period,
  active,
  onSelect,
}: {
  period: GuildTrendPeriod;
  active: boolean;
  onSelect(): void;
}) {
  const interval = period.interval;
  return (
    <button
      type="button"
      className={styles.periodCard}
      data-active={active}
      disabled={!interval}
      onClick={onSelect}
    >
      <span>{period.label}</span>
      {interval ? (
        <>
          <strong>{interval.fullDays} Tage</strong>
          <small>
            {formatDate(interval.start.scannedAtMs)} bis {formatDate(interval.end.scannedAtMs)}
          </small>
          <dl>
            <div>
              <dt>XP Start</dt>
              <dd>{formatNumber(interval.xp.startAverage)}</dd>
            </div>
            <div>
              <dt>XP Ende</dt>
              <dd>{formatNumber(interval.xp.endAverage)}</dd>
            </div>
            <div>
              <dt>XP Wachstum</dt>
              <dd>{formatSignedNumber(interval.xp.absoluteGrowth)}</dd>
            </div>
            <div>
              <dt>XP/Tag</dt>
              <dd>{formatSignedNumber(interval.xp.perDay)}</dd>
            </div>
            <div>
              <dt>Basis Start</dt>
              <dd>{formatNumber(interval.base.startAverage, 2)}</dd>
            </div>
            <div>
              <dt>Basis Ende</dt>
              <dd>{formatNumber(interval.base.endAverage, 2)}</dd>
            </div>
            <div>
              <dt>Basis Wachstum</dt>
              <dd>{formatSignedNumber(interval.base.absoluteGrowth, 2)}</dd>
            </div>
            <div>
              <dt>Basis/Tag</dt>
              <dd>{formatSignedNumber(interval.base.perDay, 2)}</dd>
            </div>
          </dl>
        </>
      ) : (
        <>
          <strong>Nicht verfügbar</strong>
          <small>{period.missingReason ?? "Kein passendes Scanpaar verfügbar."}</small>
        </>
      )}
    </button>
  );
}

function GuildTrendChart({
  title,
  metric,
  intervals,
  selectedInterval,
  excludedGuildSnapshots,
}: {
  title: string;
  metric: "xp" | "base";
  intervals: GuildTrendInterval[];
  selectedInterval: GuildTrendInterval | null;
  excludedGuildSnapshots: GuildSnapshotCompletenessReport[];
}) {
  const absoluteValues = intervals.flatMap((interval) => {
    const values = getMetric(interval, metric);
    return [values.startAverage, values.endAverage];
  });
  const dailyValues = intervals.flatMap((interval) => {
    const values = getMetric(interval, metric);
    return [values.perDay, values.trendPerDay];
  }).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const absoluteMax = Math.max(1, ...absoluteValues.map((value) => Math.abs(value)));
  const width = 940;
  const height = 310;
  const plotTop = 28;
  const plotBottom = 238;
  const plotHeight = plotBottom - plotTop;
  const rateScale = buildRateScale(dailyValues, plotTop, plotBottom);
  const gap = 10;
  const barWidth = intervals.length ? Math.max(10, (width - 100 - gap * (intervals.length - 1)) / intervals.length) : 0;
  const trendRuns = buildTrendRuns(intervals, metric, { barWidth, gap, rateScale });

  return (
    <section className={styles.performancePanel}>
      <div className={styles.radarIntro}>
        <p className={styles.kicker}>Gildenentwicklung</p>
        <h2>{title}</h2>
        <p>Die Balken zeigen absolute Snapshot-Durchschnitte; Punkt und Linie nutzen die separate Veränderung-pro-Tag-Skala.</p>
      </div>

      {intervals.length ? (
        <>
          <div className={styles.performanceLegend} aria-label="Diagrammlegende">
            <span><i className={styles.legendBar} />Gildenstand</span>
            <span><i className={styles.legendGrowth} />Wachstum / Verlust</span>
            <span><i className={styles.legendPoint} />Gilde pro Tag</span>
            <span><i className={styles.legendTrend} />Gewichteter Gildentrend</span>
          </div>
          <svg className={styles.performanceChart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
            <line className={styles.chartBaseline} x1="48" y1={plotBottom} x2={width - 48} y2={plotBottom} />
            <line className={styles.chartZeroLine} x1="48" y1={rateScale.zeroY} x2={width - 48} y2={rateScale.zeroY} />
            <text className={styles.chartScaleLabel} x="48" y="18">Absolut</text>
            <text className={styles.chartScaleLabel} x={width - 48} y="18" textAnchor="end">pro Tag</text>
            {intervals.map((interval, index) => {
              const values = getMetric(interval, metric);
              const x = 52 + index * (barWidth + gap);
              const yStart = absoluteY(values.startAverage, absoluteMax, plotTop, plotHeight);
              const yEnd = absoluteY(values.endAverage, absoluteMax, plotTop, plotHeight);
              const lower = Math.min(values.startAverage, values.endAverage);
              const upper = Math.max(values.startAverage, values.endAverage);
              const yUpper = absoluteY(upper, absoluteMax, plotTop, plotHeight);
              const yLower = absoluteY(lower, absoluteMax, plotTop, plotHeight);
              const highlighted = selectedInterval ? isIntervalInPeriod(interval, selectedInterval) : false;
              const labelVisible = shouldShowXAxisLabel(index, intervals.length);

              return (
                <g key={`${interval.start.snapshotId}-${interval.end.snapshotId}-${index}`}>
                  <rect
                    className={styles.guildStandBar}
                    data-highlighted={highlighted}
                    x={x}
                    y={values.absoluteGrowth < 0 ? yEnd : yStart}
                    width={barWidth}
                    height={Math.max(0, plotBottom - (values.absoluteGrowth < 0 ? yEnd : yStart))}
                    rx="3"
                  />
                  {values.absoluteGrowth !== 0 ? (
                    <rect
                      className={styles.guildGrowthBar}
                      data-direction={values.absoluteGrowth > 0 ? "positive" : "negative"}
                      x={x}
                      y={yUpper}
                      width={barWidth}
                      height={Math.max(0, yLower - yUpper)}
                    />
                  ) : null}
                  <line className={styles.guildStartMarker} x1={x} x2={x + barWidth} y1={yStart} y2={yStart} />
                  <line className={styles.guildEndMarker} x1={x} x2={x + barWidth} y1={yEnd} y2={yEnd} />
                  {labelVisible ? (
                    <text className={styles.chartLabel} x={x + barWidth / 2} y={height - 14} textAnchor="middle">
                      {formatAxisDate(interval.end.scannedAtMs)}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {trendRuns.map((run, index) => (
              run.length > 1 ? <path key={`guild-trend-${index}`} className={styles.playerTrendLine} d={buildTrendPath(run)} /> : null
            ))}
            {intervals.map((interval, index) => {
              const values = getMetric(interval, metric);
              const x = 52 + index * (barWidth + gap) + barWidth / 2;
              return (
                <circle
                  key={`guild-daily-${interval.start.snapshotId}-${interval.end.snapshotId}-${index}`}
                  className={styles.guildDailyPoint}
                  cx={x}
                  cy={rateScale.project(values.perDay)}
                  r="4"
                >
                  <title>{formatSignedNumber(values.perDay, metric === "xp" ? 0 : 2)} pro Tag</title>
                </circle>
              );
            })}
          </svg>
          <SegmentTable intervals={intervals} metric={metric} selectedInterval={selectedInterval} />
          <SegmentAudit intervals={intervals} metric={metric} excludedGuildSnapshots={excludedGuildSnapshots} />
        </>
      ) : (
        <div className={styles.noRadar}>
          <strong>Kein Gildenverlauf verfügbar</strong>
          <span>Für die Testgilde wurden noch keine zwei vollständigen chronologischen Scanzeitpunkte gefunden.</span>
        </div>
      )}
    </section>
  );
}

type TrendPoint = {
  x: number;
  y: number;
  value: number;
};

type RateScale = {
  min: number;
  max: number;
  zeroY: number;
  project(value: number): number;
};

function buildTrendRuns(
  intervals: GuildTrendInterval[],
  metric: "xp" | "base",
  scale: { barWidth: number; gap: number; rateScale: RateScale },
) {
  const runs: TrendPoint[][] = [];
  let currentRun: TrendPoint[] = [];

  intervals.forEach((interval, index) => {
    const value = getMetric(interval, metric).trendPerDay;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      if (currentRun.length) runs.push(currentRun);
      currentRun = [];
      return;
    }
    currentRun.push({
      x: 52 + index * (scale.barWidth + scale.gap) + scale.barWidth / 2,
      y: scale.rateScale.project(value),
      value,
    });
  });

  if (currentRun.length) runs.push(currentRun);
  return runs;
}

function buildTrendPath(points: TrendPoint[]) {
  if (points.length < 2) return "";
  const [first, ...rest] = points;
  if (points.length === 2) return `M ${first.x} ${first.y} L ${points[1].x} ${points[1].y}`;
  return rest.reduce((path, point, index) => {
    const previous = points[index];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${first.x} ${first.y}`);
}

function SegmentTable({
  intervals,
  metric,
  selectedInterval,
}: {
  intervals: GuildTrendInterval[];
  metric: "xp" | "base";
  selectedInterval: GuildTrendInterval | null;
}) {
  const selectedMetric = selectedInterval ? getMetric(selectedInterval, metric) : null;

  return (
    <div className={styles.segmentTable}>
      <div className={styles.guildSegmentTableHeader}>
        <span>Start</span>
        <span>Ende</span>
        <span>Dauer</span>
        <span>Durchschnitt Start</span>
        <span>Durchschnitt Ende</span>
        <span>Wachstum/Verlust</span>
        <span>pro Tag</span>
      </div>
      {intervals.map((interval, index) => {
        const values = getMetric(interval, metric);
        return (
          <div key={`${interval.start.snapshotId}-${interval.end.snapshotId}-${index}`} className={styles.guildSegmentRow}>
            <span>{formatDateTime(interval.start.scannedAtMs)}</span>
            <span>{formatDateTime(interval.end.scannedAtMs)}</span>
            <span>{formatDays(interval.elapsedDays)}</span>
            <span>{formatNumber(values.startAverage, metric === "xp" ? 0 : 2)}</span>
            <span>{formatNumber(values.endAverage, metric === "xp" ? 0 : 2)}</span>
            <span>{formatSignedNumber(values.absoluteGrowth, metric === "xp" ? 0 : 2)}</span>
            <span>{formatSignedNumber(values.perDay, metric === "xp" ? 0 : 2)}</span>
          </div>
        );
      })}
      {selectedInterval && selectedMetric ? (
        <div className={styles.guildSegmentTotalRow}>
          <strong>Gewählter Zeitraum gesamt</strong>
          <span>{formatDateTime(selectedInterval.start.scannedAtMs)}</span>
          <span>{formatDateTime(selectedInterval.end.scannedAtMs)}</span>
          <span>{formatDays(selectedInterval.elapsedDays)}</span>
          <span>{formatNumber(selectedMetric.startAverage, metric === "xp" ? 0 : 2)}</span>
          <span>{formatNumber(selectedMetric.endAverage, metric === "xp" ? 0 : 2)}</span>
          <span>{formatSignedNumber(selectedMetric.absoluteGrowth, metric === "xp" ? 0 : 2)}</span>
          <span>{formatSignedNumber(selectedMetric.perDay, metric === "xp" ? 0 : 2)}</span>
        </div>
      ) : null}
    </div>
  );
}

function SegmentAudit({
  intervals,
  metric,
  excludedGuildSnapshots,
}: {
  intervals: GuildTrendInterval[];
  metric: "xp" | "base";
  excludedGuildSnapshots: GuildSnapshotCompletenessReport[];
}) {
  return (
    <details className={styles.performanceAudit}>
      <summary>Berechnungsprüfung Gildentrend</summary>
      <div className={styles.performanceAuditGrid}>
        {intervals.map((interval, index) => {
          const values = getMetric(interval, metric);
          return (
            <div key={`${interval.start.snapshotId}-${interval.end.snapshotId}-${index}`} className={styles.performanceAuditItem}>
              <strong>{formatDateTime(interval.start.scannedAtMs)} → {formatDateTime(interval.end.scannedAtMs)}</strong>
              <span>Methode: vollständige Snapshot-Durchschnitte, kein Member-Pairing</span>
              <span>Dauer: {formatDays(interval.elapsedDays)}</span>
              <span>Startscan: {interval.start.sourceScanId}</span>
              <span>Endscan: {interval.end.sourceScanId}</span>
              <span>Startgilde: {interval.start.guildName ?? "-"} · {interval.start.guildIdentifier}</span>
              <span>Endgilde: {interval.end.guildName ?? "-"} · {interval.end.guildIdentifier}</span>
              <span>Deklarierte Mitglieder Start: {interval.start.declaredMemberCount}</span>
              <span>Gefundene eindeutige Member Start: {interval.start.foundUniqueMemberCount}</span>
              <span>Gültige XP Start: {interval.start.validXpTotalCount}</span>
              <span>Gültige Basiswerte Start: {interval.start.validFocusedBaseStatsCount}</span>
              <span>Deklarierte Mitglieder Ende: {interval.end.declaredMemberCount}</span>
              <span>Gefundene eindeutige Member Ende: {interval.end.foundUniqueMemberCount}</span>
              <span>Gültige XP Ende: {interval.end.validXpTotalCount}</span>
              <span>Gültige Basiswerte Ende: {interval.end.validFocusedBaseStatsCount}</span>
              <span>Durchschnitt Start: {formatNumber(values.startAverage, metric === "xp" ? 0 : 2)}</span>
              <span>Durchschnitt Ende: {formatNumber(values.endAverage, metric === "xp" ? 0 : 2)}</span>
              <span>Absolute Veränderung: {formatSignedNumber(values.absoluteGrowth, metric === "xp" ? 0 : 2)}</span>
              <span>Pro Tag: {formatSignedNumber(values.perDay, metric === "xp" ? 0 : 2)}</span>
            </div>
          );
        })}
        {excludedGuildSnapshots.map((snapshot) => (
          <div key={`${snapshot.snapshotId}:${snapshot.guildIdentifier ?? ""}`} className={styles.performanceAuditItem} data-status="excluded">
            <strong>Ausgeschlossen · {formatDateTime(snapshot.scannedAtMs)}</strong>
            <span>Scan: {snapshot.sourceScanId}</span>
            <span>Gilde: {snapshot.guildName ?? "-"} · {snapshot.guildIdentifier ?? "-"}</span>
            <span>Deklarierte Mitglieder: {snapshot.declaredMemberCount ?? "-"}</span>
            <span>Gefundene eindeutige Member: {snapshot.foundUniqueMemberCount}</span>
            <span>Gültige XP: {snapshot.validXpTotalCount}</span>
            <span>Gültige Basiswerte: {snapshot.validFocusedBaseStatsCount}</span>
            <em>{snapshot.exclusionReason ?? "Snapshot wurde ausgeschlossen."}</em>
          </div>
        ))}
      </div>
    </details>
  );
}

function getMetric(interval: GuildTrendInterval, metric: "xp" | "base"): GuildTrendMetric {
  return metric === "xp" ? interval.xp : interval.base;
}

function absoluteY(value: number, maxValue: number, top: number, height: number) {
  return top + height - Math.max(0, value) / maxValue * height;
}

function buildRateScale(values: number[], top: number, bottom: number): RateScale {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  const rawMin = finiteValues.length ? Math.min(...finiteValues) : 0;
  const rawMax = finiteValues.length ? Math.max(...finiteValues) : 1;
  if (!finiteValues.length || (rawMin === 0 && rawMax === 0)) {
    const project = (value: number) => bottom - value * (bottom - top);
    return {
      min: 0,
      max: 1,
      zeroY: bottom,
      project,
    };
  }
  const rawRange = rawMax - rawMin;
  const padding = Math.max(rawRange * 0.08, Math.abs(rawMax || rawMin) * 0.04, 1);
  const min = rawMin >= 0 ? 0 : rawMin - padding;
  const max = rawMax <= 0 ? 0 : rawMax + padding;
  const domainRange = Math.max(max - min, 1);
  const project = (value: number) => top + (max - value) / domainRange * (bottom - top);

  return {
    min,
    max,
    zeroY: project(0),
    project,
  };
}

function isIntervalInPeriod(interval: GuildTrendInterval, selectedInterval: GuildTrendInterval) {
  return (
    interval.start.scannedAtMs >= selectedInterval.start.scannedAtMs &&
    interval.end.scannedAtMs <= selectedInterval.end.scannedAtMs
  );
}

function shouldShowXAxisLabel(index: number, total: number) {
  if (total <= 12) return true;
  const step = Math.ceil(total / 8);
  return index === total - 1 || index % step === 0;
}

function formatNumber(value: number | null | undefined, maximumFractionDigits = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toLocaleString("de-DE", { maximumFractionDigits });
}

function formatSignedNumber(value: number | null | undefined, maximumFractionDigits = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("de-DE", { maximumFractionDigits })}`;
}

function formatDate(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Date(value).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatAxisDate(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Date(value).toLocaleDateString("de-DE", { month: "2-digit", year: "2-digit" });
}

function formatDateTime(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Date(value).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDays(value: number) {
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: 1 })} Tage`;
}
