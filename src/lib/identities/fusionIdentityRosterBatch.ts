import { listGuildEntities, listGuildExclusions, readGuildIdentityChanges } from "./guildIdentityStore";
import { serverComparisonKey } from "../servers/serverResolver";
import { withLocalDataWrite } from "../local-data/localDataCoordination";
import { captureLocalDataDependencies, revalidateLocalDataDependencies, type LocalDependencyReceipt } from "../local-data/localDataDependencies";
import type { LocalDataChange } from "../local-data/localDataChanges";
import { confirmFusionIdentityLink, type FusionIdentityManagementReport, type FusionIdentityManagementItem } from "./fusionIdentityManagement";
import { getPlayerIdentity, getPlayerAliases, listPlayerEntities, listPlayerExclusions, isPlayerMatchRejected, readPlayerIdentityChanges } from "./playerIdentityStore";
import { isPlayerFusionReadyCandidate } from "./playerFusionResolver";

// Only registered spellings within one server namespace; never a name, bare
// number, common fusion destination or computed player identity.
export function rosterPlayerReferenceKey(value: string) {
  const match = /^(.+)_p([^_]+)$/i.exec(value.trim());
  const server = match && serverComparisonKey(match[1]);
  return match && server ? `${server.toLowerCase()}_p${match[2].toLowerCase()}` : null;
}
export type RosterBatchReference = { identifier: string; name: string; side: "current" | "historical" };
export type RosterBatchEntry = {
  item: FusionIdentityManagementItem | null;
  references: RosterBatchReference[];
  currentIdentifier: string | null;
  historicalIdentifier: string | null;
  decision: "ready" | "stored" | "unresolved" | "conflict" | "excluded";
  reason: string;
  before: { current: string | null; historical: string | null };
};
export type FusionIdentityRosterBatch = {
  id: string; preparedAt: string; dependencies: LocalDependencyReceipt;
  references: RosterBatchReference[]; excludedIdentifiers: string[];
  entries: RosterBatchEntry[];
  preservation: Record<string, string>;
  backup: { groups: Awaited<ReturnType<typeof listPlayerEntities>>; exclusions: Awaited<ReturnType<typeof listPlayerExclusions>> };
};
export type RosterBatchResultEntry = {
  currentIdentifier: string; historicalIdentifier: string;
  status: "stored" | "skipped" | "failed"; entityId?: string;
  journal: LocalDataChange[]; error?: string;
};
export type RosterBatchResult = { batchId: string; entries: RosterBatchResultEntry[]; completedAt?: string; dependencies: LocalDependencyReceipt; preservation?: { expected: Record<string, string>; actual: Record<string, string>; unchanged: boolean } };
const bindings = new WeakMap<FusionIdentityRosterBatch, FusionIdentityRosterBatch>();
const clone = <T,>(value: T): T => structuredClone(value);

const sha = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value))))).map(n => n.toString(16).padStart(2, "0")).join("");
async function preservation(groups: Awaited<ReturnType<typeof listPlayerEntities>>, exclusions: Awaited<ReturnType<typeof listPlayerExclusions>>, entries: RosterBatchEntry[], previousRevision: number) {
  const allowed = new Set(entries.filter(e => e.decision === "ready").flatMap(e => [e.currentIdentifier!, e.historicalIdentifier!]).map(s => s.toLowerCase()));
  const [guilds, guildExclusions, guildJournal, playerJournal] = await Promise.all([listGuildEntities(), listGuildExclusions(), readGuildIdentityChanges(), readPlayerIdentityChanges()]);
  return { unrelatedPlayers: await sha(groups.filter(group => !group.aliases.some(alias => allowed.has(alias.identifierKey)))), playerExclusions: await sha(exclusions),
    guilds: await sha([guilds, guildExclusions, guildJournal]), previousPlayerJournal: await sha(playerJournal.filter(change => (change.sequence ?? 0) <= previousRevision)) };
}

/** The full resolver report stays authoritative. Both exact comparison rosters
 * select entries, including former members now observed in another guild. */
export async function prepareFusionIdentityRosterBatch(input: {
  report: FusionIdentityManagementReport; references: readonly RosterBatchReference[];
  dependencies: LocalDependencyReceipt; excludedIdentifiers?: readonly string[];
}): Promise<FusionIdentityRosterBatch> {
  if (!input.references.length || input.references.some(ref => !rosterPlayerReferenceKey(ref.identifier))) throw Error("invalid-roster-reference");
  if (!input.dependencies.need.allIdentities) throw Error("missing-identity-binding");
  const referenceKeys = new Map<string, string>();
  const key = (value: string) => {
    let found = referenceKeys.get(value);
    if (!found) { found = rosterPlayerReferenceKey(value) ?? value.trim().toLowerCase(); referenceKeys.set(value, found); }
    return found;
  };
  const refs = clone([...input.references]);
  const excluded = new Set((input.excludedIdentifiers ?? []).map(key));
  const [groups, exclusions] = await Promise.all([listPlayerEntities(), listPlayerExclusions()]);
  const byAlias = new Map(groups.flatMap(group => group.aliases.map(alias => [alias.identifierKey, group] as const)));
  const entitiesByReference = new Map<string, Set<string>>();
  for (const group of groups) for (const alias of group.aliases) {
    const reference = key(alias.identifier), ids = entitiesByReference.get(reference) ?? new Set<string>();
    ids.add(group.entity.entityId); entitiesByReference.set(reference, ids);
  }
  const entity = (identifier: string | null) => identifier ? byAlias.get(identifier.toLowerCase())?.entity.entityId ?? null : null;
  const entries: RosterBatchEntry[] = [];
  const covered = new Set<RosterBatchReference>();
  for (const item of input.report.items) {
    if (item.entityType !== "player") continue;
    const selectionIdentifiers = [item.currentIdentifier, ...item.historicalIdentifiers, ...item.completedAliases,
      ...(item.status === "completed" ? [] : item.status === "ready" ? item.readyCandidateIdentifier ? [item.readyCandidateIdentifier] : [] : item.candidates.map(candidate => candidate.historicalIdentifier))];
    const selectedRefs = refs.filter(ref => selectionIdentifiers.some(identifier => key(identifier) === key(ref.identifier)));
    if (!selectedRefs.length) continue;
    selectedRefs.forEach(ref => covered.add(ref));
    const historicalIdentifier = item.readyCandidateIdentifier ?? item.historicalIdentifiers[0] ?? null;
    const relatedAliases = selectionIdentifiers.flatMap(identifier => byAlias.get(identifier.toLowerCase())?.aliases.map(alias => alias.identifier) ?? []);
    const before = { current: entity(item.currentIdentifier), historical: entity(historicalIdentifier) };
    const candidate = item.candidates.find(c => c.historicalIdentifier === historicalIdentifier);
    const explicitlyExcluded = [...selectionIdentifiers, ...relatedAliases, ...selectedRefs.map(ref => ref.identifier)].some(identifier => excluded.has(key(identifier)));
    // Store's normal contract checks all cross-group exclusions atomically too.
    const leftAliases = [item.currentIdentifier, ...(byAlias.get(item.currentIdentifier.toLowerCase())?.aliases.map(a => a.identifier) ?? [])];
    const rightAliases = historicalIdentifier ? [historicalIdentifier, ...(byAlias.get(historicalIdentifier.toLowerCase())?.aliases.map(a => a.identifier) ?? [])] : [];
    const rejected = exclusions.some(e => leftAliases.some(a => a.toLowerCase() === e.identifierAKey) && rightAliases.some(a => a.toLowerCase() === e.identifierBKey)
      || leftAliases.some(a => a.toLowerCase() === e.identifierBKey) && rightAliases.some(a => a.toLowerCase() === e.identifierAKey));
    const spellingConflict = [item.currentIdentifier, historicalIdentifier].some(identifier => identifier &&
      [...(entitiesByReference.get(key(identifier)) ?? [])].some(id => id !== entity(identifier)));
    const stored = Boolean(before.current && before.current === before.historical);
    // Global assignment can promote an existing strong candidate after other
    // claims are reserved without rewriting the candidate DTO's ready flag.
    const ready = item.status === "ready" && historicalIdentifier != null && candidate?.entityType === "player" && (candidate.ready || isPlayerFusionReadyCandidate(candidate.evidence)) && !candidate.rejected && !candidate.assignedToOtherIdentity
      && (!before.current || !before.historical || before.current === before.historical);
    const conflict = spellingConflict || rejected || candidate?.rejected || candidate?.assignedToOtherIdentity || Boolean(before.current && before.historical && before.current !== before.historical);
    entries.push({ item: clone(item), references: selectedRefs, currentIdentifier: item.currentIdentifier, historicalIdentifier, before,
      decision: explicitlyExcluded ? "excluded" : stored ? "stored" : conflict ? "conflict" : ready ? "ready" : "unresolved",
      reason: explicitlyExcluded ? "explicit-exclusion" : stored ? "same-stored-person" : conflict ? "existing-decision-or-exclusion" : ready ? "resolver-ready" : item.status });
  }
  for (const ref of refs) if (!covered.has(ref)) entries.push({ item: null, references: [ref], currentIdentifier: ref.side === "current" ? ref.identifier : null,
    historicalIdentifier: ref.side === "historical" ? ref.identifier : null, before: { current: null, historical: null },
    decision: excluded.has(key(ref.identifier)) ? "excluded" : "unresolved", reason: excluded.has(key(ref.identifier)) ? "explicit-exclusion" : "no-current-matching-candidate" });
  // A historical claim contested anywhere in the full report is never resolved
  // by selecting only the desired roster. The resolver already handles this;
  // retain a second guard at the bound selection boundary.
  const claims = new Map<string, Set<string>>();
  for (const item of input.report.items) if (item.entityType === "player" && item.status === "ready" && item.readyCandidateIdentifier) {
    const claim = key(item.readyCandidateIdentifier), owners = claims.get(claim) ?? new Set<string>();
    owners.add(key(item.currentIdentifier)); claims.set(claim, owners);
  }
  for (const entry of entries) if (entry.decision === "ready" && (claims.get(key(entry.historicalIdentifier!))?.size ?? 0) !== 1) {
    entry.decision = "conflict"; entry.reason = "assignment-conflict";
  }
  const touched = new Set(entries.flatMap(entry => [entry.currentIdentifier, entry.historicalIdentifier]).filter((v): v is string => Boolean(v)).map(v => v.toLowerCase()));
  const backupGroups = groups.filter(group => group.aliases.some(alias => touched.has(alias.identifierKey)));
  const backupAliases = new Set([...touched, ...backupGroups.flatMap(group => group.aliases.map(alias => alias.identifierKey))]);
  const preserved = await preservation(groups, exclusions, entries, input.dependencies.players);
  if (!(await revalidateLocalDataDependencies(input.dependencies)).current) throw Error("matching-basis-changed");
  const batch: FusionIdentityRosterBatch = { id: crypto.randomUUID(), preparedAt: new Date().toISOString(), dependencies: clone(input.dependencies),
    references: refs, preservation: preserved, excludedIdentifiers: [...(input.excludedIdentifiers ?? [])], entries,
    backup: { groups: backupGroups, exclusions: exclusions.filter(e => backupAliases.has(e.identifierAKey) || backupAliases.has(e.identifierBKey)) } };
  bindings.set(batch, clone(batch));
  return batch;
}

let running = false;
/** Uses only normal confirmations, coordinated store transactions and their
 * durable journals. The approved identifiers/evidence cannot grow or retarget.
 * The caller persists the prepared backup before invoking this function. */
export async function executeFusionIdentityRosterBatch(batch: FusionIdentityRosterBatch, options: {
  onProgress?: (result: RosterBatchResult) => void | Promise<void>;
  isCurrent?: () => boolean;
} = {}): Promise<RosterBatchResult> {
  const bound = bindings.get(batch);
  if (!bound || JSON.stringify(batch) !== JSON.stringify(bound)) throw Error("unbound-or-modified-batch");
  if (running) throw Error("identity-batch-already-running");
  running = true;
  try {
    return await navigator.locks.request("sfdatahub:identity-roster-batch:v1", { mode: "exclusive", ifAvailable: true }, async lock => {
      if (!lock) throw Error("identity-batch-already-running");
      const approved = clone(bound);
      const result: RosterBatchResult = { batchId: approved.id, entries: [], dependencies: approved.dependencies };
      const emit = () => options.onProgress?.(clone(result));
      await emit();
      for (const entry of approved.entries.filter(e => e.decision === "ready")) {
        const currentIdentifier = entry.currentIdentifier!, historicalIdentifier = entry.historicalIdentifier!;
        const row: RosterBatchResultEntry = { currentIdentifier, historicalIdentifier, status: "failed", journal: [] };
        try {
          await withLocalDataWrite(async lease => {
            if (options.isCurrent && !options.isCurrent()) throw Error("comparison-context-changed");
            const [left, right] = await Promise.all([getPlayerIdentity(currentIdentifier), getPlayerIdentity(historicalIdentifier)]);
            if (left && left.entityId === right?.entityId) { row.status = "skipped"; row.entityId = left.entityId; return; }
            if (!(await revalidateLocalDataDependencies(result.dependencies)).current) throw Error("matching-basis-changed");
            if ((left?.entityId ?? null) !== entry.before.current || (right?.entityId ?? null) !== entry.before.historical) throw Error("existing-decision-changed");
            if (await isPlayerMatchRejected(currentIdentifier, historicalIdentifier)) throw Error("player_match_rejected");
            const revision = result.dependencies.players;
            await confirmFusionIdentityLink("player", currentIdentifier, historicalIdentifier, { source: "automatic", lease, dependencies: result.dependencies });
            // Durable re-read after tx.done, not an optimistic resolver/UI flag.
            row.journal = await readPlayerIdentityChanges(revision);
            const [afterLeft, afterRight] = await Promise.all([getPlayerIdentity(currentIdentifier), getPlayerIdentity(historicalIdentifier)]);
            if (!afterLeft || afterLeft.entityId !== afterRight?.entityId || !row.journal.some(change => change.kinds.includes("identity") && change.identityAfter?.some(group =>
              group.identityId === afterLeft.entityId && [currentIdentifier, historicalIdentifier].every(identifier => group.aliases.some(alias => alias.toLowerCase() === identifier.toLowerCase()))))) throw Error("identity-commit-verification-failed");
            const aliases = await getPlayerAliases(afterLeft.entityId);
            if (!aliases.includes(currentIdentifier) || !aliases.includes(historicalIdentifier)) throw Error("identity-alias-verification-failed");
            row.status = "stored"; row.entityId = afterLeft.entityId;
            // The write lease excludes external mutations between the checked
            // baseline, own commit and this advanced dependency receipt.
            result.dependencies = await captureLocalDataDependencies(result.dependencies.need);
          });
        } catch (error) { row.error = error instanceof Error ? error.message : String(error); }
        result.entries.push(row); await emit();
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
      const [groups, exclusions] = await Promise.all([listPlayerEntities(), listPlayerExclusions()]);
      const actual = await preservation(groups, exclusions, approved.entries, approved.dependencies.players);
      result.preservation = { expected: approved.preservation, actual, unchanged: JSON.stringify(actual) === JSON.stringify(approved.preservation) };
      result.completedAt = new Date().toISOString(); await emit(); return result;
    });
  } finally { running = false; }
}
