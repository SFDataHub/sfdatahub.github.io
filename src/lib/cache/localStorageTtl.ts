type TtlPayload = {
  cachedAt: number;
  data: unknown;
};

export function readTtlCache(key: string, ttlMs: number): unknown | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TtlPayload;
    if (!parsed || typeof parsed.cachedAt !== "number") return null;
    if (Date.now() - parsed.cachedAt >= ttlMs) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export function writeTtlCache(key: string, data: unknown): void {
  if (typeof window === "undefined") return;
  try {
    const payload: TtlPayload = { cachedAt: Date.now(), data };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore cache write failures
  }
}
