import { serverComparisonKey } from "../servers/serverResolver";
import { auditCurrent, auditCall, auditBegin, auditFields, auditEvent, auditLeave, auditEnabled, auditDependencyId, type AuditFields, type AuditRun } from "../data-hub/runtimeAudit";
import { listGuildHubScanSummaries, type GuildHubScanSummary, readSfDataHubLocalChanges } from "../guilds/localScanLibrary";
import { readPlayerIdentityChanges } from "../identities/playerIdentityStore";
import { readGuildIdentityChanges } from "../identities/guildIdentityStore";
import { isLocalDataChangeRelevant, subscribeToLocalDataChanges, type LocalDataChange, type LocalDataDependencies } from "./localDataChanges";

export type LocalDependencyReceipt = {
  need: LocalDataDependencies;
  sources: number;
  players: number;
  guilds: number;
};
const lastSequence = (changes: LocalDataChange[], previous = 0) => changes[changes.length - 1]?.sequence ?? previous;
async function readChanges(need: LocalDataDependencies, after = { sources: 0, players: 0, guilds: 0 }, latestOnly = false) {
  const audit = auditCurrent();
  return Promise.all([
    need.hubSearchResets || need.hubSearch || need.scanInventory || need.toplistResets || need.allSources || need.sourceScope || need.sourceIds?.length || need.servers?.length ? auditCall(audit, "source-change-journal-read", () => readSfDataHubLocalChanges(after.sources, latestOnly), "async-elapsed") : [],
    need.allIdentities || need.playerAliases?.length || need.playerIdentityIds?.length ? auditCall(audit, "player-change-journal-read", () => readPlayerIdentityChanges(after.players, latestOnly), "async-elapsed") : [],
    need.allIdentities || need.guildAliases?.length || need.guildIdentityIds?.length ? auditCall(audit, "guild-change-journal-read", () => readGuildIdentityChanges(after.guilds, latestOnly), "async-elapsed") : [],
  ]);
}
export async function captureLocalDataDependencies(need: LocalDataDependencies): Promise<LocalDependencyReceipt> {
  const stableNeed: LocalDataDependencies = Object.fromEntries(Object.entries(need).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]));
  // Baselines need only the last committed sequence, not all historical payloads.
  // Catch-up/revalidation still reads every change after this exact watermark.
  const [sources, players, guilds] = await readChanges(stableNeed, undefined, true);
  return { need: stableNeed, sources: lastSequence(sources), players: lastSequence(players), guilds: lastSequence(guilds) };
}
export async function revalidateLocalDataDependencies(receipt: LocalDependencyReceipt, diagnosticContext?: AuditFields) {
  const audit = auditCurrent();
  diagnosticContext ??= audit?.record ? { trigger: audit.record.fields.trigger, consumer: audit.record.fields.consumer, consumerId: audit.record.fields.consumerId } : undefined;
  const [sources, players, guilds] = await readChanges(receipt.need, receipt);
  auditEvent(audit, "durable-changes-read", { sourceChanges: sources.length, playerChanges: players.length, guildChanges: guilds.length, scopeProofRequired: !!receipt.need.sourceScope });
  const relevantSources = receipt.need.sourceScope ? await filterScopedSourceChanges(sources, receipt.need, audit, diagnosticContext) : sources;
  return {
    current: ![...relevantSources, ...players, ...guilds].some(change => isLocalDataChangeRelevant(change, receipt.need)),
    receipt: { need: receipt.need, sources: lastSequence(sources, receipt.sources), players: lastSequence(players, receipt.players), guilds: lastSequence(guilds, receipt.guilds) },
  };
}

export type LocalDependencyNotification = AuditFields & { trigger: string };
export type LocalDependencySubscription = (() => void) & { hasBaseline: () => boolean; matches: (need: LocalDataDependencies) => boolean };

/** Notifications only prompt durable checks. Focus/resume catches up even if
 * BroadcastChannel was absent or the subscriber missed every live event. */
export function subscribeToLocalDataDependencies(need: LocalDataDependencies, listener: (cause?: LocalDependencyNotification, checked?: LocalDependencyReceipt) => void, onError: (error: unknown, cause?: LocalDependencyNotification) => void = console.error, diagnosticContext?: AuditFields, checkExternalChanges?: () => Promise<boolean>) {
  let stopped = false, checking = false, pending = false;
  let baselineReady = false;
  const scopeKey = JSON.stringify(need);
  let pendingCause: LocalDependencyNotification | undefined;
  const baseline = captureLocalDataDependencies(need);
  let receipt: LocalDependencyReceipt | undefined;
  const initialLiveSequences = new Map<"sources" | "players" | "guilds", LocalDataChange[]>();
  async function check(cause?: LocalDependencyNotification) {
    pendingCause = cause;
    pending = true;
    if (checking || stopped) return;
    checking = true;
    try {
      receipt ??= await baseline;
      while (pending && !stopped) {
        pending = false;
        const cause = pendingCause;
        // External selections share this serialized resume/check loop. A live
        // change arriving during the check is covered by the next pending pass.
        const externalChanged = await checkExternalChanges?.() ?? false;
        const audit = diagnosticContext ? auditBegin("S06", "dependency-revalidation", null) : null;
        auditFields(audit, { ...diagnosticContext, consumerId: diagnosticContext?.consumerId ?? auditDependencyId(listener), ...cause, consoleRole: "observation", beforeSources: receipt.sources, beforePlayers: receipt.players, beforeGuilds: receipt.guilds });
        let result: Awaited<ReturnType<typeof revalidateLocalDataDependencies>>;
        try { result = await auditCall(audit, "durable-dependency-check", () => revalidateLocalDataDependencies(receipt!, diagnosticContext ? { ...diagnosticContext, ...cause } : undefined), "async-container"); }
        catch (error) { auditEvent(audit, "dependency-error", { errorClass: error instanceof Error ? error.name : "unknown" }); auditLeave(audit); throw error; }
        auditFields(audit, { afterSources: result.receipt.sources, afterPlayers: result.receipt.players, afterGuilds: result.receipt.guilds, current: result.current });
        receipt = result.receipt;
        // A live commit can arrive while the initial baseline is still loading
        // and already be included in it. Report that commit once after a durable
        // read covers it; otherwise it would be silently swallowed at startup.
        let initialLiveCovered = false;
        for (const [owner, changes] of initialLiveSequences) {
          const covered = changes.filter(change => (change.sequence ?? 0) <= result.receipt[owner]);
          const relevant = owner === "sources" && need.sourceScope ? await filterScopedSourceChanges(covered, need, audit, diagnosticContext ? { ...diagnosticContext, ...cause } : undefined) : covered;
          if (relevant.length) initialLiveCovered = true;
          const remaining = changes.filter(change => (change.sequence ?? 0) > result.receipt[owner]);
          if (remaining.length) initialLiveSequences.set(owner, remaining); else initialLiveSequences.delete(owner);
        }
        if ((!result.current || initialLiveCovered || externalChanged) && !stopped) {
          auditEvent(audit, "dependency-notification", { initialLiveCovered });
          auditCall(audit, "consumer-notification", () => listener(diagnosticContext && auditEnabled() ? { ...cause, trigger: cause?.trigger ?? "dependency-change", dependencyAuditId: audit?.id,
            sourceSequence: receipt!.sources, playerSequence: receipt!.players, guildSequence: receipt!.guilds } : undefined, receipt));
        }
        auditLeave(audit);
      }
    } catch (error) { if (!stopped) onError(error, pendingCause); }
    finally { checking = false; }
  }
  // Consume baseline failures even when no focus or live event ever arrives.
  void baseline.then(() => { baselineReady = true; }, error => { if (!stopped) onError(error); });
  const unsubscribe = subscribeToLocalDataChanges(change => {
    if (!isLocalDataChangeRelevant(change, need)) return;
    if (!receipt && change.sequence !== undefined) {
      const owner = change.owner === "player-identities" ? "players" : change.owner === "guild-identities" ? "guilds" : "sources";
      initialLiveSequences.set(owner, [...(initialLiveSequences.get(owner) ?? []), change]);
    }
    void check(diagnosticContext && auditEnabled() ? { trigger: "local-data-change", changeOwner: change.owner, changeSequence: change.sequence } : undefined);
  });
  const resume = (event: Event) => { if (typeof document === "undefined" || document.visibilityState !== "hidden") void check(diagnosticContext && auditEnabled() ? { trigger: event.type } : undefined); };
  if (typeof window !== "undefined") {
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    document.addEventListener("resume", resume);
  }
  return Object.assign(() => {
    stopped = true;
    unsubscribe();
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
      document.removeEventListener("resume", resume);
    }
  }, { hasBaseline: () => baselineReady && !stopped,
    matches: (required: LocalDataDependencies) => baselineReady && !stopped && JSON.stringify(required) === scopeKey });
}

/** Inventory proves additions to a player/guild scope. Source IDs already in a
 * receipt always invalidate, even on delete. Unknown inventories stay conservative. */
type AnalyticsSourceScope = NonNullable<LocalDataDependencies["sourceScope"]>;
const canonicalScopeIdentifier = (value: string) => {
  const ref = value.replace(/^identifier:/i, "").toLowerCase();
  const match = ref.match(/^(.+)(_[pg][^_]+)$/);
  return match ? `${serverComparisonKey(match[1])?.toLowerCase() ?? match[1]}${match[2]}` : serverComparisonKey(ref)?.toLowerCase() ?? ref;
};

/** Prepare one selection snapshot for repeated inventory checks. The caller
 * owns its lifetime and must prepare a new matcher for a changed scope. */
export function createAnalyticsScopeMatcher(scope: AnalyticsSourceScope) {
  const players = new Set((scope.players ?? []).map(canonicalScopeIdentifier));
  const guilds = new Set((scope.guilds ?? []).map(canonicalScopeIdentifier));
  const servers = new Set((scope.servers ?? []).map(canonicalScopeIdentifier));
  const hasServers = Boolean(scope.servers?.length);
  const includes = (values: readonly string[], target: ReadonlySet<string>) =>
    target.size > 0 && values.some(value => target.has(canonicalScopeIdentifier(value)));
  return (summary: GuildHubScanSummary) => {
    if (includes(summary.guilds.flatMap(g => g.guildIdentifier ? [g.guildIdentifier] : []), guilds)) return true;
    const slices = summary.fusionInventorySlices;
    if (slices?.some(s => includes(s.playerIdentifiers ?? [], players) || includes(s.guildIdentifiers ?? [], guilds))) return true;
    const known = Boolean(slices?.length && slices.every(s => Array.isArray(s.playerIdentifiers)));
    if (known && !hasServers) return false;
    const sourceServers = [...summary.servers, ...summary.guilds.map(g => g.server)].filter((s): s is string => Boolean(s));
    return !sourceServers.length || includes(sourceServers, servers);
  };
}

/** Compatible single-summary entry point; inventory callers prepare once. */
export function isSummaryInAnalyticsScope(summary: GuildHubScanSummary, scope: AnalyticsSourceScope) {
  return createAnalyticsScopeMatcher(scope)(summary);
}

async function filterScopedSourceChanges(changes:LocalDataChange[],need:LocalDataDependencies,audit:AuditRun|null=null,diagnosticContext?:AuditFields) {
 // A durable empty journal proves that this receipt's source generation has
 // not changed. Known IDs/deletions also do not require a global inventory.
 const needsInventory = changes.some(change =>
   ![...change.sourceIds, ...change.removedSourceIds].some(id => need.sourceIds?.includes(id)) &&
   change.sourceIds.some(id => !change.removedSourceIds.includes(id)));
 if (!needsInventory) return changes.filter(change =>
   [...change.sourceIds, ...change.removedSourceIds].some(id => need.sourceIds?.includes(id)) ||
   !change.sourceIds.length && change.unknownImpact);
 const summaries=await auditCall(audit,"scope-inventory-proof",()=>listGuildHubScanSummaries({ auditContext: diagnosticContext }),"async-container");const byId=new Map(summaries.map(s=>[s.sourceScanId,s]));
 const matchesScope = createAnalyticsScopeMatcher(need.sourceScope!);
 return changes.filter(change=>{
   if([...change.sourceIds,...change.removedSourceIds].some(id=>need.sourceIds?.includes(id)))return true;
   if(!change.sourceIds.length)return change.unknownImpact;
   return change.sourceIds.some(id=>{const summary=byId.get(id);return summary?matchesScope(summary):!change.removedSourceIds.includes(id);});
 });
}
