// src/components/home/HomeGuidesHighlight.tsx
import React from "react";
import styles from "./HomeGuidesHighlight.module.css";

const HomeGuidesHighlight: React.FC = () => {
  return (
    <section className={styles.card} aria-busy data-i18n-scope="home.guides">
      <header className={styles.header}>
        <span className={styles.title} data-i18n="home.guides.title">Guides highlight</span>
      </header>
      <div className={styles.grid}>
        {[0,1,2].map((i) => (
          <div className={styles.tile} key={i}>
            <div className={styles.thumb} />
            <div className={styles.lines}>
              <div className={styles.lineShort} />
              <div className={styles.lineLong} />
            </div>
            <div className={styles.badge} />
          </div>
        ))}
      </div>
      <footer className={styles.footer}>
        <span className={styles.note} data-i18n="home.guides.placeholderNote">
          Guide cards will appear once the manifest is connected.
        </span>
      </footer>
    </section>
  );
};

export default HomeGuidesHighlight;
