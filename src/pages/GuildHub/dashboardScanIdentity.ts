import { favoriteReference, referenceKey } from "../../lib/data-hub/hubFavoritesContract";
import { guildObservationIdentifierCandidates, resolveObservedGuildIdentity } from "../../lib/identities/guildObservationIdentity";
import { resolveGuildIdentity, resolvePlayerIdentity, type IdentityResolutionSnapshot } from "../../lib/identities/identityResolution";
import type { LocalDependencyReceipt } from "../../lib/local-data/localDataDependencies";

export type ScanIdentityStand = { sourceScanId: string; scannedAtMs: number; guildIdentifier?: string | null };
export type ScanIdentitySummary = {
  observed: number; confirmed: number; unresolved: number; conflicts: number; declared: number | null;
  guild: "confirmed" | "unresolved" | "conflict" | "not-checkable";
  overall: "complete" | "observed-only" | "incomplete";
  issues: Array<{ key: string; names: string[]; references: string[]; reason: "unresolved" | "invalid-reference" | "conflicting-rows" }>;
};
export type ScanIdentityContext = {
  stand: ScanIdentityStand; role: "current" | "transfer" | "ranking";
  status: "ready" | "not-checked" | "checking" | "stale";
  summary?: ScanIdentitySummary; contentHash?: string;
  revisions?: IdentityResolutionSnapshot["revisions"]; dependencies?: LocalDependencyReceipt;
};
type Member = { key: string; name?: string | null; localRef?: { identifier?: string | null; sourcePlayerKey: string } };

/** Summarize only the roster already consumed by this job. No IO or matching. */
export function summarizeScanIdentities(members: readonly Member[], identities: IdentityResolutionSnapshot,
  guildIdentifier: string | null | undefined, declaredMemberCount: number | null | undefined): ScanIdentitySummary {
  const buckets = new Map<string, { rows: Member[]; confirmed: boolean; invalid: boolean }>();
  for (const member of members) {
    const identifier = member.localRef ? member.localRef.identifier : member.key;
    const ref = favoriteReference("player", identifier);
    const resolved = ref ? resolvePlayerIdentity(identities, ref.identifier) : null;
    const key = resolved?.resolved ? `identity:${resolved.identityId}` : ref ? `literal:${ref.identifier}` : `row:${member.localRef?.sourcePlayerKey ?? member.key}`;
    const bucket = buckets.get(key) ?? { rows: [], confirmed: !!resolved?.resolved, invalid: !ref };
    if (!bucket.rows.some(row => JSON.stringify(row) === JSON.stringify(member))) bucket.rows.push(member);
    buckets.set(key, bucket);
  }
  const issues: ScanIdentitySummary["issues"] = [];
  let confirmed = 0, unresolved = 0, conflicts = 0;
  for (const [key, bucket] of buckets) {
    if (bucket.rows.length > 1) conflicts++;
    else if (bucket.confirmed) { confirmed++; continue; }
    else unresolved++;
    issues.push({ key, names: [...new Set(bucket.rows.flatMap(row => row.name ? [row.name] : []))],
      references: [...new Set(bucket.rows.map(row => row.localRef?.identifier ?? row.localRef?.sourcePlayerKey ?? row.key))],
      reason: bucket.rows.length > 1 ? "conflicting-rows" : bucket.invalid ? "invalid-reference" : "unresolved" });
  }
  const candidates = guildObservationIdentifierCandidates(guildIdentifier);
  const guildGroups = new Set(candidates.flatMap(ref => { const match = resolveGuildIdentity(identities, ref); return match.resolved ? [match.identityId] : []; }));
  const guild = guildGroups.size > 1 ? "conflict" : !candidates.length ? "not-checkable"
    : resolveObservedGuildIdentity(identities, guildIdentifier).resolved ? "confirmed" : "unresolved";
  const declared = declaredMemberCount != null && Number.isSafeInteger(declaredMemberCount) && declaredMemberCount >= 0 ? declaredMemberCount : null;
  const observed = buckets.size;
  return { observed, confirmed, unresolved, conflicts, declared, guild, issues,
    overall: observed > 0 && confirmed === observed && guild !== "conflict"
      ? declared === null ? "observed-only" : declared === observed ? "complete" : "incomplete" : "incomplete" };
}

/** Equal observations/revisions may serve several consumers. A worker at a
 * different revision keeps its own result instead of inheriting a fresh one. */
export function groupScanIdentityContexts(contexts: readonly ScanIdentityContext[]) {
  const groups = new Map<string, { context: ScanIdentityContext; roles: ScanIdentityContext["role"][] }>();
  for (const context of contexts) {
    const ref = favoriteReference("guild", context.stand.guildIdentifier);
    const key = JSON.stringify([context.stand.sourceScanId, context.stand.scannedAtMs, ref ? referenceKey(ref) : context.stand.guildIdentifier,
      context.contentHash, context.revisions, context.status, context.summary]);
    const existing = groups.get(key);
    if (existing) { if (!existing.roles.includes(context.role)) existing.roles.push(context.role); }
    else groups.set(key, { context, roles: [context.role] });
  }
  return [...groups.values()];
}
