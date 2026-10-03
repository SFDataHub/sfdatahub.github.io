import {
  deleteSfDataHubLocalToplistSnapshotRecord,
  getSfDataHubLocalToplistSnapshotRecord,
  listSfDataHubLocalToplistSnapshotRecords,
  putSfDataHubLocalToplistSnapshotRecord,
  type GuildHubLocalToplistSnapshotRecord,
} from "../guilds/localScanLibrary";
import type {
  LocalToplistIssue,
} from "./localToplistTypes";
import type { LocalToplistDerivedSnapshotPayload } from "./localToplistWorkerTypes";

export const LOCAL_TOPLIST_DERIVATION_VERSION = 3;

export type LocalToplistSnapshotCacheIdentity = {
  derivationVersion?: number;
  archiveScanId: string;
  archiveSha256: string;
};

export type LocalToplistSnapshotCacheExpectation = LocalToplistSnapshotCacheIdentity & {
  manifestYear: number;
  server: string;
  scanTimestamp: number;
  localScanId: string;
  localContentHash: string;
};

export type LocalToplistCacheValidationIssue =
  | "missing"
  | "archive-scan-id-mismatch"
  | "archive-sha-mismatch"
  | "derivation-version-mismatch"
  | "manifest-year-mismatch"
  | "server-mismatch"
  | "timestamp-mismatch"
  | "local-scan-id-mismatch"
  | "local-content-hash-mismatch"
  | "invalid-structure";

export type LocalToplistSnapshotCacheLookup =
  | {
      status: "hit";
      record: GuildHubLocalToplistSnapshotRecord;
    }
  | {
      status: "miss";
      cacheKey: string;
      reason: LocalToplistCacheValidationIssue;
    };

const normalizeSha = (value: string) => value.trim().toLowerCase();

export const localToplistSnapshotCacheKey = (identity: LocalToplistSnapshotCacheIdentity) =>
  `${identity.archiveScanId.trim()}:${normalizeSha(identity.archiveSha256)}:${identity.derivationVersion ?? LOCAL_TOPLIST_DERIVATION_VERSION}`;

export const localToplistDatasetId = (
  entries: readonly { id: string; sha256: string }[],
  derivationVersion = LOCAL_TOPLIST_DERIVATION_VERSION,
) =>
  [
    `derivation:${derivationVersion}`,
    ...entries.map((entry) => `${entry.id.trim()}:${normalizeSha(entry.sha256)}`).sort(),
  ].join("|");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasValidSnapshotStructure = (record: GuildHubLocalToplistSnapshotRecord | null) =>
  Boolean(
    record &&
      typeof record.key === "string" &&
      Number.isInteger(record.derivationVersion) &&
      typeof record.archiveScanId === "string" &&
      typeof record.archiveSha256 === "string" &&
      typeof record.server === "string" &&
      Number.isFinite(record.scanTimestamp) &&
      typeof record.localScanId === "string" &&
      typeof record.localContentHash === "string" &&
      Array.isArray(record.playerRows) &&
      Array.isArray(record.guildRows) &&
      isRecord(record.snapshotMeta) &&
      Array.isArray(record.issues),
  );

export async function getLocalToplistSnapshot(
  expectation: LocalToplistSnapshotCacheExpectation,
): Promise<LocalToplistSnapshotCacheLookup> {
  const derivationVersion = expectation.derivationVersion ?? LOCAL_TOPLIST_DERIVATION_VERSION;
  const cacheKey = localToplistSnapshotCacheKey({ ...expectation, derivationVersion });
  const record = await getSfDataHubLocalToplistSnapshotRecord(cacheKey);
  if (!record) return { status: "miss", cacheKey, reason: "missing" };
  if (!hasValidSnapshotStructure(record)) return { status: "miss", cacheKey, reason: "invalid-structure" };
  if (record.archiveScanId !== expectation.archiveScanId) return { status: "miss", cacheKey, reason: "archive-scan-id-mismatch" };
  if (normalizeSha(record.archiveSha256) !== normalizeSha(expectation.archiveSha256)) return { status: "miss", cacheKey, reason: "archive-sha-mismatch" };
  if (record.derivationVersion !== derivationVersion) return { status: "miss", cacheKey, reason: "derivation-version-mismatch" };
  if (record.manifestYear !== expectation.manifestYear) return { status: "miss", cacheKey, reason: "manifest-year-mismatch" };
  if (record.server !== expectation.server) return { status: "miss", cacheKey, reason: "server-mismatch" };
  if (record.scanTimestamp !== expectation.scanTimestamp) return { status: "miss", cacheKey, reason: "timestamp-mismatch" };
  if (record.localScanId !== expectation.localScanId) return { status: "miss", cacheKey, reason: "local-scan-id-mismatch" };
  if (record.localContentHash !== expectation.localContentHash) return { status: "miss", cacheKey, reason: "local-content-hash-mismatch" };
  return { status: "hit", record };
}

export async function putLocalToplistSnapshot(
  payload: LocalToplistDerivedSnapshotPayload,
  options: { derivationVersion?: number } = {},
) {
  const derivationVersion = options.derivationVersion ?? LOCAL_TOPLIST_DERIVATION_VERSION;
  const cacheKey = localToplistSnapshotCacheKey({
    archiveScanId: payload.archiveScanId,
    archiveSha256: payload.archiveSha256,
    derivationVersion,
  });
  const now = new Date().toISOString();
  return putSfDataHubLocalToplistSnapshotRecord({
    key: cacheKey,
    derivationVersion,
    manifestYear: payload.manifestYear,
    archiveScanId: payload.archiveScanId,
    archiveSha256: normalizeSha(payload.archiveSha256),
    server: payload.server,
    scanTimestamp: payload.scanTimestamp,
    localScanId: payload.localScanId,
    localContentHash: payload.localContentHash,
    playerRows: payload.playerRows,
    guildRows: payload.guildRows,
    snapshotMeta: payload.snapshotMeta,
    issues: payload.issues,
    createdAt: now,
    updatedAt: now,
  });
}

export async function deleteLocalToplistSnapshot(identity: LocalToplistSnapshotCacheIdentity) {
  await deleteSfDataHubLocalToplistSnapshotRecord(localToplistSnapshotCacheKey(identity));
}

export async function listLocalToplistSnapshots() {
  return listSfDataHubLocalToplistSnapshotRecords();
}

export const cacheIssueToToplistIssue = (
  expectation: LocalToplistSnapshotCacheExpectation,
  reason: LocalToplistCacheValidationIssue,
): LocalToplistIssue => ({
  code: "raw-scan-mismatch",
  severity: "warning",
  message: `Derived-Cache-Miss: ${reason}`,
  server: expectation.server,
  archiveScanId: expectation.archiveScanId,
});
