// Shared player toplist derivation helpers. Kept Firestore-free so browser code and tools use one formula.

export const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (value == null) return 0;
  let text = String(value).trim();
  if (!text || text === "-" || text.toLowerCase() === "nan") return 0;
  text = text.replace(/\s+/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(/,/g, ".");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
};

const canonicalize = (value: string) =>
  String(value ?? "")
    .trim()
    .replace(/:+$/, "")
    .toLowerCase()
    .replace(/[\s_\u00a0]+/g, "");

const pickByCanonKey = (obj: Record<string, unknown>, key: string): unknown => {
  if (!obj || typeof obj !== "object") return undefined;
  const canonKey = canonicalize(key);
  for (const objectKey of Object.keys(obj)) {
    if (canonicalize(objectKey) === canonKey) return obj[objectKey];
  }
  return undefined;
};

export type ServerNorm = { group: "EU" | "US" | "INT" | "FUSION" | "ALL"; serverKey: string };

export const normalizeServer = (raw: unknown): ServerNorm => {
  if (!raw) return { group: "ALL", serverKey: "all" };
  const value = String(raw).toUpperCase();

  let match = value.match(/EU(\d+)/);
  if (match) return { group: "EU", serverKey: `EU${match[1]}` };
  match = value.match(/S?(\d+)[._-]?EU|S(\d+)\.SFGAME\.EU/);
  if (match) return { group: "EU", serverKey: `EU${match[1] || match[2]}` };
  match = value.match(/^S(\d+)$/);
  if (match) return { group: "EU", serverKey: `EU${match[1]}` };
  if (value.includes("AM1") || value.includes("S1.SFGAME.US")) return { group: "US", serverKey: "AM1" };
  if (value.includes("MAERWYNN")) return { group: "INT", serverKey: "MAERWYNN" };
  match = value.match(/F(\d+)/);
  if (match) return { group: "FUSION", serverKey: `F${match[1]}` };
  return { group: "ALL", serverKey: "all" };
};

export const MAIN_BY_CLASS: Record<string, "Base Strength" | "Base Dexterity" | "Base Intelligence"> = {
  Warrior: "Base Strength",
  Berserker: "Base Strength",
  Paladin: "Base Strength",
  Scout: "Base Dexterity",
  Assassin: "Base Dexterity",
  "Demon Hunter": "Base Dexterity",
  "Plague Doctor": "Base Dexterity",
  "plague doctor": "Base Dexterity",
  "plague-doctor": "Base Dexterity",
  plaguedoctor: "Base Dexterity",
  Pestdoktor: "Base Dexterity",
  pestdoktor: "Base Dexterity",
  "12": "Base Dexterity",
  Bard: "Base Intelligence",
  Mage: "Base Intelligence",
  "Battle Mage": "Base Strength",
  Necromancer: "Base Intelligence",
  Druid: "Base Intelligence",
};

export const pick = (obj: Record<string, unknown>, key: string): unknown =>
  obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;

export const computeBaseStats = (values: Record<string, unknown>) => {
  const baseStats = {
    str: toNumber(pick(values, "Base Strength")),
    dex: toNumber(pick(values, "Base Dexterity")),
    intl: toNumber(pick(values, "Base Intelligence")),
    con: toNumber(pick(values, "Base Constitution")),
    luck: toNumber(pick(values, "Base Luck")),
  };
  return { ...baseStats, sum: baseStats.str + baseStats.dex + baseStats.intl + baseStats.con + baseStats.luck };
};

export const deriveForPlayer = (latest: Record<string, unknown>, makeServerTimestamp?: () => unknown) => {
  const {
    playerId,
    identifier,
    name,
    className,
    level: levelRaw,
    server: serverRaw,
    guildIdentifier,
    guildName,
    timestamp,
    updatedAt,
  } = latest || {};
  const values =
    latest.values && typeof latest.values === "object" && !Array.isArray(latest.values)
      ? (latest.values as Record<string, unknown>)
      : {};

  const level = toNumber(levelRaw);
  const { group, serverKey } = normalizeServer(serverRaw);
  const base = computeBaseStats(values);
  const baseMain = toNumber(pickByCanonKey(values, "Base"));
  const baseConstitution = toNumber(pickByCanonKey(values, "Base Constitution"));
  const mainKey = MAIN_BY_CLASS[String(className ?? "")] ?? "Base Intelligence";
  const main = toNumber(pick(values, mainKey));
  const sum = baseMain + baseConstitution;
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
  const playerIdValue = String(playerId ?? "").trim();
  const identifierValue = typeof identifier === "string" ? identifier.trim() : "";
  const derivedIdentifier =
    identifierValue || (playerIdValue && serverKey ? `${serverKey.toLowerCase()}_p${playerIdValue}` : "");

  return {
    playerId: String(playerId ?? ""),
    identifier: derivedIdentifier || null,
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
  identifier: string | null;
  server: string;
  name: string;
  class: string;
  guild: string | null;
  lastScan: string | null;
  latestScanAtSec?: number | null;
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

export const toFiniteNumberOrNull = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const DERIVED_SCAN_SEC_FIELDS = ["latestScanAtSec"] as const;

export const normalizeScanSec = (value: unknown): number | null => {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value > 1e12 ? Math.floor(value / 1000) : value;
  }
  if (typeof value === "string") {
    const raw = value.trim();
    if (/^\d{13}$/.test(raw)) return Math.floor(Number(raw) / 1000);
    if (/^\d{10}$/.test(raw)) return Number(raw);
  }
  return null;
};

export const readDerivedScanSec = (
  entry: Record<string, unknown>,
): { sec: number | null; field: string | null } => {
  for (const field of DERIVED_SCAN_SEC_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(entry, field)) continue;
    return { sec: normalizeScanSec(entry[field]), field };
  }
  return { sec: null, field: null };
};

export const withDerivedScanSec = <T extends Record<string, unknown>>(
  entry: T,
  sec: number | null,
  field?: string | null,
): T => {
  if (!Number.isFinite(sec)) return entry;
  const target = field ?? "latestScanAtSec";
  if (entry[target] === sec) return entry;
  return { ...entry, [target]: sec };
};

export type BuildPlayerDerivedSnapshotInput = {
  playerId: unknown;
  server: unknown;
  identifier?: unknown;
  name?: unknown;
  className?: unknown;
  guildName?: unknown;
  level?: unknown;
  lastScanRaw?: unknown;
  timestampSec?: unknown;
  derived: {
    class?: unknown;
    level?: unknown;
    con?: unknown;
    main?: unknown;
    mainTotal?: unknown;
    conTotal?: unknown;
    sumTotal?: unknown;
    xpProgress?: unknown;
    xpTotal?: unknown;
    mine?: unknown;
    ratio?: unknown;
    sum?: unknown;
    treasury?: unknown;
  };
};

export const buildPlayerDerivedSnapshotEntry = (
  input: BuildPlayerDerivedSnapshotInput,
): PlayerDerivedSnapshotEntry => {
  const lastScanRaw = input.lastScanRaw != null ? String(input.lastScanRaw).trim() : "";
  const lastScanFallback = String(input.timestampSec ?? "").trim();
  const lastScan = (lastScanRaw || lastScanFallback).trim();
  const playerIdValue = String(input.playerId ?? "").trim();
  const serverValue = String(input.server ?? "").trim();
  const identifierValue = typeof input.identifier === "string" ? input.identifier.trim() : "";
  const derivedIdentifier =
    identifierValue || (playerIdValue && serverValue ? `${serverValue.toLowerCase()}_p${playerIdValue}` : "");

  return {
    playerId: String(input.playerId ?? ""),
    identifier: derivedIdentifier || null,
    server: String(input.server ?? ""),
    name: String(input.name ?? ""),
    class: String(input.derived?.class ?? input.className ?? ""),
    guild: input.guildName ? String(input.guildName) : null,
    lastScan: lastScan ? lastScan : null,
    latestScanAtSec: toFiniteNumberOrNull(input.timestampSec),
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
