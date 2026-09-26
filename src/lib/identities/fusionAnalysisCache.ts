import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { FusionIdentityWorkerTiming } from "./fusionIdentityWorkerTypes";
import type {
  FusionIdentityManagementReport,
  FusionIdentityManagementSummary,
} from "./fusionIdentityManagement";
import type { FusionIdentityAnalysisScope } from "./fusionIdentityScopes";

const FUSION_ANALYSIS_CACHE_DB_NAME = "sfdatahub-fusion-identity-analysis";
const FUSION_ANALYSIS_CACHE_DB_VERSION = 1;
const ANALYSIS_REPORTS_STORE = "analysisReports";

export const CURRENT_FUSION_ANALYSIS_SCHEMA_VERSION = 1;
export const CURRENT_FUSION_RESOLVER_VERSION = 2;

const COMPATIBLE_FUSION_ANALYSIS_SCHEMA_VERSIONS = new Set<number>([
  CURRENT_FUSION_ANALYSIS_SCHEMA_VERSION,
]);
const COMPATIBLE_FUSION_RESOLVER_VERSIONS = new Set<number>([
  CURRENT_FUSION_RESOLVER_VERSION,
]);

export const isFusionAnalysisSchemaVersionCompatible = (
  version: unknown,
  compatibleVersions: ReadonlySet<number> = COMPATIBLE_FUSION_ANALYSIS_SCHEMA_VERSIONS,
) => typeof version === "number" && compatibleVersions.has(version);

export const isFusionResolverVersionCompatible = (
  version: unknown,
  compatibleVersions: ReadonlySet<number> = COMPATIBLE_FUSION_RESOLVER_VERSIONS,
) => typeof version === "number" && compatibleVersions.has(version);

export type FusionIdentityAnalysisCacheState =
  | "never-analyzed"
  | "fresh"
  | "stale"
  | "running"
  | "error";

export type FusionIdentityAnalysisCacheEntry = {
  key: string;
  scopeId: string;
  targetServerCode: string;
  originServerCodes: string[];
  scanFingerprint: string;
  identityRevision: string;
  resolverVersion: number;
  schemaVersion: number;
  analyzedAt: string;
  summary: FusionIdentityManagementSummary;
  report: FusionIdentityManagementReport;
  timings: FusionIdentityWorkerTiming[];
};

export type FusionIdentityAnalysisCacheLookup = {
  state: Exclude<FusionIdentityAnalysisCacheState, "running" | "error">;
  freshEntry: FusionIdentityAnalysisCacheEntry | null;
  previousEntry: FusionIdentityAnalysisCacheEntry | null;
  staleReason: "scan-fingerprint" | "identity-revision" | "resolver-version" | "schema-version" | null;
};

interface FusionAnalysisCacheDb extends DBSchema {
  analysisReports: {
    key: string;
    value: FusionIdentityAnalysisCacheEntry;
    indexes: {
      by_scopeId: string;
      by_analyzedAt: string;
    };
  };
}

let cacheDbPromise: Promise<IDBPDatabase<FusionAnalysisCacheDb>> | null = null;

const getCacheDb = () => {
  if (!cacheDbPromise) {
    cacheDbPromise = openDB<FusionAnalysisCacheDb>(
      FUSION_ANALYSIS_CACHE_DB_NAME,
      FUSION_ANALYSIS_CACHE_DB_VERSION,
      {
        upgrade(db) {
          if (!db.objectStoreNames.contains(ANALYSIS_REPORTS_STORE)) {
            const store = db.createObjectStore(ANALYSIS_REPORTS_STORE, {
              keyPath: "key",
            });
            store.createIndex("by_scopeId", "scopeId");
            store.createIndex("by_analyzedAt", "analyzedAt");
          }
        },
      },
    );
  }
  return cacheDbPromise;
};

export const createFusionIdentityAnalysisCacheKey = (input: {
  scope: FusionIdentityAnalysisScope;
  scanFingerprint: string;
  identityRevision: string;
}) =>
  [
    "fusion-analysis-current",
    input.scope.id,
    input.scope.targetServerCode,
    input.scope.originServerCodes.join("+"),
  ].join(":");

const compareEntriesNewestFirst = (
  left: FusionIdentityAnalysisCacheEntry,
  right: FusionIdentityAnalysisCacheEntry,
) => right.analyzedAt.localeCompare(left.analyzedAt);

export const classifyFusionIdentityAnalysisCache = (
  entries: readonly FusionIdentityAnalysisCacheEntry[],
  input: {
    scope: FusionIdentityAnalysisScope;
    scanFingerprint: string;
    identityRevision: string;
  },
): FusionIdentityAnalysisCacheLookup => {
  const sorted = [...entries]
    .filter((entry) => entry.scopeId === input.scope.id)
    .sort(compareEntriesNewestFirst);
  const freshEntry =
    sorted.find(
      (entry) =>
        isFusionAnalysisSchemaVersionCompatible(entry.schemaVersion) &&
        isFusionResolverVersionCompatible(entry.resolverVersion) &&
        entry.scanFingerprint === input.scanFingerprint &&
        entry.identityRevision === input.identityRevision,
    ) ?? null;
  if (freshEntry) {
    return {
      state: "fresh",
      freshEntry,
      previousEntry: freshEntry,
      staleReason: null,
    };
  }

  const previousEntry = sorted[0] ?? null;
  if (!previousEntry) {
    return {
      state: "never-analyzed",
      freshEntry: null,
      previousEntry: null,
      staleReason: null,
    };
  }

  const staleReason =
    !isFusionAnalysisSchemaVersionCompatible(previousEntry.schemaVersion)
      ? "schema-version"
      : !isFusionResolverVersionCompatible(previousEntry.resolverVersion)
        ? "resolver-version"
        : previousEntry.identityRevision !== input.identityRevision
          ? "identity-revision"
          : "scan-fingerprint";

  return {
    state: "stale",
    freshEntry: null,
    previousEntry,
    staleReason,
  };
};

export const readFusionIdentityAnalysisCache = async (input: {
  scope: FusionIdentityAnalysisScope;
  scanFingerprint: string;
  identityRevision: string;
}): Promise<FusionIdentityAnalysisCacheLookup> => {
  const db = await getCacheDb();
  const entries = await db.getAllFromIndex(
    ANALYSIS_REPORTS_STORE,
    "by_scopeId",
    input.scope.id,
  );
  return classifyFusionIdentityAnalysisCache(entries, input);
};

export const writeFusionIdentityAnalysisCache = async (input: {
  scope: FusionIdentityAnalysisScope;
  scanFingerprint: string;
  identityRevision: string;
  report: FusionIdentityManagementReport;
  timings: FusionIdentityWorkerTiming[];
}): Promise<FusionIdentityAnalysisCacheEntry> => {
  const entry: FusionIdentityAnalysisCacheEntry = {
    key: createFusionIdentityAnalysisCacheKey(input),
    scopeId: input.scope.id,
    targetServerCode: input.scope.targetServerCode,
    originServerCodes: input.scope.originServerCodes,
    scanFingerprint: input.scanFingerprint,
    identityRevision: input.identityRevision,
    resolverVersion: CURRENT_FUSION_RESOLVER_VERSION,
    schemaVersion: CURRENT_FUSION_ANALYSIS_SCHEMA_VERSION,
    analyzedAt: new Date().toISOString(),
    summary: input.report.summary,
    report: input.report,
    timings: input.timings,
  };
  const db = await getCacheDb();
  await db.put(ANALYSIS_REPORTS_STORE, entry);
  return entry;
};
