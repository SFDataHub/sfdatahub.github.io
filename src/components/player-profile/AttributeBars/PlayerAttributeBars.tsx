import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { guideDriveIdByKey } from "../../../data/guidehub/assets";
import { toDriveThumbProxy } from "../../../lib/urls";
import type { BaseStatBenchmarks, BaseStatValues } from "../types";
import { getPlayerStatAccentColor } from "../statAccents";

type AttributeKey = "str" | "dex" | "int" | "con" | "lck";
type AttributeValues = Partial<BaseStatValues>;

type Props = {
  baseStats: AttributeValues;
  totalStats?: AttributeValues;
  benchmarks?: BaseStatBenchmarks;
  mode?: "base" | "total";
  onModeChange?: (mode: "base" | "total") => void;
};

const ATTRIBUTES: { key: AttributeKey; label: string }[] = [
  { key: "str", label: "STR" },
  { key: "dex", label: "DEX" },
  { key: "int", label: "INT" },
  { key: "con", label: "CON" },
  { key: "lck", label: "LCK" },
];

const STAT_ICON_ASSET_KEYS: Record<AttributeKey, string> = {
  str: "strengthbig",
  dex: "dexteritybig",
  int: "intbig",
  con: "conbig",
  lck: "luckpotbig",
};

const MIN_FILL_PX = 8;

const formatNumber = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("de-DE") : "-";

const toPercent = (value: number, maxValue: number) => {
  if (maxValue <= 0) return 0;
  return Math.min(100, Math.max(0, (value / maxValue) * 100));
};

const isValidNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export default function PlayerAttributeBars({
  baseStats,
  totalStats,
  benchmarks,
  mode,
  onModeChange,
}: Props) {
  const { t } = useTranslation();
  const [internalMode, setInternalMode] = useState<"base" | "total">("base");
  const [animateReady, setAnimateReady] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const [failedStatIcons, setFailedStatIcons] = useState<Partial<Record<AttributeKey, true>>>({});

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

  const hasTotalStats = ATTRIBUTES.some((attr) => isValidNumber(totalStats?.[attr.key]));
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

  const handleStatIconError = (key: AttributeKey) => {
    setFailedStatIcons((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  };

  const activeValues = ATTRIBUTES.map((attr) => {
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

  return (
    <div className="player-profile__attribute-bars">
      <div className="player-profile__attribute-bars-head">
        <div className="player-profile__card-label">{label}</div>
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
            onClick={() => handleModeChange("base")}
          >
            {t("playerProfile.heroPanel.stats.attributeBars.modeBase", { defaultValue: "Base" })}
          </button>
          <button
            type="button"
            className={`player-profile__attribute-toggle-btn${activeMode === "total" ? " player-profile__attribute-toggle-btn--active" : ""}`}
            aria-pressed={activeMode === "total"}
            onClick={() => handleModeChange("total")}
            disabled={!hasTotalStats}
          >
            {t("playerProfile.heroPanel.stats.attributeBars.modeTotal", { defaultValue: "Total" })}
          </button>
        </div>
      </div>
      <div className="player-profile__attribute-bars-list">
        {ATTRIBUTES.map((attr) => {
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

          const playerPct = toPercent(playerValue, effectiveMax);
          const serverPct = toPercent(serverVal, effectiveMax);
          const guildPct = toPercent(guildVal, effectiveMax);
          const targetRatio = Math.min(1, Math.max(0, playerPct / 100));
          const displayRatio = animateReady ? targetRatio : 0;
          const transitionDuration = !hasAnimated ? "500ms" : undefined;
          const statIconId = guideDriveIdByKey(STAT_ICON_ASSET_KEYS[attr.key]);
          const statIconUrl =
            !failedStatIcons[attr.key] && statIconId ? toDriveThumbProxy(statIconId, 28) : undefined;
          const rowStatAccent = getPlayerStatAccentColor(attr.key);

          return (
            <div
              key={attr.key}
              className="player-profile__attribute-bar-row"
              style={{ ["--pp-stat-accent" as const]: rowStatAccent } as React.CSSProperties}
            >
              <div className="player-profile__attribute-bar-label" aria-hidden>
                <span className="player-profile__attribute-bar-icon">
                  {statIconUrl ? (
                    <img
                      src={statIconUrl}
                      alt={t("playerProfile.heroPanel.stats.attributeBars.iconAlt", {
                        name: attrName,
                        defaultValue: "{{name}} icon",
                      })}
                      className="player-profile__attribute-bar-icon-image"
                      onError={() => handleStatIconError(attr.key)}
                    />
                  ) : (
                    <span aria-hidden />
                  )}
                </span>
                <span className="player-profile__attribute-bar-name">{attrName}</span>
              </div>
              <div className="player-profile__attribute-bar-track" role="presentation">
                <div
                  className="player-profile__attribute-bar-fill"
                  style={{
                    transform: `scaleX(${displayRatio})`,
                    minWidth: playerValue > 0 && playerPct < 100 ? MIN_FILL_PX : undefined,
                    transitionDuration,
                  }}
                  aria-hidden
                />
                {Number.isFinite(serverAvg as number) && (
                  <span
                    className="player-profile__attribute-bar-marker player-profile__attribute-bar-marker--server"
                    style={{ left: `${serverPct}%` }}
                    aria-hidden
                  />
                )}
                {Number.isFinite(guildAvg as number) && (
                  <span
                    className="player-profile__attribute-bar-marker player-profile__attribute-bar-marker--guild"
                    style={{ left: `${guildPct}%` }}
                    aria-hidden
                  />
                )}
              </div>
              <div className="player-profile__attribute-bar-values">
                <div className="player-profile__attribute-bar-value">{formatNumber(playerValue)}</div>
                {Number.isFinite(serverAvg as number) && (
                  <div className="player-profile__attribute-bar-subvalue">
                    {t("playerProfile.heroPanel.stats.attributeBars.server", { defaultValue: "Server" })}{" "}
                    {formatNumber(serverAvg as number)}
                  </div>
                )}
                {Number.isFinite(guildAvg as number) && (
                  <div className="player-profile__attribute-bar-subvalue">
                    {t("playerProfile.heroPanel.stats.attributeBars.guild", { defaultValue: "Guild" })}{" "}
                    {formatNumber(guildAvg as number)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
