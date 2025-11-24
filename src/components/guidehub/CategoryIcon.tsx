import React from "react";
import { Link, useLocation } from "react-router-dom";
import styles from "./styles.module.css";

type Variant = "main" | "sub" | "sub2";

type Props = {
  to: string;
  label: string;
  icon?: string;
  variant?: Variant;
};

const CategoryIcon: React.FC<Props> = ({ to, label, icon, variant = "main" }) => {
  const { search } = useLocation();

  // Aktiv-Erkennung:
  // main  -> tab==tab
  // sub   -> tab==tab && sub==sub
  // sub2  -> tab==tab && sub==sub && sub2==sub2
  let isActive = false;
  try {
    const current = new URLSearchParams(search);
    const curTab  = current.get("tab");
    const curSub  = current.get("sub");
    const curSub2 = current.get("sub2");

    const target = new URL(to, window.location.origin).searchParams;
    const tTab  = target.get("tab");
    const tSub  = target.get("sub");
    const tSub2 = target.get("sub2");

    if (variant === "main") {
      isActive = curTab === tTab;
    } else if (variant === "sub") {
      isActive = curTab === tTab && !!tSub && curSub === tSub;
    } else {
      isActive = curTab === tTab && !!tSub && curSub === tSub && !!tSub2 && curSub2 === tSub2;
    }
  } catch {
    isActive = false;
  }

  return (
    <Link
      to={to}
      aria-label={label}
      className={[
        styles.iconBtn,
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
