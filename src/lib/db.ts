// src/lib/db.ts
import { openDB, IDBPDatabase } from "idb";

/**
 * Grundschema für SFDataHub – passt zu den Upserts in src/lib/import/upsert.ts
 */
export type PlayerRow = {
  id: string;           // z.B. "eu1:12345"
  name: string;
  server: string;       // "EU1", "FUS1", ...
  className?: string;
  level?: number;
  scrapbookPct?: number;
  guildId?: string | null;
  updatedAt: number;
};

export type GuildRow = {
  id: string;           // z.B. "eu1:g-998"
  name: string;
  server: string;
  memberCount?: number;
  updatedAt: number;
};

export type ScanRow = {
  id: string;           // "eu1:scan:timestamp:rand"
  server: string;
  playerId?: string;
  guildId?: string;
  payloadHash: string;  // zur Dedupe/Idempotenz
  createdAt: number;
};

export type MetadataRow = {
  key: string;
  value: unknown;
  updatedAt: number;
};

export type LinkRow = {
  id: string;
  a: string;
  b: string;
  type: string;         // z.B. "member_of"
  updatedAt: number;
};

let _dbPromise: Promise<IDBPDatabase<any>> | null = null;

/**
 * Liefert eine geöffnete IndexedDB-Instanz (singleton).
 * Achtung: Stelle sicher, dass das Paket `idb` installiert ist.
 */
export function getDB() {
  if (!_dbPromise) {
    _dbPromise = openDB("sfdatahub", 1, {
      upgrade(db) {
        // players
        if (!db.objectStoreNames.contains("players")) {
          const store = db.createObjectStore("players", { keyPath: "id" });
          store.createIndex("by_server", "server");
          store.createIndex("by_name", "name");
        }

        // guilds
        if (!db.objectStoreNames.contains("guilds")) {
          const store = db.createObjectStore("guilds", { keyPath: "id" });
          store.createIndex("by_server", "server");
          store.createIndex("by_name", "name");
        }

        // scans
        if (!db.objectStoreNames.contains("scans")) {
          const store = db.createObjectStore("scans", { keyPath: "id" });
          store.createIndex("by_server", "server");
          store.createIndex("by_player", "playerId");
          store.createIndex("by_guild", "guildId");
          store.createIndex("by_hash", "payloadHash");
        }

        // metadata (Key-Value)
        if (!db.objectStoreNames.contains("metadata")) {
          db.createObjectStore("metadata", { keyPath: "key" });
        }

        // links (freie Kanten)
        if (!db.objectStoreNames.contains("links")) {
          const store = db.createObjectStore("links", { keyPath: "id" });
          store.createIndex("by_type", "type");
        }
      },
    });
  }
  return _dbPromise!;
}
