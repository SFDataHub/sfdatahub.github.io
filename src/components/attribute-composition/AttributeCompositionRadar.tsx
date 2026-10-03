import React, { useMemo } from "react";
import {
  ATTRIBUTE_COMPOSITION_RADAR_LABELS,
  buildAttributeCompositionRadarModel,
  type AttributeCompositionRadarAxis,
  type AttributeCompositionMainSourceKey,
  type AttributeCompositionModel,
} from "./attributeCompositionModel";
import "./AttributeCompositionCard.css";

const AXIS_ORDER: AttributeCompositionMainSourceKey[] = ["base", "baseItems", "upgrades", "gems", "petBonus", "potion"];

const AXIS_CLASS_BY_KEY: Record<AttributeCompositionMainSourceKey, string> = {
  base: "base",
  baseItems: "baseItems",
  upgrades: "upgrades",
  gems: "gems",
  petBonus: "pet",
  potion: "potion",
};

const polarPoint = (center: number, radius: number, index: number, count: number) => {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
  return {
    x: center + Math.cos(angle) * radius,
    y: center + Math.sin(angle) * radius,
  };
};

const labelAnchorForPoint = (point: { x: number; y: number }, center: number) => {
  const deltaX = point.x - center;
  const deltaY = point.y - center;
  return {
    textAnchor: Math.abs(deltaX) < 1 ? "middle" : deltaX > 0 ? "start" : "end",
    dominantBaseline: Math.abs(deltaY) < 1 ? "middle" : deltaY > 0 ? "hanging" : "auto",
  } as const;
};

const axisByKey = (axes: AttributeCompositionRadarAxis[]) => new Map(axes.map((axis) => [axis.key, axis]));

export type AttributeCompositionRadarProps = {
  composition: AttributeCompositionModel | null | undefined;
  onOpenDetails: () => void;
};

export default function AttributeCompositionRadar({ composition, onOpenDetails }: AttributeCompositionRadarProps) {
  const radar = useMemo(() => buildAttributeCompositionRadarModel(composition), [composition]);
  const center = 64;
  const radius = 42;
  const labelRadius = 54;
  const gridRadii = [radius * 0.5, radius];
  const axes = radar ? axisByKey(radar.axes) : null;
  const axisPoints = AXIS_ORDER.map((key, index) => ({
    key,
    ...polarPoint(center, radius, index, AXIS_ORDER.length),
  }));
  const polygonPoints = radar
    ? AXIS_ORDER.map((key, index) => {
          const axis = axes?.get(key);
          if (!axis) return null;
          const point = polarPoint(center, radius * (axis.displayScore / 100), index, radar.axes.length);
          return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
        })
        .filter((point): point is string => Boolean(point))
        .join(" ")
    : "";

  return (
    <section className="attribute-composition-radar-card" aria-label="Attribute composition">
      <header className="attribute-composition-radar-card__head">
        <h3>ATTRIBUTE COMPOSITION</h3>
        <button
          type="button"
          className="attribute-composition-radar-card__details"
          onClick={onOpenDetails}
          aria-label="Open attribute composition details"
          title="Details"
        >
          i
        </button>
      </header>
      {radar ? (
        <div className="attribute-composition-radar-card__body">
          <svg className="attribute-composition-radar-card__svg" viewBox="0 0 128 128" role="img" aria-label="Attribute composition sources">
            {gridRadii.map((gridRadius) => (
              <polygon
                key={gridRadius}
                className="attribute-composition-radar-card__grid"
                points={AXIS_ORDER.map((_, index) => {
                  const point = polarPoint(center, gridRadius, index, AXIS_ORDER.length);
                  return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
                }).join(" ")}
              />
            ))}
            {axisPoints.map((point) => (
              <line
                key={point.key}
                className="attribute-composition-radar-card__axis"
                x1={center}
                y1={center}
                x2={point.x}
                y2={point.y}
              />
            ))}
            <polygon className="attribute-composition-radar-card__shape" points={polygonPoints} />
            {AXIS_ORDER.map((key, index) => {
              const axis = axes?.get(key);
              if (!axis) return null;
              const point = polarPoint(center, radius * (axis.displayScore / 100), index, radar.axes.length);
              return (
                <circle
                  key={axis.key}
                  className={`attribute-composition-radar-card__point attribute-composition-radar-card__point--${AXIS_CLASS_BY_KEY[axis.key]}`}
                  cx={point.x}
                  cy={point.y}
                  r="2.6"
                />
              );
            })}
            {AXIS_ORDER.map((key, index) => {
              const point = polarPoint(center, labelRadius, index, AXIS_ORDER.length);
              const anchor = labelAnchorForPoint(point, center);
              return (
                <text
                  key={key}
                  className={`attribute-composition-radar-card__axis-label attribute-composition-radar-card__axis-label--${AXIS_CLASS_BY_KEY[key]}`}
                  x={point.x}
                  y={point.y}
                  textAnchor={anchor.textAnchor}
                  dominantBaseline={anchor.dominantBaseline}
                >
                  {ATTRIBUTE_COMPOSITION_RADAR_LABELS[key]}
                </text>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="attribute-composition-radar-card__unavailable">Composition data unavailable</div>
      )}
    </section>
  );
}
