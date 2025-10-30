// src/components/home/HomeSpotlight.tsx
import React from "react";
import styles from "./HomeSpotlight.module.css";

const HomeSpotlight: React.FC = () => {
  return (
    <section className={styles.card} aria-busy data-i18n-scope="home.spotlight">
      <header className={styles.header}>
        <span className={styles.title} data-i18n="home.spotlight.title">Spotlight</span>
      </header>
      <div className={styles.grid}>
        {[0,1,2].map((i) => (
          <div className={styles.tile} key={i}>
            <div className={styles.avatar} />
            <div className={styles.lines}>
              <div className={styles.lineShort} />
              <div className={styles.lineLong} />
            </div>
            <div className={styles.badge} />
          </div>
        ))}
      </div>
      <footer className={styles.footer}>
        <span className={styles.note} data-i18n="home.spotlight.placeholderNote">
          Will use toplist deltas or curated metadata/spolights later.
        </span>
      </footer>
    </section>
  );
};

export default HomeSpotlight;
