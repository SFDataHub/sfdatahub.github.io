import { getGuildClassAccent, getGuildMutedAccent } from "../../guilds/classColors";
import { getClassIconUrl } from "./classIcons";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import styles from "./RecordBadge.module.css";

export type RecordBadgeConcept = "medallion" | "emblem" | "card";
export type RecordBadgeSize = "compact" | "large";
export type RecordBadgeFamily =
  | "level"
  | "guild"
  | "mine"
  | "fortress"
  | "demonPortal"
  | "twister"
  | "sandstorm"
  | "mozone"
  | "boss"
  | "class";

export type RecordBadgeScope =
  | { type: "overall" }
  | { type: "class"; classId: string }
  | { type: "neutral"; label: string };
export type RecordBadgeScopeMode = "dominant" | "integrated";
export type RecordScopeThemeStyle = CSSProperties & {
  "--record-class-accent"?: string;
  "--record-class-muted-accent"?: string;
};

export type RecordBadgeProps = {
  label: string;
  family: RecordBadgeFamily;
  scope: RecordBadgeScope;
  token?: string;
  icon: LucideIcon;
  marker?: string;
  value?: string;
  showValueFallback?: boolean;
  scopeText?: string;
  artwork?: ReactNode;
  concept?: RecordBadgeConcept;
  size?: RecordBadgeSize;
  scopeMode?: RecordBadgeScopeMode;
  rootClassName?: string;
  children?: ReactNode;
};

function cx(...names: Array<string | false | undefined>) {
  return names.filter(Boolean).join(" ");
}

export function getRecordScopeThemeStyle(scope: RecordBadgeScope): RecordScopeThemeStyle | undefined {
  if (scope.type !== "class") return undefined;
  const accent = getGuildClassAccent(scope.classId);
  if (!accent) return undefined;
  return {
    "--record-class-accent": accent,
    "--record-class-muted-accent": getGuildMutedAccent(scope.classId, 0.48) ?? accent,
  };
}

function ClassIcon({ className, tone = "support" }: { className: string; tone?: "dominant" | "support" }) {
  const iconUrl = getClassIconUrl(className, tone === "dominant" ? 128 : 72);

  return (
    <span className={cx(styles.classIcon, tone === "dominant" && styles.classIconDominant)} aria-hidden="true">
      {iconUrl ? <img src={iconUrl} alt="" /> : <span className={styles.classIconFallback}>{className.slice(0, 2)}</span>}
    </span>
  );
}

export default function RecordBadge({
  label,
  family,
  scope,
  token,
  icon: Icon,
  value,
  showValueFallback = true,
  scopeText: scopeTextOverride,
  artwork,
  concept = "medallion",
  size = "compact",
  scopeMode,
  rootClassName,
  children,
}: RecordBadgeProps) {
  const isClassScope = scope.type === "class";
  const classScopeMode = isClassScope ? scopeMode ?? "integrated" : undefined;
  const scopeText =
    scopeTextOverride ??
    (scope.type === "overall"
      ? "Overall Record"
      : scope.type === "class"
        ? `Class Record: ${scope.classId}`
        : scope.label.toLowerCase() === "guild"
          ? "Guild Record"
          : `${scope.label} Record`);
  const themeStyle = getRecordScopeThemeStyle(scope);
  const valueLabel = value ?? (showValueFallback ? "Record" : undefined);

  return (
    <figure
      className={cx(
        styles.badge,
        styles[`badge${concept[0].toUpperCase()}${concept.slice(1)}`],
        styles[`badge${size[0].toUpperCase()}${size.slice(1)}`],
        scope.type === "overall" && styles.badgeOverallScope,
        classScopeMode === "dominant" && styles.badgeClassDominant,
        classScopeMode === "integrated" && styles.badgeClassIntegrated,
        rootClassName,
      )}
      style={themeStyle}
      data-scope={scope.type}
      data-family={family}
      data-token={token}
      aria-label={`${label} ${concept} ${size} badge`}
    >
      <div className={styles.badgeArt}>
        <span className={styles.familyMotif} aria-hidden="true" />
        {isClassScope && classScopeMode === "dominant" ? (
          <ClassIcon className={scope.classId} tone="dominant" />
        ) : artwork ? (
          <span className={styles.customArtwork}>{artwork}</span>
        ) : (
          <span className={styles.mainIcon} aria-hidden="true">
            <Icon />
          </span>
        )}
        {isClassScope && classScopeMode === "integrated" ? <ClassIcon className={scope.classId} /> : null}
      </div>

      <figcaption className={styles.badgeMeta}>
        <span className={styles.badgeLabel}>{label}</span>
        {valueLabel ? <span className={styles.badgeValue}>{valueLabel}</span> : null}
        <span className={styles.scopeChip}>{scopeText}</span>
      </figcaption>
      {children ? <div className={styles.badgeExtra}>{children}</div> : null}
    </figure>
  );
}
