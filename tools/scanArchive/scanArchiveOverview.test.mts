import "fake-indexeddb/auto";
import { acquireExplicitLocalFirstArchiveScans } from "../../src/lib/scanArchive/localFirstScanAcquisition.ts";
import { listSfDataHubScanSummaries } from "../../src/lib/guilds/localScanLibrary.ts";
import assert from "node:assert/strict";
import { archiveDisplayDay, archiveGroupLocalIds, findArchiveOverviewLocal, getArchiveOverviewStatus, groupArchiveOverviewDays } from "../../src/components/ScanManagement/scanArchiveOverview.ts";
import type { GuildHubScanSummary } from "../../src/lib/guilds/localScanLibrary.ts";
import type { ScanArchiveEntry } from "../../src/lib/scanArchive/types.ts";
const entry = (id: string, timestamp: number, server = "f8_net") => ({ id, timestamp, server, archiveYear: 2026, sha256: "a".repeat(64) }) as ScanArchiveEntry;
const a = entry("a", Date.UTC(2026, 8, 30, 22, 5));
const b = entry("b", a.timestamp + 60_000, "F8_NET");
const c = entry("c", Date.UTC(2026, 9, 1, 23));
const set = { key: "explicit-august", scanIds: [a.id, b.id], members: [a, b] };
a.monthlySets = [set]; b.monthlySets = [set];
const scan = { sourceScanId: "one-local-file", contentHash: "local-hash", archiveBindings: [a, b].map(e => ({ archiveScanId: e.id, sha256: e.sha256, archiveYear: e.archiveYear, timestamp: e.timestamp, server: e.server, localScanId: "one-local-file", localContentHash: "local-hash" })) } as GuildHubScanSummary;
assert.equal(archiveDisplayDay(a.timestamp, "Europe/Berlin"), "2026-10-01");
assert.equal(archiveDisplayDay(a.timestamp, "UTC"), "2026-09-30");
assert.equal(findArchiveOverviewLocal(a, [scan]), scan);
assert.equal(findArchiveOverviewLocal({ ...a, sha256: "b".repeat(64) }, [scan]), null);
assert.equal(findArchiveOverviewLocal(a, [{ ...scan, contentHash: "changed" }]), null);
const rows = [a, b, c].map(e => ({ id: e.id, entry: e, localSummary: findArchiveOverviewLocal(e, [scan]) }));
const days = groupArchiveOverviewDays(rows, "Europe/Berlin");
assert.equal(days.length, 2);
const first = days.find(d => d.members.length === 2)!;
assert.equal(first.server, "F8");
assert.equal(first.month, "2026-10");
assert.deepEqual(archiveGroupLocalIds(first.members), ["one-local-file"]);
assert.equal(days[0].members[0].localSummary, null);
assert.deepEqual(days.flatMap(d => d.members.map(m => m.id)).sort(), ["a", "b", "c"]);
const partial = groupArchiveOverviewDays([rows[0], { ...rows[1], localSummary: null }], "Europe/Berlin")[0];
assert.equal(partial.members.filter(m => m.localSummary).length, 1);
assert.deepEqual(archiveGroupLocalIds(partial.members), ["one-local-file"]);
// Explicit sets, not equal dates, are the only display identity.
const unlinked = { ...a, id: "independent-same-time", monthlySets: undefined };
const otherSet = { ...a, id: "other-set", monthlySets: [{ key: "another-set", scanIds: ["other-set"], members: [{ ...a, id: "other-set" }] }] };
const separate = groupArchiveOverviewDays([...rows, ...[unlinked, otherSet].map(entry => ({ id: entry.id, entry, localSummary: null }))]);
assert.equal(separate.length, 4);
assert.deepEqual(separate.map(group => group.members.length).sort(), [1, 1, 1, 2]);
assert.deepEqual(getArchiveOverviewStatus(first, []), { local: false, complete: false, ready: false });
assert.deepEqual(getArchiveOverviewStatus(first, [scan]), { local: true, complete: true, ready: false });
const onlyA = { ...scan, archiveBindings: scan.archiveBindings!.slice(0, 1) };
assert.deepEqual(getArchiveOverviewStatus(first, [onlyA]), { local: true, complete: false, ready: false });
// A filtered/partial selection cannot hide a required source from completeness.
const subset = groupArchiveOverviewDays([rows[0]])[0];
assert.equal(getArchiveOverviewStatus(subset, [onlyA]).complete, false);
const later = { ...b, timestamp: b.timestamp + 86400000 };
const multiDaySet = { ...set, members: [a, later] };
const acrossDays = groupArchiveOverviewDays([a, later].map(entry => ({ id: entry.id, entry: { ...entry, monthlySets: [multiDaySet] }, localSummary: null })));
assert.equal(acrossDays.length, 1);
assert.equal(acrossDays[0].firstTimestamp, a.timestamp);
assert.equal(acrossDays[0].lastTimestamp, later.timestamp);
const fallback = groupArchiveOverviewDays(["local-1", "local-2"].map(id => ({ id, entry: null, localSummary: { ...scan, sourceScanId: id, lastSnapshotTimestamp: a.timestamp, servers: [a.server] } })));
assert.equal(fallback.length, 2);
// Execute the exact acquisition and status helpers used by group Save.
const downloadable = ["saved", "fails"].map((id, i) => ({ ...a, id, server: "f8_net", timestamp: a.timestamp + i * 60_000,
  timestampUtc: new Date(a.timestamp + i * 60_000).toISOString(), manifestRevision: 1, manifestUrl: "https://example.test/manifest.json",
  path: `2026-09/f8_net/${id}.json.gz`, fileUrl: `https://example.test/${id}.json.gz`, format: "sftools.raw.v1", compression: "gzip", compressedBytes: 10, uncompressedBytes: 20, playerCount: 1, groupCount: 0,
})) as ScanArchiveEntry[];
const downloads: string[] = [];
const acquire = (fail: boolean) => acquireExplicitLocalFirstArchiveScans(downloadable, { dependencies: { downloadArchiveEntry: async entry => {
  downloads.push(entry.id);
  if (fail && entry.id === "fails") throw new Error("Download fehlgeschlagen (500)");
  return { content: JSON.stringify({ players: [{ identifier: `f8_net_p${entry.timestamp}`, prefix: "f8_net", timestamp: entry.timestamp, name: "Player" }], groups: [] }) };
} } });
const result = await acquire(true);
assert.equal(result.status, "partial");
assert.deepEqual(result.failedArchives.map(item => item.archiveScanId), ["fails"]);
let summaries = await listSfDataHubScanSummaries();
const members = () => downloadable.map(entry => ({ id: entry.id, entry, localSummary: findArchiveOverviewLocal(entry, summaries) }));
assert.equal(members().filter(row => row.localSummary).length, 1);
assert.equal(archiveGroupLocalIds(members()).length, 1);
downloads.length = 0;
assert.equal((await acquire(false)).status, "complete");
assert.deepEqual(downloads, ["fails"]);
summaries = await listSfDataHubScanSummaries();
assert.equal(members().filter(row => row.localSummary).length, 2);
assert.equal(archiveGroupLocalIds(members()).length, 2);
console.log("scanArchiveOverview.test: ok");
