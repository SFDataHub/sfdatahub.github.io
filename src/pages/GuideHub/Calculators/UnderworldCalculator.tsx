import React, { useMemo, useState } from "react";
import styles from "./UnderworldCalculator.module.css";

import { gdrive } from "../../../lib/urls";
import { BUILDING_MEDIA_GIFS } from "../../../data/guidehub/assets-gif";

import { GIFKEY_TO_BUILDING_KEY } from "../../../lib/calculators/underworld/mapping";
import type { BuildingKey } from "../../../lib/calculators/underworld/tables";
import { computeRows, formatHMS } from "../../../lib/calculators/underworld/formulas";

const UW_GIF_KEYS: string[] = [
  "uwgategif",
  "trollblockgif",
  "torturechambergif",
  "soulextractorgif",
  "keepergif",
  "hearthofdarkngif",
  "goldpitgif",
  "goblinpitgif",
  "gladiatorgif",
  "adventuromaticgif",
];

const UnderworldCalculator: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("hearthofdarkngif");
  const [l2, setL2] = useState<number>(1); // 1–15

  // GIF-Quelle (Proxy bevorzugt, sonst direktes GIF)
  const mediaSrc = useMemo(() => {
    const entry = (BUILDING_MEDIA_GIFS as any)[activeTab];
    const id = entry?.id ?? entry;
    return gdrive.gifProxy(id) || gdrive.gif(id) || "";
  }, [activeTab]);

  // GIF-Key → Underworld-Building-Key
  const buildingKey: BuildingKey = useMemo(
    () => (GIFKEY_TO_BUILDING_KEY[activeTab] ?? "hearthofdarkn") as BuildingKey,
    [activeTab]
  );

  // Tabellenzeilen berechnen (inkl. L2 & Skip)
  const rows = useMemo(() => computeRows(buildingKey, l2), [buildingKey, l2]);

  return (
    <div className={styles.uwCalc}>
      {/* Building-Auswahl */}
      <div className="tabs">
        <span className="tabSelectLabel">Select building</span>
        <select
          className="tabSelect"
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value)}
        >
          {UW_GIF_KEYS.map((key) => (
            <option key={key} value={key}>
              {key.replace(/gif$/i, "")}
            </option>
          ))}
        </select>
      </div>

      {/* GIF links | Panel/Tabelle rechts */}
      <div className="mediaRow">
        <div className="media">
          {mediaSrc ? <img src={mediaSrc} alt={activeTab} /> : null}
        </div>

        <div className={styles.panel}>
          {/* Panel-Kopf mit Titel + L2 */}
          <div className={styles.panelHead}>
            <div className={styles.panelTitle}>Underworld — {buildingKey}</div>
            <div className={styles.controls}>
              <label htmlFor="uw-l2" className={styles.ctrlLabel}>
                L2 (Laborers)
              </label>
              <select
                id="uw-l2"
                className={styles.ctrlSelect}
                value={l2}
                onChange={(e) => setL2(parseInt(e.target.value, 10))}
              >
                {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
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
                  <th className={styles.th}>Soul</th>
                  <th className={styles.th}>Gold</th>
                  <th className={styles.th}>Build Time</th>
                  <th className={styles.th}>Build Time (L2)</th>
                  <th className={styles.th}>Skip (Mushr.)</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr className={styles.row}>
                    <td className={styles.td} colSpan={6}>
                      No data for this building yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.level} className={styles.row}>
                      <td className={styles.td}>{r.level}</td>
                      <td className={styles.td}>{r.soul}</td>
                      <td className={styles.td}>{r.gold}</td>
                      <td className={styles.td}>{formatHMS(r.timeSec)}</td>
                      <td className={styles.td}>{formatHMS(r.timeAdjSec)}</td>
                      <td className={styles.td}>{r.skipMushroomsAdj}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className={styles.note}>
            Hinweis: L2 wirkt für alle Buildings (0–15 → 0–75%). Skip basiert auf
            der L2-Zeit (ceil(ceil(sec/60)/10)).
          </p>
        </div>
      </div>
    </div>
  );
};

export default UnderworldCalculator;
