import type {
  ScanArchiveManifest,
  ScanArchiveManifestScan,
  ScanArchiveSearchIndexMetadata,
} from "./types";
import { normalizeScanArchiveToplistReference } from "./validation";

export type ScanArchiveToplistSelectionRole = "current" | "monthly";

export type ScanArchiveToplistSelectionResult =
  | {
      status: "selected";
      role: ScanArchiveToplistSelectionRole;
      server: string;
      month?: string;
      manifest: ScanArchiveManifest;
      scans: ScanArchiveManifestScan[];
      searchIndexes: ScanArchiveSearchIndexMetadata[];
    }
  | {
      status: "not-defined";
      role: ScanArchiveToplistSelectionRole;
      server: string;
      month?: string;
    }
  | {
      status: "manifest-year-missing";
      role: "monthly";
      server: string;
      month: string;
      archiveYear: number;
    }
  | {
      status: "conflict";
      role: "current";
      server: string;
      code: "current_timestamp_conflict";
      timestamp: number;
      scanIds: string[];
    };

export function resolveScanArchiveCurrentToplistScan(
  manifests: readonly ScanArchiveManifest[],
  server: string,
): ScanArchiveToplistSelectionResult {
  const candidates = manifests
    .flatMap((manifest) => {
      const reference = manifest.toplists?.current?.[server];
      if (!reference) return [];
      const scanById = new Map(manifest.scans.map((item) => [item.id, item] as const));
      const normalized = normalizeScanArchiveToplistReference(reference, scanById);
      const scans = normalized.scanIds.flatMap((scanId) => {
        const scan = scanById.get(scanId);
        return scan?.searchIndex ? [scan] : [];
      });
      return scans.length === normalized.scanIds.length ? [{ manifest, scans }] : [];
    });

  if (!candidates.length) return { status: "not-defined", role: "current", server };

  const latestTimestamp = Math.max(...candidates.map((candidate) => Math.max(...candidate.scans.map((scan) => scan.timestamp))));
  const latest = candidates.filter((candidate) => Math.max(...candidate.scans.map((scan) => scan.timestamp)) === latestTimestamp);
  const uniqueRefs = new Map(latest.map((candidate) => [candidate.scans.map((scan) => `${scan.id}:${scan.sha256}`).join("|"), candidate] as const));
  if (uniqueRefs.size > 1) {
    return {
      status: "conflict",
      role: "current",
      server,
      code: "current_timestamp_conflict",
      timestamp: latestTimestamp,
      scanIds: [...new Set(latest.flatMap((candidate) => candidate.scans.map((scan) => scan.id)))].sort(),
    };
  }

  const selected = [...uniqueRefs.values()].sort(compareCandidatePreference)[0];
  return {
    status: "selected",
    role: "current",
    server,
    manifest: selected.manifest,
    scans: selected.scans,
    searchIndexes: selected.scans.map((scan) => scan.searchIndex!),
  };
}

export function resolveScanArchiveCurrentToplistScans(
  manifests: readonly ScanArchiveManifest[],
  servers: readonly string[],
) {
  return Object.fromEntries(
    servers.map((server) => [server, resolveScanArchiveCurrentToplistScan(manifests, server)] as const),
  );
}

export function resolveScanArchiveMonthlyToplistScan(
  manifests: readonly ScanArchiveManifest[],
  server: string,
  month: string,
): ScanArchiveToplistSelectionResult {
  const archiveYear = parseMonthYear(month);
  if (archiveYear == null) {
    return { status: "not-defined", role: "monthly", server, month };
  }
  const manifest = manifests.find((item) => item.archiveYear === archiveYear);
  if (!manifest) return { status: "manifest-year-missing", role: "monthly", server, month, archiveYear };
  const reference = manifest.toplists?.monthly?.[month]?.[server];
  if (!reference) return { status: "not-defined", role: "monthly", server, month };
  const scanById = new Map(manifest.scans.map((item) => [item.id, item] as const));
  const normalized = normalizeScanArchiveToplistReference(reference, scanById);
  const scans = normalized.scanIds.flatMap((scanId) => {
    const scan = scanById.get(scanId);
    return scan?.searchIndex ? [scan] : [];
  });
  if (scans.length !== normalized.scanIds.length) return { status: "not-defined", role: "monthly", server, month };
  return {
    status: "selected",
    role: "monthly",
    server,
    month,
    manifest,
    scans,
    searchIndexes: scans.map((scan) => scan.searchIndex!),
  };
}

export function resolveScanArchiveMonthlyToplistScans(
  manifests: readonly ScanArchiveManifest[],
  servers: readonly string[],
  month: string,
) {
  return Object.fromEntries(
    servers.map((server) => [server, resolveScanArchiveMonthlyToplistScan(manifests, server, month)] as const),
  );
}

function parseMonthYear(month: string) {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const parsedMonth = Number(match[2]);
  if (parsedMonth < 1 || parsedMonth > 12) return null;
  return Number(match[1]);
}

function compareCandidatePreference(
  left: { manifest: ScanArchiveManifest; scans: ScanArchiveManifestScan[] },
  right: { manifest: ScanArchiveManifest; scans: ScanArchiveManifestScan[] },
) {
  return (
    right.manifest.archiveYear - left.manifest.archiveYear ||
    right.manifest.revision - left.manifest.revision ||
    right.scans.map((scan) => scan.id).join("|").localeCompare(left.scans.map((scan) => scan.id).join("|"))
  );
}
