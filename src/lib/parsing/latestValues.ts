export type LatestValuesMap = Record<string, unknown>;

export type AttributeCode = "str" | "dex" | "int" | "con" | "lck";

export type AttributeCompositionBreakdown = {
  baseItems: number | null;
  upgrades: number | null;
  equipment: number | null;
  gems: number | null;
  pet: number | null;
  potion: number | null;
  items: number | null;
  petBonus: number | null;
};

export type AttributeCompositionItem = {
  code: AttributeCode;
  total: number | null;
  base: number | null;
  bonus: number | null;
  breakdown: AttributeCompositionBreakdown;
};

export type LatestValuesStatsModel = {
  combat: {
    armor: number | null;
    dmgMin: number | null;
    dmgMax: number | null;
    dmgAvg: number | null;
    health: number | null;
    weaponDamageMultiplier: number | null;
    maximumDamageReduction: number | null;
  };
  attributeComposition: AttributeCompositionItem[];
  runes: {
    gold: number | null;
    xp: number | null;
    chance: number | null;
    quality: number | null;
    health: number | null;
    damage: number | null;
    resist: number | null;
  };
  resistances: {
    fireResist: number | null;
    coldResist: number | null;
    lightningResist: number | null;
    fireDamage: number | null;
    coldDamage: number | null;
    lightningDamage: number | null;
  };
  potions: {
    slots: Array<{
      slot: 1 | 2 | 3;
      type: string | null;
      size: number | null;
    }>;
    lifePotion: boolean | null;
  };
  fortress: {
    meta: {
      fortress: number | null;
      upgrades: number | null;
      fortifications: number | null;
      wall: number | null;
      space: number | null;
      quarters: number | null;
      portal: number | null;
    };
    buildings: {
      woodcutter: number | null;
      quarry: number | null;
      gemMine: number | null;
      academy: number | null;
      smithy: number | null;
      treasury: number | null;
      barracks: number | null;
      mageTower: number | null;
      archeryGuild: number | null;
    };
    rank: number | null;
    honor: number | null;
  };
  guildMeta: {
    guild: string | null;
    guildIdentifier: string | null;
    role: string | null;
    guildJoined: string | null;
    guildPortal: number | null;
  };
  optionalProgress: {
    raids: {
      raids: number | null;
      raidHonor: number | null;
      raidWood: number | null;
      raidStone: number | null;
    };
    xp: {
      xp: number | null;
      xpRequired: number | null;
      xpTotal: number | null;
    };
  };
  advanced: {
    entries: Array<{
      key: string;
      value: string | number | boolean | null;
    }>;
  };
};

type ValueLookup = {
  exact: Map<string, unknown>;
  canonical: Map<string, unknown>;
  get(keys: string[]): unknown;
  text(keys: string[]): string | null;
  number(keys: string[]): number | null;
  boolYesNo(keys: string[]): boolean | null;
};

const ATTRIBUTE_CONFIG: Array<{ code: AttributeCode; total: string; base: string }> = [
  { code: "str", total: "Strength", base: "Base Strength" },
  { code: "dex", total: "Dexterity", base: "Base Dexterity" },
  { code: "int", total: "Intelligence", base: "Base Intelligence" },
  { code: "con", total: "Constitution", base: "Base Constitution" },
  { code: "lck", total: "Luck", base: "Base Luck" },
];

const EMPTY_MARKERS = new Set(["", "?", "-", "--", "n/a", "na", "null", "undefined"]);

const canonicalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

const MAIN_ATTRIBUTE_BY_CLASS_NAME: Record<string, AttributeCode> = {
  warrior: "str",
  mage: "int",
  scout: "dex",
  assassin: "dex",
  demonhunter: "dex",
  berserker: "str",
  battlemage: "str",
  druid: "int",
  bard: "int",
  necromancer: "int",
  paladin: "str",
  plaguedoctor: "dex",
};

const getMainAttributeCodeForClassName = (className: string | null): AttributeCode | null => {
  if (!className) return null;
  return MAIN_ATTRIBUTE_BY_CLASS_NAME[canonicalizeKey(className)] ?? null;
};

const normalizeDisplayString = (value: unknown): string | null => {
  if (value == null) return null;
  const raw = String(value).replace(/\u00a0/g, " ").trim();
  if (!raw) return null;
  if (EMPTY_MARKERS.has(raw.toLowerCase())) return null;
  return raw;
};

export const parseNumberLoose = (value: unknown): number | null => {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const raw = normalizeDisplayString(value);
  if (!raw) return null;

  const withoutPercent = raw.replace(/%/g, "").replace(/\s+/g, "");
  if (!withoutPercent) return null;

  // Keep scientific notation intact.
  if (/^[+-]?(?:\d+(?:[.,]\d+)?|\d*[.,]\d+)[eE][+-]?\d+$/.test(withoutPercent)) {
    const sci = withoutPercent.replace(",", ".");
    const num = Number(sci);
    return Number.isFinite(num) ? num : null;
  }

  if (/^[+-]?\d+$/.test(withoutPercent)) {
    const num = Number(withoutPercent);
    return Number.isFinite(num) ? num : null;
  }

  let sign = "";
  let unsigned = withoutPercent;
  if (/^[+-]/.test(unsigned)) {
    sign = unsigned.slice(0, 1);
    unsigned = unsigned.slice(1);
  }

  const commas = (unsigned.match(/,/g) || []).length;
  const dots = (unsigned.match(/\./g) || []).length;
  const lastComma = unsigned.lastIndexOf(",");
  const lastDot = unsigned.lastIndexOf(".");
  const lastSepPos = Math.max(lastComma, lastDot);

  let normalized = "";
  if (lastSepPos >= 0) {
    const sep = unsigned[lastSepPos];
    const left = unsigned.slice(0, lastSepPos);
    const right = unsigned.slice(lastSepPos + 1);
    const leftDigits = left.replace(/[.,]/g, "");
    const rightDigits = right.replace(/[.,]/g, "");
    const singleSeparator = commas + dots === 1;
    const treatAsDecimal = singleSeparator
      ? rightDigits.length > 0 && rightDigits.length <= 2
      : (sep === "," ? commas : dots) === 1 && rightDigits.length > 0 && rightDigits.length <= 2;

    normalized = treatAsDecimal ? `${leftDigits}.${rightDigits}` : `${leftDigits}${rightDigits}`;
  } else {
    normalized = unsigned;
  }

  normalized = normalized.replace(/[^0-9.]/g, "");
  if (!normalized || normalized === ".") return null;
  const num = Number(`${sign}${normalized}`);
  return Number.isFinite(num) ? num : null;
};

export const parseBoolYesNo = (value: unknown): boolean | null => {
  const raw = normalizeDisplayString(value);
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (normalized === "yes" || normalized === "true" || normalized === "ja") return true;
  if (normalized === "no" || normalized === "false" || normalized === "nein") return false;
  return null;
};

export const parseDateTimeLoose = (value: unknown): string | null => normalizeDisplayString(value);

const createValueLookup = (values: LatestValuesMap): ValueLookup => {
  const exact = new Map<string, unknown>();
  const canonical = new Map<string, unknown>();

  Object.entries(values || {}).forEach(([key, value]) => {
    exact.set(key, value);
    canonical.set(canonicalizeKey(key), value);
  });

  const get = (keys: string[]) => {
    for (const key of keys) {
      if (exact.has(key)) return exact.get(key);
      const canonicalKey = canonicalizeKey(key);
      if (canonical.has(canonicalKey)) return canonical.get(canonicalKey);
    }
    return undefined;
  };

  return {
    exact,
    canonical,
    get,
    text(keys) {
      return normalizeDisplayString(get(keys));
    },
    number(keys) {
      return parseNumberLoose(get(keys));
    },
    boolYesNo(keys) {
      return parseBoolYesNo(get(keys));
    },
  };
};

const parseAdvancedValue = (key: string, value: unknown): string | number | boolean | null => {
  const bool = parseBoolYesNo(value);
  if (bool != null) return bool;

  if (/(timestamp|active|joined|date|scan)/i.test(key)) {
    const text = parseDateTimeLoose(value);
    if (text != null) return text;
  }

  const num = parseNumberLoose(value);
  if (num != null) return num;

  return normalizeDisplayString(value);
};

export const buildStatsModelFromLatestValues = (values: LatestValuesMap): LatestValuesStatsModel => {
  const lookup = createValueLookup(values || {});
  const className = lookup.text(["Class", "Class Name", "class", "className"]);
  const mainAttributeCode = getMainAttributeCodeForClassName(className);
  const genericBase = lookup.number(["Base"]);

  const combat = {
    armor: lookup.number(["Armor"]),
    dmgMin: lookup.number(["Damage Min"]),
    dmgMax: lookup.number(["Damage Max"]),
    dmgAvg: lookup.number(["Damage Avg"]),
    health: lookup.number(["Health"]),
    weaponDamageMultiplier: lookup.number(["Weapon Damage Multiplier"]),
    maximumDamageReduction: lookup.number(["Maximum Damage Reduction"]),
  };
  if (combat.dmgAvg == null && combat.dmgMin != null && combat.dmgMax != null) {
    combat.dmgAvg = (combat.dmgMin + combat.dmgMax) / 2;
  }

  const attributeComposition: AttributeCompositionItem[] = ATTRIBUTE_CONFIG.map((entry) => {
    const total = lookup.number([entry.total]);
    const specificBase = lookup.number([entry.base]);
    const base =
      specificBase != null ? specificBase : mainAttributeCode === entry.code && genericBase != null ? genericBase : null;
    const breakdown: AttributeCompositionBreakdown = {
      baseItems: lookup.number([`${entry.total} Base Items`]),
      upgrades: lookup.number([`${entry.total} Upgrades`]),
      equipment: lookup.number([`${entry.total} Equipment`]),
      gems: lookup.number([`${entry.total} Gems`]),
      pet: lookup.number([`${entry.total} Pet`]),
      potion: lookup.number([`${entry.total} Potion`]),
      items: lookup.number([`${entry.total} Items`]),
      petBonus: lookup.number([`${entry.total} Pet Bonus`]),
    };
    const bonus = total != null && base != null ? total - base : null;
    return { code: entry.code, total, base, bonus, breakdown };
  });

  const runes = {
    gold: lookup.number(["Rune Gold"]),
    xp: lookup.number(["Rune XP"]),
    chance: lookup.number(["Rune Chance"]),
    quality: lookup.number(["Rune Quality"]),
    health: lookup.number(["Rune Health"]),
    damage: lookup.number(["Rune Damage"]),
    resist: lookup.number(["Rune Resist"]),
  };

  const resistances = {
    fireResist: lookup.number(["Fire Resist"]),
    coldResist: lookup.number(["Cold Resist"]),
    lightningResist: lookup.number(["Lightning Resist"]),
    fireDamage: lookup.number(["Fire Damage"]),
    coldDamage: lookup.number(["Cold Damage"]),
    lightningDamage: lookup.number(["Lightning Damage"]),
  };
  if (resistances.fireDamage != null && resistances.fireDamage <= 0) resistances.fireDamage = null;
  if (resistances.coldDamage != null && resistances.coldDamage <= 0) resistances.coldDamage = null;
  if (resistances.lightningDamage != null && resistances.lightningDamage <= 0) resistances.lightningDamage = null;

  const potions = {
    slots: [1, 2, 3].map((slot) => ({
      slot: slot as 1 | 2 | 3,
      type: lookup.text([`Potion ${slot} Type`]),
      size: lookup.number([`Potion ${slot} Size`]),
    })),
    lifePotion: lookup.boolYesNo(["Life Potion"]),
  };

  const fortress = {
    meta: {
      fortress: lookup.number(["Fortress"]),
      upgrades: lookup.number(["Upgrades"]),
      fortifications: lookup.number(["Fortifications"]),
      wall: lookup.number(["Wall"]),
      space: lookup.number(["Space"]),
      quarters: lookup.number(["Quarters"]),
      portal: lookup.number(["Portal"]),
    },
    buildings: {
      woodcutter: lookup.number(["Woodcutter"]),
      quarry: lookup.number(["Quarry"]),
      gemMine: lookup.number(["Gem Mine"]),
      academy: lookup.number(["Academy"]),
      smithy: lookup.number(["Smithy"]),
      treasury: lookup.number(["Treasury"]),
      barracks: lookup.number(["Barracks"]),
      mageTower: lookup.number(["Mage Tower"]),
      archeryGuild: lookup.number(["Archery Guild"]),
    },
    rank: lookup.number(["Fortress Rank"]),
    honor: lookup.number(["Fortress Honor"]),
  };

  const guildMeta = {
    guild: lookup.text(["Guild"]),
    guildIdentifier: lookup.text(["Guild Identifier"]),
    role: lookup.text(["Role", "Guild Role"]),
    guildJoined: parseDateTimeLoose(lookup.get(["Guild Joined"])),
    guildPortal: lookup.number(["Guild Portal"]),
  };

  const optionalProgress = {
    raids: {
      raids: lookup.number(["Raids"]),
      raidHonor: lookup.number(["Raid Honor"]),
      raidWood: lookup.number(["Raid Wood"]),
      raidStone: lookup.number(["Raid Stone"]),
    },
    xp: {
      xp: lookup.number(["XP"]),
      xpRequired: lookup.number(["XP Required"]),
      xpTotal: lookup.number(["XP Total"]),
    },
  };

  const advancedDirectKeys = [
    "ID",
    "Identifier",
    "Prefix",
    "Server",
    "Server ID",
    "Timestamp",
    "timestampRaw",
    "Last Active",
    "Power",
    "Registered",
    "Webshop",
    "Attribute Type",
    "Attribute Size",
    "Runes",
    "Runes: e33",
  ];
  const advancedPatternAllow = [
    /index/i,
    /^attribute\s+(type|size)/i,
    /^runes?:/i,
    /(identifier|prefix|server id|timestamp|last active|power|registered|webshop)/i,
  ];
  const advancedSeen = new Set<string>();
  const advancedEntries: Array<{ key: string; value: string | number | boolean | null }> = [];

  for (const key of advancedDirectKeys) {
    const raw = lookup.get([key]);
    if (raw === undefined) continue;
    const parsed = parseAdvancedValue(key, raw);
    if (parsed == null) continue;
    advancedEntries.push({ key, value: parsed });
    advancedSeen.add(canonicalizeKey(key));
  }

  Object.entries(values || {}).forEach(([key, raw]) => {
    const canonicalKey = canonicalizeKey(key);
    if (advancedSeen.has(canonicalKey)) return;
    if (!advancedPatternAllow.some((pattern) => pattern.test(key))) return;
    const parsed = parseAdvancedValue(key, raw);
    if (parsed == null) return;
    advancedEntries.push({ key, value: parsed });
    advancedSeen.add(canonicalKey);
  });

  advancedEntries.sort((a, b) => a.key.localeCompare(b.key));

  const model: LatestValuesStatsModel = {
    combat,
    attributeComposition,
    runes,
    resistances,
    potions,
    fortress,
    guildMeta,
    optionalProgress,
    advanced: {
      entries: advancedEntries,
    },
  };

  return model;
};
