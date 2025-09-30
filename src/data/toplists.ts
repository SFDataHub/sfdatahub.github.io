// Zentrale Lazy-Registry für Toplists (nur relative Pfade)
export const ToplistsRegistry = {
  players: () => import("../../components/toplists/PlayerToplists"),
  guilds:  () => import("../../components/toplists/GuildToplists"),
} as const;

export const ToplistPaths = {
  players: "../../components/toplists/PlayerToplists",
  guilds:  "../../components/toplists/GuildToplists",
} as const;
