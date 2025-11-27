import React from "react";
import {
  canAccessWithRule,
  getAppRoleFromUserRoles,
  resolveFeatureRule,
  useFeatureAccessStore,
} from "../lib/featureAccessConfig";
import { useAuth } from "../context/AuthContext";

interface FeatureGateProps {
  route: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function FeatureGate({ route, fallback = null, children }: FeatureGateProps) {
  const { user } = useAuth();
  const { rulesByRoute, loading } = useFeatureAccessStore();
  const userRole = React.useMemo(
    () => getAppRoleFromUserRoles(user?.roles),
    [user?.roles],
  );
  const isAdminOverride = React.useMemo(
    () => !!user?.roles?.includes("admin"),
    [user?.roles],
  );

  const rule = React.useMemo(
    () => resolveFeatureRule(route, rulesByRoute),
    [route, rulesByRoute],
  );

  React.useEffect(() => {
    if (!loading && !rule) {
      console.debug(`[FeatureGate] No rule found for route "${route}", allowing by default.`);
    }
  }, [loading, rule, route]);

  const allowed = React.useMemo(() => {
    if (loading) return true;
    if (!rule) return true;
    return canAccessWithRule(rule, userRole, isAdminOverride);
  }, [loading, rule, userRole, isAdminOverride]);

  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

export default FeatureGate;
