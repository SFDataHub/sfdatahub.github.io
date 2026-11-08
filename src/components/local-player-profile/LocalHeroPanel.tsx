import { profileLocale, profilePercent, profileClassLabel } from "../../lib/i18n/profilePresentation";
import { usePlayerFreshness } from "../player-profile/usePlayerFreshness";
import { useProfileAttributeSumMode } from "../../lib/settings/usePreferences";
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import AttributeCompositionCard from "../attribute-composition/AttributeCompositionCard";
import type { AttributeCompositionModel } from "../attribute-composition/attributeCompositionModel";
import PortraitPreview from "../avatar/PortraitPreview";
import PlayerAttributeBars from "../player-profile/AttributeBars/PlayerAttributeBars";
import Tooltip from "../ui/Tooltip/Tooltip";
import { HexGauge } from "../ui/HexGauge";
import { CLASSES } from "../../data/classes";
import { guideAssetByKey } from "../../data/guidehub/assets";
import { toDriveThumbProxy } from "../../lib/urls";
import { resolvePotionAssetKey } from "../potions/potionAssets";
import type { LocalHeroPanelData } from "./types";
import LocalPlayerCompactHeader from "./LocalPlayerCompactHeader";
import "../../pages/players/player-profile.css";

import type { PlayerContentView as ContentView } from "../../lib/local-player-profile/viewCharts";

function LocalProfileViewToggle({ activeView, hasTotalStats, onViewChange }: {
  activeView: ContentView;
  hasTotalStats: boolean;
  onViewChange: (view: ContentView) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="local-profile-view-toggle" role="group"
      aria-label={t("playerProfile.heroPanel.stats.attributeBars.viewModeAriaLabel", { defaultValue: "Attribute view" })}>
      {(["general", "progress", "base", "total", "fortress"] as const).map(view => (
        <button key={view} type="button" aria-pressed={activeView === view}
          disabled={view === "total" && !hasTotalStats} onClick={() => onViewChange(view)}>
          {t(`playerProfile.heroPanel.stats.attributeBars.mode${view[0].toUpperCase() + view.slice(1)}`, {
            defaultValue: view[0].toUpperCase() + view.slice(1),
          })}
        </button>
      ))}
    </div>
  );
}


type LocalHeroPanelProps = {
  data: LocalHeroPanelData;
  auditInput?: object;
  favoriteAction?: React.ReactNode;
  guildEmblem?: React.ReactNode;
  generalGuildName?: string | null;
  generalOriginServer?: string | null;
  comparisonSelect?: React.ReactNode;
  contentView?: ContentView;
  onContentViewChange?: (view: ContentView) => void;
  loading?: boolean;
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

function LocalHeroPanel({ data, loading, auditInput, favoriteAction, guildEmblem, generalGuildName, generalOriginServer, comparisonSelect, contentView, onContentViewChange }: LocalHeroPanelProps) {
  const { t, i18n } = useTranslation();
  const [lastAttributeMode, setMode] = useState<"base" | "total">("base");
  const mode = contentView === "base" || contentView === "total" ? contentView : lastAttributeMode;
  // Non-attribute views are transient; keep the last attribute mode and its data intact.
  const [localEmptyView, setEmptyView] = useState<Exclude<ContentView, "base" | "total"> | null>(null);
  const emptyView = contentView ? contentView === "base" || contentView === "total" ? null : contentView : localEmptyView;
  const portraitFrameRef = useRef<HTMLDivElement | null>(null);
  const portraitModuleRef = useRef<HTMLDivElement | null>(null);
  const freshnessRef = useRef<HTMLDivElement | null>(null);
  const attributeModeRef = useRef<HTMLDivElement | null>(null);
  const attributeSummaryRef = useRef<HTMLElement | null>(null);
  const compactPortraitId = React.useId();
  const [portraitLayout, setPortraitLayout] = useState({ scale: 1, height: 0 });
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
  const portraitFallbackLabel = data.className ? t("profileI18n.classPortrait", { name: profileClassLabel(data.className) }) : t("profileI18n.portraitPlaceholder");
  const portraitConfig = data.hasPortrait === false ? undefined : data.portrait;

  const formatNumber = (value?: number | null) =>
    typeof value === "number" && Number.isFinite(value) ? value.toLocaleString(profileLocale()) : "-";
  const totalBaseStatsLabel = t("playerProfile.heroPanel.stats.totalBaseStats", { defaultValue: "Total Base Stats" });
  const totalStatsLabel = t("playerProfile.heroPanel.stats.totalStats", { defaultValue: "Total Stats" });
  const localizedLastScanLabel = ageLabel;

  const attributeSumMode = useProfileAttributeSumMode();
  const heroMetrics = useMemo(() => {
    return data.metrics.map((metric) => {
      if (metric.label === totalBaseStatsLabel || metric.label === "Total Base Stats") {
        const sums = data.profileAttributeSums?.[attributeSumMode];
        return { ...metric, label: mode === "total" ? totalStatsLabel : totalBaseStatsLabel,
          value: sums ? formatNumber(mode === "total" ? sums.total : sums.base)
            : attributeSumMode === "all-five" ? formatNumber(null) : mode === "total" ? formatNumber(data.totalStatsValue ?? null) : metric.value };
      }
      const raw = data.metricValues;
      const labelKey: Record<string, string> = { Mount: "mount", Level: "level", Scrapbook: "scrapbook" };
      const label = labelKey[metric.label] ? t("playerProfile.heroPanel.stats." + labelKey[metric.label]) : metric.label;
      if (metric.label === "Mount") return { ...metric, label, value: data.mountPercentValue == null ? "-" : profilePercent(Math.round(data.mountPercentValue)) };
      if (raw && metric.label === "Level") {
        const value = t("profileI18n.levelValue", { value: formatNumber(raw.level) });
        return { ...metric, label, value, gauge: metric.gauge && { ...metric.gauge, centerTop: value,
          centerBottom: profilePercent(Math.round(metric.gauge.progress * 100)),
          details: [t("profileI18n.xpValue", { value: formatNumber(raw.xp) }), t("profileI18n.xpRequiredValue", { value: formatNumber(raw.xpNext) })] } };
      }
      if (raw && metric.label === "Scrapbook") {
        const value = raw.scrapbookRatio == null ? "-" : profilePercent(raw.scrapbookRatio * 100, 2);
        const count = raw.scrapbookCount == null ? "-" : formatNumber(raw.scrapbookCount) + " / " + formatNumber(raw.scrapbookMaximum);
        return { ...metric, label, value, gauge: metric.gauge && { ...metric.gauge, centerTop: value, centerBottom: count, details: [count] } };
      }
      return { ...metric, label };
    });
  }, [data.metrics, data.metricValues, data.mountPercentValue, data.totalStatsValue, data.profileAttributeSums, attributeSumMode, mode, totalBaseStatsLabel, totalStatsLabel, t, i18n.resolvedLanguage]);

  const potionSlots = data.potionsSlots ?? [];
  const hasActivePotions = potionSlots.some((slot) => Boolean(slot.type) || slot.size != null);
  const potionSlotRow = hasActivePotions ? (
    <div className="player-profile__hero-potions-inline player-profile__hero-potions-inline--local-profile">
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
  ) : null;
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
    const tier = mountPct === 10 || mountPct === 20 || mountPct === 30 || mountPct === 50 ? mountPct : null;
    if (!alignment || !tier) return null;
    const asset = guideAssetByKey(`mount_${alignment}_${tier}`, 256);
    const url = asset?.id ? toDriveThumbProxy(asset.id, 256) : null;
    return url ?? null;
  }, [data.mountPercentValue, data.mountRace]);

  const heroMetricCards = heroMetrics.map((metric, metricIndex) => {
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
          <div>
            {hoverLines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        ) : undefined;

      return (
        <div key={`${metric.label}-${metricIndex}`} className="player-profile__hero-metric player-profile__hero-metric--gauge">
          <Tooltip content={hoverDetails}>
            <div tabIndex={0} aria-label={metric.label} style={{ display: "flex" }}>
              <HexGauge
                className="player-profile__hero-metric-hex"
                value={progress}
                size={96}
                stroke={8}
                center={<div className="player-profile__hero-metric-hex-center">{metric.gauge.centerTop}</div>}
              />
            </div>
          </Tooltip>
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
  });

  const attributeSumMetricIndex = data.metrics.findIndex(
    (metric) => metric.label === totalBaseStatsLabel || metric.label === "Total Base Stats",
  );
  const remainingMetricCards = heroMetricCards.filter((_, index) => index >= 3 && index !== attributeSumMetricIndex);

  useLayoutEffect(() => {
    const frame = portraitFrameRef.current;
    const module = portraitModuleRef.current;
    if (!frame || !module) return;

    const updatePortraitLayout = () => {
      const availableWidth = frame.clientWidth;
      const naturalWidth = module.offsetWidth;
      const naturalHeight = module.offsetHeight;
      if (availableWidth <= 0 || naturalWidth <= 0 || naturalHeight <= 0) return;

      const nextScale = Math.min(1, availableWidth / naturalWidth);
      const nextHeight = Math.ceil(naturalHeight * nextScale);
      setPortraitLayout((current) =>
        Math.abs(current.scale - nextScale) < 0.001 && Math.abs(current.height - nextHeight) < 1
          ? current
          : { scale: nextScale, height: nextHeight },
      );
    };

    updatePortraitLayout();
    const observer = new ResizeObserver(updatePortraitLayout);
    observer.observe(frame);
    observer.observe(module);
    window.addEventListener("resize", updatePortraitLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePortraitLayout);
    };
  }, []);

  useLayoutEffect(() => {
    const summary = attributeSummaryRef.current;
    const toggle = attributeModeRef.current?.querySelector<HTMLElement>(".local-profile-view-toggle");
    const header = summary?.closest(".profile-overlay__content--local")?.parentElement
      ?.querySelector<HTMLElement>(".profile-overlay__local-header");
    const title = header?.querySelector<HTMLElement>(".profile-overlay__local-title");
    const line = title?.querySelector<HTMLElement>(".local-profile-title-side > span");
    if (!summary || !toggle || !header || !title || !line) return;

    const alignAttributes = () => {
      const card = summary.querySelector<HTMLElement>(".player-profile__attribute-bars");
      if (card) summary.style.setProperty("--local-profile-attribute-height", `${card.getBoundingClientRect().height}px`);
      const current = parseFloat(summary.style.getPropertyValue("--local-profile-attribute-start")) || 0;
      // Read the title's normal-flow clearance, including while its header is sticky.
      const clearance = parseFloat(getComputedStyle(header).paddingBottom)
        + (title.getBoundingClientRect().height - line.getBoundingClientRect().height) / 2;
      const next = window.matchMedia("(min-width: 901px)").matches
        ? toggle.getBoundingClientRect().bottom + clearance - (summary.getBoundingClientRect().top - current)
        : 0;
      if (Math.abs(next - current) > 0.01) summary.style.setProperty("--local-profile-attribute-start", `${next}px`);
    };
    alignAttributes();
    const observer = new ResizeObserver(alignAttributes);
    for (const element of [summary, toggle, header]) observer.observe(element);
    window.addEventListener("resize", alignAttributes);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", alignAttributes);
    };
  }, [Boolean(data.baseStats)]);

  const portraitFrameStyle = {
    "--local-profile-portrait-scale": portraitLayout.scale,
    "--local-profile-portrait-frame-height": portraitLayout.height ? `${portraitLayout.height}px` : undefined,
  } as React.CSSProperties;

  const renderFreshness = (compact = false) => (
    <Tooltip content={freshnessTooltip} contentClassName="player-profile__freshness-tooltip-card">
      <div ref={compact ? undefined : freshnessRef} className="player-profile__freshness" data-local-player-freshness={compact ? undefined : ""}>
        <span
          aria-hidden
          className={`player-profile__freshness-dot player-profile__freshness-dot--${freshness.level}`}
        />
        <span className="player-profile__freshness-label">{freshness.label}</span>
        <span aria-hidden className="player-profile__freshness-info">{"\u24d8"}</span>
      </div>
    </Tooltip>
  );
  const hasTotalStats = Object.values(data.totalStats ?? {}).some(value => typeof value === "number" && Number.isFinite(value));
  const activeMode = mode === "total" && hasTotalStats ? "total" : "base";
  const activeView = contentView ?? emptyView ?? activeMode;
  const selectView = (view: ContentView) => {
    if (view === "base" || view === "total") {
      if (view === "total" && !hasTotalStats) return;
      setMode(view);
      setEmptyView(null);
    } else {
      setEmptyView(view);
    }
    onContentViewChange?.(view);
  };

  return (
    <>
      <section className="player-profile__hero player-profile__hero--local-profile" aria-busy={loading}>
        <div ref={portraitFrameRef} className="player-profile__hero-portrait-frame--local" style={portraitFrameStyle}>
          <div ref={portraitModuleRef} className="player-profile__hero-portrait player-profile__hero-portrait--local">
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
                  {favoriteAction}
                </div>
                <div className="player-profile__player-meta">
                  <span>{profileClassLabel(data.className)}</span>
                  {data.guild && <span>{"\u2022"} {data.guild}</span>}
                  {data.server && <span>{"\u2022"} {data.server}</span>}
                </div>
                {localizedLastScanLabel && (
                  <div className="player-profile__player-meta player-profile__player-meta--soft">
                    {t("playerProfile.heroPanel.meta.lastScanned", { defaultValue: "Last scanned" })}: {localizedLastScanLabel}
                  </div>
                )}
                {renderFreshness()}
              </div>
            </div>
            <PortraitPreview
              config={portraitConfig}
              label={data.playerName}
              fallbackImage={portraitFallbackUrl}
              fallbackLabel={portraitFallbackLabel}
            />
          </div>
        </div>
        {potionSlotRow}
        {remainingMetricCards.length > 0 && (
          <div className="player-profile__hero-metrics player-profile__hero-metrics--local-compact">
            {remainingMetricCards}
          </div>
        )}
      </section>

      <div className="player-profile__hero-metrics player-profile__hero-metrics--local-compact player-profile__hero-metrics--column-four">
        {guildEmblem}
        {heroMetricCards[1]}
        {heroMetricCards[2]}
        {heroMetricCards[0]}
      </div>

      {data.baseStats && (
        <div ref={attributeModeRef} className="local-profile-attribute-mode">
          <LocalProfileViewToggle activeView={activeView} hasTotalStats={hasTotalStats} onViewChange={selectView} />
        </div>
      )}

      <section ref={attributeSummaryRef} className="player-profile__hero player-profile__hero--local-summary" aria-busy={loading}>
        <div className="player-profile__hero-summary-grid">
          <div className="player-profile__hero-summary-base-stats" data-empty-view={emptyView ? "" : undefined}>
            {activeView === "general" && (
              <div className="local-profile-player-info">
                <h3>{t("playerProfile.heroPanel.playerInfo.title", { defaultValue: "Player Info" })}</h3>
                <dl>
                  <div><dt>{t("localProfileRoute.ogServer")}</dt><dd>{generalOriginServer ?? "-"}</dd></div>
                  <div><dt>{t("playerProfile.heroPanel.playerInfo.hallOfFame", { defaultValue: "Hall of Fame" })}</dt><dd>{data.playerInfo?.hofRank != null ? `#${formatNumber(data.playerInfo.hofRank)}` : "-"}</dd></div>
                  <div><dt>{t("playerProfile.heroPanel.stats.honor")}</dt><dd>{formatNumber(data.playerInfo?.honor)}</dd></div>
                  <div className="local-profile-player-info-guild"><dt>{t("playerProfile.heroPanel.stats.attributeBars.guild")}</dt><dd>{generalGuildName ?? data.guild ?? "-"}</dd></div>
                  <div><dt>{t("playerProfile.heroPanel.stats.guildRole")}</dt><dd>{data.playerInfo?.roleKey ? t(`playerProfile.heroPanel.playerInfo.roles.${data.playerInfo.roleKey}`) : data.playerInfo?.guildRole ?? "-"}</dd></div>
                </dl>
              </div>
            )}
            {activeView === "progress" && (
              <div className="local-profile-player-info">
                <h3>{t("playerProfile.heroPanel.stats.attributeBars.modeProgress")}</h3>
                <dl>
                  <div><dt>{t("playerProfile.heroPanel.stats.level")}</dt><dd>{formatNumber(data.playerInfo?.level)}</dd></div>
                </dl>
              </div>
            )}
            {activeView === "fortress" && (
              <div className="local-profile-player-info local-profile-fortress-info">
                <h3>{t("playerProfile.heroPanel.stats.attributeBars.modeFortress")}</h3>
                <div className="local-profile-fortress-groups">
                  {([
                    ["fortress", "quarters", "woodcutter", "quarry", "gemMine", "academy"],
                    ["archeryGuild", "barracks", "mageTower", "treasury", "smithy", "fortifications"],
                  ] as const).map((group, index) => (
                    <dl key={index}>
                      {group.map(key => (
                        <div key={key}><dt>{t(`playerProfile.statsTab.fortress.labels.${key}`)}</dt><dd>{formatNumber(data.fortressBuildings?.[key])}</dd></div>
                      ))}
                    </dl>
                  ))}
                </div>
              </div>
            )}
            {data.baseStats && (
              <div className="local-profile-attribute-content" aria-hidden={emptyView ? true : undefined}>
                <PlayerAttributeBars
                  auditInput={auditInput}
                  baseStats={data.baseStats}
                  totalStats={data.totalStats}
                  mode={mode}
                  onModeChange={setMode}
                  headerEnd={
                    <div className="player-profile__hero-metrics player-profile__hero-metrics--local-compact local-profile-attribute-sum">
                      {heroMetricCards[attributeSumMetricIndex]}
                    </div>
                  }
                />
              </div>
            )}
          </div>
        </div>
      </section>

      <LocalPlayerCompactHeader expandedRef={portraitModuleRef} freshnessRef={freshnessRef} geometryKey={data}
        name={data.playerName}
        portrait={<PortraitPreview config={portraitConfig} label={data.playerName} fallbackImage={portraitFallbackUrl}
          fallbackLabel={portraitFallbackLabel} canvasId={`local-player-compact-${compactPortraitId}`} showStatus={false} />}
        freshness={renderFreshness(true)}
        comparisonSelect={comparisonSelect}
        modes={data.baseStats && <LocalProfileViewToggle activeView={activeView} hasTotalStats={hasTotalStats}
          onViewChange={selectView} />}
      />

    </>
  );
}

export function AttributeCompositionDetailOverlay({
  composition,
  isOpen,
  onClose,
}: {
  composition?: AttributeCompositionModel;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [isOpen, onClose]);

  if (!isOpen || !composition) return null;

  return createPortal(
    <div className="attribute-composition-detail-overlay" onClick={onClose}>
      <div
        className="attribute-composition-detail-overlay__panel"
        role="dialog"
        aria-modal="true"
        aria-label={t("playerProfile.statsTab.attrComposition.title")}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="attribute-composition-detail-overlay__header">
          <button
            type="button"
            className="attribute-composition-detail-overlay__close"
            onClick={onClose}
            aria-label={t("profileI18n.closeComposition")}
            title={t("localProfileRoute.close")}
          >
            X
          </button>
        </header>
        <div className="attribute-composition-detail-overlay__body sfdatahub-scrollbar">
          <AttributeCompositionCard
            attributes={composition.attributes}
            className="player-profile__stats-panel player-profile__stats-panel--attributes"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default React.memo(LocalHeroPanel);
