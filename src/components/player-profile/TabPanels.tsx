import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { guideAssetUrlByKey } from "../../data/guidehub/assets";
import Tooltip from "../ui/Tooltip/Tooltip";
import type {
  ComparisonRow,
  StatsTabModel,
  TimelineEntry,
  TrendSeries,
} from "./types";
import AnchoredLineCard from "../ui/charts/AnchoredLineCard";
import ServerComparisonMultiLineChart, {
  type ServerComparisonExternalData,
} from "../ui/ServerComparisonMultiLineChart";
import {
  PLAYER_PROGRESS_CHART_METRIC_CONFIG,
  PLAYER_PROGRESS_CHART_SECTION_ORDER,
  usePlayerProgressSnapshots,
} from "../../lib/player-progress/usePlayerProgressSnapshots";
import {
  ATTRIBUTE_COMPOSITION_SHADE_ACCENT_WEIGHTS,
  ATTRIBUTE_COMPOSITION_SHADE_MIX_BG,
  getPlayerStatAccentColor,
  getPlayerStatAccentRgbString,
  mixHexColors,
} from "./statAccents";

type MetricKind = "number" | "percent" | "rank";
type FieldRow = {
  label: string;
  value: string;
  icon?: {
    placeholder: string;
    assetKey?: string;
  };
};
type TranslateFn = (key: string, options?: any) => string;

const DASH = "â€”";
const FORTRESS_GUIDE_LINKS = {
  overview: "/guidehub-v2?tab=gamefeatures&sub=fortress",
  calculator: "/guidehub?tab=gamefeatures&sub=fortress&sub2=fortress-calculator",
  packageSkipOrder: "/guidehub?tab=gamefeatures&sub=fortress&sub2=fortress-package-skip-order",
  attackDuplication: "/guidehub?tab=gamefeatures&sub=fortress&sub2=fortress-attack-duplication",
} as const;

type AttributeCompositionSourceKey =
  | "base"
  | "baseItems"
  | "upgrades"
  | "equipment"
  | "gems"
  | "pet"
  | "potion"
  | "petBonus"
  | "other";

type AttributeCompositionSegment = {
  sourceKey: AttributeCompositionSourceKey;
  label: string;
  value: number;
  widthPct: number;
  iconPlaceholder: string;
  shadeIndex: number;
  isBarSegment: boolean;
  isInteractive: boolean;
};

const FORTRESS_BUILDING_ICON_KEYS: Record<
  string,
  { baseKeyPrefix: string; maxLevel: number; plusKey?: string; placeholder: string }
> = {
  "playerProfile.statsTab.fortress.labels.fortress": {
    baseKeyPrefix: "fortresslevel",
    maxLevel: 20,
    placeholder: "FO",
  },
  "playerProfile.statsTab.fortress.labels.upgrades": {
    baseKeyPrefix: "blacksmithlevel",
    maxLevel: 20,
    placeholder: "UP",
  },
  "playerProfile.statsTab.fortress.labels.fortifications": {
    baseKeyPrefix: "fortificationlevel",
    maxLevel: 20,
    placeholder: "FT",
  },
  "playerProfile.statsTab.fortress.labels.woodcutter": {
    baseKeyPrefix: "woodcuttershutlevel",
    maxLevel: 20,
    placeholder: "WC",
  },
  "playerProfile.statsTab.fortress.labels.quarry": {
    baseKeyPrefix: "quarrylevel",
    maxLevel: 20,
    placeholder: "QU",
  },
  "playerProfile.statsTab.fortress.labels.gemMine": {
    baseKeyPrefix: "gemminelevel",
    maxLevel: 19,
    plusKey: "gemminelevel20plus",
    placeholder: "GM",
  },
  "playerProfile.statsTab.fortress.labels.treasury": {
    baseKeyPrefix: "treasurylevel",
    maxLevel: 14,
    plusKey: "treasurylevel15plus",
    placeholder: "TR",
  },
  "playerProfile.statsTab.fortress.labels.barracks": {
    baseKeyPrefix: "barrackslevel",
    maxLevel: 15,
    placeholder: "BA",
  },
  "playerProfile.statsTab.fortress.labels.mageTower": {
    baseKeyPrefix: "magestowerlevel",
    maxLevel: 15,
    placeholder: "MT",
  },
  "playerProfile.statsTab.fortress.labels.archeryGuild": {
    baseKeyPrefix: "archeryguildlevel",
    maxLevel: 15,
    placeholder: "AG",
  },
  "playerProfile.statsTab.fortress.labels.wall": {
    baseKeyPrefix: "fortificationlevel",
    maxLevel: 20,
    placeholder: "WL",
  },
  "playerProfile.statsTab.fortress.labels.academy": {
    baseKeyPrefix: "academylevel",
    maxLevel: 20,
    placeholder: "AC",
  },
  "playerProfile.statsTab.fortress.labels.smithy": {
    baseKeyPrefix: "blacksmithlevel",
    maxLevel: 20,
    placeholder: "SM",
  },
  "playerProfile.statsTab.fortress.labels.portal": {
    baseKeyPrefix: "fortresslevel",
    maxLevel: 20,
    placeholder: "PO",
  },
  "playerProfile.statsTab.fortress.labels.space": {
    baseKeyPrefix: "laborersquarterlevel",
    maxLevel: 15,
    placeholder: "SP",
  },
  "playerProfile.statsTab.fortress.labels.quarters": {
    baseKeyPrefix: "laborersquarterlevel",
    maxLevel: 15,
    placeholder: "LQ",
  },
};

const ATTRIBUTE_COMPOSITION_SOURCE_META: Record<
  AttributeCompositionSourceKey,
  { iconPlaceholder: string; shadeIndex: number }
> = {
  base: { iconPlaceholder: "BA", shadeIndex: -1 },
  baseItems: { iconPlaceholder: "BI", shadeIndex: 0 },
  upgrades: { iconPlaceholder: "UP", shadeIndex: 1 },
  equipment: { iconPlaceholder: "EQ", shadeIndex: 2 },
  gems: { iconPlaceholder: "GM", shadeIndex: 3 },
  pet: { iconPlaceholder: "PB", shadeIndex: 4 },
  potion: { iconPlaceholder: "PO", shadeIndex: 5 },
  petBonus: { iconPlaceholder: "PC", shadeIndex: 5 },
  other: { iconPlaceholder: "OT", shadeIndex: 2 },
};

const ATTRIBUTE_COMPOSITION_BASE_ACCENT_WEIGHT = 0.16;
const ATTRIBUTE_COMPOSITION_OTHER_ACCENT_WEIGHT = 0.35;

function getAttributeCompositionSegmentFill(
  attrCode: string,
  sourceKey: AttributeCompositionSourceKey,
  shadeIndex: number,
) {
  const statAccent = getPlayerStatAccentColor(attrCode);
  const isClampedStat = attrCode === "dex" || attrCode === "lck";
  if (sourceKey === "base") {
    return mixHexColors(ATTRIBUTE_COMPOSITION_SHADE_MIX_BG, statAccent, ATTRIBUTE_COMPOSITION_BASE_ACCENT_WEIGHT);
  }
  if (sourceKey === "other") {
    return mixHexColors(ATTRIBUTE_COMPOSITION_SHADE_MIX_BG, statAccent, ATTRIBUTE_COMPOSITION_OTHER_ACCENT_WEIGHT);
  }
  const weight =
    ATTRIBUTE_COMPOSITION_SHADE_ACCENT_WEIGHTS[
      Math.max(0, Math.min(ATTRIBUTE_COMPOSITION_SHADE_ACCENT_WEIGHTS.length - 1, shadeIndex))
    ];
  const effectiveWeight = isClampedStat ? Math.max(0, weight - 0.05) : weight;
  return mixHexColors(ATTRIBUTE_COMPOSITION_SHADE_MIX_BG, statAccent, effectiveWeight);
}

function getAttributeCompositionRowStyle(attrCode: string): React.CSSProperties {
  return {
    ["--pp-attr-stat-accent" as const]: getPlayerStatAccentColor(attrCode),
    ["--pp-attr-stat-accent-rgb" as const]: getPlayerStatAccentRgbString(attrCode),
  } as React.CSSProperties;
}

function getAttributeCompositionSegmentStyle(
  attrCode: string,
  segment: Pick<AttributeCompositionSegment, "sourceKey" | "shadeIndex" | "widthPct">,
): React.CSSProperties {
  return {
    width: `${segment.widthPct}%`,
    ["--pp-attr-segment-fill" as const]: getAttributeCompositionSegmentFill(attrCode, segment.sourceKey, segment.shadeIndex),
  } as React.CSSProperties;
}

export function StatsTab({ data }: { data: StatsTabModel }) {
  return <PlayerStatsTabV2 data={data} />;
}

function PlayerStatsTabV2({ data }: { data: StatsTabModel }) {
  const { t } = useTranslation();
  const [hoveredAttrCode, setHoveredAttrCode] = React.useState<string | null>(null);
  const [hoveredSourceKey, setHoveredSourceKey] = React.useState<AttributeCompositionSourceKey | null>(null);

  const combatRows: Array<{ labelKey: string; value: number | null; kind?: MetricKind }> = [
    { labelKey: "playerProfile.statsTab.combat.armor", value: data.combat.armor },
    { labelKey: "playerProfile.statsTab.combat.health", value: data.combat.health },
    { labelKey: "playerProfile.statsTab.combat.damageMin", value: data.combat.dmgMin },
    { labelKey: "playerProfile.statsTab.combat.damageMax", value: data.combat.dmgMax },
    { labelKey: "playerProfile.statsTab.combat.damageAvg", value: data.combat.dmgAvg },
    {
      labelKey: "playerProfile.statsTab.combat.weaponDamageMultiplier",
      value: data.combat.weaponDamageMultiplier,
    },
    {
      labelKey: "playerProfile.statsTab.combat.maximumDamageReduction",
      value: data.combat.maximumDamageReduction,
      kind: "percent",
    },
  ];

  const potionHasAnyData =
    data.potions.lifePotion != null || data.potions.slots.some((slot) => slot.type != null || slot.size != null);

  const runeRows: Array<{
    labelKey: string;
    value: number | null;
    icon: NonNullable<FieldRow["icon"]>;
  }> = [
    { labelKey: "playerProfile.statsTab.runes.gold", value: data.runes.gold, icon: { placeholder: "G", assetKey: "goldrune" } },
    { labelKey: "playerProfile.statsTab.runes.xp", value: data.runes.xp, icon: { placeholder: "XP", assetKey: "xprune" } },
    { labelKey: "playerProfile.statsTab.runes.chance", value: data.runes.chance, icon: { placeholder: "%", assetKey: "singlerune" } },
    { labelKey: "playerProfile.statsTab.runes.quality", value: data.runes.quality, icon: { placeholder: "Q", assetKey: "itemqualrune" } },
    { labelKey: "playerProfile.statsTab.runes.health", value: data.runes.health, icon: { placeholder: "HP", assetKey: "healthrune" } },
    { labelKey: "playerProfile.statsTab.runes.damage", value: data.runes.damage, icon: { placeholder: "DMG", assetKey: "doublerune" } },
    { labelKey: "playerProfile.statsTab.runes.resist", value: data.runes.resist, icon: { placeholder: "RES", assetKey: "totalresrune" } },
  ];

  const resistanceRows: Array<{
    labelKey: string;
    value: number | null;
    icon: NonNullable<FieldRow["icon"]>;
  }> = [
    {
      labelKey: "playerProfile.statsTab.resistances.fire",
      value: data.resistances.fireResist,
      icon: { placeholder: "F", assetKey: "fireresrune" },
    },
    {
      labelKey: "playerProfile.statsTab.resistances.cold",
      value: data.resistances.coldResist,
      icon: { placeholder: "C", assetKey: "iceresrune" },
    },
    {
      labelKey: "playerProfile.statsTab.resistances.lightning",
      value: data.resistances.lightningResist,
      icon: { placeholder: "L", assetKey: "lightresrune" },
    },
  ];

  const elementalDamageRows: Array<{
    labelKey: string;
    value: number | null;
    icon: NonNullable<FieldRow["icon"]>;
  }> = [
    {
      labelKey: "playerProfile.statsTab.resistances.fireDamage",
      value: data.resistances.fireDamage,
      icon: { placeholder: "FD", assetKey: "firedmgrune" },
    },
    {
      labelKey: "playerProfile.statsTab.resistances.coldDamage",
      value: data.resistances.coldDamage,
      icon: { placeholder: "CD", assetKey: "icedmgrune" },
    },
    {
      labelKey: "playerProfile.statsTab.resistances.lightningDamage",
      value: data.resistances.lightningDamage,
      icon: { placeholder: "LD", assetKey: "lightdmgrune" },
    },
  ].filter((row) => typeof row.value === "number" && row.value > 0);

  const fortressMetaRows: Array<{ labelKey: string; value: number | null }> = [
    { labelKey: "playerProfile.statsTab.fortress.labels.fortress", value: data.fortress.meta.fortress },
    { labelKey: "playerProfile.statsTab.fortress.labels.upgrades", value: data.fortress.meta.upgrades },
    { labelKey: "playerProfile.statsTab.fortress.labels.fortifications", value: data.fortress.meta.fortifications },
    { labelKey: "playerProfile.statsTab.fortress.labels.wall", value: data.fortress.meta.wall },
    { labelKey: "playerProfile.statsTab.fortress.labels.space", value: data.fortress.meta.space },
    { labelKey: "playerProfile.statsTab.fortress.labels.quarters", value: data.fortress.meta.quarters },
    { labelKey: "playerProfile.statsTab.fortress.labels.portal", value: data.fortress.meta.portal },
  ];

  const fortressEconomyRows: Array<{ labelKey: string; value: number | null }> = [
    { labelKey: "playerProfile.statsTab.fortress.labels.woodcutter", value: data.fortress.buildings.woodcutter },
    { labelKey: "playerProfile.statsTab.fortress.labels.quarry", value: data.fortress.buildings.quarry },
    { labelKey: "playerProfile.statsTab.fortress.labels.gemMine", value: data.fortress.buildings.gemMine },
    { labelKey: "playerProfile.statsTab.fortress.labels.treasury", value: data.fortress.buildings.treasury },
  ];

  const fortressCombatRows: Array<{ labelKey: string; value: number | null }> = [
    { labelKey: "playerProfile.statsTab.fortress.labels.barracks", value: data.fortress.buildings.barracks },
    { labelKey: "playerProfile.statsTab.fortress.labels.mageTower", value: data.fortress.buildings.mageTower },
    {
      labelKey: "playerProfile.statsTab.fortress.labels.archeryGuild",
      value: data.fortress.buildings.archeryGuild,
    },
    { labelKey: "playerProfile.statsTab.fortress.labels.wall", value: data.fortress.meta.wall },
  ];

  const fortressUtilityRows: Array<{ labelKey: string; value: number | null }> = [
    { labelKey: "playerProfile.statsTab.fortress.labels.academy", value: data.fortress.buildings.academy },
    { labelKey: "playerProfile.statsTab.fortress.labels.smithy", value: data.fortress.buildings.smithy },
    { labelKey: "playerProfile.statsTab.fortress.labels.portal", value: data.fortress.meta.portal },
    { labelKey: "playerProfile.statsTab.fortress.labels.space", value: data.fortress.meta.space },
    { labelKey: "playerProfile.statsTab.fortress.labels.quarters", value: data.fortress.meta.quarters },
  ];

  const guildRows: Array<{ labelKey: string; value: string | number | null; kind?: MetricKind | "text" }> = [
    { labelKey: "playerProfile.statsTab.guild.guild", value: data.guildMeta.guild, kind: "text" },
    { labelKey: "playerProfile.statsTab.guild.guildIdentifier", value: data.guildMeta.guildIdentifier, kind: "text" },
    { labelKey: "playerProfile.statsTab.guild.role", value: data.guildMeta.role, kind: "text" },
    { labelKey: "playerProfile.statsTab.guild.joined", value: data.guildMeta.guildJoined, kind: "text" },
    { labelKey: "playerProfile.statsTab.guild.portal", value: data.guildMeta.guildPortal },
  ];

  const raidsRows: Array<{ labelKey: string; value: number | null }> = [
    { labelKey: "playerProfile.statsTab.progress.raids", value: data.optionalProgress.raids.raids },
    { labelKey: "playerProfile.statsTab.progress.raidHonor", value: data.optionalProgress.raids.raidHonor },
    { labelKey: "playerProfile.statsTab.progress.raidWood", value: data.optionalProgress.raids.raidWood },
    { labelKey: "playerProfile.statsTab.progress.raidStone", value: data.optionalProgress.raids.raidStone },
  ];

  const xpRows: Array<{ labelKey: string; value: number | null }> = [
    { labelKey: "playerProfile.statsTab.progress.xp", value: data.optionalProgress.xp.xp },
    { labelKey: "playerProfile.statsTab.progress.xpRequired", value: data.optionalProgress.xp.xpRequired },
    { labelKey: "playerProfile.statsTab.progress.xpTotal", value: data.optionalProgress.xp.xpTotal },
  ];

  const showProgressPanel = [...raidsRows, ...xpRows].some((row) => row.value != null);
  const showAdvancedPanel = false;
  const noDataText = t("common.noData");
  const setHoveredCompositionSource = (attrCode: string, sourceKey: AttributeCompositionSourceKey) => {
    setHoveredAttrCode(attrCode);
    setHoveredSourceKey(sourceKey);
  };
  const clearHoveredCompositionSource = () => {
    setHoveredAttrCode(null);
    setHoveredSourceKey(null);
  };

  return (
    <div className="player-profile__tab-panel player-profile__stats-v2">
      <div className="player-profile__stats-v2-grid">
        <section className="player-profile__stats-panel">
          <PanelHead title={t("playerProfile.statsTab.combat.title")} />
          <KeyValueGrid
            rows={combatRows.map((row) => ({
              label: t(row.labelKey),
              value: formatMetricValue(row.value, row.kind ?? "number"),
            }))}
            placeholder={noDataText}
          />
        </section>

        <section className="player-profile__stats-panel player-profile__stats-panel--attributes">
          <PanelHead
            title={t("playerProfile.statsTab.attrComposition.title")}
            subtitle={t("playerProfile.statsTab.attrComposition.subtitle")}
          />
          <div className="player-profile__stats-attr-list">
            {data.attributeComposition.map((attr) => {
              const segments = buildAttributeSegments(t, attr.base, attr.breakdown, attr.total);
              const barSegments = segments.filter((segment) => segment.isBarSegment);
              const hasData = attr.total != null || segments.length > 0;
              const hasBarData = barSegments.length > 0 || (typeof attr.total === "number" && attr.total > 0);
              const isAttrHoverActive = hoveredAttrCode === attr.code && hoveredSourceKey != null;
              const attrRowStyle = getAttributeCompositionRowStyle(attr.code);

              return (
                <div key={attr.code} className="player-profile__stats-attr-row" style={attrRowStyle}>
                  <div className="player-profile__stats-attr-head">
                    <div className="player-profile__stats-attr-label">
                      {t(`playerProfile.statsTab.attrComposition.attributes.${attr.code}`)}
                    </div>
                    <div className="player-profile__stats-attr-values">
                      <strong>{formatMetricValue(attr.total, "number")}</strong>
                      {attr.bonus != null && (
                        <span>
                          {t("playerProfile.statsTab.attrComposition.bonus")} +{formatPlainNumber(attr.bonus)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="player-profile__stats-stack-track" aria-hidden="true">
                    {hasBarData ? (
                      barSegments.map((segment) => {
                        const isHovered = segment.isInteractive && hoveredAttrCode === attr.code && hoveredSourceKey === segment.sourceKey;
                        const isDimmed = isAttrHoverActive && !isHovered;
                        return (
                          <div
                            key={segment.sourceKey}
                            className={`player-profile__stats-stack-fill player-profile__stats-stack-fill--${segment.sourceKey}${
                              isHovered ? " player-profile__stats-stack-fill--hovered" : ""
                            }${isDimmed ? " player-profile__stats-stack-fill--dimmed" : ""}`}
                            data-shade-index={segment.shadeIndex}
                            style={getAttributeCompositionSegmentStyle(attr.code, segment)}
                            onMouseEnter={() => setHoveredCompositionSource(attr.code, segment.sourceKey)}
                            onMouseLeave={clearHoveredCompositionSource}
                          />
                        );
                      })
                    ) : (
                      <div className="player-profile__stats-stack-empty" />
                    )}
                  </div>
                  {hasData ? (
                    <div className="player-profile__stats-attr-legend" role="list">
                      {segments.map((segment) => {
                        const isHovered =
                          segment.isInteractive && hoveredAttrCode === attr.code && hoveredSourceKey === segment.sourceKey;
                        const isDimmed = segment.isInteractive && isAttrHoverActive && !isHovered;
                        return (
                          <div
                            key={segment.sourceKey}
                            className={`player-profile__stats-attr-legend-item${
                              isHovered ? " player-profile__stats-attr-legend-item--hovered" : ""
                            }${isDimmed ? " player-profile__stats-attr-legend-item--dimmed" : ""}${
                              !segment.isInteractive ? " player-profile__stats-attr-legend-item--static" : ""
                            }`}
                            role="listitem"
                            tabIndex={segment.isInteractive ? 0 : undefined}
                            onMouseEnter={
                              segment.isInteractive
                                ? () => setHoveredCompositionSource(attr.code, segment.sourceKey)
                                : undefined
                            }
                            onMouseLeave={segment.isInteractive ? clearHoveredCompositionSource : undefined}
                            onFocus={
                              segment.isInteractive
                                ? () => setHoveredCompositionSource(attr.code, segment.sourceKey)
                                : undefined
                            }
                            onBlur={segment.isInteractive ? clearHoveredCompositionSource : undefined}
                          >
                            <i
                              className={`player-profile__stats-attr-swatch player-profile__stats-attr-swatch--${segment.sourceKey}`}
                              data-shade-index={segment.shadeIndex}
                              aria-hidden="true"
                            />
                            <span className="player-profile__stats-attr-legend-icon" aria-hidden="true">
                              {segment.iconPlaceholder}
                            </span>
                            <span className="player-profile__stats-attr-legend-label">{segment.label}</span>
                            <strong className="player-profile__stats-attr-legend-value">
                              {formatCompactNumber(segment.value)}
                            </strong>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="player-profile__stats-muted">{noDataText}</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="player-profile__stats-panel player-profile__stats-panel--runes">
          <PanelHead title={t("playerProfile.statsTab.runesResists.title")} />
          <div className="player-profile__stats-split-grid">
            <div>
              <div className="player-profile__stats-subtitle">{t("playerProfile.statsTab.runes.title")}</div>
              <KeyValueList
                rows={runeRows.map((row) => ({
                  label: t(row.labelKey),
                  value: formatMetricValue(row.value, "percent"),
                  icon: row.icon,
                }))}
                placeholder={noDataText}
              />
            </div>
            <div>
              <div className="player-profile__stats-subtitle">{t("playerProfile.statsTab.resistances.title")}</div>
              <KeyValueList
                rows={resistanceRows.map((row) => ({
                  label: t(row.labelKey),
                  value: formatMetricValue(row.value, "percent"),
                  icon: row.icon,
                }))}
                placeholder={noDataText}
              />
              {elementalDamageRows.length > 0 && (
                <>
                  <div className="player-profile__stats-subtitle player-profile__stats-subtitle--spaced">
                    {t("playerProfile.statsTab.resistances.elementalDamage")}
                  </div>
                  <KeyValueList
                    rows={elementalDamageRows.map((row) => ({
                      label: t(row.labelKey),
                      value: formatMetricValue(row.value, "percent"),
                      icon: row.icon,
                    }))}
                    placeholder={noDataText}
                  />
                </>
              )}
            </div>
          </div>
        </section>

        <section className="player-profile__stats-panel player-profile__stats-panel--full">
          <PanelHead
            title={t("playerProfile.statsTab.fortress.title")}
            action={
              <Link
                to={FORTRESS_GUIDE_LINKS.overview}
                className="player-profile__stats-guide-link"
                aria-label={t("playerProfile.statsTab.fortress.guideFortress")}
                title={t("playerProfile.statsTab.fortress.guideFortress")}
              >
                <span aria-hidden className="player-profile__stats-guide-link-icon">
                  ?
                </span>
                {t("playerProfile.statsTab.fortress.guide")}
              </Link>
            }
          />
          <div className="player-profile__stats-fortress-meta">
            <div className="player-profile__stats-fortress-summary-grid">
              {fortressMetaRows.map((row) => {
                const icon = resolveFortressBuildingIcon(row.labelKey, row.value);
                const label = t(row.labelKey);
                const value = formatMetricValue(row.value, "number");
                const iconUrl = icon?.assetKey ? guideAssetUrlByKey(icon.assetKey, 96) : null;
                return (
                  <Tooltip key={row.labelKey} content={renderTooltipList([label, value])}>
                    <button
                      type="button"
                      className="player-profile__stats-fortress-summary-button"
                      aria-label={`${label}: ${value}`}
                    >
                      <span
                        className={`player-profile__stats-fortress-summary-icon ${
                          iconUrl
                            ? "player-profile__stats-fortress-summary-icon--image"
                            : "player-profile__stats-fortress-summary-icon--placeholder"
                        }`}
                        aria-hidden="true"
                      >
                        {iconUrl ? (
                          <img
                            src={iconUrl}
                            alt=""
                            className="player-profile__stats-fortress-summary-image"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          icon?.placeholder ?? label.slice(0, 2).toUpperCase()
                        )}
                      </span>
                    </button>
                  </Tooltip>
                );
              })}
            </div>
            <div className="player-profile__stats-badges">
              <span className="player-profile__stats-badge">
                {t("playerProfile.statsTab.fortress.labels.rank")}
                <strong>{formatMetricValue(data.fortress.rank, "rank")}</strong>
              </span>
              <span className="player-profile__stats-badge">
                {t("playerProfile.statsTab.fortress.labels.honor")}
                <strong>{formatMetricValue(data.fortress.honor, "number")}</strong>
              </span>
            </div>
          </div>
          <div className="player-profile__stats-fortress-grid">
            <FortressGroup
              title={t("playerProfile.statsTab.fortress.groups.economy")}
              rows={fortressEconomyRows.map((row) => ({
                label: t(row.labelKey),
                value: formatMetricValue(row.value, "number"),
                icon: resolveFortressBuildingIcon(row.labelKey, row.value),
              }))}
              placeholder={noDataText}
            />
            <FortressGroup
              title={t("playerProfile.statsTab.fortress.groups.combat")}
              rows={fortressCombatRows.map((row) => ({
                label: t(row.labelKey),
                value: formatMetricValue(row.value, "number"),
                icon: resolveFortressBuildingIcon(row.labelKey, row.value),
              }))}
              placeholder={noDataText}
            />
            <FortressGroup
              title={t("playerProfile.statsTab.fortress.groups.utility")}
              rows={fortressUtilityRows.map((row) => ({
                label: t(row.labelKey),
                value: formatMetricValue(row.value, "number"),
                icon: resolveFortressBuildingIcon(row.labelKey, row.value),
              }))}
              placeholder={noDataText}
            />
          </div>
        </section>

        <section className="player-profile__stats-panel">
          <PanelHead title={t("playerProfile.statsTab.guild.title")} />
          <KeyValueList
            rows={guildRows.map((row) => ({
              label: t(row.labelKey),
              value:
                row.kind === "text"
                  ? formatTextValue(row.value)
                  : formatMetricValue(typeof row.value === "number" ? row.value : null, (row.kind as MetricKind) ?? "number"),
            }))}
            placeholder={noDataText}
          />
        </section>

        {showProgressPanel && (
          <section className="player-profile__stats-panel">
            <PanelHead title={t("playerProfile.statsTab.progress.title")} />
            <div className="player-profile__stats-split-grid">
              <div>
                <div className="player-profile__stats-subtitle">{t("playerProfile.statsTab.progress.raidsSection")}</div>
                <KeyValueList
                  rows={raidsRows.map((row) => ({
                    label: t(row.labelKey),
                    value: formatMetricValue(row.value, "number"),
                  }))}
                  placeholder={noDataText}
                />
              </div>
              <div>
                <div className="player-profile__stats-subtitle">{t("playerProfile.statsTab.progress.xpSection")}</div>
                <KeyValueList
                  rows={xpRows.map((row) => ({
                    label: t(row.labelKey),
                    value: formatMetricValue(row.value, "number"),
                  }))}
                  placeholder={noDataText}
                />
              </div>
            </div>
          </section>
        )}

        {showAdvancedPanel && (
          <section className="player-profile__stats-panel player-profile__stats-panel--full">
            <details className="player-profile__stats-accordion">
              <summary>
                <div className="player-profile__stats-accordion-title">{t("playerProfile.statsTab.advanced.title")}</div>
                <span className="player-profile__stats-accordion-count">{data.advanced.entries.length}</span>
              </summary>
              <div className="player-profile__stats-accordion-body">
                {data.advanced.entries.length ? (
                  <div className="player-profile__stats-advanced-grid">
                    {data.advanced.entries.map((entry) => (
                      <div key={entry.key} className="player-profile__stats-advanced-item">
                        <div className="player-profile__stats-advanced-key">{entry.key}</div>
                        <div className="player-profile__stats-advanced-value">{formatAdvancedValue(t, entry.value)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <PanelEmpty text={noDataText} />
                )}
              </div>
            </details>
          </section>
        )}
      </div>
    </div>
  );
}

function PanelHead({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <header className="player-profile__stats-panel-head">
      <div className="player-profile__stats-panel-head-main">
        <h3>{title}</h3>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      {action ? <div className="player-profile__stats-panel-head-action">{action}</div> : null}
    </header>
  );
}

function PanelEmpty({ text }: { text: string }) {
  return <div className="player-profile__stats-empty">{text}</div>;
}

function KeyValueGrid({
  rows,
  placeholder,
  compact = false,
}: {
  rows: FieldRow[];
  placeholder: string;
  compact?: boolean;
}) {
  if (!rows.some((row) => row.value !== DASH)) return <PanelEmpty text={placeholder} />;
  return (
    <div className={`player-profile__stats-kv-grid ${compact ? "player-profile__stats-kv-grid--compact" : ""}`}>
      {rows.map((row) => {
        const iconUrl = row.icon?.assetKey ? guideAssetUrlByKey(row.icon.assetKey, 64) : null;
        return (
          <div key={row.label} className="player-profile__stats-kv-card">
            <div className="player-profile__stats-kv-label">
              {row.icon ? (
                <span
                  className={`player-profile__stats-kv-icon ${
                    iconUrl ? "player-profile__stats-kv-icon--image" : "player-profile__stats-kv-icon--placeholder"
                  }`}
                  aria-hidden="true"
                >
                  {iconUrl ? (
                    <img
                      src={iconUrl}
                      alt=""
                      className="player-profile__stats-kv-icon-image"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    row.icon.placeholder
                  )}
                </span>
              ) : null}
              <span className="player-profile__stats-kv-label-text">{row.label}</span>
            </div>
            <div className="player-profile__stats-kv-value">{row.value}</div>
          </div>
        );
      })}
    </div>
  );
}

function KeyValueList({ rows, placeholder }: { rows: FieldRow[]; placeholder: string }) {
  if (!rows.some((row) => row.value !== DASH)) return <PanelEmpty text={placeholder} />;
  return (
    <ul className="player-profile__stats-list">
      {rows.map((row) => {
        const iconUrl = row.icon?.assetKey ? guideAssetUrlByKey(row.icon.assetKey, 64) : null;
        return (
          <li key={row.label}>
            <span className="player-profile__stats-list-label">
              {row.icon ? (
                <span
                  className={`player-profile__stats-list-icon ${
                    iconUrl ? "player-profile__stats-list-icon--image" : "player-profile__stats-list-icon--placeholder"
                  }`}
                  data-asset-key={row.icon.assetKey ?? ""}
                  aria-hidden="true"
                  title={row.icon.assetKey ? `asset: ${row.icon.assetKey}` : undefined}
                >
                  {iconUrl ? (
                    <img
                      src={iconUrl}
                      alt=""
                      className="player-profile__stats-list-icon-image"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    row.icon.placeholder
                  )}
                </span>
              ) : null}
              <span className="player-profile__stats-list-label-text">{row.label}</span>
            </span>
            <strong>{row.value}</strong>
          </li>
        );
      })}
    </ul>
  );
}

function FortressGroup({ title, rows, placeholder }: { title: string; rows: FieldRow[]; placeholder: string }) {
  const visibleRows = rows.filter((row) => row.value !== DASH);
  if (!visibleRows.length) {
    return (
      <div className="player-profile__stats-fortress-group">
        <div className="player-profile__stats-subtitle">{title}</div>
        <PanelEmpty text={placeholder} />
      </div>
    );
  }

  return (
    <div className="player-profile__stats-fortress-group">
      <div className="player-profile__stats-subtitle">{title}</div>
      <div className="player-profile__stats-fortress-icon-grid">
        {visibleRows.map((row) => {
          const icon = row.icon ?? { placeholder: row.label.slice(0, 2).toUpperCase() };
          const iconUrl = icon.assetKey ? guideAssetUrlByKey(icon.assetKey, 96) : null;
          return (
            <Tooltip
              key={row.label}
              content={renderTooltipList([row.label, row.value])}
              className="player-profile__stats-fortress-tooltip"
            >
              <button
                type="button"
                className="player-profile__stats-fortress-icon-button"
                aria-label={`${row.label}: ${row.value}`}
              >
                <span
                  className={`player-profile__stats-fortress-icon ${
                    iconUrl
                      ? "player-profile__stats-fortress-icon--image"
                      : "player-profile__stats-fortress-icon--placeholder"
                  }`}
                  aria-hidden="true"
                >
                  {iconUrl ? (
                    <img
                      src={iconUrl}
                      alt=""
                      className="player-profile__stats-fortress-icon-image"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    icon.placeholder
                  )}
                </span>
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

function renderTooltipList(lines: string[]) {
  if (!lines.length) return null;
  return (
    <div className="player-profile__stats-tooltip-lines">
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}

function buildAttributeSegments(
  t: TranslateFn,
  base: number | null,
  breakdown: StatsTabModel["attributeComposition"][number]["breakdown"],
  total: number | null,
) {
  const segments: Array<Omit<AttributeCompositionSegment, "widthPct">> = [];
  let bonusContributionSum = 0;
  const pushSourceSegment = (
    sourceKey: Exclude<AttributeCompositionSourceKey, "other">,
    label: string,
    value: number | null | undefined,
    options?: { isBarSegment?: boolean; isInteractive?: boolean; countTowardsBase?: boolean },
  ) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return;
    const isBarSegment = options?.isBarSegment ?? true;
    const isInteractive = options?.isInteractive ?? isBarSegment;
    const countTowardsBase = options?.countTowardsBase ?? isBarSegment;
    if (countTowardsBase) {
      bonusContributionSum += value;
    }
    segments.push({
      sourceKey,
      label,
      value,
      iconPlaceholder: ATTRIBUTE_COMPOSITION_SOURCE_META[sourceKey].iconPlaceholder,
      shadeIndex: ATTRIBUTE_COMPOSITION_SOURCE_META[sourceKey].shadeIndex,
      isBarSegment,
      isInteractive,
    });
  };

  pushSourceSegment("base", t("playerProfile.statsTab.attrComposition.breakdown.base"), base, {
    isBarSegment: true,
    isInteractive: true,
    countTowardsBase: false,
  });
  pushSourceSegment("baseItems", t("playerProfile.statsTab.attrComposition.breakdown.baseItems"), breakdown.baseItems);
  pushSourceSegment("upgrades", t("playerProfile.statsTab.attrComposition.breakdown.upgrades"), breakdown.upgrades);
  pushSourceSegment("equipment", t("playerProfile.statsTab.attrComposition.breakdown.equipment"), breakdown.equipment);
  pushSourceSegment("gems", t("playerProfile.statsTab.attrComposition.breakdown.gems"), breakdown.gems);
  pushSourceSegment("pet", t("playerProfile.statsTab.attrComposition.breakdown.pet"), breakdown.pet);
  pushSourceSegment("potion", t("playerProfile.statsTab.attrComposition.breakdown.potion"), breakdown.potion);

  const fallbackBaseValue =
    base == null && typeof total === "number" && Number.isFinite(total)
      ? Math.max(0, total - Math.max(0, bonusContributionSum))
      : null;

  if (fallbackBaseValue != null && fallbackBaseValue > 0) {
    segments.unshift({
      sourceKey: "base",
      label: t("playerProfile.statsTab.attrComposition.breakdown.base"),
      value: fallbackBaseValue,
      iconPlaceholder: ATTRIBUTE_COMPOSITION_SOURCE_META.base.iconPlaceholder,
      shadeIndex: ATTRIBUTE_COMPOSITION_SOURCE_META.base.shadeIndex,
      isBarSegment: true,
      isInteractive: true,
    });
  }

  pushSourceSegment("petBonus", t("playerProfile.statsTab.attrComposition.breakdown.petBonus"), breakdown.petBonus, {
    isBarSegment: false,
    isInteractive: false,
    countTowardsBase: false,
  });

  if (!segments.length && typeof total === "number" && total > 0) {
    segments.push({
      sourceKey: "other",
      label: t("playerProfile.statsTab.attrComposition.breakdown.other"),
      value: total,
      iconPlaceholder: ATTRIBUTE_COMPOSITION_SOURCE_META.other.iconPlaceholder,
      shadeIndex: ATTRIBUTE_COMPOSITION_SOURCE_META.other.shadeIndex,
      isBarSegment: true,
      isInteractive: true,
    });
  }

  const barSegments = segments.filter((segment) => segment.isBarSegment);
  const sum = barSegments.reduce((acc, segment) => acc + segment.value, 0);
  const denominator = Math.max(sum, total ?? 0, 1);

  return segments.map((segment) => ({
    ...segment,
    widthPct: segment.isBarSegment ? Math.max(0, Math.min(100, (segment.value / denominator) * 100)) : 0,
  }));
}

function resolveFortressBuildingIcon(labelKey: string, level: number | null): FieldRow["icon"] | undefined {
  const meta = FORTRESS_BUILDING_ICON_KEYS[labelKey];
  if (!meta) return undefined;
  const usePlusKey = typeof level === "number" && level >= 20 && Boolean(meta.plusKey);
  const levelValue = typeof level === "number" && Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;
  const clampedLevel = Math.min(levelValue, meta.maxLevel);
  return {
    placeholder: meta.placeholder,
    assetKey: usePlusKey ? meta.plusKey : `${meta.baseKeyPrefix}${clampedLevel}`,
  };
}

function formatPlainNumber(value: number) {
  if (!Number.isFinite(value)) return DASH;
  const hasFraction = Math.abs(value % 1) > 0.000001;
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(value);
}

function formatCompactNumber(value: number) {
  if (!Number.isFinite(value)) return DASH;
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 1,
  }).format(value);
}

function formatMetricValue(value: number | null, kind: MetricKind = "number") {
  if (value == null || !Number.isFinite(value)) return DASH;
  if (kind === "rank") return `#${formatPlainNumber(value)}`;
  if (kind === "percent") return `${formatPlainNumber(value)}%`;
  return formatPlainNumber(value);
}

function formatBoolValue(t: TranslateFn, value: boolean | null) {
  if (value == null) return DASH;
  return value ? t("playerProfile.statsTab.common.yes") : t("playerProfile.statsTab.common.no");
}

function formatTextValue(value: unknown) {
  if (value == null) return DASH;
  const text = String(value).trim();
  if (!text || text === "?") return DASH;
  return text;
}

function formatAdvancedValue(t: TranslateFn, value: string | number | boolean | null) {
  if (typeof value === "boolean") return formatBoolValue(t, value);
  if (typeof value === "number") return formatPlainNumber(value);
  return formatTextValue(value);
}

const CHART_SECTION_ORDER: Array<{ key: string; titleKey: string; fallbackTitle: string }> = [
  {
    key: "coreProgress",
    titleKey: "playerProfile.chartsTab.sections.coreProgress",
    fallbackTitle: "Core Progress",
  },
  {
    key: "attributesBase",
    titleKey: "playerProfile.chartsTab.sections.attributesBase",
    fallbackTitle: "Attributes (Base)",
  },
  {
    key: "attributesTotals",
    titleKey: "playerProfile.chartsTab.sections.attributesTotals",
    fallbackTitle: "Attributes (Totals)",
  },
  {
    key: "economy",
    titleKey: "playerProfile.chartsTab.sections.economy",
    fallbackTitle: "Economy",
  },
  {
    key: "experience",
    titleKey: "playerProfile.chartsTab.sections.experience",
    fallbackTitle: "Experience",
  },
];

export function ChartsTab({ series }: { series: TrendSeries[] }) {
  const { t } = useTranslation();

  const grouped = CHART_SECTION_ORDER.map((section) => ({
    ...section,
    items: series.filter((trend) => trend.sectionKey === section.key && trend.points.length > 0),
  })).filter((section) => section.items.length > 0);

  if (!grouped.length) {
    return (
      <div className="player-profile__tab-panel">
        <PanelEmpty text={t("common.noData")} />
      </div>
    );
  }

  return (
    <div className="player-profile__tab-panel">
      {grouped.map((section) => (
        <section key={section.key} className="player-profile__section player-profile__charts-section">
          <div className="player-profile__section-head">
            <h3>{t(section.titleKey, { defaultValue: section.fallbackTitle })}</h3>
          </div>
          <div className="player-profile__grid player-profile__charts-grid">
            {section.items.map((trend) => {
              const title = trend.labelKey ? t(trend.labelKey, { defaultValue: trend.label }) : trend.label;
              const subtitle = trend.subLabelKey
                ? t(trend.subLabelKey, { defaultValue: trend.subLabel ?? "" })
                : trend.subLabel;
              const latestLabel = trend.latestLabelKey
                ? t(trend.latestLabelKey, {
                    metric: title,
                    defaultValue: trend.latestLabel ?? `${title} (latest)`,
                  })
                : trend.latestLabel;
              const startLabel = trend.startLabelKey
                ? t(trend.startLabelKey, {
                    metric: title,
                    defaultValue: trend.startLabel ?? `${title} (start)`,
                  })
                : trend.startLabel;
              const badgeLabel = trend.showAvgMarker
                ? t("playerProfile.chartsTab.labels.avgMarker", { defaultValue: "Line + Avg marker" })
                : undefined;
              return (
                <AnchoredLineCard
                  key={trend.key ?? trend.label}
                  title={title}
                  subtitle={subtitle}
                  latestLabel={latestLabel}
                  startLabel={startLabel}
                  badgeLabel={badgeLabel}
                  series={trend}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

const normalizeIdentifier = (identifier: string) => identifier.trim().toLowerCase();

const extractMetricSeries = (
  monthKeys: string[],
  metricValuesByMonth: Record<string, Record<string, number>>,
  metricKey: string,
) =>
  monthKeys.map((monthKey) => {
    const value = metricValuesByMonth[monthKey]?.[metricKey];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  });

export function ComparisonTab({
  rows: _rows,
  currentIdentifier,
  currentPlayerLabel,
  favoriteIdentifiers,
}: {
  rows: ComparisonRow[];
  currentIdentifier: string | null;
  currentPlayerLabel: string | null;
  favoriteIdentifiers: string[];
}) {
  const { t } = useTranslation();
  const normalizedCurrentIdentifier = currentIdentifier ? normalizeIdentifier(currentIdentifier) : null;
  const compareCandidates = React.useMemo(
    () =>
      Array.from(new Set(favoriteIdentifiers.map((identifier) => normalizeIdentifier(identifier)).filter(Boolean))).filter(
        (identifier) => identifier !== normalizedCurrentIdentifier,
      ),
    [favoriteIdentifiers, normalizedCurrentIdentifier],
  );
  const [selectedCompareIds, setSelectedCompareIds] = React.useState<string[]>([]);
  const selectedCompareIdsKey = React.useMemo(() => selectedCompareIds.join("|"), [selectedCompareIds]);
  const selectedSet = React.useMemo(() => new Set(selectedCompareIds), [selectedCompareIds]);
  const availableCompareIds = React.useMemo(
    () => compareCandidates.filter((identifier) => !selectedSet.has(identifier)),
    [compareCandidates, selectedSet],
  );
  const snapshotIdentifiers = React.useMemo(
    () => (normalizedCurrentIdentifier ? [normalizedCurrentIdentifier, ...selectedCompareIds] : selectedCompareIds),
    [normalizedCurrentIdentifier, selectedCompareIdsKey],
  );
  const { byIdentifier } = usePlayerProgressSnapshots({
    identifiers: snapshotIdentifiers,
  });

  React.useEffect(() => {
    setSelectedCompareIds((current) => {
      const filtered = current.filter((identifier) => compareCandidates.includes(identifier));
      if (filtered.length === current.length && filtered.every((identifier, index) => identifier === current[index])) {
        return current;
      }
      return filtered;
    });
  }, [compareCandidates]);

  const externalData = React.useMemo<ServerComparisonExternalData | null>(() => {
    if (!normalizedCurrentIdentifier) return null;
    const currentSnapshot = byIdentifier[normalizedCurrentIdentifier];
    const currentMonths = currentSnapshot?.months ?? [];
    const monthKeys = currentMonths.map((entry) => entry.monthId);
    if (!monthKeys.length) return null;
    const monthScanLabels: Record<string, string> = {};
    currentMonths.forEach((entry) => {
      const scanAtRaw = typeof entry.scanAtRaw === "string" ? entry.scanAtRaw.trim() : "";
      if (scanAtRaw) {
        monthScanLabels[entry.monthId] = scanAtRaw;
        return;
      }
      if (typeof entry.scanAtSec === "number" && Number.isFinite(entry.scanAtSec)) {
        const dt = new Date(entry.scanAtSec * 1000);
        if (!Number.isNaN(dt.getTime())) {
          monthScanLabels[entry.monthId] = dt.toLocaleString();
        }
      }
    });

    const buildMetricLookupByMonth = (identifier: string) => {
      const months = byIdentifier[identifier]?.months ?? [];
      const byMonth: Record<string, Record<string, number>> = {};
      months.forEach((entry) => {
        const values = entry.values ?? {};
        const nextValues: Record<string, number> = {};
        Object.keys(values).forEach((key) => {
          const value = values[key as keyof typeof values];
          if (typeof value === "number" && Number.isFinite(value)) {
            nextValues[key] = value;
          }
        });
        byMonth[entry.monthId] = nextValues;
      });
      return byMonth;
    };

    const currentMetricLookup = buildMetricLookupByMonth(normalizedCurrentIdentifier);
    const favoriteEntities = compareCandidates.map((identifier) => {
      const metricLookup = buildMetricLookupByMonth(identifier);
      const metricValues: Record<string, Array<number | null>> = {};
      PLAYER_PROGRESS_CHART_METRIC_CONFIG.forEach((metric) => {
        metricValues[metric.key] = extractMetricSeries(monthKeys, metricLookup, metric.key);
      });
      return {
        key: identifier,
        label: identifier,
        kind: "favorite" as const,
        baseline: false,
        metricValues,
      };
    });

    return {
      months: monthKeys,
      monthScanLabels,
      metrics: PLAYER_PROGRESS_CHART_METRIC_CONFIG.map((metric) => {
        const section = PLAYER_PROGRESS_CHART_SECTION_ORDER.find((entry) => entry.key === metric.sectionKey);
        return {
          key: metric.key,
          label: t(metric.labelKey, { defaultValue: metric.fallbackLabel }),
          groupKey: metric.sectionKey,
          groupLabel: section ? t(section.titleKey, { defaultValue: section.fallbackTitle }) : metric.sectionKey,
          axis: metric.key === "xpProgress" ? "right" : "left",
          decimals: metric.key === "xpProgress" ? 2 : 0,
          unit: metric.key === "xpProgress" ? "%" : undefined,
        };
      }),
      entities: [
        {
          key: "player",
          label: currentPlayerLabel?.trim() || normalizedCurrentIdentifier,
          kind: "player",
          baseline: false,
          metricValues: PLAYER_PROGRESS_CHART_METRIC_CONFIG.reduce<Record<string, Array<number | null>>>((acc, metric) => {
            acc[metric.key] = extractMetricSeries(monthKeys, currentMetricLookup, metric.key);
            return acc;
          }, {}),
        },
        ...favoriteEntities,
      ],
      playerKey: "player",
      serverBaselineKey: null,
      guildBaselineKey: null,
    };
  }, [byIdentifier, compareCandidates, currentPlayerLabel, normalizedCurrentIdentifier, selectedCompareIds, t]);

  return (
    <div className="player-profile__tab-panel">
      <div className="player-profile__section-head">
        <h3>Serververgleich</h3>
      </div>
      <div className="player-profile__comparison-wrapper">
        <ServerComparisonMultiLineChart
          externalData={externalData ?? undefined}
          selectedFavoriteKeys={selectedCompareIds}
          onSelectedFavoriteKeysChange={setSelectedCompareIds}
          availableFavoriteKeys={availableCompareIds}
        />
      </div>
    </div>
  );
}

export function HistoryTab({ entries }: { entries: TimelineEntry[] }) {
  return (
    <div className="player-profile__tab-panel">
      <ol className="player-profile__timeline">
        {entries.map((entry) => (
          <li key={`${entry.dateLabel}-${entry.title}`}>
            <div className="player-profile__timeline-date">{entry.dateLabel}</div>
            <div className="player-profile__timeline-card">
              <div className="player-profile__timeline-tag">{entry.tag}</div>
              <div className="player-profile__timeline-title">{entry.title}</div>
              <div className="player-profile__timeline-desc">{entry.description}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MiniTrend({ points }: { points: number[] }) {
  // legacy, unused
  return <div className="player-profile__trend-chart player-profile__trend-chart--empty" />;
}

