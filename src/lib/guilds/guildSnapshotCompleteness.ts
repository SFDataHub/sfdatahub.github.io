import type {
  GuildAnalyticsDerivedData,
  GuildAnalyticsGuildSnapshot,
  GuildAnalyticsMemberSnapshot,
} from "./localGuildAnalyticsStore";

export type GuildSnapshotCompletenessReport = {
  snapshotId: string;
  sourceScanId: string;
  sourceScanFilename: string;
  scannedAtMs: number;
  guildName: string | null;
  guildIdentifier: string | null;
  declaredMemberCount: number | null;
  foundUniqueMemberCount: number;
  validXpTotalCount: number;
  validFocusedBaseStatsCount: number;
  completeForPerformance: boolean;
  exclusionReason: string | null;
};

export function buildGuildSnapshotCompletenessReports(data: GuildAnalyticsDerivedData | null | undefined) {
  if (!data) return [];
  const membersBySnapshotGuild = new Map<string, GuildAnalyticsMemberSnapshot[]>();

  data.members.forEach((member) => {
    if (!member.guildIdentifier) return;
    const key = snapshotGuildKey(member.snapshotId, member.guildIdentifier);
    const members = membersBySnapshotGuild.get(key) ?? [];
    members.push(member);
    membersBySnapshotGuild.set(key, members);
  });

  return data.guilds.map((guild) => buildGuildSnapshotCompletenessReport(guild, membersBySnapshotGuild));
}

export function snapshotGuildKey(snapshotId: string, guildIdentifier: string) {
  return `${snapshotId}::${guildIdentifier.toLowerCase()}`;
}

function buildGuildSnapshotCompletenessReport(
  guild: GuildAnalyticsGuildSnapshot,
  membersBySnapshotGuild: Map<string, GuildAnalyticsMemberSnapshot[]>,
): GuildSnapshotCompletenessReport {
  const members = guild.guildIdentifier
    ? membersBySnapshotGuild.get(snapshotGuildKey(guild.snapshotId, guild.guildIdentifier)) ?? []
    : [];
  const uniqueMembers = dedupeSnapshotMembers(members);
  const declaredMemberCount = isPlausibleMemberCount(guild.memberCount) ? guild.memberCount : null;
  const foundUniqueMemberCount = uniqueMembers.length;
  const validXpTotalCount = uniqueMembers.filter((member) => isFiniteNumber(member.xpTotal)).length;
  const validFocusedBaseStatsCount = uniqueMembers.filter((member) => isFiniteNumber(member.focusedBaseStats)).length;
  const exclusionReason = getGuildSnapshotExclusionReason({
    declaredMemberCount,
    foundUniqueMemberCount,
    validXpTotalCount,
    validFocusedBaseStatsCount,
  });

  return {
    snapshotId: guild.snapshotId,
    sourceScanId: guild.sourceScanId,
    sourceScanFilename: guild.sourceScanFilename,
    scannedAtMs: guild.snapshotTimestamp,
    guildName: guild.guildName,
    guildIdentifier: guild.guildIdentifier,
    declaredMemberCount,
    foundUniqueMemberCount,
    validXpTotalCount,
    validFocusedBaseStatsCount,
    completeForPerformance: exclusionReason == null,
    exclusionReason,
  };
}

function dedupeSnapshotMembers(members: GuildAnalyticsMemberSnapshot[]) {
  const byRef = new Map<string, GuildAnalyticsMemberSnapshot>();
  members.forEach((member) => {
    const key = member.memberRef.toLowerCase();
    const previous = byRef.get(key);
    if (!previous || scoreMemberValues(member) >= scoreMemberValues(previous)) byRef.set(key, member);
  });
  return [...byRef.values()];
}

function getGuildSnapshotExclusionReason({
  declaredMemberCount,
  foundUniqueMemberCount,
  validXpTotalCount,
  validFocusedBaseStatsCount,
}: {
  declaredMemberCount: number | null;
  foundUniqueMemberCount: number;
  validXpTotalCount: number;
  validFocusedBaseStatsCount: number;
}) {
  if (declaredMemberCount == null) return "Deklarierter Member Count fehlt oder ist ungültig.";
  if (foundUniqueMemberCount !== declaredMemberCount) {
    return `Gefundene eindeutige Member (${foundUniqueMemberCount}) weichen vom deklarierten Member Count (${declaredMemberCount}) ab.`;
  }
  if (validXpTotalCount !== declaredMemberCount) {
    return `XP Total ist nur für ${validXpTotalCount}/${declaredMemberCount} Member verfügbar.`;
  }
  if (validFocusedBaseStatsCount !== declaredMemberCount) {
    return `Fokussierte Basiswerte sind nur für ${validFocusedBaseStatsCount}/${declaredMemberCount} Member verfügbar.`;
  }
  return null;
}

function scoreMemberValues(member: GuildAnalyticsMemberSnapshot) {
  return Number(isFiniteNumber(member.xpTotal)) + Number(isFiniteNumber(member.focusedBaseStats));
}

function isPlausibleMemberCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
