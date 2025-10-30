import React from "react";
import ContentShell from "../../../components/ContentShell";
import { GemCalculator as GemCalculatorComponent } from "../../../components/calculators/Gem";
import styles from "./GemCalculator.module.css";

const GemCalculatorPage: React.FC = () => {
  return (
    <ContentShell title="Gem Calculator">
      <div className={styles.headerBar}>
        <h2 className={styles.title}>Gem Calculator</h2>
        <span className={styles.meta}>last updated: 08.11.2024</span>
      </div>
      <p className={styles.description}>
        Input your parameters (Char Level, Mine Level, Guild HoK) to see the approximate stats of your mined gems.
        The values are approximations and represent the <em>max possible</em> you can find.
      </p>

      <GemCalculatorComponent />
    </ContentShell>
  );
};

export default GemCalculatorPage;
