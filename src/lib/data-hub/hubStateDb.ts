import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type HubStateRecord = { key: string; value: unknown; updatedAt: string };
interface HubStateDb extends DBSchema {
  state: { key: string; value: HubStateRecord };
}
let opening: Promise<IDBPDatabase<HubStateDb>> | undefined;

// Same existing hubstate database/store; no new database or version required.
export function getHubStateDb() {
  return opening ??= open().catch(error => { opening = undefined; throw error; });
}
async function open(): Promise<IDBPDatabase<HubStateDb>> {
  let db: IDBPDatabase<HubStateDb>;
  try {
    db = await openDB<HubStateDb>("sfdatahub-guild-hub", 2, { upgrade(db) {
      if (!db.objectStoreNames.contains("state")) db.createObjectStore("state", { keyPath: "key" });
    } });
  } catch (error) {
    if ((error as { name?: string })?.name !== "VersionError") throw error;
    db = await openDB<HubStateDb>("sfdatahub-guild-hub");
  }
  if (!db.objectStoreNames.contains("state")) {
    const version = db.version + 1; db.close();
    db = await openDB<HubStateDb>("sfdatahub-guild-hub", version, { upgrade(db) {
      db.createObjectStore("state", { keyPath: "key" });
    } });
  }
  return db;
}
