import type { HubSearchAppearance } from "../data-hub/hubSearchAppearance";

export const SCAN_ARCHIVE_SEARCH_SCHEMA_VERSION = 2;
export type ScanArchiveSearchSchemaVersion = 1 | typeof SCAN_ARCHIVE_SEARCH_SCHEMA_VERSION;

export type ScanArchiveCatalogEntry = {
  year: number;
  active: boolean;
  manifestUrl: string;
};

export type ScanArchiveCatalog = {
  schemaVersion: 1;
  archives: ScanArchiveCatalogEntry[];
};

export type ScanArchiveManifestScan = {
  id: string;
  server: string;
  timestamp: number;
  timestampUtc?: string;
  path: string;
  format: string;
  compression: "gzip";
  sha256: string;
  compressedBytes: number;
  uncompressedBytes: number;
  playerCount: number;
  groupCount: number;
  searchIndex?: ScanArchiveSearchIndexMetadata;
};

export type ScanArchiveSearchIndexMetadata = {
  schemaVersion: ScanArchiveSearchSchemaVersion;
  path: string;
  sha256: string;
  compressedBytes: number;
  uncompressedBytes: number;
  playerCount: number;
  groupCount: number;
};

export type ScanArchiveToplistsManifest = {
  schemaVersion: 1;
  current?: Record<string, ScanArchiveToplistReference>;
  monthly?: Record<string, Record<string, ScanArchiveToplistReference>>;
};

export type ScanArchiveToplistReference =
  | string
  | {
      scanIds: string[];
    };

export type ScanArchiveRankingMetadata = {
  schemaVersion: 1 | 2;
  path: string;
  sha256: string;
  compressedBytes: number;
  uncompressedBytes: number;
  cohortId: string;
  playerCount: number;
  guildCount: number;
};

export type ScanArchiveManifest = {
  schemaVersion: 1;
  archiveYear: number;
  revision: number;
  updatedAt: string;
  scanCount: number;
  serverCount: number;
  scans: ScanArchiveManifestScan[];
  toplists?: ScanArchiveToplistsManifest;
  rankings?: Record<string, Record<string, ScanArchiveRankingMetadata>>;
};

export type ScanArchiveEntry = ScanArchiveManifestScan & {
  archiveYear: number;
  manifestRevision: number;
  manifestUrl: string;
  fileUrl: string;
  /** Explicit manifest memberships only; passive metadata, not a toplist selection. */
  monthlySets?: readonly { key: string; scanIds: readonly string[]; members: readonly Pick<ScanArchiveManifestScan, "id" | "server" | "timestamp" | "sha256" | "playerCount" | "groupCount">[] }[];
  toplistSetKey?: string;
  toplistSetScanIds?: string[];
};

export type ScanArchiveSourceMetadata = {
  provider: "scan-archive";
  archiveScanId: string;
  archiveYear: number;
  manifestRevision: number;
  manifestUrl: string;
  path: string;
  sha256: string;
  server: string;
  timestamp: number;
};

export type ScanArchiveSearchIndexPlayerEntry = {
  appearance?: HubSearchAppearance;
  identifier: string;
  name: string;
  guildIdentifier?: string | null;
  guildName?: string | null;
  classId?: string | number | null;
};

export type ScanArchiveSearchIndexGuildEntry = {
  appearance?: HubSearchAppearance;
  identifier: string;
  name: string;
};

export type ScanArchiveSearchIndexPayload = {
  schemaVersion: ScanArchiveSearchSchemaVersion;
  archiveScanId: string;
  sourceSha256: string;
  server: string;
  timestamp: number;
  players: ScanArchiveSearchIndexPlayerEntry[];
  guilds: ScanArchiveSearchIndexGuildEntry[];
};
