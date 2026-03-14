import React from "react";
import styles from "./UploadCenterModal.module.css";
import { useUploadCenter } from "./UploadCenterContext";
import UploadCenterV2JsonImport from "./UploadCenterV2JsonImport";

export default function UploadCenterModal() {
  const { isOpen, close, canUse } = useUploadCenter();

  if (!isOpen || !canUse) return null;

  return (
    <div className={styles.backdrop} onClick={close}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div style={{ fontWeight: 600 }}>Upload Center</div>
          <button type="button" className={styles.closeBtn} onClick={close}>
            Close
          </button>
        </div>

        <div className={styles.content}>
          <UploadCenterV2JsonImport />
        </div>
      </div>
    </div>
  );
}
