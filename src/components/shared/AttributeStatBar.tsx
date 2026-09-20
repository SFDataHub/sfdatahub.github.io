import React, { useState } from "react";
import { guideDriveIdByKey } from "../../data/guidehub/assets";
import { toDriveThumbProxy } from "../../lib/urls";

export type AttributeStatKey = "str" | "dex" | "int" | "con" | "lck";

export const ATTRIBUTE_STAT_ROWS: { key: AttributeStatKey; label: string }[] = [
  { key: "str", label: "STR" },
  { key: "dex", label: "DEX" },
  { key: "int", label: "INT" },
  { key: "con", label: "CON" },
  { key: "lck", label: "LCK" },
];

export const ATTRIBUTE_STAT_ICON_ASSET_KEYS: Record<AttributeStatKey, string> = {
  str: "strengthbig",
  dex: "dexteritybig",
  int: "intbig",
  con: "conbig",
  lck: "luckpotbig",
};

type AttributeStatBarMarker = {
  key: string;
  percent: number;
  modifier: string;
};

type AttributeStatBarProps = {
  statKey: AttributeStatKey;
  label: string;
  iconAlt: string;
  value: number;
  displayValue: string;
  fillRatio: number;
  variant?: "default" | "book";
  accentColor?: string;
  classNamePrefix?: string;
  minFillPx?: number;
  transitionDuration?: string;
  markers?: AttributeStatBarMarker[];
  subvalues?: React.ReactNode[];
};

export const clampPercent = (value: number) =>
  Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

export const toStatFillPercent = (value: number, maxValue: number) => {
  if (maxValue <= 0) return 0;
  return clampPercent((value / maxValue) * 100);
};

export default function AttributeStatBar({
  statKey,
  label,
  iconAlt,
  value,
  displayValue,
  fillRatio,
  variant = "default",
  accentColor,
  classNamePrefix = "player-profile__attribute-bar",
  minFillPx = 8,
  transitionDuration,
  markers = [],
  subvalues = [],
}: AttributeStatBarProps) {
  const [iconFailed, setIconFailed] = useState(false);
  const statIconId = guideDriveIdByKey(ATTRIBUTE_STAT_ICON_ASSET_KEYS[statKey]);
  const statIconUrl = !iconFailed && statIconId ? toDriveThumbProxy(statIconId, 28) : undefined;
  const fillPercent = clampPercent(fillRatio * 100);
  const displayRatio = fillPercent / 100;

  return (
    <div
      className={`${classNamePrefix}-row ${classNamePrefix}--${variant}`}
      style={{ ["--pp-stat-accent" as const]: accentColor } as React.CSSProperties}
    >
      <div className={`${classNamePrefix}-label`} aria-hidden>
        <span className={`${classNamePrefix}-icon`}>
          {statIconUrl ? (
            <img
              src={statIconUrl}
              alt={iconAlt}
              className={`${classNamePrefix}-icon-image`}
              onError={() => setIconFailed(true)}
            />
          ) : (
            <span aria-hidden />
          )}
        </span>
        <span className={`${classNamePrefix}-name`}>{label}</span>
      </div>
      <div className={`${classNamePrefix}-track`} role="presentation">
        <div
          className={`${classNamePrefix}-fill`}
          style={{
            transform: `scaleX(${displayRatio})`,
            minWidth: value > 0 && fillPercent < 100 ? minFillPx : undefined,
            transitionDuration,
          }}
          aria-hidden
        />
        {markers.map((marker) => (
          <span
            key={marker.key}
            className={`${classNamePrefix}-marker ${classNamePrefix}-marker--${marker.modifier}`}
            style={{ left: `${clampPercent(marker.percent)}%` }}
            aria-hidden
          />
        ))}
      </div>
      <div className={`${classNamePrefix}-values`}>
        <div className={`${classNamePrefix}-value`}>{displayValue}</div>
        {subvalues.map((subvalue, index) => (
          <div className={`${classNamePrefix}-subvalue`} key={index}>
            {subvalue}
          </div>
        ))}
      </div>
    </div>
  );
}
