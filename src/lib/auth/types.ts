export type AuthProvider = "discord" | "google";

export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

export type AuthFavoriteKind = "player" | "guild";

export type AuthFavoritePlayerV2 = {
  name: string;
  class: string;
};

export type AuthFavoritePlayerValue = true | AuthFavoritePlayerV2;

export type AuthFavorites = {
  schemaVersion?: number;
  players?: Record<string, AuthFavoritePlayerValue>;
  guilds?: Record<string, true>;
};

export type AuthFavoritesCounts = {
  players: number;
  guilds: number;
};

export type AuthFavoritePatchResponse = {
  ok: true;
  kind: AuthFavoriteKind;
  identifier: string;
  isFavorite: boolean;
  counts: AuthFavoritesCounts;
};

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
  accessGroups?: string[];
  createdAt?: string;
  lastLoginAt?: string;
  favorites?: AuthFavorites;
}
