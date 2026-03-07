import { extractPortraitFromSaveArray, parseSaveStringToArray } from "./extractPortrait";
import type {
  SfJsonAchievements,
  SfJsonBackpackItems,
  SfJsonCalendar,
  SfJsonCompanionItems,
  SfJsonDailyTaskReward,
  SfJsonDailyTaskTriplet,
  SfJsonDailyTasks,
  SfJsonDummyItems,
  SfJsonDungeons,
  SfJsonGroupTournament,
  SfJsonIdle,
  SfJsonModernItemSlot,
  SfJsonOwnPlayer,
  SfJsonParseResult,
  SfJsonPets,
  SfJsonResources,
  SfJsonScrapbook,
  SfJsonShopItems,
  SfJsonUnderworld,
  SfJsonUnits,
  SfJsonWitch,
  SfJsonWitchScroll,
  SfJsonEquippedItems,
} from "./types";

const DUNGEON_OPEN = -1;
const DUNGEON_LOCKED = -2;
const PLAYA_TO_INTERNAL_MAPPING = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
  29, 32, 33, 34, 35, 36,
];
const LEGACY_TO_INTERNAL_MAPPING = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17, 18];
const LEGACY_MISSING = [19, 20, 21, 22, 23];
const LEGACY_SPLIT_TO_INTERNAL_MAPPING: Array<[number, number]> = [
  [12, 27],
  [13, 24],
  [14, 25],
  [15, 26],
];
const MODERN_ITEM_CHUNK_SIZE = 19;
const EQUIPPED_ITEM_SLOT_NAMES = [
  "Head",
  "Body",
  "Hand",
  "Feet",
  "Neck",
  "Belt",
  "Ring",
  "Misc",
  "Wpn1",
  "Wpn2",
];
const SHOP_ITEM_SLOT_NAMES = ["Slot1", "Slot2", "Slot3", "Slot4", "Slot5", "Slot6"];

const parsePlayerIdFromIdentifier = (identifier: string): number | null => {
  const match = String(identifier ?? "").trim().match(/_p(\d+)$/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const toTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const toFiniteNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toFiniteNumberWithFallback = (value: unknown, fallback: number): number => {
  const parsed = toFiniteNumberOrNull(value);
  return parsed == null ? fallback : parsed;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const asNumberArray = (value: unknown): number[] | null => {
  if (!Array.isArray(value)) return null;
  return value.map((entry) => toFiniteNumberWithFallback(entry, 0));
};

const parseModernItemSlots = (
  values: number[],
  slotNames: string[],
): { slots: SfJsonModernItemSlot[]; remainder: number[] } => {
  const slots: SfJsonModernItemSlot[] = [];
  let cursor = 0;

  slotNames.forEach((slotName, slotIndex) => {
    if (cursor + MODERN_ITEM_CHUNK_SIZE > values.length) return;
    const chunk = values.slice(cursor, cursor + MODERN_ITEM_CHUNK_SIZE);
    const type = toFiniteNumberOrNull(chunk[0]);
    slots.push({
      slot: slotIndex + 1,
      name: slotName,
      values: chunk,
      type,
      nonEmpty: (type ?? 0) > 0,
    });
    cursor += MODERN_ITEM_CHUNK_SIZE;
  });

  return { slots, remainder: values.slice(cursor) };
};

const parseEquippedItems = (value: unknown): SfJsonEquippedItems | undefined => {
  const values = asNumberArray(value);
  if (!values || values.length === 0) return undefined;
  const parsed = parseModernItemSlots(values, EQUIPPED_ITEM_SLOT_NAMES);
  return {
    chunkSize: MODERN_ITEM_CHUNK_SIZE,
    slots: parsed.slots,
    remainder: parsed.remainder,
  };
};

const parseBackpackItems = (value: unknown): SfJsonBackpackItems | undefined => {
  const values = asNumberArray(value);
  if (!values || values.length === 0) return undefined;

  const slots: SfJsonBackpackItems["slots"] = [];
  let cursor = 0;
  for (let slotIndex = 0; slotIndex < 45; slotIndex += 1) {
    if (cursor + MODERN_ITEM_CHUNK_SIZE > values.length) break;
    const chunk = values.slice(cursor, cursor + MODERN_ITEM_CHUNK_SIZE);
    const type = toFiniteNumberOrNull(chunk[0]);
    slots.push({
      slot: slotIndex + 1,
      name: `Slot${slotIndex + 1}`,
      section: slotIndex >= 20 ? "chest" : "backpack",
      values: chunk,
      type,
      nonEmpty: (type ?? 0) > 0,
    });
    cursor += MODERN_ITEM_CHUNK_SIZE;
  }

  return {
    chunkSize: MODERN_ITEM_CHUNK_SIZE,
    slots,
    remainder: values.slice(cursor),
  };
};

const parseCompanionItems = (value: unknown): SfJsonCompanionItems | undefined => {
  const values = asNumberArray(value);
  if (!values || values.length === 0) return undefined;

  const parseGroup = (offset: number): SfJsonModernItemSlot[] => {
    const slots: SfJsonModernItemSlot[] = [];
    EQUIPPED_ITEM_SLOT_NAMES.forEach((slotName, slotIndex) => {
      const start = offset + slotIndex * MODERN_ITEM_CHUNK_SIZE;
      if (start + MODERN_ITEM_CHUNK_SIZE > values.length) return;
      const chunk = values.slice(start, start + MODERN_ITEM_CHUNK_SIZE);
      const type = toFiniteNumberOrNull(chunk[0]);
      slots.push({
        slot: slotIndex + 1,
        name: slotName,
        values: chunk,
        type,
        nonEmpty: (type ?? 0) > 0,
      });
    });
    return slots;
  };

  const bert = parseGroup(0);
  const mark = parseGroup(EQUIPPED_ITEM_SLOT_NAMES.length * MODERN_ITEM_CHUNK_SIZE);
  const kunigunde = parseGroup(EQUIPPED_ITEM_SLOT_NAMES.length * MODERN_ITEM_CHUNK_SIZE * 2);
  const consumed = (bert.length + mark.length + kunigunde.length) * MODERN_ITEM_CHUNK_SIZE;

  return {
    chunkSize: MODERN_ITEM_CHUNK_SIZE,
    bert,
    mark,
    kunigunde,
    remainder: values.slice(consumed),
  };
};

const parseDummyItems = (value: unknown): SfJsonDummyItems | undefined => {
  const values = asNumberArray(value);
  if (!values || values.length === 0) return undefined;
  const parsed = parseModernItemSlots(values, EQUIPPED_ITEM_SLOT_NAMES);
  return {
    chunkSize: MODERN_ITEM_CHUNK_SIZE,
    slots: parsed.slots,
    remainder: parsed.remainder,
  };
};

const parseShopItems = (value: unknown): SfJsonShopItems | undefined => {
  const values = asNumberArray(value);
  if (!values || values.length === 0) return undefined;
  const parsed = parseModernItemSlots(values, SHOP_ITEM_SLOT_NAMES);
  return {
    chunkSize: MODERN_ITEM_CHUNK_SIZE,
    slots: parsed.slots,
    remainder: parsed.remainder,
  };
};

const decodeScrapbook = (encoded: string): boolean[] => {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  if (typeof globalThis.atob !== "function") return [];

  try {
    const raw = globalThis.atob(padded);
    const decoded = new Array(raw.length * 8);
    for (let i = 0; i < raw.length; i += 1) {
      const char = raw.charCodeAt(i);
      for (let bit = 0; bit < 8; bit += 1) {
        decoded[i * 8 + bit] = (char & (1 << (7 - bit))) > 0;
      }
    }
    return decoded;
  } catch {
    return [];
  }
};

const parseScrapbook = (value: unknown): SfJsonScrapbook | undefined => {
  if (typeof value !== "string") return undefined;
  const encoded = value.trim();
  if (!encoded) return undefined;
  return {
    encoded,
    decoded: decodeScrapbook(encoded),
  };
};

const parsePets = (value: unknown): SfJsonPets | undefined => {
  const values = asNumberArray(value);
  if (!values || values.length === 0) return undefined;

  if (values.length >= 264) {
    const allLevels = values.slice(2, 102);
    return {
      source: "own",
      values,
      levels: {
        all: allLevels,
        shadow: allLevels.slice(0, 20),
        light: allLevels.slice(20, 40),
        earth: allLevels.slice(40, 60),
        fire: allLevels.slice(60, 80),
        water: allLevels.slice(80, 100),
      },
      totals: {
        totalCount: toFiniteNumberOrNull(values[103]),
        shadow: toFiniteNumberOrNull(values[104]),
        light: toFiniteNumberOrNull(values[105]),
        earth: toFiniteNumberOrNull(values[106]),
        fire: toFiniteNumberOrNull(values[107]),
        water: toFiniteNumberOrNull(values[108]),
      },
      dungeons: values.slice(210, 215),
      rank: toFiniteNumberOrNull(values[233]),
      honor: toFiniteNumberOrNull(values[234]),
      metal: toFiniteNumberOrNull(values[255]),
      crystals: toFiniteNumberOrNull(values[256]),
      foods: {
        shadow: toFiniteNumberOrNull(values[259]),
        light: toFiniteNumberOrNull(values[260]),
        earth: toFiniteNumberOrNull(values[261]),
        fire: toFiniteNumberOrNull(values[262]),
        water: toFiniteNumberOrNull(values[263]),
      },
    };
  }

  if (values.length >= 6) {
    return {
      source: "other",
      values,
      totals: {
        shadow: toFiniteNumberOrNull(values[1]),
        light: toFiniteNumberOrNull(values[2]),
        earth: toFiniteNumberOrNull(values[3]),
        fire: toFiniteNumberOrNull(values[4]),
        water: toFiniteNumberOrNull(values[5]),
      },
    };
  }

  return {
    source: "raw",
    values,
  };
};

const parseIdle = (value: unknown): SfJsonIdle | undefined => {
  const values = asNumberArray(value);
  if (!values || values.length === 0) return undefined;
  return {
    values,
    sacrifices: toFiniteNumberOrNull(values[2]),
    buildings: values.slice(3, 13),
    money: toFiniteNumberOrNull(values[73]),
    readyRunes: toFiniteNumberOrNull(values[75]),
    runes: toFiniteNumberOrNull(values[76]),
    upgrades: {
      speed: values.slice(43, 53),
      money: values.slice(53, 63),
      moneyIncreaseFlag: toFiniteNumberOrNull(values[77]),
    },
  };
};

const parseDailyTaskRewards = (value: unknown): SfJsonDailyTaskReward[] | undefined => {
  const values = asNumberArray(value);
  if (!values || values.length === 0) return undefined;

  const rewards: SfJsonDailyTaskReward[] = [];
  for (let index = 0; index + 4 < values.length; index += 5) {
    rewards.push({
      collected: toFiniteNumberWithFallback(values[index], 0) > 0,
      required: toFiniteNumberOrNull(values[index + 1]),
      resourceType: toFiniteNumberOrNull(values[index + 3]),
      resourceAmount: toFiniteNumberOrNull(values[index + 4]),
    });
  }
  return rewards.length > 0 ? rewards : undefined;
};

const parseDailyTasks = (value: unknown, rewardsValue: unknown): SfJsonDailyTasks | undefined => {
  const values = asNumberArray(value);
  if (!values || values.length === 0) return undefined;

  const triplets: SfJsonDailyTaskTriplet[] = [];
  for (let index = 0; index + 2 < values.length; index += 3) {
    triplets.push({
      index: Math.floor(index / 3),
      a: values[index],
      b: values[index + 1],
      c: values[index + 2],
    });
  }

  const rewards = parseDailyTaskRewards(rewardsValue);
  return rewards ? { values, triplets, rewards } : { values, triplets };
};

const parseAchievements = (value: unknown): SfJsonAchievements | undefined => {
  const values = asNumberArray(value);
  if (!values || values.length === 0) return undefined;

  const half = Math.trunc(values.length / 2);
  const maxEntries = Math.min(115, half);
  const entries = Array.from({ length: maxEntries }, (_, index) => ({
    index,
    owned: values[index] === 1,
    progress: toFiniteNumberWithFallback(values[index + half], 0),
  }));

  return {
    values,
    half,
    entries,
  };
};

const parseCalendar = (value: unknown): SfJsonCalendar | undefined => {
  const values = asNumberArray(value);
  if (!values || values.length === 0) return undefined;
  return { values };
};

const parseUnits = (value: unknown): SfJsonUnits | undefined => {
  const values = asNumberArray(value);
  if (!values || values.length === 0) return undefined;

  return {
    values,
    wall: toFiniteNumberOrNull(values[0]),
    warriors: toFiniteNumberOrNull(values[1]),
    mages: toFiniteNumberOrNull(values[2]),
    archers: toFiniteNumberOrNull(values[3]),
  };
};

const parseWitch = (
  value: unknown,
  offsetValue: unknown,
): SfJsonWitch | undefined => {
  const values = asNumberArray(value);
  if (!values || values.length === 0) return undefined;

  const offset = toFiniteNumberOrNull(offsetValue) ?? 0;
  const toOffsetTimestamp = (seconds: number | null): number | null =>
    seconds == null ? null : seconds * 1000 + offset;

  const scrolls: SfJsonWitchScroll[] = [];
  for (let index = 0; index < 9; index += 1) {
    const base = 8 + index * 3;
    if (base + 2 >= values.length) break;
    const picIndex = toFiniteNumberOrNull(values[base + 1]);
    const dateSeconds = toFiniteNumberOrNull(values[base + 2]);
    scrolls.push({
      index,
      picIndex,
      dateSeconds,
      date: toOffsetTimestamp(dateSeconds),
      type: picIndex == null ? null : picIndex % 1000,
    });
  }

  return {
    values,
    stage: toFiniteNumberOrNull(values[0]),
    items: toFiniteNumberOrNull(values[1]),
    itemsNext: toFiniteNumberOrNull(values[2]),
    item: toFiniteNumberOrNull(values[3]),
    finish: toOffsetTimestamp(toFiniteNumberOrNull(values[6])),
    scrolls,
  };
};

const parseFiniteNumber = (value: unknown): number | undefined => {
  const parsed = toFiniteNumberOrNull(value);
  return parsed == null ? undefined : parsed;
};

const parseWebshopId = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  return value;
};

type LegacyDungeonSource = {
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

const createLegacyDungeonSource = (raw: Record<string, unknown>): LegacyDungeonSource => {
  const normal = asNumberArray(raw.Normal) ?? asNumberArray(raw.normal) ?? [];
  const shadow = asNumberArray(raw.Shadow) ?? asNumberArray(raw.shadow) ?? [];

  return {
    normal,
    shadow,
    group: toFiniteNumberWithFallback(raw.Group ?? raw.group, 0),
    player: toFiniteNumberWithFallback(raw.Player ?? raw.player, 0),
    tower: toFiniteNumberWithFallback(raw.Tower ?? raw.tower, 0),
    twister: toFiniteNumberWithFallback(raw.Twister ?? raw.twister, 0),
    raid: toFiniteNumberWithFallback(raw.Raid ?? raw.raid, 0),
    youtube: toFiniteNumberWithFallback(raw.Youtube ?? raw.youtube, 0),
    sandstorm: toFiniteNumberWithFallback(raw.Sandstorm ?? raw.sandstorm, DUNGEON_LOCKED),
  };
};

const hasLegacyDungeonInput = (legacy: LegacyDungeonSource): boolean =>
  legacy.normal.length > 0 ||
  legacy.shadow.length > 0 ||
  legacy.group !== 0 ||
  legacy.player !== 0 ||
  legacy.tower !== 0 ||
  legacy.twister !== 0 ||
  legacy.raid !== 0 ||
  legacy.youtube !== 0 ||
  legacy.sandstorm !== DUNGEON_LOCKED;

const parseDungeons = (value: unknown): SfJsonDungeons | undefined => {
  const raw = asRecord(value);
  if (!raw) return undefined;

  const legacy = createLegacyDungeonSource(raw);
  const light = asNumberArray(raw.light);
  const shadow = asNumberArray(raw.shadow);

  if (light && shadow) {
    const normalizedNormal: number[] = [];
    const normalizedShadow: number[] = [];

    PLAYA_TO_INTERNAL_MAPPING.forEach((playaIndex, internalIndex) => {
      normalizedNormal[internalIndex] = toFiniteNumberWithFallback(light[playaIndex], DUNGEON_LOCKED);
      normalizedShadow[internalIndex] = toFiniteNumberWithFallback(shadow[playaIndex], DUNGEON_LOCKED);
    });

    return {
      source: "modern",
      normal: normalizedNormal,
      shadow: normalizedShadow,
      group: legacy.group || 0,
      player: toFiniteNumberWithFallback(light[17], DUNGEON_LOCKED),
      tower: toFiniteNumberWithFallback(light[14], DUNGEON_OPEN),
      twister: toFiniteNumberWithFallback(shadow[14], DUNGEON_OPEN),
      raid: legacy.raid || 0,
      youtube: toFiniteNumberWithFallback(shadow[17], DUNGEON_LOCKED),
      sandstorm: toFiniteNumberWithFallback(light[31], DUNGEON_LOCKED),
    };
  }

  if (!hasLegacyDungeonInput(legacy)) return undefined;

  const normalizedNormal: number[] = [];
  const normalizedShadow: number[] = [];

  LEGACY_TO_INTERNAL_MAPPING.forEach((dungeonIndex) => {
    normalizedNormal[dungeonIndex] = toFiniteNumberWithFallback(legacy.normal[dungeonIndex], 0) + DUNGEON_LOCKED;
    normalizedShadow[dungeonIndex] = toFiniteNumberWithFallback(legacy.shadow[dungeonIndex], 0) + DUNGEON_LOCKED;
  });

  LEGACY_MISSING.forEach((dungeonIndex) => {
    normalizedNormal[dungeonIndex] = DUNGEON_LOCKED;
    normalizedShadow[dungeonIndex] = DUNGEON_LOCKED;
  });

  LEGACY_SPLIT_TO_INTERNAL_MAPPING.forEach(([sourceDungeon, targetDungeon]) => {
    const normalValue = toFiniteNumberWithFallback(legacy.normal[sourceDungeon], 0) + DUNGEON_LOCKED;
    normalizedNormal[sourceDungeon] = Math.min(normalValue, 10);
    normalizedNormal[targetDungeon] = normalValue >= 10 ? normalValue - 10 : DUNGEON_LOCKED;

    const shadowValue = toFiniteNumberWithFallback(legacy.shadow[sourceDungeon], 0) + DUNGEON_LOCKED;
    normalizedShadow[sourceDungeon] = Math.min(shadowValue, 10);
    normalizedShadow[targetDungeon] = shadowValue >= 10 ? shadowValue - 10 : DUNGEON_LOCKED;
  });

  return {
    source: "legacy",
    normal: normalizedNormal,
    shadow: normalizedShadow,
    group: legacy.group || 0,
    player: legacy.player || 0,
    tower: legacy.tower || 0,
    twister: (legacy.twister || 0) + DUNGEON_LOCKED,
    raid: legacy.raid || 0,
    youtube: (legacy.youtube || 0) + DUNGEON_LOCKED,
    sandstorm: legacy.sandstorm,
  };
};

const parseGroupTournament = (value: unknown): SfJsonGroupTournament | undefined => {
  const raw = asRecord(value);
  if (!raw) return undefined;

  const parsed: SfJsonGroupTournament = {
    tokens: toFiniteNumberOrNull(raw.tokens),
    floor: toFiniteNumberOrNull(raw.floor),
    floorMax: toFiniteNumberOrNull(raw.floor_max ?? raw.floorMax),
    rank: toFiniteNumberOrNull(raw.rank),
  };

  const hasData = Object.values(parsed).some((entry) => entry != null);
  return hasData ? parsed : undefined;
};

const parseResources = (value: unknown): SfJsonResources | undefined => {
  const raw = asNumberArray(value);
  if (!raw || raw.length < 2) return undefined;

  const resources: SfJsonResources = {
    mushrooms: toFiniteNumberOrNull(raw[1]),
    gold: toFiniteNumberOrNull(raw[2]),
    coins: toFiniteNumberOrNull(raw[3]),
    hourglass: toFiniteNumberOrNull(raw[4]),
    wood: toFiniteNumberOrNull(raw[5]),
    secretWood: toFiniteNumberOrNull(raw[6]),
    stone: toFiniteNumberOrNull(raw[7]),
    secretStone: toFiniteNumberOrNull(raw[8]),
    metal: toFiniteNumberOrNull(raw[9]),
    crystals: toFiniteNumberOrNull(raw[10]),
    souls: toFiniteNumberOrNull(raw[11]),
    shadowFood: toFiniteNumberOrNull(raw[12]),
    lightFood: toFiniteNumberOrNull(raw[13]),
    earthFood: toFiniteNumberOrNull(raw[14]),
    fireFood: toFiniteNumberOrNull(raw[15]),
    waterFood: toFiniteNumberOrNull(raw[16]),
  };

  const hasData = Object.values(resources).some((entry) => entry != null);
  return hasData ? resources : undefined;
};

const parseUnderworldFromTower = (
  towerValue: unknown,
  resources: SfJsonResources | undefined,
  offsetValue: unknown,
): SfJsonUnderworld | undefined => {
  const tower = asNumberArray(towerValue);
  if (!tower || tower.length === 0) return undefined;

  const towerSegment = tower.slice(448);
  const toSegmentNumber = (index: number): number | null => toFiniteNumberOrNull(towerSegment[index]);
  const offset = toFiniteNumberOrNull(offsetValue) ?? 0;
  const toTimestamp = (seconds: number | null): number | null => (seconds == null ? null : seconds * 1000 + offset);

  const soulsRaw = toSegmentNumber(10);
  const underworld: SfJsonUnderworld = {
    goblinUpgrades: toFiniteNumberOrNull(tower[146]),
    trollUpgrades: toFiniteNumberOrNull(tower[294]),
    keeperUpgrades: toFiniteNumberOrNull(tower[442]),
    heart: toSegmentNumber(0),
    gate: toSegmentNumber(1),
    goldPit: toSegmentNumber(2),
    extractor: toSegmentNumber(3),
    goblinPit: toSegmentNumber(4),
    torture: toSegmentNumber(5),
    trollBlock: toSegmentNumber(7),
    timeMachine: toSegmentNumber(8),
    keeper: toSegmentNumber(9),
    souls: soulsRaw ?? resources?.souls ?? null,
    extractorSouls: toSegmentNumber(11),
    extractorMax: toSegmentNumber(12),
    maxSouls: toSegmentNumber(13),
    extractorHourly: toSegmentNumber(15),
    goldPitGold: (() => {
      const value = toSegmentNumber(16);
      return value == null ? null : value / 100;
    })(),
    goldPitMax: (() => {
      const value = toSegmentNumber(17);
      return value == null ? null : value / 100;
    })(),
    goldPitHourly: (() => {
      const value = toSegmentNumber(18);
      return value == null ? null : value / 100;
    })(),
    upgrade: {
      building: (() => {
        const value = toSegmentNumber(20);
        return value == null ? null : value - 1;
      })(),
      finish: toTimestamp(toSegmentNumber(21)),
      start: toTimestamp(toSegmentNumber(22)),
    },
    timeMachineThirst: toSegmentNumber(25),
    timeMachineMax: toSegmentNumber(26),
    timeMachineDaily: toSegmentNumber(27),
  };

  const hasData =
    Object.entries(underworld).some(([key, entry]) => {
      if (key === "upgrade") {
        const upgrade = entry as SfJsonUnderworld["upgrade"];
        return upgrade.building != null || upgrade.finish != null || upgrade.start != null;
      }
      return entry != null;
    }) || false;

  return hasData ? underworld : undefined;
};

const toOwnPlayer = (player: unknown): SfJsonOwnPlayer | null => {
  if (!player || typeof player !== "object") return null;
  const raw = player as Record<string, unknown>;
  if (raw.own !== 1) return null;

  const identifier = toTrimmedString(raw.identifier);
  const server = toTrimmedString(raw.prefix);
  if (!identifier || !server) return null;

  const playerId = parsePlayerIdFromIdentifier(identifier);
  if (playerId == null) return null;

  const saveField = raw.save ?? raw.playerSave;
  const saveArray = Array.isArray(saveField) ? (saveField as number[]) : undefined;
  const saveString =
    typeof saveField === "string"
      ? saveField
      : typeof raw.saveString === "string"
        ? raw.saveString
        : undefined;
  const name = toTrimmedString(raw.name);
  const description = typeof raw.description === "string" ? raw.description : undefined;
  const guildName =
    toTrimmedString(raw.guildName) ?? (typeof raw.group === "string" ? raw.group : undefined);
  const dungeons = parseDungeons(raw.dungeons);
  const groupTournament = parseGroupTournament(raw.gtsave);
  const resources = parseResources(raw.resources);
  const underworld = parseUnderworldFromTower(raw.tower, resources, raw.offset);
  const equippedItems = parseEquippedItems(raw.equippedItems);
  const backpackItems = parseBackpackItems(raw.backpackItems);
  const companionItems = parseCompanionItems(raw.companionItems);
  const dummyItems = parseDummyItems(raw.dummyItems);
  const shakesItems = parseShopItems(raw.shakesItems);
  const fidgetItems = parseShopItems(raw.fidgetItems);
  const pets = parsePets(raw.pets);
  const scrapbook = parseScrapbook(raw.scrapbook);
  const legendaryScrapbook = parseScrapbook(raw.scrapbook_legendary);
  const idle = parseIdle(raw.idle);
  const dailyTasks = parseDailyTasks(raw.dailyTasks, raw.dailyTasksRewards);
  const achievements = parseAchievements(raw.achievements);
  const calendar = parseCalendar(raw.calendar);
  const units = parseUnits(raw.units);
  const witch = parseWitch(raw.witch, raw.offset);
  const timestamp = parseFiniteNumber(raw.timestamp);
  const fortressRank = parseFiniteNumber(raw.fortressrank);
  const version = parseFiniteNumber(raw.version);
  const webshopId = parseWebshopId(raw.webshopid);

  let portrait = null;
  if (saveArray && saveArray.length > 0) {
    portrait = extractPortraitFromSaveArray(saveArray);
  } else if (saveString) {
    const parsedSave = parseSaveStringToArray(saveString);
    if (parsedSave.length > 0) {
      portrait = extractPortraitFromSaveArray(parsedSave);
    }
  }

  return {
    identifier,
    playerId,
    server,
    portrait,
    saveArray,
    saveString,
    name,
    ...(description != null ? { description } : {}),
    guildName,
    ...(dungeons ? { dungeons } : {}),
    ...(groupTournament ? { groupTournament } : {}),
    ...(resources ? { resources } : {}),
    ...(underworld ? { underworld } : {}),
    ...(equippedItems ? { equippedItems } : {}),
    ...(backpackItems ? { backpackItems } : {}),
    ...(companionItems ? { companionItems } : {}),
    ...(dummyItems ? { dummyItems } : {}),
    ...(shakesItems ? { shakesItems } : {}),
    ...(fidgetItems ? { fidgetItems } : {}),
    ...(pets ? { pets } : {}),
    ...(scrapbook ? { scrapbook } : {}),
    ...(legendaryScrapbook ? { legendaryScrapbook } : {}),
    ...(idle ? { idle } : {}),
    ...(dailyTasks ? { dailyTasks } : {}),
    ...(achievements ? { achievements } : {}),
    ...(calendar ? { calendar } : {}),
    ...(units ? { units } : {}),
    ...(witch ? { witch } : {}),
    ...(timestamp != null ? { timestamp } : {}),
    ...(fortressRank != null ? { fortressRank } : {}),
    ...(version != null ? { version } : {}),
    ...(webshopId != null ? { webshopId } : {}),
  };
};

export const parseSfJson = (input: string | unknown): SfJsonParseResult => {
  const parsed = typeof input === "string" ? JSON.parse(input) : input;
  const players = Array.isArray((parsed as any)?.players)
    ? (((parsed as any).players as unknown[]) ?? [])
    : [];
  const ownPlayers = players.map(toOwnPlayer).filter((entry): entry is SfJsonOwnPlayer => Boolean(entry));

  return {
    ownPlayers,
    ownPlayer: ownPlayers[0] ?? null,
    playersCount: players.length,
  };
};
