export type SfJsonPortrait = {
  genderName: "male" | "female";
  classId: number;
  raceId: number;
  mouth: number;
  hair: number;
  hairColor: number;
  horn: number;
  hornColor: number;
  brows: number;
  eyes: number;
  beard: number;
  nose: number;
  ears: number;
  extra: number;
  special: number;
  frameId: number;
};

export type SfJsonDungeons = {
  source: "modern" | "legacy";
  normal: number[];
  shadow: number[];
  group: number;
  player: number;
  tower: number;
  twister: number;
  raid: number;
  youtube: number;
  sandstorm: number;
};

export type SfJsonGroupTournament = {
  tokens: number | null;
  floor: number | null;
  floorMax: number | null;
  rank: number | null;
};

export type SfJsonResources = {
  mushrooms: number | null;
  gold: number | null;
  coins: number | null;
  hourglass: number | null;
  wood: number | null;
  secretWood: number | null;
  stone: number | null;
  secretStone: number | null;
  metal: number | null;
  crystals: number | null;
  souls: number | null;
  shadowFood: number | null;
  lightFood: number | null;
  earthFood: number | null;
  fireFood: number | null;
  waterFood: number | null;
};

export type SfJsonUnderworld = {
  goblinUpgrades: number | null;
  trollUpgrades: number | null;
  keeperUpgrades: number | null;
  heart: number | null;
  gate: number | null;
  goldPit: number | null;
  extractor: number | null;
  goblinPit: number | null;
  torture: number | null;
  trollBlock: number | null;
  timeMachine: number | null;
  keeper: number | null;
  souls: number | null;
  extractorSouls: number | null;
  extractorMax: number | null;
  maxSouls: number | null;
  extractorHourly: number | null;
  goldPitGold: number | null;
  goldPitMax: number | null;
  goldPitHourly: number | null;
  upgrade: {
    building: number | null;
    finish: number | null;
    start: number | null;
  };
  timeMachineThirst: number | null;
  timeMachineMax: number | null;
  timeMachineDaily: number | null;
};

export type SfJsonModernItemSlot = {
  slot: number;
  name: string;
  values: number[];
  type: number | null;
  nonEmpty: boolean;
};

export type SfJsonEquippedItems = {
  chunkSize: 19;
  slots: SfJsonModernItemSlot[];
  remainder: number[];
};

export type SfJsonBackpackItemSlot = SfJsonModernItemSlot & {
  section: "backpack" | "chest";
};

export type SfJsonBackpackItems = {
  chunkSize: 19;
  slots: SfJsonBackpackItemSlot[];
  remainder: number[];
};

export type SfJsonCompanionItems = {
  chunkSize: 19;
  bert: SfJsonModernItemSlot[];
  mark: SfJsonModernItemSlot[];
  kunigunde: SfJsonModernItemSlot[];
  remainder: number[];
};

export type SfJsonDummyItems = {
  chunkSize: 19;
  slots: SfJsonModernItemSlot[];
  remainder: number[];
};

export type SfJsonShopItems = {
  chunkSize: 19;
  slots: SfJsonModernItemSlot[];
  remainder: number[];
};

export type SfJsonPets =
  | {
      source: "own";
      values: number[];
      levels: {
        all: number[];
        shadow: number[];
        light: number[];
        earth: number[];
        fire: number[];
        water: number[];
      };
      totals: {
        totalCount: number | null;
        shadow: number | null;
        light: number | null;
        earth: number | null;
        fire: number | null;
        water: number | null;
      };
      dungeons: number[];
      rank: number | null;
      honor: number | null;
      metal: number | null;
      crystals: number | null;
      foods: {
        shadow: number | null;
        light: number | null;
        earth: number | null;
        fire: number | null;
        water: number | null;
      };
    }
  | {
      source: "other";
      values: number[];
      totals: {
        shadow: number | null;
        light: number | null;
        earth: number | null;
        fire: number | null;
        water: number | null;
      };
    }
  | {
      source: "raw";
      values: number[];
    };

export type SfJsonScrapbook = {
  encoded: string;
  decoded: boolean[];
};

export type SfJsonIdle = {
  values: number[];
  sacrifices: number | null;
  buildings: number[];
  money: number | null;
  readyRunes: number | null;
  runes: number | null;
  upgrades: {
    speed: number[];
    money: number[];
    moneyIncreaseFlag: number | null;
  };
};

export type SfJsonDailyTaskTriplet = {
  index: number;
  a: number;
  b: number;
  c: number;
};

export type SfJsonDailyTaskReward = {
  collected: boolean;
  required: number | null;
  resourceType: number | null;
  resourceAmount: number | null;
};

export type SfJsonDailyTasks = {
  values: number[];
  triplets: SfJsonDailyTaskTriplet[];
  rewards?: SfJsonDailyTaskReward[];
};

export type SfJsonAchievementEntry = {
  index: number;
  owned: boolean;
  progress: number;
};

export type SfJsonAchievements = {
  values: number[];
  half: number;
  entries: SfJsonAchievementEntry[];
};

export type SfJsonCalendar = {
  values: number[];
};

export type SfJsonUnits = {
  values: number[];
  wall: number | null;
  warriors: number | null;
  mages: number | null;
  archers: number | null;
};

export type SfJsonWitchScroll = {
  index: number;
  picIndex: number | null;
  dateSeconds: number | null;
  date: number | null;
  type: number | null;
};

export type SfJsonWitch = {
  values: number[];
  stage: number | null;
  items: number | null;
  itemsNext: number | null;
  item: number | null;
  finish: number | null;
  scrolls: SfJsonWitchScroll[];
};

export type SfJsonOwnPlayer = {
  identifier: string;
  playerId: number;
  server: string;
  portrait: SfJsonPortrait | null;
  saveArray?: number[];
  saveString?: string;
  name?: string;
  description?: string;
  guildName?: string;
  dungeons?: SfJsonDungeons;
  groupTournament?: SfJsonGroupTournament;
  resources?: SfJsonResources;
  underworld?: SfJsonUnderworld;
  equippedItems?: SfJsonEquippedItems;
  backpackItems?: SfJsonBackpackItems;
  companionItems?: SfJsonCompanionItems;
  dummyItems?: SfJsonDummyItems;
  shakesItems?: SfJsonShopItems;
  fidgetItems?: SfJsonShopItems;
  pets?: SfJsonPets;
  scrapbook?: SfJsonScrapbook;
  legendaryScrapbook?: SfJsonScrapbook;
  idle?: SfJsonIdle;
  dailyTasks?: SfJsonDailyTasks;
  achievements?: SfJsonAchievements;
  calendar?: SfJsonCalendar;
  units?: SfJsonUnits;
  witch?: SfJsonWitch;
  timestamp?: number;
  fortressRank?: number;
  version?: number;
  webshopId?: string;
};

export type SfJsonParseResult = {
  ownPlayers: SfJsonOwnPlayer[];
  ownPlayer: SfJsonOwnPlayer | null;
  playersCount: number;
};
