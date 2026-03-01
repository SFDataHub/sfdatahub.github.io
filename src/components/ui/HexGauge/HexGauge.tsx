import { useId, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import styles from "./HexGauge.module.css";

const HEX_SIDES = 6;
const START_ANGLE_DEG = -90;

export type HexGaugeProps = {
  value: number;
  size?: number;
  stroke?: number;
  rotationDeg?: number;
  center: ReactNode;
  hoverDetails?: ReactNode;
  className?: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): { x: number; y: number } {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

function hexPoints(
  cx: number,
  cy: number,
  radius: number,
): Array<{ x: number; y: number }> {
  return Array.from({ length: HEX_SIDES }, (_, index) =>
    polarToCartesian(cx, cy, radius, START_ANGLE_DEG + index * 60),
  );
}

function pathFromPoints(points: Array<{ x: number; y: number }>): string {
  if (!points.length) return "";

  const fmt = (value: number) => Number(value.toFixed(3));
  const [firstPoint, ...rest] = points;
  const commands = rest.map((point) => `L ${fmt(point.x)} ${fmt(point.y)}`);

  return `M ${fmt(firstPoint.x)} ${fmt(firstPoint.y)} ${commands.join(" ")} Z`;
}

export default function HexGauge({
  value,
  size = 92,
  stroke = 9,
  rotationDeg = 30,
  center,
  hoverDetails,
  className,
}: HexGaugeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const clampedValue = clamp(value, 0, 1);
  const progress = clampedValue * 100;

  const svgSize = Math.max(size, 36);
  const ringStroke = clamp(stroke, 2, svgSize / 3);
  const cx = svgSize / 2;
  const cy = svgSize / 2;

  const plateRadius = Math.max(1, svgSize / 2 - 1.25);
  const ringRadius = Math.max(1, plateRadius - ringStroke / 2 - 2);
  const innerFrameRadius = Math.max(1, ringRadius - ringStroke - 2);
  const innerFrameStroke = Math.max(1, ringStroke * 0.18);

  const { platePath, ringPath, innerFramePath } = useMemo(() => {
    return {
      platePath: pathFromPoints(hexPoints(cx, cy, plateRadius)),
      ringPath: pathFromPoints(hexPoints(cx, cy, ringRadius)),
      innerFramePath: pathFromPoints(hexPoints(cx, cy, innerFrameRadius)),
    };
  }, [cx, cy, plateRadius, ringRadius, innerFrameRadius]);

  const centerInset = clamp(ringStroke + 4, 12, Math.max(12, svgSize / 2 - 8));
  const gradientSeed = useId().replace(/:/g, "");
  const progressGradientId = `hexGaugeProgress_${gradientSeed}`;
  const rootClassName = className ? `${styles.root} ${className}` : styles.root;
  const rootStyle: CSSProperties = { width: svgSize, height: svgSize };

  return (
    <div className={rootClassName} style={rootStyle}>
      <svg
        className={styles.svg}
        width={svgSize}
        height={svgSize}
        viewBox={`0 0 ${svgSize} ${svgSize}`}
        role="img"
        aria-label={`${Math.round(progress)} percent`}
      >
        <defs>
          <linearGradient id={progressGradientId} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--icon, #5C8BC6)" />
            <stop offset="58%" stopColor="var(--active, #2D4E78)" />
            <stop offset="100%" stopColor="#3FF1C3" />
          </linearGradient>
        </defs>

        <g transform={`rotate(${rotationDeg} ${cx} ${cy})`}>
          <path
            d={platePath}
            className={styles.plate}
            onPointerEnter={() => setIsHovered(true)}
            onPointerLeave={() => setIsHovered(false)}
          />
          <path
            d={ringPath}
            className={styles.track}
            pathLength={100}
            strokeWidth={ringStroke}
            pointerEvents="none"
          />
          <path
            d={ringPath}
            className={styles.progress}
            pathLength={100}
            strokeWidth={ringStroke}
            strokeDasharray={`${progress} 100`}
            stroke={`url(#${progressGradientId})`}
            pointerEvents="none"
          />
          <path
            d={innerFramePath}
            className={styles.innerFrame}
            strokeWidth={innerFrameStroke}
            pointerEvents="none"
          />
        </g>
      </svg>

      <div className={styles.center} style={{ inset: centerInset }}>
        {center}
      </div>

      {hoverDetails ? (
        <div
          className={`${styles.hoverDetails} ${isHovered ? styles.hoverDetailsVisible : ""}`}
          aria-hidden={!isHovered}
        >
          {hoverDetails}
        </div>
      ) : null}
    </div>
  );
}
