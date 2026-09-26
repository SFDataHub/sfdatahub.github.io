import {
  listGuildEntities,
  normalizeGuildIdentifierKey,
  type GuildAlias,
  type GuildEntity,
} from "./guildIdentityStore";
import {
  listPlayerEntities,
  normalizePlayerIdentifierKey,
  type PlayerAlias,
  type PlayerEntity,
} from "./playerIdentityStore";

export type PlayerIdentityResolutionStore = {
  listPlayerEntities: () => Promise<Array<{ entity: PlayerEntity; aliases: PlayerAlias[] }>>;
};

export type GuildIdentityResolutionStore = {
  listGuildEntities: () => Promise<Array<{ entity: GuildEntity; aliases: GuildAlias[] }>>;
};

export type IdentityAliasGroup<TEntity, TAlias> = {
  identityId: string;
  entity: TEntity;
  aliases: readonly TAlias[];
};

export type IdentityResolutionIndex<TEntity, TAlias> = {
  byIdentifier: ReadonlyMap<string, IdentityAliasGroup<TEntity, TAlias>>;
  byIdentityId: ReadonlyMap<string, IdentityAliasGroup<TEntity, TAlias>>;
};

export type PlayerIdentityResolutionIndex = IdentityResolutionIndex<PlayerEntity, PlayerAlias>;
export type GuildIdentityResolutionIndex = IdentityResolutionIndex<GuildEntity, GuildAlias>;

/**
 * Read-only momentaufnahme der persistenten Identity Stores.
 *
 * Source of Truth bleiben die Player-/Guild-Identity Stores. Die Maps speichern
 * nur den aktuellen Stand beim Laden des Snapshots. Da Entity-zu-Entity-Merges
 * eine identityId absorbieren können, sollten Consumer bevorzugt mit raw
 * Identifier -> aktueller Snapshot -> aktuelle Identity-Gruppe arbeiten.
 */
export type IdentityResolutionSnapshot = {
  players: PlayerIdentityResolutionIndex;
  guilds: GuildIdentityResolutionIndex;
};

export type ResolvedIdentity<TEntity, TAlias> = {
  resolved: true;
  identityId: string;
  entity: TEntity;
  aliases: readonly TAlias[];
  aliasIdentifiers: readonly string[];
  matchedAlias: TAlias;
};

export type UnresolvedIdentity = {
  resolved: false;
  identityId: null;
  entity: null;
  aliases: readonly [];
  aliasIdentifiers: readonly [];
  matchedAlias: null;
};

export type PlayerIdentityResolution = ResolvedIdentity<PlayerEntity, PlayerAlias> | UnresolvedIdentity;
export type GuildIdentityResolution = ResolvedIdentity<GuildEntity, GuildAlias> | UnresolvedIdentity;

export type LoadIdentityResolutionSnapshotOptions = {
  playerStore?: PlayerIdentityResolutionStore;
  guildStore?: GuildIdentityResolutionStore;
};

export type IdentityObservationOptions<TObservation> = {
  getIdentifier?: (observation: TObservation) => string | null | undefined;
  getTimestamp?: (observation: TObservation) => number | string | Date | null | undefined;
  getObservationKey?: (observation: TObservation) => string | null | undefined;
};

export type IdentityHistoryObservation<TObservation> = {
  observation: TObservation;
  identifier: string;
  identifierKey: string;
  timestampMs: number | null;
  observationKey: string;
};

export type PlayerIdentityObservationHistory<TObservation> = {
  resolution: PlayerIdentityResolution;
  observations: readonly IdentityHistoryObservation<TObservation>[];
};

export type GuildIdentityObservationHistory<TObservation> = {
  resolution: GuildIdentityResolution;
  observations: readonly IdentityHistoryObservation<TObservation>[];
};

const defaultPlayerStore: PlayerIdentityResolutionStore = { listPlayerEntities };
const defaultGuildStore: GuildIdentityResolutionStore = { listGuildEntities };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const readStringField = (value: unknown, fields: readonly string[]) => {
  const record = asRecord(value);
  if (!record) return null;
  for (const field of fields) {
    const raw = record[field];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  }
  return null;
};

const safeNormalize = (identifier: string | null | undefined, normalize: (value: string) => string) => {
  const raw = String(identifier ?? "").trim();
  if (!raw) return null;
  try {
    return normalize(raw);
  } catch {
    return null;
  }
};

const buildObservationKey = <TObservation>(
  observation: TObservation,
  identifierKey: string,
  timestampMs: number | null,
  fallbackIndex: number,
  options?: IdentityObservationOptions<TObservation>,
) => {
  const explicitKey = options?.getObservationKey?.(observation);
  if (explicitKey != null && String(explicitKey).trim()) return String(explicitKey).trim();

  const record = asRecord(observation);
  const id = readStringField(record, ["id", "observationId"]);
  if (id) return id;

  const sourceScanId = readStringField(record, ["sourceScanId", "scanId"]);
  const snapshotId = readStringField(record, ["snapshotId"]);
  if (sourceScanId || snapshotId) {
    return [sourceScanId ?? "", snapshotId ?? "", identifierKey, timestampMs ?? ""].join("::");
  }

  return `index:${fallbackIndex}`;
};

const readTimestampValue = <TObservation>(
  observation: TObservation,
  options?: IdentityObservationOptions<TObservation>,
): number | string | Date | null => {
  const explicitTimestamp = options?.getTimestamp?.(observation);
  if (explicitTimestamp != null) return explicitTimestamp;
  const record = asRecord(observation);
  if (!record) return null;
  const timestamp = record.snapshotTimestamp ?? record.scannedAtMs ?? record.timestamp ?? null;
  if (typeof timestamp === "number" || typeof timestamp === "string" || timestamp instanceof Date) return timestamp;
  return null;
};

const toTimestampMs = (value: number | string | Date | null | undefined) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  return null;
};

const sortAliasesByAddedAt = <TAlias extends { addedAt: string; identifierKey: string }>(aliases: readonly TAlias[]) =>
  [...aliases].sort((left, right) => {
    const addedCompare = left.addedAt.localeCompare(right.addedAt);
    return addedCompare || left.identifierKey.localeCompare(right.identifierKey);
  });

export function buildPlayerIdentityResolutionIndex(
  entries: readonly { entity: PlayerEntity; aliases: readonly PlayerAlias[] }[],
): PlayerIdentityResolutionIndex {
  const byIdentifier = new Map<string, IdentityAliasGroup<PlayerEntity, PlayerAlias>>();
  const byIdentityId = new Map<string, IdentityAliasGroup<PlayerEntity, PlayerAlias>>();

  for (const entry of entries) {
    const group: IdentityAliasGroup<PlayerEntity, PlayerAlias> = {
      identityId: entry.entity.entityId,
      entity: entry.entity,
      aliases: sortAliasesByAddedAt(entry.aliases),
    };
    byIdentityId.set(group.identityId, group);
    for (const alias of group.aliases) {
      byIdentifier.set(alias.identifierKey, group);
    }
  }

  return { byIdentifier, byIdentityId };
}

export function buildGuildIdentityResolutionIndex(
  entries: readonly { entity: GuildEntity; aliases: readonly GuildAlias[] }[],
): GuildIdentityResolutionIndex {
  const byIdentifier = new Map<string, IdentityAliasGroup<GuildEntity, GuildAlias>>();
  const byIdentityId = new Map<string, IdentityAliasGroup<GuildEntity, GuildAlias>>();

  for (const entry of entries) {
    const group: IdentityAliasGroup<GuildEntity, GuildAlias> = {
      identityId: entry.entity.entityId,
      entity: entry.entity,
      aliases: sortAliasesByAddedAt(entry.aliases),
    };
    byIdentityId.set(group.identityId, group);
    for (const alias of group.aliases) {
      byIdentifier.set(alias.identifierKey, group);
    }
  }

  return { byIdentifier, byIdentityId };
}

export async function loadPlayerIdentityResolutionIndex(
  store: PlayerIdentityResolutionStore = defaultPlayerStore,
): Promise<PlayerIdentityResolutionIndex> {
  return buildPlayerIdentityResolutionIndex(await store.listPlayerEntities());
}

export async function loadGuildIdentityResolutionIndex(
  store: GuildIdentityResolutionStore = defaultGuildStore,
): Promise<GuildIdentityResolutionIndex> {
  return buildGuildIdentityResolutionIndex(await store.listGuildEntities());
}

export async function loadIdentityResolutionSnapshot(
  options: LoadIdentityResolutionSnapshotOptions = {},
): Promise<IdentityResolutionSnapshot> {
  const [players, guilds] = await Promise.all([
    loadPlayerIdentityResolutionIndex(options.playerStore ?? defaultPlayerStore),
    loadGuildIdentityResolutionIndex(options.guildStore ?? defaultGuildStore),
  ]);
  return { players, guilds };
}

export function resolvePlayerIdentity(
  snapshot: Pick<IdentityResolutionSnapshot, "players"> | IdentityResolutionSnapshot["players"],
  identifier: string,
): PlayerIdentityResolution {
  const players = "players" in snapshot ? snapshot.players : snapshot;
  const identifierKey = safeNormalize(identifier, normalizePlayerIdentifierKey);
  if (!identifierKey) return unresolvedIdentity();
  const group = players.byIdentifier.get(identifierKey);
  if (!group) return unresolvedIdentity();
  const matchedAlias = group.aliases.find((alias) => alias.identifierKey === identifierKey) ?? null;
  if (!matchedAlias) return unresolvedIdentity();
  return {
    resolved: true,
    identityId: group.identityId,
    entity: group.entity,
    aliases: group.aliases,
    aliasIdentifiers: group.aliases.map((alias) => alias.identifier),
    matchedAlias,
  };
}

export function resolveGuildIdentity(
  snapshot: Pick<IdentityResolutionSnapshot, "guilds"> | IdentityResolutionSnapshot["guilds"],
  identifier: string,
): GuildIdentityResolution {
  const guilds = "guilds" in snapshot ? snapshot.guilds : snapshot;
  const identifierKey = safeNormalize(identifier, normalizeGuildIdentifierKey);
  if (!identifierKey) return unresolvedIdentity();
  const group = guilds.byIdentifier.get(identifierKey);
  if (!group) return unresolvedIdentity();
  const matchedAlias = group.aliases.find((alias) => alias.identifierKey === identifierKey) ?? null;
  if (!matchedAlias) return unresolvedIdentity();
  return {
    resolved: true,
    identityId: group.identityId,
    entity: group.entity,
    aliases: group.aliases,
    aliasIdentifiers: group.aliases.map((alias) => alias.identifier),
    matchedAlias,
  };
}

export function collectPlayerIdentityObservations<TObservation>(
  snapshot: Pick<IdentityResolutionSnapshot, "players"> | IdentityResolutionSnapshot["players"],
  identifier: string,
  observations: readonly TObservation[],
  options: IdentityObservationOptions<TObservation> = {},
): PlayerIdentityObservationHistory<TObservation> {
  const resolution = resolvePlayerIdentity(snapshot, identifier);
  const identifierKeys = collectResolutionIdentifierKeys(identifier, resolution, normalizePlayerIdentifierKey);
  const collected = collectIdentityObservations(
    observations,
    identifierKeys,
    (observation) => options.getIdentifier?.(observation) ?? readStringField(observation, ["memberRef"]),
    normalizePlayerIdentifierKey,
    options,
  );
  return { resolution, observations: collected };
}

export function collectGuildIdentityObservations<TObservation>(
  snapshot: Pick<IdentityResolutionSnapshot, "guilds"> | IdentityResolutionSnapshot["guilds"],
  identifier: string,
  observations: readonly TObservation[],
  options: IdentityObservationOptions<TObservation> = {},
): GuildIdentityObservationHistory<TObservation> {
  const resolution = resolveGuildIdentity(snapshot, identifier);
  const identifierKeys = collectResolutionIdentifierKeys(identifier, resolution, normalizeGuildIdentifierKey);
  const collected = collectIdentityObservations(
    observations,
    identifierKeys,
    (observation) => options.getIdentifier?.(observation) ?? readStringField(observation, ["guildIdentifier"]),
    normalizeGuildIdentifierKey,
    options,
  );
  return { resolution, observations: collected };
}

function unresolvedIdentity(): UnresolvedIdentity {
  return {
    resolved: false,
    identityId: null,
    entity: null,
    aliases: [],
    aliasIdentifiers: [],
    matchedAlias: null,
  };
}

function collectResolutionIdentifierKeys<TEntity, TAlias extends { identifierKey: string }>(
  identifier: string,
  resolution: ResolvedIdentity<TEntity, TAlias> | UnresolvedIdentity,
  normalize: (value: string) => string,
) {
  if (resolution.resolved) return new Set(resolution.aliases.map((alias) => alias.identifierKey));
  const identifierKey = safeNormalize(identifier, normalize);
  return identifierKey ? new Set([identifierKey]) : new Set<string>();
}

function collectIdentityObservations<TObservation>(
  observations: readonly TObservation[],
  identifierKeys: ReadonlySet<string>,
  getIdentifier: (observation: TObservation) => string | null | undefined,
  normalize: (value: string) => string,
  options: IdentityObservationOptions<TObservation>,
) {
  const byObservationKey = new Map<string, IdentityHistoryObservation<TObservation>>();

  observations.forEach((observation, index) => {
    const identifier = String(getIdentifier(observation) ?? "").trim();
    const identifierKey = safeNormalize(identifier, normalize);
    if (!identifierKey || !identifierKeys.has(identifierKey)) return;

    const timestampMs = toTimestampMs(readTimestampValue(observation, options));
    const observationKey = buildObservationKey(observation, identifierKey, timestampMs, index, options);
    if (byObservationKey.has(observationKey)) return;

    byObservationKey.set(observationKey, {
      observation,
      identifier,
      identifierKey,
      timestampMs,
      observationKey,
    });
  });

  return [...byObservationKey.values()].sort((left, right) => {
    if (left.timestampMs == null && right.timestampMs != null) return 1;
    if (left.timestampMs != null && right.timestampMs == null) return -1;
    const timestampCompare = (left.timestampMs ?? 0) - (right.timestampMs ?? 0);
    return timestampCompare || left.observationKey.localeCompare(right.observationKey);
  });
}
