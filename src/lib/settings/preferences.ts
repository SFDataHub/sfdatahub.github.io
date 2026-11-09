import { normalizeToplistViews, type ToplistViews } from "../toplists/toplistColumns";
import { strToU8, strFromU8, zlibSync, unzlibSync } from "fflate";
/** Browser/origin preferences. Reads never repair or persist defaults. */
export const PREFERENCES_KEY = "sfh:preferences:v1";
export type NavigationMode = "burger" | "sidebar";
export const DEFAULT_NAVIGATION_MODE: NavigationMode = "burger";
export type AttributeSumMode = "main-con" | "all-five";
export const DEFAULT_ATTRIBUTE_SUM_MODE: AttributeSumMode = "main-con";
export const GUILD_PROFILE_MODES = ["general", "progress", "base", "total", "fortress"] as const;
export type GuildProfileMode = typeof GUILD_PROFILE_MODES[number];
export const DEFAULT_GUILD_PROFILE_MODE: GuildProfileMode = "base";
function isGuildProfileMode(value: unknown): value is GuildProfileMode {
  return GUILD_PROFILE_MODES.some(mode => mode === value);
}
export const PLAYER_RADAR_MODES = ["main", "class", "guild", "server"] as const;
export type PlayerRadarMode = typeof PLAYER_RADAR_MODES[number];
const isPlayerRadarMode = (value: unknown): value is PlayerRadarMode => PLAYER_RADAR_MODES.some(mode => mode === value);
export type PreferencesStatus = "missing" | "ready" | "invalid" | "incompatible" | "read-error";
export type DataHubSetupPreference = {
  servers: string[];
  scope: "comparison" | "year";
  year: number | null;
  hidden: boolean;
  completed: boolean;
};
const setupPreference = (value: unknown): DataHubSetupPreference => {
  const data = record(value);
  return {
    servers: Array.isArray(data.servers) ? [...new Set(data.servers.filter((v): v is string => typeof v === "string"))] : [],
    scope: data.scope === "year" ? "year" : "comparison",
    year: Number.isInteger(data.year) ? data.year as number : null,
    hidden: data.hidden === true,
    completed: data.completed === true,
  };
};
export type PreferencesSnapshot = Readonly<{
  dataHubSetup: DataHubSetupPreference;
  attributeSumMode: AttributeSumMode;
  navigationMode: NavigationMode;
  guildProfileMode: GuildProfileMode;
  playerRadarMode: PlayerRadarMode;
  toplistViews: ToplistViews;
  status: PreferencesStatus;
  /** Exact persisted basis for optimistic concurrency, including unknown fields. */
  raw: string | null;
}>;
export type SaveResult = { status: "saved" | "unchanged" | "conflict" | "incompatible" | "read-error" | "write-error"; snapshot: PreferencesSnapshot };

type RecordValue = Record<string, unknown>;
const COMPACT_PREFIX = "sfh:z1:";
const COMPACT_UTF16_PREFIX = "sfh:z2:";
function parsePreferences(raw: string): unknown {
  if (raw.startsWith(COMPACT_UTF16_PREFIX)) {
    const separator = raw.indexOf(":", COMPACT_UTF16_PREFIX.length);
    const size = raw.slice(COMPACT_UTF16_PREFIX.length, separator);
    const length = parseInt(size, 36), encoded = raw.slice(separator + 1);
    if (!/^[0-9a-z]+$/.test(size) || !Number.isSafeInteger(length) || encoded.length !== Math.ceil(length * 8 / 15)) throw new TypeError("Invalid compact preferences");
    const bytes = new Uint8Array(length);
    let buffer = 0, bits = 0, index = 0;
    for (const char of encoded) {
      const value = char.charCodeAt(0) - 32;
      if (value < 0 || value > 0x7fff) throw new TypeError("Invalid compact preferences");
      buffer = (buffer << 15) | value;
      bits += 15;
      while (bits >= 8 && index < length) { bits -= 8; bytes[index++] = (buffer >>> bits) & 255; }
    }
    return JSON.parse(strFromU8(unzlibSync(bytes)));
  }
  if (raw.startsWith(COMPACT_PREFIX)) {
    const bytes = Uint8Array.from(atob(raw.slice(COMPACT_PREFIX.length)), c => c.charCodeAt(0));
    return JSON.parse(strFromU8(unzlibSync(bytes)));
  }
  return JSON.parse(raw);
}
function compactPreferences(raw: string): string {
  const bytes = zlibSync(strToU8(raw));
  // localStorage charges UTF-16 code units. Base64 uses only six bits of each;
  // pack fifteen bits per non-surrogate character to leave more quota headroom.
  let encoded = COMPACT_UTF16_PREFIX + bytes.length.toString(36) + ":", buffer = 0, bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    if (bits >= 15) { bits -= 15; encoded += String.fromCharCode(32 + ((buffer >>> bits) & 0x7fff)); }
  }
  if (bits) encoded += String.fromCharCode(32 + ((buffer << (15 - bits)) & 0x7fff));
  return encoded;
}
function record(value: unknown): RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}
function decode(raw: string | null, playerMode: "base" | "total" = "base"): PreferencesSnapshot {
  const base = { dataHubSetup: setupPreference(undefined), toplistViews: normalizeToplistViews(undefined, playerMode), attributeSumMode: DEFAULT_ATTRIBUTE_SUM_MODE, navigationMode: DEFAULT_NAVIGATION_MODE, guildProfileMode: DEFAULT_GUILD_PROFILE_MODE, playerRadarMode: "main" as const, raw };
  if (raw === null) return Object.freeze({ ...base, status: "missing" });
  try {
    const data = record(parsePreferences(raw));
    if (typeof data.schemaVersion === "number" && data.schemaVersion > 1) {
      return Object.freeze({ ...base, status: "incompatible" });
    }
    if (data.schemaVersion !== 1) return Object.freeze({ ...base, status: "invalid" });
    const mode = record(record(data.dataHub).profiles).attributeSumMode;
    const guildProfile = record(record(data.dataHub).profiles).guildProfileMode;
    const playerRadar = record(record(data.dataHub).profiles).playerRadarMode;
    const validPlayerRadar = isPlayerRadarMode(playerRadar);
    const validGuildProfile = isGuildProfileMode(guildProfile);
    const navigation = record(data.general).navigationMode;
    const validSum = mode === "main-con" || mode === "all-five";
    const validNavigation = navigation === "burger" || navigation === "sidebar";
    return Object.freeze({ ...base,
      dataHubSetup: setupPreference(record(data.dataHub).setup),
      toplistViews: normalizeToplistViews(record(data.dataHub).toplists, playerMode),
      attributeSumMode: validSum ? mode : DEFAULT_ATTRIBUTE_SUM_MODE,
      navigationMode: validNavigation ? navigation : DEFAULT_NAVIGATION_MODE,
      guildProfileMode: validGuildProfile ? guildProfile : DEFAULT_GUILD_PROFILE_MODE,
      playerRadarMode: validPlayerRadar ? playerRadar : "main",
      status: (playerRadar === undefined || validPlayerRadar) && (guildProfile === undefined || validGuildProfile) && (mode === undefined || validSum) && (navigation === undefined || validNavigation) ? "ready" : "invalid",
    });
  } catch {
    return Object.freeze({ ...base, status: "invalid" });
  }
}

/** Injectable storage boundary keeps contract tests independent of browser/account state. */
export function createPreferencesStore(
  storage: () => Pick<Storage, "getItem" | "setItem">,
  events?: Pick<Window, "addEventListener" | "removeEventListener">,
) {
  let snapshot: PreferencesSnapshot | undefined;
  const listeners = new Set<() => void>();
  function read(): PreferencesSnapshot {
    let upgradeBasis: PreferencesSnapshot | undefined;
    try {
      const store = storage();
      let raw = store.getItem(PREFERENCES_KEY);
      let mode: "base" | "total" = "base";
      try {
        const filters = JSON.parse(store.getItem("SFH_LOCAL_TL_FILTERS_V1") ?? store.getItem("TL_FILTERS_V2") ?? "null");
        if (filters?.localTable?.playerValueMode === "total") mode = "total";
      } catch { /* malformed filters use their existing Base fallback */ }
      const decoded = decode(raw, mode);
      upgradeBasis = decoded;
      if (decoded.status === "ready" || decoded.status === "invalid") {
        let data: RecordValue = {};
        try { data = record(parsePreferences(raw ?? "null")); } catch { /* do not repair malformed preferences */ }
        const oldPlayers = record(record(record(data.dataHub).toplists).players);
        const legacy = Array.isArray(oldPlayers.views) ? oldPlayers.views.some(v => record(v).attributeContract !== 1) : Array.isArray(oldPlayers.columns);
        if (data.schemaVersion === 1 && legacy) {
          const hub = record(data.dataHub), lists = record(hub.toplists);
          const updated = JSON.stringify({ ...data, dataHub: { ...hub, toplists: { ...lists, players: decoded.toplistViews.players } } });
          // Freeze before any later Default-Values change, with the same optimistic basis and quota fallback.
          if (store.getItem(PREFERENCES_KEY) !== raw) throw Error("Preferences changed during view upgrade");
          try { store.setItem(PREFERENCES_KEY, updated); raw = updated; }
          catch (error) {
            if (!error || typeof error !== "object" || !("name" in error) || error.name !== "QuotaExceededError") throw error;
            raw = compactPreferences(updated); store.setItem(PREFERENCES_KEY, raw);
          }
          if (store.getItem(PREFERENCES_KEY) !== raw) throw Error("View upgrade could not be read back");
          return decode(raw, mode);
        }
      }
      return decoded;
    }
    catch { if (upgradeBasis) return Object.freeze({ ...upgradeBasis, status: "read-error" }); return Object.freeze({ dataHubSetup: snapshot?.dataHubSetup ?? setupPreference(undefined), toplistViews: snapshot?.toplistViews ?? normalizeToplistViews(undefined), attributeSumMode: snapshot?.attributeSumMode ?? DEFAULT_ATTRIBUTE_SUM_MODE, navigationMode: snapshot?.navigationMode ?? DEFAULT_NAVIGATION_MODE, guildProfileMode: snapshot?.guildProfileMode ?? DEFAULT_GUILD_PROFILE_MODE, playerRadarMode: snapshot?.playerRadarMode ?? "main", raw: snapshot?.raw ?? null, status: "read-error" }); }
  }
  function publish(next: PreferencesSnapshot) {
    if (snapshot && snapshot.raw === next.raw && snapshot.status === next.status && snapshot.attributeSumMode === next.attributeSumMode && snapshot.navigationMode === next.navigationMode && snapshot.playerRadarMode === next.playerRadarMode && snapshot.guildProfileMode === next.guildProfileMode && snapshot.toplistViews.players.playerValueMode === next.toplistViews.players.playerValueMode) return snapshot;
    snapshot = next;
    listeners.forEach(listener => listener());
    return next;
  }
  function getSnapshot(): PreferencesSnapshot { return snapshot ?? (snapshot = read()); }
  function refresh() { return publish(read()); }
  function onStorage(event: Event) {
    const change = event as StorageEvent;
    if (change.key !== null && change.key !== PREFERENCES_KEY) return;
    // Ignore sessionStorage events. Re-read actual storage instead of trusting stale event payloads.
    try { if (change.storageArea && change.storageArea !== storage()) return; } catch { /* refresh reports read errors */ }
    refresh();
  }
  function subscribe(listener: () => void) {
    if (!listeners.size) events?.addEventListener("storage", onStorage);
    listeners.add(listener);
    refresh();
    return () => {
      listeners.delete(listener);
      if (!listeners.size) events?.removeEventListener("storage", onStorage);
    };
  }
  function savePreferences(changes: Partial<Pick<PreferencesSnapshot, "attributeSumMode" | "navigationMode" | "guildProfileMode" | "playerRadarMode" | "toplistViews" | "dataHubSetup">>, basis: PreferencesSnapshot): SaveResult {
    if (changes.attributeSumMode !== undefined && changes.attributeSumMode !== "main-con" && changes.attributeSumMode !== "all-five") throw new TypeError("Invalid attribute sum mode");
    if (changes.navigationMode !== undefined && changes.navigationMode !== "burger" && changes.navigationMode !== "sidebar") throw new TypeError("Invalid navigation mode");
    if (changes.playerRadarMode !== undefined && !isPlayerRadarMode(changes.playerRadarMode)) throw new TypeError("Invalid player radar mode");
    if (changes.guildProfileMode !== undefined && !isGuildProfileMode(changes.guildProfileMode)) throw new TypeError("Invalid guild profile mode");
    // Synchronous re-read also catches changes whose storage event has not arrived yet.
    const current = refresh();
    if (current.status === "read-error" || current.status === "incompatible") return { status: current.status, snapshot: current };
    if (current.raw !== basis.raw) return { status: "conflict", snapshot: current };
    if (Object.entries(changes).every(([key, value]) => current[key as keyof typeof changes] === value)) return { status: "unchanged", snapshot: current };
    let data: RecordValue = {};
    try { const parsed = record(parsePreferences(current.raw ?? "null")); if (parsed.schemaVersion === 1) data = parsed; } catch { /* explicit save may replace malformed JSON */ }
    const dataHub = record(data.dataHub), profiles = record(dataHub.profiles);
    const next: RecordValue = { ...data, schemaVersion: 1 };
    if (changes.attributeSumMode !== undefined || changes.guildProfileMode !== undefined || changes.playerRadarMode !== undefined) next.dataHub = { ...dataHub, profiles: { ...profiles,
      ...(changes.attributeSumMode !== undefined ? { attributeSumMode: changes.attributeSumMode } : {}),
      ...(changes.playerRadarMode !== undefined ? { playerRadarMode: changes.playerRadarMode } : {}),
      ...(changes.guildProfileMode !== undefined ? { guildProfileMode: changes.guildProfileMode } : {}),
    } };
    if (changes.dataHubSetup !== undefined) next.dataHub = { ...record(next.dataHub ?? dataHub), setup: setupPreference(changes.dataHubSetup) };
    if (changes.toplistViews !== undefined) {
      const oldViews = record(dataHub.toplists);
      const views = normalizeToplistViews(changes.toplistViews, current.toplistViews.players.playerValueMode === "total" ? "total" : "base");
      next.dataHub = { ...record(next.dataHub ?? dataHub), toplists: { ...oldViews,
        players: { ...record(oldViews.players), ...views.players }, guilds: { ...record(oldViews.guilds), ...views.guilds },
      } };
    }
    if (changes.navigationMode !== undefined) next.general = { ...record(data.general), navigationMode: changes.navigationMode };
    let raw = JSON.stringify(next);
    try { storage().setItem(PREFERENCES_KEY, raw); }
    catch (error) {
      // Radar choices also update existing compact preferences without requiring
      // enough quota for a temporarily expanded representation.
      if ((changes.toplistViews === undefined && changes.playerRadarMode === undefined) || !error || typeof error !== "object" || !("name" in error) || error.name !== "QuotaExceededError") return { status: "write-error", snapshot: current };
      try {
        const compact = compactPreferences(raw);
        if (compact.length >= raw.length) return { status: "write-error", snapshot: current };
        storage().setItem(PREFERENCES_KEY, compact);
        raw = compact;
      } catch { return { status: "write-error", snapshot: current }; }
    }
    // Publish only the state actually available to the next document load.
    const persisted = read();
    if (persisted.raw !== raw) return { status: "write-error", snapshot: publish(persisted) };
    return { status: "saved", snapshot: publish(persisted) };
  }
  function saveAttributeSumMode(mode: AttributeSumMode, basis: PreferencesSnapshot) {
    return savePreferences({ attributeSumMode: mode }, basis);
  }
  function saveNavigationMode(mode: NavigationMode, basis: PreferencesSnapshot) {
    return savePreferences({ navigationMode: mode }, basis);
  }
  return { getSnapshot, refresh, subscribe, savePreferences, saveAttributeSumMode, saveNavigationMode };
}

export const preferencesStore = createPreferencesStore(
  () => window.localStorage,
  typeof window === "undefined" ? undefined : window,
);
