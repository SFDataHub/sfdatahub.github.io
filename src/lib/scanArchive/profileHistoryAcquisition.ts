import { loadScanArchiveCatalog, loadScanArchiveManifestEntries } from "./client";
import { acquireExplicitLocalFirstArchiveScans } from "./localFirstScanAcquisition";
import { resolveScanArchiveMonthlyToplistScan, scanArchiveMonthlyOptions } from "./toplistSelection";
import { loadIdentityResolutionSnapshot, resolvePlayerIdentity } from "../identities/identityResolution";
import { favoriteReference, type FavoriteReference } from "../data-hub/hubFavoritesContract";
import { toScanArchiveEntries } from "./validation";
import type { ScanArchiveEntry } from "./types";

/** Only declared sets for the selected player's proven server references. Raw
 * acquisition keeps binding reuse, supplemental files and completeness rules. */
export async function acquireProfileArchiveHistory(reference: FavoriteReference, at: number, allowed: () => boolean) {
  const catalog = await loadScanArchiveCatalog();
  const [loaded, identities] = await Promise.all([
    Promise.all(catalog.archives.filter(a => a.active).map(async archive => ({
      ...await loadScanArchiveManifestEntries(archive), url: archive.manifestUrl,
    }))),
    loadIdentityResolutionSnapshot(),
  ]);
  if (!allowed()) return;
  const identity = resolvePlayerIdentity(identities, reference.identifier);
  const refs = [reference, ...identity.aliasIdentifiers.flatMap(id => {
    const ref = favoriteReference("player", id); return ref ? [ref] : [];
  })];
  const namespaces = new Set(refs.map(r => r.serverNamespace));
  const manifests = loaded.map(row => row.manifest);
  const entries = new Map<string, ScanArchiveEntry>();
  const lastMonth = new Date(at).toISOString().slice(0, 7);
  for (const month of scanArchiveMonthlyOptions(manifests).filter(month => month <= lastMonth)) {
    const servers = new Set(manifests.flatMap(m => Object.keys(m.toplists?.monthly?.[month] ?? {})));
    for (const server of servers) {
      const ref = favoriteReference("player", "1", server);
      if (!ref || !namespaces.has(ref.serverNamespace)) continue;
      const selection = resolveScanArchiveMonthlyToplistScan(manifests, server, month);
      if (selection.status !== "selected") continue;
      const url = loaded.find(row => row.manifest === selection.manifest)!.url;
      const ids = new Set(selection.scans.map(scan => scan.id));
      for (const entry of toScanArchiveEntries(selection.manifest, url).filter(entry => ids.has(entry.id))) {
        entries.set(`${entry.id}:${entry.sha256}`, entry);
      }
    }
  }
  if (allowed() && entries.size) return acquireExplicitLocalFirstArchiveScans([...entries.values()]);
}
