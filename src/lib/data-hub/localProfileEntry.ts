import type { LocalPlayerProfileModel } from "../../components/local-player-profile/types";
import { auditBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave, auditFields, type AuditFields } from "./runtimeAudit";
import { captureLocalDataDependencies, revalidateLocalDataDependencies } from "../local-data/localDataDependencies";
import { loadIdentityResolutionSnapshot, resolvePlayerIdentity } from "../identities/identityResolution";
import { readGuildScanMemberIdentity } from "../guilds/guildScanNormalizer";
import { getGuildHubLocalScan, isGuildHubFavoriteScanSummaryCurrent, isGuildHubScanAnalyticsEnabled, readDataHubLocalScanMetadata, selectGuildHubRawSnapshot,
  readHubSearchProjectionInventory, readGuildHubLocalScanForSearch, prepareGuildHubSearchProjection, putHubSearchProjection, iterateGuildHubSearchRows } from "../guilds/localScanLibrary";
import { isHubSearchProjectionCurrent } from "./hubSearchProjection";
import { runHubSearchWork } from "./hubSearchExecution";
import { createLocalPlayerCurrentSeed, isLocalPlayerCurrentSeedValid, type LocalPlayerCurrentSeed } from "../../pages/GuildHub/localPlayerCurrentSeed";
import { buildLocalPlayerProfileModel } from "../../pages/GuildHub/localPlayerProfileAdapter";
import { favoriteReference, referenceKey, type FavoriteReference } from "./hubFavoritesContract";
import { type ObservationAnchor, type ParsedObservation } from "./routes";
import { acquireExplicitLocalFirstArchiveScans } from "../scanArchive/localFirstScanAcquisition";
import { loadScanArchiveManifestEntries } from "../scanArchive/client";

export class LocalProfileEntryError extends Error {
  constructor(public code: "invalid" | "missing" | "unknown" | "changed" | "ambiguous", message = code) { super(message); }
}
export type LocalProfileEntry = { entity: FavoriteReference; observation: ParsedObservation };
export type LocalProfileEntryCounters = { currentRawReads: number; currentBuilds: number };
const sameEntity = (a: FavoriteReference | null, b: FavoriteReference) => !!a && referenceKey(a) === referenceKey(b);
const check = (allowed: () => boolean) => { if (!allowed()) throw new DOMException("Profile action ended", "AbortError"); };

/** Metadata narrows sources before any Raw read. Only confirmed identity aliases
 * participate; no personal-origin preference, no importedAt observation clock. */
export async function resolveLocalProfileEntry(entry: LocalProfileEntry, prepared?: LocalPlayerCurrentSeed,
  allowed: () => boolean = () => true, counters?: LocalProfileEntryCounters, diagnosticContext?: AuditFields, includeInsights = true) {
    if (typeof document !== "undefined" && typeof Worker !== "undefined" && !prepared) {
      const { sharedAnalyticsPreparation } = await import("../local-player-profile/sharedPreparation");
      const lease = sharedAnalyticsPreparation.acquire("profile");
      const controller = new AbortController();
      // Entry callers use an allowed predicate. Poll only for cancellation, never
      // for progress; no abandoned result may restore a departed route.
      const timer = setInterval(() => { if (!allowed()) controller.abort(); }, 50);
      try {
        check(allowed);
        const result = await lease.runProfile<{ profile?: LocalPlayerProfileModel; error?: LocalProfileEntryError["code"] }>(JSON.stringify(["profile-entry", entry, includeInsights]), { kind: "profile-entry", entry, includeInsights }, controller.signal);
        check(allowed);
        if (result.error) throw new LocalProfileEntryError(result.error);
        const profile = result.profile!;
        if (!profile.currentSeed || !await isLocalPlayerCurrentSeedValid(profile.currentSeed, profile.currentSeed)) throw new LocalProfileEntryError("changed");
        check(allowed);
        return profile;
      } finally { clearInterval(timer); lease.release(); }
    }
    const __audit1 = auditBegin("F16", "resolveLocalProfileEntry");
    auditFields(__audit1, diagnosticContext ?? { trigger: "profile-entry-call", consumer: "profile-entry-unspecified" });
    try {
  if (entry.observation.kind === "invalid") throw new LocalProfileEntryError("invalid");
  const need = { playerAliases: [entry.entity.identifier], allIdentities: true };
  const dependency = await (auditValue(__audit1, auditEnter(__audit1, "captureLocalDataDependencies"), (captureLocalDataDependencies({ ...need,
    ...(entry.observation.kind === "free" ? { allSources: true, hubSearchResets: true } : {}) }))));
  const identities = await (auditValue(__audit1, auditEnter(__audit1, "loadIdentityResolutionSnapshot"), (loadIdentityResolutionSnapshot()))); check(allowed);
  const identity = resolvePlayerIdentity(identities, entry.entity.identifier);
  const aliases = [entry.entity.identifier, ...identity.aliasIdentifiers];
  const refs = aliases.map(id => favoriteReference("player", id)).filter((ref): ref is FavoriteReference => !!ref);
  const permitted = (id: unknown) => refs.some(ref => sameEntity(favoriteReference("player", id), ref));
  const finish = async (seed: LocalPlayerCurrentSeed) => {
    if (!permitted(seed.rawIdentifier) || !await isLocalPlayerCurrentSeedValid(seed, seed) || !(await revalidateLocalDataDependencies(dependency)).current) throw new LocalProfileEntryError("changed");
    check(allowed); if (counters) counters.currentBuilds++;
    return buildLocalPlayerProfileModel({ ...seed, rawPlayer: seed.rawPlayer, currentSeed: seed });
  };
  if (entry.observation.kind === "exact" && prepared) {
    const a = entry.observation.anchor;
    if (a.source === prepared.sourceScanId && a.at === prepared.scannedAtMs && (!a.row || a.row === prepared.sourcePlayerKey) &&
      (!a.hash || a.hash === prepared.contentHash) && permitted(prepared.rawIdentifier) && await (auditValue(__audit1, auditEnter(__audit1, "isLocalPlayerCurrentSeedValid"), (isLocalPlayerCurrentSeedValid(prepared, prepared))))) return auditReturn(__audit1, finish(prepared));
    check(allowed);
  }
  let metadata = entry.observation.kind === "exact"
    ? await (auditValue(__audit1, auditEnter(__audit1, "readDataHubLocalScanMetadata"), (readDataHubLocalScanMetadata({ includeContentHashes: true })))) : undefined; check(allowed);
  const read = async (anchor: ObservationAnchor) => {
    const dependencies = await captureLocalDataDependencies({ sourceIds: [anchor.source], ...need }); check(allowed);
    if (counters) counters.currentRawReads++;
    let scan = await getGuildHubLocalScan(anchor.source); check(allowed);
    if (!scan) {
      // A surviving binding is a durable, bounded acquisition target. Never
      // request a server's entire archive or substitute a different observation.
      const bindings = (metadata?.bindings ?? []).filter(b => b.localScanId === anchor.source);
      if (bindings.length === 1) {
        const b = bindings[0];
        const controller = new AbortController();
        const timer = setInterval(() => { if (!allowed()) controller.abort(); }, 50);
        try {
          const { entries } = await loadScanArchiveManifestEntries({ year: b.archiveYear, active: true, manifestUrl: b.manifestUrl }, { signal: controller.signal }); check(allowed);
          const targets = entries.filter(e => e.id === b.archiveScanId && e.sha256 === b.sha256);
          if (targets.length === 1) {
            const acquired = await acquireExplicitLocalFirstArchiveScans(targets, { signal: controller.signal }); check(allowed);
            const source = acquired.selectedArchives[0]?.localScanId;
            if (source === anchor.source) scan = await getGuildHubLocalScan(source);
          }
        } finally { clearInterval(timer); }
      }
    }
    if (!scan) throw new LocalProfileEntryError("missing");
    if (anchor.hash && anchor.hash !== scan.contentHash) throw new LocalProfileEntryError("changed");
    if (!isGuildHubScanAnalyticsEnabled(scan)) throw new LocalProfileEntryError("unknown");
    const snapshot = selectGuildHubRawSnapshot(scan, anchor.at);
    if (!snapshot) throw new LocalProfileEntryError("missing");
    // Reuse the search reader's verified section context for incomplete IDs.
    // Never complete them merely from the requested route's server.
    const matches = await runHubSearchWork((function* () {
      const found: { raw: unknown; member: NonNullable<ReturnType<typeof readGuildScanMemberIdentity>> }[] = [];
      for (const row of iterateGuildHubSearchRows(scan!)) {
        if (row?.kind === "player" && row.at === anchor.at) {
          const member = readGuildScanMemberIdentity(row.raw, row.serverContext);
          if (member && permitted(member.memberRef) && (!anchor.row || member.memberRef.toLowerCase() === anchor.row.toLowerCase())) found.push({ raw: row.raw, member });
        }
        yield;
      }
      return found;
    })(), { allowed });
    if (matches.length !== 1) throw new LocalProfileEntryError(matches.length ? "ambiguous" : "missing");
    const member = matches[0].member;
    const ref = favoriteReference("player", member.memberRef);
    if (!ref || !sameEntity(favoriteReference("player", "1", member.server), { ...ref, entityId: "1" })) throw new LocalProfileEntryError("invalid");
    const target = { sourceScanId: scan.id, sourcePlayerKey: anchor.row ?? member.memberRef.toLowerCase(), sourceMemberRef: member.memberRef,
      scannedAtMs: anchor.at, scannedAtIso: new Date(anchor.at).toISOString(),
      guildRole: scan.normalizedMembers?.find(m => m.memberRef.toLowerCase() === member.memberRef.toLowerCase())?.guildRole ?? null,
      guild: { name: member.guildName, server: member.server, identifier: member.guildSegment ? `${ref.serverNamespace}_${member.guildSegment}` : null } };
    const seed = createLocalPlayerCurrentSeed({ scan, dependencies, coreLookup: new Map() }, target, matches[0].raw);
    if (!seed) throw new LocalProfileEntryError("ambiguous");
    return finish(seed);
  };
  if (entry.observation.kind === "exact") return auditReturn(__audit1, read(entry.observation.anchor));
  const selection = await (auditValue(__audit1, auditEnter(__audit1, "findLocalPlayerEntryCandidates"), (findLocalPlayerEntryCandidates(refs, allowed)))); check(allowed);
  metadata = selection.metadata; // Preserve bounded binding recovery if the selected Raw disappears after this snapshot.
  if (!selection.complete) throw new LocalProfileEntryError("unknown");
  const selected = selection.candidates[0];
  if (!selected) throw new LocalProfileEntryError("missing");
  return auditReturn(__audit1, read(selected));

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
}

/** Fusion-only evidence remains usable, but is not a general player inventory. */
export function selectLocalPlayerEntryCandidates(metadata: Awaited<ReturnType<typeof readDataHubLocalScanMetadata>>, permitted: (id: unknown) => boolean) {
  const candidates = metadata.summaries.flatMap(summary =>
    isGuildHubScanAnalyticsEnabled(summary) && isGuildHubFavoriteScanSummaryCurrent(summary, metadata.sourceContentHashes?.get(summary.sourceScanId))
      ? (summary.fusionInventorySlices ?? []).flatMap(slice => (slice.playerIdentifiers ?? []).filter(row => permitted(row) &&
        favoriteReference("player", row)?.serverNamespace === favoriteReference("player", "1", slice.server)?.serverNamespace).map(row => ({
        source: summary.sourceScanId, at: slice.timestampMs, row, snapshot: slice.snapshotId, hash: summary.contentHash, filename: summary.filename,
      }))) : []).filter(c => Number.isSafeInteger(c.at) && c.at > 0);
  // New-entry tie only: observation time, filename, source ID, row. Existing
  // Dashboard/Toplist/Compare selectors remain unchanged.
  candidates.sort((a, b) => b.at - a.at || a.filename.localeCompare(b.filename) || a.source.localeCompare(b.source) || a.row.localeCompare(b.row));
  return candidates;
}

/** Shared free-entry observation choice. Literal search projections cover every
 * server; complete fusion inventories avoid rebuilding an already proven source.
 * An index locates an observation only: the profile reader still validates Raw. */
export async function findLocalPlayerEntryCandidates(refs: readonly FavoriteReference[], allowed: () => boolean = () => true) {
  check(allowed);
  const dependency = await captureLocalDataDependencies({ allSources: true, hubSearchResets: true });
  const [metadata, inventory] = await Promise.all([
    readDataHubLocalScanMetadata({ includeContentHashes: true }), readHubSearchProjectionInventory(),
  ]); check(allowed);
  const namespaces = new Set(refs.map(ref => ref.serverNamespace));
  const permitted = (id: unknown) => refs.some(ref => sameEntity(favoriteReference("player", id), ref));
  const inScope = (server: string) => namespaces.has(favoriteReference("player", "1", server)?.serverNamespace ?? "");
  const candidates: (ObservationAnchor & { row: string; filename: string })[] = [];
  let complete = metadata.metadataComplete;
  for (const summary of metadata.summaries) {
    check(allowed);
    if (!isGuildHubScanAnalyticsEnabled(summary)) continue;
    if (!isGuildHubFavoriteScanSummaryCurrent(summary, metadata.sourceContentHashes?.get(summary.sourceScanId))) {
      // Stale metadata cannot safely exclude a namespace or prove absence.
      complete = false; continue;
    }
    if (!summary.servers.some(inScope)) continue;
    let projection = inventory.projections.get(summary.sourceScanId);
    const current = () => isHubSearchProjectionCurrent(projection, summary,
      metadata.sourceContentHashes?.get(summary.sourceScanId), inventory.resetFor(summary.sourceScanId));
    if (!current()) {
      const slices = (summary.fusionInventorySlices ?? []).filter(slice => inScope(slice.server));
      if (slices.length && slices.every(slice => Array.isArray(slice.playerIdentifiers))) {
        candidates.push(...selectLocalPlayerEntryCandidates({ ...metadata, summaries: [summary] }, permitted));
        continue;
      }
      try {
        const scan = await readGuildHubLocalScanForSearch(summary.sourceScanId); check(allowed);
        if (!scan || !isGuildHubScanAnalyticsEnabled(scan)) { complete = false; continue; }
        projection = await prepareGuildHubSearchProjection(scan, inventory.resetFor(scan.id), { allowed }); check(allowed);
        if (!current()) { complete = false; continue; }
        await putHubSearchProjection(projection, { allowed }); check(allowed);
      } catch (error) {
        check(allowed);
        if (!(await revalidateLocalDataDependencies(dependency)).current) throw new LocalProfileEntryError("changed");
        complete = false; continue;
      }
    }
    if (!projection?.enabled) { complete = false; continue; }
    if (projection.unsearchableRows) complete = false;
    for (const document of projection.documents) {
      if (document.kind !== "player" || !document.reference || !permitted(document.reference.identifier)) continue;
      if (!document.identifier || !permitted(document.identifier) || !inScope(document.server ?? "") ||
        document.hash !== summary.contentHash || document.at === null) { complete = false; continue; }
      candidates.push({ source: summary.sourceScanId, at: document.at, row: document.identifier,
        snapshot: `${summary.sourceScanId}::${document.at}`, hash: summary.contentHash, filename: summary.filename });
    }
  }
  if (!(await revalidateLocalDataDependencies(dependency)).current) throw new LocalProfileEntryError("changed");
  check(allowed);
  const unique = [...new Map(candidates.map(candidate => [JSON.stringify([candidate.source, candidate.at, candidate.row.toLowerCase()]), candidate])).values()];
  unique.sort((a, b) => b.at - a.at || a.filename.localeCompare(b.filename) || a.source.localeCompare(b.source) || a.row.localeCompare(b.row));
  return { candidates: unique, complete, metadata };
}
