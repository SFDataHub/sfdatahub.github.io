// src/components/guilds/GuildClassOverview/ClassDonut.tsx
import React, { useMemo } from "react";
import styles from "./styles.module.css";
import type { ClassMeta, GuildClassOverviewProps } from "./types";
import { normalizeData, formatPct } from "./utils";

const ClassDonut: React.FC<GuildClassOverviewProps> = ({ data, classMeta }) => {
  const safeData = Array.isArray(data) ? data : [];
  const safeMeta = Array.isArray(classMeta) ? classMeta : [];

  const { shares, counts } = useMemo(
    () => normalizeData(safeData, safeMeta),
    [safeData, safeMeta]
  );

  const total = useMemo(
    () => Object.values(counts).reduce((a, b) => a + b, 0),
    [counts]
  );

  return (
    <div className={styles.donutCard}>
      <div className={styles.donutHeader}>
        <div>Klassen-Verteilung</div>
        <div className={styles.legendRight}>Gesamt: {total}</div>
      </div>

      <div className="grid grid-cols-[260px_1fr] gap-4">
        <svg width={260} height={260} viewBox="0 0 260 260" role="img" aria-label="Klassen-Donut">
          <circle cx={130} cy={130} r={90} fill="rgba(255,255,255,0.02)" />
          {(() => {
            const outerR = 100, innerR = 64, cx = 130, cy = 130, tau = Math.PI * 2;
            const list = safeMeta.map((m, i) => ({
              id: m.id,
              pct: shares[m.id] ?? 0,
              color: `hsl(${Math.round((360 / Math.max(safeMeta.length, 1)) * i)} 60% 55%)`,
            }));
            let acc = 0;
            return list.map((seg) => {
              const portion = (seg.pct || 0) / 100;
              if (portion <= 0) return null;
              const start = acc, end = acc + tau * portion; acc = end;
              const large = end - start > Math.PI ? 1 : 0;
              const sx  = cx + outerR * Math.cos(start);
              const sy  = cy + outerR * Math.sin(start);
              const ex  = cx + outerR * Math.cos(end);
              const ey  = cy + outerR * Math.sin(end);
              const sx2 = cx + innerR * Math.cos(end);
              const sy2 = cy + innerR * Math.sin(end);
              const ex2 = cx + innerR * Math.cos(start);
              const ey2 = cy + innerR * Math.sin(start);
              const d = `M ${sx} ${sy} A ${outerR} ${outerR} 0 ${large} 1 ${ex} ${ey} L ${sx2} ${sy2} A ${innerR} ${innerR} 0 ${large} 0 ${ex2} ${ey2} Z`;
              return <path key={seg.id} d={d} fill={seg.color} opacity={0.95} />;
            });
          })()}
        </svg>

        <div className={styles.legend}>
          {safeMeta.map((m, idx) => {
            const pct = shares[m.id] ?? 0;
            const cnt = counts[m.id] ?? 0;
            return (
              <div key={m.id} className={styles.legendItem} title={`${m.name}: ${cnt} • ${formatPct(pct)}`}>
                <span
                  className={styles.legendSwatch}
                  style={{
                    background: `hsl(${Math.round((360 / Math.max(safeMeta.length, 1)) * idx)} 60% 55%)`,
                    borderColor: "rgba(0,0,0,0.2)",
                  }}
                />
                <span>{m.name}</span>
                <span className={styles.legendRight}>
                  {cnt} • {formatPct(pct)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.centerLabel}>Anteile je Klasse</div>
    </div>
  );
};

export default ClassDonut;
