// src/data/classes.ts

export type GameClassKey =
  | "warrior" | "mage" | "scout" | "assassin"
  | "demon-hunter" | "berserker" | "battle-mage"
  | "druid" | "bard" | "necromancer" | "paladin";

export type ClassMeta = {
  key: GameClassKey;
  label: string;
  iconUrl: string;   // Einbett-URL (Google Drive)
  fallback: string;  // Emoji-Fallback
};

/** Google-Drive-Datei-IDs (deine IDs) */
const DRIVE: Record<GameClassKey, string> = {
  assassin:       "1NMQRDwxhfL1cxL679JKuvIjmeF50jJOu",
  bard:           "1mQR0It-3zhxBn8-he695_VvN61JGOoY4",
  "battle-mage":  "1BDs3RzQGwXCMY588g6dL32DgvQes2Q0Z",
  berserker:      "1MADOyse6jZUVkbBBrkTweQILVUhrBdY6",
  "demon-hunter": "1FLzwU5xvm4D_FLNzr9MXEkeTdYM9Oa2k",
  druid:          "1ECvaeY_UzbF9wYH0QbHsCNcYA1Pa9eiq",
  mage:           "1sZ1ifX3V2V6KBZubOcCgkkhqW7oWpijS",
  necromancer:    "1mZKuTZKPEJTuwWhbhVsmFfs6vfnv2Wi9",
  paladin:        "1dx7zcadr6xFLNudjojKVerP19Vt6_lbB",
  scout:          "12eL2NkyvJg2CL8GUbA8whKOA7TLBoa6x",
  warrior:        "13Q4lC2CqjYjWjIhbGU8kunApX1I3_TDt",
};

// Stabile Einbett-URL (identisch nutzbar in <img>)
const driveViewUrl = (id: string) => `https://drive.google.com/uc?export=view&id=${id}`;

// Normierung: lowercase, diakritikfrei, nur a-z0-9
const canon = (s: any) =>
  String(s ?? "")
    .trim()
    .normalize("NFD")
    // @ts-ignore
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

// --- Stammdaten
export const CLASSES: ClassMeta[] = [
  { key: "warrior",      label: "Warrior",      iconUrl: driveViewUrl(DRIVE["warrior"]),      fallback: "🗡️" },
  { key: "mage",         label: "Mage",         iconUrl: driveViewUrl(DRIVE["mage"]),         fallback: "✨"  },
  { key: "scout",        label: "Scout",        iconUrl: driveViewUrl(DRIVE["scout"]),        fallback: "🏹"  },
  { key: "assassin",     label: "Assassin",     iconUrl: driveViewUrl(DRIVE["assassin"]),     fallback: "🗡️" },
  { key: "demon-hunter", label: "Demon Hunter", iconUrl: driveViewUrl(DRIVE["demon-hunter"]), fallback: "😈🏹" },
  { key: "berserker",    label: "Berserker",    iconUrl: driveViewUrl(DRIVE["berserker"]),    fallback: "🪓"  },
  { key: "battle-mage",  label: "Battle Mage",  iconUrl: driveViewUrl(DRIVE["battle-mage"]),  fallback: "🛡️✨" },
  { key: "druid",        label: "Druid",        iconUrl: driveViewUrl(DRIVE["druid"]),        fallback: "🌿"  },
  { key: "bard",         label: "Bard",         iconUrl: driveViewUrl(DRIVE["bard"]),         fallback: "🎶"  },
  { key: "necromancer",  label: "Necromancer",  iconUrl: driveViewUrl(DRIVE["necromancer"]),  fallback: "💀"  },
  { key: "paladin",      label: "Paladin",      iconUrl: driveViewUrl(DRIVE["paladin"]),      fallback: "🛡️"  },
];

export const CLASS_BY_KEY = Object.fromEntries(CLASSES.map(c => [c.key, c] as const));

/** Alias-Lexikon: akzeptiert Labels, Keys und gängige Synonyme (DE/EN).
 *  → „Necromancer“ (Label, groß geschrieben) matched sicher auf den Key.
 */
const ALIASES = new Map<string, GameClassKey>();
function add(alias: string, key: GameClassKey) { ALIASES.set(canon(alias), key); }

// Keys & Labels
for (const c of CLASSES) { add(c.key, c.key); add(c.label, c.key); }

// Zusätzliche Synonyme/Kürzel/DE
add("war", "warrior");          add("krieger", "warrior");
add("magier", "mage");
add("jaeger", "scout");         add("jäger", "scout");
add("assa", "assassin");        add("meuchelmoerder", "assassin"); add("meuchelmörder", "assassin");
add("demonhunter", "demon-hunter"); add("dh", "demon-hunter");
add("daemonenjaeger", "demon-hunter"); add("dämonenjäger", "demon-hunter");
add("zerker", "berserker");
add("battlemage", "battle-mage"); add("kampfmagier", "battle-mage"); add("bm", "battle-mage");
add("druide", "druid");
add("barde", "bard");
add("necro", "necromancer"); add("nekromant", "necromancer");
add("pala", "paladin");

/** Öffentliche Helper: aus beliebigem Namen verlässlich das Icon bestimmen. */
export function iconForClassName(input?: string | null): { url?: string; fallback?: string } {
  const c = canon(input);
  if (!c) return {};

  // 1) exakter Alias-Treffer
  const key1 = ALIASES.get(c);
  if (key1) {
    const meta = CLASS_BY_KEY[key1];
    return { url: meta.iconUrl, fallback: meta.fallback };
  }

  // 2) Prefix-Treffer (robust bei ungewöhnlichen Kürzeln)
  for (const [alias, k] of ALIASES.entries()) {
    if (alias.startsWith(c) || c.startsWith(alias)) {
      const meta = CLASS_BY_KEY[k];
      return { url: meta.iconUrl, fallback: meta.fallback };
    }
  }

  return {};
}
