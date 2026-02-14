import React, { useMemo, useState } from "react";
import styles from "./styles.module.css";
import {
  ARMOR_TYPES,
  LEGENDARY_BELOW,
  LEGENDARY_QUALITY_ABOVE,
  LEGENDARY_QUALITY_OFFSET,
  QUALITY_350_PLUS_BASE,
  QUALITY_MULTIPLIERS,
  QUALITY_THRESHOLD,
  THEORETICAL_QUALITY_BASE_OFFSET,
  WEAPON_BASE,
  WEAPON_TYPES,
  type ArmorType,
  type WeaponType,
} from "./maxItemStatsData";

const formatValue = (value: number | null, decimals = 0) => {
  if (value == null || Number.isNaN(value)) return "-";
  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return formatter.format(value);
};

const parseNumberInput = (value: string): number | "" => {
  if (value.trim() === "") return "";
  const num = Number(value);
  return Number.isFinite(num) ? num : "";
};

const computeBaseQuality = (quality: number) =>
  QUALITY_350_PLUS_BASE.a * quality * quality + QUALITY_350_PLUS_BASE.b * quality;

const computeQualityValue = (quality: number, multipliers: { below: number; above: number }) => {
  if (quality < QUALITY_THRESHOLD) {
    return quality * multipliers.below;
  }
  return computeBaseQuality(quality) * multipliers.above;
};

const computeLegendaryQuality = (quality: number) => {
  if (quality < QUALITY_THRESHOLD) {
    return (quality + LEGENDARY_BELOW.offset) * LEGENDARY_BELOW.multiplier;
  }
  return (
    LEGENDARY_QUALITY_ABOVE.a * quality * quality +
    LEGENDARY_QUALITY_ABOVE.b * quality +
    LEGENDARY_QUALITY_ABOVE.c
  );
};

const computeWeaponBase = (quality: number) => {
  const capped = Math.min(quality, WEAPON_BASE.cap);
  const extra = Math.max(quality - WEAPON_BASE.cap, 0);
  return (WEAPON_BASE.baseOffset + capped) * WEAPON_BASE.baseMultiplier + extra;
};

const MaxItemStatsCalculator: React.FC = () => {
  const [itemQuality, setItemQuality] = useState<number | "">("");
  const [level, setLevel] = useState<number | "">("");
  const [aura, setAura] = useState<number | "">("");
  const [runePercent, setRunePercent] = useState<number>(0);
  const [armorType, setArmorType] = useState<ArmorType>("light");
  const [weaponType, setWeaponType] = useState<WeaponType>("melee");
  const [armorLegendary, setArmorLegendary] = useState(false);
  const [weaponLegendary, setWeaponLegendary] = useState(false);

  const qualityValue = typeof itemQuality === "number" ? itemQuality : null;

  const theoreticalQuality = useMemo(() => {
    if (typeof level !== "number" || typeof aura !== "number") {
      return null;
    }
    const runeMultiplier = 1 + runePercent / 100;
    return (level + aura + THEORETICAL_QUALITY_BASE_OFFSET) * runeMultiplier;
  }, [level, aura, runePercent]);

  const normal1 = useMemo(
    () => (qualityValue == null ? null : computeQualityValue(qualityValue, QUALITY_MULTIPLIERS.normal1)),
    [qualityValue]
  );
  const normal2 = useMemo(
    () => (qualityValue == null ? null : computeQualityValue(qualityValue, QUALITY_MULTIPLIERS.normal2)),
    [qualityValue]
  );
  const epic3 = useMemo(
    () => (qualityValue == null ? null : computeQualityValue(qualityValue, QUALITY_MULTIPLIERS.epic3)),
    [qualityValue]
  );
  const epic5 = useMemo(
    () => (qualityValue == null ? null : computeQualityValue(qualityValue, QUALITY_MULTIPLIERS.epic5)),
    [qualityValue]
  );
  const legendary = useMemo(
    () => (qualityValue == null ? null : computeLegendaryQuality(qualityValue)),
    [qualityValue]
  );

  const armorMultiplier = ARMOR_TYPES.find((type) => type.key === armorType)?.multiplier ?? 0;
  const armorQuality = qualityValue == null
    ? null
    : qualityValue + (armorLegendary ? LEGENDARY_QUALITY_OFFSET : 0);
  const armorValue = armorQuality == null ? null : armorQuality * armorMultiplier;

  const weaponMultiplier = WEAPON_TYPES.find((type) => type.key === weaponType)?.multiplier ?? 0;
  const weaponQuality = qualityValue == null
    ? null
    : qualityValue + (weaponLegendary ? LEGENDARY_QUALITY_OFFSET : 0);
  const weaponBase = weaponQuality == null ? null : computeWeaponBase(weaponQuality);
  const weaponValue = weaponBase == null ? null : weaponBase * weaponMultiplier;

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h2 className={styles.title}>Max Item Stats Calculator</h2>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>Inputs</div>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Item Quality</span>
              <input
                type="number"
                inputMode="numeric"
                className={styles.input}
                placeholder="e.g., 266"
                value={itemQuality}
                onChange={(event) => setItemQuality(parseNumberInput(event.currentTarget.value))}
              />
            </label>
            <label className={styles.field}>
              <span>Level</span>
              <input
                type="number"
                inputMode="numeric"
                className={styles.input}
                placeholder="e.g., 460"
                value={level}
                onChange={(event) => setLevel(parseNumberInput(event.currentTarget.value))}
              />
            </label>
            <label className={styles.field}>
              <span>Aura</span>
              <input
                type="number"
                inputMode="numeric"
                className={styles.input}
                placeholder="e.g., 181"
                value={aura}
                onChange={(event) => setAura(parseNumberInput(event.currentTarget.value))}
              />
            </label>
            <label className={styles.field}>
              <span>Item Quality Rune %</span>
              <select
                className={styles.select}
                value={runePercent}
                onChange={(event) => setRunePercent(Number(event.currentTarget.value))}
              >
                {Array.from({ length: 6 }, (_, i) => i).map((value) => (
                  <option key={value} value={value}>{value}%</option>
                ))}
              </select>
            </label>
            <div className={styles.field}>
              <span>Theoretical Item Quality</span>
              <div className={styles.readonly}>{formatValue(theoreticalQuality, 2)}</div>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>Item Quality Stats</div>
          <div className={styles.resultsGrid}>
            <div className={styles.resultCard}>
              <div className={styles.resultLabel}>Normal Item 1 stat</div>
              <div className={styles.resultValue}>{formatValue(normal1)}</div>
            </div>
            <div className={styles.resultCard}>
              <div className={styles.resultLabel}>Normal Item 2 stat</div>
              <div className={styles.resultValue}>{formatValue(normal2)}</div>
            </div>
            <div className={styles.resultCard}>
              <div className={styles.resultLabel}>3 Stat Epic</div>
              <div className={styles.resultValue}>{formatValue(epic3)}</div>
            </div>
            <div className={styles.resultCard}>
              <div className={styles.resultLabel}>5 Stat Epic</div>
              <div className={styles.resultValue}>{formatValue(epic5)}</div>
            </div>
            <div className={styles.resultCard}>
              <div className={styles.resultLabel}>Legendary</div>
              <div className={styles.resultValue}>{formatValue(legendary)}</div>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>Armor</div>
          <div className={styles.controlsRow}>
            <label className={styles.field}>
              <span>Armor Type</span>
              <select
                className={styles.select}
                value={armorType}
                onChange={(event) => setArmorType(event.currentTarget.value as ArmorType)}
              >
                {ARMOR_TYPES.map((type) => (
                  <option key={type.key} value={type.key}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={armorLegendary}
                onChange={(event) => setArmorLegendary(event.currentTarget.checked)}
              />
              Legendary
            </label>
          </div>
          <div className={styles.resultsGrid}>
            <div className={styles.resultCard}>
              <div className={styles.resultLabel}>Max Armor</div>
              <div className={styles.resultValue}>{formatValue(armorValue)}</div>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>Average Weapon Damage</div>
          <div className={styles.controlsRow}>
            <label className={styles.field}>
              <span>Weapon Type</span>
              <select
                className={styles.select}
                value={weaponType}
                onChange={(event) => setWeaponType(event.currentTarget.value as WeaponType)}
              >
                {WEAPON_TYPES.map((type) => (
                  <option key={type.key} value={type.key}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={weaponLegendary}
                onChange={(event) => setWeaponLegendary(event.currentTarget.checked)}
              />
              Legendary
            </label>
          </div>
          <div className={styles.resultsGrid}>
            <div className={styles.resultCard}>
              <div className={styles.resultLabel}>Average Weapon DMG</div>
              <div className={styles.resultValue}>{formatValue(weaponValue)}</div>
            </div>
          </div>
        </div>

        <div className={styles.note}>
          All values represent the maximum possible results based on the selected inputs.
        </div>
      </div>
    </div>
  );
};

export default MaxItemStatsCalculator;
