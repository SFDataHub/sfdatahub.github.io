import {
  LOCAL_SERVER_FUSION_EVENTS,
  type LocalServerFusionEvent,
} from "../../data/serverFusions";
import {
  LOCAL_SERVER_REGISTRY,
  type LocalServerDefinition,
} from "../../data/serverRegistry";
import {
  createServerGraph,
  getFusionEventStatus,
  resolveServer,
} from "../servers/serverResolver";

export type FusionIdentityTemporalStatus = "effective" | "future" | "unknown-date";

export type FusionIdentityScopeEvent = {
  eventId: string;
  targetServerCode: string;
  originServerCodes: string[];
  effectiveDate?: string;
  temporalStatus: FusionIdentityTemporalStatus;
};

export type FusionIdentityScopeServerRole =
  | "current-target"
  | "historical-origin"
  | "transitive-historical-origin"
  | "intermediate-fusion-target"
  | "outside-scope";

export type FusionIdentityAnalysisScope = {
  id: string;
  eventId: string;
  label: string;
  targetServerCode: string;
  targetServerName: string;
  originServerCodes: string[];
  originServerNames: string[];
  directOriginServerCodes: string[];
  directOriginServerNames: string[];
  transitiveOriginServerCodes: string[];
  lineageServerCodes: string[];
  intermediateServerCodes: string[];
  ancestorEvents: FusionIdentityScopeEvent[];
  effectiveDate?: string;
  temporalStatus: FusionIdentityTemporalStatus;
  isCurrentTerminalTarget: boolean;
  analysisSupported: boolean;
};

export type ListFusionIdentityAnalysisScopesOptions = {
  atDate?: string | Date | number;
  registry?: readonly LocalServerDefinition[];
  events?: readonly LocalServerFusionEvent[];
};

const compareServerCodes = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });

const compareScopes = (
  left: FusionIdentityAnalysisScope,
  right: FusionIdentityAnalysisScope,
) => {
  const statusRank = (scope: FusionIdentityAnalysisScope) => {
    if (scope.analysisSupported) return 0;
    if (scope.isCurrentTerminalTarget) return 1;
    if (scope.temporalStatus === "future") return 2;
    if (scope.temporalStatus === "unknown-date") return 3;
    return 4;
  };
  return (
    statusRank(left) - statusRank(right) ||
    compareServerCodes(left.targetServerCode, right.targetServerCode)
  );
};

const compactServerRange = (serverCodes: readonly string[]) => {
  const sorted = [...serverCodes].sort(compareServerCodes);
  const parsed = sorted.map((code) => {
    const match = code.match(/^([A-Z]+)(\d+)$/i);
    return match
      ? { code, prefix: match[1].toUpperCase(), number: Number(match[2]) }
      : null;
  });
  const first = parsed[0];
  const sameSeries =
    first &&
    parsed.every(
      (entry, index) =>
        entry &&
        entry.prefix === first.prefix &&
        entry.number === first.number + index,
    );

  if (sameSeries && parsed.length > 1) {
    const last = parsed[parsed.length - 1];
    return `${first.code}-${last?.code}`;
  }

  return sorted.join(", ");
};

const uniqueSorted = (values: Iterable<string>) =>
  [...new Set(values)].sort(compareServerCodes);

const toTemporalStatus = (
  event: LocalServerFusionEvent,
  atDate: string | Date | number,
): FusionIdentityTemporalStatus => {
  const status = getFusionEventStatus(event, atDate);
  if (status === "unknown-effective-date") return "unknown-date";
  return status;
};

const resolveName = (serverCode: string, graph: ReturnType<typeof createServerGraph>) =>
  graph.getServerByCode(serverCode)?.displayName ?? serverCode;

const toScopeEvent = (
  event: LocalServerFusionEvent,
  atDate: string | Date | number,
): FusionIdentityScopeEvent => ({
  eventId: event.id,
  targetServerCode: event.target,
  originServerCodes: uniqueSorted(event.origins),
  effectiveDate: event.effectiveDate,
  temporalStatus: toTemporalStatus(event, atDate),
});

export const isFusionIdentityAnalysisSupported = (
  scope: Pick<FusionIdentityAnalysisScope, "temporalStatus" | "isCurrentTerminalTarget">,
) =>
  (scope.temporalStatus === "effective" && scope.isCurrentTerminalTarget) ||
  scope.temporalStatus === "unknown-date";

export const listFusionIdentityAnalysisScopes = (
  options: ListFusionIdentityAnalysisScopesOptions = {},
): FusionIdentityAnalysisScope[] => {
  const atDate = options.atDate ?? new Date();
  const registry = options.registry ?? LOCAL_SERVER_REGISTRY;
  const events = options.events ?? LOCAL_SERVER_FUSION_EVENTS;
  const graph = createServerGraph(registry, events);
  const statusByEventId = new Map(
    events.map((event) => [event.id, toTemporalStatus(event, atDate)]),
  );
  const effectiveConsumerTargetsByOrigin = new Map<string, Set<string>>();

  events.forEach((event) => {
    if (statusByEventId.get(event.id) !== "effective") return;
    event.origins.forEach((originCode) => {
      const targets = effectiveConsumerTargetsByOrigin.get(originCode) ?? new Set<string>();
      targets.add(event.target);
      effectiveConsumerTargetsByOrigin.set(originCode, targets);
    });
  });

  return events
    .flatMap((event) => {
      const target = graph.getServerByCode(event.target);
      if (!target) return [];

      const temporalStatus = statusByEventId.get(event.id) ?? "unknown-date";
      const directOriginServerCodes = uniqueSorted(event.origins);
      const directOriginServerNames = directOriginServerCodes.map((code) =>
        resolveName(code, graph),
      );
      const transitiveOriginServerCodes = uniqueSorted(
        graph.getFusionOrigins(event.target).map((origin) => origin.code),
      );
      const ancestorEvents = graph
        .getFusionAncestorEvents(event.target)
        .map((ancestorEvent) => toScopeEvent(ancestorEvent, atDate));
      const intermediateServerCodes = uniqueSorted(
        ancestorEvents
          .map((ancestorEvent) => ancestorEvent.targetServerCode)
          .filter((code) => code !== event.target),
      );
      const lineageServerCodes = uniqueSorted([
        event.target,
        ...directOriginServerCodes,
        ...transitiveOriginServerCodes,
        ...intermediateServerCodes,
      ]);
      const isCurrentTerminalTarget =
        temporalStatus === "effective" &&
        !(effectiveConsumerTargetsByOrigin.get(event.target)?.size ?? 0);

      return [
        {
          id: event.target === "F28" ? "F28" : event.id,
          eventId: event.id,
          label: `${compactServerRange(directOriginServerCodes)} -> ${event.target}`,
          targetServerCode: event.target,
          targetServerName: target.displayName,
          originServerCodes: directOriginServerCodes,
          originServerNames: directOriginServerNames,
          directOriginServerCodes,
          directOriginServerNames,
          transitiveOriginServerCodes,
          lineageServerCodes,
          intermediateServerCodes,
          ancestorEvents,
          effectiveDate: event.effectiveDate,
          temporalStatus,
          isCurrentTerminalTarget,
          analysisSupported: isFusionIdentityAnalysisSupported({
            temporalStatus,
            isCurrentTerminalTarget,
          }),
        } satisfies FusionIdentityAnalysisScope,
      ];
    })
    .sort(compareScopes);
};

export const getDefaultFusionIdentityAnalysisScope = () => {
  const scopes = listFusionIdentityAnalysisScopes();
  return (
    scopes.find((scope) => scope.analysisSupported) ??
    scopes.find((scope) => scope.isCurrentTerminalTarget) ??
    scopes[0] ??
    null
  );
};

export const normalizeFusionIdentityAnalysisScope = (
  scope: Partial<FusionIdentityAnalysisScope> | null | undefined,
  options: ListFusionIdentityAnalysisScopesOptions = {},
): FusionIdentityAnalysisScope | null => {
  const canonicalScopes = listFusionIdentityAnalysisScopes(options);
  if (!scope) {
    return (
      canonicalScopes.find((entry) => entry.analysisSupported) ??
      canonicalScopes.find((entry) => entry.isCurrentTerminalTarget) ??
      canonicalScopes[0] ??
      null
    );
  }

  const canonical =
    canonicalScopes.find((entry) => entry.id === scope.id) ??
    canonicalScopes.find((entry) => entry.eventId === scope.eventId) ??
    canonicalScopes.find((entry) => entry.targetServerCode === scope.targetServerCode) ??
    null;
  const originServerCodes = Array.isArray(scope.originServerCodes)
    ? scope.originServerCodes
    : canonical?.originServerCodes ?? [];
  const directOriginServerCodes = Array.isArray(scope.directOriginServerCodes)
    ? scope.directOriginServerCodes
    : canonical?.directOriginServerCodes ?? originServerCodes;
  const targetServerCode =
    scope.targetServerCode ?? canonical?.targetServerCode ?? String(scope.id ?? "");

  return {
    id: String(scope.id ?? canonical?.id ?? targetServerCode),
    eventId: String(scope.eventId ?? canonical?.eventId ?? scope.id ?? targetServerCode),
    label:
      scope.label ??
      canonical?.label ??
      `${compactServerRange(directOriginServerCodes)} -> ${targetServerCode}`,
    targetServerCode,
    targetServerName: scope.targetServerName ?? canonical?.targetServerName ?? targetServerCode,
    originServerCodes,
    originServerNames: Array.isArray(scope.originServerNames)
      ? scope.originServerNames
      : canonical?.originServerNames ?? originServerCodes,
    directOriginServerCodes,
    directOriginServerNames: Array.isArray(scope.directOriginServerNames)
      ? scope.directOriginServerNames
      : canonical?.directOriginServerNames ?? directOriginServerCodes,
    transitiveOriginServerCodes: Array.isArray(scope.transitiveOriginServerCodes)
      ? scope.transitiveOriginServerCodes
      : canonical?.transitiveOriginServerCodes ?? directOriginServerCodes,
    lineageServerCodes: Array.isArray(scope.lineageServerCodes)
      ? scope.lineageServerCodes
      : canonical?.lineageServerCodes ?? uniqueSorted([...directOriginServerCodes, targetServerCode]),
    intermediateServerCodes: Array.isArray(scope.intermediateServerCodes)
      ? scope.intermediateServerCodes
      : canonical?.intermediateServerCodes ?? [],
    ancestorEvents: Array.isArray(scope.ancestorEvents)
      ? scope.ancestorEvents
      : canonical?.ancestorEvents ?? [],
    effectiveDate: scope.effectiveDate ?? canonical?.effectiveDate,
    temporalStatus: scope.temporalStatus ?? canonical?.temporalStatus ?? "unknown-date",
    isCurrentTerminalTarget:
      typeof scope.isCurrentTerminalTarget === "boolean"
        ? scope.isCurrentTerminalTarget
        : canonical?.isCurrentTerminalTarget ?? false,
    analysisSupported:
      typeof scope.analysisSupported === "boolean"
        ? scope.analysisSupported
        : canonical?.analysisSupported ??
          isFusionIdentityAnalysisSupported({
            temporalStatus: scope.temporalStatus ?? canonical?.temporalStatus ?? "unknown-date",
            isCurrentTerminalTarget:
              typeof scope.isCurrentTerminalTarget === "boolean"
                ? scope.isCurrentTerminalTarget
                : canonical?.isCurrentTerminalTarget ?? false,
          }),
  };
};

export const getFusionIdentityScopeServerRole = (
  scope: FusionIdentityAnalysisScope,
  serverCode: string | null | undefined,
): FusionIdentityScopeServerRole => {
  const resolved = serverCode ? resolveServer(serverCode)?.code ?? serverCode : null;
  if (!resolved) return "outside-scope";
  if (resolved === scope.targetServerCode) return "current-target";
  if (scope.intermediateServerCodes.includes(resolved)) return "intermediate-fusion-target";
  if (scope.directOriginServerCodes.includes(resolved)) return "historical-origin";
  if (scope.transitiveOriginServerCodes.includes(resolved))
    return "transitive-historical-origin";
  return "outside-scope";
};

export const isServerInFusionIdentityScope = (
  scope: FusionIdentityAnalysisScope,
  serverCode: string | null | undefined,
) => getFusionIdentityScopeServerRole(scope, serverCode) !== "outside-scope";

export const isFusionIdentityScopeLocallyRelevant = (
  scope: FusionIdentityAnalysisScope,
  serverCodes: Iterable<string>,
) => {
  const lineage = new Set(scope.lineageServerCodes);
  for (const code of serverCodes) {
    const resolved = resolveServer(code)?.code ?? code;
    if (lineage.has(resolved)) return true;
  }
  return false;
};
