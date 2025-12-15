import React, { useMemo, useState } from "react";
import PortraitPreview from "../avatar/PortraitPreview";
import type { HeroAction, HeroPanelData } from "./types";
import { CLASSES } from "../../data/classes";
import { toDriveThumbProxy } from "../../lib/urls";
import PlayerAttributeBars from "./AttributeBars/PlayerAttributeBars";

type FreshnessLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | "unknown";

const computeFreshness = (
  lastScanDays?: number | null,
): { level: FreshnessLevel; label: string; hint: string } => {
  if (lastScanDays == null || !Number.isFinite(lastScanDays)) {
    return { level: "unknown", label: "Unknown", hint: "Scan history unavailable" };
  }
  const days = Math.max(0, Math.floor(lastScanDays));
  if (days === 0) return { level: 0, label: "Scanned today", hint: "No rescan needed" };
  if (days === 1) return { level: 1, label: "Very fresh", hint: "No rescan needed" };
  if (days <= 3) return { level: 2, label: "Fresh", hint: "No rescan needed" };
  if (days <= 7) return { level: 3, label: "Recent", hint: "Rescan recommended" };
  if (days <= 14) return { level: 4, label: "Aging", hint: "Rescan recommended" };
  if (days <= 30) return { level: 5, label: "Outdated", hint: "Rescan strongly recommended" };
  return { level: 6, label: "Stale", hint: "Rescan strongly recommended" };
};

const formatAgeLabel = (lastScanDays?: number | null) => {
  if (lastScanDays == null || !Number.isFinite(lastScanDays)) return null;
  const days = Math.max(0, Math.floor(lastScanDays));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
};

type HeroPanelProps = {
  data: HeroPanelData;
  loading?: boolean;
  onAction?: (action: HeroAction["key"]) => void;
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

function HeroPanel({ data, loading, onAction }: HeroPanelProps) {
  const [mode, setMode] = useState<"base" | "total">("base");
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const freshness = useMemo(() => computeFreshness(data.lastScanDays), [data.lastScanDays]);
  const freshnessTooltip = useMemo(() => {
    const parts = [];
    if (data.lastScanAtLabel) parts.push(`Last scan: ${data.lastScanAtLabel}`);
    const ageLabel = formatAgeLabel(data.lastScanDays);
    if (ageLabel) parts.push(`Age: ${ageLabel}`);
    if (freshness.hint) parts.push(freshness.hint);
    return parts.join(" | ");
  }, [data.lastScanAtLabel, data.lastScanDays, freshness.hint]);
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

  const heroMetrics = useMemo(() => {
    return data.metrics.map((metric) => {
      if (metric.label === "Total Base Stats" && mode === "total") {
        const totalStats = data.totalStats;
        if (totalStats) {
          const sum =
            (Number(totalStats.str) || 0) +
            (Number(totalStats.dex) || 0) +
            (Number(totalStats.int) || 0) +
            (Number(totalStats.con) || 0) +
            (Number(totalStats.lck) || 0);
          return { ...metric, label: "Total Stats", value: formatNumber(sum) };
        }
      }
      return metric;
    });
  }, [data.metrics, data.totalStats, mode]);

  return (
    <section className="player-profile__hero" aria-busy={loading}>
      <div className="player-profile__hero-portrait">
        <div className="player-profile__identity player-profile__identity--overlay">
          <ClassAvatar className={data.className} label={data.playerName} size={48} />
          <div>
            <div className="player-profile__player-name">{data.playerName}</div>
            <div className="player-profile__player-meta">
              <span>{data.className || "Klasse ?"}</span>
              {data.guild && <span>• {data.guild}</span>}
              {data.server && <span>• {data.server}</span>}
            </div>
            {data.lastScanLabel && (
            <div className="player-profile__player-meta player-profile__player-meta--soft">
              Zuletzt gescannt: {data.lastScanLabel}
            </div>
          )}
            <div className="player-profile__freshness" title={freshnessTooltip || undefined}>
              <span
                aria-hidden
                className={`player-profile__freshness-dot player-profile__freshness-dot--${freshness.level}`}
              />
              <span className="player-profile__freshness-label">{freshness.label}</span>
              <span aria-hidden className="player-profile__freshness-info">ⓘ</span>
            </div>
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
          {heroMetrics.map((metric) => (
            <div key={metric.label} className="player-profile__hero-metric">
              <div className="player-profile__hero-metric-label">{metric.label}</div>
              <div className="player-profile__hero-metric-value">{metric.value}</div>
              {metric.hint && <div className="player-profile__hero-metric-hint">{metric.hint}</div>}
            </div>
          ))}
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
    </section>
  );
}

export default React.memo(HeroPanel);
