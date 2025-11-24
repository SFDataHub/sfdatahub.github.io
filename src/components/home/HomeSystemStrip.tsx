// src/components/home/HomeSystemStrip.tsx
import React from "react";
import styles from "./HomeSystemStrip.module.css";

const HomeSystemStrip: React.FC = () => {
  return (
    <section className={styles.strip} aria-busy data-i18n-scope="home.system">
      <div className={styles.cluster}>
        <div className={styles.pill} title="Edge/API status" />
        <div className={styles.pill} title="Firestore status" />
        <div className={styles.pill} title="CDN/assets status" />
      </div>

      <div className={styles.note}>
        <div className={styles.lineShort} />
        <div className={styles.lineTiny} />
      </div>

      <div className={styles.actions}>
        <div className={styles.btn} title="Privacy & Terms" />
        <div className={styles.btn} title="Send feedback" />
      </div>
    </section>
  );
};

export default HomeSystemStrip;
