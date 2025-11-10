// Zentrale Lazy-Registry für Toplists (nur relative Pfade)
export const ToplistsRegistry = {
  players: () => import("../pages/Toplists/playertoplists"),
  guilds: () => import("../pages/Toplists/guildtoplists"),
} as const;

export const ToplistPaths = {
  players: "../pages/Toplists/playertoplists",
  guilds: "../pages/Toplists/guildtoplists",
} as const;
