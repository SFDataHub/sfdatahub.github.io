import React from "react";
import ContentShell from "../../components/ContentShell";
import RecordBadge from "../../components/ui/shared/RecordBadge";
import SpecialAvatarArtwork from "../../components/ui/shared/SpecialAvatarArtwork";
import type {
  RecordBadgeConcept,
  RecordBadgeFamily,
  RecordBadgeScope,
  RecordBadgeScopeMode,
  RecordBadgeSize,
} from "../../components/ui/shared/RecordBadge";
import {
  Castle,
  CircleGauge,
  Hammer,
  Pickaxe,
  Radar,
  Skull,
  Tornado,
  Users,
  Wind,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import styles from "./RecordBadgesPage.module.css";

type PreviewRecord = {
  id: string;
  label: string;
  family: RecordBadgeFamily;
  scope: RecordBadgeScope;
  token: string;
  icon: LucideIcon;
  value?: string;
  marker: string;
  artwork?: () => React.ReactNode;
};

const RECORDS: PreviewRecord[] = [
  {
    id: "level-600-overall",
    label: "Level 600",
    family: "level",
    scope: { type: "overall" },
    token: "level600",
    icon: CircleGauge,
    value: "600",
    marker: "LVL",
  },
  {
    id: "avg-guild-level",
    label: "Average Guild Level 300",
    family: "guild",
    scope: { type: "overall" },
    token: "averageguildlevel",
    icon: Users,
    value: "AVG 300",
    marker: "GLD",
  },
  { id: "mine", label: "Mine", family: "mine", scope: { type: "overall" }, token: "mine", icon: Pickaxe, marker: "MIN" },
  { id: "fortress", label: "Fortress", family: "fortress", scope: { type: "overall" }, token: "fortress", icon: Castle, marker: "FRT" },
  { id: "demon-portal", label: "Demon Portal", family: "demonPortal", scope: { type: "overall" }, token: "demonportal", icon: Skull, marker: "DPT" },
  { id: "twister", label: "Twister", family: "twister", scope: { type: "overall" }, token: "twister", icon: Tornado, marker: "TWI" },
  { id: "sandstorm", label: "Sandstorm", family: "sandstorm", scope: { type: "overall" }, token: "sandstorm", icon: Wind, marker: "SAN" },
  {
    id: "mozone",
    label: "Mozone",
    family: "mozone",
    scope: { type: "overall" },
    token: "mozone",
    icon: Radar,
    marker: "MOZ",
    artwork: () => <SpecialAvatarArtwork special={287} label="Mozone Special Avatar" fallbackIcon={Radar} />,
  },
  {
    id: "jack-hammer",
    label: "Jack the Hammer",
    family: "boss",
    scope: { type: "overall" },
    token: "jackthehammer",
    icon: Hammer,
    marker: "JTH",
  },
];

const CLASS_RECORDS: PreviewRecord[] = [
  {
    id: "level-600-mage",
    label: "Level 600",
    family: "class",
    scope: { type: "class", classId: "Mage" },
    token: "level600",
    icon: CircleGauge,
    value: "600",
    marker: "MAG",
  },
  {
    id: "class-battlemage",
    label: "Twister Battlemage",
    family: "class",
    scope: { type: "class", classId: "Battlemage" },
    token: "twister",
    icon: Tornado,
    value: "TWI",
    marker: "BTM",
  },
  {
    id: "class-druid",
    label: "Mozone Druid",
    family: "class",
    scope: { type: "class", classId: "Druid" },
    token: "mozone",
    icon: Radar,
    value: "30",
    marker: "DRU",
  },
];

const CONCEPTS: Array<{ id: RecordBadgeConcept; title: string; description: string }> = [
  {
    id: "medallion",
    title: "A. Medallion",
    description: "Achievement shape with strong rim, centered symbol and a compact value dock.",
  },
  {
    id: "emblem",
    title: "B. Emblem",
    description: "Family motif moves into the frame and background while keeping one record-series language.",
  },
  {
    id: "card",
    title: "C. Record Card Badge",
    description: "Compact DataHub tile with a record marker, main symbol and reserved value slot.",
  },
];

const SIZES: RecordBadgeSize[] = ["compact", "large"];

function PreviewBadge({
  record,
  concept,
  size,
  scopeMode,
}: {
  record: PreviewRecord;
  concept: RecordBadgeConcept;
  size: RecordBadgeSize;
  scopeMode?: RecordBadgeScopeMode;
}) {
  const artwork = record.artwork?.();
  return <RecordBadge {...record} artwork={artwork} concept={concept} size={size} scopeMode={scopeMode} />;
}

function ConceptSection({ concept }: { concept: (typeof CONCEPTS)[number] }) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <div>
          <h3 className={styles.sectionTitle}>{concept.title}</h3>
          <p className={styles.sectionDescription}>{concept.description}</p>
        </div>
      </header>

      <div className={styles.sizeRows}>
        {SIZES.map((size) => (
          <div key={`${concept.id}-${size}`} className={styles.sizeRow}>
            <div className={styles.sizeLabel}>{size}</div>
            <div className={styles.badgeGrid}>
              {RECORDS.map((record) => (
                <PreviewBadge key={`${concept.id}-${size}-${record.id}`} record={record} concept={concept.id} size={size} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function RecordBadgesPage() {
  return (
    <ContentShell
      title="Record Badges"
      subtitle="Playground-only concepts for complete record badges with values, family motifs and class icons."
      centerFramed
    >
      <div className={styles.page}>
        <section className={styles.introPanel}>
          <div>
            <h2 className={styles.pageTitle}>Record Badge Concepts</h2>
            <p className={styles.pageCopy}>
              Prototype matrix for comparing compact and large badge treatments before changing Community Records.
            </p>
          </div>
          <div className={styles.legend}>
            <span>Compact</span>
            <span>Large</span>
            <span>Value slot</span>
            <span>Family motif</span>
          </div>
        </section>

        {CONCEPTS.map((concept) => (
          <ConceptSection key={concept.id} concept={concept} />
        ))}

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>Class Records</h3>
              <p className={styles.sectionDescription}>
                Explicit class scopes tested with existing project class assets as the main badge symbol and as an integrated support symbol.
              </p>
            </div>
          </header>

          <div className={styles.classPreviewGrid}>
            <div className={styles.classModePanel}>
              <h4 className={styles.classModeTitle}>Dominant class icon</h4>
              <div className={styles.badgeGrid}>
                {CLASS_RECORDS.map((record) => (
                  <PreviewBadge key={`class-dominant-${record.id}`} record={record} concept="medallion" size="large" scopeMode="dominant" />
                ))}
              </div>
            </div>

            <div className={styles.classModePanel}>
              <h4 className={styles.classModeTitle}>Integrated class icon</h4>
              <div className={styles.badgeGrid}>
                {CLASS_RECORDS.map((record) => (
                  <PreviewBadge key={`class-integrated-${record.id}`} record={record} concept="emblem" size="large" scopeMode="integrated" />
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </ContentShell>
  );
}
