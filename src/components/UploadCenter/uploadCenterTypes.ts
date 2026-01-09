export type UploadRecordStatus = "pending" | "created" | "duplicate" | "error";

export type UploadRecordKind = "player" | "guild";

// Shared key so frontend/backend can reference the same record without extra reads.
// Shared key that matches the scan document ID used by the backend (e.g. playerId__server__timestampSec or guildId__server__timestampSec).
// The API will echo this key alongside status updates ("created" | "duplicate" | "error") without additional reads.
export type UploadRecordKey = string;

export type UploadPlayerPreview = {
  key: UploadRecordKey;         // e.g. playerId|server|scanTimestamp
  playerId: string;
  name: string;
  server: string;
  scanTimestampSec: number;
  guildId?: string;
  level?: number;
  className?: string;
  values?: Record<string, any>;
  // More optional fields from CSV can be added later.
  selected: boolean;
  status: UploadRecordStatus;
};

export type UploadGuildMemberPreview = {
  key: UploadRecordKey;
  playerId: string;
  name: string;
  level?: number;
  className?: string;
};

export type UploadGuildPreview = {
  key: UploadRecordKey;         // e.g. guildId|server|scanTimestamp
  guildId: string;
  name: string;
  server: string;
  memberCount?: number;
  scanTimestampSec: number;
  members: UploadGuildMemberPreview[];
  values?: Record<string, any>;
  selected: boolean;
  status: UploadRecordStatus;
};

export type UploadSessionId = string;

export type UploadSession = {
  id: UploadSessionId;
  createdAt: string;            // ISO string (local create timestamp)
  sourceFilename?: string;
  scanUploadId?: string;
  note?: string;
  players: UploadPlayerPreview[];
  guilds: UploadGuildPreview[];
};
