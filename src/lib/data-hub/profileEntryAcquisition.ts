import { loadScanArchiveCatalog, loadScanArchiveManifestEntries } from "../scanArchive/client";
import { resolveScanArchiveCurrentToplistScan } from "../scanArchive/toplistSelection";
import { collectScanArchiveEntriesFromToplistSelections, loadScanArchiveSearchIndexSet } from "../scanArchive/searchIndexService";
import { acquireExplicitLocalFirstArchiveScans } from "../scanArchive/localFirstScanAcquisition";
import { getGuildHubLocalScan, readDataHubLocalScanMetadata } from "../guilds/localScanLibrary";
import { loadIdentityResolutionSnapshot, resolvePlayerIdentity } from "../identities/identityResolution";
import { resolveObservedGuildIdentity } from "../identities/guildObservationIdentity";
import { favoriteReference, referenceKey, type FavoriteKind, type FavoriteReference } from "./hubFavoritesContract";
import type { ParsedObservation } from "./routes";

export class ProfileEntryAcquisitionError extends Error {
  constructor(public code: "missing" | "historicalMissing" | "failed" | "changed") { super(code); }
}

/** Called only after local resolution misses. Index evidence chooses physical
 * sources; the ordinary profile reader still validates the imported observation.
 * A rebound local ID is accepted only with the original content hash or binding. */
export async function acquireProfileEntrySource(kind: FavoriteKind, reference: FavoriteReference,
  observation: ParsedObservation, signal: AbortSignal): Promise<ParsedObservation> {
  signal.throwIfAborted();
  if (observation.kind === "invalid") return observation;
  const metadata = await readDataHubLocalScanMetadata({ includeContentHashes: true });
  signal.throwIfAborted();
  const exact = observation.kind === "exact" ? observation.anchor : null;
  const rebound = (source: string): ParsedObservation => exact ? { kind: "exact", anchor: { ...exact, source,
    ...(exact.snapshot ? { snapshot: `${source}::${exact.at}` } : {}) } } : observation;
  if (exact) {
    if (metadata.sourceIds.includes(exact.source)) return observation;
    const same = exact.hash && metadata.summaries.find(s => s.contentHash === exact.hash &&
      metadata.sourceContentHashes?.get(s.sourceScanId) === exact.hash && s.snapshotTimestamps.includes(exact.at));
    if (same) return rebound(same.sourceScanId);
  }
  const binding = exact && metadata.bindings.find(b => b.localScanId === exact.source);
  const catalog = binding ? null : await loadScanArchiveCatalog({ signal });
  const archives = binding ? [{ year: binding.archiveYear, active: true, manifestUrl: binding.manifestUrl }]
    : catalog!.archives.filter(a => exact ? a.year === new Date(exact.at).getUTCFullYear() : a.active);
  const loaded = await Promise.all(archives.map(a => loadScanArchiveManifestEntries(a, { signal })));
  signal.throwIfAborted();
  const identities = await loadIdentityResolutionSnapshot();
  const identity = kind === "player" ? resolvePlayerIdentity(identities, reference.identifier)
    : resolveObservedGuildIdentity(identities, reference.identifier, reference.serverNamespace);
  const refs = [reference, ...identity.aliasIdentifiers.flatMap(id => {
    const ref = favoriteReference(kind, id); return ref ? [ref] : [];
  })].filter(ref => kind === "player" || ref.serverNamespace === reference.serverNamespace);
  const wanted = new Set(refs.map(referenceKey));
  let entries;
  if (exact) {
    entries = loaded.flatMap(l => l.entries).filter(e => binding
      ? e.id === binding.archiveScanId && e.sha256 === binding.sha256
      : !!exact.hash && refs.some(ref => favoriteReference(kind, "1", e.server)?.serverNamespace === ref.serverNamespace) &&
        new Date(e.timestamp).toISOString().slice(0, 7) === new Date(exact.at).toISOString().slice(0, 7));
  } else {
    const manifests = loaded.map(l => l.manifest);
    const servers = [...new Set(manifests.flatMap(m => Object.keys(m.toplists?.current ?? {})))].filter(server =>
      refs.some(ref => favoriteReference(kind, "1", server)?.serverNamespace === ref.serverNamespace));
    const selections = servers.map(server => resolveScanArchiveCurrentToplistScan(manifests, server));
    if (selections.some(s => s.status === "conflict")) throw new ProfileEntryAcquisitionError("changed");
    entries = collectScanArchiveEntriesFromToplistSelections(selections,
      Object.fromEntries(archives.map(a => [a.year, a.manifestUrl])));
  }
  if (!entries.length) throw new ProfileEntryAcquisitionError(exact ? "historicalMissing" : "missing");
  const indexes = await loadScanArchiveSearchIndexSet(entries, { signal, auditConsumerArea: "profile-direct-entry" });
  signal.throwIfAborted();
  if (indexes.failedIndexes.length) throw new ProfileEntryAcquisitionError("failed");
  const hits = indexes.searchSet.getOccurrences().filter(hit => {
    const ref = favoriteReference(kind, hit.identifier, hit.server);
    return hit.kind === kind && ref && wanted.has(referenceKey(ref));
  }).sort((a, b) => b.scanTimestamp - a.scanTimestamp || a.archiveScanId.localeCompare(b.archiveScanId));
  if (!hits.length) throw new ProfileEntryAcquisitionError(exact ? "historicalMissing" : "missing");
  const chosen = exact ? entries.filter(e => hits.some(h => h.archiveScanId === e.id))
    : entries.filter(e => e.id === hits[0].archiveScanId || e.toplistSetKey && e.toplistSetKey ===
      entries.find(entry => entry.id === hits[0].archiveScanId)?.toplistSetKey);
  const acquired = await acquireExplicitLocalFirstArchiveScans(chosen, { signal });
  signal.throwIfAborted();
  if (acquired.status !== "complete") throw new ProfileEntryAcquisitionError("failed");
  if (!exact) return observation;
  for (const selected of acquired.selectedArchives) {
    const scan = await getGuildHubLocalScan(selected.localScanId);
    signal.throwIfAborted();
    if (scan && (!exact.hash || scan.contentHash === exact.hash) &&
      (binding ? selected.archiveScanId === binding.archiveScanId : !!exact.hash)) return rebound(scan.id);
  }
  throw new ProfileEntryAcquisitionError("historicalMissing");
}
