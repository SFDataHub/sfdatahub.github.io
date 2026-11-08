import { Navigate, Route, useLocation } from "react-router-dom";
import { useAnalyticsConstructionAccess } from "../../lib/data-hub/constructionAccess";
import DataHubIndex from "./Index";
import ScanManagement from "./ScanManagement";
import IdentityMatching from "../Scans/FusionIdentity";
import PlayerHub from "./PlayerHub";
import LocalPlayerDetail from "./LocalPlayerDetail";
import GuildHubIndex from "../GuildHub/Index";
import GuildOverview from "./GuildOverview";
import Toplist from "./Toplist";
import Analytics from "./compareGuilds";
import Planner from "../GuildHub/Planner";
import FusionPlanner from "../GuildHub/FusionPlanner/FusionPlanner";
import FightTracking from "../GuildHub/FightTracking";
import Waitlist from "../GuildHub/Waitlist";
import Activity from "../GuildHub/Activity";
import Imports from "../GuildHub/Imports";
import Announcements from "../GuildHub/Announcements";
import Events from "../GuildHub/Events";
import Roles from "../GuildHub/Roles";
import Settings from "../GuildHub/Settings";
import { DATA_HUB, GUILD_HUB, PLAYER_HUB, LOCAL_GUILD_PATTERN, LOCAL_PROFILE_PATTERN, LEGACY_DATA_HUB_ROUTES } from "../../lib/data-hub/routes";

function AnalyticsConstructionGate({ children }: { children: React.ReactNode }) {
  const { loading, canAccess } = useAnalyticsConstructionAccess();
  if (loading) return null;
  return canAccess ? <>{children}</> : <Navigate to={DATA_HUB} replace />;
}
export function LegacyHubRedirect({ to }: { to: string }) {
  const location = useLocation();
  // Stable consumption key survives the replace-generated location.key.
  const state = location.state && typeof location.state === "object" ? {
    ...location.state, guildFeatureTargetKey: location.state.guildFeatureTargetKey ?? location.key,
  } : location.state;
  return <Navigate replace to={to + location.search} state={state} />;
}
const pages = [
  [`${DATA_HUB}/scan-management`, <ScanManagement />],
  [`${DATA_HUB}/identity-matching`, <IdentityMatching dataHub />],
  [GUILD_HUB, <GuildHubIndex />], [`${GUILD_HUB}/dashboard`, <GuildOverview />], [LOCAL_GUILD_PATTERN, <GuildOverview />],
  [`${DATA_HUB}/toplist`, <Toplist />], [`${DATA_HUB}/analytics`, <AnalyticsConstructionGate><Analytics /></AnalyticsConstructionGate>],
  [PLAYER_HUB, <PlayerHub />], [LOCAL_PROFILE_PATTERN, <LocalPlayerDetail />],
  [`${GUILD_HUB}/planner`, <Planner />], [`${GUILD_HUB}/fusion-planner`, <FusionPlanner />],
  [`${GUILD_HUB}/fight-tracking`, <FightTracking />], [`${GUILD_HUB}/waitlist`, <Waitlist />],
  [`${GUILD_HUB}/activity`, <Activity />], [`${GUILD_HUB}/import`, <Imports />],
  [`${GUILD_HUB}/announcements`, <Announcements />], [`${GUILD_HUB}/events`, <Events />],
  [`${GUILD_HUB}/roles`, <Roles />], [`${GUILD_HUB}/settings`, <Settings />],
] as const;

/** The production registration is also imported by isolated browser fixtures. */
export function dataHubRouteElements() {
  return [<Route key={DATA_HUB} path={DATA_HUB} element={<DataHubIndex />} />,
    ...pages.map(([path, page]) => <Route key={path} path={path} element={page} />),
    ...Object.entries(LEGACY_DATA_HUB_ROUTES).map(([path, to]) => <Route key={path} path={path} element={<LegacyHubRedirect to={to} />} />)];
}
