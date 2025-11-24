import React from "react";
import styles from "./UploadCenterModal.module.css";
import { useUploadCenter } from "./UploadCenterContext";

// CSV-Importer (deine bestehende Komponente)
import ImportCsv from "../ImportCsv/ImportCsv";

// Schlichter Platzhalter für den JSON-Tab (kein Import/Logik)
function JsonPlaceholder() {
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>JSON Import (bald verfügbar)</h3>
      <p>
        Dieser Tab bleibt als Platzhalter erhalten. Der frühere JSON-Importer ist absichtlich
        entfernt/deaktiviert. Nutze bitte den <strong>CSV</strong>-Tab.
      </p>
    </div>
  );
}

export default function UploadCenterModal() {
  const { isOpen, close, activeTab, setTab, canUse } = useUploadCenter();

  if (!isOpen || !canUse) return null;

  return (
    <div className={styles.backdrop} onClick={close}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div style={{ fontWeight: 600 }}>Upload Center</div>

          {/* Tabs */}
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "csv" ? styles.tabActive : ""}`}
              onClick={() => setTab("csv")}
            >
              CSV
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "json" ? styles.tabActive : ""}`}
              onClick={() => setTab("json")}
              title="Platzhalter – keine Importfunktion"
            >
              JSON
            </button>
          </div>

          <button type="button" className={styles.closeBtn} onClick={close}>
            Schließen
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {activeTab === "csv" ? <ImportCsv /> : <JsonPlaceholder />}
        </div>
      </div>
    </div>
  );
}
