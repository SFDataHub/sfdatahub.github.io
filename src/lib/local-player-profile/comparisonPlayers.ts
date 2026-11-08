import type { HubPlayerSelection } from "../../pages/DataHub/HubSearch";
import { referenceKey, type FavoriteReference } from "../data-hub/hubFavoritesContract";
import { resolvePlayerIdentity, type IdentityResolutionSnapshot } from "../identities/identityResolution";

// Existing entity-chart palette, retaining W221's first comparison color.
export const PLAYER_COMPARISON_COLORS = ["#f59e0b", "#c084fc", "#f43f5e"] as const;
export type ComparisonPlayer = { id: string; identityKey: string; color: string; selection: HubPlayerSelection };

export function comparisonPlayerIdentity(identity: IdentityResolutionSnapshot, reference: FavoriteReference) {
  const resolved = resolvePlayerIdentity(identity, reference.identifier);
  return resolved.status === "conflict" ? null : resolved.resolved ? `identity:${resolved.identityId}` : `reference:${referenceKey(reference)}`;
}

/** Atomic after async validation: inspect the latest list, with this same shared
 * identity snapshot. Names never participate in identity or duplicate checks. */
export function appendComparisonPlayer(players: ComparisonPlayer[], selection: HubPlayerSelection,
  owner: FavoriteReference | null, identity: IdentityResolutionSnapshot): ComparisonPlayer[] {
  if (players.length >= PLAYER_COMPARISON_COLORS.length) return players;
  const id = referenceKey(selection.reference), identityKey = comparisonPlayerIdentity(identity, selection.reference);
  if (!identityKey || owner && (referenceKey(owner) === id || comparisonPlayerIdentity(identity, owner) === identityKey) ||
    players.some(player => player.id === id || comparisonPlayerIdentity(identity, player.selection.reference) === identityKey)) return players;
  const color = PLAYER_COMPARISON_COLORS.find(value => !players.some(player => player.color === value))!;
  return [...players, { id, identityKey, color, selection }];
}
