import type { LocalPlayerProfileModel } from "../../components/local-player-profile/types";
import { selectEntriesForServers, type LocalToplistArchiveContext } from "../../pages/DataHub/localToplistPageModel";
import type { IdentityResolutionSnapshot } from "../identities/identityResolution";
import { resolvePlayerOriginServer } from "../identities/playerOrigin";
import { getFusionEventForTarget, serverComparisonKey } from "../servers/serverResolver";

/** Current selection remains authoritative. Only an absent fusion selection can
 * use this player's proven origin; malformed/unavailable data is never absence. */
export function resolvePrimaryRadarReference(context: LocalToplistArchiveContext, identity: Pick<IdentityResolutionSnapshot, "players">,
  profile: LocalPlayerProfileModel) {
  if (context.issues.some(issue => issue.code === "catalog-error" || issue.code === "manifest-error"))
    throw Error("Current source selection unavailable");
  const physical = serverComparisonKey(profile.analytics.server);
  if (!physical) return null;
  const select = (server: string) => {
    if (context.issues.some(issue => serverComparisonKey(issue.server) === server &&
        (issue.code === "current-conflict" || issue.code === "entry-missing"))) throw Error("Current server selection invalid");
    const entries = selectEntriesForServers(context.entries, [server]);
    if (!entries.length) return null;
    const months = new Set(entries.map(row => new Date(row.timestamp).toISOString().slice(0, 7)));
    if (months.size !== 1) throw Error("Current server selection spans multiple months");
    return { server, month: [...months][0], entries };
  };
  const current = select(physical);
  if (current || !getFusionEventForTarget(physical)) return current;
  const origin = resolvePlayerOriginServer(identity,
    profile.currentSeed?.rawIdentifier ?? profile.analytics.memberRef ?? profile.sourcePlayerKey,
    profile.currentSeed?.rawPlayer ?? null);
  return origin && origin.code !== physical ? select(origin.code) : null;
}
