import React from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "../context/AuthContext";

export type AppRole = "guest" | "user" | "moderator" | "developer" | "admin";

export type FeatureStatus = "active" | "beta" | "hidden" | "dev_only" | "logged_in" | "public";

export interface FeatureAccessRule {
  id: string;
  route: string;
  area: string;
  titleKey?: string;
  status?: FeatureStatus;
  minRole?: AppRole;
  allowedRoles?: AppRole[];
  allowedGroups?: string[];
  allowedUserIds?: string[];
  showInTopbar?: boolean;
  showInSidebar?: boolean;
  navOrder?: number;
  isExperimental?: boolean;
  description?: string;
}

export interface FeatureAccessRuleMap {
  byId: Record<string, FeatureAccessRule>;
  byRoute: Record<string, FeatureAccessRule>;
}

export interface FeatureAccessState extends FeatureAccessRuleMap {
  loading: boolean;
  error: string | null;
}

export const FEATURE_ACCESS_CONFIG: FeatureAccessRule[] = [
  {
    id: "main.home",
    route: "/",
    area: "main",
    titleKey: "nav.home",
    status: "active",
    minRole: "user",
    showInSidebar: true,
    showInTopbar: false,
    navOrder: 5,
  },
  {
    id: "main.dashboard",
    route: "/dashboard",
    area: "main",
    titleKey: "nav.dashboard",
    status: "active",
    minRole: "user",
    showInSidebar: true,
    showInTopbar: false,
    navOrder: 10,
  },
  {
    id: "main.guildHub",
    route: "/guild-hub",
    area: "main",
    titleKey: "nav.guildHub",
    status: "active",
    minRole: "user",
    showInSidebar: true,
    showInTopbar: false,
    navOrder: 20,
  },
  {
    id: "main.discover",
    route: "/discover",
    area: "main",
    titleKey: "nav.discover",
    status: "active",
    minRole: "user",
    showInSidebar: true,
    showInTopbar: false,
    navOrder: 30,
  },
  {
    id: "main.toplists",
    route: "/toplists",
    area: "main",
    titleKey: "nav.toplists",
    status: "active",
    minRole: "user",
    showInSidebar: true,
    showInTopbar: false,
    navOrder: 40,
  },
  {
    id: "main.guidehub",
    route: "/guidehub",
    area: "main",
    titleKey: "nav.guideHub",
    status: "active",
    minRole: "user",
    showInSidebar: true,
    showInTopbar: false,
    navOrder: 50,
  },
  {
    id: "main.tools",
    route: "/tools",
    area: "main",
    titleKey: "nav.tools",
    status: "active",
    minRole: "user",
    showInSidebar: true,
    showInTopbar: false,
    navOrder: 55,
  },
  {
    id: "main.community",
    route: "/community",
    area: "main",
    titleKey: "nav.community",
    status: "active",
    minRole: "user",
    showInSidebar: true,
    showInTopbar: false,
    navOrder: 60,
  },
  {
    id: "main.scans",
    route: "/scans",
    area: "main",
    titleKey: "nav.scans",
    status: "active",
    minRole: "user",
    showInSidebar: true,
    showInTopbar: false,
    navOrder: 70,
  },
  {
    id: "main.settings",
    route: "/settings",
    area: "main",
    titleKey: "nav.settings",
    status: "active",
    minRole: "user",
    showInSidebar: true,
    showInTopbar: false,
    navOrder: 80,
  },
  {
    id: "main.admin",
    route: "/admin",
    area: "main",
    titleKey: "nav.admin",
    status: "active",
    minRole: "moderator",
    allowedRoles: ["moderator", "admin"],
    showInSidebar: true,
    showInTopbar: false,
    navOrder: 90,
  },
  {
    id: "main.playground",
    route: "/playground",
    area: "main",
    titleKey: "nav.playground",
    status: "beta",
    minRole: "developer",
    allowedRoles: ["developer", "admin"],
    showInSidebar: true,
    showInTopbar: false,
    navOrder: 100,
    isExperimental: true,
  },
];

const APP_ROLE_ORDER: AppRole[] = ["guest", "user", "moderator", "developer", "admin"];

function normalizeRoute(route: string): string {
  const trimmed = route.trim();
  if (!trimmed) return "/";
  const ensureLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (ensureLeading === "/") return ensureLeading;
  return ensureLeading.replace(/\/+$/, "").toLowerCase();
}

function normalizeRole(value: unknown): AppRole | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.toLowerCase();
  if (v === "admin") return "admin";
  if (v === "developer" || v === "dev") return "developer";
  if (v === "moderator" || v === "mod") return "moderator";
  if (v === "user") return "user";
  if (v === "guest") return "guest";
  return undefined;
}

function normalizeRolesArray(value: unknown): AppRole[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const mapped = value
    .map((entry) => normalizeRole(entry))
    .filter(Boolean) as AppRole[];
  return mapped.length ? mapped : undefined;
}

function normalizeGroups(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const mapped = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
  return mapped.length ? mapped : undefined;
}

function normalizeUserIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const mapped = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
  return mapped.length ? mapped : undefined;
}

function normalizeRule(rule: FeatureAccessRule): FeatureAccessRule {
  return {
    ...rule,
    id: rule.id.trim(),
    route: normalizeRoute(rule.route),
    area: rule.area.trim(),
    allowedRoles: normalizeRolesArray(rule.allowedRoles) ?? rule.allowedRoles,
    allowedGroups: normalizeGroups(rule.allowedGroups) ?? rule.allowedGroups,
    allowedUserIds: normalizeUserIds(rule.allowedUserIds) ?? rule.allowedUserIds,
  };
}

function mapDocToRule(docId: string, data: unknown): FeatureAccessRule | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as Record<string, unknown>;
  const route = typeof payload.route === "string" ? payload.route : "";
  const area = typeof payload.area === "string" ? payload.area : "";
  const id =
    (typeof payload.id === "string" && payload.id.trim()) ||
    docId ||
    (route ? `feature:${route}` : "");
  if (!route || !id || !area) return null;

  const rule: FeatureAccessRule = {
    id,
    route,
    area,
    titleKey: typeof payload.titleKey === "string" ? payload.titleKey : undefined,
    status: typeof payload.status === "string" ? (payload.status as FeatureStatus) : undefined,
    minRole: normalizeRole(payload.minRole),
    allowedRoles: normalizeRolesArray(payload.allowedRoles),
    allowedGroups: normalizeGroups(payload.allowedGroups),
    allowedUserIds: normalizeUserIds(payload.allowedUserIds),
    showInTopbar: typeof payload.showInTopbar === "boolean" ? payload.showInTopbar : undefined,
    showInSidebar: typeof payload.showInSidebar === "boolean" ? payload.showInSidebar : undefined,
    navOrder: typeof payload.navOrder === "number" ? payload.navOrder : undefined,
    isExperimental: typeof payload.isExperimental === "boolean" ? payload.isExperimental : undefined,
    description: typeof payload.description === "string" ? payload.description : undefined,
  };

  return normalizeRule(rule);
}

function buildRuleMaps(rules: FeatureAccessRule[]): FeatureAccessRuleMap {
  const byId: Record<string, FeatureAccessRule> = {};
  const byRoute: Record<string, FeatureAccessRule> = {};

  rules.forEach((rule) => {
    const normalized = normalizeRule(rule);
    byId[normalized.id] = normalized;
    byRoute[normalized.route] = normalized;
  });

  return { byId, byRoute };
}

const DEFAULT_RULE_MAPS = buildRuleMaps(FEATURE_ACCESS_CONFIG);

function mergeRuleValues(base: FeatureAccessRule | undefined, override: FeatureAccessRule): FeatureAccessRule {
  const merged: FeatureAccessRule = { ...(base ?? {}) } as FeatureAccessRule;
  (Object.keys(override) as (keyof FeatureAccessRule)[]).forEach((key) => {
    const value = override[key];
    if (value !== undefined) {
      merged[key] = value as FeatureAccessRule[keyof FeatureAccessRule];
    }
  });
  return merged;
}

function mergeRuleMaps(dynamicRules: FeatureAccessRule[]): FeatureAccessRuleMap {
  const mergedById = { ...DEFAULT_RULE_MAPS.byId };
  const mergedByRoute = { ...DEFAULT_RULE_MAPS.byRoute };

  dynamicRules.forEach((rule) => {
    const normalized = normalizeRule(rule);
    const base = mergedById[normalized.id];
    const merged = mergeRuleValues(base, normalized);
    mergedById[merged.id] = merged;
    mergedByRoute[merged.route] = merged;
  });

  return { byId: mergedById, byRoute: mergedByRoute };
}

const FeatureAccessContext = React.createContext<FeatureAccessState | undefined>(undefined);

export const FeatureAccessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = React.useState<FeatureAccessState>({
    ...DEFAULT_RULE_MAPS,
    loading: true,
    error: null,
  });

  React.useEffect(() => {
    let active = true;

    const fetchRules = async () => {
      try {
        const snapshot = await getDocs(collection(db, "feature_access"));
        const dynamicRules: FeatureAccessRule[] = [];

        snapshot.forEach((doc) => {
          const rule = mapDocToRule(doc.id, doc.data());
          if (!rule) return;
          dynamicRules.push(rule);
        });

        const merged = mergeRuleMaps(dynamicRules);

        if (active) {
          setState({
            ...merged,
            loading: false,
            error: null,
          });
        }
      } catch (error) {
        console.error("[FeatureAccess] Failed to load rules from Firestore.", error);
        if (active) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: error instanceof Error ? error.message : "Failed to load feature access rules",
          }));
        }
      }
    };

    fetchRules();

    return () => {
      active = false;
    };
  }, []);

  const value = React.useMemo(() => state, [state]);

  return <FeatureAccessContext.Provider value={value}>{children}</FeatureAccessContext.Provider>;
};

export function useFeatureAccessStore(): FeatureAccessState {
  const ctx = React.useContext(FeatureAccessContext);
  if (!ctx) {
    throw new Error("useFeatureAccessStore must be used within a FeatureAccessProvider");
  }
  return ctx;
}

export function resolveFeatureRule(
  identifier: string,
  storeRules: FeatureAccessRuleMap,
): FeatureAccessRule | undefined {
  const normalizedRoute = normalizeRoute(identifier);
  return (
    storeRules.byId[identifier] ??
    storeRules.byRoute[normalizedRoute] ??
    DEFAULT_RULE_MAPS.byId[identifier] ??
    DEFAULT_RULE_MAPS.byRoute[normalizedRoute]
  );
}

export function getAppRoleFromUserRoles(roles?: string[] | null): AppRole | null {
  if (!roles || roles.length === 0) return "guest";
  if (roles.includes("admin")) return "admin";
  if (roles.includes("dev") || roles.includes("developer")) return "developer";
  if (roles.includes("mod") || roles.includes("moderator")) return "moderator";
  return "user";
}

export function canAccessWithRule(
  rule: FeatureAccessRule,
  userRole: AppRole | null,
  isAdminOverride?: boolean,
  userId?: string | null,
  userGroups?: string[],
): boolean {
  if (isAdminOverride) return true;

  const effectiveRole = userRole ?? "guest";

  if (rule.status === "hidden") {
    return false;
  }

  if (rule.status === "dev_only" && effectiveRole !== "developer" && effectiveRole !== "admin") {
    return false;
  }

  if (rule.allowedUserIds && rule.allowedUserIds.length > 0) {
    if (!userId || !rule.allowedUserIds.includes(userId)) {
      return false;
    }
  }

  if (rule.allowedGroups && rule.allowedGroups.length > 0) {
    const groups = userGroups ?? [];
    if (!groups.some((group) => rule.allowedGroups!.includes(group))) {
      return false;
    }
  }

  if (rule.allowedRoles && rule.allowedRoles.length > 0) {
    return !!effectiveRole && rule.allowedRoles.includes(effectiveRole);
  }

  if (rule.minRole) {
    const userIndex = APP_ROLE_ORDER.indexOf(effectiveRole);
    const minIndex = APP_ROLE_ORDER.indexOf(rule.minRole);
    return userIndex >= minIndex && userIndex !== -1;
  }

  return true;
}

export function canAccessRoute(params: {
  route?: string;
  featureId?: string;
  userRole: AppRole | null;
  userId?: string | null;
  userGroups?: string[];
  isAdminOverride?: boolean;
  storeRules?: FeatureAccessRuleMap;
}): boolean {
  const { route, featureId, userRole, userGroups, isAdminOverride, userId, storeRules } = params;
  const rules = storeRules ?? DEFAULT_RULE_MAPS;
  const target = featureId ?? route;
  if (!target) return true;
  const rule = resolveFeatureRule(target, rules);
  if (!rule) {
    return true;
  }
  return canAccessWithRule(rule, userRole, isAdminOverride, userId, userGroups);
}

export function useFeatureAccess(): {
  loading: boolean;
  error: string | null;
  rulesById: FeatureAccessRuleMap["byId"];
  rulesByRoute: FeatureAccessRuleMap["byRoute"];
  storeRules: FeatureAccessRuleMap;
  resolveRule: (identifier: string) => FeatureAccessRule | undefined;
  canAccessRule: (rule?: FeatureAccessRule) => boolean;
  canAccessFeature: (identifier: string) => boolean;
  isVisibleInSidebar: (identifier: string) => boolean;
  isVisibleInTopbar: (identifier: string) => boolean;
} {
  const { user } = useAuth();
  const { rulesById, rulesByRoute, loading, error } = useFeatureAccessStore();

  const storeRules = React.useMemo<FeatureAccessRuleMap>(
    () => ({ byId: rulesById, byRoute: rulesByRoute }),
    [rulesById, rulesByRoute],
  );

  const userRole = React.useMemo(
    () => getAppRoleFromUserRoles(user?.roles),
    [user?.roles],
  );
  const isAdminOverride = React.useMemo(
    () => !!user?.roles?.includes("admin"),
    [user?.roles],
  );
  const userGroups = React.useMemo(() => user?.accessGroups ?? [], [user?.accessGroups]);
  const userId = user?.id ?? null;

  const resolveRule = React.useCallback(
    (identifier: string) => resolveFeatureRule(identifier, storeRules),
    [storeRules],
  );

  const canAccessRule = React.useCallback(
    (rule?: FeatureAccessRule) =>
      rule ? canAccessWithRule(rule, userRole, isAdminOverride, userId, userGroups) : true,
    [isAdminOverride, userGroups, userId, userRole],
  );

  const canAccessFeature = React.useCallback(
    (identifier: string) => {
      if (!identifier) return true;
      const rule = resolveRule(identifier);
      return canAccessRule(rule);
    },
    [canAccessRule, resolveRule],
  );

  const isVisibleInSidebar = React.useCallback(
    (identifier: string) => {
      if (!identifier) return true;
      const rule = resolveRule(identifier);
      if (!rule) return true;
      if (rule.status === "hidden") return false;
      if (rule.showInSidebar === false) return false;
      return canAccessRule(rule);
    },
    [canAccessRule, resolveRule],
  );

  const isVisibleInTopbar = React.useCallback(
    (identifier: string) => {
      if (!identifier) return true;
      const rule = resolveRule(identifier);
      if (!rule) return true;
      if (rule.status === "hidden") return false;
      if (rule.showInTopbar === false) return false;
      return canAccessRule(rule);
    },
    [canAccessRule, resolveRule],
  );

  return {
    loading,
    error,
    rulesById,
    rulesByRoute,
    storeRules,
    resolveRule,
    canAccessRule,
    canAccessFeature,
    isVisibleInSidebar,
    isVisibleInTopbar,
  };
}
