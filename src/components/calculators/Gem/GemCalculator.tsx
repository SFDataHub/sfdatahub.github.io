import React, { useMemo, useState } from "react";
import styles from "./styles.module.css";
import { calcNormalGem, calcBlackGem, calcLegendaryGem } from "../../../lib/calculators/gem/math";

// Manifest EINBINDEN (wie von dir gewünscht).
// Wir greifen defensiv zu, damit es auch ohne konkrete Keys kompiliert.
// Wenn deine Icons (noch) nicht drin sind, werden Fallback-Shapes angezeigt.
import * as GuideHubAssets from "../../../Data/guidehub/assets";

const MAXS = { char: 1000, mine: 100, hok: 1000 };

// Utility: dot-path aus beliebigem Manifest lesen (z. B. "gems.normal")
function getPath(obj: any, path: string): any {
  return path.split(".").reduce((o, k) => (o && k in o ? o[k] : undefined), obj);
}
// Kandidaten je Typ (passe bei Bedarf an deine tatsächlichen Keys an)
const CANDIDATES = {
  normal: ["gems.normal", "gem.normal", "icons.gems.normal", "GEMS.NORMAL", "GEM_NORMAL", "assets.gems.normal"],
  black: ["gems.black", "gem.black", "icons.gems.black", "GEMS.BLACK", "GEM_BLACK", "assets.gems.black"],
  legendary: ["gems.legendary", "gem.legendary", "icons.gems.legendary", "GEMS.LEGENDARY", "GEM_LEGENDARY", "assets.gems.legendary"],
};

function resolveAsset(kind: keyof typeof CANDIDATES): string | undefined {
  const manifest: any = (GuideHubAssets as any).default ?? GuideHubAssets;
  for (const key of CANDIDATES[kind]) {
    const hit = getPath(manifest, key);
    if (typeof hit === "string" && hit.length > 0) return hit;
  }
  return undefined; // Fallback greift dann im UI
}

const GemCalculator: React.FC = () => {
  const [charLevel, setCharLevel] = useState<number | "">("");
  const [mineLevel, setMineLevel] = useState<number | "">("");
  const [guildHoK, setGuildHoK] = useState<number | "">("");

  const normal = useMemo(() => {
    if (charLevel === "" || mineLevel === "" || guildHoK === "") return null;
    return calcNormalGem({
      charLevel: Number(charLevel),
      mineLevel: Number(mineLevel),
      guildHoK: Number(guildHoK),
    });
  }, [charLevel, mineLevel, guildHoK]);

  const black = useMemo(() => (normal == null ? null : calcBlackGem(normal)), [normal]);
  const legendary = useMemo(() => (normal == null ? null : calcLegendaryGem(normal)), [normal]);

  // Asset-URLs (wenn im Manifest vorhanden)
  const normalSrc = resolveAsset("normal");
  const blackSrc = resolveAsset("black");
  const legendarySrc = resolveAsset("legendary");

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
                if (v === "") return setCharLevel("");
                const num = Number(v);
                setCharLevel(Number.isFinite(num) ? num : "");
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
                if (v === "") return setMineLevel("");
                const num = Number(v);
                setMineLevel(Number.isFinite(num) ? num : "");
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
              value={guildHoK}
              onChange={(e) => {
                const v = e.currentTarget.value;
                if (v === "") return setGuildHoK("");
                const num = Number(v);
                setGuildHoK(Number.isFinite(num) ? num : "");
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
            <div className={styles.gemValue}>{normal ?? "—"}</div>
          </div>

          {/* Black */}
          <div className={`${styles.gemBox} ${black == null ? styles.disabled : ""}`}>
            {blackSrc ? (
              <img className={styles.gemImg} src={blackSrc} alt="Black Gem" />
            ) : (
              <div className={`${styles.gemFallback} ${styles.blackGem}`} />
            )}
            <div className={styles.gemLabel}>Black</div>
            <div className={styles.gemValue}>{black ?? "—"}</div>
          </div>

          {/* Legendary */}
          <div className={`${styles.gemBox} ${legendary == null ? styles.disabled : ""}`}>
            {legendarySrc ? (
              <img className={styles.gemImg} src={legendarySrc} alt="Legendary Gem" />
            ) : (
              <div className={`${styles.gemFallback} ${styles.legendaryGem}`} />
            )}
            <div className={styles.gemLabel}>Legendary</div>
            <div className={styles.gemValue}>{legendary ?? "—"}</div>
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
