import { resolvePlayerIdentity, type IdentityResolutionSnapshot } from "./identityResolution";
import { parsePlayerIdentifier } from "../players/identifier";
import { getFusionEventForTarget, isFusionAncestor, resolveServer } from "../servers/serverResolver";

/** Origin server field in the existing compact v2 scan contract; never a player ID. */
export function readCurrentCompactOriginNumericId(player: Record<string, unknown> | null) {
  const finite = (value: unknown): number | null => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  if (!player || finite(player.saveVersion) !== 2 || !Array.isArray(player.save) || player.save.length !== 70) return null;
  return finite(player.save[68]);
}

/** Read-only provenance from this player's confirmed aliases and explicit scan origin.
 * Fusion ancestry validates evidence; it never supplies a player's missing origin.
 * Persisted aliases remain evidence even when their original raw scans are absent.
 */
export function resolvePlayerOriginServer(identity: Pick<IdentityResolutionSnapshot, "players">, identifier: string,
  rawPlayer: Record<string, unknown> | null = null) {
  const resolution = resolvePlayerIdentity(identity, identifier);
  if (resolution.status === "conflict") return null;
  const identifiers = [identifier, ...resolution.aliasIdentifiers];
  const servers = identifiers.map(ref => resolveServer(parsePlayerIdentifier(ref)?.serverKey));
  if (servers.some(server => !server)) return null;
  const codes = new Set(servers.map(server => server!.code));
  const numeric = readCurrentCompactOriginNumericId(rawPlayer);
  if (numeric != null && numeric !== 0) {
    const origin = resolveServer(numeric);
    if (!origin || !isFusionAncestor(origin.code, servers[0]!.code)) return null;
    codes.add(origin.code);
  }
  const roots = [...codes].filter(code => !getFusionEventForTarget(code));
  if (roots.length !== 1) return null;
  const root = roots[0];
  return [...codes].every(code => isFusionAncestor(root, code)) ? resolveServer(root) : null;
}
