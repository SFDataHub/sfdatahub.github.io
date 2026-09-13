import React from "react";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import { useNotifications } from "./NotificationsContext";
import {
  commitSfDataHubLocalScanPreview,
  createSfDataHubLocalScanImportPreview,
  deriveGuildHubLogicalScanSnapshots,
  getSfDataHubLocalScan,
  mergeSfDataHubLocalScanSources,
  recoverSfDataHubScanSlotMerge,
  type GuildHubScanMergeMode,
} from "../lib/guilds/localScanLibrary";

export type DataJobType = "sftools-import" | "scan-merge";
export type DataJobStatus = "running" | "completed" | "failed" | "interrupted";

export type DataJobProgress = {
  current: number;
  total: number;
};

export type DataJobMetadata = {
  fileName?: string;
  fileSize?: number;
  mergeMode?: GuildHubScanMergeMode;
  displayName?: string;
  detectedSnapshots?: number;
  processedSnapshots?: number;
  detectedMembers?: number;
  processedMembers?: number;
  sourceScanIds?: string[];
  sourceCount?: number;
  targetSourceScanId?: string;
};

export type DataJob = {
  id: string;
  type: DataJobType;
  status: DataJobStatus;
  title: string;
  startedAt: number;
  completedAt?: number;
  updatedAt: number;
  phase: string;
  progress?: DataJobProgress;
  message?: string;
  metadata?: DataJobMetadata;
  error?: string;
};

type DataJobsContextValue = {
  jobs: DataJob[];
  isReady: boolean;
  runningSfToolsImportJob: DataJob | null;
  runningScanMergeJob: DataJob | null;
  startSfToolsImportJob: (file: File) => Promise<DataJob>;
  startScanMergeJob: (input: {
    sourceScanIds: string[];
    filename: string;
    mode?: GuildHubScanMergeMode;
    displayName?: string;
  }) => Promise<DataJob>;
};

interface DataJobsDb extends DBSchema {
  jobs: {
    key: string;
    value: DataJob;
    indexes: {
      by_type: DataJobType;
      by_status: DataJobStatus;
      by_startedAt: number;
    };
  };
}

const DATA_JOBS_DB_NAME = "sfdatahub-data-jobs";
const DATA_JOBS_DB_VERSION = 1;
const DATA_JOBS_STORE = "jobs";
const INTERRUPTED_MESSAGE =
  "Der Import konnte nicht vollständig verarbeitet werden, weil die vorherige Sitzung beendet wurde. Bitte importiere die Datei erneut.";

const DataJobsContext = React.createContext<DataJobsContextValue | undefined>(undefined);

let dataJobsDbPromise: Promise<IDBPDatabase<DataJobsDb>> | null = null;

function getDataJobsDb() {
  if (!dataJobsDbPromise) {
    dataJobsDbPromise = openDB<DataJobsDb>(DATA_JOBS_DB_NAME, DATA_JOBS_DB_VERSION, {
      upgrade(db) {
        const jobs = db.createObjectStore(DATA_JOBS_STORE, { keyPath: "id" });
        jobs.createIndex("by_type", "type");
        jobs.createIndex("by_status", "status");
        jobs.createIndex("by_startedAt", "startedAt");
      },
    });
  }

  return dataJobsDbPromise;
}

function createDataJobId(type: DataJobType) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `data-job:${type}:${Date.now().toString(36)}:${random}`;
}

function createTargetSourceScanId(type: DataJobType) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `guild-hub-scan:${type}:${Date.now().toString(36)}:${random}`;
}

function sortJobs(jobs: DataJob[]) {
  return [...jobs].sort((left, right) => right.startedAt - left.startedAt || right.id.localeCompare(left.id));
}

function upsertJobInList(jobs: DataJob[], job: DataJob) {
  const index = jobs.findIndex((entry) => entry.id === job.id);
  if (index < 0) return sortJobs([job, ...jobs]);
  const next = jobs.slice();
  next[index] = job;
  return sortJobs(next);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function normalizeScanJsonFilename(filename: string) {
  const trimmed = filename.trim();
  if (!trimmed) throw new Error("Dateiname darf nicht leer sein.");
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(trimmed)) {
    throw new Error("Dateiname enthält ungültige Zeichen.");
  }
  return trimmed.toLowerCase().endsWith(".json") ? trimmed : `${trimmed}.json`;
}

export function getDataJobDetail(job: DataJob) {
  if (job.message) return job.message;
  const metadata = job.metadata;
  if (metadata?.detectedMembers && metadata.detectedMembers > 0) {
    const processed = metadata.processedMembers ?? 0;
    return `${job.phase} - ${processed}/${metadata.detectedMembers} Spieler`;
  }
  if (metadata?.detectedSnapshots && metadata.detectedSnapshots > 0) {
    const processed = metadata.processedSnapshots ?? 0;
    return `${job.phase} - ${processed}/${metadata.detectedSnapshots} Scans`;
  }
  return job.phase;
}

function getCompletedActivityTitle(job: DataJob) {
  if (job.type !== "scan-merge") return "SFtools-Import abgeschlossen";
  return job.metadata?.mergeMode === "scan-slot" ? "Scan-Slot erstellt" : "Scan-Bundle erstellt";
}

function getFailedActivityTitle(job: DataJob) {
  return job.type === "scan-merge" ? "Scan-Zusammenführung fehlgeschlagen" : "SFtools-Import fehlgeschlagen";
}

function getInterruptedActivityTitle(job: DataJob) {
  return job.type === "scan-merge" ? "Scan-Zusammenführung unterbrochen" : "SFtools-Import unterbrochen";
}

export function getDataJobProgress(job: DataJob): DataJobProgress | undefined {
  return job.progress?.total && job.progress.total > 0 ? job.progress : undefined;
}

export const DataJobsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { upsertJob, removeJob, pushActivityEvent } = useNotifications();
  const [jobs, setJobs] = React.useState<DataJob[]>([]);
  const [isReady, setIsReady] = React.useState(false);
  const jobsRef = React.useRef<DataJob[]>([]);

  React.useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const syncRunningNotification = React.useCallback(
    (job: DataJob) => {
      upsertJob({
        id: job.id,
        title: job.title,
        status: "running",
        detail: getDataJobDetail(job),
        progress: getDataJobProgress(job),
      });
    },
    [upsertJob],
  );

  const persistAndStoreJob = React.useCallback(
    async (job: DataJob) => {
      const db = await getDataJobsDb();
      await db.put(DATA_JOBS_STORE, job);
      setJobs((current) => {
        const next = upsertJobInList(current, job);
        jobsRef.current = next;
        return next;
      });
      if (job.status === "running") {
        syncRunningNotification(job);
      } else {
        removeJob(job.id);
      }
    },
    [removeJob, syncRunningNotification],
  );

  const updateRunningJob = React.useCallback(
    async (jobId: string, patch: Partial<DataJob>) => {
      const current = jobsRef.current.find((job) => job.id === jobId);
      if (!current || current.status !== "running") return current ?? null;
      const next: DataJob = {
        ...current,
        ...patch,
        metadata: patch.metadata ? { ...(current.metadata ?? {}), ...patch.metadata } : current.metadata,
        updatedAt: Date.now(),
      };
      await persistAndStoreJob(next);
      return next;
    },
    [persistAndStoreJob],
  );

  const finishJob = React.useCallback(
    async (jobId: string, status: Exclude<DataJobStatus, "running">, patch: Partial<DataJob>) => {
      const current = jobsRef.current.find((job) => job.id === jobId);
      if (!current) return null;
      const completedAt = Date.now();
      const next: DataJob = {
        ...current,
        ...patch,
        status,
        completedAt,
        updatedAt: completedAt,
      };
      await persistAndStoreJob(next);

      if (status === "completed") {
        pushActivityEvent({
          kind: "data_job_completed",
          title: getCompletedActivityTitle(next),
          message: getDataJobDetail(next),
          createdAtMs: completedAt,
        });
      } else if (status === "failed") {
        pushActivityEvent({
          kind: "data_job_failed",
          title: getFailedActivityTitle(next),
          message: getDataJobDetail(next),
          createdAtMs: completedAt,
        });
      } else {
        pushActivityEvent({
          kind: "data_job_interrupted",
          title: getInterruptedActivityTitle(next),
          message: getDataJobDetail(next),
          createdAtMs: completedAt,
        });
      }

      return next;
    },
    [persistAndStoreJob, pushActivityEvent],
  );

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const db = await getDataJobsDb();
      const rows = await db.getAll(DATA_JOBS_STORE);
      const now = Date.now();
      const recoveredRows = await Promise.all(
        rows.map(async (job) => {
          if (job.status !== "running") return job;
          if (job.type === "scan-merge" && job.metadata?.targetSourceScanId) {
            if (job.metadata.mergeMode === "scan-slot") {
              const recovery = await recoverSfDataHubScanSlotMerge(
                job.metadata.targetSourceScanId,
                job.metadata.sourceScanIds ?? [],
              );
              if (recovery.status === "completed" && recovery.scan) {
                const completed: DataJob = {
                  ...job,
                  status: "completed",
                  completedAt: now,
                  updatedAt: now,
                  title: "Scan-Slot erstellt",
                  phase: "Fertig",
                  progress: undefined,
                  message: `${recovery.scan.displayName ?? recovery.scan.filename} wurde erstellt.`,
                };
                await db.put(DATA_JOBS_STORE, completed);
                return completed;
              }

              const interrupted: DataJob = {
                ...job,
                status: "interrupted",
                completedAt: now,
                updatedAt: now,
                phase: "Unterbrochen",
                progress: undefined,
                message: "Der Scan-Slot konnte nicht vollständig erstellt werden. Die Quelldateien bleiben aktiv.",
                error: INTERRUPTED_MESSAGE,
              };
              await db.put(DATA_JOBS_STORE, interrupted);
              return interrupted;
            }

            const target = await getSfDataHubLocalScan(job.metadata.targetSourceScanId);
            if (target?.isMergedBundle) {
              const completed: DataJob = {
                ...job,
                status: "completed",
                completedAt: now,
                updatedAt: now,
                title: "Scan-Bundle erstellt",
                phase: "Fertig",
                progress: undefined,
                message: `${target.filename} wurde erstellt. Die Quelldateien wurden beibehalten.`,
              };
              await db.put(DATA_JOBS_STORE, completed);
              return completed;
            }
          }
          if (job.type === "sftools-import" && job.metadata?.targetSourceScanId) {
            const target = await getSfDataHubLocalScan(job.metadata.targetSourceScanId);
            if (target) {
              const completed: DataJob = {
                ...job,
                status: "completed",
                completedAt: now,
                updatedAt: now,
                title: "SFtools-Import abgeschlossen",
                phase: "Fertig",
                progress: undefined,
                message: `${target.filename} wurde importiert.`,
              };
              await db.put(DATA_JOBS_STORE, completed);
              return completed;
            }
          }
          const interrupted: DataJob = {
            ...job,
            status: "interrupted",
            completedAt: now,
            updatedAt: now,
            phase: "Unterbrochen",
            progress: undefined,
            message:
              job.type === "scan-merge"
                ? "Das Bundle konnte nicht vollständig erstellt werden. Die Quelldateien wurden nicht verändert."
                : `${job.metadata?.fileName ?? job.title} konnte nicht vollständig verarbeitet werden. Bitte importiere die Datei erneut.`,
            error: INTERRUPTED_MESSAGE,
          };
          await db.put(DATA_JOBS_STORE, interrupted);
          return interrupted;
        }),
      );
      if (cancelled) return;
      const nextJobs = sortJobs(recoveredRows);
      jobsRef.current = nextJobs;
      setJobs(nextJobs);
      setIsReady(true);
      for (const job of nextJobs) {
        if ((job.status !== "interrupted" && job.status !== "completed") || job.completedAt !== now) continue;
        removeJob(job.id);
        pushActivityEvent({
          kind: job.status === "completed" ? "data_job_completed" : "data_job_interrupted",
          title: job.status === "completed" ? getCompletedActivityTitle(job) : getInterruptedActivityTitle(job),
          message: getDataJobDetail(job),
          createdAtMs: now,
        });
      }
    })().catch((error) => {
      console.warn("[DataJobs] Failed to initialize data jobs", error);
      if (!cancelled) setIsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [pushActivityEvent, removeJob]);

  const runSfToolsImportJob = React.useCallback(
    async (jobId: string, file: File) => {
      let progressQueue = Promise.resolve();
      const queueProgressUpdate = (patch: Partial<DataJob>) => {
        progressQueue = progressQueue
          .then(() => updateRunningJob(jobId, patch))
          .then(() => undefined)
          .catch((error) => {
            console.warn("[DataJobs] Failed to persist import progress", error);
          });
      };

      try {
        await updateRunningJob(jobId, {
          phase: "Datei lesen",
          message: "Datei wird gelesen.",
          progress: undefined,
        });
        const content = await file.text();

        await updateRunningJob(jobId, {
          phase: "JSON analysieren",
          message: "SFtools-Struktur wird geprüft.",
        });
        const scan = await createSfDataHubLocalScanImportPreview(file.name, content);

        await updateRunningJob(jobId, {
          phase: "Snapshots erkennen",
          message: "Zeitpunkte werden aus der Datei ermittelt.",
          metadata: {
            targetSourceScanId: scan.id,
          },
        });
        const snapshots = deriveGuildHubLogicalScanSnapshots(scan);
        const detectedMembers = snapshots.reduce((sum, snapshot) => sum + snapshot.normalizedMembers.length, 0);
        const detectedSnapshots = snapshots.length;
        await updateRunningJob(jobId, {
          phase: "Snapshots / Member verarbeiten",
          progress:
            detectedMembers > 0
              ? { current: 0, total: detectedMembers }
              : detectedSnapshots > 0
                ? { current: 0, total: detectedSnapshots }
                : undefined,
          message: detectedSnapshots
            ? `${detectedSnapshots} Scans und ${detectedMembers} Spieler erkannt.`
            : "Keine auswertbaren Snapshots erkannt.",
          metadata: {
            detectedSnapshots,
            processedSnapshots: 0,
            detectedMembers,
            processedMembers: 0,
          },
        });

        const result = await commitSfDataHubLocalScanPreview(scan, {
          analytics: {
            onProgress: (progress) => {
              queueProgressUpdate({
                phase: "Analytics-Daten aktualisieren",
                message:
                  progress.totalMembers > 0
                    ? `${progress.processedMembers}/${progress.totalMembers} Spieler verarbeitet.`
                    : `${progress.processedSnapshots}/${progress.totalSnapshots} Scans verarbeitet.`,
                progress:
                  progress.totalMembers > 0
                    ? { current: progress.processedMembers, total: progress.totalMembers }
                    : progress.totalSnapshots > 0
                      ? { current: progress.processedSnapshots, total: progress.totalSnapshots }
                      : undefined,
                metadata: {
                  detectedSnapshots: progress.totalSnapshots,
                  processedSnapshots: progress.processedSnapshots,
                  detectedMembers: progress.totalMembers,
                  processedMembers: progress.processedMembers,
                },
              });
            },
          },
          onBeforeRawCommit: async () => {
            await updateRunningJob(jobId, {
              phase: "Raw-Daten speichern",
              message: "Raw-Container wird gespeichert.",
              progress: undefined,
            });
          },
        });

        await progressQueue;
        await finishJob(jobId, "completed", {
          title: "SFtools-Import abgeschlossen",
          phase: "Fertig",
          progress: result.status === "imported" ? { current: 1, total: 1 } : undefined,
          message:
            result.status === "duplicate"
              ? `${result.scan.filename} ist bereits vorhanden.`
              : `${result.scan.filename} wurde importiert.`,
          metadata: {
            processedSnapshots: detectedSnapshots,
            processedMembers: detectedMembers,
          },
        });
      } catch (error) {
        await progressQueue;
        const message = getErrorMessage(error, "SFtools-Datei konnte nicht importiert werden.");
        await finishJob(jobId, "failed", {
          title: "SFtools-Import fehlgeschlagen",
          phase: "Fehlgeschlagen",
          progress: undefined,
          message,
          error: message,
        });
      }
    },
    [finishJob, updateRunningJob],
  );

  const runScanMergeJob = React.useCallback(
    async (
      jobId: string,
      sourceScanIds: string[],
      filename: string,
      mode: GuildHubScanMergeMode = "merged-file",
      displayName?: string,
    ) => {
      let progressQueue = Promise.resolve();
      const queueProgressUpdate = (patch: Partial<DataJob>) => {
        progressQueue = progressQueue
          .then(() => updateRunningJob(jobId, patch))
          .then(() => undefined)
          .catch((error) => {
            console.warn("[DataJobs] Failed to persist merge progress", error);
          });
      };

      try {
        await updateRunningJob(jobId, {
          phase: "Quelldateien werden geladen",
          message:
            mode === "scan-slot"
              ? `${sourceScanIds.length} Quellen werden für den Scan-Slot vorbereitet.`
              : `${sourceScanIds.length} Quellen werden vorbereitet.`,
          progress: { current: 0, total: sourceScanIds.length },
        });

        const current = jobsRef.current.find((job) => job.id === jobId);
        const targetSourceScanId = current?.metadata?.targetSourceScanId ?? createTargetSourceScanId("scan-merge");
        if (!current?.metadata?.targetSourceScanId) {
          await updateRunningJob(jobId, {
            metadata: { targetSourceScanId },
          });
        }

        const bundle = await mergeSfDataHubLocalScanSources(sourceScanIds, filename, {
          targetScanId: targetSourceScanId,
          mode,
          displayName,
          onProgress: (progress) => {
            queueProgressUpdate({
              phase: progress.phase,
              message:
                progress.totalMembers > 0
                  ? `${progress.processedMembers}/${progress.totalMembers} Spieler verarbeitet.`
                  : `${progress.processedSnapshots}/${progress.totalSnapshots} Scans verarbeitet.`,
              progress:
                progress.totalMembers > 0
                  ? { current: progress.processedMembers, total: progress.totalMembers }
                  : progress.totalSnapshots > 0
                    ? { current: progress.processedSnapshots, total: progress.totalSnapshots }
                    : undefined,
              metadata: {
                detectedSnapshots: progress.totalSnapshots,
                processedSnapshots: progress.processedSnapshots,
                detectedMembers: progress.totalMembers,
                processedMembers: progress.processedMembers,
              },
            });
          },
        });
        const bundleSnapshots = deriveGuildHubLogicalScanSnapshots(bundle);

        await progressQueue;
        await finishJob(jobId, "completed", {
          title: mode === "scan-slot" ? "Scan-Slot erstellt" : "Scan-Bundle erstellt",
          phase: "Fertig",
          progress: { current: 1, total: 1 },
          message:
            mode === "scan-slot"
              ? `${bundle.displayName ?? bundle.filename}: ${bundleSnapshots.length} Scans gebündelt.`
              : `${bundle.filename}: ${bundleSnapshots.length} Scans zusammengeführt. Die Quelldateien wurden beibehalten.`,
          metadata: {
            detectedSnapshots: bundleSnapshots.length,
            processedSnapshots: bundleSnapshots.length,
            detectedMembers: bundle.playerCount,
            processedMembers: bundle.playerCount,
            targetSourceScanId: bundle.id,
            mergeMode: mode,
            ...(displayName ? { displayName } : {}),
          },
        });
      } catch (error) {
        await progressQueue;
        const message = getErrorMessage(error, "Scan-Zusammenführung konnte nicht abgeschlossen werden.");
        await finishJob(jobId, "failed", {
          title: "Scan-Zusammenführung fehlgeschlagen",
          phase: "Fehlgeschlagen",
          progress: undefined,
          message,
          error: message,
        });
      }
    },
    [finishJob, updateRunningJob],
  );

  const startSfToolsImportJob = React.useCallback(
    async (file: File) => {
      if (!isReady) {
        throw new Error("Data-Job-System wird noch initialisiert.");
      }
      const existing = jobsRef.current.find((job) => job.type === "sftools-import" && job.status === "running");
      if (existing) {
        throw new Error("Es läuft bereits ein SFtools-Import.");
      }

      const now = Date.now();
      const job: DataJob = {
        id: createDataJobId("sftools-import"),
        type: "sftools-import",
        status: "running",
        title: "SFtools-Import",
        startedAt: now,
        updatedAt: now,
        phase: "Wartet",
        message: `${file.name} wird vorbereitet.`,
        metadata: {
          fileName: file.name,
          fileSize: file.size,
        },
      };
      await persistAndStoreJob(job);
      void runSfToolsImportJob(job.id, file);
      return job;
    },
    [isReady, persistAndStoreJob, runSfToolsImportJob],
  );

  const startScanMergeJob = React.useCallback(
    async (input: {
      sourceScanIds: string[];
      filename: string;
      mode?: GuildHubScanMergeMode;
      displayName?: string;
    }) => {
      if (!isReady) {
        throw new Error("Data-Job-System wird noch initialisiert.");
      }
      const sourceScanIds = [...new Set(input.sourceScanIds.map((id) => id.trim()).filter(Boolean))];
      if (sourceScanIds.length < 2) {
        throw new Error("Für eine Zusammenführung müssen mindestens zwei Scans ausgewählt sein.");
      }
      const existing = jobsRef.current.find((job) => job.type === "scan-merge" && job.status === "running");
      if (existing) {
        throw new Error("Es läuft bereits eine Scan-Zusammenführung.");
      }
      const mode = input.mode ?? "merged-file";
      const displayName = input.displayName?.trim().replace(/\s+/g, " ");
      if (mode === "scan-slot" && !displayName) {
        throw new Error("Scan-Slot-Name darf nicht leer sein.");
      }
      const filename = normalizeScanJsonFilename(input.filename);
      const targetSourceScanId = createTargetSourceScanId("scan-merge");
      const now = Date.now();
      const job: DataJob = {
        id: createDataJobId("scan-merge"),
        type: "scan-merge",
        status: "running",
        title: mode === "scan-slot" ? "Scan-Slot wird erstellt" : "Scans werden zusammengeführt",
        startedAt: now,
        updatedAt: now,
        phase: "Wartet",
        message:
          mode === "scan-slot"
            ? `${sourceScanIds.length} Quellen werden als ${displayName} gebündelt.`
            : `${sourceScanIds.length} Quellen werden zu ${filename} zusammengeführt.`,
        metadata: {
          fileName: filename,
          mergeMode: mode,
          ...(displayName ? { displayName } : {}),
          sourceScanIds,
          sourceCount: sourceScanIds.length,
          targetSourceScanId,
        },
      };
      await persistAndStoreJob(job);
      void runScanMergeJob(job.id, sourceScanIds, filename, mode, displayName);
      return job;
    },
    [isReady, persistAndStoreJob, runScanMergeJob],
  );

  const runningSfToolsImportJob = React.useMemo(
    () => jobs.find((job) => job.type === "sftools-import" && job.status === "running") ?? null,
    [jobs],
  );
  const runningScanMergeJob = React.useMemo(
    () => jobs.find((job) => job.type === "scan-merge" && job.status === "running") ?? null,
    [jobs],
  );

  const value = React.useMemo<DataJobsContextValue>(
    () => ({
      jobs,
      isReady,
      runningSfToolsImportJob,
      runningScanMergeJob,
      startSfToolsImportJob,
      startScanMergeJob,
    }),
    [jobs, isReady, runningSfToolsImportJob, runningScanMergeJob, startSfToolsImportJob, startScanMergeJob],
  );

  return <DataJobsContext.Provider value={value}>{children}</DataJobsContext.Provider>;
};

export function useDataJobs(): DataJobsContextValue {
  const context = React.useContext(DataJobsContext);
  if (!context) {
    throw new Error("useDataJobs must be used within DataJobsProvider");
  }
  return context;
}
