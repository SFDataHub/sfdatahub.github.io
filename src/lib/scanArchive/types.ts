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
  schemaVersion: 1;
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

export type ScanArchiveManifest = {
  schemaVersion: 1;
  archiveYear: number;
  revision: number;
  updatedAt: string;
  scanCount: number;
  serverCount: number;
  scans: ScanArchiveManifestScan[];
  toplists?: ScanArchiveToplistsManifest;
};

export type ScanArchiveEntry = ScanArchiveManifestScan & {
  archiveYear: number;
  manifestRevision: number;
  manifestUrl: string;
  fileUrl: string;
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
  identifier: string;
  name: string;
  guildIdentifier?: string | null;
  guildName?: string | null;
  classId?: string | number | null;
};

export type ScanArchiveSearchIndexGuildEntry = {
  identifier: string;
  name: string;
};

export type ScanArchiveSearchIndexPayload = {
  schemaVersion: 1;
  archiveScanId: string;
  sourceSha256: string;
  server: string;
  timestamp: number;
  players: ScanArchiveSearchIndexPlayerEntry[];
  guilds: ScanArchiveSearchIndexGuildEntry[];
};
