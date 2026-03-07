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
import { getGuildClassAccent, getGuildMutedAccent } from "./classColors";

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

export type GuildHeroTransferEntry = {
  memberId: string;
  name: string;
  classLabel: string;
  level?: number | null;
  classKey?: string;
};

export type GuildHeroTransfersData = {
  joined?: GuildHeroTransferEntry[];
  left?: GuildHeroTransferEntry[];
  hasMonthlyComparison?: boolean;
  comparisonFromLabel?: string | null;
  comparisonToLabel?: string | null;
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
  transfers?: GuildHeroTransfersData;
  classTabs?: Pick<GuildClassOverviewProps, "data" | "classMeta" | "onPickClass">;
};

export type GuildHeroPanelProps = {
  data: GuildHeroPanelData;
  loading?: boolean;
  colors?: Partial<PaletteColors>;
  onAction?: (action: GuildHeroAction["key"]) => void;
  context?: "profile" | "overlay";
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
  context = "overlay",
}: GuildHeroPanelProps) {
  const { t } = useTranslation();
  const [statsMode, setStatsMode] = useState<"base" | "total">("base");
  const [activeClassTab, setActiveClassTab] = useState<"overview" | "distribution">("overview");
  const [isThreeColumnDesktop, setIsThreeColumnDesktop] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(THREE_COLUMN_MEDIA_QUERY).matches;
  });
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
    const lines: string[] = [];
    if (data.lastScanAtLabel) {
      lines.push(
        t("guildProfile.heroPanel.tooltips.lastScanAt", {
          value: data.lastScanAtLabel,
          defaultValue: "Last scan: {{value}}",
        }),
      );
    }
    const ageLabel = formatAgeLabel(t, data.lastScanDays);
    if (ageLabel) {
      lines.push(
        t("guildProfile.heroPanel.tooltips.age.label", {
          value: ageLabel,
          defaultValue: "Age: {{value}}",
        }),
      );
    }
    if (freshness.hint) lines.push(freshness.hint);
    if (!lines.length) return null;
    return (
      <div className={guildProfileInfoStyles.freshnessTooltipLines}>
        {lines.map((line, index) => (
          <div key={`${line}-${index}`}>{line}</div>
        ))}
      </div>
    );
  }, [data.lastScanAtLabel, data.lastScanDays, freshness.hint, t]);

  const localizedLastScanLabel = formatAgeLabel(t, data.lastScanDays) ?? data.lastScanLabel;
  const metrics = data.metrics ?? [];
  const badges = data.badges ?? [];
  const actions = data.actions ?? [];
  const openGuildLabel = t("guildProfile.heroPanel.actions.openGuild", { defaultValue: "Open guild" });
  const showInTopListLabel = t("playerProfile.heroPanel.actions.showInTopList", {
    defaultValue: "Show in Top List",
  });
  const classTabs = data.classTabs;
  const hasClassTabs = Boolean(classTabs);
  const isOverlayContext = context === "overlay";
  const rightColumnHeightStyle =
    hasClassTabs && isThreeColumnDesktop && rightColumnCapHeight && rightColumnCapHeight > 0
      ? { maxHeight: rightColumnCapHeight }
      : undefined;
  const shouldLockRightColumnScroll =
    isOverlayContext && hasClassTabs && isThreeColumnDesktop && rightColumnCapHeight == null;
  const shellClassName = isOverlayContext
    ? "rounded-2xl border p-3 md:p-4 shadow-lg"
    : "rounded-2xl border p-4 md:p-5 shadow-lg";
  const stackClassName = isOverlayContext ? "space-y-3" : "space-y-4";
  const contentGridClassName = hasClassTabs
    ? isOverlayContext
      ? "grid items-start gap-3 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_minmax(0,340px)]"
      : "grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_minmax(0,340px)]"
    : "grid items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)]";
  const metricsToRender: GuildHeroMetric[] =
    metrics.length > 0
      ? metrics
      : [
          {
            label: t("guildProfile.heroPanel.metrics.activity", { defaultValue: "Activity" }),
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
              centerBottom: t("guildProfile.heroPanel.metrics.activity", { defaultValue: "Activity" }),
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
  const gaugeMetricsToRender = useMemo<GuildHeroMetric[]>(() => {
    const gauges = metricsToRender.filter((metric) => Boolean(metric.gauge)).slice(0, 2);
    if (gauges.length === 2) return gauges;
    const fallbackGauges: GuildHeroMetric[] = [
      {
        label: t("guildProfile.heroPanel.metrics.activity", { defaultValue: "Activity" }),
        value: "--",
        gauge: {
          progress: 0,
          centerTop: "--",
          centerBottom: t("guildProfile.heroPanel.metrics.activity", { defaultValue: "Activity" }),
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
    ];
    return [...gauges, ...fallbackGauges.slice(gauges.length, 2)];
  }, [metricsToRender, t]);
  const hasMonthlyTransferComparison = data.transfers?.hasMonthlyComparison ?? false;
  const transferComparisonSubtitle = useMemo(() => {
    if (!hasMonthlyTransferComparison) return null;
    const fromLabel = data.transfers?.comparisonFromLabel ?? null;
    const toLabel = data.transfers?.comparisonToLabel ?? null;
    if (!fromLabel || !toLabel) return null;
    return t("guildProfile.heroPanel.transfers.changesRange", {
      from: fromLabel,
      to: toLabel,
      defaultValue: "Changes: {{from}} → {{to}}",
    });
  }, [data.transfers?.comparisonFromLabel, data.transfers?.comparisonToLabel, hasMonthlyTransferComparison, t]);
  const transferPanels = useMemo(
    () => [
      {
        key: "joined",
        label: t("guildProfile.heroPanel.transfers.joined", { defaultValue: "Joined" }),
        entries: data.transfers?.joined ?? [],
        tone: "#5CC689",
        mutedTone: "rgba(92, 198, 137, 0.18)",
        chipBorder: "rgba(92, 198, 137, 0.44)",
        chipBackground: "linear-gradient(135deg, rgba(92, 198, 137, 0.32) 0%, rgba(92, 198, 137, 0.14) 100%)",
        panelBackground: "linear-gradient(180deg, rgba(17, 38, 30, 0.64) 0%, rgba(8, 22, 40, 0.7) 100%)",
        panelBorder: "rgba(92, 198, 137, 0.34)",
        rowBorder: "rgba(176, 196, 217, 0.24)",
        rowBackground: "rgba(8, 18, 30, 0.58)",
        scrollbarThumb: "rgba(92, 198, 137, 0.58)",
      },
      {
        key: "left",
        label: t("guildProfile.heroPanel.transfers.left", { defaultValue: "Left" }),
        entries: data.transfers?.left ?? [],
        tone: "#F59E6A",
        mutedTone: "rgba(245, 158, 106, 0.18)",
        chipBorder: "rgba(245, 158, 106, 0.44)",
        chipBackground: "linear-gradient(135deg, rgba(245, 158, 106, 0.32) 0%, rgba(245, 158, 106, 0.14) 100%)",
        panelBackground: "linear-gradient(180deg, rgba(45, 30, 20, 0.64) 0%, rgba(8, 22, 40, 0.7) 100%)",
        panelBorder: "rgba(245, 158, 106, 0.34)",
        rowBorder: "rgba(176, 196, 217, 0.24)",
        rowBackground: "rgba(8, 18, 30, 0.58)",
        scrollbarThumb: "rgba(245, 158, 106, 0.58)",
      },
    ],
    [data.transfers?.joined, data.transfers?.left, t],
  );
  const actionsToRender: GuildHeroAction[] = useMemo(() => {
    const defaultActions: GuildHeroAction[] =
      context === "profile"
        ? [
            {
              key: "placeholder_show_in_top_list",
              label: showInTopListLabel,
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
          ]
        : [
            {
              key: "placeholder_open_guild",
              label: openGuildLabel,
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
    const source = actions.length > 0 ? actions : defaultActions;
    if (context !== "profile") return source;
    return source.map((action) => {
      if (action.key === "open_guild") {
        return {
          ...action,
          key: "show_in_top_list",
          label: showInTopListLabel,
          title: action.title ?? showInTopListLabel,
        };
      }
      if (action.key === "placeholder_open_guild") {
        return {
          ...action,
          key: "placeholder_show_in_top_list",
          label: showInTopListLabel,
          disabled: true,
          title: action.title ?? showInTopListLabel,
        };
      }
      return action;
    });
  }, [actions, context, openGuildLabel, showInTopListLabel, t]);
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
            {
              key: "main",
              title: t("guildProfile.heroPanel.top3.mainAttribute", { defaultValue: "Main Attribute Top 3" }),
              entries: data.top3?.base?.main ?? [],
            },
            {
              key: "con",
              title: t("guildProfile.heroPanel.top3.con", { defaultValue: "Con Top 3" }),
              entries: data.top3?.base?.con ?? [],
            },
            {
              key: "sum",
              title: t("guildProfile.heroPanel.top3.sum", { defaultValue: "Sum Top 3" }),
              entries: data.top3?.base?.sum ?? [],
            },
          ]
        : [
            {
              key: "main",
              title: t("guildProfile.heroPanel.top3.mainAttribute", { defaultValue: "Main Attribute Top 3" }),
              entries: data.top3?.total?.main ?? [],
            },
            {
              key: "con",
              title: t("guildProfile.heroPanel.top3.con", { defaultValue: "Con Top 3" }),
              entries: data.top3?.total?.con ?? [],
            },
            {
              key: "total",
              title: t("guildProfile.heroPanel.top3.total", { defaultValue: "Total Top 3" }),
              entries: data.top3?.total?.total ?? [],
            },
          ];

    return source.map((panel) => ({
      ...panel,
      entries: Array.from({ length: 3 }, (_, index) => panel.entries[index] ?? null),
    }));
  }, [data.top3, statsMode, t]);
  const statLabelByKey = useMemo(
    () => ({
      main: t("guildProfile.heroPanel.statsLabels.main", { defaultValue: "Main" }),
      con: t("guildProfile.heroPanel.statsLabels.con", { defaultValue: "Con" }),
      sum: t("guildProfile.heroPanel.statsLabels.sum", { defaultValue: "Sum" }),
      total: t("guildProfile.heroPanel.statsLabels.total", { defaultValue: "Total" }),
    }),
    [t],
  );
  const classAccentByLabel = useMemo(() => {
    const meta = classTabs?.classMeta ?? [];
    const map = new Map<string, string>();
    meta.forEach((item, index) => {
      const hue = Math.round((360 / Math.max(meta.length, 1)) * index);
      const color =
        getGuildClassAccent(item.id) ??
        getGuildClassAccent(item.name) ??
        `hsl(${hue} 60% 55%)`;
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
      className={shellClassName}
      style={{
        background: "linear-gradient(135deg, rgba(20, 39, 62, 0.9), rgba(9, 21, 41, 0.95))",
        borderColor: palette.line,
        boxShadow:
          context === "overlay"
            ? "0 12px 28px rgba(0, 0, 0, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.04)"
            : "0 30px 60px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
      }}
      aria-busy={loading}
    >
      <div className={stackClassName}>
        <div className={guildProfileInfoStyles.sectionDivider}>
          <div
            className={guildProfileInfoStyles.sectionStripe}
            style={{ background: `linear-gradient(90deg, transparent, ${palette.icon}, transparent)` }}
          />
          <div className={guildProfileInfoStyles.sectionTitle} style={{ color: palette.soft }}>
            {t("guildProfile.heroPanel.sections.guildOverview", { defaultValue: "Guild Overview" })}
          </div>
          <div
            className={guildProfileInfoStyles.sectionStripe}
            style={{ background: `linear-gradient(90deg, transparent, ${palette.icon}, transparent)` }}
          />
        </div>

        <div className={contentGridClassName}>
          <div className="min-w-0">
            <div ref={leftRef} className={`h-fit self-start ${isOverlayContext ? "space-y-3" : "space-y-4"}`}>
              <div
                className={`rounded-2xl border ${isOverlayContext ? "p-2" : "p-3"}`}
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
                className={`rounded-2xl border ${isOverlayContext ? "p-3" : "p-4"}`}
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
                <Tooltip
                  content={freshnessTooltip}
                  contentClassName={guildProfileInfoStyles.freshnessTooltipCard}
                  placement={isOverlayContext ? "bottom" : "top"}
                >
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

              <div
                className={`rounded-2xl border ${isOverlayContext ? "p-2.5" : "p-3"}`}
                style={{ borderColor: palette.line, background: "rgba(2, 17, 40, 0.42)" }}
              >
                <div className={`grid grid-cols-2 ${isOverlayContext ? "gap-2" : "gap-2.5"}`}>
                  {gaugeMetricsToRender.map((metric, index) => {
                    if (!metric.gauge) return null;
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
                        key={`left-gauge-${metric.label}-${index}`}
                        className={`flex items-center justify-center rounded-xl border ${isOverlayContext ? "min-h-[102px] p-1.5" : "min-h-[112px] p-2"}`}
                        style={{ borderColor: "transparent", background: "transparent" }}
                      >
                        <HexGauge
                          value={progress}
                          size={isOverlayContext ? 104 : 112}
                          stroke={9}
                          center={
                            <div className="text-sm font-semibold" style={{ color: palette.title }}>
                              {metric.gauge.centerTop}
                            </div>
                          }
                          hoverDetails={hoverDetails}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <div ref={middleRef} className={`h-fit self-start min-w-0 ${isOverlayContext ? "space-y-3" : "space-y-4"}`}>
          <div
            className={`rounded-2xl border ${isOverlayContext ? "p-3 md:p-4" : "p-4 md:p-5"}`}
            style={{ borderColor: "transparent", background: "transparent" }}
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
              className={`rounded-xl border ${isOverlayContext ? "mt-3 p-3" : "mt-4 p-4"}`}
              style={{
                borderColor: "transparent",
                background: "transparent",
              }}
            >
              <div className={isOverlayContext ? "grid gap-3.5 md:grid-cols-2" : "grid gap-4 md:grid-cols-2"}>
                {averageRows.map((row, rowIndex) => {
                  const panel = top3Panels.find((item) => item.key === row.label);
                  return (
                    <div
                      key={`${statsMode}-${row.label}`}
                      className={`rounded-lg border px-3 py-3.5 ${rowIndex === 2 ? "md:col-span-2" : ""}`}
                      style={{ borderColor: "transparent", background: "transparent" }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: palette.soft }}>
                          {panel?.title}
                        </div>
                        <div className="ml-auto flex min-w-0 items-center gap-3 text-right">
                          <div>
                            <div
                              className="text-xs uppercase tracking-wide"
                              style={{ color: palette.soft }}
                            >
                              ø {statLabelByKey[row.label as keyof typeof statLabelByKey] ?? row.label}
                            </div>
                          </div>
                          <div className="text-lg font-bold leading-none" style={{ color: palette.title }}>
                            {formatAverageValue(row.value)}
                          </div>
                        </div>
                      </div>

                      {panel ? (
                        <div className="mt-2.5">
                          <div className="space-y-2.5">
                            {(() => {
                              const maxValue = panel.entries.reduce((max, item) => {
                                if (typeof item?.value === "number" && Number.isFinite(item.value)) {
                                  return Math.max(max, item.value);
                                }
                                return max;
                              }, 0);
                              return panel.entries.map((entry, index) => {
                                const classKey = normalizeClassToken(entry?.classLabel);
                                const classAccent =
                                  classAccentByLabel.get(classKey) ??
                                  getGuildClassAccent(entry?.classLabel) ??
                                  "hsl(212 46% 57%)";
                                const iconUrl = entry?.classLabel ? getClassIconUrl(entry.classLabel, 256) : undefined;
                                const rank = index + 1;
                                const mutedLow =
                                  getGuildMutedAccent(entry?.classLabel, 0.24) ??
                                  getGuildMutedAccent(classAccent, 0.24) ??
                                  "#2d4764";
                                const mutedMid =
                                  getGuildMutedAccent(entry?.classLabel, 0.36) ??
                                  getGuildMutedAccent(classAccent, 0.36) ??
                                  "#375777";
                                const mutedHigh =
                                  getGuildMutedAccent(entry?.classLabel, 0.48) ??
                                  getGuildMutedAccent(classAccent, 0.48) ??
                                  "#44698b";
                                const value =
                                  typeof entry?.value === "number" && Number.isFinite(entry.value) ? entry.value : null;
                                const rel = maxValue > 0 && value != null ? Math.max(0, Math.min(1, value / maxValue)) : 0;
                                return (
                                  <div
                                    key={`${statsMode}-${panel.key}-${index}`}
                                    className="group relative overflow-hidden rounded-2xl px-3 py-1.5"
                                    style={{
                                      background: "rgba(0,0,0,0.16)",
                                      boxShadow: `0 0 0 1px rgba(43, 76, 115, 0.88) inset`,
                                    }}
                                  >
                                    <div
                                      className="absolute inset-y-0 left-0"
                                      style={{
                                        width: `${Math.round(rel * 100)}%`,
                                        background: `linear-gradient(90deg, ${mutedHigh}CC 0%, ${mutedMid}88 52%, ${mutedLow}00 100%)`,
                                      }}
                                    />
                                    <div className="relative flex items-center gap-3">
                                      <div className="relative h-6 w-16 shrink-0 overflow-visible">
                                        <span
                                          className="absolute left-0 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center overflow-visible rounded-xl"
                                          style={{
                                            background: "transparent",
                                            boxShadow: `0 0 0 1px ${mutedMid}B3 inset`,
                                            color: palette.title,
                                          }}
                                          title={t("guildProfile.heroPanel.top3.rankLabel", {
                                            rank,
                                            defaultValue: "Rank {{rank}}",
                                          })}
                                        >
                                          {iconUrl ? (
                                            <img
                                              src={iconUrl}
                                              alt=""
                                              className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 max-w-none -translate-x-1/2 -translate-y-1/2 object-contain"
                                            />
                                          ) : null}
                                        </span>
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="min-w-0">
                                            <div
                                              className="truncate text-sm font-semibold"
                                              style={{ color: palette.title }}
                                              title={entry?.name ?? "--"}
                                            >
                                              {entry?.name ?? "--"}
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <div className="text-sm font-semibold" style={{ color: palette.title }}>
                                              {typeof value === "number" ? value.toLocaleString("de-DE") : "--"}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                    <div
                                      className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100"
                                      style={{ background: `linear-gradient(100deg, ${mutedLow}14 0%, ${mutedMid}1A 100%)` }}
                                    />
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

              <div className={`grid grid-cols-1 ${isOverlayContext ? "gap-2.5" : "gap-3"} sm:grid-cols-2 xl:grid-cols-4`}>
                <div
                  className={`rounded-xl border ${isOverlayContext ? "p-3" : "p-3.5"} sm:col-span-2 xl:col-span-4`}
                  style={{
                    borderColor: palette.line,
                    background: "linear-gradient(180deg, rgba(10, 24, 40, 0.56) 0%, rgba(8, 20, 34, 0.44) 100%)",
                  }}
                >
                  <div className="min-w-0">
                    <div
                      className="text-sm font-extrabold uppercase tracking-[0.18em] md:text-[15px]"
                      style={{ color: palette.title }}
                    >
                      {t("guildProfile.heroPanel.transfers.title", { defaultValue: "Transfers" })}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] tracking-wide" style={{ color: palette.soft }}>
                      {transferComparisonSubtitle}
                    </div>
                  </div>
                  {!hasMonthlyTransferComparison ? (
                    <div
                      className="mt-2 flex min-h-[80px] items-center justify-center rounded-lg border border-dashed px-3 text-center text-[11px]"
                      style={{
                        borderColor: "rgba(176, 196, 217, 0.3)",
                        color: palette.soft,
                        background: "linear-gradient(180deg, rgba(9, 21, 36, 0.62) 0%, rgba(8, 18, 30, 0.54) 100%)",
                      }}
                    >
                      {t("guildProfile.heroPanel.transfers.noMonthlyComparison", {
                        defaultValue: "No monthly comparison snapshot available",
                      })}
                    </div>
                  ) : (
                    <div className="mt-2.5 grid min-h-0 grid-cols-2 gap-2.5">
                      {transferPanels.map((panel) => (
                        <div
                          key={panel.key}
                          className="rounded-lg border px-2.5 py-2"
                          style={{
                            borderColor: panel.panelBorder,
                            background: panel.panelBackground,
                            boxShadow: `inset 0 0 0 1px ${panel.mutedTone}`,
                          }}
                        >
                          <div
                            className="mb-1.5 flex items-center justify-between gap-2 border-b pb-1.5"
                            style={{ borderColor: panel.mutedTone }}
                          >
                            <div
                              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                              style={{
                                color: panel.tone,
                                borderColor: panel.chipBorder,
                                background: panel.chipBackground,
                              }}
                            >
                              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: panel.tone }} />
                              {panel.label}
                            </div>
                            <span
                              className="inline-flex h-5 min-w-[2.1rem] items-center justify-center rounded-md border px-1.5 text-[10px] font-extrabold tabular-nums shadow-[0_0_0_1px_rgba(6,12,20,0.35)_inset]"
                              style={{
                                color: panel.tone,
                                borderColor: panel.chipBorder,
                                background: "linear-gradient(180deg, rgba(9, 20, 34, 0.82) 0%, rgba(6, 14, 26, 0.74) 100%)",
                              }}
                            >
                              {panel.entries.length}
                            </span>
                          </div>
                          <div
                            className="sfdatahub-scrollbar max-h-[80px] space-y-1 overflow-y-auto pr-1"
                            style={{ scrollbarColor: `${panel.scrollbarThumb} rgba(10, 22, 36, 0.7)` }}
                          >
                            {panel.entries.length === 0 ? (
                              <div
                                className="relative flex h-6 items-center rounded-md border border-dashed px-1.5 text-[10px]"
                                style={{
                                  borderColor: panel.rowBorder,
                                  color: palette.soft,
                                  background: panel.rowBackground,
                                }}
                              >
                                <span aria-hidden className="absolute inset-y-0 left-0 w-[2px]" style={{ background: panel.tone }} />
                                {t("guildProfile.heroPanel.transfers.empty", { defaultValue: "No changes" })}
                              </div>
                            ) : null}
                            {panel.entries.map((entry, entryIndex) => {
                              const iconUrl = getClassIconUrl(entry.classKey ?? entry.classLabel, 256);
                              return (
                                <div
                                  key={`${panel.key}-${entry.memberId || `${entry.name}-${entry.level ?? "na"}-${entryIndex}`}`}
                                  className="group relative flex h-6 items-center gap-1.5 overflow-hidden rounded-md border px-1.5 text-[10px]"
                                  style={{ borderColor: panel.rowBorder, background: panel.rowBackground }}
                                >
                                  <span
                                    aria-hidden
                                    className="absolute inset-y-0 left-0 w-[2px]"
                                    style={{ background: panel.tone }}
                                  />
                                  <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: palette.title }}>
                                    {entry.name}
                                  </span>
                                  {iconUrl ? (
                                    <span
                                      className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border"
                                      style={{ borderColor: panel.rowBorder, background: "rgba(7, 14, 24, 0.34)" }}
                                    >
                                      <img
                                        src={iconUrl}
                                        alt=""
                                        className="h-3 w-3 shrink-0 object-contain"
                                        draggable={false}
                                      />
                                    </span>
                                  ) : (
                                    <span className="shrink-0 uppercase" style={{ color: palette.soft }}>
                                      {(entry.classLabel || "").slice(0, 3)}
                                    </span>
                                  )}
                                  <span
                                    className="shrink-0 rounded border px-1 py-0.5 font-semibold"
                                    style={{ color: palette.soft, borderColor: panel.rowBorder, background: "rgba(7, 14, 24, 0.34)" }}
                                  >
                                    {t("guildProfile.heroPanel.transfers.levelShort", { defaultValue: "Lv" })}{" "}
                                    {typeof entry.level === "number" && Number.isFinite(entry.level) ? entry.level : "--"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
                <button
                  type="button"
                  onClick={() => setActiveClassTab("overview")}
                  aria-label={t("guildProfile.heroPanel.sections.classOverview", {
                    defaultValue: "Class overview",
                  })}
                >
                  <HudLabel
                    text={t("guildProfile.heroPanel.sections.classOverview", {
                      defaultValue: "Class overview",
                    })}
                    tone={activeClassTab === "overview" ? "accent" : "default"}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveClassTab("distribution")}
                  aria-label={t("guildProfile.heroPanel.sections.classDistribution", {
                    defaultValue: "Class distribution",
                  })}
                >
                  <HudLabel
                    text={t("guildProfile.heroPanel.sections.classDistribution", {
                      defaultValue: "Class distribution",
                    })}
                    tone={activeClassTab === "distribution" ? "accent" : "default"}
                  />
                </button>
              </div>

                <div
                  className={`sfdatahub-scrollbar min-h-0 flex-1 ${
                    shouldLockRightColumnScroll ? "overflow-y-hidden" : "overflow-y-auto"
                  }`}
                >
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
