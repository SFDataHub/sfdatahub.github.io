import React from "react";
import styles from "./styles.module.css";
import {
  PRO_PACK_RESOURCES,
  UNDERWORLD_PRO_PACK_ENTRIES,
  type UnderworldProPackEntry,
} from "./underworldProPackData";

const formatNumber = (value: number | null) => {
  if (value == null) return "-";
  return value.toLocaleString("en-US");
};

const formatTime = (minutes: number | null) => {
  if (minutes == null) return "-";
  const total = Math.max(0, Math.ceil(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `${hours}h ${mins}m`;
};

const getLaborersMultiplier = (level: number) => {
  if (level <= 0) return 0;
  if (level >= 15) return 0.75;
  return +(level * 0.05).toFixed(2);
};

const computeAdjustedMinutes = (entry: UnderworldProPackEntry, multiplier: number) => {
  if (entry.baseTimeMinutes == null) return null;
  return entry.baseTimeMinutes * (1 - multiplier);
};

const computeSkipCost = (adjustedMinutes: number | null) => {
  if (adjustedMinutes == null) return null;
  const roundedMinutes = Math.ceil(adjustedMinutes);
  return Math.ceil(roundedMinutes / 10);
};

const sumEntries = (entries: UnderworldProPackEntry[], key: "gold" | "shrooms" | "souls") =>
  entries.reduce((acc, entry) => acc + (entry[key] ?? 0), 0);

const UnderworldProPackSkipOrder: React.FC = () => {
  const [laborersLevel, setLaborersLevel] = React.useState<number>(0);
  const laborersMultiplier = React.useMemo(
    () => getLaborersMultiplier(laborersLevel),
    [laborersLevel]
  );

  const totals = React.useMemo(() => {
    return {
      gold: sumEntries(UNDERWORLD_PRO_PACK_ENTRIES, "gold"),
      shrooms: sumEntries(UNDERWORLD_PRO_PACK_ENTRIES, "shrooms"),
      souls: sumEntries(UNDERWORLD_PRO_PACK_ENTRIES, "souls"),
    };
  }, []);

  const leftovers = React.useMemo(() => {
    return {
      shrooms: PRO_PACK_RESOURCES.shrooms - totals.shrooms,
      souls: PRO_PACK_RESOURCES.souls - totals.souls,
    };
  }, [totals]);

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h2 className={styles.title}>Underworld Pro Pack skip order</h2>
        <div className={styles.subtle}>
          Build order and costs based on the provided Pro Pack sheet.
        </div>

        <div className={styles.controls}>
          <label className={styles.field}>
            <span>Laborers Quarter</span>
            <select
              className={styles.select}
              value={laborersLevel}
              onChange={(event) => setLaborersLevel(Number(event.currentTarget.value))}
            >
              {Array.from({ length: 16 }, (_, i) => i).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.field}>
            <span>Build time reduction</span>
            <div className={styles.select}>{(laborersMultiplier * 100).toFixed(0)}%</div>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Build order</th>
                <th className={styles.th}>Level</th>
                <th className={`${styles.th} ${styles.tdNumber}`}>Gold</th>
                <th className={`${styles.th} ${styles.tdNumber}`}>Shrooms</th>
                <th className={`${styles.th} ${styles.tdNumber}`}>Souls</th>
                <th className={`${styles.th} ${styles.tdNumber}`}>Build time</th>
                <th className={`${styles.th} ${styles.tdNumber}`}>Time (LQ)</th>
                <th className={`${styles.th} ${styles.tdNumber}`}>Skip</th>
              </tr>
            </thead>
            <tbody>
              {UNDERWORLD_PRO_PACK_ENTRIES.map((entry) => {
                const adjustedMinutes = computeAdjustedMinutes(entry, laborersMultiplier);
                const skipCost = computeSkipCost(adjustedMinutes);
                return (
                  <tr key={entry.id}>
                    <td className={styles.td}>{entry.building}</td>
                    <td className={`${styles.td} ${styles.tdNumber}`}>{entry.level}</td>
                    <td className={`${styles.td} ${styles.tdNumber}`}>
                      {formatNumber(entry.gold)}
                    </td>
                    <td className={`${styles.td} ${styles.tdNumber}`}>
                      {formatNumber(entry.shrooms)}
                    </td>
                    <td className={`${styles.td} ${styles.tdNumber}`}>
                      {formatNumber(entry.souls)}
                    </td>
                    <td className={`${styles.td} ${styles.tdNumber} ${styles.rowMuted}`}>
                      {formatTime(entry.baseTimeMinutes)}
                    </td>
                    <td className={`${styles.td} ${styles.tdNumber}`}>
                      {formatTime(adjustedMinutes)}
                    </td>
                    <td className={`${styles.td} ${styles.tdNumber}`}>
                      {formatNumber(skipCost)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Total cost</div>
            <div className={styles.summaryValue}>
              {formatNumber(totals.gold)} Gold · {formatNumber(totals.shrooms)} Shrooms · {formatNumber(totals.souls)} Souls
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Pro Pack resources</div>
            <div className={styles.summaryValue}>
              {formatNumber(PRO_PACK_RESOURCES.shrooms)} Shrooms · {formatNumber(PRO_PACK_RESOURCES.souls)} Souls
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Leftover</div>
            <div className={styles.summaryValue}>
              {formatNumber(leftovers.shrooms)} Shrooms · {formatNumber(leftovers.souls)} Souls
            </div>
          </div>
        </div>

        <div className={styles.note}>
          Skip cost is computed as roundup(roundup(time in minutes)/10).
        </div>
      </div>
    </div>
  );
};

export default UnderworldProPackSkipOrder;
