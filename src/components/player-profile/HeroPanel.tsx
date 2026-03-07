import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PortraitPreview from "../avatar/PortraitPreview";
import type { HeroAction, HeroPanelData } from "./types";
import { CLASSES } from "../../data/classes";
import { toDriveThumbProxy } from "../../lib/urls";
import { guideAssetByKey } from "../../data/guidehub/assets";
import PlayerAttributeBars from "./AttributeBars/PlayerAttributeBars";
import Tooltip from "../ui/Tooltip/Tooltip";
import { HexGauge } from "../ui/HexGauge";
import SectionDividerHeader from "../ui/shared/SectionDividerHeader";

type FreshnessLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | "unknown";
type TranslateFn = (key: string, options?: any) => string;

const computeFreshness = (
  t: TranslateFn,
  lastScanDays?: number | null,
): { level: FreshnessLevel; label: string; hint: string } => {
  if (lastScanDays == null || !Number.isFinite(lastScanDays)) {
    return {
      level: "unknown",
      label: t("playerProfile.heroPanel.states.freshness.unknown.label", { defaultValue: "Unknown" }),
      hint: t("playerProfile.heroPanel.states.freshness.unknown.hint", {
        defaultValue: "Scan history unavailable",
      }),
    };
  }
  const days = Math.max(0, Math.floor(lastScanDays));
  if (days === 0) {
    return {
      level: 0,
      label: t("playerProfile.heroPanel.states.freshness.scannedToday.label", { defaultValue: "Scanned today" }),
      hint: t("playerProfile.heroPanel.states.freshness.scannedToday.hint", { defaultValue: "No rescan needed" }),
    };
  }
  if (days === 1) {
    return {
      level: 1,
      label: t("playerProfile.heroPanel.states.freshness.veryFresh.label", { defaultValue: "Very fresh" }),
      hint: t("playerProfile.heroPanel.states.freshness.veryFresh.hint", { defaultValue: "No rescan needed" }),
    };
  }
  if (days <= 3) {
    return {
      level: 2,
      label: t("playerProfile.heroPanel.states.freshness.fresh.label", { defaultValue: "Fresh" }),
      hint: t("playerProfile.heroPanel.states.freshness.fresh.hint", { defaultValue: "No rescan needed" }),
    };
  }
  if (days <= 7) {
    return {
      level: 3,
      label: t("playerProfile.heroPanel.states.freshness.recent.label", { defaultValue: "Recent" }),
      hint: t("playerProfile.heroPanel.states.freshness.recent.hint", { defaultValue: "Rescan recommended" }),
    };
  }
  if (days <= 14) {
    return {
      level: 4,
      label: t("playerProfile.heroPanel.states.freshness.aging.label", { defaultValue: "Aging" }),
      hint: t("playerProfile.heroPanel.states.freshness.aging.hint", { defaultValue: "Rescan recommended" }),
    };
  }
  if (days <= 30) {
    return {
      level: 5,
      label: t("playerProfile.heroPanel.states.freshness.outdated.label", { defaultValue: "Outdated" }),
      hint: t("playerProfile.heroPanel.states.freshness.outdated.hint", {
        defaultValue: "Rescan strongly recommended",
      }),
    };
  }
  return {
    level: 6,
    label: t("playerProfile.heroPanel.states.freshness.stale.label", { defaultValue: "Stale" }),
    hint: t("playerProfile.heroPanel.states.freshness.stale.hint", { defaultValue: "Rescan strongly recommended" }),
  };
};

const formatAgeLabel = (t: TranslateFn, lastScanDays?: number | null) => {
  if (lastScanDays == null || !Number.isFinite(lastScanDays)) return null;
  const days = Math.max(0, Math.floor(lastScanDays));
  if (days === 0) return t("playerProfile.heroPanel.tooltips.age.today", { defaultValue: "today" });
  if (days === 1) return t("playerProfile.heroPanel.tooltips.age.oneDayAgo", { defaultValue: "1 day ago" });
  return t("playerProfile.heroPanel.tooltips.age.daysAgo", { days, defaultValue: "{{days}} days ago" });
};

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
  const freshness = useMemo(() => computeFreshness(t, data.lastScanDays), [data.lastScanDays, t]);
  const freshnessTooltip = useMemo(() => {
    const lines: string[] = [];
    if (data.lastScanAtLabel) {
      lines.push(
        t("playerProfile.heroPanel.tooltips.lastScanAt", {
          value: data.lastScanAtLabel,
          defaultValue: "Last scan: {{value}}",
        }),
      );
    }
    const ageLabel = formatAgeLabel(t, data.lastScanDays);
    if (ageLabel) {
      lines.push(
        t("playerProfile.heroPanel.tooltips.age.label", {
          value: ageLabel,
          defaultValue: "Age: {{value}}",
        }),
      );
    }
    if (freshness.hint) lines.push(freshness.hint);
    if (!lines.length) return null;
    return (
      <div className="player-profile__freshness-tooltip-lines">
        {lines.map((line, index) => (
          <div key={`${line}-${index}`}>{line}</div>
        ))}
      </div>
    );
  }, [data.lastScanAtLabel, data.lastScanDays, freshness.hint, t]);
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
  const localizedLastScanLabel = formatAgeLabel(t, data.lastScanDays) ?? data.lastScanLabel;

  const heroMetrics = useMemo(() => {
    return data.metrics.map((metric) => {
      if ((metric.label === totalBaseStatsLabel || metric.label === "Total Base Stats") && mode === "total") {
        return { ...metric, label: totalStatsLabel, value: formatNumber(data.totalStatsValue ?? 0) };
      }
      return metric;
    });
  }, [data.metrics, data.totalStatsValue, mode, totalBaseStatsLabel, totalStatsLabel]);
  const potionSlots = data.potionsSlots ?? [];
  const resolvePotionAssetKey = (typeRaw: string | null | undefined, sizeRaw: number | null | undefined) => {
    const sizeVal = typeof sizeRaw === "number" && Number.isFinite(sizeRaw) ? Math.round(sizeRaw) : null;
    const tier =
      sizeVal === 10 ? "small" : sizeVal === 15 ? "medium" : sizeVal === 25 ? "big" : null;
    const type = (typeRaw || "").toLowerCase().trim();
    if (!type) return null;
    if (type === "life") return "eternalpotion";
    const baseMap: Record<string, string> = {
      strength: "strength",
      dexterity: "dexterity",
      intelligence: "int",
      constitution: "con",
      luck: "luckpot",
    };
    const base = baseMap[type];
    if (!base || !tier) return null;
    if (base === "luckpot") {
      // prefer luckpot*, fall back to legacy luck* keys
      const preferred = `luckpot${tier}`;
      const legacy = `luck${tier}`;
      const hasPreferred = !!guideAssetByKey(preferred, 128).id;
      return hasPreferred ? preferred : legacy;
    }
    return `${base}${tier}`;
  };
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
                  <button
                    type="button"
                    className="player-profile__favorite-star-button"
                    onClick={favoriteControl.onToggle}
                    disabled={loading || favoriteControl.disabled}
                    aria-label={favoriteControl.ariaLabel}
                    title={favoriteControl.title ?? favoriteControl.ariaLabel}
                    style={{
                      background: "transparent",
                      border: "none",
                      boxShadow: "none",
                      padding: 4,
                      margin: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: loading || favoriteControl.disabled ? "default" : "pointer",
                      color: favoriteControl.isFavorite ? "#facc15" : "rgba(226, 232, 240, 0.92)",
                      opacity: loading || favoriteControl.disabled ? 0.55 : 1,
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        fontSize: 28,
                        lineHeight: 1,
                        filter: favoriteControl.isFavorite ? "drop-shadow(0 0 6px rgba(250, 204, 21, 0.35))" : "none",
                      }}
                    >
                      {favoriteControl.isFavorite ? "\u2605" : "\u2606"}
                    </span>
                  </button>
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
