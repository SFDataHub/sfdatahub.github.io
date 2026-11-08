import { Navigate, useLocation, useParams } from "react-router-dom";
import Dashboard from "../GuildHub/Dashboard";
import OverviewEntry from "./OverviewEntry";
import { favoriteReference } from "../../lib/data-hub/hubFavoritesContract";
import { localEntityPath } from "../../lib/data-hub/routes";

export default function GuildOverview() {
  const params = useParams(), location = useLocation();
  if (params.server !== undefined || params.identifier !== undefined) return <Dashboard />;
  const target = location.state?.guildFeatureTarget;
  const guild = target?.feature === "guild-dashboard" && target.guild;
  const reference = guild && favoriteReference("guild", guild.logoIdentifier ?? guild.guildId, guild.server);
  if (reference) return <Navigate replace to={localEntityPath("guild", reference) + location.search} state={location.state} />;
  return <OverviewEntry kind="guild" />;
}
