// Only storage owned by the retired Firestore UniversalSearch.
const CACHE_PREFIX = "sfh:search:cache:v1:universal:";
const RECENTS_KEY = "sfh:search:recents";
const isLegacyKey = (key: string) => key.startsWith(CACHE_PREFIX) || key === RECENTS_KEY;
type LegacySearchStorage = Pick<Storage, "length" | "key" | "removeItem">;

export function cleanupLegacySearchStorage(
  storage: () => LegacySearchStorage | undefined = () => typeof window === "undefined" ? undefined : window.localStorage,
): boolean {
  try {
    const target = storage();
    if (!target) return false;
    const keys: string[] = [];
    for (let index = 0; index < target.length; index++) {
      const key = target.key(index);
      if (key !== null && isLegacyKey(key)) keys.push(key);
    }
    // Collect first: removing entries changes Storage's numeric indices.
    let complete = true;
    for (const key of keys) {
      try { target.removeItem(key); } catch { complete = false; }
    }
    for (let index = 0; index < target.length; index++) {
      const key = target.key(index);
      if (key !== null && isLegacyKey(key)) return false;
    }
    // No persistent marker: every startup also catches writes from old tabs.
    return complete;
  } catch {
    // Storage may be denied. Startup continues and the next start retries.
    return false;
  }
}
