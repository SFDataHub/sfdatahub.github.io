import React, { useEffect, useMemo, useState } from "react";
import styles from "./DungeonPauseOpenXPCalculator.module.css";
import { dungeonPauseOpenXPData } from "../../../lib/calculators/dungeonPauseOpenXP";
import { DungeonRow, SpecialRow, buildOptions, sumXp } from "../../../lib/calculators/dungeonPauseOpenXP/types";

type RangeMap = Record<string, { from: number; to: number }>;
interface DungeonPauseOpenXPState {
  light: RangeMap;
  shadow: RangeMap;
  special: RangeMap;
}

interface DungeonPauseOpenXPCalculatorProps {
  initialState?: DungeonPauseOpenXPState;
  onStateChange?: (state: DungeonPauseOpenXPState) => void;
}

const numberFmt = (n: number) => n.toLocaleString("en-US");
const levelFromXp = (xp: number) => Math.round((xp / 1500000000) * 100) / 100;
const levelFmt = (xp: number) => levelFromXp(xp).toFixed(2);

function useInitialRanges() {
  const light: RangeMap = {};
  const shadow: RangeMap = {};
  const special: RangeMap = {};

  dungeonPauseOpenXPData.light.forEach((r) => (light[r.key] = { from: 0, to: 0 }));
  dungeonPauseOpenXPData.shadow.forEach((r) => (shadow[r.key] = { from: 0, to: 0 }));

  dungeonPauseOpenXPData.special.forEach((r) => {
    if (r.specialType === "twister") special[r.key] = { from: 486, to: 1000 };
    else if (r.specialType === "cloi") special[r.key] = { from: 2, to: 11 };
    else special[r.key] = { from: 0, to: 0 }; // sandstorm off
  });

  return { light, shadow, special };
}

function Row({
  row,
  range,
  onChange,
}: {
  row: DungeonRow;
  range: { from: number; to: number };
  onChange: (next: { from: number; to: number }) => void;
}) {
  const opts = useMemo(() => buildOptions(row.maxLevel), [row.maxLevel]);
  const from = range.from ?? 0;
  const to = range.to ?? 0;

  const sum = useMemo(() => {
    if (from === 0 || to === 0) return 0;
    return sumXp(row.levels, from, to);
  }, [row.levels, from, to]);

  return (
    <tr className={styles.row}>
      <td className={styles.name}>{row.name}</td>
      <td className={styles.selectCell}>
        <select value={from} onChange={(e) => onChange({ from: Number(e.target.value), to })}>
          {opts.map((v) => (
            <option key={v} value={v}>{v === 0 ? "—" : v}</option>
          ))}
        </select>
      </td>
      <td className={styles.selectCell}>
        <select value={to} onChange={(e) => onChange({ from, to: Number(e.target.value) })}>
          {opts.map((v) => (
            <option key={v} value={v}>{v === 0 ? "—" : v}</option>
          ))}
        </select>
      </td>
      <td className={styles.sumCell}>{numberFmt(sum)} XP</td>
    </tr>
  );
}

function Panel({
  title,
  rows,
  ranges,
  setRanges,
}: {
  title: string;
  rows: DungeonRow[];
  ranges: RangeMap;
  setRanges: (key: string, val: { from: number; to: number }) => void;
}) {
  const total = useMemo(() => {
    return rows.reduce((acc, r) => {
      const rg = ranges[r.key] || { from: 0, to: 0 };
      return acc + sumXp(r.levels, rg.from, rg.to);
    }, 0);
  }, [rows, ranges]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.title}>{title}</div>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Dungeon</th>
            <th>From</th>
            <th>To</th>
            <th>Sum XP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Row
              key={r.key}
              row={r}
              range={ranges[r.key] ?? { from: 0, to: 0 }}
              onChange={(next) => setRanges(r.key, next)}
            />
          ))}
        </tbody>
      </table>

      <div className={styles.footer}>
        <div className={styles.footerLine}>
          <span>Sum Total {title}</span>
          <span>{numberFmt(total)} XP</span>
        </div>
        <div className={styles.footerLine}>
          <span>Level</span>
          <span>{levelFmt(total)}</span>
        </div>
      </div>
    </div>
  );
}

export default function DungeonPauseOpenXPCalculator({
  initialState,
  onStateChange,
}: DungeonPauseOpenXPCalculatorProps) {
  const initial = useMemo(() => useInitialRanges(), []);
  const [lightRanges, setLightRanges] = useState<RangeMap>(initialState?.light ?? initial.light);
  const [shadowRanges, setShadowRanges] = useState<RangeMap>(initialState?.shadow ?? initial.shadow);
  const [specialRanges, setSpecialRanges] = useState<RangeMap>(initialState?.special ?? initial.special);

  const emitState = (
    nextLight: RangeMap,
    nextShadow: RangeMap,
    nextSpecial: RangeMap
  ) => {
    if (!onStateChange) return;
    onStateChange({
      light: nextLight,
      shadow: nextShadow,
      special: nextSpecial,
    });
  };

  const handleLightChange = (key: string, val: { from: number; to: number }) => {
    setLightRanges((prev) => {
      const next = { ...prev, [key]: val };
      emitState(next, shadowRanges, specialRanges);
      return next;
    });
  };

  const handleShadowChange = (key: string, val: { from: number; to: number }) => {
    setShadowRanges((prev) => {
      const next = { ...prev, [key]: val };
      emitState(lightRanges, next, specialRanges);
      return next;
    });
  };

  const handleSpecialChange = (key: string, val: { from: number; to: number }) => {
    setSpecialRanges((prev) => {
      const next = { ...prev, [key]: val };
      emitState(lightRanges, shadowRanges, next);
      return next;
    });
  };

  useEffect(() => {
    if (initialState) {
      setLightRanges(initialState.light ?? initial.light);
      setShadowRanges(initialState.shadow ?? initial.shadow);
      setSpecialRanges(initialState.special ?? initial.special);
      return;
    }
    setLightRanges(initial.light);
    setShadowRanges(initial.shadow);
    setSpecialRanges(initial.special);
  }, [initialState, initial]);

  const lightTotal = useMemo(
    () => dungeonPauseOpenXPData.light.reduce((acc, r) => {
      const rg = lightRanges[r.key];
      return acc + (rg ? sumXp(r.levels, rg.from, rg.to) : 0);
    }, 0),
    [lightRanges]
  );

  const shadowTotal = useMemo(
    () => dungeonPauseOpenXPData.shadow.reduce((acc, r) => {
      const rg = shadowRanges[r.key];
      return acc + (rg ? sumXp(r.levels, rg.from, rg.to) : 0);
    }, 0),
    [shadowRanges]
  );

  const specialTotal = useMemo(
    () => dungeonPauseOpenXPData.special.reduce((acc, r) => {
      const rg = specialRanges[r.key];
      return acc + (rg ? sumXp(r.levels, rg.from, rg.to) : 0);
    }, 0),
    [specialRanges]
  );

  const totalXP = lightTotal + shadowTotal + specialTotal;

  const reset = () => {
    const r = useInitialRanges();
    setLightRanges(r.light);
    setShadowRanges(r.shadow);
    setSpecialRanges(r.special);
    emitState(r.light, r.shadow, r.special);
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.controls}>
        <button className={styles.resetBtn} onClick={reset}>Reset</button>
        <span className={styles.resetNote}>Resets all selections to defaults.</span>
      </div>
      <Panel
        title="Light World"
        rows={dungeonPauseOpenXPData.light}
        ranges={lightRanges}
        setRanges={handleLightChange}
      />

      <Panel
        title="Shadow World"
        rows={dungeonPauseOpenXPData.shadow}
        ranges={shadowRanges}
        setRanges={handleShadowChange}
      />

      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.title}>Special Dungeons</div>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Dungeon</th>
              <th>From</th>
              <th>To</th>
              <th>Sum</th>
            </tr>
          </thead>
          <tbody>
            {dungeonPauseOpenXPData.special.map((r: SpecialRow) => (
              <Row
                key={r.key}
                row={r}
                range={specialRanges[r.key] ?? { from: 0, to: 0 }}
                onChange={(next) => handleSpecialChange(r.key, next)}
              />
            ))}
          </tbody>
        </table>

        <div className={styles.footer}>
          <div className={styles.footerLine}>
            <span>Sum Total Special</span>
            <span>{numberFmt(specialTotal)} XP</span>
          </div>
          <div className={styles.footerLine}>
            <span>Total XP</span>
            <span>{numberFmt(totalXP)} XP</span>
          </div>
          <div className={styles.footerLine}>
            <span>Level</span>
            <span>{levelFmt(totalXP)}</span>
          </div>
          <div className={styles.note}>
            XP values are summed per selection and converted to level using the project formula.
          </div>
        </div>
      </div>
    </div>
  );
}
