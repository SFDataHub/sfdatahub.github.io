import { excludeHiddenPickerServers } from "../../components/Filters/serverPickerModel";
import { favoriteReference, guildFavorite, object, type FavoriteReference, type HubFavorite } from "./hubFavoritesContract";
import type { GuildHubSelectionGuild } from "../guilds/localScanLibrary";

export type GuildFeatureKey = "guild-hub" | "guild-dashboard" | "guild-analytics" | "fight-tracking";
export type FeatureKey = GuildFeatureKey | "local-toplist";
export type PageGuildReference = {
  reference: FavoriteReference | null;
  originalReferences: FavoriteReference[];
  identityHint: string | null;
  favoriteId: string | null;
  referenceIssue: HubFavorite["referenceIssue"];
  guild: GuildHubSelectionGuild;
};
export type PageContext = {
  schemaVersion: 1; feature: FeatureKey; generation: number; initialized: boolean;
  guild: PageGuildReference | null; servers: string[] | null; targetKeys: string[];
  error: string | null;
};
export const PAGE_CONTEXT_PREFIX = "sfdatahub:page-context:v1:";

export function pageGuildReference(guild: GuildHubSelectionGuild, favorite?: HubFavorite): PageGuildReference {
  const entity = favorite ?? guildFavorite(guild, 0, null, false);
  return { reference: entity.reference, originalReferences: entity.originalReferences, identityHint: entity.identityHint,
    favoriteId: favorite?.id ?? null, referenceIssue: entity.referenceIssue, guild: { ...guild } };
}

function validGuild(value: unknown): value is PageGuildReference {
  if (!object(value) || !object(value.guild) || !Array.isArray(value.originalReferences)) return false;
  const validRef = (ref: unknown) => {
    if (!object(ref) || typeof ref.identifier !== "string") return false;
    const parsed = favoriteReference("guild", ref.identifier);
    return !!parsed && parsed.serverNamespace === ref.serverNamespace && parsed.entityId === ref.entityId;
  };
  return ["id", "guildId", "name", "server", "logoIdentifier"].every(key => typeof (value.guild as Record<string, unknown>)[key] === "string") &&
    (value.reference === null || validRef(value.reference)) && value.originalReferences.every(validRef) &&
    (value.identityHint === null || typeof value.identityHint === "string") &&
    (value.favoriteId === null || typeof value.favoriteId === "string") &&
    (value.referenceIssue === null || value.referenceIssue === "conflict" || value.referenceIssue === "incomplete");
}

// Session storage is synchronous and tab scoped. No storage listener, origin
// broadcast, raw payload, or favorite list belongs to this owner.
export class PageContextStore {
  private contexts = new Map<FeatureKey, PageContext>();
  private listeners = new Map<FeatureKey, Set<() => void>>();
  constructor(private storage: () => Pick<Storage, "getItem" | "setItem"> | undefined = () => typeof window === "undefined" ? undefined : window.sessionStorage) {}
  get = (feature: FeatureKey): PageContext => {
    const existing = this.contexts.get(feature);
    if (existing) return existing;
    let context: PageContext = { schemaVersion: 1, feature, generation: 0, initialized: false, guild: null, servers: null, targetKeys: [], error: null };
    try {
      const raw = this.storage()?.getItem(PAGE_CONTEXT_PREFIX + feature);
      if (raw) {
        const value: unknown = JSON.parse(raw);
        if (!object(value) || value.schemaVersion !== 1 || value.feature !== feature || value.initialized !== true ||
          !Number.isSafeInteger(value.generation) || Number(value.generation) < 0 ||
          !(value.guild === null || validGuild(value.guild)) ||
          !(value.servers === null || Array.isArray(value.servers) && value.servers.every(server => typeof server === "string")) ||
          !(Array.isArray(value.targetKeys) && value.targetKeys.every(key => typeof key === "string")) ||
          (feature === "local-toplist" ? value.guild !== null : value.servers !== null)) throw Error("Invalid page session context");
        context = { ...value, error: null } as PageContext;
        if (feature === "local-toplist" && context.servers) context.servers = excludeHiddenPickerServers(context.servers);
      }
    } catch (error) { context = { ...context, initialized: true, error: String(error) }; }
    this.contexts.set(feature, context);
    return context;
  };
  subscribe = (feature: FeatureKey, listener: () => void) => {
    const listeners = this.listeners.get(feature) ?? new Set();
    this.listeners.set(feature, listeners); listeners.add(listener);
    return () => { listeners.delete(listener); };
  };
  private commit(feature: FeatureKey, patch: Partial<PageContext>) {
    const before = this.get(feature);
    if (feature === "local-toplist" && patch.servers) patch = { ...patch, servers: excludeHiddenPickerServers(patch.servers) };
    let context: PageContext = { ...before, ...patch, generation: before.generation + 1, initialized: true, error: null };
    try {
      const storage = this.storage();
      if (!storage) throw Error("Session storage unavailable");
      storage.setItem(PAGE_CONTEXT_PREFIX + feature, JSON.stringify(context));
    } catch (error) { context = { ...context, error: String(error) }; }
    this.contexts.set(feature, context);
    this.listeners.get(feature)?.forEach(listener => listener());
  }
  selectGuild(feature: GuildFeatureKey, guild: PageGuildReference | null) {
    const before = this.get(feature);
    if (!before.initialized || before.error || JSON.stringify(before.guild) !== JSON.stringify(guild)) this.commit(feature, { guild });
  }
  selectServers(servers: string[]) { this.commit("local-toplist", { servers: [...servers] }); }
  acceptToplistTarget(server: string, targetKey: string, servers = [server]) {
    const before = this.get("local-toplist");
    if (before.targetKeys.includes(targetKey)) return false;
    this.commit("local-toplist", { servers: [...servers], targetKeys: [...before.targetKeys, targetKey] });
    return true;
  }
  initializeGuild(feature: GuildFeatureKey, guild: PageGuildReference | null, expectedGeneration: number) {
    const before = this.get(feature);
    if (!before.initialized && before.generation === expectedGeneration) this.commit(feature, { guild });
  }
  initializeServers(servers: string[], expectedGeneration: number) {
    const before = this.get("local-toplist");
    if (!before.initialized && before.generation === expectedGeneration) this.commit("local-toplist", { servers: [...servers] });
  }
  acceptTarget(feature: GuildFeatureKey, guild: PageGuildReference | null, targetKey: string) {
    const before = this.get(feature);
    if (!before.targetKeys.includes(targetKey)) this.commit(feature, { guild, targetKeys: [...before.targetKeys, targetKey] });
  }
}
export const pageContextStore = new PageContextStore();
