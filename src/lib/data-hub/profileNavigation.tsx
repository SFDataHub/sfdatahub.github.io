import React from "react";
import { useLocation, useNavigate, type Location } from "react-router-dom";
import type { LocalPlayerCurrentSeed } from "../../pages/GuildHub/localPlayerCurrentSeed";
import { favoriteReference, type FavoriteReference } from "./hubFavoritesContract";
import { localEntityPath, safeLocalReturn, type ObservationAnchor } from "./routes";

const parents = new Map<string, { location: Location; prepared?: { path: string; seed: LocalPlayerCurrentSeed } }>();
const RoutingLocation = React.createContext<Location | null>(null);
export const LocalProfileRoutingProvider = RoutingLocation.Provider;
/** Actual route even while Routes retains a mounted overlay background. */
export function useActualProfileLocation() {
  const local = useLocation();
  return React.useContext(RoutingLocation) ?? local;
}
export function liveProfileBackground(location: Location): Location | null {
  const token: unknown = location.state?.localProfileParent;
  if (typeof token !== "string") return null;
  return parents.get(token)?.location ?? null;
}
export function preparedProfileSeed(location: Location) {
  const token: unknown = location.state?.localProfileParent;
  if (typeof token !== "string") return;
  const prepared = parents.get(token)?.prepared;
  return prepared?.path === location.pathname + location.search ? prepared.seed : undefined;
}
export function releasePreparedProfile(location: Location) {
  const token: unknown = location.state?.localProfileParent;
  if (typeof token !== "string") return;
  const parent = parents.get(token);
  if (parent?.prepared?.path === location.pathname + location.search) delete parent.prepared;
}

/** A mounted parent, not serialized history state, proves overlay availability. */
export type LocalProfileOpeningContext = "toplist" | "guild";

export function useLocalProfileNavigation(openingContext?: LocalProfileOpeningContext) {
  const background = useLocation();
  const actual = React.useContext(RoutingLocation) ?? background;
  const navigate = useNavigate();
  const [token] = React.useState(() => crypto.randomUUID());
  const pendingParent = React.useRef<string | null>(null);
  React.useLayoutEffect(() => { if (actual.state?.localProfileParent !== token) pendingParent.current = null; }, [actual.key, actual.pathname, token]);
  React.useLayoutEffect(() => {
    parents.set(token, { location: background });
    return () => { parents.delete(token); };
  }, [token, background.key, background.pathname, background.search]);
  const open = React.useCallback((seed: LocalPlayerCurrentSeed) => {
    const ref = favoriteReference("player", seed.rawIdentifier);
    const parent = parents.get(token);
    if (!ref || !parent) return;
    const path = localEntityPath("player", ref, { source: seed.sourceScanId, at: seed.scannedAtMs, row: seed.sourcePlayerKey, snapshot: seed.snapshotId, hash: seed.contentHash });
    parent.prepared = { path, seed };
    const sameParent = actual.state?.localProfileParent === token || pendingParent.current === background.key;
    pendingParent.current = background.key;
    navigate(path, { replace: sameParent, state: { localProfileParent: token, localProfileOpeningContext: openingContext, returnTo: safeLocalReturn(background.pathname + background.search), profileReturnState: background.state } });
  }, [actual.state, background.pathname, background.search, navigate, token, openingContext, background.state]);
  const openExact = React.useCallback((identifier: string, server: string, source: string, at: number, row: string, seed?: LocalPlayerCurrentSeed, hash?: string) => {
    if (seed) { open(seed); return; }
    const ref = favoriteReference("player", identifier, server), parent = parents.get(token);
    if (!ref || !parent) return;
    delete parent.prepared;
    const path = localEntityPath("player", ref, { source, at, row, snapshot: `${source}::${at}`, hash });
    const replace = actual.state?.localProfileParent === token || pendingParent.current === background.key;
    pendingParent.current = background.key;
    navigate(path, { replace, state: { localProfileParent: token, localProfileOpeningContext: openingContext, returnTo: safeLocalReturn(background.pathname + background.search), profileReturnState: background.state } });
  }, [open, token, navigate, actual.state, background.pathname, background.search, openingContext, background.state]);
  const openGuild = React.useCallback((reference: FavoriteReference, observation: ObservationAnchor) => {
    const parent = parents.get(token);
    if (!parent) return;
    delete parent.prepared;
    const replace = actual.state?.localProfileParent === token || pendingParent.current === background.key;
    pendingParent.current = background.key;
    navigate(localEntityPath("guild", reference, observation), { replace, state: {
      localProfileParent: token, localProfileOpeningContext: "toplist",
      returnTo: safeLocalReturn(background.pathname + background.search), guildReturnState: background.state,
    } });
  }, [token, navigate, actual.state, background.pathname, background.search, background.state]);
  return { open, openExact, openGuild };
}
