import { Timestamp } from "firebase-admin/firestore";
import type { DocumentData } from "firebase-admin/firestore";
import type { LogEntryDto, LogLevel } from "../types/logs";

const LOG_LEVELS: LogLevel[] = ["error", "warning", "info"];

const isLogLevel = (value: unknown): value is LogLevel =>
  typeof value === "string" && LOG_LEVELS.includes(value as LogLevel);

const resolveTimestamp = (value: unknown): string => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (typeof value === "string") {
    const candidate = new Date(value);
    if (!Number.isNaN(candidate.getTime())) {
      return candidate.toISOString();
    }
  }

  return new Date().toISOString();
};

const pickDetails = (data: DocumentData): string | undefined => {
  if (typeof data.details === "string") {
    return data.details;
  }

  if (typeof data.changes !== "undefined") {
    try {
      return JSON.stringify(data.changes, null, 2);
    } catch {
      return undefined;
    }
  }

  return undefined;
};

const deriveLevel = (data: DocumentData): LogLevel => {
  if (isLogLevel(data.level)) {
    return data.level;
  }

  const action = typeof data.action === "string" ? data.action : "";
  if (action.includes(".error")) {
    return "error";
  }
  if (action.includes(".warning")) {
    return "warning";
  }

  return "info";
};

const buildContext = (data: DocumentData): Record<string, unknown> => ({
  action: typeof data.action === "string" ? data.action : null,
  actorUserId: typeof data.actorUserId === "string" ? data.actorUserId : null,
  actorDisplayName: typeof data.actorDisplayName === "string" ? data.actorDisplayName : null,
  targetUserId: typeof data.targetUserId === "string" ? data.targetUserId : null,
  context: typeof data.context !== "undefined" ? data.context : null,
});

const pickMessage = (data: DocumentData): string => {
  if (typeof data.summary === "string" && data.summary.length) {
    return data.summary;
  }

  if (typeof data.action === "string" && data.action.length) {
    return data.action;
  }

  return "Unknown admin event";
};

export function mapAdminAuditToLogEntry(docId: string, data: DocumentData): LogEntryDto {
  return {
    id: docId,
    service: "auth-api",
    level: deriveLevel(data),
    timestamp: resolveTimestamp(data.createdAt),
    message: pickMessage(data),
    details: pickDetails(data),
    context: buildContext(data),
  };
}
