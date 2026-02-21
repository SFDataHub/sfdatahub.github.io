import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ContentShell from "../ContentShell";
import ImportCsv, { buildParsedResultFromCsvSources, type CsvTextSource } from "../ImportCsv/ImportCsv";
import type { UploadRecordKey, UploadRecordStatus } from "./uploadCenterTypes";
import type { UploadSessionId } from "./uploadCenterTypes";
import { buildUploadSessionFromCsv, type CsvParsedResult } from "./uploadCenterCsvMapping";
import { useUploadCenterSessions } from "./UploadCenterSessionsContext";
import {
  importSelectionToDb,
  type ImportSelectionPayload,
  type ImportSelectionStageEvent,
} from "../ImportCsv/importCsvToDb";
import type { ImportProgress } from "../../lib/import/csv";
import {
  DEFAULT_UPLOAD_QUOTA,
  fetchUploadQuotaSnapshot,
  type UploadQuotaConfig,
} from "../../lib/firebase/uploadQuota";
import {
  formatTodayString,
  type UploadCenterUsage,
  updateUploadCenterUsageForToday,
} from "../../lib/firebase/users";
import { useAuth } from "../../context/AuthContext";
import { fetchScanUploadCsv } from "../../lib/api/scanUploads";
import { useScanUploads, type ScanUploadDoc } from "./useScanUploads";
import { iconForClassName } from "../../data/classes";
import { toDriveThumbProxy } from "../../lib/urls";
import { Trash2 } from "lucide-react";
import {
  persistUploadQuotaToStorage,
  readStoredUploadQuota,
} from "../../lib/uploadQuotaStorage";

type UploadCenterQuotaState = {
  config: UploadQuotaConfig;
  usageDate: string | null;
  usedGuildsToday: number;
  usedPlayersToday: number;
  remainingGuilds: number;
  remainingPlayers: number;
  today: string;
};

const clampRemaining = (limit: number, used: number) => Math.max(limit - used, 0);

const buildQuotaState = (
  config: UploadQuotaConfig,
  usage: UploadCenterUsage,
  today: string,
): UploadCenterQuotaState => {
  const isToday = usage.date === today;
  const usedGuildsToday = isToday ? usage.guilds ?? 0 : 0;
  const usedPlayersToday = isToday ? usage.players ?? 0 : 0;

  return {
    config,
    usageDate: usage.date ?? null,
    usedGuildsToday,
    usedPlayersToday,
    remainingGuilds: clampRemaining(config.dailyGuildLimit, usedGuildsToday),
    remainingPlayers: clampRemaining(config.dailyPlayerLimit, usedPlayersToday),
    today,
  };
};

const ClassIcon = ({ className }: { className?: string | null }) => {
  if (!className) {
    return (
      <span title="Unknown class" className="text-xs text-center text-zinc-400 block">
        Unknown
      </span>
    );
  }
  const { url, fallback } = iconForClassName(className);
  const proxiedUrl = url ? toDriveThumbProxy(url, 28) : undefined;

  if (proxiedUrl) {
    return (
      <img
        src={proxiedUrl}
        alt={className}
        title={className}
        className="mx-auto h-6 w-6 rounded-full object-contain"
        draggable={false}
      />
    );
  }

  if (fallback) {
    return (
      <span
        title={className}
        className="mx-auto text-center text-sm leading-none"
        style={{ display: "block" }}
      >
        {fallback}
      </span>
    );
  }

  return (
    <span title={className} className="text-xs text-center text-zinc-400 block">
      {className}
    </span>
  );
};

export default function UploadCenterPageContent() {
  return (
    <ContentShell
      key="upload-center-shell"
      title="Upload Center"
      subtitle="Import CSV scans locally, review all players and guilds, then upload only the records you want to store."
      centerFramed={false}
    >
      <UploadCenterContentBody />
    </ContentShell>
  );
}

function UploadCenterContentBody() {
  const {
    sessions,
    activeSessionId,
    addSession,
    setActiveSession,
    removeSession,
    selectGuildWithPlayers,
    updateGuildSelectionFromPlayer,
    selectAllPlayersWithGuilds,
    selectAllGuildsWithPlayers,
    setRecordStatus,
  } = useUploadCenterSessions();
  const { t } = useTranslation();
  const { user } = useAuth();
  const discordUserId =
    user?.providers?.discord?.id ?? (user?.provider === "discord" ? user.id : null);
  const {
    items: scanUploads,
    loading: scanUploadsLoading,
    error: scanUploadsError,
  } = useScanUploads(discordUserId);
  const hasDiscordId = Boolean(discordUserId);
  const activeSession = sessions.find((session) => session.id === activeSessionId) || null;
  const loadedScanIds = useMemo(
    () =>
      new Set(
        sessions
          .map((session) => session.scanUploadId)
          .filter((id): id is string => Boolean(id)),
      ),
    [sessions],
  );
  const [expandedGuildKeys, setExpandedGuildKeys] = React.useState<Set<UploadRecordKey>>(new Set());
  type UploadPhase = "idle" | "uploading" | "finalizing" | "done";
  type StatusFilter = "all" | "pending" | "inDb" | "error";
  const [uploadProgress, setUploadProgress] = useState({
    phase: "idle" as UploadPhase,
    processed: 0,
    total: 0,
    created: 0,
    duplicate: 0,
    error: 0,
  });
  const [playerStatusFilter, setPlayerStatusFilter] = useState<StatusFilter>("all");
  const [guildStatusFilter, setGuildStatusFilter] = useState<StatusFilter>("all");
  const [hideUploadedPlayers, setHideUploadedPlayers] = useState(false);
  const [hideUploadedGuilds, setHideUploadedGuilds] = useState(false);
  const [loadingScanId, setLoadingScanId] = useState<string | null>(null);
  const [remoteScanError, setRemoteScanError] = useState<string | null>(null);
  const [quotaState, setQuotaState] = useState<UploadCenterQuotaState>(() =>
    buildQuotaState(DEFAULT_UPLOAD_QUOTA, { date: null, guilds: 0, players: 0 }, formatTodayString()),
  );
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [activityStage, setActivityStage] = useState<string>("idle");
  const [isFinalizing, setIsFinalizing] = useState<boolean>(false);
  const [activityStartedAt, setActivityStartedAt] = useState<number | null>(null);
  const [activityLastTickAt, setActivityLastTickAt] = useState<number | null>(null);
  const [activityNow, setActivityNow] = useState<number>(() =>
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now(),
  );

  const applyQuotaState = useCallback((config: UploadQuotaConfig, usage: UploadCenterUsage) => {
    const today = formatTodayString();
    setQuotaState(buildQuotaState(config, usage, today));
    setQuotaError(null);
  }, []);

  const refreshQuotaFromRemote = useCallback(async () => {
    try {
      const snapshot = await fetchUploadQuotaSnapshot(user ?? null);
      applyQuotaState(snapshot.config, snapshot.usage);
      persistUploadQuotaToStorage(snapshot.config, snapshot.usage);
    } catch (error) {
      console.error("[UploadCenter] Failed to refresh upload quota", error);
      setQuotaError("Could not refresh upload quota. Using last known values.");
    }
  }, [applyQuotaState, user]);

  useEffect(() => {
    let isActive = true;
    const today = formatTodayString();
    const usageFromUser: UploadCenterUsage = user?.uploadCenter?.usage ?? {
      date: null,
      guilds: 0,
      players: 0,
    };

    applyQuotaState(DEFAULT_UPLOAD_QUOTA, usageFromUser);

    const storedQuota = readStoredUploadQuota();
    if (storedQuota) {
      applyQuotaState(storedQuota.config, storedQuota.usage);
    }

    (async () => {
      try {
        const snapshot = await fetchUploadQuotaSnapshot(user ?? null);
        if (!isActive) return;
        applyQuotaState(snapshot.config, snapshot.usage);
        persistUploadQuotaToStorage(snapshot.config, snapshot.usage);
      } catch (error) {
        console.error("[UploadCenter] Failed to refresh upload quota", error);
        if (isActive) {
          setQuotaError("Could not refresh upload quota. Using last known values.");
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [
    user,
    user?.uploadCenter?.usage?.date,
    user?.uploadCenter?.usage?.guilds,
    user?.uploadCenter?.usage?.players,
    applyQuotaState,
  ]);

  const handleBuildSessionFromCsv = useCallback((parsed: CsvParsedResult) => {
    const sessionId: UploadSessionId = `csv_${Date.now()}`;
    const createdAtIso = new Date().toISOString();
    const session = buildUploadSessionFromCsv(parsed, sessionId, createdAtIso);
    addSession(session);
    setActiveSession(sessionId);
  }, [addSession, setActiveSession]);

  const formatSessionDate = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "Unknown date";
    return date.toLocaleString();
  };

  const toggleGuildExpanded = (key: UploadRecordKey) => {
    setExpandedGuildKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderStatusBadge = (status: string) => {
    const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide";
    const variants: Record<string, string> = {
      pending: "bg-slate-800 text-slate-200 border border-slate-600/70",
      created: "bg-emerald-500/10 text-emerald-100 border border-emerald-400/60",
      duplicate: "bg-amber-500/10 text-amber-100 border border-amber-400/60",
      error: "bg-rose-500/10 text-rose-100 border border-rose-400/60",
    };
    const label: Record<string, string> = {
      pending: "PENDING",
      created: "UPLOADED",
      duplicate: "IN DB",
      error: "ERROR",
    };
    return (
      <span className={`${base} ${variants[status] ?? variants.pending}`}>
        {label[status] ?? status}
      </span>
    );
  };

  const formatFirestoreTimestamp = (value?: { toDate?: () => Date } | null) => {
    if (!value) return "Unknown date";
    try {
      if (typeof value.toDate === "function") {
        return value.toDate().toLocaleString();
      }
    } catch {
      // ignore
    }
    return "Unknown date";
  };

  const renderScanUploadStatusBadge = (status?: string) => {
    const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide";
    const variants: Record<string, string> = {
      pending: "bg-slate-800 text-slate-200 border border-slate-600/70",
      stored: "bg-emerald-500/10 text-emerald-100 border border-emerald-400/60",
      received: "bg-sky-500/10 text-sky-100 border border-sky-400/60",
      error: "bg-rose-500/10 text-rose-100 border border-rose-400/60",
    };
    const label: Record<string, string> = {
      pending: "PENDING",
      stored: "STORED",
      received: "RECEIVED",
      error: "ERROR",
    };
    const key = status?.toLowerCase() ?? "pending";
    return (
      <span className={`${base} ${variants[key] ?? variants.pending}`}>
        {label[key] ?? (status || "PENDING")}
      </span>
    );
  };

  const filterByStatus = useCallback(
    (status: string, filter: StatusFilter, hideUploaded: boolean) => {
      const isInDb = status === "created" || status === "duplicate";
      if (hideUploaded && isInDb) return false;
      if (filter === "all") return true;
      if (filter === "pending") return status === "pending";
      if (filter === "inDb") return isInDb;
      if (filter === "error") return status === "error";
      return true;
    },
    [],
  );

  const filteredPlayers = useMemo(() => {
    if (!activeSession) return [];
    return activeSession.players.filter((p) =>
      filterByStatus(p.status, playerStatusFilter, hideUploadedPlayers),
    );
  }, [activeSession, filterByStatus, playerStatusFilter, hideUploadedPlayers]);

  const filteredGuilds = useMemo(() => {
    if (!activeSession) return [];
    return activeSession.guilds.filter((g) =>
      filterByStatus(g.status, guildStatusFilter, hideUploadedGuilds),
    );
  }, [activeSession, filterByStatus, guildStatusFilter, hideUploadedGuilds]);

  const loadRemoteScanIntoSession = useCallback(
    async (scan: ScanUploadDoc) => {
      if (!scan?.id) return;
      setRemoteScanError(null);
      setLoadingScanId(scan.id);
      try {
        const sources: CsvTextSource[] = [];
        const scanLabel = scan.queueId || scan.scanId || scan.id;
        const shouldFetchPlayers = scan.hasPlayersCsv !== false;
        const shouldFetchGuilds = scan.hasGuildsCsv !== false;

        if (shouldFetchPlayers) {
          const playersCsv = await fetchScanUploadCsv(scan.id, "players");
          sources.push({
            name: `players.scan-${scanLabel}.csv`,
            text: playersCsv,
          });
        }

        if (shouldFetchGuilds) {
          const guildsCsv = await fetchScanUploadCsv(scan.id, "guilds");
          sources.push({
            name: `guilds.scan-${scanLabel}.csv`,
            text: guildsCsv,
          });
        }

        if (!sources.length) {
          throw new Error("No CSV data available for this scan.");
        }

        const parsed = buildParsedResultFromCsvSources(sources);
        parsed.filename = scanLabel || parsed.filename;
        const sessionId: UploadSessionId = `scan_${scan.id}_${Date.now()}`;
        const createdAtIso = new Date().toISOString();
        const session = buildUploadSessionFromCsv(parsed, sessionId, createdAtIso);
        const sessionWithScan = { ...session, scanUploadId: scan.id };
        addSession(sessionWithScan);
        setActiveSession(sessionId);
        console.log(
          `[upload-center] Loaded remote scan session for scanId=${scan.id} (session ${sessionId})`,
        );
      } catch (error) {
        console.error(
          `[upload-center] Failed to load remote scan session for scanId=${scan?.id}`,
          error,
        );
        setRemoteScanError(
          error instanceof Error ? error.message : "Failed to load remote scan session.",
        );
      } finally {
        setLoadingScanId(null);
      }
    },
    [addSession, setActiveSession],
  );

  const selectionExists = useMemo(() => {
    if (!activeSession) return false;
    const hasPlayers = activeSession.players.some((p) => p.selected);
    const hasGuilds = activeSession.guilds.some((g) => g.selected);
    return hasPlayers || hasGuilds;
  }, [activeSession]);
  const isUploadBusy =
    uploadProgress.phase === "uploading" || uploadProgress.phase === "finalizing";
  const getNowMs = () =>
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const formatElapsed = (ms: number) => {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  useEffect(() => {
    if (!isUploadBusy || activityStartedAt == null) return;
    setActivityNow(getNowMs());
    const timer = window.setInterval(() => {
      setActivityNow(getNowMs());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isUploadBusy, activityStartedAt]);

  const buildPayloadFromActiveSession = (): ImportSelectionPayload | null => {
    if (!activeSession) return null;
    const selectedPlayers = activeSession.players.filter((p) => p.selected);
    const selectedGuilds = activeSession.guilds.filter((g) => g.selected);
    if (!selectedPlayers.length && !selectedGuilds.length) return null;

    const playersRows = selectedPlayers.map((p) => {
      if (p.values && typeof p.values === "object") {
        const row = { ...(p.values as Record<string, any>) };
        if (row.Identifier == null && row.ID == null) row.Identifier = p.playerId;
        if (row["Guild Identifier"] == null) row["Guild Identifier"] = p.guildId ?? "";
        if (row.Timestamp == null) row.Timestamp = p.scanTimestampSec;
        if (row.Server == null) row.Server = p.server;
        if (row.Name == null) row.Name = p.name;
        if (row.Class == null) row.Class = p.className ?? "";
        if (row.Level == null) row.Level = p.level ?? "";
        return row;
      }
      return {
        Identifier: p.playerId,
        "Guild Identifier": p.guildId ?? "",
        Timestamp: p.scanTimestampSec,
        Server: p.server,
        Name: p.name,
        Class: p.className ?? "",
        Level: p.level ?? "",
      };
    });

    const guildsRows = selectedGuilds.map((g) => {
      if (g.values && typeof g.values === "object") {
        const row = { ...(g.values as Record<string, any>) };
        if (row["Guild Identifier"] == null) row["Guild Identifier"] = g.guildId;
        if (row["Guild Member Count"] == null) row["Guild Member Count"] = g.memberCount ?? g.members.length;
        if (row.Timestamp == null) row.Timestamp = g.scanTimestampSec;
        if (row.Server == null) row.Server = g.server;
        if (row.Name == null) row.Name = g.name;
        return row;
      }
      return {
        "Guild Identifier": g.guildId,
        "Guild Member Count": g.memberCount ?? g.members.length,
        Timestamp: g.scanTimestampSec,
        Name: g.name,
        Server: g.server,
      };
    });

    return { playersRows, guildsRows };
  };

  const updateQuotaUsage = useCallback((deltaGuilds: number, deltaPlayers: number) => {
    setQuotaState((prev) => {
      const newUsedGuilds = prev.usedGuildsToday + deltaGuilds;
      const newUsedPlayers = prev.usedPlayersToday + deltaPlayers;
      const nextState = {
        ...prev,
        usedGuildsToday: newUsedGuilds,
        usedPlayersToday: newUsedPlayers,
        remainingGuilds: clampRemaining(prev.config.dailyGuildLimit, newUsedGuilds),
        remainingPlayers: clampRemaining(prev.config.dailyPlayerLimit, newUsedPlayers),
        usageDate: prev.today,
      };
      persistUploadQuotaToStorage(prev.config, {
        date: prev.today,
        guilds: newUsedGuilds,
        players: newUsedPlayers,
      });
      return nextState;
    });
  }, []);

  const lastUploadLabel = useMemo(() => {
    if (!quotaState.usageDate) return "No uploads yet";
    if (quotaState.usageDate === quotaState.today) return "Today";
    return quotaState.usageDate;
  }, [quotaState.today, quotaState.usageDate]);

  const isPlayerUnlimited = quotaState.config.dailyPlayerLimit === 0;
  const isGuildUnlimited = quotaState.config.dailyGuildLimit === 0;
  const playerLimitLabel = isPlayerUnlimited
    ? t("uploadCenter.quota.unlimited")
    : quotaState.config.dailyPlayerLimit;
  const guildLimitLabel = isGuildUnlimited
    ? t("uploadCenter.quota.unlimited")
    : quotaState.config.dailyGuildLimit;
  const playerLimitDisplay = isPlayerUnlimited
    ? t("uploadCenter.quota.unlimited")
    : `${playerLimitLabel} limit today`;
  const guildLimitDisplay = isGuildUnlimited ? t("uploadCenter.quota.unlimited") : `${guildLimitLabel} limit today`;
  const playerRemainingLabel = isPlayerUnlimited
    ? t("uploadCenter.quota.unlimited")
    : quotaState.remainingPlayers;
  const guildRemainingLabel = isGuildUnlimited
    ? t("uploadCenter.quota.unlimited")
    : quotaState.remainingGuilds;

  const handleUploadSelectionToDb = async () => {
    if (!activeSession) return;
    const payload = buildPayloadFromActiveSession();
    if (!payload) return;
    const selectedPlayers = activeSession.players.filter((p) => p.selected);
    const selectedGuilds = activeSession.guilds.filter((g) => g.selected);
    const totalSelected = selectedPlayers.length + selectedGuilds.length;
    if (!totalSelected) return;
    const userId = user?.id ?? null;

    const { config, usedGuildsToday, usedPlayersToday } = quotaState;
    const predictedGuilds = usedGuildsToday + selectedGuilds.length;
    const predictedPlayers = usedPlayersToday + selectedPlayers.length;
    const guildsExceeded = predictedGuilds > config.dailyGuildLimit;
    const playersExceeded = predictedPlayers > config.dailyPlayerLimit;

    if (guildsExceeded || playersExceeded) {
      setQuotaError(
        `Daily quota exceeded: You can import up to ${config.dailyGuildLimit} guilds / ${config.dailyPlayerLimit} players per day. Today you already imported ${usedGuildsToday} guilds / ${usedPlayersToday} players. This selection would bring you to ${predictedGuilds} guilds / ${predictedPlayers} players.`,
      );
      return;
    }

    setQuotaError(null);

    setUploadProgress({
      phase: "uploading",
      processed: 0,
      total: totalSelected,
      created: 0,
      duplicate: 0,
      error: 0,
    });
    const playerProgress = { processed: 0, created: 0, duplicate: 0, error: 0 };
    const guildProgress = { processed: 0, created: 0, duplicate: 0, error: 0 };
    const startNow = getNowMs();
    setActivityStage("scans");
    setIsFinalizing(false);
    setActivityStartedAt(startNow);
    setActivityLastTickAt(startNow);
    setActivityNow(startNow);
    const nowMs = () =>
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const runLocalStage = async <T,>(stage: string, fn: () => Promise<T>): Promise<T> => {
      setActivityStage(stage);
      setActivityLastTickAt(nowMs());
      const started = nowMs();
      try {
        return await fn();
      } finally {
        const ms = Math.round(nowMs() - started);
        setActivityLastTickAt(nowMs());
        console.info(`[upload] stage=${stage} ms=${ms}`);
      }
    };
    const handleImportStage = (event: ImportSelectionStageEvent) => {
      if (event.status === "start") {
        setActivityStage(event.stage);
        setActivityLastTickAt(nowMs());
        return;
      }
      setActivityLastTickAt(nowMs());
      const msPart = typeof event.ms === "number" ? ` ms=${event.ms}` : "";
      console.info(`[upload] stage=${event.stage} done${msPart}`, event.details ?? {});
    };
    const updateTotals = () => {
      const processed = Math.min(playerProgress.processed + guildProgress.processed, totalSelected);
      const phase: UploadPhase = processed >= totalSelected && totalSelected > 0 ? "finalizing" : "uploading";
      setIsFinalizing(phase === "finalizing");
      setUploadProgress({
        phase,
        processed,
        total: totalSelected,
        created: playerProgress.created + guildProgress.created,
        duplicate: playerProgress.duplicate + guildProgress.duplicate,
        error: playerProgress.error + guildProgress.error,
      });
    };
    const handleProgress = (kind: "players" | "guilds") => (p: ImportProgress) => {
      if (p?.pass !== "scans") return;
      setActivityStage(`scans:${kind}`);
      setActivityLastTickAt(nowMs());
      const target = kind === "players" ? playerProgress : guildProgress;
      if (typeof p.current === "number") target.processed = Math.min(p.current, p.total ?? p.current);
      if (typeof p.created === "number") target.created = p.created;
      if (typeof p.duplicate === "number") target.duplicate = p.duplicate;
      if (typeof p.error === "number") target.error = p.error;
      updateTotals();
    };

    try {
      console.log("[UploadCenter] starting selection upload", {
        players: selectedPlayers.length,
        guilds: selectedGuilds.length,
      });
      const result = await importSelectionToDb(payload, {
        onProgress: (p) => {
          if (p?.kind === "players") handleProgress("players")(p);
          else if (p?.kind === "guilds") handleProgress("guilds")(p);
        },
        onStage: handleImportStage,
      });

      const sessionId = activeSession.id;
      let updatedPlayers = false;
      let updatedGuilds = false;
      console.log("[UploadCenter] importSelectionToDb result", {
        playersSample: result?.players?.slice(0, 5),
        guildsSample: result?.guilds?.slice(0, 5),
        selectedPlayerKeys: selectedPlayers.slice(0, 5).map((p) => p.key),
        selectedGuildKeys: selectedGuilds.slice(0, 5).map((g) => g.key),
      });
      (result?.players || []).forEach((item) => {
        updatedPlayers = true;
        setRecordStatus(sessionId, "player", item.key, item.status as UploadRecordStatus);
      });
      (result?.guilds || []).forEach((item) => {
        updatedGuilds = true;
        setRecordStatus(sessionId, "guild", item.key, item.status as UploadRecordStatus);
      });

      if (!updatedPlayers && !updatedGuilds) {
        selectedPlayers.forEach((p) => setRecordStatus(sessionId, "player", p.key, "created"));
        selectedGuilds.forEach((g) => setRecordStatus(sessionId, "guild", g.key, "created"));
      }

      if (selectedPlayers.length || selectedGuilds.length) {
        updateQuotaUsage(selectedGuilds.length, selectedPlayers.length);
        if (!userId) {
          console.warn(
            "[UploadCenter] Cannot persist upload usage because the user ID is missing.",
          );
        } else {
          try {
            await runLocalStage("usage:update", async () =>
              updateUploadCenterUsageForToday(
                userId,
                selectedGuilds.length,
                selectedPlayers.length,
              ),
            );
          } catch (error) {
            console.error("[UploadCenter] Failed to record upload usage.", error);
          }
        }
        await runLocalStage("quota:refresh", refreshQuotaFromRemote);
      }
    } catch (error) {
      console.error("[UploadCenter] Failed to upload selection", error);
    } finally {
      setActivityStage("idle");
      setIsFinalizing(false);
      setActivityStartedAt(null);
      setActivityLastTickAt(null);
      setUploadProgress((prev) => ({ ...prev, phase: "done" }));
    }
  };

  return (
      <div className="flex flex-col gap-4 md:gap-6">
        <section className="rounded-2xl border border-emerald-400/40 bg-emerald-500/5 p-4 md:p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-200/80">
            Local-only until you upload
          </p>
          <h2 className="mt-1 text-lg font-semibold text-emerald-50">
            Review first, then opt-in to store data
          </h2>
          <p className="mt-2 text-sm text-emerald-50/80">
            CSV files are parsed in your browser. Nothing is written to SFDataHub until you pick records and trigger the upload.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/80 p-4 md:p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Upload quota</p>
              <h3 className="text-lg font-semibold text-slate-50">Daily limits & usage</h3>
              <p className="text-sm text-slate-400">
                Values are cached locally in your browser so you can resume uploads across page reloads.
              </p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-slate-200">
              Last upload: {lastUploadLabel}
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/5 p-3">
              <div className="text-xs uppercase tracking-[0.14em] text-emerald-200/80">Players</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-emerald-50">{playerRemainingLabel}</span>
                <span className="text-sm text-emerald-100/80">remaining</span>
              </div>
              <div className="mt-1 text-xs text-emerald-100/70">
                {quotaState.usedPlayersToday} used / {playerLimitDisplay}
              </div>
            </div>
            <div className="rounded-xl border border-sky-400/40 bg-sky-500/5 p-3">
              <div className="text-xs uppercase tracking-[0.14em] text-sky-200/80">Guilds</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-sky-50">{guildRemainingLabel}</span>
                <span className="text-sm text-sky-100/80">remaining</span>
              </div>
              <div className="mt-1 text-xs text-sky-100/70">
                {quotaState.usedGuildsToday} used / {guildLimitDisplay}
              </div>
            </div>
          </div>
          {quotaError && (
            <div className="mt-3 rounded-xl border border-amber-400/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-50">
              {quotaError}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 md:p-5">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Sessions</p>
            <h3 className="text-lg font-semibold text-slate-50">Import Sessions</h3>
            <div className="rounded-xl border border-slate-700/70 bg-slate-800/60 p-3 md:p-4">
              <div className="mb-2 text-sm font-semibold text-slate-100">Import CSV</div>
              <ImportCsv mode="session" onBuildUploadSession={handleBuildSessionFromCsv} />
            </div>
            <p className="text-sm text-slate-400">
              Here you will see your locally imported CSV sessions (filename, date, player/guild counts).
            </p>
            {sessions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700/70 bg-slate-800/60 p-4 text-sm text-slate-300">
                Placeholder - once CSV imports are wired up, recent sessions will appear here with quick actions to resume,
                inspect, or discard them.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {sessions.map((session) => {
                  const isActive = session.id === activeSessionId;
                  return (
                    <div
                      key={session.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setActiveSession(session.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setActiveSession(session.id);
                        }
                      }}
                      className={[
                        "w-full rounded-xl border px-4 py-3 text-left transition",
                        isActive
                          ? "border-emerald-400/80 bg-emerald-500/10 text-emerald-50 shadow-[0_10px_40px_-20px_rgba(16,185,129,0.7)]"
                          : "border-slate-700/70 bg-slate-800/60 text-slate-100 hover:border-emerald-400/60 hover:text-emerald-50",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-semibold">
                            {session.sourceFilename || "Unnamed session"}
                          </span>
                          <span className="text-xs text-slate-400">
                            {formatSessionDate(session.createdAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right text-xs text-slate-400">
                            <div>Players: {session.players.length}</div>
                            <div>Guilds: {session.guilds.length}</div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const confirmed = window.confirm(
                                "Remove this session from the list? This will NOT delete any data from the database.",
                              );
                              if (confirmed) removeSession(session.id);
                            }}
                            className="rounded-full p-1 transition text-red-400 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                            aria-label="Remove session"
                            title="Remove this session from the list"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {isActive && (
                        <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-100">
                          Active
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 space-y-2">
              <h4 className="text-sm font-semibold text-slate-100">Scan uploads from Discord bot</h4>
              {remoteScanError && (
                <div className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-3 text-sm text-amber-100">
                  {remoteScanError}
                </div>
              )}
              {!hasDiscordId ? (
                <div className="rounded-xl border border-dashed border-slate-700/70 bg-slate-800/60 p-4 text-sm text-slate-300">
                  Link your Discord account to see bot uploads here.
                </div>
              ) : scanUploadsLoading ? (
                <div className="rounded-xl border border-slate-700/70 bg-slate-800/60 p-4 text-sm text-slate-300">
                  Loading scan uploads...
                </div>
              ) : scanUploadsError ? (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
                  Error loading scan uploads.
                </div>
              ) : scanUploads.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700/70 bg-slate-800/60 p-4 text-sm text-slate-300">
                  No scan uploads from Discord bot yet.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {scanUploads.map((upload) => {
                    const isLoading = loadingScanId === upload.id;
                    const isLoaded = loadedScanIds.has(upload.id);
                    const disabled = isLoading || isLoaded;
                    return (
                      <button
                        key={upload.id}
                        type="button"
                        onClick={() => {
                          if (disabled) return;
                          loadRemoteScanIntoSession(upload);
                        }}
                        disabled={disabled}
                        title={
                          isLoaded
                            ? "This scan is already loaded above. Remove it there to load it again."
                            : undefined
                        }
                        className={[
                          "w-full rounded-xl border px-4 py-3 text-left text-slate-100 transition",
                          "border-slate-700/70 bg-slate-800/60 hover:border-emerald-400/60 hover:text-emerald-50",
                          disabled ? "cursor-not-allowed opacity-70 bg-slate-700/60 text-slate-400" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-semibold">
                              {upload.queueId || upload.scanId || upload.id}
                            </span>
                            <span className="text-xs text-slate-400">
                              {formatFirestoreTimestamp(upload.uploadedAt)}
                            </span>
                            {upload.discordUsername && (
                              <span className="text-xs text-slate-400">
                                {upload.discordUsername}
                              </span>
                            )}
                          </div>
                          <div className="text-right text-xs text-slate-400">
                            <div>Players CSV: {upload.hasPlayersCsv ? "yes" : "no"}</div>
                            <div>Guilds CSV: {upload.hasGuildsCsv ? "yes" : "no"}</div>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                          {renderScanUploadStatusBadge(upload.status)}
                          {upload.serverCode && (
                            <span className="rounded-full border border-slate-600/70 bg-slate-800/60 px-2 py-0.5">
                              Server: {upload.serverCode}
                            </span>
                          )}
                          {upload.lastError && (
                            <span className="rounded-full border border-rose-500/60 bg-rose-500/10 px-2 py-0.5 text-rose-100">
                              Error: {upload.lastError}
                            </span>
                          )}
                          <span className="rounded-full border border-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 text-emerald-100">
                            {isLoaded ? "Loaded" : isLoading ? "Loading..." : "Load into preview"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 md:p-5">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Review</p>
              <h3 className="text-lg font-semibold text-slate-50">Preview & Selection</h3>
              <p className="text-sm text-slate-400">
                Use these previews to decide what to keep. Tables will support filters, sorting, and selection before committing.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-50 shadow-[0_10px_30px_-12px_rgba(16,185,129,0.8)] transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300 disabled:shadow-none"
                  onClick={handleUploadSelectionToDb}
                  disabled={
                    isUploadBusy ||
                    !activeSession ||
                    !selectionExists
                  }
                >
                  {uploadProgress.phase === "uploading"
                    ? "Uploading..."
                    : uploadProgress.phase === "finalizing"
                      ? "Finalizing..."
                      : "Upload selected to DB"}
                </button>
                {quotaError && (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                    {quotaError}
                  </div>
                )}
                {uploadProgress.total > 0 && (
                  <div className="text-xs text-slate-300">
                    {uploadProgress.phase === "uploading" ? (
                      <>
                        Uploading {uploadProgress.processed} / {uploadProgress.total} records (
                        {Math.round((uploadProgress.processed / Math.max(uploadProgress.total, 1)) * 100)}%) - {uploadProgress.created} created, {uploadProgress.duplicate} duplicates, {uploadProgress.error} errors
                      </>
                    ) : uploadProgress.phase === "finalizing" ? (
                      <>
                        Finalizing import - {uploadProgress.created} created, {uploadProgress.duplicate} duplicates, {uploadProgress.error} errors
                      </>
                    ) : uploadProgress.phase === "done" ? (
                      <>
                        Upload finished: {uploadProgress.created} created, {uploadProgress.duplicate} duplicates, {uploadProgress.error} errors
                      </>
                    ) : null}
                  </div>
                )}
                {isUploadBusy && activityStartedAt != null ? (
                  <div className="rounded-lg border border-slate-700/80 bg-slate-800/60 px-3 py-2 text-xs text-slate-300">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
                      {isFinalizing ? (
                        <span className="inline-flex h-4 w-4 items-center justify-center">
                          <span className="h-3 w-3 rounded-full border-2 border-emerald-300 border-t-transparent animate-spin" />
                        </span>
                      ) : null}
                      <span>Stage: {activityStage}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      Running: {formatElapsed(activityNow - activityStartedAt)}
                      {activityLastTickAt != null
                        ? ` | Last update: ${Math.max(0, Math.floor((activityNow - activityLastTickAt) / 1000))}s ago`
                        : ""}
                    </div>
                  </div>
                ) : null}
                {activeSession ? (
                  <div className="rounded-xl border border-emerald-400/50 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                    {`Active session: ${activeSession.sourceFilename || activeSession.id} - ${activeSession.players.length} players, ${activeSession.guilds.length} guilds`}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-700/70 bg-slate-800/60 px-3 py-2 text-sm text-slate-300">
                    {sessions.length > 0
                      ? "Select a session in the list above to review its players and guilds."
                      : "No active CSV session. Import a CSV via the Upload Center modal to start."}
                  </div>
                )}
              </div>
            </div>
            {activeSession && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-700/70 bg-slate-800/60 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-base font-semibold text-slate-100">Players</h4>
                    <div className="text-xs text-slate-300">
                      Players: {activeSession.players.length} total,{" "}
                      {activeSession.players.filter((p) => p.selected).length} selected
                    </div>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      className="rounded-lg border border-emerald-400/60 bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-100 transition hover:border-emerald-300"
                      onClick={() => selectAllPlayersWithGuilds(activeSession.id, true)}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-600/70 bg-slate-700/60 px-3 py-1 font-semibold text-slate-200 transition hover:border-slate-400"
                      onClick={() => selectAllPlayersWithGuilds(activeSession.id, false)}
                    >
                      Clear selection
                    </button>
                  </div>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-200">
                    <div className="inline-flex items-center gap-1">
                      {(["all", "pending", "inDb", "error"] as StatusFilter[]).map((f) => (
                        <button
                          key={f}
                          type="button"
                          className={[
                            "rounded-full px-3 py-1 border transition",
                            playerStatusFilter === f
                              ? "border-emerald-400/70 text-emerald-100 bg-emerald-500/10"
                              : "border-slate-600/70 text-slate-300 bg-slate-800/60 hover:border-emerald-300/60",
                          ].join(" ")}
                          onClick={() => setPlayerStatusFilter(f)}
                        >
                          {f === "all" ? "All" : f === "pending" ? "Pending" : f === "inDb" ? "In DB" : "Error"}
                        </button>
                      ))}
                    </div>
                    <label className="ml-auto inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={hideUploadedPlayers}
                        onChange={(e) => setHideUploadedPlayers(e.target.checked)}
                      />
                      <span>Hide uploaded</span>
                    </label>
                  </div>
                  {filteredPlayers.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-700/70 bg-slate-900/60 p-3 text-sm text-slate-400">
                      This session does not contain any player records.
                    </div>
                  ) : (
                    <div className="overflow-auto rounded-lg border border-slate-700/70">
                      <table className="min-w-full text-sm text-slate-100">
                        <thead className="bg-slate-900/70 text-xs uppercase tracking-wide text-slate-400">
                          <tr>
                            <th className="px-3 py-2 text-left">Sel.</th>
                            <th className="px-3 py-2 text-left">Name</th>
                            <th className="px-3 py-2 text-left">Server</th>
                            <th className="px-3 py-2 text-left">Level</th>
                            <th className="px-3 py-2 text-left">Class</th>
                            <th className="px-3 py-2 text-left">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPlayers.map((player) => (
                            <tr key={player.key} className="border-t border-slate-800/70">
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={player.selected}
                                  onChange={() =>
                                    updateGuildSelectionFromPlayer(
                                      activeSession.id,
                                      player.key,
                                      !player.selected,
                                    )
                                  }
                                />
                              </td>
                              <td className="px-3 py-2 font-semibold text-slate-50">{player.name || "—"}</td>
                              <td className="px-3 py-2 text-slate-200">{player.server || "—"}</td>
                              <td className="px-3 py-2 text-slate-200">{player.level ?? "—"}</td>
                              <td className="px-3 py-2 text-slate-200">
                                <ClassIcon className={player.className} />
                              </td>
                              <td className="px-3 py-2">{renderStatusBadge(player.status)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-700/70 bg-slate-800/60 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-base font-semibold text-slate-100">Guilds</h4>
                    <div className="text-xs text-slate-300">
                      Guilds: {activeSession.guilds.length} total,{" "}
                      {activeSession.guilds.filter((g) => g.selected).length} selected
                    </div>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      className="rounded-lg border border-emerald-400/60 bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-100 transition hover:border-emerald-300"
                      onClick={() => selectAllGuildsWithPlayers(activeSession.id, true)}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-600/70 bg-slate-700/60 px-3 py-1 font-semibold text-slate-200 transition hover:border-slate-400"
                      onClick={() => selectAllGuildsWithPlayers(activeSession.id, false)}
                    >
                      Clear selection
                    </button>
                  </div>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-200">
                    <div className="inline-flex items-center gap-1">
                      {(["all", "pending", "inDb", "error"] as StatusFilter[]).map((f) => (
                        <button
                          key={f}
                          type="button"
                          className={[
                            "rounded-full px-3 py-1 border transition",
                            guildStatusFilter === f
                              ? "border-emerald-400/70 text-emerald-100 bg-emerald-500/10"
                              : "border-slate-600/70 text-slate-300 bg-slate-800/60 hover:border-emerald-300/60",
                          ].join(" ")}
                          onClick={() => setGuildStatusFilter(f)}
                        >
                          {f === "all" ? "All" : f === "pending" ? "Pending" : f === "inDb" ? "In DB" : "Error"}
                        </button>
                      ))}
                    </div>
                    <label className="ml-auto inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={hideUploadedGuilds}
                        onChange={(e) => setHideUploadedGuilds(e.target.checked)}
                      />
                      <span>Hide uploaded</span>
                    </label>
                  </div>
                  {filteredGuilds.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-700/70 bg-slate-900/60 p-3 text-sm text-slate-400">
                      This session does not contain any guild records.
                    </div>
                  ) : (
                    <div className="overflow-auto rounded-lg border border-slate-700/70">
                      <table className="min-w-full text-sm text-slate-100">
                        <thead className="bg-slate-900/70 text-xs uppercase tracking-wide text-slate-400">
                          <tr>
                            <th className="px-3 py-2 text-left">Expand</th>
                            <th className="px-3 py-2 text-left">Sel.</th>
                            <th className="px-3 py-2 text-left">Guild</th>
                            <th className="px-3 py-2 text-left">Server</th>
                            <th className="px-3 py-2 text-left">Members</th>
                            <th className="px-3 py-2 text-left">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredGuilds.map((guild) => {
                            const expanded = expandedGuildKeys.has(guild.key);
                            const memberCount = guild.memberCount ?? guild.members.length;
                            return (
                              <React.Fragment key={guild.key}>
                                <tr className="border-t border-slate-800/70">
                                  <td className="px-3 py-2">
                                    <button
                                      type="button"
                                      className="rounded border border-slate-600/70 bg-slate-800/60 px-2 py-1 text-xs text-slate-200"
                                      onClick={() => toggleGuildExpanded(guild.key)}
                                      aria-expanded={expanded}
                                    >
                                      {expanded ? "Collapse" : "Expand"}
                                    </button>
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      type="checkbox"
                                      checked={guild.selected}
                                      onChange={() =>
                                        selectGuildWithPlayers(
                                          activeSession.id,
                                          guild.key,
                                          !guild.selected,
                                        )
                                      }
                                    />
                                  </td>
                                  <td className="px-3 py-2 font-semibold text-slate-50">{guild.name || "—"}</td>
                                  <td className="px-3 py-2 text-slate-200">{guild.server || "—"}</td>
                                  <td className="px-3 py-2 text-slate-200">{memberCount}</td>
                                  <td className="px-3 py-2">{renderStatusBadge(guild.status)}</td>
                                </tr>
                                {expanded && (
                                  <tr className="border-t border-slate-800/70 bg-slate-900/60">
                                    <td className="px-3 py-3 text-slate-200" colSpan={6}>
                                      <div className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-400">Members</div>
                                      {guild.members.length === 0 ? (
                                        <div className="text-sm text-slate-300">No members listed.</div>
                                      ) : (
                                        <table className="w-full text-sm text-slate-100">
                                          <thead className="bg-slate-900/50 text-xs uppercase tracking-wide text-slate-400">
                                            <tr>
                                              <th className="px-2 py-1 text-left">Name</th>
                                              <th className="px-2 py-1 text-left">Level</th>
                                              <th className="px-2 py-1 text-left">Class</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {guild.members.map((member) => (
                                              <tr key={member.key} className="border-t border-slate-800/70">
                                                <td className="px-2 py-1">{member.name || "—"}</td>
                                                <td className="px-2 py-1">{member.level ?? "—"}</td>
                                                <td className="px-2 py-1">{member.className ?? "—"}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
  );
}
