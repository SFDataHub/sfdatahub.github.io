import { profileLocale } from "../../../lib/i18n/profilePresentation";
import { auditGraphBegin, auditResultId, auditEnter, auditValue, auditLeave } from "../../../lib/data-hub/runtimeAudit";
import { useRuntimeAuditGraphCommit } from "../../../lib/data-hub/useRuntimeAuditGraphCommit";
import type { ReactNode } from "react";
import { useEffect, useState, useMemo, useRef } from "react";
import { useProfileTranslation as useTranslation } from "../../../lib/i18n/useProfileTranslation";
import AttributeStatBar, {
  ATTRIBUTE_STAT_ROWS,
  type AttributeStatKey,
  toStatFillPercent,
} from "../../shared/AttributeStatBar";
import type { BaseStatBenchmarks, BaseStatValues } from "../types";
import { getPlayerStatAccentColor } from "../statAccents";

type AttributeValues = Partial<BaseStatValues>;

type Props = {
  auditInput?: object;
  headerEnd?: ReactNode;
  baseStats: AttributeValues;
  totalStats?: AttributeValues;
  benchmarks?: BaseStatBenchmarks;
  mode?: "base" | "total";
  onModeChange?: (mode: "base" | "total") => void;
};

const formatNumber = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value.toLocaleString(profileLocale()) : "-";

const isValidNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export default function PlayerAttributeBars({
  baseStats,
  totalStats,
  benchmarks,
  mode,
  onModeChange,
  auditInput,
  headerEnd,
}: Props) {
  const { t } = useTranslation();
  const [internalMode, setInternalMode] = useState<"base" | "total">("base");
  const [animateReady, setAnimateReady] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    let frame1: number | null = null;
    let frame2: number | null = null;
    frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => setAnimateReady(true));
    });
    return () => {
      if (frame1 != null) cancelAnimationFrame(frame1);
      if (frame2 != null) cancelAnimationFrame(frame2);
    };
  }, []);

  useEffect(() => {
    if (animateReady && !hasAnimated) {
      setHasAnimated(true);
    }
  }, [animateReady, hasAnimated]);

  const hasTotalStats = ATTRIBUTE_STAT_ROWS.some((attr) => isValidNumber(totalStats?.[attr.key]));
  const effectiveMode = mode ?? internalMode;
  const activeMode = effectiveMode === "total" && hasTotalStats ? "total" : "base";

  const handleModeChange = (next: "base" | "total") => {
    if (next === "total" && !hasTotalStats) return;
    if (onModeChange) {
      onModeChange(next);
    } else {
      setInternalMode(next);
    }
  };

  const rootRef = useRef<HTMLDivElement>(null);
  const graphAudit = useMemo(() => auditInput ? auditGraphBegin("F18", `profile-attribute-bars:${activeMode}`, auditResultId(auditInput)) : null, [baseStats, totalStats, activeMode, auditInput]);
  const span = auditEnter(graphAudit, "graph-geometry", "sync-elapsed");
  const activeValues = ATTRIBUTE_STAT_ROWS.map((attr) => {
    const source = activeMode === "total" ? totalStats : baseStats;
    const raw = source?.[attr.key];
    return isValidNumber(raw) ? raw : 0;
  });
  const rawMax = Math.max(...activeValues, 0);
  const blockScaleMax = rawMax > 0 ? rawMax * 1.05 : 1;
  const showBenchmarks = activeMode === "base";
  const label =
    activeMode === "base"
      ? t("playerProfile.heroPanel.stats.attributeBars.baseStats", { defaultValue: "Base Stats" })
      : t("playerProfile.heroPanel.stats.attributeBars.totalStats", { defaultValue: "Total Stats" });

  useRuntimeAuditGraphCommit(baseStats, true, `profile-attribute-bars:${activeMode}`, rootRef, graphAudit?.id);
  const output = (
    <div ref={rootRef} className="player-profile__attribute-bars">
      <div className="player-profile__attribute-bars-head">
        <div className="player-profile__card-label">{label}</div>
        {headerEnd ?? <PlayerAttributeModeToggle activeMode={activeMode} hasTotalStats={hasTotalStats} onModeChange={handleModeChange} />}
      </div>
      <div className="player-profile__attribute-bars-list">
        {ATTRIBUTE_STAT_ROWS.map((attr) => {
          const attrName = t(`playerProfile.heroPanel.stats.attributeBars.attributes.${attr.key}`, {
            defaultValue:
              attr.key === "str"
                ? "Strength"
                : attr.key === "dex"
                ? "Dexterity"
                : attr.key === "int"
                ? "Intelligence"
                : attr.key === "con"
                ? "Constitution"
                : "Luck",
          });
          const source = activeMode === "total" ? totalStats : baseStats;
          const playerValue = Number(source?.[attr.key]) || 0;
          const serverAvg = showBenchmarks ? benchmarks?.serverAvg?.[attr.key] : undefined;
          const guildAvg = showBenchmarks ? benchmarks?.guildAvg?.[attr.key] : undefined;
          const scaleMax = showBenchmarks ? benchmarks?.scaleMax?.[attr.key] : undefined;

          const serverVal = Number(serverAvg) || 0;
          const guildVal = Number(guildAvg) || 0;
          const hasScaleMax = typeof scaleMax === "number" && Number.isFinite(scaleMax);
          const effectiveMax = hasScaleMax
            ? Math.max(Number(scaleMax), playerValue, serverVal, guildVal, 1)
            : Math.max(blockScaleMax, playerValue, serverVal, guildVal, 1);

          const playerPct = toStatFillPercent(playerValue, effectiveMax);
          const serverPct = toStatFillPercent(serverVal, effectiveMax);
          const guildPct = toStatFillPercent(guildVal, effectiveMax);
          const targetRatio = Math.min(1, Math.max(0, playerPct / 100));
          const displayRatio = animateReady ? targetRatio : 0;
          const transitionDuration = !hasAnimated ? "500ms" : undefined;
          const rowStatAccent = getPlayerStatAccentColor(attr.key);

          return (
            <AttributeStatBar
              key={attr.key}
              statKey={attr.key as AttributeStatKey}
              label={attrName}
              iconAlt={t("playerProfile.heroPanel.stats.attributeBars.iconAlt", {
                name: attrName,
                defaultValue: "{{name}} icon",
              })}
              value={playerValue}
              displayValue={formatNumber(playerValue)}
              fillRatio={displayRatio}
              accentColor={rowStatAccent}
              transitionDuration={transitionDuration}
              markers={[
                ...(Number.isFinite(serverAvg as number)
                  ? [{ key: "server", percent: serverPct, modifier: "server" }]
                  : []),
                ...(Number.isFinite(guildAvg as number)
                  ? [{ key: "guild", percent: guildPct, modifier: "guild" }]
                  : []),
              ]}
              subvalues={[
                ...(Number.isFinite(serverAvg as number)
                  ? [
                      <>
                        {t("playerProfile.heroPanel.stats.attributeBars.server", { defaultValue: "Server" })}{" "}
                        {formatNumber(serverAvg as number)}
                      </>,
                    ]
                  : []),
                ...(Number.isFinite(guildAvg as number)
                  ? [
                      <>
                        {t("playerProfile.heroPanel.stats.attributeBars.guild", { defaultValue: "Guild" })}{" "}
                        {formatNumber(guildAvg as number)}
                      </>,
                    ]
                  : []),
              ]}
            />
          );
        })}
      </div>
    </div>
  );
  auditValue(graphAudit, span, undefined); auditLeave(graphAudit);
  return output;
}

// The expanded bars and the local compact header share this controlled input.
export function PlayerAttributeModeToggle({ activeMode, hasTotalStats, onModeChange }: {
  activeMode: "base" | "total";
  hasTotalStats: boolean;
  onModeChange: (mode: "base" | "total") => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="player-profile__attribute-toggle"
      role="group"
      aria-label={t("playerProfile.heroPanel.stats.attributeBars.viewModeAriaLabel", {
        defaultValue: "Attribute view",
      })}
    >
      <button
        type="button"
        className={`player-profile__attribute-toggle-btn${activeMode === "base" ? " player-profile__attribute-toggle-btn--active" : ""}`}
        aria-pressed={activeMode === "base"}
        onClick={() => onModeChange("base")}
      >
        {t("playerProfile.heroPanel.stats.attributeBars.modeBase", { defaultValue: "Base" })}
      </button>
      <button
        type="button"
        className={`player-profile__attribute-toggle-btn${activeMode === "total" ? " player-profile__attribute-toggle-btn--active" : ""}`}
        aria-pressed={activeMode === "total"}
        onClick={() => onModeChange("total")}
        disabled={!hasTotalStats}
      >
        {t("playerProfile.heroPanel.stats.attributeBars.modeTotal", { defaultValue: "Total" })}
      </button>
    </div>
  );
}
