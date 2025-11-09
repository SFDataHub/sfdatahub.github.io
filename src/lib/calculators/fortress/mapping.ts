// FILE: src/lib/calculators/fortress/mapping.ts
import type { BuildingKey } from "./tables";

export type TabKey = BuildingKey;

// EXAKT deine Keys:
export const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "woodcutter",          label: "Woodcutter" },
  { key: "treasury",            label: "Treasury" },
  { key: "smithy",              label: "Smithy" },
  { key: "quarry",              label: "Quarry" },
  { key: "magetower",           label: "Mage Tower" },
  { key: "laborers_quarters",   label: "Laborers Quarters" },
  { key: "gem_mine",            label: "Gem Mine" },
  { key: "fortress",            label: "Fortress" },
  { key: "fortification",       label: "Fortification" },
  { key: "barracks",            label: "Barracks" },
  { key: "archery",             label: "Archery" },
  { key: "academy",             label: "Academy" },
];

export const DEFAULT_TAB: TabKey = "fortress";

export const BUILDING_LABELS: Record<BuildingKey, string> = {
  woodcutter:         "Woodcutter",
  treasury:           "Treasury",
  smithy:             "Smithy",
  quarry:             "Quarry",
  magetower:          "Mage Tower",
  laborers_quarters:  "Laborers Quarters",
  gem_mine:           "Gem Mine",
  fortress:           "Fortress",
  fortification:      "Fortification",
  barracks:           "Barracks",
  archery:            "Archery",
  academy:            "Academy",
};

// Mapping auf DEINE Asset-Keys (genau so benannt wie bei dir):
export const BUILDING_MEDIA_KEYS: Record<BuildingKey, string> = {
  woodcutter:         "woodcuttergif",
  treasury:           "treasurygif",
  smithy:             "smithygif",
  quarry:             "quarrygif",
  magetower:          "magetowergif",
  laborers_quarters:  "laborerquagif",     // ← dein Keyname für das GIF
  gem_mine:           "gemminegif",
  fortress:           "fortressgif",
  fortification:      "fortificationgif",
  barracks:           "barracksgif",
  archery:            "archerygif",
  academy:            "academygif",
};
