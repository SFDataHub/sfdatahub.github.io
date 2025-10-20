// src/components/guilds/GuildClassOverview/GuildClassOverview.tsx
import React, { useMemo } from "react";
import styles from "./styles.module.css";
import ClassCrestGrid from "./ClassCrestGrid";
import ClassDonut from "./ClassDonut";
import type { ClassMeta, GuildClassOverviewProps, MemberClassRec } from "./types";
import { adaptClassMeta } from "./utils";

type Props = {
  data: MemberClassRec[] | null | undefined;     // snapshot.members
  classMeta: any[] | null | undefined;           // z. B. CLASSES aus data/classes
  onPickClass?: GuildClassOverviewProps["onPickClass"];
};

const GuildClassOverview: React.FC<Props> = ({ data, classMeta, onPickClass }) => {
  const safeData = useMemo<MemberClassRec[]>(
    () => (Array.isArray(data) ? data : []),
    [data]
  );

  // WICHTIG: hier adaptieren wir die CLASSES → inklusive toDriveThumbProxy
  const safeMeta = useMemo<ClassMeta[]>(
    () =>
      (Array.isArray(classMeta) ? classMeta : [])
        .map(adaptClassMeta)
        .filter(Boolean) as ClassMeta[],
    [classMeta]
  );

  return (
    <section className={styles.wrapper}>
      <div className={styles.sectionTitle}>Klassenübersicht</div>

      <div className={styles.grid} style={{ gridTemplateColumns: "1fr" }}>
        <ClassCrestGrid data={safeData} classMeta={safeMeta} onPickClass={onPickClass} />
      </div>

      <div style={{ marginTop: 12 }}>
        <ClassDonut data={safeData} classMeta={safeMeta} />
      </div>
    </section>
  );
};

export default GuildClassOverview;
