// tools/playerDerivedHelpers.mts
// Shared helpers for player-derived calculations (no Firestore init here).

export const toNumber = (v: any): number => {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  let s = String(v).trim();
  if (!s || s === "-" || s.toLowerCase() === "nan") return 0;
  s = s.replace(/\s+/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(/,/g, ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const CANON = (s: string) =>
  String(s ?? "")
    .trim()
    .replace(/:+$/, "")
    .toLowerCase()
    .replace(/[\s_\u00a0]+/g, "");

const pickByCanonKey = (obj: Record<string, any>, key: string): any => {
  if (!obj || typeof obj !== "object") return undefined;
  const canonKey = CANON(key);
  for (const k of Object.keys(obj)) {
    if (CANON(k) === canonKey) return obj[k];
  }
  return undefined;
};

export type ServerNorm = { group: "EU" | "US" | "INT" | "FUSION" | "ALL"; serverKey: string };
export const normalizeServer = (raw: any): ServerNorm => {
  if (!raw) return { group: "ALL", serverKey: "all" };
  const s = String(raw).toUpperCase();

  let m = s.match(/S?(\d+)[._-]?EU|S(\d+)\.SFGAME\.EU/);
  if (m) {
    const num = m[1] || m[2];
    return { group: "EU", serverKey: `EU${num}` };
  }
  if (s.includes("AM1") || s.includes("S1.SFGAME.US")) return { group: "US", serverKey: "AM1" };
  if (s.includes("MAERWYNN")) return { group: "INT", serverKey: "MAERWYNN" };
  m = s.match(/F(\d+)/);
  if (m) return { group: "FUSION", serverKey: `F${m[1]}` };
  return { group: "ALL", serverKey: "all" };
};

export const MAIN_BY_CLASS: Record<string, "Base Strength" | "Base Dexterity" | "Base Intelligence"> = {
  Warrior: "Base Strength",
  Berserker: "Base Strength",
  Paladin: "Base Strength",
  Scout: "Base Dexterity",
  Assassin: "Base Dexterity",
  "Demon Hunter": "Base Dexterity",
  Bard: "Base Intelligence",
  Mage: "Base Intelligence",
  "Battle Mage": "Base Strength",
  Necromancer: "Base Intelligence",
  Druid: "Base Intelligence",
};

export const pick = (obj: Record<string, any>, key: string): any =>
  obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;

export const computeBaseStats = (values: Record<string, any>) => {
  const bs = {
    str: toNumber(pick(values, "Base Strength")),
    dex: toNumber(pick(values, "Base Dexterity")),
    intl: toNumber(pick(values, "Base Intelligence")),
    con: toNumber(pick(values, "Base Constitution")),
    luck: toNumber(pick(values, "Base Luck")),
  };
  const sum = bs.str + bs.dex + bs.intl + bs.con + bs.luck;
  return { ...bs, sum };
};

export const deriveForPlayer = (latest: any, makeServerTimestamp?: () => any) => {
  const {
    playerId,
    name,
    className,
    level: levelRaw,
    server: serverRaw,
    guildIdentifier,
    guildName,
    timestamp, // number (Importer-Felder)
    updatedAt, // optional TS/placeholder vom Aufrufer
    values = {},
  } = latest || {};

  const level = toNumber(levelRaw);
  const { group, serverKey } = normalizeServer(serverRaw);
  const base = computeBaseStats(values);

  const mainKey = MAIN_BY_CLASS[String(className ?? "")] ?? "Base Intelligence";
  const main = toNumber(pick(values, mainKey));
  const sum = base.sum;
  const con = base.con;
  const ratio = level > 0 ? sum / level : 0;
  const mainTotal = toNumber(pickByCanonKey(values, "Attribute"));
  const conTotal = toNumber(pickByCanonKey(values, "Constitution"));
  const sumTotal = mainTotal + conTotal;
  const xpProgress = toNumber(pickByCanonKey(values, "XP"));
  const xpTotal = toNumber(pickByCanonKey(values, "XP Total"));
  const mine = toNumber(pick(values, "Gem Mine"));
  const treasury = toNumber(pick(values, "Treasury"));
  const updatedAtFallback = makeServerTimestamp ? makeServerTimestamp() : null;

  return {
    playerId: String(playerId ?? ""),
    name: String(name ?? ""),
    class: String(className ?? ""),
    level,
    group,
    serverKey,
    guildId: guildIdentifier ? String(guildIdentifier) : "",
    guildName: guildName ? String(guildName) : "",
    sum,
    main,
    con,
    ratio,
    mainTotal,
    conTotal,
    sumTotal,
    xpProgress,
    xpTotal,
    mine,
    treasury,
    timestamp: toNumber(timestamp),
    updatedAtFromLatest: updatedAt ?? updatedAtFallback ?? null,
  };
};

export type PlayerDerivedSnapshotEntry = {
  playerId: string;
  server: string;
  name: string;
  class: string;
  guild: string | null;
  lastScan: string | null;
  level: number | null;
  con: number | null;
  main: number | null;
  mainTotal: number | null;
  conTotal: number | null;
  sumTotal: number | null;
  xpProgress: number | null;
  xpTotal: number | null;
  mine: number | null;
  ratio: number | null;
  sum: number | null;
  treasury: number | null;
};

export const toFiniteNumberOrNull = (value: any): number | null => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export type BuildPlayerDerivedSnapshotInput = {
  playerId: any;
  server: any;
  name?: any;
  className?: any;
  guildName?: any;
  level?: any;
  lastScanRaw?: any;
  timestampSec?: any;
  derived: {
    class?: any;
    level?: any;
    con?: any;
    main?: any;
    mainTotal?: any;
    conTotal?: any;
    sumTotal?: any;
    xpProgress?: any;
    xpTotal?: any;
    mine?: any;
    ratio?: any;
    sum?: any;
    treasury?: any;
  };
};

export const buildPlayerDerivedSnapshotEntry = (
  input: BuildPlayerDerivedSnapshotInput
): PlayerDerivedSnapshotEntry => {
  const lastScanRaw = input.lastScanRaw != null ? String(input.lastScanRaw).trim() : "";
  const lastScanFallback = String(input.timestampSec ?? "").trim();
  const lastScan = (lastScanRaw || lastScanFallback).trim();

  return {
    playerId: String(input.playerId ?? ""),
    server: String(input.server ?? ""),
    name: String(input.name ?? ""),
    class: String(input.derived?.class ?? input.className ?? ""),
    guild: input.guildName ? String(input.guildName) : null,
    lastScan: lastScan ? lastScan : null,
    level: toFiniteNumberOrNull(input.level ?? input.derived?.level),
    con: toFiniteNumberOrNull(input.derived?.con),
    main: toFiniteNumberOrNull(input.derived?.main),
    mainTotal: toFiniteNumberOrNull(input.derived?.mainTotal),
    conTotal: toFiniteNumberOrNull(input.derived?.conTotal),
    sumTotal: toFiniteNumberOrNull(input.derived?.sumTotal),
    xpProgress: toFiniteNumberOrNull(input.derived?.xpProgress),
    xpTotal: toFiniteNumberOrNull(input.derived?.xpTotal),
    mine: toFiniteNumberOrNull(input.derived?.mine),
    ratio: toFiniteNumberOrNull(input.derived?.ratio),
    sum: toFiniteNumberOrNull(input.derived?.sum),
    treasury: toFiniteNumberOrNull(input.derived?.treasury),
  };
};
