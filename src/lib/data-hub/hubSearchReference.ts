import { favoriteReference, type FavoriteKind, type FavoriteReference } from "./hubFavoritesContract";
import { slimPlayer } from "../import/parsers";

const object = (value: unknown): Record<string, unknown> | null =>
  !!value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const serverKeys = new Set(["server", "prefix", "world", "realm", "srv", "shard"]);
const playerKeys = new Set(["identifier", "linkidentifier", "playerid", "pid", "id"]);
const guildKeys = new Set(["guildidentifier", "groupidentifier", "guildid", "groupid", "group"]);
const guildIdentifierKeys = new Set(["identifier", "id", ...guildKeys]);

/** Literal search/navigation evidence. In particular, slimPlayer.server and guild names are
 * guesses, not declarations. Keep all valid declarations to detect conflicts. */
export function readHubSearchReferenceEvidence(kind: FavoriteKind, raw: unknown) {
  const record = object(raw) ?? {}, latest = object(record.latest);
  const sources = [record, object(record.values), latest, object(latest?.values)].filter(Boolean) as Record<string, unknown>[];
  const servers = new Set<string>(), identifiers: string[] = [], guildIdentifiers: string[] = [];
  for (const source of sources) for (const [field, value] of Object.entries(source)) {
    const normalized = key(field);
    if (serverKeys.has(normalized)) {
      const ref = favoriteReference(kind, "1", value);
      if (ref) servers.add(ref.serverNamespace);
    }
    if ((kind === "player" ? playerKeys : guildIdentifierKeys).has(normalized) &&
        (typeof value === "string" || typeof value === "number")) identifiers.push(String(value).trim());
    if (kind === "player" && guildKeys.has(normalized)) {
      const ref = favoriteReference("guild", value);
      if (ref) servers.add(ref.serverNamespace);
      if (typeof value === "string" || typeof value === "number") guildIdentifiers.push(String(value).trim());
    }
  }
  // Preserve the established identifier aliases, without accepting its server guess.
  if (!identifiers.length && kind === "player") {
    const id = slimPlayer(record).id;
    if (id) identifiers.push(id);
  }
  const full = identifiers.map(id => favoriteReference(kind, id)).filter((ref): ref is FavoriteReference => !!ref);
  for (const ref of full) servers.add(ref.serverNamespace);
  const conflictingIds = new Set(full.map(ref => ref.entityId)).size > 1;
  return { identifiers, full, servers, conflictingIds, guildIdentifiers };
}

export function resolveHubSearchReference(kind: FavoriteKind, raw: unknown, context?: string | null) {
  const evidence = readHubSearchReferenceEvidence(kind, raw);
  const identifier = evidence.full[0]?.identifier ?? evidence.identifiers[0] ?? null;
  if (evidence.conflictingIds || evidence.servers.size > 1) return { identifier, reference: null, server: null };
  const server = evidence.servers.values().next().value ?? favoriteReference(kind, "1", context)?.serverNamespace ?? null;
  const reference = evidence.full[0] ?? (identifier ? favoriteReference(kind, identifier, server) : null);
  return { identifier, reference, server: reference?.serverNamespace ?? server };
}

