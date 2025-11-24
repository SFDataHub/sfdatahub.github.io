// src/components/home/HomeHero.tsx
import React from "react";
import styles from "./HomeHero.module.css";

const HomeHero: React.FC = () => {
  return (
    <section className={styles.hero} aria-busy data-i18n-scope="home.hero">
      <div className={styles.titleLine} />
      <div className={styles.subLine} />
      <div className={styles.ctaRow}>
        <div className={styles.ctaPill} />
        <div className={styles.ctaPill} />
        <div className={styles.ctaPill} />
      </div>
    </section>
  );
};

export default HomeHero;
