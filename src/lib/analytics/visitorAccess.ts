import type { AuthStatus, AuthUser } from "../auth/types";

export function canReadVisitorAnalytics(status: AuthStatus, user: AuthUser | null): boolean {
  return status === "authenticated" && !!user?.roles.some(role => role === "admin" || role === "don");
}
