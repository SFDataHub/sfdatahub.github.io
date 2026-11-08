import { resolveObservedGuildIdentity } from "../identities/guildObservationIdentity";
import React from "react";
import { normalizeSelectedGuild } from "./useGuildFavoritesSelection";
import { useLocation, useParams } from "react-router-dom";
import { favoriteReference, referenceKey, type FavoriteReference } from "./hubFavoritesContract";
import { parseLocalEntity, parseObservation, type ParsedObservation } from "./routes";
import { pageContextStore, pageGuildReference, type GuildFeatureKey } from "./pageContextStore";
import { isGuildHubFavoriteScanSummaryCurrent, readDataHubLocalScanMetadata } from "../guilds/localScanLibrary";
import { subscribeToLocalDataDependencies } from "../local-data/localDataDependencies";
import { loadIdentityResolutionSnapshot } from "../identities/identityResolution";

/** Shared local artwork/navigation lookup; uses the addressed guild's existing identity rules. */
export async function resolveLocalGuildReference(ref: FavoriteReference, observation: ParsedObservation = { kind: "free" }) {
  if (observation.kind === "invalid") return null;
  const [metadata, identities] = await Promise.all([readDataHubLocalScanMetadata({ includeContentHashes: true }), loadIdentityResolutionSnapshot()]);
  const resolution = resolveObservedGuildIdentity(identities, ref.identifier);
  const references = [ref, ...resolution.aliasIdentifiers.map(id => favoriteReference("guild", id)).filter((r): r is NonNullable<typeof r> => !!r)];
  const candidates = metadata.summaries.filter(s => isGuildHubFavoriteScanSummaryCurrent(s, metadata.sourceContentHashes?.get(s.sourceScanId)))
    .flatMap(s => s.guilds.filter(g => {
      const found = favoriteReference("guild", g.guildIdentifier ?? g.guildId, g.server);
      return found && references.some(r => referenceKey(found) === referenceKey(r)) && found.serverNamespace === ref.serverNamespace;
    }).map(g => ({ s, g })))
    .filter(({ s }) => observation.kind !== "exact" || s.sourceScanId === observation.anchor.source && s.snapshotTimestamps.includes(observation.anchor.at) && (!observation.anchor.hash || s.contentHash === observation.anchor.hash))
    .sort((a, b) => (Date.parse(b.g.sourceScannedAt ?? "") || 0) - (Date.parse(a.g.sourceScannedAt ?? "") || 0) || a.s.sourceScanId.localeCompare(b.s.sourceScanId));
  const candidate = candidates[0];
  if (!candidate) return null;
  return { id: ref.identifier, guildId: ref.entityId, name: candidate.g.name, server: ref.serverNamespace, logoIdentifier: ref.identifier,
    hofRank: candidate.g.hofRank, memberCount: candidate.g.memberCount, coaString: candidate.g.coaString ?? null };
}

export function useAddressedGuild(feature: GuildFeatureKey) {
  const params = useParams(), location = useLocation();
  const addressed = feature === "guild-dashboard" && (params.server !== undefined || params.identifier !== undefined);
  const key = `${params.server}/${params.identifier}${location.search}`;
  const targetReference = parseLocalEntity("guild", params.server, params.identifier);
  const observation = parseObservation(location.search);
  const hintedGuild = React.useMemo(() => normalizeSelectedGuild(location.state?.guildLoadingTarget), [location.state]);
  const hintedReference = hintedGuild && favoriteReference("guild", hintedGuild.logoIdentifier, hintedGuild.server);
  const loadingGuild = addressed && observation.kind === "free" && targetReference && hintedReference && referenceKey(targetReference) === referenceKey(hintedReference) ? hintedGuild : null;
  const [result, setResult] = React.useState<{ key: string; ready: boolean; error: boolean; failure?: "invalid" | "missing" | "failed" }>();
  React.useEffect(() => {
    if (!addressed) return;
    let stopped = false, generation = 0;
    const resolve = async () => {
      const attempt = ++generation;
      const ref = parseLocalEntity("guild", params.server, params.identifier), observation = parseObservation(location.search);
      const failed = (failure: "invalid" | "missing" | "failed") => { if (!stopped && attempt === generation) setResult({ key, ready: false, error: true, failure }); };
      if (!ref || observation.kind === "invalid") { failed("invalid"); return; }
      try {
        const guild = await resolveLocalGuildReference(ref, observation);
        if (stopped || attempt !== generation) return;
        if (!guild) { failed("missing"); return; }
        pageContextStore.selectGuild(feature, pageGuildReference(guild));
        setResult({ key, ready: true, error: false });
      } catch { failed("failed"); }
    };
    void resolve();
    const stop = subscribeToLocalDataDependencies({ allSources: true, allIdentities: true }, () => { void resolve(); }, undefined, { consumer: "addressed-guild-resolution" });
    return () => { stopped = true; generation++; stop(); };
  }, [addressed, params.server, params.identifier, key, feature, location.search]);
  return { addressed, targetReference, loadingGuild, acceptsContextArtwork: observation.kind === "free", failure: addressed && result?.key === key ? result.failure : undefined, ready: !addressed || result?.key === key && result.ready, error: addressed && result?.key === key && result.error };
}
