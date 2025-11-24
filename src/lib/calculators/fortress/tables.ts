export type LevelCost = {
  level: number | string;
  wood: number;
  stone: number;
  gold?: number;
  timeSec: number;
};

export type BuildingKey =
  | "fortress"
  | "laborersquarter"
  | "academy"
  | "treasury"
  | "gemmine"
  | "woodcutter"
  | "quarry"
  | "barracks"
  | "smithy"
  | "magetower"
  | "archery"
  | "fortifications";

export type BuildingTable = {
  key: BuildingKey;
  title: string;
  costs: LevelCost[];
};

const T = (h: number, m: number = 0) => h * 3600 + m * 60;

/** gemeinsame Zeiten */
const TIME_1_15 = [
  T(0, 15),  // 1
  T(0, 31),  // 2
  T(1, 6),   // 3
  T(2, 20),  // 4
  T(5, 0),   // 5
  T(8, 0),   // 6
  T(11, 25), // 7
  T(18, 27), // 8
  T(40, 0),  // 9
  T(87, 16), // 10
  T(190, 46),// 11
  T(320, 0), // 12
  T(480, 0), // 13
  T(615, 33),// 14
  T(800, 0), // 15
];

const TIME_16_20 = [T(1054, 17), T(1122, 51), T(1245, 42), T(1343, 20), T(1440, 0)];

export const BUILDINGS: Record<BuildingKey, BuildingTable> = {
  fortress: {
    key: "fortress",
    title: "Fortress",
    costs: [
      { level: 1, wood: 0, stone: 0, gold: 10, timeSec: TIME_1_15[0] },
      { level: 2, wood: 150, stone: 50, gold: 20, timeSec: TIME_1_15[1] },
      { level: 3, wood: 440, stone: 140, gold: 30, timeSec: TIME_1_15[2] },
      { level: 4, wood: 1100, stone: 333, gold: 40, timeSec: TIME_1_15[3] },
      { level: 5, wood: 2500, stone: 800, gold: 50, timeSec: TIME_1_15[4] },
      { level: 6, wood: 6000, stone: 2000, gold: 60, timeSec: TIME_1_15[5] },
      { level: 7, wood: 13417, stone: 4433, gold: 70, timeSec: TIME_1_15[6] },
      { level: 8, wood: 27200, stone: 9280, gold: 80, timeSec: TIME_1_15[7] },
      { level: 9, wood: 57375, stone: 19125, gold: 90, timeSec: TIME_1_15[8] },
      { level: 10, wood: 154000, stone: 50000, gold: 100, timeSec: TIME_1_15[9] },
      { level: 11, wood: 379500, stone: 122100, gold: 110, timeSec: TIME_1_15[10] },
      { level: 12, wood: 830400, stone: 273600, gold: 120, timeSec: TIME_1_15[11] },
      { level: 13, wood: 1872000, stone: 619200, gold: 130, timeSec: TIME_1_15[12] },
      { level: 14, wood: 3744000, stone: 1248000, gold: 140, timeSec: TIME_1_15[13] },
      { level: 15, wood: 7200000, stone: 2340000, gold: 150, timeSec: TIME_1_15[14] },
      { level: 16, wood: 15120000, stone: 5040000, gold: 160, timeSec: TIME_16_20[0] },
      { level: 17, wood: 27350000, stone: 9000000, gold: 170, timeSec: TIME_16_20[1] },
      { level: 18, wood: 50000000, stone: 17500000, gold: 180, timeSec: TIME_16_20[2] },
      { level: 19, wood: 90000000, stone: 30000000, gold: 190, timeSec: TIME_16_20[3] },
      { level: 20, wood: 165000000, stone: 54000000, gold: 200, timeSec: TIME_16_20[4] },
    ],
  },

  laborersquarter: {
    key: "laborersquarter",
    title: "Laborer's Quarter",
    costs: [
      { level: 1, wood: 35, stone: 12, gold: 5, timeSec: TIME_1_15[0] },
      { level: 2, wood: 138, stone: 46, gold: 10, timeSec: TIME_1_15[1] },
      { level: 3, wood: 406, stone: 129, gold: 15, timeSec: TIME_1_15[2] },
      { level: 4, wood: 1015, stone: 308, gold: 20, timeSec: TIME_1_15[3] },
      { level: 5, wood: 2308, stone: 738, gold: 25, timeSec: TIME_1_15[4] },
      { level: 6, wood: 5538, stone: 1849, gold: 30, timeSec: TIME_1_15[5] },
      { level: 7, wood: 12385, stone: 4092, gold: 35, timeSec: TIME_1_15[6] },
      { level: 8, wood: 25108, stone: 8566, gold: 40, timeSec: TIME_1_15[7] },
      { level: 9, wood: 52962, stone: 17654, gold: 45, timeSec: TIME_1_15[8] },
      { level: 10, wood: 142154, stone: 46154, gold: 50, timeSec: TIME_1_15[9] },
      { level: 11, wood: 350308, stone: 112708, gold: 55, timeSec: TIME_1_15[10] },
      { level: 12, wood: 766523, stone: 252554, gold: 60, timeSec: TIME_1_15[11] },
      { level: 13, wood: 1872000, stone: 619200, gold: 65, timeSec: TIME_1_15[12] },
      { level: 14, wood: 3744000, stone: 1248000, gold: 70, timeSec: TIME_1_15[13] },
      { level: 15, wood: 7200000, stone: 2340000, gold: 75, timeSec: TIME_1_15[14] },
    ],
  },

  academy: {
    key: "academy",
    title: "Academy",
    costs: [
      { level: 1, wood: 7, stone: 9, gold: 7, timeSec: TIME_1_15[0] },
      { level: 2, wood: 28, stone: 37, gold: 14, timeSec: TIME_1_15[1] },
      { level: 3, wood: 81, stone: 103, gold: 21, timeSec: TIME_1_15[2] },
      { level: 4, wood: 203, stone: 246, gold: 28, timeSec: TIME_1_15[3] },
      { level: 5, wood: 462, stone: 591, gold: 35, timeSec: TIME_1_15[4] },
      { level: 6, wood: 1108, stone: 1477, gold: 42, timeSec: TIME_1_15[5] },
      { level: 7, wood: 2477, stone: 3247, gold: 49, timeSec: TIME_1_15[6] },
      { level: 8, wood: 5022, stone: 6853, gold: 56, timeSec: TIME_1_15[7] },
      { level: 9, wood: 10592, stone: 14123, gold: 63, timeSec: TIME_1_15[8] },
      { level: 10, wood: 28431, stone: 36923, gold: 70, timeSec: TIME_1_15[9] },
      { level: 11, wood: 70062, stone: 90166, gold: 77, timeSec: TIME_1_15[10] },
      { level: 12, wood: 153305, stone: 202043, gold: 84, timeSec: TIME_1_15[11] },
      { level: 13, wood: 374400, stone: 495360, gold: 91, timeSec: TIME_1_15[12] },
      { level: 14, wood: 748800, stone: 998400, gold: 98, timeSec: TIME_1_15[13] },
      { level: 15, wood: 1440000, stone: 1872000, gold: 105, timeSec: TIME_1_15[14] },
      { level: 16, wood: 3024000, stone: 4032000, gold: 112, timeSec: TIME_16_20[0] },
      { level: 17, wood: 5470000, stone: 7200000, gold: 119, timeSec: TIME_16_20[1] },
      { level: 18, wood: 10000000, stone: 14000000, gold: 126, timeSec: TIME_16_20[2] },
      { level: 19, wood: 18000000, stone: 24000000, gold: 133, timeSec: TIME_16_20[3] },
      { level: 20, wood: 33000000, stone: 43000000, gold: 140, timeSec: TIME_16_20[4] },
    ],
  },

  treasury: {
    key: "treasury",
    title: "Treasury",
    costs: [
      { level: 1, wood: 40, stone: 13, gold: 25, timeSec: TIME_1_15[0] },
      { level: 2, wood: 160, stone: 53, gold: 50, timeSec: TIME_1_15[1] },
      { level: 3, wood: 469, stone: 149, gold: 75, timeSec: TIME_1_15[2] },
      { level: 4, wood: 1173, stone: 356, gold: 100, timeSec: TIME_1_15[3] },
      { level: 5, wood: 2667, stone: 853, gold: 125, timeSec: TIME_1_15[4] },
      { level: 6, wood: 6400, stone: 2133, gold: 150, timeSec: TIME_1_15[5] },
      { level: 7, wood: 14311, stone: 4729, gold: 175, timeSec: TIME_1_15[6] },
      { level: 8, wood: 29013, stone: 9899, gold: 200, timeSec: TIME_1_15[7] },
      { level: 9, wood: 61200, stone: 20400, gold: 225, timeSec: TIME_1_15[8] },
      { level: 10, wood: 147840, stone: 48000, gold: 250, timeSec: TIME_1_15[9] },
      { level: 11, wood: 331200, stone: 106560, gold: 275, timeSec: TIME_1_15[10] },
      { level: 12, wood: 664320, stone: 218880, gold: 300, timeSec: TIME_1_15[11] },
      { level: 13, wood: 1497600, stone: 495360, gold: 325, timeSec: TIME_1_15[12] },
      { level: 14, wood: 2995200, stone: 998400, gold: 350, timeSec: TIME_1_15[13] },
      { level: 15, wood: 5760000, stone: 1872000, gold: 375, timeSec: TIME_1_15[14] },
      { level: "15-45", wood: 5760000, stone: 1872000, gold: 375, timeSec: TIME_1_15[14] },
    ],
  },

  gemmine: {
    key: "gemmine",
    title: "Gem Mine",
    costs: [
      { level: 1, wood: 50, stone: 17, gold: 15, timeSec: TIME_1_15[0] },
      { level: 2, wood: 200, stone: 67, gold: 30, timeSec: TIME_1_15[1] },
      { level: 3, wood: 587, stone: 187, gold: 45, timeSec: TIME_1_15[2] },
      { level: 4, wood: 1467, stone: 444, gold: 60, timeSec: TIME_1_15[3] },
      { level: 5, wood: 3333, stone: 1067, gold: 75, timeSec: TIME_1_15[4] },
      { level: 6, wood: 8000, stone: 2667, gold: 90, timeSec: TIME_1_15[5] },
      { level: 7, wood: 17889, stone: 5911, gold: 105, timeSec: TIME_1_15[6] },
      { level: 8, wood: 36267, stone: 12373, gold: 120, timeSec: TIME_1_15[7] },
      { level: 9, wood: 76500, stone: 25500, gold: 135, timeSec: TIME_1_15[8] },
      { level: 10, wood: 184800, stone: 60000, gold: 150, timeSec: TIME_1_15[9] },
      { level: 11, wood: 414000, stone: 133200, gold: 165, timeSec: TIME_1_15[10] },
      { level: 12, wood: 830400, stone: 273600, gold: 180, timeSec: TIME_1_15[11] },
      { level: 13, wood: 1872000, stone: 619200, gold: 195, timeSec: TIME_1_15[12] },
      { level: 14, wood: 3744000, stone: 1248000, gold: 210, timeSec: TIME_1_15[13] },
      { level: 15, wood: 7200000, stone: 2340000, gold: 225, timeSec: TIME_1_15[14] },
      { level: 16, wood: 15120000, stone: 5040000, gold: 240, timeSec: TIME_16_20[0] },
      { level: 17, wood: 27350000, stone: 9000000, gold: 255, timeSec: TIME_16_20[1] },
      { level: 18, wood: 50000000, stone: 17500000, gold: 270, timeSec: TIME_16_20[2] },
      { level: 19, wood: 90000000, stone: 30000000, gold: 285, timeSec: TIME_16_20[3] },
      { level: 20, wood: 165000000, stone: 54000000, gold: 300, timeSec: TIME_16_20[4] },
      { level: "21-100", wood: 300000000, stone: 100000000, gold: 10000000, timeSec: T(1440, 0) },
    ],
  },

  woodcutter: {
    key: "woodcutter",
    title: "Woodcutter's Hut",
    costs: [
      { level: 1, wood: 0, stone: 0, gold: 2, timeSec: TIME_1_15[0] },
      { level: 2, wood: 30, stone: 20, gold: 4, timeSec: TIME_1_15[1] },
      { level: 3, wood: 88, stone: 56, gold: 6, timeSec: TIME_1_15[2] },
      { level: 4, wood: 220, stone: 133, gold: 8, timeSec: TIME_1_15[3] },
      { level: 5, wood: 500, stone: 320, gold: 10, timeSec: TIME_1_15[4] },
      { level: 6, wood: 1200, stone: 800, gold: 12, timeSec: TIME_1_15[5] },
      { level: 7, wood: 2683, stone: 1773, gold: 14, timeSec: TIME_1_15[6] },
      { level: 8, wood: 5440, stone: 3712, gold: 16, timeSec: TIME_1_15[7] },
      { level: 9, wood: 11475, stone: 7650, gold: 18, timeSec: TIME_1_15[8] },
      { level: 10, wood: 30800, stone: 20000, gold: 20, timeSec: TIME_1_15[9] },
      { level: 11, wood: 75900, stone: 48840, gold: 22, timeSec: TIME_1_15[10] },
      { level: 12, wood: 166080, stone: 109440, gold: 24, timeSec: TIME_1_15[11] },
      { level: 13, wood: 405600, stone: 268320, gold: 26, timeSec: TIME_1_15[12] },
      { level: 14, wood: 873600, stone: 582400, gold: 28, timeSec: TIME_1_15[13] },
      { level: 15, wood: 1800000, stone: 1170000, gold: 30, timeSec: TIME_1_15[14] },
      { level: 16, wood: 3780000, stone: 2520000, gold: 32, timeSec: TIME_16_20[0] },
      { level: 17, wood: 6837500, stone: 4500000, gold: 34, timeSec: TIME_16_20[1] },
      { level: 18, wood: 12500000, stone: 8750000, gold: 36, timeSec: TIME_16_20[2] },
      { level: 19, wood: 22500000, stone: 15000000, gold: 38, timeSec: TIME_16_20[3] },
      { level: 20, wood: 41250000, stone: 27000000, gold: 40, timeSec: TIME_16_20[4] },
    ],
  },

  quarry: {
    key: "quarry",
    title: "Quarry",
    costs: [
      { level: 1, wood: 22, stone: 0, gold: 3, timeSec: TIME_1_15[0] },
      { level: 2, wood: 90, stone: 16, gold: 6, timeSec: TIME_1_15[1] },
      { level: 3, wood: 264, stone: 45, gold: 9, timeSec: TIME_1_15[2] },
      { level: 4, wood: 660, stone: 107, gold: 12, timeSec: TIME_1_15[3] },
      { level: 5, wood: 1500, stone: 256, gold: 15, timeSec: TIME_1_15[4] },
      { level: 6, wood: 3600, stone: 640, gold: 18, timeSec: TIME_1_15[5] },
      { level: 7, wood: 8050, stone: 1419, gold: 21, timeSec: TIME_1_15[6] },
      { level: 8, wood: 16320, stone: 2970, gold: 24, timeSec: TIME_1_15[7] },
      { level: 9, wood: 34425, stone: 6120, gold: 27, timeSec: TIME_1_15[8] },
      { level: 10, wood: 92400, stone: 16000, gold: 30, timeSec: TIME_1_15[9] },
      { level: 11, wood: 227700, stone: 39072, gold: 33, timeSec: TIME_1_15[10] },
      { level: 12, wood: 498240, stone: 87552, gold: 36, timeSec: TIME_1_15[11] },
      { level: 13, wood: 1216800, stone: 214656, gold: 39, timeSec: TIME_1_15[12] },
      { level: 14, wood: 2620800, stone: 465920, gold: 42, timeSec: TIME_1_15[13] },
      { level: 15, wood: 5400000, stone: 936000, gold: 45, timeSec: TIME_1_15[14] },
      { level: 16, wood: 11340000, stone: 2016000, gold: 48, timeSec: TIME_16_20[0] },
      { level: 17, wood: 20512500, stone: 3600000, gold: 51, timeSec: TIME_16_20[1] },
      { level: 18, wood: 37500000, stone: 7000000, gold: 54, timeSec: TIME_16_20[2] },
      { level: 19, wood: 67500000, stone: 12000000, gold: 57, timeSec: TIME_16_20[3] },
      { level: 20, wood: 123750000, stone: 21600000, gold: 60, timeSec: TIME_16_20[4] },
    ],
  },

  barracks: {
    key: "barracks",
    title: "Barracks",
    costs: [
      { level: 1, wood: 20, stone: 14, gold: 4, timeSec: TIME_1_15[0] },
      { level: 2, wood: 82, stone: 55, gold: 8, timeSec: TIME_1_15[1] },
      { level: 3, wood: 240, stone: 153, gold: 12, timeSec: TIME_1_15[2] },
      { level: 4, wood: 600, stone: 364, gold: 16, timeSec: TIME_1_15[3] },
      { level: 5, wood: 1364, stone: 873, gold: 20, timeSec: TIME_1_15[4] },
      { level: 6, wood: 3273, stone: 2182, gold: 24, timeSec: TIME_1_15[5] },
      { level: 7, wood: 7318, stone: 4836, gold: 28, timeSec: TIME_1_15[6] },
      { level: 8, wood: 14836, stone: 10124, gold: 32, timeSec: TIME_1_15[7] },
      { level: 9, wood: 31295, stone: 20864, gold: 36, timeSec: TIME_1_15[8] },
      { level: 10, wood: 84000, stone: 54545, gold: 40, timeSec: TIME_1_15[9] },
      { level: 11, wood: 207000, stone: 133200, gold: 44, timeSec: TIME_1_15[10] },
      { level: 12, wood: 415200, stone: 273600, gold: 48, timeSec: TIME_1_15[11] },
      { level: 13, wood: 936000, stone: 619200, gold: 52, timeSec: TIME_1_15[12] },
      { level: 14, wood: 1872000, stone: 1248000, gold: 56, timeSec: TIME_1_15[13] },
      { level: 15, wood: 3600000, stone: 2340000, gold: 60, timeSec: TIME_1_15[14] },
    ],
  },

  smithy: {
    key: "smithy",
    title: "Smithy",
    costs: [
      { level: 1, wood: 25, stone: 8, gold: 4, timeSec: TIME_1_15[0] },
      { level: 2, wood: 100, stone: 33, gold: 8, timeSec: TIME_1_15[1] },
      { level: 3, wood: 293, stone: 93, gold: 12, timeSec: TIME_1_15[2] },
      { level: 4, wood: 733, stone: 222, gold: 16, timeSec: TIME_1_15[3] },
      { level: 5, wood: 1667, stone: 533, gold: 20, timeSec: TIME_1_15[4] },
      { level: 6, wood: 4000, stone: 1333, gold: 24, timeSec: TIME_1_15[5] },
      { level: 7, wood: 8944, stone: 2956, gold: 28, timeSec: TIME_1_15[6] },
      { level: 8, wood: 18133, stone: 6187, gold: 32, timeSec: TIME_1_15[7] },
      { level: 9, wood: 38250, stone: 12750, gold: 36, timeSec: TIME_1_15[8] },
      { level: 10, wood: 92400, stone: 30000, gold: 40, timeSec: TIME_1_15[9] },
      { level: 11, wood: 207000, stone: 66600, gold: 44, timeSec: TIME_1_15[10] },
      { level: 12, wood: 415200, stone: 136800, gold: 48, timeSec: TIME_1_15[11] },
      { level: 13, wood: 936000, stone: 309600, gold: 52, timeSec: TIME_1_15[12] },
      { level: 14, wood: 1872000, stone: 624000, gold: 56, timeSec: TIME_1_15[13] },
      { level: 15, wood: 3600000, stone: 1170000, gold: 60, timeSec: TIME_1_15[14] },
      { level: 16, wood: 7560000, stone: 2520000, gold: 64, timeSec: TIME_16_20[0] },
      { level: 17, wood: 13675000, stone: 4500000, gold: 68, timeSec: TIME_16_20[1] },
      { level: 18, wood: 25000000, stone: 8750000, gold: 72, timeSec: TIME_16_20[2] },
      { level: 19, wood: 45000000, stone: 15000000, gold: 76, timeSec: TIME_16_20[3] },
      { level: 20, wood: 82500000, stone: 27000000, gold: 80, timeSec: TIME_16_20[4] },
    ],
  },

  magetower: {
    key: "magetower",
    title: "Mage's Tower",
    costs: [
      { level: 1, wood: 61, stone: 20, gold: 6, timeSec: TIME_1_15[0] },
      { level: 2, wood: 240, stone: 61, gold: 12, timeSec: TIME_1_15[1] },
      { level: 3, wood: 675, stone: 205, gold: 18, timeSec: TIME_1_15[2] },
      { level: 4, wood: 1636, stone: 524, gold: 24, timeSec: TIME_1_15[3] },
      { level: 5, wood: 4091, stone: 1364, gold: 30, timeSec: TIME_1_15[4] },
      { level: 6, wood: 9409, stone: 3109, gold: 36, timeSec: TIME_1_15[5] },
      { level: 7, wood: 19473, stone: 6644, gold: 42, timeSec: TIME_1_15[6] },
      { level: 8, wood: 41727, stone: 13909, gold: 48, timeSec: TIME_1_15[7] },
      { level: 9, wood: 113400, stone: 36818, gold: 54, timeSec: TIME_1_15[8] },
      { level: 10, wood: 282273, stone: 90818, gold: 60, timeSec: TIME_1_15[9] },
      { level: 11, wood: 622800, stone: 205200, gold: 66, timeSec: TIME_1_15[10] },
      { level: 12, wood: 1404000, stone: 464400, gold: 72, timeSec: TIME_1_15[11] },
      { level: 13, wood: 2808000, stone: 936000, gold: 78, timeSec: TIME_1_15[12] },
      { level: 14, wood: 5400000, stone: 1755000, gold: 84, timeSec: TIME_1_15[13] },
      { level: 15, wood: 11340000, stone: 3780000, gold: 90, timeSec: TIME_1_15[14] },
    ],
  },

  archery: {
    key: "archery",
    title: "Archery Guild",
    costs: [
      { level: 1, wood: 41, stone: 7, gold: 5, timeSec: TIME_1_15[0] },
      { level: 2, wood: 164, stone: 27, gold: 10, timeSec: TIME_1_15[1] },
      { level: 3, wood: 480, stone: 76, gold: 15, timeSec: TIME_1_15[2] },
      { level: 4, wood: 1200, stone: 182, gold: 20, timeSec: TIME_1_15[3] },
      { level: 5, wood: 2727, stone: 436, gold: 25, timeSec: TIME_1_15[4] },
      { level: 6, wood: 6545, stone: 1091, gold: 30, timeSec: TIME_1_15[5] },
      { level: 7, wood: 14636, stone: 2418, gold: 35, timeSec: TIME_1_15[6] },
      { level: 8, wood: 29673, stone: 5062, gold: 40, timeSec: TIME_1_15[7] },
      { level: 9, wood: 62591, stone: 10432, gold: 45, timeSec: TIME_1_15[8] },
      { level: 10, wood: 168000, stone: 27273, gold: 50, timeSec: TIME_1_15[9] },
      { level: 11, wood: 414000, stone: 66600, gold: 55, timeSec: TIME_1_15[10] },
      { level: 12, wood: 830400, stone: 136800, gold: 60, timeSec: TIME_1_15[11] },
      { level: 13, wood: 1872000, stone: 309600, gold: 65, timeSec: TIME_1_15[12] },
      { level: 14, wood: 3744000, stone: 624000, gold: 70, timeSec: TIME_1_15[13] },
      { level: 15, wood: 7200000, stone: 1170000, gold: 75, timeSec: TIME_1_15[14] },
    ],
  },

  fortifications: {
    key: "fortifications",
    title: "fortifications",
    costs: [
      { level: 1, wood: 30, stone: 13, gold: 15, timeSec: TIME_1_15[0] },
      { level: 2, wood: 120, stone: 53, gold: 30, timeSec: TIME_1_15[1] },
      { level: 3, wood: 352, stone: 149, gold: 45, timeSec: TIME_1_15[2] },
      { level: 4, wood: 880, stone: 356, gold: 60, timeSec: TIME_1_15[3] },
      { level: 5, wood: 2000, stone: 853, gold: 75, timeSec: TIME_1_15[4] },
      { level: 6, wood: 4800, stone: 2133, gold: 90, timeSec: TIME_1_15[5] },
      { level: 7, wood: 10733, stone: 4729, gold: 105, timeSec: TIME_1_15[6] },
      { level: 8, wood: 21760, stone: 9899, gold: 120, timeSec: TIME_1_15[7] },
      { level: 9, wood: 45900, stone: 20400, gold: 135, timeSec: TIME_1_15[8] },
      { level: 10, wood: 110880, stone: 48000, gold: 150, timeSec: TIME_1_15[9] },
      { level: 11, wood: 248400, stone: 106560, gold: 165, timeSec: TIME_1_15[10] },
      { level: 12, wood: 498240, stone: 218880, gold: 180, timeSec: TIME_1_15[11] },
      { level: 13, wood: 1123200, stone: 495360, gold: 195, timeSec: TIME_1_15[12] },
      { level: 14, wood: 2246400, stone: 998400, gold: 210, timeSec: TIME_1_15[13] },
      { level: 15, wood: 4320000, stone: 1872000, gold: 225, timeSec: TIME_1_15[14] },
      { level: 16, wood: 9072000, stone: 4032000, gold: 240, timeSec: TIME_16_20[0] },
      { level: 17, wood: 16410000, stone: 7200000, gold: 255, timeSec: TIME_16_20[1] },
      { level: 18, wood: 30000000, stone: 14000000, gold: 270, timeSec: TIME_16_20[2] },
      { level: 19, wood: 54000000, stone: 24000000, gold: 285, timeSec: TIME_16_20[3] },
      { level: 20, wood: 99000000, stone: 43200000, gold: 300, timeSec: TIME_16_20[4] },
    ],
  },
};
