// src/components/Sidebar/SidebarNavItem.tsx
import React, { useMemo } from "react";
import styles from "./SidebarNavItem.module.css";

type Props = {
  icon?: React.ReactNode;
  label: string;
  isOpen: boolean;           // kommt vom Sidebar-State
  durationMs?: number;       // optional: Gesamtdauer für die Text-Animation
  delayStepMs?: number;      // optional: Verzögerung pro Buchstabe
};

function splitToChars(text: string) {
  // behält Spaces, Umlaute, Emojis bei
  return Array.from(text);
}

export default function SidebarNavItem({
  icon,
  label,
  isOpen,
  durationMs = 500,
  delayStepMs = 18, // 18–25ms fühlt sich „HUD“-smooth an
}: Props) {
  const chars = useMemo(() => splitToChars(label), [label]);

  return (
    <button
      className={styles.item}
      data-open={isOpen ? "true" : "false"}
      aria-expanded={isOpen}
      title={label}
    >
      {icon && <span className={styles.icon}>{icon}</span>}

      {/* Text-Wrapper: hält Breite stabil, damit Icons nicht “springen” */}
      <span
        className={styles.text}
        style={
          {
            // CSS-Variablen für Timing
            // Gesamtdauer: Basis für Ein-/Ausblenden
            "--duration": `${durationMs}ms`,
            "--step": `${delayStepMs}ms`,
            // Anzahl Zeichen – für Reverse-Berechnung
            "--count": chars.length,
          } as React.CSSProperties
        }
      >
        {chars.map((ch, i) => (
          <span
            key={`${label}-${i}`}
            className={styles.char}
            // index als CSS-Var für Stagger
            style={
              {
                "--i": i,
              } as React.CSSProperties
            }
            aria-hidden="true"
          >
            {ch === " " ? "\u00A0" : ch}
          </span>
        ))}
        {/* Für Screenreader den vollen String einmalig */}
        <span className={styles.srOnly}>{label}</span>
      </span>
    </button>
  );
}
