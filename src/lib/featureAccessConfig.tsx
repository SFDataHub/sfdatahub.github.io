import React from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";

export type AppRole = "user" | "moderator" | "developer" | "admin";

export type FeatureStatus = "active" | "beta" | "hidden";

export interface FeatureAccessRule {
  route: string;
  minRole?: AppRole;
  allowedRoles?: AppRole[];
  status?: FeatureStatus;
  allowedGroups?: string[];
}

export interface FeatureAccessState {
  rulesByRoute: Record<string, FeatureAccessRule>;
  loading: boolean;
  error: string | null;
}

export const FEATURE_ACCESS_RULES: FeatureAccessRule[] = [
  {
    route: "/admin",
    minRole: "moderator",
    status: "active",
  },
  {
    route: "/playground",
    minRole: "developer",
    status: "beta",
  },
  {
    route: "/admin/users",
    allowedRoles: ["admin"],
    status: "hidden",
  },
];

const APP_ROLE_ORDER: AppRole[] = ["user", "moderator", "developer", "admin"];

function normalizeRoute(route: string): string {
  const trimmed = route.trim();
  if (!trimmed) return "/";
  const ensureLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (ensureLeading === "/") return ensureLeading;
  return ensureLeading.replace(/\/+$/, "").toLowerCase();
}

const STATIC_RULES_BY_ROUTE: Record<string, FeatureAccessRule> = FEATURE_ACCESS_RULES.reduce(
  (acc, rule) => {
    acc[normalizeRoute(rule.route)] = rule;
    return acc;
  },
  {} as Record<string, FeatureAccessRule>,
);

function normalizeRole(value: unknown): AppRole | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.toLowerCase();
  if (v === "admin") return "admin";
  if (v === "developer" || v === "dev") return "developer";
  if (v === "moderator" || v === "mod") return "moderator";
  if (v === "user") return "user";
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

function mapDocToRule(data: unknown): FeatureAccessRule | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as Record<string, unknown>;
  const route = typeof payload.route === "string" ? payload.route : "";
  if (!route) return null;

  const rule: FeatureAccessRule = {
    route,
    minRole: normalizeRole(payload.minRole),
    allowedRoles: normalizeRolesArray(payload.allowedRoles),
    status: typeof payload.status === "string" ? (payload.status as FeatureStatus) : undefined,
    allowedGroups: normalizeGroups(payload.allowedGroups),
  };

  return rule;
}

const FeatureAccessContext = React.createContext<FeatureAccessState | undefined>(undefined);

export const FeatureAccessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = React.useState<FeatureAccessState>({
    rulesByRoute: {},
    loading: true,
    error: null,
  });

  React.useEffect(() => {
    let active = true;

    const fetchRules = async () => {
      try {
        const snapshot = await getDocs(collection(db, "feature_access"));
        const dynamicRules: Record<string, FeatureAccessRule> = {};

        snapshot.forEach((doc) => {
          const rule = mapDocToRule(doc.data());
          if (!rule) return;
          const normalized = normalizeRoute(rule.route);
          dynamicRules[normalized] = rule;
        });

        if (active) {
          setState({
            rulesByRoute: dynamicRules,
            loading: false,
            error: null,
          });
        }
      } catch (error) {
        console.error("[FeatureAccess] Failed to load rules from Firestore.", error);
        if (active) {
          setState({
            rulesByRoute: {},
            loading: false,
            error: error instanceof Error ? error.message : "Failed to load feature access rules",
          });
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
  route: string,
  storeRules: Record<string, FeatureAccessRule>,
): FeatureAccessRule | undefined {
  const normalized = normalizeRoute(route);
  return storeRules[normalized] ?? STATIC_RULES_BY_ROUTE[normalized];
}

export function getAppRoleFromUserRoles(roles?: string[] | null): AppRole | null {
  if (!roles || roles.length === 0) return null;
  if (roles.includes("admin")) return "admin";
  if (roles.includes("dev") || roles.includes("developer")) return "developer";
  if (roles.includes("mod") || roles.includes("moderator")) return "moderator";
  return "user";
}

export function canAccessWithRule(
  rule: FeatureAccessRule,
  userRole: AppRole | null,
  isAdminOverride?: boolean,
): boolean {
  if (isAdminOverride) return true;

  if (rule.status === "hidden") {
    return false;
  }

  if (!userRole && (rule.minRole || rule.allowedRoles)) {
    return false;
  }

  if (rule.allowedRoles && rule.allowedRoles.length > 0) {
    return !!userRole && rule.allowedRoles.includes(userRole);
  }

  if (rule.minRole) {
    const userIndex = userRole ? APP_ROLE_ORDER.indexOf(userRole) : -1;
    const minIndex = APP_ROLE_ORDER.indexOf(rule.minRole);
    return userIndex >= minIndex && userIndex !== -1;
  }

  return true;
}

export function canAccessRoute(params: {
  route: string;
  userRole: AppRole | null;
  isAdminOverride?: boolean;
  storeRules?: Record<string, FeatureAccessRule>;
}): boolean {
  const { route, userRole, isAdminOverride, storeRules = {} } = params;
  const rule = resolveFeatureRule(route, storeRules);
  if (!rule) {
    return true;
  }
  return canAccessWithRule(rule, userRole, isAdminOverride);
}
