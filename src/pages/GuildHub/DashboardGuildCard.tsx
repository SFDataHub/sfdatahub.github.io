import React from "react";
import { useTranslation } from "react-i18next";
import {
  computeGuildHeroFreshness,
  formatGuildHeroAgeLabel,
  type GuildHeroFreshnessLevel,
} from "../../components/guilds/GuildHeroPanel";
import { useGuildEmblemVisual } from "../../components/guilds/GuildEmblem";
import styles from "./DashboardGuildCard.module.css";

export type DashboardGuildCardKpi = {
  key: string;
  label: string;
  value: React.ReactNode;
  hint?: string;
};

export type DashboardGuildCardProps = {
  className?: string;
  coaString?: string | null;
  guildName: string;
  hofRank: number | null;
  kpis: DashboardGuildCardKpi[];
  lastScanAtLabel: string | null;
  lastScanDays: number | null;
  memberCount: number | null;
  serverLabel: string;
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
  coaString,
  guildName,
  hofRank,
  kpis,
  lastScanAtLabel,
  lastScanDays,
  memberCount,
  serverLabel,
}: DashboardGuildCardProps) {
  const { t } = useTranslation();
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
  const memberCountLabel = typeof memberCount === "number" ? formatInteger(memberCount) : "-";
  const hofRankLabel = typeof hofRank === "number" ? `#${formatInteger(hofRank)}` : "-";
  const lastScanLabel = scanAgeLabel ?? lastScanAtLabel ?? "-";

  return (
    <article className={cx(styles.card, className)} aria-label={guildName}>
      <div className={styles.profileLogoPanel}>
        <div className={styles.coaStage}>
          {visualEmblemUrl ? (
            <img
              src={visualEmblemUrl}
              alt={`${guildName} Wappen`}
              className={styles.coaImage}
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          ) : (
            <span className={styles.coaFallback}>
              {t("guildProfile.heroPanel.meta.emblemMissing", { defaultValue: "Guild crest unavailable" })}
            </span>
          )}
        </div>

        <div className={styles.profileMeta}>
          <div className={styles.metaInline}>
            <span>
              {t("guildProfile.heroPanel.meta.server", { defaultValue: "Server" })}: {serverLabel}
            </span>
            <span>
              {t("guildProfile.heroPanel.meta.members", { defaultValue: "Members" })}: {memberCountLabel}
            </span>
          </div>
          <div>
            {t("guildProfile.heroPanel.meta.hofRank", { defaultValue: "HoF Rank" })}: {hofRankLabel}
          </div>
          <div>
            {t("guildProfile.heroPanel.meta.lastScanned", { defaultValue: "Last scanned" })}: {lastScanLabel}
          </div>
        </div>

        <div className={styles.freshness} title={freshnessTitle || undefined}>
          <span aria-hidden="true" style={{ background: FRESHNESS_DOT_COLORS[freshness.level] }} />
          <strong>{freshness.label}</strong>
        </div>
      </div>

      <dl className={styles.kpiGrid} aria-label="Kompakte Gildenkennzahlen">
        {kpis.map((kpi) => (
          <div key={kpi.key} className={styles.kpiItem}>
            <dt>{kpi.label}</dt>
            <dd>{kpi.value}</dd>
            {kpi.hint ? <small>{kpi.hint}</small> : null}
          </div>
        ))}
      </dl>
    </article>
  );
}
