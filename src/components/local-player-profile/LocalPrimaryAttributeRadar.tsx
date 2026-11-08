import { profileMonth } from "../../lib/i18n/profilePresentation";
import { useEffect, useId, useState } from "react";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import type { LocalPlayerProfileModel } from "./types";
import { usePrimaryAttributeRadar } from "../../lib/local-player-profile/usePrimaryAttributeRadar";
import { PRIMARY_RADAR_COMPARISONS, PRIMARY_RADAR_FIXED_MAXIMA, primaryRadarFraction, type PrimaryRadarComparison, type PrimaryRadarModel } from "../../lib/local-player-profile/primaryAttributeRadar";
import { usePlayerRadarMode } from "../../lib/settings/usePreferences";
import type { HubPlayerSelection } from "../../pages/DataHub/HubSearch";
import { referenceKey } from "../../lib/data-hub/hubFavoritesContract";
import { useComparisonPlayerTarget } from "../../lib/local-player-profile/useComparisonPlayerCharts";
import { useOptionalLocalPlayerComparison } from "./LocalPlayerComparison";
import { preferencesStore } from "../../lib/settings/preferences";
import { resolveServer } from "../../lib/servers/serverResolver";
import "../attribute-composition/AttributeCompositionCard.css";
import "./LocalPrimaryAttributeRadar.css";
import guildStyles from "../../pages/GuildHub/Dashboard.module.css";

const point = (radius: number, index: number) => {
  const angle = -Math.PI / 2 + Math.PI * 2 * index / 5;
  return { x: 110 + radius * Math.cos(angle), y: 74 + radius * Math.sin(angle) };
};
const coordinates = (p: { x: number; y: number }) => `${p.x},${p.y}`;
const labels = ["Base Stats", "Total Stats", "Level", "Mine", "Treasury"];

export default function LocalPrimaryAttributeRadar({ profile, enableVersus = false, overlaySelection }: {
  profile: LocalPlayerProfileModel; enableVersus?: boolean; overlaySelection?: HubPlayerSelection;
}) {
  const savedComparison = usePlayerRadarMode();
  const [average, selectAverage] = useState<PrimaryRadarComparison>(savedComparison);
  const [versusId, selectVersus] = useState<string>();
  const context = useOptionalLocalPlayerComparison();
  const players = enableVersus ? context?.players ?? [] : overlaySelection
    ? [{ id: referenceKey(overlaySelection.reference), selection: overlaySelection }] : [];
  const selected = players.find(player => player.id === versusId);
  const overlayTarget = useComparisonPlayerTarget(!enableVersus ? selected?.selection : undefined);
  useEffect(() => selectAverage(savedComparison), [savedComparison]);
  useEffect(() => { if (!selected) selectVersus(undefined); }, [selected]);
  const setComparison = (selection: string) => {
    const player = players.find(row => `vs:${row.id}` === selection);
    if (player) { selectVersus(player.id); return; }
    if (!PRIMARY_RADAR_COMPARISONS.includes(selection as PrimaryRadarComparison)) return;
    const playerRadarMode = selection as PrimaryRadarComparison;
    selectVersus(undefined);
    selectAverage(playerRadarMode);
    preferencesStore.savePreferences({ playerRadarMode }, preferencesStore.getSnapshot());
  };
  const { model, loading } = usePrimaryAttributeRadar(profile, average, selected ? {
    id: selected.id, profile: enableVersus ? context?.playerTargets[selected.id]?.profile : overlayTarget.profile,
    failed: (enableVersus ? context?.playerTargets[selected.id]?.targetStatus : overlayTarget.targetStatus) === "error",
  } : undefined);
  const options = players.map(player => {
    const selection = player.selection;
    const display = selection.occurrence ?? selection.hit?.occurrences.find(row => row.timeQuality === "observation") ?? selection.hit?.occurrences[0];
    const name = display?.name || selection.hit?.name || selection.favorite?.display.name || selection.reference.identifier;
    const server = display?.reference?.serverNamespace ?? selection.favorite?.display.server ?? selection.reference.serverNamespace;
    return { value: `vs:${player.id}`, label: `VS: ${name}, ${resolveServer(server)?.code ?? server.toUpperCase()}` };
  });
  return <PrimaryAttributeRadarChart model={model} loading={loading} comparison={average}
    selection={selected ? `vs:${selected.id}` : average} versusLabel={selected ? options.find(row => row.value === `vs:${selected.id}`)?.label : undefined}
    options={options} onComparisonChange={setComparison} />;
}

export function PrimaryAttributeRadarChart({ model, loading = false, comparison = model?.comparison ?? "main", selection = comparison, versusLabel, options = [], onComparisonChange }: {
  model: PrimaryRadarModel | null; loading?: boolean; comparison?: PrimaryRadarComparison; selection?: string; versusLabel?: string;
  options?: { value: string; label: string }[]; onComparisonChange?: (mode: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [active, setActive] = useState<number | null>(null);
  const tooltipId = useId();
  const text = (key: string, fallback: string) => t(`playerProfile.primaryRadar.${key}`, { defaultValue: fallback });
  const format = (value: number | null) => value === null ? text("na", "n/a") : value.toLocaleString(i18n.language, { maximumFractionDigits: 2 });
  const title = text("title", "Comparison");
  const serverName = (server?: string | null) => server ? resolveServer(server)?.code ?? server : "";
  const named = (scan: PrimaryRadarModel["playerScan"], fallback: string) => [scan.name || fallback, serverName(scan.server)].filter(Boolean).join(", ");
  const playerLabel = model ? named(model.playerScan, text("player", "Player")) : text("player", "Player");
  const comparisonLabel = (mode: PrimaryRadarComparison) => text(`modes.${mode}`, ({ main: "Main Attribute Average", class: "Class Average", guild: "Guild Average", server: "Server Average" })[mode]);
  const groupLabel = versusLabel ? model?.comparisonPlayer ? `VS: ${named(model.comparisonPlayer, versusLabel.replace(/^VS: /, ""))}` : versusLabel : comparisonLabel(comparison);
  const fixedReference = (index: number) => PRIMARY_RADAR_FIXED_MAXIMA[model!.axes[index].key] !== undefined;
  const axisLabel = (index: number) => text(model?.axes[index].key ?? "", labels[index]);
  const date = (timestamp: number) => new Date(timestamp).toLocaleString(i18n.language);
  const referenceLabel = model ? serverName(model.referenceServer) : "";
  const comparisonContext = model ? versusLabel ? model.comparisonPlayer ? date(model.comparisonPlayer.timestamp) : text("comparisonUnavailable", "Comparison unavailable")
    : model.comparisonScan ? `${serverName(model.comparisonScan.server) || referenceLabel} · ${date(model.comparisonScan.timestamp)}` : `${referenceLabel} · ${profileMonth(model.month)}` : "";
  const poolContext = model ? comparison === "main" ? text(model.primary, model.primary)
    : comparison === "class" ? t(`toplists.classes.${model.playerClass}`, { defaultValue: model.playerClass ?? "" })
    : comparison === "guild" ? model.comparisonScan?.name || model.playerGuild || model.comparisonScan?.guildIdentifier || text("na", "n/a")
    : referenceLabel : "";
  const poolLine = (index: number) => `${text("playerPool", "Player Pool")}: ${format(model!.axes[index].count)} · ${poolContext}`;
  const warning = (index: number, field: "player" | "average") => {
    const axis = model!.axes[index];
    const label = field === "player" ? playerLabel : groupLabel;
    if (primaryRadarFraction(axis[field], axis.maximum) === null) return "";
    return axis[field]! > axis.maximum! ? `${label}: ${fixedReference(index)
      ? text("clippedFixed", "Actual value exceeds the fixed reference maximum; shown at the outer ring.")
      : text("clipped", "Actual value exceeds the monthly reference maximum; shown at the outer ring.")}` : "";
  };
  const referenceLine = (index: number) => fixedReference(index) ? ""
    : `${text("maximum", "Monthly server maximum")}: ${format(model!.axes[index].maximum)} · ${referenceLabel} · ${profileMonth(model!.month)}`;
  const valueLines = (index: number) => [
    `${playerLabel}: ${format(model!.axes[index].player)} · ${date(model!.playerScan.timestamp)}`,
    `${groupLabel}: ${format(model!.axes[index].average)} · ${comparisonContext}`,
    ...(!versusLabel ? [poolLine(index)] : []), referenceLine(index), warning(index, "player"), warning(index, "average"),
  ].filter(Boolean);
  const sourceDetails = model ? [
    `${playerLabel} · ${date(model.playerScan.timestamp)}`,
    `${groupLabel} · ${comparisonContext}`,
    ...(!versusLabel ? [text("playerPool", "Player Pool") + ": " + model.axes.map((axis, index) => `${axisLabel(index)} ${format(axis.count)}`).join(" / ") + ` · ${poolContext}`] : []),
    `${text("maximum", "Monthly server maximum")} · ${referenceLabel} · ${profileMonth(model.month)}`,
  ] : [];
  const details = (index: number) => `${axisLabel(index)} · ${valueLines(index).join(" · ")}`;
  const net = (field: "player" | "average") => {
    const points = model!.axes.map((axis, index) => {
      const fraction = primaryRadarFraction(axis[field], axis.maximum);
      return fraction === null ? null : point(50 * fraction, index);
    });
    return <g className={`local-primary-radar__net local-primary-radar__net--${field}`}>
      {points.every(p => p !== null) ? <polygon points={points.map(p => coordinates(p!)).join(" ")} /> :
        points.map((p, index) => p && points[(index + 1) % 5] ? <line key={index} x1={p.x} y1={p.y} x2={points[(index + 1) % 5]!.x} y2={points[(index + 1) % 5]!.y} /> : null)}
      {points.map((p, index) => p ? <circle key={index} cx={p.x} cy={p.y} r="2.4" /> : null)}
    </g>;
  };
  return <div className="local-primary-radar-layout" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setActive(null);
  }}>
    <section className="attribute-composition-radar-card local-primary-radar" aria-label={title} aria-busy={loading}>
    <header className="attribute-composition-radar-card__head" data-profile-chart-hud><h3 data-profile-title-group>{title}</h3>
      {model && <button type="button" className="attribute-composition-radar-card__details" aria-label={text("information", "Scan sources and scale information")}
        aria-describedby={active === -1 ? tooltipId : undefined} onMouseEnter={() => setActive(-1)}
        onMouseLeave={event => { if (!event.currentTarget.matches(":focus-within")) setActive(null); }}
        onFocus={() => setActive(-1)} onClick={() => setActive(-1)}>i</button>}
    </header>
    <label className={`${guildStyles.trendMetricSelect} local-primary-radar__selection`}>
      <span>{text("comparison", "Comparison")}</span>
      <select aria-label={text("comparison", "Comparison")} value={selection} onFocus={() => setActive(null)} onChange={event => onComparisonChange?.(event.target.value)}>
        {PRIMARY_RADAR_COMPARISONS.map(mode => <option key={mode} value={mode}>{comparisonLabel(mode)}</option>)}
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    {model ? <>
      <div className="attribute-composition-radar-card__body" onMouseLeave={event => {
        if (!event.currentTarget.matches(":focus-within")) setActive(null);
      }}>
        <svg className="local-primary-radar__svg" viewBox="0 0 220 150" role="group" aria-label={title}>
          {[25, 50].map(radius => <polygon key={radius} className="attribute-composition-radar-card__grid" points={model.axes.map((_, index) => coordinates(point(radius, index))).join(" ")} />)}
          {model.axes.map((axis, index) => { const p = point(50, index); return <line key={axis.key} className="attribute-composition-radar-card__axis" x1="110" y1="74" x2={p.x} y2={p.y} />; })}
          {net("average")}{net("player")}
          {model.axes.map((axis, index) => {
            const end = point(64, index), hit = point(54, index);
            const missingPlayer = primaryRadarFraction(axis.player, axis.maximum) === null;
            const missingAverage = primaryRadarFraction(axis.average, axis.maximum) === null;
            return <g key={axis.key} tabIndex={0} role="img" aria-label={details(index)} aria-describedby={active === index ? tooltipId : undefined}
              onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)}>
              <line className="local-primary-radar__hit" x1="110" y1="74" x2={hit.x} y2={hit.y} />
              <text className="attribute-composition-radar-card__axis-label" x={end.x} y={end.y} textAnchor={index === 0 ? "middle" : index < 3 ? "start" : "end"} dominantBaseline={index === 0 ? "auto" : "middle"}>
                {axisLabel(index)}
                {missingPlayer && <tspan x={end.x} dy="11">({text("playerMissing", "Player: n/a")})</tspan>}
                {missingAverage && <tspan x={end.x} dy="11">({versusLabel ? text("versusMissing", "VS: n/a") : text("averageMissing", "Average: n/a")})</tspan>}
              </text>
            </g>;
          })}
        </svg>
      </div>
      <div className="local-primary-radar__legend"><span title={playerLabel}>{playerLabel}</span><span title={groupLabel}>{groupLabel}{!model.comparisonAvailable && ` · ${text("na", "n/a")}`}</span></div>
    </> : <div className="attribute-composition-radar-card__unavailable">{loading ? text("loading", "Loading comparison…") : text("unavailable", "Current server comparison unavailable")}</div>}
    </section>
    <div className="local-primary-radar__info">
        {model && active !== null && <div className="local-primary-radar__tooltip sfdatahub-scrollbar" role="tooltip" id={tooltipId} tabIndex={0}>
          {active >= 0 && <>
            <strong>{axisLabel(active)}</strong>
            {valueLines(active).map((line, index) => <div key={index}>{line}</div>)}
          </>}
          {active === -1 && sourceDetails.map((line, index) => <div key={index}>{line}</div>)}
        </div>}
    </div>
  </div>;
}
