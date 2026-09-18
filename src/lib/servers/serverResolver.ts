import { LOCAL_SERVER_FUSIONS } from "../../data/serverFusions";
import { LOCAL_SERVER_REGISTRY, type LocalServerDefinition } from "../../data/serverRegistry";

type ServerLookupInput = string | number | null | undefined;

const normalizeLookupKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeHostKey = (value: unknown) => {
  const trimmed = normalizeLookupKey(value);
  return trimmed.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
};

const codeLookup = new Map<string, LocalServerDefinition>();
const stringLookup = new Map<string, LocalServerDefinition>();
const numericLookup = new Map<number, LocalServerDefinition>();
const directFusionLookup = new Map<string, string>();
const reverseFusionLookup = new Map<string, Set<string>>();

const addStringLookup = (value: unknown, server: LocalServerDefinition) => {
  const key = normalizeLookupKey(value);
  if (key) stringLookup.set(key, server);
};

const addHostLookup = (value: unknown, server: LocalServerDefinition) => {
  const key = normalizeHostKey(value);
  if (key) stringLookup.set(key, server);
};

LOCAL_SERVER_REGISTRY.forEach((server) => {
  const codeKey = normalizeLookupKey(server.code);
  codeLookup.set(codeKey, server);
  addStringLookup(server.code, server);
  addHostLookup(server.host, server);
  server.aliases.forEach((alias) => addStringLookup(alias, server));
  if (server.numericId != null) numericLookup.set(server.numericId, server);
});

LOCAL_SERVER_FUSIONS.forEach((fusion) => {
  directFusionLookup.set(fusion.from, fusion.to);
  const origins = reverseFusionLookup.get(fusion.to) ?? new Set<string>();
  origins.add(fusion.from);
  reverseFusionLookup.set(fusion.to, origins);
});

const asNumericId = (input: ServerLookupInput) => {
  if (typeof input === "number" && Number.isInteger(input)) return input;
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export const getServerByCode = (code: ServerLookupInput): LocalServerDefinition | null => {
  const key = normalizeLookupKey(code);
  return key ? codeLookup.get(key) ?? null : null;
};

export const resolveServerNumericId = (numericId: ServerLookupInput): LocalServerDefinition | null => {
  const parsed = asNumericId(numericId);
  return parsed == null ? null : numericLookup.get(parsed) ?? null;
};

export const resolveServer = (input: ServerLookupInput): LocalServerDefinition | null => {
  const numericMatch = resolveServerNumericId(input);
  if (numericMatch) return numericMatch;

  const key = normalizeLookupKey(input);
  if (!key) return null;
  return stringLookup.get(key) ?? stringLookup.get(normalizeHostKey(input)) ?? null;
};

export const getDirectFusionDestination = (input: ServerLookupInput): LocalServerDefinition | null => {
  const server = resolveServer(input);
  if (!server) return null;
  const destinationCode = directFusionLookup.get(server.code);
  return destinationCode ? getServerByCode(destinationCode) : null;
};

export const getFusionLineage = (input: ServerLookupInput): LocalServerDefinition[] => {
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

const collectFusionOrigins = (code: string, visited: Set<string>): string[] => {
  if (visited.has(code)) return [];
  visited.add(code);

  const directOrigins = reverseFusionLookup.get(code);
  if (!directOrigins) return [];

  return [...directOrigins].flatMap((originCode) => [originCode, ...collectFusionOrigins(originCode, visited)]);
};

export const getFusionOrigins = (input: ServerLookupInput): LocalServerDefinition[] => {
  const server = resolveServer(input);
  if (!server) return [];

  const originCodes = [...new Set(collectFusionOrigins(server.code, new Set<string>()))];
  return originCodes.flatMap((code) => {
    const origin = getServerByCode(code);
    return origin ? [origin] : [];
  });
};

const collectFusionFamilyCodes = (code: string, visited: Set<string>): Set<string> => {
  if (visited.has(code)) return visited;
  visited.add(code);

  const destination = directFusionLookup.get(code);
  if (destination) collectFusionFamilyCodes(destination, visited);

  const origins = reverseFusionLookup.get(code);
  origins?.forEach((origin) => collectFusionFamilyCodes(origin, visited));

  return visited;
};

export const areFusionRelated = (left: ServerLookupInput, right: ServerLookupInput): boolean => {
  const leftServer = resolveServer(left);
  const rightServer = resolveServer(right);
  if (!leftServer || !rightServer) return false;
  if (leftServer.code === rightServer.code) return true;

  return collectFusionFamilyCodes(leftServer.code, new Set<string>()).has(rightServer.code);
};
