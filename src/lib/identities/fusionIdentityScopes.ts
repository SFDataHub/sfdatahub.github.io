import { LOCAL_SERVER_FUSIONS } from "../../data/serverFusions";
import type { LocalServerDefinition } from "../../data/serverRegistry";
import { getServerByCode } from "../servers/serverResolver";

export type FusionIdentityAnalysisScope = {
  id: string;
  label: string;
  targetServerCode: string;
  targetServerName: string;
  originServerCodes: string[];
  originServerNames: string[];
};

const compareServerCodes = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });

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

const toScope = (
  target: LocalServerDefinition,
  origins: LocalServerDefinition[],
): FusionIdentityAnalysisScope => {
  const originServerCodes = origins.map((origin) => origin.code).sort(compareServerCodes);
  const originServerNames = originServerCodes.map(
    (code) => getServerByCode(code)?.displayName ?? code,
  );
  return {
    id: target.code,
    label: `${compactServerRange(originServerCodes)} -> ${target.code}`,
    targetServerCode: target.code,
    targetServerName: target.displayName,
    originServerCodes,
    originServerNames,
  };
};

export const listFusionIdentityAnalysisScopes = (): FusionIdentityAnalysisScope[] => {
  const originsByTarget = new Map<string, LocalServerDefinition[]>();

  LOCAL_SERVER_FUSIONS.forEach((relation) => {
    const origin = getServerByCode(relation.from);
    const target = getServerByCode(relation.to);
    if (!origin || !target) return;

    const origins = originsByTarget.get(target.code) ?? [];
    origins.push(origin);
    originsByTarget.set(target.code, origins);
  });

  return [...originsByTarget.entries()]
    .flatMap(([targetCode, origins]) => {
      const target = getServerByCode(targetCode);
      return target && origins.length ? [toScope(target, origins)] : [];
    })
    .sort((left, right) => compareServerCodes(left.targetServerCode, right.targetServerCode));
};

export const getDefaultFusionIdentityAnalysisScope = () =>
  listFusionIdentityAnalysisScopes()[0] ?? null;

export const normalizeFusionIdentityAnalysisScope = (
  scope: FusionIdentityAnalysisScope | null | undefined,
) => scope ?? getDefaultFusionIdentityAnalysisScope();

export const isServerInFusionIdentityScope = (
  scope: FusionIdentityAnalysisScope,
  serverCode: string | null | undefined,
) =>
  Boolean(
    serverCode &&
      (serverCode === scope.targetServerCode ||
        scope.originServerCodes.includes(serverCode)),
  );
