import React from "react";
import {
  readGuildHubSelectionState,
  writeGuildHubSelectionState,
  type GuildHubLocalGuildIdentity,
  type GuildHubSelectionGuild,
  type GuildHubSelectionState,
} from "../../../lib/guilds/localScanLibrary";

export type GuildHubSelectedGuild = GuildHubSelectionGuild;

export type GuildHubPersistedState = GuildHubSelectionState;

export const normalizeText = (value: unknown) => String(value ?? "").trim().toLowerCase();

const normalizeGuildIdSegment = (value: unknown): string | null => {
  const raw = normalizeText(value).replace(/\s+/g, "");
  if (!raw) return null;
  const identifierMatch = raw.match(/^(.+)_g([^_]+)$/);
  if (identifierMatch) {
    const serverKey = normalizeGuildServerKey(identifierMatch[1]);
    return serverKey ? `${serverKey}_g${identifierMatch[2]}` : raw;
  }
  return raw.startsWith("g") ? raw : `g${raw}`;
};

const normalizeGuildServerKey = (value: unknown): string | null => {
  const raw = normalizeText(value).replace(/\s+/g, "");
  if (!raw) return null;
  if (/^[a-z0-9]+_(?:eu|net)$/.test(raw)) return raw;

  const euMatch = raw.match(/^s?(\d+)$/);
  if (euMatch) return `s${euMatch[1]}_eu`;

  const euCodeMatch = raw.match(/^eu(\d+)$/);
  if (euCodeMatch) return `s${euCodeMatch[1]}_eu`;

  const fusionMatch = raw.match(/^f(\d+)$/);
  if (fusionMatch) return `f${fusionMatch[1]}_net`;

  const amMatch = raw.match(/^am(\d+)$/);
  if (amMatch) return `am${amMatch[1]}_net`;

  return raw;
};

export const buildGuildLogoIdentifier = (server: unknown, guildId: unknown): string | null => {
  const guildSegment = normalizeGuildIdSegment(guildId);
  if (!guildSegment) return null;
  if (guildSegment.includes("_g")) return guildSegment;

  const serverKey = normalizeGuildServerKey(server);
  if (!serverKey) return null;
  return `${serverKey}_${guildSegment}`;
};

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
  };
};

const resolveActiveGuildId = (state: GuildHubPersistedState): string | null => {
  if (state.activeGuildId && state.selectedGuilds.some((guild) => guild.id === state.activeGuildId)) {
    return state.activeGuildId;
  }
  return state.selectedGuilds[0]?.id ?? null;
};

const normalizeGuildHubState = (state: GuildHubPersistedState): GuildHubPersistedState => {
  const selectedGuilds = state.selectedGuilds
    .map(normalizeSelectedGuild)
    .filter((guild): guild is GuildHubSelectedGuild => Boolean(guild));
  return {
    selectedGuilds,
    activeGuildId: resolveActiveGuildId({ selectedGuilds, activeGuildId: state.activeGuildId }),
  };
};

const createEmptyGuildHubState = (): GuildHubPersistedState => ({ selectedGuilds: [], activeGuildId: null });

export const readGuildHubState = async (): Promise<GuildHubPersistedState> => {
  try {
    return normalizeGuildHubState(await readGuildHubSelectionState());
  } catch {
    return createEmptyGuildHubState();
  }
};

export const writeGuildHubState = async (state: GuildHubPersistedState): Promise<void> => {
  await writeGuildHubSelectionState(normalizeGuildHubState(state));
};

export function useGuildHubSelection() {
  const [state, setState] = React.useState<GuildHubPersistedState>(() => createEmptyGuildHubState());
  const [isLoading, setIsLoading] = React.useState(true);
  const stateRef = React.useRef(state);
  const userStateCommittedRef = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;

    readGuildHubState()
      .then((storedState) => {
        if (cancelled || userStateCommittedRef.current) return;
        stateRef.current = storedState;
        setState(storedState);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const commitUserState = React.useCallback((nextState: GuildHubPersistedState) => {
    const normalized = normalizeGuildHubState(nextState);
    userStateCommittedRef.current = true;
    stateRef.current = normalized;
    setState(normalized);
    writeGuildHubState(normalized).catch((err) => {
      console.error("[GuildHub] failed to persist guild selection", err);
    });
  }, []);

  const selectGuild = React.useCallback((guild: GuildHubSelectedGuild) => {
    const prev = stateRef.current;
    const selectedGuild = normalizeSelectedGuild(guild);
    if (!selectedGuild) return;
    const selectedGuilds = prev.selectedGuilds.some((entry) => entry.id === selectedGuild.id)
      ? prev.selectedGuilds.map((entry) => (entry.id === selectedGuild.id ? selectedGuild : entry))
      : [...prev.selectedGuilds, selectedGuild];
    commitUserState({ selectedGuilds, activeGuildId: selectedGuild.id });
  }, [commitUserState]);

  const setActiveGuildId = React.useCallback((id: string) => {
    const prev = stateRef.current;
    commitUserState({
      selectedGuilds: prev.selectedGuilds,
      activeGuildId: prev.selectedGuilds.some((guild) => guild.id === id) ? id : resolveActiveGuildId(prev),
    });
  }, [commitUserState]);

  const removeGuild = React.useCallback((id: string) => {
    const prev = stateRef.current;
    if (!prev.selectedGuilds.some((guild) => guild.id === id)) return;

    const selectedGuilds = prev.selectedGuilds.filter((guild) => guild.id !== id);
    const activeGuildId =
      prev.activeGuildId === id
        ? selectedGuilds[0]?.id ?? null
        : resolveActiveGuildId({ selectedGuilds, activeGuildId: prev.activeGuildId });

    commitUserState({ selectedGuilds, activeGuildId });
  }, [commitUserState]);

  const activeGuild = React.useMemo(
    () => state.selectedGuilds.find((guild) => guild.id === state.activeGuildId) ?? state.selectedGuilds[0] ?? null,
    [state.selectedGuilds, state.activeGuildId],
  );

  return {
    selectedGuilds: state.selectedGuilds,
    activeGuildId: activeGuild?.id ?? null,
    activeGuild,
    isLoading,
    setActiveGuildId,
    selectGuild,
    removeGuild,
  };
}
