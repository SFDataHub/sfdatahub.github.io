import React, { useMemo, useState } from "react";
import SectionHeader from "../../components/ui/shared/SectionHeader";
import { MILESTONES } from "../../data/records/milestones";
import styles from "./Records.module.css";

type SectionKey = "current" | "broken" | "milestones";

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "current", label: "Current Records" },
  { key: "broken", label: "Broken Records" },
  { key: "milestones", label: "Milestones" },
];

const PLACEHOLDERS: Record<
  Exclude<SectionKey, "milestones">,
  { title: string; description: string; hint?: string }
> = {
  current: {
    title: "Current Records",
    description: "Live records that keep evolving with every community session. We will surface the verified winners and their stats here.",
    hint: "Stay tuned for the data rollout in the next update.",
  },
  broken: {
    title: "Broken Records",
    description: "Historical benchmarks that were overtaken or retired. We keep them for reference and celebration.",
    hint: "If you have a record to archive, ping the Community team.",
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
    <section className={styles.milestoneSection} aria-label="Records milestones">
      <div className={styles.sectionHeader}>
        <p>Milestones</p>
        <h2>First-to achievements the community still celebrates</h2>
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
              {category === "all" ? "All Categories" : category}
            </button>
          ))}
        </div>
        <label className={styles.filterSelectWrapper}>
          <span className={styles.filterLabel}>Category</span>
          <select
            value={selectedCategory}
            onChange={(event) => handleCategoryChange(event.target.value)}
            className={styles.filterSelect}
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category === "all" ? "All Categories" : category}
              </option>
            ))}
          </select>
        </label>
      </div>
      {visibleMilestones.length === 0 ? (
        <p className={styles.emptyFilterMessage}>No milestones fall into this category yet.</p>
      ) : (
        <div className={styles.milestoneGrid}>
          {visibleMilestones.map((milestone) => (
            <article
              key={`${milestone.achievement}-${milestone.name}`}
              className={styles.milestoneCard}
            >
              <span className={styles.milestoneCategory}>{milestone.category}</span>
              <h3 className={styles.milestoneTitle}>{milestone.achievement}</h3>
              <div className={styles.milestoneDetails}>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Name</span>
                  <span className={styles.detailValue}>{milestone.name}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Server</span>
                  <span className={styles.detailValue}>{milestone.server}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Date</span>
                  <span className={styles.detailValue}>{milestone.date}</span>
                </div>
                {milestone.notes && <p className={styles.notes}>{milestone.notes}</p>}
                {milestone.source && (
                  <a href={milestone.source} target="_blank" rel="noreferrer" className={styles.sourceLink}>
                    Source
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

const DISCLAIMER = {
  title: "Record board",
  paragraphs: [
    "This is an unofficial collection of records achieved in Shakes and Fidget.",
    "Due to the fact that we need to verify all records the posted “days” are the days between the release of the server and the achieving of the record. Records that are obtained with a new char on an old server are not counted.",
    "If you achieved a record that you want to have listed and verified please message @aszu or @Zeraffim on Discord.",
  ],
  linkLabel: "Link to the record board:",
  linkUrl: "https://cutt.ly/2hTSpso",
};

export default function CommunityRecords() {
  const [activeSection, setActiveSection] = useState<SectionKey>("current");

  const renderSection = () => {
    if (activeSection === "milestones") {
      return <MilestoneList />;
    }

    const placeholder = PLACEHOLDERS[activeSection];
    return (
      <PlaceholderPanel
        title={placeholder.title}
        description={placeholder.description}
        hint={placeholder.hint}
      />
    );
  };

  return (
    <section className={styles.recordsPage}>
      <SectionHeader
        title="Records"
        meta="Community Hub"
        description="Current benchmarks, past triumphs and milestone-firsts from our community."
      />
      <div className={styles.infoPanel}>
        <div className={styles.infoCard}>
          <div className={styles.infoHeader}>
            <div className={styles.infoAuthor}>
              <span className={styles.authorName}>Community Data</span>
              <span className={styles.authorBadge}>APP</span>
            </div>
            <span className={styles.infoDate}>11.12.2020 14:08</span>
          </div>
          <div className={styles.infoBody}>
            <h3 className={styles.infoTitle}>{DISCLAIMER.title}</h3>
            {DISCLAIMER.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div className={styles.infoLink}>
            <span>{DISCLAIMER.linkLabel}</span>
            <a href={DISCLAIMER.linkUrl} target="_blank" rel="noreferrer">
              {DISCLAIMER.linkUrl}
            </a>
          </div>
        </div>
        <div className={styles.disclaimerCard}>
          <h3 className={styles.infoTitle}>Milestone Data</h3>
          <p>
            The milestone data is sourced from the shared “Milestones (First to)” Google Sheet and
            curated by the Community Data Stewards. If you spot missing entries or have a verified
            source, please ping the Community Hub team so we can keep the list accurate.
          </p>
        </div>
      </div>
      <div className={styles.navArea}>
        <nav className={styles.tabList} aria-label="Records navigation">
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
              {section.label}
            </button>
          ))}
        </nav>
      </div>
      <div className={styles.sectionContent}>{renderSection()}</div>
    </section>
  );
}
