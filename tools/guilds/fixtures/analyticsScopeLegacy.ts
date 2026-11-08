// W-53 oracle: verbatim pre-fix predicate, independent of the new matcher.
import { normalizeServerKeyFromInput } from "../../../src/lib/players/identifier";
import type { GuildHubScanSummary } from "../../../src/lib/guilds/localScanLibrary";
import type { LocalDataDependencies } from "../../../src/lib/local-data/localDataChanges";
export function legacySummaryInAnalyticsScope(summary: GuildHubScanSummary, scope: NonNullable<LocalDataDependencies["sourceScope"]>) {
 const canonical=(value:string)=>{ const ref=value.replace(/^identifier:/i, "").toLowerCase(); const match=ref.match(/^(.+)(_[pg][^_]+)$/); return match ? `${normalizeServerKeyFromInput(match[1])?.toLowerCase() ?? match[1]}${match[2]}` : normalizeServerKeyFromInput(ref)?.toLowerCase() ?? ref; };
 const includes=(values:readonly string[],target:readonly string[]=[])=>(values.some(v=>target.some(t=>canonical(t)===canonical(v))));
 if(includes(summary.guilds.flatMap(g=>g.guildIdentifier?[g.guildIdentifier]:[]),scope.guilds))return true;
 const slices=summary.fusionInventorySlices;
 if(slices?.some(s=>includes(s.playerIdentifiers??[],scope.players)||includes(s.guildIdentifiers??[],scope.guilds)))return true;
 const known=Boolean(slices?.length && slices.every(s=>Array.isArray(s.playerIdentifiers)));
 if(known && !scope.servers?.length)return false;
 const servers=[...summary.servers,...summary.guilds.map(g=>g.server)].filter((s):s is string=>Boolean(s));
 return !servers.length || includes(servers,scope.servers);
}
