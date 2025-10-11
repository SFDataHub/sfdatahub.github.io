// /src/lib/importer/types.ts
import type { Firestore } from "firebase/firestore";

export type Kind = "players" | "guilds";

export type CsvRow = Record<string, string>;

export interface ImportReport {
  kind: Kind;
  total: number;
  writtenLatest: number;
  writtenScans: number;
  skippedDuplicate: number;
  skippedMissingRequired: number;
  errors: number;
}

export interface MappingBase {
  compareMode: "allHeaders" | "idOnly";
  // Headers (Displays in deiner CSV – exakt wie sie heißen)
  nameHeader?: string;
  serverHeader: string;           // z.B. "Server"
  serverIdHeader?: string;        // bei dir leer -> optional
  timestampHeader: string;        // z.B. "Timestamp"
  // Dedupe/Key
  idPreference: string;           // z.B. "pid>identifier"
  pidHeader?: string;             // "ID"
  identifierHeader?: string;      // "Identifier"
  keyTemplate: string;            // z.B. "{sv}#{pidOrIdentifier}#{ts}"
  // Logging
  logCollection?: string;         // z.B. "import_logs"
  logDuplicateRows?: boolean;
}

export interface PlayerMapping extends MappingBase {
  kind: "players";
  lastActiveHeader?: string;
  classHeader?: string;
  levelHeader?: string;
  rankHeader?: string;
  guildIdentifierHeader?: string;

  // Whitelist/Required
  allowedHeaders?: string[]; // playersAllowedHeaders
  requiredHeaders?: string[]; // playersRequiredHeaders
}

export interface GuildMapping extends MappingBase {
  kind: "guilds";
  rankHeader?: string;
  raidsHeader?: string;   // "Guild Raids"
  hydraHeader?: string;   // "Guild Hydra"
  petLevelHeader?: string;// "Guild Pet Level"
  guildIdentifierHeader: string; // "Guild Identifier"

  // Whitelist/Required
  allowedHeaders?: string[]; // guildsAllowedHeaders
  requiredHeaders?: string[]; // guildsRequiredHeaders
}

export type Mapping = PlayerMapping | GuildMapping;

export interface ServerNormalizeCfg {
  amPattern?: string;     // "AM(\d+)\s*\.NET -> AM$1"
  euPattern?: string;     // "S(\d+)\s*\.EU -> EU$1"
  fusionpattern?: string; // "F(\d+)\s*\.NET -> F$1"
  namedMap?: Record<string, string>; // {"Maerwynn.NET": "MEARWYNN"}
}

export interface MetaAppConfig {
  activePlayersCollection: string; // "players"
  activeGuildsCollection: string;  // "guilds"
  playersLatestCollection: string; // "players_latest"
  playersScansCollection: string;  // "player_scans"
  guildsLatestCollection: string;  // "guilds_latest"
  guildsScansCollection: string;   // "guild_scans"

  csvMapping: {
    players: PlayerMapping;
    guilds: GuildMapping;
    serverNormalize?: ServerNormalizeCfg;
    ingest?: {
      storeUploadTimestamp?: boolean;
      uploadTimestampField?: string; // default "uploadedAt"
    };
  };

  // Strict header mode
  requireAllHeaders?: boolean;
  rejectOnMissingHeaders?: boolean;
}

export interface ImportOptions {
  db: Firestore;
  kind: Kind;
  rows: CsvRow[];
  onProgress?: (p: number) => void;
}
