import { guildFavorite } from "../../../lib/data-hub/hubFavoritesContract";
import { hubFavoritesStore } from "../../../lib/data-hub/hubFavoritesStore";
import { normalizeSelectedGuild, useGuildFavoritesSelection } from "../../../lib/data-hub/useGuildFavoritesSelection";
import React from "react";
import { prepareGuildCoa } from "../../../components/guilds/GuildEmblem";
import { useLocation, useNavigate } from "react-router-dom";
import { useAddressedGuild } from "../../../lib/data-hub/useAddressedGuild";
import { localEntityPath, GUILD_HUB } from "../../../lib/data-hub/routes";
import { favoriteReference } from "../../../lib/data-hub/hubFavoritesContract";
import { pageContextStore, pageGuildReference, type GuildFeatureKey } from "../../../lib/data-hub/pageContextStore";
import { usePageContext } from "../../../lib/data-hub/usePageContext";
import { loadIdentityResolutionSnapshot } from "../../../lib/identities/identityResolution";
import { resolveFavorite } from "../../../lib/data-hub/hubFavoritesProjection";
import { subscribeToLocalDataDependencies } from "../../../lib/local-data/localDataDependencies";
import {
  readGuildHubSelectionState,
  writeGuildHubSelectionState,
  type GuildHubSelectionGuild,
  type GuildHubSelectionState,
} from "../../../lib/guilds/localScanLibrary";

export type GuildHubSelectedGuild = GuildHubSelectionGuild;

export type GuildHubPersistedState = GuildHubSelectionState;


export { normalizeText, buildGuildLogoIdentifier } from "../../../lib/guilds/guildSelectionIdentity";

export const readGuildHubState = readGuildHubSelectionState;
export const writeGuildHubState = writeGuildHubSelectionState;

// Feature is required: every caller declares the owner of its input.
export function useGuildHubSelection(feature: GuildFeatureKey) {
  const favorites = useGuildFavoritesSelection();
  const context = usePageContext(feature);
  const location = useLocation();
  const navigate = useNavigate();
  const address = useAddressedGuild(feature);
  const selectedGuilds = favorites.selectedGuilds;
  React.useLayoutEffect(() => {
    const target = location.state?.guildFeatureTarget;
    if (target?.feature === feature && (target.guild === null || normalizeSelectedGuild(target.guild))) {
      pageContextStore.acceptTarget(feature, target.guild === null ? null : pageGuildReference(normalizeSelectedGuild(target.guild)!), typeof location.state?.guildFeatureTargetKey === "string" ? location.state.guildFeatureTargetKey : location.key);
    }
  }, [feature, location.key, location.state]);
  React.useEffect(() => {
    if (address.addressed || context.initialized || !favorites.snapshot || !favorites.projection.ready) return;
    // The historical ID is a one-time hint, never the first favorite fallback.
    const id = favorites.snapshot.compatibility.activeGuildId;
    const guild = selectedGuilds.find(g => g.id === id);
    const row = favorites.projection.rows.find(row => row.favorite.guild?.id === id);
    const favorite = row?.identity !== "conflict" && row?.observation?.state !== "ambiguous" ? row?.observation?.effective ?? row?.favorite : undefined;
    pageContextStore.initializeGuild(feature, guild && favorite?.reference && !favorite.referenceIssue ? pageGuildReference(guild, favorite) : null, context.generation);
  }, [address.addressed, context.initialized, context.generation, favorites.snapshot, selectedGuilds, feature, favorites.projection.ready, favorites.projection.rows]);
  const input = context.guild;
  const [resolution, setResolution] = React.useState<{ input: typeof input; conflict: boolean; error: string | null }>();
  React.useEffect(() => {
    if (!input) return;
    let stopped = false, generation = 0;
    const resolve = () => {
      const attempt = ++generation;
      void loadIdentityResolutionSnapshot().then(identities => {
        const favorite = { ...guildFavorite(input.guild, 0, null, false), ...input };
        const result = resolveFavorite(favorite, identities);
        if (!stopped && attempt === generation) setResolution(previous => {
          const next = { input, conflict: result.identity === "conflict", error: null };
          return previous?.input === input && previous.conflict === next.conflict && previous.error === null ? previous : next;
        });
      }, error => { if (!stopped && attempt === generation) setResolution({ input, conflict: true, error: String(error) }); });
    };
    resolve();
    const unsubscribe = subscribeToLocalDataDependencies({ allIdentities: true }, resolve, resolve, { consumer: `guild-selection-identities:${feature}` });
    return () => { stopped = true; generation++; unsubscribe(); };
  }, [input]);
  const conflicted = input?.referenceIssue === "conflict" || resolution?.input === input && resolution?.conflict;
  const needsIdentityCheck = input && new Set(input.originalReferences.map(ref => ref.serverNamespace + "::" + ref.entityId)).size > 1 && resolution?.input !== input;
  const activeGuild = address.ready && input?.reference && !conflicted && !needsIdentityCheck ? input.guild : null;
  const chooseGuild = React.useCallback(async (value: GuildHubSelectedGuild | null) => {
    const generation = pageContextStore.get(feature).generation;
    const row = value && favorites.projection.rows.find(row => row.favorite.guild?.id === value.id);
    const effective = row ? await favorites.projection.actionFavorite(row) : undefined;
    if (row && !effective || pageContextStore.get(feature).generation !== generation) return;
    const guild = value && normalizeSelectedGuild(effective?.guild ?? value);
    if (feature === "guild-dashboard" && guild) void prepareGuildCoa(guild.coaString, guild.name);
    const favorite = effective ?? hubFavoritesStore.getSnapshot().snapshot?.record.favorites.find(f => f.guild?.id === guild?.id);
    pageContextStore.selectGuild(feature, guild ? pageGuildReference(guild, favorite) : null);
    if (address.addressed) {
      const ref = guild && favoriteReference("guild", guild.logoIdentifier, guild.server);
      navigate(ref ? localEntityPath("guild", ref) : `${GUILD_HUB}/dashboard`, { replace: true, state: { returnTo: location.state?.returnTo } });
    }
  }, [feature, address.addressed, navigate, location.state, favorites.projection]);
  const selectContextGuild = React.useCallback((id: string) => {
    const guild = selectedGuilds.find(g => g.id === id);
    if (guild) chooseGuild(guild);
  }, [selectedGuilds, chooseGuild]);
  // Expose completion separately from a temporarily absent activeGuild. Existing
  // callers keep their favorites-loading contract; the dashboard owns this gate.
  const targetError = address.failure === "failed" ? "localProfileRoute.failed"
    : address.ready && context.error ? "pageContext.session"
    : address.ready && resolution?.input === input && resolution.error ? "localProfileRoute.failed"
    : !address.addressed && !context.initialized && favorites.error ? "localProfileRoute.failed" : null;
  const targetLoading = !targetError && !address.error && Boolean(
    !address.ready || !conflicted && (!context.initialized || needsIdentityCheck)
  );
  const contextArtworkMatches = address.acceptsContextArtwork && input?.reference && address.targetReference &&
    input.reference.identifier === address.targetReference.identifier && input.reference.serverNamespace === address.targetReference.serverNamespace;
  const loadingGuild = activeGuild ?? (!address.error && !targetError && !conflicted && !needsIdentityCheck
    ? contextArtworkMatches ? input!.guild : address.loadingGuild : null);
  return { loadingGuild, targetLoading, targetError, auditContext: favorites.auditContext, selectedGuilds, activeGuildId: activeGuild?.id ?? null, activeGuild, context,
    contextIssue: address.error ? "route" as const : address.ready && context.error ? "session" as const : address.ready && input && (!input.reference || conflicted) ? "unresolved" as const : null,
    isLoading: favorites.status === "restoring", isSaving: favorites.status === "saving", disabled: favorites.disabled,
    error: favorites.error, retry: favorites.retry, selectContextGuild, chooseGuild, selectGuild: favorites.selectGuild, removeGuild: favorites.removeGuild, reorderGuilds: favorites.reorderGuilds };
}
