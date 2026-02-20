import React from "react";
import { useTranslation } from "react-i18next";

import styles from "./ToplistPngExportDialog.module.css";

export type ToplistExportAmount = 50 | 100 | 150;
export type ToplistExportSelection = "current" | "guilds";

type Props = {
  isOpen: boolean;
  amount: ToplistExportAmount;
  selection: ToplistExportSelection;
  guildOptions: string[];
  selectedGuilds: string[];
  availableCount: number;
  rangeEnabled: boolean;
  rangeFrom: number;
  rangeTo: number;
  exporting: boolean;
  onAmountChange: (value: ToplistExportAmount) => void;
  onSelectionChange: (value: ToplistExportSelection) => void;
  onToggleGuild: (guild: string) => void;
  onRangeEnabledChange: (enabled: boolean) => void;
  onRangeFromChange: (value: number) => void;
  onRangeToChange: (value: number) => void;
  onCancel: () => void;
  onExport: () => void;
};

export default function ToplistPngExportDialog({
  isOpen,
  amount,
  selection,
  guildOptions,
  selectedGuilds,
  availableCount,
  rangeEnabled,
  rangeFrom,
  rangeTo,
  exporting,
  onAmountChange,
  onSelectionChange,
  onToggleGuild,
  onRangeEnabledChange,
  onRangeFromChange,
  onRangeToChange,
  onCancel,
  onExport,
}: Props) {
  const { t } = useTranslation();

  React.useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const selectedGuildSummary = selectedGuilds.length
    ? t("toplists.exportDialog.guildsSummary", "Guilds: {{list}}", {
        list: selectedGuilds.join(", "),
      })
    : t("toplists.exportDialog.guildsPlaceholder", "Guilds: none selected");
  const exportDisabled = exporting || availableCount <= 0;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={t("toplists.exportDialog.title", "Export PNG")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className={styles.panel}>
        <h3 className={styles.title}>{t("toplists.exportDialog.title", "Export PNG")}</h3>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>{t("toplists.exportDialog.amount", "Amount")}</div>
          <div className={styles.chipRow}>
            {[50, 100, 150].map((value) => {
              const selected = amount === value;
              return (
                <button
                  key={value}
                  type="button"
                  className={`${styles.chip} ${selected ? styles.chipActive : ""}`}
                  onClick={() => onAmountChange(value as ToplistExportAmount)}
                  aria-pressed={selected}
                >
                  Top {value}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>{t("toplists.exportDialog.range.title", "Rank range")}</div>
          <label className={styles.rangeToggle}>
            <input
              type="checkbox"
              checked={rangeEnabled}
              onChange={(event) => onRangeEnabledChange(event.target.checked)}
            />
            <span>{t("toplists.exportDialog.range.enable", "Use rank range")}</span>
          </label>
          {rangeEnabled && (
            <>
              <div className={styles.rangeInputs}>
                <label className={styles.rangeField}>
                  <span>{t("toplists.exportDialog.range.from", "From")}</span>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, availableCount)}
                    value={rangeFrom}
                    onChange={(event) => onRangeFromChange(Number(event.target.value))}
                    className={styles.rangeInput}
                    disabled={availableCount <= 0}
                  />
                </label>
                <label className={styles.rangeField}>
                  <span>{t("toplists.exportDialog.range.to", "To")}</span>
                  <input
                    type="number"
                    min={rangeFrom}
                    max={Math.max(1, availableCount)}
                    value={rangeTo}
                    onChange={(event) => onRangeToChange(Number(event.target.value))}
                    className={styles.rangeInput}
                    disabled={availableCount <= 0}
                  />
                </label>
              </div>
              <div className={styles.helper}>
                {t("toplists.exportDialog.range.max", "Max: {{count}}", { count: availableCount })}
              </div>
              <div className={styles.helper}>
                {t("toplists.exportDialog.range.oneBased", "Ranks are 1-based")}
              </div>
            </>
          )}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>{t("toplists.exportDialog.selection", "Selection")}</div>
          <div className={styles.chipRow}>
            <button
              type="button"
              className={`${styles.chip} ${selection === "current" ? styles.chipActive : ""}`}
              onClick={() => onSelectionChange("current")}
              aria-pressed={selection === "current"}
            >
              {t("toplists.exportDialog.currentView", "Current view")}
            </button>
            <button
              type="button"
              className={`${styles.chip} ${selection === "guilds" ? styles.chipActive : ""}`}
              onClick={() => onSelectionChange("guilds")}
              aria-pressed={selection === "guilds"}
            >
              {t("toplists.exportDialog.guilds", "Guilds")}
            </button>
          </div>
        </div>

        <div className={styles.section}>
          <details className={styles.guildSelect} open={selection === "guilds"}>
            <summary className={styles.guildSummary}>{selectedGuildSummary}</summary>
            <div className={styles.guildList}>
              {guildOptions.length ? (
                guildOptions.map((guild) => (
                  <label key={guild} className={styles.guildOption}>
                    <input
                      type="checkbox"
                      checked={selectedGuilds.includes(guild)}
                      onChange={() => onToggleGuild(guild)}
                      disabled={selection !== "guilds"}
                    />
                    <span>{guild}</span>
                  </label>
                ))
              ) : (
                <div className={styles.empty}>
                  {t("toplists.exportDialog.guildsEmpty", "No guilds available")}
                </div>
              )}
            </div>
          </details>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.btn} onClick={onCancel} disabled={exporting}>
            {t("toplists.exportDialog.cancel", "Cancel")}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onExport}
            disabled={exportDisabled}
          >
            {exporting
              ? t("toplists.exportDialog.exporting", "Exporting...")
              : t("toplists.exportDialog.export", "Export")}
          </button>
        </div>
      </div>
    </div>
  );
}
