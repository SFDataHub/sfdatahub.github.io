import { normalizeGuildSegmentForScan } from "../guilds/guildScanNormalizer";
import { resolveServer, serverComparisonKey } from "../servers/serverResolver";
import { resolveGuildIdentity, type IdentityResolutionSnapshot } from "./identityResolution";

/** Lookup spellings of one complete observation reference. Never includes bare
 * guild numbers or fusion ancestors; stored aliases and observations stay intact. */
export function guildObservationIdentifierCandidates(identifier: string | null | undefined, server?: string | null): string[] {
  const raw = String(identifier ?? "").trim().toLowerCase();
  const full = /^(.+)_g([^_]+)$/i.exec(raw);
  const segment = normalizeGuildSegmentForScan(raw);
  const namespace = full?.[1] ?? server;
  const registered = resolveServer(namespace);
  if (!segment || !/^g[^_]+$/.test(segment) || !registered || (server && serverComparisonKey(server) !== registered.code)) return [];
  const namespaces = new Set([full?.[1], registered.code, ...registered.aliases, ...registered.hosts].filter((value): value is string => !!value));
  return [...namespaces].filter(value => serverComparisonKey(value) === registered.code)
    .map(value => `${value.toLowerCase()}_${segment}`);
}

export function resolveObservedGuildIdentity(
  snapshot: Pick<IdentityResolutionSnapshot, "guilds">,
  identifier: string | null | undefined,
  server?: string | null,
) {
  const candidates = guildObservationIdentifierCandidates(identifier, server);
  return resolveGuildIdentity(snapshot, candidates[0] ?? "");
}

export function confirmedGuildObservationsMatch(
  snapshot: Pick<IdentityResolutionSnapshot, "guilds">,
  source: string | null | undefined, target: string | null | undefined,
  sourceServer?: string | null, targetServer?: string | null,
) {
  const a = resolveObservedGuildIdentity(snapshot, source, sourceServer);
  const b = resolveObservedGuildIdentity(snapshot, target, targetServer);
  return a.resolved && b.resolved && a.identityId === b.identityId;
}
