import { listGuildHubLocalScans, type GuildHubLocalScan } from "../../lib/guilds/localScanLibrary";
import { isNormalizedGuildMemberInGuild, type NormalizedGuildMember } from "../../lib/guilds/guildScanNormalizer";
import { normalizeServerKeyFromInput } from "../../lib/players/identifier";
import type { GuildHubSelectedGuild } from "./hooks/useGuildHubSelection";
import type { CreateFightTrackerMemberInput, FightTrackerGuild, FightTrackerMember } from "./fightTrackingStore";

type JsonRecord = Record<string, unknown>;

type ScanGuildIdentity = {
  name: string;
  server: string | null;
  guildSegment: string | null;
};

export type FightTrackerScanMember = CreateFightTrackerMemberInput & {
  scanMemberRef: string;
  baseStatsSum: number | null;
  totalStats: number | null;
};

export type FightTrackerScanSnapshot = {
  scanId: string;
  scanAt: string | null;
  normalizerVersion: number | null;
  guildName: string;
  server: string | null;
  members: FightTrackerScanMember[];
};

export type FightTrackerSyncPlan = {
  snapshot: FightTrackerScanSnapshot;
  newMembers: FightTrackerScanMember[];
  existingMembers: Array<{ member: FightTrackerMember; scanMember: FightTrackerScanMember }>;
  confirmedManualMembers: Array<{ member: FightTrackerMember; scanMember: FightTrackerScanMember }>;
  reactivatedMembers: Array<{ member: FightTrackerMember; scanMember: FightTrackerScanMember }>;
  missingMembers: FightTrackerMember[];
  existingMemberCount: number;
  hasChanges: boolean;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

const normalizeDisplayString = (value: unknown) => {
  const text = normalizeText(value).replace(/\u00a0/g, " ");
  if (!text || ["?", "-", "--", "n/a", "na", "null", "undefined"].includes(text.toLowerCase())) return null;
  return text;
};

const canonicalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

const normalizeScanRef = (value: unknown) => normalizeText(value).toLowerCase();

const normalizeLoose = (value: unknown) =>
  normalizeText(value)
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const asRecord = (value: unknown): JsonRecord | null =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;

const getPlayerValue = (record: JsonRecord, keys: readonly string[]) => {
  const sources = [record, asRecord(record.values), asRecord(record.latest), asRecord(asRecord(record.latest)?.values)].filter(
    (source): source is JsonRecord => Boolean(source),
  );

  for (const source of sources) {
    const canonical = new Map<string, unknown>();
    Object.entries(source).forEach(([key, value]) => {
      canonical.set(canonicalizeKey(key), value);
    });

    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
      const value = canonical.get(canonicalizeKey(key));
      if (value != null) return value;
    }
  }

  return undefined;
};

const readString = (record: JsonRecord, keys: readonly string[]) => {
  return normalizeDisplayString(getPlayerValue(record, keys));
};

const normalizeServer = (value: unknown) => normalizeServerKeyFromInput(value)?.toLowerCase() ?? normalizeText(value).toLowerCase().replace(/\s+/g, "");

const parseServerFromIdentifier = (value: unknown) => {
  const identifier = normalizeText(value);
  const match = identifier.match(/^(.+)_[pg][^_]+$/i);
  return match?.[1] ? normalizeServer(match[1]) : null;
};

const normalizeGuildSegment = (value: unknown) => {
  const raw = normalizeText(value).toLowerCase().replace(/\s+/g, "");
  if (!raw) return null;
  const identifierMatch = raw.match(/_g([^_]+)$/);
  if (identifierMatch?.[1]) return `g${identifierMatch[1]}`;
  const prefixedMatch = raw.match(/^g([^_]+)$/);
  if (prefixedMatch?.[1]) return `g${prefixedMatch[1]}`;
  if (/^\d+$/.test(raw)) return `g${raw}`;
  return raw;
};

const readGuildIdSegment = (record: JsonRecord) =>
  normalizeGuildSegment(
    readString(record, [
      "guildIdentifier",
      "Guild Identifier",
      "identifier",
      "Identifier",
      "groupIdentifier",
      "Group Identifier",
      "groupId",
      "groupid",
      "guildId",
      "guildid",
      "Guild ID",
      "id",
      "ID",
    ]),
  );

const readGuildName = (record: JsonRecord) =>
  readString(record, ["name", "Name", "groupname", "groupName", "guildName", "Guild Name", "guild", "Guild"]);

const getScanGuildIdentity = (guild: GuildHubSelectedGuild | FightTrackerGuild): ScanGuildIdentity => {
  const linkedGuildId = "guildId" in guild ? guild.guildId : guild.linkedGuildHubGuildId;
  const linkedLogoIdentifier = "logoIdentifier" in guild ? guild.logoIdentifier : guild.linkedGuildHubLogoIdentifier;

  return {
    name: guild.name,
    server: normalizeServer(guild.server),
    guildSegment: normalizeGuildSegment(linkedLogoIdentifier) ?? normalizeGuildSegment(linkedGuildId),
  };
};

const getRawScan = (scan: GuildHubLocalScan) => {
  const raw = asRecord(scan.rawData);
  if (!raw || !Array.isArray(raw.players)) return null;
  const groups = Array.isArray(raw.groups) ? raw.groups : Array.isArray(raw.guilds) ? raw.guilds : [];
  const normalizedMembers = Array.isArray(scan.normalizedMembers) ? scan.normalizedMembers : [];
  return {
    members: normalizedMembers,
    groups: groups.map(asRecord).filter((entry): entry is JsonRecord => Boolean(entry)),
  };
};

const timestampMs = (value: string | null | undefined) => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const normalizeVersion = (value: unknown) => {
  const parsed = normalizeNumber(value);
  return parsed != null && parsed >= 0 ? parsed : null;
};

const scanTimeMs = (scan: GuildHubLocalScan) => {
  const scannedAt = scan.scannedAt ? Date.parse(scan.scannedAt) : NaN;
  return Number.isFinite(scannedAt) ? scannedAt : null;
};

const scanTimeIso = (scan: GuildHubLocalScan) => {
  const ms = scanTimeMs(scan);
  return ms != null ? new Date(ms).toISOString() : null;
};

const isGroupMatch = (
  group: JsonRecord,
  guild: ScanGuildIdentity,
) => {
  const groupSegment = readGuildIdSegment(group);
  const groupServer =
    normalizeServer(readString(group, ["server", "Server", "prefix", "world", "realm"])) ||
    parseServerFromIdentifier(readString(group, ["identifier", "guildIdentifier"]));
  const serverMatches = !guild.server || !groupServer || guild.server === groupServer;
  if (guild.guildSegment && groupSegment && guild.guildSegment === groupSegment && serverMatches) return true;

  const groupName = readGuildName(group);
  return Boolean(groupName && normalizeLoose(groupName) === normalizeLoose(guild.name) && serverMatches);
};

const toScanMember = (member: NormalizedGuildMember, scan: GuildHubLocalScan): FightTrackerScanMember | null => {
  if (!member.memberRef || !member.name) return null;
  const scannedAt = scanTimeIso(scan);
  const hasStats = member.baseStats != null || member.totalStats != null;

  return {
    name: member.name,
    active: true,
    source: "scan",
    scanMemberRef: member.memberRef,
    className: member.classId,
    level: member.level,
    guildRole: member.guildRole,
    guildRoleSeenAt: member.guildRole ? scannedAt : null,
    baseStats: member.baseStats,
    totalStats: member.totalStats,
    statsSeenAt: hasStats ? scannedAt : null,
    baseStatsSum: member.baseStats,
    lastSeenScanId: scan.id,
    lastSeenScanAt: scannedAt,
    lastConfirmedActiveAt: scannedAt,
  };
};

export async function loadLatestScanSnapshotForGuild(
  guild: GuildHubSelectedGuild | FightTrackerGuild | null,
): Promise<FightTrackerScanSnapshot | null> {
  if (!guild) return null;
  const scans = await listGuildHubLocalScans();
  const guildIdentity = getScanGuildIdentity(guild);

  const snapshots = scans
    .map((scan) => {
      const raw = getRawScan(scan);
      if (!raw) return null;
      const group = raw.groups.find((entry) => isGroupMatch(entry, guildIdentity));
      const matchedGuild: ScanGuildIdentity = {
        ...guildIdentity,
        name: group ? readGuildName(group) ?? guildIdentity.name : guildIdentity.name,
        guildSegment: group ? readGuildIdSegment(group) ?? guildIdentity.guildSegment : guildIdentity.guildSegment,
      };
      const members = raw.members
        .filter((entry) => isNormalizedGuildMemberInGuild(entry, matchedGuild))
        .map((entry) => toScanMember(entry, scan))
        .filter((member): member is FightTrackerScanMember => Boolean(member));
      if (!group && !members.length) return null;
      return {
        scanId: scan.id,
        scanAt: scanTimeIso(scan),
        normalizerVersion: normalizeVersion(scan.normalizerVersion),
        guildName: matchedGuild.name,
        server: group ? readString(group, ["server", "Server", "prefix", "world", "realm"]) ?? guild.server ?? null : guild.server ?? null,
        members,
      } satisfies FightTrackerScanSnapshot;
    })
    .filter((snapshot): snapshot is FightTrackerScanSnapshot => Boolean(snapshot));

  return snapshots.sort((a, b) => (timestampMs(b.scanAt) ?? Number.NEGATIVE_INFINITY) - (timestampMs(a.scanAt) ?? Number.NEGATIVE_INFINITY))[0] ?? null;
}

export function buildFightTrackerSyncPlan(
  tracker: FightTrackerGuild,
  members: FightTrackerMember[],
  snapshot: FightTrackerScanSnapshot | null,
): FightTrackerSyncPlan | null {
  if (!snapshot) return null;

  const scanMs = timestampMs(snapshot.scanAt);
  const latestAppliedMs = timestampMs(tracker.lastSyncedScanAt);
  const scanNormalizerVersion = normalizeVersion(snapshot.normalizerVersion);
  const lastSyncedNormalizerVersion = normalizeVersion(tracker.lastSyncedNormalizerVersion);
  const isOlderThanApplied = scanMs != null && latestAppliedMs != null && scanMs < latestAppliedMs;
  const canApplyRosterChanges = !isOlderThanApplied;
  const hasNewerSnapshot = canApplyRosterChanges && scanMs != null && (latestAppliedMs == null || scanMs > latestAppliedMs);
  const hasNewerNormalizerVersion =
    scanNormalizerVersion != null && (lastSyncedNormalizerVersion == null || scanNormalizerVersion > lastSyncedNormalizerVersion);

  const lastConfirmedActiveMs = (member: FightTrackerMember) => {
    const explicit = timestampMs(member.lastConfirmedActiveAt);
    if (explicit != null) return explicit;
    const lastSeen = timestampMs(member.lastSeenScanAt);
    if (lastSeen != null) return lastSeen;
    const createdAt = member.source === "manual" ? timestampMs(member.createdAt) : null;
    return createdAt;
  };

  const canConfirmFromScan = (member: FightTrackerMember) => {
    if (!canApplyRosterChanges || scanMs == null) return false;
    const confirmedMs = lastConfirmedActiveMs(member);
    return confirmedMs == null || scanMs >= confirmedMs;
  };

  const canReactivateFromScan = (member: FightTrackerMember) => {
    const updatedMs = timestampMs(member.updatedAt);
    const createdMs = timestampMs(member.createdAt);
    const isUnchangedScanImport = member.source === "scan" && createdMs != null && updatedMs != null && createdMs === updatedMs;
    return !member.active && canConfirmFromScan(member) && (isUnchangedScanImport || updatedMs == null || scanMs == null || scanMs >= updatedMs);
  };

  const canInactivateFromScan = (member: FightTrackerMember) => {
    if (!canApplyRosterChanges || scanMs == null) return false;
    const confirmedMs = lastConfirmedActiveMs(member);
    return confirmedMs != null && scanMs > confirmedMs;
  };

  const canUpdateGuildRoleFromScan = (member: FightTrackerMember, scanMember: FightTrackerScanMember) => {
    if (!scanMember.guildRole) return false;
    const roleSeenAt = normalizeText(member.guildRoleSeenAt);
    if (!member.guildRole) return true;
    if (scanMs == null) return false;
    const roleSeenMs = timestampMs(roleSeenAt);
    if (roleSeenMs != null && scanMs < roleSeenMs) return false;
    return member.guildRole !== scanMember.guildRole || !roleSeenAt;
  };

  const canUpdateStatsFromScan = (member: FightTrackerMember, scanMember: FightTrackerScanMember) => {
    const incomingBaseStats = normalizeNumber(scanMember.baseStatsSum ?? scanMember.baseStats);
    const incomingTotalStats = normalizeNumber(scanMember.totalStats);
    if (incomingBaseStats == null && incomingTotalStats == null) return false;

    const existingBaseStats = normalizeNumber(member.baseStats);
    const existingTotalStats = normalizeNumber(member.totalStats);
    const hasExistingStats = existingBaseStats != null || existingTotalStats != null;
    const statsSeenAt = normalizeText(member.statsSeenAt);
    if (scanMs == null) return !hasExistingStats;

    const statsSeenMs = timestampMs(statsSeenAt);
    if (statsSeenMs != null && scanMs < statsSeenMs) return false;

    return (
      (incomingBaseStats != null && incomingBaseStats !== existingBaseStats) ||
      (incomingTotalStats != null && incomingTotalStats !== existingTotalStats) ||
      !statsSeenAt
    );
  };

  const byScanRef = new Map<string, FightTrackerMember>();
  const byName = new Map<string, FightTrackerMember>();
  members.forEach((member) => {
    const scanRef = normalizeScanRef(member.scanMemberRef);
    if (scanRef && !byScanRef.has(scanRef)) byScanRef.set(scanRef, member);
    const key = normalizeLoose(member.name);
    if (key && !byName.has(key)) byName.set(key, member);
  });

  const newMembers: FightTrackerScanMember[] = [];
  const existingMembers: Array<{ member: FightTrackerMember; scanMember: FightTrackerScanMember }> = [];
  const confirmedManualMembers: Array<{ member: FightTrackerMember; scanMember: FightTrackerScanMember }> = [];
  const reactivatedMembers: Array<{ member: FightTrackerMember; scanMember: FightTrackerScanMember }> = [];
  const matchedMemberIds = new Set<string>();
  let existingMemberCount = 0;
  let hasGuildRoleUpdates = false;
  let hasStatsUpdates = false;

  snapshot.members.forEach((scanMember) => {
    const existingByRef = byScanRef.get(normalizeScanRef(scanMember.scanMemberRef));
    if (existingByRef) {
      if (!matchedMemberIds.has(existingByRef.id)) {
        existingMemberCount += 1;
        matchedMemberIds.add(existingByRef.id);
        hasGuildRoleUpdates = hasGuildRoleUpdates || canUpdateGuildRoleFromScan(existingByRef, scanMember);
        hasStatsUpdates = hasStatsUpdates || canUpdateStatsFromScan(existingByRef, scanMember);
        if (canReactivateFromScan(existingByRef)) {
          reactivatedMembers.push({ member: existingByRef, scanMember });
        } else {
          existingMembers.push({ member: existingByRef, scanMember });
        }
      }
      return;
    }

    const existingByName = byName.get(normalizeLoose(scanMember.name));
    if (existingByName) {
      if (!matchedMemberIds.has(existingByName.id)) {
        existingMemberCount += 1;
        matchedMemberIds.add(existingByName.id);
        hasGuildRoleUpdates = hasGuildRoleUpdates || canUpdateGuildRoleFromScan(existingByName, scanMember);
        hasStatsUpdates = hasStatsUpdates || canUpdateStatsFromScan(existingByName, scanMember);
        if (existingByName.active && canConfirmFromScan(existingByName)) confirmedManualMembers.push({ member: existingByName, scanMember });
        if (canReactivateFromScan(existingByName)) {
          reactivatedMembers.push({ member: existingByName, scanMember });
        } else {
          existingMembers.push({ member: existingByName, scanMember });
        }
      }
      return;
    }

    newMembers.push(isOlderThanApplied ? { ...scanMember, active: false } : scanMember);
  });

  const missingMembers = members.filter((member) => member.active && !matchedMemberIds.has(member.id) && canInactivateFromScan(member));

  return {
    snapshot,
    newMembers,
    existingMembers,
    confirmedManualMembers,
    reactivatedMembers,
    missingMembers,
    existingMemberCount,
    hasChanges:
      newMembers.length > 0 ||
      confirmedManualMembers.length > 0 ||
      reactivatedMembers.length > 0 ||
      missingMembers.length > 0 ||
      hasGuildRoleUpdates ||
      hasStatsUpdates ||
      hasNewerNormalizerVersion ||
      hasNewerSnapshot,
  };
}
