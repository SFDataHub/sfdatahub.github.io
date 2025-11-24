// FILE: src/lib/calculators/underworld/mapping.ts
// Mapping der Underworld-Buildings ↔ Labels ↔ Asset-Keys (GIF)
// Ziel: Labels zentral bearbeitbar, API bleibt kompatibel.

// WICHTIG:
// - DEFAULT_BUILDING bleibt erhalten (Kompatibilität).
// - GIFKEY_TO_BUILDING_KEY ist korrigiert (liefert BuildingKey, nicht freie Texte).

import type { BuildingKey } from "./tables";

export type TabKey = BuildingKey;

// Standard-Building (wie zuvor)
export const DEFAULT_BUILDING: BuildingKey = "hearthofdarkn";

// Optional gleiches Pattern wie bei Fortress (falls gebraucht)
export const DEFAULT_TAB: TabKey = "hearthofdarkn";

// ZENTRALE Label-Texte – hier beliebig anpassen
export const BUILDING_LABELS: Record<BuildingKey, string> = {
  uwgate:         "Underworld Gate",
  trollblock:     "Troll Block",
  torturechamber: "Torture Chamber",
  soulextractor:  "Soul Extractor",
  keeper:         "Keeper",
  hearthofdarkn:  "Hearth of Darkness",
  goldpit:        "Gold Pit",
  goblinpit:      "Goblin Pit",
  gladiator:      "Gladiator",
  adventuromatic: "Adventuromatic",
};

// Asset-Key (GIF) pro Building
export const BUILDING_MEDIA_KEYS: Record<BuildingKey, string> = {
  uwgate:         "uwgategif",
  trollblock:     "trollblockgif",
  torturechamber: "torturechambergif",
  soulextractor:  "soulextractorgif",
  keeper:         "keepergif",
  hearthofdarkn:  "hearthofdarkngif",
  goldpit:        "goldpitgif",
  goblinpit:      "goblinpitgif",
  gladiator:      "gladiatorgif",
  adventuromatic: "adventuromaticgif",
};

// Tabs (Key = Building, Label aus obenstehenden BUILDING_LABELS)
export const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "uwgate",         label: BUILDING_LABELS.uwgate },
  { key: "trollblock",     label: BUILDING_LABELS.trollblock },
  { key: "torturechamber", label: BUILDING_LABELS.torturechamber },
  { key: "soulextractor",  label: BUILDING_LABELS.soulextractor },
  { key: "keeper",         label: BUILDING_LABELS.keeper },
  { key: "hearthofdarkn",  label: BUILDING_LABELS.hearthofdarkn },
  { key: "goldpit",        label: BUILDING_LABELS.goldpit },
  { key: "goblinpit",      label: BUILDING_LABELS.goblinpit },
  { key: "gladiator",      label: BUILDING_LABELS.gladiator },
  { key: "adventuromatic", label: BUILDING_LABELS.adventuromatic },
];

// Rückwärts-Mapping: GIF-Key → BuildingKey (KORREKT getypt)
export const GIFKEY_TO_BUILDING_KEY: Record<string, BuildingKey> = {
  uwgategif:          "uwgate",
  trollblockgif:      "trollblock",
  torturechambergif:  "torturechamber",
  soulextractorgif:   "soulextractor",
  keepergif:          "keeper",
  hearthofdarkngif:   "hearthofdarkn",
  goldpitgif:         "goldpit",
  goblinpitgif:       "goblinpit",
  gladiatorgif:       "gladiator",
  adventuromaticgif:  "adventuromatic",
};
