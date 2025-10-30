// src/components/home/HomeKPIs.tsx
import React from "react";
import styles from "./HomeKPIs.module.css";

const KPI_PLACEHOLDERS = 6;

const HomeKPIs: React.FC = () => {
  return (
    <section className={styles.card} aria-busy data-i18n-scope="home.kpis">
      <header className={styles.header}>
        <span className={styles.title} data-i18n="home.kpis.title">Key metrics</span>
      </header>
      <div className={styles.grid}>
        {Array.from({ length: KPI_PLACEHOLDERS }).map((_, i) => (
          <div className={styles.kpi} key={i}>
            <div className={styles.kpiLabel} />
            <div className={styles.kpiValue} />
          </div>
        ))}
      </div>
      <footer className={styles.footer}>
        <span className={styles.note} data-i18n="home.kpis.placeholderNote">
          Metrics will appear once stats_public snapshots are available.
        </span>
      </footer>
    </section>
  );
};

export default HomeKPIs;
