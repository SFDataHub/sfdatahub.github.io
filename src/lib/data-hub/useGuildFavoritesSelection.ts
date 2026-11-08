import React from "react";
import { buildGuildLogoIdentifier } from "../guilds/guildSelectionIdentity";
import type { GuildHubLocalGuildIdentity, GuildHubSelectionGuild as GuildHubSelectedGuild } from "../guilds/localScanLibrary";
import { guildFavorite } from "./hubFavoritesContract";
import { useHubFavorites } from "./useHubFavorites";
import { useHubFavoritesProjection } from "./useHubFavoritesProjection";

export const normalizeSelectedGuild = (
  value: Partial<GuildHubSelectedGuild> | null | undefined,
): GuildHubSelectedGuild | null => {
  if (!value || typeof value !== "object") return null;
  const guildId = String(value.guildId ?? "").trim();
  const name = String(value.name ?? "").trim();
  const server = String(value.server ?? "").trim();
  const logoIdentifier = buildGuildLogoIdentifier(server, value.logoIdentifier ?? value.logo ?? guildId);
  if (!guildId || !name || !server || !logoIdentifier) return null;
  const id = String(value.id ?? logoIdentifier).trim() || logoIdentifier;
  return {
    id,
    guildId,
    name,
    server,
    logo: logoIdentifier,
    logoIdentifier,
    hofRank: typeof value.hofRank === "number" ? value.hofRank : null,
    memberCount: typeof value.memberCount === "number" ? value.memberCount : null,
    coaString: String(value.coaString ?? "").trim() || null,
    observedAtMs: typeof value.observedAtMs === "number" && Number.isFinite(value.observedAtMs) ? value.observedAtMs : null,
  };
};

export const mapLocalGuildIdentityToSelection = (
  guild: GuildHubLocalGuildIdentity,
): GuildHubSelectedGuild | null => {
  const logoIdentifier = buildGuildLogoIdentifier(guild.server, guild.guildIdentifier ?? guild.guildId);
  if (!logoIdentifier) return null;
  return {
    id: logoIdentifier,
    guildId: guild.guildId,
    name: guild.name,
    server: guild.server,
    logo: logoIdentifier,
    logoIdentifier,
    hofRank: guild.hofRank,
    memberCount: guild.memberCount,
    coaString: guild.coaString ?? null,
    observedAtMs: guild.sourceScannedAt && Number.isFinite(Date.parse(guild.sourceScannedAt)) ? Date.parse(guild.sourceScannedAt) : null,
  };
};

/** Shared committed favorites; saving never selects a page input. */
export function useGuildFavoritesSelection() {
  const favorites = useHubFavorites();
  const projection = useHubFavoritesProjection(favorites.snapshot?.record, "guild-favorites-selection");
  const selectedGuilds = React.useMemo(() => projection.rows.filter(row => row.favorite.kind === "guild")
    .flatMap(row => (row.observation?.effective ?? row.favorite).guild ?? []), [projection.rows]);
  const selectGuild = React.useCallback(async (value: GuildHubSelectedGuild) => {
    const guild = normalizeSelectedGuild(value);
    if (!guild) return false;
    return favorites.mutate({ type: "save", favorite: guildFavorite(guild, 0, null, false) });
  }, [favorites.mutate]);
  const removeGuild = React.useCallback((id: string) => favorites.mutate({ type: "removeGuild", id }), [favorites.mutate]);
  const reorderGuilds = React.useCallback((id: string, targetIndex: number) => favorites.mutate({ type: "reorderGuild", id, targetIndex }), [favorites.mutate]);
  return { ...favorites, projection, selectedGuilds, selectGuild, removeGuild, reorderGuilds };
}
