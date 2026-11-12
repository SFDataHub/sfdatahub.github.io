import { YouTubeSourcesError } from "./sources";
import { isYouTubeErrorCode, type YouTubeErrorCode } from "./diagnostics";

const stages = ["configuration", "channels", "playlist_items", "videos", "validate_snapshot",
  "read_snapshot", "acquire_lock", "read_cache", "publish_snapshot", "release_lock", "verify_admin", "refresh"] as const;
type Stage = typeof stages[number];
const reasons = [
  "quotaExceeded", "dailyLimitExceeded", "forbidden", "insufficientPermissions",
  "accessNotConfigured", "keyInvalid", "ipRefererBlocked", "playlistNotFound",
  "playlistItemsNotAccessible", "channelNotFound", "channelClosed", "channelSuspended",
  "videoNotFound", "invalidPageToken", "invalidFilters", "missingRequiredParameter",
  "badRequest", "backendError", "youtubeSignupRequired",
] as const;
type Reason = typeof reasons[number];
const storageCodes = ["cancelled", "unknown", "invalid-argument", "deadline-exceeded", "not-found",
  "already-exists", "permission-denied", "resource-exhausted", "failed-precondition", "aborted",
  "out-of-range", "unimplemented", "internal", "unavailable", "data-loss", "unauthenticated"] as const;
export interface YouTubeDiagnostic {
  code: YouTubeErrorCode;
  stage: Stage;
  httpStatus?: number;
  channelId?: string;
  playlistId?: string;
  reason?: Reason;
  storageCode?: typeof storageCodes[number];
}
type Details = Omit<YouTubeDiagnostic, "code">;
const allowed = (list: readonly string[], value: unknown): value is string => typeof value === "string" && list.includes(value);
const safeId = (value: unknown, pattern: RegExp, privateValues: readonly string[]): value is string =>
  typeof value === "string" && pattern.test(value) &&
  !/AIza|bearer|token|secret|cookie|password|authorization/i.test(value) &&
  !privateValues.some(secret => secret.length > 0 && value.includes(secret));

// Construct a new object from approved primitives. No spreads from error/response objects.
function sanitize(input: YouTubeDiagnostic, privateValues: readonly string[] = []): YouTubeDiagnostic {
  const result: YouTubeDiagnostic = {
    code: isYouTubeErrorCode(input.code) ? input.code : "YOUTUBE_REFRESH_FAILED",
    stage: allowed(stages, input.stage) ? input.stage : "refresh",
  };
  if (Number.isInteger(input.httpStatus) && input.httpStatus! >= 400 && input.httpStatus! <= 599) result.httpStatus = input.httpStatus;
  if (safeId(input.channelId, /^UC[A-Za-z0-9_-]{22}$/, privateValues)) result.channelId = input.channelId;
  if (safeId(input.playlistId, /^(?:PL|UU|FL|LL|RD|OLAK5uy_)[A-Za-z0-9_-]{1,80}$/, privateValues)) result.playlistId = input.playlistId;
  if (allowed(reasons, input.reason)) result.reason = input.reason as Reason;
  if (allowed(storageCodes, input.storageCode)) result.storageCode = input.storageCode as YouTubeDiagnostic["storageCode"];
  return result;
}
export class YouTubeFailure extends Error {
  readonly diagnostic: YouTubeDiagnostic;
  constructor(code: YouTubeErrorCode, details: Details) {
    const diagnostic = sanitize({ code, ...details });
    super(diagnostic.code);
    this.name = "YouTubeFailure";
    this.diagnostic = Object.freeze(diagnostic);
  }
}
export function youtubeDiagnostic(error: unknown, fallback: YouTubeDiagnostic = { code: "YOUTUBE_REFRESH_FAILED", stage: "refresh" }, privateValues: readonly string[] = []): YouTubeDiagnostic {
  // Even a recognized error's message/stack/cause is deliberately never copied.
  try {
    if (error instanceof YouTubeFailure) return sanitize(error.diagnostic, privateValues);
    if (error instanceof YouTubeSourcesError) return { code: "YOUTUBE_SOURCES_INVALID", stage: "configuration" };
  } catch { /* Unknown/proxy errors receive only the fixed fallback. */ }
  return sanitize(fallback, privateValues);
}
export function youtubeReason(body: unknown): Reason | undefined {
  const errors = (body as any)?.error?.errors;
  if (!Array.isArray(errors)) return undefined;
  return errors.map(error => error?.reason).find((reason: unknown): reason is Reason => allowed(reasons, reason));
}
export function isYouTubeTimeout(error: unknown): boolean {
  try { return (error as any)?.name === "TimeoutError" || (error as any)?.name === "AbortError"; }
  catch { return false; }
}
function storageCode(error: unknown): YouTubeDiagnostic["storageCode"] {
  try {
    const code = (error as any)?.code;
    if (Number.isInteger(code) && code >= 1 && code <= storageCodes.length) return storageCodes[code - 1];
    if (allowed(storageCodes, code)) return code as YouTubeDiagnostic["storageCode"];
  } catch { /* No raw details, including errors from property access. */ }
  return undefined;
}
export async function youtubeStorage<T>(code: YouTubeErrorCode, stage: Stage, operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof YouTubeFailure) throw error;
    throw new YouTubeFailure(code, { stage, storageCode: storageCode(error) });
  }
}
export function logYouTubeFailure(error: unknown, fallback?: YouTubeDiagnostic, privateValues: readonly string[] = []): YouTubeDiagnostic {
  const diagnostic = youtubeDiagnostic(error, fallback, privateValues);
  console.error(JSON.stringify({ event: "youtube_sync_failed", ...diagnostic }));
  return diagnostic;
}
