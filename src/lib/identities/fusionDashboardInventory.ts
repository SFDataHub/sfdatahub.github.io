import {
  deriveGuildHubLogicalScanSnapshots,
  listSfDataHubLocalScansReadOnly,
  type GuildHubLocalScan,
  type GuildHubLogicalScanSnapshot,
} from "../guilds/localScanLibrary";
import { resolveServer } from "../servers/serverResolver";
import {
  listGuildEntities,
  listGuildExclusions,
  type GuildAlias,
  type GuildExclusion,
} from "./guildIdentityStore";
import {
  createFusionIdentityGuildObservations,
  createFusionIdentityObservations,
} from "./playerFusionPreviewAdapter";
import {
  listPlayerEntities,
  listPlayerExclusions,
  type PlayerAlias,
  type PlayerExclusion,
} from "./playerIdentityStore";
import {
  isServerInFusionIdentityScope,
  listFusionIdentityAnalysisScopes,
  type FusionIdentityAnalysisScope,
} from "./fusionIdentityScopes";

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
  scanFingerprint: string;
  relevantSnapshotIds: string[];
  newestRelevantScanTimestamp: number | null;
  latestAnalyzedScanTimestamp: number | null;
  newObservationCount: number;
  coverage: Array<
    FusionIdentityServerScanCoverage & {
      role: "historical-origin" | "current-target" | "outside-scope";
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

export type FusionIdentityDashboardInventoryPhase =
  | "indexeddb-scan-metadata-load"
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
  playerIdentifiers: Set<string>;
  guildIdentifiers: Set<string>;
};

type FusionIdentityDashboardInventoryMeasurementOptions = {
  onProgress?: (progress: FusionIdentityDashboardInventoryProgress) => void;
  onTiming?: (timing: FusionIdentityDashboardInventoryTiming) => void;
};

type FusionIdentityDashboardInventoryBuildOptions =
  FusionIdentityDashboardInventoryMeasurementOptions & {
    scanCount?: number;
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

const scanContentHashById = (scans: readonly GuildHubLocalScan[]) => {
  const hashes = new Map<string, string>();
  scans.forEach((scan) => {
    hashes.set(scan.id, String(scan.contentHash ?? ""));
  });
  return hashes;
};

const ensureObservation = (
  byKey: Map<string, ServerObservationBuilder>,
  snapshot: GuildHubLogicalScanSnapshot,
  serverCode: string,
) => {
  const key = `${serverCode}\u0000${snapshot.id}`;
  const existing = byKey.get(key);
  if (existing) return existing;

  const observation: ServerObservationBuilder = {
    id: `${snapshot.id}::${serverCode}`,
    sourceScanId: snapshot.sourceScanId,
    sourceScanFilename: snapshot.sourceScanFilename,
    sourceImportedAt: snapshot.sourceImportedAt,
    timestamp: snapshot.timestamp,
    timestampMs: snapshot.timestampMs,
    playerCount: 0,
    guildCount: 0,
    playerIdentifiers: new Set<string>(),
    guildIdentifiers: new Set<string>(),
  };
  byKey.set(key, observation);
  return observation;
};

const buildCoverageFromSnapshots = (
  snapshots: readonly GuildHubLogicalScanSnapshot[],
  options: FusionIdentityDashboardInventoryMeasurementOptions = {},
) => {
  const byKey = new Map<string, ServerObservationBuilder>();

  emitInventoryProgress(options, {
    phase: "server-slice-extraction",
    message: "Extracting dashboard server slices",
  });
  measureInventoryPhase("server-slice-extraction", options, () => {
    snapshots.forEach((snapshot) => {
      snapshot.servers.forEach((server) => {
        const serverCode = resolveCoverageServerCode(server);
        if (serverCode) ensureObservation(byKey, snapshot, serverCode);
      });
    });
  });

  emitInventoryProgress(options, {
    phase: "scan-coverage-aggregation",
    message: "Aggregating scan coverage",
  });
  const coverage = measureInventoryPhase("scan-coverage-aggregation", options, () => {
    snapshots.forEach((snapshot) => {
      createFusionIdentityObservations(snapshot).forEach((observation) => {
        const serverCode = resolveCoverageServerCode(observation.server);
        if (!serverCode) return;
        const entry = ensureObservation(byKey, snapshot, serverCode);
        entry.playerIdentifiers.add(observation.identifier);
        entry.playerCount = entry.playerIdentifiers.size;
      });

      createFusionIdentityGuildObservations(snapshot).forEach((observation) => {
        const serverCode =
          observation.serverCode ??
          resolveCoverageServerCode(
            observation.guildIdentifier.match(/^(.+?)_g/i)?.[1],
          );
        if (!serverCode) return;
        const entry = ensureObservation(byKey, snapshot, serverCode);
        entry.guildIdentifiers.add(observation.guildIdentifier);
        entry.guildCount = entry.guildIdentifiers.size;
      });
    });

    const byServer = new Map<string, ServerObservationBuilder[]>();
    byKey.forEach((observation) => {
      const serverCode = observation.id.slice(
        observation.id.lastIndexOf("::") + 2,
      );
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
            ({ playerIdentifiers, guildIdentifiers, ...observation }) =>
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
  contentHashByScanId: Map<string, string>,
) =>
  createStableHash({
    scope: {
      targetServerCode: scope.targetServerCode,
      originServerCodes: scope.originServerCodes,
    },
    observations: observations
      .map((observation) => ({
        id: observation.id,
        serverCode: observation.id.slice(observation.id.lastIndexOf("::") + 2),
        sourceScanId: observation.sourceScanId,
        sourceScanFilename: observation.sourceScanFilename,
        sourceImportedAt: observation.sourceImportedAt,
        contentHash: contentHashByScanId.get(observation.sourceScanId) ?? "",
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

export const buildFusionIdentityDashboardInventoryFromSnapshots = (
  snapshotsInput: readonly GuildHubLogicalScanSnapshot[],
  options: FusionIdentityDashboardInventoryBuildOptions = {},
): FusionIdentityDashboardInventory => {
  const startedAt = performance.now();
  const snapshots = [...snapshotsInput]
    .sort((left, right) => left.timestampMs - right.timestampMs);
  const contentHashByScanId = options.contentHashByScanId ?? new Map<string, string>();
  const { coverage, byKey } = buildCoverageFromSnapshots(snapshots, options);
  const rawObservations = [...byKey.values()];
  emitInventoryProgress(options, {
    phase: "fusion-scope-derivation",
    message: "Preparing available fusion scopes",
  });
  const scopes = measureInventoryPhase("fusion-scope-derivation", options, () =>
    listFusionIdentityAnalysisScopes().map((scope) => {
    const relevantObservations = rawObservations.filter((observation) =>
      isServerInFusionIdentityScope(
        scope,
        observation.id.slice(observation.id.lastIndexOf("::") + 2),
      ),
    );
    const currentObservations = relevantObservations.filter(
      (observation) =>
        observation.id.slice(observation.id.lastIndexOf("::") + 2) ===
        scope.targetServerCode,
    );
    const relevantTimestamps = relevantObservations
      .map((observation) => observation.timestampMs)
      .sort(compareNumbers);
    const latestAnalyzedScanTimestamp =
      relevantTimestamps[relevantTimestamps.length - 1] ?? null;

    return {
      scope,
      scanFingerprint: measureInventoryPhase(
        "scan-fingerprint-generation",
        options,
        () =>
          buildScopeFingerprint(
            scope,
            relevantObservations,
            contentHashByScanId,
          ),
      ),
      relevantSnapshotIds: sortStrings(
        relevantObservations.map((observation) => observation.id),
      ),
      newestRelevantScanTimestamp: latestAnalyzedScanTimestamp,
      latestAnalyzedScanTimestamp,
      newObservationCount: 0,
      coverage: coverage.map((entry) => {
        const includedInScope = isServerInFusionIdentityScope(scope, entry.serverCode);
        const role =
          entry.serverCode === scope.targetServerCode
            ? "current-target"
            : scope.originServerCodes.includes(entry.serverCode)
              ? "historical-origin"
              : "outside-scope";
        return { ...entry, includedInScope, role };
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
    allSnapshotCount: snapshots.length,
    scanCount: options.scanCount ?? snapshots.length,
    coverage,
    scopes,
  };
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
      phase: "indexeddb-scan-metadata-load",
      message: "Reading local scan records",
    });
    const scans = await measureInventoryPhaseAsync(
      "indexeddb-scan-metadata-load",
      options,
      () => listSfDataHubLocalScansReadOnly(),
    );
    emitInventoryProgress(options, {
      phase: "raw-scan-loading",
      message: "Preparing raw scan payloads",
      current: scans.length,
      total: scans.length,
    });
    options.onTiming?.({
      phase: "raw-scan-loading",
      durationMs: 0,
      count: scans.length,
    });
    emitInventoryProgress(options, {
      phase: "logical-snapshot-creation",
      message: "Creating logical scan snapshots",
    });
    const inventory = buildFusionIdentityDashboardInventory(scans, options);
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
