import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { PaletteColors } from "./GuildProfileInfo/GuildProfileInfo.types";
import guildProfileInfoStyles from "./GuildProfileInfo/GuildProfileInfo.module.css";
import Tooltip from "../ui/Tooltip/Tooltip";
import { HexGauge } from "../ui/HexGauge";
import HudLabel from "../ui/hud/HudLabel";
import { getClassIconUrl } from "../ui/shared/classIcons";
import ClassCrestGrid from "./GuildClassOverview/ClassCrestGrid";
import ClassDonut from "./GuildClassOverview/ClassDonut";
import type { GuildClassOverviewProps } from "./GuildClassOverview/types";

type FreshnessLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | "unknown";
type TranslateFn = (key: string, options?: any) => string;

export type GuildHeroMetric = {
  label: string;
  value: string | number;
  hint?: string;
  gauge?: {
    progress: number;
    centerTop: string;
    centerBottom?: string;
    details?: string[];
  };
};

export type GuildHeroBadge = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: string;
  tone?: "neutral" | "success" | "warning";
};

export type GuildHeroAction = {
  key: string;
  label: string;
  title?: string;
  disabled?: boolean;
};

export type GuildHeroAverageStats = {
  base?: {
    main?: number | null;
    con?: number | null;
    sum?: number | null;
  };
  total?: {
    main?: number | null;
    con?: number | null;
    total?: number | null;
  };
};

export type GuildHeroTop3Entry = {
  name?: string | null;
  classLabel?: string | null;
  value?: number | null;
};

export type GuildHeroTop3Data = {
  base?: {
    main?: GuildHeroTop3Entry[];
    con?: GuildHeroTop3Entry[];
    sum?: GuildHeroTop3Entry[];
  };
  total?: {
    main?: GuildHeroTop3Entry[];
    con?: GuildHeroTop3Entry[];
    total?: GuildHeroTop3Entry[];
  };
};

export type GuildHeroPanelData = {
  guildName: string;
  subtitle?: string | null;
  server?: string | null;
  memberCount?: number | null;
  hofRank?: number | null;
  lastScanLabel?: string | null;
  lastScanAtLabel?: string | null;
  lastScanDays?: number | null;
  emblemUrl?: string | null;
  emblemAlt?: string;
  metrics?: GuildHeroMetric[];
  badges?: GuildHeroBadge[];
  actions?: GuildHeroAction[];
  averageStats?: GuildHeroAverageStats;
  activityPct?: number | null;
  top3?: GuildHeroTop3Data;
  classTabs?: Pick<GuildClassOverviewProps, "data" | "classMeta" | "onPickClass">;
};

export type GuildHeroPanelProps = {
  data: GuildHeroPanelData;
  loading?: boolean;
  colors?: Partial<PaletteColors>;
  onAction?: (action: GuildHeroAction["key"]) => void;
};

const DEFAULT_COLORS: PaletteColors = {
  tile: "#152A42",
  tileAlt: "#14273E",
  line: "#2B4C73",
  title: "#F5F9FF",
  soft: "#B0C4D9",
  header: "#1E3657",
  icon: "#5C8BC6",
};

const THREE_COLUMN_MEDIA_QUERY = "(min-width: 1280px)";

const FRESHNESS_DOT_COLORS: Record<FreshnessLevel, string> = {
  0: "#22c55e",
  1: "#84cc16",
  2: "#a3e635",
  3: "#f59e0b",
  4: "#fb923c",
  5: "#f97316",
  6: "#ef4444",
  unknown: "#94a3b8",
};

const computeFreshness = (
  t: TranslateFn,
  lastScanDays?: number | null,
): { level: FreshnessLevel; label: string; hint: string } => {
  if (lastScanDays == null || !Number.isFinite(lastScanDays)) {
    return {
      level: "unknown",
      label: t("guildProfile.heroPanel.states.freshness.unknown.label", { defaultValue: "Unknown" }),
      hint: t("guildProfile.heroPanel.states.freshness.unknown.hint", {
        defaultValue: "Scan history unavailable",
      }),
    };
  }
  const days = Math.max(0, Math.floor(lastScanDays));
  if (days === 0) {
    return {
      level: 0,
      label: t("guildProfile.heroPanel.states.freshness.scannedToday.label", { defaultValue: "Scanned today" }),
      hint: t("guildProfile.heroPanel.states.freshness.scannedToday.hint", { defaultValue: "No rescan needed" }),
    };
  }
  if (days === 1) {
    return {
      level: 1,
      label: t("guildProfile.heroPanel.states.freshness.veryFresh.label", { defaultValue: "Very fresh" }),
      hint: t("guildProfile.heroPanel.states.freshness.veryFresh.hint", { defaultValue: "No rescan needed" }),
    };
  }
  if (days <= 3) {
    return {
      level: 2,
      label: t("guildProfile.heroPanel.states.freshness.fresh.label", { defaultValue: "Fresh" }),
      hint: t("guildProfile.heroPanel.states.freshness.fresh.hint", { defaultValue: "No rescan needed" }),
    };
  }
  if (days <= 7) {
    return {
      level: 3,
      label: t("guildProfile.heroPanel.states.freshness.recent.label", { defaultValue: "Recent" }),
      hint: t("guildProfile.heroPanel.states.freshness.recent.hint", { defaultValue: "Rescan recommended" }),
    };
  }
  if (days <= 14) {
    return {
      level: 4,
      label: t("guildProfile.heroPanel.states.freshness.aging.label", { defaultValue: "Aging" }),
      hint: t("guildProfile.heroPanel.states.freshness.aging.hint", { defaultValue: "Rescan recommended" }),
    };
  }
  if (days <= 30) {
    return {
      level: 5,
      label: t("guildProfile.heroPanel.states.freshness.outdated.label", { defaultValue: "Outdated" }),
      hint: t("guildProfile.heroPanel.states.freshness.outdated.hint", {
        defaultValue: "Rescan strongly recommended",
      }),
    };
  }
  return {
    level: 6,
    label: t("guildProfile.heroPanel.states.freshness.stale.label", { defaultValue: "Stale" }),
    hint: t("guildProfile.heroPanel.states.freshness.stale.hint", { defaultValue: "Rescan strongly recommended" }),
  };
};

const formatAgeLabel = (t: TranslateFn, lastScanDays?: number | null) => {
  if (lastScanDays == null || !Number.isFinite(lastScanDays)) return null;
  const days = Math.max(0, Math.floor(lastScanDays));
  if (days === 0) return t("guildProfile.heroPanel.tooltips.age.today", { defaultValue: "today" });
  if (days === 1) return t("guildProfile.heroPanel.tooltips.age.oneDayAgo", { defaultValue: "1 day ago" });
  return t("guildProfile.heroPanel.tooltips.age.daysAgo", { days, defaultValue: "{{days}} days ago" });
};

function EmblemFallback({ label, size = 96 }: { label: string; size?: number }) {
  const initials = (label || "?")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .slice(0, 2)
    .join("");

  return (
    <div
      aria-hidden
      className="inline-flex items-center justify-center rounded-xl font-extrabold text-slate-100"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.34),
        background: "linear-gradient(145deg, #1E3657, #152A42)",
        border: "1px solid rgba(176, 196, 217, 0.28)",
      }}
    >
      {initials || "?"}
    </div>
  );
}

function formatMetricValue(value: string | number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("de-DE");
  }
  return String(value ?? "-");
}

function formatAverageValue(value?: number | null) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("de-DE");
  }
  return "--";
}

function normalizeClassToken(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const GuildHeroPanel = memo(function GuildHeroPanel({
  data,
  loading = false,
  colors,
  onAction,
}: GuildHeroPanelProps) {
  const { t } = useTranslation();
  const [statsMode, setStatsMode] = useState<"base" | "total">("base");
  const [activeClassTab, setActiveClassTab] = useState<"overview" | "distribution">("overview");
  const [isThreeColumnDesktop, setIsThreeColumnDesktop] = useState(false);
  const [rightColumnCapHeight, setRightColumnCapHeight] = useState<number | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const middleRef = useRef<HTMLDivElement | null>(null);

  const palette = useMemo(
    () => ({ ...DEFAULT_COLORS, ...(colors ?? {}) }),
    [colors],
  );
  const freshness = useMemo(
    () => computeFreshness(t, data.lastScanDays),
    [data.lastScanDays, t],
  );
  const freshnessTooltip = useMemo(() => {
    const parts: string[] = [];
    if (data.lastScanAtLabel) {
      parts.push(
        t("guildProfile.heroPanel.tooltips.lastScanAt", {
          value: data.lastScanAtLabel,
          defaultValue: "Last scan: {{value}}",
        }),
      );
    }
    const ageLabel = formatAgeLabel(t, data.lastScanDays);
    if (ageLabel) {
      parts.push(
        t("guildProfile.heroPanel.tooltips.age.label", {
          value: ageLabel,
          defaultValue: "Age: {{value}}",
        }),
      );
    }
    if (freshness.hint) parts.push(freshness.hint);
    return parts.join(" | ");
  }, [data.lastScanAtLabel, data.lastScanDays, freshness.hint, t]);

  const localizedLastScanLabel = formatAgeLabel(t, data.lastScanDays) ?? data.lastScanLabel;
  const metrics = data.metrics ?? [];
  const badges = data.badges ?? [];
  const actions = data.actions ?? [];
  const classTabs = data.classTabs;
  const hasClassTabs = Boolean(classTabs);
  const rightColumnHeightStyle =
    hasClassTabs && isThreeColumnDesktop && rightColumnCapHeight && rightColumnCapHeight > 0
      ? { maxHeight: rightColumnCapHeight }
      : undefined;
  const metricsToRender: GuildHeroMetric[] =
    metrics.length > 0
      ? metrics
      : [
          {
            label: "Activity",
            value:
              typeof data.activityPct === "number" && Number.isFinite(data.activityPct)
                ? `${Math.max(0, Math.min(100, Math.round(data.activityPct)))}%`
                : "--",
            gauge: {
              progress:
                typeof data.activityPct === "number" && Number.isFinite(data.activityPct)
                  ? Math.max(0, Math.min(100, data.activityPct)) / 100
                  : 0,
              centerTop:
                typeof data.activityPct === "number" && Number.isFinite(data.activityPct)
                  ? `${Math.max(0, Math.min(100, Math.round(data.activityPct)))}%`
                  : "--",
              centerBottom: "Activity",
            },
          },
          {
            label: t("guildProfile.heroPanel.metrics.placeholder2", { defaultValue: "Readiness" }),
            value: "--",
            gauge: {
              progress: 0,
              centerTop: "--",
              centerBottom: t("guildProfile.heroPanel.metrics.placeholderHint", { defaultValue: "Pending data" }),
            },
          },
          {
            label: t("guildProfile.heroPanel.metrics.placeholder3", { defaultValue: "Total Base Stats" }),
            value: "--",
          },
        ];
  const actionsToRender: GuildHeroAction[] =
    actions.length > 0
      ? actions
      : [
          {
            key: "placeholder_open_guild",
            label: t("guildProfile.heroPanel.actions.openGuild", { defaultValue: "Open guild" }),
            disabled: true,
          },
          {
            key: "placeholder_share",
            label: t("guildProfile.heroPanel.actions.share", { defaultValue: "Share" }),
            disabled: true,
          },
          {
            key: "placeholder_copy_link",
            label: t("guildProfile.heroPanel.actions.copyLink", { defaultValue: "Copy link" }),
            disabled: true,
          },
        ];
  const averageRows = useMemo(
    () =>
      statsMode === "base"
        ? [
            { label: "main", value: data.averageStats?.base?.main },
            { label: "con", value: data.averageStats?.base?.con },
            { label: "sum", value: data.averageStats?.base?.sum },
          ]
        : [
            { label: "main", value: data.averageStats?.total?.main },
            { label: "con", value: data.averageStats?.total?.con },
            { label: "total", value: data.averageStats?.total?.total },
          ],
    [data.averageStats, statsMode],
  );
  const top3Panels = useMemo(() => {
    const source =
      statsMode === "base"
        ? [
            { key: "main", title: "MAIN Top 3", entries: data.top3?.base?.main ?? [] },
            { key: "con", title: "CON Top 3", entries: data.top3?.base?.con ?? [] },
            { key: "sum", title: "SUM Top 3", entries: data.top3?.base?.sum ?? [] },
          ]
        : [
            { key: "main", title: "MAIN Top 3", entries: data.top3?.total?.main ?? [] },
            { key: "con", title: "CON Top 3", entries: data.top3?.total?.con ?? [] },
            { key: "total", title: "TOTAL Top 3", entries: data.top3?.total?.total ?? [] },
          ];

    return source.map((panel) => ({
      ...panel,
      entries: Array.from({ length: 3 }, (_, index) => panel.entries[index] ?? null),
    }));
  }, [data.top3, statsMode]);
  const classAccentByLabel = useMemo(() => {
    const meta = classTabs?.classMeta ?? [];
    const map = new Map<string, string>();
    meta.forEach((item, index) => {
      const hue = Math.round((360 / Math.max(meta.length, 1)) * index);
      const color = `hsl(${hue} 60% 55%)`;
      map.set(normalizeClassToken(item.name), color);
      map.set(normalizeClassToken(item.id), color);
    });
    return map;
  }, [classTabs]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia(THREE_COLUMN_MEDIA_QUERY);
    const handleChange = () => {
      setIsThreeColumnDesktop(media.matches);
    };

    handleChange();
    media.addEventListener("change", handleChange);
    return () => {
      media.removeEventListener("change", handleChange);
    };
  }, []);

  useLayoutEffect(() => {
    if (!hasClassTabs || !isThreeColumnDesktop) {
      setRightColumnCapHeight(null);
      return;
    }

    const leftEl = leftRef.current;
    const middleEl = middleRef.current;
    if (!leftEl || !middleEl) {
      setRightColumnCapHeight(null);
      return;
    }

    const measureHeights = () => {
      const leftHeight = leftEl.offsetHeight || leftEl.scrollHeight || leftEl.getBoundingClientRect().height;
      const middleHeight = middleEl.offsetHeight || middleEl.scrollHeight || middleEl.getBoundingClientRect().height;
      const capHeight = Math.max(leftHeight, middleHeight);
      setRightColumnCapHeight(capHeight > 0 ? Math.ceil(capHeight) : null);
    };

    measureHeights();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        measureHeights();
      });
      observer.observe(leftEl);
      observer.observe(middleEl);
      return () => {
        observer.disconnect();
      };
    }

    window.addEventListener("resize", measureHeights);
    return () => {
      window.removeEventListener("resize", measureHeights);
    };
  }, [hasClassTabs, isThreeColumnDesktop]);

  return (
    <section
      className="rounded-2xl border p-4 md:p-5 shadow-lg"
      style={{
        background: "linear-gradient(135deg, rgba(20, 39, 62, 0.9), rgba(9, 21, 41, 0.95))",
        borderColor: palette.line,
        boxShadow: "0 30px 60px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
      }}
      aria-busy={loading}
    >
      <div className="space-y-4">
        <div className={guildProfileInfoStyles.sectionDivider}>
          <div
            className={guildProfileInfoStyles.sectionStripe}
            style={{ background: `linear-gradient(90deg, transparent, ${palette.icon}, transparent)` }}
          />
          <div className={guildProfileInfoStyles.sectionTitle} style={{ color: palette.soft }}>
            GUILD OVERVIEW
          </div>
          <div
            className={guildProfileInfoStyles.sectionStripe}
            style={{ background: `linear-gradient(90deg, transparent, ${palette.icon}, transparent)` }}
          />
        </div>

        <div
          className={
            hasClassTabs
              ? "grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_minmax(0,340px)]"
              : "grid items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)]"
          }
        >
          <div className="min-w-0">
            <div ref={leftRef} className="h-fit self-start space-y-4">
              <div
                className="rounded-2xl border p-3"
                style={{ borderColor: "transparent", background: "transparent" }}
              >
                <div
                  className="w-full overflow-hidden rounded-xl"
                  style={{
                    aspectRatio: "3 / 4",
                    border: "1px solid transparent",
                    background: "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {data.emblemUrl ? (
                    <img
                      src={data.emblemUrl}
                      alt={data.emblemAlt ?? ""}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="max-h-full max-w-full"
                      style={{
                        maxHeight: "115%",
                        maxWidth: "115%",
                        objectFit: "contain",
                        filter:
                          "drop-shadow(0 2px 3px rgba(0,0,0,.45)) drop-shadow(0 8px 16px rgba(0,0,0,.35))",
                      }}
                    />
                  ) : (
                    <EmblemFallback label={data.guildName} size={180} />
                  )}
                </div>
              </div>

              <div
                className="rounded-2xl border p-4"
                style={{ borderColor: palette.line, background: "rgba(2, 17, 40, 0.55)" }}
              >
                <div className="truncate text-3xl font-extrabold" style={{ color: palette.title }}>
                  {data.guildName}
                </div>
                {data.subtitle ? (
                  <div className="mt-1 text-sm" style={{ color: palette.soft }}>
                    {data.subtitle}
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" style={{ color: palette.soft }}>
                  {data.server ? (
                    <span>
                      {t("guildProfile.heroPanel.meta.server", { defaultValue: "Server" })}: {data.server}
                    </span>
                  ) : null}
                  {typeof data.memberCount === "number" ? (
                    <span>
                      {t("guildProfile.heroPanel.meta.members", { defaultValue: "Members" })}:{" "}
                      {data.memberCount.toLocaleString("de-DE")}
                    </span>
                  ) : null}
                  {typeof data.hofRank === "number" ? (
                    <span>
                      {t("guildProfile.heroPanel.meta.hofRank", { defaultValue: "HoF Rank" })}: #{data.hofRank}
                    </span>
                  ) : null}
                </div>
                {localizedLastScanLabel ? (
                  <div className="mt-1 text-sm" style={{ color: palette.soft }}>
                    {t("guildProfile.heroPanel.meta.lastScanned", { defaultValue: "Last scanned" })}:{" "}
                    {localizedLastScanLabel}
                  </div>
                ) : null}
                <Tooltip content={freshnessTooltip}>
                  <div
                    className="mt-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs"
                    style={{ borderColor: palette.line, color: palette.soft, background: "rgba(15, 23, 42, 0.22)" }}
                  >
                    <span
                      aria-hidden
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: FRESHNESS_DOT_COLORS[freshness.level] }}
                    />
                    <span>{freshness.label}</span>
                  </div>
                </Tooltip>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <div ref={middleRef} className="h-fit self-start min-w-0 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {metricsToRender.map((metric, index) => {
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
                  <div className="space-y-1 text-xs">
                    {hoverLines.map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                  </div>
                ) : undefined;

              return (
                <div
                  key={`${metric.label}-${index}`}
                  className="flex min-h-[132px] items-center justify-center rounded-xl border p-3"
                  style={{ borderColor: "transparent", background: "transparent" }}
                >
                  <HexGauge
                    value={progress}
                    size={124}
                    stroke={10}
                    center={<div className="text-sm font-semibold" style={{ color: palette.title }}>{metric.gauge.centerTop}</div>}
                    hoverDetails={hoverDetails}
                  />
                </div>
              );
            }

            return (
              <div
                key={`${metric.label}-${index}`}
                className="rounded-xl border p-3"
                style={{ borderColor: palette.line, background: palette.tileAlt }}
              >
                <div className="text-xs uppercase tracking-wide" style={{ color: palette.soft }}>
                  {metric.label}
                </div>
                <div className="mt-1 text-lg font-bold" style={{ color: palette.title }}>
                  {formatMetricValue(metric.value)}
                </div>
                {metric.hint ? (
                  <div className="mt-0.5 text-xs" style={{ color: palette.soft }}>
                    {metric.hint}
                  </div>
                ) : null}
              </div>
            );
          })}
          </div>

          <div
            className="rounded-2xl border p-4 md:p-5"
            style={{ borderColor: palette.line, background: "rgba(2, 17, 40, 0.5)" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm uppercase tracking-wide" style={{ color: palette.soft }}>
                {t("guildProfile.heroPanel.sections.averagePlayerStats", {
                  defaultValue: "Average Player Stats",
                })}
              </div>
              <div
                className="inline-flex items-center gap-1 rounded-full border p-1"
                style={{ borderColor: palette.line, background: "rgba(20, 39, 62, 0.7)" }}
                role="tablist"
                aria-label={t("guildProfile.heroPanel.sections.modeToggle", {
                  defaultValue: "Base or Total",
                })}
              >
                <button
                  type="button"
                  className="rounded-full px-3 py-1 text-sm font-semibold"
                  style={{
                    color: statsMode === "base" ? palette.title : palette.soft,
                    background: statsMode === "base" ? palette.header : "transparent",
                  }}
                  aria-selected={statsMode === "base"}
                  onClick={() => setStatsMode("base")}
                >
                  {t("guildProfile.heroPanel.sections.base", { defaultValue: "Base" })}
                </button>
                <button
                  type="button"
                  className="rounded-full px-3 py-1 text-sm font-semibold"
                  style={{
                    color: statsMode === "total" ? palette.title : palette.soft,
                    background: statsMode === "total" ? palette.header : "transparent",
                  }}
                  aria-selected={statsMode === "total"}
                  onClick={() => setStatsMode("total")}
                >
                  {t("guildProfile.heroPanel.sections.total", { defaultValue: "Total" })}
                </button>
              </div>
            </div>

            <div
              className="mt-4 rounded-xl border p-4"
              style={{
                borderColor: palette.line,
                background: "linear-gradient(180deg, rgba(20,39,62,0.4), rgba(20,39,62,0.15))",
              }}
            >
              <div className="space-y-3">
                {averageRows.map((row) => (
                  <div
                    key={`${statsMode}-${row.label}`}
                    className="rounded-lg border px-3 py-3"
                    style={{ borderColor: palette.line, background: "rgba(12, 27, 47, 0.5)" }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div
                          className="text-xs uppercase tracking-wide"
                          style={{ color: palette.soft }}
                        >
                          {row.label}
                        </div>
                        <div className="mt-1 text-xs" style={{ color: palette.soft }}>
                          ø
                        </div>
                      </div>
                      <div className="text-3xl font-extrabold leading-none" style={{ color: palette.title }}>
                        {formatAverageValue(row.value)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            {top3Panels.map((panel) => (
              <div
                key={`${statsMode}-${panel.key}`}
                className="rounded-xl border p-3"
                style={{
                  borderColor: palette.line,
                  background: "linear-gradient(180deg, rgba(20,39,62,0.45), rgba(10,24,43,0.55))",
                }}
              >
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: palette.soft }}>
                  {panel.title}
                </div>
                <div className="mt-2 space-y-2">
                  {panel.entries.map((entry, index) => {
                    const classKey = normalizeClassToken(entry?.classLabel);
                    const accent = classAccentByLabel.get(classKey) ?? "hsl(212 46% 57%)";
                    const iconUrl = entry?.classLabel ? getClassIconUrl(entry.classLabel, 64) : undefined;
                    return (
                      <div
                        key={`${statsMode}-${panel.key}-${index}`}
                        className="flex items-center gap-2 rounded-lg border px-2.5 py-2"
                        style={{
                          borderColor: accent,
                          background: `linear-gradient(90deg, ${accent.replace(")", " / 0.2)")}, rgba(20,39,62,0.45))`,
                        }}
                      >
                        <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-md border border-black/20 bg-black/15">
                          {iconUrl ? <img src={iconUrl} alt="" className="h-5 w-5 object-contain" /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm" style={{ color: palette.title }}>
                          {entry?.name ?? "--"}
                        </span>
                        <span className="text-sm font-semibold" style={{ color: palette.title }}>
                          {typeof entry?.value === "number" ? entry.value.toLocaleString("de-DE") : "--"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {badges.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {badges.map((badge) => (
                <span
                  key={badge.label}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
                  style={{ borderColor: palette.line, color: palette.soft, background: "rgba(15, 23, 42, 0.18)" }}
                  title={badge.hint}
                >
                  {badge.icon ? <span aria-hidden>{badge.icon}</span> : null}
                  <span>{badge.label}</span>
                  <strong style={{ color: palette.title }}>{formatMetricValue(badge.value)}</strong>
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {actionsToRender.map((action) => (
              <button
                key={action.key}
                type="button"
                className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
                style={{ borderColor: palette.line, color: palette.title, background: palette.header }}
                disabled={loading || action.disabled}
                title={action.title}
                onClick={() => onAction?.(action.key)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
          </div>

          {classTabs ? (
            <div className="min-w-0 lg:col-start-2 xl:col-start-auto">
              <div className="flex min-h-0 flex-col gap-3 overflow-hidden" style={rightColumnHeightStyle}>
                <div className="flex flex-none items-center gap-2">
                <button type="button" onClick={() => setActiveClassTab("overview")} aria-label="Klassenübersicht">
                  <HudLabel
                    text="Klassenübersicht"
                    tone={activeClassTab === "overview" ? "accent" : "default"}
                  />
                </button>
                <button type="button" onClick={() => setActiveClassTab("distribution")} aria-label="Klassenverteilung">
                  <HudLabel
                    text="Klassenverteilung"
                    tone={activeClassTab === "distribution" ? "accent" : "default"}
                  />
                </button>
              </div>

                <div className="sfdatahub-scrollbar min-h-0 flex-1 overflow-y-auto">
                  {activeClassTab === "overview" ? (
                    <ClassCrestGrid
                      data={classTabs.data}
                      classMeta={classTabs.classMeta}
                      onPickClass={classTabs.onPickClass}
                    />
                  ) : (
                    <ClassDonut data={classTabs.data} classMeta={classTabs.classMeta} />
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
});

export default GuildHeroPanel;
