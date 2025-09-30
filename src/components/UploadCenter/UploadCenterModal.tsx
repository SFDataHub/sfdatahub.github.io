import React, { useEffect } from "react";
import { useUploadCenter } from "./UploadCenterContext";
import ImportJson from "../ImportJson/ImportJson";
import ImportCsv from "../ImportCsv/ImportCsv";
import styles from "./UploadCenterModal.module.css";

export default function UploadCenterModal() {
  const { isOpen, close, canUse, activeTab, setTab } = useUploadCenter();

  // ESC schließt Modal
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  if (!isOpen || !canUse) return null;

  return (
    <div className={styles.backdrop} onClick={close} aria-modal="true" role="dialog">
      <div className={styles.panel} onClick={(e)=>e.stopPropagation()}>
        <div className={styles.header}>
          <h3>Upload Center</h3>
          <div className={styles.tabs}>
            <button
              className={`${styles.tabBtn} ${activeTab === "json" ? styles.tabActive : ""}`}
              onClick={()=>setTab("json")}
            >JSON</button>
            <button
              className={`${styles.tabBtn} ${activeTab === "csv" ? styles.tabActive : ""}`}
              onClick={()=>setTab("csv")}
            >CSV</button>
          </div>
          <button className={styles.closeBtn} onClick={close} aria-label="Close">×</button>
        </div>

        <div className={styles.content}>
          {activeTab === "json" && <ImportJson />}
          {activeTab === "csv" && <ImportCsv />}
        </div>
      </div>
    </div>
  );
}
