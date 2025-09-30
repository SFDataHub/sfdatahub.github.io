import { gdrive } from "../lib/urls";

export type GameClassKey =
  | "warrior" | "mage" | "scout" | "assassin"
  | "demon-hunter" | "berserker" | "battle-mage"
  | "druid" | "bard" | "necromancer" | "paladin";

export type ClassMeta = {
  key: GameClassKey;
  label: string;
  iconUrl: string;   // -> immer Google Drive
  fallback: string;  // -> nur wenn Bild-Laden fehlschlägt
};

/** Datei-IDs aus Google Drive (deine IDs) */
const driveIds: Partial<Record<GameClassKey, string>> = {
  assassin:      "1NMQRDwxhfL1cxL679JKuvIjmeF50jJOu", // Assa
  bard:          "1mQR0It-3zhxBn8-he695_VvN61JGOoY4",
  "battle-mage": "1BDs3RzQGwXCMY588g6dL32DgvQes2Q0Z",
  berserker:     "1MADOyse6jZUVkbBBrkTweQILVUhrBdY6",
  "demon-hunter":"1FLzwU5xvm4D_FLNzr9MXEkeTdYM9Oa2k",
  druid:         "1ECvaeY_UzbF9wYH0QbHsCNcYA1Pa9eiq",
  mage:          "1sZ1ifX3V2V6KBZubOcCgkkhqW7oWpijS",
  necromancer:   "1mZKuTZKPEJTuwWhbhVsmFfs6vfnv2Wi9",
  paladin:       "1dx7zcadr6xFLNudjojKVerP19Vt6_lbB",
  scout:         "12eL2NkyvJg2CL8GUbA8whKOA7TLBoa6x",
  warrior:       "13Q4lC2CqjYjWjIhbGU8kunApX1I3_TDt",
};

const icon = (k: GameClassKey) => {
  const id = driveIds[k];
  if (!id) console.warn("[CLASSES] Missing Drive ID for:", k);
  return id ? gdrive(id) : ""; // leer => <img onError> zeigt Fallback-Emoji
};

export const CLASSES: ClassMeta[] = [
  { key: "warrior",      label: "Warrior",      iconUrl: icon("warrior"),      fallback: "🗡️" },
  { key: "mage",         label: "Mage",         iconUrl: icon("mage"),         fallback: "✨"  },
  { key: "scout",        label: "Scout",        iconUrl: icon("scout"),        fallback: "🏹"  },
  { key: "assassin",     label: "Assassin",     iconUrl: icon("assassin"),     fallback: "🗡️" },
  { key: "demon-hunter", label: "Demon Hunter", iconUrl: icon("demon-hunter"), fallback: "😈🏹" },
  { key: "berserker",    label: "Berserker",    iconUrl: icon("berserker"),    fallback: "🪓"  },
  { key: "battle-mage",  label: "Battle Mage",  iconUrl: icon("battle-mage"),  fallback: "🛡️✨" },
  { key: "druid",        label: "Druid",        iconUrl: icon("druid"),        fallback: "🌿"  },
  { key: "bard",         label: "Bard",         iconUrl: icon("bard"),         fallback: "🎶"  },
  { key: "necromancer",  label: "Necromancer",  iconUrl: icon("necromancer"),  fallback: "💀"  },
  { key: "paladin",      label: "Paladin",      iconUrl: icon("paladin"),      fallback: "🛡️"  },
];

export const CLASS_BY_KEY = Object.fromEntries(CLASSES.map(c => [c.key, c] as const));
