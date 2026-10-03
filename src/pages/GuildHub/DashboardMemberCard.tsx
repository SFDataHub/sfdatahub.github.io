import React from "react";
import PortraitPreview from "../../components/avatar/PortraitPreview";
import {
  formatPlayerCardDevelopmentPeriod,
  type PlayerCardDevelopmentComparisonTone,
  type PlayerCardDevelopmentMetric,
  type PlayerCardDevelopmentSummary,
  type PlayerCardDevelopmentTrend,
  type PlayerCardDevelopmentTrendState,
} from "../../lib/player-progress/playerCardDevelopment";
import type { PlayerCardBadgeValue } from "../../components/player-card/types";
import type { DashboardPlayerCardItem } from "./dashboardPlayerCards";
import styles from "./DashboardMemberCard.module.css";

type DashboardMemberCardProps = {
  item: DashboardPlayerCardItem;
  onClick: () => void;
};

type DashboardMemberCardStyle = React.CSSProperties & {
  "--dashboard-member-accent"?: string;
};

const FALLBACK_ACCENT = "#5c8bc6";

export default function DashboardMemberCard({ item, onClick }: DashboardMemberCardProps) {
  const player = item.card;
  const accent = player.classAccent || FALLBACK_ACCENT;
  const style: DashboardMemberCardStyle = { "--dashboard-member-accent": accent };
  const portraitConfig = player.hasPortrait === false ? undefined : player.portrait;
  const metaValues = [
    formatMetaChip("Level", player.level),
    formatMetaChip("Rolle", player.guildRole),
    formatHofMetaChip(player.hofRank),
  ].filter((value): value is string => Boolean(value));
  const hasMetaRow = Boolean(metaValues.length || player.potions?.length);

  return (
    <button
      type="button"
      className={styles.card}
      style={style}
      onClick={onClick}
      aria-label={`${player.name} lokales Spielerprofil öffnen`}
    >
      <div className={styles.avatarColumn}>
        <div className={styles.avatarGlow} aria-hidden />
        <PortraitPreview
          config={portraitConfig}
          label={player.name}
          fallbackImage={player.portraitFallbackUrl ?? undefined}
          fallbackLabel={player.portraitFallbackLabel ?? player.name}
          className={styles.portrait}
          shellClassName={styles.portraitShell}
          canvasClassName={styles.portraitCanvas}
          showStatus={false}
        />
      </div>

      <div className={styles.contentColumn}>
        <div className={styles.identityRow}>
          <div className={styles.identity}>
            <h3>{player.name}</h3>
            <span>{player.className ?? "Klasse unbekannt"}</span>
          </div>
          <div className={styles.classIcon} aria-label={player.className ?? "Klasse unbekannt"}>
            {player.classIconUrl ? (
              <img src={player.classIconUrl} alt="" draggable={false} loading="lazy" decoding="async" />
            ) : (
              <span>{player.classIconFallback ?? "?"}</span>
            )}
          </div>
        </div>

        {hasMetaRow ? (
          <div className={styles.metaRow} aria-label="Spielerinformationen">
            {metaValues.map((value) => (
              <span key={value} className={styles.metaChip}>
                {value}
              </span>
            ))}
            {player.potions?.length ? (
              <div className={styles.potionGroup} role="list" aria-label="Aktive Potions">
                {player.potions.map((potion) => (
                  <span key={`${potion.slot}-${potion.assetKey ?? potion.type ?? "potion"}`} className={styles.potionItem} role="listitem">
                    {potion.iconUrl ? (
                      <img src={potion.iconUrl} alt={potion.label} draggable={false} loading="lazy" decoding="async" />
                    ) : (
                      <span aria-label={potion.label}>{potion.type?.slice(0, 1).toUpperCase() ?? "P"}</span>
                    )}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <DevelopmentPanel
          development={item.development}
          loading={item.developmentStatus === "loading"}
          error={item.developmentError}
          resolved={item.developmentStatus !== "loading"}
        />
      </div>
    </button>
  );
}

function DevelopmentPanel({
  development,
  loading,
  error,
  resolved,
}: {
  development: PlayerCardDevelopmentSummary | null;
  loading: boolean;
  error: string | null;
  resolved: boolean;
}) {
  return (
    <section className={styles.developmentPanel} aria-label="Entwicklung">
      <div className={styles.developmentHeading}>
        <h4>Entwicklung</h4>
        <span>Gildenvergleich</span>
      </div>
      {loading ? (
        <DevelopmentSkeleton />
      ) : error ? (
        <div className={`${styles.developmentBody} ${styles.developmentEmpty}`}>{error}</div>
      ) : development ? (
        <div className={styles.developmentBody}>
          <div className={styles.developmentPeriod}>
            {formatPlayerCardDevelopmentPeriod(development.selectedTimestamp, development.currentTimestamp, development.elapsedDays)}
          </div>
          <div className={styles.developmentMetrics}>
            <DevelopmentMetric metric={development.baseStats} />
            <DevelopmentMetric metric={development.level} />
          </div>
        </div>
      ) : (
        <div className={`${styles.developmentBody} ${styles.developmentEmpty}`}>
          {resolved ? "Keine Vergleichsdaten" : ""}
        </div>
      )}
    </section>
  );
}

function DevelopmentMetric({ metric }: { metric: PlayerCardDevelopmentMetric }) {
  return (
    <div className={styles.developmentMetric}>
      <h5>{metric.label}</h5>
      <DevelopmentMetricLine owner="Spieler" delta={metric.playerDelta} perDay={metric.playerPerDay} tone={metric.playerTone} trend={metric.playerTrend} />
      <DevelopmentMetricLine owner="Gilde" delta={metric.guildDelta} perDay={metric.guildPerDay} tone="none" trend={metric.guildTrend} />
    </div>
  );
}

function DevelopmentMetricLine({
  owner,
  delta,
  perDay,
  tone,
  trend,
}: {
  owner: string;
  delta: number | null;
  perDay: number | null;
  tone: PlayerCardDevelopmentComparisonTone;
  trend: PlayerCardDevelopmentTrend;
}) {
  return (
    <div className={styles.developmentLine}>
      <span className={styles.developmentOwner}>{owner}</span>
      <span className={styles.developmentValues} data-tone={tone}>
        <strong>{formatSignedNumber(delta)}</strong>
        <span>{formatRate(perDay)}</span>
      </span>
      <TrendSparkline trend={trend} tone={tone} />
    </div>
  );
}

function TrendSparkline({
  trend,
  tone,
}: {
  trend: PlayerCardDevelopmentTrend;
  tone: PlayerCardDevelopmentComparisonTone;
}) {
  const points = buildSparklinePoints(trend.rates);
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const end = points[points.length - 1] ?? null;
  const previous = points[points.length - 2] ?? null;
  const marker = buildTrendMarker(previous, end, trend.state);

  return (
    <svg className={styles.trendSparkline} viewBox="0 0 58 24" role="img" aria-label={describeTrend(trend.state)} data-trend={trend.state} data-tone={tone}>
      {points.length >= 2 ? <path className={styles.trendSparklinePath} d={path} /> : null}
      {marker ? <path className={styles.trendSparklineMarker} d={marker} /> : null}
      {trend.state === "stable" && end ? <circle className={styles.trendSparklineDot} cx={end.x} cy={end.y} r="2.6" /> : null}
    </svg>
  );
}

function DevelopmentSkeleton() {
  return (
    <div className={styles.developmentBody} aria-label="Entwicklung wird geladen">
      <div className={styles.developmentPeriodSkeleton} />
      <div className={styles.developmentMetrics}>
        {[0, 1].map((groupIndex) => (
          <div key={groupIndex} className={styles.developmentMetric}>
            <div className={styles.developmentTitleSkeleton} />
            <div className={styles.developmentLineSkeleton} />
            <div className={styles.developmentLineSkeleton} />
          </div>
        ))}
      </div>
    </div>
  );
}

function buildSparklinePoints(values: number[]) {
  const finite = values.filter((value) => Number.isFinite(value)).slice(-4);
  if (finite.length < 2) return [];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  const xStep = 48 / Math.max(1, finite.length - 1);
  return finite.map((value, index) => ({
    x: 5 + index * xStep,
    y: 19 - ((value - min) / span) * 14,
  }));
}

function buildTrendMarker(
  previous: { x: number; y: number } | null,
  end: { x: number; y: number } | null,
  state: PlayerCardDevelopmentTrendState,
) {
  if (!previous || !end || state === "unknown" || state === "stable") return null;
  const angle = Math.atan2(end.y - previous.y, end.x - previous.x);
  const size = 3.4;
  const left = {
    x: end.x - Math.cos(angle - Math.PI / 6) * size,
    y: end.y - Math.sin(angle - Math.PI / 6) * size,
  };
  const right = {
    x: end.x - Math.cos(angle + Math.PI / 6) * size,
    y: end.y - Math.sin(angle + Math.PI / 6) * size,
  };
  return `M ${left.x} ${left.y} L ${end.x} ${end.y} L ${right.x} ${right.y}`;
}

function describeTrend(state: PlayerCardDevelopmentTrendState) {
  return (
    {
      "strong-up": "stark steigend",
      "clear-up": "steigend",
      "slight-up": "leicht steigend",
      stable: "stabil",
      "slight-down": "leicht fallend",
      "clear-down": "fallend",
      "strong-down": "stark fallend",
      unknown: "Trend unbekannt",
    } satisfies Record<PlayerCardDevelopmentTrendState, string>
  )[state];
}

function formatMetaChip(label: string, value: PlayerCardBadgeValue) {
  const formatted = formatBadgeValue(value);
  if (!formatted) return null;
  return label === "Level" ? `Level ${formatted}` : formatted;
}

function formatHofMetaChip(value: PlayerCardBadgeValue) {
  const formatted = formatBadgeValue(value);
  return formatted ? `HoF #${formatted}` : null;
}

function formatBadgeValue(value: PlayerCardBadgeValue) {
  if (value == null || value === "" || value === "-") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("de-DE") : null;
  return value;
}

function formatSignedNumber(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value > 0 ? "+" : ""}${formatCompactNumber(value)}`;
}

function formatRate(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "-/Tag";
  return `${value > 0 ? "+" : ""}${formatCompactNumber(value)}/Tag`;
}

function formatCompactNumber(value: number) {
  const abs = Math.abs(value);
  const fractionDigits = abs >= 10 || Number.isInteger(value) ? 0 : 2;
  return value.toLocaleString("de-DE", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits && abs > 0 ? 2 : 0,
  });
}
