export type LocalServerType = "origin" | "fusion" | "named";

export type LocalServerDefinition = {
  code: string;
  displayName: string;
  host: string;
  numericId?: number;
  releaseDate?: string;
  region: string;
  type: LocalServerType;
  active: boolean;
  aliases: readonly string[];
};

export const LOCAL_SERVER_REGISTRY = [
  {
    code: "EU1",
    displayName: "EU 1",
    host: "s1.sfgame.eu",
    numericId: 458,
    releaseDate: "2023-01-06",
    region: "EU",
    type: "origin",
    active: false,
    aliases: ["s1_eu", "s1eu"],
  },
  {
    code: "EU2",
    displayName: "EU 2",
    host: "s2.sfgame.eu",
    numericId: 460,
    releaseDate: "2023-02-24",
    region: "EU",
    type: "origin",
    active: false,
    aliases: ["s2_eu", "s2eu"],
  },
  {
    code: "EU3",
    displayName: "EU 3",
    host: "s3.sfgame.eu",
    numericId: 462,
    releaseDate: "2023-04-14",
    region: "EU",
    type: "origin",
    active: false,
    aliases: ["s3_eu", "s3eu"],
  },
  {
    code: "EU4",
    displayName: "EU 4",
    host: "s4.sfgame.eu",
    numericId: 464,
    releaseDate: "2023-05-26",
    region: "EU",
    type: "origin",
    active: false,
    aliases: ["s4_eu", "s4eu"],
  },
  {
    code: "F28",
    displayName: "Fusion 28",
    host: "f28.sfgame.net",
    numericId: 549,
    region: "Fusion",
    type: "fusion",
    active: true,
    aliases: ["f28_net", "f28net"],
  },
] as const satisfies readonly LocalServerDefinition[];

export type LocalServerCode = (typeof LOCAL_SERVER_REGISTRY)[number]["code"];
