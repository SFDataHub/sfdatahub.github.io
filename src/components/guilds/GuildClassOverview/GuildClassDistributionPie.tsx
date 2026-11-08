import { profilePercent, profileClassLabel } from "../../../lib/i18n/profilePresentation";
import { useProfileTranslation as useTranslation } from "../../../lib/i18n/useProfileTranslation";
import React from "react";
import type { ClassMeta } from "../../../data/classes";
import { getGuildClassAccent, getGuildMutedAccent } from "../classColors";
import { getClassIconUrl } from "../../ui/shared/classIcons";
import playerStyles from "../LocalGuildPlayerStats.module.css";
import styles from "./GuildClassDistributionPie.module.css";

type Entry = { classLabel: string; classMeta: ClassMeta | null; count: number };
type Props = {
  headingAction?: React.ReactNode;
  heading?: string | false;
  entries: Entry[];
  fitWidth?: boolean;
  iconCounts?: boolean;
  playerRowChips?: boolean;
  compact?: boolean;
  renderIcon: (entry: Entry) => React.ReactNode;
  selectedClasses?: readonly string[];
  onToggleClass?: (label: string) => void;
};

const CENTER = 120;
const RADIUS = 104;

export default function GuildClassDistributionPie({ entries, fitWidth = false, iconCounts = false, playerRowChips = false, compact = false, renderIcon, selectedClasses = [], onToggleClass, headingAction, heading }: Props) {
  const { t, i18n } = useTranslation();
  const countFormat = new Intl.NumberFormat(i18n.resolvedLanguage ?? "en");
  const gradientId = React.useId().replace(/:/g, "");
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [focused, setFocused] = React.useState<string | null>(null);
  const active = hovered ?? focused;
  const focusClass = (event: React.FocusEvent<SVGElement | HTMLButtonElement>, label: string) => {
    if (event.currentTarget.matches(":focus-visible")) {
      setHovered(null);
      setFocused(label);
    } else {
      setFocused(null);
    }
  };
  const keyboardClass = (label: string) => {
    setHovered(null);
    setFocused(label);
  };
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  let angle = -Math.PI / 2;
  const segments = entries.map((entry, index) => {
    const start = angle;
    angle += total > 0 ? (entry.count / total) * Math.PI * 2 : 0;
    const point = (value: number) => `${CENTER + RADIUS * Math.cos(value)} ${CENTER + RADIUS * Math.sin(value)}`;
    const low = getGuildMutedAccent(entry.classLabel, 0.24) ?? "#2d4764";
    const mid = getGuildMutedAccent(entry.classLabel, 0.36) ?? "#375777";
    const high = getGuildMutedAccent(entry.classLabel, 0.48) ?? "#44698b";
    return {
      ...entry,
      chipAccent: mid,
      chipGradient: `linear-gradient(90deg, ${high}CC 0%, ${mid}88 52%, ${low}00 100%)`,
      chipIcon: playerRowChips ? getClassIconUrl(entry.classLabel, 256) : undefined,
      gradient: `${gradientId}-${index}`,
      color: getGuildClassAccent(entry.classMeta?.key ?? entry.classLabel) ?? "#b0c4d9",
      description: `${profileClassLabel(entry.classLabel)}: ${countFormat.format(entry.count)} · ${profilePercent(total > 0 ? entry.count / total * 100 : 0, 1)}`,
      path: `M ${CENTER} ${CENTER} L ${point(start)} A ${RADIUS} ${RADIUS} 0 ${angle - start > Math.PI ? 1 : 0} 1 ${point(angle)} Z`,
    };
  });

  return (
    <div className={`${styles.root} ${fitWidth ? styles.fitWidth : ""} ${iconCounts ? styles.iconCounts : ""} ${compact ? styles.compact : ""} ${playerRowChips ? styles.playerRowChips : ""}`} data-class-distribution>
      {!compact && heading !== false && <h2 className={[styles.heading, headingAction ? styles.headingWithAction : ""].filter(Boolean).join(" ")}>{heading ?? t("guildChartDetails.classes")}{headingAction}</h2>}
      {total > 0 ? (
        <>
          <svg className={styles.chart} viewBox={fitWidth ? "6 6 228 228" : "0 0 240 240"} role="group" aria-label={t("profileI18n.classShares")}>
            <defs>
              {segments.map(segment => (
                <linearGradient key={segment.classLabel} id={segment.gradient} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor={segment.color} />
                  <stop offset="1" stopColor={segment.color} stopOpacity="0.72" />
                </linearGradient>
              ))}
            </defs>
            {segments.filter(segment => segment.count > 0).map(segment => {
              const props = {
                className: styles.segment,
                fill: `url(#${segment.gradient})`,
                "data-class-segment": segment.classLabel,
                "data-active": active === segment.classLabel,
                "data-selected": selectedClasses.includes(segment.classLabel),
                role: onToggleClass ? "button" : "img",
                "aria-label": segment.description,
                "aria-pressed": onToggleClass ? selectedClasses.includes(segment.classLabel) : undefined,
                tabIndex: onToggleClass ? 0 : undefined,
                onClick: () => onToggleClass?.(segment.classLabel),
                onKeyDown: (event: React.KeyboardEvent<SVGElement>) => {
                  keyboardClass(segment.classLabel);
                  if (onToggleClass && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    onToggleClass(segment.classLabel);
                  }
                },
                onMouseEnter: () => setHovered(segment.classLabel),
                onMouseLeave: () => setHovered(null),
                onPointerDown: () => setFocused(null),
                onFocus: (event: React.FocusEvent<SVGElement>) => focusClass(event, segment.classLabel),
                onBlur: () => setFocused(null),
              };
              // A full SVG arc has coincident endpoints; use a circle for 100 %.
              return segment.count === total ? (
                <circle key={segment.classLabel} {...props} cx={CENTER} cy={CENTER} r={RADIUS}><title>{segment.description}</title></circle>
              ) : (
                <path key={segment.classLabel} {...props} d={segment.path}><title>{segment.description}</title></path>
              );
            })}
          </svg>
          <ul className={styles.legend} aria-label={t("profileI18n.classLegend")}>
            {segments.map(segment => (
              <li key={segment.classLabel}>
                <button
                  type="button"
                  className={`${styles.chip} ${playerRowChips ? `${playerStyles.entry} ${styles.playerChip}` : ""}`}
                  style={{ "--class-accent": segment.color, "--stats-accent": segment.chipAccent } as React.CSSProperties}
                  tabIndex={0}
                  aria-label={segment.description}
                  title={segment.description}
                  data-class-chip={segment.classLabel}
                  data-active={active === segment.classLabel}
                  data-selected={selectedClasses.includes(segment.classLabel)}
                  aria-pressed={selectedClasses.includes(segment.classLabel)}
                  onClick={() => onToggleClass?.(segment.classLabel)}
                  onMouseEnter={() => setHovered(segment.classLabel)}
                  onMouseLeave={() => setHovered(null)}
                  onPointerDown={() => setFocused(null)}
                  onFocus={event => focusClass(event, segment.classLabel)}
                  onKeyDown={() => keyboardClass(segment.classLabel)}
                  onBlur={() => setFocused(null)}
                >
                  {playerRowChips ? <>
                    <span className={playerStyles.bar} style={{ width: "100%", background: segment.chipGradient }} aria-hidden="true" />
                    <span className={`${playerStyles.classIcon} ${styles.playerChipIcon}`} aria-hidden="true">
                      {segment.chipIcon ? <img src={segment.chipIcon} alt="" draggable={false} /> : null}
                    </span>
                  </> : <span className={styles.icon}>{renderIcon(segment)}</span>}
                  {!iconCounts && <span>{profileClassLabel(segment.classLabel)}</span>}
                  <strong>{countFormat.format(segment.count)}</strong>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className={styles.empty}>{t("profileI18n.noClasses")}</p>
      )}
    </div>
  );
}
