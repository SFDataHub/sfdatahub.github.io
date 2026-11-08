import { loadScanArchiveManifestEntries } from "../scanArchive/client";
import { resolveScanArchiveCurrentToplistScan } from "../scanArchive/toplistSelection";
import { resolveObservedGuildIdentity } from "../identities/guildObservationIdentity";
import { auditBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave, auditCaught } from "./runtimeAudit";
import { favoriteReference, referenceKey, type FavoriteKind, type FavoriteReference } from "./hubFavoritesContract";
import { localEntityPath, type ObservationAnchor } from "./routes";
import type { HubSearchHit, HubSearchOccurrence } from "./hubSearchService";
import { captureLocalDataDependencies, revalidateLocalDataDependencies } from "../local-data/localDataDependencies";
import { readDataHubLocalScanMetadata, readGuildHubLocalScanForSearch, readGuildHubSearchRows, isGuildHubFavoriteScanSummaryCurrent } from "../guilds/localScanLibrary";
import { buildHubSearchProjection } from "./hubSearchProjection";
import { acquireExplicitLocalFirstArchiveScans } from "../scanArchive/localFirstScanAcquisition";
import { loadIdentityResolutionSnapshot, resolvePlayerIdentity } from "../identities/identityResolution";
import { resolveServer } from "../servers/serverResolver";
import { findLocalPlayerEntryCandidates, LocalProfileEntryError } from "./localProfileEntry";

export type HubTargetErrorCode = "changed" | "unresolved" | "ambiguous" | "missing" | "offline" | "denied";
export class HubTargetError extends Error { constructor(public code: HubTargetErrorCode) { super(code); } }
export type HubToplistSelection = "highlight" | "add" | "replace";
export type HubToplistCommand = { version: 1; id: string; kind: FavoriteKind; label: string; server: string; identifiers: string[]; month: string | null; selection?: HubToplistSelection };
export type HubResolvedTarget = { path: string; state: { returnTo: string; hubToplistTarget?: HubToplistCommand } };
const check = (allowed: () => boolean) => { if (!allowed()) throw new DOMException("Search action ended", "AbortError"); };

/** Sources are acquired only for explicit profile actions. Query, hover and
 * Toplist navigation never invoke this API. The receiver owns its input after handoff. */
export async function resolveHubSearchTarget(hit: HubSearchHit, options: {
  mode: "profile" | "toplist"; historical?: HubSearchOccurrence; month?: string;
  signal?: AbortSignal;
  allowed: () => boolean; accessAllowed: () => boolean; onAcquire?: (occurrence: HubSearchOccurrence) => void;
}): Promise<HubResolvedTarget> {
    const __audit1 = auditBegin("F06", "resolveHubSearchTarget");
    try {
  check(options.allowed);
  if (!options.accessAllowed()) throw new HubTargetError("denied");
  if (!hit.reference || hit.identity === "conflict") throw new HubTargetError("unresolved");
  const receipt = await (auditValue(__audit1, auditEnter(__audit1, "captureLocalDataDependencies"), (captureLocalDataDependencies({ sourceIds: hit.occurrences.flatMap(o => o.local ? [o.local.source] : []), allIdentities: true }))));
  const identities = await (auditValue(__audit1, auditEnter(__audit1, "loadIdentityResolutionSnapshot"), (loadIdentityResolutionSnapshot()))); check(options.allowed);
  const identity = hit.kind === "player" ? resolvePlayerIdentity(identities, hit.reference.identifier) : resolveObservedGuildIdentity(identities, hit.reference.identifier);
  const refs = [hit.reference, ...identity.aliasIdentifiers.map(id => favoriteReference(hit.kind, id)).filter((r): r is FavoriteReference => !!r)];
  if (hit.references.some(r => !refs.some(ref => referenceKey(ref) === referenceKey(r)))) throw new HubTargetError("changed");
  const finish = async (ref: FavoriteReference, anchor?: ObservationAnchor): Promise<HubResolvedTarget> => {
    if (!(await revalidateLocalDataDependencies(receipt)).current) throw new HubTargetError("changed");
    check(options.allowed); if (!options.accessAllowed()) throw new HubTargetError("denied");
    return { path: localEntityPath(hit.kind, ref, anchor), state: { returnTo: "/data-hub" } };
  };
  if (options.mode === "toplist") {
    const chosen = options.historical?.reference ?? hit.reference;
    const server = resolveServer(chosen.serverNamespace)?.code ?? chosen.serverNamespace.toUpperCase();
    if (options.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(options.month)) throw new HubTargetError("unresolved");
    if (!(await (auditValue(__audit1, auditEnter(__audit1, "revalidateLocalDataDependencies"), (revalidateLocalDataDependencies(receipt))))).current) throw new HubTargetError("changed");
    check(options.allowed);
    const targetRefs = hit.observationBound ? hit.references.filter(r => r.serverNamespace === chosen.serverNamespace) : refs;
    return auditReturn(__audit1, createHubToplistTarget(hit.kind, hit.name, server, targetRefs.map(r => r.identifier), options.month ?? null));
  }
  // A text server filter binds navigation to the displayed matching observation,
  // even when a confirmed identity also has newer observations elsewhere.
  let occurrence = options.historical ?? (hit.observationBound ? hit.occurrences[0] : undefined);
  if (!occurrence) {
    let latestLocalAt = 0;
    const permitted = (id: unknown) => { const ref = favoriteReference(hit.kind, id); return !!ref && refs.some(r => referenceKey(r) === referenceKey(ref)); };
    if (hit.kind === "player") {
      try {
        const selection = await (auditValue(__audit1, auditEnter(__audit1, "findLocalPlayerEntryCandidates"), (findLocalPlayerEntryCandidates(refs, () => options.allowed() && options.accessAllowed())))); check(options.allowed);
        if (!selection.complete) throw new HubTargetError("unresolved");
        latestLocalAt = selection.candidates[0]?.at ?? 0;
      } catch (error) {
        if (error instanceof LocalProfileEntryError) throw new HubTargetError(error.code === "changed" ? "changed" : "unresolved");
        throw error;
      }
    }
    const metadata = hit.kind === "guild" ? await (auditValue(__audit1, auditEnter(__audit1, "readDataHubLocalScanMetadata"), (readDataHubLocalScanMetadata({ includeContentHashes: true })))) : undefined; check(options.allowed);
    if (hit.kind === "guild") latestLocalAt = Math.max(0, ...(metadata?.summaries ?? [])
      .filter(s => s.analyticsEnabled !== false && isGuildHubFavoriteScanSummaryCurrent(s, metadata!.sourceContentHashes?.get(s.sourceScanId)))
      .flatMap(s => s.guilds.filter(g => { const ref = favoriteReference("guild", g.guildIdentifier ?? g.guildId, g.server); return ref && permitted(ref.identifier); })
        .map(g => Date.parse(g.sourceScannedAt ?? "") || 0)));
    occurrence = [...hit.occurrences].filter(o => o.entry && o.reference && permitted(o.reference.identifier))
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0];
    // The local clock is the observation time, never import time or provenance.
    // Exact/historical actions bypass this choice entirely.
    if (latestLocalAt && (!occurrence || latestLocalAt >= (occurrence.at ?? 0))) return auditReturn(__audit1, finish(hit.reference));
  }
  if (!occurrence || !hit.occurrences.includes(occurrence)) throw new HubTargetError("missing");
  let source = occurrence.local?.source;
  if (!source && occurrence.entry) {
    check(options.allowed); if (!options.accessAllowed()) throw new HubTargetError("denied");
    options.onAcquire?.(occurrence);
    try {
      let entries = [occurrence.entry];
      if (!options.historical && !hit.observationBound) {
        const loaded = await loadScanArchiveManifestEntries({ year: occurrence.entry.archiveYear, active: true, manifestUrl: occurrence.entry.manifestUrl }, { signal: options.signal });
        check(options.allowed);
        const selection = resolveScanArchiveCurrentToplistScan([loaded.manifest], occurrence.entry.server);
        if (selection.status !== "selected" || !selection.scans.some(scan => scan.id === occurrence!.entry!.id && scan.sha256 === occurrence!.entry!.sha256)) throw new HubTargetError("changed");
        const ids = new Set(selection.scans.map(scan => scan.id));
        entries = loaded.entries.filter(entry => ids.has(entry.id));
      }
      const acquired = await (auditValue(__audit1, auditEnter(__audit1, "acquireExplicitLocalFirstArchiveScans"), (acquireExplicitLocalFirstArchiveScans(entries, { signal: options.signal })))); check(options.allowed);
      if (acquired.status !== "complete") throw new HubTargetError("offline");
      source = acquired.selectedArchives.find(item => item.archiveScanId === occurrence!.entry!.id)?.localScanId;
    } catch (error) { auditCaught(__audit1, error); options.signal?.throwIfAborted(); check(options.allowed); throw new HubTargetError("offline"); }
  }
  if (!source) throw new HubTargetError("offline");
  // Acquisition creates a legitimate source change. Start a new source/identity
  // receipt, then revalidate both identity and actual observation after the read.
  const acquiredReceipt = await (auditValue(__audit1, auditEnter(__audit1, "captureLocalDataDependencies"), (captureLocalDataDependencies({ sourceIds: [source], allIdentities: true }))));
  const freshIdentity = await (auditValue(__audit1, auditEnter(__audit1, "loadIdentityResolutionSnapshot"), (loadIdentityResolutionSnapshot()))); check(options.allowed);
  const fresh = hit.kind === "player" ? resolvePlayerIdentity(freshIdentity, hit.reference.identifier) : resolveObservedGuildIdentity(freshIdentity, hit.reference.identifier);
  const permittedRefs = [hit.reference, ...fresh.aliasIdentifiers.map(id => favoriteReference(hit.kind, id)).filter((r): r is FavoriteReference => !!r)];
  if (hit.references.some(r => !permittedRefs.some(ref => referenceKey(ref) === referenceKey(r)))) throw new HubTargetError("changed");
  const scan = await (auditValue(__audit1, auditEnter(__audit1, "readGuildHubLocalScanForSearch"), (readGuildHubLocalScanForSearch(source)))); check(options.allowed);
  if (!scan || scan.analyticsEnabled === false) throw new HubTargetError("missing");
  if (occurrence.local && occurrence.local.hash !== scan.contentHash) throw new HubTargetError("changed");
  const projection = (auditValue(__audit1, auditEnter(__audit1, "buildHubSearchProjection", "sync-elapsed"), (buildHubSearchProjection(scan, readGuildHubSearchRows(scan), "[]"))));
  const candidates = projection.documents.filter(d => d.kind === hit.kind && d.reference && permittedRefs.some(r => referenceKey(r) === referenceKey(d.reference!)) &&
    (!(options.historical || hit.observationBound) || !occurrence!.local || d.at === occurrence!.local.at) &&
    (!hit.observationBound || !!occurrence!.reference && referenceKey(d.reference) === referenceKey(occurrence!.reference)));
  const usable = candidates.filter(d => d.at !== null);
  if (!usable.length) throw new HubTargetError(candidates.length ? "ambiguous" : "missing");
  if (!(await (auditValue(__audit1, auditEnter(__audit1, "revalidateLocalDataDependencies"), (revalidateLocalDataDependencies(receipt))))).current || !(await (auditValue(__audit1, auditEnter(__audit1, "revalidateLocalDataDependencies"), (revalidateLocalDataDependencies(acquiredReceipt))))).current) throw new HubTargetError("changed");
  check(options.allowed); if (!options.accessAllowed()) throw new HubTargetError("denied");
  if (!options.historical && !hit.observationBound) return auditReturn(__audit1, { path: localEntityPath(hit.kind, hit.reference), state: { returnTo: "/data-hub" } });
  // A file clock cannot select one of several individual row observations.
  if (usable.length !== 1) throw new HubTargetError("ambiguous");
  const selected = usable[0];
  return auditReturn(__audit1, { path: localEntityPath(hit.kind, selected.reference!, { source, at: selected.at!, hash: scan.contentHash,
    snapshot: `${source}::${selected.at}`, ...(hit.kind === "player" ? { row: selected.identifier! } : {}) }), state: { returnTo: "/data-hub" } });

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
}

export function parseHubToplistCommand(value: unknown): HubToplistCommand | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Partial<HubToplistCommand>;
  if (c.version !== 1 || typeof c.id !== "string" || !c.id || c.kind !== "player" && c.kind !== "guild" ||
    typeof c.label !== "string" || typeof c.server !== "string" || !resolveServer(c.server) ||
    !Array.isArray(c.identifiers) || !c.identifiers.length || c.identifiers.length > 100 ||
    !c.identifiers.every(id => typeof id === "string" && !!favoriteReference(c.kind!, id)) ||
    !(c.month === null || typeof c.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(c.month)) ||
    !(c.selection === undefined || c.selection === "highlight" || c.selection === "add" || c.selection === "replace")) return null;
  return c as HubToplistCommand;
}

/** Shared command contract for local search and member-card navigation. */
export function createHubToplistTarget(kind: FavoriteKind, label: string, server: string, identifiers: string[], month: string | null = null, selection?: HubToplistSelection): HubResolvedTarget {
  return { path: "/data-hub/toplist", state: { returnTo: "/data-hub", hubToplistTarget: {
    version: 1, id: crypto.randomUUID(), kind, label, server: resolveServer(server)?.code ?? server.trim().toUpperCase(), identifiers, month, ...(selection ? { selection } : {}),
  } } };
}
