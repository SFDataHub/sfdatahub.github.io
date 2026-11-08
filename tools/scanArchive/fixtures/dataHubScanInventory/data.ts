import type { ScanArchiveEntry } from "../../../../src/lib/scanArchive/types";

export const entry = (id: string, year = 2026, sha = "a"): ScanArchiveEntry => ({
  id, server: "f8_net", timestamp: Date.UTC(year, 8, 20, 12) + [...id].reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0) * 1000, archiveYear: year,
  path: `${id}.json.gz`, sha256: sha.repeat(64), compressedBytes: 10, uncompressedBytes: 20,
  format: "sftools.raw.v1", compression: "gzip", playerCount: 1, groupCount: 1,
  manifestRevision: 1, manifestUrl: `https://inventory.test/${year}/manifest.json`,
  fileUrl: `https://inventory.test/${year}/${id}.json.gz`,
});
export const content = (e: ScanArchiveEntry, name = e.id) => JSON.stringify({
  players: [{ identifier: "f8_net_p1", prefix: e.server, timestamp: e.timestamp, name, own: true, class: 1, level: 100, guildIdentifier: "f8_net_g1", guildName: name }],
  groups: [{ identifier: "f8_net_g1", prefix: e.server, timestamp: e.timestamp, name }],
});
export const catalog = { schemaVersion: 1, archives: [2025, 2026].map(year => ({ year, active: true, manifestUrl: `https://inventory.test/${year}/manifest.json` })) };
export const manifest = (year: number, entries: ScanArchiveEntry[]) => ({ schemaVersion: 1, archiveYear: year, revision: 1,
  updatedAt: "2026-10-06T12:00:00Z", scanCount: entries.length, serverCount: new Set(entries.map(e => e.server)).size, scans: entries });
export const deferred = <T,>() => {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};
