import React, { useState } from "react";
import type { BaseStatBenchmarks, BaseStatValues } from "../types";

type AttributeKey = "str" | "dex" | "int" | "con" | "lck";
type AttributeValues = Partial<BaseStatValues>;

type Props = {
  baseStats: AttributeValues;
  totalStats?: AttributeValues;
  benchmarks?: BaseStatBenchmarks;
  mode?: "base" | "total";
  onModeChange?: (mode: "base" | "total") => void;
};

const ATTRIBUTES: { key: AttributeKey; label: string; name: string }[] = [
  { key: "str", label: "STR", name: "Strength" },
  { key: "dex", label: "DEX", name: "Dexterity" },
  { key: "int", label: "INT", name: "Intelligence" },
  { key: "con", label: "CON", name: "Constitution" },
  { key: "lck", label: "LCK", name: "Luck" },
];

const MIN_FILL_PX = 8;

const formatNumber = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("de-DE") : "-";

const toPercent = (value: number, maxValue: number) => {
  if (maxValue <= 0) return 0;
  return Math.min(100, Math.max(0, (value / maxValue) * 100));
};

const isValidNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export default function PlayerAttributeBars({ baseStats, totalStats, benchmarks, mode, onModeChange }: Props) {
  const [internalMode, setInternalMode] = useState<"base" | "total">("base");

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

  const activeValues = ATTRIBUTES.map((attr) => {
    const source = activeMode === "total" ? totalStats : baseStats;
    const raw = source?.[attr.key];
    return isValidNumber(raw) ? raw : 0;
  });
  const rawMax = Math.max(...activeValues, 0);
  const blockScaleMax = rawMax > 0 ? rawMax * 1.05 : 1;
  const showBenchmarks = activeMode === "base";
  const label = activeMode === "base" ? "Base Stats" : "Total Stats";

  return (
    <div className="player-profile__attribute-bars">
      <div className="player-profile__attribute-bars-head">
        <div className="player-profile__card-label">{label}</div>
        <div className="player-profile__attribute-toggle" role="group" aria-label="Attribute Ansicht">
          <button
            type="button"
            className={`player-profile__attribute-toggle-btn${activeMode === "base" ? " player-profile__attribute-toggle-btn--active" : ""}`}
            aria-pressed={activeMode === "base"}
            onClick={() => handleModeChange("base")}
          >
            Base
          </button>
          <button
            type="button"
            className={`player-profile__attribute-toggle-btn${activeMode === "total" ? " player-profile__attribute-toggle-btn--active" : ""}`}
            aria-pressed={activeMode === "total"}
            onClick={() => handleModeChange("total")}
            disabled={!hasTotalStats}
          >
            Total
          </button>
        </div>
      </div>
      <div className="player-profile__attribute-bars-list">
        {ATTRIBUTES.map((attr) => {
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
          const playerRatio = Math.min(1, Math.max(0, playerPct / 100));

          return (
            <div key={attr.key} className="player-profile__attribute-bar-row">
              <div className="player-profile__attribute-bar-label" aria-hidden>
                <span className="player-profile__attribute-bar-icon">{attr.label}</span>
                <span className="player-profile__attribute-bar-name">{attr.name}</span>
              </div>
              <div className="player-profile__attribute-bar-track" role="presentation">
                <div
                  className="player-profile__attribute-bar-fill"
                  style={{
                    transform: `scaleX(${playerRatio})`,
                    minWidth: playerValue > 0 && playerPct < 100 ? MIN_FILL_PX : undefined,
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
                    Server {formatNumber(serverAvg as number)}
                  </div>
                )}
                {Number.isFinite(guildAvg as number) && (
                  <div className="player-profile__attribute-bar-subvalue">
                    Gilde {formatNumber(guildAvg as number)}
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
