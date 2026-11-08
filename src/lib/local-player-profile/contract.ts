import type { LocalDependencyReceipt } from "../local-data/localDataDependencies";
import type { GuildAnalyticsDerivedData } from "../guilds/localGuildAnalyticsStore";
import type { IdentityResolutionSnapshot } from "../identities/identityResolution";
import type { AnalyticsIndexes, PlayerPerformanceBuildResult } from "../../pages/Playground/playerPerformanceModel";

export type LocalProfileStatus = "not-requested" | "loading" | "ready" | "partial" | "empty" | "error" | "cancelled";
export type LocalProfileEvidence = {
  key: string;
  dependencies: LocalDependencyReceipt;
  sourceIds: readonly string[];
  resetCertificate: string | null;
};
export type LocalProfilePart<T> = {
  status: LocalProfileStatus;
  value: T | null;
  reason?: string;
  evidence?: LocalProfileEvidence;
};
export type LocalPlayerHistoryBasis = {
  analyticsData: GuildAnalyticsDerivedData;
  identityResolutionSnapshot: IdentityResolutionSnapshot;
  indexes: AnalyticsIndexes;
  performance: PlayerPerformanceBuildResult;
  evidence: LocalProfileEvidence;
  coverage: "complete" | "partial";
};

export function profileAbortError() { return new DOMException("Local profile lease ended", "AbortError"); }
export function checkProfileWork(signal: AbortSignal) { if (signal.aborted) throw profileAbortError(); }

const protectedProfileValues = new WeakSet<object>();

/** These are private IDB read results, never caller-owned Current Raw/core maps.
 * Freeze every level, including Map mutators; Object.freeze(Map) alone is insufficient. */
export function protectProfileBasis<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== "object" || seen.has(value) || protectedProfileValues.has(value)) return value;
  seen.add(value);
  if (value instanceof Map) {
    if (Object.getOwnPropertyDescriptor(value, "set")?.configurable === false) return value;
    for (const entry of value.values()) protectProfileBasis(entry, seen);
    for (const name of ["set", "delete", "clear"]) Object.defineProperty(value, name, {
      value: () => { throw new TypeError("Shared local profile data is immutable"); }, configurable: false,
    });
  } else for (const entry of Object.values(value)) protectProfileBasis(entry, seen);
  Object.freeze(value);
  protectedProfileValues.add(value);
  return value;
}
