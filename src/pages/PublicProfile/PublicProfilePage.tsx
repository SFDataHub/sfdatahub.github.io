import React from "react";
import { useParams } from "react-router-dom";
import ContentShell from "../../components/ContentShell";
import { t } from "../../i18n";
import styles from "./PublicProfilePage.module.css";

type CharacterTag = "main" | "alt" | "archive" | "event";
type AchievementTier = "bronze" | "silver" | "gold";

type PublicProfileViewModel = {
  profileUser: {
    displayName: string;
    languages: string[];
    roles: string[];
  };
  mainCharacter: {
    name: string;
    class: string;
    level: number;
    server: string;
    guildName: string;
    lastScanAt: string;
  };
  bio: string;
  showcaseCharacters: Array<{
    id: string;
    name: string;
    class: string;
    level: number;
    server: string;
    guildName: string;
    tag: CharacterTag;
    scrapbookPercent: number;
    highlightProgress: string;
  }>;
  scanStats: {
    totalScans: number;
    uniquePlayersScanned: number;
    uniqueGuildsScanned: number;
    scansLast30d: number;
    topServers: string[];
    firstScanAt: string;
  };
  recordsAndMilestones: Array<{
    id: string;
    type: "record" | "milestone";
    title: string;
    when: string;
    context: string;
  }>;
  achievements: Array<{
    id: string;
    nameKey: string;
    descriptionKey: string;
    tier: AchievementTier;
    unlockedAt?: string;
  }>;
};

const PROFILE_VIEW_MODEL: PublicProfileViewModel = {
  profileUser: {
    displayName: "Aurora Drake",
    languages: ["en", "de"],
    roles: ["guildleader", "tryhard"],
  },
  mainCharacter: {
    name: "Aurora",
    class: "Mage",
    level: 235,
    server: "S51 • Neverwinter",
    guildName: "Starfall Syndicate",
    lastScanAt: "2025-11-18T21:14:00.000Z",
  },
  bio: "Veteran guild leader focused on high-end fusion planning and experimental scrapbook routes. Available for collabs, raid clinics, and panel talks about SF scanning culture.",
  showcaseCharacters: [
    {
      id: "c1",
      name: "Aurora",
      class: "Mage",
      level: 235,
      server: "S51 • Neverwinter",
      guildName: "Starfall Syndicate",
      tag: "main",
      scrapbookPercent: 92,
      highlightProgress: "Fortress 17",
    },
    {
      id: "c2",
      name: "Stardiver",
      class: "Scout",
      level: 223,
      server: "S17 • Blackwater",
      guildName: "Vault Seven",
      tag: "alt",
      scrapbookPercent: 81,
      highlightProgress: "Dungeon 12",
    },
    {
      id: "c3",
      name: "Archivist Aria",
      class: "Warrior",
      level: 210,
      server: "S09 • Emerald Peak",
      guildName: "Heritage Keepers",
      tag: "archive",
      scrapbookPercent: 68,
      highlightProgress: "Event Trophy 24",
    },
    {
      id: "c4",
      name: "Flux Operative",
      class: "Assassin",
      level: 198,
      server: "S77 • Quantum Vale",
      guildName: "Pulse Collective",
      tag: "event",
      scrapbookPercent: 74,
      highlightProgress: "Festival Rank A",
    },
  ],
  scanStats: {
    totalScans: 1428,
    uniquePlayersScanned: 613,
    uniqueGuildsScanned: 108,
    scansLast30d: 74,
    topServers: ["S51 Neverwinter", "S17 Blackwater", "S77 Quantum Vale"],
    firstScanAt: "2022-07-12T10:00:00.000Z",
  },
  recordsAndMilestones: [
    {
      id: "r1",
      type: "record",
      title: "Fastest double fusion hand-in",
      when: "2024-05-09T00:00:00.000Z",
      context: "Guild Week • Starfall Syndicate",
    },
    {
      id: "r2",
      type: "record",
      title: "Scrapbook mentor program launched",
      when: "2023-11-14T00:00:00.000Z",
      context: "Community Scan Clinic",
    },
    {
      id: "r3",
      type: "milestone",
      title: "1000 scans uploaded",
      when: "2023-05-07T00:00:00.000Z",
      context: "SFDataHub milestone",
    },
    {
      id: "r4",
      type: "milestone",
      title: "Guest host at SF Magazine Live",
      when: "2022-10-19T00:00:00.000Z",
      context: "SFTV Stage",
    },
  ],
  achievements: [
    {
      id: "a1",
      nameKey: "achievements.legendaryScout.name",
      descriptionKey: "achievements.legendaryScout.description",
      tier: "gold",
      unlockedAt: "2024-06-21T00:00:00.000Z",
    },
    {
      id: "a2",
      nameKey: "achievements.scanCoach.name",
      descriptionKey: "achievements.scanCoach.description",
      tier: "silver",
      unlockedAt: "2023-12-02T00:00:00.000Z",
    },
    {
      id: "a3",
      nameKey: "achievements.guildPulse.name",
      descriptionKey: "achievements.guildPulse.description",
      tier: "silver",
      unlockedAt: "2023-04-17T00:00:00.000Z",
    },
    {
      id: "a4",
      nameKey: "achievements.veteranArchivist.name",
      descriptionKey: "achievements.veteranArchivist.description",
      tier: "bronze",
      unlockedAt: "2022-12-28T00:00:00.000Z",
    },
    {
      id: "a5",
      nameKey: "achievements.eventStrategist.name",
      descriptionKey: "achievements.eventStrategist.description",
      tier: "bronze",
    },
  ],
};

const DAY_IN_MS = 1000 * 60 * 60 * 24;
const ACHIEVEMENT_TIER_WEIGHT: Record<AchievementTier, number> = {
  gold: 3,
  silver: 2,
  bronze: 1,
};

function getDaysAgo(dateInput: string | number | Date): number | null {
  const value = new Date(dateInput).getTime();
  if (Number.isNaN(value)) return null;
  const diff = Date.now() - value;
  if (diff < 0) return 0;
  return Math.floor(diff / DAY_IN_MS);
}

function formatDateLabel(dateInput: string | number | Date): string {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return t("profile.public.identity.dateUnknown");
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default function PublicProfilePage() {
  const { profileId } = useParams<{ profileId: string }>();
  const vm = PROFILE_VIEW_MODEL;

  const lastScanDays = getDaysAgo(vm.mainCharacter.lastScanAt);
  const nf = new Intl.NumberFormat();

  const highlightRecords = vm.recordsAndMilestones
    .filter((entry) => entry.type === "record")
    .slice(0, 3);

  const highlightAchievements = [...vm.achievements]
    .sort((a, b) => ACHIEVEMENT_TIER_WEIGHT[b.tier] - ACHIEVEMENT_TIER_WEIGHT[a.tier])
    .slice(0, 3);

  const statsEntries = [
    {
      label: t("profile.public.stats.totalScans"),
      value: nf.format(vm.scanStats.totalScans),
    },
    {
      label: t("profile.public.stats.uniquePlayers"),
      value: nf.format(vm.scanStats.uniquePlayersScanned),
    },
    {
      label: t("profile.public.stats.uniqueGuilds"),
      value: nf.format(vm.scanStats.uniqueGuildsScanned),
    },
    {
      label: t("profile.public.stats.last30d"),
      value: nf.format(vm.scanStats.scansLast30d),
    },
  ];

  const hasScanStats = vm.scanStats.totalScans > 0;

  const lastScanText =
    lastScanDays == null
      ? t("profile.public.identity.dateUnknown")
      : lastScanDays === 0
      ? t("profile.public.identity.lastScanToday")
      : `${lastScanDays} ${t("profile.public.identity.daysAgoSuffix")}`;

  const portraitLabel = t("profile.public.identity.portraitPlaceholder");
  const topServersValue =
    vm.scanStats.topServers.length > 0
      ? vm.scanStats.topServers.join(", ")
      : t("profile.public.identity.unknownValue");

  return (
    <ContentShell
      title={t("profile.public.title")}
      subtitle={t("profile.public.subtitle")}
      centerFramed={false}
      padded
    >
      <div className={styles.page}>
        <section className={`${styles.sectionCard} ${styles.identityCard}`}>
          <div className={styles.identityGrid}>
            <div>
              <h1 className={styles.profileName}>{vm.profileUser.displayName}</h1>
              <div className={styles.identityMeta}>
                <span>
                  {t("profile.public.identity.profileIdLabel")}: {profileId ?? t("profile.public.identity.unknownValue")}
                </span>
                <span>
                  {t("profile.public.identity.lastScanLabel")}: {lastScanText}
                </span>
              </div>

              <article className={styles.mainCharacter}>
                <div className={styles.characterHeader}>
                  <div>
                    <div className={styles.metaLabel}>{t("profile.public.identity.mainCharacterLabel")}</div>
                    <div className={styles.characterTitle}>
                      {vm.mainCharacter.name}
                    </div>
                    <div className={styles.characterSubtitle}>
                      {vm.mainCharacter.class} • {t("profile.public.identity.levelShort")} {vm.mainCharacter.level}
                    </div>
                  </div>
                  <div className={styles.classIcon}>
                    {vm.mainCharacter.class.charAt(0)}
                  </div>
                </div>
                <div className={styles.metaGrid}>
                  <div>
                    <div className={styles.metaLabel}>{t("profile.public.identity.serverLabel")}</div>
                    <div className={styles.metaValue}>{vm.mainCharacter.server}</div>
                  </div>
                  <div>
                    <div className={styles.metaLabel}>{t("profile.public.identity.guildLabel")}</div>
                    <div className={styles.metaValue}>{vm.mainCharacter.guildName}</div>
                  </div>
                </div>
              </article>
            </div>

            <div className={styles.portrait}>
              {portraitLabel}
            </div>
          </div>
        </section>

        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <span>{t("profile.public.bio.title")}</span>
          </div>
          <p className={styles.bioText}>
            {vm.bio || t("profile.public.bio.empty")}
          </p>
          <div className={styles.tagGroups}>
            <div>
              <div className={styles.tagGroupLabel}>{t("profile.public.bio.languagesLabel")}</div>
              <div className={styles.tagList}>
                {vm.profileUser.languages.length > 0 ? (
                  vm.profileUser.languages.map((lang) => (
                    <span key={lang} className={styles.tag}>
                      {lang.toUpperCase()}
                    </span>
                  ))
                ) : (
                  <span className={styles.tag}>{t("profile.public.identity.unknownValue")}</span>
                )}
              </div>
            </div>
            <div>
              <div className={styles.tagGroupLabel}>{t("profile.public.bio.rolesLabel")}</div>
              <div className={styles.tagList}>
                {vm.profileUser.roles.length > 0 ? (
                  vm.profileUser.roles.map((role) => (
                    <span key={role} className={styles.tag}>
                      {t(`profile.public.roles.${role}`)}
                    </span>
                  ))
                ) : (
                  <span className={styles.tag}>{t("profile.public.identity.unknownValue")}</span>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <span>{t("profile.public.showcase.title")}</span>
            <span className={styles.sectionHint}>
              {t("profile.public.showcase.subtitle")}
            </span>
          </div>
          {vm.showcaseCharacters.length === 0 ? (
            <div className={styles.emptyState}>{t("profile.public.showcase.empty")}</div>
          ) : (
            <div className={styles.showcaseGrid}>
              {vm.showcaseCharacters.map((character) => (
                <article key={character.id} className={styles.characterCard}>
                  <div className={styles.characterCardHeader}>
                    <div>
                      <div className={styles.characterName}>{character.name}</div>
                      <div className={styles.characterMeta}>
                        <span>{character.class}</span>
                        <span>
                          {t("profile.public.identity.levelShort")} {character.level}
                        </span>
                      </div>
                    </div>
                    <span className={styles.badge}>
                      {t(`profile.public.showcase.tags.${character.tag}`)}
                    </span>
                  </div>
                  <div className={styles.characterMeta}>
                    <span>{character.server}</span>
                    <span>{character.guildName}</span>
                  </div>
                  <div className={styles.characterStats}>
                    <span>
                      {t("profile.public.showcase.scrapbookLabel")} {character.scrapbookPercent}%
                    </span>
                    <span>
                      {t("profile.public.showcase.highlightLabel")}: {character.highlightProgress}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <span>{t("profile.public.stats.title")}</span>
          </div>
          {!hasScanStats ? (
            <div className={styles.emptyState}>{t("profile.public.stats.empty")}</div>
          ) : (
            <>
              <div className={styles.statGrid}>
                {statsEntries.map((stat) => (
                  <article key={stat.label} className={styles.statTile}>
                    <div className={styles.statLabel}>{stat.label}</div>
                    <div className={styles.statValue}>{stat.value}</div>
                  </article>
                ))}
              </div>
              <div className={styles.statSubtext}>
                {t("profile.public.stats.topServersLabel")}: {topServersValue}
              </div>
              <div className={styles.statSubtext}>
                {t("profile.public.stats.firstScanLabel")}: {formatDateLabel(vm.scanStats.firstScanAt)}
              </div>
            </>
          )}
        </section>

        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <span>{t("profile.public.records.title")}</span>
          </div>
          {vm.recordsAndMilestones.length === 0 ? (
            <div className={styles.emptyState}>{t("profile.public.records.empty")}</div>
          ) : (
            <>
              {highlightRecords.length > 0 && (
                <div className={styles.recordsHighlights}>
                  {highlightRecords.map((record) => (
                    <article key={record.id} className={styles.highlightCard}>
                      <div className={styles.recordType}>
                        {t(`profile.public.records.type.${record.type}`)}
                      </div>
                      <div className={styles.recordTitle}>{record.title}</div>
                      <div className={styles.timelineMeta}>
                        {formatDateLabel(record.when)} • {record.context}
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <ul className={styles.timeline}>
                {vm.recordsAndMilestones.map((entry) => (
                  <li key={entry.id} className={styles.timelineItem}>
                    <div className={styles.timelineBullet} />
                    <div className={styles.timelineContent}>
                      <div className={styles.timelineTitle}>{entry.title}</div>
                      <div className={styles.timelineMeta}>
                        {formatDateLabel(entry.when)} • {entry.context}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <span>{t("profile.public.achievements.title")}</span>
            {vm.achievements.length > 0 && (
              <span className={styles.sectionHint}>
                {t("profile.public.achievements.highlights")}
              </span>
            )}
          </div>
          {vm.achievements.length === 0 ? (
            <div className={styles.emptyState}>{t("profile.public.achievements.empty")}</div>
          ) : (
            <>
              {highlightAchievements.length > 0 && (
                <div className={styles.achievementsHighlights}>
                  {highlightAchievements.map((achievement) => (
                    <article key={achievement.id} className={styles.achievementCard}>
                      <div
                        className={[
                          styles.achievementIcon,
                          achievement.tier === "gold"
                            ? styles.tierGold
                            : achievement.tier === "silver"
                            ? styles.tierSilver
                            : styles.tierBronze,
                        ].join(" ")}
                      >
                        {achievement.tier.charAt(0).toUpperCase()}
                      </div>
                      <div className={styles.achievementTier}>
                        {t(`profile.public.achievements.tiers.${achievement.tier}`)}
                      </div>
                      <div className={styles.achievementName}>
                        {t(achievement.nameKey)}
                      </div>
                      <div className={styles.achievementDesc}>
                        {t(achievement.descriptionKey)}
                      </div>
                      {achievement.unlockedAt && (
                        <div className={styles.achievementDate}>
                          {formatDateLabel(achievement.unlockedAt)}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
              <div className={styles.achievementsGrid}>
                {vm.achievements.map((achievement) => (
                  <article key={achievement.id} className={styles.achievementBadge}>
                    <div
                      className={[
                        styles.achievementIcon,
                        achievement.tier === "gold"
                          ? styles.tierGold
                          : achievement.tier === "silver"
                          ? styles.tierSilver
                          : styles.tierBronze,
                      ].join(" ")}
                    >
                      {achievement.tier.charAt(0).toUpperCase()}
                    </div>
                    <div className={styles.achievementName}>
                      {t(achievement.nameKey)}
                    </div>
                    <div className={styles.achievementDesc}>
                      {t(achievement.descriptionKey)}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </ContentShell>
  );
}
