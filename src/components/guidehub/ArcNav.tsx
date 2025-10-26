import React, { useMemo } from "react";
import styles from "./styles.module.css";
import CategoryIcon from "./CategoryIcon";

type Item = { key: string; label: string; to: string; icon?: string };

type Props = {
  items: Item[];
  side: "left" | "right" | "sub" | "sub2" | "full";
  anchorSide?: "left" | "right"; // erforderlich für sub/sub2
  compact?: boolean;
  variant?: "main" | "sub" | "sub2";
  arcOffset?: number;     // left/right
  outerOffset?: number;   // sub
  superOffset?: number;   // sub2
};

const ArcNav: React.FC<Props> = ({
  items,
  side,
  anchorSide,
  compact = false,
  variant = "main",
  arcOffset = 220,
  outerOffset = 440,
  superOffset = 660,
}) => {
  // Wenn wir einen Sub/Sub2-Bogen ohne bekannte Seite rendern würden,
  // gäbe es genau den beschriebenen "Rechts-Sprung". Verhindern:
  if ((side === "sub" || side === "sub2") && !anchorSide) return null;

  const positions = useMemo(() => {
    const count = items.length;
    if (count === 0) return [];

    let startDeg = -90, endDeg = 90; // rechter Halbkreis
    if (side === "left") {
      startDeg = 90; endDeg = 270;
    } else if (side === "sub" || side === "sub2") {
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

  // Container-Position stabil & ohne Fallbacks
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
    } else if (side === "sub2") {
      style.left = anchorSide === "left"
        ? `calc(50% - ${superOffset}px)`
        : `calc(50% + ${superOffset}px)`;
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
        side === "sub2" ? styles.sub2 : "",
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
          <CategoryIcon to={it.to} label={it.label} icon={it.icon} variant={side === "left" || side === "right" ? "main" : side} />
        </div>
      ))}
    </div>
  );
};

export default ArcNav;
