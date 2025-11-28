import React from "react";
import { useFeatureAccess } from "../lib/featureAccessConfig";

interface FeatureGateProps {
  route?: string;
  featureId?: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function FeatureGate({ route, featureId, fallback = null, children }: FeatureGateProps) {
  const { resolveRule, canAccessFeature, canAccessRule } = useFeatureAccess();
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

  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

export default FeatureGate;
