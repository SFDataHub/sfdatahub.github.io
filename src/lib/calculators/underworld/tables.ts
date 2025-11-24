// FILE: src/lib/calculators/underworld/tables.ts
// AUTO-GENERATED from ODS (Underworld + Calculator) — 1:1 values
export type BuildingKey =
  | "hearthofdarkn"
  | "soulextractor"
  | "gladiator"
  | "goldpit"
  | "adventuromatic"
  | "torturechamber"
  | "uwgate"
  | "keeper"
  | "goblinpit"
  | "trollblock";

export type LevelCost = {
  level: number | string;
  soul: number | null;
  gold: number | null;
  /** Raw Build Time (Hidden) in seconds — direkt aus Spalte H umgerechnet */
  timeSec: number;
};

export const BUILDINGS: Record<
  BuildingKey,
  { title: string; costs: LevelCost[] }
> = {
  hearthofdarkn: {
    title: "Heart of Darkness",
    costs: [
      { level: 1, soul: null, gold: null, timeSec: 900 },
      { level: 2, soul: 616, gold: 2000, timeSec: 1895 },
      { level: 3, soul: 1650, gold: 3000, timeSec: 3960 },
      { level: 4, soul: 4220, gold: 4000, timeSec: 8400 },
      { level: 5, soul: 11000, gold: 5000, timeSec: 18000 },
      { level: 6, soul: 25080, gold: 6000, timeSec: 28800 },
      { level: 7, soul: 45930, gold: 7000, timeSec: 41100 },
      { level: 8, soul: 84150, gold: 8000, timeSec: 66420 },
      { level: 9, soul: 198000, gold: 9000, timeSec: 144000 },
      { level: 10, soul: 439550, gold: 10000, timeSec: 314160 },
      { level: 11, soul: 902850, gold: 11000, timeSec: 686760 },
      { level: 12, soul: 2043300, gold: 12000, timeSec: 1152000 },
      { level: 13, soul: 4118400, gold: 13000, timeSec: 1728000 },
      { level: 14, soul: 7722000, gold: 14000, timeSec: 2215980 },
      { level: 15, soul: 16632000, gold: 15000, timeSec: 2880000 },
    ],
  },

  soulextractor: {
    title: "Soul Extractor",
    costs: [
      { level: 1, soul: 74, gold: 400, timeSec: 900 },
      { level: 2, soul: 277, gold: 800, timeSec: 1895 },
      { level: 3, soul: 743, gold: 1200, timeSec: 3960 },
      { level: 4, soul: 1900, gold: 1600, timeSec: 8400 },
      { level: 5, soul: 4950, gold: 2000, timeSec: 18000 },
      { level: 6, soul: 11285, gold: 2400, timeSec: 28800 },
      { level: 7, soul: 24115, gold: 2800, timeSec: 41100 },
      { level: 8, soul: 47585, gold: 3200, timeSec: 66420 },
      { level: 9, soul: 118800, gold: 3600, timeSec: 144000 },
      { level: 10, soul: 264720, gold: 4000, timeSec: 314160 },
      { level: 11, soul: 543240, gold: 4400, timeSec: 686760 },
      { level: 12, soul: 1225980, gold: 4800, timeSec: 1152000 },
      { level: 13, soul: 2471040, gold: 5200, timeSec: 1728000 },
      { level: 14, soul: 4633200, gold: 5600, timeSec: 2215980 },
      { level: 15, soul: 9979200, gold: 6000, timeSec: 2880000 },
    ],
  },

  gladiator: {
    title: "Gladiator Trainer",
    costs: [
      { level: 1, soul: 148, gold: 700, timeSec: 900 },
      { level: 2, soul: 554, gold: 1400, timeSec: 1895 },
      { level: 3, soul: 1485, gold: 2100, timeSec: 3960 },
      { level: 4, soul: 3800, gold: 2800, timeSec: 8400 },
      { level: 5, soul: 9900, gold: 3500, timeSec: 18000 },
      { level: 6, soul: 22570, gold: 4200, timeSec: 28800 },
      { level: 7, soul: 48230, gold: 4900, timeSec: 41100 },
      { level: 8, soul: 100950, gold: 5600, timeSec: 66420 },
      { level: 9, soul: 237600, gold: 6300, timeSec: 144000 },
      { level: 10, soul: 527450, gold: 7000, timeSec: 314160 },
      { level: 11, soul: 1083420, gold: 7700, timeSec: 686760 },
      { level: 12, soul: 2440320, gold: 8400, timeSec: 1152000 },
      { level: 13, soul: 4894080, gold: 9100, timeSec: 1728000 },
      { level: 14, soul: 9172800, gold: 9800, timeSec: 2215980 },
      { level: 15, soul: 19728000, gold: 10500, timeSec: 2880000 },
    ],
  },

  goldpit: {
    title: "Gold Pit",
    costs: [
      { level: 1, soul: 74, gold: 350, timeSec: 900 },
      { level: 2, soul: 277, gold: 700, timeSec: 1895 },
      { level: 3, soul: 743, gold: 1050, timeSec: 3960 },
      { level: 4, soul: 1900, gold: 1400, timeSec: 8400 },
      { level: 5, soul: 4950, gold: 1750, timeSec: 18000 },
      { level: 6, soul: 11285, gold: 2100, timeSec: 28800 },
      { level: 7, soul: 24115, gold: 2450, timeSec: 41100 },
      { level: 8, soul: 47585, gold: 2800, timeSec: 66420 },
      { level: 9, soul: 118800, gold: 3150, timeSec: 144000 },
      { level: 10, soul: 264720, gold: 3500, timeSec: 314160 },
      { level: 11, soul: 543240, gold: 3850, timeSec: 686760 },
      { level: 12, soul: 1225980, gold: 4200, timeSec: 1152000 },
      { level: 13, soul: 2471040, gold: 4550, timeSec: 1728000 },
      { level: 14, soul: 4633200, gold: 4900, timeSec: 2215980 },
      { level: 15, soul: 9979200, gold: 5250, timeSec: 2880000 },
      { level: "16-100", soul: 162518400, gold: 10000000, timeSec: 5184000 },
    ],
  },

  adventuromatic: {
    title: "Adventuromatic",
    costs: [
      { level: 1, soul: 297, gold: 10000, timeSec: 900 }, // 0h15m
      { level: 2, soul: 1105, gold: 20000, timeSec: 1860 }, // 0h31m
      { level: 3, soul: 2970, gold: 30000, timeSec: 3960 }, // 1h6m
      { level: 4, soul: 5700, gold: 40000, timeSec: 8400 }, // 2h20m
      { level: 5, soul: 11880, gold: 50000, timeSec: 18000 }, // 5h0m
      { level: 6, soul: 22570, gold: 60000, timeSec: 28800 }, // 8h0m
      { level: 7, soul: 41340, gold: 70000, timeSec: 41100 }, // 11h25m
      { level: 8, soul: 75730, gold: 80000, timeSec: 66420 }, // 18h27m
      { level: 9, soul: 178200, gold: 90000, timeSec: 144000 }, // 40h0m
      { level: 10, soul: 395600, gold: 100000, timeSec: 314160 }, // 87h16m
      { level: 11, soul: 812550, gold: 110000, timeSec: 686760 }, // 190h46m
      { level: 12, soul: 1839000, gold: 120000, timeSec: 1152000 }, // 320h0m
      { level: 13, soul: 3706500, gold: 130000, timeSec: 1728000 }, // 480h0m
      { level: 14, soul: 6949800, gold: 140000, timeSec: 2215980 }, // 615h33m
      { level: 15, soul: 14968500, gold: 150000, timeSec: 2880000 }, // 800h0m
    ],
  },

  torturechamber: {
    title: "Torture Chamber",
    costs: [
      { level: 1, soul: 148, gold: 600, timeSec: 900 },
      { level: 2, soul: 554, gold: 1200, timeSec: 1895 },
      { level: 3, soul: 1485, gold: 1800, timeSec: 3960 },
      { level: 4, soul: 3800, gold: 2400, timeSec: 8400 },
      { level: 5, soul: 9900, gold: 3000, timeSec: 18000 },
      { level: 6, soul: 22570, gold: 3600, timeSec: 28800 },
      { level: 7, soul: 48230, gold: 4200, timeSec: 41100 },
      { level: 8, soul: 100950, gold: 4800, timeSec: 66420 },
      { level: 9, soul: 237600, gold: 5400, timeSec: 144000 },
      { level: 10, soul: 527450, gold: 6000, timeSec: 314160 },
      { level: 11, soul: 1083420, gold: 6600, timeSec: 686760 },
      { level: 12, soul: 2440320, gold: 7200, timeSec: 1152000 },
      { level: 13, soul: 4894080, gold: 7800, timeSec: 1728000 },
      { level: 14, soul: 9172800, gold: 8400, timeSec: 2215980 },
      { level: 15, soul: 19728000, gold: 9000, timeSec: 2880000 },
    ],
  },

  uwgate: {
    title: "Underworld Gate",
    costs: [
      { level: 1, soul: 74, gold: 300, timeSec: 900 },
      { level: 2, soul: 277, gold: 600, timeSec: 1895 },
      { level: 3, soul: 743, gold: 900, timeSec: 3960 },
      { level: 4, soul: 1900, gold: 1200, timeSec: 8400 },
      { level: 5, soul: 4950, gold: 1500, timeSec: 18000 },
      { level: 6, soul: 11285, gold: 1800, timeSec: 28800 },
      { level: 7, soul: 24115, gold: 2100, timeSec: 41100 },
      { level: 8, soul: 47585, gold: 2400, timeSec: 66420 },
      { level: 9, soul: 118800, gold: 2700, timeSec: 144000 },
      { level: 10, soul: 264720, gold: 3000, timeSec: 314160 },
      { level: 11, soul: 543240, gold: 3300, timeSec: 686760 },
      { level: 12, soul: 1225980, gold: 3600, timeSec: 1152000 },
      { level: 13, soul: 2471040, gold: 3900, timeSec: 1728000 },
      { level: 14, soul: 4633200, gold: 4200, timeSec: 2215980 },
      { level: 15, soul: 9979200, gold: 4500, timeSec: 2880000 },
    ],
  },

  keeper: {
    title: "Keeper",
    costs: [
      { level: 1, soul: 148, gold: 650, timeSec: 900 },
      { level: 2, soul: 554, gold: 1300, timeSec: 1895 },
      { level: 3, soul: 1485, gold: 1950, timeSec: 3960 },
      { level: 4, soul: 3800, gold: 2600, timeSec: 8400 },
      { level: 5, soul: 9900, gold: 3250, timeSec: 18000 },
      { level: 6, soul: 22570, gold: 3900, timeSec: 28800 },
      { level: 7, soul: 48230, gold: 4550, timeSec: 41100 },
      { level: 8, soul: 100950, gold: 5200, timeSec: 66420 },
      { level: 9, soul: 237600, gold: 5850, timeSec: 144000 },
      { level: 10, soul: 527450, gold: 6500, timeSec: 314160 },
      { level: 11, soul: 1083420, gold: 7150, timeSec: 686760 },
      { level: 12, soul: 2440320, gold: 7800, timeSec: 1152000 },
      { level: 13, soul: 4894080, gold: 8450, timeSec: 1728000 },
      { level: 14, soul: 9172800, gold: 9100, timeSec: 2215980 },
      { level: 15, soul: 19728000, gold: 9750, timeSec: 2880000 },
    ],
  },

  goblinpit: {
    title: "Goblin Pit",
    costs: [
      { level: 1, soul: 74, gold: 325, timeSec: 900 },
      { level: 2, soul: 277, gold: 650, timeSec: 1895 },
      { level: 3, soul: 743, gold: 975, timeSec: 3960 },
      { level: 4, soul: 1900, gold: 1300, timeSec: 8400 },
      { level: 5, soul: 4950, gold: 1625, timeSec: 18000 },
      { level: 6, soul: 11285, gold: 1950, timeSec: 28800 },
      { level: 7, soul: 24115, gold: 2275, timeSec: 41100 },
      { level: 8, soul: 47585, gold: 2600, timeSec: 66420 },
      { level: 9, soul: 118800, gold: 2925, timeSec: 144000 },
      { level: 10, soul: 264720, gold: 3250, timeSec: 314160 },
      { level: 11, soul: 543240, gold: 3575, timeSec: 686760 },
      { level: 12, soul: 1225980, gold: 3900, timeSec: 1152000 },
      { level: 13, soul: 2471040, gold: 4225, timeSec: 1728000 },
      { level: 14, soul: 4633200, gold: 4550, timeSec: 2215980 },
      { level: 15, soul: 9979200, gold: 4875, timeSec: 2880000 },
    ],
  },

  trollblock: {
    title: "Troll Block",
    costs: [
      { level: 1, soul: 148, gold: 750, timeSec: 900 },
      { level: 2, soul: 554, gold: 1500, timeSec: 1895 },
      { level: 3, soul: 1485, gold: 2250, timeSec: 3960 },
      { level: 4, soul: 3800, gold: 3000, timeSec: 8400 },
      { level: 5, soul: 9900, gold: 3750, timeSec: 18000 },
      { level: 6, soul: 22570, gold: 4500, timeSec: 28800 },
      { level: 7, soul: 48230, gold: 5250, timeSec: 41100 },
      { level: 8, soul: 100950, gold: 6000, timeSec: 66420 },
      { level: 9, soul: 237600, gold: 6750, timeSec: 144000 },
      { level: 10, soul: 527450, gold: 7500, timeSec: 314160 },
      { level: 11, soul: 1083420, gold: 8250, timeSec: 686760 },
      { level: 12, soul: 2440320, gold: 9000, timeSec: 1152000 },
      { level: 13, soul: 4894080, gold: 9750, timeSec: 1728000 },
      { level: 14, soul: 9172800, gold: 10500, timeSec: 2215980 },
      { level: 15, soul: 19728000, gold: 11250, timeSec: 2880000 },
    ],
  },
};
