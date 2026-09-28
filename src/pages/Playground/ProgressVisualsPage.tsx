import React from "react";
import { DataHubLoadingState } from "../../components/ui/shared/DataHubLoadingState";
import { listGuildHubScanSummaries, type GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";
import { normalizeServerKeyFromInput } from "../../lib/players/identifier";
import type {
  ProgressRadarAxis,
  ProgressRadarBuildResult,
  ProgressRadarMode,
  ProgressRadarPeriodKey,
  ProgressRadarView,
} from "./progressRadarModel";
import {
  ProgressRadarWorkerCancelledError,
  startProgressRadarWorkerRun,
  type ProgressRadarProgress,
  type ProgressRadarWorkerRun,
} from "./progressRadarWorkerClient";
import styles from "./ProgressVisualsPage.module.css";

const TARGET_SERVER = normalizeServer("F28");
const OUTER_RATIO = 2;

export default function ProgressVisualsPage() {
  const [mode, setMode] = React.useState<ProgressRadarMode>("current");
  const [period, setPeriod] = React.useState<ProgressRadarPeriodKey>("short");
  const [result, setResult] = React.useState<ProgressRadarBuildResult | null>(null);
  const [progress, setProgress] = React.useState<ProgressRadarProgress | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let workerRun: ProgressRadarWorkerRun | null = null;

    const load = async () => {
      setLoading(true);
      setError(null);
      setProgress(null);
      try {
        const summaries = await listGuildHubScanSummaries();
        if (cancelled) return;
        const f28Summaries = summaries.filter((summary) => summaryContainsServer(summary, TARGET_SERVER));
        workerRun = startProgressRadarWorkerRun({
          summaries: f28Summaries,
          onProgress: (nextProgress) => {
            if (!cancelled) setProgress(nextProgress);
          },
        });
        const nextResult = await workerRun.promise;
        if (cancelled) return;
        setResult(nextResult);
        const firstPeriod = (["short", "medium", "long"] as const).find((key) => nextResult.development[key]);
        if (firstPeriod) setPeriod(firstPeriod);
      } catch (loadError) {
        if (loadError instanceof ProgressRadarWorkerCancelledError || cancelled) return;
        console.error("[ProgressVisualsPage] failed to build progress radar", loadError);
        if (!cancelled) setError("Gildenradar konnte nicht aus dem lokalen F28-Scanpool erstellt werden.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      workerRun?.cancel();
    };
  }, []);

  const selectedView = mode === "current" ? result?.current ?? null : result?.development[period] ?? null;

  return (
    <main className={styles.page}>
      <section className={styles.headerPanel}>
        <div>
          <p className={styles.kicker}>Playground</p>
          <h1>Spielerprofil · Gildenradar</h1>
          <p>
            Gildenradar für Darth Monk auf F28. Der 100%-Ring zeigt den Median seiner Gilde; die Spielerfläche zeigt
            Darth Monks Verhältnis dazu.
          </p>
        </div>
        {result ? (
          <div className={styles.scanBadge}>
            <strong>{result.loadedScanCount.toLocaleString("de-DE")}</strong>
            <span>F28-Scans</span>
          </div>
        ) : null}
      </section>

      {loading ? (
        <section className={styles.loadingPanel}>
          <DataHubLoadingState
            title="Gildenradar wird geladen"
            message={progress?.message ?? "Lokale F28-Scans werden vorbereitet."}
          />
        </section>
      ) : error ? (
        <section className={styles.statePanel}>{error}</section>
      ) : result?.status !== "ready" ? (
        <section className={styles.statePanel}>{result?.message ?? "Keine verwertbaren Radar-Daten gefunden."}</section>
      ) : (
        <>
          <section className={styles.controls}>
            <div className={styles.playerSummary}>
              <span>Testspieler</span>
              <strong>{result.player?.name ?? "Darth Monk"}</strong>
              <small>{[result.player?.server, result.player?.guildName].filter(Boolean).join(" · ")}</small>
            </div>

            <div className={styles.segmentedControl} aria-label="Radar-Ansicht">
              <button type="button" data-active={mode === "current"} onClick={() => setMode("current")}>
                Ausbaustand
              </button>
              <button type="button" data-active={mode === "development"} onClick={() => setMode("development")}>
                Entwicklung
              </button>
            </div>

            <div className={styles.periodControls} aria-label="Entwicklungszeitraum">
              {(["short", "medium", "long"] as const).map((key) => {
                const view = result.development[key];
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!view}
                    data-active={mode === "development" && period === key}
                    onClick={() => {
                      setMode("development");
                      setPeriod(key);
                    }}
                  >
                    {periodLabel(key)}
                    {view?.days ? <span>{view.days} Tage</span> : null}
                  </button>
                );
              })}
            </div>
          </section>

          {selectedView ? (
            <section className={styles.radarShell}>
              <div className={styles.radarIntro}>
                <p className={styles.kicker}>{selectedView.label}</p>
                <h2>{selectedView.description}</h2>
                <p>
                  {selectedView.currentScanLabel}
                  {selectedView.comparisonScanLabel ? ` gegen ${selectedView.comparisonScanLabel}` : ""}
                  {selectedView.days ? ` · tatsächlicher Abstand ${selectedView.days} Tage` : ""}
                </p>
              </div>

              <RadarChart view={selectedView} />
              <AxisTable view={selectedView} />
            </section>
          ) : (
            <section className={styles.statePanel}>Für diesen Zeitraum ist kein passendes Scanpaar verfügbar.</section>
          )}

          <section className={styles.sourcePanel}>
            <h2>Verwendete Achsen und Felder</h2>
            <div className={styles.sourceGrid}>
              {result.fieldSources.map((source) => (
                <div key={source.axis}>
                  <strong>{axisTitle(source.axis)}</strong>
                  <span>{source.fieldLabel}</span>
                  <p>{source.source}</p>
                </div>
              ))}
            </div>
            {result.audit[0] ? (
              <p className={styles.auditLine}>
                Gegenprüfung: {result.audit[0].view}, {axisTitle(result.audit[0].axis)} =
                {" "}Darth Monk {formatNumber(result.audit[0].playerValue)}, Median {formatNumber(result.audit[0].median)}
                {" "}aus {result.audit[0].sampleSize} gültigen Gildenwerten.
              </p>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}

function RadarChart({ view }: { view: ProgressRadarView }) {
  const axes = view.usableAxes;
  const canDraw = axes.length >= 3;
  const referenceLabel = view.mode === "development" ? "Gildenschnitt" : "Gildenmedian";
  const size = 420;
  const center = size / 2;
  const radius = 150;

  if (!canDraw) {
    return (
      <div className={styles.noRadar}>
        <strong>Radar nicht belastbar</strong>
        <span>{view.notes.join(" ") || "Weniger als drei Achsen verfügbar."}</span>
      </div>
    );
  }

  const gridRings = [0.5, 1, 1.5, 2];
  const points = axes.map((axis, index) => pointFor(index, axes.length, axis.ratio ?? 0, radius, center));
  const medianPoints = axes.map((_, index) => pointFor(index, axes.length, 1, radius, center));

  return (
    <figure className={styles.radarFigure}>
      <svg className={styles.radarSvg} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${view.label} Gildenradar`}>
        {gridRings.map((ratio) => {
          const ring = axes.map((_, index) => pointFor(index, axes.length, ratio, radius, center));
          return (
            <polygon
              key={ratio}
              className={ratio === 1 ? styles.medianRing : styles.gridRing}
              points={toPointString(ring)}
            />
          );
        })}
        {axes.map((axis, index) => {
          const end = pointFor(index, axes.length, OUTER_RATIO, radius, center);
          const label = pointFor(index, axes.length, OUTER_RATIO + 0.26, radius, center);
          const clipped = (axis.ratio ?? 0) > OUTER_RATIO;
          return (
            <g key={axis.key}>
              <line className={styles.axisLine} x1={center} y1={center} x2={end.x} y2={end.y} />
              <circle className={clipped ? styles.clippedPoint : styles.valuePoint} cx={points[index].x} cy={points[index].y} r={clipped ? 7 : 5} />
              <text x={label.x} y={label.y} textAnchor="middle">
                {axis.label}
              </text>
            </g>
          );
        })}
        <polygon className={styles.medianShape} points={toPointString(medianPoints)} />
        <polygon className={styles.playerShape} points={toPointString(points)} />
        <text className={styles.centerLabel} x={center} y={center - 6} textAnchor="middle">100%</text>
        <text className={styles.centerSubLabel} x={center} y={center + 12} textAnchor="middle">{referenceLabel}</text>
      </svg>
      <figcaption>
        Werte außerhalb des äußeren Rings werden am Rand markiert und unten vollständig angezeigt.
      </figcaption>
    </figure>
  );
}

function AxisTable({ view }: { view: ProgressRadarView }) {
  const referenceLabel = view.mode === "development" ? "Gildendurchschnitt" : "Gildenmedian";
  return (
    <div className={styles.axisTable}>
      <div className={styles.axisTableHeader}>
        <span>Achse</span>
        <span>Darth Monk</span>
        <span>{referenceLabel}</span>
        <span>Verhältnis</span>
      </div>
      {view.axes.map((axis) => (
        <div key={axis.key} className={styles.axisRow} data-status={axis.status}>
          <strong>{axis.label}</strong>
          <span>{formatNumber(axis.playerValue)}</span>
          <span>{formatNumber(axis.median)} <small>{axis.sampleSize}/{view.referenceMemberCount}</small></span>
          <span>{formatRatio(axis)}</span>
        </div>
      ))}
      {view.notes.length ? (
        <div className={styles.notes}>
          {view.notes.map((note) => <span key={note}>{note}</span>)}
        </div>
      ) : null}
    </div>
  );
}

function pointFor(index: number, total: number, ratio: number, radius: number, center: number) {
  const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;
  const distance = Math.min(Math.max(ratio, 0), OUTER_RATIO) / OUTER_RATIO * radius;
  return {
    x: center + Math.cos(angle) * distance,
    y: center + Math.sin(angle) * distance,
  };
}

function toPointString(points: Array<{ x: number; y: number }>) {
  return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
}

function summaryContainsServer(summary: GuildHubScanSummary, serverFilter: string | null) {
  if (!serverFilter) return true;
  return [
    ...summary.servers,
    ...summary.guilds.map((guild) => guild.server),
    ...(summary.fusionInventorySlices ?? []).map((slice) => slice.server),
  ].some((server) => normalizeServer(server)?.toLowerCase() === serverFilter.toLowerCase());
}

function normalizeServer(value: unknown) {
  return normalizeServerKeyFromInput(value);
}

function periodLabel(period: ProgressRadarPeriodKey) {
  if (period === "short") return "Kurzfristig";
  if (period === "medium") return "Mittelfristig";
  return "Langfristig";
}

function axisTitle(axis: string) {
  if (axis === "xpTotal") return "XP Total";
  if (axis === "primaryBase") return "Hauptbasisattribut";
  if (axis === "constitutionBase") return "Basis-Ausdauer";
  return axis;
}

function formatNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return Math.abs(value) >= 10_000
    ? value.toLocaleString("de-DE", { maximumFractionDigits: 0 })
    : value.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

function formatRatio(axis: ProgressRadarAxis) {
  if (axis.status === "negative") return "negativ";
  if (axis.status === "missing-player") return "Wert fehlt";
  if (axis.status === "missing-reference") return "zu wenig Daten";
  if (axis.status === "zero-reference") return "Median 0";
  if (axis.ratio == null) return "-";
  const clipped = axis.ratio > OUTER_RATIO ? " · am Rand" : "";
  return `${(axis.ratio * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })}%${clipped}`;
}
