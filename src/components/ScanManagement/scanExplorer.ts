import { normalizeSfPlayerCharacterCore, type NormalizedPlayer } from "../../lib/parsing/normalizedPlayer";
import {
  detectSfPlayerSaveLayout,
  readSfPlayerSaveArray,
  readSfSaveLowerShort,
  readSfSaveNumber,
} from "../../lib/parsing/playerSaveLayout";
import {
  deriveGuildHubLogicalScanSnapshots,
  type GuildHubLocalScan,
  type GuildHubLogicalScanSnapshot,
} from "../../lib/guilds/localScanLibrary";
import {
  deriveGuildCoverageForLogicalSnapshots,
  summarizeGuildCoverage,
  type GuildCoverageSummary,
  type GuildSnapshotCoverage,
  type GuildSnapshotCoverageStatus,
} from "../../lib/guilds/guildCoverage";

export const SCAN_EXPLORER_MAX_VISIBLE_RESULTS = 100;

export type ScanExplorerPlayerNormalizer = (raw: unknown) => NormalizedPlayer;

export type ScanExplorerGuildGroup = {
  key: string;
  server: string;
  guildIdentifier: string;
  guildName: string;
  rows: GuildSnapshotCoverage[];
  completeSnapshotCount: number;
};

export type ScanExplorerPlayerEntity = {
  kind: "player";
  key: string;
  raw: unknown;
  snapshotId: string;
  snapshotTimestamp: string;
  name: string;
  identifier: string | null;
  server: string | null;
  guildName: string | null;
  level: number | null;
  classId: number | null;
  searchText: string;
};

export type ScanExplorerGuildEntity = {
  kind: "guild";
  key: string;
  group: ScanExplorerGuildGroup;
  searchText: string;
};

export type ScanExplorerEntity = ScanExplorerPlayerEntity | ScanExplorerGuildEntity;

export type ScanExplorerData = {
  scan: GuildHubLocalScan;
  snapshots: GuildHubLogicalScanSnapshot[];
  coverageRows: GuildSnapshotCoverage[];
  coverageSummary: GuildCoverageSummary;
  guildGroups: ScanExplorerGuildGroup[];
  players: ScanExplorerPlayerEntity[];
  playerLookup: Map<string, ScanExplorerPlayerEntity>;
  guilds: ScanExplorerGuildEntity[];
  guildLookup: Map<string, ScanExplorerGuildEntity>;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const toTrimmedString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const toFiniteNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const pickString = (record: Record<string, unknown> | null, keys: string[]): string | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = toTrimmedString(record[key]);
    if (value) return value;
  }
  return null;
};

function getCoverageUniqueKey(row: Pick<GuildSnapshotCoverage, "server" | "guildIdentifier">) {
  return `${row.server.toLowerCase()}::${row.guildIdentifier.toLowerCase()}`;
}

export function formatCoverageStatus(status: GuildSnapshotCoverageStatus) {
  if (status === "complete") return { symbol: "✓", label: "complete" };
  if (status === "overcount") return { symbol: "!", label: "overcount" };
  if (status === "unknown") return { symbol: "?", label: "unknown" };
  return { symbol: "-", label: "incomplete" };
}

export function groupGuildCoverageRows(rows: GuildSnapshotCoverage[]): ScanExplorerGuildGroup[] {
  const groups = new Map<string, ScanExplorerGuildGroup>();

  for (const row of rows) {
    const key = getCoverageUniqueKey(row);
    const existing =
      groups.get(key) ??
      ({
        key,
        server: row.server,
        guildIdentifier: row.guildIdentifier,
        guildName: row.guildName?.trim() || "Unknown Guild",
        rows: [],
        completeSnapshotCount: 0,
      } satisfies ScanExplorerGuildGroup);

    if (existing.guildName === "Unknown Guild" && row.guildName?.trim()) existing.guildName = row.guildName.trim();
    existing.rows.push(row);
    if (row.complete) existing.completeSnapshotCount += 1;
    groups.set(key, existing);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort((a, b) => a.snapshotTimestamp - b.snapshotTimestamp),
    }))
    .sort(
      (a, b) =>
        a.server.localeCompare(b.server, undefined, { numeric: true, sensitivity: "base" }) ||
        a.guildName.localeCompare(b.guildName, undefined, { numeric: true, sensitivity: "base" }) ||
        a.guildIdentifier.localeCompare(b.guildIdentifier, undefined, { numeric: true, sensitivity: "base" }),
    );
}

function readGuildName(raw: unknown): string | null {
  const record = asRecord(raw);
  return pickString(record, ["guildName", "Guild Name", "groupname", "groupName", "group", "Group"]);
}

function readCheapLevelAndClass(raw: unknown): { level: number | null; classId: number | null } {
  const record = asRecord(raw);
  if (!record) return { level: null, classId: null };

  const directLevel = toFiniteNumberOrNull(record.level ?? record.Level);
  const directClass = toFiniteNumberOrNull(record.class ?? record.Class ?? record.classId ?? record.classID);
  if (directLevel != null || directClass != null) return { level: directLevel, classId: directClass };

  const saveArray = readSfPlayerSaveArray(record);
  const layout = detectSfPlayerSaveLayout(record, saveArray);
  if (layout === "currentCompact") {
    return {
      level: readSfSaveLowerShort(saveArray, 3),
      classId: readSfSaveLowerShort(saveArray, 20),
    };
  }
  if (layout === "legacyOwn") {
    return {
      level: readSfSaveLowerShort(saveArray, 7),
      classId: readSfSaveLowerShort(saveArray, 29),
    };
  }
  if (layout === "legacyOther") {
    return {
      level: readSfSaveLowerShort(saveArray, 2),
      classId: readSfSaveLowerShort(saveArray, 20),
    };
  }

  return {
    level: readSfSaveNumber(saveArray, 3),
    classId: readSfSaveNumber(saveArray, 20),
  };
}

function createPlayerEntity(
  raw: unknown,
  snapshot: GuildHubLogicalScanSnapshot,
  index: number,
): ScanExplorerPlayerEntity | null {
  const record = asRecord(raw);
  const name = pickString(record, ["name", "Name", "playerName", "Player Name"]);
  const identifier = pickString(record, ["identifier", "Identifier"]);
  const numericId = toFiniteNumberOrNull(record?.id) ?? parsePlayerIdFromIdentifier(identifier);
  if (!name && !identifier && numericId == null) return null;

  const server = pickString(record, ["prefix", "server", "Server"]) ?? parseServerFromPlayerIdentifier(identifier) ?? snapshot.servers[0] ?? null;
  const guildName = readGuildName(raw);
  const displayName = name ?? identifier ?? (numericId == null ? "Unknown Player" : `Player ${numericId}`);
  const key = `${snapshot.id}::player::${identifier ?? numericId ?? index}`;
  const cheap = readCheapLevelAndClass(raw);

  return {
    kind: "player",
    key,
    raw,
    snapshotId: snapshot.id,
    snapshotTimestamp: snapshot.timestamp,
    name: displayName,
    identifier,
    server,
    guildName,
    level: cheap.level,
    classId: cheap.classId,
    searchText: [displayName, identifier, server, guildName].filter(Boolean).join(" ").toLowerCase(),
  };
}

function parsePlayerIdFromIdentifier(identifier: string | null): number | null {
  const match = String(identifier ?? "").trim().match(/_p(\d+)$/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseServerFromPlayerIdentifier(identifier: string | null): string | null {
  const match = String(identifier ?? "").trim().match(/^(.+)_p\d+$/i);
  return match?.[1] ? match[1] : null;
}

export function buildScanExplorerData(scan: GuildHubLocalScan): ScanExplorerData {
  const snapshots = deriveGuildHubLogicalScanSnapshots(scan);
  const coverageRows = deriveGuildCoverageForLogicalSnapshots(snapshots);
  const guildGroups = groupGuildCoverageRows(coverageRows);
  const players = snapshots.flatMap((snapshot) =>
    snapshot.players
      .map((player, index) => createPlayerEntity(player, snapshot, index))
      .filter((player): player is ScanExplorerPlayerEntity => Boolean(player)),
  );
  const guilds: ScanExplorerGuildEntity[] = guildGroups.map((group) => ({
    kind: "guild",
    key: `guild::${group.key}`,
    group,
    searchText: [group.guildName, group.guildIdentifier, group.server].filter(Boolean).join(" ").toLowerCase(),
  }));

  const playerLookup = new Map(players.map((player) => [player.key, player]));
  const guildLookup = new Map(guilds.map((guild) => [guild.key, guild]));

  return {
    scan,
    snapshots,
    coverageRows,
    coverageSummary: summarizeGuildCoverage(coverageRows),
    guildGroups,
    players,
    playerLookup,
    guilds,
    guildLookup,
  };
}

export function normalizeScanExplorerPlayer(
  player: ScanExplorerPlayerEntity,
  normalizer: ScanExplorerPlayerNormalizer = normalizeSfPlayerCharacterCore,
): NormalizedPlayer {
  return normalizer(player.raw);
}

export function filterScanExplorerEntities(
  players: ScanExplorerPlayerEntity[],
  guilds: ScanExplorerGuildEntity[],
  query: string,
): { players: ScanExplorerPlayerEntity[]; guilds: ScanExplorerGuildEntity[] } {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return { players, guilds };

  return {
    players: players.filter((player) => player.searchText.includes(normalizedQuery)),
    guilds: guilds.filter((guild) => guild.searchText.includes(normalizedQuery)),
  };
}

export function getLimitedScanExplorerResults(
  players: ScanExplorerPlayerEntity[],
  guilds: ScanExplorerGuildEntity[],
  query: string,
  limit = SCAN_EXPLORER_MAX_VISIBLE_RESULTS,
): {
  query: string;
  players: ScanExplorerPlayerEntity[];
  guilds: ScanExplorerGuildEntity[];
  playerTotal: number;
  guildTotal: number;
  playerVisible: number;
  guildVisible: number;
  limit: number;
} {
  const normalizedQuery = query.trim().toLowerCase();
  const visiblePlayers: ScanExplorerPlayerEntity[] = [];
  const visibleGuilds: ScanExplorerGuildEntity[] = [];
  let playerTotal = 0;
  let guildTotal = 0;

  for (const player of players) {
    if (normalizedQuery && !player.searchText.includes(normalizedQuery)) continue;
    playerTotal += 1;
    if (visiblePlayers.length < limit) visiblePlayers.push(player);
  }

  for (const guild of guilds) {
    if (normalizedQuery && !guild.searchText.includes(normalizedQuery)) continue;
    guildTotal += 1;
    if (visibleGuilds.length < limit) visibleGuilds.push(guild);
  }

  return {
    query: normalizedQuery,
    players: visiblePlayers,
    guilds: visibleGuilds,
    playerTotal,
    guildTotal,
    playerVisible: visiblePlayers.length,
    guildVisible: visibleGuilds.length,
    limit,
  };
}
