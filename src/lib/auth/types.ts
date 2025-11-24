export type AuthProvider = "discord" | "google";

export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

export interface AuthUserProviderInfo {
  id: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface AuthUser {
  id: string;
  displayName: string;
  avatarUrl?: string;
  provider: AuthProvider;
  providers?: Partial<Record<AuthProvider, AuthUserProviderInfo>>;
  roles: string[];
  createdAt?: string;
  lastLoginAt?: string;
}
