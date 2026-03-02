import React from "react";

export type NotificationJobStatus = "running" | "success" | "error";
export type ActivityEventKind = "favorite_added" | "favorite_removed";

export type NotificationJob = {
  id: string;
  title: string;
  status: NotificationJobStatus;
  detail?: string;
  progress?: { current: number; total: number };
  updatedAt: number;
};

export type ActivityEvent = {
  id: string;
  kind: ActivityEventKind;
  title: string;
  message: string;
  createdAtMs: number;
  expiresAtMs: number;
  unread: boolean;
};

type UpsertNotificationJob = Omit<NotificationJob, "updatedAt"> & {
  updatedAt?: number;
};

type PushActivityEventInput = {
  kind: ActivityEventKind;
  title: string;
  message: string;
  createdAtMs?: number;
};

type NotificationsContextValue = {
  jobs: NotificationJob[];
  activityEvents: ActivityEvent[];
  hasUnread: boolean;
  hasRunning: boolean;
  upsertJob: (job: UpsertNotificationJob) => void;
  pushActivityEvent: (event: PushActivityEventInput) => void;
  removeJob: (id: string) => void;
  markActivityRead: () => void;
  cleanupExpired: () => void;
  markAllRead: () => void;
};

const NotificationsContext = React.createContext<NotificationsContextValue | undefined>(undefined);

const ACTIVITY_EVENTS_STORAGE_KEY = "sfdatahub.notifications.activity.v1";
const ACTIVITY_EVENT_TTL_MS = 15 * 60 * 1000;
const ACTIVITY_EVENT_MAX_COUNT = 10;
const ACTIVITY_EVENT_DEDUPE_WINDOW_MS = 2000;

const isValidActivityEventKind = (value: unknown): value is ActivityEventKind =>
  value === "favorite_added" || value === "favorite_removed";

const normalizeActivityEvents = (value: unknown, nowMs: number): ActivityEvent[] => {
  if (!Array.isArray(value)) return [];
  const normalized: ActivityEvent[] = [];
  value.forEach((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const raw = entry as Record<string, unknown>;
    if (!isValidActivityEventKind(raw.kind)) return;
    if (typeof raw.id !== "string" || !raw.id.trim()) return;
    if (typeof raw.title !== "string" || !raw.title.trim()) return;
    if (typeof raw.message !== "string" || !raw.message.trim()) return;
    if (typeof raw.createdAtMs !== "number" || !Number.isFinite(raw.createdAtMs)) return;
    if (typeof raw.expiresAtMs !== "number" || !Number.isFinite(raw.expiresAtMs)) return;
    if (raw.expiresAtMs <= nowMs) return;
    normalized.push({
      id: raw.id.trim(),
      kind: raw.kind,
      title: raw.title.trim(),
      message: raw.message.trim(),
      createdAtMs: raw.createdAtMs,
      expiresAtMs: raw.expiresAtMs,
      unread: raw.unread !== false,
    });
  });
  return normalized
    .sort((left, right) => right.createdAtMs - left.createdAtMs)
    .slice(0, ACTIVITY_EVENT_MAX_COUNT);
};

const readActivityEventsFromSession = (): ActivityEvent[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(ACTIVITY_EVENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return normalizeActivityEvents(parsed, Date.now());
  } catch (error) {
    console.warn("[Notifications] Failed to read activity events from sessionStorage", error);
    return [];
  }
};

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [jobs, setJobs] = React.useState<NotificationJob[]>([]);
  const [lastReadAt, setLastReadAt] = React.useState<number>(() => Date.now());
  const [activityEvents, setActivityEvents] = React.useState<ActivityEvent[]>(() => readActivityEventsFromSession());

  const upsertJob = React.useCallback((job: UpsertNotificationJob) => {
    setJobs((prev) => {
      const normalized: NotificationJob = {
        ...job,
        updatedAt: typeof job.updatedAt === "number" ? job.updatedAt : Date.now(),
      };
      const index = prev.findIndex((entry) => entry.id === normalized.id);
      if (index < 0) {
        return [normalized, ...prev];
      }
      const next = prev.slice();
      next[index] = {
        ...next[index],
        ...normalized,
      };
      return next;
    });
  }, []);

  const pushActivityEvent = React.useCallback((event: PushActivityEventInput) => {
    setActivityEvents((prev) => {
      const nowMs = Date.now();
      const current = normalizeActivityEvents(prev, nowMs);
      const createdAtMs = typeof event.createdAtMs === "number" ? event.createdAtMs : nowMs;
      const title = event.title.trim();
      const message = event.message.trim();
      if (!title || !message) return current;
      const isDuplicate = current.some(
        (entry) =>
          entry.kind === event.kind &&
          entry.title === title &&
          entry.message === message &&
          Math.abs(entry.createdAtMs - createdAtMs) <= ACTIVITY_EVENT_DEDUPE_WINDOW_MS,
      );
      if (isDuplicate) return current;
      const nextEvent: ActivityEvent = {
        id: `activity:${createdAtMs}:${Math.random().toString(36).slice(2, 10)}`,
        kind: event.kind,
        title,
        message,
        createdAtMs,
        expiresAtMs: createdAtMs + ACTIVITY_EVENT_TTL_MS,
        unread: true,
      };
      return [nextEvent, ...current].slice(0, ACTIVITY_EVENT_MAX_COUNT);
    });
  }, []);

  const removeJob = React.useCallback((id: string) => {
    setJobs((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const markActivityRead = React.useCallback(() => {
    setActivityEvents((prev) => prev.map((entry) => (entry.unread ? { ...entry, unread: false } : entry)));
  }, []);

  const cleanupExpired = React.useCallback(() => {
    setActivityEvents((prev) => normalizeActivityEvents(prev, Date.now()));
  }, []);

  const markAllRead = React.useCallback(() => {
    setLastReadAt(Date.now());
    setActivityEvents((prev) => prev.map((entry) => (entry.unread ? { ...entry, unread: false } : entry)));
  }, []);

  React.useEffect(() => {
    cleanupExpired();
  }, [cleanupExpired]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (activityEvents.length === 0) {
        window.sessionStorage.removeItem(ACTIVITY_EVENTS_STORAGE_KEY);
      } else {
        window.sessionStorage.setItem(ACTIVITY_EVENTS_STORAGE_KEY, JSON.stringify(activityEvents));
      }
    } catch (error) {
      console.warn("[Notifications] Failed to persist activity events to sessionStorage", error);
    }
  }, [activityEvents]);

  const hasRunning = React.useMemo(() => jobs.some((job) => job.status === "running"), [jobs]);
  const hasUnread = React.useMemo(() => {
    const hasUnreadJobs = jobs.some((job) => job.updatedAt > lastReadAt);
    const hasUnreadActivity = activityEvents.some((event) => event.unread);
    return hasUnreadJobs || hasUnreadActivity;
  }, [activityEvents, jobs, lastReadAt]);

  const value = React.useMemo<NotificationsContextValue>(
    () => ({
      jobs,
      activityEvents,
      hasUnread,
      hasRunning,
      upsertJob,
      pushActivityEvent,
      removeJob,
      markActivityRead,
      cleanupExpired,
      markAllRead,
    }),
    [
      jobs,
      activityEvents,
      hasUnread,
      hasRunning,
      upsertJob,
      pushActivityEvent,
      removeJob,
      markActivityRead,
      cleanupExpired,
      markAllRead,
    ],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};

export const useNotifications = (): NotificationsContextValue => {
  const context = React.useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return context;
};
