import { usePlayerFreshness } from "./usePlayerFreshness";
import PlayerFavoriteStar from "./PlayerFavoriteStar";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PortraitPreview from "../avatar/PortraitPreview";
import type { HeroAction, HeroPanelData } from "./types";
import { CLASSES } from "../../data/classes";
import { toDriveThumbProxy } from "../../lib/urls";
import { guideAssetByKey } from "../../data/guidehub/assets";
import { resolvePotionAssetKey } from "../potions/potionAssets";
import PlayerAttributeBars from "./AttributeBars/PlayerAttributeBars";
import Tooltip from "../ui/Tooltip/Tooltip";
import { HexGauge } from "../ui/HexGauge";
import SectionDividerHeader from "../ui/shared/SectionDividerHeader";


type HeroPanelProps = {
  data: HeroPanelData;
  loading?: boolean;
  onAction?: (action: HeroAction["key"]) => void;
  favoriteControl?: {
    visible: boolean;
    isFavorite: boolean;
    disabled?: boolean;
    ariaLabel: string;
    title?: string;
    onToggle: () => void;
  };
};

function AvatarCircle({ label, size = 40 }: { label: string; size?: number }) {
  const initials = (label || "?")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .slice(0, 2)
    .join("");
  return (
    <div
      className="player-profile__avatar-circle"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {initials || "?"}
    </div>
  );
}

function ClassAvatar({
  className,
  label,
  size = 40,
}: {
  className?: string | null;
  label: string;
  size?: number;
}) {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const target = normalize(className || "");
  const meta =
    CLASSES.find((item) => normalize(item.label) === target) ||
    CLASSES.find((item) => normalize(item.label).startsWith(target) || target.startsWith(normalize(item.label)));

  const iconUrl = meta ? toDriveThumbProxy(meta.iconUrl, size * 2) : null;
  if (!iconUrl) return <AvatarCircle label={label} size={size} />;

  return (
    <div className="player-profile__class-avatar" style={{ width: size, height: size }}>
      <img src={iconUrl} alt="" draggable={false} />
    </div>
  );
}

function HeroPanel({ data, loading, onAction, favoriteControl }: HeroPanelProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"base" | "total">("base");
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const { freshness, freshnessTooltip, ageLabel } = usePlayerFreshness(data.lastScanAtMs, data.lastScanAtLabel);
  const classMeta =
    CLASSES.find((item) => normalize(item.label) === normalize(data.className || "")) ||
    CLASSES.find(
      (item) =>
        normalize(item.label).startsWith(normalize(data.className || "")) ||
        normalize(data.className || "").startsWith(normalize(item.label)),
    );
  const portraitFallbackUrl =
    data.portraitFallbackUrl || (classMeta ? toDriveThumbProxy(classMeta.iconUrl, 420) : undefined) || "/assets/demo-avatar-special.png";
  const portraitFallbackLabel = data.portraitFallbackLabel || data.className || data.playerName;
  const portraitConfig = data.hasPortrait === false ? undefined : data.portrait;

  const formatNumber = (value?: number | null) =>
    typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("de-DE") : "-";
  const totalBaseStatsLabel = t("playerProfile.heroPanel.stats.totalBaseStats", { defaultValue: "Total Base Stats" });
  const totalStatsLabel = t("playerProfile.heroPanel.stats.totalStats", { defaultValue: "Total Stats" });
  const localizedLastScanLabel = ageLabel;

  const heroMetrics = useMemo(() => {
    return data.metrics.map((metric) => {
      if ((metric.label === totalBaseStatsLabel || metric.label === "Total Base Stats") && mode === "total") {
        return { ...metric, label: totalStatsLabel, value: formatNumber(data.totalStatsValue ?? 0) };
      }
      return metric;
    });
  }, [data.metrics, data.totalStatsValue, mode, totalBaseStatsLabel, totalStatsLabel]);
  const potionSlots = data.potionsSlots ?? [];
  const mountAssetThumb = useMemo(() => {
    const alignmentByRace: Record<string, "good" | "evil"> = {
      Human: "good",
      Elf: "good",
      Dwarf: "good",
      Gnome: "good",
      Orc: "evil",
      "Dark Elf": "evil",
      Goblin: "evil",
      Demon: "evil",
    };
    const alignment = data.mountRace ? alignmentByRace[data.mountRace] ?? null : null;
    const mountRaw = data.mountPercentValue as unknown;
    const mountPct = typeof mountRaw === "string" ? parseInt(mountRaw, 10) : mountRaw;
    const tier =
      mountPct === 10 ||
      mountPct === 20 ||
      mountPct === 30 ||
      mountPct === 50
        ? mountPct
        : null;
    if (!alignment || !tier) return null;
    const asset = guideAssetByKey(`mount_${alignment}_${tier}`, 256);
    const url = asset?.id ? toDriveThumbProxy(asset.id, 256) : null;
    return url ?? null;
  }, [data.mountPercentValue, data.mountRace]);

  return (
    <section className="player-profile__hero" aria-busy={loading}>
      <SectionDividerHeader title={t("playerProfile.heroPanel.headerLabel", "PLAYER OVERVIEW")} />
      <div className="player-profile__hero-content">
        <div className="player-profile__hero-portrait">
          <div className="player-profile__identity player-profile__identity--overlay">
            <ClassAvatar className={data.className} label={data.playerName} size={48} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="player-profile__player-name-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  width: "100%",
                }}
              >
                <div className="player-profile__player-name">{data.playerName}</div>
                {favoriteControl?.visible && (
                  <PlayerFavoriteStar
                    isFavorite={favoriteControl.isFavorite}
                    disabled={loading || favoriteControl.disabled}
                    ariaLabel={favoriteControl.ariaLabel}
                    title={favoriteControl.title}
                    onToggle={favoriteControl.onToggle}
                  />
                )}
              </div>
              <div className="player-profile__player-meta">
                <span>{data.className || t("playerProfile.heroPanel.meta.classUnknown", { defaultValue: "Class ?" })}</span>
                {data.guild && <span>• {data.guild}</span>}
                {data.server && <span>• {data.server}</span>}
              </div>
              {localizedLastScanLabel && (
                <div className="player-profile__player-meta player-profile__player-meta--soft">
                  {t("playerProfile.heroPanel.meta.lastScanned", { defaultValue: "Last scanned" })}: {localizedLastScanLabel}
                </div>
              )}
              <Tooltip
                content={freshnessTooltip}
                contentClassName="player-profile__freshness-tooltip-card"
              >
                <div className="player-profile__freshness">
                  <span
                    aria-hidden
                    className={`player-profile__freshness-dot player-profile__freshness-dot--${freshness.level}`}
                  />
                  <span className="player-profile__freshness-label">{freshness.label}</span>
                  <span aria-hidden className="player-profile__freshness-info">ⓘ</span>
                </div>
              </Tooltip>
            </div>
          </div>
          <PortraitPreview
            config={portraitConfig}
            label={data.playerName}
            fallbackImage={portraitFallbackUrl}
            fallbackLabel={portraitFallbackLabel}
          />
        </div>
        <div className="player-profile__hero-body">

          <div className="player-profile__hero-metrics">
          {heroMetrics.map((metric, metricIndex) => {
            if (metric.gauge) {
              const progress = Math.min(1, Math.max(0, metric.gauge.progress || 0));
              const hoverLines =
                metric.gauge.details && metric.gauge.details.length > 0
                  ? metric.gauge.details
                  : metric.gauge.centerBottom
                  ? [metric.gauge.centerBottom]
                  : [];
              const hoverDetails =
                hoverLines.length > 0 ? (
                  <div className="player-profile__hero-metric-hex-details" aria-hidden="true">
                    {hoverLines.map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                  </div>
                ) : undefined;

              return (
                <div key={`${metric.label}-${metricIndex}`} className="player-profile__hero-metric player-profile__hero-metric--gauge">
                  <HexGauge
                    className="player-profile__hero-metric-hex"
                    value={progress}
                    size={124}
                    stroke={10}
                    center={<div className="player-profile__hero-metric-hex-center">{metric.gauge.centerTop}</div>}
                    hoverDetails={hoverDetails}
                  />
                </div>
              );
            }
            const isMountMetric = metricIndex === 0;
            const showMountImage = isMountMetric && !!mountAssetThumb;
            const mountTooltip = `${metric.label}: ${metric.value}`;
            return (
              <div
                key={metric.label}
                className={`player-profile__hero-metric${showMountImage ? " player-profile__hero-metric--mount-icon" : ""}`}
              >
                {!showMountImage && <div className="player-profile__hero-metric-label">{metric.label}</div>}
                {showMountImage ? (
                  <Tooltip content={mountTooltip}>
                    <div className="player-profile__hero-metric-value player-profile__hero-metric-value--mount-image">
                      <img
                        src={mountAssetThumb}
                        alt=""
                        className="player-profile__hero-mount-image"
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                      />
                    </div>
                  </Tooltip>
                ) : (
                  <div className="player-profile__hero-metric-value">{metric.value}</div>
                )}
                {metric.hint && <div className="player-profile__hero-metric-hint">{metric.hint}</div>}
              </div>
            );
          })}
        </div>

        {data.baseStats && (
          <PlayerAttributeBars
            baseStats={data.baseStats}
            totalStats={data.totalStats}
            benchmarks={data.baseStatBenchmarks}
            mode={mode}
            onModeChange={setMode}
          />
        )}

          {(data.badges.length > 0 || potionSlots.length > 0) && (
            <div className="player-profile__hero-meta-row">
            {potionSlots.length > 0 && (
              <div className="player-profile__hero-potions-inline">
                <span className="player-profile__hero-potion-label">
                  {t("playerProfile.heroPanel.potions.activeLabel", { defaultValue: "Active potions:" })}
                </span>
                <div
                  className="player-profile__hero-potion-row"
                  role="list"
                  aria-label={t("playerProfile.heroPanel.potions.ariaLabel", { defaultValue: "Potion slots" })}
                >
                  {[1, 2, 3].map((slot) => {
                    const slotData = potionSlots.find((item) => item.slot === slot) || null;
                    const isEmpty = !slotData?.type && slotData?.size == null;
                    const assetKey = resolvePotionAssetKey(slotData?.type ?? null, slotData?.size ?? null);
                    const asset = assetKey ? guideAssetByKey(assetKey, 128) : null;
                    return (
                      <div
                        key={slot}
                        className={`player-profile__hero-potion-card player-profile__hero-potion-card--slot${slot}${
                          isEmpty ? " player-profile__hero-potion-card--empty" : ""
                        }`}
                        role="listitem"
                        aria-label={t(`playerProfile.heroPanel.potions.slot${slot}`, { defaultValue: `Potion ${slot}` })}
                      >
                        {asset?.thumb ? (
                          <img
                            src={asset.thumb}
                            alt={t(`playerProfile.heroPanel.potions.slot${slot}`, { defaultValue: `Potion ${slot}` })}
                            className="player-profile__hero-potion-icon"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span className="player-profile__hero-potion-placeholder" aria-hidden="true" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {data.badges.length > 0 && (
              <div className="player-profile__hero-badges">
                {data.badges.map((badge) => (
                  <span
                    key={badge.label}
                    className={`player-profile__hero-badge player-profile__hero-badge--${badge.tone || "neutral"}`}
                    title={badge.hint}
                  >
                    {badge.icon && <span aria-hidden className="player-profile__hero-badge-icon">{badge.icon}</span>}
                    <span>{badge.label}</span>
                    <strong>{badge.value}</strong>
                  </span>
                ))}
              </div>
            )}
            </div>
          )}

          {data.actions.length > 0 && (
            <div className="player-profile__hero-actions">
            {data.actions.map((action) => (
              <button
                key={action.key}
                className="player-profile__hero-action"
                type="button"
                disabled={loading || action.disabled}
                title={action.title}
                onClick={() => onAction?.(action.key)}
              >
                {action.label}
              </button>
            ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default React.memo(HeroPanel);
