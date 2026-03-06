import React from "react";
import styles from "./GuildMonthlyProgressTab.module.css";

type Props = {
  exportRef: React.RefObject<HTMLDivElement>;
  exportRootId: string;
  children: React.ReactNode;
};

export default function GuildMonthlyProgressExportView({ exportRef, exportRootId, children }: Props) {
  return (
    <div
      className={styles.wrap}
      ref={exportRef}
      data-monthly-progress-export-root="true"
      data-monthly-progress-export-root-id={exportRootId}
    >
      {children}
    </div>
  );
}
