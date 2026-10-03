import React from "react";
import PortraitPreview from "../avatar/PortraitPreview";
import type { LocalPlayerTrendMetric, LocalPlayerTrendPeriod } from "../../lib/player-progress/localPlayerTrend";
import {
  formatPlayerCardDevelopmentPeriod,
  type PlayerCardDevelopmentComparisonTone,
  type PlayerCardDevelopmentMetric,
  type PlayerCardDevelopmentSummary,
  type PlayerCardDevelopmentTrend,
  type PlayerCardDevelopmentTrendState,
} from "../../lib/player-progress/playerCardDevelopment";
import type { PlayerCardData, PlayerCardBadgeValue } from "./types";
import styles from "./PlayerCard.module.css";

type PlayerCardProps = {
  player: PlayerCardData;
  className?: string;
  development?: PlayerCardDevelopmentSummary | null;
  developmentLoading?: boolean;
  developmentError?: string | null;
  developmentResolved?: boolean;
};

type PlayerCardStyle = React.CSSProperties & {
  "--player-card-accent"?: string;
};

const FALLBACK_ACCENT = "#5c8bc6";

const formatValue = (value: PlayerCardBadgeValue) => {
  if (value == null || value === "") return "-";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("de-DE") : "-";
  return value;
};

export default function PlayerCard({
  player,
  className,
  development,
  developmentLoading = false,
  developmentError = null,
  developmentResolved = false,
}: PlayerCardProps) {
  const accent = player.classAccent || FALLBACK_ACCENT;
  const style: PlayerCardStyle = { "--player-card-accent": accent };
  const level = formatValue(player.level);
  const role = formatValue(player.guildRole);
  const hof = player.hofRank == null || player.hofRank === "" ? "-" : `#${formatValue(player.hofRank)}`;
  const portraitConfig = player.hasPortrait === false ? undefined : player.portrait;

  return (
    <article className={[styles.card, className].filter(Boolean).join(" ")} style={style} aria-label={`${player.name} Player Card`}>
      <div className={styles.portraitStage}>
        <div className={styles.glow} aria-hidden />
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

      <div className={styles.infoPanel}>
        <div className={styles.identityRow}>
          <div className={styles.identity}>
            <p className={styles.kicker}>Player Card</p>
            <h2>{player.name}</h2>
            <span>{player.className ?? "Klasse unbekannt"}</span>
          </div>
          <div className={styles.classIcon} aria-label={player.className ?? "Klasse unbekannt"}>
            {player.classIconUrl ? (
              <img src={player.classIconUrl} alt="" draggable={false} />
            ) : (
              <span>{player.classIconFallback ?? "?"}</span>
            )}
          </div>
        </div>

        <div className={styles.compactStatsRow}>
          <div className={styles.compactStats} aria-label="Spielerwerte">
            <span>Level {level}</span>
            <span>{role}</span>
            <span>HoF {hof}</span>
          </div>
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

        <TrendPanel
          periods={player.trends ?? []}
          development={development}
          developmentLoading={developmentLoading}
          developmentError={developmentError}
          developmentResolved={developmentResolved}
        />
      </div>
    </article>
  );
}

function TrendPanel({
  periods,
  development,
  developmentLoading,
  developmentError,
  developmentResolved,
}: {
  periods: LocalPlayerTrendPeriod[];
  development?: PlayerCardDevelopmentSummary | null;
  developmentLoading: boolean;
  developmentError: string | null;
  developmentResolved: boolean;
}) {
  const hasDevelopmentProps = development !== undefined || developmentLoading || developmentResolved || Boolean(developmentError);
  return (
    <section className={styles.trendPanel} aria-label="Entwicklung">
      <div className={styles.trendHeading}>
        <h3>Entwicklung</h3>
        <span>Gildenvergleich</span>
      </div>
      {hasDevelopmentProps ? (
        <DevelopmentPanel
          development={development ?? null}
          loading={developmentLoading}
          error={developmentError}
          resolved={developmentResolved}
        />
      ) : periods.length ? (
        <div className={styles.trendRows}>
          {periods.map((period) => (
            <div key={period.key} className={styles.trendRow}>
              <div className={styles.trendPeriod}>
                <strong>
                  {period.label} · {period.days} Tage
                </strong>
              </div>
              <TrendMetric metric={period.xp} />
              <TrendMetric metric={period.baseStats} />
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.trendEmpty}>Keine Vergleichsdaten</div>
      )}
    </section>
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
  if (loading) return <DevelopmentSkeleton />;
  if (error) return <div className={`${styles.developmentBody} ${styles.trendEmpty}`}>{error}</div>;
  if (!development) {
    return <div className={`${styles.developmentBody} ${styles.trendEmpty}`}>{resolved ? "Keine Vergleichsdaten" : "Keine Vergleichsdaten"}</div>;
  }

  return (
    <div className={styles.developmentBody}>
      <div className={styles.developmentPeriod}>
        {formatPlayerCardDevelopmentPeriod(development.selectedTimestamp, development.currentTimestamp, development.elapsedDays)}
      </div>
      <DevelopmentMetric metric={development.baseStats} />
      <DevelopmentMetric metric={development.level} />
    </div>
  );
}

function DevelopmentMetric({ metric }: { metric: PlayerCardDevelopmentMetric }) {
  return (
    <div className={styles.developmentMetric}>
      <h4>{metric.label}</h4>
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
      {[0, 1].map((groupIndex) => (
        <div key={groupIndex} className={styles.developmentMetric}>
          <div className={styles.developmentTitleSkeleton} />
          <div className={styles.developmentLineSkeleton} />
          <div className={styles.developmentLineSkeleton} />
        </div>
      ))}
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

function TrendMetric({ metric }: { metric: LocalPlayerTrendMetric }) {
  const label =
    metric.state === "no-data"
      ? "Keine Vergleichsdaten"
      : metric.state === "insufficient-guild-data"
        ? "Zu wenig Gildendaten"
      : metric.state === "zero"
        ? "Kein Fortschritt"
        : metric.state === "negative"
          ? "Rueckgang"
          : `${metric.segments} Segment${metric.segments === 1 ? "" : "e"}`;

  return (
    <div className={styles.trendMetric} data-state={metric.state} aria-label={`${metric.label}: ${label}`}>
      <span>{metric.label}</span>
      <div className={styles.trendSegments} aria-hidden>
        {[0, 1, 2, 3].map((index) => (
          <i key={index} data-active={metric.state === "negative" || (metric.state === "positive" && index < metric.segments)} />
        ))}
      </div>
    </div>
  );
}
