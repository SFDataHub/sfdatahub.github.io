import { useProfileAttributeSumMode } from "../../lib/settings/usePreferences";
import React from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  computeGuildHeroFreshness,
  formatGuildHeroAgeLabel,
  type GuildHeroFreshnessLevel,
} from "../../components/guilds/GuildHeroPanel";
import { useGuildEmblemVisual } from "../../components/guilds/GuildEmblem";
import { selectGuildRankingClass, buildLocalGuildRanking, type DashboardMemberMode, type LocalGuildRankingCategory, type LocalGuildRankingComparison } from "./localGuildRanking";
import type { LocalGuildStatsMember } from "./localGuildPlayerStats";
import DashboardValueTransition from "./dashboardValueTransition";
import DashboardTopThreePlayers, { DashboardRankingControls, DashboardHudCountValue } from "./DashboardTopThreePlayers";
import { indexDashboardArchivePlayers, prepareDashboardHudMembers, dashboardRankingCounts, dashboardBuildingCount, type DashboardArchiveRanks, type DashboardRankingScope } from "./localGuildRanking";
import { loadScanArchiveCurrentRanking } from "../../lib/scanArchive/client";
import type { IdentityResolutionSnapshot } from "../../lib/identities/identityResolution";
import RankingIcon from "../Playground/RankingIcon";
import { serverPickerPresentation } from "../../components/Filters/serverPickerModel";
import styles from "./DashboardGuildCard.module.css";

export type DashboardGuildCardKpi = {
  key: string;
  label: string;
  value: React.ReactNode;
  hint?: string;
};

export type DashboardGuildCardProps = {
  className?: string;
  metadataClassName: string;
  mode: DashboardMemberMode;
  rankingMembers: readonly LocalGuildStatsMember[];
  rankingClass?: import("../../data/classes").ClassSelection;
  memberCount: number | null;
  rankingComparison: LocalGuildRankingComparison;
  identities: IdentityResolutionSnapshot | null;
  modeToggle: React.ReactNode;
  compactTarget: HTMLDivElement | null;
  coaString?: string | null;
  guildName: string;
  hofRank: number | null;
  kpis: DashboardGuildCardKpi[];
  lastScanAtLabel: string | null;
  lastScanDays: number | null;
  serverLabel: string;
  server: string | null;
  scanDetailsOpen: boolean;
  onScanDetails: (trigger: HTMLButtonElement) => void;
};

const TOP_THREE_CATEGORIES: Record<string, LocalGuildRankingCategory> = {
  "avg-level": "level", "avg-base": "sum", "avg-base-main": "main", "avg-base-con": "con",
  "avg-total": "sum", "avg-total-main": "main", "avg-total-con": "con", "avg-treasury": "treasury", "avg-mine": "mine",
};
const TOP_THREE_CATEGORIES_BY_MODE: Record<DashboardMemberMode, readonly LocalGuildRankingCategory[]> = {
  general: [], progress: ["level"], base: ["sum", "main", "con"], total: ["sum", "main", "con"], fortress: ["treasury", "mine"],
};

const FRESHNESS_DOT_COLORS: Record<GuildHeroFreshnessLevel, string> = {
  0: "#22c55e",
  1: "#84cc16",
  2: "#a3e635",
  3: "#f59e0b",
  4: "#fb923c",
  5: "#f97316",
  6: "#ef4444",
  unknown: "#94a3b8",
};

function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(" ");
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(value);
}

export default function DashboardGuildCard({
  className,
  metadataClassName,
  mode, modeToggle, compactTarget,
  rankingMembers, rankingClass = null, rankingComparison, identities, memberCount,
  coaString,
  guildName,
  hofRank,
  kpis,
  lastScanAtLabel,
  lastScanDays,
  serverLabel,
  server,
  scanDetailsOpen,
  onScanDetails,
}: DashboardGuildCardProps) {
  const { t } = useTranslation();
  const attributeSumMode = useProfileAttributeSumMode();
  const [rankingScopes, setRankingScopes] = React.useState<Record<string, DashboardRankingScope>>({});
  const [rankingLimits, setRankingLimits] = React.useState<Record<string, number>>({});
  const [rankingState, setRankingState] = React.useState<DashboardArchiveRanks | null>(null);
  React.useEffect(() => {
    let active = true;
    setRankingState(null);
    if (server) void loadScanArchiveCurrentRanking(server).then(value => {
      if (active) setRankingState({ ...value, server });
    }).catch(error => { console.warn("[GuildDashboard] Archive ranks unavailable", error); });
    return () => { active = false; };
  }, [server]);
  const archive = rankingState?.server === server ? rankingState : { month: null, server: server ?? serverLabel, payload: null };
  const archivePlayers = React.useMemo(() => indexDashboardArchivePlayers(archive.payload, identities), [archive.payload, identities]);
  const hudMembers = React.useMemo(() => prepareDashboardHudMembers(rankingMembers, identities, archivePlayers), [rankingMembers, identities, archivePlayers]);
  const { visualEmblemUrl } = useGuildEmblemVisual({
    coaString,
    emblemUrl: null,
    name: guildName,
  });
  const freshness = React.useMemo(
    () => computeGuildHeroFreshness(t, lastScanDays),
    [lastScanDays, t],
  );
  const scanAgeLabel = formatGuildHeroAgeLabel(t, lastScanDays);
  const freshnessTitle = [
    lastScanAtLabel
      ? t("guildProfile.heroPanel.tooltips.lastScanAt", {
          value: lastScanAtLabel,
          defaultValue: "Last scan: {{value}}",
        })
      : null,
    scanAgeLabel
      ? t("guildProfile.heroPanel.tooltips.age.label", {
          value: scanAgeLabel,
          defaultValue: "Age: {{value}}",
        })
      : null,
    freshness.hint,
  ]
    .filter(Boolean)
    .join("\n");
  const hofRankLabel = typeof hofRank === "number" ? `#${formatInteger(hofRank)}` : "-";
  const freshnessDescription = [freshness.label, freshnessTitle].filter(Boolean).join("\n");
  const scanKpi = kpis.find(kpi => kpi.key === "scanstand");
  const serverIcon = serverPickerPresentation(server ?? serverLabel);
  const rankingKeys = new Set(Object.keys(TOP_THREE_CATEGORIES));
  const metadataKpis: DashboardGuildCardKpi[] = [
    { key: "server", label: t("guildProfile.heroPanel.meta.server", { defaultValue: "Server" }), value: serverLabel },
    ...["members", "activity"].flatMap(key => kpis.filter(item => item.key === key)),
    { key: "hof-rank", label: t("guildProfile.heroPanel.meta.hofRank", { defaultValue: "HoF Rank" }), value: hofRankLabel },
    ...["avg-level", "avg-base", "avg-base-main", "avg-base-con", "avg-total", "avg-total-main", "avg-total-con", "avg-treasury", "avg-mine"].flatMap(key => kpis.filter(item => item.key === key)),
  ];

  const keysByMode: Record<DashboardMemberMode, readonly string[]> = {
    general: ["server", "members", "activity", "hof-rank"],
    progress: ["avg-level"],
    base: ["avg-base", "avg-base-main", "avg-base-con"],
    total: ["avg-total", "avg-total-main", "avg-total-con"],
    fortress: ["avg-treasury", "avg-mine"],
  };

  const topThreeRankings = React.useMemo(() => Object.fromEntries(
    TOP_THREE_CATEGORIES_BY_MODE[mode].map(category => [category,
      rankingComparison.rankings?.[mode]?.[category]
        ?? buildLocalGuildRanking(rankingMembers, rankingComparison.status === "ready" ? rankingComparison.members : [], category, mode, rankingComparison.identities),
    ])), [mode, rankingMembers, rankingComparison]);

  const renderCrest = (compact = false) => (
    <div className={cx(styles.coaStage, compact && styles.compactCrest)} data-guild-crest={compact ? undefined : ""} data-compact-crest={compact ? "" : undefined}>
          {visualEmblemUrl ? (
            <img
              src={visualEmblemUrl}
              alt={t("profileI18n.guildEmblem", { name: guildName })}
              className={styles.coaImage}
              loading={compact ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
            />
          ) : (
            <span className={styles.coaFallback}>
              {t("guildProfile.heroPanel.meta.emblemMissing", { defaultValue: "Guild crest unavailable" })}
            </span>
          )}
        </div>
  );
  const renderStatus = (compact = false) => (
    <div className={cx(styles.scanHud, compact && styles.compactHud)} data-guild-scan-hud={compact ? undefined : ""} data-compact-hud={compact ? "" : undefined}>
        <div className={styles.scanStand} data-guild-scan-stand>
          <span className={styles.freshness} role="img" aria-label={freshnessDescription} title={freshnessDescription} tabIndex={0} data-freshness-level={freshness.level}>
            <span aria-hidden="true" style={{ background: FRESHNESS_DOT_COLORS[freshness.level] }} />
          </span>
          <div><span className={styles.scanLabel}>{scanKpi?.label}</span><strong>{scanKpi?.value ?? "—"}</strong><small><span data-scan-age-expanded>{scanKpi?.hint ?? scanAgeLabel}</span><span data-scan-age-compact>{scanAgeLabel}</span></small></div>
        </div>
        <button type="button" className={styles.scanDetailsButton} aria-label={t("guildScanDetails.title")} aria-haspopup="dialog" aria-expanded={scanDetailsOpen} onClick={event => onScanDetails(event.currentTarget)} data-guild-scan-details-trigger><Info size={14} aria-hidden /><span>{t("guildScanDetails.title")}</span></button>
      </div>
  );

  return (
    <>
    {compactTarget && createPortal(<>{renderCrest(true)}{renderStatus(true)}</>, compactTarget)}
    {modeToggle}
    <article className={cx(styles.card, className)} aria-label={guildName} data-guild-hero>
      <div className={styles.profileLogoPanel}>{renderCrest()}</div>
      {renderStatus()}
    </article>

    <section className={cx(styles.metadata, metadataClassName)} aria-label={t("profileI18n.guildMetadata")} data-guild-metadata>
      <dl className={styles.kpiGrid} aria-label={t("profileI18n.guildKpis")} data-guild-values data-guild-values-mode={mode}>
        {mode === "general" && <div className={cx(styles.kpiHeader, styles.averageHud, styles.sectionHud)} data-guild-info-hud><dt>{t("dashboardAverageHud.guildInfo")}</dt></div>}
        {metadataKpis.filter(kpi => keysByMode[mode].includes(kpi.key)).map((kpi) => {
          const category = TOP_THREE_CATEGORIES[kpi.key];
          const fortress = category === "mine" || category === "treasury";
          const label = t("dashboardAverageHud." + kpi.key).replace(/^Ø\s*/, "");
          const limit = rankingLimits[kpi.key] ?? 100;
          const selectedScope = rankingScopes[kpi.key] ?? "server";
          const countScopes = selectedScope === "global" ? ["global", "globalClass"] as const : ["server", "serverClass"] as const;
          const counts = category && !fortress ? dashboardRankingCounts(hudMembers, kpi.key, limit, memberCount, attributeSumMode) : null;
          const building = fortress ? dashboardBuildingCount(hudMembers, category, memberCount) : null;
          const coverage = (count: { known: number; total: number | null; partial: boolean }) => t("dashboardHud.coverage", { known: count.known, total: count.total ?? t("dashboardHud.unknownTotal") }) + " " + t(count.partial ? "dashboardHud.incomplete" : "dashboardHud.complete");
          const rankingResult = (scope: "server" | "serverClass" | "global" | "globalClass") => counts && t(
            counts[scope].hits == null ? "dashboardHud." + (selectedScope === "global" ? "globalResultUnavailable" : "resultUnavailable") : "dashboardHud." + scope + "Result",
            { hits: counts[scope].hits, total: counts[scope].total ?? t("dashboardHud.unknownTotal"), limit, server: archive.server || serverLabel, metric: label, scope: t("dashboardHud." + scope) },
          );
          return (
          <div key={/-(main|con)$/.test(kpi.key) ? (kpi.key.endsWith("-main") ? "main" : "con") : TOP_THREE_CATEGORIES[kpi.key] ? (kpi.key === "avg-mine" ? "secondary" : "primary") : kpi.key} className={cx(styles.kpiItem, rankingKeys.has(kpi.key) && styles.rankedItem, fortress && styles.fortressItem, /-(main|con)$/.test(kpi.key) && styles.attributeItem)} data-guild-kpi={kpi.key} title={kpi.key === "avg-base" || kpi.key === "avg-total" ? t(`localSettings.modes.${attributeSumMode}.label`) : kpi.hint}>
            <div className={cx(styles.kpiHeader, TOP_THREE_CATEGORIES[kpi.key] && styles.averageHud)} data-average-hud={TOP_THREE_CATEGORIES[kpi.key] ? kpi.key : undefined}>
            <div className={rankingKeys.has(kpi.key) ? styles.kpiSummary : styles.plainSummary}>
            <dt aria-label={/-(main|con)$/.test(kpi.key) ? `${t(kpi.key.startsWith("avg-base") ? "playerProfile.heroPanel.stats.attributeBars.baseStats" : "playerProfile.heroPanel.stats.attributeBars.totalStats")} · ${kpi.label}` : undefined}><DashboardValueTransition parts={[kpi.label]}>{TOP_THREE_CATEGORIES[kpi.key] ? t("dashboardAverageHud." + kpi.key) : kpi.label}</DashboardValueTransition></dt>
            <dd><DashboardValueTransition parts={[typeof kpi.value === "string" || typeof kpi.value === "number" ? kpi.value : null]}>{kpi.value}</DashboardValueTransition></dd>
            </div>
            {rankingKeys.has(kpi.key) && !fortress && <>
              {(["server", "global"] as const).map(scope => <dd key={scope} className={styles.rankingIcon}>
                <button type="button" className={styles.rankingScope} aria-pressed={selectedScope === scope}
                  aria-label={t("dashboardHud.scopeLabel", { metric: label, scope: t("dashboardHud." + scope), server: serverIcon.fullName })}
                  title={t("dashboardHud.scopeLabel", { metric: label, scope: t("dashboardHud." + scope), server: serverIcon.fullName })}
                  onClick={() => setRankingScopes(current => ({ ...current, [kpi.key]: scope }))} data-ranking-scope={scope} data-ranking-category={kpi.key}>
                  <span aria-hidden="true">{scope === "server"
                    ? <RankingIcon variant={serverIcon.fusion ? "fusion" : "server"} size={32} presentation="name-only" sphereOnly labelLines={[serverIcon.short]} labelFontSize={serverIcon.fontSize} />
                    : <RankingIcon variant="global" size={32} presentation="name-only" sphereOnly />}</span>
                </button>
              </dd>)}
            </>}
            {counts && <DashboardRankingControls category={kpi.key} label={label} limit={limit} onChange={value => setRankingLimits(current => ({ ...current, [kpi.key]: value }))}>
              <strong>{t("dashboardHud.rankingHelpTitle")}</strong>
              <p>{t("dashboardHud." + (selectedScope === "global" ? "rankingHelpGlobal" : "rankingHelp"))}</p>
              <ul className="list-disc pl-5">
                {[100, 500, 1000].map(value => <li key={value}><strong>R{value}:</strong> {t("dashboardHud.rankingTop", { limit: value })}</li>)}
              </ul>
              {countScopes.map(scope => <p key={scope}><strong>{t("dashboardHud." + scope)}</strong> {t("dashboardHud." + scope + "Help")}</p>)}
            </DashboardRankingControls>}
            </div>
            {TOP_THREE_CATEGORIES[kpi.key] && <DashboardTopThreePlayers category={kpi.key}
              label={`${t("dashboardCompare.modes." + mode)} · ${kpi.label}`} rows={selectGuildRankingClass(topThreeRankings[TOP_THREE_CATEGORIES[kpi.key]] ?? [], rankingClass)} status={rankingComparison.status} archive={archive} members={hudMembers} fortress={fortress}
              summary={building ? <section className={styles.hudSummary} aria-label={t("dashboardHud.buildingLabel", { building: label.replace(/^Ø\s*/, ""), max: building.max })} title={t("dashboardHud.buildingLabel", { building: label.replace(/^Ø\s*/, ""), max: building.max }) + " · " + coverage(building)} tabIndex={0} data-building-summary={category} data-building-max={building.max} data-summary-known={building.known} data-summary-total={building.total ?? "unknown"} data-summary-hits={building.hits ?? "unavailable"}>
                <span>{t("dashboardHud.fullyUpgraded")}</span>
                <strong><DashboardHudCountValue count={building} /> / {building.total ?? "—"} {t("dashboardHud.members", { count: building.total ?? undefined })}</strong>
                {building.partial && <small>{t("dashboardHud.partial")} · {t("dashboardHud.coverageShort", { known: building.known, total: building.total ?? "—" })}</small>}
              </section> : counts ? <section className={styles.hudSummary} aria-label={t("dashboardHud.summaryLabel", { metric: label, limit })} data-ranking-summary={kpi.key} data-ranking-threshold={limit} data-ranking-selected-scope={selectedScope}>
                {countScopes.map(scope => <div key={scope} tabIndex={0} title={rankingResult(scope) || undefined} aria-label={rankingResult(scope) || undefined} data-ranking-count={scope} data-summary-hits={counts[scope].hits ?? "unavailable"} data-summary-known={counts[scope].known} data-summary-total={counts[scope].total ?? "unknown"} data-summary-partial={counts[scope].partial}>
                  <span>{t("dashboardHud." + scope)}</span><strong><DashboardHudCountValue count={counts[scope]} /></strong>
                </div>)}
                {countScopes.some(scope => counts[scope].hits != null && counts[scope].partial) && <small>{t("dashboardHud.partial")}</small>}
              </section> : null} />}
          </div>
        );})}
      </dl>
    </section>
    </>
  );
}
