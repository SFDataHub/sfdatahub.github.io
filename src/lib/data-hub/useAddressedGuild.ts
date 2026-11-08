import { acquireProfileEntrySource, ProfileEntryAcquisitionError } from "./profileEntryAcquisition";
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
  const [retry, setRetry] = React.useState(0);
  const [result, setResult] = React.useState<{ key: string; ready: boolean; error: boolean; failure?: "invalid" | "missing" | "failed" | "historicalMissing" | "changed"; observation?: ParsedObservation }>();
  React.useEffect(() => {
    if (!addressed) return;
    setResult({ key, ready: false, error: false });
    const controller = new AbortController(), signal = controller.signal;
    let generation = 0, running = false, pending = false;
    let resolvedObservation = parseObservation(location.search);
    const resolve = async () => {
      pending = true;
      if (running) return;
      running = true;
      try {
        while (pending && !signal.aborted) {
          pending = false;
          const attempt = ++generation;
          const ref = parseLocalEntity("guild", params.server, params.identifier);
          const failed = (failure: NonNullable<typeof result>["failure"]) => {
            if (!signal.aborted && attempt === generation) setResult({ key, ready: false, error: true, failure });
          };
          if (!ref || resolvedObservation.kind === "invalid") { failed("invalid"); return; }
          try {
            let guild = await resolveLocalGuildReference(ref, resolvedObservation);
            signal.throwIfAborted();
            if (!guild) {
              resolvedObservation = await acquireProfileEntrySource("guild", ref, resolvedObservation, signal);
              guild = await resolveLocalGuildReference(ref, resolvedObservation);
            }
            signal.throwIfAborted();
            if (!guild) { failed(resolvedObservation.kind === "exact" ? "historicalMissing" : "missing"); return; }
            const current = pageContextStore.get(feature).guild;
            // Historical imports must not replace the selected context object.
            if (JSON.stringify(current?.guild) !== JSON.stringify(guild)) pageContextStore.selectGuild(feature, pageGuildReference(guild));
            setResult({ key, ready: true, error: false, observation: resolvedObservation });
          } catch (error) { failed(error instanceof ProfileEntryAcquisitionError ? error.code : "failed"); return; }
        }
      } finally { running = false; }
    };
    void resolve();
    const stop = subscribeToLocalDataDependencies({ allSources: true, allIdentities: true }, () => { void resolve(); }, undefined, { consumer: "addressed-guild-resolution" });
    return () => { controller.abort(); generation++; stop(); };
  }, [addressed, params.server, params.identifier, key, feature, location.search, retry]);
  return { retry: () => setRetry(n => n + 1), observation: result?.key === key ? result.observation ?? observation : observation, addressed, targetReference, loadingGuild, acceptsContextArtwork: observation.kind === "free", failure: addressed && result?.key === key ? result.failure : undefined, ready: !addressed || result?.key === key && result.ready, error: addressed && result?.key === key && result.error };
}
