import type { ScanArchiveEntry } from "./types";

/** Display identity shared by Fast Load and scan management. Only explicit
 * manifest membership combines sources; unlinked files always stay separate. */
export function groupScanArchiveEntries(entries: readonly ScanArchiveEntry[]) {
  const physicalKey = (entry: ScanArchiveEntry) => JSON.stringify([entry.manifestUrl, entry.id, entry.sha256.toLowerCase()]);
  const bySource = new Map(entries.map(entry => [physicalKey(entry), entry]));
  const scans = new Map<string, { id: string; entries: ScanArchiveEntry[]; requiredEntries: readonly ScanArchiveEntry[] }>();
  for (const entry of entries) {
    const identities = entry.monthlySets?.length
      ? entry.monthlySets.map(set => ({ id: `monthly:${set.key}`,
          // Metadata for completeness checks, including sources outside a selection.
          requiredEntries: set.members.map(member => {
            const metadata = { ...entry, ...member };
            return bySource.get(physicalKey(metadata)) ?? metadata;
          }) }))
      : [{ id: physicalKey(entry), requiredEntries: [entry] }];
    for (const identity of identities) {
      const scan = scans.get(identity.id);
      if (scan) scan.entries.push(entry);
      else scans.set(identity.id, { ...identity, entries: [entry] });
    }
  }
  return [...scans.values()];
}
