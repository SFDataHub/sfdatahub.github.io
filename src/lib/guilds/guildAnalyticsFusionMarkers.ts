import {
  createServerGraph,
  isFusionEventEffective,
} from "../servers/serverResolver";

type ServerGraph = ReturnType<typeof createServerGraph>;

type GuildAnalyticsFusionTimeDomain = {
  startMs: number;
  endMs: number;
};

export type GuildAnalyticsFusionMarker = {
  key: string;
  timestampMs: number;
  label?: string;
  description: string;
  eventId: string;
  targetServerCode: string;
  targetServerDisplayName: string;
  originServerCodes: string[];
  originServerDisplayNames: string[];
  effectiveDate: string;
};

type GuildAnalyticsFusionMarkerOptions = {
  graph?: ServerGraph;
  now?: string | Date | number;
};

const defaultServerGraph = createServerGraph();

export function buildGuildAnalyticsFusionMarkers(
  serverInput: string | number | readonly (string | number | null | undefined)[] | null | undefined,
  timeDomain: GuildAnalyticsFusionTimeDomain | null | undefined,
  options: GuildAnalyticsFusionMarkerOptions = {},
): GuildAnalyticsFusionMarker[] {
  if (!serverInput || !timeDomain || timeDomain.endMs <= timeDomain.startMs) return [];

  const graph = options.graph ?? defaultServerGraph;
  const now = options.now ?? new Date();
  const historyCodes = collectResolvedHistoryCodes(serverInput, graph);
  if (!historyCodes.length) return [];
  const lineageCodes = collectFusionLineageCodes(historyCodes, graph);
  const lineageCodeSet = new Set(lineageCodes);
  const events = lineageCodes.flatMap((code) => graph.getFusionEventsForTarget(code));

  return events
    .flatMap((event) => {
      if (!lineageCodeSet.has(event.target)) return [];
      if (!event.origins.some((originCode) => lineageCodeSet.has(originCode))) return [];
      if (!isFusionEventEffective(event, now)) return [];
      const timestampMs = parseFusionEffectiveDateMs(event.effectiveDate);
      if (timestampMs == null || timestampMs < timeDomain.startMs || timestampMs > timeDomain.endMs) return [];
      const effectiveDate = event.effectiveDate;
      if (!effectiveDate) return [];
      const targetServerDisplayName =
        graph.getServerByCode(event.target)?.displayName ?? event.target;
      const originServerDisplayNames = event.origins.map(
        (originCode) => graph.getServerByCode(originCode)?.displayName ?? originCode,
      );

      return [
        {
          key: event.id,
          timestampMs,
          description: `Server fusion\n${event.origins.join(", ")} -> ${event.target}\n${effectiveDate}`,
          eventId: event.id,
          targetServerCode: event.target,
          targetServerDisplayName,
          originServerCodes: [...event.origins],
          originServerDisplayNames,
          effectiveDate,
        },
      ];
    })
    .filter((marker, index, markers) => markers.findIndex((candidate) => candidate.eventId === marker.eventId) === index)
    .sort((left, right) => left.timestampMs - right.timestampMs || left.eventId.localeCompare(right.eventId));
}

function collectResolvedHistoryCodes(
  serverInput: string | number | readonly (string | number | null | undefined)[],
  graph: ServerGraph,
) {
  const inputs = Array.isArray(serverInput) ? serverInput : [serverInput];
  const codes = inputs.flatMap((input) => {
    const server = graph.resolveServer(input);
    return server ? [server.code] : [];
  });
  return [...new Set(codes)];
}

function collectFusionLineageCodes(historyCodes: readonly string[], graph: ServerGraph) {
  const historyCodeSet = new Set(historyCodes);
  const lineageCodes = new Set(historyCodes);
  historyCodes.forEach((code) => {
    const lineage = graph.getFusionLineage(code);
    const lastObservedIndex = lineage.reduce(
      (lastIndex, server, index) => (historyCodeSet.has(server.code) ? index : lastIndex),
      -1,
    );
    lineage.slice(0, Math.max(0, lastObservedIndex) + 1).forEach((server) => lineageCodes.add(server.code));
  });
  return [...lineageCodes];
}

function parseFusionEffectiveDateMs(value: string | null | undefined): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestampMs = Date.UTC(year, month - 1, day);
  const date = new Date(timestampMs);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return timestampMs;
}
