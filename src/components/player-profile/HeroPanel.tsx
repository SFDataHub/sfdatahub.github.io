import React from "react";
import PortraitPreview from "../avatar/PortraitPreview";
import type { HeroAction, HeroPanelData } from "./types";
import { CLASSES } from "../../data/classes";
import { toDriveThumbProxy } from "../../lib/urls";

type HeroPanelProps = {
  data: HeroPanelData;
  loading?: boolean;
  actionFeedback?: string | null;
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

export default function HeroPanel({ data, loading, actionFeedback, onAction }: HeroPanelProps) {
  return (
    <section className="player-profile__hero" aria-busy={loading}>
      <PortraitPreview config={data.portrait} label={data.playerName} />
      <div className="player-profile__hero-body">
        <div className="player-profile__identity">
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
            {data.status && (
              <div className={`player-profile__status player-profile__status--${data.status}`}>
                {data.status === "online" ? "aktiv" : "inaktiv"}
              </div>
            )}
          </div>
        </div>

        <div className="player-profile__hero-metrics">
          {data.metrics.map((metric) => (
            <div key={metric.label} className="player-profile__hero-metric">
              <div className="player-profile__hero-metric-label">{metric.label}</div>
              <div className="player-profile__hero-metric-value">{metric.value}</div>
              {metric.hint && <div className="player-profile__hero-metric-hint">{metric.hint}</div>}
            </div>
          ))}
        </div>

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
            {actionFeedback && <p className="player-profile__hero-feedback">{actionFeedback}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
