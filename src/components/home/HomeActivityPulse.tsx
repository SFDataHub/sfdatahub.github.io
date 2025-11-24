// src/components/home/HomeActivityPulse.tsx
import React from "react";
import styles from "./HomeActivityPulse.module.css";

const HomeActivityPulse: React.FC = () => {
  return (
    <section className={styles.card} aria-busy data-i18n-scope="home.activity">
      <header className={styles.header}>
        <span className={styles.title} data-i18n="home.activity.title">Activity pulse (7d)</span>
      </header>
      <div className={styles.chart}>
        {Array.from({ length: 14 }).map((_, i) => (
          <div className={styles.bar} key={i} style={{ height: `${30 + ((i*13)%60)}px` }} />
        ))}
      </div>
      <footer className={styles.footer}>
        <span className={styles.note} data-i18n="home.activity.placeholderNote">
          Chart will render real values once snapshots exist.
        </span>
      </footer>
    </section>
  );
};

export default HomeActivityPulse;
