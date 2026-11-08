import type { GuildHubScanSummary } from "../guilds/localScanLibrary";
import { resolveObservedGuildIdentity } from "../identities/guildObservationIdentity";
import type { IdentityResolutionSnapshot } from "../identities/identityResolution";
import { favoriteReference, type HubFavorite } from "./hubFavoritesContract";
import type { ObservationAnchor } from "./routes";

export type GuildFavoriteObservation = {
  state: "current" | "stored" | "ambiguous" | "historical";
  effective: HubFavorite;
  evidence?: { sourceScanId: string; observedAtMs: number; contentHash: string }[];
};

export function guildFavoriteAnchor(favorite: HubFavorite): ObservationAnchor | undefined {
  const hint = favorite.kind === "guild" ? favorite.observationHint : undefined;
  return hint?.sourceScanId && hint.observedAtMs != null && Number.isSafeInteger(hint.observedAtMs) && hint.observedAtMs > 0
    ? { source: hint.sourceScanId, at: hint.observedAtMs, ...(hint.contentHash ? { hash: hint.contentHash } : {}) } : undefined;
}

/** Call only with summaries validated against the independent source hashes.
 * The saved record is never changed; all fields come from one observation. */
export function projectGuildFavoriteObservation(favorite: HubFavorite, identityId: string | null,
  identities: IdentityResolutionSnapshot, summaries: readonly GuildHubScanSummary[]): GuildFavoriteObservation {
  if (favorite.historicalAt || guildFavoriteAnchor(favorite)) return { state: "historical", effective: favorite };
  if (!identityId) return { state: "stored", effective: favorite };
  const candidates: Array<{ effective: HubFavorite; at: number; evidence: NonNullable<GuildFavoriteObservation["evidence"]>[number] }> = [];
  for (const summary of summaries) for (const guild of summary.guilds) {
    const ref = favoriteReference("guild", guild.guildIdentifier ?? guild.guildId, guild.server);
    if (!ref || !summary.contentHash || resolveObservedGuildIdentity(identities, ref.identifier, guild.server).identityId !== identityId) continue;
    const time = Date.parse(guild.sourceScannedAt ?? "");
    // Only a single, exact snapshot can supply a missing guild timestamp.
    const at = Number.isFinite(time) && time > 0 ? time
      : !guild.sourceScannedAt && summary.snapshotTimestamps.length === 1 ? summary.snapshotTimestamps[0] : NaN;
    if (!Number.isSafeInteger(at) || at <= 0 || !summary.snapshotTimestamps.includes(at)) continue;
    const projectedGuild = { id: favorite.guild?.id ?? favorite.id, guildId: guild.guildId,
      name: guild.name ?? "", server: guild.server, logo: ref.identifier, logoIdentifier: ref.identifier,
      coaString: guild.coaString ?? null, hofRank: guild.hofRank ?? null, memberCount: guild.memberCount ?? null, observedAtMs: at };
    candidates.push({ at, effective: { ...favorite, reference: ref, guild: projectedGuild,
      display: { name: guild.name?.trim() || null, server: guild.server, logo: ref.identifier, logoIdentifier: ref.identifier,
        coaString: guild.coaString ?? null, hofRank: guild.hofRank ?? null, memberCount: guild.memberCount ?? null, observedAtMs: at } },
      evidence: { sourceScanId: summary.sourceScanId, observedAtMs: at, contentHash: summary.contentHash } });
  }
  if (!candidates.length) return { state: "stored", effective: favorite };
  const newest = Math.max(...candidates.map(candidate => candidate.at));
  const latest = candidates.filter(candidate => candidate.at === newest);
  const signature = (value: HubFavorite) => JSON.stringify([value.reference, value.display, value.guild]);
  if (latest.some(candidate => signature(candidate.effective) !== signature(latest[0].effective))) return { state: "ambiguous", effective: favorite };
  return { state: "current", effective: latest[0].effective, evidence: latest.map(candidate => candidate.evidence) };
}
