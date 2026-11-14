import { AUTH_BASE_URL } from "../auth/config";
import { readPublicCache, writePublicCache, withPublicReadLock } from "../cache/publicReadCache";
import { isCatalogResponse, parseCatalog, type CatalogResponse } from "../../../auth-api/src/creatorHub/types";

const endpoint = `${AUTH_BASE_URL.replace(/\/$/, "")}/public/creator-hub.json`;
const key = `creator-hub:catalog:v1:${endpoint}`;
export const CATALOG_TTL = 5 * 60000;
// Called on mount or at a fixed expiry, never by local selection/filter/focus.
export function loadCreatorCatalog(): Promise<{ data: CatalogResponse; expiresAt: number }> {
  return withPublicReadLock(key, async () => {
    const cached = await readPublicCache<CatalogResponse>(key, isCatalogResponse, true);
    if (cached && cached.expiresAt > Date.now()) return { data: cached.value, expiresAt: cached.expiresAt };
    let data: CatalogResponse;
    try {
      const response = await fetch(endpoint, { credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw Error("Catalog unavailable");
      const raw = await response.json();
      if (!isCatalogResponse(raw)) throw Error("Invalid catalog");
      data = { ...parseCatalog(raw), stale: raw.stale };
    } catch {
      if (!cached) throw Error("Catalog unavailable");
      data = { ...cached.value, stale: true };
    }
    const expiresAt = Date.now() + (data.stale ? 60000 : CATALOG_TTL);
    await writePublicCache(key, data, expiresAt);
    return { data, expiresAt };
  });
}
