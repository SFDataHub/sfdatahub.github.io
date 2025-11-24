import React from "react";
import { useSearchParams } from "react-router-dom";
import { guideAssetUrlByKey } from "../../../../data/guidehub/assets";
import styles from "./FirstWeekendGuide.module.css";

const FirstWeekendGuide: React.FC = () => {
  const [params, setParams] = useSearchParams();

  // Platzhalter – ersetze die Keys im Assets-Manifest bei Bedarf
  const imageUrls = [
    guideAssetUrlByKey("first-weekend-guide-day1", 900),
    guideAssetUrlByKey("first-weekend-guide-day2", 900),
    guideAssetUrlByKey("first-weekend-guide-day3", 900),
  ];

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>First Weekend Guide</h1>

      {/* === STICKY INFO BOX (permanent sichtbar) === */}
      <aside className={styles.infoBox} role="note" aria-label="Important Level Tips">
        <div className={styles.infoTitle}>Important Level Tips</div>
        <ul className={styles.infoList}>
          <li>
            <strong>Level 15</strong> – Medium Potions and Talisman are unlocked, buy them before pushing further.
          </li>
          <li>
            <strong>Level 25</strong> – Don’t upgrade Gem Mine past Level 1! Ignore all defensive buildings until fully maxing every other building.
          </li>
          <li>
            <strong>Level 25</strong> – If you have ambitions to push further on day 1, wait to search for Gems until late into the evening for better Guild HoK and easy Gold gain due to Wheel Spins.
          </li>
          <li>
            <strong>Level 32–35</strong> – Big Potions get unlocked; at Level 32 the chance is very slim but be on the lookout to equip them as soon as possible.
          </li>
          <li>
            <strong>Level 75</strong> – Wait with the Pet habitat fights! Use them when you are fully stuck on a Dungeon enemy to skip a few Levels and get better equipment from the Shops.
          </li>
          <li>
            <strong>Level 105</strong> – If you are fully stuck on the Killing Machine in the Frost Blood Temple, you can upgrade your Gem Mine to Level 5 and equip yourself with stronger Gems.
          </li>
          <li>
            <strong>Level 140</strong> – If you are a bad PvE Class, be sure to check in SF Tools if it’s beneficial to run a Dexterity Potion instead of your Main stat Potion for Shadow World fights.
          </li>
        </ul>
      </aside>

      {/* Intro */}
      <p className={styles.intro}>
        Follow these steps to get started with the game and make the most of your first weekend.
      </p>

      {/* Inhalt – bereits bestehender Seitencontent */}
      <div className={styles.section}>
        <h2 className={styles.h2}>Preparation before launch</h2>
        <ul className={styles.ul}>
          <li>Pre-register your account early to start collecting Twitch drops.</li>
          <li>
            Collect drops a few weeks before the server opens, but only grab the ones that expire soon
            (7 days after the Droppy Cycle ends). Save rewards like stone/wood packages until your fortress is built up.
          </li>
          <li>Pre-purchase the Starter Pack to avoid transaction issues at server launch.</li>
          <li>On day 1 and 2, your main limitation is the 300 thirst, so use it wisely.</li>
          <li>
            Heavy shroomer level goals: level 69 (day 1), level 90–125 (day 2; class dependent), level 200–210 (day 3; esp. if Underworld is unlocked).
          </li>
        </ul>
      </div>

      <div className={styles.section}>
        <h2 className={styles.h2}>Day 1</h2>
        <h3 className={styles.h3}>Level 1–3</h3>
        <ul className={styles.ul}>
          <li>
            Join any guild, sell your Starter Pack potion for 100 gold, upgrade guild skills to 6 Instructor and 4 Treasure.
          </li>
          <li>
            Unlock Training Dungeon and fight first enemies to reach level 3 (bugged reset to enemy 1 can push to level 4).
          </li>
        </ul>
        {imageUrls[0] && <img className={styles.img} src={imageUrls[0]} alt="Day 1 overview" />}
      </div>

      <div className={styles.section}>
        <h3 className={styles.h3}>Level 4–10</h3>
        <ul className={styles.ul}>
          <li>When the guild is full and skills are 6/4, start short expeditions (stick to short ones on day 1).</li>
          <li>Continue expeditions until level 10 (unlocks Scrapbook).</li>
          <li>Log in on phone for “Second Screen” (+5 to all stats).</li>
          <li>Buy gear in Weapon & Magic shops; small potions as needed; ignore talisman slot until level 15+.</li>
          <li>Start HoF farming for stickers and a bit of gold to fill Scrapbook to 20–25% (30%+ for shroomers).</li>
        </ul>
      </div>

      <div className={styles.section}>
        <h2 className={styles.h2}>Day 2</h2>
        <h3 className={styles.h3}>Level 10–15</h3>
        <ul className={styles.ul}>
          <li>Farm max-gold players within ±100 ranks (esp. shroomers) for easy gold & stats.</li>
          <li>Clear Tutorial Dungeon and Light World Dungeon 1 for gold and level-ups.</li>
          <li>Should bring you to level 11–13; better gold per enemy while filling Scrapbook%.</li>
          <li>Get “Rip-off Rip-off”: win 3× in a row at shell game (`/gold bet 1`).</li>
        </ul>
        {imageUrls[1] && <img className={styles.img} src={imageUrls[1]} alt="Day 2 overview" />}
      </div>

      <div className={styles.section}>
        <h2 className={styles.h2}>Day 3</h2>
        <h3 className={styles.h3}>Level 15–20</h3>
        <ul className={styles.ul}>
          <li>If stuck on dungeon enemies and Scrapbook ≥ 25%, use first-tier expeditions until level 15.</li>
          <li>At level 15, talismans and medium potions unlock in Magic Shop.</li>
        </ul>
        {imageUrls[2] && <img className={styles.img} src={imageUrls[2]} alt="Day 3 overview" />}
      </div>
    </div>
  );
};

export default FirstWeekendGuide;
