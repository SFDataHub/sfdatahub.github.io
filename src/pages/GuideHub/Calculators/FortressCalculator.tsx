// src/pages/GuideHub/Calculators/FortressCalculator.tsx
import React, { useMemo, useState } from "react";
import styles from "./FortressCalculator.module.css";

import { FortressCosts, fmt, fmtTime } from "../../../lib/calculators/fortress/data";

export default function FortressCalculator() {
  const [level, setLevel] = useState<number>(1);

  // Get Fortress costs for the selected level
  const selectedCost = FortressCosts.find((cost) => cost.level === level);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h2 className={styles.title}>Fortress Calculator</h2>
        <div className={styles.meta}>Data source: Google Sheet</div>
      </div>

      <div className={styles.controls}>
        <div className={styles.field}>
          <label>Select Level</label>
          <select
            className={styles.select}
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
          >
            {FortressCosts.map((cost) => (
              <option key={cost.level} value={cost.level}>
                Level {cost.level}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedCost && (
        <div className={styles.grid}>
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div className={styles.panelTitle}>Building Data</div>
            </div>

            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Level</th>
                  <th>Wood Cost</th>
                  <th>Stone Cost</th>
                  <th>Build Time</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{selectedCost.level}</td>
                  <td>{fmt(selectedCost.wood)}</td>
                  <td>{fmt(selectedCost.stone)}</td>
                  <td>{fmtTime(selectedCost.timeSec)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
