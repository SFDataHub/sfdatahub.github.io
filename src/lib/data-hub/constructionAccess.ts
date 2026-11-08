import { useAuth } from "../../context/AuthContext";
import { canAccessWithRule, getAppRoleFromUserRoles, type AppRole } from "../featureAccessConfig";

export const ANALYTICS_CONSTRUCTION = {
  active: true,
  minRole: "admin" as AppRole,
};

/** Local to Analytics: independent of runtime Guild Hub feature rules. */
export function useAnalyticsConstructionAccess() {
  const { status, user } = useAuth();
  const loading = ANALYTICS_CONSTRUCTION.active && (status === "idle" || status === "loading");
  const role = getAppRoleFromUserRoles(status === "authenticated" ? user?.roles : []);
  const canAccess = !ANALYTICS_CONSTRUCTION.active || (!loading && canAccessWithRule({
    id: "data-hub.analytics.construction",
    route: "/data-hub/analytics",
    area: "data-hub",
    minRole: ANALYTICS_CONSTRUCTION.minRole,
  }, role));
  return { active: ANALYTICS_CONSTRUCTION.active, loading, canAccess };
}
