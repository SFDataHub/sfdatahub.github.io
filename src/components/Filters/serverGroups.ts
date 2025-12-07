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
  const upper = code.toUpperCase();
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
    if (typeof server !== "string") return;
    const region = regionFromCode(server);
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
