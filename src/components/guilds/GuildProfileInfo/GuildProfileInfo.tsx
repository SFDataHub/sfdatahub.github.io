import React, { memo } from "react";
import styles from "./GuildProfileInfo.module.css";
import type { GuildProfileInfoProps } from "./GuildProfileInfo.types";

import BaseStatsCard from "./cards/BaseStatsCard";
import TotalStatsCard from "./cards/TotalStatsCard";
import GeneralInfoCard from "./cards/GeneralInfoCard";
import FortressCard from "./cards/FortressCard";
import RankingsCard from "./cards/RankingsCard";
import ServerComparisonCard from "./cards/ServerComparisonCard";

const GuildProfileInfo = memo(function GuildProfileInfo({
  guild, snapshot, emblemUrl, colors,
}: GuildProfileInfoProps) {
  const iconColor = colors.icon;

  const SectionTitle = ({ text }: { text: string }) => (
    <div className={styles.sectionDivider}>
      <div
        className={styles.sectionStripe}
        style={{ background: `linear-gradient(90deg, transparent, ${iconColor}, transparent)` }}
      />
      <div className={styles.sectionTitle} style={{ color: colors.soft }}>
        {text}
      </div>
      <div
        className={styles.sectionStripe}
        style={{ background: `linear-gradient(90deg, transparent, ${iconColor}, transparent)` }}
      />
    </div>
  );

  return (
    <div className={styles.root + " space-y-4"}>
      <SectionTitle text="GUILD OVERVIEW" />

      {/* KPI-Zeile bleibt wie gehabt */}

      <div style={{ marginTop: 6, marginBottom: 10 }}>
        <SectionTitle text="AVERAGE PLAYER STATS" />
      </div>

      <GeneralInfoCard guild={guild} snapshot={snapshot} colors={colors} />

      {/* vorher: md:grid-cols-2 → war auf 768px schon 2-spaltig und eng
         jetzt: xl:grid-cols-2 → erst ab 1280px nebeneinander */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <BaseStatsCard  snapshot={snapshot} colors={colors} />
        <TotalStatsCard snapshot={snapshot} colors={colors} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <FortressCard  colors={colors} />
        <RankingsCard  colors={colors} />
      </div>

      <div className="mt-4">
        <ServerComparisonCard colors={colors} />
      </div>
    </div>
  );
});

export default GuildProfileInfo;
