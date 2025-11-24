// Underworld – Formeln/Logik (keine UI)
// L2: 0–15 → 0..0.75 (in 0.05-Schritten) – für ALLE Underworld-Buildings.
// Build Time (L2): baseSec * (1 - L2mult)  ← KEINE Rundung vor der Skip-Berechnung!
// Skip (Mushrooms): ceil( ceil(timeAdjSec / 60) / 10 )

import type { BuildingKey, LevelCost } from "./tables";
import { BUILDINGS } from "./tables";

/** L2 (Laborers) → Multiplikator (0..0.75 in 0.05-Schritten) */
export function l2Multiplier(l2: number): number {
  const n = Math.max(0, Math.min(15, Math.round(l2)));
  return n * 0.05;
}

/** Datensatz für ein Level holen */
export function getLevelCost(building: BuildingKey, level: number): LevelCost | null {
  const arr = BUILDINGS[building]?.costs;
  if (!arr) return null;
  return arr.find((r) => r.level === level) ?? null;
}

/** Sekunden → h:m:s helper (nur Anzeige; Berechnungen nutzen die Rohwerte) */
export function secondsToHMS(totalSec: number) {
  const sRaw = Math.max(0, totalSec);
  // Für die Anzeige auf volle Sekunde runden, ohne die Berechnungen zu beeinflussen:
  const s = Math.round(sRaw);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return { h, m, s: sec };
}

export function formatHMS(totalSec: number) {
  const { h, m, s } = secondsToHMS(totalSec);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export type UWRowComputed = LevelCost & {
  /** Bauzeit mit L2-Faktor (Sekunden, nicht vorgerundet) */
  timeAdjSec: number;
  /** Skip (Pilze) nach L2 – aus timeAdjSec berechnet */
  skipMushroomsAdj: number;
};

/** Zeilen für Tabelle berechnen (inkl. L2 & Skip) */
export function computeRows(building: BuildingKey, l2: number): UWRowComputed[] {
  const mult = l2Multiplier(l2); // 0..0.75
  const rows = BUILDINGS[building]?.costs ?? [];

  return rows.map((r) => {
    // KEIN round/ceil hier – exakt wie im Sheet: I = H * (1 - $M$2)
    const timeAdjSec = r.timeSec * (1 - mult);

    // Sheet-Formel: =roundup(roundup(I*1440,0)/10,0)
    // Bei Sekunden: ceil( ceil(timeAdjSec / 60) / 10 )
    const skipMushroomsAdj = Math.ceil(Math.ceil(timeAdjSec / 60) / 10);

    return { ...r, timeAdjSec, skipMushroomsAdj };
  });
}
