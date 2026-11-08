import { readGuildHubLocalScanForSearch, selectGuildHubRawSnapshot, type GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";
import { readGuildScanMemberIdentity, isNormalizedGuildMemberInGuild } from "../../lib/guilds/guildScanNormalizer";
import { loadIdentityResolutionSnapshot, resolvePlayerIdentity, type IdentityResolutionSnapshot } from "../../lib/identities/identityResolution";
import { resolveServer, serverComparisonKey } from "../../lib/servers/serverResolver";
import { normalizePlayerIdentifierKey } from "../../lib/identities/playerIdentityStore";
import { guildObservationIdentifierCandidates, resolveObservedGuildIdentity } from "../../lib/identities/guildObservationIdentity";
import { captureLocalDataDependencies, revalidateLocalDataDependencies, type LocalDependencyReceipt } from "../../lib/local-data/localDataDependencies";
import { localGuildRankingIdentityKey, localGuildRankingField, type LocalGuildRankingComparison } from "./localGuildRanking";
import { readLocalGuildMemberValues, type LocalGuildStatsMember } from "./localGuildPlayerStats";
import { resolveTransferGuildStatus, type TransferGuildLookup } from "./dashboardTransferGuilds";
import { dashboardTransferIdentityKey } from "./dashboardTransfersModel";
import type { TransferGuildStand } from "./dashboardTransferGuilds";
import type { ScanIdentityContext, ScanIdentityStand } from "./dashboardScanIdentity";
import { hashHubFavoriteRecords } from "../../lib/data-hub/hubFavoritesStore";

// A loaded-code marker, deliberately not a claim about a Git HEAD or full build.
export const COMPARISON_DIAGNOSTIC_VERSION = "w117-comparison-evidence-v1";
export type DiagnosticMember = Pick<LocalGuildStatsMember, "key" | "name"> & Partial<Pick<LocalGuildStatsMember, "playerStats" | "classLabel">> & {
  localRef?: { identifier: string | null; sourceScanId: string; sourcePlayerKey: string; matchedByNameFallback: boolean };
};
export function comparisonIdentityTrace(member: DiagnosticMember, identities: IdentityResolutionSnapshot | null) {
  let lookupKey: string | null = null;
  try { lookupKey = normalizePlayerIdentifierKey(member.key) || null; } catch { /* Invalid original reference stays visible. */ }
  const resolved = identities && lookupKey ? resolvePlayerIdentity(identities, lookupKey) : null;
  return { originalKey: member.key, observationReference: member.localRef?.identifier ?? null,
    sourceRow: member.localRef?.sourcePlayerKey ?? null, matchedByNameFallback: member.localRef?.matchedByNameFallback ?? false,
    lookupKey, entityId: resolved?.identityId ?? null, comparisonKey: localGuildRankingIdentityKey(member, identities),
    reason: !identities ? "snapshot-unavailable" : !lookupKey ? "invalid-reference" : !resolved?.resolved ? "no-stored-alias-for-lookup-key" : null };
}
export function comparisonRosterTrace(members: readonly DiagnosticMember[], identities: IdentityResolutionSnapshot | null, consumer: "transfer" | "worker" = "transfer") {
  const buckets = new Map<string, string[]>();
  for (const member of members) {
    const key = consumer === "transfer" ? dashboardTransferIdentityKey(member, identities) : localGuildRankingIdentityKey(member, identities) ?? `unresolved:${member.key}`;
    const bucket = buckets.get(key) ?? [];
    const signature = JSON.stringify(member);
    if (consumer === "worker" || !bucket.includes(signature)) bucket.push(signature);
    buckets.set(key, bucket);
  }
  return members.map(member => ({ ...comparisonIdentityTrace(member, identities),
    ...(consumer === "transfer" ? { comparisonKey: dashboardTransferIdentityKey(member, identities) } : {}), name: member.name,
    classLabel: member.classLabel ?? null, values: member.playerStats ?? null,
    bucketSize: buckets.get(consumer === "transfer" ? dashboardTransferIdentityKey(member, identities) : localGuildRankingIdentityKey(member, identities) ?? `unresolved:${member.key}`)!.length }));
}
export type ComparisonRosterTrace = ReturnType<typeof comparisonRosterTrace>;
export type MemberComparisonDiagnostic = {
  code: string; module: string; revisions: IdentityResolutionSnapshot["revisions"]; dependencies: LocalDependencyReceipt;
  current: ComparisonRosterTrace; historical: ComparisonRosterTrace; valueObservations: ComparisonRosterTrace;
  valueSources?: Array<{ key: string; sourceScanId: string; scannedAtMs: number }>;
  candidates: Array<ScanIdentityStand & { complete: boolean | null }>;
};
export type ComparisonExecution = { jobId: string; generation: number; status: string; dependencies?: LocalDependencyReceipt };
type Transfers = { joined: readonly DiagnosticMember[]; left: readonly DiagnosticMember[] };
export type DashboardComparisonEvidence = {
  generation: number; requestKey: string; status: string;
  current: ScanIdentityStand; historical: ScanIdentityStand | null;
  currentMembers: readonly DiagnosticMember[]; historicalMembers: readonly DiagnosticMember[] | null;
  identities: IdentityResolutionSnapshot | null; dependencies?: LocalDependencyReceipt;
  currentDependencies: LocalDependencyReceipt; contexts: readonly ScanIdentityContext[];
  currentGuilds: TransferGuildLookup | null; historicalGuilds: TransferGuildLookup | null;
  guildStands?: readonly TransferGuildStand[];
  output: Transfers | null; worker: LocalGuildRankingComparison; summaries: readonly GuildHubScanSummary[];
  guild: { name: string; server: string; logoIdentifier: string };
  presentation: { mode: string; selectedClasses: readonly string[] };
};
const standKey = (stand: ScanIdentityStand) => JSON.stringify([stand.sourceScanId, stand.scannedAtMs, stand.guildIdentifier]);
const finite = (n: number | null | undefined) => typeof n === "number" && Number.isFinite(n) ? n : null;

/** Explain the actual returned ranking rows. Value history and guild rank history
 * intentionally remain separate, including matching observations outside guild. */
export function comparisonDeltaTrace(worker: LocalGuildRankingComparison) {
  const diagnostic = worker.diagnostic;
  return Object.entries(worker.rankings ?? {}).flatMap(([mode, categories]) => Object.entries(categories ?? {}).flatMap(([category, rows]) => (rows ?? []).map(row => {
    const current = diagnostic?.current.find(member => member.originalKey === row.key);
    const key = current?.comparisonKey;
    const history = key ? diagnostic?.historical.filter(member => member.comparisonKey === key) ?? [] : [];
    const values = key ? diagnostic?.valueObservations.filter(member => member.comparisonKey === key) ?? [] : [];
    const field = localGuildRankingField(category as Parameters<typeof localGuildRankingField>[0], mode as Parameters<typeof localGuildRankingField>[1]);
    const fiveSum = category === "sum" && worker.allFive?.rankings === worker.rankings && (mode === "base" || mode === "total");
    const prior = values.length === 1 ? finite(fiveSum ? values[0].values?.profileAllSums?.[mode as "base" | "total"] : values[0].values?.[field]) : null;
    return { mode, category, ...row, historicalKeys: history.map(member => member.originalKey), valueKeys: values.map(member => member.originalKey),
      valueSources: diagnostic?.valueSources?.filter(source => values.some(member => member.originalKey === source.key)) ?? [],
      historicalValue: prior,
      valueReason: row.valueDelta != null ? null : !diagnostic ? "worker-evidence-unavailable" : !key ? "invalid-current-reference"
        : values.length > 1 ? "ambiguous-historical-person" : !values.length ? "no-historical-person-in-allowed-snapshot"
          : finite(row.value) == null ? "missing-current-metric" : prior == null ? "missing-historical-metric" : "unexpected-missing-delta",
      rankReason: row.rankDelta != null ? null : history.length > 1 ? "ambiguous-historical-roster" : !history.length ? "not-in-historical-guild-roster"
        : row.rank == null ? "missing-current-metric" : "missing-historical-rank" };
  })));
}

/** User-triggered read only. Reads exactly the used stands, never prepares or
 * imports sources and never exports a store, raw record or unrelated player. */
export async function collectDashboardComparisonDiagnostic(evidence: DashboardComparisonEvidence, isCurrent: () => boolean,
  environment: { origin: string; route: string; modules: string[] },
) {
  const worker = evidence.worker;
  const stands: ScanIdentityStand[] = [evidence.current, ...(evidence.historical ? [evidence.historical] : []), ...(evidence.guildStands ?? []),
    ...(worker.sourceScanId && worker.timestamp != null ? [{ sourceScanId: worker.sourceScanId, scannedAtMs: worker.timestamp, guildIdentifier: worker.guildIdentifier }] : [])];
  const uniqueStands = [...new Map(stands.map(stand => [standKey(stand), stand])).values()];
  const need = { allIdentities: true, sourceIds: [...new Set(stands.map(stand => stand.sourceScanId))] };
  // One bounded retry if relevant evidence changes during the reads. The old
  // consumer evidence is preserved so a stale consumer cannot appear repaired.
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (!isCurrent()) throw Error("comparison-context-changed");
    const capturedAt = new Date().toISOString();
    const receipt = await captureLocalDataDependencies(need);
    const stored = await loadIdentityResolutionSnapshot();
    const usedRows = [...evidence.currentMembers, ...(evidence.historicalMembers ?? [])];
    const wantedKeys = new Set(usedRows.map(member => member.key.toLowerCase()));
    const wantedEntities = new Set(usedRows.flatMap(member => {
      const resolved = resolvePlayerIdentity(stored, member.key); return resolved.resolved ? [resolved.identityId] : [];
    }));
    const sources = [];
    for (const stand of uniqueStands) {
      const scan = await readGuildHubLocalScanForSearch(stand.sourceScanId);
      const summary = evidence.summaries.find(item => item.sourceScanId === stand.sourceScanId);
      const snapshot = scan ? selectGuildHubRawSnapshot(scan, stand.scannedAtMs) : null;
      const rows = [];
      for (const [index, raw] of (snapshot?.players ?? []).entries()) {
        const identity = readGuildScanMemberIdentity(raw);
        if (!identity) continue;
        const sameGuild = stand.guildIdentifier ? isNormalizedGuildMemberInGuild({ ...identity, guildName: null },
          { name: "", server: stand.guildIdentifier.replace(/_g[^_]+$/i, ""), guildSegment: stand.guildIdentifier }) : false;
        const resolved = resolvePlayerIdentity(stored, identity.memberRef);
        if (!sameGuild && !wantedKeys.has(identity.memberRef.toLowerCase()) && !(resolved.resolved && wantedEntities.has(resolved.identityId))) continue;
        const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
        const originalFields = Object.fromEntries(["identifier", "Identifier", "Player Identifier", "prefix", "Prefix", "group", "guildIdentifier", "Group Identifier"].flatMap(key =>
          typeof record[key] === "string" || typeof record[key] === "number" ? [[key, record[key]]] : []));
        rows.push({ index, originalFields, reference: identity.memberRef, name: identity.name, server: identity.server,
          guildSegment: identity.guildSegment, groupSegment: identity.groupSegment, guildName: identity.guildName, inGuild: sameGuild,
          values: readLocalGuildMemberValues(raw), stored: comparisonIdentityTrace({ key: identity.memberRef, name: identity.name }, stored) });
      }
      sources.push({ stand, available: !!snapshot,
        raw: scan ? { contentHash: scan.contentHash, sourceGeneration: scan.sourceGeneration, normalizerVersion: scan.normalizerVersion, coreNormalizerVersion: scan.coreNormalizerVersion } : null,
        summary: summary ? { contentHash: summary.contentHash, sourceGeneration: summary.sourceGeneration, normalizerVersion: summary.normalizerVersion,
          coreNormalizerVersion: summary.coreNormalizerVersion, archiveSource: summary.archiveSource, archiveBindings: summary.archiveBindings } : null, rows });
    }
    const after = await revalidateLocalDataDependencies(receipt);
    if (!isCurrent()) throw Error("comparison-context-changed");
    const captureStable = after.current && stored.revisions?.players === receipt.players && stored.revisions?.guilds === receipt.guilds;
    if (!captureStable && attempt === 1) continue;
    const receipts = [evidence.currentDependencies, ...(evidence.dependencies ? [evidence.dependencies] : []), ...(worker.execution?.dependencies ? [worker.execution.dependencies] : [])];
    const consumers = await Promise.all(receipts.map(async dependencies => ({ dependencies, ...(await revalidateLocalDataDependencies(dependencies)) })));
    const favoritesRecordHash = await hashHubFavoriteRecords();
    const final = await revalidateLocalDataDependencies(receipt);
    if (!isCurrent()) throw Error("comparison-context-changed");
    if (!final.current && attempt === 1) continue;
    const current = comparisonRosterTrace(evidence.currentMembers, evidence.identities);
    const historical = comparisonRosterTrace(evidence.historicalMembers ?? [], evidence.identities);
    const output = evidence.output;
    const workerDiagnostic = worker.diagnostic;
    const deltaRows = comparisonDeltaTrace(worker);
    const joinedKeys = new Set(output?.joined.map(row => dashboardTransferIdentityKey(row, evidence.identities)));
    const leftKeys = new Set(output?.left.map(row => dashboardTransferIdentityKey(row, evidence.identities)));
    const matrix = ([...current.map(row => ({ ...row, side: "current" as const })), ...historical.map(row => ({ ...row, side: "historical" as const }))]).map(row => {
      const opposite = row.side === "current" ? historical : current;
      const joined = row.side === "current" && joinedKeys.has(row.comparisonKey!);
      const left = row.side === "historical" && leftKeys.has(row.comparisonKey!);
      return { ...row, stored: comparisonIdentityTrace({ key: row.originalKey, name: row.name }, stored),
        workerRows: [...(row.side === "current" ? workerDiagnostic?.current ?? [] : workerDiagnostic?.historical ?? [])].filter(item => item.originalKey === row.originalKey),
        deltas: row.side === "current" ? deltaRows.filter(item => item.key === row.originalKey) : [],
        decisionEvidence: { ambiguousBucket: row.bucketSize !== 1, duplicateObservationsCountOnce: true,
          originalServer: serverComparisonKey(/^(.+)_p[^_]+$/i.exec(row.originalKey)?.[1]),
        },
        oppositeKeys: opposite.filter(item => row.comparisonKey != null && item.comparisonKey === row.comparisonKey).map(item => item.originalKey),
        classification: !output ? "not-computed" : joined ? "joined" : left ? "left" : "continuation",
        observedGuild: resolveTransferGuildStatus(row.side === "current" ? evidence.currentGuilds : evidence.historicalGuilds, row.originalKey, null),
        oppositeGuild: resolveTransferGuildStatus(row.side === "current" ? evidence.historicalGuilds : evidence.currentGuilds, row.originalKey, evidence.identities) };
    });
    const refs = new Set(matrix.map(row => row.originalKey));
    for (const row of [...(workerDiagnostic?.current ?? []), ...(workerDiagnostic?.historical ?? []), ...(workerDiagnostic?.valueObservations ?? [])]) refs.add(row.originalKey);
    for (const source of sources) for (const row of source.rows) refs.add(row.reference);
    const storedLookups = [...refs].map(key => {
      const result = resolvePlayerIdentity(stored, key);
      const full = /^(.+)_p([^_]+)$/i.exec(key);
      const registered = full ? resolveServer(full[1]) : null;
      const candidates = registered && full ? [...new Set([full[1], registered.code, ...registered.aliases, ...registered.hosts])]
        .filter(namespace => serverComparisonKey(namespace) === registered.code).map(namespace => `${namespace.toLowerCase()}_p${full[2]}`) : [key];
      return { ...comparisonIdentityTrace({ key, name: "" }, stored), aliases: result.aliasIdentifiers,
        // Observation only: consumer lookups above remain exactly as executed.
        registeredSpellings: candidates.map(candidate => ({ key: candidate, entityId: resolvePlayerIdentity(stored, candidate).identityId })) };
    });
    const guildTrace = (identifier: string | null | undefined) => ({ identifier,
      candidates: guildObservationIdentifierCandidates(identifier), storedEntity: resolveObservedGuildIdentity(stored, identifier).identityId,
      transferEntity: evidence.identities ? resolveObservedGuildIdentity(evidence.identities, identifier).identityId : null });
    const problems = [
      ...(!captureStable || !final.current ? ["changed-during-capture"] : []),
      ...(consumers.some(item => !item.current) ? ["consumer-dependencies-stale"] : []),
      ...(!evidence.identities ? ["transfer-snapshot-unavailable"] : []),
      ...(sources.some(source => !source.available || source.raw?.contentHash !== source.summary?.contentHash || source.raw?.sourceGeneration !== source.summary?.sourceGeneration) ? ["source-missing-or-binding-mismatch"] : []),
      ...(!output || evidence.status !== "ready" ? ["transfer-not-ready"] : []),
      ...(worker.status !== "ready" || !workerDiagnostic || !worker.execution?.dependencies ? ["worker-evidence-not-ready"] : []),
      ...(evidence.identities?.revisions?.players !== stored.revisions?.players || evidence.identities?.revisions?.guilds !== stored.revisions?.guilds ? ["transfer-identity-revision-mismatch"] : []),
      ...(workerDiagnostic && (workerDiagnostic.revisions?.players !== stored.revisions?.players || workerDiagnostic.revisions?.guilds !== stored.revisions?.guilds) ? ["worker-identity-revision-mismatch"] : []),
    ];
    return { schema: COMPARISON_DIAGNOSTIC_VERSION, capturedAt, completedAt: new Date().toISOString(), attempt,
      consistency: { coherent: problems.length === 0, problems, receipt, finalReceipt: final.receipt, consumers },
      environment, preservation: { favoritesRecordHash }, activeGuild: evidence.guild, guilds: uniqueStands.map(stand => guildTrace(stand.guildIdentifier)), sources,
      transfer: { generation: evidence.generation, requestKey: evidence.requestKey, status: evidence.status, current: evidence.current, historical: evidence.historical,
        revisions: evidence.identities?.revisions ?? null, dependencies: evidence.dependencies ?? null, contexts: evidence.contexts,
        output: output ? { joined: output.joined.map(row => row.key), left: output.left.map(row => row.key),
          counts: { joined: output.joined.length, left: output.left.length } } : null, matrix },
      stored: { revisions: stored.revisions, lookups: storedLookups },
      worker: { status: worker.status, execution: worker.execution ?? null, sourceScanId: worker.sourceScanId, timestamp: worker.timestamp,
        guildIdentifier: worker.guildIdentifier, coverage: worker.coverage, evidence: workerDiagnostic ?? null, deltas: deltaRows },
      presentation: evidence.presentation,
      freeMonk: { referenceHint: ["s8_eu_p10320", "f29_net_p261250"],
        // Names select diagnostic rows only; they never establish identity.
        transferRows: matrix.filter(row => /free\s*monk/i.test(row.name) || ["s8_eu_p10320", "f29_net_p261250"].includes(row.originalKey)),
        workerRows: [...(workerDiagnostic?.current ?? []), ...(workerDiagnostic?.historical ?? []), ...(workerDiagnostic?.valueObservations ?? [])].filter(row => /free\s*monk/i.test(row.name) || ["s8_eu_p10320", "f29_net_p261250"].includes(row.originalKey)) } };
  }
  throw Error("comparison-capture-failed");
}
