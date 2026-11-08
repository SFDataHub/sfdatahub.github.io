import { projectFavoriteLocalScans, type FavoriteLocalScan } from "./hubFavoriteDisplayUpdates";
import { prepareFavoriteMatchingStatus, type FavoriteMatchingStatus } from "./hubFavoriteMatchingStatus";
import { auditBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave, auditFields, auditCount, auditCall, auditLink, auditExpectConsumer, auditDetailsStatus, type AuditFields } from "./runtimeAudit";
import { loadIdentityResolutionSnapshot, revalidateIdentityResolutionSnapshot, resolvePlayerIdentity, type IdentityResolutionSnapshot } from "../identities/identityResolution";
import { resolveObservedGuildIdentity } from "../identities/guildObservationIdentity";
import { captureLocalDataDependencies, revalidateLocalDataDependencies, createAnalyticsScopeMatcher, type LocalDependencyReceipt } from "../local-data/localDataDependencies";
import { projectGuildFavoriteObservation, type GuildFavoriteObservation } from "./hubGuildFavoriteObservation";
import { isGuildHubFavoriteScanSummaryCurrent, readDataHubLocalScanMetadata, type GuildHubScanSummary } from "../guilds/localScanLibrary";
import { favoriteReference, referenceKey, type HubFavorite, type FavoriteReference, type FavoriteKind } from "./hubFavoritesContract";
import { readHubSearchAppearance } from "./hubSearchAppearance";
import type { LocalPlayerProfileModel } from "../../components/local-player-profile/types";

export type FavoriteProjection = { favorite: HubFavorite; identity: "resolved" | "unresolved" | "conflict";
  identityId: string | null; aliasIdentifiers?: readonly string[]; availability: "available" | "missing" | "unknown";
  matching?: FavoriteMatchingStatus;
  playerScan?: FavoriteLocalScan; guildScan?: FavoriteLocalScan; observation?: GuildFavoriteObservation; dependencies?: LocalDependencyReceipt };

const actionEvidence = new WeakMap<HubFavorite, LocalDependencyReceipt>();
export async function revalidateFavoriteProjectionTarget(favorite: HubFavorite) {
  const receipt = actionEvidence.get(favorite);
  return !receipt || (await revalidateLocalDataDependencies(receipt)).current;
}

export function resolveFavorite(favorite: HubFavorite, identities: IdentityResolutionSnapshot) {
  if (favorite.referenceIssue === "conflict") return { identity: "conflict" as const, identityId: null, aliases: [] as string[] };
  if (!favorite.reference) return { identity: "unresolved" as const, identityId: null, aliases: [] as string[] };
  const refs = favorite.originalReferences.length ? favorite.originalReferences : [favorite.reference];
  const results = refs.map(ref => favorite.kind === "guild" ? resolveObservedGuildIdentity(identities, ref.identifier, ref.serverNamespace) : resolvePlayerIdentity(identities, ref.identifier));
  const groups = new Set(results.flatMap(result => result.resolved ? [result.identityId] : []));
  const originalKeys = new Set(refs.map(referenceKey));
  // A removed alias after unlink is not permission to choose the remaining
  // group. Distinct saved original entities now need explicit reassignment.
  if (results.some(result => result.status === "conflict") || groups.size > 1 || originalKeys.size > 1 && results.some(result => !result.resolved)) return { identity: "conflict" as const, identityId: null, aliases: [] as string[] };
  const result = results.find(result => result.resolved);
  return result?.resolved ? { identity: "resolved" as const, identityId: result.identityId, aliases: [...result.aliasIdentifiers] }
    : { identity: "unresolved" as const, identityId: null, aliases: [] as string[] };
}

/** Only complete references and aliases proved by this accepted projection.
 * The bound row's dependency receipt remains required before an action. */
export function favoriteProjectionMatchesReference(row: FavoriteProjection, kind: FavoriteKind, reference: FavoriteReference) {
  if (row.favorite.kind !== kind || row.identity === "conflict" || row.favorite.referenceIssue) return false;
  const key = referenceKey(reference);
  if ([row.favorite.reference, ...row.favorite.originalReferences].some(ref => ref && referenceKey(ref) === key)) return true;
  return row.identity === "resolved" && (row.aliasIdentifiers ?? []).some(identifier => {
    const alias = favoriteReference(kind, identifier);
    return alias && referenceKey(alias) === key;
  });
}

export async function projectHubFavorites(favorites: readonly HubFavorite[], context?: AuditFields, record?: object): Promise<FavoriteProjection[]> {
    const __audit1 = auditBegin("F02", "projectHubFavorites");
    auditFields(__audit1, { ...context, workKind: "projection-with-local-identity-and-metadata-reads" });
    if (context?.awaitConsumerDecision) auditExpectConsumer(__audit1);
    for (const [key, relation] of [["recordOriginId", "record-origin"], ["historicalRestoreId", "historical-restore"],
      ["storeNotificationId", "store-notification"], ["historicalNotificationId", "historical-store-notification"]]) {
      if (typeof context?.[key] !== "string") continue;
      const id = context[key] as string;
      if (relation === "store-notification" && auditDetailsStatus(id) !== "retained") {
        auditFields(__audit1, { notificationDetails: auditDetailsStatus(id) });
        auditLink(__audit1, id, "historical-store-notification");
      } else auditLink(__audit1, id, relation);
    }
    auditFields(__audit1, { recordProvided: !!record, recordOriginDetails: context?.recordOriginDetails ?? "unknown",
      consumerDecision: context?.awaitConsumerDecision ? "pending" : "unknown" });
    if (typeof context?.dependencyAuditId === "string") auditLink(__audit1, context.dependencyAuditId, "dependency-trigger");
    auditCount(__audit1, "projectionCalls");
    auditFields(__audit1, { inputFavorites: favorites.length });
    try {
  const dependencies = await captureLocalDataDependencies({ allIdentities: true, scanInventory: true });
  const [identities, metadata] = await (auditValue(__audit1, auditEnter(__audit1, "Promise.all"), (Promise.all([
    auditCall(__audit1, "favorites-identity-request", () => loadIdentityResolutionSnapshot(), "async-container"),
    auditCall(__audit1, "favorites-metadata-request", () => readDataHubLocalScanMetadata({ includeContentHashes: true }), "async-container")
  ]))));
  auditFields(__audit1, { sourceSummaries: metadata.summaries.length, sourceIds: metadata.sourceIds.length, migrationComplete: metadata.migrationComplete });
  const keys = { guild: new Set<string>(), player: new Set<string>() };
  const inventories: Array<{ summary: GuildHubScanSummary; servers: Set<string>; scopeComplete: boolean }> = [];
  let sourcesComplete = metadata.migrationComplete;
  const present = new Set<string>();
  const namespace = (server: string) => favoriteReference("player", "1", server)?.serverNamespace;
  for (const summary of metadata.summaries) {
    present.add(summary.sourceScanId);
    if (!isGuildHubFavoriteScanSummaryCurrent(summary, metadata.sourceContentHashes?.get(summary.sourceScanId))) {
      sourcesComplete = false;
      continue;
    }
    const contradicted = summary.guilds.some(guild => {
      const ref = favoriteReference("guild", guild.guildIdentifier ?? guild.guildId, guild.server);
      return ref && ref.serverNamespace !== namespace(guild.server);
    }) || summary.fusionInventorySlices!.some(slice => slice.playerIdentifiers?.some(identifier => {
      const ref = favoriteReference("player", identifier);
      return ref && ref.serverNamespace !== namespace(slice.server);
    }));
    if (contradicted) { sourcesComplete = false; continue; }
    const servers = new Set(summary.servers.flatMap(server => namespace(server) ?? []));
    // Scope itself needs validated metadata. An unknown source cannot be called
    // foreign merely because its untrusted summary claims another server.
    let scopeComplete = servers.size > 0 || summary.playerCount === 0 && summary.guildCount === 0;
    scopeComplete &&= summary.servers.every(server => !!namespace(server));
    for (const guild of summary.guilds) {
      const ref = favoriteReference("guild", guild.guildIdentifier ?? guild.guildId, guild.server);
      if (ref && ref.serverNamespace === namespace(guild.server)) {
        keys.guild.add(referenceKey(ref)); servers.add(ref.serverNamespace);
      } else if (namespace(guild.server)) servers.add(namespace(guild.server)!);
      else scopeComplete = false;
    }
    for (const slice of summary.fusionInventorySlices ?? []) {
      const server = namespace(slice.server);
      if (server) servers.add(server); else scopeComplete = false;
      for (const identifier of slice.playerIdentifiers ?? []) {
        const ref = favoriteReference("player", identifier);
        if (ref && ref.serverNamespace === server) keys.player.add(referenceKey(ref));
      }
    }
    inventories.push({ summary, servers, scopeComplete });
  }
  sourcesComplete &&= metadata.sourceIds.every(id => present.has(id));
  const matchingStatus = prepareFavoriteMatchingStatus(inventories, sourcesComplete);
  if (!(await revalidateLocalDataDependencies(dependencies)).current || await revalidateIdentityResolutionSnapshot(identities) !== identities) throw Error("Favorite evidence changed");
  const rows: FavoriteProjection[] = favorites.map(favorite => {
    const resolution = resolveFavorite(favorite, identities);
    const refs = [...favorite.originalReferences, ...resolution.aliases.map(id => favoriteReference(favorite.kind, id)).filter(ref => !!ref)];
    const available = favorite.historicalAt
      ? !!favorite.observationHint && inventories.some(({ summary }) => summary.sourceScanId === favorite.observationHint!.sourceScanId && summary.snapshotTimestamps.includes(favorite.historicalAt!) &&
        (favorite.kind === "guild" ? summary.guilds.some(g => refs.some(r => referenceKey(r) === (favoriteReference("guild", g.guildIdentifier ?? g.guildId, g.server) ? referenceKey(favoriteReference("guild", g.guildIdentifier ?? g.guildId, g.server)!) : "")))
          : summary.fusionInventorySlices?.some(slice => slice.playerIdentifiers?.some(id => refs.some(r => { const ref = favoriteReference("player", id); return ref && referenceKey(ref) === referenceKey(r); })))))
      : refs.some(ref => keys[favorite.kind].has(referenceKey(ref)));
    const namespaces = new Set(refs.map(ref => ref.serverNamespace));
    const complete = sourcesComplete && inventories.every(({ summary, servers, scopeComplete }) => {
      if (!scopeComplete) return false;
      if (![...servers].some(server => namespaces.has(server))) return true;
      if (favorite.kind === "guild") return !(summary.guildCount > 0 && !summary.guilds.length) && summary.guilds.every(guild =>
        !namespaces.has(namespace(guild.server) ?? "") || favoriteReference("guild", guild.guildIdentifier ?? guild.guildId, guild.server)?.serverNamespace === namespace(guild.server));
      const slices = summary.fusionInventorySlices ?? [];
      if (summary.playerCount > 0 && (!slices.length || slices.reduce((sum, slice) => sum + slice.playerCount, 0) !== summary.playerCount)) return false;
      return slices.every(slice => !namespaces.has(namespace(slice.server) ?? "") || slice.playerCount === 0 ||
        Array.isArray(slice.playerIdentifiers) && slice.playerIdentifiers.length === slice.playerCount &&
        slice.playerIdentifiers.every(identifier => favoriteReference("player", identifier)?.serverNamespace === namespace(slice.server)));
    });
    const observation = favorite.kind === "guild" ? projectGuildFavoriteObservation(favorite, resolution.identity === "resolved" ? resolution.identityId : null, identities, inventories.map(item => item.summary)) : undefined;
    const sourceScope = { [favorite.kind === "player" ? "players" : "guilds"]: refs.map(ref => ref.identifier),
      servers: [...new Set(refs.map(ref => ref.serverNamespace))] };
    const matches = createAnalyticsScopeMatcher(sourceScope);
    const rowDependencies = { ...dependencies, need: { allIdentities: true, sourceScope,
      sourceIds: metadata.summaries.filter(matches).map(summary => summary.sourceScanId) } };
    if (observation) actionEvidence.set(observation.effective, rowDependencies);
    const row: FavoriteProjection = { favorite, identity: resolution.identity, identityId: resolution.identityId, aliasIdentifiers: resolution.aliases, dependencies: rowDependencies,
      ...(observation ? { observation } : {}),
      availability: available ? "available" : !favorite.reference || !complete ? "unknown" : "missing" };
    return { ...row, matching: matchingStatus(row) };
  });
  const localScans = await projectFavoriteLocalScans(rows, metadata);
  if (!(await revalidateLocalDataDependencies(dependencies)).current) throw Error("Favorite evidence changed");
  return auditReturn(__audit1, rows.map(row => {
    const scan = localScans.get(row.favorite.id);
    const availability = scan && !row.favorite.historicalAt && !(row.favorite.kind === "guild" && row.favorite.observationHint?.sourceScanId)
      ? "available" as const : row.availability;
    return row.favorite.kind === "player" ? { ...row, availability, playerScan: scan } : { ...row, availability, guildScan: scan };
  }));

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
}

// Only the already opened profile's identity and display fields are copied.
// Neither currentSeed/rawPlayer nor prepared analytics enter persistence.
export function localPlayerObservationFavorite(input: {
  identifier: string | null; name: string; server: string | null; className: string | null;
  levelLabel?: string | null; guildName: string | null; rawPlayer?: unknown;
  sourceScanId: string; sourcePlayerKey: string; observedAtMs: number | null;
}): HubFavorite | null {
  const ref = favoriteReference("player", input.identifier);
  if (!ref) return null;
  return { id: `player:${referenceKey(ref)}`, kind: "player", reference: ref, originalReferences: [ref], identityHint: null,
    referenceIssue: null, order: 0, recordRevision: 1,
    display: { name: input.name, server: input.server, className: input.className, levelLabel: input.levelLabel,
      guildName: input.guildName, appearance: readHubSearchAppearance("player", input.rawPlayer), observedAtMs: input.observedAtMs },
    observationHint: { sourceScanId: input.sourceScanId, sourcePlayerKey: input.sourcePlayerKey, observedAtMs: input.observedAtMs } };
}
export function localPlayerFavorite(profile: LocalPlayerProfileModel): HubFavorite | null {
  return localPlayerObservationFavorite({ identifier: profile.currentSeed?.rawIdentifier ?? profile.analytics.memberRef ?? null,
    name: profile.hero.playerName, server: profile.analytics.server, className: profile.hero.className ?? null,
    levelLabel: profile.hero.playerInfo?.level == null ? profile.hero.levelLabel : String(profile.hero.playerInfo.level), guildName: profile.analytics.guildName, rawPlayer: profile.currentSeed?.rawPlayer,
    sourceScanId: profile.sourceScanId, sourcePlayerKey: profile.sourcePlayerKey,
    observedAtMs: Number.isFinite(profile.analytics.scannedAtMs) ? profile.analytics.scannedAtMs : null });
}
