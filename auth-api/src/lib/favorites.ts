export const MAX_FAVORITE_PLAYERS = 250;
export const MAX_FAVORITE_GUILDS = 250;

export type FavoriteKind = "player" | "guild";
export type FavoriteBucket = "players" | "guilds";

export type UserFavoritesDoc = {
  players?: Record<string, true>;
  guilds?: Record<string, true>;
};

const PLAYER_FAVORITE_IDENTIFIER_REGEX = /^[a-z0-9_]+_p[0-9]+$/;
const GUILD_FAVORITE_IDENTIFIER_REGEX = /^[a-z0-9_]+_g[0-9]+$/;

export const getFavoriteBucket = (kind: FavoriteKind): FavoriteBucket =>
  kind === "player" ? "players" : "guilds";

export const getFavoriteLimit = (kind: FavoriteKind): number =>
  kind === "player" ? MAX_FAVORITE_PLAYERS : MAX_FAVORITE_GUILDS;

export const isValidFavoriteIdentifier = (kind: FavoriteKind, identifier: string): boolean => {
  if (kind === "player") return PLAYER_FAVORITE_IDENTIFIER_REGEX.test(identifier);
  return GUILD_FAVORITE_IDENTIFIER_REGEX.test(identifier);
};

const sanitizeFavoriteMap = (value: unknown): Record<string, true> | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, flag]) => flag === true);
  if (!entries.length) return undefined;
  return Object.fromEntries(entries) as Record<string, true>;
};

export const sanitizeUserFavorites = (value: unknown): UserFavoritesDoc => {
  const raw = value && typeof value === "object" ? (value as UserFavoritesDoc) : {};
  const players = sanitizeFavoriteMap(raw.players);
  const guilds = sanitizeFavoriteMap(raw.guilds);
  const out: UserFavoritesDoc = {};
  if (players) out.players = players;
  if (guilds) out.guilds = guilds;
  return out;
};

export const countFavoriteMap = (value: unknown): number => {
  if (!value || typeof value !== "object") return 0;
  let count = 0;
  for (const flag of Object.values(value as Record<string, unknown>)) {
    if (flag === true) count += 1;
  }
  return count;
};

export const countFavorites = (favorites: UserFavoritesDoc | undefined | null): { players: number; guilds: number } => ({
  players: countFavoriteMap(favorites?.players),
  guilds: countFavoriteMap(favorites?.guilds),
});

export const buildFavoriteFieldPath = (kind: FavoriteKind, identifier: string): string =>
  `favorites.${getFavoriteBucket(kind)}.${identifier}`;
