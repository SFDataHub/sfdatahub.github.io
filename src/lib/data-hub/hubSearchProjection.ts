import { runHubSearchWork, type HubSearchExecutionOptions } from "./hubSearchExecution";
import { readGuildScanMemberIdentity, GUILD_SCAN_NORMALIZER_VERSION } from "../guilds/guildScanNormalizer";
import { LOCAL_SCAN_CORE_NORMALIZER_VERSION } from "../guilds/localSourceValidity";
import type { GuildHubLocalScan, GuildHubScanSummary } from "../guilds/localScanLibrary";
import { favoriteReference, type FavoriteKind, type FavoriteReference } from "./hubFavoritesContract";
import { readHubSearchAppearance, validHubSearchAppearance, type HubSearchAppearance } from "./hubSearchAppearance";
import { readHubSearchReferenceEvidence, resolveHubSearchReference } from "./hubSearchReference";
export { readHubSearchReferenceEvidence } from "./hubSearchReference";

export const HUB_SEARCH_PROJECTION_VERSION = 2;
export const HUB_SEARCH_PARSER_VERSION = "memberIdentity:2/logicalSnapshots:2/guildIdentity:2/serverEvidence:2";
export const HUB_SEARCH_KEY_PREFIX = "hub-search:source:";
export type HubSearchDocument = {
  kind: FavoriteKind; name: string; identifier: string | null; reference: FavoriteReference | null;
  server: string | null; guildName: string | null; guildIdentifier: string | null;
  source: string; row: string; at: number | null; hash: string;
  timeQuality: "observation" | "file" | "unknown"; referenceQuality: "confirmed" | "unresolved";
  appearance: HubSearchAppearance;
};
export type HubSearchProjection = {
  version: number; parserVersion: string; normalizerVersion: number; coreVersion: number;
  source: string; fingerprint: string; reset: string; originalSources: string[]; enabled: boolean; sourceSequence: number; unsearchableRows: number; documents: HubSearchDocument[];
};
export type HubSearchRawRow = { kind: FavoriteKind; raw: unknown; row: string; at: number | null; timeQuality?: HubSearchDocument["timeQuality"]; serverContext?: string | null;
  guild?: { name: string; identifier: string | null; server: string | null; coaString?: string | null } };

// Literal source evidence; identity, binding and provenance changes do not alter it.
export function hubSearchFingerprint(source: Pick<GuildHubLocalScan, "contentHash" | "sourceGeneration" | "normalizerVersion" | "coreNormalizerVersion"> | GuildHubScanSummary) {
  return JSON.stringify([source.contentHash, source.sourceGeneration, source.normalizerVersion, source.coreNormalizerVersion]);
}
export function isHubSearchProjectionCurrent(projection: HubSearchProjection | undefined, source: GuildHubScanSummary, rawHash: string | undefined, reset: string) {
  return !!projection && !!rawHash && source.contentHash === rawHash && projection.source === source.sourceScanId &&
    projection.version === HUB_SEARCH_PROJECTION_VERSION && projection.parserVersion === HUB_SEARCH_PARSER_VERSION &&
    projection.normalizerVersion === GUILD_SCAN_NORMALIZER_VERSION && projection.coreVersion === LOCAL_SCAN_CORE_NORMALIZER_VERSION &&
    projection.fingerprint === hubSearchFingerprint(source) && projection.reset === reset &&
    Number.isSafeInteger(projection.unsearchableRows) && projection.unsearchableRows >= 0 && Array.isArray(projection.documents) && projection.documents.every(d => d && (d.kind === "player" || d.kind === "guild") &&
      typeof d.name === "string" && typeof d.source === "string" && d.source === projection.source &&
      typeof d.hash === "string" && typeof d.row === "string" && (d.at === null || Number.isSafeInteger(d.at) && d.at > 0) &&
      validHubSearchAppearance(d.appearance) &&
      (d.reference === null || !!d.reference && typeof d.reference.identifier === "string" && typeof d.reference.serverNamespace === "string" && !!favoriteReference(d.kind, d.reference.identifier, d.reference.serverNamespace)));
}
export function buildHubSearchProjection(scan: GuildHubLocalScan, rows: readonly HubSearchRawRow[], reset: string): HubSearchProjection {
  const work = projectHubSearchRows(scan, rows, reset);
  for (;;) { const next = work.next(); if (next.done) return next.value; }
}
export async function buildHubSearchProjectionCooperatively(scan: GuildHubLocalScan, rows: Iterable<HubSearchRawRow | undefined>, reset: string,
  options: HubSearchExecutionOptions = {}): Promise<HubSearchProjection> {
  return runHubSearchWork(projectHubSearchRows(scan, rows, reset), options);
}

/** One literal projection implementation for both execution paths. Reader
 * checkpoints also flow through the driver; no eager row array or final pass. */
function* projectHubSearchRows(scan: GuildHubLocalScan, rows: Iterable<HubSearchRawRow | undefined>, reset: string): Generator<void, HubSearchProjection> {
  const documents: HubSearchDocument[] = []; let unsearchableRows = 0;
  for (const row of rows) {
    if (!row) { yield; continue; }
    const player = row.kind === "player" ? readGuildScanMemberIdentity(row.raw) : null;
    const guild = row.guild;
    const record = row.raw && typeof row.raw === "object" ? row.raw as Record<string, unknown> : {};
    const name = player?.name ?? guild?.name ?? String(record.name ?? record.Name ?? "").trim();
    const { identifier, reference: valid, server } = resolveHubSearchReference(row.kind, row.raw, row.serverContext);
    if (!name && !identifier) { unsearchableRows++; yield; continue; }
    const guildRefs = valid && row.kind === "player" ? readHubSearchReferenceEvidence("player", row.raw).guildIdentifiers
      .map(id => favoriteReference("guild", id, server)).filter((ref): ref is FavoriteReference => !!ref) : [];
    const guildRef = new Set(guildRefs.map(ref => ref.entityId)).size === 1 ? guildRefs[0] : null;
    documents.push({ kind: row.kind, name, identifier: valid?.identifier ?? identifier, reference: valid, server: valid?.serverNamespace ?? server,
      guildName: player?.guildName ?? null, guildIdentifier: guildRef?.identifier ?? null,
      source: scan.id, row: row.row, at: row.at, hash: scan.contentHash,
      timeQuality: row.at === null ? "unknown" : row.timeQuality ?? "observation", referenceQuality: valid ? "confirmed" : "unresolved",
      appearance: readHubSearchAppearance(row.kind, row.raw, guild?.coaString) });
    yield;
  }
  return { version: HUB_SEARCH_PROJECTION_VERSION, parserVersion: HUB_SEARCH_PARSER_VERSION,
    normalizerVersion: GUILD_SCAN_NORMALIZER_VERSION, coreVersion: LOCAL_SCAN_CORE_NORMALIZER_VERSION,
    source: scan.id, fingerprint: hubSearchFingerprint(scan), reset, originalSources: scan.mergedSourceIds ?? [scan.id], enabled: scan.analyticsEnabled !== false, sourceSequence: 0, unsearchableRows, documents };
}
