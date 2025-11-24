// FILE: src/pages/GuideHub/Calculators/config.ts
export type CalcTile = {
  /** Sichtbarer Titel (EN, i18n folgt später) */
  title: string;
  /** Wert für URL-Param `sub` */
  slug: string;
  /** Optional: Kurzbeschreibung (vorerst leer, Platzhalter für später) */
  desc?: string;
};

/** Reihenfolge exakt wie abgestimmt */
export const tiles: CalcTile[] = [
  { title: "Fortress Calculator", slug: "fortress-calculator" },
  { title: "Underworld Calculator", slug: "underworld-calculator" },
  { title: "Max Item Stats Calculator", slug: "max-item-stats-calculator" },
  { title: "Gem Calculator", slug: "gem-calculator" },
  { title: "Dungeon Pause Open XP Calculator", slug: "dungeon-pause-open-xp-calculator" },
];
