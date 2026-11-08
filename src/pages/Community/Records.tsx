import { hubDate, hubNumber, hubText } from "../../lib/i18n/dataHubPresentation";
import { profileClassLabel } from "../../lib/i18n/profilePresentation";
import { useTranslation } from "react-i18next";
import React, { useMemo, useState } from "react";
import SectionHeader from "../../components/ui/shared/SectionHeader";
import { CURRENT_RECORDS } from "../../data/records/current";
import { MILESTONES } from "../../data/records/milestones";
import { recordsAssetThumbByKey } from "../../data/records/manifest";
import styles from "./Records.module.css";

type SectionKey = "current" | "broken" | "milestones";

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "current", label: "communityRecords.currentRecords" },
  { key: "broken", label: "communityRecords.brokenRecords" },
  { key: "milestones", label: "communityRecords.milestones" },
];

const PLACEHOLDERS: Record<
  Exclude<SectionKey, "milestones">,
  { title: string; description: string; hint?: string }
> = {
  current: {
    title: "communityRecords.currentRecords",
    description: "communityRecords.liveRecordsThatKeepEvolvingWithEveryCommunitySessionWeWillSurfaceTheVerifiedWinnersAndTheirStatsHere",
    hint: "communityRecords.stayTunedForTheDataRolloutInTheNextUpdate",
  },
  broken: {
    title: "communityRecords.brokenRecords",
    description: "communityRecords.historicalBenchmarksThatWereOvertakenOrRetiredWeKeepThemForReferenceAndCelebration",
    hint: "communityRecords.ifYouHaveARecordToArchivePingTheCommunityTeam",
  },
};

const PlaceholderPanel: React.FC<{ title: string; description: string; hint?: string }> = ({
  title,
  description,
  hint,
}) => (
  <article className={styles.placeholderPanel}>
    <h2 className={styles.placeholderTitle}>{title}</h2>
    <p className={styles.placeholderText}>{description}</p>
    {hint && <p className={styles.emptyState}>{hint}</p>}
  </article>
);

const MilestoneList: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const milestone of MILESTONES) {
      if (!seen.has(milestone.category)) {
        seen.add(milestone.category);
        list.push(milestone.category);
      }
    }
    return ["all", ...list];
  }, []);

  const visibleMilestones =
    selectedCategory === "all"
      ? MILESTONES
      : MILESTONES.filter((milestone) => milestone.category === selectedCategory);

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
  };

  return (
    <section className={styles.milestoneSection} aria-label={hubText("communityRecords.recordMilestones")}>
      <div className={styles.sectionHeader}>
        <p>{hubText("communityRecords.milestones")}</p>
        <h2>{hubText("communityRecords.firsttoAchievementsTheCommunityStillCelebrates")}</h2>
      </div>
      <div className={styles.filterBar}>
        <div className={styles.filterButtons}>
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={[
                styles.filterButton,
                selectedCategory === category && styles.filterButtonActive,
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => handleCategoryChange(category)}
              aria-pressed={selectedCategory === category}
            >
              {category === "all" ? hubText("communityRecords.allCategories") : categoryLabel(category)}
            </button>
          ))}
        </div>
        <label className={styles.filterSelectWrapper}>
          <span className={styles.filterLabel}>{hubText("communityRecords.category")}</span>
          <select
            value={selectedCategory}
            onChange={(event) => handleCategoryChange(event.target.value)}
            className={styles.filterSelect}
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category === "all" ? hubText("communityRecords.allCategories") : categoryLabel(category)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {visibleMilestones.length === 0 ? (
        <p className={styles.emptyFilterMessage}>{hubText("communityRecords.noMilestonesFallIntoThisCategoryYet")}</p>
      ) : (
        <div className={styles.milestoneGrid}>
          {visibleMilestones.map((milestone) => (
            <article
              key={`${milestone.achievement}-${milestone.name}`}
              className={styles.milestoneCard}
            >
              <span className={styles.milestoneCategory}>{categoryLabel(milestone.category)}</span>
              <h3 className={styles.milestoneTitle}>{milestone.achievement}</h3>
              <div className={styles.milestoneDetails}>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>{hubText("communityRecords.name")}</span>
                  <span className={styles.detailValue}>{milestone.name}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>{hubText("communityRecords.server")}</span>
                  <span className={styles.detailValue}>{milestone.server}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>{hubText("communityRecords.date")}</span>
                  <span className={styles.detailValue}>{recordDate(milestone.date)}</span>
                </div>
                {milestone.notes && <p className={styles.notes}>{milestone.notes}</p>}
                {milestone.source && (
                  <a href={milestone.source} target="_blank" rel="noreferrer" className={styles.sourceLink}>
                    {hubText("communityRecords.source")}
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

const CurrentRecordsList: React.FC = () => (
  <section className={styles.currentSection} aria-label={hubText("communityRecords.currentCommunityRecords")}>
    <div className={styles.sectionHeader}>
      <p>{hubText("communityRecords.currentRecords")}</p>
      <h2>{hubText("communityRecords.theLatestVerifiedAchievements")}</h2>
    </div>
    <div className={styles.currentGrid}>
      {CURRENT_RECORDS.map((record, index) => (
        <article key={`${categoryLabel(record.category)}-${record.playerName}-${index}`} className={styles.currentCard}>
          <span className={styles.categoryLabel}>{categoryLabel(record.category)}</span>
          <h3 className={styles.recordTitle}>{record.record}</h3>
          <div className={styles.currentDetails}>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>{hubText("communityRecords.class")}</span>
              <span className={styles.detailValue}>{recordClassLabel(record.classType)}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>{hubText("communityRecords.player")}</span>
              <span className={styles.detailValue}>{record.playerName}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>{hubText("communityRecords.server")}</span>
              <span className={styles.detailValue}>{record.server}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>{hubText("communityRecords.days")}</span>
              <span className={styles.detailValue}>{recordNumber(record.days)}</span>
            </div>
            {record.release && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{hubText("communityRecords.release")}</span>
                <span className={styles.detailValue}>{record.release}</span>
              </div>
            )}
            {(record.previousDays || record.previousName) && (
              <p className={styles.notes}>
                {hubText("communityRecords.previous", {
                  days: record.previousDays ? hubText("communityRecords.daysCount", { count: Number(record.previousDays) }) : "",
                  name: record.previousName ? `(${record.previousName})` : "",
                })}
              </p>
            )}
            {record.notes && <p className={styles.notes}>{record.notes}</p>}
          </div>
        </article>
      ))}
    </div>
  </section>
);

const DISCLAIMER = {
  title: "communityRecords.recordBoard",
  paragraphs: [
    "communityRecords.thisIsAnUnofficialCollectionOfRecordsAchievedInShakesAndFidget",
    "communityRecords.toVerifyRecordsDaysMeansTheTimeBetweenTheServerOpeningAndTheAchievementRecordsSetByANewCharacterOnAnOlderServerAreNotCounted",
    "communityRecords.ifYouAchievedARecordThatYouWantToHaveListedAndVerifiedPleaseMessageAszuOrZeraffimOnDiscord",
  ],
  linkLabel: "communityRecords.linkToTheRecordBoard",
  linkUrl: "https://cutt.ly/2hTSpso",
};

const categoryKeys: Record<string, string> = {
  Level: "level", Dungeon: "dungeons", Dungeons: "dungeons", "Features finished": "features",
  Guild: "guild", Stats: "stats", "Arena Manager": "arenaManager", Fortress: "fortress",
  Underworld: "underworld", IHOF: "ihof",
};
const categoryLabel = (value: string) => categoryKeys[value] ? hubText("communityRecords." + categoryKeys[value]) : value;
const recordClassAliases: Record<string, string> = { Battlemage: "battle-mage", Demonhunter: "demon-hunter" };
const recordClassLabel = (value: string) => value === "Any" || value === "Solo" || value === "Guild"
  ? hubText("communityRecords." + value.toLowerCase()) : profileClassLabel(recordClassAliases[value] ?? value);
const recordNumber = (value: string) => /^\d+$/.test(value) ? hubNumber(Number(value)) : value;
const recordDate = (value: string) => {
  const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return parts ? hubDate(new Date(Number(parts[3]), Number(parts[2]) - 1, Number(parts[1])), { day: "2-digit", month: "2-digit", year: "numeric" }) : value;
};

export default function CommunityRecords() {
  useTranslation();
  const [activeSection, setActiveSection] = useState<SectionKey>("current");
  const infoIcon = recordsAssetThumbByKey("infoCard", 32);

  const renderSection = () => {
    if (activeSection === "current") {
      return <CurrentRecordsList />;
    }
    if (activeSection === "milestones") {
      return <MilestoneList />;
    }

    const placeholder = PLACEHOLDERS[activeSection];
    return (
      <PlaceholderPanel
        title={hubText(placeholder.title)}
        description={hubText(placeholder.description)}
        hint={placeholder.hint ? hubText(placeholder.hint) : undefined}
      />
    );
  };

  return (
    <section className={styles.recordsPage}>
      <SectionHeader
        title={hubText("communityRecords.records")}
        meta={hubText("communityRecords.communityHub")}
        description={hubText("communityRecords.currentBenchmarksPastTriumphsAndMilestonefirstsFromOurCommunity")}
      />
      <div className={styles.infoPanel}>
        <div className={styles.infoCard}>
          <div className={styles.infoHeader}>
            <div className={styles.infoAuthor}>
              {infoIcon ? (
                <img src={infoIcon} alt={hubText("communityRecords.communityData")} className={styles.infoAuthorIcon} />
              ) : null}
              <span className={styles.authorName}>S&F Tavern Info</span>
              <a
                href="https://discord.gg/sftavern"
                target="_blank"
                rel="noreferrer"
                className={styles.authorBadge}
              >
                Discord
              </a>
            </div>
            <span className={styles.infoDate}>{hubDate(new Date(2020, 11, 11, 14, 8), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <div className={styles.infoBody}>
            <h3 className={styles.infoTitle}>{hubText(DISCLAIMER.title)}</h3>
            {DISCLAIMER.paragraphs.map((paragraph) => (
              <p key={paragraph}>{hubText(paragraph)}</p>
            ))}
          </div>
          <div className={styles.infoLink}>
            <span>{hubText(DISCLAIMER.linkLabel)}</span>
            <a href={DISCLAIMER.linkUrl} target="_blank" rel="noreferrer">
              {DISCLAIMER.linkUrl}
            </a>
          </div>
        </div>
        <div className={styles.disclaimerCard}>
          <h3 className={styles.infoTitle}>{hubText("communityRecords.disclaimer")}</h3>
          <p>
            {hubText("communityRecords.milestoneDataComesFromTheSharedMilestonesFirstToGoogleSheetAndIsCuratedByTheCommunityDataStewardsPleaseReportMissingEntriesOrVerifiedSourcesToTheCommunityHubTeam")}
          </p>
        </div>
      </div>
      <div className={styles.navArea}>
        <nav className={styles.tabList} aria-label={hubText("communityRecords.recordsNavigation")}>
          {SECTIONS.map((section) => (
            <button
              key={section.key}
              type="button"
              className={`${styles.tabButton} ${
                activeSection === section.key ? styles.tabButtonActive : ""
              }`}
              aria-pressed={activeSection === section.key}
              onClick={() => setActiveSection(section.key)}
            >
              {hubText(section.label)}
            </button>
          ))}
        </nav>
      </div>
      <div className={styles.sectionContent}>{renderSection()}</div>
    </section>
  );
}
