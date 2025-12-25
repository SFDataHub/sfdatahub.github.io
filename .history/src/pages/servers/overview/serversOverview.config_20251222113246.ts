export type ServersOverviewNodeType = "origin" | "fusion" | "other";

export type ServersOverviewNode = {
  code: string;
  displayName: string;
  type: ServersOverviewNodeType;
  tier: 0 | 1 | 2;
  /**
   * Direct parents / sources this node was merged from.
   * UI expands "down" to these references (1 level per click).
   */
  mergedFrom-: string[];
};

function range(prefix: string, from: number, to: number): string[] {
  const out: string[] = [];
  for (let i = from; i <= to; i += 1) out.push(`${prefix}${i}`);
  return out;
}

function originDisplayName(code: string): string {
  // Insert a space between letters and trailing digits: EU3 -> EU 3, DE12 -> DE 12, INT57 -> INT 57
  const m = /^([A-Z]+)(\d+)$/.exec(code);
  if (!m) return code;
  return `${m[1]} ${m[2]}`;
}

function makeOrigin(code: string): ServersOverviewNode {
  return {
    code,
    displayName: originDisplayName(code),
    type: "origin",
    tier: 0,
  };
}

function makeOther(code: string, displayName-: string): ServersOverviewNode {
  return {
    code,
    displayName: displayName -- code,
    type: "other",
    tier: 0,
  };
}

function makeFusion(code: string, mergedFrom: string[], tier: 1 | 2, displayName-: string): ServersOverviewNode {
  return {
    code,
    displayName: displayName -- code,
    type: "fusion",
    tier,
    mergedFrom,
  };
}

const nodes: Record<string, ServersOverviewNode> = {};

function addOrigins(codes: string[]) {
  for (const c of codes) nodes[c] = makeOrigin(c);
}

function addOthers(codes: string[]) {
  for (const c of codes) nodes[c] = makeOther(c);
}

// -----------------------------------------------------------------------------
// Tier 0 (Origins + Others)
// -----------------------------------------------------------------------------

// EU (given as already existing OG servers EU1-EU23)
addOrigins(range("EU", 1, 23));

// Americas (from screenshot)
addOrigins(range("US", 1, 10));
addOrigins(range("BR", 1, 2));
addOrigins(range("CL", 1, 2));
// Countries shown without explicit range in screenshot -> assume "1"
addOrigins(["CA1", "MX1"]);

// F2 countries
addOrigins(range("AE", 1, 2));
addOrigins(range("DK", 1, 2));
addOrigins(range("NL", 1, 3));
addOrigins(range("SE", 1, 2));
addOrigins(range("UK", 1, 2));
addOrigins(["IN1", "JP1", "RO1", "RU1"]);

// F3 / F4 / F5 / F6
addOrigins(range("IT", 1, 8));
addOrigins(range("GR", 1, 6));
addOrigins(range("PT", 1, 8));
addOrigins(range("TR", 1, 6));
addOrigins(range("ES", 1, 12));
addOrigins(range("FR", 1, 15)); // FR14-15 are needed for F23

// Poland
addOrigins(range("PL", 1, 40));

// Germany
addOrigins(range("DE", 1, 43));

// International
addOrigins(range("INT", 1, 60));

// Czech / Slovak / Hungary
addOrigins(range("CZ", 1, 35));
addOrigins(range("SK", 1, 3));
addOrigins(range("HU", 1, 20));

// "Others" (publisher / tags / partners)
addOthers([
  "tv2",
  "123playgames",
  "minijuegos",
  "rtl",
  "rtl2",
  "sevengames",
  "wp",
  "buffed",
  "gamona",
  "xchar",
  "ingame",
]);

// -----------------------------------------------------------------------------
// Tier 1 (F1-F27) - mergedFrom sources (expanded from screenshot list)
// -----------------------------------------------------------------------------

nodes["F1"] = makeFusion(
  "F1",
  [
    ...range("BR", 1, 2),
    "CA1",
    ...range("CL", 1, 2),
    "MX1",
    ...range("US", 1, 10),
  ],
  1
);

nodes["F2"] = makeFusion(
  "F2",
  [
    ...range("AE", 1, 2),
    ...range("DK", 1, 2),
    "tv2",
    "IN1",
    "JP1",
    ...range("NL", 1, 3),
    "RO1",
    "RU1",
    ...range("SE", 1, 2),
    ...range("UK", 1, 2),
  ],
  1
);

nodes["F3"] = makeFusion("F3", [...range("IT", 1, 8)], 1);

nodes["F4"] = makeFusion(
  "F4",
  [
    ...range("GR", 1, 6),
    "123playgames",
    ...range("PT", 1, 8),
    ...range("TR", 1, 6),
  ],
  1
);

nodes["F5"] = makeFusion("F5", [...range("ES", 1, 12), "minijuegos"], 1);

nodes["F6"] = makeFusion("F6", [...range("FR", 1, 13)], 1);

nodes["F7"] = makeFusion("F7", [...range("PL", 7, 17)], 1);

nodes["F8"] = makeFusion("F8", [...range("DE", 5, 12)], 1);

nodes["F9"] = makeFusion("F9", [...range("DE", 25, 37)], 1);

nodes["F10"] = makeFusion("F10", [...range("PL", 18, 33)], 1);

nodes["F11"] = makeFusion(
  "F11",
  [
    ...range("DE", 13, 24),
    "rtl",
    "sevengames",
  ],
  1
);

nodes["F12"] = makeFusion("F12", [...range("INT", 1, 5)], 1);

nodes["F13"] = makeFusion("F13", [...range("PL", 1, 6), "wp"], 1);

nodes["F14"] = makeFusion("F14", [...range("INT", 15, 21)], 1);

nodes["F15"] = makeFusion("F15", [...range("CZ", 17, 28), "SK2", "SK3"], 1);

nodes["F16"] = makeFusion("F16", [...range("CZ", 6, 16), "SK1"], 1);

nodes["F17"] = makeFusion(
  "F17",
  [
    ...range("DE", 1, 4),
    "buffed",
    "rtl2",
    "gamona",
    "xchar",
    "ingame",
  ],
  1
);

nodes["F18"] = makeFusion("F18", [...range("CZ", 1, 5)], 1);

nodes["F19"] = makeFusion("F19", [...range("HU", 1, 15)], 1);

nodes["F20"] = makeFusion(
  "F20",
  [
    ...range("INT", 6, 14),
    "CZ29",
    "HU16",
    "PL34",
  ],
  1
);

nodes["F21"] = makeFusion(
  "F21",
  [
    ...range("INT", 22, 30),
    "CZ30",
    "DE38",
    "PL35",
  ],
  1
);

nodes["F22"] = makeFusion(
  "F22",
  [
    ...range("INT", 31, 37),
    "CZ31",
    "CZ32",
    "DE39",
    "DE40",
    "HU17",
    "PL36",
    "PL37",
  ],
  1
);

nodes["F23"] = makeFusion(
  "F23",
  [
    ...range("INT", 38, 45),
    "FR14",
    "FR15",
    "CZ33",
    "CZ34",
    "DE41",
    "DE42",
    "HU18",
    "HU19",
    "PL38",
    "PL39",
  ],
  1
);

nodes["F24"] = makeFusion("F24", [...range("INT", 46, 50)], 1);

nodes["F25"] = makeFusion(
  "F25",
  [
    ...range("INT", 51, 52),
    "CZ35",
    "DE43",
    "HU20",
    "PL40",
  ],
  1
);

nodes["F26"] = makeFusion("F26", [...range("INT", 53, 56)], 1);

nodes["F27"] = makeFusion("F27", [...range("INT", 57, 60)], 1);

// -----------------------------------------------------------------------------
// Tier 2 (Fusion of fusions) - as given in screenshot
// -----------------------------------------------------------------------------

nodes["MAERWYNN"] = makeFusion("MAERWYNN", ["F1", "F2", "F3", "F4", "F5"], 2, "Maerwynn");
nodes["BLACK_FOREST"] = makeFusion("BLACK_FOREST", ["F7", "F10", "F13"], 2, "Black Forest");
nodes["GRANOGRIM"] = makeFusion("GRANOGRIM", ["F15", "F16", "F18"], 2, "Granogrim");

// -----------------------------------------------------------------------------
// Entrypoints (top grid) - only what you want to show as "active row"
// Adjust freely later. This is just a sensible "full-demo" default.
// -----------------------------------------------------------------------------

const entrypoints: string[] = [
  "MAERWYNN",
  "BLACK_FOREST",
  "GRANOGRIM",
  ...range("F", 1, 27),
  ...range("EU", 1, 23),
];

export const serversOverviewConfig = {
  entrypoints,
  nodes,
} as const;

export const serversOverviewEntrypoints = entrypoints;
export const serversOverviewNodes = nodes;

export default serversOverviewConfig;
