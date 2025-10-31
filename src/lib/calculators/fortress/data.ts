// src/lib/calculators/fortress/data.ts

export type BuildingKey =
  | "fortress"
  | "woodcutter"
  | "quarry"
  | "gem_mine"
  | "academy"
  | "treasury"
  | "barracks"
  | "smithy";

export type LevelCost = {
  level: number;
  wood: number;   // Kosten Holz
  stone: number;  // Kosten Stein
  timeSec: number; // Bauzeit in Sekunden
};

// ───────────────────────────────────────────────────────────
// NOTE: Diese Arrays mit ODS-Daten füllen. Index = Level-1.
// timeSec in Sekunden (einfach in der ODS in Sekunden rechnen oder beim Import umrechnen).
// ───────────────────────────────────────────────────────────

export const FortressCosts: LevelCost[] = [
  { level: 1, wood: 0, stone: 0, timeSec: 0 },          // Platzhalter für Vollständigkeit
  { level: 2, wood: 1200, stone: 900, timeSec: 60 * 10 },
  { level: 3, wood: 2400, stone: 1800, timeSec: 60 * 30 },
  // ... ODS-Werte fortsetzen
];

export const WoodcutterCosts: LevelCost[] = [
  { level: 1, wood: 300, stone: 150, timeSec: 60 * 3 },
  { level: 2, wood: 600, stone: 300, timeSec: 60 * 6 },
  { level: 3, wood: 1200, stone: 600, timeSec: 60 * 12 },
  // ...
];

export const QuarryCosts: LevelCost[] = [
  { level: 1, wood: 150, stone: 300, timeSec: 60 * 3 },
  { level: 2, wood: 300, stone: 600, timeSec: 60 * 6 },
  { level: 3, wood: 600, stone: 1200, timeSec: 60 * 12 },
  // ...
];

export const GemMineCosts: LevelCost[] = [
  { level: 1, wood: 500, stone: 500, timeSec: 60 * 20 },
  { level: 2, wood: 900, stone: 900, timeSec: 60 * 40 },
  { level: 3, wood: 1400, stone: 1400, timeSec: 60 * 60 },
  // ...
];

export const AcademyCosts: LevelCost[] = [
  { level: 1, wood: 800, stone: 500, timeSec: 60 * 15 },
  { level: 2, wood: 1400, stone: 900, timeSec: 60 * 25 },
  { level: 3, wood: 2000, stone: 1400, timeSec: 60 * 45 },
  // ...
];

export const TreasuryCosts: LevelCost[] = [
  { level: 1, wood: 600, stone: 600, timeSec: 60 * 15 },
  { level: 2, wood: 1100, stone: 1100, timeSec: 60 * 25 },
  { level: 3, wood: 1600, stone: 1600, timeSec: 60 * 40 },
  // ...
];

export const BarracksCosts: LevelCost[] = [
  { level: 1, wood: 700, stone: 400, timeSec: 60 * 12 },
  { level: 2, wood: 1200, stone: 800, timeSec: 60 * 20 },
  { level: 3, wood: 1800, stone: 1200, timeSec: 60 * 35 },
  // ...
];

export const SmithyCosts: LevelCost[] = [
  { level: 1, wood: 900, stone: 900, timeSec: 60 * 20 },
  { level: 2, wood: 1500, stone: 1500, timeSec: 60 * 35 },
  { level: 3, wood: 2200, stone: 2200, timeSec: 60 * 50 },
  // ...
];

export const BUILDINGS: Record<BuildingKey, { name: string; costs: LevelCost[] }> = {
  fortress:   { name: "Fortress",  costs: FortressCosts },
  woodcutter: { name: "Woodcutter", costs: WoodcutterCosts },
  quarry:     { name: "Quarry",     costs: QuarryCosts },
  gem_mine:   { name: "Gem Mine",   costs: GemMineCosts },
  academy:    { name: "Academy",    costs: AcademyCosts },
  treasury:   { name: "Treasury",   costs: TreasuryCosts },
  barracks:   { name: "Barracks",   costs: BarracksCosts },
  smithy:     { name: "Smithy",     costs: SmithyCosts },
};

// Helper zum Summieren eines Levelbereichs (from..to, inkl. to)
export function sumRange(costs: LevelCost[], fromLevel: number, toLevel: number) {
  const from = Math.max(1, Math.min(fromLevel, toLevel));
  const to = Math.max(from, toLevel);
  let wood = 0, stone = 0, timeSec = 0;

  for (let lvl = from + 1; lvl <= to; lvl++) {
    const row = costs.find(c => c.level === lvl);
    if (!row) continue;
    wood += row.wood;
    stone += row.stone;
    timeSec += row.timeSec;
  }
  return { wood, stone, timeSec };
}

export function fmtTime(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s && parts.length === 0) parts.push(`${s}s`);
  return parts.join(" ") || "0s";
}

export function fmt(n: number) {
  return n.toLocaleString("en-US");
}
