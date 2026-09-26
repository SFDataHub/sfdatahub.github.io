import {
  deriveGuildHubLogicalScanSnapshots,
  ensureGuildHubScanSummaries,
  listGuildHubScanSummaries,
  type GuildHubFusionInventorySlice,
  type GuildHubLocalScan,
  type GuildHubLogicalScanSnapshot,
  type GuildHubScanSummary,
} from "../guilds/localScanLibrary";
import { resolveServer } from "../servers/serverResolver";
import {
  listGuildEntities,
  listGuildExclusions,
  type GuildAlias,
  type GuildExclusion,
} from "./guildIdentityStore";
import {
  listPlayerEntities,
  listPlayerExclusions,
  type PlayerAlias,
  type PlayerExclusion,
} from "./playerIdentityStore";
import {
  getFusionIdentityScopeServerRole,
  isServerInFusionIdentityScope,
  isFusionIdentityScopeLocallyRelevant,
  listFusionIdentityAnalysisScopes,
  normalizeFusionIdentityAnalysisScope,
  type FusionIdentityAnalysisScope,
  type FusionIdentityScopeServerRole,
} from "./fusionIdentityScopes";
import { getFusionIdentityScopeLocalMatchability } from "./fusionScopeMatchability";
import type { LocalServerFusionEvent } from "../../data/serverFusions";
import type { LocalServerDefinition } from "../../data/serverRegistry";

export type FusionIdentityScanCoverageObservation = {
  id: string;
  sourceScanId: string;
  sourceScanFilename: string;
  sourceImportedAt: string;
  timestamp: string;
  timestampMs: number;
  playerCount: number;
  guildCount: number;
};

export type FusionIdentityServerScanCoverage = {
  serverCode: string;
  count: number;
  firstSeen: number | null;
  lastSeen: number | null;
  playerObservationCount: number;
  guildObservationCount: number;
  observations: FusionIdentityScanCoverageObservation[];
};

export type FusionIdentityScopeInventory = {
  scope: FusionIdentityAnalysisScope;
  isLocallyMatchable: boolean;
  hasHistoricalObservations: boolean;
  hasCurrentTargetObservations: boolean;
  scanFingerprint: string;
  relevantSnapshotIds: string[];
  newestRelevantScanTimestamp: number | null;
  latestAnalyzedScanTimestamp: number | null;
  newObservationCount: number;
  coverage: Array<
    FusionIdentityServerScanCoverage & {
      role: FusionIdentityScopeServerRole;
      includedInScope: boolean;
    }
  >;
  currentPlayerIdentifiers: string[];
  currentGuildIdentifiers: string[];
};

export type FusionIdentityDashboardInventory = {
  generatedAt: number;
  durationMs: number;
  allSnapshotCount: number;
  scanCount: number;
  coverage: FusionIdentityServerScanCoverage[];
  scopes: FusionIdentityScopeInventory[];
};

export type FusionIdentityScopeIdentityState = {
  identityRevision: string;
  openCurrentPlayers: number;
  openCurrentGuilds: number;
};

export const normalizeFusionIdentityScopeInventory = (
  scopeInventory: FusionIdentityScopeInventory,
): FusionIdentityScopeInventory => {
  const scope = normalizeFusionIdentityAnalysisScope(scopeInventory.scope);
  const nextScopeInventory = scope && scope !== scopeInventory.scope
    ? { ...scopeInventory, scope }
    : scopeInventory;
  if (
    typeof nextScopeInventory.isLocallyMatchable === "boolean" &&
    typeof nextScopeInventory.hasHistoricalObservations === "boolean" &&
    typeof nextScopeInventory.hasCurrentTargetObservations === "boolean"
  ) {
    return nextScopeInventory;
  }

  return {
    ...nextScopeInventory,
    isLocallyMatchable: false,
    hasHistoricalObservations: false,
    hasCurrentTargetObservations: Boolean(
      nextScopeInventory.currentPlayerIdentifiers.length ||
        nextScopeInventory.currentGuildIdentifiers.length,
    ),
  };
};

export type FusionIdentityDashboardInventoryPhase =
  | "indexeddb-scan-metadata-load"
  | "metadata-backfill"
  | "raw-scan-loading"
  | "logical-snapshot-creation"
  | "normalized-snapshot-creation"
  | "server-slice-extraction"
  | "scan-coverage-aggregation"
  | "fusion-scope-derivation"
  | "scan-fingerprint-generation"
  | "identity-revision-calculation"
  | "analysis-cache-lookup"
  | "react-state-update"
  | "total"
  | "done";

export type FusionIdentityDashboardInventoryProgress = {
  phase: FusionIdentityDashboardInventoryPhase;
  current?: number;
  total?: number;
  message: string;
};

export type FusionIdentityDashboardInventoryTiming = {
  phase: FusionIdentityDashboardInventoryPhase;
  durationMs: number;
  maxBlockMs?: number;
  count?: number;
};

type ServerObservationBuilder = FusionIdentityScanCoverageObservation & {
  serverCode: string;
  contentHash: string;
  playerIdentifiers: Set<string>;
  guildIdentifiers: Set<string>;
};

export type FusionIdentityDashboardInventorySlice = {
  id: string;
  sourceScanId: string;
  sourceScanFilename: string;
  sourceImportedAt: string;
  timestamp: string;
  timestampMs: number;
  serverCode: string;
  playerCount: number;
  guildCount: number;
  playerIdentifiers: string[];
  guildIdentifiers: string[];
  contentHash: string;
};

type FusionIdentityDashboardInventoryMeasurementOptions = {
  onProgress?: (progress: FusionIdentityDashboardInventoryProgress) => void;
  onTiming?: (timing: FusionIdentityDashboardInventoryTiming) => void;
  atDate?: string | Date | number;
  registry?: readonly LocalServerDefinition[];
  events?: readonly LocalServerFusionEvent[];
};

type FusionIdentityDashboardInventoryBuildOptions =
  FusionIdentityDashboardInventoryMeasurementOptions & {
    scanCount?: number;
    allSnapshotCount?: number;
    contentHashByScanId?: Map<string, string>;
  };

const emitInventoryProgress = (
  options: FusionIdentityDashboardInventoryMeasurementOptions | undefined,
  progress: FusionIdentityDashboardInventoryProgress,
) => {
  options?.onProgress?.(progress);
};

const measureInventoryPhase = <T>(
  phase: FusionIdentityDashboardInventoryPhase,
  options: FusionIdentityDashboardInventoryMeasurementOptions | undefined,
  work: () => T,
): T => {
  const startedAt = performance.now();
  const result = work();
  const durationMs = performance.now() - startedAt;
  options?.onTiming?.({ phase, durationMs, maxBlockMs: durationMs, count: 1 });
  return result;
};

const measureInventoryPhaseAsync = async <T>(
  phase: FusionIdentityDashboardInventoryPhase,
  options: FusionIdentityDashboardInventoryMeasurementOptions | undefined,
  work: () => Promise<T>,
): Promise<T> => {
  const startedAt = performance.now();
  const result = await work();
  const durationMs = performance.now() - startedAt;
  options?.onTiming?.({ phase, durationMs, count: 1 });
  return result;
};

const normalizeIdentifierKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const resolveServerCode = (value: unknown) =>
  resolveServer(String(value ?? ""))?.code ?? null;

const resolveCoverageServerCode = (value: unknown) => {
  const resolved = resolveServerCode(value);
  if (resolved) return resolved;
  const fallback = String(value ?? "")
    .trim()
    .toUpperCase();
  return fallback || null;
};

const compareNumbers = (left: number, right: number) => left - right;

const sortStrings = (values: Iterable<string>) =>
  [...values].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
  );

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const createStableHash = (value: unknown) => {
  const input = stableJson(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const observationServerCode = (observation: ServerObservationBuilder) =>
  observation.serverCode;

const scanContentHashById = (scans: readonly GuildHubLocalScan[]) => {
  const hashes = new Map<string, string>();
  scans.forEach((scan) => {
    hashes.set(scan.id, String(scan.contentHash ?? ""));
  });
  return hashes;
};

const ensureObservation = (
  byKey: Map<string, ServerObservationBuilder>,
  slice: FusionIdentityDashboardInventorySlice,
) => {
  const key = `${slice.serverCode}\u0000${slice.id}`;
  const existing = byKey.get(key);
  if (existing) return existing;

  const observation: ServerObservationBuilder = {
    id: slice.id,
    sourceScanId: slice.sourceScanId,
    sourceScanFilename: slice.sourceScanFilename,
    sourceImportedAt: slice.sourceImportedAt,
    timestamp: slice.timestamp,
    timestampMs: slice.timestampMs,
    serverCode: slice.serverCode,
    contentHash: slice.contentHash,
    playerCount: slice.playerCount,
    guildCount: slice.guildCount,
    playerIdentifiers: new Set<string>(),
    guildIdentifiers: new Set<string>(),
  };
  slice.playerIdentifiers.forEach((identifier) => observation.playerIdentifiers.add(identifier));
  slice.guildIdentifiers.forEach((identifier) => observation.guildIdentifiers.add(identifier));
  observation.playerCount = Math.max(observation.playerCount, observation.playerIdentifiers.size);
  observation.guildCount = Math.max(observation.guildCount, observation.guildIdentifiers.size);
  byKey.set(key, observation);
  return observation;
};

const buildCoverageFromSlices = (
  slices: readonly FusionIdentityDashboardInventorySlice[],
  options: FusionIdentityDashboardInventoryMeasurementOptions = {},
) => {
  const byKey = new Map<string, ServerObservationBuilder>();

  emitInventoryProgress(options, {
    phase: "server-slice-extraction",
    message: "Extracting dashboard server slices",
  });
  measureInventoryPhase("server-slice-extraction", options, () => {
    slices.forEach((slice) => {
      ensureObservation(byKey, slice);
    });
  });

  emitInventoryProgress(options, {
    phase: "scan-coverage-aggregation",
    message: "Aggregating scan coverage",
  });
  const coverage = measureInventoryPhase("scan-coverage-aggregation", options, () => {
    const byServer = new Map<string, ServerObservationBuilder[]>();
    byKey.forEach((observation) => {
      const serverCode = observationServerCode(observation);
      const entries = byServer.get(serverCode) ?? [];
      entries.push(observation);
      byServer.set(serverCode, entries);
    });

    return [...byServer.entries()]
      .map(([serverCode, observations]) => {
        const sorted = [...observations].sort(
          (left, right) =>
            left.timestampMs - right.timestampMs ||
            left.sourceScanFilename.localeCompare(right.sourceScanFilename),
        );
        return {
          serverCode,
          count: sorted.length,
          firstSeen: sorted[0]?.timestampMs ?? null,
          lastSeen: sorted[sorted.length - 1]?.timestampMs ?? null,
          playerObservationCount: sorted.reduce(
            (sum, observation) => sum + observation.playerCount,
            0,
          ),
          guildObservationCount: sorted.reduce(
            (sum, observation) => sum + observation.guildCount,
            0,
          ),
          observations: sorted.map(
            ({ playerIdentifiers, guildIdentifiers, serverCode, contentHash, ...observation }) =>
              observation,
          ),
        };
      })
      .sort((left, right) =>
        left.serverCode.localeCompare(right.serverCode, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );
  });

  return { coverage, byKey };
};

const buildScopeFingerprint = (
  scope: FusionIdentityAnalysisScope,
  observations: ServerObservationBuilder[],
) =>
  createStableHash({
    scope: {
      targetServerCode: scope.targetServerCode,
      originServerCodes: scope.originServerCodes,
    },
    observations: observations
      .map((observation) => ({
        id: observation.id,
        serverCode: observationServerCode(observation),
        sourceScanId: observation.sourceScanId,
        sourceScanFilename: observation.sourceScanFilename,
        sourceImportedAt: observation.sourceImportedAt,
        contentHash: observation.contentHash,
        timestampMs: observation.timestampMs,
        playerCount: observation.playerCount,
        guildCount: observation.guildCount,
      }))
      .sort(
        (left, right) =>
          left.serverCode.localeCompare(right.serverCode) ||
          left.timestampMs - right.timestampMs ||
          left.sourceScanId.localeCompare(right.sourceScanId) ||
          left.id.localeCompare(right.id),
      ),
  });

const normalizeGuildSegmentForInventory = (value: unknown) => {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!raw) return null;
  const identifierMatch = raw.match(/_g([^_]+)$/);
  if (identifierMatch?.[1]) return `g${identifierMatch[1]}`;
  const prefixedMatch = raw.match(/^g([^_]+)$/);
  if (prefixedMatch?.[1]) return `g${prefixedMatch[1]}`;
  if (/^\d+$/.test(raw)) return `g${raw}`;
  return raw;
};

const normalizeInventoryServerKey = (value: unknown) => {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  return raw || null;
};

const buildGuildIdentifier = (server: string | null, segment: string | null, name: string | null) => {
  if (segment) return server ? `${server.toLowerCase()}_${segment}` : segment;
  const nameKey = String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return nameKey ? `${server?.toLowerCase() ?? "unknown"}_name_${nameKey}` : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const canonKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const pickFirst = (record: Record<string, unknown>, keys: string[]) => {
  const lookup = new Map<string, string>();
  Object.keys(record).forEach((key) => {
    const canon = canonKey(key);
    if (canon && !lookup.has(canon)) lookup.set(canon, key);
  });

  for (const key of keys) {
    const resolvedKey = lookup.get(canonKey(key));
    const value = resolvedKey ? record[resolvedKey] : undefined;
    if (value != null && String(value).trim()) return value;
  }

  return undefined;
};

const toTrimmedString = (value: unknown) => {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
};

const buildInventorySlicesFromSnapshots = (
  snapshotsInput: readonly GuildHubLogicalScanSnapshot[],
  contentHashByScanId: Map<string, string>,
): FusionIdentityDashboardInventorySlice[] => {
  const slices: FusionIdentityDashboardInventorySlice[] = [];

  snapshotsInput.forEach((snapshot) => {
    const byServer = new Map<
      string,
      {
        serverCode: string;
        playerIdentifiers: Set<string>;
        guildIdentifiers: Set<string>;
      }
    >();
    const ensureSlice = (server: unknown) => {
      const serverCode = resolveCoverageServerCode(server);
      if (!serverCode) return null;
      const existing = byServer.get(serverCode);
      if (existing) return existing;
      const created = {
        serverCode,
        playerIdentifiers: new Set<string>(),
        guildIdentifiers: new Set<string>(),
      };
      byServer.set(serverCode, created);
      return created;
    };

    snapshot.servers.forEach(ensureSlice);

    snapshot.normalizedMembers.forEach((member) => {
      const slice = ensureSlice(member.server);
      if (!slice) return;
      const memberRef = toTrimmedString(member.memberRef);
      if (memberRef) slice.playerIdentifiers.add(memberRef);
      const guildIdentifier = buildGuildIdentifier(
        normalizeInventoryServerKey(member.server),
        normalizeGuildSegmentForInventory(member.guildSegment ?? member.groupSegment),
        member.guildName,
      );
      if (guildIdentifier) slice.guildIdentifiers.add(guildIdentifier);
    });

    snapshot.groups.forEach((group) => {
      if (!isRecord(group)) return;
      const rawIdentifier = toTrimmedString(
        pickFirst(group, [
          "guildIdentifier",
          "Guild Identifier",
          "identifier",
          "Identifier",
          "groupIdentifier",
          "groupId",
          "guildId",
          "id",
        ]),
      );
      const rawServer =
        pickFirst(group, ["server", "Server", "prefix", "world", "realm"]) ??
        rawIdentifier?.match(/^(.+)_g[^_]+$/i)?.[1];
      const slice = ensureSlice(rawServer);
      if (!slice) return;
      const guildIdentifier = buildGuildIdentifier(
        normalizeInventoryServerKey(rawServer),
        normalizeGuildSegmentForInventory(rawIdentifier),
        toTrimmedString(pickFirst(group, ["name", "Name", "groupname", "groupName", "guildName", "guild"])),
      );
      if (guildIdentifier) slice.guildIdentifiers.add(guildIdentifier);
    });

    [...byServer.values()]
      .sort((left, right) => left.serverCode.localeCompare(right.serverCode))
      .forEach((slice) => {
        slices.push({
          id: `${snapshot.id}::${slice.serverCode}`,
          sourceScanId: snapshot.sourceScanId,
          sourceScanFilename: snapshot.sourceScanFilename,
          sourceImportedAt: snapshot.sourceImportedAt,
          timestamp: snapshot.timestamp,
          timestampMs: snapshot.timestampMs,
          serverCode: slice.serverCode,
          playerCount: slice.playerIdentifiers.size,
          guildCount: slice.guildIdentifiers.size,
          playerIdentifiers: sortStrings(slice.playerIdentifiers),
          guildIdentifiers: sortStrings(slice.guildIdentifiers),
          contentHash: contentHashByScanId.get(snapshot.sourceScanId) ?? "",
        });
      });
  });

  return slices;
};

const buildInventorySliceFromSummarySlice = (
  summary: GuildHubScanSummary,
  slice: GuildHubFusionInventorySlice,
): FusionIdentityDashboardInventorySlice | null => {
  const serverCode = resolveCoverageServerCode(slice.server);
  if (!serverCode) return null;
  const snapshotId = slice.snapshotId || slice.id.replace(/::[^:]+$/, "");
  const playerIdentifiers = Array.isArray(slice.playerIdentifiers) ? slice.playerIdentifiers : [];
  const guildIdentifiers = Array.isArray(slice.guildIdentifiers) ? slice.guildIdentifiers : [];
  return {
    id: `${snapshotId}::${serverCode}`,
    sourceScanId: slice.sourceScanId,
    sourceScanFilename: slice.sourceScanFilename,
    sourceImportedAt: slice.sourceImportedAt,
    timestamp: slice.timestamp,
    timestampMs: slice.timestampMs,
    serverCode,
    playerCount: Math.max(slice.playerCount, playerIdentifiers.length),
    guildCount: Math.max(slice.guildCount, guildIdentifiers.length),
    playerIdentifiers: sortStrings(playerIdentifiers),
    guildIdentifiers: sortStrings(guildIdentifiers),
    contentHash: summary.contentHash ?? "",
  };
};

const buildInventorySlicesFromSummaries = (
  summaries: readonly GuildHubScanSummary[],
): FusionIdentityDashboardInventorySlice[] =>
  summaries
    .flatMap((summary) =>
      (summary.fusionInventorySlices ?? []).map((slice) =>
        buildInventorySliceFromSummarySlice(summary, slice),
      ),
    )
    .filter((slice): slice is FusionIdentityDashboardInventorySlice => Boolean(slice))
    .sort(
      (left, right) =>
        left.timestampMs - right.timestampMs ||
        left.sourceScanFilename.localeCompare(right.sourceScanFilename) ||
        left.serverCode.localeCompare(right.serverCode),
    );

export const buildFusionIdentityDashboardInventoryFromSlices = (
  slicesInput: readonly FusionIdentityDashboardInventorySlice[],
  options: FusionIdentityDashboardInventoryBuildOptions = {},
): FusionIdentityDashboardInventory => {
  const startedAt = performance.now();
  const slices = [...slicesInput].sort(
    (left, right) =>
      left.timestampMs - right.timestampMs ||
      left.sourceScanFilename.localeCompare(right.sourceScanFilename) ||
      left.serverCode.localeCompare(right.serverCode),
  );
  const { coverage, byKey } = buildCoverageFromSlices(slices, options);
  const rawObservations = [...byKey.values()];
  const observedServerCodes = new Set(rawObservations.map(observationServerCode));
  emitInventoryProgress(options, {
    phase: "fusion-scope-derivation",
    message: "Preparing available fusion scopes",
  });
  const scopes = measureInventoryPhase("fusion-scope-derivation", options, () =>
    listFusionIdentityAnalysisScopes({
      atDate: options.atDate,
      registry: options.registry,
      events: options.events,
    })
      .filter((scope) => isFusionIdentityScopeLocallyRelevant(scope, observedServerCodes))
      .map((scope) => {
        const relevantObservations = rawObservations.filter((observation) =>
          isServerInFusionIdentityScope(
            scope,
            observationServerCode(observation),
          ),
        );
        const localMatchability = getFusionIdentityScopeLocalMatchability(
          scope,
          relevantObservations.map((observation) => ({
            serverCode: observationServerCode(observation),
            timestampMs: observation.timestampMs,
            playerCount: observation.playerCount,
            guildCount: observation.guildCount,
          })),
        );
        const currentObservations = relevantObservations.filter(
          (observation) => observationServerCode(observation) === scope.targetServerCode,
        );
        const relevantTimestamps = relevantObservations
          .map((observation) => observation.timestampMs)
          .sort(compareNumbers);
        const latestAnalyzedScanTimestamp =
          relevantTimestamps[relevantTimestamps.length - 1] ?? null;

        return {
          scope,
          ...localMatchability,
          scanFingerprint: measureInventoryPhase(
            "scan-fingerprint-generation",
            options,
            () =>
              buildScopeFingerprint(
                scope,
                relevantObservations,
              ),
          ),
          relevantSnapshotIds: sortStrings(
            relevantObservations.map((observation) => observation.id),
          ),
          newestRelevantScanTimestamp: latestAnalyzedScanTimestamp,
          latestAnalyzedScanTimestamp,
          newObservationCount: 0,
          coverage: coverage.flatMap((entry) => {
            const role = getFusionIdentityScopeServerRole(scope, entry.serverCode);
            if (role === "outside-scope") return [];
            return [{ ...entry, includedInScope: true, role }];
          }),
          currentPlayerIdentifiers: sortStrings(
            new Set(
              currentObservations.flatMap((observation) =>
                sortStrings(observation.playerIdentifiers),
              ),
            ),
          ),
          currentGuildIdentifiers: sortStrings(
            new Set(
              currentObservations.flatMap((observation) =>
                sortStrings(observation.guildIdentifiers),
              ),
            ),
          ),
        } satisfies FusionIdentityScopeInventory;
      }),
  );

  return {
    generatedAt: Date.now(),
    durationMs: performance.now() - startedAt,
    allSnapshotCount: options.allSnapshotCount ?? slices.length,
    scanCount: options.scanCount ?? new Set(slices.map((slice) => slice.sourceScanId)).size,
    coverage,
    scopes,
  };
};

export const buildFusionIdentityDashboardInventoryFromSummaries = (
  summariesInput: readonly GuildHubScanSummary[],
  options: FusionIdentityDashboardInventoryBuildOptions = {},
): FusionIdentityDashboardInventory => {
  const summaries = [...summariesInput];
  const slices = buildInventorySlicesFromSummaries(summaries);
  return buildFusionIdentityDashboardInventoryFromSlices(slices, {
    ...options,
    scanCount: options.scanCount ?? summaries.length,
    allSnapshotCount:
      options.allSnapshotCount ??
      summaries.reduce((sum, summary) => sum + summary.logicalScanCount, 0),
  });
};

export const buildFusionIdentityDashboardInventoryFromSnapshots = (
  snapshotsInput: readonly GuildHubLogicalScanSnapshot[],
  options: FusionIdentityDashboardInventoryBuildOptions = {},
): FusionIdentityDashboardInventory => {
  const snapshots = [...snapshotsInput]
    .sort((left, right) => left.timestampMs - right.timestampMs);
  const contentHashByScanId = options.contentHashByScanId ?? new Map<string, string>();
  return buildFusionIdentityDashboardInventoryFromSlices(
    buildInventorySlicesFromSnapshots(snapshots, contentHashByScanId),
    {
      ...options,
      scanCount: options.scanCount ?? snapshots.length,
      allSnapshotCount: options.allSnapshotCount ?? snapshots.length,
    },
  );
};

export const buildFusionIdentityDashboardInventory = (
  scans: readonly GuildHubLocalScan[],
  options: FusionIdentityDashboardInventoryMeasurementOptions = {},
): FusionIdentityDashboardInventory => {
  let normalizedDurationMs = 0;
  let normalizedMaxBlockMs = 0;
  let normalizedCount = 0;
  const snapshots = measureInventoryPhase("logical-snapshot-creation", options, () =>
    scans.flatMap((scan) =>
      deriveGuildHubLogicalScanSnapshots(scan, {
        onNormalizedSnapshotCreated(durationMs) {
          normalizedDurationMs += durationMs;
          normalizedMaxBlockMs = Math.max(normalizedMaxBlockMs, durationMs);
          normalizedCount += 1;
        },
      }),
    ),
  );
  options.onTiming?.({
    phase: "normalized-snapshot-creation",
    durationMs: normalizedDurationMs,
    maxBlockMs: normalizedMaxBlockMs,
    count: normalizedCount,
  });
  return buildFusionIdentityDashboardInventoryFromSnapshots(snapshots, {
    scanCount: scans.length,
    contentHashByScanId: scanContentHashById(scans),
    ...options,
  });
};

const readIdentifierServerCode = (identifier: string) => {
  const match = identifier.match(/^(.+?)_[pg][^_]+$/i);
  return resolveServerCode(match?.[1] ?? null);
};

const identityTouchesScope = (
  scope: FusionIdentityAnalysisScope,
  identifiers: readonly string[],
) =>
  identifiers.some((identifier) =>
    isServerInFusionIdentityScope(scope, readIdentifierServerCode(identifier)),
  );

const completedIdentifiersFromAliases = <T extends PlayerAlias | GuildAlias>(
  entries: Array<{ aliases: T[] }>,
) => {
  const completed = new Set<string>();
  entries.forEach(({ aliases }) => {
    if (aliases.length < 2) return;
    aliases.forEach((alias) => completed.add(normalizeIdentifierKey(alias.identifier)));
  });
  return completed;
};

const scopedPlayerRevisionEntry = (
  entry: { entity: { entityId: string; updatedAt: string }; aliases: PlayerAlias[] },
) => ({
  entityId: entry.entity.entityId,
  updatedAt: entry.entity.updatedAt,
  aliases: entry.aliases.map((alias) => ({
    identifier: alias.identifier,
    source: alias.source,
    confirmedAt: alias.confirmedAt ?? null,
    addedAt: alias.addedAt,
  })),
});

const scopedGuildRevisionEntry = (
  entry: { entity: { entityId: string; updatedAt: string }; aliases: GuildAlias[] },
) => ({
  entityId: entry.entity.entityId,
  updatedAt: entry.entity.updatedAt,
  aliases: entry.aliases.map((alias) => ({
    identifier: alias.identifier,
    source: alias.source,
    confirmedAt: alias.confirmedAt ?? null,
    addedAt: alias.addedAt,
  })),
});

const scopedExclusionEntry = (entry: PlayerExclusion | GuildExclusion) => ({
  pairKey: entry.pairKey,
  identifierA: entry.identifierA,
  identifierB: entry.identifierB,
  createdAt: entry.createdAt,
});

export const buildFusionIdentityScopeIdentityState = async (
  scope: FusionIdentityAnalysisScope,
  currentPlayerIdentifiers: readonly string[],
  currentGuildIdentifiers: readonly string[],
): Promise<FusionIdentityScopeIdentityState> => {
  const [
    playerEntities,
    playerExclusions,
    guildEntities,
    guildExclusions,
  ] = await Promise.all([
    listPlayerEntities(),
    listPlayerExclusions(),
    listGuildEntities(),
    listGuildExclusions(),
  ]);

  const scopedPlayerEntities = playerEntities.filter((entry) =>
    identityTouchesScope(
      scope,
      entry.aliases.map((alias) => alias.identifier),
    ),
  );
  const scopedGuildEntities = guildEntities.filter((entry) =>
    identityTouchesScope(
      scope,
      entry.aliases.map((alias) => alias.identifier),
    ),
  );
  const scopedPlayerExclusions = playerExclusions.filter((entry) =>
    identityTouchesScope(scope, [entry.identifierA, entry.identifierB]),
  );
  const scopedGuildExclusions = guildExclusions.filter((entry) =>
    identityTouchesScope(scope, [entry.identifierA, entry.identifierB]),
  );
  const completedPlayers = completedIdentifiersFromAliases(scopedPlayerEntities);
  const completedGuilds = completedIdentifiersFromAliases(scopedGuildEntities);

  return {
    identityRevision: createStableHash({
      scope: scope.id,
      players: scopedPlayerEntities.map(scopedPlayerRevisionEntry),
      playerExclusions: scopedPlayerExclusions.map(scopedExclusionEntry),
      guilds: scopedGuildEntities.map(scopedGuildRevisionEntry),
      guildExclusions: scopedGuildExclusions.map(scopedExclusionEntry),
    }),
    openCurrentPlayers: currentPlayerIdentifiers.filter(
      (identifier) => !completedPlayers.has(normalizeIdentifierKey(identifier)),
    ).length,
    openCurrentGuilds: currentGuildIdentifiers.filter(
      (identifier) => !completedGuilds.has(normalizeIdentifierKey(identifier)),
    ).length,
  };
};

export const loadFusionIdentityDashboardInventory =
  async (
    options: FusionIdentityDashboardInventoryMeasurementOptions = {},
  ): Promise<FusionIdentityDashboardInventory> => {
    emitInventoryProgress(options, {
      phase: "metadata-backfill",
      message: "Checking local scan inventory metadata",
    });
    await measureInventoryPhaseAsync(
      "metadata-backfill",
      options,
      () => ensureGuildHubScanSummaries(),
    );

    emitInventoryProgress(options, {
      phase: "indexeddb-scan-metadata-load",
      message: "Reading local scan summaries",
    });
    const summaries = await measureInventoryPhaseAsync(
      "indexeddb-scan-metadata-load",
      options,
      () => listGuildHubScanSummaries({ ensureCurrent: false }),
    );
    emitInventoryProgress(options, {
      phase: "logical-snapshot-creation",
      message: "Reading logical inventory slices",
    });
    const inventory = measureInventoryPhase("logical-snapshot-creation", options, () =>
      buildFusionIdentityDashboardInventoryFromSummaries(summaries, options),
    );
    options.onTiming?.({
      phase: "total",
      durationMs: inventory.durationMs,
      count: 1,
    });
    return inventory;
  };

export const __fusionDashboardInventoryTestUtils = {
  createStableHash,
};
