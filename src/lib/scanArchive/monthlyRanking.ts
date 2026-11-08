import { LOCAL_SCAN_CORE_NORMALIZER_VERSION } from "../guilds/localSourceValidity";
import { GUILD_SCAN_NORMALIZER_VERSION } from "../guilds/guildScanNormalizer";
import { getClassMetaById } from "../../data/classes";
import { deriveLocalToplistsFromConfirmedScans } from "../toplists/localToplistDerivation";
import { readProgressRadarAnalyticsValuesForPlayer } from "../../pages/Playground/progressRadarModel";
import { earliestMonthlyRow, composeMonthlySet } from "./monthlySetComposition";
import { normalizeGuildSegmentForScan } from "../guilds/guildScanNormalizer";
import { toplistRowIdentity } from "./toplistRowIdentity";
import { normalizeServerKeyFromInput } from "../players/identifier";
import type { ScanArchiveManifest, ScanArchiveManifestScan, ScanArchiveRankingMetadata } from "./types";
import type { ScanArchiveBuilderRawPayload } from "./scanArchiveBuilderMonthly";

/** This is the actual projection/reader contract; existing parser versions are unchanged. */
export const MONTHLY_RANKING_SCHEMA_VERSION = 2;
export const V1_PLAYER_RANKING_KEYS = ["level", "baseMain", "baseCon", "baseSum", "totalMain", "totalCon", "totalSum", "mine", "treasury"] as const;
export const V1_GUILD_RANKING_KEYS = ["level", "baseMain", "baseCon", "baseSum", "totalMain", "totalCon", "totalSum"] as const;
export const ALL_SUM_KEYS = ["baseAllSum", "totalAllSum"] as const;
export const PLAYER_RANKING_KEYS = [...V1_PLAYER_RANKING_KEYS, ...ALL_SUM_KEYS] as const;
export const GUILD_RANKING_KEYS = [...V1_GUILD_RANKING_KEYS, ...ALL_SUM_KEYS] as const;
const ATTRIBUTE_KEYS = ["strength", "dexterity", "intelligence", "constitution", "luck"] as const;
type PlayerKey = typeof PLAYER_RANKING_KEYS[number];
type GuildKey = typeof GUILD_RANKING_KEYS[number];
type ValueKey = PlayerKey | "xpTotal";
type Values = Record<ValueKey, number | null>;
type Status = "available" | "missing" | "invalid";
export type RankingRanks = { server: number | null; global: number | null; serverClass: number | null; globalClass: number | null };
type Anchor = { server: string; scanTimestamp: number; archiveScanId: string };
export type RankingObservation = {
  scanTimestamp: number; archiveScanId: string; guildIdentifier: string | null;
  values: Values; statuses: Record<ValueKey, Status>;
  /** Only present when the physical identifier/class differs from the displayed winner. */
  identifier?: string; classId?: string | number | null;
};
export type RankingPlayer = Anchor & {
  identifier: string; playerId: string | null; guildIdentifier: string | null;
  classId: string | number | null; classKey: number | null;
  values: Values; statuses: Record<ValueKey, Status>; observations: RankingObservation[]; ranks: Record<PlayerKey, RankingRanks>;
};
export type RankingGuild = Anchor & {
  guildIdentifier: string; memberBasisStatus: "complete" | "incomplete" | "unknown";
  memberBasisCount: number; memberCount: number | null; memberPlayerIdentifiers: string[];
  values: Record<GuildKey, number | null>; populations: Record<GuildKey, number>;
  ranks: Record<GuildKey, Pick<RankingRanks, "server" | "global">>;
};
export type RankingSnapshot = { playerRows: RankingPlayer[]; guildRows: RankingGuild[] };
export type RankingSource = { id: string; sha256: string; timestamp: number };
export type RankingPool = Array<{ server: string; sources: RankingSource[] }>;
export type MonthlyRankingPayload = {
  schemaVersion: 1 | 2; projection: "monthly-ranking.v1" | "monthly-ranking.v2"; coreNormalizerVersion: number; guildNormalizerVersion: number; month: string; server: string;
  sources: RankingSource[]; pool: RankingPool; cohortId: string;
  population: { players: number; guilds: number; globalPlayers: number; globalGuilds: number };
  players: RankingPlayer[]; guilds: RankingGuild[];
};
export const rankingPath = (month: string, server: string) => `${month}/${server}/monthly.ranking.json.gz`;
const keysObject = <K extends string, V>(keys: readonly K[], get: (key: K) => V): Record<K, V> => Object.fromEntries(keys.map(key => [key, get(key)])) as Record<K, V>;
const emptyRanks = (): RankingRanks => ({ server: null, global: null, serverClass: null, globalClass: null });
const valid = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const clean = (value: unknown) => valid(value) ? value : null;
const sum = (a: number | null, b: number | null) => a == null || b == null ? null : clean(a + b);
const canonicalServer = (server: string) => normalizeServerKeyFromInput(server) ?? server;

export function deriveRankingSnapshot(scan: Pick<ScanArchiveManifestScan, "id" | "server" | "timestamp" | "sha256">, raw: ScanArchiveBuilderRawPayload): RankingSnapshot {
  const projected = new Map<string, { values: Values; statuses: Record<ValueKey, Status>; classId: string | number | null }>();
  const hash = scan.sha256 ?? "0".repeat(64);
  const result = deriveLocalToplistsFromConfirmedScans([{
    manifestYear: new Date(scan.timestamp).getUTCFullYear(), archiveScanId: scan.id, archiveSha256: hash,
    server: scan.server, scanTimestamp: scan.timestamp, localScanId: scan.id, rawScan: raw,
    confirmation: { kind: "archiveSource", archiveScanId: scan.id, archiveSha256: hash },
  }], (row, player, core, stats) => {
    const xp = readProgressRadarAnalyticsValuesForPlayer(player, core, stats).xpTotal;
    const primary = getClassMetaById(row.classId)?.primaryAttribute;
    const baseMain = clean((primary ? core?.attributes[primary].base : null) ?? row.main);
    const baseCon = clean(core?.attributes.constitution.base ?? row.con);
    const totalMain = clean((primary ? core?.attributes[primary].total : null) ?? row.mainTotal);
    const totalCon = clean(core?.attributes.constitution.total ?? row.conTotal);
    const values: Values = {
      level: clean(core?.progression.level ?? row.level ?? (player.level === 0 ? 0 : null)), xpTotal: clean(xp), baseMain, baseCon,
      baseSum: sum(baseMain, baseCon), totalMain, totalCon,
      totalSum: sum(totalMain, totalCon),
      // Only the existing normalizer's five individual attributes prove this sum.
      ...keysObject(ALL_SUM_KEYS, key => {
        const components = ATTRIBUTE_KEYS.map(attribute => core?.attributes[attribute][key === "baseAllSum" ? "base" : "total"]);
        return components.every(valid) ? clean(components.reduce((a, b) => a + b, 0)) : null;
      }),
      mine: clean(core?.fortress.buildings.gemMine ?? row.mine), treasury: clean(core?.fortress.buildings.treasury ?? row.treasury),
    };
    const aliases: Record<ValueKey, string[]> = {
      level: ["level"], xpTotal: ["xptotal", "totalxp", "xp"], baseMain: ["basemain", "base", "baseattribute"],
      baseCon: ["conbase", "baseconstitution", "constitutionbase"], baseSum: [],
      totalMain: ["attrtotal", "attribute"], totalCon: ["contotal", "constitution"], totalSum: [],
      mine: ["mine", "gemmine"], treasury: ["treasury"], baseAllSum: [], totalAllSum: [],
    };
    const status = keysObject(Object.keys(values) as ValueKey[], key => {
      if (values[key] != null) return "available" as Status;
      const sources = [player, player.values, player.latest].filter((v): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v));
      const explicit = sources.some(source => Object.entries(source).some(([k, v]) => aliases[key].includes(k.toLowerCase().replace(/[^a-z0-9]/g, "")) && v != null && v !== ""));
      const path = key === "mine" ? "fortress.buildings.gemMine" : key === "treasury" ? "fortress.buildings.treasury" : null;
      const corePath = key === "level" ? "progression.level" : key === "xpTotal" ? "progression.xp" :
        key === "baseMain" && primary ? `attributes.${primary}.base` : key === "baseCon" ? "attributes.constitution.base" :
        key === "totalMain" && primary ? `attributes.${primary}.bonus` : key === "totalCon" ? "attributes.constitution.bonus" : null;
      const invalid = path ? core?.fortress.metadata.fields[path]?.status === "invalid" : corePath ? core?.metadata.fields[corePath]?.status === "invalid" : false;
      return explicit || invalid ? "invalid" : "missing";
    });
    for (const [key, a, b] of [["baseSum", "baseMain", "baseCon"], ["totalSum", "totalMain", "totalCon"]] as const) {
      if (values[key] == null && (status[a] === "invalid" || status[b] === "invalid")) status[key] = "invalid";
    }
    for (const key of ALL_SUM_KEYS) {
      if (values[key] != null) continue;
      const invalid = ATTRIBUTE_KEYS.some(attribute => {
        const component = core?.attributes[attribute];
        const fields = core?.metadata.fields;
        const base = component?.base;
        const total = component?.total;
        return (base != null && !valid(base)) || fields?.[`attributes.${attribute}.base`]?.status === "invalid" ||
          (key === "totalAllSum" && ((total != null && !valid(total)) ||
            fields?.[`attributes.${attribute}.bonus`]?.status === "invalid" || fields?.[`attributes.${attribute}.total`]?.status === "invalid"));
      });
      // Invalid takes precedence over missing, as with the Main+CON sums.
      status[key] = invalid ? "invalid" : "missing";
    }
    if (!projected.has(row.identifier)) projected.set(row.identifier, { values, statuses: status, classId: (typeof player.class === "number" || typeof player.class === "string") ? player.class : (typeof player.classId === "number" || typeof player.classId === "string") ? player.classId : row.classId });
    return row;
  });
  const errors = result.issues.filter(issue => issue.severity === "error" && issue.code !== "duplicate-conflicting-player" && issue.code !== "duplicate-conflicting-guild");
  if (errors.length) throw new Error(`${scan.id}: ${errors.map(issue => issue.message).join("; ")}`);
  const players: RankingPlayer[] = result.players.map(row => ({
    server: row.server, scanTimestamp: row.scanTimestamp, archiveScanId: row.archiveScanId,
    identifier: row.identifier, playerId: row.playerId, guildIdentifier: row.guildIdentifier,
    classKey: getClassMetaById(projected.get(row.identifier)!.classId)?.id ?? null,
    ...projected.get(row.identifier)!, observations: [], ranks: keysObject(PLAYER_RANKING_KEYS, emptyRanks),
  }));
  for (const player of players) player.observations = [{ scanTimestamp: player.scanTimestamp, archiveScanId: player.archiveScanId,
    guildIdentifier: player.guildIdentifier, values: player.values, statuses: player.statuses }];
  const byId = new Map(players.map(player => [player.identifier, player]));
  const guilds: RankingGuild[] = result.guilds.map(row => {
    const members = (row.memberPlayerIdentifiers ?? []).map(id => byId.get(id)!);
    const populations = keysObject(GUILD_RANKING_KEYS, key => members.filter(member => member.values[key] != null).length);
    const values = keysObject(GUILD_RANKING_KEYS, key => {
      const numeric = members.flatMap(member => member.values[key] == null ? [] : [member.values[key]!]);
      // Incomplete physical memberships keep the existing unavailable-average rule.
      return row.memberBasisStatus === "complete" && numeric.length ? numeric.reduce((a, b) => a + b, 0) / numeric.length : null;
    });
    return { server: row.server, scanTimestamp: row.scanTimestamp, archiveScanId: row.archiveScanId,
      guildIdentifier: row.guildIdentifier, memberBasisStatus: row.memberBasisStatus, memberBasisCount: row.memberBasisCount,
      memberCount: row.memberCount, memberPlayerIdentifiers: row.memberPlayerIdentifiers ?? [], values, populations,
      ranks: keysObject(GUILD_RANKING_KEYS, () => ({ server: null, global: null })),
    };
  });
  return { playerRows: players, guildRows: guilds };
}

export function composeRankingSnapshots(snapshots: readonly RankingSnapshot[]): RankingSnapshot {
  // Keep the earliest row plus every selected guild's physical member row.
  // They are required when a later guild replacement releases a promoted member.
  const expanded = snapshots.flatMap(snapshot => snapshot.playerRows.flatMap(player => player.observations.map(observation => {
    const classId = Object.prototype.hasOwnProperty.call(observation, "classId") ? observation.classId! : player.classId;
    return { ...player, ...observation, identifier: observation.identifier ?? player.identifier,
      classId, classKey: getClassMetaById(classId)?.id ?? null };
  })));
  const composed = composeMonthlySet([{ playerRows: expanded, guildRows: snapshots.flatMap(s => s.guildRows) }]);
  const earliest = new Map<string, RankingPlayer>();
  for (const player of expanded) {
    const key = toplistRowIdentity(player.server, player.playerId ?? player.identifier, "players");
    const old = earliest.get(key);
    earliest.set(key, old ? earliestMonthlyRow(old, player) : player);
  }
  const members = new Set<string>();
  for (const guild of composed.guildRows) {
    for (const id of guild.memberPlayerIdentifiers) members.add(`${guild.server}\u0000${guild.archiveScanId}\u0000${normalizeGuildSegmentForScan(guild.guildIdentifier)}\u0000${id}`);
  }
  const byIdentity = new Map<string, RankingPlayer[]>();
  for (const player of expanded) {
    const key = toplistRowIdentity(player.server, player.playerId ?? player.identifier, "players");
    if (earliest.get(key) !== player && !members.has(`${player.server}\u0000${player.archiveScanId}\u0000${normalizeGuildSegmentForScan(player.guildIdentifier)}\u0000${player.identifier}`)) continue;
    const rows = byIdentity.get(key) ?? []; rows.push(player); byIdentity.set(key, rows);
  }
  return { guildRows: composed.guildRows, playerRows: composed.playerRows.map(player => {
    const key = toplistRowIdentity(player.server, player.playerId ?? player.identifier, "players");
    const retained = new Map<string, RankingPlayer>();
    for (const row of byIdentity.get(key) ?? []) {
      const anchor = `${row.archiveScanId}\u0000${row.identifier}`;
      if (!retained.has(anchor)) retained.set(anchor, row);
    }
    return { ...player, observations: [...retained.values()].sort((a, b) => a.scanTimestamp - b.scanTimestamp || a.archiveScanId.localeCompare(b.archiveScanId) || a.identifier.localeCompare(b.identifier)).map(row => ({
      scanTimestamp: row.scanTimestamp, archiveScanId: row.archiveScanId, guildIdentifier: row.guildIdentifier,
      values: row.values, statuses: row.statuses,
      ...(row.identifier !== player.identifier ? { identifier: row.identifier } : {}),
      ...(row.classId !== player.classId ? { classId: row.classId } : {}),
    })) };
  }) };

}

export function rankingPoolForMonth(manifest: ScanArchiveManifest, month: string): RankingPool {
  return Object.entries(manifest.toplists?.monthly?.[month] ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([server, ref]) => ({
    server, sources: (typeof ref === "string" ? [ref] : ref.scanIds).map(id => {
      const scan = manifest.scans.find(s => s.id === id);
      if (!scan) throw new Error(`Ranking ${month}/${server}: Set-Mitglied ${id} fehlt.`);
      return { id, sha256: scan.sha256, timestamp: scan.timestamp };
    }).sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id)),
  }));
}

const basis = (row: RankingPlayer | RankingGuild, key: PlayerKey): number[] | null => {
  const value = row.values[key as keyof typeof row.values];
  if (value == null) return null;
  if (key === "level" && "identifier" in row) return row.values.xpTotal == null ? null : [value, row.values.xpTotal];
  return [value];
};
const compareBasis = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i] ? -1 : 1;
  return 0;
};
function assignRanks<T extends RankingPlayer | RankingGuild>(rows: T[], key: PlayerKey, scope: keyof RankingRanks, group: (row: T) => string | null) {
  const groups = new Map<string, Array<{ row: T; basis: number[] }>>();
  for (const row of rows) {
    const rank = row.ranks[key as keyof typeof row.ranks] as RankingRanks;
    rank[scope] = null;
    const value = basis(row, key), bucket = group(row);
    if (value == null || bucket == null) continue;
    const entries = groups.get(bucket) ?? [];
    entries.push({ row, basis: value }); groups.set(bucket, entries);
  }
  for (const entries of groups.values()) {
    entries.sort((a, b) => compareBasis(a.basis, b.basis));
    let rank = 0;
    entries.forEach((entry, index) => {
      if (index === 0 || compareBasis(entry.basis, entries[index - 1].basis) !== 0) rank = index + 1;
      (entry.row.ranks[key as keyof typeof entry.row.ranks] as RankingRanks)[scope] = rank;
    });
  }
}

function rankMonthlyRows(players: RankingPlayer[], guilds: RankingGuild[], playerKeys: readonly PlayerKey[], guildKeys: readonly GuildKey[]) {
  for (const key of playerKeys) {
    assignRanks(players, key, "server", row => row.server);
    assignRanks(players, key, "global", () => "all");
    assignRanks(players, key, "serverClass", row => row.classKey == null ? null : `${row.server}/${row.classKey}`);
    assignRanks(players, key, "globalClass", row => row.classKey == null ? null : String(row.classKey));
  }
  for (const key of guildKeys) {
    assignRanks(guilds, key, "server", row => row.server);
    assignRanks(guilds, key, "global", () => "all");
  }
}

/** Check stored ranks using exactly the payload's historical metric contract. */
export function verifyStoredMonthlyRankingRanks(payloads: MonthlyRankingPayload[]) {
  const copies = structuredClone(payloads);
  const version = payloads[0]?.schemaVersion;
  const playerKeys = version === 1 ? V1_PLAYER_RANKING_KEYS : PLAYER_RANKING_KEYS;
  const guildKeys = version === 1 ? V1_GUILD_RANKING_KEYS : GUILD_RANKING_KEYS;
  rankMonthlyRows(copies.flatMap(p => p.players), copies.flatMap(p => p.guilds), playerKeys, guildKeys);
  for (let i = 0; i < payloads.length; i++) for (const kind of ["players", "guilds"] as const) {
    const keys = kind === "players" ? playerKeys : guildKeys;
    if (payloads[i][kind].some((row, j) => keys.some(key => {
      const stored = row.ranks[key as keyof typeof row.ranks] as RankingRanks;
      const computed = copies[i][kind][j].ranks[key as keyof typeof row.ranks] as RankingRanks;
      return (kind === "players" ? ["server", "global", "serverClass", "globalClass"] as const : ["server", "global"] as const)
        .some(scope => stored[scope] !== computed[scope]);
    }))) throw new Error(`Ranking ${payloads[i].month}/${payloads[i].server}: gespeicherte Raenge passen nicht zur Gesamtgrundlage.`);
  }
}

export function calculateMonthlyRankings(month: string, pool: RankingPool, cohortId: string, snapshots: Map<string, RankingSnapshot>): MonthlyRankingPayload[] {
  if (snapshots.size !== pool.length || pool.some(p => !snapshots.has(p.server))) throw new Error(`Ranking ${month}: unvollstaendiger Gesamtpool.`);
  if (new Set(pool.map(p => canonicalServer(p.server))).size !== pool.length) throw new Error(`Ranking ${month}: mehrere Monatssets fuer denselben Serveralias.`);
  const players = [...snapshots.values()].flatMap(s => s.playerRows), guilds = [...snapshots.values()].flatMap(s => s.guildRows);
  rankMonthlyRows(players, guilds, PLAYER_RANKING_KEYS, GUILD_RANKING_KEYS);
  return pool.map(({ server, sources }) => {
    const rows = snapshots.get(server);
    if (!rows) throw new Error(`Ranking ${month}/${server}: Monatsgrundlage fehlt.`);
    return { schemaVersion: 2, projection: "monthly-ranking.v2", coreNormalizerVersion: LOCAL_SCAN_CORE_NORMALIZER_VERSION, guildNormalizerVersion: GUILD_SCAN_NORMALIZER_VERSION, month, server, sources, pool, cohortId,
      population: { players: rows.playerRows.length, guilds: rows.guildRows.length, globalPlayers: players.length, globalGuilds: guilds.length },
      players: rows.playerRows, guilds: rows.guildRows,
    };
  });
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const fail = (message: string): never => { throw new Error(`Rankinggrundlage ungueltig: ${message}`); };
const integer = (v: unknown): v is number => valid(v) && Number.isSafeInteger(v);
const rankValid = (v: unknown, max: number) => v === null || (integer(v) && v > 0 && v <= max);
export function validateMonthlyRanking(value: unknown, expected: { month: string; server: string; pool: RankingPool; metadata: ScanArchiveRankingMetadata }): MonthlyRankingPayload {
  const { month, server, pool, metadata } = expected;
  if (!record(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2) || value.schemaVersion !== metadata.schemaVersion || value.projection !== `monthly-ranking.v${value.schemaVersion}` || value.coreNormalizerVersion !== LOCAL_SCAN_CORE_NORMALIZER_VERSION || value.guildNormalizerVersion !== GUILD_SCAN_NORMALIZER_VERSION || value.month !== month || value.server !== server || value.cohortId !== metadata.cohortId) fail(`${month}/${server}: Format/Monat/Server/Gesamtstand passt nicht.`);
  const payload = value as unknown as MonthlyRankingPayload;
  const playerKeys = payload.schemaVersion === 1 ? V1_PLAYER_RANKING_KEYS : PLAYER_RANKING_KEYS;
  const guildKeys = payload.schemaVersion === 1 ? V1_GUILD_RANKING_KEYS : GUILD_RANKING_KEYS;
  if (JSON.stringify(payload.pool) !== JSON.stringify(pool) || JSON.stringify(payload.sources) !== JSON.stringify(pool.find(s => s.server === server)?.sources)) fail(`${month}/${server}: Eingabesets passen nicht.`);
  if (!Array.isArray(payload.players) || !Array.isArray(payload.guilds) || !record(payload.population) || payload.population.players !== payload.players.length || payload.population.guilds !== payload.guilds.length || payload.players.length !== metadata.playerCount || payload.guilds.length !== metadata.guildCount || !integer(payload.population.globalPlayers) || !integer(payload.population.globalGuilds) || payload.population.globalPlayers < payload.players.length || payload.population.globalGuilds < payload.guilds.length) fail(`${month}/${server}: Population passt nicht.`);
  const anchors = new Map(payload.sources.map(source => [source.id, source.timestamp]));
  const seen = new Set<string>();
  for (const kind of ["players", "guilds"] as const) for (const raw of payload[kind]) {
    if (!record(raw) || raw.server !== canonicalServer(server) || typeof raw.archiveScanId !== "string" || anchors.get(raw.archiveScanId) !== raw.scanTimestamp) fail(`${server}: Beobachtungsanker passt nicht.`);
    const row = raw as unknown as RankingPlayer | RankingGuild;
    const id = kind === "players" ? (row as RankingPlayer).identifier : (row as RankingGuild).guildIdentifier;
    if (typeof id !== "string" || !id.trim()) fail("Identifier fehlt.");
    const identity = `${kind}/${toplistRowIdentity(server, id, kind === "players" ? "players" : "groups")}`;
    if (seen.has(identity)) fail(`Doppelte ID ${id}.`); seen.add(identity);
    const keys = kind === "players" ? [...playerKeys, "xpTotal"] as const : guildKeys;
    if (!record(row.values) || !record(row.ranks)) fail(`Werte/Raenge fehlen: ${id}.`);
    for (const key of keys) {
      const number = row.values[key as keyof typeof row.values];
      if (number !== null && !valid(number)) fail(`Ungueltiger Wert ${id}/${key}.`);
    }
    if (kind === "players") {
      const player = row as RankingPlayer;
      if ((typeof player.classId !== "number" && typeof player.classId !== "string" && player.classId !== null) || player.classKey !== (getClassMetaById(player.classId)?.id ?? null) || (player.playerId !== null && typeof player.playerId !== "string") || (player.guildIdentifier !== null && typeof player.guildIdentifier !== "string") || !record(player.statuses)) fail(`Klasse/Identitaet/Status fehlt: ${id}.`);
      if (!Array.isArray(player.observations) || !player.observations.length) fail(`Beobachtungsgrundlage ${id}.`);
      const observed = new Set<string>();
      let winnerFound = false;
      for (const observation of player.observations) {
        if (!record(observation) || anchors.get(observation.archiveScanId) !== observation.scanTimestamp || !record(observation.values) || !record(observation.statuses) || (observation.guildIdentifier !== null && typeof observation.guildIdentifier !== "string")) fail(`Beobachtung ${id}.`);
        const identifier = observation.identifier ?? id;
        if (typeof identifier !== "string" || toplistRowIdentity(server, identifier, "players") !== toplistRowIdentity(server, id, "players")) fail(`Beobachtungs-ID ${id}.`);
        const anchor = `${observation.archiveScanId}/${identifier}`;
        if (observed.has(anchor)) fail(`Doppelte Beobachtung ${id}.`); observed.add(anchor);
        if (Object.prototype.hasOwnProperty.call(observation, "classId") && observation.classId !== null && typeof observation.classId !== "string" && typeof observation.classId !== "number") fail(`Beobachtungsklasse ${id}.`);
        for (const key of [...playerKeys, "xpTotal"] as const) if ((observation.values[key] !== null && !valid(observation.values[key])) || !["available", "missing", "invalid"].includes(observation.statuses[key]) || (observation.statuses[key] === "available") !== (observation.values[key] !== null)) fail(`Beobachtungswert ${id}/${key}.`);
        if (observation.values.baseSum !== sum(observation.values.baseMain, observation.values.baseCon) || observation.values.totalSum !== sum(observation.values.totalMain, observation.values.totalCon)) fail(`Beobachtung Main + CON ${id}.`);
        const classId = Object.prototype.hasOwnProperty.call(observation, "classId") ? observation.classId : player.classId;
        if (observation.archiveScanId === player.archiveScanId && identifier === id && classId === player.classId && observation.guildIdentifier === player.guildIdentifier && JSON.stringify(observation.values) === JSON.stringify(player.values) && JSON.stringify(observation.statuses) === JSON.stringify(player.statuses)) winnerFound = true;
      }
      if (!winnerFound) fail(`Gewinnerbeobachtung ${id} fehlt.`);
      for (const key of keys as readonly ValueKey[]) if (!["available", "missing", "invalid"].includes(player.statuses[key]) || (player.statuses[key] === "available") !== (player.values[key] !== null)) fail(`Wertestatus ${id}/${key}.`);
      if (player.values.baseSum !== sum(player.values.baseMain, player.values.baseCon) || player.values.totalSum !== sum(player.values.totalMain, player.values.totalCon)) fail(`Main + CON ${id}.`);
    } else {
      const guild = row as RankingGuild;
      if (!["complete", "incomplete", "unknown"].includes(guild.memberBasisStatus) || !integer(guild.memberBasisCount) || (guild.memberCount !== null && !integer(guild.memberCount)) || !Array.isArray(guild.memberPlayerIdentifiers) || guild.memberPlayerIdentifiers.some(id => typeof id !== "string") || new Set(guild.memberPlayerIdentifiers).size !== guild.memberBasisCount || !record(guild.populations)) fail(`Memberbasis ${id}.`);
      if (guild.memberBasisStatus === "complete" && guild.memberCount !== guild.memberBasisCount) fail(`Unvollstaendige Memberbasis ${id}.`);
      for (const key of guildKeys) if (!integer(guild.populations[key]) || guild.populations[key] > guild.memberBasisCount || (guild.values[key] !== null) !== (guild.memberBasisStatus === "complete" && guild.populations[key] > 0)) fail(`Nenner ${id}/${key}.`);
    }
    const rankKeys = kind === "players" ? playerKeys : guildKeys;
    for (const key of rankKeys) {
      const ranks = row.ranks[key as keyof typeof row.ranks] as RankingRanks;
      if (!record(ranks)) fail(`Raenge ${id}/${key}.`);
      for (const scope of kind === "players" ? ["server", "global", "serverClass", "globalClass"] as const : ["server", "global"] as const) {
        const max = scope === "server" || scope === "serverClass" ? payload[kind].length : kind === "players" ? payload.population.globalPlayers : payload.population.globalGuilds;
        if (!rankValid(ranks[scope], max) || ((basis(row, key) === null || ("identifier" in row && row.classKey === null && (scope === "serverClass" || scope === "globalClass"))) !== (ranks[scope] === null)) || (basis(row, key) === null && ranks[scope] !== null) || ("identifier" in row && row.classKey === null && (scope === "serverClass" || scope === "globalClass") && ranks[scope] !== null)) fail(`Rang ${id}/${key}/${scope}.`);
      }
    }
  }
  const composed = composeRankingSnapshots([{ playerRows: payload.players, guildRows: payload.guilds }]);
  const selectedById = new Map(composed.playerRows.map(p => [toplistRowIdentity(server, p.identifier, "players"), p]));
  for (let i = 0; i < payload.players.length; i++) {
    const stored = payload.players[i], selected = selectedById.get(toplistRowIdentity(server, stored.identifier, "players"))!;
    if (!selected || selected.identifier !== stored.identifier || selected.archiveScanId !== stored.archiveScanId || selected.scanTimestamp !== stored.scanTimestamp || selected.classId !== stored.classId || selected.guildIdentifier !== stored.guildIdentifier || JSON.stringify(selected.values) !== JSON.stringify(stored.values) || JSON.stringify(selected.statuses) !== JSON.stringify(stored.statuses)) fail(`Monatsgewinner ${stored.identifier} passt nicht.`);
  }
  const observations = new Map<string, RankingObservation>();
  for (const player of payload.players) for (const observation of player.observations) observations.set(`${observation.archiveScanId}/${observation.identifier ?? player.identifier}`, observation);
  for (const guild of payload.guilds) {
    const members = guild.memberPlayerIdentifiers.map(id => observations.get(`${guild.archiveScanId}/${id}`));
    if (members.some(member => !member || normalizeGuildSegmentForScan(member.guildIdentifier) !== normalizeGuildSegmentForScan(guild.guildIdentifier))) fail(`Physische Memberbasis ${guild.guildIdentifier} fehlt.`);
    for (const key of guildKeys) {
      const numeric = members.flatMap(member => member!.values[key] === null ? [] : [member!.values[key]!]);
      const avg = guild.memberBasisStatus === "complete" && numeric.length ? numeric.reduce((a, b) => a + b, 0) / numeric.length : null;
      if (guild.populations[key] !== numeric.length || guild.values[key] !== avg) fail(`Durchschnitt/Nenner ${guild.guildIdentifier}/${key} passt nicht.`);
    }
  }
  const result = structuredClone(payload);
  if (result.schemaVersion === 1) {
    // Reader adaptation only: preserve the v1 declaration. Never infer five
    // attributes from Main+CON, or let a v1 payload become an emitted v2 basis.
    for (const player of result.players) {
      for (const observation of [player, ...player.observations]) for (const key of ALL_SUM_KEYS) {
        observation.values[key] = null; observation.statuses[key] = "missing";
      }
      for (const key of ALL_SUM_KEYS) player.ranks[key] = emptyRanks();
    }
    for (const guild of result.guilds) for (const key of ALL_SUM_KEYS) {
      guild.values[key] = null; guild.populations[key] = 0; guild.ranks[key] = { server: null, global: null };
    }
  }
  return result;
}
