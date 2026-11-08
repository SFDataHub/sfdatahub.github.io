import { useMemo } from "react";
import { useHubFavorites } from "./useHubFavorites";
import { useHubFavoritesProjection } from "./useHubFavoritesProjection";
import { favoriteReference, referenceKey } from "./hubFavoritesContract";
import { resolveServer } from "../servers/serverResolver";
import type { AuthFavorites } from "../auth/types";

/** Compatibility view for existing profiles; filters also accept literal server aliases.
 * Cross-server identity aliases require the independently checked local projection. */
export function useFavoriteMembership() {
  const store = useHubFavorites();
  const projection = useHubFavoritesProjection(store.snapshot?.record, "favorite-membership");
  const membership = useMemo(() => {
    const favorites: AuthFavorites = { players: {}, guilds: {} }, filterFavorites: AuthFavorites = { players: {}, guilds: {} };
    for (const f of store.snapshot?.record.favorites ?? []) {
      const row = projection.rows.find(row => row.favorite.id === f.id);
      if (!f.reference || f.referenceIssue || row?.identity === "conflict") continue;
      const assign = (target: AuthFavorites, identifier: string) => {
        if (f.kind === "player") target.players![identifier.toLowerCase()] = { name: f.display.name ?? identifier, class: f.display.className ?? "" };
        else target.guilds![identifier.toLowerCase()] = true;
      };
      assign(favorites, f.reference.identifier);
      const refs = [f.reference, ...f.originalReferences.filter(ref => referenceKey(ref) === referenceKey(f.reference!)),
        ...(row && row.identity === "resolved" ? (row.aliasIdentifiers ?? []).flatMap(id => favoriteReference(f.kind, id) ?? []) : [])];
      for (const ref of refs) {
        assign(filterFavorites, ref.identifier);
        for (const alias of [ref.serverNamespace, ...(resolveServer(ref.serverNamespace)?.aliases ?? [])]) {
          if (!/^[a-z0-9_]+$/i.test(alias)) continue;
          const identifier = `${alias.toLowerCase()}_${f.kind === "player" ? "p" : "g"}${ref.entityId}`;
          const literal = favoriteReference(f.kind, identifier);
          if (literal && referenceKey(literal) === referenceKey(ref)) assign(filterFavorites, identifier);
        }
      }
    }
    return { favorites, filterFavorites };
  }, [store.snapshot?.record, projection.rows, projection.ready]);
  return { ...store, ...membership, projection };
}
