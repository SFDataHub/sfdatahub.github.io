// src/components/home/HomeQuickActions.tsx
import React from "react";
import styles from "./HomeQuickActions.module.css";

const ITEMS = 6; // nur Platzhalter, Anzahl später dynamisch

const HomeQuickActions: React.FC = () => {
  return (
    <nav className={styles.wrap} aria-busy data-i18n-scope="home.quick">
      {Array.from({ length: ITEMS }).map((_, i) => (
        <div className={styles.tile} key={i}>
          <div className={styles.icon} />
          <div className={styles.label} />
        </div>
      ))}
    </nav>
  );
};

export default HomeQuickActions;
