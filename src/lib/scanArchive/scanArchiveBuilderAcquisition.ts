import { findSfDataHubLocalScanByArchiveBinding, getSfDataHubLocalScan } from "../guilds/localScanLibrary";
import { loadScanArchiveCatalog } from "./client";
import { acquireExplicitLocalFirstArchiveScans } from "./localFirstScanAcquisition";
import type { ScanArchiveBuilderManifestSource } from "./scanArchiveBuilderTypes";
import type { ScanArchiveBuilderRawPayload } from "./scanArchiveBuilderMonthly";
import type { ScanArchiveManifest, ScanArchiveManifestScan } from "./types";
import { toScanArchiveEntries, validateScanArchivePayload } from "./validation";

export function createScanArchiveBuilderMonthlyLoader(options: {
  manifest: ScanArchiveManifest;
  source: ScanArchiveBuilderManifestSource;
  catalogUrl?: string;
  signal?: AbortSignal;
}) {
  let entriesPromise: Promise<ReturnType<typeof toScanArchiveEntries>> | undefined;
  const entries = () => entriesPromise ??= (async () => {
    if (options.source.kind === "override" && !options.catalogUrl) {
      throw new Error("Archivkatalog-URL fehlt fuer den Manifest-Override. Manifest ueber die Builder-Oberflaeche laden.");
    }
    const manifestUrl = options.source.kind === "catalog" ? options.source.manifestUrl :
      (await loadScanArchiveCatalog({ catalogUrl: options.catalogUrl })).archives.find((archive) => archive.active && archive.year === options.manifest.archiveYear)?.manifestUrl;
    if (!manifestUrl) throw new Error(`Kein aktiver Archiv-Downloadpfad fuer ${options.manifest.archiveYear} im Katalog. Katalog korrigieren.`);
    return toScanArchiveEntries(options.manifest, manifestUrl);
  })();
  return async (scan: ScanArchiveManifestScan): Promise<ScanArchiveBuilderRawPayload> => {
    const entry = (await entries()).find((candidate) => candidate.id === scan.id && candidate.sha256 === scan.sha256);
    if (!entry) throw new Error(`Manifest-Mitglied ${scan.id} mit SHA ${scan.sha256} fehlt.`);
    const acquired = await acquireExplicitLocalFirstArchiveScans([entry], { signal: options.signal });
    if (acquired.status !== "complete") throw new Error(acquired.failedArchives.map((failure) => `${failure.archiveScanId}: ${failure.message}`).join("; ") || "Ausgangsset unvollstaendig geladen.");
    const selected = acquired.selectedArchives.find((item) => item.archiveScanId === entry.id && item.archiveSha256 === entry.sha256);
    if (!selected) throw new Error("Keine vollstaendig bestaetigte Archivbindung.");
    // Recheck the binding after acquisition; an unrelated local scan must never
    // supply the baseline just because it has the same timestamp or filename.
    const bound = await findSfDataHubLocalScanByArchiveBinding(entry);
    const local = bound ?? await getSfDataHubLocalScan(selected.localScanId);
    if (!local || (!bound && (local.archiveSource?.archiveScanId !== entry.id || local.archiveSource.sha256.toLowerCase() !== entry.sha256.toLowerCase()))) {
      throw new Error("Lokaler Scan besitzt keine gueltige Bindung an das angeforderte Set-Mitglied.");
    }
    return validateScanArchivePayload(local.rawData, entry) as ScanArchiveBuilderRawPayload;
  };
}
