export type LogLevel = "error" | "warning" | "info";

export type LogServiceId =
  | "auth-api"
  | "scan-import-api"
  | "firestore"
  | "goatcounter"
  | "other";

export interface LogEntryDto {
  id: string;
  service: LogServiceId;
  level: LogLevel;
  timestamp: string;
  message: string;
  details?: string;
  context?: unknown;
}
