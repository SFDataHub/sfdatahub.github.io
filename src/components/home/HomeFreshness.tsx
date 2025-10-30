// src/components/home/HomeFreshness.tsx
import React from "react";
import styles from "./HomeFreshness.module.css";

type Props = {
  isLoading?: boolean;
};

const HomeFreshness: React.FC<Props> = ({ isLoading = true }) => {
  return (
    <section className={styles.card} aria-busy={isLoading} data-i18n-scope="home.freshness">
      <header className={styles.header}>
        <span className={styles.title} data-i18n="home.freshness.title">Data freshness</span>
      </header>
      <div className={styles.body}>
        <div className={styles.row}>
          <div className={styles.label} data-i18n="home.freshness.lastUpdate">Last update</div>
          <div className={styles.skeletonLine} />
        </div>
        <div className={styles.row}>
          <div className={styles.label} data-i18n="home.freshness.nextUpdate">Next update</div>
          <div className={styles.skeletonLine} />
        </div>
        <div className={styles.countdown} aria-label="countdown placeholder">
          <div className={styles.skeletonPill} />
        </div>
      </div>
      <footer className={styles.footer}>
        <span className={styles.note} data-i18n="home.freshness.placeholderNote">
          Snapshot not yet available – placeholder active
        </span>
      </footer>
    </section>
  );
};

export default HomeFreshness;
