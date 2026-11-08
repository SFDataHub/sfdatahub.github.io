import { useCallback, useEffect, useMemo, useState } from "react";
import { getClassMetaById } from "../../data/classes";
import { getGuildHubLocalScan, selectGuildHubRawSnapshot, type GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";
import { isNormalizedGuildMemberInGuild, readGuildScanMemberIdentity } from "../../lib/guilds/guildScanNormalizer";
import { normalizeSfPlayerCharacterCore } from "../../lib/parsing/normalizedPlayer";
import { readSfPlayerStats } from "../../lib/parsing/parseSfJson";
import { loadIdentityResolutionSnapshot } from "../../lib/identities/identityResolution";
import { captureLocalDataDependencies, revalidateLocalDataDependencies, subscribeToLocalDataDependencies } from "../../lib/local-data/localDataDependencies";
import { matchesLocalSourceValidity } from "../../lib/guilds/localSourceValidity";
import { isLocalPlayerSourceContextValid, type LocalPlayerSourceContext } from "./localPlayerCurrentSeed";
import type { GuildTrendSnapshot } from "../Playground/playerPerformanceModel";
import { readLocalGuildMemberValues, type LocalGuildStatsMember } from "./localGuildPlayerStats";
import { localGuildRankingIdentityKey, selectLocalGuildRankingComparison, type LocalGuildRankingComparison } from "./localGuildRanking";

type Current = { context: LocalPlayerSourceContext; scannedAtMs: number };
const empty: LocalGuildRankingComparison = { status: "idle", timestamp: null, members: [], identities: null };

export class LocalGuildRankingRosterError extends Error {
  constructor(readonly foundMemberCount: number, readonly validXpTotalCount: number, readonly validBaseStatsCount: number) {
    super("Incomplete ranking comparison roster");
  }
}

export function useLocalGuildRankingComparison(
  current: Current | null, members: readonly LocalGuildStatsMember[],
  completeSnapshots: readonly GuildTrendSnapshot[], summaries: readonly GuildHubScanSummary[], trendLoading: boolean,
) {
  const [requested, setRequested] = useState<Current | null>(null);
  const [revision, setRevision] = useState(0);
  const candidate = useMemo(() => current ? selectLocalGuildRankingComparison(completeSnapshots, current.scannedAtMs) : null, [completeSnapshots, current]);
  const [state, setState] = useState<{ current: Current | null; candidate: GuildTrendSnapshot | null; revision: number; value: LocalGuildRankingComparison }>({ current: null, candidate: null, revision: 0, value: empty });
  const request = useCallback(() => setRequested(current), [current]);
  const sourceSummary = summaries.find(summary => summary.sourceScanId === candidate?.sourceScanId);
  const summaryKey = sourceSummary ? JSON.stringify([sourceSummary.sourceScanId, sourceSummary.contentHash, sourceSummary.sourceGeneration]) : "";

  useEffect(() => {
    if (!current || requested !== current || trendLoading) return;
    let cancelled = false;
    const need = { allIdentities: true, sourceIds: [current.context.scan.id, ...(candidate ? [candidate.sourceScanId] : [])],
      playerAliases: members.map(member => member.key).filter(key => /^.+_p[^_]+$/i.test(key)),
      guildAliases: candidate ? [candidate.guildIdentifier] : [] };
    const stop = subscribeToLocalDataDependencies(need, () => setRevision(value => value + 1), undefined, { consumer: "guild-ranking-comparison" });
    const publish = (value: LocalGuildRankingComparison) => { if (!cancelled) setState({ current, candidate, revision, value }); };
    publish({ ...empty, status: candidate ? "loading" : "empty", timestamp: candidate?.scannedAtMs ?? null });
    if (candidate) void (async () => {
      try {
        const dependencies = await captureLocalDataDependencies(need);
        const [scan, identities] = await Promise.all([getGuildHubLocalScan(candidate.sourceScanId), loadIdentityResolutionSnapshot()]);
        if (cancelled) return;
        if (!scan || !matchesLocalSourceValidity(scan, sourceSummary)) throw Error("Ranking comparison source changed");
        const snapshot = selectGuildHubRawSnapshot(scan, candidate.scannedAtMs);
        if (!snapshot) throw Error("Ranking comparison snapshot unavailable");
        // Exact guild identifier comes from the identity-resolved, complete trend
        // snapshot. No name-only matching and no full player profile per row.
        const { members: historical, players } = readLocalGuildRankingComparisonMembers(snapshot.players, candidate, members, identities);
        const [validCurrent, validHistory] = await Promise.all([isLocalPlayerSourceContextValid(current.context), revalidateLocalDataDependencies(dependencies)]);
        if (cancelled) return;
        if (!validCurrent || !validHistory.current) throw Error("Ranking comparison evidence changed");
        publish({ status: "ready", timestamp: candidate.scannedAtMs, members: historical, players, identities });
      } catch { publish({ ...empty, status: "error", timestamp: candidate.scannedAtMs }); }
    })();
    return () => { cancelled = true; stop(); };
  }, [current, requested, candidate, revision, summaryKey, trendLoading, members]);

  const comparison = state.current === current && state.candidate === candidate && state.revision === revision && !trendLoading
    ? state.value : { ...empty, status: requested === current && current ? "loading" as const : "idle" as const };
  return { comparison, request };
}

/** One pass over the selected source; parse attributes only for the roster or
 * current identities. No per-row reads or full inventory preparation. */
export function readLocalGuildRankingComparisonMembers(
  rawPlayers: readonly unknown[], candidate: Pick<GuildTrendSnapshot, "guildIdentifier" | "foundUniqueMemberCount">,
  current: readonly LocalGuildStatsMember[], identities: Awaited<ReturnType<typeof loadIdentityResolutionSnapshot>>,
) {
  const wanted = new Set(current.map(member => localGuildRankingIdentityKey(member, identities)).filter(key => key != null));
  const members: LocalGuildStatsMember[] = [], players: LocalGuildStatsMember[] = [];
  const guild = { name: "", server: candidate.guildIdentifier.replace(/_g[^_]+$/i, ""), guildSegment: candidate.guildIdentifier };
  for (const raw of rawPlayers) {
    const identity = readGuildScanMemberIdentity(raw);
    if (!identity) continue;
    const key = identity.memberRef.toLowerCase();
    // The candidate certifies an identifier, never a name. In particular, an
    // empty target name must not match a non-Latin name reduced to empty text.
    const inGuild = isNormalizedGuildMemberInGuild({ ...identity, guildName: null }, guild);
    const playerIdentity = localGuildRankingIdentityKey({ key }, identities);
    if (!inGuild && (playerIdentity == null || !wanted.has(playerIdentity))) continue;
    const core = normalizeSfPlayerCharacterCore(raw);
    const stats = readSfPlayerStats(raw);
    const meta = getClassMetaById(core.identity.class ?? stats.classId);
    const member = { key, name: identity.name, classLabel: meta?.label ?? stats.classId, playerStats: readLocalGuildMemberValues(raw, core) };
    if (inGuild) members.push(member);
    players.push(member);
  }
  const found = new Set(members.map(member => member.key)).size;
  if (found !== candidate.foundUniqueMemberCount) throw new LocalGuildRankingRosterError(found,
    new Set(members.filter(member => member.playerStats.xpTotal != null).map(member => member.key)).size,
    new Set(members.filter(member => member.playerStats.sumBaseTotal != null).map(member => member.key)).size);
  return { members, players };
}

/** Value observations only: no membership/rank or completeness contribution. */
export function readLocalGuildRankingValueMembers(
  rawPlayers: readonly unknown[], wanted: ReadonlySet<string>,
  identities: Awaited<ReturnType<typeof loadIdentityResolutionSnapshot>>,
) {
  const players: LocalGuildStatsMember[] = [];
  for (const raw of rawPlayers) {
    const identity = readGuildScanMemberIdentity(raw);
    if (!identity) continue;
    const key = identity.memberRef.toLowerCase();
    const resolved = localGuildRankingIdentityKey({ key }, identities);
    if (!resolved || !wanted.has(resolved)) continue;
    const core = normalizeSfPlayerCharacterCore(raw);
    const stats = readSfPlayerStats(raw);
    const meta = getClassMetaById(core.identity.class ?? stats.classId);
    players.push({ key, name: identity.name, classLabel: meta?.label ?? stats.classId, playerStats: readLocalGuildMemberValues(raw, core) });
  }
  return players;
}
