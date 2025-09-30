import React, { useEffect } from "react";
import { useUploadCenter } from "./UploadCenterContext";
import ImportJson from "../ImportJson/ImportJson";
import styles from "./UploadCenterModal.module.css";

export default function UploadCenterModal() {
  const { isOpen, close, canUse } = useUploadCenter();

  // ESC schließt Modal
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  if (!isOpen) return null;

  // Fallback wenn jemand ohne Rolle das Modal irgendwie öffnet
  if (!canUse) return null;

  return (
    <div className={styles.backdrop} onClick={close} aria-modal="true" role="dialog">
      <div className={styles.panel} onClick={(e)=>e.stopPropagation()}>
        <div className={styles.header}>
          <h3>Upload Center</h3>
          <button className={styles.closeBtn} onClick={close} aria-label="Close">×</button>
        </div>

        {/* Tabs wären hier möglich – aktuell nur JSON */}
        <div className={styles.content}>
          <ImportJson />
        </div>
      </div>
    </div>
  );
}
