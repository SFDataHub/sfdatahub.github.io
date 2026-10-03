import { normalizeGuildSegmentForScan } from "../guilds/guildScanNormalizer";
import { newestToplistRow, toplistRowIdentity } from "./toplistRowIdentity";

type SourceRow = { server: string; scanTimestamp: number; archiveScanId: string };
type PlayerRow = SourceRow & { identifier: string; playerId?: string | null; guildIdentifier: string | null };
type GuildRow = SourceRow & {
  guildIdentifier: string;
  memberBasisStatus: "complete" | "incomplete" | "unknown";
  memberPlayerIdentifiers?: readonly string[];
};

export const earliestMonthlyRow = <T extends SourceRow>(left: T, right: T): T =>
  left.scanTimestamp === right.scanTimestamp
    ? newestToplistRow(left, right)
    : left.scanTimestamp < right.scanTimestamp ? left : right;

export const selectMonthlyGuildRow = <T extends GuildRow>(left: T, right: T): T => {
  if (left.memberBasisStatus === "complete" && right.memberBasisStatus === "complete") return newestToplistRow(left, right);
  if (left.memberBasisStatus === "complete") return left;
  if (right.memberBasisStatus === "complete") return right;
  return earliestMonthlyRow(left, right);
};

// Only explicit set members enter this function. Guild averages remain those of
// the selected physical source; no member data from other timestamps is mixed.
export function composeMonthlySet<P extends PlayerRow, G extends GuildRow>(
  snapshots: readonly { playerRows: readonly P[]; guildRows: readonly G[] }[],
) {
  const players = new Map<string, P>();
  const guilds = new Map<string, { row: G; players: readonly P[] }>();
  for (const snapshot of snapshots) {
    for (const row of snapshot.playerRows) {
      const key = toplistRowIdentity(row.server, row.playerId ?? row.identifier, "players");
      const previous = players.get(key);
      players.set(key, previous ? earliestMonthlyRow(previous, row) : row);
    }
    for (const row of snapshot.guildRows) {
      const key = toplistRowIdentity(row.server, row.guildIdentifier, "groups");
      const previous = guilds.get(key);
      if (!previous || selectMonthlyGuildRow(previous.row, row) === row) guilds.set(key, { row, players: snapshot.playerRows });
    }
  }
  const members = new Map<string, P>();
  for (const { row: guild, players: sourcePlayers } of guilds.values()) {
    if (guild.memberBasisStatus !== "complete") continue;
    const expected = new Set(guild.memberPlayerIdentifiers ?? []);
    for (const player of sourcePlayers) {
      const key = toplistRowIdentity(player.server, player.playerId ?? player.identifier, "players");
      const sameServer = toplistRowIdentity(player.server, player.identifier, "players") === toplistRowIdentity(guild.server, player.identifier, "players");
      if (!expected.has(player.identifier) || !sameServer || player.scanTimestamp !== guild.scanTimestamp || player.archiveScanId !== guild.archiveScanId ||
          normalizeGuildSegmentForScan(player.guildIdentifier) !== normalizeGuildSegmentForScan(guild.guildIdentifier)) continue;
      const previous = members.get(key);
      // A player occurring in two selected guild sources keeps the newest
      // selected complete source, independently of iteration order.
      members.set(key, previous ? newestToplistRow(previous, player) : player);
    }
  }
  for (const [key, row] of members) players.set(key, row);
  const byKey = <T>(entries: Iterable<[string, T]>) => [...entries].sort(([left], [right]) => left.localeCompare(right)).map(([, row]) => row);
  return { playerRows: byKey(players), guildRows: byKey([...guilds].map(([key, value]) => [key, value.row] as [string, G])) };
}
