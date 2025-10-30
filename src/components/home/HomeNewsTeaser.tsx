// src/components/home/HomeNewsTeaser.tsx
import React from "react";
import styles from "./HomeNewsTeaser.module.css";

const HomeNewsTeaser: React.FC = () => {
  return (
    <section className={styles.card} aria-busy data-i18n-scope="home.news">
      <header className={styles.header}>
        <span className={styles.title} data-i18n="home.news.title">Community news</span>
      </header>
      <div className={styles.list}>
        {[0,1,2,3].map((i) => (
          <div className={styles.item} key={i}>
            <div className={styles.dot} />
            <div className={styles.lineWide} />
          </div>
        ))}
      </div>
      <footer className={styles.footer}>
        <span className={styles.note} data-i18n="home.news.placeholderNote">
          Public headlines will appear here once the feed is connected.
        </span>
      </footer>
    </section>
  );
};

export default HomeNewsTeaser;
