import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type {
  UploadRecordKind,
  UploadRecordKey,
  UploadRecordStatus,
  UploadSession,
  UploadSessionId,
} from "./uploadCenterTypes";

export type UploadCenterSessionsState = {
  sessions: UploadSession[];
  activeSessionId: UploadSessionId | null;

  // Sessions
  addSession: (session: UploadSession) => void;
  setActiveSession: (id: UploadSessionId | null) => void;
  removeSession: (id: UploadSessionId) => void;
  clearAllSessions: () => void;

  // Selection
  toggleRecordSelection: (
    sessionId: UploadSessionId,
    kind: UploadRecordKind,
    recordKey: UploadRecordKey,
    selected: boolean
  ) => void;

  selectAllInSession: (
    sessionId: UploadSessionId,
    kind: UploadRecordKind,
    selected: boolean
  ) => void;

  selectGuildWithPlayers: (
    sessionId: UploadSessionId,
    guildKey: UploadRecordKey,
    selected: boolean
  ) => void;

  updateGuildSelectionFromPlayer: (
    sessionId: UploadSessionId,
    playerKey: UploadRecordKey,
    selected: boolean
  ) => void;

  selectAllPlayersWithGuilds: (sessionId: UploadSessionId, selected: boolean) => void;
  selectAllGuildsWithPlayers: (sessionId: UploadSessionId, selected: boolean) => void;

  // Status updates (for future API responses)
  setRecordStatus: (
    sessionId: UploadSessionId,
    kind: UploadRecordKind,
    recordKey: UploadRecordKey,
    status: UploadRecordStatus
  ) => void;
};

type PersistedSessionsState = {
  version: 1;
  type: "uploadCenter.sessions";
  sessions: UploadSession[];
  activeSessionId: UploadSessionId | null;
};

const STORAGE_KEY = "sfdatahub_upload_sessions_v1";

type UploadCenterState = {
  sessions: UploadSession[];
  activeSessionId: UploadSessionId | null;
};

const DEFAULT_STATE: UploadCenterState = {
  sessions: [],
  activeSessionId: null,
};

const readPersistedSessions = (): UploadCenterState => {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as PersistedSessionsState | UploadCenterState | null;
    if (parsed && typeof parsed === "object") {
      if (
        "version" in parsed &&
        parsed?.version === 1 &&
        (parsed as PersistedSessionsState).type === "uploadCenter.sessions" &&
        Array.isArray((parsed as PersistedSessionsState).sessions)
      ) {
        const current = parsed as PersistedSessionsState;
        return {
          sessions: current.sessions,
          activeSessionId: current.activeSessionId ?? current.sessions[0]?.id ?? null,
        };
      }
      if (Array.isArray((parsed as UploadCenterState).sessions)) {
        const legacy = parsed as UploadCenterState;
        return {
          sessions: legacy.sessions,
          activeSessionId: legacy.activeSessionId ?? legacy.sessions[0]?.id ?? null,
        };
      }
    }
  } catch (error) {
    console.warn("[UploadCenterSessions] Failed to parse persisted state", error);
  }
  return DEFAULT_STATE;
};

const UploadCenterSessionsContext = createContext<UploadCenterSessionsState | null>(null);

type ProviderProps = {
  children: React.ReactNode;
};

export function UploadCenterSessionsProvider({ children }: ProviderProps) {
  const initialState = useMemo<UploadCenterState>(() => readPersistedSessions(), []);
  const [sessions, setSessions] = useState<UploadSession[]>(() => initialState.sessions);
  const [activeSessionId, setActiveSessionId] = useState<UploadSessionId | null>(
    () => initialState.activeSessionId,
  );

  const normalizePendingSession = useCallback((session: UploadSession): UploadSession => ({
    ...session,
    players: session.players.map((player) => ({ ...player, status: "pending" as const })),
    guilds: session.guilds.map((guild) => ({ ...guild, status: "pending" as const })),
  }), []);

  // Persist to localStorage whenever sessions or activeSessionId change
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const payload: PersistedSessionsState = {
        version: 1,
        type: "uploadCenter.sessions",
        sessions,
        activeSessionId,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn("[UploadCenterSessions] Failed to persist state", error);
    }
  }, [sessions, activeSessionId]);

  const addSession = useCallback((session: UploadSession) => {
    const normalized = normalizePendingSession(session);
    setSessions((prev) => [...prev, normalized]);
    setActiveSessionId(normalized.id);
  }, [normalizePendingSession]);

  const setActiveSession = useCallback((id: UploadSessionId | null) => {
    setActiveSessionId(id);
  }, []);

  const removeSession = useCallback((id: UploadSessionId) => {
    setSessions((prev) => {
      const next = prev.filter((session) => session.id !== id);
      setActiveSessionId((currentActive) => {
        if (currentActive === id) {
          return next[0]?.id ?? null;
        }
        return currentActive;
      });
      return next;
    });
  }, []);

  const clearAllSessions = useCallback(() => {
    setSessions([]);
    setActiveSessionId(null);
  }, []);

  const toggleRecordSelection = useCallback((
    sessionId: UploadSessionId,
    kind: UploadRecordKind,
    recordKey: UploadRecordKey,
    selected: boolean,
  ) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId) return session;
        if (kind === "player") {
          const players = session.players.map((player) =>
            player.key === recordKey ? { ...player, selected } : player,
          );
          return { ...session, players };
        }
        const guilds = session.guilds.map((guild) =>
          guild.key === recordKey ? { ...guild, selected } : guild,
        );
        return { ...session, guilds };
      }),
    );
  }, []);

  const selectAllInSession = useCallback((
    sessionId: UploadSessionId,
    kind: UploadRecordKind,
    selected: boolean,
  ) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId) return session;
        if (kind === "player") {
          const players = session.players.map((player) => ({ ...player, selected }));
          return { ...session, players };
        }
        const guilds = session.guilds.map((guild) => ({ ...guild, selected }));
        return { ...session, guilds };
      }),
    );
  }, []);

  const selectGuildWithPlayers = useCallback((
    sessionId: UploadSessionId,
    guildKey: UploadRecordKey,
    selected: boolean,
  ) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId) return session;
        const targetGuild = session.guilds.find((g) => g.key === guildKey);
        if (!targetGuild) return session;
        const guildId = targetGuild.guildId;
        const players = session.players.map((player) =>
          player.guildId === guildId ? { ...player, selected } : player,
        );
        const guilds = session.guilds.map((guild) =>
          guild.key === guildKey ? { ...guild, selected } : guild,
        );
        return { ...session, players, guilds };
      }),
    );
  }, []);

  const updateGuildSelectionFromPlayer = useCallback((
    sessionId: UploadSessionId,
    playerKey: UploadRecordKey,
    selected: boolean,
  ) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId) return session;
        let guildId: string | undefined;
        const players = session.players.map((player) => {
          if (player.key !== playerKey) return player;
          guildId = player.guildId;
          return { ...player, selected };
        });
        if (!guildId) return { ...session, players };

        const guildPlayers = players.filter((p) => p.guildId === guildId);
        const allSelected = guildPlayers.length > 0 && guildPlayers.every((p) => p.selected);

        const guilds = session.guilds.map((guild) => {
          if (guild.guildId !== guildId) return guild;
          if (selected === false) return { ...guild, selected: false };
          return allSelected ? { ...guild, selected: true } : guild;
        });

        return { ...session, players, guilds };
      }),
    );
  }, []);

  const selectAllPlayersWithGuilds = useCallback((sessionId: UploadSessionId, selected: boolean) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId) return session;
        const players = session.players.map((p) => ({ ...p, selected }));
        const guilds = session.guilds.map((g) => {
          if (!selected) return { ...g, selected: false };
          const guildPlayers = players.filter((p) => p.guildId === g.guildId);
          const allSelected = guildPlayers.length > 0 && guildPlayers.every((p) => p.selected);
          return { ...g, selected: allSelected };
        });
        return { ...session, players, guilds };
      }),
    );
  }, []);

  const selectAllGuildsWithPlayers = useCallback((sessionId: UploadSessionId, selected: boolean) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId) return session;
        const guilds = session.guilds.map((g) => ({ ...g, selected }));
        const players = session.players.map((p) =>
          selected && p.guildId
            ? { ...p, selected: true }
            : !selected && p.guildId
              ? { ...p, selected: false }
              : p
        );
        return { ...session, guilds, players };
      }),
    );
  }, []);

  const setRecordStatus = useCallback((
    sessionId: UploadSessionId,
    kind: UploadRecordKind,
    recordKey: UploadRecordKey,
    status: UploadRecordStatus,
  ) => {
    console.log("[UploadSessions] setRecordStatus", { sessionId, kind, recordKey, status });
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId) return session;
        if (kind === "player") {
          const players = session.players.map((player) =>
            player.key === recordKey ? { ...player, status } : player,
          );
          return { ...session, players };
        }
        const guilds = session.guilds.map((guild) =>
          guild.key === recordKey ? { ...guild, status } : guild,
        );
        return { ...session, guilds };
      }),
    );
  }, []);

  const value = useMemo<UploadCenterSessionsState>(() => ({
    sessions,
    activeSessionId,
    addSession,
    setActiveSession,
    removeSession,
    clearAllSessions,
    toggleRecordSelection,
    selectAllInSession,
    selectGuildWithPlayers,
    updateGuildSelectionFromPlayer,
    selectAllPlayersWithGuilds,
    selectAllGuildsWithPlayers,
    setRecordStatus,
  }), [
    sessions,
    activeSessionId,
    addSession,
    setActiveSession,
    removeSession,
    clearAllSessions,
    toggleRecordSelection,
    selectAllInSession,
    selectGuildWithPlayers,
    updateGuildSelectionFromPlayer,
    selectAllPlayersWithGuilds,
    selectAllGuildsWithPlayers,
    setRecordStatus,
  ]);

  return (
    <UploadCenterSessionsContext.Provider value={value}>
      {children}
    </UploadCenterSessionsContext.Provider>
  );
}

export function useUploadCenterSessions() {
  const ctx = useContext(UploadCenterSessionsContext);
  if (!ctx) {
    throw new Error("useUploadCenterSessions must be used within UploadCenterSessionsProvider");
  }
  return ctx;
}
