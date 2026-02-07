import type {
  UploadGuildMemberPreview,
  UploadGuildPreview,
  UploadPlayerPreview,
  UploadRecordStatus,
  UploadSession,
  UploadSessionId,
} from "./uploadCenterTypes";

export type ParsedCsvPlayer = {
  playerId: string;
  name: string;
  server: string;
  guildId?: string;
  level?: number;
  className?: string;
  scanTimestampSec: number;
  values?: Record<string, any>;
};

export type ParsedCsvGuild = {
  guildId: string;
  name: string;
  server: string;
  memberCount?: number;
  scanTimestampSec: number;
  members: {
    playerId: string;
    name: string;
    level?: number;
    className?: string;
  }[];
  values?: Record<string, any>;
};

export type CsvParsedResult = {
  filename?: string;
  players: ParsedCsvPlayer[];
  guilds: ParsedCsvGuild[];
};

const INITIAL_STATUS: UploadRecordStatus = "pending";

export function buildUploadSessionFromCsv(
  parsed: CsvParsedResult,
  sessionId: UploadSessionId,
  createdAtIso: string,
): UploadSession {
  const players: UploadPlayerPreview[] = parsed.players.map((p) => {
    const key = `${p.playerId}__${p.server}__${p.scanTimestampSec}`;

    return {
      key,
      playerId: p.playerId,
      name: p.name,
      server: p.server,
      scanTimestampSec: p.scanTimestampSec,
      guildId: (p as any).guildId ?? undefined,
      level: p.level,
      className: p.className,
      values: p.values,
      selected: true,
      status: INITIAL_STATUS,
    };
  });

  const guilds: UploadGuildPreview[] = parsed.guilds.map((g) => {
    const key = `${g.guildId}__${g.server}__${g.scanTimestampSec}`;

    const members: UploadGuildMemberPreview[] = g.members.map((m) => ({
      key: `${m.playerId}__${g.server}__${g.scanTimestampSec}`,
      playerId: m.playerId,
      name: m.name,
      level: m.level,
      className: m.className,
    }));

    return {
      key,
      guildId: g.guildId,
      name: g.name,
      server: g.server,
      memberCount: g.memberCount ?? g.members.length,
      scanTimestampSec: g.scanTimestampSec,
      members,
      values: g.values,
      selected: true,
      status: INITIAL_STATUS,
    };
  });

  return {
    id: sessionId,
    createdAt: createdAtIso,
    sourceFilename: parsed.filename,
    scanUploadId: undefined,
    players,
    guilds,
  };
}
