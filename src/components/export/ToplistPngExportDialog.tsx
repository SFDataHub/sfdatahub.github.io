import React from "react";
import { useTranslation } from "react-i18next";

import styles from "./ToplistPngExportDialog.module.css";

export type ToplistExportAmount = 50 | 100 | 150;

type Props = {
  isOpen: boolean;
  amount: ToplistExportAmount;
  exporting: boolean;
  onAmountChange: (value: ToplistExportAmount) => void;
  onCancel: () => void;
  onExport: () => void;
};

export default function ToplistPngExportDialog({
  isOpen,
  amount,
  exporting,
  onAmountChange,
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

  const exportDisabled = exporting;

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

        <div className={styles.body}>
          <div className={styles.controls}>
            <div className={styles.section}>
              <div className={styles.sectionLabel}>{t("toplists.exportDialog.amount", "Top amount")}</div>
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
      </div>
    </div>
  );
}
