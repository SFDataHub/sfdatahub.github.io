import { normalizeGuildSegmentForScan } from "../guilds/guildScanNormalizer";
import { normalizeLocalToplistServer } from "./localToplistView";
import type { LocalGuildToplistRow, LocalPlayerToplistRow } from "./localToplistTypes";

// Same name normalization and substring contract as the existing view search.
export const normalizeLocalToplistNameText = (value: unknown) => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");

const playerKey = (row: LocalPlayerToplistRow) =>
  `${normalizeLocalToplistServer(row.server)}\u0000${row.identifier.trim().toLowerCase()}`;
const guildKey = (server: string, identifier: string | null) => {
  const segment = normalizeGuildSegmentForScan(identifier);
  return segment ? `${normalizeLocalToplistServer(server)}\u0000${segment}` : null;
};

/** Prepared once per worker dataset. Membership is the displayed player's
 * explicit guild identifier, with the existing scan/server normalization. */
export function buildLocalToplistNameFilter(players: readonly LocalPlayerToplistRow[], guilds: readonly LocalGuildToplistRow[]) {
  const guildNames = new Map(guilds.map(row => [guildKey(row.server, row.guildIdentifier), normalizeLocalToplistNameText(row.name)]));
  const playerEntries = players.map(row => {
    const guild = guildKey(row.server, row.guildIdentifier);
    return { key: playerKey(row), name: normalizeLocalToplistNameText(row.name), guild,
      guildNames: [normalizeLocalToplistNameText(row.guild), guild ? guildNames.get(guild) ?? "" : ""] };
  });
  const guildEntries = guilds.map(row => ({ key: guildKey(row.server, row.guildIdentifier), name: normalizeLocalToplistNameText(row.name) }));
  return (text: string) => {
    const query = normalizeLocalToplistNameText(text);
    const matchingPlayers = new Set<string>();
    const matchingGuilds = new Set<string>();
    for (const entry of guildEntries) if (entry.key && entry.name.includes(query)) matchingGuilds.add(entry.key);
    for (const entry of playerEntries) {
      const nameMatch = entry.name.includes(query);
      if (nameMatch && entry.guild) matchingGuilds.add(entry.guild);
      if (nameMatch || entry.guildNames.some(name => name.includes(query))) matchingPlayers.add(entry.key);
    }
    // Player-name matches add their guild only to the guild view. They must
    // never turn into a match for all fellow members in the player view.
    return {
      player: (row: LocalPlayerToplistRow) => matchingPlayers.has(playerKey(row)),
      guild: (row: LocalGuildToplistRow) => matchingGuilds.has(guildKey(row.server, row.guildIdentifier) ?? ""),
    };
  };
}
