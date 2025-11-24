// FortressCalc – Formeln/Logik (exakt nach ODS/PDF)
// Keine UI-Texte. Nur Berechnungen, die das Sheet nutzt.

import type { BuildingKey, LevelCost } from "./tables";
import { BUILDINGS } from "./tables";

// Rundungs-/Formatregeln aus dem Sheet
export const ROUNDING = {
  wood:  "round" as const,  // "round" | "floor" | "ceil"
  stone: "round" as const,
  time:  "round" as const,  // Sekundenebene
};

function applyRounding(value: number, mode: "round" | "floor" | "ceil"): number {
  if (mode === "floor") return Math.floor(value);
  if (mode === "ceil")  return Math.ceil(value);
  return Math.round(value);
}

// -------------------------------------------------------------
// Basis-Helfer (weiterhin vorhanden, unverändert nutzbar)
// -------------------------------------------------------------

export function getLevelCost(building: BuildingKey, level: number): LevelCost | null {
  const arr = BUILDINGS[building]?.costs;
  if (!arr) return null;
  return arr.find((r) => r.level === level) ?? null;
}

export function calcSingleLevel(building: BuildingKey, level: number) {
  const row = getLevelCost(building, level);
  if (!row) {
    return { wood: 0, stone: 0, timeSec: 0, exists: false };
  }
  return {
    wood:   applyRounding(row.wood, ROUNDING.wood),
    stone:  applyRounding(row.stone, ROUNDING.stone),
    timeSec: applyRounding(row.timeSec, ROUNDING.time),
    exists: true,
  };
}

export function calcAggregateLevels(building: BuildingKey, levels: number[]) {
  let wood = 0;
  let stone = 0;
  let timeSec = 0;

  for (const lvl of levels) {
    const row = getLevelCost(building, lvl);
    if (!row) continue;
    wood   += row.wood;
    stone  += row.stone;
    timeSec += row.timeSec;
  }

  return {
    wood:   applyRounding(wood, ROUNDING.wood),
    stone:  applyRounding(stone, ROUNDING.stone),
    timeSec: applyRounding(timeSec, ROUNDING.time),
    count: levels.length,
  };
}

export function calcRangeInclusive(building: BuildingKey, startLevel: number, endLevel: number) {
  if (startLevel > endLevel) [startLevel, endLevel] = [endLevel, startLevel];

  const arr = BUILDINGS[building]?.costs ?? [];
  let wood = 0, stone = 0, timeSec = 0;

  // (Optional – nur falls im ODS so vorgesehen)
  for (let lvl = startLevel + 1; lvl <= endLevel; lvl++) {
    const row = arr.find((r) => r.level === lvl);
    if (!row) continue;
    wood   += row.wood;
    stone  += row.stone;
    timeSec += row.timeSec;
  }

  return {
    wood:   applyRounding(wood, ROUNDING.wood),
    stone:  applyRounding(stone, ROUNDING.stone),
    timeSec: applyRounding(timeSec, ROUNDING.time),
    from: startLevel,
    to: endLevel,
  };
}

// -------------------------------------------------------------
// NEU: Laborers-Multiplikator & Mushroom-Skip exakt wie im Sheet
// Sheet-Formel: ROUNDUP(ROUNDUP(minutes / 1440) / 10)
// d.h. 1 Pilz je angefangene 10 Tage (nach Tag-Rundung).
// -------------------------------------------------------------

/** 0..15 → 0..0.75 in 0.05-Schritten */
export function l2Multiplier(l2: number): number {
  if (l2 <= 0) return 0;
  if (l2 >= 15) return 0.75;
  return +(l2 * 0.05).toFixed(2);
}

/** Wendet den Laborers-Effekt auf Sekunden an und rundet auf ganze Sekunden. */
export function applyLaborersToTimeSec(baseSec: number, l2: number): number {
  const mult = l2Multiplier(l2);
  return Math.max(0, Math.round(baseSec * (1 - mult)));
}

/**
 * Pilze zum Skippen anhand L2-Zeit in SEKUNDEN.
 * Entspricht: ROUNDUP(ROUNDUP(minutes/1440)/10).
 */
export function skipMushroomsFromL2Seconds(l2Seconds: number): number {
  const minutes = Math.ceil(l2Seconds / 60);     // ROUNDUP(sec/60)
  const days    = Math.ceil(minutes / 1440);     // ROUNDUP(minutes/1440)
  return Math.ceil(days / 10);                   // ROUNDUP(days/10)
}

/** Bequeme Variante: basiert auf Basis-Sekunden + L2. */
export function skipMushroomsByDaysRounded(baseSec: number, l2: number): number {
  const l2Sec = applyLaborersToTimeSec(baseSec, l2);
  return skipMushroomsFromL2Seconds(l2Sec);
}

// -------------------------------------------------------------
// Optionale Konvertierung
// -------------------------------------------------------------
export const Conversions = {
  secondsToDhms(totalSec: number) {
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    return { d, h, m, s };
  },
};
