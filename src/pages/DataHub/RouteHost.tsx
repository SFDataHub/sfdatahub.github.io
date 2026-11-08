import { Route, Routes, useLocation, matchPath, type Location } from "react-router-dom";
import { LocalProfileRoutingProvider, liveProfileBackground } from "../../lib/data-hub/profileNavigation";
import { LOCAL_GUILD_PATTERN, LOCAL_PROFILE_PATTERN } from "../../lib/data-hub/routes";
import LocalPlayerDetail from "./LocalPlayerDetail";
import LocalGuildProfileOverlay from "../../components/guilds/LocalGuildProfileOverlay";

export default function DataHubRouteHost({ children }: { children: (location: Location) => React.ReactNode }) {
  const location = useLocation();
  // A player opened from the guild overlay retains both mounted parents.
  // Tokens from a reload have no live owner and therefore render full routes.
  const overlays: Location[] = [];
  const seen = new Set<string>();
  let background = location;
  while (!seen.has(background.key) && (matchPath(LOCAL_PROFILE_PATTERN, background.pathname) || matchPath(LOCAL_GUILD_PATTERN, background.pathname))) {
    seen.add(background.key);
    const parent = liveProfileBackground(background);
    if (!parent) break;
    overlays.unshift(background);
    background = parent;
  }
  return <LocalProfileRoutingProvider value={location}>
    {children(background)}
    {overlays.map(layer => <Routes key={layer.key} location={layer}>
      <Route path={LOCAL_PROFILE_PATTERN} element={<LocalPlayerDetail overlay />} />
      <Route path={LOCAL_GUILD_PATTERN} element={<LocalGuildProfileOverlay />} />
    </Routes>)}
  </LocalProfileRoutingProvider>;
}
