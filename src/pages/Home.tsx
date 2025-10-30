// src/pages/Home.tsx
import React from "react";
import ContentShell from "../components/ContentShell";
import styles from "./Home.module.css";

// Placeholders (vorher schon da)
import HomeFreshness from "../components/home/HomeFreshness";
import HomeKPIs from "../components/home/HomeKPIs";
import HomeToplistsPreview from "../components/home/HomeToplistsPreview";
import HomeSpotlight from "../components/home/HomeSpotlight";
import HomeActivityPulse from "../components/home/HomeActivityPulse";

// Neue Placeholders
import HomeHero from "../components/home/HomeHero";
import HomeQuickActions from "../components/home/HomeQuickActions";
import HomeNewsTeaser from "../components/home/HomeNewsTeaser";
import HomeGuidesHighlight from "../components/home/HomeGuidesHighlight";
import HomeSystemStrip from "../components/home/HomeSystemStrip"; // ✅ richtiger Name

const Home: React.FC = () => {
  return (
    <ContentShell
      titleKey="home.title"
      descriptionKey="home.description"
      lastUpdatedKey="home.lastUpdated"
    >
      {/* Row 0 – Hero */}
      <div className={styles.row}>
        <div className={styles.colFull}>
          <HomeHero />
        </div>
      </div>

      {/* Row 1 – Quick Actions */}
      <div className={styles.row}>
        <div className={styles.colFull}>
          <HomeQuickActions />
        </div>
      </div>

      {/* Row 2 – Freshness & KPIs */}
      <div className={styles.row}>
        <div className={styles.colFreshness}>
          <HomeFreshness />
        </div>
        <div className={styles.colKPIs}>
          <HomeKPIs />
        </div>
      </div>

      {/* Row 3 – Data Snapshots */}
      <div className={styles.row}>
        <div className={styles.colToplists}>
          <HomeToplistsPreview />
        </div>
        <div className={styles.colRightstack}>
          <div className={styles.stackItem}>
            <HomeSpotlight />
          </div>
          <div className={styles.stackItem}>
            <HomeActivityPulse />
          </div>
        </div>
      </div>

      {/* Row 4 – Community & Guides */}
      <div className={styles.row}>
        <div className={styles.colCommunity}>
          <HomeNewsTeaser />
        </div>
        <div className={styles.colGuides}>
          <HomeGuidesHighlight />
        </div>
      </div>

      {/* Row 5 – System & Transparenz & Feedback */}
      <div className={styles.row}>
        <div className={styles.colFull}>
          <HomeSystemStrip />
        </div>
      </div>
    </ContentShell>
  );
};

export default Home;
