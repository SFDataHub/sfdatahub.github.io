import type { GuildHubLocalGuildIdentity, GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";
import { isGuildHubScanAnalyticsEnabled } from "../../lib/guilds/localScanLibrary";
import { favoriteReference, referenceKey } from "../../lib/data-hub/hubFavoritesContract";
import { type IdentityResolutionSnapshot } from "../../lib/identities/identityResolution";
import type { ScanArchiveEntry, ScanArchiveSearchIndexPayload } from "../../lib/scanArchive/types";
import { groupScanIdentityContexts, type ScanIdentityContext } from "./dashboardScanIdentity";

export function scanDetailIdentityContexts(row: Pick<GuildScanDetail, "sourceScanId" | "at" | "guildIdentifier" | "server">,
  contexts: readonly ScanIdentityContext[], summaries: readonly GuildHubScanSummary[], revisions?: IdentityResolutionSnapshot["revisions"]) {
  const ref = favoriteReference("guild", row.guildIdentifier, row.server);
  const matching = contexts.filter(context => {
    const standRef = favoriteReference("guild", context.stand.guildIdentifier);
    return row.sourceScanId === context.stand.sourceScanId && row.at === context.stand.scannedAtMs &&
      !!ref && !!standRef && referenceKey(ref) === referenceKey(standRef);
  }).map(context => {
    const source = summaries.find(summary => summary.sourceScanId === context.stand.sourceScanId);
    const stale = context.status === "ready" && (!source || !context.contentHash || source.contentHash !== context.contentHash ||
      !!revisions && (!context.revisions || revisions.players !== context.revisions.players || revisions.guilds !== context.revisions.guilds));
    return stale ? { ...context, status: "stale" as const, summary: undefined } : context;
  });
  return groupScanIdentityContexts(matching);
}

export type ScanDetailsGuild = { name: string; server: string; guildId: string; logoIdentifier?: string | null };
export type ScanDetailsStand = { sourceScanId: string; scannedAtMs: number; guildIdentifier?: string | null };
export type GuildScanDetail = {
  key: string; at: number | null; guildName: string; guildIdentifier: string | null; server: string;
  sourceScanId: string | null; filename: string | null; local: boolean; userScan: boolean; enabled: boolean;
  archiveIds: string[]; importedAt: string | null; memberCount: number | null; hofRank: number | null;
  filePlayers: number | null; fileGuilds: number | null; snapshots: number | null;
  current: boolean; comparisons: string[];
};
export type CachedGuildScanIndex = { entry: ScanArchiveEntry; payload: ScanArchiveSearchIndexPayload };

/** Resolve the complete persisted identity using the same server-qualified
 * reference normalization as source observations (f28_net = F28, s3_eu = EU3).
 * Identity-store keys deliberately preserve their original spelling. */
export function buildScanDetailsGuildScope(guild: ScanDetailsGuild, identities: Pick<IdentityResolutionSnapshot, "guilds"> | null) {
  const target = favoriteReference("guild", guild.logoIdentifier || guild.guildId, guild.server);
  const references = new Map<string, NonNullable<typeof target>>();
  if (target) references.set(referenceKey(target), target);
  const groupsByReference = new Map<string, Set<string>>();
  for (const group of identities?.guilds.byIdentityId.values() ?? []) for (const alias of group.aliases) {
    const ref = favoriteReference("guild", alias.identifier);
    if (!ref) continue;
    const key = referenceKey(ref);
    if (!groupsByReference.has(key)) groupsByReference.set(key, new Set());
    groupsByReference.get(key)!.add(group.identityId);
  }
  const pending = [...references.keys()], visited = new Set<string>();
  for (let i = 0; i < pending.length; i++) for (const identityId of groupsByReference.get(pending[i]) ?? []) {
    const group = identities?.guilds.byIdentityId.get(identityId);
    if (!group || visited.has(group.identityId)) continue;
    visited.add(group.identityId);
    for (const alias of group.aliases) {
      const ref = favoriteReference("guild", alias.identifier);
      if (!ref || references.has(referenceKey(ref))) continue;
      references.set(referenceKey(ref), ref);
      pending.push(referenceKey(ref));
    }
  }
  return {
    references: [...references.values()],
    matches: (identifier: string | null, server: string) => {
      const ref = favoriteReference("guild", identifier, server);
      return !!ref && references.has(referenceKey(ref));
    },
  };
}

export function matchesScanDetailsGuild(identifier: string | null, server: string, guild: ScanDetailsGuild, identities: Pick<IdentityResolutionSnapshot, "guilds"> | null) {
  return buildScanDetailsGuildScope(guild, identities).matches(identifier, server);
}

function observationTime(summary: GuildHubScanSummary, guild: GuildHubLocalGuildIdentity) {
  const at = Date.parse(guild.sourceScannedAt ?? "");
  if (Number.isFinite(at)) return at;
  // A file with several observations does not prove this guild at every time.
  const fallback = summary.lastSnapshotTimestamp ?? Date.parse(summary.scannedAt ?? "");
  return Number.isFinite(fallback) && fallback! > 0 ? fallback : null;
}

export function buildGuildScanDetails(input: {
  guild: ScanDetailsGuild; summaries: readonly GuildHubScanSummary[];
  identities: Pick<IdentityResolutionSnapshot, "guilds"> | null;
  cachedIndexes?: readonly CachedGuildScanIndex[]; current: ScanDetailsStand;
  currentGuild?: { name: string; server: string; memberCount: number | null; hofRank: number | null };
  comparisons: readonly (ScanDetailsStand & { label: string })[];
}): GuildScanDetail[] {
  const rows: GuildScanDetail[] = [];
  const seen = new Set<string>();
  const { matches } = buildScanDetailsGuildScope(input.guild, input.identities);
  const archiveIdsFor = (summary: GuildHubScanSummary) => {
    const ids = new Set<string>();
    if (summary.archiveSource) ids.add(summary.archiveSource.archiveScanId);
    for (const binding of summary.archiveBindings ?? []) if (binding.localScanId === summary.sourceScanId && binding.localContentHash === summary.contentHash) ids.add(binding.archiveScanId);
    return [...ids];
  };
  for (const summary of input.summaries) for (const guild of summary.guilds) {
    const identifier = guild.guildIdentifier ?? guild.guildId;
    if (!matches(identifier, guild.server)) continue;
    const at = observationTime(summary, guild);
    const ref = favoriteReference("guild", identifier, guild.server);
    const key = JSON.stringify([summary.sourceScanId, at, ref ? referenceKey(ref) : identifier]);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ key, at, guildName: guild.name, guildIdentifier: identifier, server: guild.server,
      sourceScanId: summary.sourceScanId, filename: guild.sourceScanFilename ?? summary.filename,
      local: true, userScan: !summary.archiveSource, enabled: isGuildHubScanAnalyticsEnabled(summary), archiveIds: archiveIdsFor(summary),
      importedAt: guild.sourceImportedAt ?? summary.importedAtIso, memberCount: guild.memberCount,
      hofRank: guild.hofRank, filePlayers: summary.playerCount, fileGuilds: summary.guildCount,
      snapshots: summary.logicalScanCount, current: false, comparisons: [] });
  }
  // Merged summaries retain only the latest guild metadata. Historical slices
  // prove membership at additional times without attributing every file time.
  for (const summary of input.summaries) for (const slice of summary.fusionInventorySlices ?? []) {
    for (const identifier of slice.guildIdentifiers ?? []) {
      if (!matches(identifier, slice.server) || !Number.isFinite(slice.timestampMs)) continue;
      const ref = favoriteReference("guild", identifier, slice.server);
      const key = JSON.stringify([summary.sourceScanId, slice.timestampMs, ref ? referenceKey(ref) : identifier]);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ key, at: slice.timestampMs, guildName: identifier, guildIdentifier: identifier, server: slice.server,
        sourceScanId: summary.sourceScanId, filename: slice.sourceScanFilename, local: true, userScan: !summary.archiveSource,
        enabled: isGuildHubScanAnalyticsEnabled(summary), archiveIds: archiveIdsFor(summary), importedAt: slice.sourceImportedAt,
        memberCount: null, hofRank: null, filePlayers: summary.playerCount, fileGuilds: summary.guildCount,
        snapshots: summary.logicalScanCount, current: false, comparisons: [] });
    }
  }
  // The exact observations already consumed by the dashboard are also evidence;
  // do not substitute a merged file's latest timestamp for an addressed stand.
  for (const stand of [input.current, ...input.comparisons]) {
    if (rows.some(row => row.sourceScanId === stand.sourceScanId && row.at === stand.scannedAtMs)) continue;
    const summary = input.summaries.find(item => item.sourceScanId === stand.sourceScanId);
    if (!summary) continue;
    const currentGuild = stand === input.current ? input.currentGuild : null;
    if (!currentGuild && !stand.guildIdentifier) continue;
    rows.push({ key: JSON.stringify(["used", stand.sourceScanId, stand.scannedAtMs, stand.guildIdentifier]),
      at: stand.scannedAtMs, guildName: currentGuild?.name ?? stand.guildIdentifier!,
      guildIdentifier: stand.guildIdentifier ?? null, server: currentGuild?.server ?? favoriteReference("guild", stand.guildIdentifier)?.serverNamespace ?? input.guild.server,
      sourceScanId: stand.sourceScanId, filename: summary.filename, local: true, userScan: !summary.archiveSource,
      enabled: isGuildHubScanAnalyticsEnabled(summary), archiveIds: archiveIdsFor(summary), importedAt: summary.importedAtIso,
      memberCount: currentGuild?.memberCount ?? null, hofRank: currentGuild?.hofRank ?? null,
      filePlayers: summary.playerCount, fileGuilds: summary.guildCount, snapshots: summary.logicalScanCount,
      current: false, comparisons: [] });
  }
  for (const { entry, payload } of input.cachedIndexes ?? []) for (const guild of payload.guilds) {
    if (!matches(guild.identifier, entry.server)) continue;
    // Reuse the existing explicit archive binding, never a timestamp-only join.
    const local = rows.filter(row => row.at === entry.timestamp && row.archiveIds.includes(entry.id) && input.summaries.some(summary => summary.sourceScanId === row.sourceScanId && (
      summary.archiveSource?.archiveScanId === entry.id && summary.archiveSource.sha256.toLowerCase() === entry.sha256.toLowerCase() ||
      summary.archiveBindings?.some(b => b.archiveScanId === entry.id && b.sha256.toLowerCase() === entry.sha256.toLowerCase() && b.localContentHash === summary.contentHash && b.localScanId === summary.sourceScanId)
    )));
    if (local.length) continue;
    const key = JSON.stringify(["archive", entry.id, entry.sha256, entry.timestamp, guild.identifier]);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ key, at: entry.timestamp, guildName: guild.name, guildIdentifier: guild.identifier,
      server: entry.server, sourceScanId: null, filename: entry.path, local: false, userScan: false, enabled: false,
      archiveIds: [entry.id], importedAt: null, memberCount: null, hofRank: null,
      filePlayers: entry.playerCount, fileGuilds: entry.groupCount, snapshots: null,
      current: false, comparisons: [] });
  }
  const sameReference = (left: string | null, right: string, server: string) => {
    const a = favoriteReference("guild", left, server), b = favoriteReference("guild", right, server);
    return !!a && !!b && referenceKey(a) === referenceKey(b);
  };
  const isStand = (row: GuildScanDetail, stand: ScanDetailsStand) => row.local && row.sourceScanId === stand.sourceScanId && row.at === stand.scannedAtMs && (!stand.guildIdentifier || sameReference(row.guildIdentifier, stand.guildIdentifier, row.server));
  for (const row of rows) {
    row.current = isStand(row, input.current);
    row.comparisons = input.comparisons.filter(stand => isStand(row, stand)).map(stand => stand.label);
  }
  return rows.sort((a, b) => (b.at ?? 0) - (a.at ?? 0) || a.key.localeCompare(b.key));
}
