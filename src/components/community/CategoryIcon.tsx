import React from "react";
import { Link, useLocation } from "react-router-dom";
import styles from "./styles.module.css";

type Props = {
  to: string;
  label: string;
  icon?: string;
  /** 'main' (Hauptkategorie) | 'sub' (Unterkategorie) */
  variant?: "main" | "sub";
};

const CategoryIcon: React.FC<Props> = ({ to, label, icon, variant = "main" }) => {
  const { search } = useLocation();

  // Aktiv: MAIN -> tab==tab, SUB -> tab==tab && sub==sub
  let isActive = false;
  try {
    const current = new URLSearchParams(search);
    const currentTab = current.get("tab");
    const currentSub = current.get("sub");

    const targetUrl = new URL(to, window.location.origin);
    const target = targetUrl.searchParams;
    const targetTab = target.get("tab");
    const targetSub = target.get("sub");

    isActive =
      variant === "sub"
        ? currentTab === targetTab && !!targetSub && currentSub === targetSub
        : currentTab === targetTab;
  } catch {
    isActive = false;
  }

  return (
    <Link
      to={to}
      aria-label={label}
      className={[
        styles.iconBtn,
        variant === "sub" ? styles.muted : "",
        isActive ? styles.active : "",
      ].join(" ")}
      title={label}
      replace={false}
    >
      {icon ? (
        <img src={icon} alt="" className={styles.iconImg} />
      ) : (
        <div className={styles.placeholderIcon} aria-hidden="true">
          <span className={styles.placeholderText}>{label.slice(0, 2).toUpperCase()}</span>
        </div>
      )}
      <div className={styles.iconLabel}>{label}</div>
    </Link>
  );
};

export default CategoryIcon;
