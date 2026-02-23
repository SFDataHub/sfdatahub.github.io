export type AuthProvider = "discord" | "google";

export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

export type AuthFavoriteKind = "player" | "guild";

export type AuthFavorites = {
  players?: Record<string, true>;
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

export type LinkedPlayer = {
  server: string;
  playerId: number | string;
  verifiedAt?: string;
  method?: string;
  name?: string;
  class?: string;
  level?: number;
  guildName?: string;
};

export interface AuthUser {
  id: string;
  displayName: string;
  avatarUrl?: string;
  provider: AuthProvider;
  providers?: Partial<Record<AuthProvider, AuthUserProviderInfo>>;
  roles: string[];
  accessGroups?: string[];
  linkedPlayers?: LinkedPlayer[];
  createdAt?: string;
  lastLoginAt?: string;
  uploadCenter?: {
    usage?: {
      date?: string | null;
      guilds?: number;
      players?: number;
    };
  };
  favorites?: AuthFavorites;
}
