export type Category = {
  key: string;                // tab key (für ?tab=…)
  label: string;              // (später i18n)
  to: string;                 // Ziel-URL MIT query param ?tab=…
  icon?: string;
  side?: "left" | "right";    // Desktop-Seite für den Halbkreis
  sub?: Array<{ key: string; label: string; to: string; icon?: string }>;
};

/** Hauptkategorien – bleiben auf /guidehub und setzen nur ?tab=… */
export const categories: Category[] = [
  { key: "dungeons",           label: "Dungeons",            to: "/guidehub?tab=dungeons",            side: "left" },
  { key: "arena-am",           label: "Arena/AM",            to: "/guidehub?tab=arena-am",            side: "left" },
  { key: "underworld",         label: "Underworld",          to: "/guidehub?tab=underworld",          side: "left" },
  { key: "fortress",           label: "Fortress",            to: "/guidehub?tab=fortress",            side: "left" },

  { key: "hellevator",         label: "Hellevator",          to: "/guidehub?tab=hellevator",          side: "right" },
  { key: "legendary-dungeon",  label: "Legendary Dungeon",   to: "/guidehub?tab=legendary-dungeon",   side: "right" },
  { key: "events",             label: "Events",              to: "/guidehub?tab=events",              side: "right" },
  { key: "calculators",        label: "Calculators",         to: "/guidehub?tab=calculators",         side: "right" },
  { key: "infographics",       label: "Infographics",        to: "/guidehub?tab=infographics",        side: "right" },
];

/** Beispiel-Subkategorien: erzeugen ebenfalls nur ?tab=…&sub=… */
export const subcategories: Record<string, Category["sub"]> = {
  dungeons: [
    { key: "late", label: "Late Game", to: "/guidehub?tab=dungeons&sub=late" },
    { key: "mid",  label: "Mid Game",  to: "/guidehub?tab=dungeons&sub=mid"  },
    { key: "early",label: "Early Game",to: "/guidehub?tab=dungeons&sub=early"},
  ],
  fortress: [
    { key: "build",     label: "Build Orders", to: "/guidehub?tab=fortress&sub=build" },
    { key: "resources", label: "Resources",    to: "/guidehub?tab=fortress&sub=resources" },
  ],
};
