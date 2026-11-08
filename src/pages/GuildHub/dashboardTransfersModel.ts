import type { IdentityResolutionSnapshot } from "../../lib/identities/identityResolution";
import { observationReferenceKey } from "../../lib/servers/serverResolver";
import { localGuildRankingIdentityKey } from "./localGuildRanking";

/** One key per confirmed person, otherwise the complete observed reference.
 * Keep the first actual row for labels/actions; raw observations and conflicts
 * remain available to diagnostics without manufacturing extra transfers. */
export const dashboardTransferIdentityKey = (member: { key: string }, identities: IdentityResolutionSnapshot | null) =>
  localGuildRankingIdentityKey(member, identities)?.replace(/^literal:.+$/, `literal:${observationReferenceKey(member.key)}`) ??
  `observation:${member.key.trim().toLowerCase()}`;

export function classifyDashboardTransfers<T extends { key: string; server?: string | null }>(
  latest: readonly T[], previous: readonly T[], identities: IdentityResolutionSnapshot | null,
): { joined: T[]; left: T[] } {
  const index = (members: readonly T[]) => {
    const buckets = new Map<string, T>();
    for (const member of members) {
      const key = dashboardTransferIdentityKey(member, identities);
      if (!buckets.has(key)) buckets.set(key, member);
    }
    return buckets;
  };
  const current = index(latest), historical = index(previous);
  return {
    joined: [...current].filter(([key]) => !historical.has(key)).map(([, row]) => row),
    left: [...historical].filter(([key]) => !current.has(key)).map(([, row]) => row),
  };
}
