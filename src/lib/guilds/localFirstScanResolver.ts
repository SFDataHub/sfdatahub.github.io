import type { FusionIdentityAnalysisScope } from "../identities/fusionIdentityScopes";
import { normalizeFusionIdentityAnalysisScope } from "../identities/fusionIdentityScopes";
import {
  getFusionLineage,
  getFusionOrigins,
  resolveServer,
} from "../servers/serverResolver";
import type { ScanArchiveEntry } from "../scanArchive/types";
import type { GuildHubFusionInventorySlice, GuildHubScanSummary } from "./localScanLibrary";

export type LocalFirstScanDataKind = "players" | "guilds" | "both";
export type LocalFirstScanCompleteness = "usable-snapshot" | "confirmed-archive";
export type LocalFirstScanPlanStatus = "complete" | "partial" | "empty";

export type LocalFirstScanTimeRequest =
  | { kind: "latest" }
  | { kind: "exact"; timestamp: number }
  | { kind: "interval"; from: number; to: number };

export type LocalFirstScanTarget =
  | { kind: "server"; server: string }
  | { kind: "fusion-scope"; scope: Partial<FusionIdentityAnalysisScope> };

export type LocalFirstScanResolvedSegmentInput = {
  id?: string;
  server: string;
  from?: number | null;
  to?: number | null;
};

export type LocalFirstScanRequest = {
  target: LocalFirstScanTarget;
  time: LocalFirstScanTimeRequest;
  dataKind: LocalFirstScanDataKind;
  completeness: LocalFirstScanCompleteness;
  segments?: LocalFirstScanResolvedSegmentInput[];
};

export type LocalFirstScanReasonCode =
  | "local-exact-archive-copy"
  | "local-usable-snapshot"
  | "local-coverage-unverified"
  | "local-data-kind-missing"
  | "archive-candidate-available"
  | "manifest-year-missing"
  | "no-matching-archive-scan"
  | "time-range-partially-covered"
  | "server-normalized"
  | "fusion-lineage-delegated";

export type LocalFirstScanResolvedSegment = {
  id: string;
  serverCode: string;
  from: number | null;
  to: number | null;
  lineageServerCodes: string[];
  reasonCodes: LocalFirstScanReasonCode[];
};

export type LocalFirstScanLocalSnapshot = {
  id: string;
  sourceScanId: string;
  sourceScanFilename: string;
  serverCode: string;
  timestamp: number;
  playerCount: number;
  guildCount: number;
  isArchiveCopy: boolean;
  archiveScanId?: string;
  coverage: "exact-archive-copy" | "usable-local-snapshot" | "unverified-local-coverage" | "not-suitable";
  satisfiesRequirement: boolean;
  reasonCodes: LocalFirstScanReasonCode[];
};

export type LocalFirstScanArchiveCandidate = {
  id: string;
  serverCode: string;
  timestamp: number;
  archiveYear: number;
  entry: ScanArchiveEntry;
  reasonCodes: LocalFirstScanReasonCode[];
};

export type LocalFirstScanPlanSegmentResult = {
  segmentId: string;
  serverCode: string;
  status: LocalFirstScanPlanStatus;
  localSnapshotIds: string[];
  archiveCandidateIds: string[];
  reasonCodes: LocalFirstScanReasonCode[];
};

export type LocalFirstScanPlan = {
  status: LocalFirstScanPlanStatus;
  requiredManifestYears: number[];
  missingManifestYears: number[];
  localScanIds: string[];
  localSnapshots: LocalFirstScanLocalSnapshot[];
  fulfilledSegments: LocalFirstScanPlanSegmentResult[];
  missingSegments: LocalFirstScanPlanSegmentResult[];
  archiveCandidates: LocalFirstScanArchiveCandidate[];
  reasonCodes: LocalFirstScanReasonCode[];
};

export type ResolveLocalFirstScanPlanInput = {
  request: LocalFirstScanRequest;
  localScanSummaries: readonly GuildHubScanSummary[];
  archiveEntries: readonly ScanArchiveEntry[];
  availableManifestYears?: readonly number[];
};

type LocalObservation = {
  id: string;
  sourceScanId: string;
  sourceScanFilename: string;
  serverCode: string;
  timestamp: number;
  playerCount: number;
  guildCount: number;
  archiveScanId?: string;
  archiveSha256?: string;
  archiveTimestamp?: number;
  archiveServerCode?: string | null;
};

const compareText = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });

const uniqueSorted = (values: Iterable<string>) => [...new Set(values)].sort(compareText);

const uniqueSortedNumbers = (values: Iterable<number>) =>
  [...new Set([...values].filter((value) => Number.isInteger(value)))].sort((left, right) => left - right);

const normalizeServerCode = (value: unknown) => resolveServer(String(value ?? ""))?.code ?? null;

const requireFiniteTimestamp = (value: number, label: string) => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite timestamp.`);
  return value;
};

const yearFromTimestamp = (timestamp: number) => new Date(timestamp).getUTCFullYear();

const yearsForInterval = (from: number, to: number) => {
  const years: number[] = [];
  for (let year = yearFromTimestamp(from); year <= yearFromTimestamp(to); year += 1) {
    years.push(year);
  }
  return years;
};

const timeMatches = (time: LocalFirstScanTimeRequest, timestamp: number) => {
  if (time.kind === "latest") return true;
  if (time.kind === "exact") return timestamp === time.timestamp;
  return timestamp >= time.from && timestamp <= time.to;
};

const dataAvailability = (input: { playerCount: number; guildCount: number }, kind: LocalFirstScanDataKind) => {
  const hasPlayers = input.playerCount > 0;
  const hasGuilds = input.guildCount > 0;
  const hasAnyRequestedData = kind === "players" ? hasPlayers : kind === "guilds" ? hasGuilds : hasPlayers || hasGuilds;
  const hasAllRequestedData = kind === "players" ? hasPlayers : kind === "guilds" ? hasGuilds : hasPlayers && hasGuilds;
  return { hasAnyRequestedData, hasAllRequestedData };
};

const compareLocalSnapshots = (left: LocalFirstScanLocalSnapshot, right: LocalFirstScanLocalSnapshot) =>
  left.timestamp - right.timestamp ||
  compareText(left.serverCode, right.serverCode) ||
  compareText(left.sourceScanId, right.sourceScanId) ||
  compareText(left.id, right.id);

const compareArchiveCandidates = (left: LocalFirstScanArchiveCandidate, right: LocalFirstScanArchiveCandidate) =>
  left.timestamp - right.timestamp ||
  compareText(left.serverCode, right.serverCode) ||
  compareText(left.id, right.id);

const createReasonList = (values: Iterable<LocalFirstScanReasonCode>) => [...new Set(values)];

const normalizeTimeRequest = (time: LocalFirstScanTimeRequest): LocalFirstScanTimeRequest => {
  if (time.kind === "latest") return time;
  if (time.kind === "exact") return { kind: "exact", timestamp: requireFiniteTimestamp(time.timestamp, "Exact timestamp") };
  const from = requireFiniteTimestamp(time.from, "Interval from");
  const to = requireFiniteTimestamp(time.to, "Interval to");
  if (from > to) throw new Error("Interval from must be before or equal to interval to.");
  return { kind: "interval", from, to };
};

const lineageCodesForServer = (serverCode: string) =>
  uniqueSorted([
    serverCode,
    ...getFusionLineage(serverCode).map((server) => server.code),
    ...getFusionOrigins(serverCode).map((server) => server.code),
  ]);

const parseFusionEffectiveDateTimestamp = (value: string | null | undefined) => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
  return Number.isFinite(timestamp) ? timestamp : null;
};

const normalizeScopeServerCodes = (scope: FusionIdentityAnalysisScope) =>
  uniqueSorted(scope.lineageServerCodes.length ? scope.lineageServerCodes : [scope.targetServerCode, ...scope.originServerCodes])
    .map((code) => normalizeServerCode(code))
    .filter((code): code is string => Boolean(code));

export function buildLocalFirstFusionScopeSegments(
  scope: FusionIdentityAnalysisScope,
): LocalFirstScanResolvedSegmentInput[] {
  const windows = new Map<string, { from: number | null; to: number | null }>();
  normalizeScopeServerCodes(scope).forEach((serverCode) => {
    windows.set(serverCode, { from: null, to: null });
  });

  scope.ancestorEvents.forEach((event) => {
    const effectiveTimestamp = parseFusionEffectiveDateTimestamp(event.effectiveDate);
    if (effectiveTimestamp == null) return;

    const targetServerCode = normalizeServerCode(event.targetServerCode);
    if (targetServerCode && windows.has(targetServerCode)) {
      const window = windows.get(targetServerCode)!;
      window.from = window.from == null ? effectiveTimestamp : Math.max(window.from, effectiveTimestamp);
    }

    event.originServerCodes.forEach((originCode) => {
      const serverCode = normalizeServerCode(originCode);
      if (!serverCode || !windows.has(serverCode)) return;
      const window = windows.get(serverCode)!;
      const to = effectiveTimestamp - 1;
      window.to = window.to == null ? to : Math.min(window.to, to);
    });
  });

  return [...windows.entries()]
    .flatMap(([server, window]) => {
      if (window.from != null && window.to != null && window.from > window.to) return [];
      return [
        {
          id: `fusion-scope:${scope.id}:${server}`,
          server,
          from: window.from,
          to: window.to,
        },
      ];
    })
    .sort((left, right) => compareText(left.server, right.server));
}

const segmentWindow = (
  time: LocalFirstScanTimeRequest,
  segment: Pick<LocalFirstScanResolvedSegmentInput, "from" | "to"> = {},
) => {
  if (time.kind === "exact") return { from: time.timestamp, to: time.timestamp };
  if (time.kind === "interval") {
    return {
      from: Math.max(time.from, segment.from ?? Number.NEGATIVE_INFINITY),
      to: Math.min(time.to, segment.to ?? Number.POSITIVE_INFINITY),
    };
  }
  return {
    from: segment.from ?? null,
    to: segment.to ?? null,
  };
};

export function resolveLocalFirstScanSegments(request: LocalFirstScanRequest): LocalFirstScanResolvedSegment[] {
  const time = normalizeTimeRequest(request.time);

  if (request.segments?.length) {
    return request.segments
      .map((segment, index) => {
        const serverCode = normalizeServerCode(segment.server);
        if (!serverCode) throw new Error(`Unknown server segment: ${segment.server}`);
        const window = segmentWindow(time, segment);
        return {
          id: segment.id ?? `${serverCode}:${index}`,
          serverCode,
          from: window.from,
          to: window.to,
          lineageServerCodes: lineageCodesForServer(serverCode),
          reasonCodes: ["server-normalized", "fusion-lineage-delegated"] as LocalFirstScanReasonCode[],
        };
      })
      .sort((left, right) => compareText(left.serverCode, right.serverCode) || compareText(left.id, right.id));
  }

  if (request.target.kind === "fusion-scope") {
    const scope = normalizeFusionIdentityAnalysisScope(request.target.scope);
    if (!scope) throw new Error("Unknown fusion scope.");
    const serverCodes = uniqueSorted(scope.lineageServerCodes.length ? scope.lineageServerCodes : [scope.targetServerCode]);
    return serverCodes.map((serverCode) => {
      const window = segmentWindow(time);
      return {
        id: `${scope.id}:${serverCode}`,
        serverCode,
        from: window.from,
        to: window.to,
        lineageServerCodes: serverCodes,
        reasonCodes: ["server-normalized", "fusion-lineage-delegated"] as LocalFirstScanReasonCode[],
      };
    });
  }

  const serverCode = normalizeServerCode(request.target.server);
  if (!serverCode) throw new Error(`Unknown server: ${request.target.server}`);
  const window = segmentWindow(time);
  return [
    {
      id: serverCode,
      serverCode,
      from: window.from,
      to: window.to,
      lineageServerCodes: lineageCodesForServer(serverCode),
      reasonCodes: ["server-normalized", "fusion-lineage-delegated"] as LocalFirstScanReasonCode[],
    },
  ];
}

const sliceObservation = (summary: GuildHubScanSummary, slice: GuildHubFusionInventorySlice): LocalObservation | null => {
  const serverCode = normalizeServerCode(slice.server);
  if (!serverCode || !Number.isFinite(slice.timestampMs)) return null;
  const archiveServerCode = summary.archiveSource ? normalizeServerCode(summary.archiveSource.server) : null;
  return {
    id: `${summary.sourceScanId}:${slice.timestampMs}:${serverCode}`,
    sourceScanId: summary.sourceScanId,
    sourceScanFilename: summary.filename,
    serverCode,
    timestamp: slice.timestampMs,
    playerCount: slice.playerCount,
    guildCount: slice.guildCount,
    ...(summary.archiveSource
      ? {
          archiveScanId: summary.archiveSource.archiveScanId,
          archiveSha256: summary.archiveSource.sha256,
          archiveTimestamp: summary.archiveSource.timestamp,
          archiveServerCode,
        }
      : {}),
  };
};

const fallbackObservations = (summary: GuildHubScanSummary): LocalObservation[] =>
  summary.snapshotTimestamps.flatMap((timestamp) =>
    summary.servers.flatMap((server) => {
      const serverCode = normalizeServerCode(server);
      if (!serverCode || !Number.isFinite(timestamp)) return [];
      const archiveServerCode = summary.archiveSource ? normalizeServerCode(summary.archiveSource.server) : null;
      return [
        {
          id: `${summary.sourceScanId}:${timestamp}:${serverCode}`,
          sourceScanId: summary.sourceScanId,
          sourceScanFilename: summary.filename,
          serverCode,
          timestamp,
          playerCount: summary.playerCount,
          guildCount: summary.guildCount,
          ...(summary.archiveSource
            ? {
                archiveScanId: summary.archiveSource.archiveScanId,
                archiveSha256: summary.archiveSource.sha256,
                archiveTimestamp: summary.archiveSource.timestamp,
                archiveServerCode,
              }
            : {}),
        },
      ];
    }),
  );

const createLocalObservations = (summaries: readonly GuildHubScanSummary[]) =>
  summaries
    .flatMap((summary) => {
      const sliceObservations = (summary.fusionInventorySlices ?? [])
        .map((slice) => sliceObservation(summary, slice))
        .filter((entry): entry is LocalObservation => Boolean(entry));
      return withArchiveBindingObservations(summary, sliceObservations.length ? sliceObservations : fallbackObservations(summary));
    })
    .sort(
      (left, right) =>
        left.timestamp - right.timestamp ||
        compareText(left.serverCode, right.serverCode) ||
        compareText(left.sourceScanId, right.sourceScanId) ||
        compareText(left.id, right.id),
    );

const withArchiveBindingObservations = (
  summary: GuildHubScanSummary,
  observations: readonly LocalObservation[],
) => {
  const bindings = summary.archiveBindings ?? [];
  if (!bindings.length) return observations;
  const variants: LocalObservation[] = [...observations];
  for (const observation of observations) {
    for (const binding of bindings) {
      const archiveServerCode = normalizeServerCode(binding.server);
      if (archiveServerCode !== observation.serverCode || binding.timestamp !== observation.timestamp) continue;
      variants.push({
        ...observation,
        id: `${observation.id}:archive-binding:${binding.archiveScanId}`,
        archiveScanId: binding.archiveScanId,
        archiveSha256: binding.sha256,
        archiveTimestamp: binding.timestamp,
        archiveServerCode,
      });
    }
  }
  return variants;
};

const entryServerCode = (entry: ScanArchiveEntry) => normalizeServerCode(entry.server);

const entryMatchesDataKind = (entry: ScanArchiveEntry, kind: LocalFirstScanDataKind) =>
  dataAvailability({ playerCount: entry.playerCount, guildCount: entry.groupCount }, kind).hasAllRequestedData;

const entryMatchesSegment = (
  entry: ScanArchiveEntry,
  segment: LocalFirstScanResolvedSegment,
  request: LocalFirstScanRequest,
) => entryServerCode(entry) === segment.serverCode && timeMatches(request.time, entry.timestamp) && entryMatchesDataKind(entry, request.dataKind);

const observationMatchesSegmentTime = (
  observation: LocalObservation,
  segment: LocalFirstScanResolvedSegment,
  request: LocalFirstScanRequest,
) => observation.serverCode === segment.serverCode && timeMatches(request.time, observation.timestamp);

const archiveCopyMatchesEntry = (observation: LocalObservation, entry: ScanArchiveEntry) =>
  observation.archiveScanId === entry.id &&
  observation.archiveSha256 === entry.sha256 &&
  observation.archiveTimestamp === entry.timestamp &&
  observation.archiveServerCode === entryServerCode(entry);

const isExactArchiveCopy = (observation: LocalObservation, entries: readonly ScanArchiveEntry[]) =>
  entries.some((entry) => archiveCopyMatchesEntry(observation, entry));

const classifyObservation = (
  observation: LocalObservation,
  request: LocalFirstScanRequest,
  entries: readonly ScanArchiveEntry[],
): LocalFirstScanLocalSnapshot => {
  const data = dataAvailability(observation, request.dataKind);
  const exactArchiveCopy = isExactArchiveCopy(observation, entries);
  const reasonCodes: LocalFirstScanReasonCode[] = [];
  if (exactArchiveCopy) reasonCodes.push("local-exact-archive-copy");
  if (data.hasAllRequestedData) reasonCodes.push("local-usable-snapshot");
  else if (data.hasAnyRequestedData) reasonCodes.push("local-data-kind-missing");
  if (!exactArchiveCopy && data.hasAnyRequestedData && request.completeness === "confirmed-archive") {
    reasonCodes.push("local-coverage-unverified");
  }

  const satisfiesRequirement =
    data.hasAllRequestedData &&
    (request.completeness === "usable-snapshot" || exactArchiveCopy);

  return {
    id: observation.id,
    sourceScanId: observation.sourceScanId,
    sourceScanFilename: observation.sourceScanFilename,
    serverCode: observation.serverCode,
    timestamp: observation.timestamp,
    playerCount: observation.playerCount,
    guildCount: observation.guildCount,
    isArchiveCopy: exactArchiveCopy,
    ...(observation.archiveScanId ? { archiveScanId: observation.archiveScanId } : {}),
    coverage: !data.hasAnyRequestedData
      ? "not-suitable"
      : exactArchiveCopy && data.hasAllRequestedData
      ? "exact-archive-copy"
      : data.hasAllRequestedData
        ? request.completeness === "confirmed-archive"
          ? "unverified-local-coverage"
          : "usable-local-snapshot"
        : data.hasAnyRequestedData
          ? "unverified-local-coverage"
          : "not-suitable",
    satisfiesRequirement,
    reasonCodes: createReasonList(reasonCodes),
  };
};

const latestArchiveBySegment = (
  entries: readonly ScanArchiveEntry[],
  segment: LocalFirstScanResolvedSegment,
  request: LocalFirstScanRequest,
) =>
  entries
    .filter((entry) => entryMatchesSegment(entry, segment, request))
    .sort((left, right) => right.timestamp - left.timestamp || compareText(left.id, right.id))[0] ?? null;

const archiveCandidatesForSegment = (
  entries: readonly ScanArchiveEntry[],
  segment: LocalFirstScanResolvedSegment,
  request: LocalFirstScanRequest,
): LocalFirstScanArchiveCandidate[] => {
  const candidates =
    request.time.kind === "latest"
      ? [latestArchiveBySegment(entries, segment, request)].filter((entry): entry is ScanArchiveEntry => Boolean(entry))
      : entries.filter((entry) => entryMatchesSegment(entry, segment, request));

  return candidates
    .map((entry) => ({
      id: entry.id,
      serverCode: entryServerCode(entry) ?? entry.server,
      timestamp: entry.timestamp,
      archiveYear: entry.archiveYear,
      entry,
      reasonCodes: ["archive-candidate-available"] as LocalFirstScanReasonCode[],
    }))
    .sort(compareArchiveCandidates);
};

const localSnapshotsForSegment = (
  observations: readonly LocalObservation[],
  segment: LocalFirstScanResolvedSegment,
  request: LocalFirstScanRequest,
  entries: readonly ScanArchiveEntry[],
) => {
  const scopedEntries = request.time.kind === "latest"
    ? (() => {
        const latest = latestArchiveBySegment(entries, segment, request);
        return latest ? [latest] : entries;
      })()
    : entries;
  const snapshots = observations
    .filter((observation) => observationMatchesSegmentTime(observation, segment, request))
    .map((observation) => classifyObservation(observation, request, scopedEntries));

  if (request.time.kind !== "latest") return snapshots.sort(compareLocalSnapshots);

  const latestArchive = latestArchiveBySegment(entries, segment, request);
  const latestLocalTimestamp = Math.max(...snapshots.map((snapshot) => snapshot.timestamp), Number.NEGATIVE_INFINITY);
  const minimumTimestamp = latestArchive?.timestamp ?? latestLocalTimestamp;
  return snapshots
    .filter((snapshot) => snapshot.timestamp === minimumTimestamp)
    .sort(compareLocalSnapshots);
};

const requiredYearsForRequest = (
  request: LocalFirstScanRequest,
  archiveEntries: readonly ScanArchiveEntry[],
) => {
  if (request.time.kind === "exact") return [yearFromTimestamp(request.time.timestamp)];
  if (request.time.kind === "interval") return yearsForInterval(request.time.from, request.time.to);
  return uniqueSortedNumbers(archiveEntries.map((entry) => entry.archiveYear));
};

const segmentResult = (
  segment: LocalFirstScanResolvedSegment,
  localSnapshots: readonly LocalFirstScanLocalSnapshot[],
  missingArchiveCandidates: readonly LocalFirstScanArchiveCandidate[],
  allArchiveCandidates: readonly LocalFirstScanArchiveCandidate[],
  request: LocalFirstScanRequest,
): LocalFirstScanPlanSegmentResult => {
  const satisfyingSnapshots = localSnapshots.filter((snapshot) => snapshot.satisfiesRequirement);
  const complete =
    request.time.kind === "interval" && allArchiveCandidates.length
      ? uniqueSortedNumbers(allArchiveCandidates.map((candidate) => candidate.timestamp)).every((timestamp) =>
          satisfyingSnapshots.some((snapshot) => snapshot.timestamp === timestamp),
        )
      : satisfyingSnapshots.length > 0;
  const partial = !complete && localSnapshots.some((snapshot) => snapshot.coverage !== "not-suitable");
  const reasonCodes: LocalFirstScanReasonCode[] = [
    ...segment.reasonCodes,
    ...localSnapshots.flatMap((snapshot) => snapshot.reasonCodes),
    ...missingArchiveCandidates.flatMap((candidate) => candidate.reasonCodes),
  ];
  if (!allArchiveCandidates.length && !complete) reasonCodes.push("no-matching-archive-scan");
  if (partial && missingArchiveCandidates.length) reasonCodes.push("time-range-partially-covered");

  return {
    segmentId: segment.id,
    serverCode: segment.serverCode,
    status: complete ? "complete" : partial ? "partial" : "empty",
    localSnapshotIds: localSnapshots.map((snapshot) => snapshot.id).sort(compareText),
    archiveCandidateIds: missingArchiveCandidates.map((candidate) => candidate.id).sort(compareText),
    reasonCodes: createReasonList(reasonCodes),
  };
};

export function resolveLocalFirstScanPlan(input: ResolveLocalFirstScanPlanInput): LocalFirstScanPlan {
  const request = { ...input.request, time: normalizeTimeRequest(input.request.time) };
  const segments = resolveLocalFirstScanSegments(request);
  const archiveEntries = [...input.archiveEntries].sort(
    (left, right) => left.timestamp - right.timestamp || compareText(entryServerCode(left) ?? left.server, entryServerCode(right) ?? right.server) || compareText(left.id, right.id),
  );
  const observations = createLocalObservations(input.localScanSummaries);
  const allLocalSnapshots = new Map<string, LocalFirstScanLocalSnapshot>();
  const allArchiveCandidates = new Map<string, LocalFirstScanArchiveCandidate>();
  const fulfilledSegments: LocalFirstScanPlanSegmentResult[] = [];
  const missingSegments: LocalFirstScanPlanSegmentResult[] = [];

  for (const segment of segments) {
    const localSnapshots = localSnapshotsForSegment(observations, segment, request, archiveEntries);
    const segmentArchiveCandidates = archiveCandidatesForSegment(archiveEntries, segment, request);
    const missingArchiveCandidates = segmentArchiveCandidates.filter(
      (candidate) =>
        !localSnapshots.some(
          (snapshot) =>
            snapshot.satisfiesRequirement &&
            snapshot.serverCode === candidate.serverCode &&
            snapshot.timestamp === candidate.timestamp &&
            (request.completeness !== "confirmed-archive" || snapshot.archiveScanId === candidate.id),
        ),
    );

    localSnapshots.forEach((snapshot) => allLocalSnapshots.set(snapshot.id, snapshot));
    missingArchiveCandidates.forEach((candidate) => allArchiveCandidates.set(candidate.id, candidate));

    const result = segmentResult(segment, localSnapshots, missingArchiveCandidates, segmentArchiveCandidates, request);
    if (result.status === "complete") fulfilledSegments.push(result);
    else missingSegments.push(result);
  }

  const localSnapshots = [...allLocalSnapshots.values()].sort(compareLocalSnapshots);
  const archiveCandidates = [...allArchiveCandidates.values()].sort(compareArchiveCandidates);
  const requiredManifestYears = requiredYearsForRequest(request, archiveEntries);
  const availableManifestYears = input.availableManifestYears ? new Set(input.availableManifestYears) : null;
  const missingManifestYears = availableManifestYears
    ? requiredManifestYears.filter((year) => !availableManifestYears.has(year))
    : [];

  missingManifestYears.forEach((year) => {
    const id = `manifest:${year}`;
    missingSegments.push({
      segmentId: id,
      serverCode: "*",
      status: "empty",
      localSnapshotIds: [],
      archiveCandidateIds: [],
      reasonCodes: ["manifest-year-missing"],
    });
  });

  const hasCompleteCoverage = missingSegments.length === 0 && fulfilledSegments.length === segments.length;
  const hasLocalUsable = localSnapshots.some((snapshot) => snapshot.coverage !== "not-suitable");
  const reasonCodes = createReasonList([
    ...fulfilledSegments.flatMap((segment) => segment.reasonCodes),
    ...missingSegments.flatMap((segment) => segment.reasonCodes),
    ...archiveCandidates.flatMap((candidate) => candidate.reasonCodes),
  ]);

  return {
    status: hasCompleteCoverage ? "complete" : hasLocalUsable ? "partial" : "empty",
    requiredManifestYears,
    missingManifestYears,
    localScanIds: uniqueSorted(
      localSnapshots
        .filter((snapshot) => snapshot.coverage !== "not-suitable")
        .map((snapshot) => snapshot.sourceScanId),
    ),
    localSnapshots,
    fulfilledSegments: fulfilledSegments.sort((left, right) => compareText(left.serverCode, right.serverCode) || compareText(left.segmentId, right.segmentId)),
    missingSegments: missingSegments.sort((left, right) => compareText(left.serverCode, right.serverCode) || compareText(left.segmentId, right.segmentId)),
    archiveCandidates,
    reasonCodes,
  };
}
