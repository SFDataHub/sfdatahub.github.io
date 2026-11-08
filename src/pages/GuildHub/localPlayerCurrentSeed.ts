import { serverComparisonKey } from "../../lib/servers/serverResolver";
import {
  getGuildHubLocalScan, readGuildHubLocalScanSourceValidity, selectGuildHubRawSnapshot,
  type GuildHubLocalScan,
} from "../../lib/guilds/localScanLibrary";
import { hasCurrentLocalSourceValidity, matchesLocalSourceValidity, type LocalSourceValidity } from "../../lib/guilds/localSourceValidity";
import { captureLocalDataDependencies, revalidateLocalDataDependencies, type LocalDependencyReceipt } from "../../lib/local-data/localDataDependencies";
import { readGuildScanMemberIdentity, isNormalizedGuildMemberInGuild, normalizeGuildSegmentForScan } from "../../lib/guilds/guildScanNormalizer";
import { parsePlayerIdentifier } from "../../lib/players/identifier";
import type { NormalizedPlayer } from "../../lib/parsing/normalizedPlayer";

type JsonRecord = Record<string, unknown>;
export type LocalPlayerObservation = {
  sourceScanId: string;
  sourcePlayerKey: string;
  sourceMemberRef?: string | null;
  scannedAtMs: number;
  scannedAtIso: string | null;
  guildRole?: import("../../lib/guilds/guildScanNormalizer").NormalizedGuildRole;
  guild: { name: string | null; server: string | null; identifier?: string | null; hofRank?: number | null };
};

/** Ephemeral references for one physical observation, never a persisted pool. */
export type LocalPlayerCurrentSeed = LocalPlayerObservation & {
  snapshotId: string;
  validity: LocalSourceValidity;
  contentHash: string;
  updatedAt: string;
  dependencies: LocalDependencyReceipt;
  rawIdentifier: string | null;
  rawPlayer: JsonRecord;
  normalizedCore?: NormalizedPlayer | null;
  preparedInsights?: import("../../components/local-player-profile/localPlayerInsightsModel").LocalCurrentInsights;
  guildPlayers: readonly JsonRecord[];
  guildGroups: readonly JsonRecord[];
  coreLookup?: Map<JsonRecord, NormalizedPlayer | null>;
};

export type LocalPlayerSourceContext = {
  scan: GuildHubLocalScan;
  dependencies: LocalDependencyReceipt;
  coreLookup: Map<JsonRecord, NormalizedPlayer | null>;
};

const record = (value: unknown): JsonRecord | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
const serverKey = (value: unknown) => serverComparisonKey(value)?.toLowerCase() ?? null;

export async function isLocalPlayerSourceContextValid(context: LocalPlayerSourceContext) {
  const [sources, dependency] = await Promise.all([
    readGuildHubLocalScanSourceValidity([context.scan.id]), revalidateLocalDataDependencies(context.dependencies),
  ]);
  const source = sources.get(context.scan.id);
  return dependency.current && matchesLocalSourceValidity(context.scan, source) &&
    source?.contentHash === context.scan.contentHash &&
    (source.updatedAtIso ?? source.importedAtIso) === (context.scan.updatedAt ?? context.scan.importedAt);
}

export function matchesPlayerObservationRow(row: JsonRecord, target: LocalPlayerObservation) {
  const member = readGuildScanMemberIdentity(row, target.guild.server);
  if (!member) return false;
  const expectedServer = serverKey(target.guild.server);
  if (expectedServer && serverKey(member.server) !== expectedServer) return false;
  const key = target.sourceMemberRef ?? target.sourcePlayerKey;
  const parsed = parsePlayerIdentifier(key);
  const actual = parsePlayerIdentifier(member.memberRef);
  if (parsed && actual) return parsed.playerId === actual.playerId && serverComparisonKey(parsed.serverKey) === serverComparisonKey(actual.serverKey);
  // Retain only the already established dashboard locator, including its
  // unique-name fallback. This does not introduce a new name resolver.
  return member.memberRef.toLowerCase() === key.toLowerCase();
}

export function createLocalPlayerCurrentSeed(
  context: LocalPlayerSourceContext, target: LocalPlayerObservation, selectedRaw?: unknown,
): LocalPlayerCurrentSeed | null {
  const { scan, dependencies, coreLookup } = context;
  if (scan.id !== target.sourceScanId || !hasCurrentLocalSourceValidity(scan)) return null;
  const snapshot = selectGuildHubRawSnapshot(scan, target.scannedAtMs);
  if (!snapshot) return null;
  const players = snapshot.players.map(record).filter((row): row is JsonRecord => Boolean(row));
  const matches = players.filter(row => matchesPlayerObservationRow(row, target));
  if (matches.length !== 1 || (selectedRaw !== undefined && matches[0] !== selectedRaw)) return null;
  const rawPlayer = matches[0];
  const identity = { name: target.guild.name ?? "", server: target.guild.server, guildSegment: normalizeGuildSegmentForScan(target.guild.identifier) };
  const guildPlayers = players.filter(row => {
    const member = readGuildScanMemberIdentity(row, target.guild.server);
    return Boolean(member && isNormalizedGuildMemberInGuild(member, identity));
  });
  return {
    ...target,
    snapshotId: `${scan.id}::${snapshot.timestampMs}`,
    validity: { sourceGeneration: scan.sourceGeneration, normalizerVersion: scan.normalizerVersion, coreNormalizerVersion: scan.coreNormalizerVersion },
    contentHash: scan.contentHash,
    updatedAt: scan.updatedAt ?? scan.importedAt,
    dependencies,
    rawIdentifier: parsePlayerIdentifier(rawPlayer.identifier ?? rawPlayer.Identifier)?.identifier ??
      readGuildScanMemberIdentity(rawPlayer, target.guild.server)?.memberRef ?? null,
    rawPlayer,
    ...(coreLookup.has(rawPlayer) ? { normalizedCore: coreLookup.get(rawPlayer) } : {}),
    guildPlayers,
    guildGroups: snapshot.groups.map(record).filter((row): row is JsonRecord => Boolean(row)),
    coreLookup,
  };
}

export async function isLocalPlayerCurrentSeedValid(seed: LocalPlayerCurrentSeed, target: LocalPlayerObservation, diagnosticContext?: import("../../lib/data-hub/runtimeAudit").AuditFields, dependenciesCheckedBySubscription = false) {
  if (seed.snapshotId !== `${target.sourceScanId}::${target.scannedAtMs}` || seed.sourceScanId !== target.sourceScanId || seed.sourcePlayerKey !== target.sourcePlayerKey ||
      seed.scannedAtMs !== target.scannedAtMs || seed.sourceMemberRef !== target.sourceMemberRef ||
      serverKey(seed.guild.server) !== serverKey(target.guild.server) ||
      seed.guild.identifier !== target.guild.identifier || seed.guild.name !== target.guild.name ||
      !matchesPlayerObservationRow(seed.rawPlayer, target)) return false;
  if (typeof document !== "undefined" && typeof Worker !== "undefined") {
    const { sharedAnalyticsPreparation } = await import("../../lib/local-player-profile/sharedPreparation");
    const lease = sharedAnalyticsPreparation.acquire("profile");
    try {
      const result = await lease.runProfile<{ valid: boolean }>(`profile-validity:${seed.sourceScanId}`, { kind: "profile-validity",
        sourceId: seed.sourceScanId, validity: seed.validity, contentHash: seed.contentHash, updatedAt: seed.updatedAt,
        dependencies: seed.dependencies, dependenciesChecked: dependenciesCheckedBySubscription }, new AbortController().signal);
      return result.valid;
    } finally { lease.release(); }
  }
  const [sources, dependency] = await Promise.all([
    readGuildHubLocalScanSourceValidity([seed.sourceScanId]), dependenciesCheckedBySubscription ? Promise.resolve({ current: true }) : revalidateLocalDataDependencies(seed.dependencies, diagnosticContext),
  ]);
  const source = sources.get(seed.sourceScanId);
  return dependency.current && matchesLocalSourceValidity(seed.validity, source) &&
    source?.contentHash === seed.contentHash && (source.updatedAtIso ?? source.importedAtIso) === seed.updatedAt;
}

/** No acquisition: a stale/missing seed only reads its named local source. */
export async function resolveLocalPlayerCurrentSeed(
  target: LocalPlayerObservation, seed?: LocalPlayerCurrentSeed,
  allowed: () => boolean = () => true,
  onRawRead: () => void = () => {},
  includeInsights = true,
): Promise<LocalPlayerCurrentSeed | null> {
  if (seed) {
    const valid = await isLocalPlayerCurrentSeedValid(seed, target);
    if (!allowed()) return null;
    // A stripped worker seed can serve the hero; only an insights consumer
    // needs to reacquire its guild inputs through the existing worker path.
    if (valid && (!includeInsights || seed.preparedInsights || seed.guildPlayers.length ||
      typeof document === "undefined" || typeof Worker === "undefined")) return seed;
  }
  if (typeof document !== "undefined" && typeof Worker !== "undefined") {
    const { sharedAnalyticsPreparation } = await import("../../lib/local-player-profile/sharedPreparation");
    const lease = sharedAnalyticsPreparation.acquire("profile"), controller = new AbortController();
    const timer = setInterval(() => { if (!allowed()) controller.abort(); }, 50);
    try {
      if (!allowed()) return null;
      onRawRead();
      const result = await lease.runProfile<{ seed: LocalPlayerCurrentSeed | null }>(JSON.stringify(["profile-current", target, includeInsights]),
        { kind: "profile-current", target, includeInsights }, controller.signal);
      return allowed() && result.seed && await isLocalPlayerCurrentSeedValid(result.seed, target) && allowed() ? result.seed : null;
    } finally { clearInterval(timer); lease.release(); }
  }
  const dependencies = await captureLocalDataDependencies({ sourceIds: [target.sourceScanId] });
  if (!allowed()) return null;
  onRawRead();
  const scan = await getGuildHubLocalScan(target.sourceScanId);
  if (!allowed() || !scan) return null;
  const dependency = await revalidateLocalDataDependencies(dependencies);
  if (!allowed() || !dependency.current) return null;
  const next = createLocalPlayerCurrentSeed({ scan, dependencies, coreLookup: new Map() }, target);
  if (!next) return null;
  const valid = await isLocalPlayerCurrentSeedValid(next, target);
  return allowed() && valid ? next : null;
}
