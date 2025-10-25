import React from "react";
import { useSearchParams } from "react-router-dom";
import ContentShell from "../../components/ContentShell";
import GuideHubDashboard from "../../components/guidehub/GuideHubDashboard";
import { categories } from "../../components/guidehub/config";
import styles from "./styles.module.css";

// Logo
import guideHubLogo from "../../assets/logo_guidehub.png";

/** Unterseiten (unten dynamisch) */
import GuideFortress from "./Fortress";
import GuideUnderworld from "./Underworld";
import GuideArenaAM from "./ArenaAM";
import GuideDungeons from "./Dungeons";
import GuideHellevator from "./Hellevator";
import GuideLegendaryDungeon from "./LegendaryDungeon";
import GuideEvents from "./Events";
import GuideCalculators from "./Calculators";
import GuideInfographics from "./Infographics";

/** Tab-Key -> Component Mapping */
const TAB_MAP: Record<string, React.ComponentType> = {
  fortress: GuideFortress,
  underworld: GuideUnderworld,
  "arena-am": GuideArenaAM,
  dungeons: GuideDungeons,
  hellevator: GuideHellevator,
  "legendary-dungeon": GuideLegendaryDungeon,
  events: GuideEvents,
  calculators: GuideCalculators,
  infographics: GuideInfographics,
};

export default function GuidesIndex() {
  const [params] = useSearchParams();
  const tab = params.get("tab") || "";

  const ActivePage = TAB_MAP[tab];

  return (
    <ContentShell>
      {/* OBERER BEREICH: Logo + Halbkreise */}
      <div className={styles.topWrap}>
        <GuideHubDashboard
          logoSrc={guideHubLogo}
          categories={categories}
          titleI18nKey="guides.index.title"
        />
      </div>

      {/* TRENNLINIE (tiefer gesetzt, Soft-Glow) */}
      <div className={styles.divider} />

      {/* UNTERER BEREICH: Dynamischer Seiteninhalt */}
      <div className={styles.contentArea}>
        {ActivePage ? (
          <ActivePage />
        ) : (
          <div className={styles.placeholder}>
            <h2 className={styles.placeholderTitle}>Guides</h2>
            <p className={styles.placeholderText}>
              Wähle oben eine Kategorie, um die Inhalte hier anzuzeigen.
            </p>
          </div>
        )}
      </div>
    </ContentShell>
  );
}
