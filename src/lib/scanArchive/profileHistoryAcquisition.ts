import { loadScanArchiveCatalog, loadScanArchiveManifestEntries } from "./client";
import { acquireExplicitLocalFirstArchiveScans } from "./localFirstScanAcquisition";
import { loadScanArchiveSearchIndexSet } from "./searchIndexService";
import { resolveScanArchiveMonthlyToplistScan, scanArchiveMonthlyOptions } from "./toplistSelection";
import { loadIdentityResolutionSnapshot, resolvePlayerIdentity } from "../identities/identityResolution";
import { resolveObservedGuildIdentity } from "../identities/guildObservationIdentity";
import { favoriteReference, referenceKey, type FavoriteReference } from "../data-hub/hubFavoritesContract";
import { compareComparisonScanAge } from "../player-progress/comparisonScanSelection";
import { toScanArchiveEntries } from "./validation";
import type { ScanArchiveEntry } from "./types";

export type ProfileArchiveHistoryDemand = {
  signal: AbortSignal;
  kind?: "player" | "guild";
  /** The displayed chart interval. Omitted means the automatic comparison. */
  from?: number;
  selectedAt?: number | null;
  all?: boolean;
  /** Additional, confirmed player references needed by guild value comparison. */
  players?: readonly string[];
  /** Existing worker eligibility/completeness selection, after each candidate set. */
  comparisonReady?: () => Promise<boolean>;
  consumer: string;
};

type HistoryReference = FavoriteReference & { kind: "player" | "guild" };
type HistorySet = { month: string; at: number; entries: ScanArchiveEntry[]; refs: HistoryReference[] };

/** A demand owns its queue; physical acquisition owns shared, cancellable sources.
 * Index absence can rule out a candidate, never certify roster completeness. */
export async function acquireProfileArchiveHistory(reference: FavoriteReference, at: number, demand: ProfileArchiveHistoryDemand) {
  const { signal } = demand;
  const kind = demand.kind ?? "player";
  signal.throwIfAborted();
  const catalog = await loadScanArchiveCatalog({ signal });
  const [loaded, identities] = await Promise.all([
    Promise.all(catalog.archives.filter(a => a.active).map(async archive => ({
      ...await loadScanArchiveManifestEntries(archive, { signal }), url: archive.manifestUrl,
    }))),
    loadIdentityResolutionSnapshot(),
  ]);
  signal.throwIfAborted();
  const identity = kind === "player" ? resolvePlayerIdentity(identities, reference.identifier)
    : resolveObservedGuildIdentity(identities, reference.identifier, reference.serverNamespace);
  const refs: HistoryReference[] = [reference, ...identity.aliasIdentifiers.flatMap(id => {
    const ref = favoriteReference(kind, id); return ref ? [ref] : [];
  })].map(ref => ({ ...ref, kind }));
  const playerRefs = (demand.players ?? []).flatMap(id => {
    const resolved = resolvePlayerIdentity(identities, id);
    return [id, ...resolved.aliasIdentifiers].flatMap(alias => {
      const ref = favoriteReference("player", alias); return ref ? [{ ...ref, kind: "player" as const }] : [];
    });
  });
  const allRefs = [...new Map([...refs, ...playerRefs].map(ref => [`${ref.kind}:${referenceKey(ref)}`, ref])).values()];
  const manifests = loaded.map(row => row.manifest), sets: HistorySet[] = [];
  const lastMonth = new Date(at).toISOString().slice(0, 7);
  for (const month of scanArchiveMonthlyOptions(manifests).filter(month => month <= lastMonth)) {
    const servers = new Set(manifests.flatMap(m => Object.keys(m.toplists?.monthly?.[month] ?? {})));
    for (const server of servers) {
      const namespace = favoriteReference("player", "1", server)?.serverNamespace;
      const wanted = allRefs.filter(ref => ref.serverNamespace === namespace);
      if (!wanted.length) continue;
      const selection = resolveScanArchiveMonthlyToplistScan(manifests, server, month);
      if (selection.status !== "selected") continue;
      const url = loaded.find(row => row.manifest === selection.manifest)!.url;
      const ids = new Set(selection.scans.map(scan => scan.id));
      const entries = toScanArchiveEntries(selection.manifest, url).filter(entry => ids.has(entry.id));
      const timestamp = Math.max(...entries.map(entry => entry.timestamp));
      if (timestamp <= at) sets.push({ month, at: timestamp, entries, refs: wanted });
    }
  }
  const selected = new Map<string, ScanArchiveEntry>(), inspected = new Map<HistorySet, boolean>();
  const matches = async (set: HistorySet) => {
    if (inspected.has(set)) return inspected.get(set)!;
    signal.throwIfAborted();
    const indexes = await loadScanArchiveSearchIndexSet(set.entries, { signal, auditConsumerArea: demand.consumer });
    signal.throwIfAborted();
    const wanted = new Set(set.refs.map(ref => `${ref.kind}:${referenceKey(ref)}`));
    const relevant = indexes.failedIndexes.length > 0 || indexes.searchSet.getOccurrences().some(hit => {
      const ref = favoriteReference(hit.kind, hit.identifier, hit.server);
      return ref && wanted.has(`${hit.kind}:${referenceKey(ref)}`);
    });
    inspected.set(set, relevant);
    return relevant;
  };
  const acquire = async (set: HistorySet) => {
    if (!await matches(set)) return;
    // Always acquire the complete declared set, including supplemental files.
    const missing = set.entries.filter(entry => !selected.has(`${entry.id}:${entry.sha256}`));
    if (!missing.length) return;
    signal.throwIfAborted();
    const result = await acquireExplicitLocalFirstArchiveScans(missing, { signal });
    signal.throwIfAborted();
    if (result.status !== "complete") throw Error("Profile archive set incomplete");
    missing.forEach(entry => selected.set(`${entry.id}:${entry.sha256}`, entry));
  };
  const cutoff = demand.selectedAt ?? at - 28 * 86_400_000;
  // Comparisons take precedence over background chart history. The existing
  // worker decides eligibility; only unsuccessful candidates cause expansion.
  const candidates = sets.filter(set => set.at < at && (demand.selectedAt == null || set.at <= demand.selectedAt))
    .sort((a, b) => demand.selectedAt != null ? b.at - a.at : compareComparisonScanAge(a.at, b.at, at));
  if (!demand.all) {
    for (const set of candidates) {
      if (await demand.comparisonReady?.()) break;
      if (!await matches(set)) continue;
      await acquire(set);
      if (!demand.comparisonReady) break;
    }
  }
  const from = demand.all ? 0 : demand.from ?? cutoff;
  for (const set of sets.filter(set => set.at >= from).sort((a, b) => b.at - a.at)) await acquire(set);
  // Trend rates need a real observation before the left edge. Find it through
  // confirmed references, without downloading every older server/month.
  if (kind === "guild" && demand.from != null && !demand.all) {
    const namespaces = new Set(allRefs.map(ref => ref.serverNamespace));
    for (const namespace of namespaces) {
      for (const set of sets.filter(set => set.at < from && set.refs.some(ref => ref.serverNamespace === namespace)).sort((a, b) => b.at - a.at)) {
        if (!await matches(set)) continue;
        await acquire(set); break;
      }
    }
  }
  return { archiveEntries: [...selected.values()] };
}
