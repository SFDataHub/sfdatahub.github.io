import { normalizeSfPlayerCharacterCore, type NormalizedPlayer } from "../parsing/normalizedPlayer";
import { readProfileAttributeSums, type ProfileAttributeSums, type ProfileSumPair } from "../players/profileAttributeSums";
import type { AttributeSumMode } from "../settings/preferences";
import type { GuildAnalyticsDerivedData, GuildAnalyticsMemberSnapshot } from "../guilds/localGuildAnalyticsStore";
import { readGuildHubRawSnapshots, type GuildHubLocalScan, type GuildHubScanSummary } from "../guilds/localScanLibrary";
import { normalizeGuildScanServer, readGuildScanMemberIdentity } from "../guilds/guildScanNormalizer";
import { observationReferenceKey } from "../servers/serverResolver";
import { matchesLocalSourceValidity } from "../guilds/localSourceValidity";
import { readStoredGuildProgressValues } from "../../pages/Playground/progressRadarModel";

export type ProfileHistoryMember = GuildAnalyticsMemberSnapshot & {
  profileAllSums?: ProfileSumPair;
  profileSums?: ProfileAttributeSums;
  profileBaseStats?: number | null;
  profileTotalStats?: number | null;
};
export type ProfileSumScope = { players: readonly string[]; guilds: readonly string[] };
export type ProfileHistoryData = Omit<GuildAnalyticsDerivedData, "members"> & { members: ProfileHistoryMember[] };

// Normalization and this profile extension run in the same source worker. Reuse
// its components; the weak keys never retain a scan, core or physical row.
const prepared = new WeakMap<object, { sums: ProfileAttributeSums; hofRank: number | null }>();
export function rememberProfileSumComponents(raw: object, core: NormalizedPlayer | null) {
  prepared.set(raw, { sums: readProfileAttributeSums(raw, core), hofRank: core?.progression.rank ?? null });
}

/** Extend only the already requested, validated source. No persistence, source
 * substitution, identity matching, generic-sum fallback or new downloads. */
export function prepareProfileSumHistory(data: GuildAnalyticsDerivedData, scan: GuildHubLocalScan, summary: GuildHubScanSummary, scope?: ProfileSumScope,
  includeStoredProgress = false): ProfileHistoryData {
  if (scan.id !== summary.sourceScanId || !matchesLocalSourceValidity(scan, summary) || scan.contentHash !== summary.contentHash ||
      (scan.updatedAt ?? scan.importedAt) !== (summary.updatedAtIso ?? summary.importedAtIso)) throw Error("Profile sum source changed");
  const players = new Set(scope?.players.map(observationReferenceKey));
  const guilds = new Set(scope?.guilds.map(observationReferenceKey));
  // Latest player membership is discovered from the prepared source itself.
  for (const row of data.members) if (players.has(observationReferenceKey(row.memberRef)) && row.guildIdentifier) guilds.add(observationReferenceKey(row.guildIdentifier));
  const wanted = scope ? new Set(data.members.filter(row => players.has(observationReferenceKey(row.memberRef)) ||
    row.guildIdentifier && guilds.has(observationReferenceKey(row.guildIdentifier))).map(row => row.memberRef.toLowerCase())) : null;
  const observations = new Map<string, Map<string, object[]>>();
  for (const snapshot of readGuildHubRawSnapshots(scan)) {
    const players = new Map<string, object[]>();
    const rawScan = scan.rawData as Record<string, unknown> | null;
    const fallback = normalizeGuildScanServer(rawScan?.prefix ?? rawScan?.server);
    for (const raw of snapshot.players) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const member = readGuildScanMemberIdentity(raw, fallback);
      if (!member) continue;
      const ref = member.memberRef.toLowerCase();
      if (wanted && !wanted.has(ref)) continue;
      const rows = players.get(ref) ?? [];
      rows.push(raw); players.set(ref, rows);
    }
    observations.set(`${scan.id}::${snapshot.timestampMs}`, players);
  }
  return { ...data, members: data.members.map(row => {
    if (wanted && !wanted.has(row.memberRef.toLowerCase())) return row;
    if (row.sourceScanId !== scan.id || row.snapshotId !== `${scan.id}::${row.snapshotTimestamp}` ||
        row.sourceGeneration !== scan.sourceGeneration) throw Error("Profile sum observation changed");
    const prefix = `${row.snapshotId}::member::${row.memberRef}::`;
    const suffix = row.id.startsWith(prefix) ? row.id.slice(prefix.length) : "";
    const index = /^\d+$/.test(suffix) ? Number(suffix) : -1;
    // Preserve the physical duplicate index; never substitute another row.
    const raw = observations.get(row.snapshotId)?.get(row.memberRef.toLowerCase())?.[index];
    let components = raw ? prepared.get(raw) : undefined;
    if (raw && !components) {
      const core = normalizeSfPlayerCharacterCore(raw);
      rememberProfileSumComponents(raw, core);
      components = prepared.get(raw);
    }
    const sums = components?.sums;
    const extended = { ...row };
    // Older progress markers need only these bound visible rows. Do not upgrade
    // the entire Source's progress population for a single selected chart.
    if (includeStoredProgress && raw) {
      const values = readStoredGuildProgressValues(raw as Record<string, unknown>, row.classId);
      for (const key of Object.keys(values) as Array<keyof typeof values>) {
        const value = row[key];
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) extended[key] = values[key];
      }
    }
    return { ...extended, hofRank: row.hofRank ?? components?.hofRank ?? null,
      profileSums: sums, profileAllSums: sums?.["all-five"] ?? { base: null, total: null } };
  }) };
}

/** Copies belong to the profile, leaving every stored analytics field intact. */
export function projectProfileSumHistory(data: ProfileHistoryData, mode: AttributeSumMode): ProfileHistoryData {
  return { ...data, members: data.members.map(row => ({ ...row,
    profileBaseStats: mode === "all-five" ? row.profileAllSums?.base ?? null : row.focusedBaseStats,
    profileTotalStats: mode === "all-five" ? row.profileAllSums?.total ?? null : row.focusedTotalStats ?? null,
  })) };
}
