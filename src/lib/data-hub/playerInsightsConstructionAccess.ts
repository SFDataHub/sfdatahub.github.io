import { useAuth } from "../../context/AuthContext";
import { canAccessWithRule, getAppRoleFromUserRoles, type AppRole } from "../featureAccessConfig";

// Each card can be released independently; Analytics keeps its own switch.
export const PLAYER_INSIGHTS_CONSTRUCTION = {
  progression: { active: true, minRole: "admin" as AppRole },
  playerAverage: { active: true, minRole: "admin" as AppRole },
  rankings: { active: true, minRole: "admin" as AppRole },
  personalBests: { active: true, minRole: "admin" as AppRole },
};

type PlayerInsightCard = keyof typeof PLAYER_INSIGHTS_CONSTRUCTION;

export function usePlayerInsightsConstructionAccess() {
  const { status, user } = useAuth();
  const loading = status === "idle" || status === "loading";
  const role = getAppRoleFromUserRoles(status === "authenticated" ? user?.roles : []);
  return (card: PlayerInsightCard) => {
    const rule = PLAYER_INSIGHTS_CONSTRUCTION[card];
    return !rule.active || (!loading && canAccessWithRule({
      id: `data-hub.player-insights.${card}.construction`,
      route: "/data-hub/player-hub/player",
      area: "data-hub",
      minRole: rule.minRole,
    }, role));
  };
}
