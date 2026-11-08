import { profilePercent, profileClassLabel, profileRoleLabel } from "../../lib/i18n/profilePresentation";
import { useProfileAttributeSumMode } from "../../lib/settings/usePreferences";
import { projectLocalGuildStats } from "./localGuildPlayerStats";
import React from "react";
import { Star, ListOrdered, UserRound } from "lucide-react";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import PortraitPreview from "../../components/avatar/PortraitPreview";
import { guideAssetByKey } from "../../data/guidehub/assets";
import { toDriveThumbProxy } from "../../lib/urls";
import { formatGuildStatDelta, formatGuildStatValue } from "../../components/guilds/LocalGuildStatsPlayerRow";
import { guildModeCategories, localGuildRankingField, type DashboardMemberMode, type LocalGuildRankingComparison } from "./localGuildRanking";
import type { DashboardPlayerCardItem } from "./dashboardPlayerCards";
import DashboardValueTransition from "./dashboardValueTransition";
import styles from "./DashboardMemberCard.module.css";

export type MemberCardActions = { saved: boolean; disabled: boolean; onFavorite: () => void; onToplist: () => void };
export default function DashboardMemberCard({ item, mode = "general", comparison, actions, selected = false, onSelect, onProfile }: {
  item: DashboardPlayerCardItem; mode?: DashboardMemberMode; comparison?: LocalGuildRankingComparison;
  actions?: MemberCardActions; selected?: boolean; onSelect: () => void; onProfile: () => void;
}) {
  const { t } = useTranslation();
  const attributeSumMode = useProfileAttributeSumMode();
  const player = item.card, values = item.member.playerStats ? projectLocalGuildStats(item.member.playerStats, attributeSumMode) : undefined;
  const accent = player.classAccent || "#5c8bc6";
  const bonus = values?.mountBonus ?? null, race = player.portrait?.race;
  const alignment = race != null && race >= 1 && race <= 8 ? race <= 4 ? "good" : "evil" : null;
  const asset = alignment && [10, 20, 30, 50].includes(bonus ?? -1) ? guideAssetByKey(`mount_${alignment}_${bonus}`, 96) : null;
  const mountUrl = asset?.id ? toDriveThumbProxy(asset.id, 96) : null;
  const label = (category: string) => t(`guildHub.memberValues.${category}`);
  const metrics = guildModeCategories(mode).map(category => {
    const field = localGuildRankingField(category, mode);
    const value = values?.[field] ?? (category === "level" ? player.level : category === "hof" ? player.hofRank : null);
    const delta = comparison?.rankings?.[mode]?.[category]?.find(row => row.key === item.member.key)?.valueDelta ?? null;
    return { category, value: typeof value === "number" && Number.isFinite(value) && (category !== "hof" || value > 0) ? value : null, delta };
  });
  const topLabel = t("guildHub.memberValues.toplist");
  const profileLabel = `${player.name} · ${t("guildHub.memberValues.profile")}`;
  const favoriteLabel = t(actions?.saved ? "hubFavorites.playerRemove" : "hubFavorites.playerSave");
  return <article className={styles.card} style={{ "--dashboard-member-accent": accent } as React.CSSProperties} data-member-card={item.member.key} data-member-mode={mode} data-selected={selected}>
    <button type="button" className={styles.selectionButton} onClick={onSelect} aria-pressed={selected}
      aria-label={t("guildHub.memberValues.selectRanking", { name: player.name })} data-member-select />
    <div className={styles.avatarColumn}>
      <div className={styles.avatarGlow} aria-hidden />
      <PortraitPreview config={player.hasPortrait === false ? undefined : player.portrait} label={player.name}
        fallbackImage={player.portraitFallbackUrl ?? undefined} fallbackLabel={t("profileI18n.portraitPlaceholder")}
        className={styles.portrait} shellClassName={styles.portraitShell} canvasClassName={styles.portraitCanvas} showStatus={false} />
    </div>
    <div className={styles.contentColumn}>
      <div className={styles.identityRow}>
        <div className={styles.identity}>
          <h3>{player.name}</h3><span>{profileClassLabel(player.className)}</span>
        </div>
        <div className={styles.classIcon} title={profileClassLabel(player.className)}>
          {player.classIconUrl ? <img src={player.classIconUrl} alt="" loading="lazy" decoding="async" /> : <span>{player.classIconFallback ?? "?"}</span>}
        </div>
        <div className={styles.equipment}>
          <div className={styles.potionGroup} role="list" aria-label={t("guildHub.memberValues.potions")}>
            {[0, 1, 2].map(slot => { const potion = player.potions?.find(potion => potion.slot === slot + 1); const potionLabel = potion ? t("profileI18n.potionTypes." + potion.type) + (potion.size != null && potion.type !== "life" ? " " + profilePercent(potion.size) : "") : t("guildHub.memberValues.emptyPotion"); return <span className={styles.potionItem} role="listitem" key={slot} title={potionLabel}>
              {potion?.iconUrl ? <img src={potion.iconUrl} alt={potionLabel} loading="lazy" decoding="async" /> : <span aria-label={potionLabel}>–</span>}
            </span>; })}
          </div>
          <span className={styles.mount} title={`${t("playerProfile.heroPanel.stats.mount")}: ${bonus == null ? "--" : profilePercent(bonus)}`} aria-label={`${t("playerProfile.heroPanel.stats.mount")}: ${bonus == null ? "--" : profilePercent(bonus)}`}>
            {mountUrl ? <img src={mountUrl} alt="" loading="lazy" /> : <span aria-hidden>♞</span>}
          </span>
        </div>
      </div>
      <div className={styles.actionRow} onClick={event => event.stopPropagation()}>
        <span className={styles.role}>{profileRoleLabel(item.member.guildRole ?? player.guildRole)}</span>
        <button type="button" aria-label={profileLabel} title={profileLabel} onClick={onProfile} data-member-profile><UserRound size={15} aria-hidden /></button>
        <button type="button" aria-label={topLabel} title={topLabel} disabled={!item.member.localRef?.identifier} onClick={actions?.onToplist}><ListOrdered size={15} aria-hidden /></button>
        <button type="button" aria-label={favoriteLabel} title={favoriteLabel} aria-pressed={actions?.saved ?? false} disabled={actions?.disabled ?? true} onClick={actions?.onFavorite}><Star size={15} fill={actions?.saved ? "currentColor" : "none"} aria-hidden /></button>
      </div>
      <dl className={styles.metrics} aria-label={t("guildHub.memberValues.current")}>
        {metrics.map(metric => <div key={metric.category} data-member-metric={metric.category}>
          <dt>{label(metric.category)}</dt><dd><strong data-member-value><DashboardValueTransition parts={[formatGuildStatValue(metric.value ?? null)]}>{formatGuildStatValue(metric.value ?? null)}</DashboardValueTransition></strong>
            <span data-member-delta data-direction={metric.delta == null ? "missing" : metric.delta > 0 ? "positive" : metric.delta < 0 ? "negative" : "unchanged"} title={comparison?.status === "loading" ? t("guildHub.ranking.loading") : comparison?.status === "error" ? t("guildHub.ranking.failed") : t("guildHub.ranking.valueDelta")}>
              <DashboardValueTransition parts={[comparison?.status === "loading" ? "…" : formatGuildStatDelta(metric.delta)]}>{comparison?.status === "loading" ? "…" : formatGuildStatDelta(metric.delta)}</DashboardValueTransition>
            </span></dd>
        </div>)}
        {(mode === "general" || mode === "progress") ? <div data-member-metric="mount"><dt>{t("playerProfile.heroPanel.stats.mount")}</dt><dd><strong data-member-value><DashboardValueTransition parts={[bonus == null ? "--" : profilePercent(bonus)]}>{bonus == null ? "--" : profilePercent(bonus)}</DashboardValueTransition></strong></dd></div> : null}
      </dl>
    </div>
  </article>;
}
