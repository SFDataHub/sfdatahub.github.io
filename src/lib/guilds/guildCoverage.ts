import {
  normalizeGuildScanServer,
  normalizeGuildSegmentForScan,
  type NormalizedGuildMember,
} from "./guildScanNormalizer";
import type { GuildHubLogicalScanSnapshot } from "./localScanLibrary";

type JsonRecord = Record<string, unknown>;

export type GuildSnapshotCoverageStatus = "complete" | "incomplete" | "overcount" | "unknown";

export type GuildSnapshotCoverage = {
  snapshotTimestamp: number;
  server: string;
  guildIdentifier: string;
  guildName?: string;
  declaredMemberCount?: number;
  countedMemberCount: number;
  complete: boolean;
  status: GuildSnapshotCoverageStatus;
};

export type GuildCoverageSummary = {
  uniqueGuildCount: number;
  completeUniqueGuildCount: number;
  guildSnapshotCount: number;
  completeGuildSnapshotCount: number;
  incompleteGuildSnapshotCount: number;
  overcountGuildSnapshotCount: number;
  unknownGuildSnapshotCount: number;
  byServer: GuildCoverageServerSummary[];
};

export type GuildCoverageServerSummary = {
  server: string;
  uniqueGuildCount: number;
  completeUniqueGuildCount: number;
  guildSnapshotCount: number;
  completeGuildSnapshotCount: number;
  incompleteGuildSnapshotCount: number;
  overcountGuildSnapshotCount: number;
  unknownGuildSnapshotCount: number;
};

type GuildIdentity = {
  key: string;
  server: string;
  guildIdentifier: string;
};

type GuildCoverageDraft = GuildIdentity & {
  guildName?: string;
  declaredMemberCount?: number;
  memberRefs: Set<string>;
};

const GROUP_IDENTIFIER_KEYS = [
  "guildIdentifier",
  "Guild Identifier",
  "identifier",
  "Identifier",
  "groupIdentifier",
  "Group Identifier",
  "groupId",
  "groupid",
  "Group ID",
  "guildId",
  "guildid",
  "Guild ID",
  "id",
  "ID",
  "gid",
] as const;

const GROUP_SERVER_KEYS = ["server", "Server", "prefix", "world", "realm", "srv", "shard"] as const;

const GROUP_NAME_KEYS = ["name", "Name", "groupname", "groupName", "guildName", "Guild Name", "guild"] as const;

const DECLARED_MEMBER_COUNT_KEYS = [
  "guildMemberCount",
  "Guild Member Count",
  "memberCount",
  "count",
  "members",
] as const;

function asRecord(value: unknown): JsonRecord | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readFirst(record: JsonRecord, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function readFirstString(record: JsonRecord, keys: readonly string[]) {
  const value = readFirst(record, keys);
  return typeof value === "string" ? value.trim() || null : value == null ? null : String(value).trim() || null;
}

function normalizeCoverageServer(value: unknown): string | null {
  const normalized = normalizeGuildScanServer(value);
  return normalized ? normalized.toUpperCase() : null;
}

function parseServerFromGuildIdentifier(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const match = raw.match(/^(.+)_g[^_]+$/i);
  return match?.[1] ? normalizeCoverageServer(match[1]) : null;
}

function resolveSnapshotFallbackServer(snapshot: Pick<GuildHubLogicalScanSnapshot, "servers">): string | null {
  return snapshot.servers.length === 1 ? normalizeCoverageServer(snapshot.servers[0]) : null;
}

function isStableGuildSegment(segment: string | null): segment is string {
  return Boolean(segment && /^g[a-z0-9-]+$/i.test(segment));
}

function normalizeStableGuildIdentifier(value: unknown): string | null {
  const segment = normalizeGuildSegmentForScan(value);
  return isStableGuildSegment(segment) ? segment.toLowerCase() : null;
}

function identityKey(snapshotTimestamp: number, server: string, guildIdentifier: string) {
  return `${snapshotTimestamp}:${server.toLowerCase()}::${guildIdentifier.toLowerCase()}`;
}

function buildIdentity(
  snapshotTimestamp: number,
  server: string | null,
  guildIdentifier: string | null,
): GuildIdentity | null {
  if (!server || !guildIdentifier) return null;
  return {
    key: identityKey(snapshotTimestamp, server, guildIdentifier),
    server,
    guildIdentifier,
  };
}

function getMemberIdentity(
  snapshot: GuildHubLogicalScanSnapshot,
  member: NormalizedGuildMember,
): GuildIdentity | null {
  const guildIdentifier = normalizeStableGuildIdentifier(member.guildSegment ?? member.groupSegment);
  const server = normalizeCoverageServer(member.server) ?? resolveSnapshotFallbackServer(snapshot);
  return buildIdentity(snapshot.timestampMs, server, guildIdentifier);
}

function getGroupIdentity(snapshot: GuildHubLogicalScanSnapshot, group: JsonRecord): GuildIdentity | null {
  const rawGuildIdentifier = readFirstString(group, GROUP_IDENTIFIER_KEYS);
  const guildIdentifier = normalizeStableGuildIdentifier(rawGuildIdentifier);
  const server =
    normalizeCoverageServer(readFirst(group, GROUP_SERVER_KEYS)) ??
    parseServerFromGuildIdentifier(rawGuildIdentifier) ??
    normalizeCoverageServer(snapshot.rawData.prefix) ??
    resolveSnapshotFallbackServer(snapshot);

  return buildIdentity(snapshot.timestampMs, server, guildIdentifier);
}

function readPositiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function readDeclaredMemberCountFromSave(group: JsonRecord): number | undefined {
  const save = group.save ?? group.groupSave;
  if (!Array.isArray(save)) return undefined;
  return readPositiveInteger(save[3]);
}

function readDeclaredMemberCount(group: JsonRecord): number | undefined {
  return readPositiveInteger(readFirst(group, DECLARED_MEMBER_COUNT_KEYS)) ?? readDeclaredMemberCountFromSave(group);
}

function toStatus(declaredMemberCount: number | undefined, countedMemberCount: number): GuildSnapshotCoverageStatus {
  if (declaredMemberCount == null) return "unknown";
  if (countedMemberCount === declaredMemberCount) return "complete";
  if (countedMemberCount > declaredMemberCount) return "overcount";
  return "incomplete";
}

function getOrCreateDraft(drafts: Map<string, GuildCoverageDraft>, identity: GuildIdentity): GuildCoverageDraft {
  const existing = drafts.get(identity.key);
  if (existing) return existing;

  const draft: GuildCoverageDraft = {
    ...identity,
    memberRefs: new Set<string>(),
  };
  drafts.set(identity.key, draft);
  return draft;
}

export function deriveGuildCoverageForLogicalSnapshot(
  snapshot: GuildHubLogicalScanSnapshot,
): GuildSnapshotCoverage[] {
  const drafts = new Map<string, GuildCoverageDraft>();

  for (const member of snapshot.normalizedMembers) {
    const identity = getMemberIdentity(snapshot, member);
    if (!identity) continue;

    const memberRef = String(member.memberRef ?? "").trim().toLowerCase();
    if (!memberRef) continue;

    const draft = getOrCreateDraft(drafts, identity);
    draft.memberRefs.add(memberRef);
    if (!draft.guildName && member.guildName) draft.guildName = member.guildName;
  }

  for (const rawGroup of snapshot.groups) {
    const group = asRecord(rawGroup);
    if (!group) continue;

    const identity = getGroupIdentity(snapshot, group);
    if (!identity) continue;

    const draft = getOrCreateDraft(drafts, identity);
    const declaredMemberCount = readDeclaredMemberCount(group);
    if (declaredMemberCount != null) draft.declaredMemberCount = declaredMemberCount;

    const guildName = readFirstString(group, GROUP_NAME_KEYS);
    if (guildName) draft.guildName = guildName;
  }

  return [...drafts.values()]
    .map((draft) => {
      const countedMemberCount = draft.memberRefs.size;
      const status = toStatus(draft.declaredMemberCount, countedMemberCount);
      return {
        snapshotTimestamp: snapshot.timestampMs,
        server: draft.server,
        guildIdentifier: draft.guildIdentifier,
        ...(draft.guildName ? { guildName: draft.guildName } : {}),
        ...(draft.declaredMemberCount != null ? { declaredMemberCount: draft.declaredMemberCount } : {}),
        countedMemberCount,
        complete: status === "complete",
        status,
      };
    })
    .sort(
      (a, b) =>
        a.snapshotTimestamp - b.snapshotTimestamp ||
        a.server.localeCompare(b.server, undefined, { sensitivity: "base" }) ||
        a.guildIdentifier.localeCompare(b.guildIdentifier, undefined, { numeric: true, sensitivity: "base" }),
    );
}

export function deriveGuildCoverageForLogicalSnapshots(
  snapshots: GuildHubLogicalScanSnapshot[],
): GuildSnapshotCoverage[] {
  return snapshots.flatMap((snapshot) => deriveGuildCoverageForLogicalSnapshot(snapshot));
}

export function summarizeGuildCoverage(rows: GuildSnapshotCoverage[]): GuildCoverageSummary {
  const uniqueGuilds = new Set<string>();
  const completeUniqueGuilds = new Set<string>();
  const byServer = new Map<
    string,
    GuildCoverageServerSummary & { uniqueGuilds: Set<string>; completeUniqueGuilds: Set<string> }
  >();
  let completeGuildSnapshotCount = 0;
  let incompleteGuildSnapshotCount = 0;
  let overcountGuildSnapshotCount = 0;
  let unknownGuildSnapshotCount = 0;

  for (const row of rows) {
    const uniqueKey = `${row.server.toLowerCase()}::${row.guildIdentifier.toLowerCase()}`;
    uniqueGuilds.add(uniqueKey);
    const serverKey = row.server.toLowerCase();
    const serverSummary =
      byServer.get(serverKey) ??
      {
        server: row.server,
        uniqueGuildCount: 0,
        completeUniqueGuildCount: 0,
        guildSnapshotCount: 0,
        completeGuildSnapshotCount: 0,
        incompleteGuildSnapshotCount: 0,
        overcountGuildSnapshotCount: 0,
        unknownGuildSnapshotCount: 0,
        uniqueGuilds: new Set<string>(),
        completeUniqueGuilds: new Set<string>(),
      };

    serverSummary.guildSnapshotCount += 1;
    serverSummary.uniqueGuilds.add(uniqueKey);

    if (row.complete) {
      completeGuildSnapshotCount += 1;
      completeUniqueGuilds.add(uniqueKey);
      serverSummary.completeGuildSnapshotCount += 1;
      serverSummary.completeUniqueGuilds.add(uniqueKey);
    } else if (row.status === "overcount") {
      overcountGuildSnapshotCount += 1;
      serverSummary.overcountGuildSnapshotCount += 1;
    } else if (row.status === "unknown") {
      unknownGuildSnapshotCount += 1;
      serverSummary.unknownGuildSnapshotCount += 1;
    } else {
      incompleteGuildSnapshotCount += 1;
      serverSummary.incompleteGuildSnapshotCount += 1;
    }

    byServer.set(serverKey, serverSummary);
  }

  return {
    uniqueGuildCount: uniqueGuilds.size,
    completeUniqueGuildCount: completeUniqueGuilds.size,
    guildSnapshotCount: rows.length,
    completeGuildSnapshotCount,
    incompleteGuildSnapshotCount,
    overcountGuildSnapshotCount,
    unknownGuildSnapshotCount,
    byServer: [...byServer.values()]
      .map(({ uniqueGuilds, completeUniqueGuilds, ...summary }) => ({
        ...summary,
        uniqueGuildCount: uniqueGuilds.size,
        completeUniqueGuildCount: completeUniqueGuilds.size,
      }))
      .sort((a, b) => a.server.localeCompare(b.server, undefined, { numeric: true, sensitivity: "base" })),
  };
}
