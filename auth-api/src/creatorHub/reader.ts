import { getCachedValue, setCachedValue } from "../public/twitch/cache.memory";
import { parseCatalog, type CatalogResponse, type CreatorCatalog } from "./types";

/** Per warm instance, coalesced reads; keep the last good catalog on failure. */
export function createCatalogReader(load: () => Promise<CreatorCatalog>, key = "creator-hub:catalog:v1") {
  let previous: CreatorCatalog | undefined, pending: Promise<CatalogResponse> | undefined;
  let expiresAt = 0;
  return async (): Promise<CatalogResponse> => {
    const cached = getCachedValue<CatalogResponse>(key);
    if (cached) return cached;
    if (pending) return pending;
    pending = (async () => {
      let result: CatalogResponse;
      try { previous = parseCatalog(await load()); expiresAt = Date.now() + 60000; result = { ...previous, stale: false }; }
      catch { expiresAt = Date.now() + 15000; if (!previous) throw Error("Creator catalog unavailable"); result = { ...previous, stale: true }; }
      setCachedValue(key, result, Math.max(1, expiresAt - Date.now())); return result;
    })();
    try { return await pending; } finally { pending = undefined; }
  };
}
