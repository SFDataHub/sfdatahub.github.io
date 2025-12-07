import React, { useCallback, useMemo, useState } from "react";
import ContentShell from "../ContentShell";
import ImportCsv from "../ImportCsv/ImportCsv";
import type { UploadRecordKey, UploadRecordStatus } from "./uploadCenterTypes";
import type { UploadSessionId } from "./uploadCenterTypes";
import { buildUploadSessionFromCsv, type CsvParsedResult } from "./uploadCenterCsvMapping";
import { useUploadCenterSessions } from "./UploadCenterSessionsContext";
import { importSelectionToDb, type ImportSelectionPayload } from "../ImportCsv/importCsvToDb";

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
    toggleRecordSelection,
    selectAllInSession,
    setRecordStatus,
  } = useUploadCenterSessions();
  const activeSession = sessions.find((session) => session.id === activeSessionId) || null;
  const [expandedGuildKeys, setExpandedGuildKeys] = React.useState<Set<UploadRecordKey>>(new Set());
  type UploadPhase = "idle" | "uploading" | "finalizing" | "done";
  const [uploadProgress, setUploadProgress] = useState({
    phase: "idle" as UploadPhase,
    processed: 0,
    total: 0,
    created: 0,
    duplicate: 0,
    error: 0,
  });

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

  const selectionExists = useMemo(() => {
    if (!activeSession) return false;
    const hasPlayers = activeSession.players.some((p) => p.selected);
    const hasGuilds = activeSession.guilds.some((g) => g.selected);
    return hasPlayers || hasGuilds;
  }, [activeSession]);
  const isUploadBusy =
    uploadProgress.phase === "uploading" || uploadProgress.phase === "finalizing";

  const buildPayloadFromActiveSession = (): ImportSelectionPayload | null => {
    if (!activeSession) return null;
    const selectedPlayers = activeSession.players.filter((p) => p.selected);
    const selectedGuilds = activeSession.guilds.filter((g) => g.selected);
    if (!selectedPlayers.length && !selectedGuilds.length) return null;

    const playersRows = selectedPlayers.map((p) => ({
      Identifier: p.playerId,
      "Guild Identifier": p.guildId ?? "",
      Timestamp: p.scanTimestampSec,
      Server: p.server,
      Name: p.name,
      Class: p.className ?? "",
      Level: p.level ?? "",
    }));

    const guildsRows = selectedGuilds.map((g) => ({
      "Guild Identifier": g.guildId,
      "Guild Member Count": g.memberCount ?? g.members.length,
      Timestamp: g.scanTimestampSec,
      Name: g.name,
      Server: g.server,
    }));

    return { playersRows, guildsRows };
  };

  const handleUploadSelectionToDb = async () => {
    if (!activeSession) return;
    const payload = buildPayloadFromActiveSession();
    if (!payload) return;
    const selectedPlayers = activeSession.players.filter((p) => p.selected);
    const selectedGuilds = activeSession.guilds.filter((g) => g.selected);
    const totalSelected = selectedPlayers.length + selectedGuilds.length;
    if (!totalSelected) return;

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
    const updateTotals = () => {
      const processed = Math.min(playerProgress.processed + guildProgress.processed, totalSelected);
      const phase: UploadPhase = processed >= totalSelected && totalSelected > 0 ? "finalizing" : "uploading";
      setUploadProgress({
        phase,
        processed,
        total: totalSelected,
        created: playerProgress.created + guildProgress.created,
        duplicate: playerProgress.duplicate + guildProgress.duplicate,
        error: playerProgress.error + guildProgress.error,
      });
    };
    const handleProgress = (kind: "players" | "guilds") => (p: any) => {
      if (p?.pass !== "scans") return;
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
    } catch (error) {
      console.error("[UploadCenter] Failed to upload selection", error);
    } finally {
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
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => setActiveSession(session.id)}
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
                        <div className="text-right text-xs text-slate-400">
                          <div>Players: {session.players.length}</div>
                          <div>Guilds: {session.guilds.length}</div>
                        </div>
                      </div>
                      {isActive && (
                        <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-100">
                          Active
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
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
                    ? "Uploading…"
                    : uploadProgress.phase === "finalizing"
                      ? "Finalizing…"
                      : "Upload selected to DB"}
                </button>
                {uploadProgress.total > 0 && (
                  <div className="text-xs text-slate-300">
                    {uploadProgress.phase === "uploading" ? (
                      <>
                        Uploading {uploadProgress.processed} / {uploadProgress.total} records (
                        {Math.round((uploadProgress.processed / Math.max(uploadProgress.total, 1)) * 100)}%) –{" "}
                        {uploadProgress.created} created, {uploadProgress.duplicate} duplicates, {uploadProgress.error} errors
                      </>
                    ) : uploadProgress.phase === "finalizing" ? (
                      <>
                        Finalizing import – {uploadProgress.created} created, {uploadProgress.duplicate} duplicates, {uploadProgress.error} errors
                      </>
                    ) : uploadProgress.phase === "done" ? (
                      <>
                        Upload finished: {uploadProgress.created} created, {uploadProgress.duplicate} duplicates, {uploadProgress.error} errors
                      </>
                    ) : null}
                  </div>
                )}
                {activeSession ? (
                  <div className="rounded-xl border border-emerald-400/50 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                    Active session: {activeSession.sourceFilename || activeSession.id} ·{" "}
                    {activeSession.players.length} players · {activeSession.guilds.length} guilds
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
                      onClick={() => selectAllInSession(activeSession.id, "player", true)}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-600/70 bg-slate-700/60 px-3 py-1 font-semibold text-slate-200 transition hover:border-slate-400"
                      onClick={() => selectAllInSession(activeSession.id, "player", false)}
                    >
                      Clear selection
                    </button>
                  </div>
                  {activeSession.players.length === 0 ? (
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
                          {activeSession.players.map((player) => (
                            <tr key={player.key} className="border-t border-slate-800/70">
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={player.selected}
                                  onChange={() =>
                                    toggleRecordSelection(
                                      activeSession.id,
                                      "player",
                                      player.key,
                                      !player.selected,
                                    )
                                  }
                                />
                              </td>
                              <td className="px-3 py-2 font-semibold text-slate-50">{player.name || "—"}</td>
                              <td className="px-3 py-2 text-slate-200">{player.server || "—"}</td>
                              <td className="px-3 py-2 text-slate-200">{player.level ?? "—"}</td>
                              <td className="px-3 py-2 text-slate-200">{player.className ?? "—"}</td>
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
                      onClick={() => selectAllInSession(activeSession.id, "guild", true)}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-600/70 bg-slate-700/60 px-3 py-1 font-semibold text-slate-200 transition hover:border-slate-400"
                      onClick={() => selectAllInSession(activeSession.id, "guild", false)}
                    >
                      Clear selection
                    </button>
                  </div>
                  {activeSession.guilds.length === 0 ? (
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
                          {activeSession.guilds.map((guild) => {
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
                                      {expanded ? "▾" : "▸"}
                                    </button>
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      type="checkbox"
                                      checked={guild.selected}
                                      onChange={() =>
                                        toggleRecordSelection(
                                          activeSession.id,
                                          "guild",
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
