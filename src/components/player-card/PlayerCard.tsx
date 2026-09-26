import React from "react";
import PortraitPreview from "../avatar/PortraitPreview";
import type { LocalPlayerTrendMetric, LocalPlayerTrendPeriod } from "../../lib/player-progress/localPlayerTrend";
import type { PlayerCardData, PlayerCardBadgeValue } from "./types";
import styles from "./PlayerCard.module.css";

type PlayerCardProps = {
  player: PlayerCardData;
  className?: string;
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

export default function PlayerCard({ player, className }: PlayerCardProps) {
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

        <TrendPanel periods={player.trends ?? []} />
      </div>
    </article>
  );
}

function TrendPanel({ periods }: { periods: LocalPlayerTrendPeriod[] }) {
  return (
    <section className={styles.trendPanel} aria-label="Entwicklung">
      <div className={styles.trendHeading}>
        <h3>Entwicklung</h3>
        <span>Gildenvergleich</span>
      </div>
      {periods.length ? (
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
