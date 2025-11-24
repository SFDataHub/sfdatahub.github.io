export type DungeonGroup = "light" | "shadow" | "special";

export interface DungeonRow {
  key: string;
  name: string;         // Anzeige-Label (inkl. Nummer wie im Sheet)
  minLevel: number;     // i. d. R. 1
  maxLevel: number;     // Light/Shadow: 10; Twister: 1000; CLoI: 30; Sandstorm: 20
  /**
   * XP pro Level, 1-basiert abgelegt: levels[1]..levels[maxLevel]
   * Index 0 bleibt absichtlich ungenutzt für einfache Summen.
   */
  levels: number[];
}

export interface SpecialRow extends DungeonRow {
  specialType: "twister" | "cloi" | "sandstorm";
}

export interface CalculatorData {
  light: DungeonRow[];
  shadow: DungeonRow[];
  special: SpecialRow[];
}

/** Inklusive Bereichssumme; 0 wenn from/to=0. */
export function sumXp(levels: number[], from: number, to: number): number {
  if (!Array.isArray(levels) || from <= 0 || to <= 0) return 0;
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  let s = 0;
  for (let i = a; i <= b; i++) s += levels[i] ?? 0;
  return s;
}

/** Dropdown-Optionen 0..max, 0 = deaktiviert ("—"). */
export function buildOptions(max: number): number[] {
  const out: number[] = [0];
  for (let i = 1; i <= max; i++) out.push(i);
  return out;
}
