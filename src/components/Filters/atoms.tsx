// src/components/Filters/atoms.tsx
import React from "react";
import { CLASSES, getExactClassMeta, type ClassSelection, type GameClassKey } from "../../data/classes";
import {
  toDriveDirectProxy,
  toDriveThumbProxy,
} from "../../lib/urls";
import styles from "./filters.module.css";

/* ===========================
   Icon-only Class Button (Proxy-first, CORS-clean)
   - Verwendet nur proxied Drive-URLs -> keine 302/403/CORS Errors
   - Fallback-Reihenfolge:
     1) Proxy(direct)
     2) Proxy(thumbnail)
     3) Original-URL (falls kein Drive-Link)
     4) Emoji-Fallback
   =========================== */

type ClassIconButtonProps = {
  active?: boolean;
  title?: string;
  iconUrl?: string;   // /assets/... ODER Google-Drive-Link ODER reine ID
  fallback?: string;  // z.B. Emoji
  size?: number;      // Button-Kante in px
  onClick?: () => void;
  localDropdown?: boolean;
  classAccent?: string;
};

export function ClassIconButton({
  active = false,
  title,
  iconUrl,
  fallback = "❓",
  size = 40,
  onClick,
  localDropdown = false,
  classAccent,
}: ClassIconButtonProps) {
  const imgSize = localDropdown ? 36 : Math.round(size * 0.7);

  // Proxy-first Quellen (vermeidet CORS-Fehler in der Konsole)
  const sources = React.useMemo(() => {
    const list: string[] = [];
    const s1 = toDriveDirectProxy(iconUrl, imgSize * 2, imgSize * 2, "contain");
    if (s1) list.push(s1);
    const s2 = toDriveThumbProxy(iconUrl, imgSize * 2);
    if (s2 && s2 !== s1) list.push(s2);
    // Falls kein Drive-Link erkannt wurde: Original-URL
    if (!list.length && iconUrl) list.push(iconUrl);
    return list;
  }, [iconUrl, imgSize]);

  const [idx, setIdx] = React.useState(0);
  const [hover, setHover] = React.useState(false);
  const [focus, setFocus] = React.useState(false);

  React.useEffect(() => setIdx(0), [sources]);
  const src = sources[idx] || "";

  const btnStyle: React.CSSProperties = {
    width: size,
    height: size,
    padding: 0,
    border: "1px solid #2B4C73",
    borderRadius: 12,
    background: "transparent",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    userSelect: "none",
    outline: "none",
    transition: "transform 120ms ease, box-shadow 120ms ease, background 120ms ease",
    boxShadow: (focus || active) ? "inset 0 0 18px rgba(92,139,198,.25)" : "none",
  };
  if (hover) btnStyle.background = "rgba(255,255,255,.04)";
  if (active) btnStyle.outline = "2px solid #5C8BC6";

  // Opt-in styles must also clear the legacy inline button states.
  const localStyle = localDropdown ? {
    ...btnStyle,
    border: "none",
    background: "transparent",
    boxShadow: "none",
    outline: undefined,
    transition: "none",
    "--class-accent": classAccent,
  } as React.CSSProperties : btnStyle;

  const imgStyle: React.CSSProperties = {
    display: "block",
    width: imgSize,
    height: imgSize,
    objectFit: "contain",
    filter: localDropdown ? undefined : "drop-shadow(0 0 8px rgba(92,139,198,.25))",
    pointerEvents: "none",
  };

  return (
    <button
      type="button"
      title={title}
      aria-pressed={!!active}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      className={localDropdown ? styles.localClassButton : undefined}
      style={localStyle}
    >
      {src ? (
        <img
          src={src}
          alt={title || "class"}
          width={imgSize}
          height={imgSize}
          loading="lazy"
          className={localDropdown ? styles.localClassIcon : undefined}
          style={imgStyle}
          onError={() => {
            // Nächsten Fallback probieren, ansonsten Emoji
            setIdx((i) => (i + 1 < sources.length ? i + 1 : i));
          }}
        />
      ) : (
        <span className={localDropdown ? styles.localClassIcon : undefined} style={{ fontSize: Math.round(size * 0.6), lineHeight: 1 }}>{fallback}</span>
      )}
    </button>
  );
}

/* ===========================
   Badge (für ListSwitcher etc.)
   =========================== */

type BadgeProps = {
  children: React.ReactNode;
  title?: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  size?: "sm" | "md";
};

export function Badge({
  children,
  title,
  active = false,
  onClick,
  disabled = false,
  size = "md",
}: BadgeProps) {
  const pad = size === "sm" ? "2px 8px" : "4px 10px";
  const font = size === "sm" ? 12 : 13;

  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: pad,
    borderRadius: 999,
    border: "1px solid",
    background: active ? "#25456B" : "#14273E",
    color: "#FFFFFF",
    borderColor: active ? "#5C8BC6" : "#2C4A73",
    fontSize: font,
    opacity: disabled ? 0.6 : 1,
    cursor: disabled ? "not-allowed" : onClick ? "pointer" : "default",
    userSelect: "none",
    transition:
      "transform 120ms ease, box-shadow 120ms ease, background 120ms ease, border-color 120ms ease",
  };

  const hover: React.CSSProperties = {
    boxShadow: "0 0 0 1px rgba(92,139,198,0.25) inset",
  };

  const [isHover, setHover] = React.useState(false);

  return (
    <span
      role={onClick ? "button" : undefined}
      title={title}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...base, ...(isHover && !disabled ? hover : null) }}
    >
      {children}
    </span>
  );
}

/** Native, keyboard-accessible class selection shared by guild ranking views. */
export function ClassSelect({ value, onChange, label, allLabel, className }: {
  value: ClassSelection; onChange: (value: GameClassKey | null) => void;
  label: string; allLabel: string; className?: string;
}) {
  const values = typeof value === "string" ? [value] : value ?? [];
  const single = values.length === 1 ? getExactClassMeta(values[0]) : null;
  const summary = values.length > 0 && !single ? values.join(" + ") : null;
  return <label className={className} data-ranking-class-filter><span>{label}</span>
    <select value={summary ? "__selection" : single?.key ?? ""} onChange={event => onChange(CLASSES.find(item => item.key === event.target.value)?.key ?? null)}>
      <option value="">{allLabel}</option>
      {summary && <option value="__selection" disabled>{summary}</option>}
      {CLASSES.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
    </select>
  </label>;
}
