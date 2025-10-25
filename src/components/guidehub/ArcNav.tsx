import React, { useMemo } from "react";
import styles from "./styles.module.css";
import CategoryIcon from "./CategoryIcon";

type Item = { key: string; label: string; to: string; icon?: string };

type Props = {
  items: Item[];
  side: "left" | "right" | "sub" | "full";
  anchorSide?: "left" | "right";        // für sub
  compact?: boolean;
  variant?: "main" | "sub";
  /** Dynamischer Versatz vom Logo-Rand zu den Haupt-Icons */
  arcOffset?: number;                   // für left/right
  /** Versatz für Sub-Bogen außen */
  outerOffset?: number;                 // für sub
};

const ArcNav: React.FC<Props> = ({
  items,
  side,
  anchorSide = "right",
  compact = false,
  variant = "main",
  arcOffset = 220,
  outerOffset = 440,
}) => {
  const positions = useMemo(() => {
    const count = items.length;
    if (count === 0) return [];

    let startDeg = -90, endDeg = 90; // rechter Halbkreis
    if (side === "left") {
      startDeg = 90; endDeg = 270;
    } else if (side === "sub") {
      if (anchorSide === "left") { startDeg = 90; endDeg = 270; }
      else { startDeg = -90; endDeg = 90; }
    } else if (side === "full") {
      startDeg = 0; endDeg = 360;
    }

    const step = (endDeg - startDeg) / (count + 1);
    const radius = compact ? 190 : 250;
    return items.map((it, idx) => {
      const deg = startDeg + step * (idx + 1);
      const rad = (deg * Math.PI) / 180;
      return { it, x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
    });
  }, [items, side, anchorSide, compact]);

  // Container-Position dynamisch anhand Logo-Breite
  const containerStyle: React.CSSProperties = (() => {
    const style: React.CSSProperties = {
      position: "absolute",
      top: "50%",
      transform: "translate(-50%, -50%)",
      left: "50%",
    };
    if (side === "left") {
      style.left = `calc(50% - ${arcOffset}px)`;
    } else if (side === "right") {
      style.left = `calc(50% + ${arcOffset}px)`;
    } else if (side === "sub") {
      style.left = anchorSide === "left"
        ? `calc(50% - ${outerOffset}px)`
        : `calc(50% + ${outerOffset}px)`;
    }
    return style;
  })();

  return (
    <div
      className={[
        styles.arc,
        side === "left" ? styles.left : "",
        side === "right" ? styles.right : "",
        side === "sub" ? styles.sub : "",
        side === "full" ? styles.full : "",
      ].join(" ")}
      style={containerStyle}
    >
      {positions.map(({ it, x, y }) => (
        <div
          key={it.key}
          className={styles.arcItem}
          style={{ transform: `translate(${x}px, ${y}px)` }}
        >
          <CategoryIcon to={it.to} label={it.label} icon={it.icon} variant={variant} />
        </div>
      ))}
    </div>
  );
};

export default ArcNav;
