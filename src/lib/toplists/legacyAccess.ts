import { useAuth } from "../../context/AuthContext";
import { getAppRoleFromUserRoles } from "../featureAccessConfig";

/** Fixed Legacy-only restriction; saved feature rules cannot grant access. */
export function useLegacyToplistsAccess() {
  const { status, user, isLoading } = useAuth();
  const loading = isLoading || status === "idle" || status === "loading";
  const canAccess = !loading && status === "authenticated"
    && getAppRoleFromUserRoles(user?.roles) === "admin";
  return { loading, canAccess };
}
