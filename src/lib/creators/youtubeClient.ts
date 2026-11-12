import { AUTH_BASE_URL } from "../auth/config";
import type { YouTubeSnapshot } from "./shared";
import { isYouTubeSnapshot } from "../../../auth-api/src/creators/types";
import { isYouTubeErrorCode, type YouTubeErrorCode } from "../../../auth-api/src/creators/diagnostics";
import { publicationCheck, validPublicCheck, readPublicCache, writePublicCache, withPublicReadLock, publicCacheRevision, watchPublicCache, PUBLIC_HOUR, PUBLIC_DELAY, type PublicCheck } from "../cache/publicReadCache";
const base = AUTH_BASE_URL.replace(/\/$/, "");
export class YouTubeClientError extends Error {
  constructor(message: "loadError" | "snapshotMissing" | "refreshError" | "busy", readonly code: YouTubeErrorCode) {
    super(message);
    this.name = "YouTubeClientError";
  }
}
async function requestSnapshot(refresh = false, signal?: AbortSignal): Promise<YouTubeSnapshot> {
  let response: Response;
  try {
    response = await fetch(`${base}${refresh ? "/admin/creators/youtube/refresh?videos=10" : "/public/creators-live.json?videos=10"}`, {
      method: refresh ? "POST" : "GET", credentials: refresh ? "include" : "omit", cache: refresh ? "no-store" : "default", signal,
    });
  } catch { throw new YouTubeClientError(refresh ? "refreshError" : "loadError", "YOUTUBE_UNREACHABLE"); }
  let payload: any;
  try { payload = await response.json(); }
  catch { throw new YouTubeClientError(response.status === 409 ? "busy" : refresh ? "refreshError" : "loadError",
    response.status === 409 ? "YOUTUBE_SYNC_BUSY" : "YOUTUBE_RESPONSE_INVALID"); }
  if (!response.ok) {
    if (response.status === 409) throw new YouTubeClientError("busy", "YOUTUBE_SYNC_BUSY");
    if (!refresh && payload?.error === "YOUTUBE_SNAPSHOT_MISSING") throw new YouTubeClientError("snapshotMissing", "YOUTUBE_SNAPSHOT_MISSING");
    // Privileged details stay in the admin response/log. Display only approved codes.
    const code = refresh && isYouTubeErrorCode(payload?.error) ? payload.error
      : response.status === 401 || response.status === 403 ? "YOUTUBE_ACCESS_DENIED"
      : refresh ? "YOUTUBE_REFRESH_FAILED" : "YOUTUBE_SNAPSHOT_UNAVAILABLE";
    throw new YouTubeClientError(refresh ? "refreshError" : "loadError", code);
  }
  if (!isYouTubeSnapshot(payload?.youtube)) throw new YouTubeClientError(refresh ? "refreshError" : "loadError", "YOUTUBE_RESPONSE_INVALID");
  return payload.youtube;
}


type PublicState = { data: YouTubeSnapshot | null; check: PublicCheck; error?: YouTubeErrorCode };
const cacheKey = `youtube:snapshot10:schema1:avatar240:${base}`;
const validState = (value: unknown) => {
  const state = value as PublicState;
  return !!state && validPublicCheck(state.check) && (state.data === null || isYouTubeSnapshot(state.data)) &&
    (state.error === undefined || isYouTubeErrorCode(state.error));
};
let expiresAt = 0;
export async function loadYouTubeSnapshot(refresh = false, signal?: AbortSignal): Promise<YouTubeSnapshot> {
  if (refresh) {
    const snapshot = await requestSnapshot(true, signal);
    const next = publicationCheck(snapshot.generatedAt);
    expiresAt = next.expiresAt;
    await writePublicCache(cacheKey, { data: snapshot, check: next.check } satisfies PublicState, expiresAt);
    return snapshot;
  }
  // A component unmount cancels only its subscription, never a shared GET that
  // another reader/tab still needs (including React's development remount).
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const state = await withPublicReadLock(cacheKey, async () => {
    const cached = await readPublicCache<PublicState>(cacheKey, validState, true);
    if (cached && Date.now() < cached.expiresAt) { expiresAt = cached.expiresAt; return cached.value; }
    const revision = publicCacheRevision(cacheKey);
    let data = cached?.value.data ?? null, error: YouTubeErrorCode | undefined;
    try { data = await requestSnapshot(); }
    catch (failure) { error = failure instanceof YouTubeClientError ? failure.code : "YOUTUBE_SNAPSHOT_UNAVAILABLE"; }
    // A successful manual update supersedes a GET started before that update.
    if (revision !== publicCacheRevision(cacheKey)) {
      const latest = await readPublicCache<PublicState>(cacheKey, validState, true);
      if (latest) { expiresAt = latest.expiresAt; return latest.value; }
    }
    const next = publicationCheck(data?.generatedAt, cached?.value.check);
    const value: PublicState = { data, check: next.check, ...(error ? { error } : {}) };
    expiresAt = next.expiresAt;
    await writePublicCache(cacheKey, value, expiresAt);
    return value;
  });
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (!state.data) throw new YouTubeClientError(state.error === "YOUTUBE_SNAPSHOT_MISSING" ? "snapshotMissing" : "loadError", state.error ?? "YOUTUBE_SNAPSHOT_UNAVAILABLE");
  return state.data;
}

type Subscriber = { success: (snapshot: YouTubeSnapshot) => void; error: (error: unknown) => void };
const subscribers = new Set<Subscriber>();
let timer: ReturnType<typeof setTimeout> | undefined, unwatch: (() => void) | undefined;
function schedule() {
  clearTimeout(timer); timer = undefined;
  if (!subscribers.size || document.visibilityState === "hidden") return;
  const now = Date.now();
  const due = expiresAt > now ? expiresAt : (Math.floor(now / PUBLIC_HOUR) + 1) * PUBLIC_HOUR + PUBLIC_DELAY;
  timer = setTimeout(() => { timer = undefined; if (document.visibilityState !== "hidden") void deliver(); }, Math.max(0, due - now));
}
async function deliver() {
  try { const value = await loadYouTubeSnapshot(); for (const listener of subscribers) listener.success(value); }
  catch (error) { for (const listener of subscribers) listener.error(error); }
  finally { schedule(); }
}
function visible() {
  // Returning from suspension only refreshes an expired current window.
  if (document.visibilityState !== "hidden" && expiresAt && Date.now() >= expiresAt) void deliver();
  else schedule();
}
export function subscribeYouTubeSnapshot(success: Subscriber["success"], error: Subscriber["error"]) {
  const listener = { success, error }; subscribers.add(listener);
  if (subscribers.size === 1) {
    unwatch = watchPublicCache(cacheKey, () => { void deliver(); });
    document.addEventListener("visibilitychange", visible);
  }
  void deliver();
  return () => {
    subscribers.delete(listener);
    if (!subscribers.size) { clearTimeout(timer); timer = undefined; unwatch?.(); unwatch = undefined; document.removeEventListener("visibilitychange", visible); }
  };
}
