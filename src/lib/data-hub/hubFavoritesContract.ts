import { buildGuildLogoIdentifier } from "../guilds/guildSelectionIdentity";
import { resolveServer } from "../servers/serverResolver";
import { normalizeServerKeyFromInput } from "../players/identifier";
import type { GuildHubSelectionGuild } from "../guilds/localScanLibrary";

export type FavoriteKind = "guild" | "player";
export type FavoriteReference = { identifier: string; serverNamespace: string; entityId: string };
export type FavoriteDisplay = {
  guildName?: string | null; appearance?: import("./hubSearchAppearance").HubSearchAppearance;
  name: string | null; server: string | null; logo?: string | null; logoIdentifier?: string | null;
  coaString?: string | null; hofRank?: number | null; memberCount?: number | null;
  className?: string | null; level?: number | null; levelLabel?: string | null; observedAtMs: number | null;
};
export type HubFavorite = {
  id: string; kind: FavoriteKind; reference: FavoriteReference | null;
  originalReferences: FavoriteReference[]; identityHint: string | null;
  display: FavoriteDisplay; order: number; recordRevision: number;
  referenceIssue: "incomplete" | "conflict" | null;
  historicalAt?: number | null;
  observationHint?: { sourceScanId: string; sourcePlayerKey?: string; observedAtMs: number | null; contentHash?: string };
  legacy?: { index: number; originalId: string | null; compatibilityId: string; value: unknown; updatedAt: string | null };
  guild?: GuildHubSelectionGuild;
};
export type HubFavoritesRecord = { schemaVersion: 1; recordRevision: number; favorites: HubFavorite[] };
export type HubGuildCompatibility = { schemaVersion: 1; recordRevision: number; activeGuildId: string | null };
export type HubFavoritesSnapshot = { record: HubFavoritesRecord; compatibility: HubGuildCompatibility };

export const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const text = (value: unknown): string | null => (typeof value === "string" || typeof value === "number") && String(value).trim() ? String(value).trim() : null;

export function favoriteReference(kind: FavoriteKind, identifier: unknown, server?: unknown): FavoriteReference | null {
  const raw = text(identifier);
  if (!raw) return null;
  const marker = kind === "guild" ? "g" : "p";
  const full = raw.match(new RegExp(`^(.+)_${marker}(\\d+)$`, "i"));
  const segment = raw.match(new RegExp(`^${marker}?(\\d+)$`, "i"));
  const namespace = full?.[1] ?? text(server);
  const entityId = full?.[2] ?? segment?.[1];
  if (!namespace || !entityId) return null;
  const resolved = resolveServer(namespace);
  const normalized = resolved?.code ?? (/^[a-z]{1,4}\d+(?:_(?:net|eu))?$/i.test(namespace) ? normalizeServerKeyFromInput(namespace) : null);
  if (!normalized) return null;
  return { identifier: full ? raw : `${namespace.toLowerCase()}_${marker}${entityId}`, serverNamespace: normalized.toLowerCase(), entityId };
}
export const referenceKey = (ref: FavoriteReference) => `${ref.serverNamespace}::${ref.entityId}`;

export function guildFavorite(value: unknown, index: number, updatedAt: string | null, migration = true): HubFavorite {
  const raw = object(value) ? value : {};
  const identifiers = [raw.guildId, raw.logoIdentifier, raw.logo, raw.id];
  const refs = [...identifiers.filter(id => /_g\d+$/i.test(String(id))), ...identifiers.filter(id => !/_g\d+$/i.test(String(id)))]
    .map(id => favoriteReference("guild", id, raw.server)).filter((ref): ref is FavoriteReference => !!ref);
  const unique = [...new Map(refs.map(ref => [ref.identifier.toLowerCase(), ref])).values()];
  const conflict = new Set(unique.map(referenceKey)).size > 1 || !!(raw.server && unique.some(ref => {
    const serverRef = favoriteReference("guild", ref.entityId, raw.server);
    return !serverRef || serverRef.serverNamespace !== ref.serverNamespace;
  }));
  const originalId = text(raw.id);
  const compatibilityId = originalId ?? buildGuildLogoIdentifier(raw.server, raw.logoIdentifier ?? raw.logo ?? raw.guildId) ?? `legacy-guild:${index}`;
  const reference = conflict ? null : unique[0] ?? null;
  const id = migration ? `legacy-guild:${index}` : `guild:${reference ? referenceKey(reference) : compatibilityId}`;
  return {
    id, kind: "guild", reference, originalReferences: unique, identityHint: null, order: index, recordRevision: 1,
    referenceIssue: conflict ? "conflict" : reference ? null : "incomplete",
    display: { name: text(raw.name), server: text(raw.server), logo: text(raw.logo), logoIdentifier: text(raw.logoIdentifier),
      coaString: text(raw.coaString), hofRank: typeof raw.hofRank === "number" ? raw.hofRank : null,
      memberCount: typeof raw.memberCount === "number" ? raw.memberCount : null, observedAtMs: typeof raw.observedAtMs === "number" && Number.isFinite(raw.observedAtMs) ? raw.observedAtMs : null },
    ...(migration ? { legacy: { index, originalId, compatibilityId, value, updatedAt } } : {}),
    guild: { id: compatibilityId, guildId: text(raw.guildId) ?? "", name: text(raw.name) ?? `Legacy ${index + 1}`,
      server: text(raw.server) ?? "", logo: text(raw.logo) ?? undefined, logoIdentifier: buildGuildLogoIdentifier(raw.server, raw.logoIdentifier ?? raw.logo ?? raw.guildId) ?? "",
      coaString: text(raw.coaString), hofRank: typeof raw.hofRank === "number" ? raw.hofRank : null,
      memberCount: typeof raw.memberCount === "number" ? raw.memberCount : null },
  };
}

export function migrateGuildFavorites(value: unknown, updatedAt: string | null): HubFavoritesSnapshot {
  if (value !== undefined && (!object(value) || !Array.isArray(value.selectedGuilds) ||
    !(value.activeGuildId === undefined || value.activeGuildId === null || typeof value.activeGuildId === "string"))) {
    throw Error("Damaged guild-selection record; recovery record was preserved.");
  }
  const raw = object(value) ? value : { selectedGuilds: [], activeGuildId: null };
  const favorites = (raw.selectedGuilds as unknown[]).map((guild, index) => guildFavorite(guild, index, updatedAt));
  const seen = new Set<string>();
  favorites.forEach(favorite => {
    let id = favorite.guild!.id;
    while (seen.has(id)) id = `${id}::${favorite.id}`;
    seen.add(id); favorite.guild!.id = id; favorite.legacy!.compatibilityId = id;
  });
  const active = typeof raw.activeGuildId === "string" && raw.activeGuildId.trim()
    ? favorites.find(f => f.legacy?.originalId === raw.activeGuildId && compatibilityGuildUsable(f))?.guild?.id ?? null : null;
  return { record: { schemaVersion: 1, recordRevision: 1, favorites }, compatibility: { schemaVersion: 1, recordRevision: 1, activeGuildId: active } };
}

export function guildSelection(snapshot: HubFavoritesSnapshot) {
  const selectedGuilds = snapshot.record.favorites.filter(f => f.kind === "guild" && f.guild).map(f => ({ ...f.guild!,
    name: f.display.name ?? f.guild!.name, server: f.display.server ?? f.guild!.server,
    logo: f.display.logo ?? f.guild!.logoIdentifier, logoIdentifier: buildGuildLogoIdentifier(f.display.server, f.display.logoIdentifier ?? f.display.logo ?? f.guild!.guildId) ?? f.guild!.logoIdentifier,
    coaString: f.display.coaString, hofRank: f.display.hofRank, memberCount: f.display.memberCount }));
  return { selectedGuilds, activeGuildId: snapshot.compatibility.activeGuildId, recordRevision: snapshot.record.recordRevision,
    compatibilityRevision: snapshot.compatibility.recordRevision };
}

// Only an explicit, structurally usable historical ID can seed a page once.
// Every legacy row remains visible; the first favorite is never an input.
export function compatibilityGuildUsable(favorite: HubFavorite) {
  const guild = favorite.guild;
  return favorite.kind === "guild" && !!guild && !!guild.guildId.trim() && !!favorite.display.name?.trim() && !!guild.server.trim() && !!guild.logoIdentifier.trim();
}

export function playerFavoriteAnchor(favorite: HubFavorite) {
  const hint = favorite.observationHint;
  return favorite.kind === "player" && favorite.historicalAt && hint?.sourceScanId && hint.observedAtMs === favorite.historicalAt
    ? { source: hint.sourceScanId, at: hint.observedAtMs, ...(hint.sourcePlayerKey ? { row: hint.sourcePlayerKey } : {}), ...(hint.contentHash ? { hash: hint.contentHash } : {}) } : undefined;
}
