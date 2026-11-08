import type { FavoriteProjection } from "./hubFavoritesProjection";
import { favoriteReference, referenceKey, type FavoriteDisplay } from "./hubFavoritesContract";
import { readDataHubLocalScanMetadata, isGuildHubFavoriteScanSummaryCurrent, readGuildHubLocalScanForSearch, iterateGuildHubSearchRows } from "../guilds/localScanLibrary";
import { readGuildScanMemberIdentity } from "../guilds/guildScanNormalizer";
import { readSfPlayerStats } from "../parsing/parseSfJson";
import { readHubSearchAppearance } from "./hubSearchAppearance";
import { resolveHubSearchReference } from "./hubSearchReference";

export type FavoriteLocalScan = { observedAtMs: number; sourceScanId: string; display?: FavoriteDisplay };

/** One batch on the shared projection's accepted inventory/identity basis.
 * No writes, cloud calls, profile analytics, or persisted observation hints.
 * Cloud display clocks and completeness never restrict local scan evidence. */
export async function projectFavoriteLocalScans(rows: readonly FavoriteProjection[], metadata: Awaited<ReturnType<typeof readDataHubLocalScanMetadata>>) {
  const targets = rows.filter(row => row.favorite.reference && !row.favorite.referenceIssue && row.identity !== "conflict");
  const keys = new Map(targets.map(row => [row.favorite.id, new Set([row.favorite.reference!.identifier,
    ...(row.identity === "resolved" ? row.aliasIdentifiers ?? [] : [])].flatMap(id => {
      const ref = favoriteReference(row.favorite.kind, id); return ref ? [referenceKey(ref)] : [];
    }))]));
  const servers = new Map(targets.map(row => [row.favorite.id, new Set([...keys.get(row.favorite.id)!].map(key => key.split("::")[0]))]));
  const best = new Map<string, FavoriteLocalScan>();
  const ambiguous = new Set<string>();
  const summaries = metadata.summaries.filter(summary => isGuildHubFavoriteScanSummaryCurrent(summary, metadata.sourceContentHashes?.get(summary.sourceScanId)))
    .sort((a, b) => (b.lastSnapshotTimestamp ?? 0) - (a.lastSnapshotTimestamp ?? 0));
  for (const summary of summaries) {
    const relevant = targets.filter(row => {
      if ((summary.lastSnapshotTimestamp ?? 0) < (best.get(row.favorite.id)?.observedAtMs ?? 0)) return false;
      const inScope = (value: string) => {
        const server = favoriteReference(row.favorite.kind, "1", value)?.serverNamespace;
        return !server || servers.get(row.favorite.id)!.has(server);
      };
      if (row.favorite.kind === "guild") {
        if (summary.guilds.some(guild => {
          const ref = favoriteReference("guild", guild.guildIdentifier ?? guild.guildId, guild.server);
          return ref && keys.get(row.favorite.id)!.has(referenceKey(ref));
        })) return true;
        return Math.max(summary.groupCount, summary.guildCount) > summary.guilds.length && (!summary.servers.length || summary.servers.some(inScope));
      }
      // The inventory normalizer can omit a row without display fields even
      // though its observation contributes to the source's player count.
      if (summary.fusionInventorySlices?.reduce((sum, slice) => sum + slice.playerCount, 0) !== summary.playerCount) {
        return summary.playerCount > 0 && (!summary.servers.length || summary.servers.some(inScope));
      }
      return summary.fusionInventorySlices?.length ? summary.fusionInventorySlices.some(slice => {
        if (slice.playerIdentifiers?.some(id => {
          const ref = favoriteReference("player", id); return ref && keys.get(row.favorite.id)!.has(referenceKey(ref));
        })) return true;
        // Partial inventories cannot prove absence. Inspect the affected server;
        // the actual row still needs an unambiguous reference.
        return slice.playerCount > (slice.playerIdentifiers?.length ?? 0) && inScope(slice.server);
      }) : summary.playerCount > 0 && (!summary.servers.length || summary.servers.some(inScope));
    });
    if (!relevant.length) continue;
    const scan = await readGuildHubLocalScanForSearch(summary.sourceScanId);
    if (!scan || scan.contentHash !== summary.contentHash) continue;
    let count = 0;
    for (const row of iterateGuildHubSearchRows(scan)) {
      if (++count % 512 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
      // Shared/file/import clocks are not individual player observations.
      if (!row || row.timeQuality !== "observation" || !row.at || !summary.snapshotTimestamps.includes(row.at)) continue;
      const { reference } = resolveHubSearchReference(row.kind, row.raw, row.serverContext);
      if (!reference) continue;
      const matching = relevant.filter(target => target.favorite.kind === row.kind && keys.get(target.favorite.id)!.has(referenceKey(reference)) && row.at! >= (best.get(target.favorite.id)?.observedAtMs ?? 0));
      if (!matching.length) continue;
      if (row.kind === "guild") {
        for (const target of matching) best.set(target.favorite.id, { observedAtMs: row.at, sourceScanId: scan.id });
        continue;
      }
      const member = readGuildScanMemberIdentity(row.raw, row.serverContext);
      const stats = readSfPlayerStats(row.raw), appearance = readHubSearchAppearance("player", row.raw);
      const level = typeof stats.level === "number" && Number.isSafeInteger(stats.level) && stats.level > 0 ? stats.level : null;
      const display: FavoriteDisplay = { name: member?.name || null, server: reference.serverNamespace,
        className: appearance.classId ? String(appearance.classId) : null, level, levelLabel: level === null ? undefined : String(level),
        guildName: member?.guildName, appearance, observedAtMs: row.at };
      for (const target of matching) {
        const id = target.favorite.id, previous = best.get(id);
        if (!previous || previous.observedAtMs < row.at) {
          best.set(id, { observedAtMs: row.at, sourceScanId: scan.id, display }); ambiguous.delete(id);
        } else if (JSON.stringify(previous.display) !== JSON.stringify(display)) ambiguous.add(id);
      }
    }
  }
  // Equal-time conflicting card data cannot select a portrait/name, but both
  // independently prove the same local player observation timestamp.
  for (const id of ambiguous) delete best.get(id)!.display;
  return best;
}

/** Fill missing artwork from the portable card, without altering that card or its anchors. */
export function favoritePlayerDisplay(row: FavoriteProjection) {
  const local = row.playerScan?.display;
  if (!local || row.favorite.historicalAt) return row.favorite;
  const saved = row.favorite.display;
  return { ...row.favorite, display: { ...saved, ...Object.fromEntries(Object.entries(local).filter(([, value]) => value != null)),
    appearance: local.appearance ? { ...saved.appearance, ...local.appearance, portrait: local.appearance.portrait ?? saved.appearance?.portrait ?? null } : saved.appearance } };
}
