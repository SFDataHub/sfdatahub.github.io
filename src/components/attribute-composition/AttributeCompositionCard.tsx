import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AttributeCompositionItem } from "../../lib/parsing/latestValues";
import {
  ATTRIBUTE_COMPOSITION_SHADE_ACCENT_WEIGHTS,
  ATTRIBUTE_COMPOSITION_SHADE_MIX_BG,
  getPlayerStatAccentColor,
  getPlayerStatAccentRgbString,
  mixHexColors,
} from "../player-profile/statAccents";
import {
  buildAttributeCompositionSegments,
  type AttributeCompositionSegment,
  type AttributeCompositionSourceKey,
} from "./attributeCompositionModel";
import "./AttributeCompositionCard.css";

const DASH = "—";
const ATTRIBUTE_COMPOSITION_BASE_ACCENT_WEIGHT = 0.16;
const ATTRIBUTE_COMPOSITION_OTHER_ACCENT_WEIGHT = 0.35;

function formatPlainNumber(value: number) {
  if (!Number.isFinite(value)) return DASH;
  const hasFraction = Math.abs(value % 1) > 0.000001;
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(value);
}

function formatCompactNumber(value: number) {
  if (!Number.isFinite(value)) return DASH;
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 1,
  }).format(value);
}

function formatMetricValue(value: number | null) {
  if (value == null || !Number.isFinite(value)) return DASH;
  return formatPlainNumber(value);
}

function getAttributeCompositionSegmentFill(
  attrCode: string,
  sourceKey: AttributeCompositionSourceKey,
  shadeIndex: number,
) {
  const statAccent = getPlayerStatAccentColor(attrCode);
  const isClampedStat = attrCode === "dex" || attrCode === "lck";
  if (sourceKey === "base") {
    return mixHexColors(ATTRIBUTE_COMPOSITION_SHADE_MIX_BG, statAccent, ATTRIBUTE_COMPOSITION_BASE_ACCENT_WEIGHT);
  }
  if (sourceKey === "other") {
    return mixHexColors(ATTRIBUTE_COMPOSITION_SHADE_MIX_BG, statAccent, ATTRIBUTE_COMPOSITION_OTHER_ACCENT_WEIGHT);
  }
  const weight =
    ATTRIBUTE_COMPOSITION_SHADE_ACCENT_WEIGHTS[
      Math.max(0, Math.min(ATTRIBUTE_COMPOSITION_SHADE_ACCENT_WEIGHTS.length - 1, shadeIndex))
    ];
  const effectiveWeight = isClampedStat ? Math.max(0, weight - 0.05) : weight;
  return mixHexColors(ATTRIBUTE_COMPOSITION_SHADE_MIX_BG, statAccent, effectiveWeight);
}

function getAttributeCompositionRowStyle(attrCode: string): React.CSSProperties {
  return {
    ["--pp-attr-stat-accent" as const]: getPlayerStatAccentColor(attrCode),
    ["--pp-attr-stat-accent-rgb" as const]: getPlayerStatAccentRgbString(attrCode),
  } as React.CSSProperties;
}

function getAttributeCompositionSegmentStyle(
  attrCode: string,
  segment: Pick<AttributeCompositionSegment, "sourceKey" | "shadeIndex" | "widthPct">,
): React.CSSProperties {
  return {
    width: `${segment.widthPct}%`,
    ["--pp-attr-segment-fill" as const]: getAttributeCompositionSegmentFill(attrCode, segment.sourceKey, segment.shadeIndex),
  } as React.CSSProperties;
}

function PanelHead({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <header className="player-profile__stats-panel-head">
      <div className="player-profile__stats-panel-head-main">
        <h3>{title}</h3>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      {action ? <div className="player-profile__stats-panel-head-action">{action}</div> : null}
    </header>
  );
}

export type AttributeCompositionCardProps = {
  attributes: AttributeCompositionItem[];
  className?: string;
  action?: React.ReactNode;
};

export default function AttributeCompositionCard({ attributes, className, action }: AttributeCompositionCardProps) {
  const { t } = useTranslation();
  const [hoveredAttrCode, setHoveredAttrCode] = useState<string | null>(null);
  const [hoveredSourceKey, setHoveredSourceKey] = useState<AttributeCompositionSourceKey | null>(null);
  const noDataText = t("common.noData");
  const labels = {
    base: t("playerProfile.statsTab.attrComposition.breakdown.base"),
    baseItems: t("playerProfile.statsTab.attrComposition.breakdown.baseItems"),
    upgrades: t("playerProfile.statsTab.attrComposition.breakdown.upgrades"),
    equipment: t("playerProfile.statsTab.attrComposition.breakdown.equipment"),
    gems: t("playerProfile.statsTab.attrComposition.breakdown.gems"),
    pet: t("playerProfile.statsTab.attrComposition.breakdown.pet"),
    potion: t("playerProfile.statsTab.attrComposition.breakdown.potion"),
    petBonus: t("playerProfile.statsTab.attrComposition.breakdown.petBonus"),
    other: t("playerProfile.statsTab.attrComposition.breakdown.other"),
  };
  const setHoveredCompositionSource = (attrCode: string, sourceKey: AttributeCompositionSourceKey) => {
    setHoveredAttrCode(attrCode);
    setHoveredSourceKey(sourceKey);
  };
  const clearHoveredCompositionSource = () => {
    setHoveredAttrCode(null);
    setHoveredSourceKey(null);
  };

  return (
    <section className={className ?? "player-profile__stats-panel player-profile__stats-panel--attributes"}>
      <PanelHead
        title={t("playerProfile.statsTab.attrComposition.title")}
        subtitle={t("playerProfile.statsTab.attrComposition.subtitle")}
        action={action}
      />
      <div className="player-profile__stats-attr-list">
        {attributes.map((attr) => {
          const segments = buildAttributeCompositionSegments(labels, attr.base, attr.breakdown, attr.total);
          const barSegments = segments.filter((segment) => segment.isBarSegment);
          const hasData = attr.total != null || segments.length > 0;
          const hasBarData = barSegments.length > 0 || (typeof attr.total === "number" && attr.total > 0);
          const isAttrHoverActive = hoveredAttrCode === attr.code && hoveredSourceKey != null;
          const attrRowStyle = getAttributeCompositionRowStyle(attr.code);

          return (
            <div key={attr.code} className="player-profile__stats-attr-row" style={attrRowStyle}>
              <div className="player-profile__stats-attr-head">
                <div className="player-profile__stats-attr-label">
                  {t(`playerProfile.statsTab.attrComposition.attributes.${attr.code}`)}
                </div>
                <div className="player-profile__stats-attr-values">
                  <strong>{formatMetricValue(attr.total)}</strong>
                  {attr.bonus != null && (
                    <span>
                      {t("playerProfile.statsTab.attrComposition.bonus")} +{formatPlainNumber(attr.bonus)}
                    </span>
                  )}
                </div>
              </div>
              <div className="player-profile__stats-stack-track" aria-hidden="true">
                {hasBarData ? (
                  barSegments.map((segment) => {
                    const isHovered = segment.isInteractive && hoveredAttrCode === attr.code && hoveredSourceKey === segment.sourceKey;
                    const isDimmed = isAttrHoverActive && !isHovered;
                    return (
                      <div
                        key={segment.sourceKey}
                        className={`player-profile__stats-stack-fill player-profile__stats-stack-fill--${segment.sourceKey}${
                          isHovered ? " player-profile__stats-stack-fill--hovered" : ""
                        }${isDimmed ? " player-profile__stats-stack-fill--dimmed" : ""}`}
                        data-shade-index={segment.shadeIndex}
                        style={getAttributeCompositionSegmentStyle(attr.code, segment)}
                        onMouseEnter={() => setHoveredCompositionSource(attr.code, segment.sourceKey)}
                        onMouseLeave={clearHoveredCompositionSource}
                      />
                    );
                  })
                ) : (
                  <div className="player-profile__stats-stack-empty" />
                )}
              </div>
              {hasData ? (
                <div className="player-profile__stats-attr-legend" role="list">
                  {segments.map((segment) => {
                    const isHovered =
                      segment.isInteractive && hoveredAttrCode === attr.code && hoveredSourceKey === segment.sourceKey;
                    const isDimmed = segment.isInteractive && isAttrHoverActive && !isHovered;
                    return (
                      <div
                        key={segment.sourceKey}
                        className={`player-profile__stats-attr-legend-item${
                          isHovered ? " player-profile__stats-attr-legend-item--hovered" : ""
                        }${isDimmed ? " player-profile__stats-attr-legend-item--dimmed" : ""}${
                          !segment.isInteractive ? " player-profile__stats-attr-legend-item--static" : ""
                        }`}
                        role="listitem"
                        tabIndex={segment.isInteractive ? 0 : undefined}
                        onMouseEnter={
                          segment.isInteractive ? () => setHoveredCompositionSource(attr.code, segment.sourceKey) : undefined
                        }
                        onMouseLeave={segment.isInteractive ? clearHoveredCompositionSource : undefined}
                        onFocus={
                          segment.isInteractive ? () => setHoveredCompositionSource(attr.code, segment.sourceKey) : undefined
                        }
                        onBlur={segment.isInteractive ? clearHoveredCompositionSource : undefined}
                      >
                        <i
                          className={`player-profile__stats-attr-swatch player-profile__stats-attr-swatch--${segment.sourceKey}`}
                          data-shade-index={segment.shadeIndex}
                          aria-hidden="true"
                        />
                        <span className="player-profile__stats-attr-legend-icon" aria-hidden="true">
                          {segment.iconPlaceholder}
                        </span>
                        <span className="player-profile__stats-attr-legend-label">{segment.label}</span>
                        <strong className="player-profile__stats-attr-legend-value">
                          {formatCompactNumber(segment.value)}
                        </strong>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="player-profile__stats-muted">{noDataText}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
