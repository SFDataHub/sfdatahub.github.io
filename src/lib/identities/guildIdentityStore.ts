import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const GUILD_IDENTITY_DB_NAME = "sfdatahub-local-guild-identities";
const GUILD_IDENTITY_DB_VERSION = 1;
const GUILD_ENTITIES_STORE = "guildEntities";
const GUILD_ALIASES_STORE = "guildAliases";
const GUILD_EXCLUSIONS_STORE = "guildExclusions";

export type GuildAliasSource = "automatic" | "manual" | "imported";
export type GuildExclusionSource = "manual";

export type GuildEntity = {
  entityId: string;
  createdAt: string;
  updatedAt: string;
};

export type GuildAlias = {
  identifierKey: string;
  identifier: string;
  entityId: string;
  addedAt: string;
  source: GuildAliasSource;
  confirmedAt?: string;
};

export type GuildExclusion = {
  pairKey: string;
  identifierA: string;
  identifierB: string;
  identifierAKey: string;
  identifierBKey: string;
  createdAt: string;
  source: GuildExclusionSource;
};

export type LinkGuildAliasesMetadata = {
  source: GuildAliasSource;
  confirmedAt?: string;
};

export type RejectGuildLinkMetadata = {
  source?: GuildExclusionSource;
};

export type LinkGuildAliasesResult = {
  entity: GuildEntity;
  aliases: GuildAlias[];
};

export type GuildIdentityStoreOptions = {
  dbName?: string;
};

interface GuildIdentityDb extends DBSchema {
  guildEntities: {
    key: string;
    value: GuildEntity;
    indexes: {
      by_createdAt: string;
      by_updatedAt: string;
    };
  };
  guildAliases: {
    key: string;
    value: GuildAlias;
    indexes: {
      by_entityId: string;
      by_source: GuildAliasSource;
    };
  };
  guildExclusions: {
    key: string;
    value: GuildExclusion;
    indexes: {
      by_identifierAKey: string;
      by_identifierBKey: string;
      by_source: GuildExclusionSource;
    };
  };
}

class GuildIdentityStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuildIdentityStoreError";
  }
}

export class GuildIdentityValidationError extends GuildIdentityStoreError {
  constructor(message: string) {
    super(message);
    this.name = "GuildIdentityValidationError";
  }
}

export class GuildIdentityConflictError extends GuildIdentityStoreError {
  constructor(message: string) {
    super(message);
    this.name = "GuildIdentityConflictError";
  }
}

const nowIso = () => new Date().toISOString();

const createEntityId = () => {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return `guild_${randomUuid}`;
  return `guild_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
};

const normalizeIdentifierInput = (identifier: string) => {
  const raw = String(identifier ?? "").trim();
  if (!raw) throw new GuildIdentityValidationError("guild_identifier_required");
  return {
    identifier: raw,
    identifierKey: raw.toLowerCase(),
  };
};

const createPairKey = (leftKey: string, rightKey: string) => [leftKey, rightKey].sort().join("::");

const sortAliases = (aliases: GuildAlias[]) =>
  [...aliases].sort((left, right) => {
    const addedCompare = left.addedAt.localeCompare(right.addedAt);
    return addedCompare || left.identifierKey.localeCompare(right.identifierKey);
  });

const chooseEntityToKeep = (left: GuildEntity, right: GuildEntity) => {
  const createdCompare = left.createdAt.localeCompare(right.createdAt);
  if (createdCompare < 0) return { keep: left, absorb: right };
  if (createdCompare > 0) return { keep: right, absorb: left };
  return left.entityId.localeCompare(right.entityId) <= 0
    ? { keep: left, absorb: right }
    : { keep: right, absorb: left };
};

export const normalizeGuildIdentifierKey = (identifier: string): string =>
  normalizeIdentifierInput(identifier).identifierKey;

export const createGuildExclusionPairKey = (left: string, right: string): string => {
  const leftInput = normalizeIdentifierInput(left);
  const rightInput = normalizeIdentifierInput(right);
  if (leftInput.identifierKey === rightInput.identifierKey) {
    throw new GuildIdentityValidationError("guild_identifier_pair_must_differ");
  }
  return createPairKey(leftInput.identifierKey, rightInput.identifierKey);
};

export function createGuildIdentityStore(options: GuildIdentityStoreOptions = {}) {
  const dbName = options.dbName ?? GUILD_IDENTITY_DB_NAME;
  let dbPromise: Promise<IDBPDatabase<GuildIdentityDb>> | null = null;

  const getDb = () => {
    if (!dbPromise) {
      dbPromise = openDB<GuildIdentityDb>(dbName, GUILD_IDENTITY_DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(GUILD_ENTITIES_STORE)) {
            const entities = db.createObjectStore(GUILD_ENTITIES_STORE, { keyPath: "entityId" });
            entities.createIndex("by_createdAt", "createdAt");
            entities.createIndex("by_updatedAt", "updatedAt");
          }

          if (!db.objectStoreNames.contains(GUILD_ALIASES_STORE)) {
            const aliases = db.createObjectStore(GUILD_ALIASES_STORE, { keyPath: "identifierKey" });
            aliases.createIndex("by_entityId", "entityId");
            aliases.createIndex("by_source", "source");
          }

          if (!db.objectStoreNames.contains(GUILD_EXCLUSIONS_STORE)) {
            const exclusions = db.createObjectStore(GUILD_EXCLUSIONS_STORE, { keyPath: "pairKey" });
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
    db: IDBPDatabase<GuildIdentityDb>,
    entityId: string,
  ): Promise<GuildAlias[]> => db.getAllFromIndex(GUILD_ALIASES_STORE, "by_entityId", entityId);

  const getCrossGroupRejection = async (
    getRejection: (pairKey: string) => Promise<GuildExclusion | undefined>,
    leftAliases: GuildAlias[],
    rightAliases: GuildAlias[],
  ) => {
    for (const leftAlias of leftAliases) {
      for (const rightAlias of rightAliases) {
        const rejection = await getRejection(createPairKey(leftAlias.identifierKey, rightAlias.identifierKey));
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

  const getGuildEntityForAlias = async (identifier: string): Promise<GuildEntity | null> => {
    const { identifierKey } = normalizeIdentifierInput(identifier);
    const db = await getDb();
    const alias = await db.get(GUILD_ALIASES_STORE, identifierKey);
    if (!alias) return null;
    return (await db.get(GUILD_ENTITIES_STORE, alias.entityId)) ?? null;
  };

  const getGuildAliases = async (entityId: string): Promise<string[]> => {
    const db = await getDb();
    const aliases = await readAliasesForEntity(db, entityId);
    return sortAliases(aliases).map((alias) => alias.identifier);
  };

  const listGuildEntities = async (): Promise<Array<{ entity: GuildEntity; aliases: GuildAlias[] }>> => {
    const db = await getDb();
    const entities = await db.getAll(GUILD_ENTITIES_STORE);
    const entries = await Promise.all(
      entities.map(async (entity) => ({
        entity,
        aliases: sortAliases(await readAliasesForEntity(db, entity.entityId)),
      })),
    );
    return entries.sort((left, right) => left.entity.createdAt.localeCompare(right.entity.createdAt));
  };

  const linkGuildAliases = async (
    left: string,
    right: string,
    metadata: LinkGuildAliasesMetadata,
  ): Promise<LinkGuildAliasesResult> => {
    const leftInput = normalizeIdentifierInput(left);
    const rightInput = normalizeIdentifierInput(right);
    if (leftInput.identifierKey === rightInput.identifierKey) {
      throw new GuildIdentityValidationError("guild_identifier_pair_must_differ");
    }

    const db = await getDb();
    const timestamp = nowIso();
    const tx = db.transaction([GUILD_ENTITIES_STORE, GUILD_ALIASES_STORE, GUILD_EXCLUSIONS_STORE], "readwrite");
    const entitiesStore = tx.objectStore(GUILD_ENTITIES_STORE);
    const aliasesStore = tx.objectStore(GUILD_ALIASES_STORE);
    const exclusionsStore = tx.objectStore(GUILD_EXCLUSIONS_STORE);

    try {
      if (await exclusionsStore.get(createPairKey(leftInput.identifierKey, rightInput.identifierKey))) {
        throw new GuildIdentityConflictError("guild_link_rejected");
      }

      const leftAlias = await aliasesStore.get(leftInput.identifierKey);
      const rightAlias = await aliasesStore.get(rightInput.identifierKey);

      if (leftAlias?.entityId && rightAlias?.entityId && leftAlias.entityId === rightAlias.entityId) {
        const entity = await entitiesStore.get(leftAlias.entityId);
        if (!entity) throw new GuildIdentityConflictError("guild_alias_entity_missing");
        const aliases = await aliasesStore.index("by_entityId").getAll(entity.entityId);
        await tx.done;
        return { entity, aliases: sortAliases(aliases) };
      }

      if (!leftAlias && !rightAlias) {
        const entity: GuildEntity = {
          entityId: createEntityId(),
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const aliases: GuildAlias[] = [
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
        if (!linkedAlias) throw new GuildIdentityConflictError("guild_alias_missing");

        const entity = await entitiesStore.get(linkedAlias.entityId);
        if (!entity) throw new GuildIdentityConflictError("guild_alias_entity_missing");

        if (!leftAlias || !rightAlias) {
          const newAlias: GuildAlias = {
            identifierKey: newInput.identifierKey,
            identifier: newInput.identifier,
            entityId: entity.entityId,
            addedAt: timestamp,
            source: metadata.source,
            ...(metadata.confirmedAt ? { confirmedAt: metadata.confirmedAt } : {}),
          };
          const existingAliases = await aliasesStore.index("by_entityId").getAll(entity.entityId);
          if (await getCrossGroupRejection((pairKey) => exclusionsStore.get(pairKey), existingAliases, [newAlias])) {
            throw new GuildIdentityConflictError("guild_link_rejected");
          }
          await aliasesStore.add(newAlias);
          const updatedEntity = { ...entity, updatedAt: timestamp };
          await entitiesStore.put(updatedEntity);
          await tx.done;
          return { entity: updatedEntity, aliases: sortAliases([...existingAliases, newAlias]) };
        }

        const leftEntity = await entitiesStore.get(leftAlias.entityId);
        const rightEntity = await entitiesStore.get(rightAlias.entityId);
        if (!leftEntity || !rightEntity) throw new GuildIdentityConflictError("guild_alias_entity_missing");

        const { keep, absorb } = chooseEntityToKeep(leftEntity, rightEntity);
        const keepAliases = await aliasesStore.index("by_entityId").getAll(keep.entityId);
        const absorbAliases = await aliasesStore.index("by_entityId").getAll(absorb.entityId);
        if (await getCrossGroupRejection((pairKey) => exclusionsStore.get(pairKey), keepAliases, absorbAliases)) {
          throw new GuildIdentityConflictError("guild_link_rejected");
        }

        for (const alias of absorbAliases) {
          await aliasesStore.put({ ...alias, entityId: keep.entityId });
        }
        const updatedEntity = { ...keep, updatedAt: timestamp };
        await entitiesStore.put(updatedEntity);
        await entitiesStore.delete(absorb.entityId);
        await tx.done;
        return {
          entity: updatedEntity,
          aliases: sortAliases([...keepAliases, ...absorbAliases.map((alias) => ({ ...alias, entityId: keep.entityId }))]),
        };
      }

      throw new GuildIdentityConflictError("guild_link_failed");
    } catch (error) {
      await abortTransaction(tx);
      throw error;
    }
  };

  const unlinkGuildAlias = async (identifier: string): Promise<void> => {
    const input = normalizeIdentifierInput(identifier);
    const db = await getDb();
    const timestamp = nowIso();
    const tx = db.transaction([GUILD_ENTITIES_STORE, GUILD_ALIASES_STORE], "readwrite");
    const entitiesStore = tx.objectStore(GUILD_ENTITIES_STORE);
    const aliasesStore = tx.objectStore(GUILD_ALIASES_STORE);

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

  const mergeGuildEntities = linkGuildAliases;

  const rejectGuildLink = async (
    left: string,
    right: string,
    metadata: RejectGuildLinkMetadata = {},
  ): Promise<GuildExclusion> => {
    const leftInput = normalizeIdentifierInput(left);
    const rightInput = normalizeIdentifierInput(right);
    if (leftInput.identifierKey === rightInput.identifierKey) {
      throw new GuildIdentityValidationError("guild_identifier_pair_must_differ");
    }

    const db = await getDb();
    const tx = db.transaction([GUILD_ALIASES_STORE, GUILD_EXCLUSIONS_STORE], "readwrite");
    const aliasesStore = tx.objectStore(GUILD_ALIASES_STORE);
    const exclusionsStore = tx.objectStore(GUILD_EXCLUSIONS_STORE);

    try {
      const leftAlias = await aliasesStore.get(leftInput.identifierKey);
      const rightAlias = await aliasesStore.get(rightInput.identifierKey);
      if (leftAlias?.entityId && rightAlias?.entityId && leftAlias.entityId === rightAlias.entityId) {
        throw new GuildIdentityConflictError("guild_link_already_confirmed");
      }

      const pairKey = createPairKey(leftInput.identifierKey, rightInput.identifierKey);
      const existing = await exclusionsStore.get(pairKey);
      if (existing) {
        await tx.done;
        return existing;
      }

      const [identifierA, identifierB] =
        leftInput.identifierKey <= rightInput.identifierKey ? [leftInput, rightInput] : [rightInput, leftInput];
      const rejection: GuildExclusion = {
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

  const removeGuildLinkRejection = async (left: string, right: string): Promise<void> => {
    const pairKey = createGuildExclusionPairKey(left, right);
    const db = await getDb();
    await db.delete(GUILD_EXCLUSIONS_STORE, pairKey);
  };

  const isGuildLinkRejected = async (left: string, right: string): Promise<boolean> => {
    const pairKey = createGuildExclusionPairKey(left, right);
    const db = await getDb();
    return Boolean(await db.get(GUILD_EXCLUSIONS_STORE, pairKey));
  };

  const getGuildLinkRejections = async (identifier: string): Promise<GuildExclusion[]> => {
    const { identifierKey } = normalizeIdentifierInput(identifier);
    const db = await getDb();
    const [asLeft, asRight] = await Promise.all([
      db.getAllFromIndex(GUILD_EXCLUSIONS_STORE, "by_identifierAKey", identifierKey),
      db.getAllFromIndex(GUILD_EXCLUSIONS_STORE, "by_identifierBKey", identifierKey),
    ]);
    return [...asLeft, ...asRight].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  };

  const listGuildExclusions = async (): Promise<GuildExclusion[]> => {
    const db = await getDb();
    const exclusions = await db.getAll(GUILD_EXCLUSIONS_STORE);
    return exclusions.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  };

  const close = async (): Promise<void> => {
    const db = await dbPromise;
    db?.close();
    dbPromise = null;
  };

  return {
    getGuildEntityForAlias,
    getGuildAliases,
    listGuildEntities,
    linkGuildAliases,
    unlinkGuildAlias,
    mergeGuildEntities,
    rejectGuildLink,
    removeGuildLinkRejection,
    isGuildLinkRejected,
    getGuildLinkRejections,
    listGuildExclusions,
    close,
  };
}

const defaultGuildIdentityStore = createGuildIdentityStore();

export const getGuildEntityForAlias = defaultGuildIdentityStore.getGuildEntityForAlias;
export const getGuildAliases = defaultGuildIdentityStore.getGuildAliases;
export const listGuildEntities = defaultGuildIdentityStore.listGuildEntities;
export const linkGuildAliases = defaultGuildIdentityStore.linkGuildAliases;
export const unlinkGuildAlias = defaultGuildIdentityStore.unlinkGuildAlias;
export const mergeGuildEntities = defaultGuildIdentityStore.mergeGuildEntities;
export const rejectGuildLink = defaultGuildIdentityStore.rejectGuildLink;
export const removeGuildLinkRejection = defaultGuildIdentityStore.removeGuildLinkRejection;
export const isGuildLinkRejected = defaultGuildIdentityStore.isGuildLinkRejected;
export const getGuildLinkRejections = defaultGuildIdentityStore.getGuildLinkRejections;
export const listGuildExclusions = defaultGuildIdentityStore.listGuildExclusions;
