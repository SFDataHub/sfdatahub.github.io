import {
  deriveGuildHubLogicalScanSnapshots,
  type GuildHubLocalScan,
  type GuildHubLogicalScanSnapshot,
  type GuildHubScanSummary,
} from "./localScanLibrary";
import { normalizeGuildScanMember } from "./guildScanNormalizer";
import { normalizeServerKeyFromInput } from "../players/identifier";
import { normalizeSfPlayerCharacterCore } from "../parsing";
import { resolveServer } from "../servers/serverResolver";

const UNKNOWN_SCAN_TIME = "ohne Scan-Zeit";
const UNKNOWN_SERVER = "Server unbekannt";

export type ScanCoverageProgressPhase =
  | "loading-local-scans"
  | "mapping-snapshots"
  | "evaluating-players"
  | "building-coverage"
  | "done";

export type ScanCoverageProgress = {
  phase: ScanCoverageProgressPhase;
  current?: number;
  total?: number;
  message: string;
};

export type ScanCoverageScanOption = {
  id: string;
  scanId: string;
  snapshotIndex: number | null;
  label: string;
  timestampMs: number | null;
  servers: string[];
  playerCount: number;
};

export type ScanCoverageRankEntry = {
  rank: number;
  name: string;
  guildName: string | null;
  playerRef: string | null;
  server: string;
};

export type ScanCoverageRow =
  | {
      type: "captured";
      rank: number;
      players: ScanCoverageRankEntry[];
    }
  | {
      type: "missing";
      rank: number;
      previous: ScanCoverageRankEntry | null;
      next: ScanCoverageRankEntry | null;
    };

export type ScanCoverageResult = {
  rows: ScanCoverageRow[];
  rankedPlayers: ScanCoverageRankEntry[];
  capturedRanksInRange: number;
  missingRanks: number[];
};

export type ScanCoverageSelectionAnalysis = {
  serverOptions: string[];
  rankedPlayers: ScanCoverageRankEntry[];
  playerCount: number;
};

export type ScanCoverageSummaryInput = Pick<
  GuildHubScanSummary,
  | "sourceScanId"
  | "displayName"
  | "filename"
  | "lastSnapshotTimestamp"
  | "updatedAt"
  | "importedAt"
  | "logicalScanCount"
  | "playerCount"
>;

export type ScanCoverageLocalScanInput = GuildHubLocalScan;

export type ScanCoverageTiming = {
  phase: ScanCoverageProgressPhase | "total";
  durationMs: number;
};

type AnalyzeSelectionOptions = {
  onProgress?: (progress: ScanCoverageProgress) => void;
};

export const toFiniteInteger = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(",", "."));
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return null;
};

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const canonicalize = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

const pickRecordValue = (record: Record<string, unknown>, keys: readonly string[]) => {
  const values = asRecord(record.values);
  const latest = asRecord(record.latest);
  const latestValues = asRecord(latest?.values);
  const sources = [record, values, latest, latestValues].filter(
    (source): source is Record<string, unknown> => Boolean(source),
  );

  for (const source of sources) {
    const canonical = new Map<string, unknown>();
    Object.entries(source).forEach(([key, value]) => canonical.set(canonicalize(key), value));
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
      const value = canonical.get(canonicalize(key));
      if (value != null) return value;
    }
  }

  return undefined;
};

const readFallbackRank = (record: Record<string, unknown>) =>
  toFiniteInteger(
    pickRecordValue(record, [
      "hallOfFameRank",
      "Hall of Fame Rank",
      "hofRank",
      "HoF Rank",
      "HoF",
      "rank",
      "Rank",
      "halloffame",
      "halloffameposition",
      "hofposition",
      "hofplatz",
    ]),
  );

const readFallbackString = (record: Record<string, unknown>, keys: readonly string[]) => {
  const value = pickRecordValue(record, keys);
  const text = String(value ?? "").replace(/\u00a0/g, " ").trim();
  return text && !["?", "-", "--", "n/a", "na", "null", "undefined"].includes(text.toLowerCase()) ? text : null;
};

const readRawServer = (record: Record<string, unknown>) =>
  normalizeServerKeyFromInput(
    readFallbackString(record, ["server", "Server", "prefix", "world", "realm"]) ??
      readFallbackString(record, ["identifier", "Identifier"])?.match(/^(.+)_p\d+$/i)?.[1],
  );

const formatDateTime = (value: string | number | null) => {
  if (value == null) return UNKNOWN_SCAN_TIME;
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) return UNKNOWN_SCAN_TIME;
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export const normalizeServerCode = (value: unknown) => {
  const lookupValue = typeof value === "number" ? value : String(value ?? "").trim();
  if (!lookupValue) return null;
  const resolved = resolveServer(lookupValue);
  if (resolved?.code) return resolved.code.toUpperCase();
  return normalizeServerKeyFromInput(lookupValue)?.toUpperCase() ?? null;
};

export const compareServerCodes = (left: string, right: string) =>
  left.localeCompare(right, "de-DE", { numeric: true, sensitivity: "base" });

export const formatServerIdentifier = (server: string) => resolveServer(server)?.code ?? server;

const collectSnapshotServers = (snapshot: GuildHubLogicalScanSnapshot) => {
  const servers = new Set<string>();

  snapshot.servers
    .map(normalizeServerCode)
    .filter((server): server is string => Boolean(server))
    .forEach((server) => servers.add(server));

  snapshot.players
    .map((player) => (asRecord(player) ? readRawServer(asRecord(player)!) : null))
    .map(normalizeServerCode)
    .filter((server): server is string => Boolean(server))
    .forEach((server) => servers.add(server));

  return [...servers].sort(compareServerCodes);
};

const formatServerList = (servers: string[]) =>
  servers.length ? servers.map(formatServerIdentifier).join(", ") : UNKNOWN_SERVER;

const formatScanLabel = (
  summary: ScanCoverageSummaryInput,
  snapshot?: GuildHubLogicalScanSnapshot,
  index?: number,
  servers: string[] = [],
) => {
  const name = summary.displayName || summary.filename || summary.sourceScanId;
  if (!snapshot) {
    return `${name} · ${formatDateTime(summary.lastSnapshotTimestamp ?? summary.updatedAt ?? summary.importedAt)}`;
  }
  const suffix = summary.logicalScanCount > 1 ? ` · Teilscan ${typeof index === "number" ? index + 1 : ""}` : "";
  const serverSegment = summary.logicalScanCount > 1 ? ` · ${formatServerList(servers)}` : "";
  return `${name}${suffix}${serverSegment} · ${formatDateTime(snapshot.timestamp)}`;
};

export const createScanCoverageOptions = (
  summary: ScanCoverageSummaryInput,
  scan: ScanCoverageLocalScanInput | null,
): ScanCoverageScanOption[] => {
  const snapshots = scan ? deriveGuildHubLogicalScanSnapshots(scan) : [];

  if (snapshots.length) {
    return snapshots.map((snapshot, index) => {
      const servers = collectSnapshotServers(snapshot);
      return {
        id: snapshots.length > 1 ? `${summary.sourceScanId}::${index}` : summary.sourceScanId,
        scanId: summary.sourceScanId,
        snapshotIndex: snapshots.length > 1 ? index : null,
        label: formatScanLabel(summary, snapshot, index, servers),
        timestampMs: snapshot.timestampMs,
        servers,
        playerCount: snapshot.playerCount,
      };
    });
  }

  return [
    {
      id: summary.sourceScanId,
      scanId: summary.sourceScanId,
      snapshotIndex: null,
      label: formatScanLabel(summary),
      timestampMs: summary.lastSnapshotTimestamp,
      servers: [],
      playerCount: summary.playerCount,
    },
  ];
};

const getPlayersForOption = (
  scan: ScanCoverageLocalScanInput | null,
  option: ScanCoverageScanOption | null,
) => {
  if (!scan || !option) return [];
  const snapshots = deriveGuildHubLogicalScanSnapshots(scan);
  if (snapshots.length) return snapshots[option.snapshotIndex ?? 0]?.players ?? [];
  const rawData = asRecord(scan.rawData);
  const players = rawData?.players;
  return Array.isArray(players) ? players : [];
};

const createRankEntry = (player: unknown): ScanCoverageRankEntry | null => {
  const record = asRecord(player);
  if (!record) return null;

  const normalized = normalizeSfPlayerCharacterCore(record);
  const member = normalizeGuildScanMember(record);
  const server =
    normalizeServerCode(normalized.identity.server) ??
    normalizeServerCode(member?.server) ??
    normalizeServerCode(readRawServer(record));

  if (!server) return null;

  const rank = toFiniteInteger(normalized.progression.rank) ?? readFallbackRank(record);
  if (rank == null || rank < 1) return null;

  const name =
    normalized.identity.name ??
    member?.name ??
    readFallbackString(record, ["name", "Name", "playerName", "Player Name"]) ??
    `Spieler ${normalized.identity.id ?? "unbekannt"}`;
  const guildName =
    normalized.guild.name ??
    member?.guildName ??
    readFallbackString(record, ["guildName", "Guild Name", "groupname", "groupName", "guild", "Guild", "group", "Group"]);

  return {
    rank,
    name,
    guildName,
    playerRef: normalized.identity.identifier ?? member?.memberRef ?? null,
    server,
  };
};

export const analyzeScanCoverageSelection = (
  scan: ScanCoverageLocalScanInput,
  option: ScanCoverageScanOption,
  options: AnalyzeSelectionOptions = {},
): ScanCoverageSelectionAnalysis => {
  const players = getPlayersForOption(scan, option);
  const serverSet = new Set<string>();

  option.servers
    .map(normalizeServerCode)
    .filter((server): server is string => Boolean(server))
    .forEach((server) => serverSet.add(server));

  const rankedPlayers: ScanCoverageRankEntry[] = [];
  const total = players.length;
  options.onProgress?.({
    phase: "evaluating-players",
    current: 0,
    total,
    message: "Spieler werden ausgewertet",
  });

  players.forEach((player, index) => {
    const record = asRecord(player);
    if (record) {
      const rawServer = normalizeServerCode(readRawServer(record));
      if (rawServer) serverSet.add(rawServer);
    }

    const entry = createRankEntry(player);
    if (entry) {
      serverSet.add(entry.server);
      rankedPlayers.push(entry);
    }

    const current = index + 1;
    if (current === total || current % 50 === 0) {
      options.onProgress?.({
        phase: "evaluating-players",
        current,
        total,
        message: "Spieler werden ausgewertet",
      });
    }
  });

  rankedPlayers.sort(
    (a, b) =>
      compareServerCodes(a.server, b.server) ||
      a.rank - b.rank ||
      a.name.localeCompare(b.name, "de-DE", { sensitivity: "base" }),
  );

  return {
    serverOptions: [...serverSet].sort(compareServerCodes),
    rankedPlayers,
    playerCount: players.length,
  };
};

export const buildScanCoverageResult = (
  rankedEntries: ScanCoverageRankEntry[],
  selectedServer: string,
  limit: number,
): ScanCoverageResult => {
  const rankedPlayers = rankedEntries
    .filter((entry) => entry.server === selectedServer)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "de-DE", { sensitivity: "base" }));

  const byRank = new Map<number, ScanCoverageRankEntry[]>();
  rankedPlayers.forEach((entry) => {
    const existing = byRank.get(entry.rank) ?? [];
    existing.push(entry);
    byRank.set(entry.rank, existing);
  });

  const rows: ScanCoverageRow[] = [];
  const missingRanks: number[] = [];
  const capturedRanks = [...byRank.keys()].sort((a, b) => a - b);
  let capturedPointer = 0;

  for (let rank = 1; rank <= limit; rank += 1) {
    const playersAtRank = byRank.get(rank);
    if (playersAtRank?.length) {
      rows.push({ type: "captured", rank, players: playersAtRank });
      continue;
    }

    while (capturedPointer < capturedRanks.length && capturedRanks[capturedPointer] < rank) {
      capturedPointer += 1;
    }
    const previousRank = capturedRanks[capturedPointer - 1] ?? null;
    const nextRank = capturedRanks[capturedPointer] ?? null;
    rows.push({
      type: "missing",
      rank,
      previous: previousRank != null ? byRank.get(previousRank)?.[0] ?? null : null,
      next: nextRank != null ? byRank.get(nextRank)?.[0] ?? null : null,
    });
    missingRanks.push(rank);
  }

  const capturedRanksInRange = capturedRanks.filter((rank) => rank >= 1 && rank <= limit).length;

  return {
    rows,
    rankedPlayers,
    capturedRanksInRange,
    missingRanks,
  };
};
