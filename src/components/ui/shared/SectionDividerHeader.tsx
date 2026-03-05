import React from "react";

import styles from "./SectionDividerHeader.module.css";

export type SectionDividerHeaderProps = {
  title: React.ReactNode;
  titleColor?: string;
  accentColor?: string;
  className?: string;
};

const SectionDividerHeader: React.FC<SectionDividerHeaderProps> = ({
  title,
  titleColor = "#B0C4D9",
  accentColor = "#5C8BC6",
  className,
}) => {
  const rootClassName = className ? `${styles.root} ${className}` : styles.root;
  const stripeStyle = { background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` };

  return (
    <div className={rootClassName}>
      <div className={styles.stripe} style={stripeStyle} />
      <div className={styles.title} style={{ color: titleColor }}>
        {title}
      </div>
      <div className={styles.stripe} style={stripeStyle} />
    </div>
  );
};

export default SectionDividerHeader;
