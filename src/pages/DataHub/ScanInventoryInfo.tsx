import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { useDataHubScanInventory } from "../../lib/data-hub/useDataHubScanInventory";
import styles from "./Index.module.css";

// Mount only while the disclosure is open: the hook owns and releases its work.
export default function ScanInventoryInfo({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const inventory = useDataHubScanInventory();
  const kpis = [
    { key: "available", metric: inventory.available },
    { key: "ready", metric: inventory.ready },
    { key: "personal", metric: inventory.personal },
  ];
  return (
    <section id={id} className={styles.inventory} aria-label={t("dataHubInventory.label")}>
      <div className={styles.kpiGrid} aria-live="polite" aria-atomic="true">
        {kpis.map(({ key, metric }) => (
          <div className={styles.kpi} key={key} data-inventory-kpi={key}>
            <h2 className={styles.tileTitle}>{t(`dataHubInventory.${key}`)}</h2>
            <p className={styles.kpiValue}>{metric.value === null ? "—" : metric.value.toLocaleString(i18n.language)}</p>
            <p className={styles.description}>
              {t(`dataHubInventory.${key === "personal" ? "personalStatus" : "status"}.${metric.loading ? "loading" : metric.status}`)}
            </p>
            <p className={styles.description}>{t(`dataHubInventory.${key}Hint`)}</p>
            {key === "ready" && inventory.uncheckedCandidates > 0 && (
              <p className={styles.description}>{t("dataHubInventory.unchecked", { count: inventory.uncheckedCandidates })}</p>
            )}
            {key === "ready" && inventory.failedCandidates > 0 && (
              <p className={styles.description}>{t("dataHubInventory.failedCandidates", { count: inventory.failedCandidates })}</p>
            )}
            {key === "personal" && inventory.unknownOrigins > 0 && (
              <p className={styles.description}>{t("dataHubInventory.unknownOrigins", { count: inventory.unknownOrigins })}</p>
            )}
          </div>
        ))}
      </div>
      <div className={styles.inventoryFooter}>
        <div>
          <p className={styles.description}>{t("dataHubInventory.overlap")}</p>
          {inventory.checkedAt && (
            <p className={styles.description}>
              {t(inventory.lastKnown ? "dataHubInventory.lastKnown" : "dataHubInventory.checked", {
                date: new Date(inventory.checkedAt).toLocaleString(i18n.language), years: inventory.activeYears.join(", ") || "—",
              })}
            </p>
          )}
        </div>
        <button type="button" className={styles.retry} onClick={inventory.retry}>{t("dataHubInventory.retry")}</button>
      </div>
    </section>

  );
}
