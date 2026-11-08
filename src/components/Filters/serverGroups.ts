import { resolveServer } from "../../lib/servers/serverResolver";
import { isHiddenPickerServer } from "./serverPickerModel";

export type RegionKey = "EU" | "US" | "INT" | "Fusion";

export type ServerGroupsByRegion = Record<RegionKey, string[]>;

const EMPTY_GROUPS: ServerGroupsByRegion = {
  EU: [],
  US: [],
  INT: [],
  Fusion: [],
};

const REGION_ORDER: RegionKey[] = ["EU", "US", "INT", "Fusion"];

const regionFromCode = (code: string): RegionKey => {
  const server = resolveServer(code);
  if (server?.type === "fusion") return "Fusion";
  if (server?.type === "named") return "INT";
  const upper = (server?.code ?? code).toUpperCase();
  if (upper.startsWith("EU")) return "EU";
  if (upper.startsWith("AM") || upper.startsWith("US") || upper.startsWith("NA")) return "US";
  if (upper.startsWith("F")) return "Fusion";
  return "INT";
};

export function buildServerGroupsFromCodes(servers: string[]): ServerGroupsByRegion {
  const buckets: Record<RegionKey, Set<string>> = {
    EU: new Set(),
    US: new Set(),
    INT: new Set(),
    Fusion: new Set(),
  };

  servers.forEach((server) => {
    if (typeof server !== "string" || isHiddenPickerServer(server) || resolveServer(server)?.active === false) return;
    const region = regionFromCode(server);
    const canonical = resolveServer(server)?.code;
    if (canonical && [...buckets[region]].some(value => resolveServer(value)?.code === canonical)) return;
    buckets[region].add(server);
  });

  const grouped: ServerGroupsByRegion = { ...EMPTY_GROUPS };
  REGION_ORDER.forEach((region) => {
    grouped[region] = Array.from(buckets[region]).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
  });

  return grouped;
}
