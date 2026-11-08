import { profileLocale } from "../../lib/i18n/profilePresentation";
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { summarizeLocalGuildPlayerStats, type LocalGuildStatsMember } from "../../pages/GuildHub/localGuildPlayerStats";
import type { ClassSelection } from "../../data/classes";
import { selectGuildRankingClass, buildLocalGuildRanking, guildModeCategories, selectCompactGuildRanking, type LocalGuildRankingCategory, type DashboardMemberMode, type LocalGuildRankingComparison } from "../../pages/GuildHub/localGuildRanking";
import DashboardValueTransition from "../../pages/GuildHub/dashboardValueTransition";
import LocalGuildStatsPlayerRow from "./LocalGuildStatsPlayerRow";
import LocalGuildRankingOverlay from "./LocalGuildRankingOverlay";
import styles from "./LocalGuildPlayerStats.module.css";

const formatValue = (value: number | null) => value == null ? "--" : value.toLocaleString(profileLocale());

export default function LocalGuildPlayerStats({ members, scope, currentTimestamp, comparison, onRequestRanking, mode = "general", selectedMemberKey = null, animateChanges = false, rankingClass = null }: {
  rankingClass?: ClassSelection;
  animateChanges?: boolean; members: readonly LocalGuildStatsMember[]; scope: object; currentTimestamp: number;
  comparison: LocalGuildRankingComparison; mode?: DashboardMemberMode; selectedMemberKey?: string | null; onRequestRanking: () => void;
}) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState<{ scope: object; category: LocalGuildRankingCategory; mode: DashboardMemberMode } | null>(null);
  useEffect(() => setOpened(null), [scope, mode]);
  const trigger = useRef<HTMLElement | null>(null);
  const close = useCallback(() => setOpened(null), []);
  const isOpen = !!opened && opened.scope === scope && opened.mode === mode;
  const rankings = useMemo(() => Object.fromEntries(guildModeCategories(mode).map(category => [category,
    comparison.rankings?.[mode]?.[category] ?? buildLocalGuildRanking(members, comparison.status === "ready" ? comparison.members : [], category, mode, comparison.identities,
      { players: comparison.status === "ready" ? comparison.players ?? comparison.members : [], rosterComplete: comparison.status === "ready" && !comparison.rankings }),
  ])), [members, comparison, mode]);
  const visibleRankings = useMemo(() => Object.fromEntries(Object.entries(rankings).map(([category, rows]) => [category, selectGuildRankingClass(rows, rankingClass)])), [rankings, rankingClass]);
  const rows = opened ? visibleRankings[opened.category] ?? [] : [];
  const categoryLabel = opened?.category ?? "level";
  const label = (category: string) => t(`guildHub.memberValues.${category}`);
  const rankingTitle = t("guildHub.ranking.title", { category: label(categoryLabel), mode: t("dashboardCompare.modes." + mode) });
  const allGroups = useMemo(() => comparison.groups?.[mode] ?? summarizeLocalGuildPlayerStats(members, mode), [members, mode, comparison.groups]);
  const groups = useMemo(() => allGroups.map(group => {
    const values = (visibleRankings[group.category] ?? []).filter(row => row.value != null);
    return { ...group, average: values.length ? values.reduce((sum, row) => sum + row.value!, 0) / values.length : null };
  }), [allGroups, visibleRankings]);

  return (
    <section className={styles.panel} data-local-guild-player-stats>
      <div className={styles.header}>
        <h2>Ø {t("guildProfile.heroPanel.sections.averagePlayerStats")}</h2>
      </div>
      <div className={styles.groups}>
        {groups.map((group) => {
          const entries = selectCompactGuildRanking(visibleRankings[group.category] ?? [], selectedMemberKey);
          const maxValue = Math.max(0, ...entries.map(entry => entry?.value ?? 0));
          const deltaLabel = comparison.status === "loading" || comparison.status === "idle" ? t("guildHub.ranking.loading")
            : comparison.status === "error" ? t("guildHub.ranking.failed") : t("guildHub.ranking.valueDelta");
          return (
          <div className={styles.group} key={group.category} data-stats-field={group.field}>
            <div className={styles.groupHeader}>
              <h3>Ø {label(group.category)}</h3>
              <div className={styles.average}>
                <span>Ø {label(group.category)}</span>
                <DashboardValueTransition as="strong" data-stats-average parts={[formatValue(group.average)]} enabled={animateChanges}>{formatValue(group.average)}</DashboardValueTransition>
              </div>
            </div>
            {!visibleRankings[group.category]?.length && <p role="status">{t("guildHub.ranking.emptyClass")}</p>}
            <ol className={styles.entries}>
              {entries.map((entry, index) => <li key={animateChanges ? index : entry?.key ?? `empty-${index}`} data-compact-slot={index} data-compact-key={entry?.key}>
                {entry ? <LocalGuildStatsPlayerRow entry={entry} maxValue={maxValue} delta={entry.valueDelta} deltaLabel={deltaLabel}
                  compactRank={entry} selected={entry.key === selectedMemberKey} ranking animateChanges={animateChanges} /> : <div className={styles.emptyNeighbor} aria-hidden />}
              </li>)}
              <li><button type="button" className={styles.rankingButton} data-guild-ranking-trigger={group.category}
                onClick={event => { trigger.current = event.currentTarget; setOpened({ scope, category: group.category, mode }); onRequestRanking(); }}>
                {t("guildHub.ranking.open")}
              </button></li>
            </ol>
          </div>
        ); })}
      </div>
      <LocalGuildRankingOverlay isOpen={isOpen} title={rankingTitle} rows={rows} currentTimestamp={currentTimestamp} comparison={comparison} onClose={close} trigger={trigger.current} />
    </section>
  );
}
