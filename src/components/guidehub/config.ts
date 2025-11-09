export type SubCategory = {
  key: string;                // slug, z.B. "fortress-calculator"
  label: string;              // (später i18n)
  to: string;                 // /guidehub?tab=...&sub=... [&sub2=...]
  icon?: string;
  sub2?: SubCategory[];       // Sub-Sub
};

export type Category = {
  key: string;                // haupt-slug, z.B. "fortress"
  label: string;
  to: string;                 // /guidehub?tab=...
  icon?: string;
  side?: "left" | "right";
  sub?: SubCategory[];        // Sub-Ebene
};

/** 11 Hauptkategorien (inkl. Dungeons) */
export const categories: Category[] = [
  // LEFT
{
    key: "events",
    label: "Events",
    to: "/guidehub?tab=events",
    side: "left",
    sub: [
      { key: "event-list", label: "Event List", to: "/guidehub?tab=events&sub=event-list" },
      { key: "event-cycle", label: "Event Cycle", to: "/guidehub?tab=events&sub=event-cycle" },
      { key: "hellevator",
      label: "Hellevator", 
      to: "/guidehub?tab=hellevator",
      sub2: [
      { key: "hellevator-guide", label: "Hellevator Guide", to: "/guidehub?tab=hellevator&sub=hellevator-guide" },
    ],
  },
      { key: "legendary-dungeon", 
      label: "Legendary Dungeon", 
      to: "/guidehub?tab=legendary-dungeon",
      sub2: [
      { key: "legendary-dungeon-guide-epics-legendaries", label: "Legendary Dungeon Guide, Epics & Legendaries", to: "/guidehub?tab=legendary-dungeon&sub=legendary-dungeon-guide-epics-legendaries" },
    ],
  },
    ],
  },    

{
    key: "progression",
    label: "Progression",
    to: "/guidehub?tab=progression",
    side: "left",
    sub: [
      {
        key: "early",
        label: "Early Game",
        to: "/guidehub?tab=progression&sub=early",
        sub2: [
          { key: "first-weekend-guide", label: "First Weekend Guide", to: "/guidehub?tab=progression&sub=early&sub2=first-weekend-guide" },
          { key: "max-item-stats-calculator", label: "Max Item Stats Calculator", to: "/guidehub?tab=progression&sub=early&sub2=max-item-stats-calculator" },
          { key: "fortress-package-skip-order", label: "Fortress Package skip order", to: "/guidehub?tab=progression&sub=early&sub2=fortress-package-skip-order" },
          { key: "underworld-pro-package-skip-order", label: "Underworld Pro Package skip order", to: "/guidehub?tab=progression&sub=early&sub2=underworld-pro-package-skip-order" },
          { key: "gem-calculator", label: "Gem Calculator", to: "/guidehub?tab=progression&sub=early&sub2=gem-calculator" },
          { key: "fortress-attack-duplication", label: "Fortress attack duplication guide", to: "/guidehub?tab=progression&sub=early&sub2=fortress-attack-duplication" },
        ],
      },
      {
        key: "mid",
        label: "Mid Game",
        to: "/guidehub?tab=progression&sub=mid",
        sub2: [
          {
            key: "dungeon-pause",
            label: "Dungeon Pause",
            to: "/guidehub?tab=progression&sub=mid&sub2=dungeon-pause",
            sub2: [
              { key: "dungeon-pause-open-xp-calculator", label: "Dungeon Pause open XP Calculator", to: "/guidehub?tab=progression&sub=mid&sub2=dungeon-pause-open-xp-calculator" },
              { key: "dungeon-pause-exit", label: "Dungeon Pause Exit", to: "/guidehub?tab=progression&sub=mid&sub2=dungeon-pause-exit" },
            ],
          },
          { key: "gem-calculator", label: "Gem Calculator", to: "/guidehub?tab=progression&sub=mid&sub2=gem-calculator" },
          { key: "calendar-skip", label: "Calendar Skip", to: "/guidehub?tab=progression&sub=mid&sub2=calendar-skip" },
        ],
      },
      { key: "late", label: "Late Game", to: "/guidehub?tab=progression&sub=late" }, // vorerst leer
    ],
  },
  {
    key: "gamefeatures",
    label: "Game Features",
    to: "/guidehub?tab=gamefeatures",
    side: "left",
    sub: [
      { key: "fortress", 
	label: "Fortress", 
	to: "/guidehub?tab=gamefeatures&sub=fortress",
	sub2: [
        { key: "fortress-calculator", label: "Fortress Calculator", to: "/guidehub?tab=gamefeatures&sub=fortress&sub2=fortress-calculator" },
        { key: "fortress-package-skip-order", label: "Fortress Package skip order", to: "/guidehub?tab=gamefeatures&sub=fortress&sub2=fortress-package-skip-order" },
        { key: "fortress-attack-duplication", label: "Fortress attack duplication guide", to: "/guidehub?tab=gamefeatures&sub=fortress&sub2=fortress-attack-duplication" },
    ],
  },
        {key: "dungeons",
        label: "Dungeons",
    	to: "/guidehub?tab=dungeons",
    	side: "left",
    	sub2: [], // Inhalte später
  },
	{ key: "underworld", 
	label: "Underworld", 
	to: "/guidehub?tab=gamefeatures&sub=underworld",
	sub2: [
        { key: "underworld-calculator", label: "Underworld Calculator", to: "/guidehub?tab=gamefeatures&sub=underworld&sub2=underworld-calculator" },
        { key: "underworld-pro-package-skip-order", label: "Underworld Pro Package skip order", to: "/guidehub?tab=gamefeatures&sub=underworld&sub2=underworld-pro-package-skip-order" },
    ],
 },
      { key: "arenaam", 
        label: "Arena Manager", 
        to: "/guidehub?tab=gamefeatures&sub=arenaam",
        sub2: [
        { key: "am-rune-bonuses", label: "AM Rune bonuses", to: "/guidehub?tab=gamefeatures&sub=arenaam&sub2=am-rune-bonuses" },
        { key: "am-build-order", label: "AM Build order", to: "/guidehub?tab=gamefeatures&sub=arenaam&sub2=am-build-order" },
    ],
 },
    ],
  },
  
  
  
    
  // RIGHT
 

  
  {
    key: "calculators",
    label: "Calculators",
    to: "/guidehub?tab=calculators",
    side: "right",
    sub: [
      { key: "fortress-calculator", label: "Fortress Calculator", to: "/guidehub?tab=calculators&sub=fortress-calculator" },
      { key: "underworld-calculator", label: "Underworld Calculator", to: "/guidehub?tab=calculators&sub=underworld-calculator" },
      { key: "max-item-stats-calculator", label: "Max Item Stats Calculator", to: "/guidehub?tab=calculators&sub=max-item-stats-calculator" },
      { key: "gem-calculator", label: "Gem Calculator", to: "/guidehub?tab=calculators&sub=gem-calculator" },
      { key: "dungeon-pause-open-xp-calculator", label: "Dungeon Pause open XP Calculator", to: "/guidehub?tab=calculators&sub=dungeon-pause-open-xp-calculator" },
    ],
  },
  {
    key: "infographics",
    label: "Infographics",
    to: "/guidehub?tab=infographics",
    side: "right",
    sub: [], // innerhalb der Seite per Dropdown
  },
  {
    key: "class-book",
    label: "Class book",
    to: "/guidehub?tab=class-book",
    side: "right",
    sub: [],
  },

  // DUNGEONS als eigene Hauptkategorie (dein Wunsch)
  
];
