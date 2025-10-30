// src/pages/GuideHub/Exit.tsx
import React from "react";
import styles from "./Exit.module.css"; // Die CSS-Datei für die Exit-Seite

export default function Exit() {
  return (
    <div className={styles.wrap}>
      {/* Header */}
      <div className={styles.headerBar}>
        <h2 className={styles.title}>Dungeon Pause Exit</h2>
        <span className={styles.meta}>Last updated: 28.03.2025</span>
      </div>
      <p className={styles.description}>
        Prepare for the Dungeon Pause Exit by saving some Legendary Gems before your intended exit date. This will help you avoid the effort and cost of skipping gems on the day of the exit.
      </p>

      {/* Sequence for the Exit */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Sequence for the Exit</h3>
        <ol className={styles.steps}>
          <li>Clear the Twister in its entirety and throw all the items you get into the Witches Cauldron.</li>
          <li>Clear the entirety of the Light World, throwing the Epics you gain into the Witches Cauldron. You can save some Epics in case you're unlucky in the Shadow World.</li>
          <li>Clear the Shadow World until you get stuck on enemies. Use SFTools to check your chances and equip your Companions with newly acquired Shadow World Epics. Don't insert Gems yet!</li>
          <li>Start clearing the Loop of Idols. You’ll eventually get stuck, so don’t try to clear it fully just yet.</li>
          <li>Once stuck, insert Legendary Gems into your Companions' equipment to proceed further in the Shadow World and the Loop of Idols.</li>
          <li>When you're stuck again, enter the Legendary Dungeon for a re-equip and perhaps equip some of your Companions with Legendarys.</li>
          <li>Clear what you can and are comfortable with spending, and you've successfully finished your Dungeon Pause Exit!</li>
        </ol>
      </section>

      {/* Extra Tip */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Extra Tip</h3>
        <p>
          Equip all three main stat XL-Potions (Str, Int, Dex) to boost your chances against the Loop of Idols. This will allow you to fully clear it and achieve a 100% Scrapbook. Be careful, as this will cancel your active Constitution Potion and Potion of External Life!
        </p>
      </section>
    </div>
  );
}
