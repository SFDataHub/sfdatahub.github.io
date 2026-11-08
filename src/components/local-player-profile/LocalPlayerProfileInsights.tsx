import { acquireProfileArchiveHistory } from "../../lib/scanArchive/profileHistoryAcquisition";
import { favoriteReference } from "../../lib/data-hub/hubFavoritesContract";
import { profileLocale } from "../../lib/i18n/profilePresentation";
import React from "react";
import { TriangleAlert } from "lucide-react";
import { usePlayerInsightsConstructionAccess } from "../../lib/data-hub/playerInsightsConstructionAccess";
import constructionStyles from "../../pages/DataHub/Index.module.css";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import {
  type LocalPlayerAttributeComparison,
  type LocalPlayerInsightsModel,
} from "./localPlayerInsightsModel";
import type { PlayerContentView } from "../../lib/local-player-profile/viewCharts";
import type { LocalHeroPanelData, LocalPlayerProfileModel } from "./types";
import { useLocalProfilePart } from "../../lib/local-player-profile/useLocalProfilePart";

type LocalPlayerProfileInsightsProps = {
  profile: LocalPlayerProfileModel;
  hero: LocalHeroPanelData;
  contentView: PlayerContentView;
  generalGuildName?: string | null;
  generalOriginServer?: string | null;
};

const EMPTY_MODEL: LocalPlayerInsightsModel = {
  status: "loading",
  rankings: {
    player: null,
    guild: null,
    server: null,
  },
  progression: {
    gameCompletion: null,
    itemsDiscovered: null,
  },
  playerVsAverage: [
    { key: "str", label: "Strength", playerValue: null, guildAverage: null, validGuildMembers: 0 },
    { key: "dex", label: "Dexterity", playerValue: null, guildAverage: null, validGuildMembers: 0 },
    { key: "int", label: "Intelligence", playerValue: null, guildAverage: null, validGuildMembers: 0 },
    { key: "con", label: "Constitution", playerValue: null, guildAverage: null, validGuildMembers: 0 },
    { key: "lck", label: "Luck", playerValue: null, guildAverage: null, validGuildMembers: 0 },
  ],
  personalBests: {
    highestXpPerDay: null,
    highestDungeon: null,
    bestServerRank: null,
    historyAvailable: false,
  },
};

export default function LocalPlayerProfileInsights({ profile, hero, contentView, generalGuildName, generalOriginServer }: LocalPlayerProfileInsightsProps) {
  const { t } = useTranslation();
  const canAccess = usePlayerInsightsConstructionAccess();
  const current = useLocalProfilePart(profile, "currentInsights");
  const bestsEnabled = canAccess("personalBests");
  const bests = useLocalProfilePart(profile, "bests", undefined, bestsEnabled);
  React.useEffect(() => {
    const reference = favoriteReference("player", profile.analytics.memberRef ?? profile.currentSeed?.rawIdentifier);
    if (!reference || !bestsEnabled) return;
    const controller = new AbortController();
    // Personal bests explicitly require the full timeline and own that demand.
    // Current values, comparison and charts never wait for this independent job.
    void acquireProfileArchiveHistory(reference, profile.analytics.scannedAtMs, {
      signal: controller.signal, all: true, consumer: "player-personal-bests",
    }).catch(error => { if (!controller.signal.aborted) console.error("Personal best history acquisition failed", error); });
    return () => controller.abort();
  }, [bestsEnabled, profile.sourceScanId, profile.analytics.scannedAtMs, profile.analytics.memberRef]);
  const model = { ...EMPTY_MODEL, ...current.value, personalBests: bests.value ?? EMPTY_MODEL.personalBests };

  return (
    <>
      <div className="local-profile-left-content" data-content-view={contentView}>
        <InsightPanel className="local-player-insights--progression" canAccess={canAccess("progression")} title={t("playerProfile.insights.progression")} />
        <InsightPanel className="local-player-insights--player-average" canAccess={canAccess("playerAverage")} title={t("playerProfile.insights.playerAverage")}>
          {contentView === "base" || contentView === "total" ? <div className="local-player-insights__attributes">
            {(contentView === "total" ? model.playerVsAverageTotal ?? EMPTY_MODEL.playerVsAverage : model.playerVsAverage).map(attribute => <AttributeComparison key={attribute.key} attribute={attribute} />)}
          </div> : <div className="local-profile-player-info"><dl>
            {contentView === "general" && <>
              <div><dt>{t("localProfileRoute.ogServer")}</dt><dd>{generalOriginServer ?? "-"}</dd></div>
              <div><dt>{t("playerProfile.heroPanel.playerInfo.hallOfFame")}</dt><dd>{hero.playerInfo?.hofRank != null ? `#${formatMetadataNumber(hero.playerInfo.hofRank)}` : "-"}</dd></div>
              <div><dt>{t("playerProfile.heroPanel.stats.honor")}</dt><dd>{formatMetadataNumber(hero.playerInfo?.honor)}</dd></div>
              <div className="local-profile-player-info-guild"><dt>{t("playerProfile.heroPanel.stats.attributeBars.guild")}</dt><dd>{generalGuildName ?? hero.guild ?? "-"}</dd></div>
              <div><dt>{t("playerProfile.heroPanel.stats.guildRole")}</dt><dd>{hero.playerInfo?.roleKey ? t(`playerProfile.heroPanel.playerInfo.roles.${hero.playerInfo.roleKey}`) : hero.playerInfo?.guildRole ?? "-"}</dd></div>
            </>}
            {contentView === "progress" && <div><dt>{t("playerProfile.heroPanel.stats.level")}</dt><dd>{formatMetadataNumber(hero.playerInfo?.level)}</dd></div>}
            {contentView === "fortress" && (["fortress", "quarters", "woodcutter", "quarry", "gemMine", "academy", "archeryGuild", "barracks", "mageTower", "treasury", "smithy", "fortifications"] as const).map(key =>
              <div key={key}><dt>{t(`playerProfile.statsTab.fortress.labels.${key}`)}</dt><dd>{formatMetadataNumber(hero.fortressBuildings?.[key])}</dd></div>)}
          </dl></div>}
        </InsightPanel>
      </div>
      <div className="local-profile-right-content">
      <InsightPanel className="local-player-insights--rankings" canAccess={canAccess("rankings")} title={t("profileI18n.rankingsComparison")}>
        <PartNote part={current} />
        <MetricList
          rows={[
            { label: t("playerProfile.history.player"), value: formatRank(model.rankings.player) },
            { label: t("playerProfile.heroPanel.stats.attributeBars.guild"), value: formatRank(model.rankings.guild) },
            { label: t("playerProfile.heroPanel.stats.attributeBars.server"), value: formatRank(model.rankings.server) },
          ]}
        />
      </InsightPanel>

      <InsightPanel className="local-player-insights--personal-bests" canAccess={canAccess("personalBests")} title={t("profileI18n.personalBests")}>
        <MetricList
          rows={[
            { label: t("profileI18n.highestXpDay"), value: formatNumber(model.personalBests.highestXpPerDay) },
            { label: t("profileI18n.highestDungeon"), value: formatNumber(model.personalBests.highestDungeon) },
            { label: t("profileI18n.bestServerRank"), value: formatRank(model.personalBests.bestServerRank) },
          ]}
        />
        <PartNote part={bests} />
      </InsightPanel>
      </div>
    </>
  );
}

function PartNote({ part }: { part: { status: string; reason?: string; retry: () => void } }) {
  const { t } = useTranslation();
  if (part.status === "ready") return null;
  return <div className="local-player-insights__note" role="status">{t(`playerProfile.localData.${part.status}`)}
    {part.status !== "loading" ? <button type="button" onClick={part.retry}>{t("playerProfile.localData.retry")}</button> : null}</div>;
}

function InsightPanel({
  className,
  canAccess,
  title,
  children,
}: {
  className: string;
  canAccess: boolean;
  title: string;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className={`local-player-insights ${className}`} data-construction={!canAccess || undefined}>
      <h2>{title}</h2>
      {canAccess ? children : <div className={`${constructionStyles.constructionBanner} local-player-insights__construction`}>
        <TriangleAlert aria-hidden="true" />
        <span>{t("profileI18n.underConstruction")}</span>
        <span className={constructionStyles.constructionStripe} aria-hidden="true" />
      </div>}
    </section>
  );
}

function MetricList({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <dl className="local-player-insights__metric-list">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function AttributeComparison({ attribute }: { attribute: LocalPlayerAttributeComparison }) {
  const { t } = useTranslation();
  const ratio =
    attribute.playerValue != null && attribute.guildAverage != null && attribute.guildAverage > 0
      ? Math.max(0, Math.min(1.4, attribute.playerValue / attribute.guildAverage)) / 1.4
      : 0;

  return (
    <div className="local-player-insights__attribute-row">
      <div className="local-player-insights__attribute-head">
        <span>{t(`playerProfile.heroPanel.stats.attributeBars.attributes.${attribute.key}`, { defaultValue: attribute.label })}</span>
        <strong>{formatNumber(attribute.playerValue)}</strong>
      </div>
      <div className="local-player-insights__attribute-track" aria-hidden="true">
        <span style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <div className="local-player-insights__attribute-average">
        <span>{t("playerProfile.insights.average")}</span>
        <strong>{formatNumber(attribute.guildAverage, 1)}</strong>
      </div>
    </div>
  );
}

function formatNumber(value: number | null, maximumFractionDigits = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString(profileLocale(), { maximumFractionDigits });
}

function formatRank(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "—";
  return `#${value.toLocaleString(profileLocale(), { maximumFractionDigits: 0 })}`;
}

function formatMetadataNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString(profileLocale()) : "-";
}
