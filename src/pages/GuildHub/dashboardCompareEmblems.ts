import type { GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";
import { isValidGuildCoaString } from "../../lib/guilds/guildCoa";
import { resolveGuildIdentity, type IdentityResolutionSnapshot } from "../../lib/identities/identityResolution";
import { buildGuildTrendTargetIdentifierCandidates } from "../Playground/playerPerformanceModel";
import type { DashboardGuildComparison } from "./dashboardGuildComparison";

export type CompareGuildEmblemSource = { coaString: string | null; identifier: string | null; sourceScanId: string | null };

/** Join existing metadata only. No raw scan reads, normalization or data writes.
 * The same confirmed identity/candidate contract is used by the HoF join. */
export function buildDashboardCompareEmblems({ comparison, summaries, identities, currentAt, primary }: {
  comparison: DashboardGuildComparison; summaries: readonly GuildHubScanSummary[];
  identities: IdentityResolutionSnapshot | null; currentAt: number;
  primary: CompareGuildEmblemSource;
}) {
  const displayRows = [...new Map([...comparison.displayRows, ...comparison.hofDisplayRows].map(row => [row.key, row])).values()];
  const tokens = (identifier: string | null, server: string | null) => {
    if (!identifier) return [];
    const candidates = buildGuildTrendTargetIdentifierCandidates({ logoIdentifier: identifier, server: server ?? "" }).filter(ref => /_g[^_]+$/i.test(ref));
    const resolved = identities ? candidates.map(ref => resolveGuildIdentity(identities, ref)).find(value => value.resolved) : null;
    return [...candidates.map(ref => ref.toLowerCase()), ...(resolved?.resolved ? ["identity:" + resolved.identityId] : [])];
  };
  const owners = new Map<string, Set<string>>();
  const latestByOwner = new Map<string, { at: number; sourceScanId: string; identifier: string | null }>();
  for (const row of displayRows) {
    const all = new Set([row.key]);
    for (const stand of row.byTime.values()) {
      tokens(stand.guild.guildIdentifier, stand.guild.server).forEach(key => all.add(key));
      const latest = latestByOwner.get(row.key);
      if (!latest || stand.guild.snapshotTimestamp > latest.at) latestByOwner.set(row.key, { at: stand.guild.snapshotTimestamp, sourceScanId: stand.guild.sourceScanId, identifier: stand.guild.guildIdentifier });
    }
    for (const key of all) { const rows = owners.get(key) ?? new Set(); rows.add(row.key); owners.set(key, rows); }
  }
  const matches = new Map<string, { source: CompareGuildEmblemSource; at: number; usable: boolean }>();
  const counts = new Map<string, number>();
  for (const summary of summaries) for (const guild of summary.guilds) {
    const at = Date.parse(guild.sourceScannedAt ?? "") || summary.lastSnapshotTimestamp || Date.parse(summary.scannedAt ?? "");
    if (!Number.isFinite(at) || at > currentAt) continue;
    const matched = new Set(tokens(guild.guildIdentifier, guild.server).flatMap(key => [...(owners.get(key) ?? [])]));
    for (const owner of matched) {
      counts.set(owner, (counts.get(owner) ?? 0) + 1);
      const usable = typeof guild.coaString === "string" && isValidGuildCoaString(guild.coaString);
      const previous = matches.get(owner);
      const preferred = summary.sourceScanId === latestByOwner.get(owner)?.sourceScanId;
      if (previous && (Number(previous.usable) > Number(usable) || previous.usable === usable &&
        (previous.at > at || previous.at === at && (!preferred || previous.source.sourceScanId === summary.sourceScanId)))) continue;
      matches.set(owner, { at, usable, source: { coaString: usable ? guild.coaString! : null, identifier: guild.guildIdentifier, sourceScanId: summary.sourceScanId } });
    }
  }
  const emblems: Record<string, CompareGuildEmblemSource> = {};
  const diagnostics = displayRows.map(row => {
    const match = matches.get(row.key);
    const ownPrimary = row.key === comparison.currentGuildKey && typeof primary.coaString === "string" && isValidGuildCoaString(primary.coaString);
    const source = ownPrimary ? primary : match?.source ?? { coaString: null, identifier: latestByOwner.get(row.key)?.identifier ?? null, sourceScanId: null };
    emblems[row.key] = source;
    return { key: row.key, name: row.name, matchedMetadata: counts.get(row.key) ?? 0, hasCoa: Boolean(source.coaString), identifier: source.identifier, sourceScanId: source.sourceScanId };
  });
  return { emblems, diagnostics };
}
