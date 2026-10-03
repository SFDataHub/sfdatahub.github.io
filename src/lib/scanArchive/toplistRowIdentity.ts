import { normalizeServerKeyFromInput, parsePlayerIdentifier } from "../players/identifier";

export const toplistRowIdentity = (server: string, identifier: string, kind: "players" | "groups") => {
  const serverKey = normalizeServerKeyFromInput(server) ?? server.trim().toLowerCase();
  const entityId = kind === "players" ? parsePlayerIdentifier(identifier)?.playerId ?? identifier : identifier;
  return `${serverKey}\u0000${entityId.toLowerCase()}`;
};

// Shared with logical toplist merging: equal timestamps keep the larger scan ID,
// and equal scan IDs keep the first row from that physical scan.
export const newestToplistRow = <T extends { scanTimestamp: number; archiveScanId: string }>(left: T, right: T): T => {
  if (left.scanTimestamp !== right.scanTimestamp) return left.scanTimestamp > right.scanTimestamp ? left : right;
  return left.archiveScanId.localeCompare(right.archiveScanId, undefined, { numeric: true, sensitivity: "base" }) >= 0 ? left : right;
};
