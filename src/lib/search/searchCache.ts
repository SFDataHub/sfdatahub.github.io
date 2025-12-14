// Cache for UniversalSearch suggestions (cache-first, TTL + LRU, localStorage backed).
// Keys: sfh:search:cache:v1:universal:{normalizedQuery}

export type CachedSuggestions = {
  ts: number;
  ttlSec: number;
  players: Array<{
    playerId: string | number;
    name: string | null;
    server: string | null;
    className?: string | null;
    guildName?: string | null;
  }>;
  guilds: Array<{
    guildId: string;
    name: string | null;
    server?: string | null;
  }>;
  playersHasMore: boolean;
  guildsHasMore: boolean;
};

const PREFIX = "sfh:search:cache:v1:universal:";
const LRU_KEY = `${PREFIX}lru`;
const TTL_SEC_DEFAULT = 12 * 60 * 60; // 12h
const MAX_ENTRIES = 150;

const storageAvailable = () => typeof window !== "undefined" && !!window.localStorage;

export const normalizeQuery = (q: string): string =>
  q
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const debugLog = (...args: any[]) => {
  try {
    if (storageAvailable() && window.localStorage.getItem("sfh:debug:firestoreReads") === "1") {
      // eslint-disable-next-line no-console
      console.debug(...args);
    }
  } catch {
    // ignore
  }
};

const getLRU = (): string[] => {
  if (!storageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(LRU_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};

const saveLRU = (list: string[]) => {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(LRU_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
  } catch {
    // ignore quota errors
  }
};

const touchLRU = (key: string) => {
  const list = getLRU().filter((k) => k !== key);
  list.unshift(key);
  saveLRU(list.slice(0, MAX_ENTRIES));
};

const pruneLRU = () => {
  const list = getLRU();
  if (list.length <= MAX_ENTRIES) return;
  const trimmed = list.slice(0, MAX_ENTRIES);
  saveLRU(trimmed);
  if (!storageAvailable()) return;
  try {
    const toRemove = list.slice(MAX_ENTRIES);
    toRemove.forEach((q) => window.localStorage.removeItem(PREFIX + q));
  } catch {
    // ignore
  }
};

export const getCachedSuggestions = (normalizedQuery: string): CachedSuggestions | null => {
  if (!storageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + normalizedQuery);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSuggestions;
    if (!parsed || typeof parsed.ts !== "number" || typeof parsed.ttlSec !== "number") return null;
    const ageMs = Date.now() - parsed.ts;
    if (ageMs > parsed.ttlSec * 1000) return null;
    debugLog("[SearchCache] hit", normalizedQuery);
    touchLRU(normalizedQuery);
    return parsed;
  } catch {
    return null;
  }
};

export const setCachedSuggestions = (
  normalizedQuery: string,
  entry: Omit<CachedSuggestions, "ts" | "ttlSec">,
  ttlSec: number = TTL_SEC_DEFAULT,
) => {
  if (!storageAvailable()) return;
  const payload: CachedSuggestions = {
    ...entry,
    ts: Date.now(),
    ttlSec,
  };
  try {
    window.localStorage.setItem(PREFIX + normalizedQuery, JSON.stringify(payload));
    touchLRU(normalizedQuery);
    pruneLRU();
    debugLog("[SearchCache] store", normalizedQuery, {
      players: entry.players.length,
      guilds: entry.guilds.length,
    });
  } catch {
    // ignore write/quota errors
  }
};
