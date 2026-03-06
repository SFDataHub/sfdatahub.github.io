import React from "react";
import styles from "./LatestCommunityRecordsCard.module.css";
import { mockLatestCommunityRecords } from "./mockLatestCommunityRecords";

function formatRecordDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

const LatestCommunityRecordsCard: React.FC = () => {
  const records = [...mockLatestCommunityRecords]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);

  return (
    <section className={styles.card}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h3 className={styles.title}>Latest Community Records</h3>
          <p className={styles.subtitle}>Static preview</p>
        </div>
      </header>

      <ul className={styles.list}>
        {records.map((record) => (
          <li className={styles.bar} key={record.id}>
            <span className={styles.badge} style={{ backgroundColor: record.accentColor }} aria-hidden />

            <div className={styles.main}>
              <div className={styles.recordTitle}>{record.title}</div>
              <div className={styles.meta}>
                {record.playerName} · {record.className} · {record.server}
              </div>
            </div>

            <div className={styles.valueBlock}>
              <div className={styles.value}>{record.value}</div>
              <div className={styles.date}>{formatRecordDate(record.timestamp)}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default LatestCommunityRecordsCard;
