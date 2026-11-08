import { profileLocale, profileNumber, profileClassLabel } from "../../lib/i18n/profilePresentation";
import React, { type CSSProperties } from "react";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import type { LocalGuildRankingRow } from "../../pages/GuildHub/localGuildRanking";
import DashboardValueTransition, { useChangedPresentation } from "../../pages/GuildHub/dashboardValueTransition";
import { getClassIconUrl } from "../ui/shared/classIcons";
import { getGuildMutedAccent } from "./classColors";
import styles from "./LocalGuildPlayerStats.module.css";

export const formatGuildStatValue = (value: number | null) => value == null ? "--" : value.toLocaleString(profileLocale());
export const formatGuildStatDelta = (value: number | null) => value == null ? "--" : `${value > 0 ? "+" : ""}${value.toLocaleString(profileLocale())}`;

type RowProps = {
  entry: { name: string; classLabel: string | null; value: number | null };
  maxValue: number; delta?: number | null; deltaLabel?: string; ranking?: boolean;
  compactRank?: LocalGuildRankingRow; selected?: boolean; animateChanges?: boolean;
  showRankNumber?: boolean; showValueDelta?: boolean;
};
export default function LocalGuildStatsPlayerRow({ ranking = false, selected = false, animateChanges = false, showRankNumber = true, showValueDelta = true, ...input }: RowProps) {
  const { t } = useTranslation();
  const ref = React.useRef<HTMLDivElement>(null);
  const presentation = useChangedPresentation({ ...input, ranking, selected, showRankNumber, showValueDelta },
    [input.compactRank?.key ?? input.entry.name, input.entry.name, input.entry.classLabel],
    () => Array.from(ref.current?.querySelectorAll("[data-player-change-detail]") ?? []), animateChanges);
  const { entry, maxValue, delta, deltaLabel, compactRank, ranking: shownRanking, selected: shownSelected, showRankNumber: shownRankNumber, showValueDelta: shownValueDelta } = presentation.value;
  const animateValues = animateChanges && !presentation.changing;
  const low = getGuildMutedAccent(entry.classLabel, 0.24) ?? "#2d4764";
  const mid = getGuildMutedAccent(entry.classLabel, 0.36) ?? "#375777";
  const high = getGuildMutedAccent(entry.classLabel, 0.48) ?? "#44698b";
  const width = maxValue > 0 && entry.value != null ? Math.round(Math.max(0, Math.min(1, entry.value / maxValue)) * 100) : 0;
  const icon = getClassIconUrl(entry.classLabel, 256);
  const valueText = formatGuildStatValue(entry.value), deltaText = formatGuildStatDelta(delta ?? null);
  const card = <div ref={compactRank ? undefined : ref} className={`${styles.entry} ${shownRanking && !compactRank ? styles.rankingCard : ""} ${compactRank ? styles.compactCard : ""}`} style={{ "--stats-accent": mid } as CSSProperties} data-ranking-card={shownRanking || undefined} data-selected={shownSelected || undefined}>
    <div className={styles.bar} style={{ width: `${width}%`, background: `linear-gradient(90deg, ${high}CC 0%, ${mid}88 52%, ${low}00 100%)` }} />
    <span className={styles.classIcon} data-player-change-detail title={profileClassLabel(entry.classLabel)}>{icon ? <img src={icon} alt="" /> : null}</span>
    <span className={styles.name} data-player-change-detail title={entry.name} data-stats-player-name>{entry.name}</span>
    <DashboardValueTransition className={styles.values} data-player-change-detail parts={[valueText, shownRanking && shownValueDelta ? deltaText : null]} enabled={animateValues}>
      <strong className={styles.value} data-ranking-value>{valueText}</strong>
      {shownRanking && shownValueDelta ? <span className={styles.delta} data-ranking-value-delta data-direction={delta == null ? "missing" : delta > 0 ? "positive" : delta < 0 ? "negative" : "unchanged"} title={deltaLabel}>{deltaText}</span> : null}
    </DashboardValueTransition>
  </div>;
  const rankText = compactRank?.rank == null ? "--" : `#${profileNumber(compactRank.rank)}`;
  const rankDeltaText = compactRank?.rankStatus === "new" ? t("guildHub.ranking.new") : compactRank?.rankDelta == null ? "--" : compactRank.rankDelta > 0 ? "↑" : compactRank.rankDelta < 0 ? "↓" : "-";
  return compactRank ? <div ref={ref} className={styles.compactRow} data-player-change-phase={presentation.phase} data-display-player-key={compactRank.key}>
    <DashboardValueTransition className={styles.compactRank} data-ranking-rank-area data-player-change-detail parts={[shownRankNumber ? rankText : null, rankDeltaText]} enabled={animateValues}>
      <span data-ranking-rank-delta data-direction={compactRank.rankDelta == null ? "missing" : compactRank.rankDelta > 0 ? "positive" : compactRank.rankDelta < 0 ? "negative" : "unchanged"} title={t("guildHub.ranking.rankDelta")}>
        {rankDeltaText}
      </span>
      {shownRankNumber ? <strong data-ranking-rank>{rankText}</strong> : null}
    </DashboardValueTransition>
    {card}
  </div> : card;
}
