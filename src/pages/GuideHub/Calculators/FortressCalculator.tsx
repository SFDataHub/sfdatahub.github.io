// FILE: src/pages/GuideHub/Calculators/FortressCalculator.tsx

import React, { useMemo, useState } from "react";
import styles from "./FortressCalculator.module.css";

import { gdrive } from "../../../lib/urls";
import { BUILDING_MEDIA_GIFS } from "../../../data/guidehub/assets-gif";

// Fortress-Daten + Mapping
import type { BuildingKey, LevelCost } from "../../../lib/calculators/fortress/tables";
import { BUILDINGS } from "../../../lib/calculators/fortress/tables";
import { TABS, DEFAULT_TAB, BUILDING_MEDIA_KEYS } from "../../../lib/calculators/fortress/mapping";

function l2Multiplier(l2: number): number {
  // 0..15 → 0..0.75 (in 0.05er Schritten) – wie in UW
  if (l2 <= 0) return 0;
  if (l2 >= 15) return 0.75;
  return +(l2 * 0.05).toFixed(2);
}

function secToHHMMSS(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

const FortressCalculator: React.FC = () => {
  const [activeTab, setActiveTab] = useState<BuildingKey>(DEFAULT_TAB as BuildingKey);
  const [l2, setL2] = useState<number>(1);

  // Aktuelles GIF
  const mediaSrc = useMemo(() => {
    const mediaKey = BUILDING_MEDIA_KEYS[activeTab]; // z.B. "woodcuttergif"
    const entry = (BUILDING_MEDIA_GIFS as any)[mediaKey];
    const id = entry?.id ?? entry;
    return gdrive.gifProxy(id) || gdrive.gif(id) || "";
  }, [activeTab]);

  const rows: LevelCost[] = useMemo(() => {
    return BUILDINGS[activeTab]?.costs ?? [];
  }, [activeTab]);

  const mult = useMemo(() => l2Multiplier(l2), [l2]);

  return (
    <div className={`${styles.foCalc}`}>
      {/* Building-Auswahl */}
      <div className="tabs">
        <span className="tabSelectLabel">Select building</span>
        <select
          className="tabSelect"
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value as BuildingKey)}
        >
          {TABS.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* GIF links | Panel rechts */}
      <div className="mediaRow">
        <div className="media">
          {mediaSrc ? (
            // GIF-Animation bleibt erhalten (Proxy bevorzugt)
            <img src={mediaSrc} alt={activeTab} />
          ) : null}
        </div>

        <div className={styles.panel}>
          {/* Panel-Kopf mit Titel + L2 */}
          <div className={styles.panelHead}>
            <div className={styles.panelTitle}>Fortress — {activeTab}</div>
            <div className={styles.controls}>
              <span className={styles.ctrlLabel}>L2 (Laborers)</span>
              <select
                className={styles.ctrlSelect}
                value={l2}
                onChange={(e) => setL2(parseInt(e.target.value, 10))}
              >
                {Array.from({ length: 16 }, (_, i) => i).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tabelle */}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Level</th>
                  <th className={styles.th}>Wood</th>
                  <th className={styles.th}>Stone</th>
                  <th className={styles.th}>Build Time</th>
                  <th className={styles.th}>Build Time (L2)</th>
                  <th className={styles.th}>Skip (Mushr.)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const baseSec = r.timeSec ?? 0;
                  const l2Sec   = Math.round(baseSec * (1 - mult));
                  const skip    = Math.ceil(Math.ceil(l2Sec / 60) / 10); // = roundup(roundup(timeMin)/10)

                  return (
                    <tr key={r.level} className={styles.row}>
                      <td className={styles.td}>{r.level}</td>
                      <td className={styles.td}>{r.wood?.toLocaleString?.() ?? r.wood}</td>
                      <td className={styles.td}>{r.stone?.toLocaleString?.() ?? r.stone}</td>
                      <td className={styles.td}>{secToHHMMSS(baseSec)}</td>
                      <td className={styles.td}>{secToHHMMSS(l2Sec)}</td>
                      <td className={styles.td}>{skip.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.note}>
            Hinweis: L2 wirkt für alle Buildings (0–15 → 0–75%). Skip basiert auf der L2-Zeit (ceil(ceil(sec/60)/10)).
          </div>
        </div>
      </div>
    </div>
  );
};

export default FortressCalculator;
