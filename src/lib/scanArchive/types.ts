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
};

export type ScanArchiveManifest = {
  schemaVersion: 1;
  archiveYear: number;
  revision: number;
  updatedAt: string;
  scanCount: number;
  serverCount: number;
  scans: ScanArchiveManifestScan[];
};

export type ScanArchiveEntry = ScanArchiveManifestScan & {
  archiveYear: number;
  manifestRevision: number;
  manifestUrl: string;
  fileUrl: string;
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
