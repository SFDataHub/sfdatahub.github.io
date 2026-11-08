import { readGuildScanMemberIdentity, normalizeGuildScanServer, normalizeGuildSegmentForScan } from "../../lib/guilds/guildScanNormalizer";
import { resolvePlayerIdentity, type IdentityResolutionSnapshot } from "../../lib/identities/identityResolution";
import type { GuildAnalyticsMemberSnapshot, GuildAnalyticsGuildSnapshot } from "../../lib/guilds/localGuildAnalyticsStore";
import { serverComparisonKey } from "../../lib/servers/serverResolver";
import { isGuildHubScanAnalyticsEnabled, getGuildHubLocalScan, type GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";

export type TransferGuildStand = { sourceScanId: string; scannedAtMs: number; server: string };

/** Apply the dashboard's latest >=28-day comparison rule independently to each
 * confirmed reference namespace. The selected roster's own stand stays pinned.
 * No common millisecond, month bucket, name match or nearest-source fallback. */
export function selectTransferGuildStands(
  summaries: readonly GuildHubScanSummary[], memberRefs: readonly string[], identities: IdentityResolutionSnapshot | null,
  currentTimestamp: number, selected: TransferGuildStand,
): TransferGuildStand[] {
  const selectedServer = serverComparisonKey(selected.server);
  const servers = new Set(memberRefs.flatMap(ref => {
    const resolved = identities ? resolvePlayerIdentity(identities, ref) : null;
    return (resolved?.resolved ? resolved.aliasIdentifiers : [ref]).flatMap(alias => {
      const full = /^(.+)_p[^_]+$/i.exec(alias), server = full && serverComparisonKey(full[1]);
      return server ? [server] : [];
    });
  }));
  const stands = [selected];
  for (const server of servers) {
    if (server === selectedServer) continue;
    const candidates = summaries.filter(isGuildHubScanAnalyticsEnabled).flatMap(summary => summary.guilds.flatMap(guild => {
      if (serverComparisonKey(guild.server) !== server) return [];
      const guildTime = Date.parse(guild.sourceScannedAt ?? "");
      const at = Number.isFinite(guildTime) ? guildTime : summary.lastSnapshotTimestamp ?? Date.parse(summary.scannedAt ?? "");
      if (!Number.isFinite(at) || currentTimestamp - at < 28 * 86400000) return [];
      return [{ sourceScanId: summary.sourceScanId, scannedAtMs: at, server,
        filename: guild.sourceScanFilename ?? summary.filename }];
    })).sort((a, b) => b.scannedAtMs - a.scannedAtMs ||
      a.filename.localeCompare(b.filename, undefined, { sensitivity: "base" }) || a.sourceScanId.localeCompare(b.sourceScanId));
    if (candidates[0]) {
      const { filename: _filename, ...stand } = candidates[0];
      stands.push(stand);
    }
  }
  return stands;
}

/** One batched prepared-source read; each membership is joined to guild names
 * within its own exact source/snapshot/server before merging the lookups. */
export async function readTransferGuildStands(
  stands: readonly TransferGuildStand[], summaries: readonly GuildHubScanSummary[], seed: TransferGuildLookup,
  allowed: () => boolean = () => true,
): Promise<TransferGuildLookup> {
  if (!stands.length) return seed;
  const sourceIds = [...new Set(stands.map(stand => stand.sourceScanId))];
  const { ensureGuildAnalyticsSourceDataFromSummaries } = await import("../../lib/guilds/localGuildAnalyticsStore");
  const data = await ensureGuildAnalyticsSourceDataFromSummaries(summaries.filter(s => sourceIds.includes(s.sourceScanId)),
    { loadSourceById: getGuildHubLocalScan, readSourceIds: sourceIds });
  if (!allowed()) throw Error("dashboard_context_changed");
  const result = new Map(seed);
  for (const stand of stands) {
    const matches = (row: { sourceScanId: string; snapshotTimestamp: number; server: string | null }) =>
      row.sourceScanId === stand.sourceScanId && row.snapshotTimestamp === stand.scannedAtMs &&
      serverComparisonKey(row.server) === serverComparisonKey(stand.server);
    for (const [ref, status] of buildTransferGuildLookup(data.members.filter(matches), data.guilds.filter(matches))) {
      result.set(ref, result.has(ref) && !sameStatus(result.get(ref)!, status) ? { kind: "unavailable", reason: "conflict" } : status);
    }
  }
  return result;
}

export type TransferGuildStatus = { kind: "guild"; name: string } | { kind: "none" } |
  { kind: "unavailable"; reason?: "not-checked" | "no-observation" | "missing-membership" | "conflict" };
export type TransferGuildLookup = ReadonlyMap<string, TransferGuildStatus>;
const sameStatus = (a: TransferGuildStatus, b: TransferGuildStatus) => a.kind === b.kind && (a.kind !== "guild" || b.kind === "guild" && a.name === b.name) &&
  (a.kind !== "unavailable" || b.kind === "unavailable" && a.reason === b.reason);
type GuildObservation = Pick<GuildAnalyticsGuildSnapshot, "guildIdentifier" | "guildSegment" | "server" | "guildName">;
type PlayerObservation = Pick<GuildAnalyticsMemberSnapshot, "memberRef" | "guildSegment" | "groupSegment" | "server">;
const guildKey = (server: string | null, segment: string | null) => {
  const normalized = normalizeGuildSegmentForScan(segment);
  const normalizedServer = normalizeGuildScanServer(server);
  return normalized && normalizedServer ? `${normalizedServer}:${normalized}` : null;
};
const text = (value: unknown) => {
  const result = typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  return result && !["?", "-", "--", "n/a", "null", "undefined"].includes(result.toLowerCase()) ? result : null;
};
const field = (row: Record<string, unknown>, keys: string[]) => keys.map(key => text(row[key])).find(value => value !== null) ?? null;

/** Compact, scan-bound evidence. Conflicting rows never invent one guild. */
export function buildTransferGuildLookup(players: readonly PlayerObservation[], guilds: readonly GuildObservation[]): TransferGuildLookup {
  const names = new Map<string, string | null>();
  for (const guild of guilds) {
    const key = guildKey(guild.server, guild.guildSegment ?? guild.guildIdentifier);
    const name = text(guild.guildName);
    if (key && name) names.set(key, names.has(key) && names.get(key) !== name ? null : name);
  }
  const result = new Map<string, TransferGuildStatus>();
  for (const player of players) {
    const key = player.memberRef.toLowerCase();
    const segments = [player.guildSegment, player.groupSegment].map(normalizeGuildSegmentForScan).filter((value): value is string => value !== null);
    const consistent = segments.length > 0 && segments.every(value => value === segments[0]);
    const group = consistent ? guildKey(player.server, segments[0]) : null;
    const name = group ? names.get(group) ?? null : null;
    // The established normalizer preserves an explicit 0 as g0. Missing fields
    // stay null. A contradictory nonzero identifier cannot prove guildlessness.
    const status: TransferGuildStatus = name ? { kind: "guild", name }
      : consistent && segments[0] === "g0" && (!group || !names.has(group)) ? { kind: "none" }
        : { kind: "unavailable", reason: segments.length > 0 && !consistent || group != null && names.has(group) && names.get(group) === null ? "conflict" : "missing-membership" };
    result.set(key, result.has(key) && !sameStatus(result.get(key)!, status) ? { kind: "unavailable", reason: "conflict" } : status);
  }
  return result;
}

/** Read membership only from the existing current snapshot, including outsiders.
 * No core normalization, source read or history request. */
export function buildCurrentTransferGuildLookup(snapshot: { players: readonly unknown[]; groups: readonly unknown[] }, fallbackServer: string | null = null, preparedPlayers?: readonly PlayerObservation[]): TransferGuildLookup {
  const players = preparedPlayers ?? snapshot.players.map(row => readGuildScanMemberIdentity(row, fallbackServer)).filter((row): row is NonNullable<typeof row> => row !== null);
  const guilds = snapshot.groups.flatMap(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const row = value as Record<string, unknown>;
    const identifier = field(row, ["guildIdentifier", "Guild Identifier", "identifier", "Identifier", "groupIdentifier", "Group Identifier", "groupId", "guildId", "Guild ID", "id", "ID"]);
    const server = field(row, ["server", "Server", "prefix", "world", "realm"]) ?? (identifier?.includes("_g") ? identifier.replace(/_g[^_]+$/i, "") : fallbackServer);
    return [{ guildIdentifier: identifier, guildSegment: normalizeGuildSegmentForScan(identifier), server,
      guildName: field(row, ["name", "Name", "groupname", "groupName", "guildName", "Guild Name", "guild"]) }];
  });
  return buildTransferGuildLookup(players, guilds);
}

export function resolveTransferGuildStatus(lookup: TransferGuildLookup | null, memberRef: string, identities: IdentityResolutionSnapshot | null): TransferGuildStatus {
  if (!lookup) return { kind: "unavailable", reason: "not-checked" };
  const literal = memberRef.toLowerCase();
  if (lookup.has(literal)) return lookup.get(literal)!;
  const resolved = identities ? resolvePlayerIdentity(identities, literal) : null;
  if (!resolved?.resolved) return { kind: "unavailable", reason: "no-observation" };
  const observed = resolved.aliasIdentifiers.filter(alias => lookup.has(alias.toLowerCase())).map(alias => lookup.get(alias.toLowerCase())!);
  return observed.length && observed.every(status => sameStatus(status, observed[0])) ? observed[0]
    : { kind: "unavailable", reason: observed.length ? "conflict" : "no-observation" };
}

/** The same complete scan evidence, prepared outside React with browser turns. */
export async function buildCurrentTransferGuildLookupCooperatively(
  snapshot: { players: readonly unknown[]; groups: readonly unknown[] },
  fallbackServer: string | null = null,
  allowed: () => boolean = () => true,
): Promise<TransferGuildLookup> {
  const players: PlayerObservation[] = [];
  let started = performance.now();
  for (const row of snapshot.players) {
    if (!allowed()) throw Error("dashboard_context_changed");
    const player = readGuildScanMemberIdentity(row, fallbackServer);
    if (player) players.push(player);
    if (performance.now() - started >= 6) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      started = performance.now();
    }
  }
  if (!allowed()) throw Error("dashboard_context_changed");
  return buildCurrentTransferGuildLookup(snapshot, fallbackServer, players);
}
