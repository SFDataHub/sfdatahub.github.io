// FILE: src/pages/GuideHub/Calculators/GemCalculator.tsx
import React, { useMemo, useState } from "react";
import styles from "./styles.module.css";
import { calcNormalGem, calcBlackGem, calcLegendaryGem } from "../../../lib/calculators/gem/math";

// Manifest-Helper exakt aus deinem Manifest verwenden (feste Keys).
// WICHTIG: Pfad gem���Y deiner Angabe: src/data/guidehub/assets.ts
import { guideAssetUrlByKey } from "../../../data/guidehub/assets";

const MAXS = { char: 1000, mine: 100, hok: 1000 };

export interface GemSimState {
  charLevel: number;
  mineLevel: number;
  guildHoKLevel: number;
}

export interface GemCalculatorProps {
  initialState?: GemSimState;
  onStateChange?: (state: GemSimState) => void;
}

const GemCalculator: React.FC<GemCalculatorProps> = ({ initialState, onStateChange }) => {
  const [charLevel, setCharLevel] = useState<number | "">(initialState?.charLevel ?? "");
  const [mineLevel, setMineLevel] = useState<number | "">(initialState?.mineLevel ?? "");
  const [guildHoKLevel, setGuildHoKLevel] = useState<number | "">(initialState?.guildHoKLevel ?? "");

  const emitStateChange = (nextChar: number | "", nextMine: number | "", nextHoK: number | "") => {
    if (!onStateChange) return;
    if (typeof nextChar !== "number" || typeof nextMine !== "number" || typeof nextHoK !== "number") {
      return;
    }
    onStateChange({
      charLevel: nextChar,
      mineLevel: nextMine,
      guildHoKLevel: nextHoK,
    });
  };

  const normal = useMemo(() => {
    if (charLevel === "" || mineLevel === "" || guildHoKLevel === "") return null;
    return calcNormalGem({
      charLevel: Number(charLevel),
      mineLevel: Number(mineLevel),
      guildHoK: Number(guildHoKLevel),
    });
  }, [charLevel, mineLevel, guildHoKLevel]);

  const black = useMemo(() => (normal == null ? null : calcBlackGem(normal)), [normal]);
  const legendary = useMemo(() => (normal == null ? null : calcLegendaryGem(normal)), [normal]);

  // Asset-URLs: feste Keys aus deinem Manifest
  const normalSrc = guideAssetUrlByKey("luckbig");       // Normal
  const blackSrc = guideAssetUrlByKey("blackbig");       // Black
  const legendarySrc = guideAssetUrlByKey("legendarybig"); // Legendary

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h2 className={styles.title}>Gem Calculator</h2>

        {/* Inputs */}
        <div className={styles.form}>
          <label className={styles.field}>
            <span>Char Level</span>
            <input
              type="number"
              inputMode="numeric"
              className={styles.input}
              placeholder="e.g., 360"
              value={charLevel}
              onChange={(e) => {
                const v = e.currentTarget.value;
                if (v === "") {
                  setCharLevel("");
                  return;
                }
                const num = Number(v);
                const nextValue = Number.isFinite(num) ? num : "";
                setCharLevel(nextValue);
                emitStateChange(nextValue, mineLevel, guildHoKLevel);
              }}
              max={MAXS.char}
            />
          </label>

          <label className={styles.field}>
            <span>Mine Level</span>
            <input
              type="number"
              inputMode="numeric"
              className={styles.input}
              placeholder="e.g., 10"
              value={mineLevel}
              onChange={(e) => {
                const v = e.currentTarget.value;
                if (v === "") {
                  setMineLevel("");
                  return;
                }
                const num = Number(v);
                const nextValue = Number.isFinite(num) ? num : "";
                setMineLevel(nextValue);
                emitStateChange(charLevel, nextValue, guildHoKLevel);
              }}
              max={MAXS.mine}
            />
          </label>

          <label className={styles.field}>
            <span>Guild HoK</span>
            <input
              type="number"
              inputMode="numeric"
              className={styles.input}
              placeholder="e.g., 840"
              value={guildHoKLevel}
              onChange={(e) => {
                const v = e.currentTarget.value;
                if (v === "") {
                  setGuildHoKLevel("");
                  return;
                }
                const num = Number(v);
                const nextValue = Number.isFinite(num) ? num : "";
                setGuildHoKLevel(nextValue);
                emitStateChange(charLevel, mineLevel, nextValue);
              }}
              max={MAXS.hok}
            />
          </label>
        </div>

        {/* Gems-Reihe */}
        <div className={styles.gemsRow}>
          {/* Normal */}
          <div className={`${styles.gemBox} ${normal == null ? styles.disabled : ""}`}>
            {normalSrc ? (
              <img className={styles.gemImg} src={normalSrc} alt="Normal Gem" />
            ) : (
              <div className={`${styles.gemFallback} ${styles.normalGem}`} />
            )}
            <div className={styles.gemLabel}>Normal</div>
            <div className={styles.gemValue}>{normal ?? "-"}</div>
          </div>

          {/* Black */}
          <div className={`${styles.gemBox} ${black == null ? styles.disabled : ""}`}>
            {blackSrc ? (
              <img className={styles.gemImg} src={blackSrc} alt="Black Gem" />
            ) : (
              <div className={`${styles.gemFallback} ${styles.blackGem}`} />
            )}
            <div className={styles.gemLabel}>Black</div>
            <div className={styles.gemValue}>{black ?? "-"}</div>
          </div>

          {/* Legendary */}
          <div className={`${styles.gemBox} ${legendary == null ? styles.disabled : ""}`}>
            {legendarySrc ? (
              <img className={styles.gemImg} src={legendarySrc} alt="Legendary Gem" />
            ) : (
              <div className={`${styles.gemFallback} ${styles.legendaryGem}`} />
            )}
            <div className={styles.gemLabel}>Legendary</div>
            <div className={styles.gemValue}>{legendary ?? "-"}</div>
          </div>
        </div>

        <p className={styles.hint}>
          The values are approximations and represent the <em>max possible</em> you can find. Actual results may vary slightly.
        </p>
      </div>
    </div>
  );
};

export default GemCalculator;
