import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isHiddenPickerServer } from "../../components/Filters/serverPickerModel";
import { resolveServer } from "../../lib/servers/serverResolver";
import { useToplistServerViews } from "../../lib/analytics/localEvents";
import type { LocalToplistViewTab } from "../../lib/toplists/localToplistViewWorkerTypes";
import { equalToplistServerSelection, normalizeToplistServerSelection } from "./localToplistPageModel";

const registeredServers = (values: readonly string[]) => normalizeToplistServerSelection(
  values.flatMap(value => {
    const server = resolveServer(value);
    return server && !isHiddenPickerServer(server.code) ? [server.code] : [];
  }),
);

export function readLocalToplistUrlSelection(search: string): { servers: string[] | null; tab: LocalToplistViewTab | null } {
  const params = new URLSearchParams(search);
  const tab = params.get("tab");
  return {
    // Absence restores local filters; an explicit empty/invalid list clears them.
    servers: params.has("servers") ? registeredServers(params.getAll("servers").flatMap(value => value.split(","))) : null,
    tab: tab === "players" || tab === "guilds" ? tab : null,
  };
}

export function writeLocalToplistUrlSelection(search: string, servers: readonly string[], tab: LocalToplistViewTab) {
  const params = new URLSearchParams(search);
  params.set("servers", registeredServers(servers).join(","));
  params.set("tab", tab);
  return "?" + params.toString().replace(/(servers=)([^&]*)/, (_, key: string, value: string) => key + value.replace(/%2C/g, ","));
}

/** Restore incoming locations before data effects, then publish committed filters.
 * A router replace retains target commands and profile return state verbatim.
 */
export function useLocalToplistUrlSelection(
  storedServers: string[],
  setServers: (servers: string[]) => void,
  commandPending: boolean,
) {
  const location = useLocation();
  const navigate = useNavigate();
  const parsed = React.useMemo(() => readLocalToplistUrlSelection(location.search), [location.search]);
  const published = React.useRef<{ search: string; state: unknown } | null>(null);
  const [selection, setSelection] = React.useState(() => ({
    location, incoming: parsed as typeof parsed | null, tab: parsed.tab ?? "players" as LocalToplistViewTab,
  }));
  let current = selection;
  if (selection.location !== location) {
    const ownReplace = published.current?.search === location.search && published.current.state === location.state;
    current = {
      location,
      incoming: ownReplace ? null : parsed,
      tab: ownReplace ? selection.tab : parsed.tab ?? selection.tab,
    };
    // Adjust this hook's state during render so children/effects never see the
    // previous location's selection, including during browser Back/Forward.
    setSelection(current);
  }
  const candidateServers = current.incoming?.servers ?? storedServers;
  const stableServers = React.useRef(candidateServers);
  if (!equalToplistServerSelection(stableServers.current, candidateServers)) stableServers.current = candidateServers;
  const servers = stableServers.current;
  React.useLayoutEffect(() => {
    if (published.current?.search === location.search) published.current = null;
    if (!current.incoming) return;
    if (current.incoming.servers !== null && !equalToplistServerSelection(storedServers, current.incoming.servers)) {
      setServers(current.incoming.servers);
    }
    setSelection(value => ({ ...value, incoming: null }));
  }, [current, storedServers, setServers]);
  React.useEffect(() => {
    // A newly accepted search/favorite command commits in the parent's layout
    // effect. Publish its resulting selection on the following render only.
    if (current.incoming || commandPending) return;
    const search = writeLocalToplistUrlSelection(location.search, storedServers, current.tab);
    if (search === location.search) return;
    published.current = { search, state: location.state };
    navigate({ pathname: location.pathname, search, hash: location.hash }, { replace: true, state: location.state });
  }, [current, commandPending, location, storedServers, navigate]);
  const setTab = React.useCallback((tab: LocalToplistViewTab) => {
    setSelection(value => value.tab === tab ? value : { ...value, tab });
  }, []);
  useToplistServerViews(servers, current.tab, !current.incoming && !commandPending);
  return { servers, tab: current.tab, setTab };
}
