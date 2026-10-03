import { getClassMetaById } from "../../data/classes";
import { normalizeSfGuildsFromScan } from "../parsing/normalizedGuild";
import { normalizeSfPlayerCharacterCore } from "../parsing/normalizedPlayer";
import { validateScanArchivePayload } from "../scanArchive/validation";
import { readSfPlayerStats as readPlayerStats } from "../parsing/parseSfJson";
import { normalizeServerKeyFromInput } from "../players/identifier";
import {
  buildPlayerDerivedSnapshotEntry,
  deriveForPlayer,
} from "./playerDerivedHelpers";
import type {
  LocalGuildMemberBasisStatus,
  LocalGuildToplistRow,
  LocalPlayerToplistRow,
  LocalToplistConfirmedScanSource,
  LocalToplistDerivationResult,
  LocalToplistIssue,
  LocalToplistSnapshotMeta,
} from "./localToplistTypes";
import { normalizeGuildSegmentForScan } from "../guilds/guildScanNormalizer";

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const canonicalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const pickValue = (record: JsonRecord | null, keys: readonly string[]) => {
  if (!record) return undefined;
  const sources = [record, asRecord(record.values), asRecord(record.latest), asRecord(asRecord(record.latest)?.values)].filter(
    (entry): entry is JsonRecord => Boolean(entry),
  );
  for (const source of sources) {
    const canonical = new Map<string, unknown>();
    Object.entries(source).forEach(([key, value]) => canonical.set(canonicalizeKey(key), value));
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
      const resolved = canonical.get(canonicalizeKey(key));
      if (resolved != null) return resolved;
    }
  }
  return undefined;
};

const readString = (record: JsonRecord | null, keys: readonly string[]) => {
  const value = pickValue(record, keys);
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
};

const readScalarString = (record: JsonRecord | null, keys: readonly string[]) => {
  const value = pickValue(record, keys);
  if (typeof value !== "string" && typeof value !== "number") return null;
  const trimmed = String(value).trim();
  return trimmed || null;
};

const readNumber = (record: JsonRecord | null, keys: readonly string[]) => {
  const value = pickValue(record, keys);
  if (value == null || value === "") return null;
  const parsed = Number(String(value).trim().replace(/\s+/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const average = (values: readonly number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const deriveRatioMain = (main: number | null, con: number | null) => {
  const m = typeof main === "number" && Number.isFinite(main) ? main : 0;
  const c = typeof con === "number" && Number.isFinite(con) ? con : 0;
  const total = m + c;
  if (!(total > 0)) return null;
  return Math.round((m / total) * 100);
};

const compareText = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const sourceIssue = (
  source: LocalToplistConfirmedScanSource,
  code: LocalToplistIssue["code"],
  severity: LocalToplistIssue["severity"],
  message: string,
  identifier?: string | null,
): LocalToplistIssue => ({
  code,
  severity,
  message,
  server: source.server,
  archiveScanId: source.archiveScanId,
  ...(identifier !== undefined ? { identifier } : {}),
});

const canonicalServer = (value: unknown) => normalizeServerKeyFromInput(value) ?? String(value ?? "").trim().toLowerCase();

const timestampSec = (timestampMs: number) => Math.floor(timestampMs / 1000);

const classNameFromId = (classId: string | number | null) => {
  const parsed = classId == null ? null : Number(classId);
  return Number.isFinite(parsed) ? getClassMetaById(parsed)?.label ?? String(classId) : String(classId ?? "");
};

const playerIdFromIdentifier = (identifier: string | null) => {
  const match = String(identifier ?? "").match(/_p([^_]+)$/i);
  return match?.[1] ?? null;
};

const guildIdFromIdentifier = (identifier: string | null) => {
  const match = String(identifier ?? "").match(/_g([^_]+)$/i);
  return match?.[1] ?? identifier;
};

const derivePlayerRow = (
  source: LocalToplistConfirmedScanSource,
  player: unknown,
  sourceServer: string,
): LocalPlayerToplistRow | null => {
  const record = asRecord(player);
  if (!record) return null;
  const normalized = (() => {
    try {
      return normalizeSfPlayerCharacterCore(player);
    } catch {
      return null;
    }
  })();
  const stats = readPlayerStats(player);
  const identifier = normalized?.identity.identifier ?? readString(record, ["identifier", "Identifier"]);
  if (!identifier) return null;

  const classId = normalized?.identity.class ?? stats.classId ?? readString(record, ["class", "Class", "classId", "Class ID"]);
  const className = classNameFromId(classId);
  const values =
    record.values && typeof record.values === "object" && !Array.isArray(record.values)
      ? { ...(record.values as Record<string, unknown>) }
      : {};
  const classMainKey = classNameFromId(classId);
  if (stats.baseMain != null) {
    values.Base = stats.baseMain;
    values["Base Attribute"] = stats.baseMain;
    const metaMain = classMainKey ? getClassMetaById(Number(classId)) : null;
    const label = metaMain?.primaryAttribute === "strength"
      ? "Base Strength"
      : metaMain?.primaryAttribute === "dexterity"
        ? "Base Dexterity"
        : "Base Intelligence";
    values[label] = stats.baseMain;
  }
  if (stats.conBase != null) values["Base Constitution"] = stats.conBase;
  if (stats.attrTotal != null) values.Attribute = stats.attrTotal;
  if (stats.conTotal != null) values.Constitution = stats.conTotal;

  const guildIdentifier =
    normalized?.guild.identifier ??
    readString(record, ["guildIdentifier", "Guild Identifier", "groupIdentifier", "Group Identifier", "guildId", "Guild ID"]) ??
    readScalarString(record, ["group", "Group"]);
  const guildName =
    normalized?.guild.name ??
    readString(record, ["guildName", "Guild Name", "groupname", "groupName", "guild", "Guild", "group", "Group"]);
  const level = stats.level;
  const sum = stats.baseStats ?? (stats.baseMain != null && stats.conBase != null ? stats.baseMain + stats.conBase : null);
  const sumTotal = stats.totalStats ?? (stats.attrTotal != null && stats.conTotal != null ? stats.attrTotal + stats.conTotal : null);
  const derived = deriveForPlayer({
    identifier,
    playerId: normalized?.identity.id ?? playerIdFromIdentifier(identifier),
    name: normalized?.identity.name ?? readString(record, ["name", "Name", "playerName", "Player Name"]) ?? "",
    className,
    level,
    server: sourceServer,
    guildIdentifier,
    guildName,
    values,
    timestamp: timestampSec(source.scanTimestamp),
  });
  const snapshot = buildPlayerDerivedSnapshotEntry({
    identifier,
    playerId: normalized?.identity.id ?? playerIdFromIdentifier(identifier),
    server: sourceServer,
    name: normalized?.identity.name ?? readString(record, ["name", "Name", "playerName", "Player Name"]) ?? "",
    className,
    guildName,
    level,
    lastScanRaw: readString(record, ["timestampRaw", "Timestamp", "timestamp"]),
    timestampSec: timestampSec(source.scanTimestamp),
    derived,
  });

  const main = stats.baseMain;
  const con = stats.conBase;
  const ratio = deriveRatioMain(main, con);
  const latestScanAtSec = timestampSec(source.scanTimestamp);
  return {
    rowKey: `${sourceServer}:${identifier}`,
    identifier,
    playerId: String(normalized?.identity.id ?? playerIdFromIdentifier(identifier) ?? "") || null,
    name: snapshot.name,
    server: sourceServer,
    sourceServer: source.server,
    scanTimestamp: source.scanTimestamp,
    manifestYear: source.manifestYear,
    archiveScanId: source.archiveScanId,
    archiveSha256: source.archiveSha256,
    localScanId: source.localScanId,
    class: snapshot.class,
    classId,
    guild: guildName,
    guildIdentifier,
    hofRank: normalized?.progression.rank ?? readNumber(record, ["hallOfFameRank", "Hall of Fame Rank", "hofRank", "HoF", "rank", "Rank"]),
    level,
    main,
    con,
    sum,
    ratio,
    mainTotal: stats.attrTotal,
    conTotal: stats.conTotal,
    sumTotal,
    xpProgress: readNumber(record, ["XP", "xp"]),
    xpTotal: readNumber(record, ["XP Total", "xpTotal"]),
    mine: readNumber(record, ["Gem Mine", "mine"]),
    treasury: readNumber(record, ["Treasury", "treasury"]),
    statsPerDay: null,
    statsDayTotal: null,
    lastScan: String(latestScanAtSec),
    latestScanAtSec,
  };
};

const dedupeRows = <T extends { identifier?: string | null; guildIdentifier?: string | null }>(
  rows: T[],
  source: LocalToplistConfirmedScanSource,
  kind: "player" | "guild",
  issues: LocalToplistIssue[],
) => {
  const byIdentifier = new Map<string, T>();
  for (const row of rows) {
    const identifier = kind === "player" ? row.identifier : row.guildIdentifier;
    if (!identifier) continue;
    const existing = byIdentifier.get(identifier);
    if (!existing) {
      byIdentifier.set(identifier, row);
      continue;
    }
    if (stableJson(existing) === stableJson(row)) {
      issues.push(sourceIssue(source, kind === "player" ? "duplicate-identical-player" : "duplicate-identical-guild", "warning", `Identisches ${kind}-Duplikat zusammengefuehrt.`, identifier));
      continue;
    }
    issues.push(sourceIssue(source, kind === "player" ? "duplicate-conflicting-player" : "duplicate-conflicting-guild", "error", `Widerspruechliches ${kind}-Duplikat verworfen.`, identifier));
  }
  return [...byIdentifier.values()];
};

const deriveGuildRows = (
  source: LocalToplistConfirmedScanSource,
  sourceServer: string,
  playerRows: readonly LocalPlayerToplistRow[],
  issues: LocalToplistIssue[],
): LocalGuildToplistRow[] => {
  const guilds = normalizeSfGuildsFromScan(source.rawScan);
  const rows = guilds.flatMap((guild): LocalGuildToplistRow[] => {
    const guildIdentifier = guild.identity.identifier;
    if (!guildIdentifier) {
      issues.push(sourceIssue(source, "missing-guild-identifier", "error", "Gilde ohne Identifier uebersprungen."));
      return [];
    }
    const guildSegment = normalizeGuildSegmentForScan(guildIdentifier);
    const playerRowsForServer = playerRows.filter((member) => member.server === sourceServer);
    const playerRowsById = new Map<string, LocalPlayerToplistRow[]>();
    const playerRowsByIdentifier = new Map<string, LocalPlayerToplistRow[]>();
    for (const member of playerRowsForServer) {
      if (member.playerId) {
        const key = member.playerId.trim().toLowerCase();
        playerRowsById.set(key, [...(playerRowsById.get(key) ?? []), member]);
      }
      const identifierKey = member.identifier.trim().toLowerCase();
      playerRowsByIdentifier.set(identifierKey, [...(playerRowsByIdentifier.get(identifierKey) ?? []), member]);
    }
    const isExpectedGuildMember = (member: LocalPlayerToplistRow) => {
      if (!guildSegment) return false;
      return normalizeGuildSegmentForScan(member.guildIdentifier) === guildSegment;
    };
    const expectedMembers = guild.members;
    const matchedMembers = expectedMembers.flatMap((expectedMember): LocalPlayerToplistRow[] => {
      const playerId = expectedMember.identity.playerId == null ? null : String(expectedMember.identity.playerId).trim().toLowerCase();
      const identifier = expectedMember.identity.playerIdentifier?.trim().toLowerCase() || null;
      const candidates = [
        ...(playerId ? playerRowsById.get(playerId) ?? [] : []),
        ...(identifier ? playerRowsByIdentifier.get(identifier) ?? [] : []),
      ];
      const match = candidates.find(isExpectedGuildMember);
      return match ? [match] : [];
    });
    const uniqueMembers = [...new Map(matchedMembers.map((member) => [member.identifier, member] as const)).values()];
    const memberCount = (guild.totals.membersTotal ?? guild.members.length) || null;
    const complete = memberCount != null && expectedMembers.length === memberCount && uniqueMembers.length === memberCount;
    const memberBasisStatus: LocalGuildMemberBasisStatus = memberCount == null ? "unknown" : complete ? "complete" : "incomplete";
    if (memberBasisStatus === "incomplete") {
      issues.push(sourceIssue(source, "incomplete-guild-member-basis", "warning", "Unvollstaendige Memberbasis; Durchschnittswerte bleiben leer.", guildIdentifier));
    }
    const averageIfComplete = (values: readonly (number | null)[]) => {
      if (!complete || values.length !== memberCount) return null;
      const numeric = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return numeric.length === memberCount ? average(numeric) : null;
    };
    const avgLevel = averageIfComplete(uniqueMembers.map((member) => member.level));
    const avgBaseMain = averageIfComplete(uniqueMembers.map((member) => member.main));
    const avgConBase = averageIfComplete(uniqueMembers.map((member) => member.con));
    const avgSumBaseTotal = averageIfComplete(uniqueMembers.map((member) => member.sum));
    const avgAttrTotal = averageIfComplete(uniqueMembers.map((member) => member.mainTotal));
    const avgConTotal = averageIfComplete(uniqueMembers.map((member) => member.conTotal));
    const avgTotalStats = averageIfComplete(uniqueMembers.map((member) => member.sumTotal));
    const avgMine = averageIfComplete(uniqueMembers.map((member) => member.mine));
    const avgTreasury = averageIfComplete(uniqueMembers.map((member) => member.treasury));
    const latestScanAtSec = timestampSec(source.scanTimestamp);
    return [{
      rowKey: `${sourceServer}:${guildIdentifier}`,
      guildId: guildIdFromIdentifier(guildIdentifier) ?? guildIdentifier,
      guildIdentifier,
      name: guild.identity.name ?? guildIdentifier,
      server: sourceServer,
      sourceServer: source.server,
      scanTimestamp: source.scanTimestamp,
      manifestYear: source.manifestYear,
      archiveScanId: source.archiveScanId,
      archiveSha256: source.archiveSha256,
      localScanId: source.localScanId,
      hofRank: guild.progression.rank ?? null,
      honor: guild.progression.honor ?? null,
      raids: guild.combatProgress.raid ?? null,
      portalFloor: guild.combatProgress.portal.floor ?? null,
      hydra: guild.combatProgress.hydra.level ?? null,
      petLevel: guild.combatProgress.pet.level ?? null,
      instructor: guild.bonuses.totalInstructor ?? null,
      memberCount,
      avgLevel,
      avgBaseMain,
      avgConBase,
      avgSumBaseTotal,
      avgAttrTotal,
      avgConTotal,
      avgTotalStats,
      avgMine,
      avgTreasury,
      sumAvg: avgSumBaseTotal,
      memberBasisStatus,
      memberBasisCount: uniqueMembers.length,
      memberPlayerIdentifiers: uniqueMembers.map(member => member.identifier),
      lastScan: String(latestScanAtSec),
      latestScanAtSec,
    }];
  });
  return dedupeRows(rows, source, "guild", issues);
};

const sourceIsConfirmed = (source: LocalToplistConfirmedScanSource) =>
  source.confirmation.archiveScanId === source.archiveScanId &&
  source.confirmation.archiveSha256.toLowerCase() === source.archiveSha256.toLowerCase() &&
  (source.confirmation.kind === "archiveSource" || source.confirmation.kind === "archiveBinding");

export function deriveLocalToplistsFromConfirmedScans(
  sources: readonly LocalToplistConfirmedScanSource[],
): LocalToplistDerivationResult {
  const issues: LocalToplistIssue[] = [];
  const snapshots: LocalToplistSnapshotMeta[] = [];
  const players: LocalPlayerToplistRow[] = [];
  const guilds: LocalGuildToplistRow[] = [];

  for (const source of sources) {
    if (!sourceIsConfirmed(source)) {
      issues.push(sourceIssue(source, "unconfirmed-source", "error", "Quelle ist nicht als expliziter Archivscan bestaetigt."));
      continue;
    }
    const sourceServer = canonicalServer(source.server);
    if (!sourceServer || !Number.isFinite(source.scanTimestamp)) {
      issues.push(sourceIssue(source, "invalid-source-metadata", "error", "Quelle enthaelt ungueltige Server- oder Timestamp-Metadaten."));
      continue;
    }
    const raw = asRecord(source.rawScan);
    const rawPlayers = asArray(raw?.players);
    const rawGuilds = asArray(raw?.groups ?? raw?.guilds);
    try {
      validateScanArchivePayload(source.rawScan, {
        server: source.server,
        timestamp: source.scanTimestamp,
        playerCount: rawPlayers.length,
        groupCount: rawGuilds.length,
      });
    } catch (error) {
      issues.push(sourceIssue(source, "raw-scan-mismatch", "error", error instanceof Error ? error.message : "Raw-Scan passt nicht zur Quelle."));
      continue;
    }

    const sourceIssues: LocalToplistIssue[] = [];
    const playerRows = rawPlayers.flatMap((player): LocalPlayerToplistRow[] => {
      const row = derivePlayerRow(source, player, sourceServer);
      if (!row) {
        sourceIssues.push(sourceIssue(source, "missing-player-identifier", "error", "Spieler ohne Identifier uebersprungen."));
        return [];
      }
      return [row];
    });
    const dedupedPlayers = dedupeRows(playerRows, source, "player", sourceIssues);
    const guildRows = deriveGuildRows(source, sourceServer, dedupedPlayers, sourceIssues);
    players.push(...dedupedPlayers);
    guilds.push(...guildRows);
    issues.push(...sourceIssues);
    snapshots.push({
      server: sourceServer,
      sourceServer: source.server,
      archiveScanId: source.archiveScanId,
      archiveSha256: source.archiveSha256,
      scanTimestamp: source.scanTimestamp,
      manifestYear: source.manifestYear,
      localScanId: source.localScanId,
      playerCount: dedupedPlayers.length,
      guildCount: guildRows.length,
      issues: sourceIssues,
    });
  }

  const timestamps = snapshots.map((snapshot) => snapshot.scanTimestamp).filter(Number.isFinite);
  return {
    status: snapshots.length === sources.length && !issues.some((issue) => issue.severity === "error") ? "complete" : snapshots.length ? "partial" : "empty",
    snapshots,
    players: players.sort((left, right) => compareText(left.server, right.server) || compareText(left.identifier, right.identifier)),
    guilds: guilds.sort((left, right) => compareText(left.server, right.server) || compareText(left.guildIdentifier, right.guildIdentifier)),
    issues,
    earliestTimestamp: timestamps.length ? Math.min(...timestamps) : null,
    latestTimestamp: timestamps.length ? Math.max(...timestamps) : null,
  };
}
