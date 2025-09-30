// src/lib/db.ts
import { openDB, IDBPDatabase } from "idb";

export type SFDB = {
  players: {
    id: string;              // player_id (z. B. "eu1:12345")
    name: string;
    server: string;          // "EU1", "FUS1", ...
    className?: string;
    level?: number;
    scrapbookPct?: number;
    guildId?: string | null;
    updatedAt: number;       // epoch ms
  };
  guilds: {
    id: string;              // guild_id (z. B. "eu1:g-998")
    name: string;
    server: string;
    memberCount?: number;
    updatedAt: number;
  };
  scans: {
    id: string;              // scan_id (unique)
    server: string;
    playerId?: string;
    guildId?: string;
    payloadHash: string;     // zur Idempotenz/Dedupe
    createdAt: number;
  };
  metadata: {
    key: string;
    value: unknown;
    updatedAt: number;
  };
  links: {
    id: string;              // frei für Relationen (player<->guild etc.)
    a: string;
    b: string;
    type: string;            // z. B. "member_of"
    updatedAt: number;
  };
};

let _dbPromise: Promise<IDBPDatabase<any>> | null = null;

export function getDB() {
  if (!_dbPromise) {
    _dbPromise = openDB("sfdatahub", 1, {
      upgrade(db) {
        // players
        const players = db.createObjectStore("players", { keyPath: "id" });
        players.createIndex("by_server", "server");
        players.createIndex("by_name", "name");

        // guilds
        const guilds = db.createObjectStore("guilds", { keyPath: "id" });
        guilds.createIndex("by_server", "server");
        guilds.createIndex("by_name", "name");

        // scans
        const scans = db.createObjectStore("scans", { keyPath: "id" });
        scans.createIndex("by_server", "server");
        scans.createIndex("by_player", "playerId");
        scans.createIndex("by_guild", "guildId");
        scans.createIndex("by_hash", "payloadHash");

        // metadata (Key-Value)
        db.createObjectStore("metadata", { keyPath: "key" });

        // links (freie Kanten)
        const links = db.createObjectStore("links", { keyPath: "id" });
        links.createIndex("by_type", "type");
      },
    });
  }
  return _dbPromise!;
}
