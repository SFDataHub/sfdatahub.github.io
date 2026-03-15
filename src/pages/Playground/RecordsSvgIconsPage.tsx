import React from "react";
import ContentShell from "../../components/ContentShell";
import {
  Anvil,
  Award,
  BrickWallShield,
  Castle,
  CircleGauge,
  Coins,
  Crown,
  DoorOpen,
  Flame,
  Gauge,
  Gem,
  Hammer,
  Landmark,
  Mountain,
  Orbit,
  Pickaxe,
  Radar,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Skull,
  Star,
  Swords,
  Target,
  Tornado,
  TowerControl,
  Trophy,
  Users,
  Wind,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import styles from "./RecordsSvgIconsPage.module.css";

type RecordIconCategory = {
  id: string;
  label: string;
  source: string;
  variants: Array<{ label: string; icon: LucideIcon }>;
};

const RECORD_ICON_CATEGORIES: RecordIconCategory[] = [
  {
    id: "level",
    label: "Level",
    source: "recordFamily: level / token: level",
    variants: [
      { label: "Trophy", icon: Trophy },
      { label: "Crown", icon: Crown },
      { label: "Award", icon: Award },
      { label: "Gauge", icon: Gauge },
      { label: "CircleGauge", icon: CircleGauge },
    ],
  },
  {
    id: "guild-raid",
    label: "Guild / Raid",
    source: "recordFamily: guild / token: raid, averageguildlevel",
    variants: [
      { label: "Shield", icon: Shield },
      { label: "ShieldCheck", icon: ShieldCheck },
      { label: "Swords", icon: Swords },
      { label: "Users", icon: Users },
      { label: "Trophy", icon: Trophy },
    ],
  },
  {
    id: "base-fortress",
    label: "Base - Fortress",
    source: "recordFamily: base / token: fortress",
    variants: [
      { label: "Castle", icon: Castle },
      { label: "BrickWallShield", icon: BrickWallShield },
      { label: "TowerControl", icon: TowerControl },
      { label: "Landmark", icon: Landmark },
      { label: "Shield", icon: Shield },
    ],
  },
  {
    id: "base-mine",
    label: "Base - Mine",
    source: "recordFamily: base / token: mine",
    variants: [
      { label: "Pickaxe", icon: Pickaxe },
      { label: "Gem", icon: Gem },
      { label: "Mountain", icon: Mountain },
      { label: "Hammer", icon: Hammer },
      { label: "Anvil", icon: Anvil },
    ],
  },
  {
    id: "base-gold-pit",
    label: "Base - Gold Pit",
    source: "recordFamily: base / token: goldpit",
    variants: [
      { label: "Coins", icon: Coins },
      { label: "Gem", icon: Gem },
      { label: "Crown", icon: Crown },
      { label: "Trophy", icon: Trophy },
      { label: "Pickaxe", icon: Pickaxe },
    ],
  },
  {
    id: "base-hall-of-knights",
    label: "Base - Hall of Knights",
    source: "recordFamily: base / token: hallofknights, knighthall",
    variants: [
      { label: "ShieldCheck", icon: ShieldCheck },
      { label: "Swords", icon: Swords },
      { label: "Castle", icon: Castle },
      { label: "TowerControl", icon: TowerControl },
      { label: "Crown", icon: Crown },
    ],
  },
  {
    id: "demon-portal",
    label: "Demon Portal",
    source: "recordFamily: demon-portal / token: demonportal",
    variants: [
      { label: "DoorOpen", icon: DoorOpen },
      { label: "Flame", icon: Flame },
      { label: "Skull", icon: Skull },
      { label: "ShieldAlert", icon: ShieldAlert },
      { label: "Target", icon: Target },
    ],
  },
  {
    id: "twister",
    label: "Twister",
    source: "recordFamily: twister",
    variants: [
      { label: "Tornado", icon: Tornado },
      { label: "Wind", icon: Wind },
      { label: "Orbit", icon: Orbit },
      { label: "Radar", icon: Radar },
      { label: "Target", icon: Target },
    ],
  },
  {
    id: "sandstorm",
    label: "Sandstorm",
    source: "recordFamily: sandstorm",
    variants: [
      { label: "Wind", icon: Wind },
      { label: "Mountain", icon: Mountain },
      { label: "CircleGauge", icon: CircleGauge },
      { label: "Radar", icon: Radar },
      { label: "Target", icon: Target },
    ],
  },
  {
    id: "mozone",
    label: "Mozone",
    source: "recordFamily: mozone",
    variants: [
      { label: "Radar", icon: Radar },
      { label: "Target", icon: Target },
      { label: "CircleGauge", icon: CircleGauge },
      { label: "Gauge", icon: Gauge },
      { label: "TowerControl", icon: TowerControl },
    ],
  },
  {
    id: "fallback",
    label: "Fallback / Unknown",
    source: "kein Match in recordFamily/token",
    variants: [
      { label: "Star", icon: Star },
      { label: "Trophy", icon: Trophy },
      { label: "Shield", icon: Shield },
      { label: "CircleGauge", icon: CircleGauge },
      { label: "Target", icon: Target },
    ],
  },
];

export default function RecordsSvgIconsPage() {
  return (
    <ContentShell
      title="Records SVG Icons"
      subtitle="Pro Record-Kategorie bis zu 5 Lucide-SVG-Varianten im Sidebar-Look."
      centerFramed
    >
      <div className={styles.page}>
        {RECORD_ICON_CATEGORIES.map((category) => (
          <section key={category.id} className={styles.categoryCard}>
            <header className={styles.categoryHeader}>
              <h3 className={styles.categoryTitle}>{category.label}</h3>
              <p className={styles.categorySource}>{category.source}</p>
            </header>

            <div className={styles.variantGrid}>
              {category.variants.slice(0, 5).map((variant) => {
                const Icon = variant.icon;
                return (
                  <div key={`${category.id}-${variant.label}`} className={styles.variantChip}>
                    <span className={styles.iconWrap}>
                      <Icon className="ico" aria-hidden="true" />
                    </span>
                    <div className={styles.variantMeta}>
                      <span className={styles.variantLabel}>{variant.label}</span>
                      <span className={styles.variantHint}>Lucide SVG</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </ContentShell>
  );
}
