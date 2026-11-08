import { useTranslation } from "react-i18next";
import styles from "./filters.module.css";

type CompareMode = "off" | "progress" | "months";
export type CompareControlsProps = {
  compareMode: CompareMode;
  onCompareModeChange: (mode: CompareMode) => void;
  progressSinceMonth: string;
  onProgressSinceMonthChange: (v: string) => void;
  compareFromMonth: string;
  onCompareFromMonthChange: (v: string) => void;
  compareToMonth: string;
  onCompareToMonthChange: (v: string) => void;
  monthOptions: string[];
  localDropdown?: boolean;
};

export default function CompareControls({ compareMode, onCompareModeChange, progressSinceMonth,
  onProgressSinceMonthChange, compareFromMonth, onCompareFromMonthChange, compareToMonth,
  onCompareToMonthChange, monthOptions, localDropdown = false }: CompareControlsProps) {
  const { t } = useTranslation();
  return (
      <div className={styles.compareBlock}>
        <span className={styles.compareBlockTitle}>{t("toplists.compareMode", "Compare Mode")}</span>
        <div className={styles.segmented} role="group" aria-label={t("toplists.compareMode", "Compare Mode")}>
          {!localDropdown && <button type="button" aria-pressed={compareMode === "off"} onClick={() => onCompareModeChange("off")}>
            {t("toplists.compareOff", "Off")}
          </button>}
          <button
            type="button"
            aria-pressed={(compareMode === "progress" || (localDropdown && compareMode === "off"))}
            onClick={() => onCompareModeChange("progress")}
          >
            {t("toplists.compareMonth", "Progress since")}
          </button>
          <button type="button" aria-pressed={compareMode === "months"} onClick={() => onCompareModeChange("months")}>
            {t("toplists.compareMonths", "Compare months")}
          </button>
        </div>

        {(compareMode === "progress" || (localDropdown && compareMode === "off")) && (
          <div className={styles.compareInputsRow}>
            <label className={styles.compareField} htmlFor="toplists-compare-progress">
              <span className={styles.guildLabel}>{t("toplists.compareMonth", "Progress since")}</span>
              <select
                id="toplists-compare-progress"
                name="toplists-compare-progress"
                value={localDropdown && compareMode === "off" ? "" : progressSinceMonth}
                onChange={(e) => onProgressSinceMonthChange(e.target.value)}
                className={styles.sortSelect}
                aria-label={t("toplists.compareMonth", "Progress since")}
              >
                <option value="">{t("toplists.compareOff", "Off")}</option>
                {monthOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {compareMode === "months" && (
          <div className={styles.compareInputsRow}>
            <label className={styles.compareField} htmlFor="toplists-compare-from">
              <span className={styles.guildLabel}>{t("toplists.compareFrom", "From")}</span>
              <select
                id="toplists-compare-from"
                name="toplists-compare-from"
                value={compareFromMonth}
                disabled={monthOptions.length < 2}
                onChange={(e) => onCompareFromMonthChange(e.target.value)}
                className={styles.sortSelect}
                aria-label={t("toplists.compareFrom", "From")}
              >
                {!compareFromMonth && <option value="">—</option>}
                {monthOptions.map((opt) => (
                  <option key={`from-${opt}`} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.compareField} htmlFor="toplists-compare-to">
              <span className={styles.guildLabel}>{t("toplists.compareTo", "To")}</span>
              <select
                id="toplists-compare-to"
                name="toplists-compare-to"
                value={compareToMonth}
                disabled={monthOptions.length < 2}
                onChange={(e) => onCompareToMonthChange(e.target.value)}
                className={styles.sortSelect}
                aria-label={t("toplists.compareTo", "To")}
              >
                {!compareToMonth && <option value="">—</option>}
                {monthOptions.map((opt) => (
                  <option key={`to-${opt}`} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>
  );
}
