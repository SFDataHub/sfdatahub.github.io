import React from "react";

import styles from "./SectionHeader.module.css";

export type SectionHeaderProps = {
  title: string;
  meta?: React.ReactNode;
  description?: React.ReactNode;
};

const SectionHeader: React.FC<SectionHeaderProps> = ({ title, meta, description }) => (
  <header className={styles.container}>
    <div className={styles.headerBar}>
      <h2 className={styles.title}>{title}</h2>
      {meta && <span className={styles.meta}>{meta}</span>}
    </div>
    {description && <p className={styles.description}>{description}</p>}
  </header>
);

export default SectionHeader;
