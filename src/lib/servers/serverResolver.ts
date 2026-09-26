import {
  LOCAL_SERVER_FUSION_EVENTS,
  type LocalServerFusionEvent,
  type LocalServerFusionRelation,
} from "../../data/serverFusions";
import { LOCAL_SERVER_REGISTRY, type LocalServerDefinition } from "../../data/serverRegistry";

type ServerLookupInput = string | number | null | undefined;

export type FusionEventStatus = "effective" | "future" | "unknown-effective-date";

export type ServerGraphValidationIssueCode =
  | "duplicate-server-code"
  | "duplicate-server-host"
  | "duplicate-server-alias"
  | "duplicate-numeric-id"
  | "duplicate-fusion-event-id"
  | "duplicate-fusion-target"
  | "duplicate-fusion-origin"
  | "unknown-origin"
  | "unknown-target"
  | "self-reference"
  | "cycle";

export type ServerGraphValidationIssue = {
  code: ServerGraphValidationIssueCode;
  message: string;
  refs: string[];
};

const normalizeLookupKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeHostKey = (value: unknown) => {
  const trimmed = normalizeLookupKey(value);
  return trimmed.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
};

const asNumericId = (input: ServerLookupInput) => {
  if (typeof input === "number" && Number.isInteger(input)) return input;
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const addOwner = <T>(map: Map<T, string[]>, key: T, owner: string) => {
  map.set(key, [...(map.get(key) ?? []), owner]);
};

const duplicateIssues = <T>(
  map: Map<T, string[]>,
  code: ServerGraphValidationIssueCode,
  label: string,
): ServerGraphValidationIssue[] =>
  [...map.entries()].flatMap(([key, owners]) => {
    const uniqueOwners = [...new Set(owners)];
    if (uniqueOwners.length <= 1) return [];
    return [
      {
        code,
        message: `${label} ${String(key)} is used by ${uniqueOwners.join(", ")}`,
        refs: uniqueOwners,
      },
    ];
  });

export const validateServerRegistry = (
  registry: readonly LocalServerDefinition[] = LOCAL_SERVER_REGISTRY,
): ServerGraphValidationIssue[] => {
  const byCode = new Map<string, string[]>();
  const byHost = new Map<string, string[]>();
  const byNumericId = new Map<number, string[]>();
  const byAlias = new Map<string, string[]>();

  registry.forEach((server, index) => {
    addOwner(byCode, normalizeLookupKey(server.code), `${server.code}#${index + 1}`);
    const hosts = server.hosts?.length ? server.hosts : [server.host];
    hosts.forEach((host) => addOwner(byHost, normalizeHostKey(host), server.code));
    if (server.numericId != null) addOwner(byNumericId, server.numericId, server.code);
    server.aliases.forEach((alias) => addOwner(byAlias, normalizeLookupKey(alias), server.code));
  });

  return [
    ...duplicateIssues(byCode, "duplicate-server-code", "Server code"),
    ...duplicateIssues(byHost, "duplicate-server-host", "Server host"),
    ...duplicateIssues(byNumericId, "duplicate-numeric-id", "Numeric ID"),
    ...duplicateIssues(byAlias, "duplicate-server-alias", "Server alias"),
  ];
};

export const validateFusionEvents = (
  registry: readonly LocalServerDefinition[] = LOCAL_SERVER_REGISTRY,
  events: readonly LocalServerFusionEvent[] = LOCAL_SERVER_FUSION_EVENTS,
): ServerGraphValidationIssue[] => {
  const knownCodes = new Set(registry.map((server) => server.code));
  const byEventId = new Map<string, string[]>();
  const byTarget = new Map<string, string[]>();
  const byOrigin = new Map<string, string[]>();
  const issues: ServerGraphValidationIssue[] = [];
  const outgoing = new Map<string, string[]>();

  events.forEach((event) => {
    addOwner(byEventId, normalizeLookupKey(event.id), event.id);
    addOwner(byTarget, event.target, event.id);

    if (!knownCodes.has(event.target)) {
      issues.push({
        code: "unknown-target",
        message: `Fusion event ${event.id} targets unknown server ${event.target}`,
        refs: [event.id, event.target],
      });
    }

    event.origins.forEach((origin) => {
      addOwner(byOrigin, origin, event.id);
      if (origin === event.target) {
        issues.push({
          code: "self-reference",
          message: `Fusion event ${event.id} references ${origin} as both origin and target`,
          refs: [event.id, origin],
        });
      }
      if (!knownCodes.has(origin)) {
        issues.push({
          code: "unknown-origin",
          message: `Fusion event ${event.id} uses unknown origin ${origin}`,
          refs: [event.id, origin],
        });
      }
      outgoing.set(origin, [...(outgoing.get(origin) ?? []), event.target]);
    });
  });

  issues.push(...duplicateIssues(byEventId, "duplicate-fusion-event-id", "Fusion event id"));
  issues.push(...duplicateIssues(byTarget, "duplicate-fusion-target", "Fusion target"));
  issues.push(...duplicateIssues(byOrigin, "duplicate-fusion-origin", "Fusion origin"));

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (code: string, path: string[]) => {
    if (visiting.has(code)) {
      const cyclePath = [...path.slice(path.indexOf(code)), code];
      issues.push({
        code: "cycle",
        message: `Fusion graph cycle detected: ${cyclePath.join(" -> ")}`,
        refs: cyclePath,
      });
      return;
    }
    if (visited.has(code)) return;
    visiting.add(code);
    (outgoing.get(code) ?? []).forEach((next) => visit(next, [...path, code]));
    visiting.delete(code);
    visited.add(code);
  };

  registry.forEach((server) => visit(server.code, []));
  return issues;
};

export const validateServerGraph = (
  registry: readonly LocalServerDefinition[] = LOCAL_SERVER_REGISTRY,
  events: readonly LocalServerFusionEvent[] = LOCAL_SERVER_FUSION_EVENTS,
): ServerGraphValidationIssue[] => [
  ...validateServerRegistry(registry),
  ...validateFusionEvents(registry, events),
];

const formatValidationIssues = (issues: readonly ServerGraphValidationIssue[]) =>
  issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ");

const assertValidServerGraph = (
  registry: readonly LocalServerDefinition[],
  events: readonly LocalServerFusionEvent[],
) => {
  const issues = validateServerGraph(registry, events);
  if (issues.length) throw new Error(`Invalid server fusion graph: ${formatValidationIssues(issues)}`);
};

const parseDateKey = (value: string | Date | number | null | undefined): string | null => {
  if (value == null) return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const dateOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(trimmed)?.[1];
  if (dateOnly) return dateOnly;
  const date = new Date(trimmed);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
};

export const getFusionEventStatus = (
  event: LocalServerFusionEvent,
  atDate: string | Date | number = new Date(),
): FusionEventStatus => {
  if (!event.effectiveDate) return "unknown-effective-date";
  const effectiveDate = parseDateKey(event.effectiveDate);
  const comparisonDate = parseDateKey(atDate);
  if (!effectiveDate || !comparisonDate) return "unknown-effective-date";
  return effectiveDate <= comparisonDate ? "effective" : "future";
};

export const isFusionEventEffective = (
  event: LocalServerFusionEvent,
  atDate: string | Date | number = new Date(),
) => getFusionEventStatus(event, atDate) === "effective";

export const createServerGraph = (
  registry: readonly LocalServerDefinition[] = LOCAL_SERVER_REGISTRY,
  events: readonly LocalServerFusionEvent[] = LOCAL_SERVER_FUSION_EVENTS,
) => {
  assertValidServerGraph(registry, events);

  const codeLookup = new Map<string, LocalServerDefinition>();
  const stringLookup = new Map<string, LocalServerDefinition>();
  const numericLookup = new Map<number, LocalServerDefinition>();
  const eventById = new Map<string, LocalServerFusionEvent>();
  const eventByTarget = new Map<string, LocalServerFusionEvent>();
  const eventByOrigin = new Map<string, LocalServerFusionEvent>();

  const addStringLookup = (value: unknown, server: LocalServerDefinition) => {
    const key = normalizeLookupKey(value);
    if (key) stringLookup.set(key, server);
  };

  const addHostLookup = (value: unknown, server: LocalServerDefinition) => {
    const key = normalizeHostKey(value);
    if (key) stringLookup.set(key, server);
  };

  registry.forEach((server) => {
    const codeKey = normalizeLookupKey(server.code);
    codeLookup.set(codeKey, server);
    addStringLookup(server.code, server);
    addHostLookup(server.host, server);
    server.hosts.forEach((host) => addHostLookup(host, server));
    server.aliases.forEach((alias) => addStringLookup(alias, server));
    if (server.numericId != null) numericLookup.set(server.numericId, server);
  });

  events.forEach((event) => {
    eventById.set(normalizeLookupKey(event.id), event);
    eventByTarget.set(event.target, event);
    event.origins.forEach((origin) => eventByOrigin.set(origin, event));
  });

  const getServerByCode = (code: ServerLookupInput): LocalServerDefinition | null => {
    const key = normalizeLookupKey(code);
    return key ? codeLookup.get(key) ?? null : null;
  };

  const resolveServerNumericId = (numericId: ServerLookupInput): LocalServerDefinition | null => {
    const parsed = asNumericId(numericId);
    return parsed == null ? null : numericLookup.get(parsed) ?? null;
  };

  const resolveServer = (input: ServerLookupInput): LocalServerDefinition | null => {
    const numericMatch = resolveServerNumericId(input);
    if (numericMatch) return numericMatch;

    const key = normalizeLookupKey(input);
    if (!key) return null;
    return stringLookup.get(key) ?? stringLookup.get(normalizeHostKey(input)) ?? null;
  };

  const getFusionEventById = (id: string | null | undefined): LocalServerFusionEvent | null => {
    const key = normalizeLookupKey(id);
    return key ? eventById.get(key) ?? null : null;
  };

  const getFusionEventsForTarget = (input: ServerLookupInput): LocalServerFusionEvent[] => {
    const server = resolveServer(input);
    if (!server) return [];
    const event = eventByTarget.get(server.code);
    return event ? [event] : [];
  };

  const getFusionEventForTarget = (input: ServerLookupInput): LocalServerFusionEvent | null => {
    const eventsForTarget = getFusionEventsForTarget(input);
    if (eventsForTarget.length > 1) {
      const server = resolveServer(input);
      throw new Error(`Ambiguous fusion target ${server?.code ?? String(input)}`);
    }
    return eventsForTarget[0] ?? null;
  };

  const getDirectFusionDestination = (input: ServerLookupInput): LocalServerDefinition | null => {
    const server = resolveServer(input);
    if (!server) return null;
    const destinationCode = eventByOrigin.get(server.code)?.target;
    return destinationCode ? getServerByCode(destinationCode) : null;
  };

  const getDirectFusionRelation = (input: ServerLookupInput): LocalServerFusionRelation | null => {
    const server = resolveServer(input);
    if (!server) return null;
    const event = eventByOrigin.get(server.code);
    return event ? { from: server.code, to: event.target, fusionEvent: event } : null;
  };

  const getFusionEvent = (
    originInput: ServerLookupInput,
    destinationInput: ServerLookupInput,
  ): LocalServerFusionEvent | null => {
    const origin = resolveServer(originInput);
    const destination = resolveServer(destinationInput);
    if (!origin || !destination) return null;
    const event = eventByOrigin.get(origin.code);
    return event?.target === destination.code ? event : null;
  };

  const getFusionLineage = (input: ServerLookupInput): LocalServerDefinition[] => {
    const start = resolveServer(input);
    if (!start) return [];

    const lineage: LocalServerDefinition[] = [];
    const visited = new Set<string>();
    let current: LocalServerDefinition | null = start;

    while (current && !visited.has(current.code)) {
      lineage.push(current);
      visited.add(current.code);
      current = getDirectFusionDestination(current.code);
    }

    return lineage;
  };

  const getDirectFusionOrigins = (input: ServerLookupInput): LocalServerDefinition[] => {
    const event = getFusionEventForTarget(input);
    if (!event) return [];
    return event.origins.flatMap((originCode) => {
      const origin = getServerByCode(originCode);
      return origin ? [origin] : [];
    });
  };

  const collectFusionOrigins = (code: string, visited: Set<string>): string[] => {
    if (visited.has(code)) return [];
    visited.add(code);

    const event = eventByTarget.get(code);
    if (!event) return [];

    return event.origins.flatMap((originCode) => {
      const nested = collectFusionOrigins(originCode, visited);
      return nested.length ? nested : [originCode];
    });
  };

  const getFusionOrigins = (input: ServerLookupInput): LocalServerDefinition[] => {
    const server = resolveServer(input);
    if (!server) return [];

    const originCodes = [...new Set(collectFusionOrigins(server.code, new Set<string>()))];
    return originCodes.flatMap((code) => {
      const origin = getServerByCode(code);
      return origin ? [origin] : [];
    });
  };

  const getFusionAncestorEvents = (input: ServerLookupInput): LocalServerFusionEvent[] => {
    const server = resolveServer(input);
    if (!server) return [];

    const collected: LocalServerFusionEvent[] = [];
    const visitedEvents = new Set<string>();
    const visit = (code: string) => {
      const event = eventByTarget.get(code);
      if (!event || visitedEvents.has(event.id)) return;
      visitedEvents.add(event.id);
      event.origins.forEach(visit);
      collected.push(event);
    };
    visit(server.code);
    return collected;
  };

  const collectFusionFamilyCodes = (code: string, visited: Set<string>): Set<string> => {
    if (visited.has(code)) return visited;
    visited.add(code);

    const destination = eventByOrigin.get(code)?.target;
    if (destination) collectFusionFamilyCodes(destination, visited);

    const origins = eventByTarget.get(code)?.origins;
    origins?.forEach((origin) => collectFusionFamilyCodes(origin, visited));

    return visited;
  };

  const areFusionRelated = (left: ServerLookupInput, right: ServerLookupInput): boolean => {
    const leftServer = resolveServer(left);
    const rightServer = resolveServer(right);
    if (!leftServer || !rightServer) return false;
    if (leftServer.code === rightServer.code) return true;

    return collectFusionFamilyCodes(leftServer.code, new Set<string>()).has(rightServer.code);
  };

  const isFusionAncestor = (ancestorInput: ServerLookupInput, targetInput: ServerLookupInput): boolean => {
    const ancestor = resolveServer(ancestorInput);
    const target = resolveServer(targetInput);
    if (!ancestor || !target) return false;
    if (ancestor.code === target.code) return true;

    const visit = (code: string, visited: Set<string>): boolean => {
      if (visited.has(code)) return false;
      visited.add(code);
      const event = eventByTarget.get(code);
      if (!event) return false;
      if (event.origins.includes(ancestor.code)) return true;
      return event.origins.some((originCode) => visit(originCode, visited));
    };

    return visit(target.code, new Set<string>());
  };

  return {
    areFusionRelated,
    getDirectFusionDestination,
    getDirectFusionOrigins,
    getDirectFusionRelation,
    getFusionAncestorEvents,
    getFusionEvent,
    getFusionEventById,
    getFusionEventForTarget,
    getFusionEventsForTarget,
    getFusionLineage,
    getFusionOrigins,
    getServerByCode,
    isFusionAncestor,
    resolveServer,
    resolveServerNumericId,
  };
};

const defaultGraph = createServerGraph();

export const getServerByCode = defaultGraph.getServerByCode;
export const resolveServerNumericId = defaultGraph.resolveServerNumericId;
export const resolveServer = defaultGraph.resolveServer;
export const getFusionEventById = defaultGraph.getFusionEventById;
export const getFusionEventsForTarget = defaultGraph.getFusionEventsForTarget;
export const getFusionEventForTarget = defaultGraph.getFusionEventForTarget;
export const getDirectFusionDestination = defaultGraph.getDirectFusionDestination;
export const getDirectFusionOrigins = defaultGraph.getDirectFusionOrigins;
export const getDirectFusionRelation = defaultGraph.getDirectFusionRelation;
export const getFusionEvent = defaultGraph.getFusionEvent;
export const getFusionLineage = defaultGraph.getFusionLineage;
export const getFusionOrigins = defaultGraph.getFusionOrigins;
export const getFusionAncestorEvents = defaultGraph.getFusionAncestorEvents;
export const areFusionRelated = defaultGraph.areFusionRelated;
export const isFusionAncestor = defaultGraph.isFusionAncestor;
