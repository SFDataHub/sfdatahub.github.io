import React from "react";
import styles from "./HudBox.module.css";

type Padding = "sm" | "md" | "lg";

export type HudBoxProps = {
  /** Optionaler Titel über dem Inhalt (klein, uppercase) */
  title?: string;
  /** Innenabstand (default: md) */
  padding?: Padding;
  /** Hover-Anhebung (default: true) */
  hover?: boolean;
  /** Zusätzliche Klassen */
  className?: string;
  /** Inhalt der Box */
  children: React.ReactNode;
};

export default function HudBox({
  title,
  padding = "md",
  hover = true,
  className = "",
  children,
}: HudBoxProps) {
  return (
    <div
      className={[
        styles.card,
        styles[`pad-${padding}`],
        hover ? styles.hoverLift : "",
        className,
      ].join(" ")}
    >
      {title ? <div className={styles.title}>{title}</div> : null}
      <div className={styles.body}>{children}</div>
    </div>
  );
}
