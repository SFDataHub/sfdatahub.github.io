import type { GuildHubArchiveScanBinding, GuildHubScanSummary } from "../guilds/localScanLibrary";
import { hasCurrentLocalSourceValidity, matchesLocalSourceValidity, type LocalSourceValidity } from "../guilds/localSourceValidity";
import type { ScanArchiveEntry } from "../scanArchive/types";

// Bump whenever validateScanArchivePayload or confirmation semantics change.
// Persisted warm proofs must never survive a changed validation contract.
export const ARCHIVE_READINESS_VERSION = 1;
export type ArchiveReadiness = LocalSourceValidity & {
  version: 1; sourceId: string; contentHash: string; expectation: string; checkedAt: string;
};
export const archivePhysicalKey = (entry: Pick<ScanArchiveEntry, "id" | "sha256">) =>
  JSON.stringify([entry.id, entry.sha256.toLowerCase()]);
// Compressed SHA and local text hash intentionally occupy separate fields.
export const archiveExpectation = (entry: ScanArchiveEntry) => JSON.stringify([
  entry.id, entry.sha256.toLowerCase(), entry.archiveYear, entry.manifestRevision,
  entry.manifestUrl, entry.path, entry.fileUrl, entry.format, entry.compression,
  entry.server, entry.timestamp, entry.playerCount, entry.groupCount,
  entry.compressedBytes, entry.uncompressedBytes, ARCHIVE_READINESS_VERSION,
]);
export function archiveBindingMatchesExpectation(binding: GuildHubArchiveScanBinding, entry: ScanArchiveEntry) {
  return binding.archiveScanId === entry.id && binding.sha256.toLowerCase() === entry.sha256.toLowerCase() &&
    binding.archiveYear === entry.archiveYear && binding.manifestRevision === entry.manifestRevision &&
    binding.manifestUrl === entry.manifestUrl && binding.path === entry.path &&
    binding.server === entry.server && binding.timestamp === entry.timestamp;
}
export function isArchiveReadinessCurrent(binding: GuildHubArchiveScanBinding, summary: GuildHubScanSummary | undefined,
  entry: ScanArchiveEntry, sourceExists: boolean) {
  const p = binding.readiness;
  return Boolean(sourceExists && summary && p?.version === ARCHIVE_READINESS_VERSION &&
    Number.isFinite(Date.parse(p.checkedAt)) && hasCurrentLocalSourceValidity(summary) &&
    archiveBindingMatchesExpectation(binding, entry) && p.expectation === archiveExpectation(entry) &&
    p.sourceId === summary.sourceScanId && binding.localScanId === p.sourceId &&
    p.contentHash === summary.contentHash && binding.localContentHash === p.contentHash &&
    matchesLocalSourceValidity(p, summary));
}
