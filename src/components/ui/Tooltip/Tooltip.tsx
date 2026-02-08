import React from "react";

import styles from "./Tooltip.module.css";

type TooltipProps = {
  content?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  placement?: "top" | "bottom";
};

const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  className,
  placement = "top",
}) => {
  if (!content) {
    return <>{children}</>;
  }

  const placementClass = placement === "bottom" ? ` ${styles.bottom}` : "";

  return (
    <div
      className={`${styles.tooltipWrapper}${placementClass}${
        className ? ` ${className}` : ""
      }`}
    >
      <div className={styles.trigger}>{children}</div>
      <div className={styles.bubble} role="tooltip">
        <div className={styles.card}>{content}</div>
        <div className={styles.tail} />
      </div>
    </div>
  );
};

export default Tooltip;
