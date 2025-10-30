// src/components/home/HomeToplistsPreview.tsx
import React from "react";
import styles from "./HomeToplistsPreview.module.css";

const ROWS = 6;

const HomeToplistsPreview: React.FC = () => {
  return (
    <section className={styles.card} aria-busy data-i18n-scope="home.toplists">
      <header className={styles.header}>
        <span className={styles.title} data-i18n="home.toplists.title">Toplists preview</span>
        <div className={styles.tabBar} role="tablist" aria-label="Toplists tabs">
          <div className={styles.tabSkeleton} role="tab" aria-selected="true" />
          <div className={styles.tabSkeleton} role="tab" />
          <div className={styles.tabSkeleton} role="tab" />
        </div>
      </header>

      <div className={styles.table}>
        <div className={styles.thead}>
          <div className={styles.th} style={{width: 48}} />
          <div className={styles.th} />
          <div className={styles.th} />
          <div className={styles.th} />
        </div>
        <div className={styles.tbody}>
          {Array.from({ length: ROWS }).map((_, i) => (
            <div className={styles.tr} key={i}>
              <div className={styles.tdRank} />
              <div className={styles.tdWide} />
              <div className={styles.td} />
              <div className={styles.tdDelta} />
            </div>
          ))}
        </div>
      </div>

      <footer className={styles.footer}>
        <span className={styles.note} data-i18n="home.toplists.placeholderNote">
          Preview will populate from stats_public once available.
        </span>
      </footer>
    </section>
  );
};

export default HomeToplistsPreview;
