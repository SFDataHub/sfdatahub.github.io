import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const PLAYER_IDENTITY_DB_NAME = "sfdatahub-local-identities";
const PLAYER_IDENTITY_DB_VERSION = 1;
const PLAYER_ENTITIES_STORE = "playerEntities";
const PLAYER_ALIASES_STORE = "playerAliases";
const PLAYER_EXCLUSIONS_STORE = "playerExclusions";

export type PlayerAliasSource = "automatic" | "manual" | "imported";
export type PlayerExclusionSource = "manual";

export type PlayerEntity = {
  entityId: string;
  createdAt: string;
  updatedAt: string;
};

export type PlayerAlias = {
  identifierKey: string;
  identifier: string;
  entityId: string;
  addedAt: string;
  source: PlayerAliasSource;
  confirmedAt?: string;
};

export type PlayerExclusion = {
  pairKey: string;
  identifierA: string;
  identifierB: string;
  identifierAKey: string;
  identifierBKey: string;
  createdAt: string;
  source: PlayerExclusionSource;
};

export type LinkPlayerIdentifiersMetadata = {
  source: PlayerAliasSource;
  confirmedAt?: string;
};

export type RejectPlayerMatchMetadata = {
  source?: PlayerExclusionSource;
};

export type LinkPlayerIdentifiersResult = {
  entity: PlayerEntity;
  aliases: PlayerAlias[];
};

export type PlayerIdentityStoreOptions = {
  dbName?: string;
};

interface PlayerIdentityDb extends DBSchema {
  playerEntities: {
    key: string;
    value: PlayerEntity;
    indexes: {
      by_createdAt: string;
      by_updatedAt: string;
    };
  };
  playerAliases: {
    key: string;
    value: PlayerAlias;
    indexes: {
      by_entityId: string;
      by_source: PlayerAliasSource;
    };
  };
  playerExclusions: {
    key: string;
    value: PlayerExclusion;
    indexes: {
      by_identifierAKey: string;
      by_identifierBKey: string;
      by_source: PlayerExclusionSource;
    };
  };
}

class PlayerIdentityStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerIdentityStoreError";
  }
}

export class PlayerIdentityValidationError extends PlayerIdentityStoreError {
  constructor(message: string) {
    super(message);
    this.name = "PlayerIdentityValidationError";
  }
}

export class PlayerIdentityConflictError extends PlayerIdentityStoreError {
  constructor(message: string) {
    super(message);
    this.name = "PlayerIdentityConflictError";
  }
}

const nowIso = () => new Date().toISOString();

const createEntityId = () => {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return `player_${randomUuid}`;

  const randomPart = Math.random().toString(36).slice(2, 12);
  return `player_${Date.now().toString(36)}_${randomPart}`;
};

const normalizeIdentifierInput = (identifier: string) => {
  const raw = String(identifier ?? "").trim();
  if (!raw) {
    throw new PlayerIdentityValidationError("player_identifier_required");
  }
  return {
    identifier: raw,
    identifierKey: raw.toLowerCase(),
  };
};

const createPairKey = (leftKey: string, rightKey: string) => [leftKey, rightKey].sort().join("::");

const sortAliases = (aliases: PlayerAlias[]) =>
  [...aliases].sort((left, right) => {
    const addedCompare = left.addedAt.localeCompare(right.addedAt);
    return addedCompare || left.identifierKey.localeCompare(right.identifierKey);
  });

const chooseEntityToKeep = (left: PlayerEntity, right: PlayerEntity) => {
  const createdCompare = left.createdAt.localeCompare(right.createdAt);
  if (createdCompare < 0) return { keep: left, absorb: right };
  if (createdCompare > 0) return { keep: right, absorb: left };
  return left.entityId.localeCompare(right.entityId) <= 0
    ? { keep: left, absorb: right }
    : { keep: right, absorb: left };
};

export const normalizePlayerIdentifierKey = (identifier: string): string =>
  normalizeIdentifierInput(identifier).identifierKey;

export const createPlayerExclusionPairKey = (left: string, right: string): string => {
  const leftInput = normalizeIdentifierInput(left);
  const rightInput = normalizeIdentifierInput(right);
  if (leftInput.identifierKey === rightInput.identifierKey) {
    throw new PlayerIdentityValidationError("player_identifier_pair_must_differ");
  }
  return createPairKey(leftInput.identifierKey, rightInput.identifierKey);
};

export function createPlayerIdentityStore(options: PlayerIdentityStoreOptions = {}) {
  const dbName = options.dbName ?? PLAYER_IDENTITY_DB_NAME;
  let dbPromise: Promise<IDBPDatabase<PlayerIdentityDb>> | null = null;

  const getDb = () => {
    if (!dbPromise) {
      dbPromise = openDB<PlayerIdentityDb>(dbName, PLAYER_IDENTITY_DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(PLAYER_ENTITIES_STORE)) {
            const entities = db.createObjectStore(PLAYER_ENTITIES_STORE, { keyPath: "entityId" });
            entities.createIndex("by_createdAt", "createdAt");
            entities.createIndex("by_updatedAt", "updatedAt");
          }

          if (!db.objectStoreNames.contains(PLAYER_ALIASES_STORE)) {
            const aliases = db.createObjectStore(PLAYER_ALIASES_STORE, { keyPath: "identifierKey" });
            aliases.createIndex("by_entityId", "entityId");
            aliases.createIndex("by_source", "source");
          }

          if (!db.objectStoreNames.contains(PLAYER_EXCLUSIONS_STORE)) {
            const exclusions = db.createObjectStore(PLAYER_EXCLUSIONS_STORE, { keyPath: "pairKey" });
            exclusions.createIndex("by_identifierAKey", "identifierAKey");
            exclusions.createIndex("by_identifierBKey", "identifierBKey");
            exclusions.createIndex("by_source", "source");
          }
        },
      });
    }

    return dbPromise;
  };

  const readAliasesForEntity = async (
    db: IDBPDatabase<PlayerIdentityDb>,
    entityId: string,
  ): Promise<PlayerAlias[]> => db.getAllFromIndex(PLAYER_ALIASES_STORE, "by_entityId", entityId);

  const getCrossGroupRejection = async (
    getRejection: (pairKey: string) => Promise<PlayerExclusion | undefined>,
    leftAliases: PlayerAlias[],
    rightAliases: PlayerAlias[],
  ) => {
    for (const leftAlias of leftAliases) {
      for (const rightAlias of rightAliases) {
        const pairKey = createPairKey(leftAlias.identifierKey, rightAlias.identifierKey);
        const rejection = await getRejection(pairKey);
        if (rejection) return rejection;
      }
    }
    return null;
  };

  const abortTransaction = async (tx: { abort: () => void; done: Promise<unknown> }) => {
    try {
      tx.abort();
    } catch {
      // The transaction may already be inactive after an IndexedDB request error.
    }
    await tx.done.catch(() => undefined);
  };

  const getPlayerIdentity = async (identifier: string): Promise<PlayerEntity | null> => {
    const { identifierKey } = normalizeIdentifierInput(identifier);
    const db = await getDb();
    const alias = await db.get(PLAYER_ALIASES_STORE, identifierKey);
    if (!alias) return null;
    return (await db.get(PLAYER_ENTITIES_STORE, alias.entityId)) ?? null;
  };

  const getPlayerAliases = async (entityId: string): Promise<string[]> => {
    const db = await getDb();
    const aliases = await readAliasesForEntity(db, entityId);
    return sortAliases(aliases).map((alias) => alias.identifier);
  };

  const getResolvedPlayerIdentifiers = async (identifier: string): Promise<string[]> => {
    const input = normalizeIdentifierInput(identifier);
    const entity = await getPlayerIdentity(input.identifier);
    if (!entity) return [input.identifier];
    return getPlayerAliases(entity.entityId);
  };

  const listPlayerEntities = async (): Promise<Array<{ entity: PlayerEntity; aliases: PlayerAlias[] }>> => {
    const db = await getDb();
    const entities = await db.getAll(PLAYER_ENTITIES_STORE);
    const entries = await Promise.all(
      entities.map(async (entity) => ({
        entity,
        aliases: sortAliases(await readAliasesForEntity(db, entity.entityId)),
      })),
    );
    return entries.sort((left, right) => left.entity.createdAt.localeCompare(right.entity.createdAt));
  };

  const linkPlayerIdentifiers = async (
    left: string,
    right: string,
    metadata: LinkPlayerIdentifiersMetadata,
  ): Promise<LinkPlayerIdentifiersResult> => {
    const leftInput = normalizeIdentifierInput(left);
    const rightInput = normalizeIdentifierInput(right);
    if (leftInput.identifierKey === rightInput.identifierKey) {
      throw new PlayerIdentityValidationError("player_identifier_pair_must_differ");
    }

    const db = await getDb();
    const timestamp = nowIso();
    const tx = db.transaction([PLAYER_ENTITIES_STORE, PLAYER_ALIASES_STORE, PLAYER_EXCLUSIONS_STORE], "readwrite");
    const entitiesStore = tx.objectStore(PLAYER_ENTITIES_STORE);
    const aliasesStore = tx.objectStore(PLAYER_ALIASES_STORE);
    const exclusionsStore = tx.objectStore(PLAYER_EXCLUSIONS_STORE);

    try {
      const directPairKey = createPairKey(leftInput.identifierKey, rightInput.identifierKey);
      if (await exclusionsStore.get(directPairKey)) {
        throw new PlayerIdentityConflictError("player_match_rejected");
      }

      const leftAlias = await aliasesStore.get(leftInput.identifierKey);
      const rightAlias = await aliasesStore.get(rightInput.identifierKey);

      if (leftAlias?.entityId && rightAlias?.entityId && leftAlias.entityId === rightAlias.entityId) {
        const entity = await entitiesStore.get(leftAlias.entityId);
        if (!entity) throw new PlayerIdentityConflictError("player_alias_entity_missing");
        const aliases = await aliasesStore.index("by_entityId").getAll(entity.entityId);
        await tx.done;
        return { entity, aliases: sortAliases(aliases) };
      }

      if (!leftAlias && !rightAlias) {
        const entity: PlayerEntity = {
          entityId: createEntityId(),
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const aliases: PlayerAlias[] = [
          {
            identifierKey: leftInput.identifierKey,
            identifier: leftInput.identifier,
            entityId: entity.entityId,
            addedAt: timestamp,
            source: metadata.source,
            ...(metadata.confirmedAt ? { confirmedAt: metadata.confirmedAt } : {}),
          },
          {
            identifierKey: rightInput.identifierKey,
            identifier: rightInput.identifier,
            entityId: entity.entityId,
            addedAt: timestamp,
            source: metadata.source,
            ...(metadata.confirmedAt ? { confirmedAt: metadata.confirmedAt } : {}),
          },
        ];
        await entitiesStore.add(entity);
        await aliasesStore.add(aliases[0]);
        await aliasesStore.add(aliases[1]);
        await tx.done;
        return { entity, aliases: sortAliases(aliases) };
      }

      if (leftAlias || rightAlias) {
        const linkedAlias = leftAlias ?? rightAlias;
        const newInput = leftAlias ? rightInput : leftInput;
        if (!linkedAlias) throw new PlayerIdentityConflictError("player_alias_missing");

        const entity = await entitiesStore.get(linkedAlias.entityId);
        if (!entity) throw new PlayerIdentityConflictError("player_alias_entity_missing");

        if (!leftAlias || !rightAlias) {
          const newAlias: PlayerAlias = {
            identifierKey: newInput.identifierKey,
            identifier: newInput.identifier,
            entityId: entity.entityId,
            addedAt: timestamp,
            source: metadata.source,
            ...(metadata.confirmedAt ? { confirmedAt: metadata.confirmedAt } : {}),
          };
          const existingAliases = await aliasesStore.index("by_entityId").getAll(entity.entityId);
          if (await getCrossGroupRejection((pairKey) => exclusionsStore.get(pairKey), existingAliases, [newAlias])) {
            throw new PlayerIdentityConflictError("player_match_rejected");
          }
          await aliasesStore.add(newAlias);
          const updatedEntity = { ...entity, updatedAt: timestamp };
          await entitiesStore.put(updatedEntity);
          const aliases = [...existingAliases, newAlias];
          await tx.done;
          return { entity: updatedEntity, aliases: sortAliases(aliases) };
        }

        const leftEntity = await entitiesStore.get(leftAlias.entityId);
        const rightEntity = await entitiesStore.get(rightAlias.entityId);
        if (!leftEntity || !rightEntity) throw new PlayerIdentityConflictError("player_alias_entity_missing");

        const { keep, absorb } = chooseEntityToKeep(leftEntity, rightEntity);
        const keepAliases = await aliasesStore.index("by_entityId").getAll(keep.entityId);
        const absorbAliases = await aliasesStore.index("by_entityId").getAll(absorb.entityId);
        if (await getCrossGroupRejection((pairKey) => exclusionsStore.get(pairKey), keepAliases, absorbAliases)) {
          throw new PlayerIdentityConflictError("player_match_rejected");
        }

        for (const alias of absorbAliases) {
          await aliasesStore.put({ ...alias, entityId: keep.entityId });
        }
        const updatedEntity = { ...keep, updatedAt: timestamp };
        await entitiesStore.put(updatedEntity);
        await entitiesStore.delete(absorb.entityId);
        const aliases = [...keepAliases, ...absorbAliases.map((alias) => ({ ...alias, entityId: keep.entityId }))];
        await tx.done;
        return { entity: updatedEntity, aliases: sortAliases(aliases) };
      }

      throw new PlayerIdentityConflictError("player_link_failed");
    } catch (error) {
      await abortTransaction(tx);
      throw error;
    }
  };

  const unlinkPlayerIdentifier = async (identifier: string): Promise<void> => {
    const input = normalizeIdentifierInput(identifier);
    const db = await getDb();
    const timestamp = nowIso();
    const tx = db.transaction([PLAYER_ENTITIES_STORE, PLAYER_ALIASES_STORE], "readwrite");
    const entitiesStore = tx.objectStore(PLAYER_ENTITIES_STORE);
    const aliasesStore = tx.objectStore(PLAYER_ALIASES_STORE);

    try {
      const alias = await aliasesStore.get(input.identifierKey);
      if (!alias) {
        await tx.done;
        return;
      }

      await aliasesStore.delete(input.identifierKey);
      const remainingAliases = await aliasesStore.index("by_entityId").getAll(alias.entityId);

      if (remainingAliases.length <= 1) {
        for (const remainingAlias of remainingAliases) {
          await aliasesStore.delete(remainingAlias.identifierKey);
        }
        await entitiesStore.delete(alias.entityId);
      } else {
        const entity = await entitiesStore.get(alias.entityId);
        if (entity) await entitiesStore.put({ ...entity, updatedAt: timestamp });
      }

      await tx.done;
    } catch (error) {
      await abortTransaction(tx);
      throw error;
    }
  };

  const rejectPlayerMatch = async (
    left: string,
    right: string,
    metadata: RejectPlayerMatchMetadata = {},
  ): Promise<PlayerExclusion> => {
    const leftInput = normalizeIdentifierInput(left);
    const rightInput = normalizeIdentifierInput(right);
    if (leftInput.identifierKey === rightInput.identifierKey) {
      throw new PlayerIdentityValidationError("player_identifier_pair_must_differ");
    }

    const db = await getDb();
    const tx = db.transaction([PLAYER_ALIASES_STORE, PLAYER_EXCLUSIONS_STORE], "readwrite");
    const aliasesStore = tx.objectStore(PLAYER_ALIASES_STORE);
    const exclusionsStore = tx.objectStore(PLAYER_EXCLUSIONS_STORE);

    try {
      const leftAlias = await aliasesStore.get(leftInput.identifierKey);
      const rightAlias = await aliasesStore.get(rightInput.identifierKey);
      if (leftAlias?.entityId && rightAlias?.entityId && leftAlias.entityId === rightAlias.entityId) {
        throw new PlayerIdentityConflictError("player_match_already_linked");
      }

      const pairKey = createPairKey(leftInput.identifierKey, rightInput.identifierKey);
      const existing = await exclusionsStore.get(pairKey);
      if (existing) {
        await tx.done;
        return existing;
      }

      const [identifierA, identifierB] =
        leftInput.identifierKey <= rightInput.identifierKey ? [leftInput, rightInput] : [rightInput, leftInput];
      const rejection: PlayerExclusion = {
        pairKey,
        identifierA: identifierA.identifier,
        identifierB: identifierB.identifier,
        identifierAKey: identifierA.identifierKey,
        identifierBKey: identifierB.identifierKey,
        createdAt: nowIso(),
        source: metadata.source ?? "manual",
      };
      await exclusionsStore.add(rejection);
      await tx.done;
      return rejection;
    } catch (error) {
      await abortTransaction(tx);
      throw error;
    }
  };

  const removePlayerMatchRejection = async (left: string, right: string): Promise<void> => {
    const pairKey = createPlayerExclusionPairKey(left, right);
    const db = await getDb();
    await db.delete(PLAYER_EXCLUSIONS_STORE, pairKey);
  };

  const isPlayerMatchRejected = async (left: string, right: string): Promise<boolean> => {
    const pairKey = createPlayerExclusionPairKey(left, right);
    const db = await getDb();
    return Boolean(await db.get(PLAYER_EXCLUSIONS_STORE, pairKey));
  };

  const getPlayerMatchRejections = async (identifier: string): Promise<PlayerExclusion[]> => {
    const { identifierKey } = normalizeIdentifierInput(identifier);
    const db = await getDb();
    const [asLeft, asRight] = await Promise.all([
      db.getAllFromIndex(PLAYER_EXCLUSIONS_STORE, "by_identifierAKey", identifierKey),
      db.getAllFromIndex(PLAYER_EXCLUSIONS_STORE, "by_identifierBKey", identifierKey),
    ]);
    return [...asLeft, ...asRight].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  };

  const listPlayerExclusions = async (): Promise<PlayerExclusion[]> => {
    const db = await getDb();
    const exclusions = await db.getAll(PLAYER_EXCLUSIONS_STORE);
    return exclusions.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  };

  const close = async (): Promise<void> => {
    const db = await dbPromise;
    db?.close();
    dbPromise = null;
  };

  return {
    getPlayerIdentity,
    getPlayerAliases,
    getResolvedPlayerIdentifiers,
    listPlayerEntities,
    linkPlayerIdentifiers,
    unlinkPlayerIdentifier,
    rejectPlayerMatch,
    removePlayerMatchRejection,
    isPlayerMatchRejected,
    getPlayerMatchRejections,
    listPlayerExclusions,
    close,
  };
}

const defaultPlayerIdentityStore = createPlayerIdentityStore();

export const getPlayerIdentity = defaultPlayerIdentityStore.getPlayerIdentity;
export const getPlayerAliases = defaultPlayerIdentityStore.getPlayerAliases;
export const getResolvedPlayerIdentifiers = defaultPlayerIdentityStore.getResolvedPlayerIdentifiers;
export const listPlayerEntities = defaultPlayerIdentityStore.listPlayerEntities;
export const linkPlayerIdentifiers = defaultPlayerIdentityStore.linkPlayerIdentifiers;
export const unlinkPlayerIdentifier = defaultPlayerIdentityStore.unlinkPlayerIdentifier;
export const rejectPlayerMatch = defaultPlayerIdentityStore.rejectPlayerMatch;
export const removePlayerMatchRejection = defaultPlayerIdentityStore.removePlayerMatchRejection;
export const isPlayerMatchRejected = defaultPlayerIdentityStore.isPlayerMatchRejected;
export const getPlayerMatchRejections = defaultPlayerIdentityStore.getPlayerMatchRejections;
export const listPlayerExclusions = defaultPlayerIdentityStore.listPlayerExclusions;
