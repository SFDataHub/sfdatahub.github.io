/** Owned by localScanLibrary: Raw and its summary projection commit together.
 * Content-bound evidence survives normalization/containment, never a content change.
 * Absence (including old archive annotations) means unknown history. */
export type LocalScanProvenance = {
  version: 1;
  sourceId: string;
  contentHash: string;
  role: "original" | "synthetic";
  history: "complete" | "unknown";
  personalImport?: { observedAt: string };
  originalSourceIds?: string[];
};

type Source = {
  id: string; contentHash: string; provenance?: LocalScanProvenance;
  isMergedBundle?: boolean; isScanSlot?: boolean;
};
export function readCompatibleScanProvenance(source: Source): LocalScanProvenance | undefined {
  const p = source.provenance;
  if (!p || p.version !== 1 || p.sourceId !== source.id || p.contentHash !== source.contentHash ||
      !["original", "synthetic"].includes(p.role) || !["complete", "unknown"].includes(p.history) ||
      (p.personalImport && (typeof p.personalImport.observedAt !== "string" || !Number.isFinite(Date.parse(p.personalImport.observedAt)))) ||
      ((source.isMergedBundle || source.isScanSlot) && p.role !== "synthetic") ||
      (p.originalSourceIds && (!Array.isArray(p.originalSourceIds) ||
        p.originalSourceIds.some(id => typeof id !== "string" || !id) || new Set(p.originalSourceIds).size !== p.originalSourceIds.length))) return undefined;
  return p;
}

export function createScanProvenance(source: Source, history: LocalScanProvenance["history"] = "complete"): LocalScanProvenance {
  return { version: 1, sourceId: source.id, contentHash: source.contentHash,
    role: source.isMergedBundle || source.isScanSlot ? "synthetic" : "original", history };
}

export function observePersonalScanImport(source: Source, observedAt = new Date().toISOString()): LocalScanProvenance {
  const p = readCompatibleScanProvenance(source) ?? createScanProvenance(source, "unknown");
  return p.role === "original" ? { ...p, personalImport: { observedAt } } : p;
}

/** Transfer is evidence transport, never a newly observed SFTools file import.
 * Hash-deduped IDs may differ; rebind only a compatible, explicitly positive fact. */
export function mergeTransferredScanProvenance(local: Source, incoming: Source): LocalScanProvenance | undefined {
  const own = readCompatibleScanProvenance(local);
  const transferred = readCompatibleScanProvenance(incoming);
  if (local.contentHash !== incoming.contentHash || !transferred ||
      (local.isMergedBundle || local.isScanSlot) || transferred.role !== "original") return own;
  if (!transferred.personalImport || own?.personalImport) return own;
  return { ...(own ?? createScanProvenance(local, "unknown")), personalImport: transferred.personalImport };
}
