// src/components/guilds/GuildClassOverview/ClassCrestGrid.tsx
import React, { useMemo, useState } from "react";
import styles from "./styles.module.css";
import { normalizeData, formatPct, formatCount } from "./utils";
import type { GuildClassOverviewProps, ClassMeta } from "./types";

const Ring: React.FC<{ valuePct: number }> = ({ valuePct }) => {
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, valuePct)) / 100);
  return (
    <svg className={styles.ring} viewBox="0 0 60 60" aria-hidden="true">
      <circle cx="30" cy="30" r={r} stroke="rgba(255,255,255,.08)" strokeWidth="4" fill="none" />
      <circle cx="30" cy="30" r={r} stroke="rgba(92,139,198,.9)" strokeWidth="4" fill="none"
              strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
    </svg>
  );
};

const ClassCrestGrid: React.FC<GuildClassOverviewProps> = ({ data, classMeta, onPickClass }) => {
  const [imgError, setImgError] = useState<Record<string, boolean>>({});

  const safeData = Array.isArray(data) ? data : [];
  const safeMeta = Array.isArray(classMeta) ? classMeta : [];

  const { counts, shares, avg, top } = useMemo(
    () => normalizeData(safeData, safeMeta),
    [safeData, safeMeta]
  );

  return (
    <section className={styles.wrapper}>
      <div className={styles.sectionTitle}>Klassenübersicht</div>

      {/* immer 1 Spalte */}
      <div className={styles.grid} style={{ gridTemplateColumns: "1fr" }}>
        {safeMeta.map((cm: ClassMeta) => {
          const count = counts[cm.id] ?? 0;
          const share = shares[cm.id] ?? 0;
          const avgLvl = avg[cm.id];
          const topP = top[cm.id];
          const disabled = count <= 0;

          // Bildquelle: crestUrl/iconUrl sind bereits via toDriveThumbProxy (utils.adaptClassMeta)
          const src = imgError[cm.id] ? undefined : (cm.crestUrl || cm.iconUrl);

          return (
            <div
              key={cm.id}
              className={`${styles.tile} ${disabled ? styles.disabled : ""}`}
              title={
                disabled
                  ? `${cm.name}: kein Mitglied`
                  : `${cm.name} • ${formatCount(count)} • ${formatPct(share)}${avgLvl ? ` • Ø ${avgLvl.toFixed(1)}` : ""}`
              }
            >
              <div className={styles.crestWrap}>
                {src ? (
                  <img
                    className={styles.crest}
                    src={src}
                    alt={cm.name}
                    onError={() => setImgError((s) => ({ ...s, [cm.id]: true }))}
                  />
                ) : (
                  <div
                    className={styles.crest}
                    style={{ background: "rgba(255,255,255,.06)", display: "grid", placeItems: "center", fontSize: 18 }}
                  >
                    {cm.fallback ?? "🎯"}
                  </div>
                )}
                <Ring valuePct={share} />
                <div className={styles.badge}>{formatCount(count)}</div>
              </div>

              <div className={styles.meta}>
                <div className={styles.nameRow}>
                  <div className={styles.name}>{cm.name}</div>
                  <div className={styles.share}>{formatPct(share)}</div>
                </div>
                <div className={styles.sub}>
                  {avgLvl ? `Ø Lvl ${avgLvl.toFixed(1)}` : "—"}
                  {topP ? ` • Top: ${topP.name}${topP.level ? ` (Lv ${topP.level})` : ""}` : ""}
                </div>
              </div>

              {!disabled && onPickClass && (
                <button
                  className={styles.tileButton}
                  onClick={() => onPickClass(cm.id)}
                  aria-label={`${cm.name} filtern`}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default ClassCrestGrid;
