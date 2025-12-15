import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useFeatureAccess } from "../lib/featureAccessConfig";

const AUTH_NEXT_STORAGE_KEY = "sfh:authNext";

interface FeatureGateProps {
  route?: string;
  featureId?: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function FeatureGate({ route, featureId, fallback = null, children }: FeatureGateProps) {
  const { isLoading: authIsLoading, status: authStatus } = useAuth();
  const { resolveRule, canAccessFeature, canAccessRule, loading: featureAccessLoading } = useFeatureAccess();
  const location = useLocation();
  const target = featureId ?? route ?? "/";

  const rule = React.useMemo(
    () => resolveRule(target),
    [resolveRule, target],
  );

  React.useEffect(() => {
    if (!rule) {
      console.debug(`[FeatureGate] No rule found for target "${target}", allowing by default.`);
    }
  }, [rule, target]);

  const allowed = React.useMemo(() => {
    if (!featureId && !route) return true;
    if (rule) return canAccessRule(rule);
    return canAccessFeature(target);
  }, [canAccessFeature, canAccessRule, featureId, route, rule, target]);

  const requiresAuth = React.useMemo(() => {
    if (!rule) return false;
    if (rule.status === "logged_in") return true;
    if (rule.minRole && rule.minRole !== "guest") return true;
    if (rule.allowedRoles && rule.allowedRoles.length > 0) return true;
    if (rule.allowedGroups && rule.allowedGroups.length > 0) return true;
    if (rule.allowedUserIds && rule.allowedUserIds.length > 0) return true;
    return false;
  }, [rule]);

  if (authIsLoading || featureAccessLoading) {
    return null;
  }

  if (!allowed) {
    const isUnauthenticated = authStatus === "unauthenticated";
    const isOnLoginPage = location.pathname === "/login";

    if (requiresAuth && isUnauthenticated && !isOnLoginPage) {
      const nextPath = `${location.pathname}${location.search || ""}`;
      const isSafeNext = nextPath.startsWith("/") && !nextPath.startsWith("//");

      if (typeof window !== "undefined" && window.sessionStorage && isSafeNext) {
        window.sessionStorage.setItem(AUTH_NEXT_STORAGE_KEY, nextPath);
      }

      const loginTarget = isSafeNext ? `/login?next=${encodeURIComponent(nextPath)}` : "/login";
      return <Navigate to={loginTarget} replace />;
    }

    return <>{fallback}</>;
  }
  return <>{children}</>;
}

export default FeatureGate;
