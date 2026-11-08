import type { GuildHubScanSummary } from "../guilds/localScanLibrary";
import { listFusionIdentityAnalysisScopes } from "../identities/fusionIdentityScopes";
import { getFusionIdentityScopeLocalMatchability, type FusionIdentityScopeMatchabilityObservation } from "../identities/fusionScopeMatchability";
import { isFusionAncestor, resolveServer } from "../servers/serverResolver";
import { favoriteReference, type FavoriteKind } from "./hubFavoritesContract";
import type { FavoriteProjection } from "./hubFavoritesProjection";

export type FavoriteMatchingStatus = "original" | "resolved" | "unresolved" | "missing-history" | "unavailable" | "conflict";

/** One metadata-only preparation per accepted favorites projection. The slices
 * are the shared fusion inventory: guild observations (including roster evidence)
 * count for guilds, never the mere presence of player observations, or vice versa.
 * Call only with summaries validated against the independently read Raw hashes. */
export function prepareFavoriteMatchingStatus(
  inventories: readonly { summary: GuildHubScanSummary; scopeComplete: boolean }[],
  sourcesComplete: boolean,
) {
  const scopes = new Map(listFusionIdentityAnalysisScopes().map(scope => [scope.targetServerCode, scope]));
  const observations: Record<FavoriteKind, FusionIdentityScopeMatchabilityObservation[]> = { player: [], guild: [] };
  const complete = { player: sourcesComplete, guild: sourcesComplete };
  for (const { summary, scopeComplete } of inventories) {
    for (const kind of ["player", "guild"] as const) {
      const field = kind === "player" ? "playerCount" : "guildCount";
      const identifiers = kind === "player" ? "playerIdentifiers" : "guildIdentifiers";
      const slices = summary.fusionInventorySlices ?? [];
      complete[kind] &&= scopeComplete && slices.reduce((sum, slice) => sum + slice[field], 0) === summary[field];
      for (const slice of slices) {
        const server = resolveServer(slice.server)?.code;
        const count = slice[field];
        const valid = !!server && Number.isSafeInteger(count) && count >= 0 &&
          Number.isSafeInteger(slice.timestampMs) && slice.timestampMs > 0 && summary.snapshotTimestamps.includes(slice.timestampMs) &&
          (!slice[identifiers] || slice[identifiers].length === count);
        if (!valid) { complete[kind] = false; continue; }
        if (count > 0) observations[kind].push({ serverCode: server, timestampMs: slice.timestampMs,
          playerCount: kind === "player" ? count : 0, guildCount: kind === "guild" ? count : 0 });
      }
    }
  }
  const comparisons = new Map<string, FavoriteMatchingStatus>();
  return (row: FavoriteProjection): FavoriteMatchingStatus => {
    if (row.identity === "conflict" || row.favorite.referenceIssue === "conflict" || row.observation?.state === "ambiguous") return "conflict";
    const reference = row.observation?.effective.reference ?? row.favorite.reference;
    const server = reference && resolveServer(reference.serverNamespace)?.code;
    if (!server || row.favorite.referenceIssue) return "unavailable";
    const scope = scopes.get(server);
    // Only aliases accepted by the common identity resolver prove a connection.
    // Registered spellings of one server and sibling origins prove no fusion match.
    // A favorite may retain its original anchor while W224 displays a confirmed
    // descendant observation. Accept either direction of that confirmed lineage,
    // even after local scans disappear; never infer a link from sibling origins.
    // An unrelated confirmed leg must not validate a later fusion target.
    const aliases = row.identity === "resolved" ? (row.aliasIdentifiers ?? []).flatMap(identifier => {
      const ref = favoriteReference(row.favorite.kind, identifier);
      const code = ref && resolveServer(ref.serverNamespace)?.code;
      return code ? [code] : [];
    }) : [];
    if (aliases.includes(server) && aliases.some(code => code !== server &&
      (isFusionAncestor(code, server) || isFusionAncestor(server, code)))) return "resolved";
    // An original server reference needs no incoming fusion mapping. Outgoing
    // destinations alone do not change the reference being displayed/navigated.
    if (!scope || scope.temporalStatus === "future") return "original";
    const key = `${row.favorite.kind}:${scope.eventId}`;
    const cached = comparisons.get(key);
    if (cached) return cached;
    const basis = getFusionIdentityScopeLocalMatchability(scope, observations[row.favorite.kind]);
    // Management's analysisSupported additionally restricts which terminal scope
    // can be opened there. Historic favorite targets still use their own before/
    // after evidence rather than being silently moved to a later terminal fusion.
    const status: FavoriteMatchingStatus = basis.hasHistoricalObservations && basis.hasCurrentTargetObservations
      ? "unresolved" : !basis.hasHistoricalObservations && complete[row.favorite.kind] ? "missing-history" : "unavailable";
    comparisons.set(key, status);
    return status;
  };
}
