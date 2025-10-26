import React from "react";
import { useSearchParams } from "react-router-dom";
import ContentShell from "../../components/ContentShell";
import GuideHubDashboard from "../../components/guidehub/GuideHubDashboard";
import { categories } from "../../components/guidehub/config";
import styles from "./styles.module.css";

/** --- Logo für das Dashboard (zentriert, klick führt zurück auf Default) --- */
import guideHubLogo from "../../assets/logo_guidehub.png";

/** ========== IMPORTS: HAUPTSEITEN (= tab) ========== */
import FortressIndex from "./Fortress/Index";
import UnderworldIndex from "./Underworld/Index";
import ProgressionIndex from "./Progression/Index";
import ArenaAMIndex from "./ArenaAM/Index";
import HellevatorIndex from "./Hellevator/Index";
import LegendaryDungeonIndex from "./LegendaryDungeon/Index";
import EventsIndex from "./Events/Index";
import CalculatorsIndex from "./Calculators/Index";
import InfographicsIndex from "./Infographics/Index";
import ClassBookIndex from "./ClassBook/Index";
import DungeonsIndex from "./Dungeons/Index";

/** ========== IMPORTS: SUB-SEITEN (= sub) ========== */
/* Fortress */
import FortressCalculator from "./Fortress/FortressCalculator";
import FortressPackageSkipOrder from "./Fortress/PackageSkipOrder";
import FortressGemCalculator from "./Fortress/GemCalculator";
import FortressAttackDuplication from "./Fortress/AttackDuplicationGuide";

/* Underworld */
import UnderworldCalculator from "./Underworld/UnderworldCalculator";
import UnderworldProPackageSkipOrder from "./Underworld/ProPackageSkipOrder";

/* Arena/AM */
import AMRuneBonuses from "./ArenaAM/AMRuneBonuses";
import AMBuildOrder from "./ArenaAM/AMBuildOrder";

/* Hellevator */
import HellevatorGuide from "./Hellevator/HellevatorGuide";

/* Legendary Dungeon */
import LegendaryGuideEpicsLegendaries from "./LegendaryDungeon/GuideEpicsLegendaries";

/* Events */
import EventList from "./Events/EventList";
import EventCycle from "./Events/EventCycle";

/* Calculators */
import CalcFortress from "./Calculators/FortressCalculator";
import CalcUnderworld from "./Calculators/UnderworldCalculator";
import CalcMaxItemStats from "./Calculators/MaxItemStatsCalculator";
import CalcGem from "./Calculators/GemCalculator";
import CalcDungeonPauseOpenXP from "./Calculators/DungeonPauseOpenXPCalculator";

/* Progression — Early */
import ProgEarlyIndex from "./Progression/Early/Index";
import EarlyFirstWeekendGuide from "./Progression/Early/FirstWeekendGuide";
import EarlyMaxItemStatsCalculator from "./Progression/Early/MaxItemStatsCalculator";
import EarlyFortressPackageSkipOrder from "./Progression/Early/FortressPackageSkipOrder";
import EarlyUnderworldProPackageSkipOrder from "./Progression/Early/UnderworldProPackageSkipOrder";
import EarlyGemCalculator from "./Progression/Early/GemCalculator";
import EarlyFortressAttackDuplication from "./Progression/Early/FortressAttackDuplication";

/* Progression — Mid */
import ProgMidIndex from "./Progression/Mid/Index";
import MidDungeonPauseIndex from "./Progression/Mid/DungeonPause/Index";
import MidDungeonPauseOpenXP from "./Progression/Mid/DungeonPause/OpenXPCalculator";
import MidDungeonPauseExit from "./Progression/Mid/DungeonPause/Exit";
import MidGemCalculator from "./Progression/Mid/GemCalculator";
import MidCalendarSkip from "./Progression/Mid/CalendarSkip";

/* Progression — Late */
import ProgLateIndex from "./Progression/Late/Index";

/** 🔹 NEU: TOC (Variante 4) */
import GuideHubTOC from "../../components/guidehub/GuideHubTOC/GuideHubTOC";

/** Typalias für Mapping */
type Cmp = React.ComponentType;

/** ========== MAPPINGS: WELCHE KOMPONENTE BEI WELCHER URL-PARAM-KOMBINATION ========== */

/** 1) HAUPT: tab -> Komponente */
const MAIN_MAP: Record<string, Cmp> = {
  fortress: FortressIndex,
  underworld: UnderworldIndex,
  progression: ProgressionIndex,
  arenaam: ArenaAMIndex,
  hellevator: HellevatorIndex,
  "legendary-dungeon": LegendaryDungeonIndex,
  events: EventsIndex,
  calculators: CalculatorsIndex,
  infographics: InfographicsIndex,
  "class-book": ClassBookIndex,
  dungeons: DungeonsIndex,
};

/** 2) SUB: (tab, sub) -> Komponente */
const SUB_MAP: Record<string, Record<string, Cmp>> = {
  fortress: {
    "fortress-calculator": FortressCalculator,
    "fortress-package-skip-order": FortressPackageSkipOrder,
    "gem-calculator": FortressGemCalculator,
    "fortress-attack-duplication": FortressAttackDuplication,
  },
  underworld: {
    "underworld-calculator": UnderworldCalculator,
    "underworld-pro-package-skip-order": UnderworldProPackageSkipOrder,
  },
  arenaam: {
    "am-rune-bonuses": AMRuneBonuses,
    "am-build-order": AMBuildOrder,
  },
  hellevator: {
    "hellevator-guide": HellevatorGuide,
  },
  "legendary-dungeon": {
    "legendary-dungeon-guide-epics-legendaries": LegendaryGuideEpicsLegendaries,
  },
  events: {
    "event-list": EventList,
    "event-cycle": EventCycle,
  },
  calculators: {
    "fortress-calculator": CalcFortress,
    "underworld-calculator": CalcUnderworld,
    "max-item-stats-calculator": CalcMaxItemStats,
    "gem-calculator": CalcGem,
    "dungeon-pause-open-xp-calculator": CalcDungeonPauseOpenXP,
  },

  /* Progression */
  progression: {
    early: ProgEarlyIndex,
    mid: ProgMidIndex,
    late: ProgLateIndex,
  },
};

/** 3) SUB-SUB: (tab, sub, sub2) -> Komponente */
const SUB2_MAP: Record<string, Record<string, Record<string, Cmp>>> = {
  progression: {
    early: {
      "first-weekend-guide": EarlyFirstWeekendGuide,
      "max-item-stats-calculator": EarlyMaxItemStatsCalculator,
      "fortress-package-skip-order": EarlyFortressPackageSkipOrder,
      "underworld-pro-package-skip-order": EarlyUnderworldProPackageSkipOrder,
      "gem-calculator": EarlyGemCalculator,
      "fortress-attack-duplication": EarlyFortressAttackDuplication,
    },
    mid: {
      "dungeon-pause": MidDungeonPauseIndex,
      "dungeon-pause-open-xp-calculator": MidDungeonPauseOpenXP,
      "dungeon-pause-exit": MidDungeonPauseExit,
      "gem-calculator": MidGemCalculator,
      "calendar-skip": MidCalendarSkip,
    },
    // late: aktuell ohne Sub-Sub
  },
};

export default function GuidesIndex() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "";
  const sub = params.get("sub") || "";
  const sub2 = params.get("sub2") || "";

  /** Ermitteln der anzuzeigenden Komponente unter der Trennlinie */
  let Content: Cmp | null = null;

  if (!tab) {
    Content = null; // default: TOC unten anzeigen
  } else if (tab && !sub) {
    Content = MAIN_MAP[tab] || null;
  } else if (tab && sub && !sub2) {
    Content = (SUB_MAP[tab] && SUB_MAP[tab][sub]) || null;
  } else if (tab && sub && sub2) {
    Content =
      (SUB2_MAP[tab] &&
        SUB2_MAP[tab][sub] &&
        SUB2_MAP[tab][sub][sub2]) ||
      null;
  }

  /** 🔹 Navigation aus TOC/Spotlight → setzt URL-Params */
  const handleNavigate = (p: { tab: string; sub?: string; sub2?: string }) => {
    const next = new URLSearchParams(params);
    next.set("tab", p.tab);
    if (p.sub) next.set("sub", p.sub); else next.delete("sub");
    if (p.sub2) next.set("sub2", p.sub2); else next.delete("sub2");
    setParams(next, { replace: false });
  };

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

      {/* TRENNLINIE (wie im Gildenprofil) */}
      <div className={styles.divider} />

      {/* UNTERER BEREICH: Dynamischer Seiteninhalt entsprechend tab/sub/sub2 */}
      <div className={styles.contentArea}>
        {Content ? (
          <Content />
        ) : (
          <>
            {/* Hinweis/Header erhalten */}
            <div className={styles.placeholder}>
              <h2 className={styles.placeholderTitle}>Guides</h2>
              <p className={styles.placeholderText}>
                Wähle links eine Kategorie oder nutze Suche/Spotlight (Ctrl/Cmd+K), um Inhalte zu öffnen.
              </p>
            </div>

            {/* 🔹 NEU: Variante 4 – Sidebar + Detail + Suche + Spotlight */}
            <GuideHubTOC
              categories={categories as any}
              onNavigate={handleNavigate}
              autoFocusSearch={false}
            />
          </>
        )}
      </div>
    </ContentShell>
  );
}
